"""Pass 2: turn the raw OSM pickle (extract.py) into the game's Tashkent map.

  python build.py raw.pkl ../../www/map  [--old ../../www/map-old]

Writes
  index.json         cell list, spawn, landmarks, source/date
  cells/X_Z.json     500 m cells: buildings, roads (with names, one-way, bridge/tunnel), street objects
  graph.json         the whole drivable road network for routing (taxi), one-way aware, layers kept apart
  search.json        searchable places: streets, mahallas, districts, bus stops, metro, bazaars, landmarks
  coverage.json/.md  per-district counts (and the same counts for the previous map, if --old is given)

Data: (c) OpenStreetMap contributors, ODbL 1.0, via the Geofabrik Uzbekistan extract.
Scope: Tashkent city inside its administrative boundary (OSM relation 2216724) plus a 150 m margin.
Coordinates: 1 unit = 1 m, x east, z south; origin 41.31 N 69.28 E (same as the previous map).
"""
import sys, json, math, os, pickle, re, shutil
from collections import defaultdict, Counter
from shapely.geometry import Polygon, LineString, Point
from shapely.ops import unary_union
from shapely.prepared import prep

RAW, OUT = sys.argv[1], sys.argv[2]
OLD = sys.argv[sys.argv.index('--old') + 1] if '--old' in sys.argv else None
SOURCE_DATE = os.environ.get('OSM_DATE', '2026-11-27')
CITY_REL = 2216724
LAT0, LON0 = 41.31, 69.28
KX = 111320 * math.cos(math.radians(LAT0))
KZ = 111034
CELL = 500

# the same affine projection as the previous map build (fitted on 5 OSM nodes, < 0.15 m residual),
# so old and new maps line up and screenshots can be compared at identical coordinates
def P(lon, lat): return (83688.15960 * lon - 21.21882 * lat - 5797037.69, -1.1002137 * lon - 111050.703 * lat + 4587580.68)
def R(v): return int(round(v))

d = pickle.load(open(RAW, 'rb'))
print('raw', {k: len(v) for k, v in d.items()})

def geom(rings):
    return unary_union([Polygon(sh, holes).buffer(0) for sh, holes in rings])

# ------------------------------------------------------------ boundary, districts, mahallas
city = next(a for a in d['areas'] if a[0] == CITY_REL and not a[1])
CITY = geom(city[2])
CITY_M = Polygon([P(*p) for p in CITY.exterior.coords]) if CITY.geom_type == 'Polygon' else unary_union([Polygon([P(*p) for p in g.exterior.coords]) for g in CITY.geoms])
MARGIN = 400                              # metres past the boundary: the ring road and its roadside stay whole
CLIP = prep(CITY.buffer(0.0045))          # the same margin in degrees, for the raw data
IN = prep(CITY)
CITY_PM = prep(CITY_M.buffer(MARGIN))

def mpoly(g):
    gs = [g] if g.geom_type == 'Polygon' else list(g.geoms)
    return unary_union([Polygon([P(*p) for p in x.exterior.coords], [[P(*p) for p in h.coords] for h in x.interiors]) for x in gs])

districts = []
for a in d['areas']:
    t = a[3]
    if t.get('boundary') == 'administrative' and t.get('admin_level') == '6':
        g = geom(a[2])
        if IN.contains(g.representative_point()):
            districts.append({'name': t.get('name:uz') or t.get('name'), 'en': t.get('name:en') or t.get('name'), 'g': g, 'gm': prep(mpoly(g))})
districts.sort(key=lambda x: x['name'])
print('districts', len(districts))

def district_of(x, z):
    p = Point(x, z)
    for i, dd in enumerate(districts):
        if dd['gm'].contains(p): return i
    return -1

def nm(t):
    n = t.get('name:uz') or t.get('name:uz-Latn') or t.get('name') or ''
    return n.strip()

# ------------------------------------------------------------ roads
KIND = {'motorway': 2, 'trunk': 2, 'primary': 2, 'motorway_link': 1, 'trunk_link': 1, 'primary_link': 1,
        'secondary': 1, 'secondary_link': 1, 'tertiary': 1, 'tertiary_link': 1,
        'unclassified': 0, 'residential': 0, 'living_street': 0, 'service': 0, 'road': 0}
SPEED = {'motorway': 80, 'trunk': 70, 'primary': 60, 'secondary': 50, 'tertiary': 45, 'unclassified': 35, 'residential': 30,
         'living_street': 15, 'service': 15, 'road': 30}
names = []
name_ix = {}
def name_id(n):
    if not n: return -1
    if n not in name_ix: name_ix[n] = len(names); names.append(n)
    return name_ix[n]

