// Builds one 500 m cell of the real Tashkent map (format v2, see scripts/tashkent-map/build.py):
// buildings by type (mahalla houses with tin roofs, panel blocks, shops with storefronts, schools,
// mosques with domes, glass towers, canopies), roads at their mapped width with lane markings and
// kerbs, sidewalks, street trees, bus shelters, metro entrances, traffic lights and shop signs.
//
// Data (c) OpenStreetMap contributors, ODbL 1.0.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { facadeTexture, storefrontAtlas, STOREFRONTS, dayGlassTexture, busStopParts } from './cityday.js?v=90b4fc68';

export const WALK = 3.2;
const BUCKET = 25;
const UP = new THREE.Vector3(0, 1, 0);
export const hashStr = (x, z) => { const h = Math.imul((x * 73856093) ^ (z * 19349663), 2654435761) >>> 0; return h / 4294967296; };

// ------------------------------------------------------------------ shared materials (made once)
function canvas(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
// asphalt: fine aggregate, darker tyre tracks, a few sealed cracks and patches; tiles every 7 m in world space
function asphalt(base, worn) {
  return canvas(256, 256, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    let r = 7; const rnd = () => ((r = (r * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 9000; i++) { const v = 50 + rnd() * 70; g.fillStyle = `rgba(${v},${v},${v + 4},${0.18 + rnd() * 0.25})`; g.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 1.4, 1 + rnd() * 1.4); }
    for (let i = 0; i < 6; i++) { g.fillStyle = `rgba(0,0,0,${0.05 + rnd() * 0.05})`; g.fillRect(rnd() * w, rnd() * h, 30 + rnd() * 60, 20 + rnd() * 50); }
    if (worn) for (let i = 0; i < 5; i++) { g.fillStyle = `rgba(150,148,140,${0.08 + rnd() * 0.08})`; g.fillRect(rnd() * w, rnd() * h, 20 + rnd() * 40, 14 + rnd() * 30); }
    g.strokeStyle = 'rgba(18,18,20,0.55)'; g.lineWidth = 1.4;
    for (let i = 0; i < 4; i++) { let x = rnd() * w, y = rnd() * h; g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 6; k++) { x += (rnd() - 0.5) * 30; y += rnd() * 22; g.lineTo(x, y); } g.stroke(); }
  });
}
function paving() {
  return canvas(128, 128, (g, w, h) => {
    g.fillStyle = '#b9b3a6'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 16) for (let x = (y / 16) % 2 ? 8 : 0; x < w; x += 16) {
      const v = 170 + Math.random() * 30; g.fillStyle = `rgb(${v},${v - 5},${v - 14})`; g.fillRect(x + 1, y + 1, 14, 14);
    }
  });
}
function metalFacade() {
  return canvas(128, 256, (g, w, h) => {
    g.fillStyle = '#b9bcbf'; g.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 6) { g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(x, 0, 2, h); }
    g.fillStyle = 'rgba(60,70,80,0.55)'; for (let x = 10; x < w; x += 42) g.fillRect(x, h * 0.86, 26, h * 0.14);
  });
}
function letterTex(text, bg, fg = '#ffffff', w = 128, h = 128, font = 'bold 96px Arial, sans-serif') {
  return canvas(w, h, (g) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = font; g.fillText(text, w / 2, h / 2 + 6);
  });
}

// look slots: [style, wall colour, uv metres per texture width]
const LOOKS = [
  ['brick', '#e0c08c'], ['brick', '#c98a5f'], ['arch', '#eee3cc'], ['arch', '#e6dccb'],     // 0-3 houses
  ['panel', '#e6e0d2'], ['panel', '#d5dadf'], ['panel', '#e9dfcf'], ['band', '#eceae4'],    // 4-7 blocks
  ['band', '#efe7d6'], ['metal', ''], ['glass', ''], ['arch', '#f1ece2'],                  // 8-11 public / industry / glass / religious
];
const LOOK_FOR = [[0, 1, 2, 3, 0, 2], [4, 5, 6, 4, 5, 7], [7, 8, 5], [8, 2, 7], [9], [11], [10, 7], [9]];

export function makeMaterials() {
  const walls = LOOKS.map(([st, c], i) => {
    const map = st === 'metal' ? metalFacade() : st === 'glass' ? dayGlassTexture() : facadeTexture(st, c, i + 3);
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    return new THREE.MeshLambertMaterial({ map, vertexColors: true });
  });
  const roadMat = (tex, k) => new THREE.MeshStandardMaterial({ map: tex, roughness: 0.82, metalness: 0, envMapIntensity: 0.25, polygonOffset: true, polygonOffsetFactor: -1 - k, polygonOffsetUnits: -1 - k });
  const a0 = asphalt('#4d4e4b', true), a1 = asphalt('#4a4b4d', false), a2 = asphalt('#424448', false);
  return {
    walls,
    store: new THREE.MeshLambertMaterial({ map: storefrontAtlas() }),
    roof: new THREE.MeshLambertMaterial({ vertexColors: true }),
    tin: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.35 }),
    dome: new THREE.MeshStandardMaterial({ color: 0x2fa9c0, roughness: 0.35, metalness: 0.1 }),
    // roads: [kind][level] level 0 ground, 1 bridge (drawn over crossings), 2 tunnel (under)
    road: [a0, a1, a2].map((t, kind) => [roadMat(t, kind), roadMat(t, kind + 4), roadMat(t, -0.5)]),
    marking: new THREE.MeshStandardMaterial({ color: 0xeceeea, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -8, polygonOffsetUnits: -8 }),
    kerb: new THREE.MeshLambertMaterial({ color: 0xc9c6bd }),
    walk: new THREE.MeshStandardMaterial({ map: paving(), roughness: 0.92, envMapIntensity: 0.2, polygonOffset: true, polygonOffsetFactor: -0.5, polygonOffsetUnits: -0.5 }),
    props: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.2 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x9fc4d6, transparent: true, opacity: 0.35, roughness: 0.05, depthWrite: false }),
    metroM: new THREE.MeshBasicMaterial({ map: letterTex('M', '#1557b0') }),
    busSign: null,
  };
}

