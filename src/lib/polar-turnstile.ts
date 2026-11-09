type Turnstile = {
  render: (element: HTMLElement, options: Record<string, unknown>) => string;
  remove: (widget: string) => void;
};

const sitekey = import.meta.env.PUBLIC_POLAR_TURNSTILE_SITE_KEY;
export const iceVerificationAvailable =
  typeof sitekey === "string" && sitekey.length > 0;
let loading: Promise<Turnstile> | undefined;

function loadTurnstile() {
  return (loading ??= new Promise<Turnstile>((resolve, reject) => {
    const script = document.createElement("script");
    script.src =
      "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    const timer = window.setTimeout(fail, 10000);
    function fail() {
      clearTimeout(timer);
      script.remove();
      loading = undefined;
      reject({ code: "PT422" });
    }
    script.addEventListener("error", fail, { once: true });
    script.addEventListener(
      "load",
      () => {
        const api = (window as Window & { turnstile?: Turnstile }).turnstile;
        if (!api) {
          fail();
          return;
        }
        clearTimeout(timer);
        resolve(api);
      },
      { once: true }
    );
    document.head.append(script);
  }));
}

export async function verifyIceVisitor(
  element: HTMLElement,
  signal: AbortSignal
) {
  const api = await loadTurnstile();
  signal.throwIfAborted();
  return new Promise<string>((resolve, reject) => {
    let widget: string | undefined;
    const cancel = () => finish();
    const timer = window.setTimeout(cancel, 120000);
    function finish(proof?: string) {
      clearTimeout(timer);
      signal.removeEventListener("abort", cancel);
      if (widget !== undefined) api.remove(widget);
      if (proof) resolve(proof);
      else reject({ code: "PT422" });
    }
    signal.addEventListener("abort", cancel, { once: true });
    try {
      widget = api.render(element, {
        sitekey,
        action: "polar_ice",
        size: "flexible",
        theme:
          document.documentElement.dataset.theme === "dark" ? "dark" : "light",
        callback: (proof: string) => finish(proof),
        "error-callback": cancel,
        "expired-callback": cancel,
        "timeout-callback": cancel,
      });
    } catch {
      finish();
    }
  });
}
