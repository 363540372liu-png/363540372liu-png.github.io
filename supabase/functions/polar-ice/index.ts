// The public browser endpoint accepts an explicit desired state, never a count.
const url = Deno.env.get("SUPABASE_URL") ?? "";
const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const secret = Deno.env.get("POLAR_ICE_HMAC_SECRET") ?? "";
const origins = new Set(
  (Deno.env.get("POLAR_ALLOWED_ORIGINS") ?? "")
    .split(",")
    .map(value => value.trim())
);
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

async function boundedJson(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw new Error("missing_body");
  const decoder = new TextDecoder();
  let size = 0;
  let body = "";
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 512) {
        await reader.cancel();
        throw new Error("body_too_large");
      }
      body += decoder.decode(value, { stream: true });
    }
    return JSON.parse(body + decoder.decode());
  } finally {
    reader.releaseLock();
  }
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
  if (!url || !key || !hmac) return json({ error: "unavailable" }, 503);

  let data;
  try {
    data = await boundedJson(request);
  } catch {
    return json({ error: "invalid_request" }, 400);
  }
  if (
    !data ||
    typeof data.post !== "string" ||
    !/^[a-f0-9]{64}$/.test(data.post) ||
    typeof data.visitor !== "string" ||
    !uuid.test(data.visitor) ||
    (data.liked !== undefined && typeof data.liked !== "boolean")
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
      // Until the gateway's header handling is verified, use a shared write
      // budget. Client-supplied forwarding headers never grant a new budget.
      const source = ip && /^[0-9a-f:.]{3,45}$/i.test(ip) ? ip : "shared";
      const digest = await crypto.subtle.sign(
        "HMAC",
        await hmac,
        encoder.encode(source)
      );
      args.p_network = Array.from(new Uint8Array(digest), n =>
        n.toString(16).padStart(2, "0")
      ).join("");
      args.p_liked = data.liked;
    }
    const response = await fetch(
      `${url}/rest/v1/rpc/polar_ice_${write ? "write" : "read"}`,
      {
        method: "POST",
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(args),
        signal: AbortSignal.timeout(8000),
      }
    );
    if (!response.ok) {
      if (response.status === 429) headers.set("Retry-After", "60");
      const status = [400, 404, 429].includes(response.status)
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
