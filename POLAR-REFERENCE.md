# Reference map refinement

## Source and treatment

User-provided image: codex-clipboard-450baa57-32e4-4602-b9ec-625d5347e827.png, copied unchanged to src/assets/polar-reference.png. Original author, geographical dataset and external license were not supplied; no claim of public-domain status, MIT coverage or surveying accuracy is made. Supplied by the user for this implementation.

Astro Image produces responsive WebP variants at 640, 960 and 1440 pixels. Full square composition is preserved without cropping. CSS reduces saturation/contrast, slightly lifts brightness and fades outer ocean edges into the page. The reference geometry and relief remain intact; no generated contour map remains.

## Files

- src/assets/polar-reference.png: supplied source.
- src/components/PolarMap.astro: responsive image plus existing five interactive nodes and dialog behavior; explicit accessible names for primary links.
- src/styles/polar.css: larger image stage, image treatment, percentage node positions, quiet ring opacity animation, readable mobile labels and 18px desktop introduction.
- POLAR-REFERENCE.md: this record.

## Interaction

The square stage anchors node centers at percentage coordinates. Nodes retain 48px hit targets independent of image scale. Image layers have pointer-events:none. Primary labels remain hidden until hover/focus, with a 300ms transition and a bridge to the hover panel. Mobile displays names explicitly. Hidden dialogs retain close buttons, Escape and focus return. Only ring opacity breathes; the image never rotates, scales or shifts. Motion pauses when hidden, unfocused or offscreen, and is disabled for touch/mobile and reduced motion.

## Verification and preview

Dependency install, lint, format check and build passed during this iteration. Real headless Edge checked all three hover/focus panels, moving onto panels, all three destination navigations, theme persistence and mobile discovery close buttons. Captured 1366px, 1920px and 390px screenshots outside the repo in E:/BLOG/reference-*.png. Physical touch hardware and other browser engines were not tested.

Run npm.cmd run dev in the repository, then open http://127.0.0.1:4321. Changes remain on feat/polar-explorer-v2-beta; no deployment or main merge.
