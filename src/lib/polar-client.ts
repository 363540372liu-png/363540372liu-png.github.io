import type { Session } from "@supabase/supabase-js";
import { getAssetPath, stripBase } from "@/utils/withBase";

export type CommentRow = {
  id: string;
  parent_id: string | null;
  nickname: string;
  avatar: string | null;
  body: string;
  status: "pending" | "approved" | "rejected" | "hidden";
  created_at: string;
  mine: boolean;
};

export type ReviewRow = CommentRow & {
  post_title: string;
  post_path: string;
  parent_name: string | null;
};
export type CommentPage<T> = { rows: T[]; more: boolean; count?: number };
export type Ice = { liked: boolean; count: number };

const url = import.meta.env.PUBLIC_POLAR_SUPABASE_URL?.replace(/\/$/, "");
const key = import.meta.env.PUBLIC_POLAR_SUPABASE_KEY;
export const configured = Boolean(
  typeof url === "string" &&
  /^https:\/\/[a-z0-9]+\.supabase\.co$/.test(url) &&
  typeof key === "string" &&
  key.startsWith("sb_publishable_")
);

async function initClient() {
  if (!configured) throw new Error("未连接测试服务。");
  const { createClient } = await import("@supabase/supabase-js");
  return createClient(url, key, {
    auth: {
      flowType: "pkce",
      detectSessionInUrl: false,
      storage: {
        getItem: name => localStorage.getItem(name),
        removeItem: name => localStorage.removeItem(name),
        setItem: (name, value) => {
          if (name.endsWith("-auth-token")) {
            const session = JSON.parse(value);
            delete session.provider_token;
            delete session.provider_refresh_token;
            value = JSON.stringify(session);
          }
          localStorage.setItem(name, value);
        },
      },
    },
  });
}

let clientPromise: ReturnType<typeof initClient> | undefined;
export const client = () => (clientPromise ??= initClient());

export function getTabValue(key: string) {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

export function setTabValue(key: string, value: string | null) {
  try {
    if (value === null) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, value);
  } catch {
    // Some browser profiles disable storage.
  }
}

export function returnPath(path: string | null) {
  if (path && !/[\\\r\n?#]/.test(path)) {
    const relative = stripBase(path);
    if (
      /^\/posts\/(?!\/)[^?#]+\/$/.test(relative) ||
      relative === "/admin/comments/"
    ) {
      const target = new URL(path, location.origin);
      if (target.origin === location.origin && target.pathname === path)
        return path;
    }
  }
  return getAssetPath("posts/");
}

export async function signIn(provider: "google" | "github") {
  const redirectTo = new URL(getAssetPath("auth/callback/"), location.origin)
    .href;
  // PKCE requires storage in this browser. Check before sending the visitor away.
  sessionStorage.setItem("polar:oauth-return", returnPath(location.pathname));
  localStorage.getItem("polar:oauth-check");
  const { data, error } = await (
    await client()
  ).auth.signInWithOAuth({
    provider,
    options: {
      redirectTo,
      skipBrowserRedirect: true,
      ...(provider === "google" ? { scopes: "openid profile email" } : {}),
    },
  });
  if (error || !data.url) throw error ?? new Error("OAuth unavailable");
  location.assign(data.url);
}

export function watchSession(
  signal: AbortSignal,
  update: (session: Session | null) => void
) {
  void client()
    .then(supabase => {
      if (signal.aborted) return;
      const { data } = supabase.auth.onAuthStateChange((_event, session) => {
        // Calls back outside the Supabase auth lock.
        queueMicrotask(() => {
          if (!signal.aborted) update(session);
        });
      });
      signal.addEventListener("abort", () => data.subscription.unsubscribe(), {
        once: true,
      });
    })
    .catch(() => {
      if (!signal.aborted) update(null);
    });
}

export async function rpc<T>(
  name: string,
  args: Record<string, unknown>,
  signal: AbortSignal
) {
  const { data, error } = await (
    await client()
  )
    .rpc(name, args)
    .abortSignal(signal);
  if (error) throw error;
  return data as T;
}

let visitor: string | undefined;
function visitorId() {
  const storageKey = "polar:ice-visitor";
  try {
    const saved = localStorage.getItem(storageKey);
    if (
      saved &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
        saved
      )
    )
      return saved;
    visitor ??= crypto.randomUUID();
    localStorage.setItem(storageKey, visitor);
  } catch {
    visitor ??= crypto.randomUUID();
  }
  return visitor;
}

export async function ice(
  post: string,
  signal: AbortSignal,
  liked?: boolean
): Promise<Ice> {
  const response = await fetch(`${url}/functions/v1/polar-ice`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ post, visitor: visitorId(), liked }),
    signal: AbortSignal.any([signal, AbortSignal.timeout(10000)]),
    cache: "no-store",
    credentials: "omit",
  });
  if (!response.ok) throw { code: `PT${response.status}` };
  return response.json();
}

export function errorText(error: unknown, fallback: string) {
  const code = (error as { code?: string } | null)?.code;
  if (code === "PT429") return "操作太频繁，请稍后再试。";
  if (code === "PT409") return "请先通过这条回复所属的原观测。";
  return fallback;
}
