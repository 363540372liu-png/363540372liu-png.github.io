import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";

const origin = "https://review.example";
const credentials = {
  SUPABASE_URL: "https://test.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "fake-server-only-key",
  POLAR_ICE_HMAC_SECRET: "fixture key with at least thirty-two characters",
  POLAR_ALLOWED_ORIGINS: origin,
};
const post = "a".repeat(64);
const visitor = randomUUID();

test("ice gateway rejects cross-origin and malformed requests and exposes only the RPC result", async t => {
  let handler;
  t.mock.method(globalThis, "fetch", async (url, init) => {
    assert.equal(init.headers.Authorization, "Bearer fake-server-only-key");
    assert.match(url, /\/polar_ice_write$/);
    const input = JSON.parse(init.body);
    assert.equal(input.p_post, post);
    assert.equal(input.p_visitor, visitor);
    assert.equal(input.p_liked, true);
    assert.match(input.p_network, /^[a-f0-9]{64}$/);
    assert.equal(input.count, undefined);
    return Response.json({ liked: true, count: 4 });
  });
  globalThis.Deno = {
    env: { get: key => credentials[key] },
    serve: callback => {
      handler = callback;
    },
  };
  t.after(() => delete globalThis.Deno);
  await import("../supabase/functions/polar-ice/index.ts");
  const call = (data, overrides = {}) =>
    handler(
      new Request("https://test.supabase.co/functions/v1/polar-ice", {
        method: "POST",
        headers: { origin, "content-type": "application/json" },
        body: JSON.stringify(data),
        ...overrides,
      })
    );
  const blocked = await call(
    { post, visitor },
    { headers: { origin: "https://wrong.example" } }
  );
  assert.equal(blocked.status, 403);
  assert.equal(blocked.headers.get("access-control-allow-origin"), null);
  const preflight = await call(null, { method: "OPTIONS", body: undefined });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get("access-control-allow-origin"), origin);
  assert.equal((await call({ post, visitor: "invalid" })).status, 400);
  assert.equal((await call({ post, visitor, liked: 1 })).status, 400);
  assert.equal(
    (await call({ post, visitor, extra: "x".repeat(600) })).status,
    400
  );
  const result = await call({ post, visitor, liked: true, count: 9999 });
  assert.equal(result.headers.get("cache-control"), "no-store");
  assert.deepEqual(await result.json(), { liked: true, count: 4 });
});
