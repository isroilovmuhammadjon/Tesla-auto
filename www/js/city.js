// "TOSHKENT SHAHAR" — free-roam open city. A grid of streets with intersections, city blocks of
// Soviet panel houses, parks and Tashkent landmarks at fixed places, street lights, trees,
// traffic that turns at intersections, a minimap and street names. The player drives freely
// (bicycle-model steering) with the same powertrain as the race mode.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { LANDMARK_BUILDERS, panelTexture, glassTexture } from './tashkent.js';
import { createTrafficCar, pickTrafficType, setTrafficPalette } from './carModels.js';

// ---------------------------------------------------------------- layout
const B = 140;              // street spacing (block + street)
const W = 20;               // street width: 4 lanes x 4 m + shoulders
const K = 5;                // street lines at k*B, k = -K..K
const HALF = K * B;         // map half size (700 m)
const LANE = [2, 6];        // lane centres from the street centre line (right-hand traffic)
const SIDEWALK = 5;

const NS_NAMES = ["Furqat ko'chasi", "Beruniy shoh ko'chasi", "Shayxontohur ko'chasi", "Navoiy ko'chasi", "Mustaqillik shoh ko'chasi",
  "Amir Temur shoh ko'chasi", "Yunus Rajabiy ko'chasi", "Shota Rustaveli ko'chasi", "Bobur ko'chasi", "Mirobod ko'chasi", "Buyuk Ipak Yo'li"];
const EW_NAMES = ["Shahrisabz ko'chasi", "Abdulla Qodiriy ko'chasi", "Labzak ko'chasi", "Afrosiyob ko'chasi", "Taras Shevchenko ko'chasi",
  "Islom Karimov ko'chasi", "Matbuotchilar ko'chasi", "Sharof Rashidov shoh ko'chasi", "Bunyodkor shoh ko'chasi", "Chilonzor ko'chasi", "Muqimiy ko'chasi"];

// special blocks (block i,j spans x in [i*B, (i+1)*B], z in [j*B, (j+1)*B]); -z is north
const SPECIAL = {
  '-1,-1': { park: true, monument: true, name: 'Amir Temur xiyoboni' },
  '-2,-1': { landmark: 6 },                 // Amir Temur muzeyi
  '0,-1': { landmark: 7 },                  // "O'zbekiston" mehmonxonasi
  '-1,0': { park: true, landmark: 2 },      // Mustaqillik maydoni (Ezgulik ravog'i)
  '1,-4': { landmark: 0 },                  // teleminora
  '-3,-3': { landmark: 1 },                 // Minor masjidi
  '-4,0': { landmark: 5 },                  // Chorsu
  '-4,1': { landmark: 3 },                  // Ko'kaldosh madrasasi
  '-3,0': { landmark: 4 },                  // Toshkent City
  '2,2': { landmark: 8 },                   // Humo Arena
  '1,1': { park: true, name: 'Navoiy bog\'i' },
  '3,-2': { park: true, name: 'Yapon bog\'i' },
  '-2,3': { park: true, name: 'Bobur bog\'i' },
};
const LANDMARK_COLORS = ['#ff4d4d', '#35d0e0', '#f2d06b', '#c9a46e', '#6fb6ff', '#2f7fd8', '#2f7fd8', '#e6e2da', '#5fd2ff'];
const LANDMARK_LABELS = ['TV', 'Minor', 'Mustaqillik', "Ko'kaldosh", 'City', 'Chorsu', 'Temur muz.', "O'zbekiston", 'Humo'];

const blockRect = (i, j) => ({ x0: i * B + W / 2, x1: (i + 1) * B - W / 2, z0: j * B + W / 2, z1: (j + 1) * B - W / 2 });
const rand = (a, b) => a + Math.random() * (b - a);

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function amirTemurMonument() {
  const g = new THREE.Group();
  const marble = new THREE.MeshStandardMaterial({ color: 0x9a8f80, roughness: 0.6 });
  const bronze = new THREE.MeshStandardMaterial({ color: 0x6b4a25, metalness: 0.7, roughness: 0.35, emissive: 0x2a1a08, emissiveIntensity: 0.6 });
  const m = (geo, mat, x, y, z) => { const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); g.add(o); return o; };
  m(new THREE.CylinderGeometry(7, 8, 1, 24), marble, 0, 0.5, 0);
  m(new THREE.BoxGeometry(5, 5, 9), marble, 0, 3.5, 0);
  // horse
  m(new THREE.SphereGeometry(1.4, 14, 10).scale(1, 0.9, 2), bronze, 0, 8.3, 0);
  for (const [x, z] of [[-0.6, -1.6], [0.6, -1.6], [-0.6, 1.6], [0.6, 1.6]]) m(new THREE.CylinderGeometry(0.22, 0.18, 2.4, 6), bronze, x, 6.9, z);
  const neck = m(new THREE.CylinderGeometry(0.45, 0.6, 2, 8), bronze, 0, 9.6, -2.3); neck.rotation.x = -0.7;
  m(new THREE.BoxGeometry(0.6, 0.8, 1.4), bronze, 0, 10.4, -3.1);
  // rider
  m(new THREE.CylinderGeometry(0.55, 0.7, 2.2, 10), bronze, 0, 10.3, 0.2);
  m(new THREE.SphereGeometry(0.45, 10, 8), bronze, 0, 11.8, 0.1);
  const arm = m(new THREE.CylinderGeometry(0.14, 0.14, 1.6, 6), bronze, 0.6, 11, -0.4); arm.rotation.set(-1, 0, -0.4);
  // floodlights
  m(new THREE.TorusGeometry(7.6, 0.12, 6, 40).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffd08a).multiplyScalar(2) }), 0, 1.05, 0);
  return g;
}

