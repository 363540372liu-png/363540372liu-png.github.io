"""Render independent NOAA ETOPO relief. See docs/NOAA-MAP.md."""
import argparse, hashlib, json, urllib.parse, urllib.request
from pathlib import Path
import numpy as np
import rasterio
from scipy.ndimage import gaussian_filter
from PIL import Image

SERVICE = 'https://gis.ngdc.noaa.gov/arcgis/rest/services/DEM_mosaics/DEM_all/ImageServer'
parser = argparse.ArgumentParser()
parser.add_argument('--cache', type=Path, required=True, help='External cache directory, not committed')
args = parser.parse_args()
args.cache.mkdir(parents=True, exist_ok=True)
params = dict(f='json', bbox='-3400000,-3400000,3400000,3400000', bboxSR=3031, imageSR=3031,
              size='2048,2048', format='tiff', pixelType='F32', noData=-99999,
              interpolation='RSP_BilinearInterpolation',
              mosaicRule=json.dumps({'mosaicMethod':'esriMosaicLockRaster','lockRasterIds':[2534]}),
              renderingRule=json.dumps({'rasterFunction':'None'}))
url = SERVICE + '/exportImage?' + urllib.parse.urlencode(params)
source = args.cache/'etopo-2022-surface-3031.tif'
if not source.exists():
    with urllib.request.urlopen(url, timeout=120) as response:
        result = json.load(response)
    if 'error' in result:
        raise RuntimeError(result)
    (args.cache/'export-response.json').write_text(json.dumps(result, indent=2))
    urllib.request.urlretrieve(result['href'], source)
with rasterio.open(source) as dataset:
    z = dataset.read(1)
    if dataset.count != 1 or dataset.crs.to_epsg() != 3031 or z.min() < -15000 or z.max() < 3000:
        raise ValueError('Unexpected raster; require raw projected elevations, not shaded imagery')
    print('Elevation range:', float(z.min()), float(z.max()), 'CRS:', dataset.crs)
    spacing = abs(dataset.transform.a)
# Two spatial scales retain real ice slopes and soften deep ocean relief.
fine = gaussian_filter(z, .65)
coarse = gaussian_filter(z, 2.2)
dy, dx = np.gradient(fine, spacing)
# Artistic vertical exaggeration, fixed illumination from upper left.
normal = np.stack([-dx*18, dy*18, np.ones_like(dx)], axis=-1)
normal /= np.linalg.norm(normal, axis=-1, keepdims=True)
light = np.array([-.5, -.5, .7071]); light /= np.linalg.norm(light)
shade = np.clip(normal @ light, 0, 1)
detail = np.clip((fine-coarse)/110, -.22, .22)
land = z >= 0
sea_depth = np.clip(-z/6500, 0, 1)
sea = np.array([184,218,233])[None,None,:] - sea_depth[:,:,None]*np.array([30,27,19])
base = np.where(land[:,:,None], np.array([242,247,249]), sea)
strength = np.where(land, 85, 65)
rgb = np.clip(base + ((shade-.7071)*strength + detail*20)[:,:,None], 0, 255)
# Slight blue ambient tint in terrain shadows, no external imagery or artificial contours.
rgb = rgb.astype('uint8')
output = Path('src/assets/antarctica-etopo-2022.webp')
Image.fromarray(rgb).save(output, quality=92, method=6)
manifest = {'dataset':'ETOPO_2022_v1_60s_surface', 'source_service':SERVICE,
            'export_parameters':params, 'source_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),
            'output_sha256':hashlib.sha256(output.read_bytes()).hexdigest(),
            'pixel_size_metres':spacing, 'elevation_range_metres':[float(z.min()),float(z.max())]}
Path('scripts/maps/etopo-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(output, output.stat().st_size)
