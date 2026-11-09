begin;

create schema polar_private;
revoke all on schema polar_private from public, anon, authenticated;

create table polar_private.posts (
  post_key text primary key check (post_key ~ '^[a-f0-9]{64}$'),
  title text not null,
  path text not null check (path ~ '^/posts/[^?#]+/$'),
  active boolean not null default true
);
create table polar_private.admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);
create table polar_private.likes (
  post_key text not null references polar_private.posts(post_key),
  visitor uuid not null,
  primary key (post_key, visitor)
);
create table polar_private.rate_buckets (
  scope text not null,
  bucket bigint not null,
  hits integer not null,
  primary key (scope, bucket)
);
create table polar_private.comments (
  id uuid primary key default gen_random_uuid(),
  ordinal bigint generated always as identity unique,
  post_key text not null references polar_private.posts(post_key),
  parent_id uuid,
  author_id uuid references auth.users(id) on delete set null,
  request_id uuid not null,
  nickname text,
  avatar text,
  body text,
  status text not null default 'pending' check (status in ('pending','approved','rejected','deleted')),
  created_at timestamptz not null default clock_timestamp(),
  unique (id, post_key),
  unique (author_id, request_id),
  foreign key (parent_id, post_key) references polar_private.comments(id, post_key),
  check (case when status = 'deleted' then body is null and nickname is null and avatar is null
    else body is not null and nickname is not null and char_length(body) between 2 and 2000 end)
);
create index comments_post_order on polar_private.comments(post_key, ordinal desc);
create index comments_review_order on polar_private.comments(status, ordinal desc);
create index comments_parent on polar_private.comments(parent_id);
create table polar_private.audit (
  id bigint generated always as identity primary key,
  comment_id uuid not null references polar_private.comments(id),
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  happened_at timestamptz not null default clock_timestamp()
);

alter table polar_private.posts enable row level security;
alter table polar_private.admins enable row level security;
alter table polar_private.likes enable row level security;
alter table polar_private.rate_buckets enable row level security;
alter table polar_private.comments enable row level security;
alter table polar_private.audit enable row level security;
create policy author_reads_own on polar_private.comments for select to authenticated
  using (author_id = (select auth.uid()) and status <> 'deleted');
-- No client has schema usage or table grants. The API exposes projected rows
-- through the functions below; neither PostgREST nor Realtime needs this schema.
revoke all on all tables in schema polar_private from public, anon, authenticated;

create function polar_private.take_rate(p_scope text, p_limit integer, p_seconds integer)
returns void language plpgsql set search_path = '' as $$
declare
  slot bigint := floor(extract(epoch from clock_timestamp()) / p_seconds);
  used integer;
begin
  insert into polar_private.rate_buckets as r values (p_scope, slot, 1)
  on conflict (scope, bucket) do update set hits = r.hits + 1
    where r.hits < p_limit
  returning hits into used;
  if used is null then
    raise sqlstate 'PT429' using message = 'rate_limited';
  end if;
  -- Bound storage without needing an external scheduler.
  if random() < 0.01 then
    delete from polar_private.rate_buckets
      where bucket < floor(extract(epoch from clock_timestamp()) / 60) - 120;
  end if;
end $$;

