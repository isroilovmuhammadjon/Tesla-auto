// Builds one 500 m cell of the real Tashkent map (format v2, see scripts/tashkent-map/build.py):
// buildings by type (mahalla houses with tin roofs, panel blocks, shops with storefronts, schools,
// mosques with domes, glass towers, canopies), roads at their mapped width with lane markings and
// kerbs, sidewalks, street trees, bus shelters, metro entrances, traffic lights and shop signs.
//
// Data (c) OpenStreetMap contributors, ODbL 1.0.
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { facadeTexture, storefrontAtlas, STOREFRONTS, dayGlassTexture, busStopParts, crossingSignTexture } from './cityday.js?v=72abeb68';

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
// ground cover textures, 8 m per tile
function groundTex(base, spots, stripes) {
  return canvas(128, 128, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    let r = 11; const rnd = () => ((r = (r * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 700; i++) { const [c, a] = spots[Math.floor(rnd() * spots.length)]; g.fillStyle = c; g.globalAlpha = a; g.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 3, 1 + rnd() * 3); }
    g.globalAlpha = 1;
    if (stripes) { g.fillStyle = 'rgba(255,255,255,0.12)'; for (let y = 0; y < h; y += 32) g.fillRect(0, y, w, 16); }
  });
}
function fenceTex() {
  const c = document.createElement('canvas'); c.width = 32; c.height = 64;
  const g = c.getContext('2d'); g.clearRect(0, 0, 32, 64);
  g.fillStyle = '#3d444b'; g.fillRect(0, 0, 32, 4); g.fillRect(0, 56, 32, 4); g.fillRect(0, 30, 32, 3);
  for (let x = 2; x < 32; x += 8) g.fillRect(x, 0, 3, 64);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
// Road signs in the Uzbek (Vienna convention) style, one 128 px cell each in a shared atlas
export const SIGN_CELLS = ['speed5', 'speed10', 'speed20', 'speed30', 'speed40', 'speed50', 'speed60', 'speed70', 'speed80', 'speed90', 'speed100',
  'stop', 'give_way', 'no_entry', 'oneway', 'no_left', 'no_right', 'no_u', 'no_straight', 'only_straight', 'only_left', 'only_right', 'camera'];
let signAtlasTex = null;
export function roadSignAtlas() {
  if (signAtlasTex) return signAtlasTex;
  const N = 8, C = 128, rows = Math.ceil(SIGN_CELLS.length / N);
  const cv = document.createElement('canvas'); cv.width = N * C; cv.height = rows * C;
  const g = cv.getContext('2d');
  const arrow = (cx, cy, ang, len, col) => {
    g.save(); g.translate(cx, cy); g.rotate(ang); g.fillStyle = col;
    g.fillRect(-7, -len / 2 + 14, 14, len - 14); g.beginPath(); g.moveTo(0, -len / 2 - 4); g.lineTo(18, -len / 2 + 18); g.lineTo(-18, -len / 2 + 18); g.closePath(); g.fill(); g.restore();
  };
  const turnArrow = (dir, col) => {      // up then bend left (-1) / right (+1)
    g.fillStyle = col; g.fillRect(57, 58, 14, 40); g.fillRect(dir > 0 ? 57 : 37, 44, 34, 14);
    g.beginPath(); const x = dir > 0 ? 92 : 36; g.moveTo(x, 51); g.lineTo(x - dir * 16, 33); g.lineTo(x - dir * 16, 69); g.closePath(); g.fill();
  };
  SIGN_CELLS.forEach((k, i) => {
    g.save(); g.translate((i % N) * C, Math.floor(i / N) * C);
    const ring = (fill = '#fff') => { g.fillStyle = '#d32f2f'; g.beginPath(); g.arc(64, 64, 60, 0, 7); g.fill(); g.fillStyle = fill; g.beginPath(); g.arc(64, 64, 47, 0, 7); g.fill(); };
    const blue = () => { g.fillStyle = '#1565c0'; g.beginPath(); g.arc(64, 64, 60, 0, 7); g.fill(); g.strokeStyle = '#fff'; g.lineWidth = 4; g.stroke(); };
    const slash = () => { g.strokeStyle = '#d32f2f'; g.lineWidth = 12; g.beginPath(); g.moveTo(31, 31); g.lineTo(97, 97); g.stroke(); };
    if (k.startsWith('speed')) {
      ring(); g.fillStyle = '#111'; g.textAlign = 'center'; g.textBaseline = 'middle';
      const n = k.slice(5); g.font = `bold ${n.length > 2 ? 40 : 52}px Arial, sans-serif`; g.fillText(n, 64, 68);
    } else if (k === 'stop') {
      g.fillStyle = '#fff'; g.beginPath(); for (let a = 0; a < 8; a++) { const t = Math.PI / 8 + a * Math.PI / 4; g.lineTo(64 + Math.cos(t) * 62, 64 + Math.sin(t) * 62); } g.closePath(); g.fill();
      g.fillStyle = '#c62828'; g.beginPath(); for (let a = 0; a < 8; a++) { const t = Math.PI / 8 + a * Math.PI / 4; g.lineTo(64 + Math.cos(t) * 57, 64 + Math.sin(t) * 57); } g.closePath(); g.fill();
      g.fillStyle = '#fff'; g.font = 'bold 36px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('STOP', 64, 66);
    } else if (k === 'give_way') {
      g.fillStyle = '#d32f2f'; g.beginPath(); g.moveTo(4, 12); g.lineTo(124, 12); g.lineTo(64, 120); g.closePath(); g.fill();
      g.fillStyle = '#fff'; g.beginPath(); g.moveTo(24, 24); g.lineTo(104, 24); g.lineTo(64, 96); g.closePath(); g.fill();
    } else if (k === 'no_entry') {
      g.fillStyle = '#d32f2f'; g.beginPath(); g.arc(64, 64, 60, 0, 7); g.fill(); g.fillStyle = '#fff'; g.fillRect(22, 54, 84, 20);
    } else if (k === 'oneway') {
      g.fillStyle = '#1565c0'; g.fillRect(6, 6, 116, 116); g.strokeStyle = '#fff'; g.lineWidth = 4; g.strokeRect(8, 8, 112, 112); arrow(64, 64, 0, 84, '#fff');
    } else if (k === 'no_left' || k === 'no_right') {
      ring(); turnArrow(k === 'no_left' ? -1 : 1, '#111'); slash();
    } else if (k === 'no_u') {
      ring(); g.strokeStyle = '#111'; g.lineWidth = 12; g.beginPath(); g.arc(58, 56, 16, Math.PI, 0); g.stroke(); g.fillStyle = '#111'; g.fillRect(36, 56, 12, 36); g.beginPath(); g.moveTo(62, 66); g.lineTo(90, 66); g.lineTo(76, 84); g.closePath(); g.fill(); slash();
    } else if (k === 'no_straight') {
      ring(); arrow(64, 66, 0, 70, '#111'); slash();
    } else if (k === 'only_straight') { blue(); arrow(64, 66, 0, 76, '#fff'); }
    else if (k === 'only_left' || k === 'only_right') { blue(); turnArrow(k === 'only_left' ? -1 : 1, '#fff'); }
    else if (k === 'camera') {
      g.fillStyle = '#1565c0'; g.fillRect(6, 6, 116, 116); g.strokeStyle = '#fff'; g.lineWidth = 4; g.strokeRect(8, 8, 112, 112);
      g.fillStyle = '#fff'; g.fillRect(30, 46, 54, 34); g.beginPath(); g.moveTo(84, 54); g.lineTo(102, 44); g.lineTo(102, 82); g.lineTo(84, 72); g.closePath(); g.fill();
      g.fillStyle = '#1565c0'; g.beginPath(); g.arc(52, 63, 10, 0, 7); g.fill(); g.fillStyle = '#fff'; g.font = 'bold 15px Arial, sans-serif'; g.textAlign = 'center'; g.fillText('RADAR', 64, 104);
    }
    g.restore();
  });
  signAtlasTex = new THREE.CanvasTexture(cv); signAtlasTex.colorSpace = THREE.SRGBColorSpace; signAtlasTex.anisotropy = 8;
  return signAtlasTex;
}
function signCell(kind, value) {
  if (kind === 'speed') { const v = [5, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100].reduce((a, b) => (Math.abs(b - value) < Math.abs(a - value) ? b : a)); return SIGN_CELLS.indexOf('speed' + v); }
  if (kind === 'camera') return SIGN_CELLS.indexOf('camera');
  return SIGN_CELLS.indexOf(kind);
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
  ['brick', '#d9c9a8'], ['arch', '#d8cbb3'], ['panel', '#ddd3c2'], ['panel', '#cfd6d9'],    // 12-15 more houses and blocks
  ['brick', '#b9875e'], ['band', '#e2dccf'], ['panel', '#e4d8c6'], ['arch', '#efe2c4'],     // 16-19
  ['arch', '#d2b178'], ['arch', '#c08a5c'],                                                  // 20-21 old yellow / red brick with arched windows
];
const LOOK_FOR = [[0, 1, 2, 3, 12, 13, 16, 19], [4, 5, 6, 14, 15, 18, 7], [7, 8, 5, 17], [8, 2, 7, 17], [9], [11, 19], [10, 7], [9]];

export function makeMaterials() {
  const walls = LOOKS.map(([st, c], i) => {
    const map = st === 'metal' ? metalFacade() : st === 'glass' ? dayGlassTexture() : facadeTexture(st, c, i + 3);
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    return new THREE.MeshLambertMaterial({ map, vertexColors: true });
  });
  const roadMat = (tex, k) => new THREE.MeshStandardMaterial({ map: tex, roughness: 0.82, metalness: 0, envMapIntensity: 0.25, polygonOffset: true, polygonOffsetFactor: -1 - k, polygonOffsetUnits: -1 - k });
  const a0 = asphalt('#4a4f57', true), a1 = asphalt('#464b53', false), a2 = asphalt('#3f444b', false);   // cool grey: warm sun made the old ones look brown
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
    crossSign: new THREE.MeshLambertMaterial({ map: crossingSignTexture(), side: THREE.DoubleSide }),
    roadSign: new THREE.MeshBasicMaterial({ map: roadSignAtlas(), transparent: true, alphaTest: 0.3 }),
    signBack: new THREE.MeshLambertMaterial({ color: 0x8a9096 }),
    wallPlain: new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }),
    fence: new THREE.MeshLambertMaterial({ map: fenceTex(), transparent: false, alphaTest: 0.5, side: THREE.DoubleSide }),
    // 0 lawn / park, 1 (unused), 2 industrial concrete, 3 market / commercial paving, 4 water, 5 cemetery, 6 wood,
    // 7 fields and orchards, 8 building site, 9 sports pitch
    land: [
      groundTex('#6f8f4a', [['#5d7d3c', 0.6], ['#86a35a', 0.5], ['#9a8f5e', 0.25]]),
      groundTex('#a39d8a', [['#8f8a78', 0.5]]),
      groundTex('#7d7c77', [['#6b6a65', 0.5], ['#8f8d87', 0.4], ['#5c5b57', 0.3]]),
      groundTex('#868076', [['#77716a', 0.5], ['#958f84', 0.4]]),
      groundTex('#4f7c8c', [['#5f8f9e', 0.5], ['#46707f', 0.4]]),
      groundTex('#7a8a58', [['#6a7a48', 0.5], ['#a29a7a', 0.4]]),
      groundTex('#56733d', [['#46632e', 0.6], ['#6a8a4a', 0.4]]),
      groundTex('#8f8a5a', [['#7a7a48', 0.5], ['#a09a6a', 0.4], ['#6f8a48', 0.3]]),
      groundTex('#8f7a5a', [['#7d6a4d', 0.6], ['#a08a68', 0.4]]),
      groundTex('#4f8a46', [['#5f9a52', 0.5]], true),
    ].map((map, i) => new THREE.MeshStandardMaterial({ map, roughness: i === 4 ? 0.15 : 0.95, metalness: 0, envMapIntensity: i === 4 ? 0.9 : 0.15, polygonOffset: true, polygonOffsetFactor: -0.2, polygonOffsetUnits: -0.2 })),
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

