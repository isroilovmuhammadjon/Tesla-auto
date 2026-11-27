"""Pass 1: pull everything the game needs for Tashkent out of the Geofabrik Uzbekistan extract
into a pickle (raw lon/lat geometry + tags). Run: python extract.py uzbekistan.osm.pbf out.pkl"""
import sys, pickle, osmium
from shapely.geometry import Polygon, MultiPolygon

BBOX = (69.02, 41.12, 69.56, 41.50)   # generous box around Tashkent city; clipped to the boundary later
def inb(lon, lat): return BBOX[0] <= lon <= BBOX[2] and BBOX[1] <= lat <= BBOX[3]

DRIVE = {'motorway', 'motorway_link', 'trunk', 'trunk_link', 'primary', 'primary_link', 'secondary', 'secondary_link',
         'tertiary', 'tertiary_link', 'unclassified', 'residential', 'living_street', 'service', 'road'}
KEEP_TAGS = ('name', 'name:uz', 'name:uz-Latn', 'name:ru', 'name:en', 'highway', 'oneway', 'junction', 'lanes', 'layer',
             'bridge', 'tunnel', 'service', 'access', 'motor_vehicle', 'building', 'building:levels', 'height',
             'amenity', 'shop', 'railway', 'station', 'public_transport', 'bus', 'ref', 'admin_level', 'boundary',
             'place', 'tourism', 'historic', 'leisure', 'landuse', 'religion', 'man_made', 'office', 'barrier', 'colour',
             'building:colour', 'roof:colour', 'natural', 'waterway', 'water', 'subway', 'level', 'covered', 'area')

def tags(o): return {k: o.tags[k] for k in KEEP_TAGS if k in o.tags}

def rings(a):
    polys = []
    for outer in a.outer_rings():
        sh = [(n.lon, n.lat) for n in outer]
        holes = [[(n.lon, n.lat) for n in inner] for inner in a.inner_rings(outer)]
        if len(sh) >= 4: polys.append((sh, holes))
    return polys

class H(osmium.SimpleHandler):
    def __init__(s):
        super().__init__()
        s.nodes, s.ways, s.areas = [], [], []
    def node(s, n):
        if not n.location.valid() or not inb(n.location.lon, n.location.lat): return
        t = n.tags
        if ('highway' in t and t['highway'] in ('bus_stop', 'traffic_signals', 'crossing', 'stop')) or 'public_transport' in t \
           or 'railway' in t or 'amenity' in t or 'shop' in t or 'place' in t or 'tourism' in t or 'historic' in t or 'man_made' in t or 'office' in t:
            s.nodes.append((n.id, n.location.lon, n.location.lat, tags(n)))
    def way(s, w):
        hw = w.tags.get('highway')
        rail = w.tags.get('railway')
        if hw not in DRIVE and rail not in ('subway', 'rail', 'tram') and 'waterway' not in w.tags and 'barrier' not in w.tags: return
        try: pts = [(n.ref, n.lon, n.lat) for n in w.nodes]
        except osmium.InvalidLocationError: return
        if not any(inb(lon, lat) for _, lon, lat in pts): return
        s.ways.append((w.id, pts, tags(w)))
    def area(s, a):
        t = a.tags
        want = 'building' in t or t.get('boundary') == 'administrative' or 'place' in t or 'landuse' in t or 'leisure' in t \
            or 'amenity' in t or 'natural' in t or 'water' in t or 'shop' in t or 'tourism' in t or 'historic' in t or 'railway' in t
        if not want: return
        try: r = rings(a)
        except Exception: return
        if not r: return
        if t.get('boundary') != 'administrative' and not any(inb(*p) for p in r[0][0][:1]): return
        s.areas.append((a.orig_id(), a.from_way(), r, tags(a)))

h = H()
h.apply_file(sys.argv[1], locations=True, idx='flex_mem')
print('nodes', len(h.nodes), 'ways', len(h.ways), 'areas', len(h.areas))
pickle.dump({'nodes': h.nodes, 'ways': h.ways, 'areas': h.areas}, open(sys.argv[2], 'wb'))
