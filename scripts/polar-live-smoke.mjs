import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

// Never use service-role credentials here: these assertions must go through
// the same public HTTP routes and three user sessions as the browser.
const {
  POLAR_E2E_TEST_REF: ref,
  POLAR_E2E_PRODUCTION_REF: production,
  POLAR_E2E_PUBLISHABLE_KEY: key,
  POLAR_E2E_POST_KEY: post,
  POLAR_E2E_GOOGLE_JWT: google,
  POLAR_E2E_GITHUB_JWT: github,
  POLAR_E2E_ADMIN_JWT: admin,
} = process.env;
const origin =
  "https://polar-explorer-interaction-review.tangy-field-2945.chatgpt.site";
assert.ok(
  /^[a-z0-9]{20}$/.test(ref ?? "") && ref !== production,
  "Set the explicitly approved test project reference"
);
assert.ok(
  key?.startsWith("sb_publishable_") &&
    /^[a-f0-9]{64}$/.test(post ?? "") &&
    [google, github, admin].every(
      token => typeof token === "string" && token.split(".").length === 3
    ),
  "Set test-only publishable key, article key, and three short-lived OAuth user access tokens"
);
const url = `https://${ref}.supabase.co`;

async function request(path, { token, body, headers = {} } = {}) {
  const response = await fetch(url + path, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      apikey: key,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: "error",
    signal: AbortSignal.timeout(15000),
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

const rpc = (name, body, token) =>
  request(`/rest/v1/rpc/${name}`, { body, token });
function success(result, label) {
  assert.ok(
    result.status >= 200 && result.status < 300,
    `${label} returned HTTP ${result.status}`
  );
  return result.body;
}
function denied(result, label) {
  assert.ok(
    result.status >= 400 && result.status < 500,
    `${label} returned HTTP ${result.status}`
  );
}
const user = token =>
  request("/auth/v1/user", { token }).then(result =>
    success(result, "Authenticated user")
  );
const [author, other, reviewer] = await Promise.all([
  user(google),
  user(github),
  user(admin),
]);
assert.ok(author.identities.some(item => item.provider === "google"));
assert.ok(other.identities.some(item => item.provider === "github"));
assert.equal(
  new Set([author.id, other.id, reviewer.id]).size,
  3,
  "Use three distinct test accounts"
);
assert.equal(
  success(await rpc("polar_is_admin", {}, admin), "Admin permission"),
  true
);
assert.equal(
  success(await rpc("polar_is_admin", {}, github), "Reader permission"),
  false
);
assert.equal(
  success(await rpc("polar_is_admin", {}, google), "Author permission"),
  false
);

const visitor = randomUUID();
const list = (token, p_after = null) =>
  rpc("polar_comments", { p_post: post, p_after }, token).then(result =>
    success(result, "Comment list")
  );
const ice = liked =>
  request("/functions/v1/polar-ice", {
    headers: { Origin: origin },
    body: { post, visitor, liked },
  }).then(result => success(result, "Anonymous ice"));
const markers = [`test-root-${randomUUID()}`, `test-reply-${randomUUID()}`];
const input = (p_body, p_parent = null) => ({
  p_post: post,
  p_parent,
  p_body,
  p_request: randomUUID(),
});
const submit = async (token, body, parent = null) =>
  success(
    await rpc("polar_comment_submit", input(body, parent), token),
    "Comment submission"
  );
const review = async (p_id, p_status) =>
  success(
    await rpc("polar_review_set", { p_id, p_status }, admin),
    "Moderation"
  );
let root, reply;
try {
  assert.equal((await ice()).liked, false);
  assert.equal((await ice(true)).liked, true);
  assert.equal((await ice(true)).liked, true);
  assert.equal((await ice(false)).liked, false);
  denied(
    await rpc("polar_comment_submit", input(markers[0])),
    "Anonymous submission"
  );
  root = await submit(google, markers[0]);
  assert.ok(
    (await list(google)).rows.some(
      row => row.id === root && row.status === "pending"
    )
  );

  async function assertPrivate(id, marker, outsider) {
    for (const token of [undefined, outsider]) {
      assert.ok(
        !(await list(token)).rows.some(
          row => row.id === id || row.body === marker
        )
      );
      assert.deepEqual(await list(token, id), await list(token, randomUUID()));
      denied(
        await rpc("polar_review_list", { p_status: "pending" }, token),
        "Unauthorized queue"
      );
      denied(
        await request("/rest/v1/comments?select=*", {
          token,
          headers: { "Accept-Profile": "polar_private" },
        }),
        "Private schema"
      );
      denied(
        await request("/rest/v1/comments?select=*", { token }),
        "Public table route"
      );
    }
  }

  await assertPrivate(root, markers[0], github);
  denied(
    await rpc("polar_review_set", { p_id: root, p_status: "approved" }, github),
    "Unauthorized moderation"
  );
  denied(
    await rpc("polar_comment_delete", { p_id: root }, github),
    "Cross-account deletion"
  );
  await review(root, "approved");
  assert.ok((await list()).rows.some(row => row.id === root));
  reply = await submit(github, markers[1], root);
  assert.ok(
    (await list(github)).rows.some(
      row => row.id === reply && row.status === "pending"
    )
  );
  await assertPrivate(reply, markers[1], google);
  await review(reply, "approved");
  assert.ok(
    (await list()).rows.some(row => row.id === reply && row.parent_id === root)
  );
  await review(root, "rejected");
  assert.ok(
    !(await list()).rows.some(row => row.id === root || row.id === reply)
  );
  process.stdout.write(
    "PASS: live Supabase OAuth sessions, anonymous ice, comments/replies, moderation and REST isolation.\n"
  );
} finally {
  if (reply) await review(reply, "deleted");
  if (root) await review(root, "deleted");
  await ice(false);
}
