"""District-by-district audit of the Tashkent map: what OSM has, what the game draws and routes on,
and where the network or the street scene is incomplete.

  python audit.py raw2.pkl ../../www/map out.json

Counts are from OpenStreetMap (ODbL). "Verified" means: present as data in OSM. Street-level
appearance (facades, colours, shop fronts) is NOT verified by this script: it would need dated,
lawfully reusable street-level photos per segment, which the map data does not contain.
"""
import sys, json, math, pickle, glob, os
from collections import defaultdict, Counter
from shapely.geometry import Polygon, Point, LineString
from shapely.ops import unary_union
from shapely.prepared import prep
from shapely.strtree import STRtree

RAW, MAP, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
d = pickle.load(open(RAW, 'rb'))
def P(lon, lat): return (83688.15960 * lon - 21.21882 * lat - 5797037.69, -1.1002137 * lon - 111050.703 * lat + 4587580.68)
def geom(rings): return unary_union([Polygon(sh, holes).buffer(0) for sh, holes in rings])
CITY = geom(next(a for a in d['areas'] if a[0] == 2216724 and not a[1])[2])
IN = prep(CITY)
districts = []
for a in d['areas']:
    t = a[3]
    if t.get('boundary') == 'administrative' and t.get('admin_level') == '6':
        g = geom(a[2])
        if IN.contains(g.representative_point()): districts.append((t.get('name:uz') or t.get('name'), prep(g), g))
districts.sort(key=lambda x: x[0])
def dist_of(lon, lat):
    p = Point(lon, lat)
    for i, (n, pg, g) in enumerate(districts):
        if pg.contains(p): return i
    return -1

DRIVE = {'motorway', 'motorway_link', 'trunk', 'trunk_link', 'primary', 'primary_link', 'secondary', 'secondary_link',
         'tertiary', 'tertiary_link', 'unclassified', 'residential', 'living_street', 'service', 'road'}
