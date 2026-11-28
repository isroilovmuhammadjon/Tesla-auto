// Everyday cars of Tashkent streets for the open city: compact sedans (Cobalt, Gentra / Lacetti,
// classic Nexia), the little Spark hatchback and the Damas micro-van. Each is a side profile
// extruded to the car's width with rounded edges, a glass house, lights, bumpers and plates.
// Shapes and proportions follow the real cars; no logos.
import * as THREE from 'three';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import { loadGLB } from './glb.js?v=b55d34f6';

// Cars built in Blender (scripts/cars/build_cars.py -> www/models/<car>.glb + .surf.json): body and cabin
// come from the model, lamps / grilles / seams are laid onto its surface. Others (or if loading fails) use
// the procedural body below.
export const BLENDER_CARS = ['cobalt'];
const BLENDER = {};
function decodeSurf(sj) {
  const dec = (b64) => { const bin = atob(b64), a = new Int16Array(bin.length / 2); for (let i = 0; i < a.length; i++) a[i] = bin.charCodeAt(2 * i) | (bin.charCodeAt(2 * i + 1) << 8); return a; };
  const F = dec(sj.front), R = dec(sj.rear), S = dec(sj.side);
  const bil = (A, nu, u, v, nv) => {          // bilinear over a grid of millimetres, -32768 = no surface
    const i = Math.floor(u), j = Math.floor(v), fu = u - i, fv = v - j;
    if (i < 0 || j < 0 || i >= nu - 1 || j >= nv - 1) return null;
    const q = [A[j * nu + i], A[j * nu + i + 1], A[(j + 1) * nu + i], A[(j + 1) * nu + i + 1]];
    if (q.some((x) => x === -32768)) { const ok = q.filter((x) => x !== -32768); return ok.length >= 2 ? ok.reduce((a, b) => a + b, 0) / ok.length / 1000 : null; }
    return ((q[0] * (1 - fu) + q[1] * fu) * (1 - fv) + (q[2] * (1 - fu) + q[3] * fu) * fv) / 1000;
  };
  return {
    // world z of the nose / tail surface at lateral w, height y (Blender Y forward = -z in the game)
    end(w, y, front) { const Y = bil(front ? F : R, sj.nw, Math.abs(w) / sj.dw, (y - sj.y0) / sj.dy, sj.ny); return Y === null ? null : -Y; },
    side(xp, y) { return bil(S, sj.nx, (xp - sj.x0) / sj.dx, (y - sj.y0) / sj.dy, sj.ny); },
  };
}
await Promise.all(BLENDER_CARS.map(async (t) => {
  try {
    const [g, sj] = await Promise.all([loadGLB(`models/${t}.glb?v=20261128d`), fetch(`models/${t}.surf.json?v=20261128d`).then((r) => r.json())]);
    if (g.body && g.cabin) BLENDER[t] = { body: g.body, cabin: g.cabin, surf: decodeSurf(sj) };
  } catch (e) { console.warn('car model not loaded, using the procedural one:', t, e); }
}));

// x = forward (front at +L/2), y = up. Wheel x positions, radius, body top contour and glass house.
const MODELS = {
  // 2nd-generation sedan built in Uzbekistan since 2012: 4479 x 1735 x 1514 mm, wheelbase 2620 mm,
  // 185/75 R14 tyres (published figures). A tall body: high waist (side glass starts ~0.98 m up), a
  // high boot deck and a short glasshouse, which is what makes it look like itself from behind.
  cobalt: {
    L: 4.48, W: 1.735, H: 1.514, R: 0.31, wheels: [1.33, -1.29], smooth: true, weight: 0.3,
    top: [[2.25, 0.6], [2.22, 0.79], [2.05, 0.87], [1.4, 0.93], [0.76, 0.97], [-0.5, 1.0], [-1.55, 1.06], [-1.8, 1.08], [-2.17, 1.06], [-2.25, 0.98], [-2.26, 0.55]],
    glass: [[0.76, 0.96], [0.08, 1.37], [-0.75, 1.41], [-1.2, 1.35], [-1.62, 1.07]],   // (outline + 5 cm glass bevel + roof panel = 1.514 m, checked by overlay)
    head: { x: 0.45, y: 0.72, z: 2.22, w: 0.32, h: 0.15, tilt: 0.25, sweep: { bot: 0.68, top: 0.8, len: 0.42 } },
    // tail lamps on the rear corners under the boot-lid line, wrapping well round onto the wings; the
    // plate is on the bumper (checked against photos of Tashkent cars, see docs/CAR-REFERENCES.md)
    tail: { x: 0.6, y: 0.9, w: 0.34, h: 0.3, bar: false, wrap: { inTop: 0.5, inBot: 0.56, top: 1.03, bot: 0.66, side: 0.38 }, plateY: 0.47, bumperChrome: 0.57 },
    // two-part grille in one opening: a narrow upper slot and a big lower mesh with the chrome bar between
    grille: { y: 0.67, w: 0.62, h: 0.2 }, lower: { y: 0.37, w: 0.8, h: 0.08 }, fog: true, frontPlateY: 0.44, plan: [0.36, 0.78, 0.2, 0.8], mirror: { z: 0.71, y: 1.13 }, bumperLow: [0.27, 0.4], kit: 'cobalt',
  },
  gentra: {
    L: 4.52, W: 1.725, H: 1.445, R: 0.3, wheels: [1.33, -1.27], smooth: true, weight: 0.22,
    top: [[2.28, 0.5], [2.22, 0.66], [1.95, 0.75], [1.2, 0.85], [0.8, 0.89], [-0.6, 0.94], [-1.55, 0.98], [-1.78, 1.0], [-2.18, 0.97], [-2.27, 0.84], [-2.25, 0.5]],
    glass: [[0.8, 0.9], [0.06, 1.41], [-0.8, 1.445], [-1.26, 1.36], [-1.62, 1.0]],
    head: { x: 0.58, y: 0.71, z: 2.2, w: 0.48, h: 0.17, tilt: 0.55, sweep: { bot: 0.69, top: 0.79, len: 0.36 } }, tail: { x: 0.6, y: 0.88, w: 0.44, h: 0.17, bar: false, wrap: { inTop: 0.36, inBot: 0.44, top: 0.97, bot: 0.8, side: 0.26 }, plateOnLid: 0.82 },
    grille: { y: 0.64, w: 0.6, h: 0.12 }, lower: { y: 0.4, w: 0.9, h: 0.14 }, fog: true, kit: 'gentra', frontPlateY: 0.43,
  },
  // Nexia 3 (also sold as Ravon Nexia R3, 2016-2020): the 4th-generation compact sedan body built at
  // Asaka. About 4310 x 1710 x 1505 mm, wheelbase 2480 mm. Tall cabin with a big rear window, short
  // boot, plate in a recess in the boot lid, round-element tail lamps on the corners, honeycomb grille.
  nexia: {
    L: 4.31, W: 1.71, H: 1.505, R: 0.3, wheels: [1.325, -1.155], smooth: true, weight: 0.18,
    top: [[2.155, 0.66], [2.13, 0.8], [1.95, 0.87], [1.3, 0.93], [0.95, 0.95], [-0.5, 0.99], [-1.5, 1.03], [-1.75, 1.05], [-2.08, 1.03], [-2.155, 0.95], [-2.155, 0.55]],
    glass: [[0.95, 0.94], [0.2, 1.47], [-0.55, 1.505], [-1.05, 1.46], [-1.58, 1.03]],
    head: { x: 0.58, y: 0.71, z: 2.13, w: 0.44, h: 0.15, tilt: 0.25, sweep: { bot: 0.68, top: 0.79, len: 0.3 } }, tail: { x: 0.58, y: 0.92, w: 0.36, h: 0.22, bar: false, wrap: { inTop: 0.5, inBot: 0.52, top: 1.01, bot: 0.8, side: 0.26 }, plateOnLid: 0.87, plateNoBar: true },
    grille: { y: 0.66, w: 0.56, h: 0.14 }, lower: { y: 0.42, w: 1.0, h: 0.14 }, fog: true, kit: 'nexia', frontPlateY: 0.47,
  },
  spark: {
    L: 3.64, W: 1.6, H: 1.52, R: 0.29, wheels: [1.17, -1.21], smooth: true, weight: 0.18,
    top: [[1.84, 0.62], [1.8, 0.76], [1.45, 0.84], [1.05, 0.88], [-0.4, 0.95], [-1.62, 0.99], [-1.8, 0.97], [-1.84, 0.6]],
    glass: [[1.05, 0.87], [0.42, 1.44], [-0.55, 1.52], [-1.45, 1.5], [-1.7, 1.32], [-1.74, 0.98]],
    head: { x: 0.52, y: 0.78, z: 1.76, w: 0.38, h: 0.26, tilt: 0.6 }, tail: { x: 0.6, y: 0.86, w: 0.17, h: 0.3 },
    grille: { y: 0.6, w: 0.5, h: 0.12 }, lower: { y: 0.42, w: 0.8, h: 0.16 }, kit: 'spark', frontPlateY: 0.45,
  },
  // the black mid-size sedan (Malibu style, 9th generation): long and low, a sloping fastback roof,
  // short boot, slim lamps joined by a chrome bar. Rare in traffic, mostly black.
  malibu: {
    L: 4.92, W: 1.854, H: 1.465, R: 0.33, wheels: [1.42, -1.41], smooth: true, weight: 0.05,
    top: [[2.46, 0.5], [2.41, 0.7], [2.15, 0.79], [1.4, 0.88], [0.98, 0.92], [-0.6, 0.98], [-1.7, 1.02], [-2.0, 1.04], [-2.36, 1.02], [-2.46, 0.92], [-2.45, 0.5]],
    glass: [[0.98, 0.91], [0.1, 1.42], [-0.6, 1.465], [-1.2, 1.4], [-1.95, 1.04]],
    head: { x: 0.66, y: 0.76, z: 2.38, w: 0.42, h: 0.09, tilt: 0.6 }, tail: { x: 0.66, y: 0.95, w: 0.4, h: 0.12, bar: false, wrap: { inTop: 0.52, inBot: 0.58, top: 1.0, bot: 0.88, side: 0.34 }, plateOnLid: 0.8 },
    grille: { y: 0.66, w: 0.9, h: 0.16 }, lower: { y: 0.42, w: 1.2, h: 0.2 }, kit: 'malibu', frontPlateY: 0.5, colors: [0x060709, 0x060709, 0x060709, 0x101216, 0xf4f4f6],
  },
  damas: {
    L: 3.49, W: 1.4, H: 1.9, R: 0.26, wheels: [0.98, -0.86], smooth: false, weight: 0.12,
    top: [[1.75, 0.72], [1.62, 0.93], [0.6, 1.06], [-1.74, 1.06], [-1.75, 0.34]],
    glass: [[1.62, 0.92], [1.22, 1.8], [1.02, 1.9], [-1.66, 1.9], [-1.74, 1.82], [-1.74, 1.06]],
    head: { x: 0.48, y: 0.62, z: 1.74, w: 0.3, h: 0.2, tilt: 0 }, tail: { x: 0.6, y: 0.72, w: 0.14, h: 0.34, plateY: 0.98 },
    grille: { y: 0.6, w: 0.5, h: 0.1 }, lower: { y: 0.38, w: 1.3, h: 0.14 }, kit: 'damas',
  },
};

