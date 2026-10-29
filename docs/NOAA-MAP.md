# NOAA Antarctic relief map

## Source and license

NOAA NCEI, ETOPO 2022 Ice Surface, official 60 arc-second global model (a downsampled release of the 15 arc-second model).

- Product: https://www.ncei.noaa.gov/products/etopo-global-relief-model
- Official license metadata: https://www.ncei.noaa.gov/metadata/geoportal/rest/metadata/item/gov.noaa.ngdc.mgg.dem%3Aetopo_2022/html
- License: CC0-1.0, https://creativecommons.org/publicdomain/zero/1.0/
- Citation: NOAA National Centers for Environmental Information. 2022: ETOPO 2022 15 Arc-Second Global Relief Model. NOAA National Centers for Environmental Information. https://doi.org/10.25921/fd45-gt74. Accessed 2026-10-29.

The direct GeoTIFF host was unreachable from the processing machine. The official product's Grid Extract application provided the alternative NOAA ImageServer used here. Its Globals.js identifies the surface dataset and the service. A query confirmed object ID 2534 has Name ETOPO_2022_v1_60s_surface. Export locks that raster and explicitly disables rendering functions (None), returning one-band F32 elevation rather than a pre-rendered map. No other mosaic datasets are selected.

Official application: https://www.ncei.noaa.gov/maps/grid-extract/
Service: https://gis.ngdc.noaa.gov/arcgis/rest/services/DEM_mosaics/DEM_all/ImageServer

## Independent rendering

scripts/maps/render_etopo.py downloads raw projected elevations, checks raster type/range, computes normals and hillshade locally, and assigns ice-white and muted blue colors. EPSG:3031; extent -3400000,-3400000 to 3400000,3400000 metres; 2048 square pixels; bilinear interpolation. Two Gaussian scales soften the relief; artistic vertical exaggeration is 18. Land/ice is classified by nonnegative ice-surface elevation, not a separate authoritative coastline mask. The map is an artistic derivative, not a navigation product or official NOAA map. No NOAA logo is used.

The original commercial/reference image was not used as an input, traced, sampled, or processed. Existing page presentation filters and edge masks remain unchanged.

Reproduce from repository root with Python 3.12:

```powershell
python -m pip install -r scripts/maps/requirements.txt
python scripts/maps/render_etopo.py --cache ../noaa-data
```

The external cache contains the raw TIFF and export response. scripts/maps/etopo-manifest.json records request parameters, elevation range, pixel size and SHA256 checksums. The raw raster is not a frontend dependency or committed build artifact. Final source WebP is about 485 KiB; Astro provides smaller responsive variants. Cached TIFF is reused for deterministic rendering; delete it to request a fresh export.

## History and other asset audit

This branch starts at origin/main commit 70969f5eee48d125ca7ac20a48c00006422f5c22. V2 source files and the Inconsolata fonts were restored individually; old commits and the old image were not cherry-picked or merged. Old PR #2 and its branch remain for owner-directed follow-up. This clean PR does not erase material from those existing public refs.

New third-party assets: ETOPO numerical data (CC0-1.0), Inconsolata Regular/Bold (SIL OFL, bundled public/fonts/Inconsolata-OFL.txt). Existing AstroPaper source is under repository MIT license, retained intact. No new remote fonts, icons or images introduced.

Pre-existing main content includes AstroPaper example screenshots and a Forrest Gump quote image (src/assets/images/forrest-gump-quote.png, referenced in an existing template tutorial). No separate image-specific rights statement was found in the repository; do not infer that the code MIT license clears every depicted image. These pre-existing article assets were not deleted or replaced without owner approval. Their public-use rights remain a separate pre-release review item. This PR resolves the newly introduced Antarctic map source issue, not a certification of every historical article asset.

## Validation

Passed pnpm run lint, pnpm run format, pnpm run build: zero Astro diagnostics, 46 pages, 17 indexed pages. Headless Edge checked light/dark views, 1366px/1920px desktop, 390px mobile, three navigation destinations, hover/focus cards, two discovery dialogs, touch emulation and reduced motion. No physical touch-device or cross-engine validation was performed. Screenshots are outside the repository at E:/BLOG/noaa-*.png.
