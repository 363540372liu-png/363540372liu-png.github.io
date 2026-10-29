# Polar Explorer V2 Beta

Based on Alpha commit abd2e5c, on feat/polar-explorer-v2-beta.

## Diagnosis

Alpha primary labels were always at opacity .7; hover only changed them to 1. The ring used an immediate box-shadow change and had no equivalent focus response. No overlay obstruction was apparent in source. The map only had an entrance animation, no ongoing local reflection. Its 32 contours were scaled copies of the same jagged coastline.

## Changes

- src/components/PolarMap.astro: two independently shaped contour regions, separate reflection layer, descriptive primary labels, exploration hint, visibility/focus/intersection-based animation pause with navigation cleanup. Existing discovery dialog logic retained.
- src/styles/polar.css: 48px targets, quiet 24px markers, 300ms hover/focus panels and ring expansion, hoverable panel bridge, mobile labels, reduced motion and slow local reflection. Chinese introduction raised to 16px with stronger contrast.
- src/scripts/theme.ts and src/layouts/Layout.astro: light default; preserve saved theme and do not override it on system theme changes.
- src/pages/index.astro: Beta version label.

All map geometry remains original artistic illustration, not measured geography. No new external assets or dependencies.

## Validation

All passed: pnpm install --frozen-lockfile; pnpm run lint; pnpm run format:check; pnpm run build. Astro: 59 files, zero diagnostics; 46 pages generated; Pagefind: 17 pages indexed.

Real headless Microsoft Edge through Playwright: primary hover opacity, keyboard focus feedback, pointer movement onto information panel, all three destination navigations, returning to homepage, both discovery dialogs and Escape, mobile close buttons, saved dark theme, default light with dark OS preference, reduced-motion animation disabled, 390px no horizontal overflow. Screenshots captured at 1366px, 1920px and 390px in E:/BLOG/beta-*.png, outside the repository.

Limitations: mobile checks use viewport emulation rather than a physical touch device. No formal frame-time profiling or cross-browser Safari/Firefox testing. Artistic terrain and subtle reflection still need owner aesthetic acceptance; no claim of exact map fidelity or measured paper texture.

## Preview

From the repository directory run npm.cmd run dev, then open http://127.0.0.1:4321. pnpm dev is also supported where pnpm is on PATH. No deployment or merge performed.
