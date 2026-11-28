// Everyday cars of Tashkent streets for the open city: compact sedans (Cobalt, Gentra / Lacetti,
// classic Nexia), the little Spark hatchback and the Damas micro-van. Each is a side profile
// extruded to the car's width with rounded edges, a glass house, lights, bumpers and plates.
// Shapes and proportions follow the real cars; no logos.
import * as THREE from 'three';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';

// x = forward (front at +L/2), y = up. Wheel x positions, radius, body top contour and glass house.
const MODELS = {
  cobalt: {
    L: 4.48, W: 1.735, H: 1.51, R: 0.3, wheels: [1.33, -1.29], smooth: true, weight: 0.3,
    top: [[2.25, 0.52], [2.18, 0.69], [1.95, 0.78], [1.3, 0.86], [0.86, 0.91], [-0.5, 0.97], [-1.55, 1.02], [-1.75, 1.04], [-2.15, 1.03], [-2.25, 0.95], [-2.26, 0.55]],
    glass: [[0.86, 0.9], [0.22, 1.45], [-0.75, 1.51], [-1.22, 1.43], [-1.62, 1.03]],
    head: { x: 0.58, y: 0.75, z: 2.17, w: 0.5, h: 0.2, tilt: 0.5 }, tail: { x: 0.6, y: 0.9, w: 0.34, h: 0.3, bar: true, wrap: { inTop: 0.47, inBot: 0.57, top: 1.03, bot: 0.7, side: 0.44 }, plateOnLid: 0.84 },
    grille: { y: 0.7, w: 0.66, h: 0.09 }, lower: { y: 0.45, w: 0.95, h: 0.22 },
  },
  gentra: {
    L: 4.52, W: 1.725, H: 1.445, R: 0.3, wheels: [1.33, -1.27], smooth: true, weight: 0.22,
    top: [[2.28, 0.5], [2.22, 0.66], [1.95, 0.75], [1.2, 0.85], [0.8, 0.89], [-0.6, 0.94], [-1.55, 0.98], [-1.78, 1.0], [-2.18, 0.97], [-2.27, 0.84], [-2.25, 0.5]],
    glass: [[0.8, 0.88], [0.06, 1.41], [-0.8, 1.445], [-1.26, 1.36], [-1.62, 0.99]],
    head: { x: 0.58, y: 0.71, z: 2.2, w: 0.48, h: 0.17, tilt: 0.55 }, tail: { x: 0.6, y: 0.88, w: 0.44, h: 0.17, bar: true, wrap: { inTop: 0.36, inBot: 0.44, top: 0.97, bot: 0.8, side: 0.26 } },
    grille: { y: 0.64, w: 0.6, h: 0.12 }, lower: { y: 0.4, w: 0.9, h: 0.14 },
  },
  nexia: {
    L: 4.48, W: 1.66, H: 1.39, R: 0.29, wheels: [1.3, -1.22], smooth: false, weight: 0.18,
    top: [[2.27, 0.56], [2.22, 0.68], [1.95, 0.72], [0.95, 0.81], [-0.6, 0.85], [-1.55, 0.89], [-2.18, 0.91], [-2.25, 0.86], [-2.25, 0.42]],
    glass: [[0.95, 0.8], [0.28, 1.36], [-0.85, 1.39], [-1.18, 1.35], [-1.6, 0.89]],
    head: { x: 0.55, y: 0.62, z: 2.25, w: 0.44, h: 0.19, tilt: 0.25 }, tail: { x: 0.55, y: 0.82, w: 0.38, h: 0.24, bar: true, wrap: { inTop: 0.46, inBot: 0.5, top: 0.9, bot: 0.7, side: 0.18 } },
    grille: { y: 0.6, w: 0.55, h: 0.12 }, lower: { y: 0.4, w: 1.4, h: 0.12 },
  },
  spark: {
    L: 3.64, W: 1.6, H: 1.52, R: 0.29, wheels: [1.17, -1.21], smooth: true, weight: 0.18,
    top: [[1.84, 0.55], [1.77, 0.72], [1.45, 0.82], [1.05, 0.88], [-0.4, 0.95], [-1.62, 0.99], [-1.8, 0.97], [-1.84, 0.6]],
    glass: [[1.05, 0.87], [0.42, 1.44], [-0.55, 1.52], [-1.45, 1.5], [-1.7, 1.32], [-1.74, 0.98]],
    head: { x: 0.52, y: 0.78, z: 1.76, w: 0.38, h: 0.26, tilt: 0.6 }, tail: { x: 0.62, y: 1.08, w: 0.17, h: 0.36 },
    grille: { y: 0.6, w: 0.5, h: 0.12 }, lower: { y: 0.42, w: 0.8, h: 0.16 },
  },
  // the black mid-size sedan (Malibu style, 9th generation): long and low, a sloping fastback roof,
  // short boot, slim lamps joined by a chrome bar. Rare in traffic, mostly black.
  malibu: {
    L: 4.92, W: 1.854, H: 1.465, R: 0.33, wheels: [1.42, -1.41], smooth: true, weight: 0.05,
    top: [[2.46, 0.5], [2.41, 0.7], [2.15, 0.79], [1.4, 0.88], [0.98, 0.92], [-0.6, 0.98], [-1.7, 1.02], [-2.0, 1.04], [-2.36, 1.02], [-2.46, 0.92], [-2.45, 0.5]],
    glass: [[0.98, 0.91], [0.1, 1.42], [-0.6, 1.465], [-1.2, 1.4], [-1.95, 1.04]],
    head: { x: 0.66, y: 0.76, z: 2.38, w: 0.42, h: 0.09, tilt: 0.6 }, tail: { x: 0.66, y: 0.95, w: 0.4, h: 0.12, bar: true, wrap: { inTop: 0.52, inBot: 0.58, top: 1.0, bot: 0.9, side: 0.34 } },
    grille: { y: 0.66, w: 0.9, h: 0.16 }, lower: { y: 0.42, w: 1.2, h: 0.2 }, colors: [0x060709, 0x060709, 0x060709, 0x101216, 0xf4f4f6],
  },
  damas: {
    L: 3.49, W: 1.4, H: 1.9, R: 0.26, wheels: [0.98, -0.86], smooth: false, weight: 0.12,
    top: [[1.75, 0.72], [1.62, 0.93], [0.6, 1.06], [-1.74, 1.06], [-1.75, 0.34]],
    glass: [[1.62, 0.92], [1.22, 1.8], [1.02, 1.9], [-1.66, 1.9], [-1.74, 1.82], [-1.74, 1.06]],
    head: { x: 0.48, y: 0.62, z: 1.74, w: 0.3, h: 0.2, tilt: 0 }, tail: { x: 0.6, y: 0.72, w: 0.14, h: 0.34 },
    grille: { y: 0.6, w: 0.5, h: 0.1 }, lower: { y: 0.38, w: 1.3, h: 0.14 },
  },
};

