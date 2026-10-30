"""Project region anchors to the unchanged ETOPO image. Run from repository root."""
import json
from pathlib import Path
from pyproj import Transformer
transformer = Transformer.from_crs('EPSG:4326', 'EPSG:3031', always_xy=True)
# Dry Valleys is a representative regional location, not a surveyed single site.
# Inaccessibility uses the requested approximate 83S/55E definition; others exist.
coordinates = {'dry-valleys': (162, -77), 'port-lockroy': (-63.5, -(64+49/60)), 'inaccessibility': (55, -83)}
result = {}
for name, (longitude, latitude) in coordinates.items():
    x,y = transformer.transform(longitude, latitude)
    result[name] = dict(longitude=longitude, latitude=latitude, x=x, y=y, left=(x+3400000)/6800000*100, top=(3400000-y)/6800000*100)
# Fictional station: aesthetic anchor only, no claimed real-world coordinates.
result['station-1810'] = dict(left=72, top=57)
Path('src/data/region-positions.json').write_text(json.dumps(result, indent=2)+'\n')
