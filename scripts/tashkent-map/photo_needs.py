"""Where street-level reference photos are needed: one viewpoint every 300 m along every named main and
collector street, for each direction you can drive it, with the district, the street and the compass
heading of the windshield view. A row is 'have' when a usable dated photo (refs.json: lawful licence,
camera position and heading) was taken within 40 m looking within 45 degrees of that heading.

  python photo_needs.py ../../www/map refs.json ../../docs/PHOTO-NEEDS.csv
"""
import sys, json, math, csv, os
from shapely.geometry import LineString

MAP, REFS, OUT = sys.argv[1:4]
a, b, c, d = 83688.15960, -21.21882, -1.1002137, -111050.703
def lonlat(x, z):
    det = a * d - b * c; x0, z0 = x + 5797037.69, z - 4587580.68
    return (d * x0 - b * z0) / det, (-c * x0 + a * z0) / det
def P(lon, lat): return (a * lon + b * lat - 5797037.69, c * lon + d * lat + 4587580.68)
g = json.load(open(os.path.join(MAP, 'graph.json'))); N = g['nodes']
search = json.load(open(os.path.join(MAP, 'search.json')))
refs = [r for r in json.load(open(REFS)) if r.get('heading') is not None]
for r in refs: r['x'], r['z'] = P(r['lon'], r['lat'])
tuman = [e for e in search if e[0] in ('mahalla', 'bekat', "ko'cha")]
def district(x, z):
    best, bd = '', 1e18
    for e in tuman:
        dd = (e[2] - x) ** 2 + (e[3] - z) ** 2
        if dd < bd and e[4]: bd, best = dd, e[4]
    return best
# merge edges into streets by name, then sample each street's edges
rows, seen = [], set()
for e in g['edges']:
    if e[3] < 1 or e[5] < 0 or e[4] & (4 | 32): continue
    name = g['names'][e[5]]
    pts = [(N[2 * e[0]], N[2 * e[0] + 1])] + [(e[7][i], e[7][i + 1]) for i in range(0, len(e[7]), 2)] + [(N[2 * e[1]], N[2 * e[1] + 1])]
    ln = LineString(pts)
    for s in range(0, int(ln.length) + 1, 300):
        p = ln.interpolate(min(ln.length, s + 5)); q = ln.interpolate(min(ln.length, s + 15))
        key = (name, round(p.x / 150), round(p.y / 150))
        if key in seen: continue
        seen.add(key)
        hd = (math.degrees(math.atan2(q.x - p.x, -(q.y - p.y))) + 360) % 360      # compass: 0 north, 90 east
        for dirn in ([0] if e[4] & 1 else [0, 180]):
            h = (hd + dirn) % 360
            have = ''
            for r in refs:
                dh = abs((r['heading'] - h + 180) % 360 - 180)
                if math.hypot(r['x'] - p.x, r['z'] - p.y) < 40 and dh < 45: have = r['url']
            lon, lat = lonlat(p.x, p.y)
            rows.append([district(p.x, p.y), name, round(lat, 6), round(lon, 6), round(h), 'main' if e[3] == 2 else 'collector', 'have' if have else 'missing', have])
# the reference photos themselves are viewpoints we already have (they rarely fall on the 300 m grid)
for r in refs:
    near, nd = '', 1e18
    for e in g['edges']:
        if e[5] < 0: continue
        x0, z0 = N[2 * e[0]], N[2 * e[0] + 1]
        dd = (x0 - r['x']) ** 2 + (z0 - r['z']) ** 2
        if dd < nd: nd, near = dd, g['names'][e[5]]
    rows.append([district(r['x'], r['z']), near, round(r['lat'], 6), round(r['lon'], 6), round(r['heading']), 'reference photo', 'have', r['url']])
rows.sort()
with open(OUT, 'w', newline='') as f:
    w = csv.writer(f)
    w.writerow(['district', 'street', 'lat', 'lon', 'heading_deg', 'road_class', 'reference', 'reference_url'])
    w.writerows(rows)
from collections import Counter
cnt = Counter((r[0], r[6]) for r in rows)
print('viewpoints', len(rows), 'have', sum(1 for r in rows if r[6] == 'have'))
for dname in sorted({r[0] for r in rows}): print(dname, cnt[(dname, 'missing')], 'missing,', cnt[(dname, 'have')], 'have')
