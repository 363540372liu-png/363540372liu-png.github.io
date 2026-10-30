// One lifecycle for each ClientRouter page; no animation framework or scroll loop.
let dispose: (() => void) | undefined;
let homeEntered = false;
function initMotion() {
  dispose?.();
  const controller = new AbortController();
  const { signal } = controller;
  const syncVisibility = () =>
    document.documentElement.classList.toggle(
      "motion-suspended",
      document.hidden
    );
  syncVisibility();
  document.addEventListener("visibilitychange", syncVisibility, { signal });
  const reduce = matchMedia("(prefers-reduced-motion: reduce)");
  const pending = new Set<HTMLElement>();
  const intro = document.querySelector<HTMLElement>("[data-region-intro]");
  const home = document.querySelector<HTMLElement>(".polar-home");
  if (home && !homeEntered && !reduce.matches) {
    home.classList.add("home-enter");
    homeEntered = true;
  }
  if (intro && !reduce.matches) intro.classList.add("region-enter");
  const observer = new IntersectionObserver(
    entries => {
      for (const entry of entries)
        if (entry.isIntersecting) {
          const el = entry.target as HTMLElement;
          el.classList.remove("reveal-pending");
          pending.delete(el);
          observer.unobserve(el);
        }
    },
    { threshold: 0.12 }
  );
  if (!reduce.matches)
    document
      .querySelectorAll<HTMLElement>("[data-reveal]")
      .forEach((el, index) => {
        // Visible content never disappears while the script starts. No JS = no hidden classes.
        if (el.getBoundingClientRect().top >= innerHeight) {
          el.style.setProperty(
            "--reveal-delay",
            Math.min((index % 4) * 60, 180) + "ms"
          );
          el.classList.add("reveal-pending");
          pending.add(el);
          observer.observe(el);
        }
      });
  const revealAll = () => {
    if (reduce.matches) {
      pending.forEach(el => el.classList.remove("reveal-pending"));
      pending.clear();
      observer.disconnect();
      home?.classList.remove("home-enter");
      intro?.classList.remove("region-enter");
    }
  };
  reduce.addEventListener("change", revealAll, { signal });
  const article = document.querySelector<HTMLElement>("#article");
  const progress = document.querySelector<HTMLElement>(
    "#reading-progress-fill"
  );
  const headings = Array.from(
    article?.querySelectorAll<HTMLElement>("h2[id],h3[id]") ?? []
  );
  const tocLinks = Array.from(
    document.querySelectorAll<HTMLAnchorElement>(
      '#article a[href^="#"]:not(.heading-link), .reading-toc a[href^="#"]'
    )
  ).filter(link =>
    headings.some(h => "#" + h.id === link.getAttribute("href"))
  );
  let frame = 0;
  const updateReading = () => {
    frame = 0;
    if (!article || !progress || document.hidden) return;
    const box = article.getBoundingClientRect();
    const denominator = Math.max(1, article.offsetHeight - innerHeight);
    const fraction = Math.max(0, Math.min(1, -box.top / denominator));
    progress.style.transform = "scaleX(" + fraction + ")";
    const active =
      headings.filter(h => h.getBoundingClientRect().top <= 144).at(-1) ??
      headings[0];
    tocLinks.forEach(link => {
      if (active && link.getAttribute("href") === "#" + active.id)
        link.setAttribute("aria-current", "location");
      else link.removeAttribute("aria-current");
    });
  };
  const schedule = () => {
    if (!frame && !document.hidden)
      frame = requestAnimationFrame(updateReading);
  };
  if (article) {
    addEventListener("scroll", schedule, { passive: true, signal });
    addEventListener("resize", schedule, { signal });
    document.addEventListener("visibilitychange", schedule, { signal });
    updateReading();
  }
  // Keyboard focus must never land in a visually hidden scroll-reveal item.
  document.addEventListener(
    "focusin",
    event => {
      const el = (event.target as Element)?.closest<HTMLElement>(
        ".reveal-pending"
      );
      if (el) {
        el.classList.remove("reveal-pending");
        pending.delete(el);
        observer.unobserve(el);
      }
    },
    { signal }
  );
  dispose = () => {
    controller.abort();
    observer.disconnect();
    cancelAnimationFrame(frame);
    pending.forEach(el => el.classList.remove("reveal-pending"));
  };
}
document.addEventListener("astro:page-load", initMotion);
document.addEventListener("astro:before-swap", () => dispose?.());
