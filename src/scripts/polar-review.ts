import {
  client,
  configured,
  errorText,
  getTabValue,
  rpc,
  setTabValue,
  watchSession,
  type CommentPage,
  type ReviewRow,
} from "@/lib/polar-client";
import { bindLogin, button, commentTime, find, node } from "@/lib/polar-dom";

class PolarReview extends HTMLElement {
  private lifecycle?: AbortController;

  disconnectedCallback() {
    this.lifecycle?.abort();
  }

  connectedCallback() {
    if (this.lifecycle && !this.lifecycle.signal.aborted) return;
    const signal = (this.lifecycle = new AbortController()).signal;
    const openLogin = bindLogin(this, signal);
    const status = find(this, "[data-review-status]");
    const login = find<HTMLButtonElement>(this, "[data-login-open]");
    const logout = find<HTMLButtonElement>(this, "[data-logout]");
    const panel = find<HTMLElement>(this, "[data-review-panel]");
    const list = find(this, "[data-review-rows]");
    const form = find<HTMLFormElement>(this, "form.polar-review-filters");
    const articleFilter = find<HTMLSelectElement>(form, "select[name=post]");
    const statusFilter = find<HTMLSelectElement>(form, "select[name=status]");
    const more = find<HTMLButtonElement>(this, "[data-more]");
    let user: string | null | undefined;
    let allowed = false;
    let rows: ReviewRow[] = [];
    let identity = 0;
    let generation = 0;
    const oauth = getTabValue("polar:oauth-result");
    setTabValue("polar:oauth-result", null);

    login.addEventListener("click", openLogin, { signal });
    if (!configured) {
      login.hidden = false;
      status.textContent = "审核服务尚未连接。此预览可查看登录入口。";
      return;
    }

    function resetQueue() {
      allowed = false;
      rows = [];
      panel.hidden = true;
      list.replaceChildren();
      more.hidden = true;
      articleFilter.length = 1;
    }

    async function review(
      entry: ReviewRow,
      decision: string,
      controls: HTMLElement
    ) {
      if (
        !allowed ||
        (decision === "deleted" && !confirm("永久移除这条观测的内容？"))
      )
        return;
      const owner = identity;
      controls
        .querySelectorAll("button")
        .forEach(control => (control.disabled = true));
      try {
        await rpc(
          "polar_review_set",
          { p_id: entry.id, p_status: decision },
          signal
        );
        if (!signal.aborted && identity === owner)
          await load(false, "审核决定已保存。");
      } catch (error) {
        if (signal.aborted || identity !== owner) return;
        status.textContent = errorText(
          error,
          "无法保存审核决定，请刷新队列后重试。"
        );
        if ((error as { code?: string }).code === "PT403") resetQueue();
      } finally {
        controls
          .querySelectorAll("button")
          .forEach(control => (control.disabled = false));
      }
    }

    function render(entry: ReviewRow) {
      const item = node("li", "", "polar-comment");
      const heading = node("header", "", "polar-comment-header");
      const title = node("a", entry.post_title);
      // Database imports are trusted, but only allow a same-origin article link.
      if (/^\/posts\/(?!\/)[^?#\\]+\/$/.test(entry.post_path))
        title.href = entry.post_path;
      heading.append(
        title,
        node("strong", entry.nickname),
        commentTime(entry.created_at)
      );
      item.append(heading);
      item.append(
        node(
          "p",
          entry.parent_id
            ? `回复 · ${entry.parent_name ?? "原观测已移除"} · ${entry.parent_id}`
            : "原观测",
          "polar-comment-state"
        )
      );
      item.append(node("p", entry.body, "polar-comment-body"));
      const controls = node("div", "", "polar-actions");
      if (entry.status !== "approved")
        controls.append(
          button("通过", () => void review(entry, "approved", controls))
        );
      if (entry.status !== "rejected")
        controls.append(
          button(
            entry.status === "approved" ? "隐藏" : "拒绝",
            () => void review(entry, "rejected", controls)
          )
        );
      controls.append(
        button("删除内容", () => void review(entry, "deleted", controls))
      );
      item.append(controls);
      return item;
    }

    async function load(append = false, notice = "") {
      if (!allowed) return;
      const request = ++generation;
      const owner = identity;
      more.disabled = true;
      if (!append) {
        list.replaceChildren();
        more.hidden = true;
      }
      status.textContent = notice || "正在读取审核队列……";
      try {
        const page = await rpc<CommentPage<ReviewRow>>(
          "polar_review_list",
          {
            p_status: statusFilter.value,
            p_post: articleFilter.value || null,
            p_after: append ? rows.at(-1)?.id : null,
          },
          signal
        );
        if (signal.aborted || identity !== owner || request !== generation)
          return;
        rows = append ? [...rows, ...page.rows] : page.rows;
        list.replaceChildren(...rows.map(render));
        more.hidden = !page.more;
        status.textContent =
          notice ||
          (rows.length
            ? `已加载 ${rows.length} 条观测`
            : "此筛选条件下没有观测。");
      } catch (error) {
        if (signal.aborted || identity !== owner || request !== generation)
          return;
        if ((error as { code?: string }).code === "PT403") resetQueue();
        status.textContent = errorText(error, "暂时无法读取审核队列。");
      } finally {
        if (request === generation) more.disabled = false;
      }
    }

    form.addEventListener(
      "submit",
      event => {
        event.preventDefault();
        void load();
      },
      { signal }
    );
    form.addEventListener("change", () => void load(), { signal });
    more.addEventListener("click", () => void load(true), { signal });
    logout.addEventListener(
      "click",
      async () => {
        try {
          const { error } = await (
            await client()
          ).auth.signOut({ scope: "local" });
          if (error) throw error;
        } catch {
          if (!signal.aborted) status.textContent = "退出失败，请重试。";
        }
      },
      { signal }
    );

    watchSession(signal, async session => {
      const next = session?.user.id ?? null;
      if (next === user) return;
      user = next;
      const owner = ++identity;
      resetQueue();
      login.hidden = !!next;
      logout.hidden = !next;
      if (!next) {
        status.textContent =
          oauth === "failure"
            ? "登录未完成，请重试。"
            : "请登录以确认管理员权限。";
        return;
      }
      status.textContent = "正在确认管理员权限……";
      try {
        const isAdmin = await rpc<boolean>("polar_is_admin", {}, signal);
        if (signal.aborted || owner !== identity) return;
        if (!isAdmin) {
          status.textContent = "当前账号没有审核权限。";
          return;
        }
        const posts = await rpc<Array<{ key: string; title: string }>>(
          "polar_review_posts",
          {},
          signal
        );
        if (signal.aborted || owner !== identity) return;
        for (const post of posts)
          articleFilter.add(new Option(post.title, post.key));
        allowed = true;
        panel.hidden = false;
        await load();
      } catch {
        if (!signal.aborted && owner === identity)
          status.textContent = "暂时无法确认审核权限。请刷新后重试。";
      }
    });
  }
}

if (!customElements.get("polar-review"))
  customElements.define("polar-review", PolarReview);
