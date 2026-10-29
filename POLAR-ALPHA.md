# Polar Explorer V2 Alpha

Branch: feat/polar-explorer-v2-alpha. No production deployment.

## Editing

- src/pages/index.astro: homepage copy and editorial sections.
- src/components/PolarMap.astro: original illustrative Antarctic silhouette and contour layers; not surveyed geography or elevation data. Created for this repository, under its existing MIT license. No third-party map assets.
- src/data/polar.ts: explicitly labeled discovery and project placeholders.
- src/pages/projects.astro: project listing.
- src/styles/polar.css: responsive layout and reduced-motion support.
- src/styles/theme.css: light/dark palette and system sans-serif fallback.
- src/components/Header.astro: project navigation and brand.

Original Markdown files, search, RSS, SEO and deployment workflows remain in place. Homepage labels existing tutorial articles as template examples. Current dependencies use Astro 7; no framework upgrade was performed.

## Preview

Run pnpm install --frozen-lockfile, then pnpm dev. Production preview: pnpm build then pnpm preview.

## Limitations

Map contours are artistic, not real terrain. Replace placeholder projects and discoveries with owner-provided information. Manrope is used only if installed locally, with Chinese system sans-serif fallback. Browser visual and touch QA remain necessary before release.

## Build font

Dynamic OG rendering uses locally bundled Inconsolata Regular and Bold from https://github.com/google/fonts/tree/main/ofl/inconsolata/static under the SIL Open Font License (public/fonts/Inconsolata-OFL.txt). The existing internal Google Sans Code alias is retained for compatibility with the OG templates. Removed remote font preload from Layout; code uses system monospace.

## Validation

pnpm install --frozen-lockfile, pnpm run lint, pnpm run format:check and pnpm run build all passed. Astro checked 59 files with no diagnostics; built 46 pages; Pagefind indexed 17 pages. Build copy command now uses Node for Windows/Linux portability. Browser screenshot and touch testing were not performed.

