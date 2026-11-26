// "TOSHKENT SHAHAR" — free-roam open city. A grid of streets with intersections, city blocks of
// Soviet panel houses, parks and Tashkent landmarks at fixed places, street lights, trees,
// traffic that turns at intersections, a minimap and street names. The player drives freely
// (bicycle-model steering) with the same powertrain as the race mode.
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { LANDMARK_BUILDERS, panelTexture, glassTexture } from './tashkent.js';
import { createUzCar, pickUzType } from './uzcars.js';
import { dayPanelTexture, dayGlassTexture, signAtlas, signGeometry, SHOP_SIGNS, busStopParts, trafficLightParts, SIGNAL, daySky } from './cityday.js';

// warm afternoon sun from the south-west, high enough that the street itself is in the sun
// (lower, the tall blocks would shade whole streets) while the trees throw shade across the lanes
const SUN_DIR = new THREE.Vector3(-0.5, 0.78, 0.38).normalize();
const LIGHT_COLORS = {
  r: new THREE.Color(5, 0.25, 0.15), y: new THREE.Color(5, 3.2, 0.3), g: new THREE.Color(0.3, 4.2, 1.4), off: new THREE.Color(0.06, 0.06, 0.07),
};

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
  '0,-5': { landmark: 0, dx: -38 },         // teleminora: right at the end of Amir Temur avenue
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
      new THREE.MeshStandardMaterial({ color: 0x8a8273, roughness: 0.95, envMapIntensity: 0.25 }));
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
    const roadMat = new THREE.MeshStandardMaterial({ map: roadTex, roughness: 0.62, metalness: 0.05, envMapIntensity: 0.3 });
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
    const inter = new THREE.InstancedMesh(new THREE.PlaneGeometry(W, W).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: xTex, roughness: 0.62, envMapIntensity: 0.3 }), xCount);
    const m4 = new THREE.Matrix4();
    let n = 0;
    for (let a = -K; a <= K; a++) for (let b = -K; b <= K; b++) { m4.makeTranslation(a * B, 0.02, b * B); inter.setMatrixAt(n++, m4); }
    inter.receiveShadow = true;
    root.add(inter);

    // ---- blocks: sidewalks, parks, buildings, landmarks
    this.blocks = [];
    void panelTexture; void glassTexture;
    const facadeTex = ['#d8ccb2', '#cfc8bb', '#d9c4a8', '#c3cbcd', '#e2d8c4', '#cbb69b'].map((c, i) => { const t = dayPanelTexture(c, i + 1); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; });
    const glassTex = dayGlassTexture(); glassTex.wrapS = glassTex.wrapT = THREE.RepeatWrapping;
    const signGeos = [];
    // Uzbek shop sign over the ground floor, centred at (x, z) on a facade facing rotation `rot`
    const addSign = (x, z, rot, width) => {
      if (width < 4) return;
      const g = signGeometry(Math.floor(Math.random() * SHOP_SIGNS.length), width, 1.05);
      g.rotateY(rot);
      g.translate(x + Math.sin(rot) * 0.08, 3.7, z + Math.cos(rot) * 0.08);
      signGeos.push(g);
    };
    const facadeGeos = facadeTex.map(() => []);
    const glassGeos = [];
    const walkGeo = new THREE.BoxGeometry(1, 0.2, 1).translate(0, 0.1, 0);
    const nBlocks = (2 * K) ** 2;
    const walks = new THREE.InstancedMesh(walkGeo, new THREE.MeshStandardMaterial({ color: 0xaaa69c, roughness: 0.9, envMapIntensity: 0.3 }), nBlocks);
    const grass = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x5b8a3a }), nBlocks);
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
      const k = glass ? 1.0 : rand(0.86, 1.04);
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
          L.position.set(cx + (sp.dx || 0), 0.2, cz);
          L.userData.blinkers = [];
          L.traverse((o) => { if (o.userData && o.userData.blink) L.userData.blinkers.push(o); });
          root.add(L);
          L.updateMatrixWorld(true);
          r.h = Math.max(r.h, new THREE.Box3().setFromObject(L).max.y);
          this.landmarks.push({ idx: sp.landmark, x: cx + (sp.dx || 0), z: cz, obj: L });
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
            if (Math.random() < 0.8) addSign(x + lenB / 2, edge === 'n' ? z - dep / 2 : z + dep / 2, edge === 'n' ? Math.PI : 0, Math.min(lenB * 0.55, 10));
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
            if (Math.random() < 0.7) addSign(edge === 'w' ? x - dep / 2 : x + dep / 2, z + lenB / 2, edge === 'w' ? -Math.PI / 2 : Math.PI / 2, Math.min(lenB * 0.55, 10));
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
      const mesh = new THREE.Mesh(mergeGeometries(list), new THREE.MeshLambertMaterial({ map: facadeTex[i], vertexColors: true }));
      mesh.castShadow = mesh.receiveShadow = true;
      root.add(mesh);
    });
    if (glassGeos.length) {
      const gm = new THREE.Mesh(mergeGeometries(glassGeos), new THREE.MeshStandardMaterial({ map: glassTex, vertexColors: true, metalness: 0.6, roughness: 0.15 }));
      gm.castShadow = gm.receiveShadow = true;
      root.add(gm);
    }
    if (signGeos.length) root.add(new THREE.Mesh(mergeGeometries(signGeos), new THREE.MeshLambertMaterial({ map: signAtlas() })));

    // ---- the avenue (Amir Temur, x = 0): two rows of big plane trees on each side
    const bigTreeSpots = [];
    for (let z = -HALF + 14; z < HALF - 10; z += 9) {
      const m = ((z % B) + B) % B;
      if (m < W / 2 + 6 || m > B - W / 2 - 6) continue;                     // keep crossings clear
      for (const side of [-1, 1]) {
        bigTreeSpots.push([side * (W / 2 + 2.3), z]);
        bigTreeSpots.push([side * (W / 2 + 6.5), z + 4.5]);
      }
    }

    // ---- trees (instanced, low poly)
    // plane trees (chinar): pale trunks, broad lumpy crowns that throw shade on the road
    const lumps = [[0, 0, 0, 2.0], [1.3, 0.5, 0.3, 1.45], [-1.2, 0.4, -0.5, 1.5], [0.2, 1.1, -1.2, 1.35], [-0.4, 0.9, 1.3, 1.3]].map(([x, y, z, rr]) => {
      const g = mergeVertices(new THREE.IcosahedronGeometry(rr, 1).deleteAttribute('normal').deleteAttribute('uv'));
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) {   // smooth bumps (same offset for shared vertices: no cracks)
        const X = p.getX(i), Y = p.getY(i), Z = p.getZ(i);
        const k = 0.9 + 0.1 * Math.sin(X * 2.3 + Y * 1.3) * Math.cos(Z * 2.1 - X) + 0.05 * Math.sin(Y * 5.1 + Z * 3.7);
        p.setXYZ(i, X * k, Y * k, Z * k);
      }
      return g.translate(x, y, z);
    });
    const crownGeo = mergeGeometries(lumps);
    crownGeo.scale(1.05, 0.9, 1.05).translate(0, 5.3, 0);
    crownGeo.computeVertexNormals();
    const allTrees = [...treeSpots.map((p) => [...p, rand(0.8, 1.15)]), ...bigTreeSpots.map((p) => [...p, rand(1.45, 1.85)])];
    const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.2, 0.3, 4.2, 6).translate(0, 2.1, 0), new THREE.MeshLambertMaterial({ color: 0xb3a68c }), allTrees.length);
    const crown = new THREE.InstancedMesh(crownGeo, new THREE.MeshLambertMaterial({ color: 0xffffff }), allTrees.length);
    const tint = new THREE.Color();
    allTrees.forEach(([x, z, s], idx) => {
      m4.compose(new THREE.Vector3(x, 0.2, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.random() * 6), new THREE.Vector3(s, s, s));
      trunk.setMatrixAt(idx, m4); crown.setMatrixAt(idx, m4);
      tint.setHSL(0.24 + Math.random() * 0.07, 0.45, 0.3 + Math.random() * 0.1);
      crown.setColorAt(idx, tint);
    });
    trunk.castShadow = crown.castShadow = true;
    crown.receiveShadow = true;
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
    const heads = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.16, 0.4), new THREE.MeshStandardMaterial({ color: 0x8d939c, metalness: 0.5, roughness: 0.4 }), this.lampPos.length);
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

    this.buildBusStops();
    this.buildSignals();
    this.sky = daySky(SUN_DIR);
    root.add(this.sky);

    // ---- minimap (static part drawn once)
    this.maxAlt = Math.max(120, ...this.blocks.map((r) => r.h)) + 40;   // flying ceiling: above the tallest landmark
    this.buildMinimap();
  }

  // bus stops on the sidewalks, open side towards the street, roughly every other block
  buildBusStops() {
    const parts = busStopParts();
    const spots = [];
    for (let k = -K; k <= K; k++) {
      for (let j = -K; j < K; j++) {
        const mid = j * B + B / 2;
        if (Math.random() < 0.4) spots.push([k * B + W / 2 + 2.7, mid + 18, -Math.PI / 2]);   // N-S street, east side
        if (Math.random() < 0.4) spots.push([k * B - W / 2 - 2.7, mid - 18, Math.PI / 2]);    // west side
        if (Math.random() < 0.3) spots.push([mid - 18, k * B + W / 2 + 2.7, Math.PI]);        // E-W street, south side
        if (Math.random() < 0.3) spots.push([mid + 18, k * B - W / 2 - 2.7, 0]);              // north side
      }
    }
    const frame = new THREE.InstancedMesh(mergeGeometries(parts.frame), new THREE.MeshLambertMaterial({ vertexColors: true }), spots.length);
    const glass = new THREE.InstancedMesh(mergeGeometries(parts.glass), new THREE.MeshStandardMaterial({ color: 0xbfd9e6, transparent: true, opacity: 0.28, metalness: 0.2, roughness: 0.05, depthWrite: false }), spots.length);
    const sign = new THREE.InstancedMesh(parts.sign, new THREE.MeshBasicMaterial({ map: parts.signTexture }), spots.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1), up = new THREE.Vector3(0, 1, 0);
    spots.forEach(([x, z, rot], i) => {
      m4.compose(new THREE.Vector3(x, 0.2, z), q.setFromAxisAngle(up, rot), one);
      frame.setMatrixAt(i, m4); glass.setMatrixAt(i, m4); sign.setMatrixAt(i, m4);
    });
    frame.castShadow = true;
    this.root.add(frame, glass, sign);
    this.busStops = spots;
  }

  // traffic lights on mast arms at every intersection, one per approach, over the right-hand lanes
  buildSignals() {
    const parts = trafficLightParts();
    const off = W / 2 + 1.2;
    const approaches = [   // [corner dx, dz, rotation, axis]
      [off, off, 0, 'ns'], [-off, -off, Math.PI, 'ns'], [-off, off, -Math.PI / 2, 'ew'], [off, -off, Math.PI / 2, 'ew'],
    ];
    const list = [];
    for (let a = -K; a <= K; a++) for (let b = -K; b <= K; b++) for (const [dx, dz, rot, axis] of approaches) list.push({ a, b, x: a * B + dx, z: b * B + dz, rot, axis });
    const metal = new THREE.InstancedMesh(mergeGeometries(parts.metal), new THREE.MeshStandardMaterial({ color: 0x6f757d, metalness: 0.6, roughness: 0.45 }), list.length);
    const dark = new THREE.InstancedMesh(mergeGeometries(parts.dark), new THREE.MeshStandardMaterial({ color: 0x1b1d21, roughness: 0.6 }), list.length);
    const lamps = new THREE.InstancedMesh(parts.lamp, new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), list.length * 3);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1), up = new THREE.Vector3(0, 1, 0);
    const lampLocal = new THREE.Matrix4();
    list.forEach((L, i) => {
      m4.compose(new THREE.Vector3(L.x, 0.2, L.z), q.setFromAxisAngle(up, L.rot), one);
      metal.setMatrixAt(i, m4); dark.setMatrixAt(i, m4);
      SIGNAL.lampDY.forEach((dy, k) => {
        lampLocal.makeTranslation(-SIGNAL.arm + 0.05, SIGNAL.headY + dy, 0.156);
        lamps.setMatrixAt(i * 3 + k, m4.clone().multiply(lampLocal));
        lamps.setColorAt(i * 3 + k, LIGHT_COLORS.off);
      });
      L.state = '';
    });
    metal.castShadow = dark.castShadow = true;
    this.root.add(metal, dark, lamps);
    this.signals = { list, lamps };
    this.signalTime = 0;
  }

  // phase of the lights at intersection (a, b) for traffic along `axis`: 'g', 'y' or 'r'
  lightState(a, b, axis, t = this.signalTime) {
    const off = ((((a * 7 + b * 13) % 8) + 8) % 8) * 4;
    const p = (t + off) % 32;
    if (axis === 'ns') return p < 13 ? 'g' : p < 16 ? 'y' : 'r';
    return p >= 16.5 && p < 29.5 ? 'g' : p >= 29.5 ? 'y' : 'r';
  }

  updateSignals(dt) {
    this.signalTime += dt;
    this.signalTick = (this.signalTick || 0) - dt;
    if (this.signalTick > 0) return;
    this.signalTick = 0.2;
    const { list, lamps } = this.signals;
    let dirty = false;
    list.forEach((L, i) => {
      const st = this.lightState(L.a, L.b, L.axis);
      if (st === L.state) return;
      L.state = st;
      lamps.setColorAt(i * 3, st === 'r' ? LIGHT_COLORS.r : LIGHT_COLORS.off);
      lamps.setColorAt(i * 3 + 1, st === 'y' ? LIGHT_COLORS.y : LIGHT_COLORS.off);
      lamps.setColorAt(i * 3 + 2, st === 'g' ? LIGHT_COLORS.g : LIGHT_COLORS.off);
      dirty = true;
    });
    if (dirty) lamps.instanceColor.needsUpdate = true;
  }

  // the minimap: a detailed picture of the street grid, drawn once; the live view turns with the car
  buildMinimap() {
    const scale = 0.75, S = Math.ceil((HALF * 2 + 80) * scale);
    this.mm = { S, scale, view: 230 };
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d');
    g.fillStyle = '#2a2f38'; g.fillRect(0, 0, S, S);
    const px = (x) => S / 2 + x * scale, pz = (z) => S / 2 + z * scale;
    for (const r of this.blocks) {
      const sp = SPECIAL[`${Math.floor(r.x0 / B)},${Math.floor(r.z0 / B)}`];
      g.fillStyle = sp && sp.park ? '#3e6b3a' : '#4a4f59';
      g.fillRect(px(r.x0), pz(r.z0), (r.x1 - r.x0) * scale, (r.z1 - r.z0) * scale);
      if (!(sp && (sp.park || sp.landmark !== undefined))) {   // building footprints hint
        g.fillStyle = '#5b616c';
        g.fillRect(px(r.x0 + 6), pz(r.z0 + 6), (r.x1 - r.x0 - 12) * scale, 14 * scale);
        g.fillRect(px(r.x0 + 6), pz(r.z1 - 20), (r.x1 - r.x0 - 12) * scale, 14 * scale);
      }
    }
    g.fillStyle = '#c4c9d1';
    for (let k = -K; k <= K; k++) {
      g.fillRect(px(k * B - W / 2), pz(-HALF - W / 2), W * scale, (HALF * 2 + W) * scale);
      g.fillRect(px(-HALF - W / 2), pz(k * B - W / 2), (HALF * 2 + W) * scale, W * scale);
    }
    g.fillStyle = '#f3e3a6'; g.fillRect(px(-W / 2), pz(-HALF - W / 2), W * scale, (HALF * 2 + W) * scale);   // Amir Temur avenue
    for (const L of this.landmarks) {
      g.fillStyle = LANDMARK_COLORS[L.idx];
      g.beginPath(); g.arc(px(L.x), pz(L.z), 7, 0, Math.PI * 2); g.fill();
    }
    g.fillStyle = '#f2c94c'; g.beginPath(); g.arc(px(-B / 2), pz(-B / 2), 7, 0, Math.PI * 2); g.fill(); // Temur monument
    this.mmStatic = c;
    const el = document.getElementById('minimap');
    this.mmCtx = el ? el.getContext('2d') : null;
    if (el) { el.width = 256; el.height = 256; }
  }

  // ------------------------------------------------------------ enter / exit
  enter(def) {
    this.build();
    this.root.visible = true;
    this.d.world.setVisible(false);
    this.setDay(true);
    const player = this.d.getPlayer();
    player.setInterior(false);
    if (player.setDaylight) player.setDaylight(true);
    document.body.classList.remove('cockpit');
    // start on the avenue in the right-hand lane heading north: the TV tower ahead on the right
    this.state = {
      x: LANE[1], z: 250, yaw: 0, v: 0, steer: 0, nitro: 1, nitroOn: false, dist: 0, latV: 0,
      pitch: 0, pitchV: 0, roll: 0, rollV: 0, bumpCd: 0, spin: 0, def,
      y: 0, vy: 0, altT: 0, fly: 0,                 // flying car (AERO ION)
    };
    this.camPos = new THREE.Vector3(LANE[1], 3, 258);
    this.camOff = null;
    this.camLook = new THREE.Vector3(LANE[1], 1, 240);
    this.d.pt.reset();
    player.group.position.set(this.state.x, 0, this.state.z);
    player.group.rotation.set(0, 0, 0);
    this.spawnTraffic();
    const mm = document.getElementById('minimap');
    mm.classList.remove('hidden');
    mm.classList.add('round');
    this.envTick = 0;
  }

  exit() {
    this.root.visible = false;
    this.d.world.setVisible(true);
    for (const c of this.cars) c.mesh.visible = false;
    const mm = document.getElementById('minimap');
    mm.classList.add('hidden');
    mm.classList.remove('round');
    const player = this.d.getPlayer();
    if (player && player.setDaylight) player.setDaylight(false);
    this.setDay(false);
  }

  // switch the shared scene between the night highway look and a sunny Tashkent afternoon
  setDay(on) {
    const d = this.d, scene = this.scene, sun = d.moon, hemi = d.hemi, r = d.renderer;
    if (on === !!this.day) return;
    this.day = on;
    const sh = sun.shadow;
    if (on) {
      this.saved = {
        fog: scene.fog, env: scene.environment, exp: r.toneMappingExposure,
        hemi: [hemi.color.clone(), hemi.groundColor.clone(), hemi.intensity], sun: [sun.color.clone(), sun.intensity],
        cam: { left: sh.camera.left, right: sh.camera.right, top: sh.camera.top, bottom: sh.camera.bottom, far: sh.camera.far },
        map: sh.mapSize.x, bloom: [d.bloom.strength, d.bloom.threshold],
        sky: d.world.sky.visible, stars: d.world.stars.visible,
      };
      scene.fog = new THREE.FogExp2(0xc9d6e2, 0.00105);
      hemi.color.set(0xd6e6ff); hemi.groundColor.set(0x7c6a52); hemi.intensity = 1.05;
      sun.color.set(0xffdcaa); sun.intensity = 4.2;
      Object.assign(sh.camera, { left: -70, right: 70, top: 70, bottom: -70, far: 420 });
      sh.camera.updateProjectionMatrix();
      sh.mapSize.set(d.mobile ? 1024 : 2048, d.mobile ? 1024 : 2048);
      if (sh.map) { sh.map.dispose(); sh.map = null; }
      r.toneMappingExposure = 0.92;
      d.bloom.strength = 0.12; d.bloom.threshold = 0.98;
      d.world.sky.visible = false; d.world.stars.visible = false;
      d.setHeadlight(false);
      for (const L of d.lampLights) L.intensity = 0;
      // live reflections of the street for the car paint (and everything else that is shiny)
      if (!this.cubeRT) {
        this.cubeRT = new THREE.WebGLCubeRenderTarget(d.mobile ? 64 : 128, { type: THREE.HalfFloatType });
        this.cubeCam = new THREE.CubeCamera(0.5, 2000, this.cubeRT);
      }
      scene.environment = this.cubeRT.texture;
    } else {
      const v = this.saved;
      if (!v) return;
      scene.fog = v.fog; scene.environment = v.env; r.toneMappingExposure = v.exp;
      hemi.color.copy(v.hemi[0]); hemi.groundColor.copy(v.hemi[1]); hemi.intensity = v.hemi[2];
      sun.color.copy(v.sun[0]); sun.intensity = v.sun[1];
      Object.assign(sh.camera, v.cam); sh.camera.updateProjectionMatrix();
      sh.mapSize.set(v.map, v.map);
      if (sh.map) { sh.map.dispose(); sh.map = null; }
      d.bloom.strength = v.bloom[0]; d.bloom.threshold = v.bloom[1];
      d.world.sky.visible = v.sky; d.world.stars.visible = v.stars;
      d.setHeadlight(true);
    }
  }

  // re-render the reflection cube around the car every few frames
  updateReflections() {
    if (!this.cubeCam) return;
    this.envTick = (this.envTick || 0) - 1;
    if (this.envTick > 0) return;
    this.envTick = this.d.mobile ? 12 : 4;
    const d = this.d, r = d.renderer, s = this.state, player = d.getPlayer();
    player.group.visible = false;
    const auto = r.shadowMap.autoUpdate;
    r.shadowMap.autoUpdate = false;
    this.cubeCam.position.set(s.x, s.y + 1.1, s.z);
    this.cubeCam.update(r, this.scene);
    r.shadowMap.autoUpdate = auto;
    player.group.visible = true;
  }

  // ------------------------------------------------------------ traffic
  spawnTraffic() {
    const n = this.d.mobile ? 18 : 28;
    while (this.cars.length < n) {
      const c = createUzCar(pickUzType());
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
      // traffic lights: stop at the line on red, and on yellow unless too close to stop
      const next = c.dir > 0 ? Math.ceil((c.pos + 0.5) / B) * B : Math.floor((c.pos - 0.5) / B) * B;
      if (Math.abs(next) <= HALF) {
        const stopAt = next - c.dir * (W / 2 + 2.6 + c.halfL);
        const dist = (stopAt - c.pos) * c.dir;
        if (dist > -0.5 && dist < 50) {
          const kk = Math.round(next / B);
          const st = c.axis === 'ns' ? this.lightState(c.line, kk, 'ns') : this.lightState(kk, c.line, 'ew');
          if (st === 'r' || (st === 'y' && dist > c.speed * 1.3)) limit = Math.min(limit, Math.max(0, dist * 0.6 - 0.2));
        }
      }
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
      if (c.setDetail) c.setDetail(Math.abs(c.x - s.x) + Math.abs(c.z - s.z) < 110);   // fewer parts far away
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
    this.updateSignals(dt);
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

    // ---- the sun's shadow box follows the player (snapped to texels so shadows don't shimmer)
    const cx = s.x + fx * 25, cz = s.z + fz * 25;
    const snap = 140 / (this.d.mobile ? 1024 : 2048);
    const sx = Math.round(cx / snap) * snap, sz = Math.round(cz / snap) * snap;
    d.moon.position.set(sx + SUN_DIR.x * 200, SUN_DIR.y * 200, sz + SUN_DIR.z * 200);
    d.moon.target.position.set(sx, 0, sz);
    d.moon.target.updateMatrixWorld();
    for (const L of this.landmarks) for (const b of L.obj.userData.blinkers) b.visible = Math.sin(d.time() * 3.2) > 0.2;

    // ---- camera
    this.updateCamera(dt, fx, fz);
    this.sky.position.copy(d.camera.position);
    this.updateReflections();

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
    const back = (look ? -1 : 1) * (6.1 + sf * 1.3);
    const rx = -fz, rz = fx;                         // the car's right-hand side
    const left = look ? 0 : 1.15;                    // camera sits a little to the left of the car
    // smooth the camera's OFFSET from the car (not its world position), so it never falls
    // behind at speed; the offset swings around smoothly when the car turns
    const targetOff = new THREE.Vector3(-fx * back * (1 + s.fly * 0.25) - rx * left, 2.15 + sf * 0.3 + s.fly * 0.8, -fz * back * (1 + s.fly * 0.25) - rz * left);
    if (!this.camOff || look !== this.lookWas) { this.camOff = targetOff.clone(); this.lookWas = look; }
    this.camOff.lerp(targetOff, 1 - Math.exp(-dt * 5));
    this.camPos.set(s.x + this.camOff.x, s.y + this.camOff.y, s.z + this.camOff.z);
    this.camLook.set(s.x + fx * 9 * (look ? -1 : 1) + rx * 0.35, s.y + 1.05, s.z + fz * 9 * (look ? -1 : 1) + rz * 0.35);
    // keep the camera out of buildings: pull in if the camera point is inside a block
    const pull = this.blocks.find((r) => this.camPos.y < r.h && this.camPos.x > r.x0 && this.camPos.x < r.x1 && this.camPos.z > r.z0 && this.camPos.z < r.z1);
    if (pull) this.camPos.lerp(new THREE.Vector3(s.x, this.camPos.y + 0.5, s.z), 0.5);
    const shake = d.shakeAmount();
    cam.position.set(this.camPos.x + (Math.random() - 0.5) * shake * 0.3, this.camPos.y + (Math.random() - 0.5) * shake * 0.2, this.camPos.z);
    cam.lookAt(this.camLook);
    d.setFov(58 + sf * 12 + (s.nitroOn ? 8 : 0), dt);
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
    const g = this.mmCtx, { S, scale, view } = this.mm, s = this.state;
    const D = g.canvas.width, R = D / 2, k = R / view / scale;
    g.clearRect(0, 0, D, D);
    g.save();
    g.beginPath(); g.arc(R, R, R - 2, 0, Math.PI * 2); g.clip();
    g.fillStyle = '#2a2f38'; g.fillRect(0, 0, D, D);
    // heading-up: turn the map so the car's direction points to the top
    g.translate(R, R);
    g.rotate(s.yaw);
    g.scale(k, k);
    g.translate(-(S / 2 + s.x * scale), -(S / 2 + s.z * scale));
    g.drawImage(this.mmStatic, 0, 0);
    g.fillStyle = '#ffffff';
    for (const c of this.cars) g.fillRect(S / 2 + c.x * scale - 2, S / 2 + c.z * scale - 2, 4, 4);
    g.restore();
    // ring + north marker
    g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = 4;
    g.beginPath(); g.arc(R, R, R - 3, 0, Math.PI * 2); g.stroke();
    const nx = R + Math.sin(s.yaw) * (R - 18), ny = R - Math.cos(s.yaw) * (R - 18);
    g.fillStyle = '#ffffff'; g.font = 'bold 22px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('N', nx, ny);
    // the car: yellow arrow in the middle
    g.fillStyle = '#ffd400'; g.strokeStyle = '#3a2f00'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(R, R - 16); g.lineTo(R + 11, R + 12); g.lineTo(R, R + 6); g.lineTo(R - 11, R + 12); g.closePath(); g.fill(); g.stroke();
  }
}

export const CITY_LANDMARK_LABELS = LANDMARK_LABELS;