const GEO = new Map();
const MAT = new Map();
const cg = (k, f) => { if (!GEO.has(k)) GEO.set(k, f()); return GEO.get(k); };
const cm = (k, f) => { if (!MAT.has(k)) MAT.set(k, f()); return MAT.get(k); };
const paint = (c) => cm(`p${c}`, () => new THREE.MeshStandardMaterial({ color: c, metalness: 0.45, roughness: 0.32, envMapIntensity: 1.2 }));
const glass = () => cm('glass', () => new THREE.MeshStandardMaterial({ color: 0x22303b, metalness: 0.35, roughness: 0.06, envMapIntensity: 1.1 }));
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
  const taper = type === 'damas' ? 0.06 : 0.2;
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
  for (let i = 0; i < spokes; i++) parts.push(new THREE.BoxGeometry(0.04, R * 0.5, 0.07).translate(0.105, R * 0.33, 0).rotateX((i / spokes) * Math.PI * 2));
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
  const bodyGeo = cg(`${type}b`, () => shapeBody(extrude(bodyShape(m), m.W, 0.07), m, type));
  const glassGeo = cg(`${type}g`, () => shapeGlass(extrude(glassShape(m), m.W * 0.84, 0.05), m, type));
  const body = new THREE.Mesh(bodyGeo, paint(COLORS[0]));
  body.castShadow = true;
  const cab = new THREE.Mesh(glassGeo, glass());
  cab.castShadow = true;
  g.add(body, cab);
  // body-colour roof panel + pillars read as a real car rather than a glass bubble
  const roofX0 = m.glass[1][0] - 0.12, roofX1 = m.glass[m.glass.length - 2][0] + 0.1;
  const roofY = Math.min(...m.glass.slice(1, -1).map((p) => p[1])) ;
  const roofLen = roofX0 - roofX1;
  const glassTop = (type === 'damas' ? 0.94 : 0.8) * m.W * 0.84;          // the glasshouse narrows to this at the roof
  const roof = new THREE.Mesh(cg(`${type}r`, () => new THREE.BoxGeometry(glassTop * 0.99, 0.05, roofLen)), body.material);
  // (the glass extrusion's bevel grows its outline by 5 cm: the roof sits on top of that, not inside it)
  roof.position.set(0, Math.max(...m.glass.map((p) => p[1])) + 0.04, -(roofX0 + roofX1) / 2);
  roof.castShadow = true;
  g.add(roof);
  void roofY;
  const B = (w, h, d, mat, x, y, z, parent = detail) => { const o = new THREE.Mesh(cg(`bx${w}_${h}_${d}`, () => new THREE.BoxGeometry(w, h, d)), mat); o.position.set(x, y, z); parent.add(o); return o; };
  const zF = -m.L / 2, zR = m.L / 2;
  // bumpers + grille + plates
  // bumpers: body colour with a black lower insert (the Damas keeps its plain black ones)
  const bumperMat = type === 'damas' ? black() : body.material;
  const bumpers = [];
  const fF = zF - 0.095, fR = zR + 0.095;          // real front / rear faces of the bevelled body
  bumpers.push(B(m.W * 0.94, 0.2, 0.12, bumperMat, 0, m.lower.y - 0.01, fF + 0.035, g));
  B(m.W * 0.8, 0.06, 0.12, black(), 0, m.lower.y - 0.1, fF + 0.03);
  B(m.lower.w, m.lower.h, 0.04, black(), 0, m.lower.y, fF - 0.03);
  B(m.grille.w, m.grille.h, 0.05, black(), 0, m.grille.y, fF + 0.012);
  B(m.grille.w * 0.9, 0.02, 0.05, chrome(), 0, m.grille.y + m.grille.h * 0.15, fF + 0.008);
  B(0.52, 0.11, 0.02, plateMat(), 0, m.lower.y + 0.01, fF - 0.04);
  bumpers.push(B(m.W * 0.94, 0.22, 0.12, bumperMat, 0, m.lower.y - 0.01, fR - 0.035, g));
  B(m.W * 0.8, 0.06, 0.12, black(), 0, m.lower.y - 0.11, fR - 0.03);
  if (m.tail.plateOnLid) {
    // Cobalt: the plate sits in a recess in the boot lid between the lamps, under a chrome strip
    B(0.6, 0.17, 0.02, black(), 0, m.tail.plateOnLid, fR + 0.002);
    B(0.52, 0.112, 0.02, rearPlateMat(), 0, m.tail.plateOnLid, fR + 0.01);
    B(0.8, 0.035, 0.03, chrome(), 0, m.tail.plateOnLid + 0.12, fR + 0.004);
  } else {
    B(0.52, 0.112, 0.02, rearPlateMat(), 0, m.tail.y - (type === 'damas' ? 0.22 : 0.33), fR + 0.008);
    if (m.tail.bar) B(m.W * 0.45, 0.035, 0.03, chrome(), 0, m.tail.y + m.tail.h * 0.1, fR + 0.004, detail);   // chrome strip on the boot lid
  }
  // lights
  const tailMat = new THREE.MeshStandardMaterial({ color: 0x5a0a0e, emissive: 0xff1a22, emissiveIntensity: 0.5, roughness: 0.2 });
  const blinkMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.3, 0.14, 0.02) });
  for (const s of [-1, 1]) {
    const h = B(m.head.w, m.head.h, 0.06, headMat(), s * Math.min(m.head.x, (m.W / 2) * (type === 'damas' ? 0.93 : 0.84) - m.head.w / 2), m.head.y, -m.head.z - 0.085, g);   // inside the rounded nose   // on the bevelled nose surface
    h.rotation.x = -m.head.tilt;
    // tail lamp cluster set into the rounded rear corner, with the white reversing lamp and amber indicator
    const halfRear = (m.W / 2) * (type === 'damas' ? 0.95 : 0.87);
    const tx = s * Math.min(m.tail.x, halfRear - m.tail.w / 2 - 0.02);
    // the rear face of the extruded body (bevel included) is ~9 cm behind zR: lamps sit 1 cm proud of it;
    // a sedan's lamps stop just under the edge of the boot lid
    const face = zR + 0.095;
    const deck = m.tail.bar ? m.top[m.top.length - 2][1] + 0.14 - 0.05 : Infinity;
    const tTop = Math.min(m.tail.y + m.tail.h / 2, deck), tBot = m.tail.y - m.tail.h / 2;
    const th = Math.max(0.12, tTop - tBot), ty = tTop - th / 2;
    if (m.tail.wrap) {
      // the sedans' lamp clusters: a slanted shape on the rear face that carries on round the corner
      // and runs forward along the flank to a point (the Cobalt's deep wrap is how you know it)
      const w = m.tail.wrap, out = halfRear + 0.005, sideX = (m.W / 2) * 0.9;
      const rear = cg(`tl${type}`, () => { const sh = new THREE.Shape(); sh.moveTo(w.inBot, w.bot); sh.lineTo(out, w.bot); sh.lineTo(out, w.top); sh.lineTo(w.inTop, w.top - 0.02); sh.closePath(); return new THREE.ExtrudeGeometry(sh, { depth: 0.03, bevelEnabled: false }); });
      const rl = new THREE.Mesh(rear, tailMat); rl.scale.set(s, 1, 1); rl.position.set(0, 0, face - 0.02); g.add(rl);
      const side = cg(`ts${type}`, () => { const sh = new THREE.Shape(); sh.moveTo(0, w.bot + 0.02); sh.lineTo(w.side * 0.55, w.bot + 0.06); sh.lineTo(w.side, w.top - 0.03); sh.lineTo(0, w.top - 0.01); sh.closePath(); const gg = new THREE.ExtrudeGeometry(sh, { depth: 0.03, bevelEnabled: false }); gg.rotateY(Math.PI / 2); return gg; });
      const sl = new THREE.Mesh(side, tailMat); sl.position.set(s * (sideX + 0.012) - (s > 0 ? 0.03 : 0), 0, face - 0.05); g.add(sl);
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
    B(0.12, 0.1, 0.16, body.material, s * (m.W / 2 + 0.05), m.glass[0][1] + 0.12, -(m.glass[0][0] - 0.25));
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
  for (const f of pillarsAt) {
    const x = front + (rear - front) * f;
    for (const sd of [-1, 1]) {
      const p = new THREE.Mesh(cg(`pil${type}`, () => new THREE.BoxGeometry(0.03, top - belt - 0.04, 0.1)), body.material);
      p.position.set(sd * ((m.W * 0.42 + glassTop / 2) / 2 + 0.006), (top + belt) / 2, -x);
      p.rotation.z = sd * Math.atan2((m.W * 0.42 - glassTop / 2), top - belt);
      g.add(p); pillars.push(p);
    }
  }
  // A- and C-pillars in body colour along the edges of the windscreen and rear window, so the glass
  // reads as windows in a painted body (before, the whole glasshouse was one dark block)
  const gHalf = (y) => (m.W * 0.84 / 2 + 0.05) * (1 - (type === 'damas' ? 0.06 : 0.2) * smooth(belt, top, y));
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
  if (type !== 'damas') {
    strip(gl[0], gl[1], 0.08, 0);                               // A-pillars
    strip(gl[gl.length - 2], gl[gl.length - 1], type === 'spark' ? 0.16 : 0.24, 0);   // C-pillars
  }
  const bodyMeshes = [body, roof, ...pillars, ...(type === 'damas' ? [] : bumpers)];
  const palette = m.colors || (type === 'spark' ? SPARK_COLORS : COLORS);
  return {
    type, mesh: g, model: m, wheels, bodyMeshes, glassMesh: cab, detail, halfW: m.W / 2, halfL: m.L / 2, height: m.H, mass: UZ_TYPES[type].mass, air: false, tailMat, blinkMat,
    // a Tashkent taxi: the lit roof sign and the chequered band on the doors
    setTaxi(on) {
      if (on && !this.taxiParts) this.taxiParts = taxiTrim(g, m, type);
      if (this.taxiParts) for (const o of this.taxiParts) o.visible = on;
    },
    setBrake(on) { tailMat.emissiveIntensity = on ? 2.6 : 0.5; },
    setBlink(on) { blinkMat.color.setRGB(on ? 4 : 0.3, on ? 1.6 : 0.14, on ? 0 : 0.02); },
    setColor() {
      const c = palette[Math.floor(Math.random() * palette.length)];
      const mat = paint(c);
      for (const o of bodyMeshes) o.material = mat;
      detail.children.forEach((o) => { if (o.geometry === GEO.get('bx0.12_0.1_0.16')) o.material = mat; });
      return c;
    },
    setDetail(on) { detail.visible = on; },
  };
}