roads = []              # dict per kept way
node_use = Counter()
for wid, pts, t in d['ways']:
    hw = t.get('highway')
    if hw not in KIND: continue
    if hw == 'service' and t.get('service') in ('parking_aisle', 'drive-through', 'emergency_access'): continue
    private = t.get('access') in ('no', 'private') or t.get('motor_vehicle') in ('no', 'private') or t.get('service') == 'driveway'
    if t.get('area') == 'yes': continue
    # keep the way if any part lies in the city (clipped below for rendering; the graph keeps whole ways)
    if not any(CLIP.contains(Point(lon, lat)) for _, lon, lat in pts[:: max(1, len(pts) // 8)] + [pts[-1]]): continue
    ow = t.get('oneway')
    oneway = 1 if ow in ('yes', 'true', '1') or t.get('junction') in ('roundabout', 'circular') or hw in ('motorway',) else -1 if ow == '-1' else 0
    if oneway == -1: pts = pts[::-1]; oneway = 1
    try: layer = int(t.get('layer', '0'))
    except ValueError: layer = 0
    bridge = t.get('bridge') not in (None, 'no')
    tunnel = t.get('tunnel') not in (None, 'no') or t.get('covered') == 'yes'
    def ival(k):
        try: return int(str(t.get(k, '0')).split(';')[0])
        except ValueError: return 0
    lanes = ival('lanes'); lf = ival('lanes:forward'); lb = ival('lanes:backward')
    if oneway and not lanes: lanes = lf
    k = KIND[hw]
    if hw.endswith('_link'): base_w = 6.5
    elif lanes: base_w = lanes * 3.3 + (0 if oneway else 0.5)
    else: base_w = {2: 10.5 if oneway else 15, 1: 7 if oneway else 10, 0: 5.5}[k]
    if hw in ('service', 'living_street') and not lanes: base_w = 4.2
    if private: base_w = min(base_w, 3.6)
    width = max(3.8, min(24, base_w))
    xy = [P(lon, lat) for _, lon, lat in pts]
    r = {'id': wid, 'hw': hw, 'kind': k, 'name': name_id(nm(t)), 'oneway': oneway, 'layer': layer, 'bridge': bridge,
         'tunnel': tunnel, 'width': round(width, 1), 'speed': 8 if private else SPEED.get(hw.replace('_link', ''), 30), 'private': private,
         'lanes': lanes, 'lanes_f': lf, 'lanes_b': lb, 'median': 0, 'maxspeed': t.get('maxspeed'),
         'nodes': [n for n, _, _ in pts], 'xy': xy, 'round': t.get('junction') in ('roundabout', 'circular')}
    roads.append(r)
    for n in r['nodes']: node_use[n] += 1
print('roads', len(roads))

# ------------------------------------------------------------ routing graph: split ways at shared nodes
gnode = {}
gxy = []
def gn(nid, xy):
    if nid not in gnode: gnode[nid] = len(gxy); gxy.append([R(xy[0]), R(xy[1])])
    return gnode[nid]
edges = []
for ri, r in enumerate(roads):
    ns, xy = r['nodes'], r['xy']
    start = 0
    for i in range(1, len(ns)):
        if i == len(ns) - 1 or node_use[ns[i]] > 1:
            seg = xy[start:i + 1]
            L = sum(math.hypot(seg[j + 1][0] - seg[j][0], seg[j + 1][1] - seg[j][1]) for j in range(len(seg) - 1))
            if L > 0.5:
                if not all(CITY_PM.contains(Point(*p)) for p in seg[:: max(1, len(seg) // 4)] + [seg[-1]]):
                    start = i; continue          # the road network ends where the drawn map ends
                u, v = gn(ns[start], xy[start]), gn(ns[i], xy[i])
                mid = [c for p in seg[1:-1] for c in (R(p[0]), R(p[1]))]
                flags = (1 if r['oneway'] else 0) | (2 if r['bridge'] else 0) | (4 if r['tunnel'] else 0) | (8 if r['round'] else 0) | (32 if r['private'] else 0)
                edges.append([u, v, R(L * 10), r['kind'], flags, r['name'], r['speed'], ri, mid, r['width']])
            start = i
print('graph nodes', len(gxy), 'edges', len(edges))
# keep the largest strongly-usable component (ignoring one-way for connectivity) so every routed stop is reachable
adj = defaultdict(list)
for e in edges: adj[e[0]].append(e[1]); adj[e[1]].append(e[0])
comp = {}
best = None
for s in range(len(gxy)):
    if s in comp: continue
    stack, members = [s], []
    comp[s] = s
    while stack:
        a = stack.pop(); members.append(a)
        for b in adj[a]:
            if b not in comp: comp[b] = s; stack.append(b)
    if best is None or len(members) > len(best): best = members
main = set(best)
print('main component nodes', len(main), 'of', len(gxy))
keep_nodes = sorted(main)
remap = {o: i for i, o in enumerate(keep_nodes)}
G_nodes = [c for o in keep_nodes for c in gxy[o]]
G_edges = [[remap[e[0]], remap[e[1]], e[2], e[3], e[4], e[5], e[6], e[8], e[9], e[7]] for e in edges if e[0] in main and e[1] in main]
# ---- turn restrictions (OSM type=restriction): [via graph node, from way, to way, 1 = only / 0 = no]
way_ix = {r['id']: i for i, r in enumerate(roads)}
TURNS = []
TURN_SIGNS = []
for rid, mem, t in d.get('restr', []):
    kind = t.get('restriction', '')
    if not kind or t.get('except', '').find('motorcar') >= 0: continue
    fr = [m[1] for m in mem if m[2] == 'from' and m[0] == 'w']
    to = [m[1] for m in mem if m[2] == 'to' and m[0] == 'w']
    via = [m[1] for m in mem if m[2] == 'via' and m[0] == 'n']
    if len(fr) != 1 or len(to) != 1 or len(via) != 1: continue          # via-way restrictions are not used
    if fr[0] not in way_ix or to[0] not in way_ix or via[0] not in gnode or gnode[via[0]] not in remap: continue
    TURNS.append([remap[gnode[via[0]]], way_ix[fr[0]], way_ix[to[0]], 1 if kind.startswith('only_') else 0])
    TURN_SIGNS.append((via[0], way_ix[fr[0]], kind))
print('turn restrictions used', len(TURNS))
in_graph_way = {e[7] for e in edges if e[0] in main}

# ------------------------------------------------------------ buildings
HOUSE = {'house', 'detached', 'semidetached_house', 'bungalow', 'terrace', 'farm', 'cabin', 'hut'}
APART = {'apartments', 'residential', 'dormitory', 'flats'}
SHOP = {'retail', 'commercial', 'supermarket', 'kiosk', 'shop', 'mall', 'market', 'hotel'}
PUBLIC = {'school', 'university', 'college', 'kindergarten', 'hospital', 'government', 'civic', 'public', 'office', 'train_station',
          'transportation', 'clinic', 'stadium', 'sports_hall', 'theatre', 'museum'}
INDUS = {'industrial', 'warehouse', 'garages', 'garage', 'hangar', 'service', 'shed', 'storage_tank', 'greenhouse', 'parking', 'manufacture'}
RELIG = {'mosque', 'church', 'religious', 'cathedral', 'chapel', 'synagogue', 'temple', 'shrine', 'mausoleum'}
COLORS = {'white': '#eeeeea', 'grey': '#a7a9ab', 'gray': '#a7a9ab', 'beige': '#e4d6b8', 'yellow': '#e9d58f', 'brown': '#8d6a4c',
          'red': '#b4513f', 'blue': '#6d8fb3', 'green': '#7d9a6d', 'black': '#2b2c2e', 'orange': '#dc8e4d', 'pink': '#e3b2b3'}
def colour(v):
    if not v: return 0
    v = v.strip().lower()
    if re.fullmatch(r'#[0-9a-f]{6}', v): return v
    if re.fullmatch(r'#[0-9a-f]{3}', v): return '#' + ''.join(c * 2 for c in v[1:])
    return COLORS.get(v, 0)

def shrink(p, q, d):
    # point d metres from p towards q
    L = math.hypot(q[0] - p[0], q[1] - p[1]) or 1
    t = min(0.5, d / L)
    return (p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t)

def num(v):
    if not v: return None
    m = re.match(r'\s*([0-9]+(?:[.,][0-9]+)?)', v)
    return float(m.group(1).replace(',', '.')) if m else None

buildings = []
bstats = Counter()
for oid, fromway, rings, t in d['areas']:
    b = t.get('building')
    if not b or b == 'no': continue
    if t.get('building') in ('construction',) and 'building:levels' not in t: pass
    sh = rings[0][0]
    cx = sum(p[0] for p in sh) / len(sh); cy = sum(p[1] for p in sh) / len(sh)
    if not CLIP.contains(Point(cx, cy)): continue
    xy = [P(lon, lat) for lon, lat in sh]
    if len(xy) > 3 and xy[0] == xy[-1]: xy = xy[:-1]
    if len(xy) < 3: continue
    area = abs(sum(xy[i][0] * xy[(i + 1) % len(xy)][1] - xy[(i + 1) % len(xy)][0] * xy[i][1] for i in range(len(xy)))) / 2
    if area < 6: continue
    h = num(t.get('height')); lv = num(t.get('building:levels'))
    est = False
    if b in RELIG or t.get('amenity') == 'place_of_worship': typ = 5
    elif b in ('roof', 'carport'): typ = 7
    elif b in INDUS: typ = 4
    elif b in PUBLIC or t.get('amenity') in ('school', 'kindergarten', 'university', 'college', 'hospital', 'clinic', 'townhall'): typ = 3
    elif b in SHOP or 'shop' in t or t.get('amenity') in ('marketplace', 'restaurant', 'cafe', 'bank', 'fuel'): typ = 2
    elif b in HOUSE: typ = 0
    elif b in APART: typ = 1
    else: typ = 0 if area < 220 else 1 if area < 2500 else 2
    if h is None and lv is not None: h = lv * 3.1 + 1.2
    if h is None:
        est = True
        h = {0: 4.2 if area < 260 else 7.4, 1: 16.6 if area > 260 else 7.4, 2: 6.5 if area < 1500 else 10, 3: 11, 4: 6.5, 5: 9, 7: 3.2}[typ]
        if typ == 1 and area > 1800: h = 28
    if typ == 7: h = min(h, 4.5)
    if h >= 45 and typ in (1, 2, 3): typ = 6
    bstats['est' if est else 'tagged'] += 1
    x0, z0 = sum(p[0] for p in xy) / len(xy), sum(p[1] for p in xy) / len(xy)
    mat = {'brick': 1, 'glass': 3, 'concrete': 2, 'plaster': 2, 'stone': 4, 'metal': 5, 'wood': 6, 'panel': 2}.get((t.get('building:material') or t.get('material') or '').lower(), 0)
    rshape = 1 if t.get('roof:shape') in ('hipped', 'gabled', 'pyramidal', 'half-hipped', 'gambrel', 'mansard') else 2 if t.get('roof:shape') in ('dome', 'onion') else 0
    buildings.append({'xy': xy, 'h': round(min(h, 320), 1), 'typ': typ, 'wall': colour(t.get('building:colour')), 'roof': colour(t.get('roof:colour')), 'mat': mat, 'rshape': rshape,
                      'c': (x0, z0), 'name': nm(t), 'id': oid})
print('buildings', len(buildings), dict(bstats))

# ------------------------------------------------------------ roads vs buildings
# OSM centre lines of lanes and the footprints of the houses beside them are drawn by different people with
# different imagery: an estimated width (no lanes / width tag) is narrowed to the clearance to the nearest
# building, and a building that a street's centre line runs through is a passage (arch, covered entry): it
# stays in the picture but you can drive through it.
from shapely.strtree import STRtree as _STRB
bpolys, bidx = [], []
for i, b in enumerate(buildings):
    try:
        pg = Polygon(b['xy']).buffer(0)
        if not pg.is_empty: bpolys.append(pg); bidx.append(i)
    except Exception: pass
btree = _STRB(bpolys)
narrowed = passages = 0
for r in roads:
    if r['bridge'] or r['tunnel'] or len(r['xy']) < 2: continue
    line = LineString(r['xy'])
    clear = 99.0
    for k in btree.query(line.buffer(r['width'] / 2 + 1)):
        pg = bpolys[k]
        if pg.intersects(line):
            inside = pg.intersection(line).length
            if inside > 1.0:
                b = buildings[bidx[k]]
                if not b.get('pass'): b['pass'] = True; passages += 1
            continue
        clear = min(clear, pg.distance(line))
    tagged = r['lanes'] > 0
    if clear < r['width'] / 2 + 0.3:
        new = max(3.0 if not tagged else r['width'] * 0.8, round(2 * clear - 0.4, 1))
        if new < r['width']: r['width'] = new; narrowed += 1
print('roads narrowed to their clearance', narrowed, 'buildings marked as passages', passages)
for e in G_edges: e[8] = roads[e[9]]['width']

# ------------------------------------------------------------ street objects
objects = []     # type, name, x, z, extra
seen_bus = []
def near_road_side(x, z):
    return None
for nid, lon, lat, t in d['nodes']:
    if not CLIP.contains(Point(lon, lat)): continue
    x, z = P(lon, lat)
    hw, pt, rw = t.get('highway'), t.get('public_transport'), t.get('railway')
    if hw == 'traffic_signals':
        objects.append(['signal', '', R(x), R(z), nid]); continue
    if hw == 'bus_stop' or (pt == 'platform' and t.get('bus') != 'no' and rw is None and t.get('train') is None):
        n = nm(t)
        # one sign per stop: skip stop_position / platform duplicates within 18 m with the same name
        if any(abs(o[2] - x) < 18 and abs(o[3] - z) < 18 and o[1] == n for o in seen_bus): continue
        o = ['bus', n, R(x), R(z), nid]; seen_bus.append(o); objects.append(o); continue
    if rw == 'subway_entrance':
        objects.append(['entrance', nm(t), R(x), R(z), t.get('ref', '')]); continue
    if (rw == 'station' and t.get('station') == 'subway') or (pt == 'station' and t.get('subway') == 'yes'):
        objects.append(['metro', nm(t), R(x), R(z), nid]); continue
# stations drawn as areas
for oid, fromway, rings, t in d['areas']:
    if (t.get('railway') == 'station' and t.get('station') == 'subway') or (t.get('public_transport') == 'station' and t.get('subway') == 'yes'):
        g = Polygon(rings[0][0]); c = g.representative_point()
        if CLIP.contains(c):
            x, z = P(c.x, c.y)
            if not any(o[0] == 'metro' and o[1] == nm(t) and abs(o[2] - x) < 300 and abs(o[3] - z) < 300 for o in objects):
                objects.append(['metro', nm(t), R(x), R(z), 'a%d' % oid])
# entrances without a name take the nearest station's
stations = [o for o in objects if o[0] == 'metro']
for o in objects:
    if o[0] == 'entrance':
        st = min(stations, key=lambda s: (s[2] - o[2]) ** 2 + (s[3] - o[3]) ** 2) if stations else None
        if st and (st[2] - o[2]) ** 2 + (st[3] - o[3]) ** 2 < 450 ** 2:
            if not o[1]: o[1] = st[1]
            o.append(st[1])
print(Counter(o[0] for o in objects))

# shops / cafés / markets: shopfront signs and search entries
POI_KIND = {'marketplace': 'bozor', 'cafe': 'kafe', 'restaurant': 'restoran', 'fast_food': 'fastfud', 'pharmacy': 'dorixona',
            'bank': 'bank', 'fuel': 'AYOQSH', 'school': 'maktab', 'hospital': 'shifoxona', 'clinic': 'poliklinika',
            'place_of_worship': 'masjid', 'kindergarten': "bog'cha", 'university': 'universitet', 'college': 'kollej',
            'post_office': 'pochta', 'cinema': 'kinoteatr', 'theatre': 'teatr'}
pois = []
def add_poi(t, x, z):
    n = nm(t)
    a = t.get('amenity'); s = t.get('shop')
    kind = POI_KIND.get(a) or ('dokon' if s else None) or ('mehmonxona' if t.get('tourism') == 'hotel' else None) or ('muzey' if t.get('tourism') == 'museum' else None)
    if not kind or not n: return
    pois.append([kind, n, R(x), R(z), s or a or t.get('tourism')])
for nid, lon, lat, t in d['nodes']:
    if ('amenity' in t or 'shop' in t or 'tourism' in t) and CLIP.contains(Point(lon, lat)):
        add_poi(t, *P(lon, lat))
for oid, fromway, rings, t in d['areas']:
    if ('amenity' in t or 'shop' in t or 'tourism' in t):
        c = Polygon(rings[0][0]).representative_point()
        if CLIP.contains(c): add_poi(t, *P(c.x, c.y))
print('pois', len(pois), Counter(p[0] for p in pois).most_common(8))

# ------------------------------------------------------------ landmarks (positions from the data, never guessed)
def find(pred, kind='any'):
    def in_areas():
        for oid, fw, rings, t in d['areas']:
            if pred(t):
                c = Polygon(rings[0][0]).representative_point(); return P(c.x, c.y), ('way' if fw else 'relation') + ' %d' % oid
        return None, None
    if kind == 'area':                   # a building outline is a better anchor than a stray point inside it
        r = in_areas()
        if r[0]: return r
    for nid, lon, lat, t in d['nodes']:
        if pred(t): return P(lon, lat), 'node %d' % nid
    return in_areas()
def has(t, *ws): s = ' '.join(str(v) for v in t.values()).lower(); return all(w.lower() in s for w in ws)
LMK = [
    ('tv', 'Toshkent teleminorasi', lambda t: t.get('man_made') in ('tower', 'communications_tower') and (has(t, 'teleminora') or has(t, 'телебашня') or has(t, 'tv tower'))),
    ('minor', 'Minor masjidi', lambda t: t.get('amenity') == 'place_of_worship' and (has(t, 'minor') or has(t, 'минор'))),
    ('chorsu', 'Chorsu bozori', lambda t: t.get('amenity') == 'marketplace' and (has(t, 'chorsu') or has(t, 'чорсу'))),
    ('hazrati', 'Hazrati Imom majmuasi', lambda t: (has(t, 'hazrati imom') or has(t, 'хазрати имам') or has(t, 'hast imam') or has(t, 'хаст имам')) and ('amenity' in t or 'historic' in t or 'tourism' in t or 'building' in t or 'place' in t or 'landuse' in t)),
    ('temur', 'Amir Temur xiyoboni', lambda t: (has(t, 'xiyobon') or has(t, 'сквер')) and (has(t, 'temur') or has(t, 'timur') or has(t, 'тимур')) and t.get('leisure') in ('park', 'garden')),
    ('temur_statue', 'Amir Temur haykali', lambda t: t.get('historic') in ('monument', 'memorial') and (has(t, 'amir temur') or has(t, 'amir timur'))),
    ('tcity', 'Tashkent City', lambda t: (has(t, 'tashkent city') or has(t, 'ташкент сити')) and (t.get('leisure') == 'park' or t.get('landuse') or t.get('place'))),
    ('kokaldosh', "Ko'kaldosh madrasasi", lambda t: has(t, "ko'kaldosh") or has(t, 'кукельдаш') or has(t, 'kukeldash') or has(t, 'ko‘kaldosh') or has(t, 'koʻkaldosh')),
    ('mustaqillik', 'Mustaqillik maydoni', lambda t: (has(t, 'mustaqillik maydoni') or has(t, 'площадь независимости')) and (t.get('place') == 'square' or t.get('leisure') or t.get('highway') or t.get('landuse'))),
    ('humo', 'Humo Arena', lambda t: has(t, 'humo arena') or has(t, 'хумо арена')),
    ('hotel', '"O\'zbekiston" mehmonxonasi', lambda t: t.get('tourism') == 'hotel' and (has(t, 'hotel uzbekistan') or has(t, 'гостиница узбекистан') or has(t, "o'zbekiston mehmonxonasi") or has(t, 'uzbekistan hotel'))),
    ('forums', 'Xalqaro anjumanlar saroyi', lambda t: has(t, 'anjumanlar saroyi') or has(t, 'дворец форумов')),
    ('chimes', 'Toshkent kurantlari', lambda t: has(t, 'ташкентские куранты') or has(t, 'toshkent kurantlari')),
    ('museum', 'Amir Temur muzeyi', lambda t: t.get('tourism') == 'museum' and (has(t, 'temur') or has(t, 'темур') or has(t, 'timurid'))),
]
landmarks = []
for key, label, pred in LMK:
    pos, src = find(pred, 'area' if key in ('museum', 'forums', 'chimes') else 'any')
    print('landmark', key, pos and (R(pos[0]), R(pos[1])), src)
    if pos: landmarks.append({'id': key, 'name': label, 'x': R(pos[0]), 'z': R(pos[1]), 'osm': src})

# ------------------------------------------------------------ places for search
places = []
for nid, lon, lat, t in d['nodes']:
    if t.get('place') in ('neighbourhood', 'suburb', 'quarter', 'village', 'hamlet', 'locality', 'district') and nm(t) and IN.contains(Point(lon, lat)):
        x, z = P(lon, lat); places.append(['mahalla' if t['place'] in ('neighbourhood', 'quarter', 'village', 'hamlet') else 'hudud', nm(t), R(x), R(z)])
for oid, fw, rings, t in d['areas']:
    named = nm(t)
    if not named: continue
    if (t.get('boundary') == 'administrative' and t.get('admin_level') == '10') or t.get('place') in ('neighbourhood', 'quarter', 'suburb', 'village', 'hamlet') \
       or (t.get('landuse') == 'residential' and ('mavze' in named.lower() or 'massiv' in named.lower() or 'mahalla' in named.lower() or 'mfy' in named.lower() or len(named) < 30)):
        c = Polygon(rings[0][0]).representative_point()
        if IN.contains(c):
            x, z = P(c.x, c.y)
            if not any(p[1] == named and abs(p[2] - x) < 600 and abs(p[3] - z) < 600 for p in places):
                places.append(['mahalla', named, R(x), R(z)])
print('places', len(places))

# ------------------------------------------------------------ medians: the other carriageway of a divided road
# a one-way road with an opposite one-way road of the same name 4-45 m to its left has a median on that side
from shapely.strtree import STRtree as _STR
ow = [r for r in roads if r['oneway'] and r['kind'] >= 1 and len(r['xy']) >= 2]
ow_lines = [LineString(r['xy']) for r in ow]
ow_tree = _STR(ow_lines)
for i, r in enumerate(ow):
    xy = r['xy']; j = len(xy) // 2
    a, b = xy[max(0, j - 1)], xy[min(len(xy) - 1, j)] if len(xy) > 2 else (xy[0], xy[1])
    if len(xy) == 2: a, b = xy[0], xy[1]
    dx, dz = b[0] - a[0], b[1] - a[1]; L = math.hypot(dx, dz) or 1; ux, uz = dx / L, dz / L
    mx, mz = (a[0] + b[0]) / 2, (a[1] + b[1]) / 2
    lx, lz = uz, -ux                     # left of travel in x-east / z-south
    best = None
    for k in ow_tree.query(Point(mx, mz).buffer(45)):
        if k == i: continue
        o = ow[k]
        if o['name'] != r['name'] or r['name'] < 0: continue
        p = ow_lines[k].interpolate(ow_lines[k].project(Point(mx, mz)))
        ox, oz = p.x - mx, p.y - mz
        side = ox * lx + oz * lz
        dist = math.hypot(ox, oz)
        if side <= 0 or dist < 4 or dist > 45: continue
        if best is None or dist < best: best = dist
    if best: r['median'] = round(best - (r['width'] / 2) * 2, 1)       # kerb-to-kerb between the carriageways (approx.)
print('roads with a median', sum(1 for r in roads if r['median'] > 0))

# ------------------------------------------------------------ pedestrian crossings on the carriageway
node_road = {}
for r in roads:
    for j, n in enumerate(r['nodes']):
        if n not in node_road or r['kind'] > node_road[n][0]['kind']: node_road[n] = (r, j)
zebras = []
for nid, lon, lat, t in d['nodes']:
    if t.get('highway') != 'crossing' or t.get('crossing') in ('no', 'unmarked') or nid not in node_road: continue
    r, j = node_road[nid]
    if r['kind'] < 1 and r['width'] < 6: continue
    a = r['xy'][max(0, j - 1)]; b = r['xy'][min(len(r['xy']) - 1, j + 1)]
    ang = math.atan2(b[0] - a[0], b[1] - a[1])
    x, z = P(lon, lat)
    zebras.append(['zebra', 'signal' if t.get('crossing') == 'traffic_signals' else '', R(x), R(z), round(ang, 3), r['width'], 1 if r['oneway'] else 0])
print('zebra crossings', len(zebras))

# ------------------------------------------------------------ road signs and speed cameras (only where the data says so)
# A sign stands on the right-hand kerb of the approach it is for, facing the drivers on that approach.
# 'travel' is the unit direction of the traffic the sign is meant for.
signs, cameras = [], []
def kerb_pt(x, z, tx, tz, width): return (x - tz * (width / 2 + 0.9), z + tx * (width / 2 + 0.9))
road_by_line = [r for r in roads if len(r['xy']) >= 2 and not r['tunnel']]
rl_lines = [LineString(r['xy']) for r in road_by_line]
rl_tree = _STR(rl_lines)
def clear_of_roads(x, z):
    pt = Point(x, z)
    return not any(rl_lines[i].distance(pt) < road_by_line[i]['width'] / 2 + 0.4 and not road_by_line[i]['bridge'] for i in rl_tree.query(pt.buffer(30)))
sign_dropped = 0
def add_sign(kind, value, x, z, tx, tz, width):
    # on the right kerb; near junctions and on divided roads that spot can be another carriageway:
    # step out a little, then along the approach, and leave the sign out if nothing is clear
    global sign_dropped
    for ds in (0, -6, 6, -12, 12):
        for ex in (0, 1.2, 2.4):
            kx, kz = kerb_pt(x + tx * ds, z + tz * ds, tx, tz, width + 2 * ex)
            if clear_of_roads(kx, kz):
                signs.append(['sign', kind, R(kx * 10) / 10, R(kz * 10) / 10, round(math.atan2(tx, tz), 3), value]); return
    sign_dropped += 1
def along(r, start_end, dist):
    # point `dist` metres in from the start (0) or the end (1) of a road, and the travel direction there
    ln = LineString(r['xy']); L = ln.length
    sdist = min(dist, L * 0.45) if start_end == 0 else max(L - dist, L * 0.55)
    p0 = ln.interpolate(sdist); p1 = ln.interpolate(min(L, sdist + 1)) if start_end == 0 else ln.interpolate(max(0, sdist - 1))
    dx, dz = p1.x - p0.x, p1.y - p0.y; l = math.hypot(dx, dz) or 1
    return p0.x, p0.y, dx / l, dz / l
def speed_of(v):
    if not v: return None
    v = str(v).strip()
    if v.isdigit(): return int(v)
    if v == 'UZ:living_street': return 20
    return None
# speed limits: at the start of every main road, and of any street with a limit other than 60 km/h
for r in roads:
    sp = speed_of(r['maxspeed'])
    if not sp or len(r['xy']) < 2 or r['tunnel']: continue
    L = LineString(r['xy']).length
    if L < 120 or not (r['kind'] == 2 or sp != 60): continue
    x, z, tx, tz = along(r, 0, 15); add_sign('speed', sp, x, z, tx, tz, r['width'])
    if not r['oneway']: x, z, tx, tz = along(r, 1, 15); add_sign('speed', sp, x, z, tx, tz, r['width'])
# one-way streets: "one way" at the start, "no entry" facing anyone who would come in from the far end
for r in roads:
    if not r['oneway'] or r['round'] or r['kind'] > 1 or len(r['xy']) < 2 or r['private'] or r['tunnel']: continue
    if LineString(r['xy']).length < 40: continue
    x, z, tx, tz = along(r, 0, 8); add_sign('oneway', 0, x, z, tx, tz, r['width'])
    x, z, tx, tz = along(r, 1, 4); add_sign('no_entry', 0, x, z, -tx, -tz, r['width'])
# stop / give way nodes (OSM): for the approach towards the junction the node belongs to
node_ll = {}
for nid, lon, lat, t in d['nodes']:
    hw = t.get('highway')
    if hw in ('stop', 'give_way') and nid in node_road:
        r, j = node_road[nid]
        ns = r['nodes']
        # towards the nearer end that is a junction
        fwd = next((k for k in range(j + 1, len(ns)) if node_use[ns[k]] > 1), None)
        back = next((k for k in range(j - 1, -1, -1) if node_use[ns[k]] > 1), None)
        x, z = P(lon, lat)
        if t.get('direction') == 'backward' or (fwd is None and back is not None) or (back is not None and fwd is not None and j - back < fwd - j and t.get('direction') != 'forward'):
            a2 = r['xy'][min(len(ns) - 1, j + 1)]; b2 = r['xy'][max(0, j - 1)]
        else:
            a2 = r['xy'][max(0, j - 1)]; b2 = r['xy'][min(len(ns) - 1, j + 1)]
        dx, dz = b2[0] - a2[0], b2[1] - a2[1]; l = math.hypot(dx, dz) or 1
        add_sign('stop' if hw == 'stop' else 'give_way', 0, x, z, dx / l, dz / l, r['width'])
# turn restrictions: the prohibitory / mandatory sign 12 m before the junction on the street they apply to
gpos = {nid: (lon, lat) for nid, lon, lat, t in d['nodes']}
TURN_KIND = {'no_left_turn': 'no_left', 'no_right_turn': 'no_right', 'no_u_turn': 'no_u', 'no_straight_on': 'no_straight',
             'only_straight_on': 'only_straight', 'only_left_turn': 'only_left', 'only_right_turn': 'only_right'}
for via, ri, kind in TURN_SIGNS:
    if kind not in TURN_KIND: continue
    r = roads[ri]; ns = r['nodes']
    if via not in ns: continue
    j = ns.index(via)
    if j == 0: pts = r['xy'][::-1]
    elif j == len(ns) - 1: pts = r['xy']
    else: continue
    ln = LineString(pts)
    if ln.length < 20: continue
    p0 = ln.interpolate(ln.length - 12); p1 = ln.interpolate(ln.length - 11)
    dx, dz = p1.x - p0.x, p1.y - p0.y; l = math.hypot(dx, dz) or 1
    add_sign(TURN_KIND[kind], 0, p0.x, p0.y, dx / l, dz / l, r['width'])
# speed cameras (OSM highway=speed_camera with its maxspeed): the monitored travel direction is the road's
# direction for direction=forward / backward or on a one-way road, the traffic heading the camera looks at
# for a compass direction (the camera faces the oncoming cars), and both directions otherwise.
cam_n = 0
for nid, lon, lat, t in d['nodes']:
    if t.get('highway') != 'speed_camera' or not IN.contains(Point(lon, lat)): continue
    x, z = P(lon, lat); pt = Point(x, z)
    cands = rl_tree.query(pt.buffer(35))
    if not len(cands): continue
    k = min(cands, key=lambda i: LineString(road_by_line[i]['xy']).distance(pt))
    r = road_by_line[k]; ln = LineString(r['xy']); sdist = ln.project(pt)
    q0 = ln.interpolate(max(0, sdist - 1)); q1 = ln.interpolate(min(ln.length, sdist + 1))
    dx, dz = q1.x - q0.x, q1.y - q0.y; l = math.hypot(dx, dz) or 1; dx, dz = dx / l, dz / l
    dr = t.get('direction', '')
    if dr == 'backward': dirs = [(-dx, -dz)]
    elif dr == 'forward' or r['oneway']: dirs = [(dx, dz)]
    elif dr.replace('.', '', 1).isdigit():
        h = math.radians(float(dr)); fx, fz = math.sin(h), -math.cos(h)        # camera faces this way
        dirs = [(dx, dz)] if (dx * fx + dz * fz) < 0 else [(-dx, -dz)]           # monitored traffic drives towards it
    else: dirs = [(dx, dz), (-dx, -dz)]
    lim = speed_of(t.get('maxspeed')) or speed_of(r['maxspeed']) or 60
    on = ln.interpolate(sdist)
    cameras.append(['camera', t.get('name', '') or t.get('name:ru', ''), R(on.x * 10) / 10, R(on.y * 10) / 10, [[round(a3, 3), round(b3, 3)] for a3, b3 in dirs], lim, nid, r['width']])
    cam_n += 1
    # warning signs 120 m before, on each monitored approach: speed limit + photo-radar sign
    for (tx, tz) in dirs:
        back = sdist - 120 if (tx * dx + tz * dz) > 0 else sdist + 120
        b = ln.interpolate(max(5, min(ln.length - 5, back)))
        add_sign('speed', lim, b.x, b.y, tx, tz, r['width'])
        add_sign('camera', lim, b.x + tx * 4, b.y + tz * 4, tx, tz, r['width'])
print('speed cameras', cam_n, 'signs', len(signs), 'dropped (no clear kerb)', sign_dropped, Counter(sg[1] for sg in signs))

# ------------------------------------------------------------ walls, fences and gates (mahalla courtyards, schools, factories)
gate_nodes = {nid: (lon, lat, t) for nid, lon, lat, t in d['nodes'] if t.get('barrier') in ('gate', 'lift_gate', 'swing_gate', 'sliding_gate')}
walls = []
gates = []
for wid, pts, t in d['ways']:
    bt = t.get('barrier')
    if bt not in ('wall', 'fence', 'retaining_wall'): continue
    if not CLIP.contains(Point(pts[0][1], pts[0][2])): continue
    xy = [P(lon, lat) for _, lon, lat in pts]
    h = num(t.get('height')) or (2.4 if bt == 'wall' else 1.8 if bt == 'fence' else 1.2)
    # cut a 3.2 m opening at every gate on the wall
    run = []
    for j, (n, lon, lat) in enumerate(pts):
        if n in gate_nodes and 0 < j < len(pts) - 1:
            a, b = xy[j - 1], xy[j + 1]; ang = math.atan2(b[0] - a[0], b[1] - a[1])
            gates.append(['gate', '', R(xy[j][0]), R(xy[j][1]), round(ang, 3), 3.2, 1 if gate_nodes[n][2].get('barrier') == 'lift_gate' else 0])
            if run: walls.append([0 if bt != 'fence' else 1, round(min(h, 4), 1), run + [shrink(xy[j], xy[j - 1], 1.6)]])
            run = [shrink(xy[j], xy[j + 1], 1.6)]
        else:
            run.append(xy[j])
    if len(run) >= 2: walls.append([0 if bt != 'fence' else 1, round(min(h, 4), 1), run])
# a drivable road crossing a wall means an opening that OSM didn't mark (no gate node): cut one, as wide
# as the road plus a metre, so walls never stand across a carriageway
# bridges too: the ground is flat in the game, so a bridge over a walled road would meet the wall
road_lines = [(LineString(r['xy']), r['width']) for r in roads if len(r['xy']) >= 2 and not r['tunnel']]
road_tree = _STR([l for l, _ in road_lines])
cut_walls, cuts = [], 0
for w in walls:
    line = LineString(w[2])
    if line.length < 0.5: continue
    gaps = []
    for k in road_tree.query(line):
        rl, rw = road_lines[k]
        x = line.intersection(rl)
        pts = [x] if x.geom_type == 'Point' else list(getattr(x, 'geoms', [])) if x.geom_type == 'MultiPoint' else []
        for p0 in pts:
            dpos = line.project(p0)
            gaps.append((dpos - rw / 2 - 0.5, dpos + rw / 2 + 0.5))
    if not gaps: cut_walls.append(w); continue
    gaps.sort(); cuts += len(gaps)
    pos = 0.0
    for g0, g1 in gaps + [(line.length + 1, line.length + 1)]:
        if g0 - pos > 0.6:
            from shapely.ops import substring
            piece = substring(line, max(0, pos), min(line.length, g0))
            if piece.geom_type == 'LineString' and len(piece.coords) >= 2: cut_walls.append([w[0], w[1], list(piece.coords)])
        pos = max(pos, g1)
walls = cut_walls
# ... and nothing of a wall may run along inside a carriageway (a wall mapped a metre into a narrow lane)
from shapely.ops import unary_union as _union
carr_polys = [rl.buffer(max(0.8, rw / 2 - 0.3), cap_style=2) for rl, rw in road_lines]
carr_tree = _STR(carr_polys)
trimmed = []
for w in walls:
    line = LineString(w[2])
    near = [carr_polys[k] for k in carr_tree.query(line)]
    if near:
        rest = line.difference(_union(near))
        parts = [rest] if rest.geom_type == 'LineString' else list(getattr(rest, 'geoms', []))
        for pc in parts:
            if pc.geom_type == 'LineString' and pc.length > 0.6: trimmed.append([w[0], w[1], list(pc.coords)])
    else: trimmed.append(w)
walls = trimmed
# a gate on a road is the way in: drawn open (posts only), never across the lane
for gt in gates:
    pnt = Point(gt[2], gt[3])
    gt.append(1 if any(carr_polys[k].contains(pnt) for k in carr_tree.query(pnt)) else 0)
print('walls after trimming to the kerbs', len(walls), 'gates on a roadway (open)', sum(g[-1] for g in gates))
print('walls', len(walls), 'gates', len(gates), 'openings cut where roads cross walls', cuts)

# ------------------------------------------------------------ doors (entrance nodes on building outlines)
doors = []
for nid, lon, lat, t in d['nodes']:
    if 'entrance' in t and CLIP.contains(Point(lon, lat)):
        x, z = P(lon, lat); doors.append(['door', t.get('addr:housenumber', ''), R(x * 10) / 10, R(z * 10) / 10, 1 if t.get('entrance') == 'main' else 0])
print('doors', len(doors))

# ------------------------------------------------------------ mapped trees (single trees and tree rows)
mtrees = []
for nid, lon, lat, t in d['nodes']:
    if t.get('natural') == 'tree' and CLIP.contains(Point(lon, lat)):
        x, z = P(lon, lat); mtrees.append([R(x * 10) / 10, R(z * 10) / 10, 1 if t.get('leaf_type') == 'needleleaved' else 0])
for wid, pts, t in d['ways']:
    if t.get('natural') != 'tree_row' or not CLIP.contains(Point(pts[0][1], pts[0][2])): continue
    xy = [P(lon, lat) for _, lon, lat in pts]
    acc = 0
    for j in range(len(xy) - 1):
        L = math.hypot(xy[j + 1][0] - xy[j][0], xy[j + 1][1] - xy[j][1]); tpos = (7 - acc) if acc else 0
        while tpos < L:
            f = tpos / L if L else 0
            mtrees.append([R((xy[j][0] + (xy[j + 1][0] - xy[j][0]) * f) * 10) / 10, R((xy[j][1] + (xy[j + 1][1] - xy[j][1]) * f) * 10) / 10, 2])
            tpos += 7
        acc = (acc + L) % 7
print('mapped trees', len(mtrees))

# ------------------------------------------------------------ ground: parks, grass, water, industry, markets, cemeteries
GROUND = {('leisure', 'park'): 0, ('leisure', 'garden'): 0, ('landuse', 'grass'): 0, ('natural', 'grass'): 0, ('landuse', 'meadow'): 0,
          ('landuse', 'recreation_ground'): 0, ('landuse', 'village_green'): 0, ('natural', 'scrub'): 0, ('natural', 'wood'): 6, ('landuse', 'forest'): 6,
          ('landuse', 'industrial'): 2, ('landuse', 'railway'): 2, ('landuse', 'garages'): 2, ('landuse', 'commercial'): 3, ('landuse', 'retail'): 3,
          ('amenity', 'parking'): 3, ('amenity', 'marketplace'): 3, ('natural', 'water'): 4, ('waterway', 'riverbank'): 4, ('landuse', 'reservoir'): 4,
          ('landuse', 'cemetery'): 5, ('amenity', 'grave_yard'): 5, ('landuse', 'farmland'): 7, ('landuse', 'orchard'): 7, ('landuse', 'allotments'): 7,
          ('landuse', 'construction'): 8, ('landuse', 'brownfield'): 8, ('leisure', 'pitch'): 9, ('leisure', 'playground'): 9, ('leisure', 'stadium'): 9}
ground = []
for oid, fw, rings, t in d['areas']:
    if 'building' in t: continue
    cls = None
    for k2, v2 in t.items():
        if (k2, v2) in GROUND: cls = GROUND[(k2, v2)]; break
    if cls is None: continue
    try:
        g = Polygon([P(*p) for p in rings[0][0]], [[P(*p) for p in h] for h in rings[0][1]]).buffer(0)
    except Exception: continue
    if g.is_empty or g.area < 30: continue
    if not CITY_PM.intersects(g): continue
    ground.append((cls, g))
print('ground areas', len(ground))

# ------------------------------------------------------------ write cells
cells = defaultdict(lambda: {'b': [], 'r': [], 'o': [], 'p': [], 'w': [], 't': [], 'g': []})
def ck(x, z): return f'{math.floor(x / CELL)}_{math.floor(z / CELL)}'
for b in buildings:
    flat = [R(c) for p in b['xy'] for c in p]
    cells[ck(*b['c'])]['b'].append([b['h'], b['typ'], b['wall'], b['roof'], flat, 1 if b.get('pass') else 0, b['mat'], b['rshape']])
for ri, r in enumerate(roads):
    xy = r['xy']
    flags = (1 if r['oneway'] else 0) | (2 if r['bridge'] else 0) | (4 if r['tunnel'] else 0) | (8 if r['round'] else 0)
    # split the polyline into runs by the cell of each segment's midpoint; drop parts outside the city
    run, run_cell = [], None
    def flush():
        if len(run) >= 2:
            cells[run_cell]['r'].append([r['kind'], r['width'], flags | (16 if r['median'] > 0 else 0) | (32 if r['private'] else 0), r['layer'], names[r['name']] if r['name'] >= 0 else '', [R(c * 10) / 10 for p in run for c in p], r['lanes'], r['median'], speed_of(r['maxspeed']) or 0])
    for j in range(len(xy) - 1):
        a, b2 = xy[j], xy[j + 1]
        mx, mz = (a[0] + b2[0]) / 2, (a[1] + b2[1]) / 2
        if not CITY_PM.contains(Point(mx, mz)):
            flush(); run, run_cell = [], None; continue
        c = ck(mx, mz)
        if c != run_cell:
            flush(); run, run_cell = [a], c
        run.append(b2)
    flush()
for o in objects: cells[ck(o[2], o[3])]['o'].append(o[:4] + o[4:5] + ([o[5]] if len(o) > 5 else []))
for p in pois: cells[ck(p[2], p[3])]['p'].append(p)
for z in zebras + gates + doors + signs + cameras: cells[ck(z[2], z[3])]['o'].append(z)
for w in walls:
    pts = w[2]
    # split long walls by cell so each cell owns its piece
    run, rc = [pts[0]], ck(*pts[0])
    for p2 in pts[1:]:
        c2 = ck((run[-1][0] + p2[0]) / 2, (run[-1][1] + p2[1]) / 2)
        if c2 != rc and len(run) >= 2:
            cells[rc]['w'].append([w[0], w[1], [R(c * 10) / 10 for q in run for c in q]]); run = [run[-1]]
        rc = c2; run.append(p2)
    if len(run) >= 2: cells[rc]['w'].append([w[0], w[1], [R(c * 10) / 10 for q in run for c in q]])
for t3 in mtrees: cells[ck(t3[0], t3[1])]['t'].append(t3)
from shapely.geometry import box as _box
for cls, g in ground:
    x0, z0, x1, z1 = g.bounds
    for cx in range(math.floor(x0 / CELL), math.floor(x1 / CELL) + 1):
        for cz in range(math.floor(z0 / CELL), math.floor(z1 / CELL) + 1):
            piece = g.intersection(_box(cx * CELL, cz * CELL, (cx + 1) * CELL, (cz + 1) * CELL))
            for pg in ([piece] if piece.geom_type == 'Polygon' else list(getattr(piece, 'geoms', []))):
                if pg.geom_type != 'Polygon' or pg.area < 20: continue
                pg = pg.simplify(0.6)
                ext = [R(c * 10) / 10 for q in list(pg.exterior.coords)[:-1] for c in q]
                holes = [[R(c * 10) / 10 for q in list(h.coords)[:-1] for c in q] for h in pg.interiors if Polygon(h).area > 40]
                if len(ext) >= 6: cells[f'{cx}_{cz}']['g'].append([cls, ext] + ([holes] if holes else []))

os.makedirs(os.path.join(OUT, 'cells'), exist_ok=True)
old_cells = set(os.listdir(os.path.join(OUT, 'cells')))
for f in old_cells: os.remove(os.path.join(OUT, 'cells', f))
for k, c in cells.items():
    json.dump(c, open(os.path.join(OUT, 'cells', k + '.json'), 'w'), separators=(',', ':'), ensure_ascii=False)
print('cells written', len(cells))

# ------------------------------------------------------------ graph + search + index
# taxi stops: a street whose kerb (half width + 1.2 m) falls inside buildings on either side at more than a
# third of the 20 m samples is not offered as a pickup / drop-off street (flag 64)
blocked_edges = 0
for e in G_edges:
    if e[3] > 1 or e[4] & (2 | 4 | 8 | 32): continue
    pts = [(G_nodes[2 * e[0]], G_nodes[2 * e[0] + 1])] + [(e[7][i], e[7][i + 1]) for i in range(0, len(e[7]), 2)] + [(G_nodes[2 * e[1]], G_nodes[2 * e[1] + 1])]
    ln = LineString(pts)
    if ln.length < 22: continue
    n = bad = 0
    for sdist in range(9, int(ln.length) - 8, 20):
        p0 = ln.interpolate(sdist); p1 = ln.interpolate(min(ln.length, sdist + 1))
        dx, dz = p1.x - p0.x, p1.y - p0.y; l = math.hypot(dx, dz) or 1
        for sd in (1, -1):
            kp = Point(p0.x - dz / l * (e[8] / 2 + 1.2) * sd, p0.y + dx / l * (e[8] / 2 + 1.2) * sd)
            n += 1
            if any(bpolys[k].contains(kp) and not buildings[bidx[k]].get('pass') for k in btree.query(kp)): bad += 1
    if n and bad / n > 1 / 3: e[4] |= 64; blocked_edges += 1
print('streets with kerbs inside buildings (no taxi stops)', blocked_edges)
json.dump({'v': 3, 'nodes': G_nodes, 'edges': G_edges, 'names': names, 'turns': TURNS}, open(os.path.join(OUT, 'graph.json'), 'w'), separators=(',', ':'), ensure_ascii=False)

search = []
def dname(x, z):
    i = district_of(x, z); return districts[i]['name'] if i >= 0 else ''
# streets: one entry per (name, district) at the midpoint of its longest piece
street_best = {}
for r in roads:
    n = names[r['name']] if r['name'] >= 0 else ''
    if not n or r['id'] is None: continue
    xy = r['xy']; L = sum(math.hypot(xy[j + 1][0] - xy[j][0], xy[j + 1][1] - xy[j][1]) for j in range(len(xy) - 1))
    m = xy[len(xy) // 2]
    if not CITY_PM.contains(Point(*m)): continue
    key = (n, district_of(*m))
    if key not in street_best or street_best[key][0] < L: street_best[key] = (L, m)
for (n, di), (L, m) in street_best.items():
    search.append(["ko'cha", n, R(m[0]), R(m[1]), districts[di]['name'] if di >= 0 else ''])
for p in places: search.append([p[0], p[1], p[2], p[3], dname(p[2], p[3])])
for dd in districts:
    c = dd['g'].representative_point(); x, z = P(c.x, c.y); search.append(['tuman', dd['name'], R(x), R(z), dd['name']])
seen = set()
for o in objects:
    if o[0] == 'signal' or not o[1]: continue
    key = (o[0], o[1], o[2] // 150, o[3] // 150)
    if key in seen: continue
    seen.add(key)
    label = {'bus': 'bekat', 'metro': 'metro', 'entrance': 'metro kirishi'}[o[0]]
    nm2 = o[1] + (f" ({o[4]}-kirish)" if o[0] == 'entrance' and o[4] else '')
    search.append([label, nm2, o[2], o[3], dname(o[2], o[3])])
for p in pois:
    if p[0] in ('bozor', 'universitet', 'shifoxona', 'muzey', 'mehmonxona', 'teatr', 'kinoteatr', 'masjid'):
        search.append([p[0], p[1], p[2], p[3], dname(p[2], p[3])])
for l in landmarks: search.append(['diqqatga sazovor', l['name'], l['x'], l['z'], dname(l['x'], l['z'])])
json.dump(search, open(os.path.join(OUT, 'search.json'), 'w'), separators=(',', ':'), ensure_ascii=False)
print('search entries', len(search), Counter(s[0] for s in search))

# spawn: O'rikzor, on a named street near the bazaar (taxi start) — from the data
def nearest_edge_point(x, z, kmin=0):
    best = None
    for e in G_edges:
        if e[3] < kmin: continue
        u, v = e[0], e[1]
        pts = [(G_nodes[2 * u], G_nodes[2 * u + 1])] + [(e[7][i], e[7][i + 1]) for i in range(0, len(e[7]), 2)] + [(G_nodes[2 * v], G_nodes[2 * v + 1])]
        for j in range(len(pts) - 1):
            ax, az = pts[j]; bx, bz = pts[j + 1]
            dx, dz = bx - ax, bz - az; l2 = dx * dx + dz * dz or 1
            t = max(0, min(1, ((x - ax) * dx + (z - az) * dz) / l2))
            px, pz = ax + dx * t, az + dz * t
            dd = (px - x) ** 2 + (pz - z) ** 2
            if best is None or dd < best[0]: best = (dd, px, pz, dx / math.sqrt(l2), dz / math.sqrt(l2), e)
    return best
for l in landmarks:
    b = nearest_edge_point(l['x'], l['z'], 1)
    dx, dz = b[1] - l['x'], b[2] - l['z']; dd = math.hypot(dx, dz) or 1
    # the models' fronts face local -x: turn that towards the nearest street
    l['rot'] = round(math.atan2(dz / dd, -dx / dd), 3); l['road'] = round(dd)
# orientation checked against dated street photos (Wikimedia Commons, see docs/MATCHED-VIEWS.md):
# the chimes' long front faces the square to the north, the tower at its west end (right, seen from the square)
FACING = {'chimes': -math.pi / 2}
for l in landmarks:
    if l['id'] in FACING: l['rot'] = round(FACING[l['id']], 3)
SP = P(69.14956, 41.28602)        # "O'rikzor bozori" bus stop, OSM node 5398889412
b = nearest_edge_point(*SP)
spawn = [round(b[1], 1), round(b[2], 1), round(b[3], 3), round(b[4], 3)]
index = {
    'v': 2, 'cell': CELL, 'cells': sorted(cells.keys()), 'spawn': [20, -345, 0.167, -0.986], 'taxiSpawn': spawn, 'origin': [LAT0, LON0],
    'source': 'OpenStreetMap contributors (ODbL 1.0), Geofabrik Uzbekistan extract', 'date': SOURCE_DATE,
    'boundary': 'OSM relation %d (Toshkent shahri)' % CITY_REL, 'landmarks': landmarks,
    'districts': [dd['name'] for dd in districts],
    'outline': [[R(c) for c in p] for p in (CITY_M.exterior.coords if CITY_M.geom_type == 'Polygon' else max(CITY_M.geoms, key=lambda g: g.area).exterior.coords)][::3],
}
json.dump(index, open(os.path.join(OUT, 'index.json'), 'w'), separators=(',', ':'), ensure_ascii=False)

# ------------------------------------------------------------ coverage report
cov = []
road_len = defaultdict(lambda: defaultdict(float))
for r in roads:
    xy = r['xy']
    for j in range(len(xy) - 1):
        m = ((xy[j][0] + xy[j + 1][0]) / 2, (xy[j][1] + xy[j + 1][1]) / 2)
        di = district_of(*m)
        road_len[di][r['kind']] += math.hypot(xy[j + 1][0] - xy[j][0], xy[j + 1][1] - xy[j][1])
bcount = Counter(district_of(*b['c']) for b in buildings)
ocount = defaultdict(Counter)
for o in objects: ocount[district_of(o[2], o[3])][o[0]] += 1
for i, dd in enumerate(districts):
    cov.append({'district': dd['name'], 'area_km2': round(dd['g'].area * KX * KZ / 1e6, 1),
                'road_km': {k: round(road_len[i][k] / 1000, 1) for k in (2, 1, 0)}, 'buildings': bcount[i],
                'bus_stops': ocount[i]['bus'], 'metro_stations': ocount[i]['metro'], 'metro_entrances': ocount[i]['entrance'], 'signals': ocount[i]['signal']})
if OLD:
    oldc = {i: Counter() for i in range(-1, len(districts))}
    import glob
    for f in glob.glob(os.path.join(OLD, 'cells', '*.json')):
        c = json.load(open(f))
        for b in c[0]:
            xs = b[1][0::2]; zs = b[1][1::2]; oldc[district_of(sum(xs) / len(xs), sum(zs) / len(zs))]['buildings'] += 1
        for kind in (1, 2, 3):
            for ax, az, bx, bz in c[kind]:
                oldc[district_of((ax + bx) / 2, (az + bz) / 2)]['road_m_%d' % (kind - 1)] += math.hypot(bx - ax, bz - az)
        for o in (c[4] if len(c) > 4 else []):
            oldc[district_of(o[2], o[3])][o[0]] += 1
    for i, row in enumerate(cov):
        oc = oldc[i]
        row['old'] = {'road_km': {k: round(oc['road_m_%d' % k] / 1000, 1) for k in (2, 1, 0)}, 'buildings': oc['buildings'], 'bus_stops': oc['bus'],
                      'metro_stations': oc['metro'], 'metro_entrances': oc['entrance'], 'signals': oc['signal']}
json.dump({'date': SOURCE_DATE, 'districts': cov, 'outside_districts': {'buildings': bcount[-1]}}, open(os.path.join(OUT, 'coverage.json'), 'w'), indent=1, ensure_ascii=False)
print(json.dumps(cov, ensure_ascii=False)[:3000])