create function public.polar_ice_read(p_post text, p_visitor uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('count', count(l.visitor), 'liked', coalesce(bool_or(l.visitor = p_visitor), false))
  from polar_private.posts p left join polar_private.likes l using (post_key)
  where p.active and p.post_key = p_post
  group by p.post_key
$$;

create function public.polar_ice_write(p_post text, p_visitor uuid, p_liked boolean, p_network text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  liked boolean;
begin
  if p_visitor is null or p_liked is null or coalesce(p_post, '') !~ '^[a-f0-9]{64}$'
     or coalesce(p_network, '') !~ '^[a-f0-9]{64}$' then
    raise sqlstate 'PT400' using message = 'invalid_ice_request';
  end if;
  perform 1 from polar_private.posts where post_key = p_post and active for share;
  if not found then raise sqlstate 'PT404' using message = 'unknown_post'; end if;
  perform polar_private.take_rate('ice-id:' || p_visitor, 20, 60);
  perform polar_private.take_rate('ice-net:' || p_network, 60, 60);
  perform polar_private.take_rate('ice-site', 600, 60);
  perform pg_advisory_xact_lock(hashtextextended(p_post || ':' || p_visitor::text, 0));
  if p_liked then
    insert into polar_private.likes values (p_post, p_visitor) on conflict do nothing;
  else
    delete from polar_private.likes where post_key = p_post and visitor = p_visitor;
  end if;
  select exists (select from polar_private.likes where post_key = p_post and visitor = p_visitor) into liked;
  return jsonb_build_object('liked', liked, 'count',
    (select count(*) from polar_private.likes where post_key = p_post));
end $$;

create function public.polar_is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select from polar_private.admins where user_id = auth.uid())
$$;

create function polar_private.comment_json(c polar_private.comments, viewer uuid)
returns jsonb language sql immutable set search_path = '' as $$
  select jsonb_build_object('id', c.id, 'parent_id', c.parent_id, 'nickname', c.nickname,
    'avatar', c.avatar, 'body', c.body, 'created_at', c.created_at, 'status', c.status,
    'mine', coalesce(c.author_id = viewer, false))
$$;

create function public.polar_comments(p_post text, p_after uuid default null)
returns jsonb language sql stable security definer set search_path = '' as $$
  with candidates as (
    select c as entry, c.ordinal,
      c.status = 'approved' and (c.parent_id is null or coalesce(root.status = 'approved', false)) as is_public,
      c.author_id = auth.uid() as is_author
    from polar_private.comments c
    join polar_private.posts p using (post_key)
    left join polar_private.comments root on root.id = c.parent_id
    where c.post_key = p_post and p.active and c.status <> 'deleted'
  ), page as (
    select * from candidates where (is_public or is_author) and (
      p_after is null or ordinal < (select ordinal from polar_private.comments where id = p_after and post_key = p_post)
    ) order by ordinal desc limit 51
  )
  select jsonb_build_object(
    'count', (select count(*) from candidates where is_public),
    'more', (select count(*) > 50 from page),
    'rows', coalesce((select jsonb_agg(
      polar_private.comment_json(entry, auth.uid()) ||
      case when (entry).status = 'approved' and not is_public then '{"status":"hidden"}'::jsonb else '{}'::jsonb end
      order by ordinal desc) from (select * from page order by ordinal desc limit 50) items), '[]'::jsonb)
  )
$$;

create function public.polar_comment_submit(p_post text, p_parent uuid, p_body text, p_request uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  result uuid;
  meta jsonb;
  name text;
  picture text;
  body text := regexp_replace(coalesce(p_body,''), '^[[:space:]]+|[[:space:]]+$', '', 'g');
begin
  if actor is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false)
    or not exists (select from auth.identities where user_id = actor and provider in ('google','github')) then
    raise sqlstate 'PT401' using message = 'login_required';
  end if;
  if p_request is null or char_length(body) not between 2 and 2000
      or regexp_replace(body, '[\r\n\t]', '', 'g') ~ '[[:cntrl:]]' then
    raise sqlstate 'PT400' using message = 'invalid_comment';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('comment:' || actor::text, 0));
  select id into result from polar_private.comments where author_id = actor and request_id = p_request;
  if found then return result; end if;
  perform 1 from polar_private.posts where post_key = p_post and active for share;
  if not found then raise sqlstate 'PT404' using message = 'unknown_post'; end if;
  if p_parent is not null then
    perform 1 from polar_private.comments where id = p_parent and post_key = p_post
      and parent_id is null and status = 'approved' for share;
    if not found then raise sqlstate 'PT400' using message = 'invalid_parent'; end if;
  end if;
  perform polar_private.take_rate('comment:' || actor, 5, 60);
  perform polar_private.take_rate('comment-site', 120, 60);
  if (select count(*) from polar_private.comments where author_id = actor
       and created_at > now() - interval '24 hours') >= 30 then
    raise sqlstate 'PT429' using message = 'rate_limited';
  end if;
  select raw_user_meta_data into meta from auth.users where id = actor;
  name := left(btrim(regexp_replace(coalesce(nullif(meta->>'user_name',''),
    nullif(meta->>'full_name',''), nullif(meta->>'name',''), ''), '[[:cntrl:]]', '', 'g')), 60);
  if name = '' or position('@' in name) > 0 then name := '访客'; end if;
  picture := meta->>'avatar_url';
  if length(picture) > 500 or picture !~ '^https://(avatars[.]githubusercontent[.]com|lh3[.]googleusercontent[.]com)/[A-Za-z0-9_./=?&%-]+$'
    then picture := null; end if;
  insert into polar_private.comments(post_key,parent_id,author_id,request_id,nickname,avatar,body)
    values(p_post,p_parent,actor,p_request,name,picture,body) returning id into result;
  return result;
