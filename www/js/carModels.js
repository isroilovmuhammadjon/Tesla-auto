// Procedural car models: the player's sports cars and the traffic vehicles.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';

const BASE_Y = 0.22;
const WHEEL_R = 0.36;

const STYLES = {
  gt:    { sx: 1.0,  sy: 1.0,  width: 2.0,  cabinShift: 0.0,   cabinSy: 1.0,  spoiler: 'duck',   stripes: false },
  hyper: { sx: 1.05, sy: 0.96, width: 2.06, cabinShift: -0.12, cabinSy: 0.9,  spoiler: 'wing',   stripes: false },
  track: { sx: 0.97, sy: 1.0,  width: 1.98, cabinShift: 0.05,  cabinSy: 0.97, spoiler: 'gtwing', stripes: true },
  ev:    { sx: 1.03, sy: 1.0,  width: 2.0,  cabinShift: -0.22, cabinSy: 1.14, spoiler: 'none',   stripes: false, lightbar: true, hover: true },
  muscle:  { sx: 1.06, sy: 1.08, width: 2.06, cabinShift: 0.12,  cabinSy: 0.9,  spoiler: 'duck',   stripes: true, scoop: true },
  concept: { sx: 1.08, sy: 0.97, width: 2.1,  cabinShift: -0.05, cabinSy: 0.86, spoiler: 'wing',   stripes: false, skirt: true },
  rally:   { sx: 0.94, sy: 1.12, width: 1.96, cabinShift: 0.1,   cabinSy: 1.1,  spoiler: 'gtwing', stripes: true, roofLights: true, lift: 0.1 },
  stealth: { sx: 1.04, sy: 0.97, width: 2.04, cabinShift: -0.15, cabinSy: 0.88, spoiler: 'wing',   stripes: false, skirt: true },
};

// ---------- helpers ----------
function extrudeSide(shape, width, bevel, curveSegments = 32) {
  const depth = Math.max(0.01, width - bevel * 2);
  let g = new THREE.ExtrudeGeometry(shape, {
    depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel,
    bevelSegments: 4, curveSegments, steps: 1,
  });
  // shape X (length, +front) -> world -Z ; extrusion depth -> world X
  g.rotateY(Math.PI / 2);
  g.translate(-depth / 2, 0, 0);
  g = toCreasedNormals(g, Math.PI / 3.2);
  return g;
}

function radialTexture(inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)', size = 128) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, inner);
  g.addColorStop(1, outer);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
let glowTex = null;
function getGlowTexture() {
  if (!glowTex) glowTex = radialTexture('rgba(255,255,255,0.95)', 'rgba(255,255,255,0)');
  return glowTex;
}

function bodyShape(st) {
  const P = (x, y) => new THREE.Vector2(x * st.sx, BASE_Y + (y - BASE_Y) * st.sy);
  const rw = -1.38 * st.sx, fw = 1.42 * st.sx, ar = 0.41, wy = WHEEL_R;
  const s = new THREE.Shape();
  s.moveTo(-2.26 * st.sx, BASE_Y);
  s.lineTo(rw - ar, BASE_Y);
  s.absarc(rw, wy, ar, Math.PI, 0, true);
  s.lineTo(rw + ar, BASE_Y);
  s.lineTo(fw - ar, BASE_Y);
  s.absarc(fw, wy, ar, Math.PI, 0, true);
  s.lineTo(fw + ar, BASE_Y);
  s.lineTo(2.22 * st.sx, 0.24);
  s.splineThru([
    P(2.34, 0.42), P(2.28, 0.56), P(2.0, 0.68), P(1.45, 0.82), P(0.8, 0.86),
    P(-0.4, 0.88), P(-1.3, 0.92), P(-1.95, 0.93), P(-2.3, 0.86), P(-2.42, 0.66),
    P(-2.36, 0.4), new THREE.Vector2(-2.26 * st.sx, BASE_Y),
  ]);
  return s;
}

function cabinShape(st) {
  const b = 0.84;
  const P = (x, y) => new THREE.Vector2((x + st.cabinShift) * st.sx, BASE_Y + (b - BASE_Y) * st.sy + (y - b) * st.cabinSy);
  const s = new THREE.Shape();
  const p0 = P(0.85, 0.84);
  s.moveTo(p0.x, p0.y);
  s.splineThru([P(0.35, 1.06), P(-0.15, 1.22), P(-0.7, 1.28), P(-1.2, 1.22), P(-1.62, 1.06), P(-1.95, 0.9)]);
  s.lineTo(P(-1.75, 0.84).x, P(-1.75, 0.84).y);
  s.lineTo(p0.x, p0.y);
  return s;
}

function makeWheel(mats, side, caliperMat) {
  const pivot = new THREE.Group();
  const spin = new THREE.Group();
  pivot.add(spin);
  const tire = new THREE.Mesh(new THREE.CylinderGeometry(WHEEL_R, WHEEL_R, 0.3, 32).rotateZ(Math.PI / 2), mats.tire);
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.31, 28).rotateZ(Math.PI / 2), mats.rim);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.33, 12).rotateZ(Math.PI / 2), mats.chrome);
  spin.add(tire, rim, hub);
  const spokeGeo = new THREE.BoxGeometry(0.035, 0.46, 0.06);
  for (let i = 0; i < 5; i++) {
    const sp = new THREE.Mesh(spokeGeo, mats.spoke);
    sp.position.x = side * 0.158;
    sp.rotation.x = (i / 5) * Math.PI * 2;
    spin.add(sp);
  }
  const caliper = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.2, 0.14), caliperMat);
  caliper.position.set(side * 0.1, 0.12, -0.06);
  pivot.add(caliper);
  tire.castShadow = true;
  return { pivot, spin };
}