// ------------------------------------------------------------------ building pieces
const ROOF_TIN = ['#5f7f6a', '#8b4a3c', '#9aa1a8', '#6d7f95', '#a8a39a', '#4f6d7a'];
function hipRoof(xs, zs, h, out, col) {
  // oriented box from the longest edge, then a hip roof over it (1.1 - 1.6 m high, 0.3 m overhang)
  const n = xs.length;
  let bi = 0, bl = 0;
  for (let i = 0; i < n; i++) { const j = (i + 1) % n, l = Math.hypot(xs[j] - xs[i], zs[j] - zs[i]); if (l > bl) { bl = l; bi = i; } }
  const j = (bi + 1) % n;
  const ux = (xs[j] - xs[bi]) / bl, uz = (zs[j] - zs[bi]) / bl, vx = -uz, vz = ux;
  let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
  for (let i = 0; i < n; i++) { const a = xs[i] * ux + zs[i] * uz, b = xs[i] * vx + zs[i] * vz; a0 = Math.min(a0, a); a1 = Math.max(a1, a); b0 = Math.min(b0, b); b1 = Math.max(b1, b); }
  a0 -= 0.3; a1 += 0.3; b0 -= 0.3; b1 += 0.3;
  const L = a1 - a0, W = b1 - b0;
  const rise = Math.min(1.6, Math.max(1.0, W * 0.16));
  const inset = Math.min(L / 2, W / 2);
  const P = (a, b, y) => [ux * a + vx * b, y, uz * a + vz * b];
  const c1 = P(a0, b0, h), c2 = P(a1, b0, h), c3 = P(a1, b1, h), c4 = P(a0, b1, h);
  const bm = (b0 + b1) / 2;
  const r1 = P(a0 + inset, bm, h + rise), r2 = P(a1 - inset, bm, h + rise);
  const tri = (p, q, r) => { out.p.push(...p, ...q, ...r); for (let k = 0; k < 3; k++) out.c.push(col.r, col.g, col.b); };
  // faces (wound so they face outwards/up; normals recomputed later)
  tri(c1, r1, c2); tri(c2, r1, r2);
  tri(c3, r2, c4); tri(c4, r2, r1);
  tri(c2, r2, c3); tri(c4, r1, c1);
}

function pushQuad(arr, a, b, c, d) { arr.push(...a, ...b, ...c, ...a, ...c, ...d); }

