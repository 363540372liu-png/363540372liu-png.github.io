begin;

create table polar_private.catalog_version (
  singleton boolean primary key default true check (singleton),
  revision bigint not null,
  snapshot jsonb not null
);
alter table polar_private.catalog_version enable row level security;
revoke all on polar_private.catalog_version from public, anon, authenticated;

create function public.polar_catalog_sync(p_revision bigint, p_posts jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  previous polar_private.catalog_version;
begin
  if p_revision is null or p_revision < 1 or jsonb_typeof(p_posts) is distinct from 'array' then
    raise sqlstate 'PT400' using message = 'invalid_catalog';
  end if;
  if jsonb_array_length(p_posts) > 5000 then
    raise sqlstate 'PT400' using message = 'invalid_catalog_size';
  end if;
  if exists (select from jsonb_array_elements(p_posts) item where
      jsonb_typeof(item) <> 'object'
      or coalesce(item->>'key', '') !~ '^[a-f0-9]{64}$'
      or coalesce(item->>'path', '') !~ '^/posts/[^/?#][^?#]*/$'
      or position(chr(92) in item->>'path') > 0 or char_length(item->>'path') > 1024
      or jsonb_typeof(item->'title') is distinct from 'string'
      or char_length(btrim(item->>'title')) not between 1 and 500)
    or exists (select from jsonb_array_elements(p_posts) item group by item->>'key' having count(*) > 1)
    or exists (select from jsonb_array_elements(p_posts) item group by item->>'path' having count(*) > 1) then
    raise sqlstate 'PT400' using message = 'invalid_catalog_entry';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('polar:catalog', 0));
  select * into previous from polar_private.catalog_version;
  if found and (p_revision < previous.revision or
       (p_revision = previous.revision and p_posts <> previous.snapshot)) then
    raise sqlstate 'PT409' using message = 'stale_or_conflicting_catalog';
  end if;
  if previous.revision = p_revision then
    return jsonb_build_object('revision', p_revision, 'count', jsonb_array_length(p_posts));
  end if;
  update polar_private.posts p set active = false where p.active and not exists (
    select from jsonb_array_elements(p_posts) item where item->>'key' = p.post_key
  );
  insert into polar_private.posts(post_key, title, path)
    select item->>'key', item->>'title', item->>'path' from jsonb_array_elements(p_posts) item
  on conflict (post_key) do update set title = excluded.title, path = excluded.path, active = true
    where (posts.title, posts.path, posts.active) is distinct from (excluded.title, excluded.path, true);
  insert into polar_private.catalog_version values (true, p_revision, p_posts)
    on conflict (singleton) do update set revision = excluded.revision, snapshot = excluded.snapshot;
  return jsonb_build_object('revision', p_revision, 'count', jsonb_array_length(p_posts));
end $$;

-- Read a pagination cursor only when the caller could see that same row in
-- the list. A guessed pending/deleted UUID behaves like an unknown UUID.
create or replace function public.polar_comments(p_post text, p_after uuid default null)
returns jsonb language sql stable security definer set search_path = '' as $$
  with candidates as (
    select c as entry, c.id, c.ordinal,
      c.status = 'approved' and (c.parent_id is null or coalesce(root.status = 'approved', false)) as is_public,
      c.author_id = auth.uid() as is_author
    from polar_private.comments c
    join polar_private.posts p using (post_key)
    left join polar_private.comments root on root.id = c.parent_id
    where c.post_key = p_post and p.active and c.status <> 'deleted'
  ), visible as (
    select * from candidates where is_public or is_author
  ), page as (
    select * from visible where p_after is null or ordinal < (
      select ordinal from visible where id = p_after
    ) order by ordinal desc limit 51
  )
  select jsonb_build_object(
    'count', (select count(*) from visible where is_public),
    'more', (select count(*) > 50 from page),
    'rows', coalesce((select jsonb_agg(
      polar_private.comment_json(entry, auth.uid()) ||
      case when (entry).status = 'approved' and not is_public then '{"status":"hidden"}'::jsonb else '{}'::jsonb end
      order by ordinal desc) from (select * from page order by ordinal desc limit 50) items), '[]'::jsonb)
  )
$$;

-- Only the Edge Function may assert that Turnstile validated a token.
create function public.polar_ice_write_v2(
  p_post text, p_visitor uuid, p_liked boolean, p_network text, p_verified boolean
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  current_state boolean;
begin
  if p_visitor is null or p_liked is null or p_verified is null
     or coalesce(p_post, '') !~ '^[a-f0-9]{64}$'
     or (p_network is not null and p_network !~ '^[a-f0-9]{64}$') then
    raise sqlstate 'PT400' using message = 'invalid_ice_request';
  end if;
  perform 1 from polar_private.posts where post_key = p_post and active for share;
  if not found then raise sqlstate 'PT404' using message = 'unknown_post'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_post || ':' || p_visitor::text, 0));
  select exists (select from polar_private.likes where post_key = p_post and visitor = p_visitor)
    into current_state;
  -- Retries do not consume a write budget. A visitor may always remove their
  -- own ice, even while an article is under a spike of new likes.
  if current_state = p_liked then
    return public.polar_ice_read(p_post, p_visitor);
  elsif not p_liked then
    delete from polar_private.likes where post_key = p_post and visitor = p_visitor;
  else
    perform polar_private.take_rate('ice-v2-id:' || p_visitor, 20, 60);
    if not p_verified then
      begin
        perform polar_private.take_rate('ice-v2-post:' || p_post, 120, 60);
        if p_network is not null then
          perform polar_private.take_rate('ice-v2-net:' || p_network, 60, 60);
        end if;
      exception when sqlstate 'PT429' then
        raise sqlstate 'PT428' using message = 'verification_required';
      end;
    end if;
    perform polar_private.take_rate('ice-v2-site', 1200, 60);
    insert into polar_private.likes values (p_post, p_visitor);
  end if;
  return public.polar_ice_read(p_post, p_visitor);
end $$;

revoke all on function public.polar_catalog_sync(bigint,jsonb),
  public.polar_ice_write_v2(text,uuid,boolean,text,boolean) from public, anon, authenticated, service_role;
grant execute on function public.polar_catalog_sync(bigint,jsonb),
  public.polar_ice_write_v2(text,uuid,boolean,text,boolean) to service_role;
drop function public.polar_ice_write(text,uuid,boolean,text);

commit;
