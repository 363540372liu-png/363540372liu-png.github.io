# GitHub projects on Polar Explorer

## Current integration

- **Selected, not imported wholesale.** Only the two explicitly listed public repositories in `src/utils/getProjects.ts` appear on the projects page and in the homepage projects chapter.
- **Updated automatically at build time.** `getProjects()` calls the public GitHub repository API for each selection. The last code-push timestamp (`pushed_at`) and primary language are shown when GitHub returns them.
- **Daily refresh.** `.github/workflows/deploy.yml` runs at 03:23 UTC each day (11:23 Taipei time), as well as on pushes to `main` or manual `workflow_dispatch`. This rebuilds and redeploys the static Astro site with refreshed metadata; it does **not** trigger on every GitHub push to the selected repositories.
- **Controlled descriptions.** Project titles, descriptions, tags, completion states and detail links are maintained manually in the `selectedProjects` array. No claims are inferred from README contents at build time. Current descriptions were checked against the selected repositories' README files when the integration was created.
- **Safe fallbacks.** An API timeout, rate limit or transient error still renders each curated project, without fabricated metadata. A repository explicitly reported as deleted/private (404) is suppressed; projects confirmed private or mismatched are also suppressed.
- **No browser API calls.** The API fetch takes place during static build, not when a visitor opens the site. If `GITHUB_TOKEN` is present in GitHub Actions, it is used server-side only and never embedded in generated HTML.

## Updating what is shown

Edit `selectedProjects` in `src/utils/getProjects.ts`. Each entry lists the GitHub repository name (`repo`) and a human-curated `title`, `description`, `status`, `category`, `tags` and optional repository-relative `detailPath`. Add a repository only after reviewing its visibility and quality.

The homepage and `/projects/` both use the same `getProjects()` function, so they cannot drift apart.

## Rebuild and verify

1. `pnpm install --frozen-lockfile`
2. `pnpm run lint`
3. `pnpm run format:check`
4. `pnpm run build`
5. Visit `/projects/` and the homepage projects section; test the links and review dates.
6. Use **Actions → Deploy Astro blog to GitHub Pages → Run workflow** to refresh metadata immediately after a repository update, without editing blog source.

Daily scheduled runs can be delayed or skipped by GitHub Actions; they are not a real-time webhook sync. The project descriptions and previews do not update from the API unless you explicitly edit them.
