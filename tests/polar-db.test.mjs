import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { randomUUID } from "node:crypto";

const migration = await readFile(
  new URL(
    "../supabase/migrations/202611090001_polar_interactions.sql",
    import.meta.url
  ),
  "utf8"
);
const hardening = await readFile(
  new URL(
    "../supabase/migrations/202611090003_polar_release_hardening.sql",
    import.meta.url
  ),
  "utf8"
);
const post = "a".repeat(64);
const other = "b".repeat(64);
const network = "f".repeat(64);
const actor = randomUUID();
const stranger = randomUUID();
const admin = randomUUID();
const guest = randomUUID();

async function fixture() {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create table auth.users (id uuid primary key, raw_user_meta_data jsonb);
    create table auth.identities (user_id uuid references auth.users(id), provider text);
    create function auth.uid() returns uuid language sql stable as
      'select nullif(current_setting(''request.jwt.claim.sub'', true), '''')::uuid';
    create function auth.jwt() returns jsonb language sql stable as
      'select coalesce(nullif(current_setting(''request.jwt.claims'', true), ''''), ''{}'')::jsonb';
    grant usage on schema auth to anon, authenticated;
    insert into auth.users values
      ('${actor}', '{"name":"reader@example.com","avatar_url":"https://evil.example/track"}'),
      ('${stranger}', '{"user_name":"Second reader"}'), ('${admin}', '{"user_name":"Admin"}');
    insert into auth.identities values ('${actor}', 'google'), ('${stranger}', 'github'), ('${admin}', 'github');
  `);
  await db.exec(migration);
  await db.exec(hardening);
  await db.query(
    "insert into polar_private.posts values ($1,'Article','/posts/article/',true),($2,'Other','/posts/other/',true)",
    [post, other]
  );
  await db.query("insert into polar_private.admins values ($1)", [admin]);

  async function as(role, subject, sql, params = [], claims = "{}") {
    return db.transaction(async tx => {
      await tx.exec(`set local role ${role}`);
      await tx.query(
        "select set_config('request.jwt.claim.sub',$1,true), set_config('request.jwt.claims',$2,true)",
        [subject ?? "", claims]
      );
      const { rows } = await tx.query(sql, params);
      return rows[0]?.value;
    });
  }
  return { db, as };
}

test("role isolation, moderation, replies, projection, and author deletion", async t => {
  const { db, as } = await fixture();
  t.after(() => db.close());
  const publicList = () =>
    as("anon", null, "select polar_comments($1,null) as value", [post]);
  const submit = (
    user,
    body,
    parent = null,
    key = post,
    request = randomUUID()
  ) =>
    as(
      "authenticated",
      user,
      "select polar_comment_submit($1,$2,$3,$4) as value",
      [key, parent, body, request]
    );
  const review = (user, id, status) =>
    as("authenticated", user, "select polar_review_set($1,$2)", [id, status]);
  const queue = (user, status) =>
    as(
      "authenticated",
      user,
      "select polar_review_list($1,null,null) as value",
      [status]
    );

  await assert.rejects(
    as(
      "anon",
      null,
      "select polar_comment_submit($1,null,'Hi',gen_random_uuid())",
      [post]
    ),
    { code: "42501" }
  );
  await assert.rejects(
    as("authenticated", actor, "select * from polar_private.comments"),
    { code: "42501" }
  );
  await assert.rejects(
    as(
      "authenticated",
      actor,
      "select polar_comment_submit($1,null,'Hi',gen_random_uuid())",
      [post],
      '{"is_anonymous":true}'
    ),
    { code: "PT401" }
  );
  await assert.rejects(queue(actor, "pending"), { code: "PT403" });
  assert.equal(
    await as("authenticated", actor, "select polar_is_admin() as value"),
    false
  );
  const malicious = '<img src=x onerror="alert(1)">\n下一行';
  const request = randomUUID();
  const root = await submit(actor, malicious, null, post, request);
  assert.equal(await submit(actor, malicious, null, post, request), root);
  assert.deepEqual(await publicList(), { count: 0, more: false, rows: [] });
  const own = await as(
    "authenticated",
    actor,
    "select polar_comments($1,null) as value",
    [post]
  );
  assert.equal(own.rows[0].status, "pending");
  assert.equal(own.rows[0].nickname, "访客");
  assert.equal(own.rows[0].avatar, null);
  assert.equal(own.rows[0].body, malicious);
  assert.equal(own.rows[0].author_id, undefined);
  assert.equal(
    (
      await as(
        "authenticated",
        stranger,
        "select polar_comments($1,null) as value",
        [post]
      )
    ).rows.length,
    0
  );
  assert.equal(
    (await queue(admin, "pending")).rows[0].post_path,
    "/posts/article/"
  );
  await assert.rejects(review(actor, root, "approved"), { code: "PT403" });
  await assert.rejects(submit(stranger, "premature", root), { code: "PT400" });
  await review(admin, root, "approved");
  assert.equal((await publicList()).count, 1);
  await assert.rejects(submit(stranger, "wrong article", root, other), {
    code: "PT400",
  });
  const reply = await submit(stranger, "a reply", root);
  assert.equal((await publicList()).count, 1);
  assert.equal((await queue(admin, "pending")).rows[0].parent_id, root);
  await review(admin, reply, "approved");
  assert.equal((await publicList()).count, 2);
  await assert.rejects(submit(actor, "nested reply", reply), { code: "PT400" });
  await assert.rejects(
    as("authenticated", stranger, "select polar_comment_delete($1)", [root]),
    { code: "PT403" }
  );
  await review(admin, root, "rejected");
  assert.deepEqual(await publicList(), { count: 0, more: false, rows: [] });
  assert.equal((await queue(admin, "rejected")).rows.length, 1);
  const hidden = await as(
    "authenticated",
    stranger,
    "select polar_comments($1,null) as value",
    [post]
  );
  assert.equal(hidden.rows[0].status, "hidden");
  await assert.rejects(review(admin, reply, "approved"), { code: "PT409" });
  await as("authenticated", stranger, "select polar_comment_delete($1)", [
    reply,
  ]);
  await review(admin, root, "approved");
  assert.equal((await publicList()).count, 1);
  await review(admin, root, "deleted");
  assert.equal((await publicList()).count, 0);
  const scrubbed = await db.query(
    "select body,nickname,avatar from polar_private.comments where id=$1",
    [root]
  );
  assert.deepEqual(scrubbed.rows[0], {
    body: null,
    nickname: null,
    avatar: null,
  });
});

test("unique persistent ice, concurrent retries, cancellation, isolation and rate limits", async t => {
  const { db, as } = await fixture();
  t.after(() => db.close());
  const read = (key, visitor) =>
    as("service_role", null, "select polar_ice_read($1,$2) as value", [
      key,
      visitor,
    ]);
  const write = (key, visitor, liked, ip = null, verified = false) =>
    as(
      "service_role",
      null,
      "select polar_ice_write_v2($1,$2,$3,$4,$5) as value",
      [key, visitor, liked, ip, verified]
    );
  assert.deepEqual(await read(post, guest), { count: 0, liked: false });
  await assert.rejects(
    as("anon", null, "select polar_ice_write_v2($1,$2,true,$3,true)", [
      post,
      guest,
      network,
    ]),
    { code: "42501" }
  );
  await assert.rejects(
    as(
      "authenticated",
      actor,
      "insert into polar_private.likes values ($1,$2)",
      [post, guest]
    ),
    { code: "42501" }
  );
  await assert.rejects(write("c".repeat(64), guest, true), { code: "PT404" });
  await Promise.all(Array.from({ length: 6 }, () => write(post, guest, true)));
  assert.deepEqual(await read(post, guest), { count: 1, liked: true });
  assert.deepEqual(await read(other, guest), { count: 0, liked: false });
  const second = randomUUID();
  await Promise.all([write(post, second, true), write(post, guest, false)]);
  assert.deepEqual(await read(post, second), { count: 1, liked: true });
  assert.deepEqual(await write(post, guest, false), { count: 1, liked: false });
  const fill = (scope, limit) =>
    db.query(
      "insert into polar_private.rate_buckets select $1, epoch, $2 from generate_series(floor(extract(epoch from now())/60)::bigint, floor(extract(epoch from now())/60)::bigint + 1) epoch on conflict (scope,bucket) do update set hits=excluded.hits",
      [scope, limit]
    );
  // Saturation of one article does not consume a shared anonymous budget.
  await fill("ice-v2-post:" + post, 120);
  await assert.rejects(write(post, guest, true), { code: "PT428" });
  assert.equal((await write(other, guest, true)).liked, true);
  assert.equal((await write(post, second, true)).liked, true);
  assert.equal((await write(post, second, false)).liked, false);
  assert.equal((await write(post, guest, true, null, true)).liked, true);
  await fill("ice-v2-net:" + network, 60);
  const newVisitor = randomUUID();
  await assert.rejects(write(other, newVisitor, true, network), {
    code: "PT428",
  });
  assert.equal(
    (await write(other, newVisitor, true, network, true)).liked,
    true
  );
  await fill("ice-v2-id:" + guest, 20);
  assert.equal((await write(other, guest, false)).liked, false);
  await assert.rejects(write(other, guest, true, null, true), {
    code: "PT429",
  });
  await fill("ice-v2-site", 1200);
  await assert.rejects(write(other, randomUUID(), true, null, true), {
    code: "PT429",
  });
  assert.equal((await write(post, guest, false)).liked, false);
});

test("comment limit counts actual new submissions and hides pending totals", async t => {
  const { db, as } = await fixture();
  t.after(() => db.close());
  for (let i = 0; i < 5; i++) {
    await as(
      "authenticated",
      actor,
      "select polar_comment_submit($1,null,'hello',gen_random_uuid())",
      [post]
    );
  }
  await assert.rejects(
    as(
      "authenticated",
      actor,
      "select polar_comment_submit($1,null,'hello',gen_random_uuid())",
      [post]
    ),
    { code: "PT429" }
  );
  assert.equal(
    (await as("anon", null, "select polar_comments($1,null) as value", [post]))
      .count,
    0
  );
});

test("guessed pending, hidden and rejected cursors match nonexistent cursors", async t => {
  const { db, as } = await fixture();
  t.after(() => db.close());
  const entry = async (user, parent = null) =>
    as(
      "authenticated",
      user,
      "select polar_comment_submit($1,$2,'cursor canary',gen_random_uuid()) as value",
      [post, parent]
    );
  const moderate = (id, state) =>
    as("authenticated", admin, "select polar_review_set($1,$2)", [id, state]);
  const published = await entry(actor);
  await moderate(published, "approved");
  const pending = await entry(actor, published);
  for (const state of ["pending", "rejected"]) {
    if (state === "rejected") await moderate(pending, state);
    for (const [role, user] of [
      ["anon", null],
      ["authenticated", stranger],
    ]) {
      const page = cursor =>
        as(role, user, "select polar_comments($1,$2) as value", [post, cursor]);
      const absent = await page(randomUUID());
      assert.equal(absent.count, 1);
      assert.deepEqual(await page(pending), absent);
      assert.equal((await page(null)).rows.length, 1);
      await assert.rejects(
        as(role, user, "select * from polar_private.comments"),
        { code: "42501" }
      );
      await assert.rejects(as(role, user, "select polar_review_posts()"), {
        code: role === "anon" ? "42501" : "PT403",
      });
    }
  }
  await moderate(pending, "approved");
  await moderate(published, "rejected");
  const hidden = cursor =>
    as("anon", null, "select polar_comments($1,$2) as value", [post, cursor]);
  assert.deepEqual(await hidden(pending), await hidden(randomUUID()));
});

test("signed release RPC atomically activates new CMS posts and rejects stale snapshots", async t => {
  const { db, as } = await fixture();
  t.after(() => db.close());
  const fresh = "c".repeat(64);
  const catalog = [
    { key: post, title: "Original", path: "/posts/article/" },
    { key: fresh, title: "New CMS post", path: "/posts/new/" },
  ];
  const sync = (revision, items, role = "service_role") =>
    as(role, null, "select polar_catalog_sync($1,$2::jsonb) as value", [
      revision,
      JSON.stringify(items),
    ]);
  await assert.rejects(sync(1, catalog, "anon"), { code: "42501" });
  await assert.rejects(sync(1, catalog, "authenticated"), { code: "42501" });
  await assert.rejects(sync(2, [catalog[0], catalog[0]]), { code: "PT400" });
  assert.deepEqual(await sync(2, catalog), { revision: 2, count: 2 });
  assert.deepEqual(await sync(2, catalog), { revision: 2, count: 2 });
  await assert.rejects(sync(2, [catalog[0]]), { code: "PT409" });
  await assert.rejects(sync(1, [catalog[0]]), { code: "PT409" });
  assert.equal(
    (
      await db.query(
        "select active from polar_private.posts where post_key=$1",
        [other]
      )
    ).rows[0].active,
    false
  );
  assert.deepEqual(
    await as("service_role", null, "select polar_ice_read($1,$2) as value", [
      fresh,
      guest,
    ]),
    { count: 0, liked: false }
  );
});
