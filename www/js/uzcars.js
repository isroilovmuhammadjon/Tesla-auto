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
    head: { x: 0.6, y: 0.74, z: 2.17, w: 0.42, h: 0.14, tilt: 0.5 }, tail: { x: 0.6, y: 0.88, w: 0.4, h: 0.16 },
    grille: { y: 0.68, w: 0.7, h: 0.1 }, lower: { y: 0.42, w: 1.0, h: 0.16 },
  },
  gentra: {
    L: 4.52, W: 1.725, H: 1.445, R: 0.3, wheels: [1.33, -1.27], smooth: true, weight: 0.22,
    top: [[2.28, 0.5], [2.22, 0.66], [1.95, 0.75], [1.2, 0.85], [0.8, 0.89], [-0.6, 0.94], [-1.55, 0.98], [-1.78, 1.0], [-2.18, 0.97], [-2.27, 0.84], [-2.25, 0.5]],
    glass: [[0.8, 0.88], [0.06, 1.41], [-0.8, 1.445], [-1.26, 1.36], [-1.62, 0.99]],
    head: { x: 0.58, y: 0.7, z: 2.2, w: 0.46, h: 0.14, tilt: 0.55 }, tail: { x: 0.6, y: 0.86, w: 0.44, h: 0.14 },
    grille: { y: 0.64, w: 0.6, h: 0.12 }, lower: { y: 0.4, w: 0.9, h: 0.14 },
  },
  nexia: {
    L: 4.48, W: 1.66, H: 1.39, R: 0.29, wheels: [1.3, -1.22], smooth: false, weight: 0.18,
    top: [[2.27, 0.56], [2.22, 0.68], [1.95, 0.72], [0.95, 0.81], [-0.6, 0.85], [-1.55, 0.89], [-2.18, 0.91], [-2.25, 0.86], [-2.25, 0.42]],
    glass: [[0.95, 0.8], [0.28, 1.36], [-0.85, 1.39], [-1.18, 1.35], [-1.6, 0.89]],
    head: { x: 0.55, y: 0.6, z: 2.25, w: 0.44, h: 0.14, tilt: 0.15 }, tail: { x: 0.55, y: 0.78, w: 0.46, h: 0.18 },
    grille: { y: 0.6, w: 0.55, h: 0.12 }, lower: { y: 0.4, w: 1.4, h: 0.12 },
  },
  spark: {
    L: 3.64, W: 1.6, H: 1.52, R: 0.29, wheels: [1.17, -1.21], smooth: true, weight: 0.18,
    top: [[1.84, 0.55], [1.77, 0.72], [1.45, 0.82], [1.05, 0.88], [-0.4, 0.95], [-1.62, 0.99], [-1.8, 0.97], [-1.84, 0.6]],
    glass: [[1.05, 0.87], [0.42, 1.44], [-0.55, 1.52], [-1.45, 1.5], [-1.7, 1.32], [-1.74, 0.98]],
    head: { x: 0.52, y: 0.76, z: 1.76, w: 0.36, h: 0.18, tilt: 0.6 }, tail: { x: 0.62, y: 1.1, w: 0.14, h: 0.3 },
    grille: { y: 0.6, w: 0.5, h: 0.12 }, lower: { y: 0.42, w: 0.8, h: 0.16 },
  },
  damas: {
    L: 3.49, W: 1.4, H: 1.9, R: 0.26, wheels: [0.98, -0.86], smooth: false, weight: 0.12,
    top: [[1.75, 0.72], [1.62, 0.93], [0.6, 1.06], [-1.74, 1.06], [-1.75, 0.34]],
    glass: [[1.62, 0.92], [1.22, 1.8], [1.02, 1.9], [-1.66, 1.9], [-1.74, 1.82], [-1.74, 1.06]],
    head: { x: 0.48, y: 0.62, z: 1.74, w: 0.3, h: 0.2, tilt: 0 }, tail: { x: 0.6, y: 0.85, w: 0.12, h: 0.32 },
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
const plateMat = () => cm('plate', () => new THREE.MeshStandardMaterial({ color: 0xf2f3f0, roughness: 0.5 }));

function extrude(shape, width, bevel) {
  const depth = Math.max(0.01, width - bevel * 2);
  let g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: 18, steps: 1 });
  g.rotateY(Math.PI / 2);      // shape x (forward) -> world -z, extrusion -> world x
  g.translate(-depth / 2, 0, 0);
  return toCreasedNormals(g, Math.PI / 3.5);
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
  const bodyGeo = cg(`${type}b`, () => extrude(bodyShape(m), m.W, 0.07));
  const glassGeo = cg(`${type}g`, () => extrude(glassShape(m), m.W * 0.84, 0.05));
  const body = new THREE.Mesh(bodyGeo, paint(COLORS[0]));
  body.castShadow = true;
  const cab = new THREE.Mesh(glassGeo, glass());
  cab.castShadow = true;
  g.add(body, cab);
  // body-colour roof panel + pillars read as a real car rather than a glass bubble
  const roofX0 = m.glass[1][0] - 0.12, roofX1 = m.glass[m.glass.length - 2][0] + 0.1;
  const roofY = Math.min(...m.glass.slice(1, -1).map((p) => p[1])) ;
  const roofLen = roofX0 - roofX1;
  const roof = new THREE.Mesh(cg(`${type}r`, () => new THREE.BoxGeometry(m.W * 0.8, 0.05, roofLen)), body.material);
  roof.position.set(0, Math.max(...m.glass.map((p) => p[1])) - 0.005, -(roofX0 + roofX1) / 2);
  roof.castShadow = true;
  g.add(roof);
  void roofY;
  const B = (w, h, d, mat, x, y, z, parent = detail) => { const o = new THREE.Mesh(cg(`bx${w}_${h}_${d}`, () => new THREE.BoxGeometry(w, h, d)), mat); o.position.set(x, y, z); parent.add(o); return o; };
  const zF = -m.L / 2, zR = m.L / 2;
  // bumpers + grille + plates
  B(m.W * 0.96, 0.18, 0.12, black(), 0, m.lower.y - 0.02, zF + 0.04);
  B(m.lower.w, m.lower.h, 0.06, black(), 0, m.lower.y, zF + 0.01);
  B(m.grille.w, m.grille.h, 0.05, black(), 0, m.grille.y, zF + 0.02);
  B(m.grille.w * 0.9, 0.02, 0.055, chrome(), 0, m.grille.y + m.grille.h * 0.15, zF + 0.02);
  B(0.52, 0.11, 0.02, plateMat(), 0, m.lower.y + 0.01, zF - 0.02);
  B(m.W * 0.96, 0.2, 0.12, black(), 0, m.lower.y - 0.02, zR - 0.04);
  B(0.52, 0.11, 0.02, plateMat(), 0, m.tail.y - 0.3, zR + 0.03);
  // lights
  const tailMat = new THREE.MeshStandardMaterial({ color: 0x5a0a0e, emissive: 0xff1a22, emissiveIntensity: 0.5, roughness: 0.2 });
  const blinkMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.3, 0.14, 0.02) });
  for (const s of [-1, 1]) {
    const h = B(m.head.w, m.head.h, 0.06, headMat(), s * m.head.x, m.head.y, -m.head.z, g);
    h.rotation.x = -m.head.tilt;
    B(m.tail.w, m.tail.h, 0.05, tailMat, s * m.tail.x, m.tail.y, zR - 0.01, g);
    B(0.1, 0.06, 0.04, blinkMat, s * (m.tail.x + m.tail.w / 2 + 0.06), m.tail.y, zR - 0.01);
    // mirrors
    B(0.12, 0.1, 0.16, body.material, s * (m.W / 2 + 0.05), m.glass[0][1] + 0.12, -(m.glass[0][0] - 0.25));
  }
  // wheels
  const tg = cg(`t${m.R}`, () => new THREE.CylinderGeometry(m.R, m.R, 0.2, 20).rotateZ(Math.PI / 2));
  const hg = cg(`h${m.R}`, () => new THREE.CylinderGeometry(m.R * 0.62, m.R * 0.62, 0.21, 16).rotateZ(Math.PI / 2));
  for (const wx of m.wheels) for (const s of [-1, 1]) {
    const t = new THREE.Mesh(tg, tire()); t.position.set(s * (m.W / 2 - 0.12), m.R, -wx); t.castShadow = true; g.add(t);
    const hb = new THREE.Mesh(hg, hub()); hb.position.copy(t.position); detail.add(hb);
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
      p.position.set(sd * (m.W * 0.42 + 0.006), (top + belt) / 2, -x);
      g.add(p); pillars.push(p);
    }
  }
  const bodyMeshes = [body, roof, ...pillars];
  const palette = type === 'spark' ? SPARK_COLORS : COLORS;
  return {
    type, mesh: g, halfW: m.W / 2, halfL: m.L / 2, height: m.H, mass: UZ_TYPES[type].mass, air: false, tailMat, blinkMat,
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
