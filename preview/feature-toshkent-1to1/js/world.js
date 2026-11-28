// Endless night-city highway. The player stays at z = 0 and the world scrolls
// towards +z; objects that fall behind the camera are recycled ahead.
import * as THREE from 'three';
import { LANDMARK_BUILDERS, SIGN_TEXTS, createTrees, flagTexture, panelTexture, glassTexture, textTexture } from './tashkent.js?v=72abeb68';
import { setTrafficPalette } from './carModels.js?v=72abeb68';

const ROAD_LEN = 900;
const ROAD_TILE = 24;          // metres covered by one road texture tile
const ROAD_Z0 = 120;           // road starts behind the camera
const BARRIER_X = 9.45;

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function roadTexture() {
  return canvasTex(512, 1024, (ctx, w, h) => {
    const ppm = w / 18;
    ctx.fillStyle = '#2c2f38';
    ctx.fillRect(0, 0, w, h);
    // asphalt grain
    for (let i = 0; i < 26000; i++) {
      const v = 34 + Math.random() * 44;
      ctx.fillStyle = `rgba(${v},${v},${v + 4},${0.35 + Math.random() * 0.4})`;
      ctx.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 1.5, 1 + Math.random() * 1.5);
    }
    // tyre tracks (slightly darker, polished)
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    for (const lane of [3, 7, 11, 15]) for (const off of [-1.0, 1.0]) ctx.fillRect((lane + off) * ppm - 0.35 * ppm, 0, 0.7 * ppm, h);
    // shoulders
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(0, 0, ppm, h);
    ctx.fillRect(w - ppm, 0, ppm, h);
    // edge lines (solid)
    ctx.fillStyle = '#d8dde6';
    ctx.fillRect(1 * ppm - 0.1 * ppm, 0, 0.2 * ppm, h);
    ctx.fillRect(17 * ppm - 0.1 * ppm, 0, 0.2 * ppm, h);
    // lane dividers (dashed: 4 m line, 8 m gap)
    const ppmY = h / ROAD_TILE;
    for (const lx of [5, 9, 13]) {
      for (let y = 0; y < ROAD_TILE; y += 12) {
        ctx.fillStyle = '#e8ecf2';
        ctx.fillRect(lx * ppm - 0.08 * ppm, y * ppmY, 0.16 * ppm, 4 * ppmY);
      }
    }
  });
}

function windowTexture(palette) {
  return canvasTex(128, 256, (ctx, w, h) => {
    ctx.fillStyle = '#0b0e16';
    ctx.fillRect(0, 0, w, h);
    const cols = 8, rows = 16;
    const cw = w / cols, rh = h / rows;
    for (let r = 0; r < rows; r++) {
      // occasional fully-lit or dark floors for variety
      const floorBias = Math.random();
      for (let c = 0; c < cols; c++) {
        const lit = Math.random() < (floorBias > 0.85 ? 0.9 : floorBias < 0.15 ? 0.05 : 0.32);
        if (lit) {
          const col = palette[Math.floor(Math.random() * palette.length)];
          const k = 0.55 + Math.random() * 0.45;
          ctx.fillStyle = `rgb(${col[0] * k | 0},${col[1] * k | 0},${col[2] * k | 0})`;
        } else {
          ctx.fillStyle = `rgb(${18 + Math.random() * 10 | 0},${22 + Math.random() * 10 | 0},${32 + Math.random() * 12 | 0})`;
        }
        ctx.fillRect(c * cw + 2, r * rh + 3, cw - 4, rh - 5);
      }
    }
  });
}

export class World {
  constructor(scene, renderer, opts = {}) {
    this.scene = scene;
    this.opts = opts;
    // everything of the highway lives in `root`, so the city mode can hide it in one go
    // (sky, stars and the real street-light pool stay in the scene and are shared)
    this.root = new THREE.Group();
    scene.add(this.root);
    this.aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    this.time = 0;
    this.buildSky();
    this.buildGround();
    this.buildRoad();
    this.buildBarriers();
    this.buildLamps();
    this.buildBuildings();
    this.buildGantries();
    this.buildSpeedCues();
    this.buildTashkent();
    this.theme = 'neon';
    this.gantryTop = 8.65;
  }