// ---------------------------------------------------------------- city
export class CityMode {
  constructor(scene, deps) {
    this.scene = scene;
    this.d = deps;            // { getPlayer, pt, input, tilt, audio, fx, ui, camera, setFov, moon, world, lampLights, getView, mobile }
    this.root = new THREE.Group();
    this.root.visible = false;
    scene.add(this.root);
    this.built = false;
    this.cars = [];
    this.state = null;
  }

  // ------------------------------------------------------------ build (once)
  build() {
    if (this.built) return;
    this.built = true;
    const root = this.root;

    // ground
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 2 + 600, HALF * 2 + 600).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: 0x15171c, roughness: 0.95 }));
    ground.position.y = -0.02;
    ground.receiveShadow = true;
    root.add(ground);

    // ---- streets (one long plane per street line)
    const roadTex = canvasTex(256, 256, (g, w, h) => {
      const ppm = w / W;
      g.fillStyle = '#2b2e36'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 2500; i++) { const v = 30 + Math.random() * 40; g.fillStyle = `rgba(${v},${v},${v + 4},0.5)`; g.fillRect(Math.random() * w, Math.random() * h, 1.5, 1.5); }
      g.fillStyle = '#dfe3ea';
      g.fillRect(1.9 * ppm, 0, 0.15 * ppm, h); g.fillRect((W - 2.05) * ppm, 0, 0.15 * ppm, h);   // edge lines
      g.fillRect((W / 2 - 0.25) * ppm, 0, 0.12 * ppm, h); g.fillRect((W / 2 + 0.13) * ppm, 0, 0.12 * ppm, h); // centre double line
      const ppmY = h / 12;
      for (const lx of [W / 2 - 4, W / 2 + 4]) g.fillRect((lx - 0.07) * ppm, 0, 0.14 * ppm, 3 * ppmY);         // lane dashes
    });
    roadTex.wrapS = roadTex.wrapT = THREE.RepeatWrapping;
    const len = HALF * 2 + W;
    roadTex.repeat.set(1, len / 12);
    roadTex.anisotropy = 8;
    const roadMat = new THREE.MeshStandardMaterial({ map: roadTex, roughness: 0.5, metalness: 0.15 });
    const roadGeo = new THREE.PlaneGeometry(W, len).rotateX(-Math.PI / 2);
    for (let k = -K; k <= K; k++) {
      const ns = new THREE.Mesh(roadGeo, roadMat); ns.position.set(k * B, 0.01, 0); ns.receiveShadow = true; root.add(ns);
      const ew = new THREE.Mesh(roadGeo, roadMat); ew.rotation.y = Math.PI / 2; ew.position.set(0, 0.012, k * B); ew.receiveShadow = true; root.add(ew);
    }
    // intersections with zebra crossings (instanced)
    const xTex = canvasTex(256, 256, (g, w, h) => {
      g.fillStyle = '#2b2e36'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#e6e9ee';
      const s = w / W;
      for (let i = 0; i < 8; i++) {
        const p = (2.4 + i * 2) * s;
        g.fillRect(p, 0, 1 * s, 2.2 * s); g.fillRect(p, h - 2.2 * s, 1 * s, 2.2 * s);
        g.fillRect(0, p, 2.2 * s, 1 * s); g.fillRect(w - 2.2 * s, p, 2.2 * s, 1 * s);
      }
    });
    const xCount = (2 * K + 1) ** 2;
    const inter = new THREE.InstancedMesh(new THREE.PlaneGeometry(W, W).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: xTex, roughness: 0.5 }), xCount);
    const m4 = new THREE.Matrix4();
    let n = 0;
    for (let a = -K; a <= K; a++) for (let b = -K; b <= K; b++) { m4.makeTranslation(a * B, 0.02, b * B); inter.setMatrixAt(n++, m4); }
    inter.receiveShadow = true;
    root.add(inter);

    // ---- blocks: sidewalks, parks, buildings, landmarks
    this.blocks = [];
    const facadeTex = ['#4a443b', '#3d4550', '#4a3e3a', '#4d4b45', '#3f4943'].map((c) => { const t = panelTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; });
    const glassTex = glassTexture(); glassTex.wrapS = glassTex.wrapT = THREE.RepeatWrapping;
    const facadeGeos = facadeTex.map(() => []);
    const glassGeos = [];
    const walkGeo = new THREE.BoxGeometry(1, 0.2, 1).translate(0, 0.1, 0);
    const nBlocks = (2 * K) ** 2;
    const walks = new THREE.InstancedMesh(walkGeo, new THREE.MeshStandardMaterial({ color: 0x3a3d45, roughness: 0.9 }), nBlocks);
    const grass = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x1f3a1c }), nBlocks);
    let nw = 0, ng = 0;
    const treeSpots = [];
    this.landmarks = [];
    let curBlock = null;
    const addBuilding = (x, z, sx, sz, h, glass) => {
      if (curBlock) curBlock.h = Math.max(curBlock.h, h + 0.2);
      const geo = new THREE.BoxGeometry(sx, h, sz).translate(x, h / 2 + 0.2, z);
      const uv = geo.attributes.uv;
      const lenFor = (face) => (face < 2 ? sz : face < 4 ? 0 : sx);
      for (let face = 0; face < 6; face++) {
        const L = lenFor(face);
        for (let v = face * 4; v < face * 4 + 4; v++) {
          if (L === 0) { uv.setXY(v, 0.02, 0.98); continue; }
          uv.setXY(v, uv.getX(v) * Math.max(1, Math.round(L / 18)), uv.getY(v) * Math.max(1, Math.round(h / (glass ? 40 : 36))));
        }
      }
      // per-building brightness via vertex colours
      const k = glass ? 1.2 : rand(0.9, 1.25);
      const col = new Float32Array(geo.attributes.position.count * 3).fill(k);
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      if (glass) glassGeos.push(geo); else facadeGeos[Math.floor(Math.random() * facadeGeos.length)].push(geo);
    };

    for (let i = -K; i < K; i++) {
      for (let j = -K; j < K; j++) {
        const r = blockRect(i, j);
        const cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2;
        const sxB = r.x1 - r.x0, szB = r.z1 - r.z0;
        r.h = 1;                     // tallest thing in the block (updated below)
        curBlock = r;
        this.blocks.push(r);
        m4.compose(new THREE.Vector3(cx, 0, cz), new THREE.Quaternion(), new THREE.Vector3(sxB, 1, szB));
        walks.setMatrixAt(nw++, m4);
        const sp = SPECIAL[`${i},${j}`] || {};
        // sidewalk trees along the block edges
        for (let t = r.x0 + 6; t < r.x1 - 4; t += 20) { treeSpots.push([t, r.z0 + 3.6]); treeSpots.push([t, r.z1 - 3.6]); }
        for (let t = r.z0 + 16; t < r.z1 - 14; t += 20) { treeSpots.push([r.x0 + 3.6, t]); treeSpots.push([r.x1 - 3.6, t]); }
        if (sp.park) {
          r.h = 9;   // trees
          m4.compose(new THREE.Vector3(cx, 0.21, cz), new THREE.Quaternion(), new THREE.Vector3(sxB - 2 * SIDEWALK, 1, szB - 2 * SIDEWALK));
          grass.setMatrixAt(ng++, m4);
          for (let p = 0; p < 26; p++) {
            const tx = rand(r.x0 + 10, r.x1 - 10), tz = rand(r.z0 + 10, r.z1 - 10);
            if (Math.hypot(tx - cx, tz - cz) > 16) treeSpots.push([tx, tz]);
          }
          if (sp.monument) { const mo = amirTemurMonument(); mo.position.set(cx, 0.2, cz); root.add(mo); }
        }
        if (sp.landmark !== undefined) {
          const L = LANDMARK_BUILDERS[sp.landmark]();
          L.position.set(cx, 0.2, cz);
          L.userData.blinkers = [];
          L.traverse((o) => { if (o.userData && o.userData.blink) L.userData.blinkers.push(o); });
          root.add(L);
          L.updateMatrixWorld(true);
          r.h = Math.max(r.h, new THREE.Box3().setFromObject(L).max.y);
          this.landmarks.push({ idx: sp.landmark, x: cx, z: cz, obj: L });
          continue;
        }
        if (sp.park) continue;
        // ordinary block: panel houses around the edges, sometimes a glass tower in the middle
        const inX0 = r.x0 + SIDEWALK + 1, inX1 = r.x1 - SIDEWALK - 1, inZ0 = r.z0 + SIDEWALK + 1, inZ1 = r.z1 - SIDEWALK - 1;
        const height = () => { const q = Math.random(); return q < 0.45 ? rand(15, 17) : q < 0.82 ? rand(27, 30) : rand(46, 50); };
        for (const edge of ['n', 's']) {
          let x = inX0;
          while (x < inX1 - 12) {
            const lenB = Math.min(rand(26, 46), inX1 - x);
            const dep = rand(12, 15);
            const z = edge === 'n' ? inZ0 + dep / 2 : inZ1 - dep / 2;
            addBuilding(x + lenB / 2, z, lenB, dep, height(), false);
            x += lenB + rand(5, 12);
          }
        }
        for (const edge of ['w', 'e']) {
          let z = inZ0 + 22;
          while (z < inZ1 - 30) {
            const lenB = Math.min(rand(24, 40), inZ1 - 22 - z);
            if (lenB < 12) break;
            const dep = rand(12, 14);
            const x = edge === 'w' ? inX0 + dep / 2 : inX1 - dep / 2;
            addBuilding(x, z + lenB / 2, dep, lenB, height(), false);
            z += lenB + rand(6, 12);
          }
        }
        if (Math.random() < 0.18) addBuilding(cx, cz, rand(20, 26), rand(20, 26), rand(80, 140), true);
      }
    }
    walks.count = nw; grass.count = ng;
    walks.receiveShadow = true;
    root.add(walks, grass);
    facadeGeos.forEach((list, i) => {
      if (!list.length) return;
      const mesh = new THREE.Mesh(mergeGeometries(list), new THREE.MeshBasicMaterial({ map: facadeTex[i], vertexColors: true }));
      root.add(mesh);
    });
    if (glassGeos.length) root.add(new THREE.Mesh(mergeGeometries(glassGeos), new THREE.MeshBasicMaterial({ map: glassTex, vertexColors: true })));

    // ---- trees (instanced, low poly)
    const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.18, 0.26, 3, 5).translate(0, 1.7, 0), new THREE.MeshLambertMaterial({ color: 0x5a4636 }), treeSpots.length);
    const crown = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1.9, 0).scale(1, 1.2, 1).translate(0, 4.5, 0), new THREE.MeshLambertMaterial({ color: 0xffffff }), treeSpots.length);
    const tint = new THREE.Color();
    treeSpots.forEach(([x, z], idx) => {
      const s = rand(0.75, 1.15);
      m4.compose(new THREE.Vector3(x, 0.2, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.random() * 6), new THREE.Vector3(s, s, s));
      trunk.setMatrixAt(idx, m4); crown.setMatrixAt(idx, m4);
      tint.setHSL(0.26 + Math.random() * 0.07, 0.5, 0.28 + Math.random() * 0.12);
      crown.setColorAt(idx, tint);
    });
    root.add(trunk, crown);

    // ---- street lamps (instanced) + positions for the real-light pool
    this.lampPos = [];
    for (let k = -K; k <= K; k++) {
      for (let s = -HALF; s <= HALF; s += 36) {
        if (Math.abs(((s % B) + B) % B) < W / 2 + 3 || Math.abs((((s % B) + B) % B) - B) < W / 2 + 3) continue;   // skip intersections
        for (const side of [-1, 1]) {
          this.lampPos.push([k * B + side * (W / 2 + 1.2), s, side, 'ns']);
          this.lampPos.push([s, k * B + side * (W / 2 + 1.2), side, 'ew']);
        }
      }
    }
    const poles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.1, 0.15, 9, 6).translate(0, 4.5, 0), new THREE.MeshStandardMaterial({ color: 0x2a2e38, metalness: 0.6, roughness: 0.4 }), this.lampPos.length);
    const heads = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.16, 0.4), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffa850).multiplyScalar(3) }), this.lampPos.length);
    this.lampPos.forEach(([x, z, side, ax], idx) => {
      m4.makeTranslation(x, 0.2, z); poles.setMatrixAt(idx, m4);
      const hx = ax === 'ns' ? x - side * 1.6 : x, hz = ax === 'ew' ? z - side * 1.6 : z;
      m4.makeTranslation(hx, 9, hz);
      if (ax === 'ew') m4.multiply(new THREE.Matrix4().makeRotationY(Math.PI / 2));
      heads.setMatrixAt(idx, m4);
      this.lampPos[idx] = [hx, hz];
    });
    root.add(poles, heads);
    this.lightTimer = 0;

    // ---- minimap (static part drawn once)
    this.maxAlt = Math.max(120, ...this.blocks.map((r) => r.h)) + 40;   // flying ceiling: above the tallest landmark
    this.buildMinimap();
  }

  buildMinimap() {
    const S = 160, scale = S / (HALF * 2 + 60);
    this.mm = { S, scale };
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d');
    g.fillStyle = 'rgba(6,10,22,0.92)'; g.fillRect(0, 0, S, S);
    const px = (x) => S / 2 + x * scale, pz = (z) => S / 2 + z * scale;
    for (const r of this.blocks) {
      const sp = SPECIAL[`${Math.floor(r.x0 / B)},${Math.floor(r.z0 / B)}`];
      g.fillStyle = sp && sp.park ? '#1f4a26' : '#232a3a';
      g.fillRect(px(r.x0), pz(r.z0), (r.x1 - r.x0) * scale, (r.z1 - r.z0) * scale);
    }
    g.fillStyle = '#7b8494';
    for (let k = -K; k <= K; k++) {
      g.fillRect(px(k * B) - 1, pz(-HALF), 2, HALF * 2 * scale);
      g.fillRect(px(-HALF), pz(k * B) - 1, HALF * 2 * scale, 2);
    }
    g.fillStyle = '#c9d4e6'; g.fillRect(px(0) - 1.5, pz(-HALF), 3, HALF * 2 * scale);   // Amir Temur avenue
    for (const L of this.landmarks) {
      g.fillStyle = LANDMARK_COLORS[L.idx];
      g.beginPath(); g.arc(px(L.x), pz(L.z), 3.5, 0, Math.PI * 2); g.fill();
    }
    g.fillStyle = '#f2c94c'; g.beginPath(); g.arc(px(-B / 2), pz(-B / 2), 3.5, 0, Math.PI * 2); g.fill(); // Temur monument
    this.mmStatic = c;
    const el = document.getElementById('minimap');
    this.mmCtx = el ? el.getContext('2d') : null;
    if (el) { el.width = S; el.height = S; }
  }

  // ------------------------------------------------------------ enter / exit
  enter(def) {
    this.build();
    this.root.visible = true;
    this.d.world.setVisible(false);
    setTrafficPalette('tashkent');
    const player = this.d.getPlayer();
    player.setInterior(false);
    document.body.classList.remove('cockpit');
    this.state = {
      x: LANE[0], z: 250, yaw: 0, v: 0, steer: 0, nitro: 1, nitroOn: false, dist: 0, latV: 0,
      pitch: 0, pitchV: 0, roll: 0, rollV: 0, bumpCd: 0, spin: 0, def,
      y: 0, vy: 0, altT: 0, fly: 0,                 // flying car (AERO ION)
    };
    this.camPos = new THREE.Vector3(LANE[0], 3, 258);
    this.camOff = null;
    this.camLook = new THREE.Vector3(LANE[0], 1, 240);
    this.d.pt.reset();
    player.group.position.set(this.state.x, 0, this.state.z);
    player.group.rotation.set(0, 0, 0);
    this.spawnTraffic();
    document.getElementById('minimap').classList.remove('hidden');
  }

  exit() {
    this.root.visible = false;
    this.d.world.setVisible(true);
    for (const c of this.cars) c.mesh.visible = false;
    document.getElementById('minimap').classList.add('hidden');
  }

  // ------------------------------------------------------------ traffic
  spawnTraffic() {
    const n = this.d.mobile ? 18 : 26;
    while (this.cars.length < n) {
      const type = pickTrafficType(false);
      const c = createTrafficCar(type === 'truck' ? 'van' : type);
      this.root.add(c.mesh);
      this.cars.push(c);
    }
    for (const c of this.cars) this.placeCar(c, true);
  }

  // put a car on a random street near the player, outside the camera's immediate view
  placeCar(c, anywhere = false) {
    const s = this.state;
    for (let tries = 0; tries < 20; tries++) {
      const axis = Math.random() < 0.5 ? 'ns' : 'ew';
      const near = axis === 'ns' ? s.x : s.z;
      const line = Math.max(-K, Math.min(K, Math.round(near / B) + Math.floor(rand(-2, 3))));
      const dir = Math.random() < 0.5 ? -1 : 1;
      const lane = Math.random() < 0.5 ? 0 : 1;
      const along = axis === 'ns' ? s.z : s.x;
      const pos = Math.max(-HALF + 20, Math.min(HALF - 20, along + rand(anywhere ? -260 : 120, 260) * (Math.random() < 0.5 ? -1 : 1)));
      c.axis = axis; c.line = line; c.dir = dir; c.lane = lane; c.pos = pos;
      c.baseSpeed = rand(9, 17); c.speed = c.baseSpeed;
      this.carXZ(c);
      if (Math.hypot(c.x - s.x, c.z - s.z) < 45) continue;
      if (this.cars.some((o) => o !== c && o.axis === c.axis && o.line === c.line && o.dir === c.dir && Math.abs(o.pos - c.pos) < 14)) continue;
      break;
    }
    c.setColor();
    c.mesh.visible = true;
    c.yaw = this.carYaw(c);
    c.rx = c.x; c.rz = c.z;
  }

  carXZ(c) {
    const off = LANE[c.lane] * c.dir;   // right-hand traffic
    if (c.axis === 'ns') { c.x = c.line * B - off; c.z = c.pos; } else { c.x = c.pos; c.z = c.line * B + off; }
  }

  carYaw(c) { return c.axis === 'ns' ? (c.dir < 0 ? 0 : Math.PI) : (c.dir > 0 ? -Math.PI / 2 : Math.PI / 2); }

  updateTraffic(dt) {
    const s = this.state;
    for (const c of this.cars) {
      // follow the car ahead in the same lane
      let limit = c.baseSpeed;
      for (const o of this.cars) {
        if (o === c || o.axis !== c.axis || o.line !== c.line || o.dir !== c.dir || o.lane !== c.lane) continue;
        const gap = (o.pos - c.pos) * c.dir - 6;
        if (gap > -2 && gap < 14) limit = Math.min(limit, Math.max(0, o.speed + (gap - 6) * 0.8));
      }
      // brake for the player car in our lane
      const ahead = c.axis === 'ns' ? (s.z - c.z) * c.dir : (s.x - c.x) * c.dir;
      const lateral = c.axis === 'ns' ? Math.abs(s.x - c.x) : Math.abs(s.z - c.z);
      if (ahead > 0 && ahead < 18 && lateral < 2.4) limit = Math.min(limit, Math.max(0, (ahead - 7) * 0.8));
      c.speed += (limit - c.speed) * Math.min(1, dt * (limit < c.speed ? 4 : 1));
      c.setBrake(limit < c.speed - 0.5);
      const prev = c.pos;
      c.pos += c.speed * c.dir * dt;
      // crossed a cross street? maybe turn
      const crossPrev = Math.floor(prev / B), crossNow = Math.floor(c.pos / B);
      if (crossPrev !== crossNow) {
        const at = Math.max(crossPrev, crossNow) * B;
        if (Math.abs(at) < HALF && Math.random() < 0.35) {
          const right = Math.random() < 0.6;
          // new heading: right turn = rotate clockwise (seen from above)
          const oldAxis = c.axis, oldDir = c.dir;
          const crossLine = Math.round(at / B);
          const curLine = c.line;
          c.axis = oldAxis === 'ns' ? 'ew' : 'ns';
          c.line = crossLine;
          if (oldAxis === 'ns') c.dir = right ? (oldDir < 0 ? 1 : -1) : (oldDir < 0 ? -1 : 1);
          else c.dir = right ? (oldDir > 0 ? 1 : -1) : (oldDir > 0 ? -1 : 1);
          c.pos = curLine * B;
          c.lane = right ? 1 : 0;
        }
      }
      this.carXZ(c);
      const targetYaw = this.carYaw(c);
      let dy = targetYaw - c.yaw;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      c.yaw += dy * Math.min(1, dt * 6);
      // render position glides into the new lane after a turn instead of jumping
      if (c.rx === undefined) { c.rx = c.x; c.rz = c.z; }
      const glide = 1 - Math.exp(-dt * 5);
      c.rx += (c.x - c.rx) * glide; c.rz += (c.z - c.rz) * glide;
      c.mesh.position.set(c.rx, 0.02, c.rz);
      c.mesh.rotation.set(0, c.yaw, 0);
      // recycle cars that are far away or left the map
      if (Math.hypot(c.x - s.x, c.z - s.z) > 330 || Math.abs(c.pos) > HALF - 5) this.placeCar(c);
    }
  }

  // ------------------------------------------------------------ collisions
  // oriented rectangle overlap (2D SAT); returns { depth, nx, nz } pushing A out of B, or null
  static obb(ax, az, ayaw, ahw, ahl, bx, bz, byaw, bhw, bhl) {
    const axes = [[Math.cos(ayaw), -Math.sin(ayaw)], [Math.sin(ayaw), Math.cos(ayaw)], [Math.cos(byaw), -Math.sin(byaw)], [Math.sin(byaw), Math.cos(byaw)]];
    let best = null;
    const proj = (cx, cz, yaw, hw, hl, nx, nz) => {
      const r = Math.abs(hw * (Math.cos(yaw) * nx - Math.sin(yaw) * nz)) + Math.abs(hl * (Math.sin(yaw) * nx + Math.cos(yaw) * nz));
      const c = cx * nx + cz * nz;
      return [c - r, c + r];
    };
    for (const [nx, nz] of axes) {
      const [a0, a1] = proj(ax, az, ayaw, ahw, ahl, nx, nz);
      const [b0, b1] = proj(bx, bz, byaw, bhw, bhl, nx, nz);
      const o = Math.min(a1, b1) - Math.max(a0, b0);
      if (o <= 0) return null;
      if (!best || o < best.depth) {
        const sign = (ax * nx + az * nz) < (bx * nx + bz * nz) ? -1 : 1;
        best = { depth: o, nx: nx * sign, nz: nz * sign };
      }
    }
    return best;
  }

  // tallest thing standing at (x, z): 0 on streets
  heightAt(x, z) {
    const bi = Math.floor(x / B), bj = Math.floor(z / B);
    if (bi < -K || bi >= K || bj < -K || bj >= K) return 0;
    const r = this.blocks[(bi + K) * 2 * K + (bj + K)];
    return (x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1) ? r.h : 0;
  }

  collide(dt) {
    const s = this.state, fx = this.d.fx, audio = this.d.audio;
    s.bumpCd = Math.max(0, s.bumpCd - dt);
    const hit = (x, z, strength) => {
      if (s.bumpCd > 0) return;
      s.bumpCd = 0.35;
      fx.emitSparks(x, 0.6, z, Math.min(120, 20 + strength * 6), { spread: 6, up: 3, life: 0.6 });
      if (strength > 12) { fx.emitSmoke(x, 0.6, z, 6, true); audio.crash(); s.spin = (Math.random() - 0.5) * 3; }
      else audio.bump();
      this.d.shake(Math.min(1.2, strength * 0.06));
    };
    // blocks (curbs and buildings) — two circles along the car
    const fwdX = -Math.sin(s.yaw), fwdZ = -Math.cos(s.yaw);
    for (const off of [1.4, -1.4]) {
      const px = s.x + fwdX * off, pz = s.z + fwdZ * off, rad = 1.1;
      const bi = Math.floor(px / B), bj = Math.floor(pz / B);
      for (let a = bi - 1; a <= bi + 1; a++) for (let b = bj - 1; b <= bj + 1; b++) {
        if (a < -K || a >= K || b < -K || b >= K) continue;
        const r = this.blocks[(a + K) * 2 * K + (b + K)];
        if (s.y > r.h + 0.5 || (s.def.flying && (s.altT > 0.05 || s.y > 0.3))) continue;   // flying: never hits buildings
        const cx = Math.max(r.x0, Math.min(px, r.x1)), cz = Math.max(r.z0, Math.min(pz, r.z1));
        const dx = px - cx, dz = pz - cz, d = Math.hypot(dx, dz);
        if (d >= rad) continue;
        let nx, nz, depth;
        if (d > 1e-4) { nx = dx / d; nz = dz / d; depth = rad - d; }
        else { // centre inside the block: push out through the nearest edge
          const opts = [[px - r.x0, -1, 0], [r.x1 - px, 1, 0], [pz - r.z0, 0, -1], [r.z1 - pz, 0, 1]].sort((p, q) => p[0] - q[0]);
          [depth, nx, nz] = [opts[0][0] + rad, opts[0][1], opts[0][2]];
        }
        s.x += nx * depth; s.z += nz * depth;
        const into = -(fwdX * nx + fwdZ * nz) * Math.sign(s.v || 1);   // 1 = head-on
        const impact = Math.abs(s.v) * Math.max(0.2, into);
        s.v *= into > 0.6 ? 0.25 : 0.82;
        hit(cx, cz, impact);
      }
    }
    // map edge
    const lim = HALF + W / 2 - 1.2;
    if (Math.abs(s.x) > lim) { s.x = Math.sign(s.x) * lim; s.v *= 0.5; }
    if (Math.abs(s.z) > lim) { s.z = Math.sign(s.z) * lim; s.v *= 0.5; }
    // traffic
    for (const c of this.cars) {
      if (s.y > c.height + 0.3) continue;                // flying over the traffic
      if (Math.abs(c.x - s.x) > 14 || Math.abs(c.z - s.z) > 14) continue;
      const r = CityMode.obb(s.x, s.z, s.yaw, 0.95, 2.2, c.x, c.z, c.yaw, c.halfW, c.halfL);
      if (!r) continue;
      s.x += r.nx * r.depth * 0.7; s.z += r.nz * r.depth * 0.7;
      const cv = c.speed;
      const rel = Math.abs(s.v - cv * Math.cos(c.yaw - s.yaw));
      c.speed = Math.max(0, cv * 0.4);
      c.pos -= c.dir * r.depth * 0.3;
      this.carXZ(c);
      s.v *= 0.55;
      hit((s.x + c.x) / 2, (s.z + c.z) / 2, rel);
    }
  }

  // ------------------------------------------------------------ per frame
  update(dt) {
    const s = this.state, d = this.d, input = d.input, player = d.getPlayer(), pt = d.pt, def = s.def;
    // ---- input
    const keySteer = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    const steerIn = keySteer !== 0 ? keySteer : (d.tilt.enabled ? d.tilt.axis : 0);
    const maxSteer = 0.62 / (1 + Math.abs(s.v) / 16);
    s.steer += (steerIn * maxSteer - s.steer) * Math.min(1, dt * 8);
    // nitro
    const wasNitro = s.nitroOn;
    s.nitroOn = input.nitro && s.nitro > 0.01 && s.v > 3;
    if (s.nitroOn && !wasNitro) d.audio.nitroStart();
    s.nitro = s.nitroOn ? Math.max(0, s.nitro - dt / (4.2 * def.nitro)) : Math.min(1, s.nitro + dt * 0.05);
    // ---- longitudinal: forward via the powertrain, reverse when braking at a standstill
    let a;
    if (s.v >= 0 && !(input.down && s.v < 0.4)) {
      a = pt.step(dt, s.v, input.up || s.nitroOn ? 1 : 0, input.down ? 1 : 0, s.nitroOn, false);
      s.v = Math.max(0, s.v + a * dt);
    } else {
      // reverse gear: S/Down accelerates backwards, W/Up brakes
      a = input.down ? -4 : input.up ? 9 : (s.v < 0 ? 2.5 : 0);
      s.v = Math.max(-7, Math.min(0, s.v + a * dt));
      pt.rev(dt, input.down);
    }
    // ---- flight (AERO ION): thrust holds a target altitude against gravity, like the race mode
    if (def.flying) {
      const lift = (input.rise ? 1 : 0) - (input.sink ? 1 : 0);
      const maxAlt = this.maxAlt || 200;
      s.altT = Math.max(0, Math.min(maxAlt, s.altT + lift * (s.altT > 60 ? 22 : 12) * dt));
      // full flight: once airborne the car never hits buildings — it climbs over them on its own
      let floor = 0;
      if (s.altT > 0.05 || s.y > 0.3) {
        const fwX = -Math.sin(s.yaw), fwZ = -Math.cos(s.yaw);
        const ahead = Math.max(0, s.v) * 3.5 + 8;
        for (let t = 0; t <= 1.0001; t += 0.125) {
          for (const side of [-2.5, 0, 2.5]) {
            const h = this.heightAt(s.x + fwX * ahead * t - fwZ * side, s.z + fwZ * ahead * t + fwX * side);
            if (h > floor) floor = h;
          }
        }
        if (floor > 0) floor += 3;
        s.autoAlt = Math.max(s.altT, floor);
      } else s.autoAlt = s.altT;
      const target = s.autoAlt;
      const G = 9.81;
      const climbMax = target - s.y > 3 ? 60 : 14;     // strong lift when a building is coming up
      const thrust = G + Math.max(-G * 0.9, Math.min(climbMax, (target - s.y) * 5 - s.vy * 3.6));
      const engaged = s.altT > 0.05 || s.y > 0.05;
      s.vy += ((engaged ? thrust : 0) - G) * dt;
      s.y += s.vy * dt;
      const under = (s.altT > 0.05 || s.y > 0.3) ? this.heightAt(s.x, s.z) : 0;
      if (under > 0 && s.y < under + 0.5) { s.y = under + 0.5; s.vy = Math.max(0, s.vy); }
      if (s.y <= 0) { if (s.vy < -4) { d.audio.thud(-s.vy); d.shake(Math.min(1, -s.vy * 0.08)); } s.y = 0; s.vy = 0; }
      s.fly += ((s.y > 0.12 || s.altT > 0.05 ? 1 : 0) - s.fly) * Math.min(1, dt * 3);
    }
    // ---- steering (bicycle model) + small slide after crashes
    const yawRate = (s.v * Math.tan(s.steer)) / 2.6;
    s.yaw -= yawRate * dt;
    s.spin *= Math.exp(-dt * 3);
    s.yaw += s.spin * dt;
    const fx = -Math.sin(s.yaw), fz = -Math.cos(s.yaw);
    s.x += fx * s.v * dt;
    s.z += fz * s.v * dt;
    s.dist += Math.abs(s.v) * dt;
    this.collide(dt);
    this.updateTraffic(dt);
    d.fx.update(dt, 0);

    // ---- car body: suspension pitch/roll from acceleration and cornering
    const k = 70, c = 8.5;
    s.pitchV += ((Math.max(-0.07, Math.min(0.05, a * 0.0028)) - s.pitch) * k - s.pitchV * c) * dt;
    s.pitch += s.pitchV * dt;
    const latAcc = s.v * yawRate;
    s.rollV += ((Math.max(-0.08, Math.min(0.08, latAcc * 0.006)) - s.roll) * k - s.rollV * c) * dt;
    s.roll += s.rollV * dt;
    player.group.position.set(s.x, s.y, s.z);
    // in the air the car banks into turns and pitches with climb / descent
    player.group.rotation.set(Math.max(-0.18, Math.min(0.18, s.vy * 0.03)) * s.fly, s.yaw, -yawRate * 0.35 * s.fly);
    player.body.rotation.set(s.pitch, 0, s.roll * (1 - s.fly));
    player.update(dt, Math.abs(s.v), steerIn * 0.8, input.down, s.nitroOn, d.time(), s.fly, s.y);

    // ---- light pool near the player + shadows follow the player
    this.lightTimer -= dt;
    if (this.lightTimer <= 0) {
      this.lightTimer = 0.25;
      const near = this.lampPos.map((p) => [p, (p[0] - s.x - fx * 25) ** 2 + (p[1] - s.z - fz * 25) ** 2]).sort((p, q) => p[1] - q[1]);
      d.lampLights.filter((L) => L.visible).forEach((L, i) => { const p = near[i][0]; L.position.set(p[0], 8.6, p[1]); L.intensity = 260; });
    }
    d.moon.position.set(s.x - 30, 60, s.z + 25);
    d.moon.target.position.set(s.x, 0, s.z - 10);
    for (const L of this.landmarks) for (const b of L.obj.userData.blinkers) b.visible = Math.sin(d.time() * 3.2) > 0.2;

    // ---- camera
    this.updateCamera(dt, fx, fz);

    // ---- HUD, sound
    const kmh = Math.abs(s.v) * 3.6;
    d.hud({ speedKmh: kmh, gear: s.v < -0.1 ? 'R' : s.v < 0.5 && !input.up ? 'N' : pt.gear, nitro: s.nitro, nitroActive: s.nitroOn, distance: s.dist, rpm: pt.rpm });
    d.ui.setInfo('KO\'CHA', this.streetName(s.x, s.z), 'win');
    d.ui.setAltitude(def.flying ? s.y : null);
    d.audio.update({ rpm: pt.rpm, load: input.up || s.nitroOn ? 1 : 0.05, engine: 1, wind: Math.abs(s.v) / 90 + s.y * 0.004, nitro: s.nitroOn, electric: !!def.flying, hover: s.fly });
    this.drawMinimap();
  }

  updateCamera(dt, fx, fz) {
    const s = this.state, d = this.d, cam = d.camera, player = d.getPlayer();
    const cockpit = d.getView() === 'cockpit';
    player.setInterior(cockpit);
    document.body.classList.toggle('cockpit', cockpit);
    const look = d.input.look;
    if (cockpit) {
      player.group.updateMatrixWorld(true);
      const p = player.eye.clone();
      player.body.localToWorld(p);
      cam.position.copy(p);
      player.body.getWorldQuaternion(cam.quaternion);
      if (look) cam.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI));
      player.setLookBack(look);
      // live dashboard + steering wheel in the city too
      player.updateInterior(((d.input.right ? 1 : 0) - (d.input.left ? 1 : 0)) || (d.tilt.enabled ? d.tilt.axis : 0),
        Math.abs(s.v) * 3.6, d.pt.rpm, s.v < -0.1 ? 'R' : d.pt.gear, s.nitro, [this.streetName(s.x, s.z).slice(0, 16)]);
      d.setFov(60 + Math.min(1, Math.abs(s.v) / 60) * 8, dt);
      this.camPos.copy(cam.position); this.camLook.set(s.x + fx * 10, 1, s.z + fz * 10);
      return;
    }
    const sf = Math.min(1, Math.abs(s.v) / 60);
    const back = (look ? -1 : 1) * (6.4 + sf * 1.4);
    // smooth the camera's OFFSET from the car (not its world position), so it never falls
    // behind at speed; the offset swings around smoothly when the car turns
    const targetOff = new THREE.Vector3(-fx * back * (1 + s.fly * 0.25), 2.5 + sf * 0.3 + s.fly * 0.8, -fz * back * (1 + s.fly * 0.25));
    if (!this.camOff || look !== this.lookWas) { this.camOff = targetOff.clone(); this.lookWas = look; }
    this.camOff.lerp(targetOff, 1 - Math.exp(-dt * 5));
    this.camPos.set(s.x + this.camOff.x, s.y + this.camOff.y, s.z + this.camOff.z);
    this.camLook.set(s.x + fx * 8 * (look ? -1 : 1), s.y + 1, s.z + fz * 8 * (look ? -1 : 1));
    // keep the camera out of buildings: pull in if the camera point is inside a block
    const pull = this.blocks.find((r) => this.camPos.y < r.h && this.camPos.x > r.x0 && this.camPos.x < r.x1 && this.camPos.z > r.z0 && this.camPos.z < r.z1);
    if (pull) this.camPos.lerp(new THREE.Vector3(s.x, this.camPos.y + 0.5, s.z), 0.5);
    const shake = d.shakeAmount();
    cam.position.set(this.camPos.x + (Math.random() - 0.5) * shake * 0.3, this.camPos.y + (Math.random() - 0.5) * shake * 0.2, this.camPos.z);
    cam.lookAt(this.camLook);
    d.setFov(62 + sf * 14 + (s.nitroOn ? 8 : 0), dt);
  }

  streetName(x, z) {
    const kx = Math.round(x / B), kz = Math.round(z / B);
    const onNS = Math.abs(x - kx * B) < W / 2 + 1 && Math.abs(kx) <= K;
    const onEW = Math.abs(z - kz * B) < W / 2 + 1 && Math.abs(kz) <= K;
    const ns = NS_NAMES[kx + K], ew = EW_NAMES[kz + K];
    if (onNS && onEW) return `${ns.split(' ')[0]} × ${ew.split(' ')[0]}`;
    if (onNS) return ns;
    if (onEW) return ew;
    return 'Toshkent';
  }

  drawMinimap() {
    if (!this.mmCtx) return;
    this.mmTick = (this.mmTick || 0) + 1;
    if (this.mmTick % 3) return;
    const g = this.mmCtx, { S, scale } = this.mm, s = this.state;
    g.drawImage(this.mmStatic, 0, 0);
    g.fillStyle = 'rgba(255,255,255,0.55)';
    for (const c of this.cars) g.fillRect(S / 2 + c.x * scale - 1, S / 2 + c.z * scale - 1, 2, 2);
    // player arrow (north up)
    g.save();
    g.translate(S / 2 + s.x * scale, S / 2 + s.z * scale);
    g.rotate(-s.yaw);
    g.fillStyle = '#00e5ff';
    g.beginPath(); g.moveTo(0, -6); g.lineTo(4, 5); g.lineTo(0, 3); g.lineTo(-4, 5); g.closePath(); g.fill();
    g.restore();
  }
}

export const CITY_LANDMARK_LABELS = LANDMARK_LABELS;
