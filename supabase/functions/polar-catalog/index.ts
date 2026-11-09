import { boundedText, supabaseRpc } from "../_shared/request.ts";

const url = Deno.env.get("SUPABASE_URL") ?? "";
const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const secret = Deno.env.get("POLAR_CATALOG_SIGNING_KEY") ?? "";
const encoder = new TextEncoder();
const signingKey =
  secret.length >= 32
    ? crypto.subtle.importKey(
        "raw",
        encoder.encode(secret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["verify"]
      )
    : null;

Deno.serve(async request => {
  const json = (body: unknown, status = 200) =>
    Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
  if (request.method !== "POST")
    return json({ error: "method_not_allowed" }, 405);
  if (!url || !key || !signingKey) return json({ error: "unavailable" }, 503);

  const stamp = request.headers.get("x-polar-timestamp") ?? "";
  const signature = request.headers.get("x-polar-signature") ?? "";
  if (
    !/^\d{10}$/.test(stamp) ||
    Math.abs(Date.now() / 1000 - Number(stamp)) > 300 ||
    !/^[a-f0-9]{64}$/.test(signature)
  )
    return json({ error: "unauthorized" }, 401);

  let raw: string;
  try {
    raw = await boundedText(request, 2_000_000);
  } catch {
    return json({ error: "invalid_request" }, 400);
  }
  const proof = Uint8Array.from(signature.match(/../g)!, byte =>
    parseInt(byte, 16)
  );
  if (
    !(await crypto.subtle.verify(
      "HMAC",
      await signingKey,
      proof,
      encoder.encode(`${stamp}.${raw}`)
    ))
  ) {
    return json({ error: "unauthorized" }, 401);
  }

  try {
    const payload = JSON.parse(raw);
    if (
      !Number.isSafeInteger(payload?.revision) ||
      payload.revision < 1 ||
      !Array.isArray(payload.posts)
    ) {
      return json({ error: "invalid_request" }, 400);
    }
    const response = await supabaseRpc(url, key, "polar_catalog_sync", {
      p_revision: payload.revision,
      p_posts: payload.posts,
    });
    if (!response.ok) {
      const status = [400, 409].includes(response.status)
        ? response.status
        : 502;
      return json({ error: "catalog_rejected" }, status);
    }
    return json(await response.json());
  } catch {
    return json({ error: "catalog_unavailable" }, 502);
  }
});