const GEO = new Map();
const MAT = new Map();
const cg = (k, f) => { if (!GEO.has(k)) GEO.set(k, f()); return GEO.get(k); };
const cm = (k, f) => { if (!MAT.has(k)) MAT.set(k, f()); return MAT.get(k); };
const paint = (c) => cm(`p${c}`, () => new THREE.MeshStandardMaterial({ color: c, metalness: 0.45, roughness: 0.32, envMapIntensity: 1.2 }));
// tinted glass: you see sky reflections and a hint of the cabin, not a black hole (checked against photos)
const glass = () => cm('glass', () => new THREE.MeshStandardMaterial({ color: 0x4a5866, metalness: 0.55, roughness: 0.05, envMapIntensity: 1.6 }));
const black = () => cm('black', () => new THREE.MeshStandardMaterial({ color: 0x111215, roughness: 0.7 }));
const chrome = () => cm('chrome', () => new THREE.MeshStandardMaterial({ color: 0xd8dce2, metalness: 1, roughness: 0.18 }));
const tire = () => cm('tire', () => new THREE.MeshStandardMaterial({ color: 0x121214, roughness: 0.92 }));
const hub = () => cm('hub', () => new THREE.MeshStandardMaterial({ color: 0x9aa0a8, metalness: 0.85, roughness: 0.3 }));
const headMat = () => cm('head', () => new THREE.MeshStandardMaterial({ color: 0xe8edf2, emissive: 0xfff3dc, emissiveIntensity: 0.35, metalness: 0.5, roughness: 0.1 }));
const revMat = () => cm('rev', () => new THREE.MeshStandardMaterial({ color: 0xf4f4f4, emissive: 0x222222, roughness: 0.2 }));
// Uzbek number plate: white, region code box, flag, black characters (a generic number)
const rearPlateMat = () => cm('rplate', () => {
  const c = document.createElement('canvas'); c.width = 256; c.height = 56;
  const g = c.getContext('2d');
  g.fillStyle = '#f4f4f2'; g.fillRect(0, 0, 256, 56); g.strokeStyle = '#111'; g.lineWidth = 3; g.strokeRect(2, 2, 252, 52);
  g.fillStyle = '#111'; g.font = 'bold 34px Arial, sans-serif'; g.textBaseline = 'middle'; g.fillText('01', 10, 30);
  g.fillRect(56, 6, 2, 44);
  g.fillText('A 123 BC', 66, 30);
  g.fillStyle = '#1eb53a'; g.fillRect(226, 12, 20, 8); g.fillStyle = '#fff'; g.fillRect(226, 20, 20, 6); g.fillStyle = '#0099b5'; g.fillRect(226, 26, 20, 8);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshStandardMaterial({ map: t, roughness: 0.5 });
});
const plateMat = () => cm('plate', () => new THREE.MeshStandardMaterial({ color: 0xf2f3f0, roughness: 0.5 }));

function extrude(shape, width, bevel) {
  const depth = Math.max(0.01, width - bevel * 2);
  let g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: 18, steps: 1 });
  g.rotateY(Math.PI / 2);      // shape x (forward) -> world -z, extrusion -> world x
  g.translate(-depth / 2, 0, 0);
  return toCreasedNormals(g, Math.PI / 3.5);
}

// The side profile is extruded at full width; these warps give the body its plan shape and
// tumblehome so it reads as a car, not a slab: the nose and tail round in towards the corners,
// the flanks pull in above the shoulder line and the glasshouse narrows towards the roof.
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
function shapeBody(g, m, type) {
  const p = g.attributes.position, half = m.L / 2, box = type === 'damas';
  const shoulder = m.glass[0][1] - 0.08;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const t = Math.abs(z) / half;
    let k = 1 - (box ? 0.05 : 0.13) * smooth(0.72, 1.0, t);                 // corners rounded in plan
    k *= 1 - (box ? 0.02 : 0.07) * smooth(shoulder, m.H, y);                // flanks lean in above the waist
    k *= 1 - 0.04 * smooth(0.6, 0.1, y);                                    // a little tuck under the sills
    p.setX(i, x * k);
  }
  g.computeVertexNormals();
  return g;
}
function shapeGlass(g, m, type) {
  const p = g.attributes.position, belt = m.glass[0][1], top = Math.max(...m.glass.map((q) => q[1]));
  const taper = type === 'damas' ? 0.06 : 0.12;
  for (let i = 0; i < p.count; i++) p.setX(i, p.getX(i) * (1 - taper * smooth(belt, top, p.getY(i))));
  g.computeVertexNormals();
  return g;
}
// tyre with a rounded shoulder; rim with five spokes (steel wheels with covers on the Damas)
function tyreGeo(R) {
  const pts = [[R * 0.66, -0.1], [R - 0.035, -0.1], [R - 0.004, -0.075], [R, 0], [R - 0.004, 0.075], [R - 0.035, 0.1], [R * 0.66, 0.1]].map(([r, y]) => new THREE.Vector2(r, y));
  const g = new THREE.LatheGeometry(pts, 24);
  g.rotateZ(Math.PI / 2);
  return g;
}
function rimGeo(R, type) {
  const parts = [new THREE.CylinderGeometry(R * 0.64, R * 0.64, 0.05, 20).rotateZ(Math.PI / 2).translate(0.07, 0, 0),
    new THREE.CylinderGeometry(R * 0.17, R * 0.17, 0.07, 12).rotateZ(Math.PI / 2).translate(0.1, 0, 0)];
  const spokes = type === 'damas' ? 0 : type === 'spark' ? 4 : 5;
  if (type === 'malibu') {
    for (let i = 0; i < 5; i++) for (const d of [-0.16, 0.16]) parts.push(new THREE.BoxGeometry(0.028, R * 0.52, 0.06).translate(0.105, R * 0.34, 0).rotateX((i / 5) * Math.PI * 2 + d));
  } else if (type === 'nexia') {
    // steel wheel with a plastic cover: many short slots
    for (let i = 0; i < 10; i++) parts.push(new THREE.BoxGeometry(0.03, R * 0.3, 0.05).translate(0.1, R * 0.42, 0).rotateX((i / 10) * Math.PI * 2));
  } else if (type === 'cobalt') {
    // 15-inch alloy of the LTZ trim: six pairs of thin spokes
    for (let i = 0; i < 6; i++) for (const d of [-0.13, 0.13]) parts.push(new THREE.BoxGeometry(0.025, R * 0.5, 0.06).translate(0.105, R * 0.34, 0).rotateX((i / 6) * Math.PI * 2 + d));
  } else for (let i = 0; i < spokes; i++) parts.push(new THREE.BoxGeometry(0.04, R * 0.5, 0.07).translate(0.105, R * 0.33, 0).rotateX((i / spokes) * Math.PI * 2));
  const all = parts.map((g) => { const n = g.index ? g.toNonIndexed() : g; n.deleteAttribute('uv'); return n; });
  const merged = mergeParts(all);
  return merged;
}
function mergeParts(list) {
  let count = 0; for (const g of list) count += g.attributes.position.count;
  const pos = new Float32Array(count * 3), nor = new Float32Array(count * 3);
  let o = 0;
  for (const g of list) { pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); o += g.attributes.position.count; }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  return g;
}

