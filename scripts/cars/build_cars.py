"""Build the everyday Uzbek cars in Blender from the photo-fitted body data (uz-models.json, exported from
www/js/uzcars.js MODELS). Run headless:

  /Applications/Blender.app/Contents/MacOS/Blender -b --python scripts/cars/build_cars.py -- cobalt [gentra ...]

For each car: a lofted body (stations along the length, rings with a rounded shoulder and tucked sill, plan
curve rounding the nose and tail, floor lifted over the wheels for the arches), creased along the shoulder and
sill and smoothed with Catmull-Clark subdivision; a cabin (greenhouse) with its faces split into body paint,
glass and black trim (windscreen, side windows behind the A-pillar, B-pillar applique, rear window between the
C-pillars). Saves assets/blender/<car>.blend, exports www/models/<car>.glb (Y up, metres, front at -Z) and
www/models/<car>.surf.json (where the body surface is, for laying lamps and grilles onto it).
Car frame in Blender: X = right, Y = forward, Z = up (glTF export turns this into the game's x, y, -z).
"""
import bpy, bmesh, json, math, sys, os, base64, struct
from mathutils import Vector
from mathutils.bvhtree import BVHTree

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
MODELS = json.load(open(os.path.join(ROOT, 'scripts/cars/uz-models.json')))

def smooth(a, b, x):
    t = max(0.0, min(1.0, (x - a) / (b - a))); return t * t * (3 - 2 * t)