  // ---------- TOSHKENT map extras (hidden on the neon map) ----------
  buildTashkent() {
    // facades: muted panel blocks + glass towers
    this.panelTex = ['#4a443b', '#3d4550', '#4a3e3a', '#4d4b45', '#3f4943'].map((c) => {
      const t = panelTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = this.aniso; return t;
    });
    this.glassTex = glassTexture();
    this.glassTex.wrapS = this.glassTex.wrapT = THREE.RepeatWrapping;
    // plane trees along both sidewalks (two rows per side), instanced
    this.treeSpacing = 9;
    this.treeRows = [-16.8, -10.8, 10.8, 16.8];
    this.treesPerRow = Math.ceil(this.cueSpan / this.treeSpacing);
    const t = createTrees(this.treeRows.length * this.treesPerRow);
    this.trees = t;
    this.treeScale = Array.from({ length: this.treeRows.length * this.treesPerRow }, () => 0.75 + Math.random() * 0.35);
    this.treeJitter = Array.from({ length: this.treeRows.length * this.treesPerRow }, () => (Math.random() - 0.5) * 3);
    this.treePhase = 0;
    this.root.add(t.trunks, t.crowns);
    // landmarks are built lazily and reused
    this.landmarkCache = new Map();
    this.activeLandmarks = [];
    this.lmIndex = 0;
    this.lmCooldown = 120;
    this.lmSide = 1;
    this.setTashkentVisible(false);
  }

  setTashkentVisible(on) {
    this.trees.trunks.visible = this.trees.crowns.visible = on;
    for (const f of this.flags) f.visible = on;
    for (const g of this.gantries) {
      for (const m of g.userData.neon) m.visible = !on;
      g.userData.sign.visible = on;
    }
    for (const L of this.activeLandmarks) L.visible = false;
    this.activeLandmarks.length = 0;
  }

  // 'neon' or 'tashkent'
  setTheme(theme) {
    this.theme = theme === 'tashkent' ? 'tashkent' : 'neon';
    const tk = this.theme === 'tashkent';
    const u = this.sky.material.uniforms;
    u.top.value.setHex(tk ? 0x060b1e : 0x050a1f);
    u.mid.value.setHex(tk ? 0x172150 : 0x121b48);
    u.horizon.value.setHex(tk ? 0x4c3150 : 0x3b2c70);
    u.glow.value.setHex(tk ? 0x7a4030 : 0x5c3070);
    // sodium-orange street lights in Tashkent, white-warm on the neon map
    this.lampHeadMat.color.set(tk ? 0xffa850 : 0xffd7a0).multiplyScalar(3.2);
    this.lampPoolMat.color.set(tk ? 0xff9238 : 0xffb066);
    for (const L of this.lampLights) L.color.set(tk ? 0xff9e48 : 0xffc68a);
    this.barrierNeon.color.set(tk ? 0xfff2c0 : 0x00d4ff).multiplyScalar(tk ? 1.4 : 2.6);
    this.gantryTop = tk ? 10.6 : 8.65;
    setTrafficPalette(this.theme);
    this.setTashkentVisible(tk);
    if (tk) for (const g of this.gantries) this.setGantrySign(g);
    this.lmCooldown = 120;
    // rebuild the skyline in the new style
    for (const s of [-1, 1]) {
      this.frontier[s] = 70;
      for (const b of this.buildings[s]) this.placeBuilding(b, s);
    }
  }

  // Build every landmark once (hidden) so their shaders compile at load time, not mid-race
  prebuildLandmarks() {
    LANDMARK_BUILDERS.forEach((build, idx) => {
      if (this.landmarkCache.has(idx)) return;
      const L = build();
      L.userData.blinkers = [];
      L.traverse((o) => { if (o.userData && o.userData.blink) L.userData.blinkers.push(o); });
      L.position.set(0, -1000, 0);
      this.landmarkCache.set(idx, L);
      this.root.add(L);
    });
    const all = [...this.landmarkCache.values()];
    all.forEach((L) => { L.visible = true; });
    return () => all.forEach((L) => { if (!this.activeLandmarks.includes(L)) L.visible = false; });
  }