MAJOR = {'motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'motorway_link', 'trunk_link', 'primary_link', 'secondary_link', 'tertiary_link'}
R = defaultdict(lambda: defaultdict(float))
C = defaultdict(Counter)
ways = []
for wid, pts, t in d['ways']:
    hw = t.get('highway')
    if hw not in DRIVE: continue
    if hw == 'service' and t.get('service') in ('parking_aisle', 'driveway', 'drive-through'): continue
    if t.get('area') == 'yes': continue
    xy = [P(lon, lat) for _, lon, lat in pts]
    inside = False
    for j in range(len(pts) - 1):
        mlon, mlat = (pts[j][1] + pts[j + 1][1]) / 2, (pts[j][2] + pts[j + 1][2]) / 2
        di = dist_of(mlon, mlat)
        if di < 0: continue
        inside = True
        L = math.hypot(xy[j + 1][0] - xy[j][0], xy[j + 1][1] - xy[j][1])
        R[di]['osm_km'] += L / 1000
        if hw in MAJOR:
            R[di]['major_km'] += L / 1000
            if 'lanes' in t: R[di]['major_lanes_km'] += L / 1000
            if 'turn:lanes' in t or 'turn:lanes:forward' in t: R[di]['turnlanes_km'] += L / 1000
        if t.get('oneway') in ('yes', '1', '-1') or t.get('junction') == 'roundabout': R[di]['oneway_km'] += L / 1000
        if t.get('bridge') not in (None, 'no'): R[di]['bridge_km'] += L / 1000
        if t.get('tunnel') not in (None, 'no'): R[di]['tunnel_km'] += L / 1000
        if 'name' not in t: R[di]['unnamed_km'] += L / 1000
    if inside: ways.append((wid, pts, t, xy))

# ---- connectivity of the OSM drivable network inside the city
adj = defaultdict(set)
node_pos = {}
for wid, pts, t, xy in ways:
    for j in range(len(pts) - 1):
        a, b = pts[j][0], pts[j + 1][0]
        adj[a].add(b); adj[b].add(a)
    for (n, lon, lat) in pts: node_pos[n] = (lon, lat)
comp = {}
comps = []
for s in adj:
    if s in comp: continue
    stack, mem = [s], []
    comp[s] = len(comps)
    while stack:
        x = stack.pop(); mem.append(x)
        for y in adj[x]:
            if y not in comp: comp[y] = len(comps); stack.append(y)
    comps.append(mem)
main = max(range(len(comps)), key=lambda i: len(comps[i]))
isolated = []
for i, mem in enumerate(comps):
    if i == main: continue
    lon = sum(node_pos[n][0] for n in mem) / len(mem); lat = sum(node_pos[n][1] for n in mem) / len(mem)
    di = dist_of(lon, lat)
    if di < 0: continue
    C[di]['isolated_nodes'] += len(mem)
    C[di]['isolated_groups'] += 1
    isolated.append((len(mem), di, round(lat, 5), round(lon, 5)))
isolated.sort(reverse=True)

# ---- crossings of two drivable ways at the same level without a shared node (a junction missing in the data, or a
# bridge / tunnel without tags): the game cannot turn there, which may or may not be how it is in reality
segs, meta = [], []
for wid, pts, t, xy in ways:
    if t.get('bridge') not in (None, 'no') or t.get('tunnel') not in (None, 'no') or t.get('layer', '0') != '0': continue
    for j in range(len(pts) - 1):
        segs.append(LineString([(pts[j][1], pts[j][2]), (pts[j + 1][1], pts[j + 1][2])]))
        meta.append((wid, pts[j][0], pts[j + 1][0], t.get('highway'), t.get('name', '')))
tree = STRtree(segs)
seen = set()
crossings = []
for i, s in enumerate(segs):
    for j in tree.query(s, predicate='crosses'):
        if j <= i: continue
        a, b = meta[i], meta[j]
        if a[0] == b[0]: continue
        if {a[1], a[2]} & {b[1], b[2]}: continue
        p = s.intersection(segs[j])
        if p.geom_type != 'Point': continue
        key = (a[0], b[0])
        if key in seen: continue
        seen.add(key)
        di = dist_of(p.x, p.y)
        if di < 0: continue
        C[di]['crossing_without_junction'] += 1
        if a[3] in MAJOR and b[3] in MAJOR: C[di]['major_crossing_without_junction'] += 1
        crossings.append((di, round(p.y, 5), round(p.x, 5), a[4] or a[3], b[4] or b[3]))

# ---- street scene data
for nid, lon, lat, t in d['nodes']:
    di = dist_of(lon, lat)
    if di < 0: continue
    hw = t.get('highway')
    if hw == 'bus_stop' or (t.get('public_transport') == 'platform' and t.get('bus') == 'yes'): C[di]['bus_stop_named' if t.get('name') else 'bus_stop_unnamed'] += 1
    if t.get('railway') == 'subway_entrance': C[di]['metro_entrance_ref' if t.get('ref') else 'metro_entrance_noref'] += 1
    if hw == 'traffic_signals': C[di]['signals'] += 1
    if hw == 'crossing': C[di]['ped_crossings'] += 1
    if t.get('natural') == 'tree': C[di]['trees'] += 1
    if 'entrance' in t: C[di]['entrances'] += 1
    if t.get('barrier') in ('gate', 'lift_gate', 'swing_gate', 'sliding_gate'): C[di]['gates'] += 1
    if 'traffic_sign' in t or hw in ('stop', 'give_way'): C[di]['traffic_signs'] += 1
    if 'shop' in t or 'amenity' in t: C[di]['pois'] += 1
for wid, pts, t in d['ways']:
    if t.get('barrier') in ('wall', 'fence', 'retaining_wall') or t.get('natural') == 'tree_row':
        lon, lat = pts[len(pts) // 2][1], pts[len(pts) // 2][2]
        di = dist_of(lon, lat)
        if di < 0: continue
        L = sum(math.hypot(*(a - b for a, b in zip(P(pts[j][1], pts[j][2]), P(pts[j + 1][1], pts[j + 1][2])))) for j in range(len(pts) - 1))
        R[di]['walls_km' if t.get('barrier') else 'tree_rows_km'] += L / 1000
for oid, fw, rings, t in d['areas']:
    if 'building' in t:
        sh = rings[0][0]; lon = sum(p[0] for p in sh) / len(sh); lat = sum(p[1] for p in sh) / len(sh)
        di = dist_of(lon, lat)
        if di < 0: continue
        C[di]['buildings'] += 1
        if 'height' in t or 'building:levels' in t: C[di]['buildings_height_mapped'] += 1
        if 'addr:housenumber' in t: C[di]['buildings_addressed'] += 1
        if 'building:colour' in t or 'building:material' in t: C[di]['buildings_material_mapped'] += 1
        if 'roof:shape' in t: C[di]['buildings_roof_mapped'] += 1
    elif t.get('landuse') or t.get('leisure') in ('park', 'garden', 'pitch', 'playground') or t.get('natural') in ('grass', 'wood', 'scrub', 'water'):
        sh = rings[0][0]; lon = sum(p[0] for p in sh) / len(sh); lat = sum(p[1] for p in sh) / len(sh)
        di = dist_of(lon, lat)
        if di >= 0: C[di]['landuse_areas'] += 1
restr = 0
for rid, mem, t in d.get('restr', []):
    restr += 1

# ---- what the game has (map/graph.json + cells)
g = json.load(open(os.path.join(MAP, 'graph.json')))
N = g['nodes']
def xy_to_lonlat(x, z):
    # invert the affine projection
    a, b, c, dd = 83688.15960, -21.21882, -1.1002137, -111050.703
    det = a * dd - b * c
    x0, z0 = x + 5797037.69, z - 4587580.68
    return ((dd * x0 - b * z0) / det, (-c * x0 + a * z0) / det)
for e in g['edges']:
    ax, az = N[2 * e[0]], N[2 * e[0] + 1]; bx, bz = N[2 * e[1]], N[2 * e[1] + 1]
    lon, lat = xy_to_lonlat((ax + bx) / 2, (az + bz) / 2)
    di = dist_of(lon, lat)
    if di >= 0: R[di]['graph_km'] += e[2] / 10000

out = {'source': 'OpenStreetMap (ODbL), Geofabrik Uzbekistan 2026-11-27', 'districts': [], 'turn_restrictions_in_extract': restr,
       'largest_isolated_groups': [{'nodes': n, 'district': districts[di][0], 'lat': la, 'lon': lo} for n, di, la, lo in isolated[:25]],
       'major_crossings_without_junction': [{'district': districts[c[0]][0], 'lat': c[1], 'lon': c[2], 'a': c[3], 'b': c[4]} for c in crossings[:60]]}
for i, (name, pg, gg) in enumerate(districts):
    r, c = R[i], C[i]
    out['districts'].append({
        'district': name,
        'roads': {'osm_drivable_km': round(r['osm_km'], 1), 'routable_km': round(r['graph_km'], 1), 'major_km': round(r['major_km'], 1),
                  'major_with_lane_count_pct': round(100 * r['major_lanes_km'] / max(1e-9, r['major_km'])),
                  'with_turn_lanes_km': round(r['turnlanes_km'], 1), 'oneway_km': round(r['oneway_km'], 1),
                  'bridge_km': round(r['bridge_km'], 2), 'tunnel_km': round(r['tunnel_km'], 2), 'unnamed_km': round(r['unnamed_km'], 1)},
        'connectivity': {'isolated_groups': c['isolated_groups'], 'isolated_nodes': c['isolated_nodes'],
                         'crossings_without_junction': c['crossing_without_junction'], 'major_crossings_without_junction': c['major_crossing_without_junction']},
        'buildings': {'mapped': c['buildings'], 'height_or_levels': c['buildings_height_mapped'], 'addressed': c['buildings_addressed'],
                      'material_or_colour': c['buildings_material_mapped'], 'roof_shape': c['buildings_roof_mapped']},
        'street': {'bus_stops_named': c['bus_stop_named'], 'bus_stops_unnamed': c['bus_stop_unnamed'],
                   'metro_entrances_with_number': c['metro_entrance_ref'], 'metro_entrances_without_number': c['metro_entrance_noref'],
                   'signals': c['signals'], 'pedestrian_crossings': c['ped_crossings'], 'traffic_signs': c['traffic_signs'],
                   'walls_fences_km': round(r['walls_km'], 1), 'gates': c['gates'], 'entrances': c['entrances'],
                   'single_trees': c['trees'], 'tree_rows_km': round(r['tree_rows_km'], 1), 'landuse_areas': c['landuse_areas'], 'shops_amenities': c['pois']},
        'street_level_appearance_verified_km': 0,
    })
json.dump(out, open(OUT, 'w'), ensure_ascii=False, indent=1)
for x in out['districts']: print(x['district'], x['roads']['osm_drivable_km'], x['roads']['routable_km'], x['connectivity'], x['street']['walls_fences_km'], x['street']['gates'])
print('isolated top', out['largest_isolated_groups'][:5])
print('crossings', len(crossings))
