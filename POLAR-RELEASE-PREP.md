# Polar Explorer V2 release preparation

Prepared on 2026-10-29 (Asia/Shanghai) from the user-accepted visual baseline.

- Development branch: feat/polar-explorer-v2-beta.
- Preserved recovery tag: polar-explorer-v2-visual-baseline-2026-10-29.
- Accepted archive commit: eb6f1c1b64939ca8a1c3291671558341a3aa80a2.
- This preparation changes documentation only. Map, Hero, article content and deployment configuration are preserved.

## Checks

pnpm run lint, pnpm run format:check and pnpm run build passed. Astro checked 59 files with zero diagnostics, generated 46 pages, and Pagefind indexed 17 pages.

The reference PNG, interactive map component and styling are tracked in Git. node_modules, dist and generated Pagefind assets are excluded. No source article or GitHub Pages workflow is deleted.

## Before public release

The owner must confirm permission to publish and distribute the Antarctic reference image (src/assets/polar-reference.png), including any attribution requirements. Its original author and public-use license have not been established. See POLAR-REFERENCE.md for provenance.

Review the pull request before deciding to merge. The existing Pages workflow runs on main pushes; creating or pushing this development branch does not invoke that production trigger. No merge or production deployment is authorized as part of preparation.

The baseline can be restored on a new branch with:

```powershell
git switch -c restore/polar-v2-baseline polar-explorer-v2-visual-baseline-2026-10-29
```
