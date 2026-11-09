import { configured, signIn } from "./polar-client";

export function find<T extends Element>(root: ParentNode, selector: string) {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Missing interaction element: ${selector}`);
  return element;
}

export function node<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  text = "",
  className = ""
) {
  const element = document.createElement(tag);
  element.textContent = text;
  if (className) element.className = className;
  return element;
}

export function button(label: string, action: () => void) {
  const control = node("button", label);
  control.type = "button";
  control.onclick = action;
  return control;
}

export function bindLogin(root: HTMLElement, signal: AbortSignal) {
  const dialog = find<HTMLDialogElement>(root, "[data-login]");
  const status = find(dialog, "[data-login-status]");
  const providers = [
    ...dialog.querySelectorAll<HTMLButtonElement>("[data-provider]"),
  ];
  for (const control of providers) {
    control.disabled = !configured;
    control.addEventListener(
      "click",
      async () => {
        const provider = control.dataset.provider;
        if (provider !== "google" && provider !== "github") return;
        providers.forEach(item => (item.disabled = true));
        status.textContent = "正在前往登录服务……";
        try {
          await signIn(provider);
        } catch {
          status.textContent =
            "无法开启登录。请检查浏览器是否允许保存网站数据，再试一次。";
          providers.forEach(item => (item.disabled = false));
        }
      },
      { signal }
    );
  }
  let trigger: HTMLElement | null = null;
  dialog.addEventListener(
    "close",
    () => {
      if (trigger?.isConnected) trigger.focus();
    },
    { signal }
  );
  return () => {
    if (dialog.open) return;
    trigger =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    status.textContent = configured
      ? ""
      : "登录服务尚未连接。此预览可检查界面。";
    dialog.showModal();
  };
}

const dateFormat = new Intl.DateTimeFormat("zh-CN", {
  dateStyle: "medium",
  timeStyle: "short",
});

export function commentTime(iso: string) {
  const time = node("time", dateFormat.format(new Date(iso)));
  time.dateTime = iso;
  return time;
}