def catmull(pts, n=400):
    """uniform Catmull-Rom through points sorted by x (like THREE.SplineCurve), sampled densely"""
    P = sorted(pts); out = []
    for i in range(len(P) - 1):
        p0 = P[max(0, i - 1)]; p1 = P[i]; p2 = P[i + 1]; p3 = P[min(len(P) - 1, i + 2)]
        for k in range(n // len(P)):
            t = k / (n // len(P)); t2, t3 = t * t, t * t * t
            out.append(tuple(0.5 * ((2 * p1[j]) + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3) for j in (0, 1)))
    out.append(P[-1]); out.sort(); return out

def lookup(dense, x):
    if x <= dense[0][0]: return dense[0][1]
    for i in range(1, len(dense)):
        if dense[i][0] >= x:
            a, b = dense[i - 1], dense[i]; t = (x - a[0]) / ((b[0] - a[0]) or 1); return a[1] + (b[1] - a[1]) * t
    return dense[-1][1]

def outward(bm):
    """recalc_face_normals can come out inside-out on open shells: make the topmost face point up"""
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    top = max(bm.faces, key=lambda f: f.calc_center_median().z)
    if top.normal.z < 0: bmesh.ops.reverse_faces(bm, faces=bm.faces)

def body_rings(m):
    half = m['L'] / 2 + 0.01
    dense = catmull([tuple(p) for p in m['top']])
    R = m['R']; ar = R + 0.07; yb0 = R * 0.95
    fw0, rw0 = m['wheels']
    endF, endR = (m.get('bumperLow') or [yb0, yb0])
    pf = m.get('plan') or [0.31, 0.8, 0.14, 0.82]
    def ybot(x):
        y = yb0
        if x > fw0 + ar: y = yb0 + (endF - yb0) * smooth(fw0 + ar, half, x)
        elif x < rw0 - ar: y = yb0 + (endR - yb0) * smooth(rw0 - ar, -half, x)
        for wx in m['wheels']:
            d = x - wx
            if abs(d) < ar: y = max(y, R + math.sqrt(ar * ar - d * d))
        return y
    def ring(x, endK=0.0):
        t = min(1.0, abs(x) / half)
        tf = max(0.0, (t - pf[1]) / (1 - pf[1])) if x > 0 else max(0.0, (t - pf[3]) / (1 - pf[3]))
        w = (m['W'] / 2) * (1 - (pf[0] if x > 0 else pf[2]) * tf * tf) * (1 - 0.06 * endK)
        yt = max(lookup(dense, max(-m['L'] / 2, min(m['L'] / 2, x))), ybot(x) + 0.12) - 0.03 * endK
        yb = ybot(x) + 0.04 * endK
        h = yt - yb; ysh = yb + h * 0.74
        # half ring, bottom centre -> top centre (w across, y up); index 2 = sill edge, 4 = shoulder edge
        return [(0, yb), (w * 0.9, yb), (w * 0.99, yb + min(0.1, h * 0.2)), (w, yb + h * 0.45), (w, ysh), (w * 0.975, yt - min(0.05, h * 0.12)), (w * 0.88, yt - 0.006), (w * 0.45, yt + 0.008), (0, yt + 0.012)]
    N = 90
    xs = [-half + 2 * half * (0.5 - 0.5 * math.cos(math.pi * i / N)) for i in range(N + 1)]
    return xs, ring, half, dense

def build_body(name, m):
    xs, ring, half, dense = body_rings(m)
    bm = bmesh.new()
    crease = bm.edges.layers.float.new('crease_edge')
    rings = []
    for i, x in enumerate(xs):
        endK = 1.0 if i in (0, len(xs) - 1) else 0.35 if i in (1, len(xs) - 2) else 0.0
        r = ring(x, endK)
        full = r + [(-w, y) for (w, y) in reversed(r[1:-1])]
        rings.append([bm.verts.new((w, x, y)) for (w, y) in full])
    M = len(rings[0]); K = 9
    for i in range(len(rings) - 1):
        for k in range(M):
            a, b = rings[i][k], rings[i][(k + 1) % M]; c, d = rings[i + 1][(k + 1) % M], rings[i + 1][k]
            bm.faces.new((a, b, c, d))
    bm.faces.new(list(reversed(rings[0]))); bm.faces.new(rings[-1])
    outward(bm)
    bm.edges.ensure_lookup_table()
    # crease the shoulder and sill lines lengthwise (index 4/5 and 2 on each side)
    sharp = {2, 4, M - 2, M - 4}
    for i in range(len(rings) - 1):
        for k in sharp:
            e = bm.edges.get((rings[i][k], rings[i + 1][k]))
            if e: e[crease] = 0.75 if k in (4, M - 4) else 0.5
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(name, me); bpy.context.collection.objects.link(ob)
    sub = ob.modifiers.new('sub', 'SUBSURF'); sub.levels = 1; sub.render_levels = 1   # ~14k triangles in all: light enough for traffic
    return ob, ring, half, dense

def build_cabin(name, m, ring):
    g = m['glass']; x0, x1 = g[0][0], g[-1][0]
    top = catmull([tuple(p) for p in g])
    belt0, belt1 = g[0][1], g[-1][1]
    xa, xc = g[1][0], g[-2][0]           # roof front / rear corners
    xb = xa + (xc - xa) * 0.5            # B-pillar
    N = 70; V = 9
    bm = bmesh.new(); rows = []
    def halfw_at(x, y):
        r = ring(x)
        best = None
        for i in range(len(r) - 1):
            (w1, y1), (w2, y2) = r[i], r[i + 1]
            if (y1 - y) * (y2 - y) <= 0 and y1 != y2:
                w = w1 + (w2 - w1) * (y - y1) / (y2 - y1); best = w if best is None or w > best else best
        return best or m['W'] / 2 * 0.9
    for i in range(N + 1):
        x = x0 + (x1 - x0) * i / N
        yb = belt0 + (belt1 - belt0) * (x - x0) / (x1 - x0) - 0.012
        yt = max(lookup(top, x), yb + 0.004)
        wb = halfw_at(x, yb) * 0.985
        wt = wb * (0.86 if m.get('glassTaper') is None else 1 - m['glassTaper'])
        prof = []
        for v in range(V):
            s = v / (V - 1)
            # side rises with tumblehome, rounds over into the roof
            if s < 0.7:
                u = s / 0.7; y = yb + (yt - 0.035 - yb) * u; w = wb + (wt - wb) * u
            else:
                u = (s - 0.7) / 0.3; y = yt - 0.035 + 0.035 * math.sin(u * math.pi / 2); w = wt * (1 - 0.55 * u * u)
            prof.append((w, y))
        prof.append((0, yt + 0.006))
        full = prof + [(-w, y) for (w, y) in reversed(prof[:-1])]
        rows.append((x, yb, yt, [bm.verts.new((w, x, y)) for (w, y) in full]))
    Mv = len(rows[0][3])
    for i in range(N):
        for k in range(Mv - 1):
            a, b = rows[i][3][k], rows[i][3][k + 1]; c, d = rows[i + 1][3][k + 1], rows[i + 1][3][k]
            bm.faces.new((a, b, c, d))
    # close the cabin underneath (hidden by the body) so its normals can be made consistently outward
    bot = [rows[i][3][0] for i in range(N + 1)] + [rows[i][3][-1] for i in range(N, -1, -1)]
    try: bm.faces.new(bot)
    except Exception: pass
    outward(bm)
    bm.faces.ensure_lookup_table()
    # which faces are glass (1) or black trim (2); the rest is body paint (0)
    def xA(y):   # windscreen edge (front of the side glass) at height y: along the front glass segment
        (ax, ay), (bx, by) = g[0], g[1]; t = max(0, min(1, (y - ay) / ((by - ay) or 1))); return ax + (bx - ax) * t
    def xC(y):
        (ax, ay), (bx, by) = g[-1], g[-2]; t = max(0, min(1, (y - ay) / ((by - ay) or 1))); return ax + (bx - ax) * t
    for f in bm.faces:
        c = f.calc_center_median(); n = f.normal
        x, y, w = c.y, c.z, abs(c.x)
        row = min(rows, key=lambda r: abs(r[0] - x)); yb, yt = row[1], row[2]
        mat = 0
        if abs(n.x) > 0.55:                               # sides
            if yb + 0.02 < y < yt - 0.045 and x < xA(y) - 0.045 and x > xC(y) + (m.get('cPillar') or 0.14):
                mat = 2 if abs(x - xb) < 0.05 else 1
        else:                                              # windscreen / rear window by position (not the roof)
            wmax = max(v.co.x for v in row[3])
            if x > xa + 0.03 and w < wmax * 0.93 and y > yb + 0.015: mat = 1
            if x < xc - 0.03 and w < wmax * (m.get('rearGlassW') or 0.8) and y > yb + 0.015: mat = 1
        f.material_index = mat
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(name, me); bpy.context.collection.objects.link(ob)
    for nm, col in (('paint', (0.9, 0.9, 0.92, 1)), ('glass', (0.1, 0.13, 0.16, 1)), ('trim', (0.02, 0.02, 0.02, 1))):
        mt = bpy.data.materials.get(nm) or bpy.data.materials.new(nm); mt.diffuse_color = col; ob.data.materials.append(mt)
    return ob

def surf_maps(body, half):
    dg = bpy.context.evaluated_depsgraph_get(); ev = body.evaluated_get(dg)
    bvh = BVHTree.FromObject(ev, dg)
    def enc(vals): return base64.b64encode(struct.pack('<%dh' % len(vals), *vals)).decode()
    ys = [0.15 + 0.01 * j for j in range(111)]
    ws = [0.01 * i for i in range(101)]
    front, rear = [], []
    for y in ys:
        for w in ws:
            h = bvh.ray_cast(Vector((w, 6, y)), Vector((0, -1, 0))); front.append(int(round(h[0].y * 1000)) if h[0] else -32768)
            h = bvh.ray_cast(Vector((w, -6, y)), Vector((0, 1, 0))); rear.append(int(round(h[0].y * 1000)) if h[0] else -32768)
    xps = [-2.6 + 0.02 * i for i in range(261)]
    side = []
    for y in ys:
        for xp in xps:
            h = bvh.ray_cast(Vector((3, xp, y)), Vector((-1, 0, 0))); side.append(int(round(h[0].x * 1000)) if h[0] else -32768)
    return {'y0': 0.15, 'dy': 0.01, 'ny': len(ys), 'w0': 0, 'dw': 0.01, 'nw': len(ws), 'x0': -2.6, 'dx': 0.02, 'nx': len(xps),
            'front': enc(front), 'rear': enc(rear), 'side': enc(side)}

def build(car):
    m = MODELS[car]
    bpy.ops.wm.read_factory_settings(use_empty=True)
    body, ring, half, dense = build_body('body', m)
    cabin = build_cabin('cabin', m, ring)
    for ob in (body, cabin):
        bpy.context.view_layer.objects.active = ob; ob.select_set(True)
    mt = bpy.data.materials.get('paint') or bpy.data.materials.new('paint'); body.data.materials.append(mt)
    bpy.context.view_layer.update()
    surf = surf_maps(body, half)
    # apply the subdivision, smooth shading split at sharp angles
    bpy.ops.object.select_all(action='DESELECT')
    for ob in (body, cabin):
        bpy.context.view_layer.objects.active = ob; ob.select_set(True)
        for md in list(ob.modifiers): bpy.ops.object.modifier_apply(modifier=md.name)
        bpy.ops.object.shade_smooth_by_angle(angle=math.radians(38))
        ob.select_set(False)
    os.makedirs(os.path.join(ROOT, 'assets/blender'), exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT, f'assets/blender/{car}.blend'))
    for ob in (body, cabin): ob.select_set(True)
    bpy.ops.export_scene.gltf(filepath=os.path.join(ROOT, f'www/models/{car}.glb'), export_format='GLB', use_selection=True,
                              export_yup=True, export_apply=True, export_normals=True, export_texcoords=False, export_materials='EXPORT')
    json.dump(surf, open(os.path.join(ROOT, f'www/models/{car}.surf.json'), 'w'))
    tri = sum(len(p.vertices) - 2 for ob in (body, cabin) for p in ob.data.polygons)
    print('BUILT', car, 'triangles', tri)

args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else ['cobalt']
for car in args: build(car)