// ---------- player sports car ----------
export function createSportsCar(def) {
  const st = STYLES[def.style] || STYLES.gt;
  const W = st.width;
  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);

  const mats = {
    body: def.matte
      ? new THREE.MeshStandardMaterial({ color: def.color, metalness: 0.35, roughness: 0.62, envMapIntensity: 0.8 })
      : new THREE.MeshPhysicalMaterial({ color: def.color, metalness: 0.6, roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 1.5 }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0x04060b, metalness: 0.9, roughness: 0.04, clearcoat: 1, envMapIntensity: 1.8 }),
    carbon: new THREE.MeshStandardMaterial({ color: 0x0b0c10, metalness: 0.4, roughness: 0.45 }),
    tire: new THREE.MeshStandardMaterial({ color: 0x0e0e10, roughness: 0.92, metalness: 0 }),
    rim: new THREE.MeshStandardMaterial({ color: 0xc9cdd6, metalness: 1, roughness: 0.22 }),
    spoke: new THREE.MeshStandardMaterial({ color: 0x23262d, metalness: 0.8, roughness: 0.3 }),
    chrome: new THREE.MeshStandardMaterial({ color: 0xe6e9ef, metalness: 1, roughness: 0.12 }),
    stripe: new THREE.MeshPhysicalMaterial({ color: def.stripe ?? 0x0a0a0c, metalness: 0.4, roughness: 0.35, clearcoat: 1 }),
    neon: new THREE.MeshBasicMaterial({ color: new THREE.Color(def.accent).multiplyScalar(2.6) }),
    head: new THREE.MeshBasicMaterial({ color: new THREE.Color(0xe8f4ff).multiplyScalar(3) }),
    drl: new THREE.MeshBasicMaterial({ color: new THREE.Color(def.accent).multiplyScalar(2) }),
    tail: new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 0.02, 0.05) }),
    tailLens: new THREE.MeshPhysicalMaterial({ color: 0x3a0006, metalness: 0.2, roughness: 0.1, clearcoat: 1 }),
    caliper: new THREE.MeshStandardMaterial({ color: def.caliper, metalness: 0.3, roughness: 0.4 }),
  };

  // Body shell
  const bodyMesh = new THREE.Mesh(extrudeSide(bodyShape(st), W, 0.07), mats.body);
  bodyMesh.castShadow = true;
  body.add(bodyMesh);

  // Glass canopy
  const cabin = new THREE.Mesh(extrudeSide(cabinShape(st), W * 0.8, 0.07, 24), mats.glass);
  cabin.castShadow = true;
  body.add(cabin);

  // Racing stripes (track style)
  const stripes = [];
  if (st.stripes) {
    const g = extrudeSide(bodyShape(st), 0.26, 0.02);
    for (const sx of [-0.2, 0.2]) {
      const stripe = new THREE.Mesh(g, mats.stripe);
      stripes.push(stripe);
      stripe.scale.set(1, 1.012, 1.004);
      stripe.position.set(sx, -0.003, 0);
      body.add(stripe);
    }
  }

  const ys = (y) => BASE_Y + (y - BASE_Y) * st.sy;
  const L = 2.34 * st.sx;

  // Front details
  const splitter = new THREE.Mesh(new THREE.BoxGeometry(W * 0.92, 0.05, 0.36), mats.carbon);
  splitter.position.set(0, 0.17, -L + 0.12);
  const intake = new THREE.Mesh(new THREE.BoxGeometry(W * 0.6, 0.15, 0.12), mats.carbon);
  intake.position.set(0, ys(0.36), -L - 0.02);
  body.add(splitter, intake);

  for (const sx of [-1, 1]) {
    const hl = new THREE.Mesh(new RoundedBoxGeometry(0.42, 0.07, 0.26, 2, 0.025), mats.head);
    hl.position.set(sx * 0.6, ys(0.62), -2.2 * st.sx);
    hl.rotation.x = -0.45;
    const drl = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.03, 0.2), mats.drl);
    drl.position.set(sx * 0.6, ys(0.58), -2.27 * st.sx);
    drl.rotation.x = -0.45;
    body.add(hl, drl);
    // mirrors
    const mirror = new THREE.Mesh(new RoundedBoxGeometry(0.2, 0.11, 0.16, 2, 0.03), mats.body);
    mirror.position.set(sx * (W * 0.42 + 0.06), ys(0.95), -0.55 * st.sx + st.cabinShift);
    body.add(mirror);
    // exhausts
    const ex = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.22, 16).rotateX(Math.PI / 2), mats.chrome);
    ex.position.set(sx * 0.45, 0.3, 2.3 * st.sx);
    body.add(ex);
  }

  // Tail lights: dark red lens housing, two bright lamps and a thin light bar between them
  const tz = 2.45 * st.sx;
  const lens = new THREE.Mesh(new RoundedBoxGeometry(W * 0.9, 0.16, 0.08, 2, 0.03), mats.tailLens);
  lens.position.set(0, ys(0.74), tz - 0.02);
  const bar = new THREE.Mesh(new THREE.BoxGeometry(W * 0.5, 0.025, 0.06), mats.tail);
  bar.position.set(0, ys(0.74), tz + 0.03);
  body.add(lens, bar);
  for (const sx of [-1, 1]) {
    const lamp = new THREE.Mesh(new RoundedBoxGeometry(0.34, 0.09, 0.06, 2, 0.02), mats.tail);
    lamp.position.set(sx * W * 0.32, ys(0.74), tz + 0.03);
    body.add(lamp);
  }
  const diffuser = new THREE.Mesh(new THREE.BoxGeometry(W * 0.8, 0.12, 0.3), mats.carbon);
  diffuser.position.set(0, 0.24, 2.18 * st.sx);
  body.add(diffuser);

  // Spoilers
  const addWing = (y, z, wWidth, chord, strutH) => {
    const wing = new THREE.Mesh(new RoundedBoxGeometry(wWidth, 0.05, chord, 2, 0.02), mats.carbon);
    wing.position.set(0, y, z);
    wing.rotation.x = 0.08;
    wing.castShadow = true;
    body.add(wing);
    for (const sx of [-1, 1]) {
      const strut = new THREE.Mesh(new THREE.BoxGeometry(0.05, strutH, 0.14), mats.carbon);
      strut.position.set(sx * wWidth * 0.32, y - strutH / 2, z + 0.02);
      const plate = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.2, chord + 0.08), mats.carbon);
      plate.position.set(sx * wWidth / 2, y + 0.02, z);
      body.add(strut, plate);
    }
  };
  if (st.spoiler === 'wing') addWing(ys(1.02) + 0.12, 2.0 * st.sx, W * 0.92, 0.32, 0.16);
  if (st.spoiler === 'gtwing') addWing(ys(1.0) + 0.38, 2.02 * st.sx, W * 1.0, 0.42, 0.42);
  if (st.spoiler === 'duck') {
    const lip = new THREE.Mesh(new RoundedBoxGeometry(W * 0.86, 0.05, 0.22, 2, 0.02), mats.carbon);
    lip.position.set(0, ys(1.0) + 0.02, 2.15 * st.sx);
    lip.rotation.x = 0.2;
    body.add(lip);
  }

  // Hood scoop (muscle)
  if (st.scoop) {
    const scoop = new THREE.Mesh(new RoundedBoxGeometry(0.55, 0.14, 0.8, 2, 0.05), mats.carbon);
    scoop.position.set(0, ys(0.86) + 0.05, -1.15 * st.sx);
    scoop.rotation.x = -0.1;
    body.add(scoop);
  }
  // Neon side skirts (concept / stealth)
  if (st.skirt) {
    for (const sx of [-1, 1]) {
      const skirt = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.035, 2.3 * st.sx), mats.neon);
      skirt.position.set(sx * (W / 2 + 0.02), 0.27, 0);
      body.add(skirt);
    }
  }
  // Roof light bar (rally)
  if (st.roofLights) {
    const cabinTopY = BASE_Y + (0.84 - BASE_Y) * st.sy + (1.24 - 0.84) * st.cabinSy;
    const rz = -(-0.15 + st.cabinShift) * st.sx;
    const barBase = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.06, 0.12), mats.carbon);
    barBase.position.set(0, cabinTopY + 0.05, rz);
    body.add(barBase);
    for (let i = 0; i < 4; i++) {
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.12, 0.08), mats.head);
      lamp.position.set(-0.48 + i * 0.32, cabinTopY + 0.13, rz - 0.03);
      body.add(lamp);
    }
  }

  // Full-width front light bar (EV style)
  if (st.lightbar) {
    const barF = new THREE.Mesh(new THREE.BoxGeometry(W * 0.86, 0.03, 0.06), mats.drl);
    barF.position.set(0, ys(0.66), -2.18 * st.sx);
    barF.rotation.x = -0.45;
    body.add(barF);
  }

  // ---------- Interior (only visible in cockpit view) ----------
  const interior = new THREE.Group();
  interior.visible = false;
  const shift = st.cabinShift;
  const beltY = ys(0.84);                                                    // window line
  const roofY = BASE_Y + (0.84 - BASE_Y) * st.sy + (1.24 - 0.84) * st.cabinSy; // inside roof height
  const zOf = (shapeX) => -(shapeX + shift) * st.sx;                           // cabin shape x -> body z
  const eye = new THREE.Vector3(-0.38, roofY - 0.22, zOf(-0.3));               // driver's eyes (left-hand drive)
  const imat = {
    trim: new THREE.MeshStandardMaterial({ color: 0x15171d, roughness: 0.85, metalness: 0.1 }),
    soft: new THREE.MeshStandardMaterial({ color: 0x0c0d11, roughness: 0.95 }),
    metal: new THREE.MeshStandardMaterial({ color: 0x9aa0aa, roughness: 0.3, metalness: 0.9 }),
    accent: new THREE.MeshBasicMaterial({ color: new THREE.Color(def.accent).multiplyScalar(0.75) }),
  };
  const beam = (a, b, thick, mat) => {                                         // box stretched between two points
    const len = a.distanceTo(b);
    const m = new THREE.Mesh(new THREE.BoxGeometry(thick, thick, len), mat);
    m.position.copy(a).add(b).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), b.clone().sub(a).normalize());
    interior.add(m);
    return m;
  };
  // dashboard: from the windshield base back towards the driver, top just below the window line
  const dashTop = eye.y - 0.33;
  const dashFront = zOf(0.85), dashBack = eye.z - 0.6;
  const dashLen = dashBack - dashFront;
  const dash = new THREE.Mesh(new RoundedBoxGeometry(W * 0.86, 0.42, dashLen, 2, 0.05), imat.trim);
  dash.position.set(0, dashTop - 0.21, (dashFront + dashBack) / 2);
  const dashStrip = new THREE.Mesh(new THREE.BoxGeometry(W * 0.82, 0.006, 0.006), imat.accent);
  dashStrip.position.set(0, dashTop - 0.07, dashBack + 0.005);
  // instrument binnacle hood over the cluster
  const binnacle = new THREE.Mesh(new RoundedBoxGeometry(0.3, 0.035, 0.14, 2, 0.015), imat.soft);
  binnacle.position.set(eye.x, dashTop + 0.09, dashBack - 0.04);
  // floor + centre console: nothing of the road shows through the cabin
  const floor = new THREE.Mesh(new THREE.BoxGeometry(W * 0.86, 0.04, 2.6), imat.soft);
  floor.position.set(0, 0.32, zOf(-0.2));
  const consoleBox = new THREE.Mesh(new RoundedBoxGeometry(0.26, 0.3, 1.1, 2, 0.04), imat.trim);
  consoleBox.position.set(0, 0.5, zOf(-0.15));
  interior.add(dash, dashStrip, binnacle, floor, consoleBox);
  // doors
  for (const sx of [-1, 1]) {
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.42, 1.9), imat.soft);
    door.position.set(sx * (W * 0.43), beltY - 0.2, zOf(-0.35));
    const doorStrip = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.006, 1.6), imat.accent);
    doorStrip.position.set(sx * (W * 0.43 - 0.03), beltY - 0.05, zOf(-0.35));
    interior.add(door, doorStrip);
    // A-pillars from the windshield base up to the roof
    beam(new THREE.Vector3(sx * W * 0.39, beltY, zOf(0.82)), new THREE.Vector3(sx * W * 0.34, eye.y + 0.3, zOf(0.05)), 0.03, imat.soft);
  }
  // roof lining and header above the windshield
  const roofLine = eye.y + 0.3;
  const roof = new THREE.Mesh(new THREE.BoxGeometry(W * 0.7, 0.02, 1.5), imat.soft);
  roof.position.set(0, roofLine + 0.02, zOf(-0.75));
  const header = new THREE.Mesh(new THREE.BoxGeometry(W * 0.7, 0.035, 0.1), imat.soft);
  header.position.set(0, roofLine, zOf(0.05));
  // small rear-view mirror with a light "glass" face

  // seats and rear bulkhead (seen when looking back)
  const seatMat = new THREE.MeshStandardMaterial({ color: 0x1b1d24, roughness: 0.9 });
  const rearBlockers = [];
  for (const sx of [-0.38, 0.38]) {
    const seat = new THREE.Mesh(new RoundedBoxGeometry(0.5, 0.75, 0.16, 2, 0.06), seatMat);
    rearBlockers.push(seat);
    seat.position.set(sx, beltY - 0.05, zOf(-0.62));
    seat.rotation.x = 0.18;
    interior.add(seat);
  }
  const bulk = new THREE.Mesh(new THREE.BoxGeometry(W * 0.8, 0.5, 0.05), imat.soft);
  bulk.position.set(0, beltY - 0.1, zOf(-1.25));
  rearBlockers.push(bulk);
  interior.add(roof, header, bulk);
  // steering wheel (turns with steering input)
  const wheelPivot = new THREE.Group();
  wheelPivot.position.set(eye.x, eye.y - 0.56, eye.z - 0.55);
  wheelPivot.rotation.x = -0.38;
  const wheelSpin = new THREE.Group();
  wheelPivot.add(wheelSpin);
  wheelSpin.add(new THREE.Mesh(new THREE.TorusGeometry(0.165, 0.02, 10, 40), imat.soft));
  for (const a of [0, Math.PI * 0.5, Math.PI]) {
    const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.025, 0.02), imat.trim);
    spoke.position.set(Math.cos(a + Math.PI) * 0.085 * (a === Math.PI * 0.5 ? 0 : 1), a === Math.PI * 0.5 ? -0.085 : 0, 0);
    if (a === Math.PI * 0.5) spoke.rotation.z = Math.PI / 2;
    wheelSpin.add(spoke);
  }
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.03, 18).rotateX(Math.PI / 2), imat.trim);
  const topMark = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.03, 0.025), imat.accent);
  topMark.position.set(0, 0.17, 0.005);
  const column = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 0.3, 10).rotateX(Math.PI / 2), imat.trim);
  column.position.set(0, 0, -0.16);
  wheelSpin.add(hub, topMark);
  wheelPivot.add(column);
  interior.add(wheelPivot);
  // live instrument cluster (canvas texture) + centre screen
  const makeScreen = (w, h, pw, ph) => {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(pw, ph), new THREE.MeshBasicMaterial({ map: tex, color: 0xb8c4d6 }));
    return { c, ctx: c.getContext('2d'), tex, mesh };
  };
  const cluster = makeScreen(320, 128, 0.26, 0.104);
  cluster.mesh.position.set(eye.x, dashTop + 0.03, dashBack - 0.012);
  cluster.mesh.rotation.x = -0.12;
  const centre = makeScreen(220, 140, 0.16, 0.1);
  centre.mesh.position.set(0.12, dashTop - 0.08, dashBack - 0.012);
  centre.mesh.rotation.x = -0.1;
  interior.add(cluster.mesh, centre.mesh);
  body.add(interior);
  const accentCss = '#' + new THREE.Color(def.accent).getHexString();
  let screenTick = 0;
  function drawScreens(kmh, rpm, gear, nitro, extra) {
    if ((screenTick = (screenTick + 1) % 3) !== 0) return; // ~20-40 updates/s is plenty
    const g = cluster.ctx, W2 = 320, H2 = 128;
    g.fillStyle = '#05070c'; g.fillRect(0, 0, W2, H2);
    // rpm bar
    const f = Math.min(1, Math.max(0, (rpm - 800) / 6800));
    for (let i = 0; i < 30; i++) {
      const on = i / 30 < f;
      g.fillStyle = on ? (i > 24 ? '#ff3b5c' : i > 19 ? '#ffd166' : accentCss) : '#1a1f2b';
      g.fillRect(14 + i * 9.8, 14, 7, 18);
    }
    g.fillStyle = '#ffffff'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = 'bold 58px Orbitron, sans-serif'; g.fillText(String(Math.round(kmh)), 150, 76);
    g.font = '14px Orbitron, sans-serif'; g.fillStyle = '#8aa0bf'; g.fillText('KM/H', 150, 112);
    g.font = 'bold 40px Orbitron, sans-serif'; g.fillStyle = accentCss; g.fillText(String(gear), 272, 78);
    g.font = '12px Orbitron, sans-serif'; g.fillStyle = '#8aa0bf'; g.fillText('GEAR', 272, 108);
    g.fillText('RPM', 30, 50);
    cluster.tex.needsUpdate = true;
    const c2 = centre.ctx;
    c2.fillStyle = '#05070c'; c2.fillRect(0, 0, 220, 140);
    c2.fillStyle = '#8aa0bf'; c2.font = '13px Orbitron, sans-serif'; c2.textAlign = 'left';
    c2.fillText('NITRO', 14, 26);
    c2.fillStyle = '#1a1f2b'; c2.fillRect(14, 36, 192, 14);
    c2.fillStyle = '#00d4ff'; c2.fillRect(14, 36, 192 * nitro, 14);
    c2.fillStyle = '#e8f4ff'; c2.font = 'bold 15px Orbitron, sans-serif';
    (extra || []).slice(0, 3).forEach((line, i) => c2.fillText(line, 14, 76 + i * 24));
    centre.tex.needsUpdate = true;
  }

  // Raised ride height (rally): lift the whole shell, wheels stay on the road
  if (st.lift) for (const c of body.children) c.position.y += st.lift;

  // Wheels
  const wheels = [];
  const wx = W / 2 - 0.12;
  for (const [x, z, front] of [[-wx, -1.42 * st.sx, true], [wx, -1.42 * st.sx, true], [-wx, 1.38 * st.sx, false], [wx, 1.38 * st.sx, false]]) {
    const w = makeWheel(mats, Math.sign(x), mats.caliper);
    w.pivot.position.set(x, WHEEL_R, z);
    w.front = front;
    w.side = Math.sign(x);
    w.baseX = x;
    group.add(w.pivot);
    wheels.push(w);
  }

  // Hover discs: when flying, each wheel folds flat and its outer face becomes a glowing thruster
  let hoverMat = null;
  if (st.hover) {
    hoverMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(def.accent).multiplyScalar(3), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    const discGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.02, 28).rotateZ(Math.PI / 2);
    const ringGeo = new THREE.TorusGeometry(0.33, 0.025, 8, 32).rotateY(Math.PI / 2);
    for (const w of wheels) {
      const disc = new THREE.Mesh(discGeo, hoverMat);
      disc.position.x = w.side * 0.17;
      const ring = new THREE.Mesh(ringGeo, hoverMat);
      ring.position.x = w.side * 0.17;
      w.pivot.add(disc, ring);
    }
  }

  // Neon underglow
  const glowMat = new THREE.MeshBasicMaterial({
    map: getGlowTexture(), color: new THREE.Color(def.accent).multiplyScalar(0.9),
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const underglow = new THREE.Mesh(new THREE.PlaneGeometry(W + 1.6, 4.6 * st.sx + 2.2).rotateX(-Math.PI / 2), glowMat);
  underglow.position.y = 0.03;
  underglow.renderOrder = 2;
  group.add(underglow);

  // Nitro flames
  const flames = new THREE.Group();
  const outer = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x2a8cff).multiplyScalar(3), transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false });
  const inner = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xc8f4ff).multiplyScalar(4), transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
  const coneO = new THREE.ConeGeometry(0.1, 0.9, 14, 1, true).rotateX(Math.PI / 2).translate(0, 0, 0.45);
  const coneI = new THREE.ConeGeometry(0.05, 0.5, 10, 1, true).rotateX(Math.PI / 2).translate(0, 0, 0.25);
  for (const sx of [-1, 1]) {
    const f = new THREE.Group();
    f.add(new THREE.Mesh(coneO, outer), new THREE.Mesh(coneI, inner));
    f.position.set(sx * 0.45, 0.3, 2.42 * st.sx);
    flames.add(f);
  }
  flames.visible = false;
  group.add(flames);

  // Headlight beams painted on the road + red brake glow behind the car
  const beamMat = new THREE.MeshBasicMaterial({
    map: getGlowTexture(), color: new THREE.Color(0xcfe2ff), transparent: true, opacity: 0.16,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const beamGeo = new THREE.PlaneGeometry(2.4, 26).rotateX(-Math.PI / 2);
  const beams = [];
  for (const sx of [-1, 1]) {
    const beam = new THREE.Mesh(beamGeo, beamMat);
    beams.push(beam);
    beam.position.set(sx * 0.7, 0.035, -2.3 * st.sx - 12);
    beam.renderOrder = 2;
    group.add(beam);
  }
  const brakeGlowMat = new THREE.MeshBasicMaterial({
    map: getGlowTexture(), color: new THREE.Color(1.0, 0.05, 0.08), transparent: true, opacity: 0.25,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const brakeGlow = new THREE.Mesh(new THREE.PlaneGeometry(W + 0.6, 1.8).rotateX(-Math.PI / 2), brakeGlowMat);
  brakeGlow.position.set(0, 0.04, 2.4 * st.sx + 0.6);
  brakeGlow.renderOrder = 2;
  group.add(brakeGlow);

  group.traverse((o) => { if (o.isMesh && o.material === mats.body) o.castShadow = true; });

  return {
    group, body, wheels, flames, underglow, mats, def,
    halfLength: 2.3 * st.sx, width: W,
    canFly: !!st.hover,
    eye, interior,
    setInterior(on) {
      interior.visible = on;
      // the shell is one solid shape: hide it from inside so the dashboard is visible
      // hide every exterior body part except the side mirrors (you see those from the driver's seat)
      for (const c of body.children) {
        if (c === interior || c.userData.keepInCockpit) continue;
        c.visible = !on;
      }
      for (const s of stripes) s.visible = !on;
    },
    // looking back from the driver's seat: the seat backs would fill the view, so hide them
    setLookBack(on) { for (const m of rearBlockers) m.visible = !on; },
    updateInterior(steer, kmh, rpm, gear, nitro, extra) {
      wheelSpin.rotation.z += (-steer * 1.7 - wheelSpin.rotation.z) * 0.25;
      drawScreens(kmh, rpm, gear, nitro, extra);
    },
    update(dt, speed, steer, braking, nitro, t, fly = 0, altitude = 0) {
      const rot = (speed * dt) / WHEEL_R * (1 - fly);
      for (const w of wheels) {
        w.spin.rotation.x -= rot;
        const steerT = w.front ? -steer * 0.38 * (1 - fly) : 0;
        w.pivot.rotation.y += (steerT - w.pivot.rotation.y) * Math.min(1, dt * 10);
        if (st.hover) {
          // fold: wheel turns flat (outer face down) and moves out from the body
          w.pivot.rotation.z = -w.side * (Math.PI / 2) * fly;
          w.pivot.position.x = w.baseX + w.side * 0.28 * fly;
          w.pivot.position.y = WHEEL_R - 0.06 * fly;
        }
      }
      if (hoverMat) hoverMat.opacity = fly * (0.85 + Math.sin(t * 20) * 0.1);
      // keep the underglow on the road and spread it out with altitude
      underglow.position.y = 0.03 - altitude;
      for (const b of beams) b.position.y = 0.035 - altitude;   // light lands on the road below
      brakeGlow.position.y = 0.04 - altitude;
      beamMat.opacity = 0.16 / (1 + altitude * 0.35);
      const spread = 1 + altitude * 0.04;
      underglow.scale.set(spread, 1, spread);
      mats.tail.color.setRGB(braking ? 6 : 2.4, braking ? 0.06 : 0.02, braking ? 0.1 : 0.05);
      brakeGlowMat.opacity += ((braking ? 0.38 : 0.12) - brakeGlowMat.opacity) * Math.min(1, dt * 12);
      flames.visible = nitro;
      if (nitro) {
        for (const f of flames.children) f.scale.set(1 + Math.random() * 0.2, 1 + Math.random() * 0.2, 0.7 + Math.random() * 0.7);
      }
      glowMat.opacity = (0.55 + Math.sin(t * 3) * 0.08) / (1 + altitude * 0.7);
    },
    dispose() {
      group.traverse((o) => {
        if (o.isMesh) o.geometry.dispose();
      });
      Object.values(mats).forEach((m) => m.dispose());
      glowMat.dispose(); outer.dispose(); inner.dispose(); beamMat.dispose(); brakeGlowMat.dispose();
      if (hoverMat) hoverMat.dispose();
      Object.values(imat).forEach((m) => m.dispose()); seatMat.dispose();
      cluster.tex.dispose(); centre.tex.dispose();
    },
  };
}

// ---------- traffic ----------
export const TRAFFIC_TYPES = {
  sedan: { w: 1.85, l: 4.5, h: 1.45, mass: 1.5, weight: 0.42 },
  suv:   { w: 1.98, l: 4.8, h: 1.85, mass: 2.2, weight: 0.26 },
  van:   { w: 2.05, l: 5.3, h: 2.25, mass: 2.8, weight: 0.16 },
  truck: { w: 2.5,  l: 10.9, h: 3.65, mass: 14, weight: 0.16 },
  // flying traffic
  hover: { w: 2.0, l: 4.5, h: 1.15, mass: 1.2, weight: 0.75, air: true },
  hoverbus: { w: 2.5, l: 8.2, h: 2.1, mass: 5, weight: 0.25, air: true },
};
let TRAFFIC_COLORS = [0xe9e9ee, 0x16181e, 0x8a8f99, 0x7a0f14, 0x123a7a, 0x245a36, 0xc9b38a, 0x4a4f5a, 0xb0b5c0, 0x5b2a86, 0xd25a12, 0x0f6f78];
const NEON_TRAFFIC_COLORS = TRAFFIC_COLORS;
// Tashkent streets: mostly white and silver cars
const TASHKENT_TRAFFIC_COLORS = [0xf2f2f4, 0xf2f2f4, 0xeeeef0, 0xf5f5f7, 0xe9e9ec, 0xf0f0f2, 0xb8bcc4, 0xa9adb5, 0x16181e, 0x2a2d34, 0x1d3a6b, 0x6b1218];
export function setTrafficPalette(theme) { TRAFFIC_COLORS = theme === 'tashkent' ? TASHKENT_TRAFFIC_COLORS : NEON_TRAFFIC_COLORS; }
const TRAILER_COLORS = [0xd9dde4, 0x9fb3c8, 0x8c2a2a, 0x2b3b5a];

const cache = { geo: new Map(), mat: new Map() };
const cg = (k, fn) => { if (!cache.geo.has(k)) cache.geo.set(k, fn()); return cache.geo.get(k); };
const cm = (k, fn) => { if (!cache.mat.has(k)) cache.mat.set(k, fn()); return cache.mat.get(k); };
const rbox = (w, h, d, r = 0.12) => cg(`rb${w}_${h}_${d}_${r}`, () => new RoundedBoxGeometry(w, h, d, 2, r));
const box = (w, h, d) => cg(`b${w}_${h}_${d}`, () => new THREE.BoxGeometry(w, h, d));
const paint = (c) => cm(`paint${c}`, () => new THREE.MeshStandardMaterial({ color: c, metalness: 0.5, roughness: 0.3 }));
const tGlass = () => cm('glass', () => new THREE.MeshStandardMaterial({ color: 0x06080d, metalness: 0.9, roughness: 0.08 }));
const tDark = () => cm('dark', () => new THREE.MeshStandardMaterial({ color: 0x101114, roughness: 0.7, metalness: 0.2 }));
const tTire = () => cm('tire', () => new THREE.MeshStandardMaterial({ color: 0x0c0c0e, roughness: 0.95 }));
const tHub = () => cm('hub', () => new THREE.MeshStandardMaterial({ color: 0x8f949e, metalness: 0.9, roughness: 0.3 }));
const tHead = () => cm('head', () => new THREE.MeshBasicMaterial({ color: new THREE.Color(0xfff1d6).multiplyScalar(2.5) }));

export function pickTrafficType(air = false) {
  let r = Math.random();
  for (const [k, v] of Object.entries(TRAFFIC_TYPES)) {
    if (!!v.air !== air) continue;
    r -= v.weight;
    if (r <= 0) return k;
  }
  return air ? 'hover' : 'sedan';
}

export function createTrafficCar(type) {
  const spec = TRAFFIC_TYPES[type];
  const g = new THREE.Group();
  const bodyMeshes = [];
  const extraMeshes = [];
  const tailMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.0, 0.02, 0.04) });
  const blinkMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.12, 0.05, 0.0) });

  const add = (geo, mat, x, y, z, isBody) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = !!isBody;
    g.add(m);
    if (isBody) bodyMeshes.push(m);
    return m;
  };
  const wheels = (r, x, zs) => {
    const tg = cg(`tw${r}`, () => new THREE.CylinderGeometry(r, r, 0.26, 18).rotateZ(Math.PI / 2));
    const hg = cg(`th${r}`, () => new THREE.CylinderGeometry(r * 0.55, r * 0.55, 0.27, 14).rotateZ(Math.PI / 2));
    for (const z of zs) for (const sx of [-1, 1]) {
      add(tg, tTire(), sx * x, r, z);
      add(hg, tHub(), sx * x, r, z);
    }
  };
  const rearLights = (y, z, x, w = 0.42, h = 0.12) => {
    for (const sx of [-1, 1]) {
      add(box(w, h, 0.06), tailMat, sx * x, y, z);
      add(box(0.15, h * 0.8, 0.06), blinkMat, sx * (x + w / 2 + 0.1), y, z);
    }
  };
  const headLights = (y, z, x) => { for (const sx of [-1, 1]) add(box(0.38, 0.1, 0.05), tHead(), sx * x, y, z); };

  if (type === 'sedan') {
    add(rbox(1.85, 0.62, 4.5, 0.16), paint(0), 0, 0.55, 0, true);
    add(rbox(1.62, 0.56, 2.3, 0.18), tGlass(), 0, 1.08, 0.25);
    add(rbox(1.52, 0.08, 1.9, 0.03), paint(0), 0, 1.37, 0.28, true);
    add(box(1.7, 0.12, 0.08), tDark(), 0, 0.32, 2.24);
    rearLights(0.7, 2.25, 0.6);
    headLights(0.62, -2.26, 0.6);
    wheels(0.33, 0.83, [-1.4, 1.4]);
  } else if (type === 'suv') {
    add(rbox(1.98, 0.82, 4.8, 0.18), paint(0), 0, 0.74, 0, true);
    add(rbox(1.82, 0.62, 3.1, 0.18), tGlass(), 0, 1.45, 0.35);
    add(rbox(1.86, 0.09, 3.0, 0.04), paint(0), 0, 1.78, 0.38, true);
    add(box(1.8, 0.16, 0.1), tDark(), 0, 0.42, 2.38);
    rearLights(1.0, 2.4, 0.66, 0.4, 0.16);
    headLights(0.88, -2.41, 0.65);
    wheels(0.38, 0.88, [-1.55, 1.55]);
  } else if (type === 'van') {
    add(rbox(2.05, 1.95, 5.3, 0.2), paint(0), 0, 1.25, 0, true);
    add(box(1.86, 0.7, 0.06), tGlass(), 0, 1.65, -2.63);
    for (const sx of [-1, 1]) add(box(0.82, 0.6, 0.06), tGlass(), sx * 0.46, 1.65, 2.63);
    add(box(1.95, 0.18, 0.1), tDark(), 0, 0.4, 2.64);
    rearLights(0.95, 2.66, 0.82, 0.16, 0.5);
    headLights(0.75, -2.66, 0.7);
    wheels(0.38, 0.92, [-1.8, 1.8]);
  } else if (type === 'hover' || type === 'hoverbus') {
    // Flying traffic: no wheels, glowing thrusters underneath, light strips along the sides
    const bus = type === 'hoverbus';
    const L = bus ? 8.2 : 4.5, Wd = bus ? 2.5 : 2.0, Hb = bus ? 1.5 : 0.55;
    add(rbox(Wd, Hb, L, bus ? 0.3 : 0.22), paint(0), 0, 0.3 + Hb / 2, 0, true);
    if (bus) {
      for (const sx of [-1, 1]) add(box(0.04, 0.5, L * 0.8), tGlass(), sx * (Wd / 2 + 0.01), 1.3, 0);
      add(box(Wd * 0.85, 0.6, 0.05), tGlass(), 0, 1.3, -L / 2 - 0.01);
    } else {
      add(rbox(1.55, 0.5, 2.3, 0.22), tGlass(), 0, 0.95, 0.15);
    }
    const thr = cm('thruster', () => new THREE.MeshBasicMaterial({ color: new THREE.Color(0x30e0ff).multiplyScalar(3) }));
    const strip = cm('airstrip', () => new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff2bd6).multiplyScalar(2.5) }));
    const tg = cg('thrDisc', () => new THREE.CylinderGeometry(0.3, 0.3, 0.06, 20));
    for (const z of bus ? [-2.8, 0, 2.8] : [-1.4, 1.4]) for (const sx of [-1, 1]) add(tg, thr, sx * (Wd / 2 - 0.35), 0.27, z);
    for (const sx of [-1, 1]) add(box(0.04, 0.05, L * 0.9), strip, sx * (Wd / 2 + 0.01), 0.35 + Hb * 0.25, 0);
    rearLights(0.35 + Hb * 0.6, L / 2 + 0.01, Wd / 2 - 0.45, 0.4, 0.1);
    headLights(0.35 + Hb * 0.5, -L / 2 - 0.01, Wd / 2 - 0.45);
    const glow = new THREE.Mesh(cg('airGlow', () => new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2)),
      cm('airGlowMat', () => new THREE.MeshBasicMaterial({ map: getGlowTexture(), color: 0x30d8ff, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false })));
    glow.scale.set(Wd + 1.5, 1, L + 1.5);
    glow.position.y = 0.2;
    g.add(glow);
  } else {
    // truck: cab + trailer
    add(rbox(2.4, 2.5, 2.3, 0.2), paint(0), 0, 1.75, -4.25, true);
    add(box(2.2, 0.9, 0.06), tGlass(), 0, 2.3, -5.41);
    const trailer = add(rbox(2.5, 2.9, 8.3, 0.08), paint(TRAILER_COLORS[0]), 0, 2.15, 1.2);
    extraMeshes.push(trailer);
    add(box(2.2, 0.35, 10.4), tDark(), 0, 0.62, -0.2);
    add(box(2.4, 0.2, 0.12), tDark(), 0, 0.55, 5.38);
    rearLights(0.95, 5.4, 0.85, 0.3, 0.22);
    headLights(1.0, -5.42, 0.8);
    wheels(0.5, 1.0, [-4.6, 2.6, 4.2]);
  }

  return {
    type, mesh: g, halfW: spec.w / 2, halfL: spec.l / 2, height: spec.h, mass: spec.mass, air: !!spec.air, tailMat, blinkMat,
    setBrake(on) { tailMat.color.setRGB(on ? 5 : 2.0, on ? 0.05 : 0.02, on ? 0.08 : 0.04); },
    setBlink(on) { blinkMat.color.setRGB(on ? 4 : 0.12, on ? 1.5 : 0.05, 0); },
    setColor() {
      const c = TRAFFIC_COLORS[Math.floor(Math.random() * TRAFFIC_COLORS.length)];
      for (const m of bodyMeshes) m.material = paint(c);
      for (const m of extraMeshes) m.material = paint(TRAILER_COLORS[Math.floor(Math.random() * TRAILER_COLORS.length)]);
      return c;
    },
  };
}
