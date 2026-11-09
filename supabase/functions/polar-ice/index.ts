import { boundedText, supabaseRpc } from "../_shared/request.ts";

// The public browser endpoint accepts an explicit desired state, never a count.
const url = Deno.env.get("SUPABASE_URL") ?? "";
const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const secret = Deno.env.get("POLAR_ICE_HMAC_SECRET") ?? "";
const origins = new Set(
  (Deno.env.get("POLAR_ALLOWED_ORIGINS") ?? "")
    .split(",")
    .map(value => value.trim())
);
const turnstileSecret = Deno.env.get("POLAR_TURNSTILE_SECRET") ?? "";
const useCloudflareIp = Deno.env.get("POLAR_TRUST_CF_IP") === "true";
const encoder = new TextEncoder();
const hmac =
  secret.length >= 32
    ? crypto.subtle.importKey(
        "raw",
        encoder.encode(secret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"]
      )
    : null;
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

async function verifyProof(proof: string, origin: string) {
  const response = await fetch(
    "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    {
      method: "POST",
      body: new URLSearchParams({ secret: turnstileSecret, response: proof }),
      signal: AbortSignal.timeout(6000),
    }
  );
  if (!response.ok) throw new Error("verification_unavailable");
  const result = await response.json();
  return (
    result.success === true &&
    result.action === "polar_ice" &&
    result.hostname === new URL(origin).hostname
  );
}

Deno.serve(async request => {
  const origin = request.headers.get("origin");
  const headers = new Headers({ "Cache-Control": "no-store", Vary: "Origin" });
  if (!origin || !origins.has(origin))
    return new Response(null, { status: 403, headers });
  headers.set("Access-Control-Allow-Origin", origin);
  headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "content-type");
  headers.set("Access-Control-Expose-Headers", "Retry-After");

  const json = (body: unknown, status = 200) =>
    Response.json(body, { headers, status });
  if (request.method === "OPTIONS")
    return new Response(null, { status: 204, headers });
  if (request.method !== "POST")
    return json({ error: "method_not_allowed" }, 405);
  if (
    !/^application\/json(?:\s*;|$)/i.test(
      request.headers.get("content-type") ?? ""
    )
  ) {
    return json({ error: "invalid_content_type" }, 415);
  }
  if (!url || !key || (useCloudflareIp && !hmac))
    return json({ error: "unavailable" }, 503);

  let data;
  try {
    data = JSON.parse(await boundedText(request, 3072));
  } catch {
    return json({ error: "invalid_request" }, 400);
  }
  if (
    !data ||
    typeof data.post !== "string" ||
    !/^[a-f0-9]{64}$/.test(data.post) ||
    typeof data.visitor !== "string" ||
    !uuid.test(data.visitor) ||
    (data.liked !== undefined && typeof data.liked !== "boolean") ||
    (data.proof !== undefined &&
      (data.liked !== true ||
        typeof data.proof !== "string" ||
        data.proof.length < 1 ||
        data.proof.length > 2048))
  ) {
    return json({ error: "invalid_request" }, 400);
  }

  const args: Record<string, unknown> = {
    p_post: data.post,
    p_visitor: data.visitor,
  };
  const write = typeof data.liked === "boolean";
  try {
    if (write) {
      const ip = useCloudflareIp
        ? request.headers.get("cf-connecting-ip")
        : null;
      args.p_network = null;
      if (hmac && ip && /^[0-9a-f:.]{3,45}$/i.test(ip)) {
        const digest = await crypto.subtle.sign(
          "HMAC",
          await hmac,
          encoder.encode(ip)
        );
        args.p_network = Array.from(new Uint8Array(digest), n =>
          n.toString(16).padStart(2, "0")
        ).join("");
      }
      args.p_liked = data.liked;
      args.p_verified = false;
      if (data.proof !== undefined) {
        if (!turnstileSecret || !(await verifyProof(data.proof, origin))) {
          return json({ error: "verification_failed" }, 422);
        }
        args.p_verified = true;
      }
    }
    const response = await supabaseRpc(
      url,
      key,
      write ? "polar_ice_write_v2" : "polar_ice_read",
      args
    );
    if (!response.ok) {
      if (response.status === 428 && turnstileSecret) {
        return json({ error: "verification_required" }, 428);
      }
      const limited = response.status === 429 || response.status === 428;
      if (limited) headers.set("Retry-After", "60");
      const status = limited
        ? 429
        : [400, 404].includes(response.status)
          ? response.status
          : 502;
      return json(
        { error: status === 429 ? "rate_limited" : "request_failed" },
        status
      );
    }
    const result = await response.json();
    return result ? json(result) : json({ error: "unknown_post" }, 404);
  } catch {
    return json({ error: "unavailable" }, 503);
  }
});
