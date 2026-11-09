import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";

const {
  PUBLIC_POLAR_SUPABASE_URL: url,
  PUBLIC_POLAR_SUPABASE_KEY: key,
  POLAR_CATALOG_SIGNING_KEY: secret,
  GITHUB_RUN_NUMBER: revision,
} = process.env;
if (!url && !key && !secret) {
  process.stdout.write(
    "Interaction backend is disabled. No catalog to synchronize.\n"
  );
  process.exit(0);
}
if (
  !/^https:\/\/[a-z0-9]+\.supabase\.co\/?$/.test(url ?? "") ||
  !/^sb_publishable_/.test(key ?? "") ||
  (secret?.length ?? 0) < 32 ||
  !/^\d+$/.test(revision ?? "") ||
  !Number.isSafeInteger(Number(revision)) ||
  Number(revision) < 1
) {
  throw new Error("Incomplete interaction deployment configuration");
}

const posts = JSON.parse(
  readFileSync(process.argv[2] ?? "dist/interaction-catalog.json", "utf8")
);
if (!Array.isArray(posts) || posts.length > 5000)
  throw new Error("Invalid built catalog");
const body = JSON.stringify({ revision: Number(revision), posts });
const endpoint = new URL("/functions/v1/polar-catalog", url);
async function sendCatalog() {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = createHmac("sha256", secret)
    .update(`${timestamp}.${body}`)
    .digest("hex");
  return fetch(endpoint, {
    method: "POST",
    redirect: "error",
    headers: {
      "Content-Type": "application/json",
      "X-Polar-Timestamp": timestamp,
      "X-Polar-Signature": signature,
    },
    body,
    signal: AbortSignal.timeout(15000),
  });
}
let response;
for (let attempt = 0; attempt < 3; attempt++) {
  try {
    response = await sendCatalog();
    if (response.status !== 429 && response.status < 500) break;
  } catch {
    response = undefined;
  }
  if (attempt < 2) {
    await response?.body?.cancel();
    await delay(1000 * (attempt + 1));
  }
}
if (!response)
  throw new Error("Catalog synchronization endpoint is unreachable");
if (!response.ok)
  throw new Error(`Catalog synchronization failed (HTTP ${response.status})`);
const result = await response.json();
if (result.revision !== Number(revision) || result.count !== posts.length) {
  throw new Error("Catalog synchronization returned an unexpected result");
}
process.stdout.write(
  `Synchronized ${result.count} articles for release ${result.revision}.\n`
);