  spawnLandmark(s) {
    const idx = this.lmIndex++ % LANDMARK_BUILDERS.length;
    let L = this.landmarkCache.get(idx);
    if (!L) {
      L = LANDMARK_BUILDERS[idx]();
      L.userData.blinkers = [];
      L.traverse((o) => { if (o.userData && o.userData.blink) L.userData.blinkers.push(o); });
      this.landmarkCache.set(idx, L);
      this.root.add(L);
    }
    const w = L.userData.width;
    const z = this.frontier[s] - w / 2;
    this.frontier[s] -= w + 12;
    L.position.set(s * (18 + L.userData.setback), 0, z);
    L.rotation.y = s > 0 ? 0 : Math.PI;           // front faces the road
    L.visible = true;
    this.activeLandmarks.push(L);
    this.lmCooldown = 380 + Math.random() * 220;
    this.lmSide = -this.lmSide;
  }

  updateTrees(dz) {
    this.treePhase = (this.treePhase + dz) % this.treeSpacing;
    const m = this._m, q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3();
    let i = 0;
    for (const x of this.treeRows) {
      for (let k = 0; k < this.treesPerRow; k++) {
        const s = this.treeScale[i];
        p.set(x + this.treeJitter[i] * 0.15, 0.25, this.cueZ0 - k * this.treeSpacing + this.treePhase + this.treeJitter[i]);
        sc.set(s, s, s);
        m.compose(p, q, sc);
        this.trees.trunks.setMatrixAt(i, m);
        this.trees.crowns.setMatrixAt(i, m);
        i++;
      }
    }
    this.trees.trunks.instanceMatrix.needsUpdate = true;
    this.trees.crowns.instanceMatrix.needsUpdate = true;
  }