// ------------------------------------------------------------------ trees of Tashkent streets
// 0 plane tree (chinar), 1 fruit tree (apricot / mulberry), 2 elm (qayrag'och), 3 poplar (terak), 4 juniper (archa)
// leaf colours under the Tashkent summer sun: plane trees and elms a deep, slightly dusty green (before: too yellow)
const TREE_HSL = [[0.27, 0.38, 0.24], [0.28, 0.42, 0.26], [0.29, 0.33, 0.21], [0.3, 0.34, 0.25], [0.36, 0.3, 0.16]];
let TREE_GEOS = null;
function treeGeos(city) {
  if (TREE_GEOS) return TREE_GEOS;
  const clean = (g) => { g.deleteAttribute('uv'); g.deleteAttribute('normal'); return g; };
  // welded vertices: the wind shader moves shared corners together, so the crowns never crack open
  const lumps = (list) => { const g = mergeGeometries(list.map(([r, x, y, z, sx = 1, sy = 1, sz = 1]) => mergeVertices(clean(new THREE.IcosahedronGeometry(r, 1).scale(sx, sy, sz).translate(x, y, z))))); g.computeVertexNormals(); return g; };
  TREE_GEOS = [
    { trunk: city.treeGeo.trunk, crown: city.treeGeo.crown },
    { trunk: new THREE.CylinderGeometry(0.12, 0.18, 1.8, 6).translate(0, 0.9, 0), crown: lumps([[1.7, 0, 2.6, 0, 1.2, 0.75, 1.2], [1.1, 0.9, 2.9, 0.4, 1, 0.8, 1], [1.0, -0.8, 2.8, -0.5, 1, 0.8, 1]]) },
    { trunk: new THREE.CylinderGeometry(0.18, 0.3, 3.4, 6).translate(0, 1.7, 0), crown: lumps([[2.8, 0, 5.4, 0, 1, 0.85, 1], [1.8, 1.6, 5.0, 0.8], [1.7, -1.4, 5.6, -0.9], [1.5, 0.3, 6.6, -1.2]]) },
    { trunk: new THREE.CylinderGeometry(0.15, 0.25, 3, 6).translate(0, 1.5, 0), crown: lumps([[1, 0, 9, 0, 1.45, 6.2, 1.45], [0.8, 0.25, 6.5, 0.2, 1.3, 3.2, 1.3]]) },
    { trunk: new THREE.CylinderGeometry(0.1, 0.15, 1, 6).translate(0, 0.5, 0), crown: (() => { const g = mergeVertices(clean(new THREE.ConeGeometry(1.4, 5.2, 8).translate(0, 3.4, 0))); g.computeVertexNormals(); return g; })() },
  ];
  for (const t of TREE_GEOS) { t.trunk.userData.shared = true; t.crown.userData.shared = true; }
  return TREE_GEOS;
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
    const [h0, typ, wallC, roofC, flat, passage, mat = 0, rshape = 0] = b;
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
    // a mapped material wins over the guess from the building type: yellow / red brick, glass, concrete panels
    const opts = mat === 1 ? (typ === 0 ? [0, 12, 16] : typ === 3 || typ === 5 ? [20, 20, 21] : [0, 12, 1]) : mat === 3 ? [10] : mat === 2 && typ !== 0 ? [4, 5, 14, 15] : mat === 4 ? [11, 19] : mat === 5 ? [9] : (LOOK_FOR[typ] || LOOK_FOR[0]);
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
    // pitched roofs: mapped ones (roof:shape) on any building, and the tin roofs of small mahalla houses
    if ((rshape === 1 && n <= 8) || (typ === 0 && n <= 8 && area < 600 && h < 9 && !mobile)) hipRoof(xs, zs, h, tin, new THREE.Color(roofC || ROOF_TIN[Math.floor(hv * ROOF_TIN.length)]));
    if (typ === 5 && area > 100) domes.push([cx, h, cz, Math.min(9, Math.sqrt(area) / 3.2)]);
    if (typ === 7 || passage) continue;  // canopies, and buildings a street runs through (arches, covered entries): drive under them
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
  const runs = (data.r || []).map(([kind, width, flags, layer, name, flat, lanes = 0, median = 0, limit = 0]) => {
    const pts = [];
    for (let i = 0; i < flat.length; i += 2) pts.push([flat[i], flat[i + 1]]);
    return { kind, width, oneway: !!(flags & 1), bridge: !!(flags & 2), tunnel: !!(flags & 4), round: !!(flags & 8), median: flags & 16 ? Math.max(1, median) : 0, private: !!(flags & 32), lanes, limit, layer, name, pts };
  });
  // every carriageway in this cell, for keeping trees, signs and walls off the road
  const RG = 20, roadGrid = new Map();
  for (const r of runs) for (let i = 0; i < r.pts.length - 1; i++) {
    const [ax, az] = r.pts[i], [bx, bz] = r.pts[i + 1], hw = r.width / 2;
    for (let x = Math.floor((Math.min(ax, bx) - hw) / RG); x <= Math.floor((Math.max(ax, bx) + hw) / RG); x++)
      for (let z = Math.floor((Math.min(az, bz) - hw) / RG); z <= Math.floor((Math.max(az, bz) + hw) / RG); z++) {
        const k2 = x * 100003 + z; let l = roadGrid.get(k2); if (!l) roadGrid.set(k2, (l = [])); l.push([ax, az, bx, bz, hw]);
      }
  }
  const onRoad = (x, z, pad) => {
    for (const [ax, az, bx, bz, hw] of roadGrid.get(Math.floor(x / RG) * 100003 + Math.floor(z / RG)) || []) {
      const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
      if ((ax + dx * t - x) ** 2 + (az + dz * t - z) ** 2 < (hw + pad) ** 2) return true;
    }
    return false;
  };
  cell.onRoad = onRoad;
  for (const r of runs) r.pts.forEach(([x, z], i) => {
    const key = vkey(x, z);
    vcount.set(key, (vcount.get(key) || 0) + (i === 0 || i === r.pts.length - 1 ? 1 : 2));
    vwide.set(key, Math.max(vwide.get(key) || 0, r.width));
  });
  const junction = [];
  for (const [key, c] of vcount) if (c >= 3) { const [x, z] = key.split(',').map(Number); junction.push([x, z, vwide.get(key)]); }
  const nearJunction = (x, z, extra) => {
    // markings stop where the crossing carriageway starts (half its width), plus a little
    for (const [jx, jz, w] of junction) { const r = Math.min(w * 0.5, 9) + extra; if ((x - jx) ** 2 + (z - jz) ** 2 < r * r) return true; }
    return false;
  };
  const surf = [0, 1, 2].map(() => [0, 1, 2].map(() => ({ p: [], u: [] })));
  const walkP = [], walkU = [], markP = [], kerbP = [], medP = [];
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
      const seg = { ax, az, bx, bz, len, kind: r.kind, width: r.width, lanes: r.lanes, median: r.median, limit: r.limit, oneway: r.oneway, name: r.name, tunnel: r.tunnel, bridge: r.bridge, keys: [vkey(ax, az), vkey(bx, bz)] };
      segsByKind[r.kind].push([ax, az, bx, bz]);
      if (r.name || r.limit) cell.named.push(seg);
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
        // a divided road: pavement on the right only, a planted median on the left (towards the other carriageway)
        const lsw = r.median ? 0 : sw, lx = dz * lsw, lz = -dx * lsw;
        const q = [[ax + sx, az + sz], [bx + sx, bz + sz], [bx + lx, bz + lz], [ax + sx, az + sz], [bx + lx, bz + lz], [ax + lx, az + lz]];
        for (const [x, z] of q) { walkP.push(x, 0.015, z); walkU.push(x / 2.5, z / 2.5); }
        if (r.median) {
          const mw = w + Math.min(r.median / 2 + 0.3, 9), mx2 = dz * mw, mz2 = -dx * mw;
          pushQuad(medP, [ax, 0.017, az], [bx, 0.017, bz], [bx + mx2, 0.017, bz + mz2], [ax + mx2, 0.017, az + mz2]);
        }
        if (!r.median) for (const [x, z] of [[ax, az], [bx, bz]]) for (let s = 0; s < 8; s++) {
          const a0 = (s / 8) * Math.PI * 2, a1 = ((s + 1) / 8) * Math.PI * 2;
          for (const [px, pz] of [[x, z], [x + Math.cos(a1) * sw, z + Math.sin(a1) * sw], [x + Math.cos(a0) * sw, z + Math.sin(a0) * sw]]) { walkP.push(px, 0.015, pz); walkU.push(px / 2.5, pz / 2.5); }
        }
      }
      // markings + kerbs, walked in 1 m steps so they stop short of junctions
      const marks = r.kind >= 1 || r.width >= 7;
      const lines = [];
      if (marks && !r.round) {
        if (r.oneway) {
          const lanes = r.lanes || Math.max(1, Math.round(r.width / 3.3)), lw = r.width / lanes;
          for (let j = 1; j < lanes; j++) lines.push([-w + j * lw, 'dash']);
        } else {
          lines.push([0, r.kind === 2 || r.lanes >= 4 ? 'solid' : 'dash']);
          const per = r.lanes >= 2 ? Math.floor(r.lanes / 2) : Math.max(1, Math.floor(w / 3.0)), lw = w / per;
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
        // avenues: plane trees (chinar), some stretches of poplars (terak); medians get poplars and junipers
        const kind0 = hashStr(Math.round(ax / 60), Math.round(az / 60)) < 0.7 ? 0 : 3;
        for (let t = 6; t < len - 6; t += 12 + hashStr(Math.round(ax + t), Math.round(az)) * 6) {
          for (const sd of (r.median ? [1] : [-1, 1])) {
            // real street rows have gaps (a driveway, a dead tree, a shop front) and are not planted in pairs
            const hj = hashStr(Math.round(ax * 7 + t * sd), Math.round(az * 3 - t));
            if (hj < 0.16) continue;
            const tt = t + (hj - 0.5) * 5, oo = off + (hashStr(Math.round(t * 13), Math.round(sd * 17 + ax)) - 0.5) * 0.7;
            const x = ax + dx * tt - dz * oo * sd, z = az + dz * tt + dx * oo * sd;
            if (!nearJunction(x, z, 6)) treePts.push([x, z, hj > 0.93 ? 2 : kind0]);
          }
          if (r.median >= 3.5) { const mo = -(w + r.median / 2); const x = ax + dx * t - dz * mo, z = az + dz * t + dx * mo; if (!nearJunction(x, z, 6)) treePts.push([x, z, hashStr(Math.round(t), 7) < 0.5 ? 3 : 4]); }
        }
      } else if (r.kind === 0 && len > 12 && !r.tunnel) {
        // mahalla lanes and courtyards: mulberries, apricots and elms on both sides, irregular
        for (let t = 6; t < len - 6; t += 10 + hashStr(Math.round(ax), Math.round(az + t)) * 9) {
          for (const sd of [-1, 1]) {
            if (hashStr(Math.round(t * sd), Math.round(ax + az)) < 0.35) continue;
            const off = w + 1.4 + hashStr(Math.round(az), Math.round(t)) * 1.6;
            const x = ax + dx * t - dz * off * sd, z = az + dz * t + dx * off * sd;
            if (!nearJunction(x, z, 4)) { const hv2 = hashStr(Math.round(x), Math.round(z)); treePts.push([x, z, hv2 < 0.45 ? 1 : hv2 < 0.75 ? 2 : 3]); }
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
  fixUp(walkP, walkU); fixUp(markP); fixUp(medP);
  addMesh(walkP, mats.walk, { u: walkU });
  if (medP.length) { const mu = []; for (let i = 0; i < medP.length; i += 3) mu.push(medP[i] / 4, medP[i + 2] / 4); addMesh(medP, mats.land[0], { u: mu }); }
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
    // inside the outline itself (or within pad of a wall), not just its bounding box: big L-shaped blocks
    // would otherwise clear the trees off the whole pavement in front of them
    for (const r2 of b.blds) {
      if (x < r2.minX - pad || x > r2.maxX + pad || z < r2.minZ - pad || z > r2.maxZ + pad) continue;
      let inside = false;
      const n2 = r2.xs.length;
      for (let i = 0, j = n2 - 1; i < n2; j = i++) {
        if ((r2.zs[i] > z) !== (r2.zs[j] > z) && x < ((r2.xs[j] - r2.xs[i]) * (z - r2.zs[i])) / (r2.zs[j] - r2.zs[i]) + r2.xs[i]) inside = !inside;
        const dx = r2.xs[j] - r2.xs[i], dz = r2.zs[j] - r2.zs[i], l2 = dx * dx + dz * dz || 1;
        const t = Math.max(0, Math.min(1, ((x - r2.xs[i]) * dx + (z - r2.zs[i]) * dz) / l2));
        if ((r2.xs[i] + dx * t - x) ** 2 + (r2.zs[i] + dz * t - z) ** 2 < pad * pad) return true;
      }
      if (inside) return true;
    }
    return false;
  };
  // trees mapped in OSM (single trees, tree rows) are used as they are; generated ones fill the streets where
  // nothing is mapped. Nothing may stand on a carriageway (that is where the route line runs) or in a building.
  // parks and gardens (OSM land use 0): a canopy of mature trees, not a bare lawn with a few blobs (Amir Temur
  // square, Alisher Navoiy park, mahalla gardens). Jittered grid ~9 m apart inside the outline.
  let parkLeft = mobile ? 60 : 220;          // candidates per cell (each one is checked against roads and houses)
  for (const g2 of data.g || []) {
    const [cls, ext] = g2;
    if (cls !== 0 || ext.length < 6 || parkLeft <= 0) continue;
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity, area = 0;
    for (let i = 0; i < ext.length; i += 2) { x0 = Math.min(x0, ext[i]); x1 = Math.max(x1, ext[i]); z0 = Math.min(z0, ext[i + 1]); z1 = Math.max(z1, ext[i + 1]); const j = (i + 2) % ext.length; area += ext[i] * ext[j + 1] - ext[j] * ext[i + 1]; }
    if (Math.abs(area) / 2 < 1200 || ext.length > 1200) continue;
    const inside = (x, z) => { let ins = false; for (let i = 0, j = ext.length - 2; i < ext.length; j = i, i += 2) { const xi = ext[i], zi = ext[i + 1], xj = ext[j], zj = ext[j + 1]; if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) ins = !ins; } return ins; };
    // ~9 m apart, but never more than ~350 candidates for one outline (big green areas get a sparser grid)
    const step = Math.max(mobile ? 14 : 9, Math.sqrt(Math.abs(area) / 2 / 350));
    for (let x = x0 + step / 2; x < x1; x += step) for (let z = z0 + step / 2; z < z1; z += step) {
      const h1 = hashStr(Math.round(x * 3), Math.round(z * 3)), h2 = hashStr(Math.round(z * 7), Math.round(x * 5));
      const px = x + (h1 - 0.5) * step * 0.8, pz = z + (h2 - 0.5) * step * 0.8;
      if (parkLeft <= 0) break;
      if (h1 < 0.12 || !inside(px, pz)) continue;            // a few clearings
      parkLeft--;
      treePts.push([px, pz, h2 < 0.55 ? 0 : h2 < 0.8 ? 2 : h2 < 0.92 ? 1 : 3, false]);
    }
  }
  for (const [x, z, t] of data.t || []) treePts.push([x, z, t === 1 ? 4 : t === 2 ? (hashStr(Math.round(x / 40), Math.round(z / 40)) < 0.6 ? 0 : 3) : (hashStr(Math.round(x), Math.round(z)) < 0.5 ? 0 : 2), true]);
  // nothing may hide a sign or a camera from the drivers it is for: no tree within 4 m of one
  const signSpots = (data.o || []).filter((o) => o[0] === 'sign' || o[0] === 'camera').map((o) => [o[2], o[3]]);
  const nearSign = (x, z) => signSpots.some(([sx, sz]) => (sx - x) ** 2 + (sz - z) ** 2 < 16);
  const pts = treePts.filter(([x, z, type, mapped]) => !onRoad(x, z, mapped ? 0.2 : 0.9) && !inBuilding(x, z, type === 1 || mapped ? 0.6 : 2) && !nearSign(x, z))
    .filter((p2, i) => p2[3] || !mobile || i % 2 === 0).slice(0, mobile ? 180 : 700);
  cell.trees = [];
  const geos = treeGeos(city);
  for (let type = 0; type < geos.length; type++) {
    const list = pts.filter((p2) => p2[2] === type);
    if (!list.length) continue;
    const trunk = new THREE.InstancedMesh(geos[type].trunk, mats.trunk, list.length);
    const crown = new THREE.InstancedMesh(geos[type].crown, mats.crown, list.length);
    const tm = new THREE.Matrix4(), tq = new THREE.Quaternion(), tc = new THREE.Color();
    list.forEach(([x, z], i) => {
      const hv = hashStr(Math.round(x * 3), Math.round(z * 3)), sc = 0.66 + hv * hv * 0.7;   // mostly mature, some young, a few big old ones
      tm.compose(new THREE.Vector3(x, 0, z), tq.setFromAxisAngle(UP, hv * 6.28), new THREE.Vector3(sc, sc * (0.9 + hv * 0.25), sc));
      trunk.setMatrixAt(i, tm); crown.setMatrixAt(i, tm);
      const [h0, s0, l0] = TREE_HSL[type], hv2 = hashStr(Math.round(z * 5), Math.round(x * 5));
      // no two neighbours the same: olive, fresh, dark and the odd yellowing crown
      tc.setHSL(h0 + (hv2 - 0.5) * 0.08 + (hv2 > 0.9 ? -0.08 : 0), s0 + (hv - 0.5) * 0.2, l0 + (hv2 - 0.5) * 0.12);
      crown.setColorAt(i, tc);
    });
    trunk.castShadow = crown.castShadow = true;
    group.add(trunk, crown);
    cell.trees.push(trunk, crown);
  }

  // ---------------- street objects
  const allSegs = runs.flatMap((r) => r.tunnel ? [] : r.pts.slice(0, -1).map((p, i) => ({ ax: p[0], az: p[1], bx: r.pts[i + 1][0], bz: r.pts[i + 1][1], width: r.width, kind: r.kind })));
  const pp = [], pc = [], lampPos = [], glassG = [], mSigns = [], busSigns = [], groundP = {};
  const c3 = new THREE.Color(), m4 = new THREE.Matrix4(), q = new THREE.Quaternion();
  const addBox = (x, z, rot, [px, py, pz, sx, sy, sz, color]) => {
    m4.compose(new THREE.Vector3(px, py, pz).applyAxisAngle(UP, rot).add(new THREE.Vector3(x, 0.02, z)), q.setFromAxisAngle(UP, rot), new THREE.Vector3(sx, sy, sz));
    const g = city.unitBox, pos = g.attributes.position, idx = g.index.array;
    c3.set(color);
    for (let i = 0; i < idx.length; i++) { const v = new THREE.Vector3().fromBufferAttribute(pos, idx[i]).applyMatrix4(m4); pp.push(v.x, v.y, v.z); pc.push(c3.r, c3.g, c3.b); }
  };
  // pedestrian crossing: white bars along the traffic, across the carriageway, and the blue sign on the
  // kerb to the right of each approach, facing the drivers coming towards it
  const zebP = [], signG = [];
  const zebra = ([, kind, x, z, ang, width, oneway]) => {
    const fx = Math.sin(ang), fz = Math.cos(ang), rx = -fz, rz = fx;   // along the road / across it (to the right)
    const hw = width / 2, y = 0.075;
    for (let o2 = -hw + 0.4; o2 < hw - 0.3; o2 += 1.0) {
      const cx = x + rx * o2, cz = z + rz * o2;
      pushQuad(zebP, [cx - rx * 0.25 - fx * 2, y, cz - rz * 0.25 - fz * 2], [cx + rx * 0.25 - fx * 2, y, cz + rz * 0.25 - fz * 2], [cx + rx * 0.25 + fx * 2, y, cz + rz * 0.25 + fz * 2], [cx - rx * 0.25 + fx * 2, y, cz - rz * 0.25 + fz * 2]);
    }
    if (kind === 'signal') return;                       // signal-controlled: the lights do the job
    for (const dir of oneway ? [1] : [1, -1]) {
      // approaching in direction (fx, fz) * dir: the sign stands on the right kerb, 2.5 m before the stripes
      const ax = fx * dir, az = fz * dir, sx = -az, sz = ax;
      const px = x - ax * 2.5 + sx * (hw + 0.9), pz = z - az * 2.5 + sz * (hw + 0.9);
      const rot = Math.atan2(-ax, -az);                  // the sign's face (+z) looks back at the drivers
      addBox(px, pz, rot, [0, 1.3, 0, 0.07, 2.6, 0.07, '#8a9199']);
      m4.compose(new THREE.Vector3(0, 2.75, 0.05).applyAxisAngle(UP, rot).add(new THREE.Vector3(px, 0, pz)), q.setFromAxisAngle(UP, rot), new THREE.Vector3(0.6, 0.6, 1));
      signG.push(new THREE.PlaneGeometry(1, 1).applyMatrix4(m4));
    }
  };
  // courtyard and school gates: painted steel leaves (or a barrier arm), set into the wall opening
  const GATE_COL = ['#2f6b4f', '#2c5a8a', '#6b3b2a', '#4c5560', '#7a6a2a', '#2e7f7a'];
  const gate = ([, , x, z, ang, width, lift, open]) => {
    const rot = ang + Math.PI / 2, c = GATE_COL[Math.floor(hashStr(x, z) * GATE_COL.length)];
    if (open) {             // the gate a street goes through: leaves swung back against the wall, the way clear
      for (const sx of [-1, 1]) { addBox(x, z, rot, [sx * width / 2, 1.25, 0, 0.18, 2.5, 0.18, '#5b5f66']); addBox(x, z, rot, [sx * (width / 2 + 0.1), 1.15, sx * 0.85, 0.06, 2.2, width / 2 - 0.1, c]); }
      return;
    }
    if (lift) { addBox(x, z, rot, [-1.6, 0.5, 0, 0.18, 1, 0.18, '#d8d8d8']); addBox(x, z, rot, [0, 0.95, 0, 3.2, 0.09, 0.09, '#d32f2f']); return; }
    addBox(x, z, rot, [0, 1.15, 0, width - 0.1, 2.3, 0.08, c]);
    addBox(x, z, rot, [0, 2.36, 0, width, 0.1, 0.14, '#3a3d42']);
    for (const sx of [-width / 2, width / 2]) addBox(x, z, rot, [sx, 1.25, 0, 0.18, 2.5, 0.18, '#5b5f66']);
    addBox(x, z, rot, [0, 1.15, 0.05, 0.04, 2.2, 0.02, '#1d1f22']);
  };
  // doors on the building outline (OSM entrance nodes), facing out of the nearest wall
  const door = ([, num, x, z, main]) => {
    let best = null, bd = 3 * 3;
    const bx0 = Math.floor(x / BUCKET), bz0 = Math.floor(z / BUCKET);
    const bk = cell.buckets.get(bx0 * 100003 + bz0);
    if (!bk) return;
    for (const e of bk.edges) {
      const [ax, az, ex, ez, rec] = e;
      const dx = ex - ax, dz = ez - az, l2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
      const qx = ax + dx * t, qz = az + dz * t, d2 = (qx - x) ** 2 + (qz - z) ** 2;
      if (d2 < bd) { bd = d2; best = { qx, qz, dx, dz, l: Math.sqrt(l2), rec }; }
    }
    if (!best) return;
    let nx = -best.dz / best.l, nz = best.dx / best.l;
    const ccx = (best.rec.minX + best.rec.maxX) / 2, ccz = (best.rec.minZ + best.rec.maxZ) / 2;
    if ((best.qx - ccx) * nx + (best.qz - ccz) * nz < 0) { nx = -nx; nz = -nz; }
    const rot = Math.atan2(nx, nz);
    addBox(best.qx, best.qz, rot, [0, 1.05, 0.06, 1.15, 2.1, 0.08, main ? '#5a3a22' : '#4a4f57']);
    addBox(best.qx, best.qz, rot, [0, 2.2, 0.06, 1.35, 0.12, 0.1, '#e8e4dc']);
    if (main) addBox(best.qx, best.qz, rot, [0, 2.6, 0.55, 1.8, 0.1, 1.1, '#9aa0a6']);
  };
  // a road sign: grey post, the face (from the atlas) turned to the drivers it is for, a plain back
  const signQuads = [], signBacks = [];
  const roadSign = ([, kind, x, z, ang, value]) => {
    const cell = signCell(kind, value); if (cell < 0) return;
    const tx = Math.sin(ang), tz = Math.cos(ang), rot = Math.atan2(-tx, -tz);
    addBox(x, z, rot, [0, 1.25, 0, 0.07, 2.5, 0.07, '#8a9199']);
    const size = kind === 'oneway' || kind === 'camera' ? 0.7 : 0.75;
    const geo = new THREE.PlaneGeometry(size, size), uv = geo.attributes.uv, N = 8, rows = Math.ceil(SIGN_CELLS.length / N);
    const u0 = (cell % N) / N, v1 = 1 - Math.floor(cell / N) / rows, v0 = v1 - 1 / rows;
    for (let k2 = 0; k2 < uv.count; k2++) uv.setXY(k2, u0 + uv.getX(k2) / N, v0 + uv.getY(k2) / rows);
    m4.compose(new THREE.Vector3(0, 2.45, 0.05).applyAxisAngle(UP, rot).add(new THREE.Vector3(x, 0, z)), q.setFromAxisAngle(UP, rot), new THREE.Vector3(1, 1, 1));
    signQuads.push(geo.applyMatrix4(m4));
    m4.compose(new THREE.Vector3(0, 2.45, 0.035).applyAxisAngle(UP, rot).add(new THREE.Vector3(x, 0, z)), q.setFromAxisAngle(UP, rot + Math.PI), new THREE.Vector3(1, 1, 1));
    signBacks.push(new THREE.PlaneGeometry(size * 0.95, size * 0.95).applyMatrix4(m4));
  };
  // speed camera (OSM highway=speed_camera): a mast with a camera head looking at each monitored approach
  cell.cameras = [];
  const speedCamera = ([, name, x, z, dirs, limit, osmId, width]) => {
    const side = (width || 8) / 2 + 1.4;
    const [d0x, d0z] = dirs[0];
    const mx = x - d0z * side, mz = z + d0x * side;                 // on the right of the first monitored direction
    addBox(mx, mz, 0, [0, 2.6, 0, 0.16, 5.2, 0.16, '#9aa0a6']);
    for (const [tx, tz] of dirs) {
      const rot = Math.atan2(-tx, -tz);                             // the head looks at the oncoming traffic
      addBox(mx, mz, rot, [0, 5.3, 0.1, 0.42, 0.34, 0.62, '#eceff1']);
      addBox(mx, mz, rot, [0, 5.3, 0.43, 0.26, 0.2, 0.05, '#1b1f24']);
      addBox(mx, mz, rot, [0, 5.62, 0.1, 0.5, 0.06, 0.7, '#cfd8dc']);
    }
    cell.cameras.push({ x, z, dirs, limit, id: osmId, name, width: width || 8, mx, mz });
  };
  const place = (x, z, model) => {
    const g = model.clone().applyMatrix4(m4);
    return g;
  };
  void place;
  const plates = [];
  for (const o of data.o || []) {
    const [type, name, ox, oz, extra, station] = o;
    if (type === 'zebra') { zebra(o); continue; }
    if (type === 'gate') { gate(o); continue; }
    if (type === 'door') { door(o); continue; }
    if (type === 'sign') { roadSign(o); continue; }
    if (type === 'camera') { speedCamera(o); continue; }
    if (type === 'signal') {
      const parts = city.models.signal;
      const f = faceRoad(ox, oz, allSegs), x = f.x, z = f.z, rot = f.rot + Math.PI;   // the signal model faces -z
      for (const part of parts) {
        const [shape, px, py, pz, sx, sy, sz, color] = part;
        if (shape === 'sphere') { lampPos.push([x, z, rot, px, py, pz, color]); continue; }
        addBox(x, z, rot, [px, py, pz, sx, sy, sz, color]);
      }
      // all the signal heads of one junction run on one cycle (OSM maps each head as its own node)
      const mate = city.signalList.find((q2) => Math.abs(q2.x - x) < 50 && Math.abs(q2.z - z) < 50);
      city.signalList.push({ x, z, cell: k, phase: mate ? mate.phase : hashStr(Math.round(x), Math.round(z)) * 32 });
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
  if (zebP.length) { fixUp(zebP); addMesh(zebP, mats.marking); }
  if (signQuads.length) { group.add(new THREE.Mesh(mergeGeometries(signQuads), mats.roadSign)); group.add(new THREE.Mesh(mergeGeometries(signBacks), mats.signBack)); }
  if (signG.length) group.add(new THREE.Mesh(mergeGeometries(signG), mats.crossSign));
  // walls and fences (OSM barrier ways), with the openings for gates already cut in the data
  const wallP = [], wallC = [], fenceP = [];
  const wc = new THREE.Color();
  for (const [kind, h, flat] of data.w || []) {
    const hv = hashStr(Math.round(flat[0]), Math.round(flat[1]));
    wc.set(kind ? '#5d646c' : ['#d9cfbd', '#c8a77f', '#e6e1d6', '#bfae96', '#d2b48c'][Math.floor(hv * 5)]);
    for (let i = 0; i + 3 < flat.length; i += 2) {
      const ax = flat[i], az = flat[i + 1], bx = flat[i + 2], bz = flat[i + 3];
      const len = Math.hypot(bx - ax, bz - az); if (len < 0.2) continue;
      const tx = -(bz - az) / len * 0.13, tz = (bx - ax) / len * 0.13;
      if (kind === 0) {
        for (const sd of [1, -1]) pushQuad(wallP, [ax + tx * sd, 0, az + tz * sd], [bx + tx * sd, 0, bz + tz * sd], [bx + tx * sd, h, bz + tz * sd], [ax + tx * sd, h, az + tz * sd]);
        pushQuad(wallP, [ax + tx, h, az + tz], [bx + tx, h, bz + tz], [bx - tx, h, bz - tz], [ax - tx, h, az - tz]);
        for (let k2 = 0; k2 < 18; k2++) wallC.push(wc.r, wc.g, wc.b);
      } else pushQuad(fenceP, [ax, 0, az], [bx, 0, bz], [bx, h, bz], [ax, h, az]);
      // you can't drive through a wall
      if (kind === 0 || h > 1.2) {
        const rec = { h, xs: [ax, bx], zs: [az, bz], minX: Math.min(ax, bx), maxX: Math.max(ax, bx), minZ: Math.min(az, bz), maxZ: Math.max(az, bz), wall: true };
        const e = [ax, az, bx, bz, rec];
        for (let x = Math.floor(rec.minX / BUCKET); x <= Math.floor(rec.maxX / BUCKET); x++) for (let z = Math.floor(rec.minZ / BUCKET); z <= Math.floor(rec.maxZ / BUCKET); z++) bucket(x * 100003 + z).edges.push(e);
      }
    }
  }
  if (wallP.length) { const m = addMesh(wallP, mats.wallPlain, { c: wallC }); if (m) m.castShadow = true; }
  if (fenceP.length) { const fu = []; for (let i = 0; i < fenceP.length; i += 18) { const L = Math.hypot(fenceP[i + 3] - fenceP[i], fenceP[i + 5] - fenceP[i + 2]); fu.push(0, 0, L / 0.6, 0, L / 0.6, 1, 0, 0, L / 0.6, 1, 0, 1); } addMesh(fenceP, mats.fence, { u: fu }); }
  // ground cover from OSM land use: parks and lawns, water, industry, markets, cemeteries, fields, building sites, pitches
  for (const g2 of data.g || []) {
    const [cls, ext, holes] = g2;
    const contour = []; for (let i = 0; i < ext.length; i += 2) contour.push(new THREE.Vector2(ext[i], ext[i + 1]));
    const hs = (holes || []).map((h) => { const a2 = []; for (let i = 0; i < h.length; i += 2) a2.push(new THREE.Vector2(h[i], h[i + 1])); return a2; });
    let tris; try { tris = THREE.ShapeUtils.triangulateShape(contour, hs); } catch (e) { continue; }
    const all = contour.concat(...hs);
    const gp = groundP[cls] || (groundP[cls] = { p: [], u: [] });
    const y = cls === 4 ? 0.004 : 0.009;
    for (const [a2, b2, c2] of tris) for (const ix of [a2, c2, b2]) { gp.p.push(all[ix].x, y, all[ix].y); gp.u.push(all[ix].x / 8, all[ix].y / 8); }
  }
  for (const cls in groundP) { const gp = groundP[cls]; fixUp(gp.p, gp.u); const m = addMesh(gp.p, mats.land[cls], { u: gp.u }); if (m) m.castShadow = false; }
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
    // each head shows the light of the drivers it faces: they travel along (sin rot, cos rot), so a head facing
    // east-west traffic runs on the other half of the junction's cycle (before, every head showed the
    // north-south phase, so an east-west driver could see green while the cross traffic had it too)
    cell.lampInfo = lampPos.map((l) => { const sg = city.signalList.find((q2) => q2.x === l[0] && q2.z === l[1]); return { x: l[0], z: l[1], color: l[6], phase: sg ? sg.phase : 0, axis: Math.abs(Math.sin(l[2])) > Math.abs(Math.cos(l[2])) ? 'ew' : 'ns' }; });
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
  let nx = ox / d, nz = oz / d;
  if (d >= edge) return { x, z, rot: Math.atan2(-nx, -nz) };
  // pushed out to the kerb: on a divided road that side can be the other carriageway, so try both sides
  // (and a little further out) and keep the first spot that is clear of every carriageway
  const onRoad = (px, pz) => segs.some((s) => {
    const dx = s.bx - s.ax, dz = s.bz - s.az, l2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((px - s.ax) * dx + (pz - s.az) * dz) / l2));
    return Math.hypot(s.ax + dx * t - px, s.az + dz * t - pz) < s.width / 2 + 0.3;
  });
  for (const extra of [0, 2, 4]) for (const sd of [1, -1]) {
    const qx = near.px + nx * sd * (edge + extra), qz = near.pz + nz * sd * (edge + extra);
    if (!onRoad(qx, qz)) return { x: qx, z: qz, rot: Math.atan2(-nx * sd, -nz * sd) };
  }
  return { x: near.px + nx * edge, z: near.pz + nz * edge, rot: Math.atan2(-nx, -nz) };
}
