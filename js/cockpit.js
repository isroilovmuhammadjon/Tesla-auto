// The driver's-seat view (C key): a full sedan cabin seen from the left front seat.
// Hood in the car's own paint beyond the windshield, A-pillars, headliner, sun visors and a
// rear-view mirror that really shows the road behind, a soft-touch dashboard with vents, an
// analogue instrument cluster and a touch screen, the steering wheel with stalks, centre
// console with the gear selector, door cards, the passenger seat and the rear bench.
// Body-local coordinates: x to the right, y up, -z forward (driver sits on the left).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export const EYE = new THREE.Vector3(-0.37, 1.17, 0.3);

function shapeGeo(pts, depth, bevel = 0.012) {   // side profile (z, y) pushed out across x
  const s = new THREE.Shape();
  pts.forEach(([z, y], i) => (i ? s.lineTo(-z, y) : s.moveTo(-z, y)));
  const g = new THREE.ExtrudeGeometry(s, { depth: depth - bevel * 2, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: 12 });
  g.rotateY(Math.PI / 2);
  g.translate(-(depth - bevel * 2) / 2, 0, 0);
  g.computeVertexNormals();
  return g;
}

export function buildCockpit({ bodyMat, accent = 0xdfe8ff, ownMirrors = false }) {
  const root = new THREE.Group();
  root.visible = false;
  const M = {
    dash: new THREE.MeshStandardMaterial({ color: 0x25262b, roughness: 0.82, metalness: 0.05, envMapIntensity: 0.35 }),
    trim: new THREE.MeshStandardMaterial({ color: 0x2b2c31, roughness: 0.7, envMapIntensity: 0.35 }),
    cloth: new THREE.MeshStandardMaterial({ color: 0x4a4a4e, roughness: 0.95, envMapIntensity: 0.2 }),
    leather: new THREE.MeshStandardMaterial({ color: 0x17171a, roughness: 0.55, envMapIntensity: 0.5 }),
    stitch: new THREE.MeshStandardMaterial({ color: 0x6a5e52, roughness: 0.8 }),
    satin: new THREE.MeshStandardMaterial({ color: 0x9da3ab, roughness: 0.3, metalness: 0.85, envMapIntensity: 0.9 }),
    black: new THREE.MeshStandardMaterial({ color: 0x08090b, roughness: 0.45, envMapIntensity: 0.6 }),
    gloss: new THREE.MeshStandardMaterial({ color: 0x050506, roughness: 0.12, metalness: 0.2, envMapIntensity: 1 }),
    carpet: new THREE.MeshStandardMaterial({ color: 0x141416, roughness: 1 }),
    gold: new THREE.MeshStandardMaterial({ color: 0xc8a24a, roughness: 0.3, metalness: 0.9 }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0x9fb4c2, transparent: true, opacity: 0.08, roughness: 0.05, metalness: 0, envMapIntensity: 1.2, depthWrite: false }),
    red: new THREE.MeshBasicMaterial({ color: 0xd12a2a }),
    glow: new THREE.MeshBasicMaterial({ color: new THREE.Color(accent).multiplyScalar(0.55) }),
  };
  const add = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z); m.rotation.set(rx, ry, rz);
    root.add(m); return m;
  };
  const box = (w, h, d, r = 0.01) => (r > 0 ? new RoundedBoxGeometry(w, h, d, 2, r) : new THREE.BoxGeometry(w, h, d));
  const beam = (a, b, w, t, mat) => {
    const len = a.distanceTo(b);
    const m = new THREE.Mesh(new RoundedBoxGeometry(w, t, len, 2, Math.min(w, t) * 0.45), mat);
    m.position.copy(a).add(b).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), b.clone().sub(a).normalize());
    root.add(m); return m;
  };

  // ---- hood in body paint (crowned, falling towards the nose), cowl and wipers
  const hood = new THREE.PlaneGeometry(1.74, 1.55, 20, 14).rotateX(-Math.PI / 2);
  const hp = hood.attributes.position;
  for (let i = 0; i < hp.count; i++) {
    const x = hp.getX(i), z = hp.getZ(i) - 1.62;           // -0.85 .. -2.4
    const t = (-z - 0.85) / 1.55;
    const crown = 0.035 * (1 - (x / 0.87) ** 2) + 0.008 * Math.exp(-(((Math.abs(x) - 0.3) / 0.06) ** 2));
    const edge = Math.max(0, Math.abs(x) - 0.74) * 0.9;
    hp.setXYZ(i, x * (1 - 0.08 * t * t), 0.94 - 0.09 * t - 0.07 * t * t + crown - edge, z);
  }
  hood.computeVertexNormals();
  add(hood, bodyMat, 0, 0, 0);
  add(box(1.5, 0.05, 0.14, 0.015), M.black, 0, 0.95, -0.9);              // cowl
  for (const x of [-0.42, 0.18]) add(box(0.62, 0.012, 0.02, 0.004), M.black, x, 0.985, -0.86, 0, 0.12, 0);

  // ---- windshield, A-pillars, header, headliner, B-pillars, side glass
  const ws = new THREE.PlaneGeometry(1.42, 0.82);
  const wsm = add(ws, M.glass, 0, 1.17, -0.5, -1.0, 0, 0);
  wsm.renderOrder = 3;
  for (const s of [-1, 1]) {
    beam(new THREE.Vector3(s * 0.74, 0.95, -0.84), new THREE.Vector3(s * 0.64, 1.39, -0.17), 0.075, 0.05, M.cloth);
    beam(new THREE.Vector3(s * 0.8, 0.98, 0.58), new THREE.Vector3(s * 0.7, 1.4, 0.5), 0.12, 0.1, M.cloth);   // B-pillar
    const side = add(new THREE.PlaneGeometry(1.2, 0.4), M.glass, s * 0.79, 1.2, -0.05, 0, s * Math.PI / 2, 0);
    side.rotation.z = s * 0.12; side.renderOrder = 3;
  }
  add(box(1.3, 0.06, 0.14, 0.02), M.cloth, 0, 1.39, -0.15);              // header
  add(box(1.36, 0.03, 1.9, 0.01), M.cloth, 0, 1.43, 0.78);              // headliner
  add(box(0.5, 0.05, 0.22, 0.02), M.trim, 0, 1.405, 0.05);              // overhead console
  for (const x of [-0.08, 0.08]) add(box(0.06, 0.012, 0.05, 0.004), M.glow, x, 1.38, 0.05);   // map lights
  for (const s of [-1, 1]) {                                               // sun visors folded up
    add(box(0.4, 0.025, 0.17, 0.01), M.cloth, s * 0.33, 1.375, -0.06, 0.12, 0, 0);
    add(box(0.12, 0.006, 0.06, 0.002), M.black, s * 0.33, 1.36, -0.06, 0.12, 0, 0);
  }

  // ---- rear-view mirror (its face is a live picture of the road behind, see update())
  const mirror = new THREE.Group();
  mirror.position.set(0, 1.29, -0.27);
  mirror.rotation.set(0.05, 0.16, 0);
  root.add(mirror);
  const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.1, 8), M.black);
  stalk.position.set(0, 0.07, -0.02);
  mirror.add(stalk);
  mirror.add(new THREE.Mesh(new RoundedBoxGeometry(0.27, 0.075, 0.035, 2, 0.015), M.black));
  const mirrorFaceMat = new THREE.MeshBasicMaterial({ color: 0x3a4250 });
  const mirrorFace = new THREE.Mesh(new THREE.PlaneGeometry(0.25, 0.062), mirrorFaceMat);
  mirrorFace.position.z = 0.019;
  mirror.add(mirrorFace);

  // ---- dashboard: one soft-touch moulding from the glass to the knees
  add(shapeGeo([[-0.86, 0.94], [-0.62, 0.962], [-0.44, 0.952], [-0.37, 0.935], [-0.33, 0.905], [-0.33, 0.84],
    [-0.36, 0.7], [-0.5, 0.52], [-0.86, 0.52]], 1.56, 0.02), M.dash, 0, 0, 0);
  add(box(1.5, 0.012, 0.012, 0), M.stitch, 0, 0.933, -0.367);           // stitched upper edge
  add(box(1.44, 0.03, 0.02, 0.008), M.satin, 0, 0.845, -0.33);           // satin trim across the face
  add(box(1.46, 0.05, 0.03, 0.01), M.leather, 0, 0.885, -0.335);         // wrapped insert
  // air vents: two at the ends, two in the middle
  for (const [x, w] of [[-0.66, 0.15], [0.66, 0.15], [-0.1, 0.11], [0.1, 0.11]]) {
    add(box(w, 0.07, 0.03, 0.012), M.black, x, 0.91, -0.322);
    for (let k = -1; k <= 1; k++) add(box(w - 0.02, 0.005, 0.012, 0), M.satin, x, 0.91 + k * 0.018, -0.305);
  }
  // instrument pod on the dash top: housing behind the dials, a visor over them, side cheeks
  add(box(0.4, 0.17, 0.12, 0.02), M.dash, EYE.x, 0.99, -0.5);
  add(shapeGeo([[-0.57, 1.07], [-0.53, 1.09], [-0.45, 1.087], [-0.435, 1.078], [-0.47, 1.073]], 0.42, 0.008), M.dash, EYE.x, 0, 0);
  for (const s2 of [-1, 1]) add(box(0.018, 0.15, 0.06, 0.006), M.dash, EYE.x + s2 * 0.195, 1.0, -0.46);
  // touch screen on the centre stack, climate panel below it, hazard button
  add(box(0.26, 0.17, 0.025, 0.012), M.gloss, 0, 0.99, -0.42, -0.22, 0, 0);
  add(box(0.36, 0.08, 0.04, 0.012), M.trim, 0, 0.79, -0.37, -0.35, 0, 0);
  for (const x of [-0.12, 0.12]) add(new THREE.CylinderGeometry(0.028, 0.028, 0.03, 18).rotateX(Math.PI / 2 - 0.35), M.satin, x, 0.79, -0.345);
  for (let k = -2; k <= 2; k++) add(box(0.03, 0.018, 0.01, 0.004), M.black, k * 0.035, 0.79, -0.348, -0.35, 0, 0);
  add(new THREE.CircleGeometry(0.012, 3), M.red, 0, 0.86, -0.317, 0, 0, Math.PI / 2);

  // ---- centre console, gear selector, cup holders, armrest
  add(box(0.26, 0.3, 0.95, 0.04), M.trim, 0, 0.5, 0.12);
  add(box(0.24, 0.02, 0.62, 0.01), M.gloss, 0, 0.655, 0.0);
  add(new THREE.CylinderGeometry(0.012, 0.016, 0.12, 10), M.black, 0, 0.72, 0.02, -0.2, 0, 0);
  add(new THREE.SphereGeometry(0.035, 14, 10).scale(0.9, 1.25, 1.1), M.leather, 0, 0.79, 0.035);
  add(box(0.02, 0.012, 0.012, 0), M.satin, 0, 0.83, 0.035);
  for (const z of [0.2, 0.3]) add(new THREE.CylinderGeometry(0.04, 0.04, 0.01, 20), M.black, 0, 0.662, z);
  add(box(0.24, 0.07, 0.36, 0.03), M.leather, 0, 0.74, 0.58);
  add(box(0.24, 0.006, 0.34, 0), M.stitch, 0, 0.776, 0.58);

  // ---- door cards (armrest, pull handle, window switches, speaker), beltline trim
  for (const s of [-1, 1]) {
    const x = s * 0.82;
    add(box(0.07, 0.5, 1.4, 0.03), M.trim, x, 0.72, 0.0);
    add(box(0.09, 0.05, 1.42, 0.02), M.leather, x - s * 0.01, 0.99, 0.0);     // top roll
    add(box(0.1, 0.05, 0.5, 0.02), M.leather, x - s * 0.04, 0.78, 0.15);      // armrest
    add(box(0.03, 0.04, 0.14, 0.012), M.satin, x - s * 0.045, 0.9, -0.28);    // inner handle
    add(box(0.08, 0.02, 0.16, 0.008), M.black, x - s * 0.06, 0.81, 0.08);     // window switches
    add(new THREE.CircleGeometry(0.075, 20), M.black, x - s * 0.037, 0.56, -0.2, 0, -s * Math.PI / 2, 0);
    add(box(0.012, 0.012, 1.0, 0), M.satin, x - s * 0.04, 0.95, -0.05);       // trim line
  }

  // ---- seats: passenger seat beside you, rear bench behind (hidden when looking back)
  const rearBlockers = [];
  const seat = (x) => {
    const g = new THREE.Group();
    g.position.set(x, 0, 0);
    const cushion = new THREE.Mesh(new RoundedBoxGeometry(0.52, 0.14, 0.52, 3, 0.05), M.leather);
    cushion.position.set(0, 0.52, 0.42);
    const back = new THREE.Mesh(new RoundedBoxGeometry(0.52, 0.66, 0.14, 3, 0.06), M.leather);
    back.position.set(0, 0.9, 0.74); back.rotation.x = 0.16;
    const insert = new THREE.Mesh(new RoundedBoxGeometry(0.3, 0.5, 0.02, 2, 0.008), M.stitch);
    insert.position.set(0, 0.9, 0.665); insert.rotation.x = 0.16;
    const head = new THREE.Mesh(new RoundedBoxGeometry(0.27, 0.19, 0.11, 3, 0.05), M.leather);
    head.position.set(0, 1.34, 0.84);
    for (const px of [-0.07, 0.07]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.1, 6), M.satin);
      post.position.set(px, 1.24, 0.83);
      g.add(post);
    }
    g.add(cushion, back, insert, head);
    root.add(g);
    return g;
  };
  rearBlockers.push(seat(-0.37));
  seat(0.37);
  const rear = new THREE.Group();
  const bench = new THREE.Mesh(new RoundedBoxGeometry(1.36, 0.16, 0.5, 3, 0.05), M.leather);
  bench.position.set(0, 0.5, 1.35);
  const rback = new THREE.Mesh(new RoundedBoxGeometry(1.36, 0.6, 0.15, 3, 0.06), M.leather);
  rback.position.set(0, 0.88, 1.66); rback.rotation.x = 0.22;
  const shelf = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.02, 0.4), M.black);
  shelf.position.set(0, 1.04, 1.95);
  rear.add(bench, rback, shelf);
  for (const s of [-1, 1]) {
    const cp = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.42, 0.5), M.cloth);
    cp.position.set(s * 0.72, 1.2, 1.72); cp.rotation.x = -0.6;
    rear.add(cp);
  }
  root.add(rear);
  add(new THREE.PlaneGeometry(1.6, 2.6).rotateX(-Math.PI / 2), M.carpet, 0, 0.34, 0.4);

  // ---- own side mirrors (the sedan keeps its real ones)
  if (ownMirrors) for (const s of [-1, 1]) {
    const g = new THREE.Group();
    g.position.set(s * 0.98, 1.0, -0.62);
    const shell = new THREE.Mesh(new THREE.SphereGeometry(0.11, 16, 10).scale(1.0, 0.62, 1.15), bodyMat);
    const face = new THREE.Mesh(new THREE.CircleGeometry(0.085, 16).scale(1, 0.6, 1), M.gloss);
    face.position.set(0, 0, 0.1);
    g.add(shell, face);
    root.add(g);
  }

  // ---- steering wheel (leather rim, three satin spokes, plain gold emblem), column, stalks
  const wheelPivot = new THREE.Group();
  wheelPivot.position.set(EYE.x, 0.81, -0.17);
  wheelPivot.rotation.x = -0.42;
  root.add(wheelPivot);
  const wheelSpin = new THREE.Group();
  wheelPivot.add(wheelSpin);
  wheelSpin.add(new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.016, 14, 56), M.leather));
  for (const a of [0, Math.PI, -Math.PI / 2]) {
    const sp = new THREE.Mesh(new RoundedBoxGeometry(0.13, 0.04, 0.022, 2, 0.008), a === -Math.PI / 2 ? M.leather : M.satin);
    sp.position.set(Math.cos(a) * 0.11, Math.sin(a) * 0.11, -0.01);
    sp.rotation.z = a;
    wheelSpin.add(sp);
  }
  const pad = new THREE.Mesh(new RoundedBoxGeometry(0.15, 0.11, 0.05, 3, 0.02), M.leather);
  pad.position.z = -0.012;
  const emblem = new THREE.Mesh(new RoundedBoxGeometry(0.04, 0.016, 0.006, 1, 0.003), M.gold);
  emblem.position.z = 0.016;
  for (const s of [-1, 1]) for (let k = 0; k < 2; k++) {
    const btn = new THREE.Mesh(new RoundedBoxGeometry(0.018, 0.012, 0.006, 1, 0.003), M.black);
    btn.position.set(s * (0.1 + k * 0.024), 0.008, 0.004);
    wheelSpin.add(btn);
  }
  wheelSpin.add(pad, emblem);
  const column = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.06, 0.28, 14).rotateX(Math.PI / 2), M.trim);
  column.position.z = -0.17;
  wheelPivot.add(column);
  for (const s of [-1, 1]) {
    const stalkM = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.01, 0.17, 8).rotateZ(Math.PI / 2), M.black);
    stalkM.position.set(s * 0.1, 0.0, -0.12);
    stalkM.rotation.y = s * 0.15;
    wheelPivot.add(stalkM);
  }

  // ---- live screens: analogue cluster (tachometer + speedometer) and the centre display
  const makeScreen = (w, h, pw, ph) => {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(pw, ph), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, color: 0xbfc6d0 }));
    return { c, ctx: c.getContext('2d'), tex, mesh };
  };
  const cluster = makeScreen(640, 256, 0.35, 0.14);
  cluster.mesh.position.set(EYE.x, 1.005, -0.437);
  cluster.mesh.rotation.x = -0.25;
  root.add(cluster.mesh);
  const centre = makeScreen(320, 200, 0.235, 0.145);
  centre.mesh.position.set(0, 0.99, -0.4055);
  centre.mesh.rotation.x = -0.22;
  root.add(centre.mesh);
  const accentCss = '#' + new THREE.Color(accent).getHexString();

  function dial(g, cx, cy, R, frac, label, max, step, red) {
    g.save();
    g.translate(cx, cy);
    const a0 = Math.PI * 0.75, a1 = Math.PI * 2.25;
    g.lineWidth = 3; g.strokeStyle = '#2a3140';
    g.beginPath(); g.arc(0, 0, R, a0, a1); g.stroke();
    if (red) { g.strokeStyle = '#c8323c'; g.lineWidth = 5; g.beginPath(); g.arc(0, 0, R - 3, a0 + (a1 - a0) * red, a1); g.stroke(); }
    g.fillStyle = '#d6dde8'; g.strokeStyle = '#d6dde8'; g.font = '600 17px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (let v = 0; v <= max + 1e-6; v += step) {
      const a = a0 + (a1 - a0) * (v / max);
      g.lineWidth = 2;
      g.beginPath(); g.moveTo(Math.cos(a) * (R - 4), Math.sin(a) * (R - 4)); g.lineTo(Math.cos(a) * (R - 15), Math.sin(a) * (R - 15)); g.stroke();
      g.fillText(String(Math.round(max > 50 ? v : v)), Math.cos(a) * (R - 30), Math.sin(a) * (R - 30));
    }
    g.fillStyle = '#7d8aa0'; g.font = '13px sans-serif'; g.fillText(label, 0, R * 0.55);
    const a = a0 + (a1 - a0) * Math.max(0, Math.min(1.02, frac));
    g.strokeStyle = '#ff5a3c'; g.lineWidth = 4; g.lineCap = 'round';
    g.beginPath(); g.moveTo(-Math.cos(a) * 12, -Math.sin(a) * 12); g.lineTo(Math.cos(a) * (R - 10), Math.sin(a) * (R - 10)); g.stroke();
    g.fillStyle = '#11151c'; g.beginPath(); g.arc(0, 0, 11, 0, Math.PI * 2); g.fill();
    g.restore();
  }
  let tick = 0;
  function drawScreens(kmh, rpm, gear, nitro, extra) {
    if ((tick = (tick + 1) % 3) !== 0) return;
    const g = cluster.ctx;
    const bg = g.createLinearGradient(0, 0, 0, 256);
    bg.addColorStop(0, '#0b0e14'); bg.addColorStop(1, '#030407');
    g.fillStyle = bg; g.fillRect(0, 0, 640, 256);
    dial(g, 150, 132, 112, rpm / 8000, 'x1000 r/min', 8, 1, 6.5 / 8);
    dial(g, 490, 132, 112, kmh / 260, 'km/h', 260, 20, 0);
    // centre info: gear and speed in numbers
    g.fillStyle = '#e8eef8'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = 'bold 44px sans-serif'; g.fillText(String(Math.round(kmh)), 320, 112);
    g.font = '14px sans-serif'; g.fillStyle = '#7d8aa0'; g.fillText('KM/H', 320, 146);
    g.font = 'bold 30px sans-serif'; g.fillStyle = accentCss; g.fillText(String(gear), 320, 200);
    cluster.tex.needsUpdate = true;
    const c2 = centre.ctx;
    c2.fillStyle = '#06080d'; c2.fillRect(0, 0, 320, 200);
    c2.fillStyle = '#1b2433'; c2.fillRect(0, 0, 320, 34);
    c2.fillStyle = '#cfd8e6'; c2.font = 'bold 16px sans-serif'; c2.textAlign = 'left'; c2.textBaseline = 'middle';
    c2.fillText('NAVIGATSIYA', 12, 17);
    c2.textAlign = 'right'; c2.fillText(new Date().toTimeString().slice(0, 5), 308, 17);
    c2.textAlign = 'left'; c2.fillStyle = '#e8f1ff'; c2.font = 'bold 20px sans-serif';
    (extra || []).slice(0, 2).forEach((line, i) => c2.fillText(line, 14, 70 + i * 30));
    c2.fillStyle = '#7d8aa0'; c2.font = '13px sans-serif'; c2.fillText('NITRO', 14, 150);
    c2.fillStyle = '#1a1f2b'; c2.fillRect(14, 162, 292, 12);
    c2.fillStyle = '#3fb8ff'; c2.fillRect(14, 162, 292 * Math.max(0, Math.min(1, nitro)), 12);
    centre.tex.needsUpdate = true;
  }

  // live rear-view mirror: a small camera behind the car renders the road into the mirror face
  let rt = null, mirrorCam = null, mirrorTick = 0;
  const tmpV = new THREE.Vector3(), tmpQ = new THREE.Quaternion();
  function renderMirror(renderer, scene, bodyObj) {
    if (!renderer || !scene) return;
    if (!rt) {
      rt = new THREE.WebGLRenderTarget(320, 80, { samples: 0 });
      rt.texture.colorSpace = THREE.SRGBColorSpace;
      mirrorCam = new THREE.PerspectiveCamera(32, 4, 0.5, 400);
      mirrorFaceMat.map = rt.texture;
      mirrorFaceMat.color.set(0xdde2ea);
      mirrorFaceMat.needsUpdate = true;
      // a mirror shows the world left-right swapped
      mirrorFace.scale.x = -1;
    }
    if ((mirrorTick = (mirrorTick + 1) % 2) !== 0) return;
    bodyObj.localToWorld(tmpV.set(0, 1.35, 2.7));
    mirrorCam.position.copy(tmpV);
    bodyObj.getWorldQuaternion(tmpQ);
    mirrorCam.quaternion.copy(tmpQ).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI));
    mirrorCam.rotateX(-0.04);
    const was = root.visible, prevTarget = renderer.getRenderTarget(), sm = renderer.shadowMap.autoUpdate;
    root.visible = false;
    renderer.shadowMap.autoUpdate = false;
    renderer.setRenderTarget(rt);
    renderer.render(scene, mirrorCam);
    renderer.setRenderTarget(prevTarget);
    renderer.shadowMap.autoUpdate = sm;
    root.visible = was;
  }

  return {
    root, eye: EYE.clone(), rearBlockers: [...rearBlockers, rear],
    setSteer(angle) { wheelSpin.rotation.z += (-angle - wheelSpin.rotation.z) * 0.35; },
    drawScreens, renderMirror,
    dispose() {
      root.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
      Object.values(M).forEach((m) => m.dispose());
      mirrorFaceMat.dispose();
      if (rt) rt.dispose();
      for (const s of [cluster, centre]) { s.tex.dispose(); s.mesh.material.dispose(); }
    },
  };
}
