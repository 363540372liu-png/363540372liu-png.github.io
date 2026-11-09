import assert from "node:assert/strict";
import test from "node:test";
import { createHmac, randomUUID } from "node:crypto";

const origin = "https://review.example";
const signingKey = "fixture key with at least thirty-two characters";
const credentials = {
  SUPABASE_URL: "https://test.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "fake-server-only-key",
  POLAR_ALLOWED_ORIGINS: origin,
  POLAR_TURNSTILE_SECRET: "fixture-turnstile",
  POLAR_CATALOG_SIGNING_KEY: signingKey,
};
const post = "a".repeat(64);
const visitor = randomUUID();

async function setup(t, name) {
  let handler;
  globalThis.Deno = {
    env: { get: key => credentials[key] },
    serve: callback => {
      handler = callback;
    },
  };
  t.after(() => delete globalThis.Deno);
  await import(`../supabase/functions/${name}/index.ts`);
  return (raw, overrides = {}) =>
    handler(
      new Request(`https://test.supabase.co/functions/v1/${name}`, {
        method: "POST",
        headers: { origin, "content-type": "application/json" },
        body: raw,
        ...overrides,
      })
    );
}

test("ice gateway checks origin, body and server-verified Turnstile claims", async t => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async (url, init) => {
    if (url === "https://challenges.cloudflare.com/turnstile/v0/siteverify") {
      assert.equal(init.body.get("secret"), "fixture-turnstile");
      const proof = init.body.get("response");
      return Response.json({
        success: true,
        hostname: proof === "wrong-host" ? "evil.example" : "review.example",
        action: "polar_ice",
      });
    }
    calls++;
    assert.equal(init.headers.Authorization, "Bearer fake-server-only-key");
    assert.match(url, /\/polar_ice_write_v2$/);
    const input = JSON.parse(init.body);
    assert.equal(input.p_post, post);
    assert.equal(input.p_visitor, visitor);
    assert.equal(input.p_liked, true);
    assert.equal(input.p_network, null);
    assert.equal(input.count, undefined);
    return input.p_verified
      ? Response.json({ liked: true, count: 4 })
      : Response.json({}, { status: 428 });
  });
  const call = await setup(t, "polar-ice");
  const send = (data, opts) => call(JSON.stringify(data), opts);
  const blocked = await send(
    { post, visitor },
    { headers: { origin: "https://wrong.example" } }
  );
  assert.equal(blocked.status, 403);
  const preflight = await send(null, { method: "OPTIONS", body: undefined });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get("access-control-allow-origin"), origin);
  assert.equal((await send({ post, visitor: "invalid" })).status, 400);
  assert.equal((await send({ post, visitor, liked: 1 })).status, 400);
  assert.equal(
    (await send({ post, visitor, extra: "x".repeat(3200) })).status,
    400
  );
  const forwarded = {
    origin,
    "content-type": "application/json",
    "cf-connecting-ip": "203.0.113.1",
  };
  assert.equal(
    (
      await send(
        { post, visitor, liked: true, verified: true },
        { headers: forwarded }
      )
    ).status,
    428
  );
  assert.equal(
    (await send({ post, visitor, liked: true, proof: "wrong-host" })).status,
    422
  );
  const result = await send({
    post,
    visitor,
    liked: true,
    proof: "valid",
    count: 9999,
  });
  assert.equal(result.headers.get("cache-control"), "no-store");
  assert.deepEqual(await result.json(), { liked: true, count: 4 });
  assert.equal(calls, 2);
});

test("catalog gateway rejects unsigned, tampered, and expired releases", async t => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async (url, init) => {
    calls++;
    assert.match(url, /\/polar_catalog_sync$/);
    assert.equal(init.headers.Authorization, "Bearer fake-server-only-key");
    assert.deepEqual(JSON.parse(init.body), { p_revision: 3, p_posts: [] });
    return Response.json({ revision: 3, count: 0 });
  });
  const call = await setup(t, "polar-catalog");
  const raw = JSON.stringify({ revision: 3, posts: [] });
  const now = Math.floor(Date.now() / 1000);
  const signed = timestamp => ({
    headers: {
      "x-polar-timestamp": String(timestamp),
      "x-polar-signature": createHmac("sha256", signingKey)
        .update(`${timestamp}.${raw}`)
        .digest("hex"),
    },
  });
  assert.equal((await call(raw)).status, 401);
  assert.equal((await call(raw + " ", signed(now))).status, 401);
  assert.equal((await call(raw, signed(now - 301))).status, 401);
  assert.deepEqual(await (await call(raw, signed(now))).json(), {
    revision: 3,
    count: 0,
  });
  assert.equal(calls, 1);
});