// Smooth body for the sedans and the Spark, lofted from cross-sections (the side profile's roof line, the
// plan's rounded corners, a rounded shoulder and a tucked sill) instead of one extruded profile. The
// extrusion gave flat slab sides with creased shading and a wedge nose; photos show rounded, sculpted
// bodies. Wheel arches are cut into the floor line. Built in profile space (x forward, y up, w across)
// and turned into the car's frame (front at -z) at the end.
function loftBody(m) {
  const half = m.L / 2 + 0.01;                           // the real overall length (checked by overlay on photos)
  const topPts = m.top.map(([x, y]) => new THREE.Vector2(x, y)).sort((a, b) => a.x - b.x);
  const curve = new THREE.SplineCurve(topPts), dense = curve.getPoints(400).sort((a, b) => a.x - b.x);
  const yTop = (x) => { if (x <= dense[0].x) return dense[0].y; for (let i = 1; i < dense.length; i++) if (dense[i].x >= x) { const a = dense[i - 1], b = dense[i], t = (x - a.x) / ((b.x - a.x) || 1); return a.y + (b.y - a.y) * t; } return dense[dense.length - 1].y; };
  const ar = m.R + 0.07, yb0 = m.R * 0.95;
  // the underside rises beyond the axles to the bumpers' lower edges (photo overlay: ~0.40 m at the tail,
  // ~0.27 m under the nose)
  const [fw0, rw0] = m.wheels, endF = m.bumperLow ? m.bumperLow[0] : yb0, endR = m.bumperLow ? m.bumperLow[1] : yb0;
  const yBot = (x) => {
    let y = yb0;
    if (x > fw0 + ar) y = yb0 + (endF - yb0) * smooth(fw0 + ar, half, x);
    else if (x < rw0 - ar) y = yb0 + (endR - yb0) * smooth(rw0 - ar, -half, x);
    for (const wx of m.wheels) { const d = x - wx; if (Math.abs(d) < ar) y = Math.max(y, m.R + Math.sqrt(ar * ar - d * d)); }
    return y;
  };
  const N = 72, K = 7;
  const xs = []; for (let i = 0; i <= N; i++) { const u = i / N; xs.push(-half + 2 * half * (0.5 - 0.5 * Math.cos(Math.PI * u))); }   // denser at the ends
  const pos = [], idx = [];
  const ring = (x, endK) => {
    const t = Math.min(1, Math.abs(x) / half);
    // plan shape from the photo overlays: the front bumper curves back over the last ~45 cm (the nose is about
    // 70 % of the full width at its tip); the tail is squarer
    const pf = m.plan || [0.31, 0.8, 0.14, 0.82];
    const tf = x > 0 ? Math.max(0, (t - pf[1]) / (1 - pf[1])) : Math.max(0, (t - pf[3]) / (1 - pf[3]));
    const w = (m.W / 2) * (1 - (x > 0 ? pf[0] : pf[2]) * tf * tf) * (1 - 0.06 * endK);
    let yt = Math.max(yTop(Math.max(-m.L / 2, Math.min(m.L / 2, x))), yBot(x) + 0.12), yb = yBot(x);
    yt -= 0.03 * endK; yb += 0.04 * endK;
    const h = yt - yb, ySh = yb + h * 0.74;
    // half ring from the bottom centre round the side to the top centre
    return [[0, yb], [w * 0.9, yb], [w * 0.99, yb + Math.min(0.1, h * 0.2)], [w, ySh], [w * 0.97, yt - Math.min(0.05, h * 0.12)], [w * 0.86, yt - 0.004], [0, yt + 0.012]];
  };
  const rings = xs.map((x, i) => ({ x, r: ring(x, i === 0 || i === N ? 1 : i === 1 || i === N - 1 ? 0.35 : 0) }));
  const ringVerts = (R) => { const out = []; for (let k = 0; k < K; k++) out.push([R.r[k][0], R.r[k][1]]); for (let k = K - 2; k >= 1; k--) out.push([-R.r[k][0], R.r[k][1]]); return out; };
  const M = 2 * K - 2;
  for (const R of rings) for (const [w, y] of ringVerts(R)) pos.push(w, y, -R.x);
  for (let i = 0; i < N; i++) for (let k = 0; k < M; k++) {
    const a = i * M + k, b = i * M + (k + 1) % M, c = (i + 1) * M + k, d = (i + 1) * M + (k + 1) % M;
    idx.push(a, c, b, b, c, d);
  }
  // end caps (own vertices, so the nose and tail faces shade flat)
  for (const [i, flip] of [[0, false], [N, true]]) {
    const R = ringVerts(rings[i]), base = pos.length / 3, cy = R.reduce((s2, p2) => s2 + p2[1], 0) / R.length;
    pos.push(0, cy, -rings[i].x); for (const [w, y] of R) pos.push(w, y, -rings[i].x);
    for (let k = 0; k < M; k++) { const p1 = base + 1 + k, p2 = base + 1 + (k + 1) % M; if (flip) idx.push(base, p2, p1); else idx.push(base, p1, p2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
  g.computeVertexNormals();
  // where the body surface is, so lamps, grilles and seams can be laid onto it (decals) instead of boxes
  const inRing = (r, w, y) => {      // (w, y) inside the half ring closed along w = 0
    let inside = false;
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const [xi, yi] = r[i], [xj, yj] = r[j];
      if ((yi > y) !== (yj > y) && w < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  };
  const halfAt = (x, y) => {         // the body's half-width at profile station x and height y (null above / below)
    const r = ring(x, 0); let best = null;
    for (let i = 0; i < r.length - 1; i++) {
      const [x1, y1] = r[i], [x2, y2] = r[i + 1];
      if ((y1 - y) * (y2 - y) <= 0 && y1 !== y2) { const w = x1 + (x2 - x1) * (y - y1) / (y2 - y1); if (best === null || w > best) best = w; }
    }
    return best;
  };
  g.userData.surf = {
    // world z of the nose (front) or tail surface at lateral offset w and height y
    end(w, y, front) { const sg = front ? 1 : -1; for (let x = half; x > 0.3; x -= 0.004) if (inRing(ring(sg * x, 0), Math.abs(w), y)) return -sg * x; return null; },
    side(xp, y) { return halfAt(xp, y); },     // lateral half-width at profile x (forward) and height y
  };
  return g;
}

// A decal laid on the body: a 2D outline in (a, b) is gridded into small cells and each corner is mapped onto
// the surface by map(a, b) -> [x, y, z] (or null off the body). Follows the nose's and flanks' curves.
function surfDecal(poly, map, maxEdge = 0.02) {
  // triangulate the outline (smooth edges), split triangles until no edge is longer than maxEdge, then map
  // every vertex onto the body so the decal follows its curves
  const shape = new THREE.Shape(poly.map(([a, b]) => new THREE.Vector2(a, b)));
  const base = new THREE.ShapeGeometry(shape);
  const P = base.attributes.position, I = base.index ? base.index.array : null;
  const tris = [];
  const n = I ? I.length : P.count;
  for (let i = 0; i < n; i += 3) { const v = (k) => { const j = I ? I[i + k] : i + k; return [P.getX(j), P.getY(j)]; }; tris.push([v(0), v(1), v(2)]); }
  const out = [];
  const mid = (p, q) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
  const len = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);
  while (tris.length) {
    const [A, B2, C] = tris.pop();
    if (Math.max(len(A, B2), len(B2, C), len(C, A)) > maxEdge) { const ab = mid(A, B2), bc = mid(B2, C), ca = mid(C, A); tris.push([A, ab, ca], [ab, B2, bc], [ca, bc, C], [ab, bc, ca]); continue; }
    const pa = map(...A), pb = map(...B2), pc = map(...C);
    if (pa && pb && pc) out.push(...pa, ...pb, ...pc);
  }
  base.dispose();
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(out, 3));
  g.computeVertexNormals();
  return g;
}

function bodyShape(m) {
  const s = new THREE.Shape();
  const yb = m.R * 0.95, ar = m.R + 0.07;
  const [fw, rw] = m.wheels;
  const back = -m.L / 2 + 0.03, frontX = m.L / 2 - 0.03;
  s.moveTo(back, yb + 0.02);
  s.lineTo(rw - ar, yb);
  s.absarc(rw, m.R, ar, Math.PI, 0, true);
  s.lineTo(fw - ar, yb);
  s.absarc(fw, m.R, ar, Math.PI, 0, true);
  s.lineTo(frontX, yb + 0.02);
  const pts = m.top.map(([x, y]) => new THREE.Vector2(x, y));
  if (m.smooth) s.splineThru(pts); else pts.forEach((p) => s.lineTo(p.x, p.y));
  s.lineTo(back, yb + 0.02);
  return s;
}
function glassShape(m) {
  const s = new THREE.Shape();
  const g = m.glass;
  s.moveTo(g[0][0], g[0][1] - 0.02);
  const pts = g.slice(1).map(([x, y]) => new THREE.Vector2(x, y));
  if (m.smooth) s.splineThru(pts); else pts.forEach((p) => s.lineTo(p.x, p.y));
  s.lineTo(g[g.length - 1][0], g[g.length - 1][1] - 0.02);
  s.lineTo(g[0][0], g[0][1] - 0.02);
  return s;
}

// ---------------------------------------------------------------- taxi trim (shared textures)
let taxiTex = null, checkerTex = null;
function taxiTextures() {
  if (taxiTex) return;
  const mk = (w, h, draw) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; };
  taxiTex = mk(256, 96, (g, w, h) => {
    g.fillStyle = '#ffc61a'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#111'; g.font = 'bold 64px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('TAKSI', w / 2, h / 2 + 4);
  });
  checkerTex = mk(128, 32, (g, w, h) => {
    for (let x = 0; x < w / 16; x++) for (let y = 0; y < 2; y++) { g.fillStyle = (x + y) % 2 ? '#111' : '#ffc61a'; g.fillRect(x * 16, y * 16, 16, 16); }
  });
  checkerTex.wrapS = THREE.RepeatWrapping;
}
function taxiTrim(g, m, type) {
  taxiTextures();
  const parts = [];
  const top = Math.max(...m.glass.map((p) => p[1]));
  const roofMid = -((m.glass[1][0] + m.glass[m.glass.length - 2][0]) / 2);
  const signMat = new THREE.MeshStandardMaterial({ map: taxiTex, emissive: 0xffc61a, emissiveIntensity: 0.25, emissiveMap: taxiTex, roughness: 0.4 });
  const sign = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.2, 0.26), [new THREE.MeshStandardMaterial({ color: 0xffc61a }), new THREE.MeshStandardMaterial({ color: 0xffc61a }), new THREE.MeshStandardMaterial({ color: 0xffd34d }), new THREE.MeshStandardMaterial({ color: 0xffc61a }), signMat, signMat]);
  sign.rotation.y = Math.PI / 2;
  sign.position.set(0, top + 0.1, roofMid);
  sign.castShadow = true;
  g.add(sign); parts.push(sign);
  // chequered band along both sides at door-handle height
  const belt = m.glass[0][1] - 0.12;
  const x0 = m.glass[1][0] + 0.1, x1 = m.glass[m.glass.length - 2][0] - 0.05;
  const len = Math.max(0.6, x0 - x1);
  const band = new THREE.MeshStandardMaterial({ map: checkerTex.clone(), roughness: 0.5, polygonOffset: true, polygonOffsetFactor: -2 });
  band.map.needsUpdate = true; band.map.repeat.set(len / 0.5, 1);
  for (const sd of [-1, 1]) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(len, 0.1), band);
    p.rotation.y = sd * Math.PI / 2;
    p.position.set(sd * (m.W / 2 + 0.004), belt, -(x0 + x1) / 2);
    g.add(p); parts.push(p);
  }
  void type;
  return parts;
}