// ------------------------------------------------------------------ the cell
export function buildCell(city, k, data) {
  const { mats, d } = city;
  const mobile = !!d.mobile;
  const group = new THREE.Group();
  const cell = { group, buildings: [], buckets: new Map(), roads: [], named: [], objects: [], lampMesh: null, segs: [] };
  const bucket = (bk) => { let l = cell.buckets.get(bk); if (!l) cell.buckets.set(bk, (l = { edges: [], blds: new Set() })); return l; };
  const skip = city.landmarkSkip || [];

  // ---------------- buildings
  const W = mats.walls.map(() => ({ p: [], u: [], c: [] }));
  const S = { p: [], u: [] };            // storefront strips
  const roof = { p: [], c: [] }, tin = { p: [], c: [] };
  const domes = [];
  const col = new THREE.Color(), rcol = new THREE.Color();
  for (const b of data.b || []) {
    const [h0, typ, wallC, roofC, flat] = b;
    const n = flat.length / 2;
    if (n < 3) continue;
    const xs = [], zs = [];
    for (let i = 0; i < n; i++) { xs.push(flat[i * 2]); zs.push(flat[i * 2 + 1]); }
    let cx = 0, cz = 0;
    for (let i = 0; i < n; i++) { cx += xs[i]; cz += zs[i]; }
    cx /= n; cz /= n;
    if (skip.some((s) => (s.x - cx) ** 2 + (s.z - cz) ** 2 < s.r2)) continue;   // a modelled landmark stands here
    const hv = hashStr(Math.round(xs[0]), Math.round(zs[0]));
    const h = h0;
    const opts = LOOK_FOR[typ] || LOOK_FOR[0];
    const look = opts[Math.floor(hv * opts.length)];
    const sink = W[look];
    // tint: tagged wall colour, else a small random shade so a street isn't one paint tin
    if (wallC) col.set(wallC).lerp(new THREE.Color(1, 1, 1), 0.45);
    else { const t = 0.9 + hv * 0.14; col.setRGB(t, t * (0.98 + hv * 0.03), t * (0.95 + ((hv * 13) % 1) * 0.06)); }
    let side = 0;
    for (let i = 0; i < n; i++) { const j = (i + 1) % n; side += -(zs[j] - zs[i]) * ((xs[i] + xs[j]) / 2 - cx) + (xs[j] - xs[i]) * ((zs[i] + zs[j]) / 2 - cz); }
    const flip = side < 0;
    const isShop = typ === 2 && h >= 5;
    const yBase = isShop ? 3.6 : 0;
    let run = 0;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    const texW = look === 10 ? 24 : 18, texH = look === 10 ? 48 : 36;
    if (typ !== 7) for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const ax = xs[i], az = zs[i], bx = xs[j], bz = zs[j];
      const len = Math.hypot(bx - ax, bz - az);
      const u0 = run / texW, u1 = (run + len) / texW;
      run += len;
      const A = [ax, yBase, az], B = [bx, yBase, bz], B1 = [bx, h, bz], A1 = [ax, h, az];
      const vb = (h - yBase) / texH;
      const quad = flip ? [[A, u0, vb], [B1, u1, 0], [B, u1, vb], [A, u0, vb], [A1, u0, 0], [B1, u1, 0]]
        : [[A, u0, vb], [B, u1, vb], [B1, u1, 0], [A, u0, vb], [B1, u1, 0], [A1, u0, 0]];
      for (const [p, uu, vv] of quad) { sink.p.push(...p); sink.u.push(uu, 1 - vv); sink.c.push(col.r, col.g, col.b); }
      if (isShop) {
        // ground floor: shop windows from the storefront atlas, one row per wall
        const row = Math.floor(hashStr(Math.round(ax), Math.round(bz)) * STOREFRONTS.length);
        const vn = STOREFRONTS.length, v0 = 1 - (row + 1) / vn + 0.003, v1 = 1 - row / vn - 0.003;
        const reps = Math.max(1, Math.round(len / 6));
        const a = [ax, 0, az], bb = [bx, 0, bz], b1 = [bx, 3.6, bz], a1 = [ax, 3.6, az];
        const q = flip ? [[a, 0, v0], [b1, reps, v1], [bb, reps, v0], [a, 0, v0], [a1, 0, v1], [b1, reps, v1]]
          : [[a, 0, v0], [bb, reps, v0], [b1, reps, v1], [a, 0, v0], [b1, reps, v1], [a1, 0, v1]];
        for (const [p, uu, vv] of q) { S.p.push(...p); S.u.push(uu, vv); }
      }
      minX = Math.min(minX, ax); maxX = Math.max(maxX, ax); minZ = Math.min(minZ, az); maxZ = Math.max(maxZ, az);
    } else for (let i = 0; i < n; i++) { minX = Math.min(minX, xs[i]); maxX = Math.max(maxX, xs[i]); minZ = Math.min(minZ, zs[i]); maxZ = Math.max(maxZ, zs[i]); }
    // roof: flat slab (with a tin hip roof on small mahalla houses)
    rcol.set(roofC || (typ === 0 ? '#8d8a84' : '#9a978f')).multiplyScalar(0.88 + hv * 0.1);
    const contour = xs.map((x, i) => new THREE.Vector2(x, zs[i]));
    let tris;
    try { tris = THREE.ShapeUtils.triangulateShape(contour, []); } catch (e) { tris = []; }
    for (const [a, b2, c2] of tris) {
      const P = [contour[a], contour[b2], contour[c2]];
      const ny = (P[1].y - P[0].y) * (P[2].x - P[0].x) - (P[1].x - P[0].x) * (P[2].y - P[0].y);
      const order = ny >= 0 ? [0, 1, 2] : [0, 2, 1];
      for (const o of order) { roof.p.push(P[o].x, h, P[o].y); roof.c.push(rcol.r, rcol.g, rcol.b); }
      if (typ === 7) for (const o of [order[0], order[2], order[1]]) { roof.p.push(P[o].x, h - 0.25, P[o].y); roof.c.push(rcol.r * 0.7, rcol.g * 0.7, rcol.b * 0.7); }
    }
    const area = (maxX - minX) * (maxZ - minZ);
    if (typ === 0 && n <= 8 && area < 600 && h < 9 && !mobile) hipRoof(xs, zs, h, tin, new THREE.Color(roofC || ROOF_TIN[Math.floor(hv * ROOF_TIN.length)]));
    if (typ === 5 && area > 100) domes.push([cx, h, cz, Math.min(9, Math.sqrt(area) / 3.2)]);
    if (typ === 7) continue;            // fuel-station / market canopies: drive under them
    const rec = { h, xs, zs, minX, maxX, minZ, maxZ };
    cell.buildings.push(rec);
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const e = [xs[i], zs[i], xs[j], zs[j], rec];
      const bx0 = Math.floor(Math.min(xs[i], xs[j]) / BUCKET), bx1 = Math.floor(Math.max(xs[i], xs[j]) / BUCKET);
      const bz0 = Math.floor(Math.min(zs[i], zs[j]) / BUCKET), bz1 = Math.floor(Math.max(zs[i], zs[j]) / BUCKET);
      for (let x = bx0; x <= bx1; x++) for (let z = bz0; z <= bz1; z++) { const l = bucket(x * 100003 + z); l.edges.push(e); l.blds.add(rec); }
    }
    for (let x = Math.floor(minX / BUCKET); x <= Math.floor(maxX / BUCKET); x++) for (let z = Math.floor(minZ / BUCKET); z <= Math.floor(maxZ / BUCKET); z++) bucket(x * 100003 + z).blds.add(rec);
  }
  const addMesh = (p, mat, extra = {}, { cast = false } = {}) => {
    if (!p.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    if (extra.u) g.setAttribute('uv', new THREE.Float32BufferAttribute(extra.u, 2));
    if (extra.c) g.setAttribute('color', new THREE.Float32BufferAttribute(extra.c, 3));
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, mat);
    m.receiveShadow = true; m.castShadow = cast;
    group.add(m);
    return m;
  };
  W.forEach((w, i) => addMesh(w.p, mats.walls[i], { u: w.u, c: w.c }));
  addMesh(S.p, mats.store, { u: S.u });
  addMesh(roof.p, mats.roof, { c: roof.c });
  addMesh(tin.p, mats.tin, { c: tin.c });
  if (domes.length) {
    const dg = new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    const im = new THREE.InstancedMesh(dg, mats.dome, domes.length);
    const m4 = new THREE.Matrix4();
    domes.forEach(([x, y, z, r], i) => { m4.makeScale(r, r * 1.15, r).setPosition(x, y, z); im.setMatrixAt(i, m4); });
    group.add(im);
  }

  // ---------------- roads
  // junctions: a vertex shared by two road pieces (or used twice by one) — markings and kerbs stop short of it
  const vkey = (x, z) => `${Math.round(x)},${Math.round(z)}`;
  const vcount = new Map(), vwide = new Map();
  const runs = (data.r || []).map(([kind, width, flags, layer, name, flat]) => {
    const pts = [];
    for (let i = 0; i < flat.length; i += 2) pts.push([flat[i], flat[i + 1]]);
    return { kind, width, oneway: !!(flags & 1), bridge: !!(flags & 2), tunnel: !!(flags & 4), round: !!(flags & 8), layer, name, pts };
  });
  for (const r of runs) r.pts.forEach(([x, z], i) => {
    const key = vkey(x, z);
    vcount.set(key, (vcount.get(key) || 0) + (i === 0 || i === r.pts.length - 1 ? 1 : 2));
    vwide.set(key, Math.max(vwide.get(key) || 0, r.width));
  });
  const junction = [];
  for (const [key, c] of vcount) if (c >= 3) { const [x, z] = key.split(',').map(Number); junction.push([x, z, vwide.get(key)]); }
  const nearJunction = (x, z, extra) => {
    for (const [jx, jz, w] of junction) { const r = w * 0.6 + extra; if ((x - jx) ** 2 + (z - jz) ** 2 < r * r) return true; }
    return false;
  };
  const surf = [0, 1, 2].map(() => [0, 1, 2].map(() => ({ p: [], u: [] })));
  const walkP = [], walkU = [], markP = [], kerbP = [];
  const segsByKind = [[], [], []];
  const treePts = [];
  const disc = (out, x, z, rad, y, N = 10) => {
    for (let i = 0; i < N; i++) {
      const a0 = (i / N) * Math.PI * 2, a1 = ((i + 1) / N) * Math.PI * 2;
      out.p.push(x, y, z, x + Math.cos(a1) * rad, y, z + Math.sin(a1) * rad, x + Math.cos(a0) * rad, y, z + Math.sin(a0) * rad);
      out.u.push(x / 7, z / 7, (x + Math.cos(a1) * rad) / 7, (z + Math.sin(a1) * rad) / 7, (x + Math.cos(a0) * rad) / 7, (z + Math.sin(a0) * rad) / 7);
    }
  };
  const YK = [0.03, 0.04, 0.05];
  for (const r of runs) {
    const lvl = r.tunnel ? 2 : r.bridge ? 1 : 0;
    const out = surf[r.kind][lvl];
    const w = r.width / 2, y = YK[r.kind] + (lvl === 1 ? 0.02 : lvl === 2 ? -0.01 : 0);
    const P = r.pts;
    for (let i = 0; i < P.length - 1; i++) {
      const [ax, az] = P[i], [bx, bz] = P[i + 1];
      const len = Math.hypot(bx - ax, bz - az);
      if (len < 0.05) continue;
      const dx = (bx - ax) / len, dz = (bz - az) / len, nx = -dz * w, nz = dx * w;
      out.p.push(ax + nx, y, az + nz, bx + nx, y, bz + nz, bx - nx, y, bz - nz, ax + nx, y, az + nz, bx - nx, y, bz - nz, ax - nx, y, az - nz);
      for (const [x, z] of [[ax + nx, az + nz], [bx + nx, bz + nz], [bx - nx, bz - nz], [ax + nx, az + nz], [bx - nx, bz - nz], [ax - nx, az - nz]]) out.u.push(x / 7, z / 7);
      disc(out, ax, az, w, y); if (i === P.length - 2) disc(out, bx, bz, w, y);
      const seg = { ax, az, bx, bz, len, kind: r.kind, width: r.width, oneway: r.oneway, name: r.name, tunnel: r.tunnel, bridge: r.bridge, keys: [vkey(ax, az), vkey(bx, bz)] };
      segsByKind[r.kind].push([ax, az, bx, bz]);
      if (r.name) cell.named.push(seg);
      if (r.kind >= 1 && !r.tunnel) {
        cell.roads.push(seg);
        for (const end of [0, 1]) {
          let list = city.nodes.get(seg.keys[end]);
          if (!list) city.nodes.set(seg.keys[end], (list = []));
          list.push({ seg, end });
        }
      }
      // sidewalk (paved, under the carriageway) on collector and main roads
      if (r.kind >= 1 && !r.tunnel && !r.bridge) {
        const sw = w + WALK, sx = -dz * sw, sz = dx * sw;
        const q = [[ax + sx, az + sz], [bx + sx, bz + sz], [bx - sx, bz - sz], [ax + sx, az + sz], [bx - sx, bz - sz], [ax - sx, az - sz]];
        for (const [x, z] of q) { walkP.push(x, 0.015, z); walkU.push(x / 2.5, z / 2.5); }
        for (const [x, z] of [[ax, az], [bx, bz]]) for (let s = 0; s < 8; s++) {
          const a0 = (s / 8) * Math.PI * 2, a1 = ((s + 1) / 8) * Math.PI * 2;
          for (const [px, pz] of [[x, z], [x + Math.cos(a1) * sw, z + Math.sin(a1) * sw], [x + Math.cos(a0) * sw, z + Math.sin(a0) * sw]]) { walkP.push(px, 0.015, pz); walkU.push(px / 2.5, pz / 2.5); }
        }
      }
      // markings + kerbs, walked in 1 m steps so they stop short of junctions
      const marks = r.kind >= 1 || r.width >= 7;
      const lines = [];
      if (marks && !r.round) {
        if (r.oneway) {
          const lanes = Math.max(1, Math.round(r.width / 3.3)), lw = r.width / lanes;
          for (let j = 1; j < lanes; j++) lines.push([-w + j * lw, 'dash']);
        } else {
          lines.push([0, r.kind === 2 ? 'solid' : 'dash']);
          const per = Math.max(1, Math.floor(w / 3.0)), lw = w / per;
          for (let j = 1; j < per; j++) { lines.push([j * lw, 'dash']); lines.push([-j * lw, 'dash']); }
        }
        if (r.kind === 2) { lines.push([w - 0.35, 'solid']); lines.push([-w + 0.35, 'solid']); }
      }
      const kerb = r.kind >= 1 && !r.tunnel && !r.bridge;
      const step = 1;
      if (lines.length || kerb) for (let t = 0; t < len; t += step) {
        const t1 = Math.min(len, t + step);
        const mx = ax + dx * (t + t1) / 2, mz = az + dz * (t + t1) / 2;
        if (nearJunction(mx, mz, 2)) continue;
        const x0 = ax + dx * t, z0 = az + dz * t, x1 = ax + dx * t1, z1 = az + dz * t1;
        for (const [off, kind] of lines) {
          if (kind === 'dash' && ((t + i * 3.7) % 9) > 3) continue;
          const lw2 = 0.07, ox = -dz * off, oz = dx * off, px = -dz * lw2, pz = dx * lw2, yy = y + 0.006;
          pushQuad(markP, [x0 + ox + px, yy, z0 + oz + pz], [x1 + ox + px, yy, z1 + oz + pz], [x1 + ox - px, yy, z1 + oz - pz], [x0 + ox - px, yy, z0 + oz - pz]);
        }
        if (kerb && !nearJunction(mx, mz, 4)) for (const sd of [-1, 1]) {
          const o1 = (w + 0.02) * sd, o2 = (w + 0.27) * sd, H = 0.14;
          const ax1 = x0 - dz * o1, az1 = z0 + dx * o1, bx1 = x1 - dz * o1, bz1 = z1 + dx * o1;
          const ax2 = x0 - dz * o2, az2 = z0 + dx * o2, bx2 = x1 - dz * o2, bz2 = z1 + dx * o2;
          pushQuad(kerbP, [ax1, H, az1], [bx1, H, bz1], [bx2, H, bz2], [ax2, H, az2]);       // top
          pushQuad(kerbP, [ax1, 0, az1], [bx1, 0, bz1], [bx1, H, bz1], [ax1, H, az1]);       // face towards the road
        }
      }
      // plane trees along collector and main roads; fruit trees along mahalla lanes
      if (r.kind >= 1 && !r.tunnel && !r.bridge && len > 12) {
        const off = w + WALK - 0.9;
        for (let t = 6; t < len - 6; t += 12 + hashStr(Math.round(ax + t), Math.round(az)) * 6) {
          for (const sd of [-1, 1]) { const x = ax + dx * t - dz * off * sd, z = az + dz * t + dx * off * sd; if (!nearJunction(x, z, 6)) treePts.push([x, z, 0]); }
        }
      } else if (r.kind === 0 && len > 12 && !r.tunnel) {
        // mahalla lanes and courtyards: mulberries, apricots and elms on both sides, irregular
        for (let t = 6; t < len - 6; t += 10 + hashStr(Math.round(ax), Math.round(az + t)) * 9) {
          for (const sd of [-1, 1]) {
            if (hashStr(Math.round(t * sd), Math.round(ax + az)) < 0.35) continue;
            const off = w + 1.4 + hashStr(Math.round(az), Math.round(t)) * 1.6;
            const x = ax + dx * t - dz * off * sd, z = az + dz * t + dx * off * sd;
            if (!nearJunction(x, z, 4)) treePts.push([x, z, 1]);
          }
        }
      }
    }
  }
  surf.forEach((lv, kind) => lv.forEach((o, l) => {
    if (!o.p.length) return;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(o.p, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(o.u, 2));
    const a = g.attributes.position.array, uv = g.attributes.uv.array;
    for (let i = 0; i < a.length; i += 9) {        // every triangle faces up
      const ny = (a[i + 5] - a[i + 2]) * (a[i + 6] - a[i]) - (a[i + 3] - a[i]) * (a[i + 8] - a[i + 2]);
      if (ny < 0) {
        for (let q = 0; q < 3; q++) { const t = a[i + 3 + q]; a[i + 3 + q] = a[i + 6 + q]; a[i + 6 + q] = t; }
        const ui = (i / 9) * 6; for (let q = 0; q < 2; q++) { const t = uv[ui + 2 + q]; uv[ui + 2 + q] = uv[ui + 4 + q]; uv[ui + 4 + q] = t; }
      }
    }
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, mats.road[kind][l]);
    m.receiveShadow = true;
    group.add(m);
  }));
  const fixUp = (arr, uv) => {
    for (let i = 0; i < arr.length; i += 9) {
      const ny = (arr[i + 5] - arr[i + 2]) * (arr[i + 6] - arr[i]) - (arr[i + 3] - arr[i]) * (arr[i + 8] - arr[i + 2]);
      if (ny < 0) {
        for (let q = 0; q < 3; q++) { const t = arr[i + 3 + q]; arr[i + 3 + q] = arr[i + 6 + q]; arr[i + 6 + q] = t; }
        if (uv) { const ui = (i / 9) * 6; for (let q = 0; q < 2; q++) { const t = uv[ui + 2 + q]; uv[ui + 2 + q] = uv[ui + 4 + q]; uv[ui + 4 + q] = t; } }
      }
    }
  };
  fixUp(walkP, walkU); fixUp(markP);
  addMesh(walkP, mats.walk, { u: walkU });
  addMesh(markP, mats.marking);
  if (kerbP.length) {
    // kerb faces: make each quad face away from the carriageway is hard to know here — draw both sides
    const m = addMesh(kerbP, mats.kerb);
    if (m) m.material.side = THREE.DoubleSide;
  }
  cell.segs = segsByKind.map((s, kind) => [kind, s]).filter(([, s]) => s.length);

  // ---------------- trees
  const inBuilding = (x, z, pad = 2) => {
    const b = cell.buckets.get(Math.floor(x / BUCKET) * 100003 + Math.floor(z / BUCKET));
    if (!b) return false;
    for (const r2 of b.blds) if (x > r2.minX - pad && x < r2.maxX + pad && z > r2.minZ - pad && z < r2.maxZ + pad) return true;
    return false;
  };
  const pts = treePts.filter(([x, z, fruit]) => !inBuilding(x, z, fruit ? 0.6 : 2)).filter((_, i) => !mobile || i % 2 === 0).slice(0, mobile ? 110 : 280);
  if (pts.length) {
    const trunk = new THREE.InstancedMesh(city.treeGeo.trunk, mats.trunk, pts.length);
    const crown = new THREE.InstancedMesh(city.treeGeo.crown, mats.crown, pts.length);
    const tm = new THREE.Matrix4(), tq = new THREE.Quaternion(), tc = new THREE.Color();
    pts.forEach(([x, z, fruit], i) => {
      const hv = hashStr(Math.round(x * 3), Math.round(z * 3)), sc = fruit ? 0.55 + hv * 0.25 : 0.8 + hv * 0.55;
      tm.compose(new THREE.Vector3(x, 0, z), tq.setFromAxisAngle(UP, hv * 6.28), new THREE.Vector3(sc, sc * (0.9 + hv * 0.25), sc));
      trunk.setMatrixAt(i, tm); crown.setMatrixAt(i, tm);
      tc.setHSL(fruit ? 0.25 + hv * 0.06 : 0.22 + hv * 0.08, 0.42, 0.28 + hv * 0.1);
      crown.setColorAt(i, tc);
    });
    trunk.castShadow = crown.castShadow = true;
    group.add(trunk, crown);
    cell.trees = [trunk, crown];
  }

  // ---------------- street objects
  const allSegs = runs.flatMap((r) => r.tunnel ? [] : r.pts.slice(0, -1).map((p, i) => ({ ax: p[0], az: p[1], bx: r.pts[i + 1][0], bz: r.pts[i + 1][1], width: r.width, kind: r.kind })));
  const pp = [], pc = [], lampPos = [], glassG = [], mSigns = [], busSigns = [];
  const c3 = new THREE.Color(), m4 = new THREE.Matrix4(), q = new THREE.Quaternion();
  const addBox = (x, z, rot, [px, py, pz, sx, sy, sz, color]) => {
    m4.compose(new THREE.Vector3(px, py, pz).applyAxisAngle(UP, rot).add(new THREE.Vector3(x, 0.02, z)), q.setFromAxisAngle(UP, rot), new THREE.Vector3(sx, sy, sz));
    const g = city.unitBox, pos = g.attributes.position, idx = g.index.array;
    c3.set(color);
    for (let i = 0; i < idx.length; i++) { const v = new THREE.Vector3().fromBufferAttribute(pos, idx[i]).applyMatrix4(m4); pp.push(v.x, v.y, v.z); pc.push(c3.r, c3.g, c3.b); }
  };
  const place = (x, z, model) => {
    const g = model.clone().applyMatrix4(m4);
    return g;
  };
  void place;
  for (const o of data.o || []) {
    const [type, name, ox, oz, extra, station] = o;
    if (type === 'signal') {
      const parts = city.models.signal;
      const f = faceRoad(ox, oz, allSegs), x = f.x, z = f.z, rot = f.rot + Math.PI;   // the signal model faces -z
      for (const part of parts) {
        const [shape, px, py, pz, sx, sy, sz, color] = part;
        if (shape === 'sphere') { lampPos.push([x, z, rot, px, py, pz, color]); continue; }
        addBox(x, z, rot, [px, py, pz, sx, sy, sz, color]);
      }
      city.signalList.push({ x, z, cell: k, phase: hashStr(Math.round(x), Math.round(z)) * 32 });
      continue;
    }
    const { x, z, rot } = faceRoad(ox, oz, allSegs, type === 'bus' ? 1.2 : 2.5);
    if (type === 'bus') {
      // shelter set back from the kerb, open side to the road, sign pole at the kerb
      const sp = city.busParts;
      m4.compose(new THREE.Vector3(0, 0, -1.6).applyAxisAngle(UP, rot).add(new THREE.Vector3(x, 0.02, z)), q.setFromAxisAngle(UP, rot), new THREE.Vector3(1, 1, 1));
      for (const g of sp.frame) { const gg = g.clone().applyMatrix4(m4); const a = gg.attributes.position.array, cc = gg.attributes.color.array; const ix = gg.index ? gg.index.array : null; const cnt = ix ? ix.length : a.length / 3; for (let i = 0; i < cnt; i++) { const vi = ix ? ix[i] : i; pp.push(a[vi * 3], a[vi * 3 + 1], a[vi * 3 + 2]); pc.push(cc[vi * 3], cc[vi * 3 + 1], cc[vi * 3 + 2]); } }
      for (const g of sp.glass) glassG.push(g.clone().applyMatrix4(m4));
      busSigns.push(sp.sign.clone().applyMatrix4(m4));
      addBox(x, z, rot, [2.6, 1.4, 0.2, 0.08, 2.8, 0.08, '#6c757d']);
      addBox(x, z, rot, [2.6, 2.75, 0.2, 0.55, 0.55, 0.05, '#1f63b5']);
    } else if (type === 'entrance') {
      // underground passage: low walls round the stair opening, a canopy and the blue M
      for (const [px, pz, sx, sz] of [[-1.6, 0, 0.25, 4.2], [1.6, 0, 0.25, 4.2], [0, -2.1, 3.4, 0.25]]) addBox(x, z, rot, [px, 0.55, pz - 1.2, sx, 1.1, sz, '#c8c3b8']);
      addBox(x, z, rot, [0, 0.03, -1.2, 3.0, 0.06, 4.0, '#2a2b2e']);
      addBox(x, z, rot, [0, 2.9, -1.2, 3.8, 0.18, 4.6, '#1d4f8f']);
      for (const px of [-1.75, 1.75]) for (const pz of [0.9, -3.3]) addBox(x, z, rot, [px, 1.45, pz, 0.12, 2.9, 0.12, '#8f969e']);
      addBox(x, z, rot, [0, 3.35, 1.0, 0.1, 0.7, 0.1, '#8f969e']);
      m4.compose(new THREE.Vector3(0, 3.45, 1.07).applyAxisAngle(UP, rot).add(new THREE.Vector3(x, 0, z)), q.setFromAxisAngle(UP, rot), new THREE.Vector3(0.9, 0.9, 1));
      mSigns.push(new THREE.PlaneGeometry(1, 1).applyMatrix4(m4));
      m4.compose(new THREE.Vector3(0, 3.45, 0.93).applyAxisAngle(UP, rot).add(new THREE.Vector3(x, 0, z)), q.setFromAxisAngle(UP, rot + Math.PI), new THREE.Vector3(0.9, 0.9, 1));
      mSigns.push(new THREE.PlaneGeometry(1, 1).applyMatrix4(m4));
    } else if (type === 'metro') {
      // the station itself: a tall pylon with the M (its entrances are separate objects)
      addBox(x, z, rot, [0, 2.4, 0, 0.5, 4.8, 0.5, '#d9dde2']);
      m4.compose(new THREE.Vector3(0, 5.2, 0.27).applyAxisAngle(UP, rot).add(new THREE.Vector3(x, 0, z)), q.setFromAxisAngle(UP, rot), new THREE.Vector3(1.4, 1.4, 1));
      mSigns.push(new THREE.PlaneGeometry(1, 1).applyMatrix4(m4));
      m4.compose(new THREE.Vector3(0, 5.2, -0.27).applyAxisAngle(UP, rot).add(new THREE.Vector3(x, 0, z)), q.setFromAxisAngle(UP, rot + Math.PI), new THREE.Vector3(1.4, 1.4, 1));
      mSigns.push(new THREE.PlaneGeometry(1, 1).applyMatrix4(m4));
      addBox(x, z, rot, [0, 5.2, 0, 1.5, 1.5, 0.5, '#1557b0']);
    }
    const label = type === 'bus' ? `Bekat · ${name || 'avtobus'}` : type === 'metro' ? `Ⓜ ${name} metro bekati` : `Ⓜ ${name}${extra ? ` · ${extra}-kirish` : ''}`;
    const s = city.labelSprite(label, type === 'bus' ? '#1f5f9a' : '#1d4f8f');
    s.position.set(x, type === 'metro' ? 6.8 : 4.2, z);
    s.visible = false;
    group.add(s);
    cell.objects.push({ type, name, x, z, rot, sprite: s, station: station || (type === 'metro' ? name : null), ref: type === 'entrance' ? extra : '' });
  }
  if (pp.length) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pp, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(pc, 3));
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, mats.props);
    m.castShadow = true; m.receiveShadow = true;
    group.add(m);
  }
  if (glassG.length) group.add(new THREE.Mesh(mergeGeometries(glassG.map((g) => g.index ? g.toNonIndexed() : g)), mats.glass));
  if (mSigns.length) group.add(new THREE.Mesh(mergeGeometries(mSigns), mats.metroM));
  if (busSigns.length) group.add(new THREE.Mesh(mergeGeometries(busSigns), mats.busSign));
  if (lampPos.length) {
    const lamps = new THREE.InstancedMesh(city.lampGeo, mats.lamp, lampPos.length);
    lampPos.forEach(([x, z, rot, px, py, pz], i) => {
      m4.compose(new THREE.Vector3(px, py, pz).applyAxisAngle(UP, rot).add(new THREE.Vector3(x, 0.02, z)), q.setFromAxisAngle(UP, rot), new THREE.Vector3(0.19, 0.19, 0.12));
      lamps.setMatrixAt(i, m4);
      lamps.setColorAt(i, city.lightOff);
    });
    cell.lampMesh = lamps;
    cell.lampInfo = lampPos.map((l) => ({ x: l[0], z: l[1], color: l[6] }));
    group.add(lamps);
  }

  // ---------------- shop signs: the real names of shops, cafés and pharmacies on the nearest wall
  const pois = (data.p || []).filter((p) => p[0] !== 'maktab' && p[0] !== "bog'cha").slice(0, mobile ? 10 : 24);
  if (pois.length) {
    const rows = pois.length, cw = 512, ch = 72;
    const cv = document.createElement('canvas'); cv.width = cw; cv.height = ch * rows;
    const g = cv.getContext('2d');
    const COL = { dokon: ['#1d6fb8', '#1f8a4c', '#c2185b', '#e05a00', '#5d4037'], kafe: ['#8a3b1d', '#b5461b'], restoran: ['#7a1f1f'], fastfud: ['#d84315'], dorixona: ['#1aa38f'], bank: ['#0d4a8a'], bozor: ['#2e7d32'], AYOQSH: ['#00695c'], mehmonxona: ['#37474f'] };
    const geos = [];
    pois.forEach((p, i) => {
      const [kind, name, px, pz] = p;
      const pal = COL[kind] || ['#455a64'];
      const bg = pal[Math.floor(hashStr(px, pz) * pal.length)];
      g.fillStyle = bg; g.fillRect(0, i * ch, cw, ch);
      g.fillStyle = 'rgba(255,255,255,0.2)'; g.fillRect(0, i * ch, cw, 6);
      g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
      const text = name.toUpperCase().slice(0, 26);
      let fs = 44; g.font = `bold ${fs}px Arial, sans-serif`;
      while (g.measureText(text).width > cw - 24 && fs > 20) { fs -= 2; g.font = `bold ${fs}px Arial, sans-serif`; }
      g.fillText(text, cw / 2, i * ch + ch / 2 + 2);
      if (kind === 'dorixona') { g.fillStyle = '#fff'; g.fillRect(14, i * ch + 26, 26, 8); g.fillRect(23, i * ch + 17, 8, 26); }
      // nearest wall within 25 m
      let best = null, bd = 25 * 25;
      const bx = Math.floor(px / BUCKET), bz = Math.floor(pz / BUCKET);
      for (let ix = bx - 1; ix <= bx + 1; ix++) for (let iz = bz - 1; iz <= bz + 1; iz++) {
        const bk = cell.buckets.get(ix * 100003 + iz); if (!bk) continue;
        for (const e of bk.edges) {
          const [ax, az, ex, ez, rec] = e;
          const dx = ex - ax, dz = ez - az, l2 = dx * dx + dz * dz; if (l2 < 9) continue;
          const t = Math.max(0.2, Math.min(0.8, ((px - ax) * dx + (pz - az) * dz) / l2));
          const qx = ax + dx * t, qz = az + dz * t, dd = (qx - px) ** 2 + (qz - pz) ** 2;
          if (dd < bd) { bd = dd; best = { qx, qz, dx, dz, l: Math.sqrt(l2), rec }; }
        }
      }
      if (!best) return;
      // outward normal: away from the building centre
      const { rec } = best;
      let nx = -best.dz / best.l, nz = best.dx / best.l;
      const ccx = (rec.minX + rec.maxX) / 2, ccz = (rec.minZ + rec.maxZ) / 2;
      if ((best.qx - ccx) * nx + (best.qz - ccz) * nz < 0) { nx = -nx; nz = -nz; }
      const sw = Math.min(best.l * 0.8, 5.5), sh = sw * ch / cw * 1.15;
      const y = Math.min(rec.h - sh / 2 - 0.2, 3.9);
      if (y < 1.6) return;
      const geo = new THREE.PlaneGeometry(sw, sh);
      const uv = geo.attributes.uv;
      const v0 = 1 - (i + 1) / rows, v1 = 1 - i / rows;
      for (let kk = 0; kk < uv.count; kk++) uv.setY(kk, uv.getY(kk) > 0.5 ? v1 - 0.004 : v0 + 0.004);
      m4.compose(new THREE.Vector3(best.qx + nx * 0.12, y, best.qz + nz * 0.12), q.setFromAxisAngle(UP, Math.atan2(nx, nz)), new THREE.Vector3(1, 1, 1));
      geos.push(geo.applyMatrix4(m4));
    });
    if (geos.length) {
      const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
      const mat = new THREE.MeshLambertMaterial({ map: tex });
      const m = new THREE.Mesh(mergeGeometries(geos), mat);
      group.add(m);
      cell.signMat = mat;
    }
  }
  cell.pois = data.p || [];
  return cell;
}

// where a street object stands (moved off the carriageway onto the kerb) and which way it faces (+z towards the road)
export function faceRoad(x, z, segs, kerbGap = 1.2) {
  let best = Infinity, near = null;
  for (const s of segs) {
    const dx = s.bx - s.ax, dz = s.bz - s.az, l2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - s.ax) * dx + (z - s.az) * dz) / l2));
    const px = s.ax + dx * t, pz = s.az + dz * t, d = (px - x) ** 2 + (pz - z) ** 2;
    if (d < best) { best = d; near = { px, pz, dx, dz, l: Math.sqrt(l2), w: s.width }; }
  }
  if (!near || best > 40 * 40) return { x, z, rot: 0 };
  const edge = near.w / 2 + kerbGap;
  let ox = x - near.px, oz = z - near.pz, d = Math.hypot(ox, oz);
  if (d < 0.5) { ox = -near.dz / near.l; oz = near.dx / near.l; d = 1; }
  const nx = ox / d, nz = oz / d;
  const fx = d < edge ? near.px + nx * edge : x, fz = d < edge ? near.pz + nz * edge : z;
  return { x: fx, z: fz, rot: Math.atan2(-nx, -nz) };
}