end $$;

create function public.polar_comment_delete(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise sqlstate 'PT401' using message = 'login_required'; end if;
  update polar_private.comments set status = 'deleted', body = null, nickname = null, avatar = null
    where id = p_id and author_id = auth.uid() and status <> 'deleted';
  if not found then raise sqlstate 'PT403' using message = 'forbidden'; end if;
  insert into polar_private.audit(comment_id, actor_id, action) values (p_id, auth.uid(), 'author_delete');
end $$;

create function public.polar_review_list(p_status text, p_post text default null, p_after uuid default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.polar_is_admin() then raise sqlstate 'PT403' using message = 'forbidden'; end if;
  return (with page as (
    select c as comment, p.title, p.path, c.ordinal, root.nickname as parent_name
    from polar_private.comments c join polar_private.posts p using (post_key)
    left join polar_private.comments root on root.id = c.parent_id
    where c.status = p_status and (p_post is null or c.post_key = p_post)
      and (p_after is null or c.ordinal < (select ordinal from polar_private.comments where id = p_after))
      order by c.ordinal desc limit 51
  )
  select jsonb_build_object('more', (select count(*) > 50 from page), 'rows', coalesce((
    select jsonb_agg(polar_private.comment_json(comment, auth.uid()) ||
      jsonb_build_object('post_title', title, 'post_path', path, 'parent_name', parent_name) order by ordinal desc)
    from (select * from page order by ordinal desc limit 50) items
  ), '[]'::jsonb)));
end $$;

create function public.polar_review_posts()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.polar_is_admin() then raise sqlstate 'PT403' using message = 'forbidden'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('key', post_key, 'title', title) order by title), '[]')
    from polar_private.posts);
end $$;

create function public.polar_review_set(p_id uuid, p_status text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  entry polar_private.comments;
begin
  if not public.polar_is_admin() then raise sqlstate 'PT403' using message = 'forbidden'; end if;
  if coalesce(p_status,'') not in ('approved','rejected','deleted') then
    raise sqlstate 'PT400' using message = 'invalid_status';
  end if;
  select * into entry from polar_private.comments where id = p_id for update;
  if not found or entry.status = 'deleted' then raise sqlstate 'PT404' using message = 'unknown_comment'; end if;
  if p_status = 'approved' and entry.parent_id is not null then
    perform 1 from polar_private.comments where id = entry.parent_id and status = 'approved' for share;
    if not found then raise sqlstate 'PT409' using message = 'parent_not_public'; end if;
  end if;
  if entry.status = p_status then return; end if;
  update polar_private.comments set status = p_status,
    body = case when p_status = 'deleted' then null else body end,
    nickname = case when p_status = 'deleted' then null else nickname end,
    avatar = case when p_status = 'deleted' then null else avatar end
    where id = p_id;
  insert into polar_private.audit(comment_id, actor_id, action) values (p_id, auth.uid(), p_status);
end $$;

revoke all on all functions in schema polar_private from public, anon, authenticated;
revoke all on function public.polar_ice_read(text,uuid), public.polar_ice_write(text,uuid,boolean,text),
  public.polar_comments(text,uuid), public.polar_is_admin(), public.polar_comment_submit(text,uuid,text,uuid),
  public.polar_comment_delete(uuid), public.polar_review_list(text,text,uuid),
  public.polar_review_posts(), public.polar_review_set(uuid,text) from public, anon, authenticated, service_role;
grant execute on function public.polar_ice_read(text,uuid), public.polar_ice_write(text,uuid,boolean,text) to service_role;
grant execute on function public.polar_comments(text,uuid) to anon, authenticated;
grant execute on function public.polar_is_admin(), public.polar_comment_submit(text,uuid,text,uuid),
  public.polar_comment_delete(uuid), public.polar_review_list(text,text,uuid),
  public.polar_review_posts(), public.polar_review_set(uuid,text) to authenticated;

commit;
