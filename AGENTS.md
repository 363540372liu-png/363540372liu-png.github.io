# Polar Explorer development constraints

The user visually accepted the current Polar Explorer V2 homepage hero on 2026-10-29 (Asia/Shanghai). Treat the accepted version tagged `polar-explorer-v2-visual-baseline-2026-10-29` as the baseline for subsequent development.

## Protected homepage design

Preserve the Antarctic reference image, ocean texture, fading edges, five interactive nodes, Hero layout, palette and visual styles. Do not redesign the map or Hero while editing other pages unless the user explicitly confirms that change. Scope any necessary shared-style changes so the accepted homepage remains visually unchanged.

Relevant files:

- `src/assets/polar-reference.png`
- `src/components/PolarMap.astro`
- `src/styles/polar.css`
- `src/styles/theme.css`
- `src/pages/index.astro`

Retain primary-node navigation, discovery dialogs, keyboard access, mobile text navigation, reduced-motion behavior and saved theme choices. Preserve the Markdown article system, search, RSS, SEO and GitHub Pages configuration.

Do not merge into main or deploy production without explicit user authorization. Do not delete existing branches or overwrite the accepted baseline tag.
