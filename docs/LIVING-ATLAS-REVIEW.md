# Living Atlas visual review

Feature branch: `feat/polar-living-atlas`. Review before merging; GitHub Pages deployment remains limited to main.

## Visual system

- A new masthead pairs the Polar Explorer wordmark with a small meridian symbol and Chinese identity line. The existing atlas headline and introduction remain; a shared bilingual serif title family creates an identifiable cover rhythm.
- Home chapters use an anchored introduction and two-column regional folios, followed by a vertical chronological journal. Each region has an original, code-native line symbol: valley, station, port or open coordinate. These are illustrative symbols, not geographic data or external assets.
- Regional pages share an indexed folio with the symbol, bilingual name, configured color, actual location description and NOAA locator plate. Station 1810 remains explicitly fictional; the pole remains undefined.
- Article covers combine the regional identity, title, original description and map of origin. Short titles receive greater scale based on title length, consistently across regions. Titles use a shared bilingual serif stack, while body text, navigation and metadata use the existing sans-serif stack. English labels no longer switch arbitrarily to italic Georgia. There are no additional font downloads. The secondary rail provides a regional note and heading navigation where available.
- The main journal archive now shares the same record language rather than falling back to the default list. Observer uses a bilingual identity cover and a slow meridian seal alongside the original writing.
- Unclassified articles retain a neutral cover without an empty map column.

## Default motion

- The ocean-edge wash alternates over 24 seconds, opacity 0.08–0.43 with a very small transform. It overlays the outer ocean; the source relief and geographic anchors remain stationary.
- The four existing beacon rings expand and fade over the opening 32% of their staggered 9–12.9-second cycles. Their peak opacity is 0.62, making the signal visible at normal viewing scale. The existing boat halo has a separate 10.5-second cycle. There is no additional independent About point.
- Secondary maps animate only their current marker, on a 9-second cycle. Observer meridian arcs rotate over 50 seconds.
- Ambient surfaces pause offscreen, and document visibility pauses all ambient keyframes. ClientRouter teardown disconnects observers. Reduced-motion CSS disables these keyframes, and the existing boat arrival reduced-motion behavior is unchanged.
- Ambient effects use opacity/transform with no per-frame JavaScript or added dependencies.

## Content and functionality

The NOAA asset, map positions, boat component and flight, original article bodies, Observer Markdown, Pages CMS configuration, analytics and Markdown/MDX rendering pipeline are unchanged. Eighteen retained AstroPaper samples use `sample: true`; the shared publication filter excludes them from public routes, lists, feeds, search and OG generation without deleting their source. Draft and scheduling behavior remains intact.

## Validation

- Frozen-lockfile installation, lint, formatting check and full build.
- Astro checks 67 files with zero diagnostics; 18 static pages, three original articles indexed by Pagefind.
- Chrome desktop inspection of home, all regional folios, original articles, journal archive and Observer, including light/dark appearance and ClientRouter navigation.
- Responsive smoke checks in a 390px iframe; keyboard activation of the boat remains an Observer link.
- Motion is checked using live computed styles at different moments, not merely the presence of CSS animation declarations.

Physical phones, Edge and OS-level reduced-motion preference switching are outside this environment's exercised coverage. The reduced-motion rules are inspected in source. Title font appearance depends on the installed local Chinese serif font; the supplied stack intentionally avoids a large webfont download.