// ---------------------------------------------------------------- per-model detail kits (decals on the body)
const decalMat = (k, f) => cm(k, () => { const mt = f(); mt.side = THREE.DoubleSide; mt.polygonOffset = true; mt.polygonOffsetFactor = -2; mt.polygonOffsetUnits = -2; return mt; });
const KIT_MATS = {
  lens: () => decalMat('kLens', () => new THREE.MeshStandardMaterial({ color: 0xdfe5ea, emissive: 0xfff3dc, emissiveIntensity: 0.25, metalness: 0.7, roughness: 0.12 })),
  lensIn: () => decalMat('kLensIn', () => new THREE.MeshStandardMaterial({ color: 0x9aa3ab, metalness: 0.9, roughness: 0.2 })),
  dark: () => decalMat('kDark', () => new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 0.75 })),
  mesh: () => decalMat('kMesh', () => new THREE.MeshStandardMaterial({ color: 0x24272b, roughness: 0.6 })),
  chrome: () => decalMat('kChrome', () => new THREE.MeshStandardMaterial({ color: 0xd8dce2, metalness: 1, roughness: 0.15 })),
  seam: () => decalMat('kSeam', () => new THREE.MeshBasicMaterial({ color: 0x1a1c1f, transparent: true, opacity: 0.75 })),
  rev: () => decalMat('kRev', () => new THREE.MeshStandardMaterial({ color: 0xf4f4f4, emissive: 0x222222, roughness: 0.2 })),
  fog: () => decalMat('kFog', () => new THREE.MeshStandardMaterial({ color: 0xf2f2ee, emissive: 0xfff6e0, emissiveIntensity: 0.15, roughness: 0.2 })),
};
const circle = (cx, cy, rx, ry = rx, n = 18) => Array.from({ length: n }, (_, i) => [cx + rx * Math.cos((i / n) * Math.PI * 2), cy + ry * Math.sin((i / n) * Math.PI * 2)]);
const mirrorA = (poly) => poly.map(([a, b]) => [-a, b]).reverse();
// The Cobalt as sold in Uzbekistan (2012-): checked against photos of Tashkent cars (docs/CAR-REFERENCES.md).
// Front: big swept headlamps whose top edge follows the bonnet shut line back up the wing; a narrow upper
// grille slot under a chrome edge, the chrome bar, a large lower grille in the same opening; plate on the
// bumper; round fog lamps in dark recesses at the bumper corners; a dark intake under the plate.
// Side: door shut lines (front door behind the front arch, B-pillar, rear door round the rear arch), handles,
// a dark belt moulding under the side glass.
const KITS = {
  cobalt: {
    front: [
      ['lens', [[0.37, 0.6], [0.35, 0.73], [0.42, 0.745], [0.55, 0.77], [0.68, 0.795], [0.79, 0.818], [0.835, 0.814], [0.825, 0.775], [0.74, 0.715], [0.62, 0.66], [0.5, 0.625], [0.42, 0.61]], true],
      ['lensIn', circle(0.47, 0.685, 0.042), true], ['lensIn', circle(0.58, 0.705, 0.036), true],
      ['dark', [[-0.32, 0.688], [0.32, 0.688], [0.335, 0.735], [-0.335, 0.735]]],
      ['chrome', [[-0.345, 0.735], [0.345, 0.735], [0.35, 0.75], [-0.35, 0.75]]],
      ['mesh', [[-0.355, 0.655], [0.355, 0.655], [0.33, 0.5], [-0.33, 0.5]]],
      ['chrome', [[-0.35, 0.66], [0.35, 0.66], [0.35, 0.679], [-0.35, 0.679]]],
      ['dark', [[-0.38, 0.405], [0.38, 0.405], [0.34, 0.335], [-0.34, 0.335]]],
      ['dark', circle(0.6, 0.41, 0.085, 0.055), true], ['fog', circle(0.6, 0.41, 0.034), true],
    ],
    seams: [[[0.93, 0.4], [0.9, 0.62], [0.82, 0.96]], [[-0.07, 0.38], [-0.09, 0.97]], [[-0.86, 0.39], [-0.93, 0.6], [-1.12, 0.97]]],
    handles: [[0.3, 0.86], [-0.55, 0.86]],
    // tail lamps (Blender body): on the rear face from the boot-lid line down to the bumper top, wrapping round
    // the corner onto the wing (rear-left photo overlay: inner top corner x 0.58, y 1.01)
    tailLamp: {
      rear: [[0.5, 1.035], [0.72, 1.045], [0.79, 1.0], [0.8, 0.8], [0.76, 0.68], [0.62, 0.655], [0.55, 0.69], [0.52, 0.86]],
      side: [[-2.25, 1.04], [-2.08, 1.03], [-1.9, 0.99], [-2.02, 0.86], [-2.18, 0.7], [-2.25, 0.67]],
      rev: [[0.56, 0.72], [0.64, 0.7], [0.65, 0.8], [0.57, 0.81]],
      blink: [[0.63, 0.88], [0.74, 0.88], [0.74, 0.96], [0.63, 0.96]],
    },
    // boot-lid shut line: down the inside of each lamp, dipping across the tail under the badge; plate recess
    rearSeams: [[[-0.49, 1.03], [-0.54, 0.8], [-0.47, 0.67], [-0.25, 0.625], [0, 0.615], [0.25, 0.625], [0.47, 0.67], [0.54, 0.8], [0.49, 1.03]]],
    rear: [['dark', [[-0.3, 0.405], [0.3, 0.405], [0.3, 0.535], [-0.3, 0.535]]]],
    belt: [[0.78, 0.957], [-1.58, 0.957]],
  },
  // Gentra / Lacetti sedan (Uzbek-built 2013-2024; photos of Tashkent cars): low bonnet, big swept clear
  // headlamps, chrome bar between the upper slot and the lower grille, round fog lamps; plate on the boot lid.
  gentra: {
    front: [
      ['lens', [[0.34, 0.555], [0.33, 0.64], [0.45, 0.668], [0.6, 0.695], [0.74, 0.722], [0.8, 0.722], [0.79, 0.685], [0.7, 0.638], [0.56, 0.58], [0.44, 0.553]], true],
      ['lensIn', circle(0.44, 0.61, 0.038), true], ['lensIn', circle(0.55, 0.625, 0.034), true],
      ['dark', [[-0.3, 0.6], [0.3, 0.6], [0.31, 0.645], [-0.31, 0.645]]],
      ['chrome', [[-0.33, 0.583], [0.33, 0.583], [0.33, 0.6], [-0.33, 0.6]]],
      ['mesh', [[-0.33, 0.58], [0.33, 0.58], [0.29, 0.475], [-0.29, 0.475]]],
      ['dark', [[-0.36, 0.385], [0.36, 0.385], [0.31, 0.31], [-0.31, 0.31]]],
      ['dark', circle(0.58, 0.37, 0.07, 0.05), true], ['fog', circle(0.58, 0.37, 0.03), true],
    ],
    seams: [[[0.93, 0.38], [0.9, 0.6], [0.78, 0.9]], [[-0.1, 0.36], [-0.11, 0.9]], [[-0.86, 0.38], [-0.93, 0.6], [-1.1, 0.9]]],
    handles: [[0.27, 0.82], [-0.57, 0.82]],
    belt: [[0.78, 0.893], [-1.6, 0.893]],
    rearSeams: [[[-0.36, 0.97], [-0.42, 0.8], [-0.38, 0.72], [0, 0.7], [0.38, 0.72], [0.42, 0.8], [0.36, 0.97]]],
  },
  // Nexia 3 (Ravon Nexia R3, T250 body): big swept headlamps rising along the bonnet, honeycomb grille right
  // under the bonnet edge with a chrome top, plate and dark intake on the bumper, fog lamps; plate on the lid.
  nexia: {
    front: [
      ['lens', [[0.33, 0.62], [0.31, 0.72], [0.42, 0.75], [0.56, 0.78], [0.7, 0.805], [0.79, 0.82], [0.81, 0.795], [0.74, 0.735], [0.6, 0.66], [0.45, 0.62]], true],
      ['lensIn', circle(0.44, 0.685, 0.042), true],
      ['mesh', [[-0.3, 0.728], [0.3, 0.728], [0.26, 0.6], [-0.26, 0.6]]],
      ['chrome', [[-0.31, 0.728], [0.31, 0.728], [0.31, 0.745], [-0.31, 0.745]]],
      ['dark', [[-0.36, 0.42], [0.36, 0.42], [0.32, 0.34], [-0.32, 0.34]]],
      ['dark', circle(0.58, 0.4, 0.07, 0.048), true], ['fog', circle(0.58, 0.4, 0.03), true],
    ],
    seams: [[[0.92, 0.4], [0.89, 0.62], [0.8, 0.94]], [[-0.12, 0.38], [-0.13, 0.94]], [[-0.76, 0.4], [-0.83, 0.62], [-1.02, 0.95]]],
    handles: [[0.25, 0.86], [-0.5, 0.86]],
    belt: [[0.93, 0.945], [-1.55, 0.945]],
    rearSeams: [[[-0.5, 1.01], [-0.53, 0.82], [-0.45, 0.73], [0, 0.71], [0.45, 0.73], [0.53, 0.82], [0.5, 1.01]]],
  },
  // Spark (M300): huge headlamps climbing up beside the bonnet to the A-pillars, thin upper slot, big
  // honeycomb lower grille with the plate on it, fog lamps; rear door handles hidden in the window frame.
  spark: {
    front: [
      ['lens', [[0.3, 0.57], [0.29, 0.66], [0.4, 0.7], [0.55, 0.745], [0.66, 0.78], [0.72, 0.795], [0.74, 0.765], [0.68, 0.7], [0.55, 0.615], [0.42, 0.565]], true],
      ['lensIn', circle(0.42, 0.63, 0.04), true],
      ['dark', [[-0.26, 0.62], [0.26, 0.62], [0.27, 0.66], [-0.27, 0.66]]],
      ['mesh', [[-0.33, 0.565], [0.33, 0.565], [0.37, 0.4], [-0.37, 0.4]]],
      ['dark', circle(0.56, 0.34, 0.06, 0.045), true], ['fog', circle(0.56, 0.34, 0.028), true],
    ],
    seams: [[[0.79, 0.4], [0.76, 0.62], [0.68, 0.95]], [[-0.2, 0.38], [-0.21, 0.97]], [[-0.82, 0.4], [-0.9, 0.62], [-1.05, 0.98]]],
    handles: [[0.12, 0.86]],
    belt: [[0.98, 0.955], [-1.45, 0.955]],
    rearSeams: [[[-0.5, 1.32], [-0.52, 0.66], [0, 0.64], [0.52, 0.66], [0.5, 1.32]]],
  },
  // Black mid-size sedan (Malibu style, 9th generation): slim headlamps, thin chrome-framed upper grille,
  // chrome bar, big lower grille, vertical fog-lamp slots; chrome window line.
  malibu: {
    front: [
      ['lens', [[0.37, 0.62], [0.36, 0.665], [0.5, 0.69], [0.66, 0.725], [0.8, 0.765], [0.84, 0.758], [0.8, 0.72], [0.66, 0.672], [0.5, 0.632]], true],
      ['dark', [[-0.34, 0.632], [0.34, 0.632], [0.35, 0.68], [-0.35, 0.68]]],
      ['chrome', [[-0.36, 0.68], [0.36, 0.68], [0.36, 0.692], [-0.36, 0.692]]],
      ['chrome', [[-0.37, 0.612], [0.37, 0.612], [0.37, 0.63], [-0.37, 0.63]]],
      ['mesh', [[-0.4, 0.605], [0.4, 0.605], [0.36, 0.42], [-0.36, 0.42]]],
      ['dark', [[0.58, 0.36], [0.66, 0.36], [0.66, 0.5], [0.58, 0.5]], true],
    ],
    seams: [[[1.02, 0.42], [0.98, 0.66], [0.88, 0.98]], [[-0.1, 0.4], [-0.12, 0.99]], [[-0.98, 0.42], [-1.05, 0.66], [-1.3, 0.99]]],
    handles: [[0.32, 0.9], [-0.6, 0.9]],
    belt: [[0.96, 1.0], [-1.9, 1.0]],
    beltMat: 'chrome',
    rearSeams: [[[-0.5, 1.0], [-0.54, 0.86], [-0.4, 0.74], [0, 0.72], [0.4, 0.74], [0.54, 0.86], [0.5, 1.0]]],
  },
  // Damas: flat-fronted micro-van; rectangular headlamps either side of a dark grille with a chrome bar;
  // front doors and the sliding side door.
  damas: {
    front: [
      ['lens', [[0.38, 0.56], [0.62, 0.56], [0.62, 0.7], [0.38, 0.7]], true],
      ['dark', [[-0.3, 0.55], [0.3, 0.55], [0.3, 0.71], [-0.3, 0.71]]],
      ['chrome', [[-0.3, 0.62], [0.3, 0.62], [0.3, 0.64], [-0.3, 0.64]]],
    ],
    seams: [[[1.52, 0.42], [1.48, 1.05]], [[0.74, 0.36], [0.74, 1.05]], [[-0.42, 0.36], [-0.42, 1.05]]],
    handles: [[0.86, 0.84], [-0.3, 0.84]],
    belt: [[1.5, 1.07], [-1.7, 1.07]],
  },
};
function buildKit(name, surf, m) {
  const K = KITS[name], out = [];
  const front = (a, b) => { const z = surf.end(Math.abs(a), b, true); return z === null ? null : [a, b, z - 0.004]; };
  for (const [mat, poly, both] of K.front) {
    out.push([surfDecal(poly, front), mat, mat !== 'lens' && mat !== 'mesh']);
    if (both) out.push([surfDecal(mirrorA(poly), front), mat, mat !== 'lens' && mat !== 'mesh']);
  }
  const sideMap = (sd) => (xp, y) => { const w = surf.side(xp, y); return w === null ? null : [sd * (w + 0.003), y, -xp]; };
  const strip = (pts, wd, map) => {       // a thin line along the side, as quads
    const pos = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const [a1, b1] = pts[i], [a2, b2] = pts[i + 1], L = Math.hypot(a2 - a1, b2 - b1), n = Math.max(1, Math.ceil(L / 0.03));
      const na = -(b2 - b1) / L * wd / 2, nb = (a2 - a1) / L * wd / 2;
      for (let k = 0; k < n; k++) {
        const u0 = k / n, u1 = (k + 1) / n;
        const A = [a1 + (a2 - a1) * u0, b1 + (b2 - b1) * u0], B2 = [a1 + (a2 - a1) * u1, b1 + (b2 - b1) * u1];
        const q = [map(A[0] - na, A[1] - nb), map(B2[0] - na, B2[1] - nb), map(B2[0] + na, B2[1] + nb), map(A[0] + na, A[1] + nb)];
        if (q.some((v) => !v)) continue;
        pos.push(...q[0], ...q[1], ...q[2], ...q[0], ...q[2], ...q[3]);
      }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals(); return g;
  };
  const rearMap = (a, b) => { const z = surf.end(Math.abs(a), b, false); return z === null ? null : [a, b, z + 0.004]; };
  for (const [mat, poly] of K.rear || []) out.push([surfDecal(poly, rearMap), mat, true]);
  for (const sm of K.rearSeams || []) out.push([strip(sm, 0.007, rearMap), 'seam', true]);
  if (K.tailLamp) {
    const T = K.tailLamp, sideM = (sd) => (xp, y) => { const w = surf.side(xp, y); return w === null ? null : [sd * (w + 0.004), y, -xp]; };
    const rearM = (a, b) => { const z = surf.end(Math.abs(a), b, false); return z === null ? null : [a, b, z + 0.005]; };
    const rearM2 = (a, b) => { const z = surf.end(Math.abs(a), b, false); return z === null ? null : [a, b, z + 0.007]; };
    out.push([surfDecal(T.rear, rearM), 'tail', false], [surfDecal(mirrorA(T.rear), rearM), 'tail', false]);
    out.push([surfDecal(T.rev, rearM2), 'rev', false], [surfDecal(mirrorA(T.rev), rearM2), 'rev', false]);
    out.push([surfDecal(T.blink, rearM2), 'blink', false], [surfDecal(mirrorA(T.blink), rearM2), 'blink', false]);
    for (const sd of [-1, 1]) out.push([surfDecal(T.side, sideM(sd)), 'tail', false]);
  }
  for (const sd of [-1, 1]) {
    for (const sm of K.seams) out.push([strip(sm, 0.007, sideMap(sd)), 'seam', true]);
    out.push([strip(K.belt, K.beltMat ? 0.014 : 0.022, sideMap(sd)), K.beltMat || 'dark', true]);
    for (const [hx, hy] of K.handles) out.push([strip([[hx + 0.07, hy], [hx - 0.07, hy]], 0.028, sideMap(sd)), 'chrome', true]);
  }
  void m;
  return out;
}

