"""Citywide geometry checks on the built map (no photos needed):

  python check_geometry.py ../../www/map out.json

- buildings standing on a carriageway (they block driving: width estimate or data error)
- walls still crossing a carriageway
- bus stops / crossing signs / gates placed on a carriageway
- taxi kerbs: is the passenger's kerb point free of buildings on every stop-legal street?
Each finding has the district-independent position (game x/z and lat/lon) so it can be looked up.
"""
import sys, json, glob, os, math
from collections import Counter, defaultdict
from shapely.geometry import LineString, Polygon, Point
from shapely.strtree import STRtree

MAP, OUT = sys.argv[1], sys.argv[2]
a, b, c, d = 83688.15960, -21.21882, -1.1002137, -111050.703
def lonlat(x, z):
    det = a * d - b * c; x0, z0 = x + 5797037.69, z - 4587580.68
    return round((d * x0 - b * z0) / det, 6), round((-c * x0 + a * z0) / det, 6)

roads, blds, walls, objs = [], [], [], []
for f in glob.glob(os.path.join(MAP, 'cells', '*.json')):
    cl = json.load(open(f))
    for r in cl['r']:
        kind, width, flags, layer, name, flat = r[:6]
        pts = list(zip(flat[0::2], flat[1::2]))
        if len(pts) >= 2 and not flags & 4: roads.append((LineString(pts), width, kind, flags, name))
    for bb in cl['b']:
        h, typ, _, _, flat = bb
        if typ == 7: continue          # canopies: you drive under them
        pts = list(zip(flat[0::2], flat[1::2]))
        if len(pts) >= 3:
            p = Polygon(pts).buffer(0)
            if not p.is_empty: blds.append((p, h))
    for w in cl.get('w', []):
        pts = list(zip(w[2][0::2], w[2][1::2]))
        if len(pts) >= 2: walls.append((LineString(pts), w[1]))
    for o in cl['o']:
        objs.append(o)
print('roads', len(roads), 'buildings', len(blds), 'walls', len(walls), 'objects', len(objs))

# carriageway polygons (centre line buffered by half the width, minus a 0.5 m tolerance)
carr = [ln.buffer(max(0.8, w / 2 - 0.5), cap_style=2) for ln, w, k, fl, nm in roads]
ctree = STRtree(carr)
out = {'buildings_on_carriageway': [], 'walls_on_carriageway': [], 'objects_on_carriageway': Counter(), 'objects_on_carriageway_list': [], 'summary': {}}

# buildings blocking a carriageway: overlap area > 4 m² (a real obstruction, not a touching corner)
for p, h in blds:
    for k in ctree.query(p):
        if roads[k][3] & 2: continue    # bridges pass over buildings / other roads
        inter = p.intersection(carr[k]).area
        if inter > 4:
            cx, cz = p.centroid.x, p.centroid.y
            out['buildings_on_carriageway'].append({'x': round(cx), 'z': round(cz), 'lonlat': lonlat(cx, cz), 'overlap_m2': round(inter, 1), 'street': roads[k][4], 'road_width': roads[k][1]})
            break
for ln, h in walls:
    for k in ctree.query(ln):
        if roads[k][3] & 2: continue
        inter = ln.intersection(carr[k]).length
        if inter > 1.5:
            m = ln.interpolate(ln.project(carr[k].centroid))
            out['walls_on_carriageway'].append({'x': round(m.x), 'z': round(m.y), 'lonlat': lonlat(m.x, m.y), 'length_m': round(inter, 1), 'street': roads[k][4]})
            break
for o in objs:
    if o[0] in ('signal', 'zebra', 'door', 'metro', 'entrance'): continue    # signals hang over the road; zebras are on it; entrance pavilions are checked by hand
    p = Point(o[2], o[3])
    for k in ctree.query(p):
        if carr[k].contains(p):
            out['objects_on_carriageway'][o[0]] += 1
            if len(out['objects_on_carriageway_list']) < 40: out['objects_on_carriageway_list'].append({'type': o[0], 'name': o[1], 'x': o[2], 'z': o[3], 'lonlat': lonlat(o[2], o[3]), 'street': roads[k][4]})
            break

# taxi kerbs: every stop-legal street (not main roads / bridges / tunnels / roundabouts / private, width >= 5, length > 22),
# kerb points every 40 m on both sides: is the pavement there free of buildings?
btree = STRtree([p for p, h in blds])
legal = [(ln, w) for ln, w, k, fl, nm in roads if k <= 1 and not fl & (2 | 4 | 8 | 32) and w >= 5 and ln.length > 22]
kerbs = blocked = 0
for ln, w in legal:
    L = ln.length
    for s in [x for x in range(9, int(L) - 9, 40)]:
        p = ln.interpolate(s); q = ln.interpolate(min(L, s + 1))
        dx, dz = q.x - p.x, q.y - p.y; l = math.hypot(dx, dz) or 1
        for sd in (1, -1):
            kx, kz = p.x - dz / l * (w / 2 + 1.2) * sd, p.y + dx / l * (w / 2 + 1.2) * sd
            kerbs += 1
            kp = Point(kx, kz)
            if any(blds[i][0].contains(kp) for i in btree.query(kp)): blocked += 1
out['summary'] = {
    'buildings_on_carriageway': len(out['buildings_on_carriageway']),
    'walls_on_carriageway': len(out['walls_on_carriageway']),
    'objects_on_carriageway': dict(out['objects_on_carriageway']),
    'taxi_kerb_points_checked': kerbs, 'taxi_kerb_points_inside_buildings': blocked,
}
out['objects_on_carriageway'] = dict(out['objects_on_carriageway'])
json.dump(out, open(OUT, 'w'), ensure_ascii=False, indent=1)
print(json.dumps(out['summary'], ensure_ascii=False))