  // Close-range, evenly spaced objects are what the eye uses to judge speed:
  // amber reflectors on both barriers every 8 m and lit road studs on the lane lines every 12 m.
  // Both are single InstancedMeshes, so they cost two draw calls in total.
  buildSpeedCues() {
    this.cueSpan = 440;
    this.cueZ0 = 40;
    this.cuePhase = 0;
    this.refSpacing = 8;
    this.studSpacing = 12;
    const nRef = Math.ceil(this.cueSpan / this.refSpacing);
    const nStud = Math.ceil(this.cueSpan / this.studSpacing);
    this.reflectors = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.07, 0.12, 0.26),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.7, 0.2).multiplyScalar(2.4) }),
      nRef * 2,
    );
    this.studs = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.18, 0.05, 0.18),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(0.75, 0.95, 1.0).multiplyScalar(1.8) }),
      nStud * 3,
    );
    this.reflectors.frustumCulled = false;
    this.studs.frustumCulled = false;
    this.nRef = nRef; this.nStud = nStud;
    this._m = new THREE.Matrix4();
    this.root.add(this.reflectors, this.studs);
    this.updateSpeedCues(0);
  }

  updateSpeedCues(dz) {
    this.cuePhase = (this.cuePhase + dz) % (this.refSpacing * this.studSpacing);
    const m = this._m;
    let i = 0;
    const rp = this.cuePhase % this.refSpacing;
    for (const s of [-1, 1]) {
      for (let k = 0; k < this.nRef; k++) {
        m.makeTranslation(s * (BARRIER_X - 0.27), 0.55, this.cueZ0 - k * this.refSpacing + rp);
        this.reflectors.setMatrixAt(i++, m);
      }
    }
    i = 0;
    const sp = this.cuePhase % this.studSpacing;
    for (const x of [-4, 0, 4]) {
      for (let k = 0; k < this.nStud; k++) {
        m.makeTranslation(x, 0.025, this.cueZ0 - k * this.studSpacing + sp);
        this.studs.setMatrixAt(i++, m);
      }
    }
    this.reflectors.instanceMatrix.needsUpdate = true;
    this.studs.instanceMatrix.needsUpdate = true;
  }

  // ---------- sky ----------
  buildSky() {
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: {
        top: { value: new THREE.Color(0x050a1f) },
        mid: { value: new THREE.Color(0x121b48) },
        horizon: { value: new THREE.Color(0x3b2c70) },
        glow: { value: new THREE.Color(0x5c3070) },
      },
      vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform vec3 top; uniform vec3 mid; uniform vec3 horizon; uniform vec3 glow; varying vec3 vDir;
        void main(){ float h = vDir.y;
          vec3 c = mix(horizon, mid, smoothstep(0.0, 0.22, h));
          c = mix(c, top, smoothstep(0.22, 0.75, h));
          c += glow * exp(-abs(h) * 14.0) * 0.6;
          gl_FragColor = vec4(c, 1.0); }`,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(1400, 32, 16), mat);
    this.sky.renderOrder = -10;
    this.scene.add(this.sky);

    // stars
    const n = 1400, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const th = Math.random() * Math.PI * 2, y = 0.08 + Math.random() * 0.92;
      const r = Math.sqrt(1 - y * y);
      pos.set([Math.cos(th) * r * 1300, y * 1300, Math.sin(th) * r * 1300], i * 3);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xbfd8ff, size: 1.6, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.8, depthWrite: false }));
    this.scene.add(this.stars);

    // moon
    const moon = new THREE.Mesh(new THREE.SphereGeometry(32, 32, 16), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xdfe8ff).multiplyScalar(1.6), fog: false }));
    moon.position.set(-420, 380, -1050);
    this.sky.add(moon);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTexture(), color: 0x6f8fff, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, fog: false, depthWrite: false }));
    halo.scale.set(320, 320, 1);
    halo.position.copy(moon.position);
    this.sky.add(halo);
  }

  glowTexture() {
    if (!this._glow) {
      this._glow = canvasTex(128, 128, (ctx, w) => {
        const g = ctx.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
        g.addColorStop(0, 'rgba(255,255,255,1)');
        g.addColorStop(0.35, 'rgba(255,255,255,0.35)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g; ctx.fillRect(0, 0, w, w);
      });
    }
    return this._glow;
  }

  // ---------- ground / road ----------
  buildGround() {
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(3000, 3000).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: 0x07090f, roughness: 0.95 }),
    );
    ground.position.y = -0.05;
    ground.receiveShadow = true;
    this.root.add(ground);

    const walk = new THREE.MeshStandardMaterial({ color: 0x1a1d26, roughness: 0.85 });
    for (const s of [-1, 1]) {
      const sw = new THREE.Mesh(new THREE.BoxGeometry(8, 0.25, ROAD_LEN), walk);
      sw.position.set(s * 14, 0.12, ROAD_Z0 - ROAD_LEN / 2);
      sw.receiveShadow = true;
      this.root.add(sw);
    }
  }

  buildRoad() {
    const tex = roadTexture();
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(1, ROAD_LEN / ROAD_TILE);
    tex.anisotropy = this.aniso;
    this.roadTex = tex;
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.42, metalness: 0.2, envMapIntensity: 0.9 });
    const road = new THREE.Mesh(new THREE.PlaneGeometry(18, ROAD_LEN).rotateX(-Math.PI / 2), mat);
    road.position.set(0, 0, ROAD_Z0 - ROAD_LEN / 2);
    road.receiveShadow = true;
    this.root.add(road);
    this.roadOffset = 0;
  }

  buildBarriers() {
    const concrete = new THREE.MeshStandardMaterial({ color: 0x4d525e, roughness: 0.8 });
    const neon = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x00d4ff).multiplyScalar(2.6) });
    this.barrierNeon = neon;
    for (const s of [-1, 1]) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.9, ROAD_LEN), concrete);
      b.position.set(s * BARRIER_X, 0.45, ROAD_Z0 - ROAD_LEN / 2);
      b.receiveShadow = true;
      const strip = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.07, ROAD_LEN), neon);
      strip.position.set(s * (BARRIER_X - 0.26), 0.78, ROAD_Z0 - ROAD_LEN / 2);
      this.root.add(b, strip);
    }
  }

  // ---------- street lamps ----------
  buildLamps() {
    this.lamps = [];
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x2a2e38, metalness: 0.7, roughness: 0.4 });
    const headMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffd7a0).multiplyScalar(3.2) });
    const housingMat = new THREE.MeshStandardMaterial({ color: 0x1c2029, metalness: 0.6, roughness: 0.4 });
    const poolMat = new THREE.MeshBasicMaterial({ map: this.glowTexture(), color: 0xffb066, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false });
    const poleGeo = new THREE.CylinderGeometry(0.1, 0.16, 9, 10);
    const armGeo = new THREE.BoxGeometry(2.8, 0.12, 0.14);
    const headGeo = new THREE.BoxGeometry(0.9, 0.04, 0.34);
    const housingGeo = new THREE.BoxGeometry(1.1, 0.18, 0.46);
    const poolGeo = new THREE.PlaneGeometry(12, 12).rotateX(-Math.PI / 2);
    this.lampHeadMat = headMat;
    this.lampPoolMat = poolMat;
    // Uzbekistan flags on every second lamp post (Tashkent map)
    this.flags = [];
    const flagMat = new THREE.MeshLambertMaterial({ map: flagTexture(), side: THREE.DoubleSide });
    const flagGeo = new THREE.PlaneGeometry(1.8, 0.9).translate(0.9, 0, 0);
    const perSide = 16, spacing = 40;
    this.lampSpan = perSide * spacing;
    for (const s of [-1, 1]) {
      for (let i = 0; i < perSide; i++) {
        const g = new THREE.Group();
        const pole = new THREE.Mesh(poleGeo, poleMat); pole.position.y = 4.5;
        const arm = new THREE.Mesh(armGeo, poleMat); arm.position.set(-s * 1.35, 8.95, 0);
        const housing = new THREE.Mesh(housingGeo, housingMat); housing.position.set(-s * 2.6, 8.95, 0);
        const head = new THREE.Mesh(headGeo, headMat); head.position.set(-s * 2.6, 8.84, 0);
        const pool = new THREE.Mesh(poolGeo, poolMat); pool.position.set(-s * 2.6, 0.02, 0); pool.renderOrder = 1;
        g.add(pole, arm, housing, head, pool);
        if (i % 2 === 0) {
          const flag = new THREE.Mesh(flagGeo, flagMat);
          flag.position.set(0, 6.2, 0);
          flag.rotation.y = s > 0 ? Math.PI / 2 : -Math.PI / 2;   // flies away from the road
          flag.visible = false;
          g.add(flag);
          this.flags.push(flag);
        }
        g.position.set(s * BARRIER_X, 0.9, 40 - i * spacing - (s > 0 ? spacing / 2 : 0));
        pool.position.y = -0.88;
        this.root.add(g);
        this.lamps.push(g);
      }
    }
    // Real lights for the lamps near the player. The number of lights never changes,
    // so shaders are compiled once and there is no stutter when lights move.
    this.lampLights = [];
    for (let i = 0; i < (this.opts.lampLights ?? 8); i++) {
      const L = new THREE.PointLight(0xffc68a, 260, 34, 2);
      this.scene.add(L);
      this.lampLights.push(L);
    }
  }

  setVisible(on) { this.root.visible = on; }

  followCamera(camera) { this.sky.position.copy(camera.position); this.stars.position.copy(camera.position); }

  // graphics setting: how many street lamps cast real light (hidden lights cost nothing)
  setLampLightCount(n) {
    this.lampLights.forEach((L, i) => { L.visible = i < n; });
  }

  placeLampLights() {
    const near = this.lamps
      .filter((l) => l.position.z < 30 && l.position.z > -150)
      .sort((a, b) => Math.abs(a.position.z + 25) - Math.abs(b.position.z + 25));
    this.lampLights.filter((L) => L.visible).forEach((L, i) => {
      const l = near[i];
      if (!l) { L.intensity = 0; return; }
      const s = Math.sign(l.position.x);
      L.intensity = 260;
      L.position.set(l.position.x - s * 2.6, l.position.y + 7.7, l.position.z);
    });
  }

  // ---------- buildings ----------
  buildBuildings() {
    const palettes = [
      [[255, 214, 150], [255, 190, 120], [255, 236, 200]],
      [[170, 215, 255], [210, 235, 255], [120, 190, 255]],
      [[255, 214, 150], [170, 215, 255], [255, 120, 220]],
      [[200, 255, 250], [255, 230, 180], [150, 170, 255]],
    ];
    this.winTex = palettes.map((p) => {
      const t = windowTexture(p);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.anisotropy = this.aniso;
      return t;
    });
    this.neonMats = [0x00d4ff, 0xff2bd6, 0x9d4dff, 0xffb020, 0x00ffa2].map((c) => new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(3) }));
    this.redLight = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff2020).multiplyScalar(4) });
    this.boxGeo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
    this.buildings = { '-1': [], '1': [] };
    this.frontier = { '-1': 70, '1': 70 };
    for (const s of [-1, 1]) {
      for (let i = 0; i < (this.opts.buildingsPerSide ?? 30); i++) {
        const b = this.makeBuilding();
        this.buildings[s].push(b);
        this.placeBuilding(b, s);
      }
    }
  }

  makeBuilding() {
    const styleIndex = Math.floor(Math.random() * this.winTex.length);
    const tex = this.winTex[styleIndex].clone();
    // Unlit: at night a building is its lit windows. Skipping per-pixel lighting on these huge
    // surfaces is one of the biggest GPU savings on phones (no 8-light loop per pixel).
    const mat = new THREE.MeshBasicMaterial({ map: tex, color: 0xffffff });
    const group = new THREE.Group();
    const mesh = new THREE.Mesh(this.boxGeo, mat);
    mesh.receiveShadow = false;
    const neonV = new THREE.Mesh(this.boxGeo, this.neonMats[0]);
    const neonH = new THREE.Mesh(this.boxGeo, this.neonMats[0]);
    const antenna = new THREE.Mesh(this.boxGeo, new THREE.MeshStandardMaterial({ color: 0x222630 }));
    const beacon = new THREE.Mesh(this.boxGeo, this.redLight);
    group.add(mesh, neonV, neonH, antenna, beacon);
    this.root.add(group);
    return { group, mesh, mat, tex, styleIndex, neonV, neonH, antenna, beacon, w: 10, d: 10, h: 20 };
  }

  setGantrySign(g) {
    const [main, sub] = SIGN_TEXTS[g.userData.signIndex % SIGN_TEXTS.length];
    const key = main + '|' + sub;
    this.signCache = this.signCache || new Map();
    if (!this.signCache.has(key)) this.signCache.set(key, textTexture(main, { sub }));
    g.userData.sign.material.map = this.signCache.get(key);
    g.userData.sign.material.needsUpdate = true;
  }

  // Tashkent: long Soviet panel blocks (5 / 9 / 16 floors) and the odd glass tower
  placeTashkentBuilding(b, s) {
    const r = Math.random();
    let w, d, h, src;
    if (r < 0.08) { w = d = 18 + Math.random() * 8; h = 70 + Math.random() * 60; src = this.glassTex; }
    else {
      w = 24 + Math.random() * 34; d = 12 + Math.random() * 4;
      h = r < 0.5 ? 15 + Math.random() * 2 : r < 0.85 ? 27 + Math.random() * 3 : 46 + Math.random() * 4;
      src = this.panelTex[Math.floor(Math.random() * this.panelTex.length)];
    }
    const gap = 4 + Math.random() * 10;
    const z = this.frontier[s] - w / 2;
    this.frontier[s] -= w + gap;
    const x = s * (20 + d / 2 + Math.random() * 6);
    b.w = w; b.d = d; b.h = h;
    b.group.position.set(x, 0, z);
    b.mesh.scale.set(d, h, w);
    if (b.tex.source !== src.source) { b.tex.source = src.source; b.tex.needsUpdate = true; }
    b.tex.repeat.set(Math.max(1, Math.round(w / 18)), Math.max(1, Math.round(h / 36)));
    b.mat.color.setScalar(src === this.glassTex ? 1.2 : 0.95 + Math.random() * 0.3);
    // occasional shop sign at street level, no neon skyline
    b.neonV.visible = Math.random() < 0.18;
    if (b.neonV.visible) {
      b.neonV.material = this.neonMats[Math.floor(Math.random() * this.neonMats.length)];
      b.neonV.scale.set(0.3, 1.2, Math.min(10, w * 0.4));
      b.neonV.position.set(-s * (d / 2 + 0.2), 4, (Math.random() - 0.5) * w * 0.5);
    }
    b.neonH.visible = false;
    const tallEnough = h > 60;
    b.antenna.visible = b.beacon.visible = tallEnough;
    if (tallEnough) {
      b.antenna.scale.set(0.3, 6, 0.3); b.antenna.position.set(0, h, 0);
      b.beacon.scale.set(0.8, 0.8, 0.8); b.beacon.position.set(0, h + 6, 0);
    }
  }

  placeBuilding(b, s) {
    if (this.theme === 'tashkent') { this.placeTashkentBuilding(b, s); return; }
    const src = this.winTex[b.styleIndex ?? 0];
    if (b.tex.source !== src.source) { b.tex.source = src.source; b.tex.needsUpdate = true; }
    const w = 10 + Math.random() * 16;         // along z
    const d = 10 + Math.random() * 12;         // along x
    const tall = Math.random();
    const h = tall > 0.85 ? 70 + Math.random() * 60 : 14 + Math.random() * 46;
    const gap = 2 + Math.random() * 7;
    const z = this.frontier[s] - w / 2;
    this.frontier[s] -= w + gap;
    const x = s * (19 + d / 2 + Math.random() * 5);
    b.w = w; b.d = d; b.h = h;
    b.group.position.set(x, 0, z);
    b.mesh.scale.set(d, h, w);
    b.tex.repeat.set(Math.max(1, Math.round(w / 12)), Math.max(1, Math.round(h / 24)));
    b.mat.color.setScalar(1.1 + Math.random() * 0.8);   // values > 1 make some windows glow
    const faceX = -s * (d / 2 + 0.2);
    const nm = this.neonMats[Math.floor(Math.random() * this.neonMats.length)];
    // vertical neon strip
    b.neonV.visible = Math.random() < 0.45;
    if (b.neonV.visible) {
      const nh = h * (0.3 + Math.random() * 0.5);
      b.neonV.material = nm;
      b.neonV.scale.set(0.35, nh, 0.35);
      b.neonV.position.set(faceX, h * 0.15 + Math.random() * (h * 0.85 - nh) * 0.5, (Math.random() - 0.5) * w * 0.7);
    }
    // rooftop band
    b.neonH.visible = Math.random() < 0.4;
    if (b.neonH.visible) {
      b.neonH.material = this.neonMats[Math.floor(Math.random() * this.neonMats.length)];
      b.neonH.scale.set(0.3, 0.45, w * 0.92);
      b.neonH.position.set(faceX, h - 1.6, 0);
    }
    // antenna + beacon
    const tallEnough = h > 50;
    b.antenna.visible = b.beacon.visible = tallEnough;
    if (tallEnough) {
      const ah = 6 + Math.random() * 8;
      b.antenna.scale.set(0.3, ah, 0.3);
      b.antenna.position.set(0, h, 0);
      b.beacon.scale.set(0.8, 0.8, 0.8);
      b.beacon.position.set(0, h + ah, 0);
    }
  }

  // ---------- neon gantries ----------
  buildGantries() {
    this.gantries = [];
    const steel = new THREE.MeshStandardMaterial({ color: 0x1b1f29, metalness: 0.7, roughness: 0.35 });
    const neon = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x00d4ff).multiplyScalar(3.2) });
    const pink = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff2bd6).multiplyScalar(2.6) });
    for (let i = 0; i < 3; i++) {
      const g = new THREE.Group();
      for (const s of [-1, 1]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.5, 8.2, 0.5), steel);
        post.position.set(s * 10.3, 4.1, 0);
        const pn = new THREE.Mesh(new THREE.BoxGeometry(0.08, 7.6, 0.08), neon);
        pn.position.set(s * 10.04, 4.1, 0.26);
        g.add(post, pn);
      }
      const beam = new THREE.Mesh(new THREE.BoxGeometry(21.1, 0.7, 0.7), steel);
      beam.position.y = 8.2;
      const strip = new THREE.Mesh(new THREE.BoxGeometry(20.4, 0.08, 0.08), neon);
      strip.position.set(0, 7.82, 0.3);
      const strip2 = new THREE.Mesh(new THREE.BoxGeometry(20.4, 0.06, 0.06), pink);
      strip2.position.set(0, 8.58, 0.3);
      g.add(beam, strip, strip2);
      g.userData.neon = [strip, strip2, ...g.children.filter((c) => c.material === neon)];
      // Uzbek road sign (Tashkent map)
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(11, 2.75), new THREE.MeshBasicMaterial({ color: 0xd8d8d8 }));
      sign.position.set(-2.5, 9.25, 0.42);
      sign.visible = false;
      g.add(sign);
      g.userData.sign = sign;
      g.userData.signIndex = i;
      g.position.z = -150 - i * 320;
      this.root.add(g);
      this.gantries.push(g);
    }
  }

  // ---------- per-frame ----------
  update(dz, camera, dt = 0) {
    this.time += dt;
    // Road scroll via texture offset (keeps float precision forever)
    this.roadOffset = (this.roadOffset + dz / ROAD_TILE) % 1;
    this.roadTex.offset.y = this.roadOffset;

    for (const l of this.lamps) {
      l.position.z += dz;
      if (l.position.z > 50) l.position.z -= this.lampSpan;
    }
    this.placeLampLights();
    this.updateSpeedCues(dz);
    for (const g of this.gantries) {
      g.position.z += dz;
      if (g.position.z > 40) { g.position.z -= 960; g.userData.signIndex += 3; this.setGantrySign(g); }
    }
    if (this.theme === 'tashkent') {
      this.lmCooldown -= dz;
      for (let i = this.activeLandmarks.length - 1; i >= 0; i--) {
        const L = this.activeLandmarks[i];
        L.position.z += dz;
        if (L.position.z - L.userData.width / 2 > 150) { L.visible = false; this.activeLandmarks.splice(i, 1); }
      }
      this.updateTrees(dz);
    }
    for (const s of [-1, 1]) {
      this.frontier[s] += dz;
      for (const b of this.buildings[s]) {
        b.group.position.z += dz;
        if (b.group.position.z - b.w / 2 > 70) {
          if (this.theme === 'tashkent' && this.lmCooldown <= 0 && s === this.lmSide) this.spawnLandmark(s);
          this.placeBuilding(b, s);
        }
      }
      // never let the frontier get closer than the far range (e.g. after a long frame)
      if (this.frontier[s] > -420) this.frontier[s] = Math.min(this.frontier[s], -420);
    }
    // blinking aviation beacons
    const on = Math.sin(this.time * 3.2) > 0.2;
    this.redLight.color.setRGB(on ? 4 : 0.3, on ? 0.4 : 0.03, on ? 0.4 : 0.03);
    for (const L of this.activeLandmarks) for (const b of L.userData.blinkers) b.visible = on;

    if (camera) this.sky.position.copy(camera.position), this.stars.position.copy(camera.position);
  }
}