export const UZ_MODELS = MODELS;
export const UZ_TYPES = Object.fromEntries(Object.entries(MODELS).map(([k, m]) => [k, { w: m.W, l: m.L, h: m.H, mass: k === 'damas' ? 1.1 : 1.2, weight: m.weight }]));

export function pickUzType() {
  let r = Math.random();
  for (const [k, m] of Object.entries(MODELS)) { r -= m.weight; if (r <= 0) return k; }
  return 'cobalt';
}

// Tashkent palette: mostly white, then silver, black and a few colours (Sparks come in brighter ones)
const COLORS = [0xf4f4f6, 0xf4f4f6, 0xf0f0f2, 0xf6f6f8, 0xededf0, 0xc3c7ce, 0xadb2ba, 0x17191e, 0x2b2e35, 0x1f3f74, 0x6c1419];
const SPARK_COLORS = [0xf4f4f6, 0xe9e9ec, 0xc0c4cb, 0x2e9bd6, 0xd8262f, 0xf1b51c, 0x7ab648, 0x1a1c20];

export function createUzCar(type) {
  const m = MODELS[type] || MODELS.cobalt;
  const g = new THREE.Group();
  const detail = new THREE.Group();       // small parts, hidden for far-away cars
  g.add(detail);
  const BL = BLENDER[type];
  const bodyGeo = BL ? BL.body.geometry : cg(`${type}b`, () => (type === 'damas' ? shapeBody(extrude(bodyShape(m), m.W, 0.07), m, type) : loftBody(m)));
  if (BL && !bodyGeo.userData.surf) bodyGeo.userData.surf = BL.surf;
  const body = new THREE.Mesh(bodyGeo, paint(COLORS[0]));
  body.castShadow = true;
  let cab;
  if (BL) {
    // the Blender cabin: paint, glass and black trim in one mesh (materials by name from the export)
    cab = new THREE.Mesh(BL.cabin.geometry, BL.cabin.materials.map((n) => (n === 'glass' ? glass() : n === 'trim' ? black() : body.material)));
  } else cab = new THREE.Mesh(cg(`${type}g`, () => shapeGlass(extrude(glassShape(m), m.W * 0.84, 0.05), m, type)), glass());
  cab.castShadow = true;
  g.add(body, cab);
  // body-colour roof panel + pillars read as a real car rather than a glass bubble
  const roofX0 = m.glass[1][0] - 0.12, roofX1 = m.glass[m.glass.length - 2][0] + 0.1;
  const roofY = Math.min(...m.glass.slice(1, -1).map((p) => p[1])) ;
  const roofLen = roofX0 - roofX1;
  const glassTop = (type === 'damas' ? 0.94 : 0.88) * m.W * 0.84;          // the glasshouse narrows to this at the roof
  const roof = new THREE.Mesh(cg(`${type}r`, () => new THREE.BoxGeometry(glassTop * 0.99, 0.05, roofLen)), body.material);
  // (the glass extrusion's bevel grows its outline by 5 cm: the roof sits on top of that, not inside it)
  roof.position.set(0, Math.max(...m.glass.map((p) => p[1])) + 0.04, -(roofX0 + roofX1) / 2);
  roof.castShadow = true;
  if (!BL) g.add(roof);
  void roofY;
  const B = (w, h, d, mat, x, y, z, parent = detail) => { const o = new THREE.Mesh(cg(`bx${w}_${h}_${d}`, () => new THREE.BoxGeometry(w, h, d)), mat); o.position.set(x, y, z); parent.add(o); return o; };
  const zF = -m.L / 2, zR = m.L / 2;
  // bumpers + grille + plates
  // bumpers: body colour with a black lower insert (the Damas keeps its plain black ones)
  const bumperMat = type === 'damas' ? black() : body.material;
  const bumpers = [];
  const ext = type === 'damas' ? 0.095 : 0.01;     // where the body's front / rear faces really are
  const fF = zF - ext, fR = zR + ext;
  // how far back from the nose / tail tip the body reaches 86 % of its width (where the lamps' wrap-round
  // pieces sit on the flank): from the plan curve used in loftBody
  const pfx = m.plan || [0.31, 0.8, 0.14, 0.82];
  const wrapBack = (front) => { if (type === 'damas') return 0.05; const a = front ? pfx[0] : pfx[2], b = front ? pfx[1] : pfx[3]; const tf = Math.sqrt(Math.min(1, 0.14 / a)); return (m.L / 2) * (1 - (b + tf * (1 - b))) + 0.02; };
  if (!m.kit) bumpers.push(B(m.W * (type === 'damas' ? 0.94 : 0.66), 0.2, 0.08, bumperMat, 0, m.lower.y - 0.01, fF + 0.05, g));
  B(m.W * (type === 'damas' ? 0.8 : 0.62), 0.06, 0.12, black(), 0, m.lower.y - 0.1, fF + 0.03);
  if (!m.kit) {
    B(m.lower.w, m.lower.h, 0.04, black(), 0, m.lower.y, fF - 0.03);
    B(m.grille.w, m.grille.h, 0.05, black(), 0, m.grille.y, fF + 0.012);
    B(m.grille.w * 0.9, 0.02, 0.05, chrome(), 0, m.grille.y + m.grille.h * 0.15, fF + 0.008);
  }
  B(0.52, 0.11, 0.02, plateMat(), 0, m.frontPlateY ?? m.lower.y + 0.01, fF - 0.04);
  bumpers.push(B(m.W * (type === 'damas' ? 0.84 : 0.74), 0.2, 0.08, bumperMat, 0, m.bumperLow ? m.bumperLow[1] + 0.11 : m.lower.y - 0.01, fR - 0.05, g));
  B(m.W * (type === 'damas' ? 0.8 : 0.66), 0.06, 0.12, black(), 0, m.bumperLow ? m.bumperLow[1] + 0.02 : m.lower.y - 0.11, fR - 0.03);
  if (m.tail.plateOnLid) {
    // Cobalt: the plate sits in a recess in the boot lid between the lamps, under a chrome strip
    B(0.6, 0.17, 0.02, black(), 0, m.tail.plateOnLid, fR + 0.002);
    B(0.52, 0.112, 0.02, rearPlateMat(), 0, m.tail.plateOnLid, fR + 0.01);
    if (!m.tail.plateNoBar) B(0.8, 0.035, 0.03, chrome(), 0, m.tail.plateOnLid + 0.12, fR + 0.004);
  } else {
    B(0.52, 0.112, 0.02, rearPlateMat(), 0, m.tail.plateY ?? m.tail.y - 0.33, fR + 0.008);   // Damas: up on the tailgate under the window
    if (m.tail.bumperChrome) B(m.W * 0.62, 0.025, 0.02, chrome(), 0, m.tail.bumperChrome, fR + 0.012);   // chrome strip across the bumper above the plate
    if (m.tail.bar) B(m.W * 0.45, 0.035, 0.03, chrome(), 0, m.tail.y + m.tail.h * 0.1, fR + 0.004, detail);   // chrome strip on the boot lid
  }
  // lights
  const tailMat = new THREE.MeshStandardMaterial({ color: 0x5a0a0e, emissive: 0xff1a22, emissiveIntensity: 0.5, roughness: 0.2 });
  const blinkMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.3, 0.14, 0.02) });
  // the same lamp materials as decals (double-sided, drawn over the paint) so brake lights and indicators work
  const tailDecal = tailMat.clone(); tailDecal.side = THREE.DoubleSide; tailDecal.polygonOffset = true; tailDecal.polygonOffsetFactor = -3; tailDecal.polygonOffsetUnits = -3;
  const blinkDecal = blinkMat; blinkMat.side = THREE.DoubleSide; blinkMat.polygonOffset = true; blinkMat.polygonOffsetFactor = -4; blinkMat.polygonOffsetUnits = -4;
  for (const s of [-1, 1]) {
    if (!m.kit) {
    const h = B(m.head.w, m.head.h, 0.06, headMat(), s * Math.min(m.head.x, (m.W / 2) * (type === 'damas' ? 0.93 : 0.76) - m.head.w / 2), m.head.y, (type === 'damas' ? -m.head.z - 0.085 : -(m.L / 2 - 0.015)), g);   // inside the rounded nose   // on the bevelled nose surface
    h.rotation.x = -m.head.tilt;
    if (m.head.sweep) {
      // the lamp carries on round the front corner and back along the wing, under the bonnet line
      const sw = m.head.sweep, sideX = (m.W / 2) * 0.86;
      const geo = cg(`hs${type}`, () => { const sh = new THREE.Shape(); sh.moveTo(0, sw.bot); sh.lineTo(sw.len, sw.bot + (sw.top - sw.bot) * 0.55); sh.lineTo(sw.len * 0.9, sw.top); sh.lineTo(0, sw.top); sh.closePath(); const gg = new THREE.ExtrudeGeometry(sh, { depth: 0.03, bevelEnabled: false }); gg.rotateY(-Math.PI / 2); return gg; });
      const hs = new THREE.Mesh(geo, headMat()); hs.position.set(s > 0 ? sideX + 0.012 : -sideX + 0.018, 0, fF + wrapBack(true)); g.add(hs);
    }
    if (m.fog) B(0.09, 0.07, 0.03, headMat(), s * (m.W / 2 - 0.33), m.lower.y + 0.02, fF - 0.035);
    }
    // tail lamp cluster set into the rounded rear corner, with the white reversing lamp and amber indicator
    const halfRear = (m.W / 2) * (type === 'damas' ? 0.95 : 1 - pfx[2] * 0.85);   // the tail face's half-width (plan curve)
    const tx = s * Math.min(m.tail.x, halfRear - m.tail.w / 2 - 0.02);
    // the rear face of the extruded body (bevel included) is ~9 cm behind zR: lamps sit 1 cm proud of it;
    // a sedan's lamps stop just under the edge of the boot lid
    const face = fR;
    const deck = m.tail.bar ? m.top[m.top.length - 2][1] + 0.14 - 0.05 : Infinity;
    const tTop = Math.min(m.tail.y + m.tail.h / 2, deck), tBot = m.tail.y - m.tail.h / 2;
    const th = Math.max(0.12, tTop - tBot), ty = tTop - th / 2;
    if (BL && KITS[m.kit] && KITS[m.kit].tailLamp) {
      // lamps are decals on the Blender body (buildKit)
    } else if (m.tail.wrap) {
      // the sedans' lamp clusters: a slanted shape on the rear face that carries on round the corner
      // and runs forward along the flank to a point (the Cobalt's deep wrap is how you know it)
      const w = m.tail.wrap, out = halfRear + 0.005, sideX = (m.W / 2) * 0.86;
      const rear = cg(`tl${type}`, () => { const sh = new THREE.Shape(); sh.moveTo(w.inBot, w.bot); sh.lineTo(out, w.bot); sh.lineTo(out, w.top); sh.lineTo(w.inTop, w.top - 0.02); sh.closePath(); return new THREE.ExtrudeGeometry(sh, { depth: 0.03, bevelEnabled: false }); });
      const rl = new THREE.Mesh(rear, tailMat); rl.scale.set(s, 1, 1); rl.position.set(0, 0, face - 0.02); g.add(rl);
      const side = cg(`ts${type}`, () => { const sh = new THREE.Shape(); sh.moveTo(0, w.bot + 0.02); sh.lineTo(w.side * 0.55, w.bot + 0.06); sh.lineTo(w.side, w.top - 0.03); sh.lineTo(0, w.top - 0.01); sh.closePath(); const gg = new THREE.ExtrudeGeometry(sh, { depth: 0.03, bevelEnabled: false }); gg.rotateY(Math.PI / 2); return gg; });
      const sl = new THREE.Mesh(side, tailMat); sl.position.set(s * (sideX + 0.012) - (s > 0 ? 0.03 : 0), 0, face - wrapBack(false)); g.add(sl);
      const cx = s * (w.inBot + out) / 2, cy = (w.top + w.bot) / 2, cw = out - w.inBot;
      B(cw * 0.34, (w.top - w.bot) * 0.22, 0.03, revMat(), cx - s * cw * 0.18, w.bot + (w.top - w.bot) * 0.22, face - 0.002, g);
      B(cw * 0.3, (w.top - w.bot) * 0.2, 0.03, blinkMat, cx + s * cw * 0.22, cy + (w.top - w.bot) * 0.18, face - 0.002);
    } else {
      B(m.tail.w, th, 0.04, tailMat, tx, ty, face - 0.01, g);
      B(m.tail.w * 0.38, th * 0.26, 0.04, revMat(), tx - s * m.tail.w * 0.24, ty - th * 0.26, face - 0.006, g);
      B(m.tail.w * 0.3, th * 0.22, 0.04, blinkMat, tx + s * m.tail.w * 0.28, ty + th * 0.24, face - 0.006);   // amber indicator in the cluster
      B(0.03, th * 0.85, 0.09, tailMat, s * (halfRear - 0.012), ty, face - 0.06, g);         // wraps round onto the flank
    }
    // mirrors
    if (m.mirror) { B(0.13, 0.12, 0.2, body.material, s * (m.W / 2 + 0.035), m.mirror.y, -m.mirror.z); B(0.07, 0.05, 0.08, black(), s * (m.W / 2 - 0.03), m.mirror.y - 0.04, -m.mirror.z + 0.03); }   // housing (position from the photo camera fit) on its stalk
    else B(0.12, 0.1, 0.16, body.material, s * (m.W / 2 + 0.05), m.glass[0][1] + 0.12, -(m.glass[0][0] - 0.25));
  }
  // wheels
  const tg = cg(`t${m.R}`, () => tyreGeo(m.R));
  const hg = cg(`h${m.R}${type}`, () => rimGeo(m.R, type));
  const wheels = [];
  for (const wx of m.wheels) for (const s of [-1, 1]) {
    const t = new THREE.Mesh(tg, tire()); t.position.set(s * (m.W / 2 - 0.12), m.R, -wx); t.castShadow = true; g.add(t);
    const hb = new THREE.Mesh(hg, hub()); hb.position.copy(t.position); hb.scale.x = s; detail.add(hb);
    wheels.push({ tire: t, hub: hb, front: wx > 0, side: s });
  }
  // body-colour door pillars break the glass into windows (B-pillar; the Damas gets two)
  const gl = m.glass, belt = gl[0][1], top = Math.max(...gl.map((p) => p[1]));
  const front = gl[1][0], rear = gl[gl.length - 2][0];
  const pillarsAt = type === 'damas' ? [0.62, 0.3] : [0.5];
  const pillars = [];
  for (const f of BL ? [] : pillarsAt) {
    const x = front + (rear - front) * f;
    for (const sd of [-1, 1]) {
      const p = new THREE.Mesh(cg(`pil${type}`, () => new THREE.BoxGeometry(0.03, top - belt - 0.04, 0.1)), body.material);
      p.position.set(sd * ((m.W * 0.42 + glassTop / 2) / 2 + 0.006), (top + belt) / 2, -x);
      p.rotation.z = sd * Math.atan2((m.W * 0.42 - glassTop / 2), top - belt);
      p.userData.bpillar = true;
      g.add(p); pillars.push(p);
    }
  }
  // A- and C-pillars in body colour along the edges of the windscreen and rear window, so the glass
  // reads as windows in a painted body (before, the whole glasshouse was one dark block)
  const gHalf = (y) => (m.W * 0.84 / 2 + 0.05) * (1 - (type === 'damas' ? 0.06 : 0.12) * smooth(belt, top, y));
  const strip = (pa, pb, wid, inset) => {
    const dx = pb[0] - pa[0], dy = pb[1] - pa[1], len = Math.hypot(dx, dy) + 0.06;
    const L0 = Math.hypot(dx, dy), nx = dy / L0, ny = -dx / L0;                      // outward normal in the profile
    const mx = (pa[0] + pb[0]) / 2 + nx * 0.062, my = (pa[1] + pb[1]) / 2 + ny * 0.062;
    for (const sd of [-1, 1]) {
      const o = new THREE.Mesh(cg(`ps${type}${wid}${len.toFixed(2)}`, () => new THREE.BoxGeometry(wid, 0.025, len)), body.material);
      o.position.set(sd * (gHalf(my) - wid / 2 - inset), my, -mx);
      o.rotation.x = Math.atan2(-dy, -dx);
      g.add(o); pillars.push(o);
    }
  };
  if (type !== 'damas' && !BL) {
    strip(gl[0], gl[1], 0.08, 0);                               // A-pillars
    strip(gl[gl.length - 2], gl[gl.length - 1], type === 'spark' ? 0.16 : 0.24, 0);   // C-pillars
  }
  if (type === 'damas' && !bodyGeo.userData.surf) {
    // the van's extruded body: flat front and rear faces, sides pulled in a little at the corners and roof
    const shoulder = m.glass[0][1] - 0.08;
    bodyGeo.userData.surf = {
      end(w, y, front) { return Math.abs(w) < m.W / 2 * 0.93 && y > m.R * 0.95 && y < 0.95 ? (front ? -(m.L / 2 + 0.095) : m.L / 2 + 0.095) : null; },
      side(xp, y) { const t = Math.abs(xp) / (m.L / 2); return (m.W / 2) * (1 - 0.05 * smooth(0.72, 1, t)) * (1 - 0.02 * smooth(shoulder, m.H, y)); },
    };
  }
  if (m.kit && bodyGeo.userData.surf) { const kit = cg(`kit${type}`, () => buildKit(m.kit, bodyGeo.userData.surf, m)); for (const [geo, mat, inDetail] of kit) { const o = new THREE.Mesh(geo, mat === 'tail' ? tailDecal : mat === 'blink' ? blinkDecal : mat === 'rev' ? KIT_MATS.rev() : KIT_MATS[mat]()); (inDetail ? detail : g).add(o); } }
  if (m.kit) for (const p of pillars) if (p.userData.bpillar) p.material = black();   // black B-pillar applique (window frames)
  const bodyMeshes = [body, roof, ...pillars.filter((p) => !(m.kit && p.userData.bpillar)), ...(type === 'damas' ? [] : bumpers)];
  const palette = m.colors || (type === 'spark' ? SPARK_COLORS : COLORS);
  return {
    type, mesh: g, model: m, wheels, bodyMeshes, glassMesh: cab, cabinPaint: BL ? (mat) => { cab.material = cab.material.map((x, i) => (BL.cabin.materials[i] === 'paint' ? mat : x)); } : null, detail, halfW: m.W / 2, halfL: m.L / 2, height: m.H, mass: UZ_TYPES[type].mass, air: false, tailMat, blinkMat,
    // a Tashkent taxi: the lit roof sign and the chequered band on the doors
    setTaxi(on) {
      if (on && !this.taxiParts) this.taxiParts = taxiTrim(g, m, type);
      if (this.taxiParts) for (const o of this.taxiParts) o.visible = on;
    },
    setBrake(on) { tailMat.emissiveIntensity = tailDecal.emissiveIntensity = on ? 2.6 : 0.5; },
    setBlink(on) { blinkMat.color.setRGB(on ? 4 : 0.3, on ? 1.6 : 0.14, on ? 0 : 0.02); },
    setColor() {
      const c = palette[Math.floor(Math.random() * palette.length)];
      const mat = paint(c);
      for (const o of bodyMeshes) o.material = mat;
      if (Array.isArray(cab.material)) cab.material = cab.material.map((x, i) => (BL.cabin.materials[i] === 'paint' ? mat : x));
      detail.children.forEach((o) => { if (o.geometry === GEO.get('bx0.12_0.1_0.16') || o.geometry === GEO.get('bx0.13_0.12_0.2')) o.material = mat; });
      return c;
    },
    setDetail(on) { detail.visible = on; },
  };
}
