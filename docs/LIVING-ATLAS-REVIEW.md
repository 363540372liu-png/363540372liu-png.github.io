# Living Atlas visual review

Based on main `5eaa155a79eaf5a2feb40a6c76fb4aac51b2d2f4`. Review on the feature branch before merging.

## Changes

- Home region entries use fine rules, shared regional colors, existing location descriptions and actual published record counts. Journal entries use typography instead of placeholder images. The Observer section and identity page share the same quiet archive language.
- All four region pages share one template. The region configuration supplies the symbol, color, English name, location, record label and short motto. Station 1810 remains explicitly fictional. The unassigned pole remains open in meaning.
- Articles retain the existing editorial grid, reading progress, heading navigation, Markdown/MDX, code and formula pipeline. Region maps and notes support the text; body typography and headings are refined. Unclassified posts retain the neutral fallback.
- Ambient ocean light alternates gently over 28 seconds. Existing four beacon rings have periods of 9, 10.3, 11.6 and 12.9 seconds with negative staggered delays. The existing boat halo breathes every 12.7 seconds; the boat itself is unchanged. Only the current region marker appears on secondary maps, with a 13-second ring.
- Ambient animation pauses offscreen and in hidden documents. ClientRouter teardown disconnects observers. Reduced-motion CSS disables ambient keyframes; existing boat reduced-motion behavior is retained. No per-frame ambient JS or new dependencies.
- Eighteen retained AstroPaper samples receive `sample: true`. The shared publication filter hides them from public article routes, lists, RSS, tags, search and OG generation. Original article bodies and sample bodies are unchanged. Draft and scheduling behavior remains intact. Pages CMS configuration is unchanged.

## Validation

- `pnpm install --frozen-lockfile`: passed.
- `pnpm run lint`: passed.
- `pnpm run format:check`: passed.
- `pnpm run build`: passed; Astro checked 65 files with zero errors/warnings/hints; 18 static pages, three original articles indexed by Pagefind.
- Chrome desktop: inspected homepage, all four regions, article and Observer. Verified article-to-region navigation and ClientRouter navigation, and light/dark Observer appearance.
- Read live computed CSS: homepage atmosphere running; all four beacon periods/delays differ; current secondary-map marker running.
- 390px iframe (375px content area after scrollbar): homepage and article have no horizontal overflow. This is a responsive smoke check, not physical-phone testing.
- Original post bodies, Observer source, NOAA map asset and boat component verified unchanged. Temporary QA harness and local allowed-host setting removed.

## Review limits

Physical mobile devices, Edge and OS reduced-motion preference switching were not exercised in this environment. Reduced-motion coverage was inspected in the CSS and existing boat code. Please review the deliberately subtle ambient intensity on your own display; it should remain secondary to the map and writing.
