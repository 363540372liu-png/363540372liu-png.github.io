# Accepted Polar Explorer V2 baseline

Accepted by the user: 2026-10-29 (Asia/Shanghai).
Branch: feat/polar-explorer-v2-beta.
Tag: polar-explorer-v2-visual-baseline-2026-10-29.
Visual implementation commit: 7507c8ccbc807b50e1b749f2709890ccc69a67aa.

The tag points to the archival commit including this record and AGENTS.md. No visual or application code was changed during archiving. The reference image is tracked in Git; generated files and node_modules are excluded. The asset provenance is documented in POLAR-REFERENCE.md.

## Restore safely

Create a new branch from the tag (requires a clean worktree):

```powershell
git switch -c restore/polar-v2-baseline polar-explorer-v2-visual-baseline-2026-10-29
```

Or create a separate checkout without disturbing current work:

```powershell
git worktree add ../polar-v2-baseline -b restore/polar-v2-baseline polar-explorer-v2-visual-baseline-2026-10-29
```

Choose one method; use a different branch name if it already exists.

Install locked dependencies with pnpm install --frozen-lockfile. In the existing checkout dependencies are already installed: run npm.cmd run dev to preview, or npm.cmd run build followed by npm.cmd run preview.

The baseline tag and archival commit are local. No remote push, merge or production deployment is part of this archive operation.

## Archive validation

pnpm run build passed on 2026-10-29: 59 files checked with zero errors/warnings, 46 pages generated, and 17 pages indexed by Pagefind.

