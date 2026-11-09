import {
  client,
  configured,
  errorText,
  getTabValue,
  ice,
  rpc,
  setTabValue,
  watchSession,
  type CommentPage,
  type CommentRow,
} from "@/lib/polar-client";
import { bindLogin, button, commentTime, find, node } from "@/lib/polar-dom";

class PolarObservations extends HTMLElement {
  private lifecycle?: AbortController;

  disconnectedCallback() {
    this.lifecycle?.abort();
  }

  connectedCallback() {
    if (this.lifecycle && !this.lifecycle.signal.aborted) return;
    const signal = (this.lifecycle = new AbortController()).signal;
    const post = this.dataset.post!;
    const openLogin = bindLogin(this, signal);
    const iceButton = find<HTMLButtonElement>(this, "[data-ice]");
    const iceLabel = find(this, "[data-ice-label]");
    const iceCount = find(this, "[data-ice-count]");
    const iceRetry = find<HTMLButtonElement>(this, "[data-ice-retry]");
    const compose = find<HTMLButtonElement>(this, "[data-compose]");
    const logout = find<HTMLButtonElement>(this, "[data-logout]");
    const commentStatus = find(this, "[data-comment-status]");
    const commentCount = find(this, "[data-comment-count]");
    const retry = find<HTMLButtonElement>(this, "[data-comment-retry]");
    const form = find<HTMLFormElement>(this, "[data-comment-form]");
    const label = find(this, "[data-compose-label]");
    const textarea = find<HTMLTextAreaElement>(this, "textarea");
    const submit = find<HTMLButtonElement>(this, "[data-submit]");
    const cancel = find<HTMLButtonElement>(this, "[data-cancel]");
    const list = find(this, "[data-comments]");
    const more = find<HTMLButtonElement>(this, "[data-more]");

    compose.addEventListener("click", () => start(null), { signal });

    if (!configured) {
      iceCount.textContent = "点赞服务尚未连接";
      commentStatus.textContent =
        "观测服务尚未连接。此预览可查看版式和登录入口。";
      return;
    }

    let liked = false;
    let user: string | null | undefined;
    let replyTo: string | null = null;
    let requestId = crypto.randomUUID();
    let rows: CommentRow[] = [];
    let loadId = 0;
    let busy = false;
    const draftKey = `polar:draft:${post}`;
    const oauth = getTabValue("polar:oauth-result");
    setTabValue("polar:oauth-result", null);

    function saveDraft(wantsEditor = !form.hidden) {
      setTabValue(
        draftKey,
        JSON.stringify({
          body: textarea.value,
          replyTo,
          requestId,
          wantsEditor,
        })
      );
    }

    try {
      const draft = JSON.parse(getTabValue(draftKey) ?? "null");
      if (draft && typeof draft.body === "string") {
        textarea.value = draft.body.slice(0, 2000);
        replyTo = typeof draft.replyTo === "string" ? draft.replyTo : null;
        if (typeof draft.requestId === "string") requestId = draft.requestId;
      }
    } catch {
      setTabValue(draftKey, null);
    }

    function editor(parent: string | null, focus: boolean) {
      replyTo = parent;
      const target = rows.find(row => row.id === parent);
      label.textContent = parent
        ? target
          ? `回应 ${target.nickname} 的观测`
          : "回应这条观测"
        : "留下你的观测";
      form.hidden = false;
      saveDraft();
      if (focus) textarea.focus();
    }

    function start(parent: string | null) {
      if (configured && busy) return;
      if (!configured) {
        openLogin();
        return;
      }
      if (replyTo !== parent) requestId = crypto.randomUUID();
      if (!user) {
        replyTo = parent;
        saveDraft(true);
        openLogin();
        return;
      }
      editor(parent, true);
    }

    async function loadIce(desired?: boolean) {
      iceButton.disabled = true;
      iceRetry.hidden = true;
      try {
        const result = await ice(post, signal, desired);
        if (signal.aborted) return;
        liked = result.liked;
        iceButton.setAttribute("aria-pressed", String(liked));
        iceLabel.textContent = liked ? "收回这块冰" : "添一块冰";
        iceCount.textContent = `已有 ${result.count} 块冰`;
        iceButton.disabled = false;
        if (
          liked &&
          desired === true &&
          !matchMedia("(prefers-reduced-motion: reduce)").matches
        ) {
          iceButton
            .querySelector("svg")
            ?.animate(
              [
                { transform: "scale(1)" },
                { transform: "scale(1.17)" },
                { transform: "scale(1)" },
              ],
              { duration: 380, easing: "ease-out" }
            );
        }
      } catch (error) {
        if (signal.aborted) return;
        iceCount.textContent = errorText(error, "暂时无法确认冰块数量。");
        iceRetry.hidden = false;
      }
    }

    function render() {
      const ordered = [...rows].sort((a, b) =>
        a.created_at.localeCompare(b.created_at)
      );
      const items = new Map<string, HTMLLIElement>();
      const roots = document.createDocumentFragment();
      for (const entry of ordered) {
        const item = node("li", "", "polar-comment");
        items.set(entry.id, item);
        const header = node("header", "", "polar-comment-header");
        if (
          entry.avatar &&
          /^https:\/\/(avatars\.githubusercontent\.com|lh3\.googleusercontent\.com)\/[A-Za-z0-9_./=?&%-]+$/.test(
            entry.avatar
          )
        ) {
          const avatar = node("img");
          avatar.src = entry.avatar;
          avatar.alt = "";
          avatar.width = 28;
          avatar.height = 28;
          avatar.loading = "lazy";
          avatar.referrerPolicy = "no-referrer";
          header.append(avatar);
        }
        header.append(
          node("strong", entry.nickname),
          commentTime(entry.created_at)
        );
        const state = {
          pending: "等待记录者确认",
          rejected: "审核未通过",
          hidden: "原观测暂未公开",
        };
        if (entry.status !== "approved")
          header.append(
            node("span", state[entry.status], "polar-comment-state")
          );
        const text = node("p", entry.body, "polar-comment-body");
        const actions = node("div", "", "polar-actions");
        if (entry.status === "approved" && !entry.parent_id) {
          actions.append(button("回应这条观测", () => start(entry.id)));
        }
        if (entry.mine) {
          actions.append(
            button("删除自己的观测", async () => {
              if (!confirm("删除这条观测？")) return;
              try {
                await rpc("polar_comment_delete", { p_id: entry.id }, signal);
                await load(false, "观测已删除。");
              } catch (error) {
                if (!signal.aborted)
                  commentStatus.textContent = errorText(
                    error,
                    "删除失败，请重试。"
                  );
              }
            })
          );
        }
        item.append(header, text, actions);
      }
      for (const entry of ordered) {
        const item = items.get(entry.id)!;
        const parent = entry.parent_id ? items.get(entry.parent_id) : undefined;
        if (parent) {
          let replies = parent.querySelector("ol");
          if (!replies) {
            replies = node("ol", "", "polar-replies");
            replies.setAttribute("aria-label", "回复");
            parent.append(replies);
          }
          replies.append(item);
        } else {
          if (entry.parent_id)
            item.prepend(node("p", "回复", "polar-comment-state"));
          roots.append(item);
        }
      }
      list.replaceChildren(roots);
    }

    async function load(append = false, notice = "") {
      const generation = ++loadId;
      retry.hidden = true;
      more.disabled = true;
      commentStatus.textContent = notice || "正在读取观测……";
      try {
        const result = await rpc<CommentPage<CommentRow>>(
          "polar_comments",
          {
            p_post: post,
            p_after: append ? rows.at(-1)?.id : null,
          },
          signal
        );
        if (signal.aborted || generation !== loadId) return;
        rows = append ? [...rows, ...result.rows] : result.rows;
        commentCount.textContent = `${result.count ?? 0} 条观测`;
        more.hidden = !result.more;
        render();
        commentStatus.textContent =
          notice ||
          (rows.length
            ? ""
            : "这里还没有留下任何观测。或许，你会是第一个抵达的人。");
      } catch (error) {
        if (signal.aborted || generation !== loadId) return;
        commentStatus.textContent = errorText(
          error,
          notice ? `${notice}列表暂时无法刷新。` : "暂时无法读取观测。"
        );
        retry.hidden = false;
      } finally {
        if (generation === loadId) more.disabled = false;
      }
    }

    iceButton.addEventListener("click", () => void loadIce(!liked), { signal });
    iceRetry.addEventListener("click", () => void loadIce(), { signal });
    retry.addEventListener("click", () => void load(), { signal });
    more.addEventListener("click", () => void load(true), { signal });
    cancel.addEventListener(
      "click",
      () => {
        form.hidden = true;
        saveDraft(false);
        compose.focus();
      },
      { signal }
    );
    textarea.addEventListener(
      "input",
      () => {
        requestId = crypto.randomUUID();
        saveDraft();
      },
      { signal }
    );
    logout.addEventListener(
      "click",
      async () => {
        try {
          const { error } = await (
            await client()
          ).auth.signOut({ scope: "local" });
          if (error) throw error;
        } catch {
          if (!signal.aborted) commentStatus.textContent = "退出失败，请重试。";
        }
      },
      { signal }
    );
    form.addEventListener(
      "submit",
      async event => {
        event.preventDefault();
        if (busy) return;
        if (!user) {
          start(replyTo);
          return;
        }
        const body = textarea.value.trim();
        if (Array.from(body).length < 2) {
          commentStatus.textContent = "请至少输入 2 个字。";
          textarea.focus();
          return;
        }
        busy = true;
        submit.disabled = true;
        textarea.readOnly = true;
        cancel.disabled = true;
        compose.disabled = true;
        try {
          await rpc<string>(
            "polar_comment_submit",
            {
              p_post: post,
              p_parent: replyTo,
              p_body: body,
              p_request: requestId,
            },
            signal
          );
          if (signal.aborted) return;
          textarea.value = "";
          replyTo = null;
          requestId = crypto.randomUUID();
          form.hidden = true;
          setTabValue(draftKey, null);
          compose.disabled = false;
          compose.focus();
          await load(
            false,
            "你的观测已送达。记录者确认后，它会出现在这片冰原上。"
          );
        } catch (error) {
          if (!signal.aborted)
            commentStatus.textContent = errorText(
              error,
              "观测未能送达。草稿已保留，请重试。"
            );
        } finally {
          busy = false;
          submit.disabled = false;
          textarea.readOnly = false;
          cancel.disabled = false;
          compose.disabled = false;
        }
      },
      { signal }
    );

    void loadIce();
    watchSession(signal, session => {
      const next = session?.user.id ?? null;
      if (next === user) return;
      const first = user === undefined;
      user = next;
      rows = [];
      list.replaceChildren();
      commentCount.textContent = "";
      more.hidden = true;
      logout.hidden = !user;
      if (!user) {
        if (!form.hidden && !busy) saveDraft();
        form.hidden = true;
      }
      if (user && first && oauth === "success") editor(replyTo, true);
      void load(
        false,
        first && oauth === "failure"
          ? "登录未完成，草稿已保留，可以重新尝试。"
          : ""
      );
    });
  }
}

if (!customElements.get("polar-observations"))
  customElements.define("polar-observations", PolarObservations);
