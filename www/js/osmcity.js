// Real Tashkent from OpenStreetMap: streets, buildings, traffic lights, bus stops and metro
// entrances at their real places (data © OpenStreetMap contributors, ODbL; ground imagery
// contains modified Copernicus Sentinel-2 data). The map is split into 500 m cells that load
// around the car; the driving, camera, HUD and daylight come from the TOSHKENT SHAHAR mode.
//
// Coordinates: 1 unit = 1 m, x east, z south (north is -z, like the rest of the game).
import { SkidMarks } from './vehicle.js';
import { People, windSway } from './life.js';
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { CityMode, SUN_DIR } from './city.js';
import { createUzCar, pickUzType } from './uzcars.js';
import { daySky, facadeTexture } from './cityday.js';
import { LANDMARK_BUILDERS, hazratiImam, temurStatue, forumsPalace, chimes } from './tashkent.js';
import { buildCell, makeMaterials, WALK as WALK2 } from './osmbuild.js';
import { busStopParts } from './cityday.js';

const CELL = 500;
const BASE = 'map/';
export const MAP_VER = '20261128d';          // bump with every map rebuild: cells are cached by the browser
const ROAD_W = [5, 9, 14];               // small streets, collector roads, main roads (m)
const ROAD_Y = [0.03, 0.04, 0.05];
const WALK = 3.2;                        // sidewalk on each side of collector and main roads
const BUCKET = 25;                       // collision grid inside a cell
const WALLS = ['#e8e1d3', '#d9cfbd', '#efe9dc', '#cfc6b8', '#e3d6c0', '#d6d9dc', '#c9b9a2', '#e9dfcf', '#bfb3a3', '#f1ece2', '#c98f6c', '#dfe5e8'];
const ROOFS = ['#8f8a84', '#9a7b63', '#7d8288', '#a39b90', '#6f747a'];
const LIGHT = { r: new THREE.Color(5, 0.25, 0.15), y: new THREE.Color(5, 3.2, 0.3), g: new THREE.Color(0.3, 4.2, 1.4), off: new THREE.Color(0.07, 0.07, 0.08) };
const LABELS = { bus: 'Bekat', metro: 'Ⓜ Metro', entrance: 'Metro kirishi' };
// real places of two landmarks the OSM footprints don't show well
const TV_TOWER = [401, -3954];          // 41.3456 N, 69.2848 E

const hashStr = (x, z) => { let h = Math.imul((x * 73856093) ^ (z * 19349663), 2654435761) >>> 0; return h / 4294967296; };

function roadTexture(kind) {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = kind === 0 ? '#5a5b58' : '#45474b'; g.fillRect(0, 0, 64, 128);
  for (let i = 0; i < 260; i++) { const v = 60 + Math.random() * 50; g.fillStyle = `rgba(${v},${v},${v + 3},0.45)`; g.fillRect(Math.random() * 64, Math.random() * 128, 1.2, 1.2); }
  g.fillStyle = '#d9dcdf';
  if (kind === 2) { g.fillRect(4, 0, 2, 128); g.fillRect(58, 0, 2, 128); }   // edge lines
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.ClampToEdgeWrapping; t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

// yards and open ground: light concrete with a little grass, tiled every 20 m
function groundTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#a9a594'; g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 900; i++) {
    const v = Math.random();
    g.fillStyle = v < 0.25 ? 'rgba(96,128,64,0.35)' : `rgba(${150 + v * 60},${146 + v * 56},${132 + v * 50},0.35)`;
    g.fillRect(Math.random() * 128, Math.random() * 128, 2 + Math.random() * 4, 2 + Math.random() * 4);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

function labelSprite(text, color) {
  const c = document.createElement('canvas');
  const g = c.getContext('2d');
  g.font = 'bold 34px Arial, sans-serif';
  const w = Math.min(1000, Math.ceil(g.measureText(text).width) + 36);
  c.width = w; c.height = 56;
  g.font = 'bold 34px Arial, sans-serif';
  g.fillStyle = color; g.beginPath(); g.roundRect(0, 0, w, 56, 12); g.fill();
  g.fillStyle = '#fff'; g.textBaseline = 'middle'; g.fillText(text, 18, 30);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthWrite: false }));
  s.scale.set(w / 56 * 0.55, 0.55, 1);
  return s;
}

export class OsmCity extends CityMode {
  constructor(scene, deps) {
    super(scene, deps);
    this.cells = new Map();     // key -> { group, buildings, buckets, roads, objects, signals }
    this.pending = new Map();   // key -> 'loading' | data
    this.blocks = [];
    this.lanes = [];
    this.landmarks = [];
    this.nodes = new Map();     // road graph for traffic: "x,z" -> [{ seg, end }]
    this.signalList = [];
    this.ready = null;
    this.radius = 1;   // 3 x 3 cells (1.5 km) around the car
  }

  // ------------------------------------------------------------ one-time setup
  // map index + street models; retried, because a busy server can refuse a request now and then
  load() {
    if (this.index) return Promise.resolve(true);
    if (this.ready) return this.ready;
    const get = async (url) => {
      for (let i = 0; i < 6; i++) {
        try { const r = await fetch(url, { cache: i ? 'reload' : 'default' }); if (r.ok) return await r.json(); } catch (e) { /* retry */ }
        await new Promise((res) => setTimeout(res, 600 * (i + 1)));
      }
      throw new Error('map unavailable');
    };
    this.ready = Promise.all([get(BASE + 'index.json?v=' + MAP_VER), get(BASE + 'street-models.json')])
      .then(([index, models]) => { this.index = index; this.have = new Set(index.cells); this.models = models; return true; })
      .catch(() => { this.ready = null; return false; });
    return this.ready;
  }

  build() {
    if (this.built) return;
    this.built = true;
    const facade = new THREE.TextureLoader().load(BASE + 'facade.png');
    facade.colorSpace = THREE.SRGBColorSpace;
    facade.wrapS = facade.wrapT = THREE.RepeatWrapping;
    facade.anisotropy = 8;
    const styleTex = [['panel', '#e6e0d2'], ['panel', '#d5dadf'], ['brick', '#c98a5f'], ['brick', '#e0c08c'], ['band', '#eceae4'], ['arch', '#eee3cc']]
      .map(([st, c], i) => { const t = facadeTexture(st, c, i + 3); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; });
    this.mats0 = {
      wall: new THREE.MeshLambertMaterial({ map: facade, vertexColors: true }),
      walls: styleTex.map((t) => new THREE.MeshLambertMaterial({ map: t, vertexColors: true })),
      roof: new THREE.MeshLambertMaterial({ vertexColors: true }),
      road: [0, 1, 2].map((k) => new THREE.MeshStandardMaterial({ map: roadTexture(k), roughness: 0.75, envMapIntensity: 0.3, polygonOffset: true, polygonOffsetFactor: -1 - k, polygonOffsetUnits: -1 - k })),
      props: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.2 }),
      lamp: new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }),
      ground: new THREE.MeshLambertMaterial({ map: groundTexture(), color: 0xffffff }),
      walk: new THREE.MeshStandardMaterial({ color: 0xbab6ac, roughness: 0.9, envMapIntensity: 0.25, polygonOffset: true, polygonOffsetFactor: -0.5, polygonOffsetUnits: -0.5 }),
      trunk: windSway(new THREE.MeshLambertMaterial({ color: 0xb8ab92 }), 0.5),
      crown: windSway(new THREE.MeshLambertMaterial({ color: 0xffffff }), 1),
    };
    // v2 map: materials shared by every cell (osmbuild.js)
    this.busParts = busStopParts();
    this.mats = { ...makeMaterials(), lamp: this.mats0.lamp, ground: this.mats0.ground, trunk: this.mats0.trunk, crown: this.mats0.crown };
    this.mats.busSign = new THREE.MeshBasicMaterial({ map: this.busParts.signTexture, side: THREE.DoubleSide });
    this.mats.tin.side = THREE.DoubleSide;
    this.mats.kerb.side = THREE.DoubleSide;
    this.unitBox = new THREE.BoxGeometry(1, 1, 1);
    this.lampGeo = new THREE.SphereGeometry(0.5, 10, 6);
    this.lightOff = LIGHT.off;
    this.labelSprite = labelSprite;
    // one light street-tree shape shared by every cell (chinar-like: two lumps on a pale trunk)
    const lump = (r, x, y, z) => new THREE.IcosahedronGeometry(r, 1).translate(x, y, z);
    this.treeGeo = {
      trunk: new THREE.CylinderGeometry(0.16, 0.24, 4.2, 6).translate(0, 2.1, 0),
      crown: mergeGeometries([lump(2.1, 0, 5.4, 0), lump(1.5, 1.1, 5.0, 0.6), lump(1.4, -0.9, 6.0, -0.5)].map((g) => mergeVertices(g.deleteAttribute('normal').deleteAttribute('uv')))),
    };
    this.treeGeo.crown.computeVertexNormals();
    // plain ground everywhere, satellite tiles near the car
    this.mats.ground.map.repeat.set(4000, 4000);
    const base = new THREE.Mesh(new THREE.PlaneGeometry(80000, 80000).rotateX(-Math.PI / 2), this.mats.ground);
    base.position.y = -0.06;
    base.receiveShadow = true;
    this.root.add(base);
    this.base = base;
    this.groundTiles = new Map();
    this.groundLoader = new THREE.TextureLoader();
    this.sky = daySky(SUN_DIR);
    this.root.add(this.sky);
    this.landmarkSkip = [];
    this.maxAlt = 260;
    // the round minimap is drawn live from the loaded streets
    const el = document.getElementById('minimap');
    this.mmCtx = el ? el.getContext('2d') : null;
    if (el) { el.width = 256; el.height = 256; }
  }


  // landmarks at their real places (positions from OSM, see map/index.json); the footprints under
  // them are left out so the model and the map's own building don't overlap
  placeLandmarks() {
    if (this.landmarksPlaced || !this.index || !this.built) return;
    this.landmarksPlaced = true;
    const BUILD = { tv: LANDMARK_BUILDERS[0], minor: LANDMARK_BUILDERS[1], mustaqillik: LANDMARK_BUILDERS[2], kokaldosh: LANDMARK_BUILDERS[3],
      tcity: LANDMARK_BUILDERS[4], chorsu: LANDMARK_BUILDERS[5], museum: LANDMARK_BUILDERS[6], hotel: LANDMARK_BUILDERS[7], humo: LANDMARK_BUILDERS[8],
      hazrati: hazratiImam, temur_statue: temurStatue, forums: forumsPalace, chimes };
    this.landmarkSkip = [];
    for (const l of (this.index && this.index.landmarks) || []) {
      const make = BUILD[l.id];
      if (!make) continue;
      const obj = make();
      obj.position.set(l.x, 0, l.z);
      obj.rotation.y = l.rot || 0;
      obj.userData.blinkers = [];
      obj.traverse((o) => { if (o.userData && o.userData.blink) obj.userData.blinkers.push(o); });
      this.root.add(obj);
      this.landmarks.push({ obj, id: l.id, name: l.name, x: l.x, z: l.z });
      const r = (obj.userData.width || 30) * 0.75;
      this.landmarkSkip.push({ x: l.x, z: l.z, r2: r * r });
    }
  }

  // ------------------------------------------------------------ enter / exit
  enter(def, opts = {}) {
    this.build();
    this.root.visible = true;
    this.d.world.setVisible(false);
    this.setDay(true);
    const player = this.d.getPlayer();
    player.setInterior(false);
    if (player.setDaylight) player.setDaylight(true);
    document.body.classList.remove('cockpit');
    document.body.classList.add('osm-map');
    // a taxi shift starts in O'rikzor by the bazaar; the free city at the centre
    const sp = (this.index && (opts.taxi ? this.index.taxiSpawn || this.index.spawn : this.index.spawn)) || [-2.5, 6, 7, 2];
    this.state = {
      x: sp[0], z: sp[1], yaw: Math.atan2(-sp[2], -sp[3]), v: 0, steer: 0, nitro: def.nitro ? 1 : 0, nitroOn: false, dist: 0, latV: 0,
      pitch: 0, pitchV: 0, roll: 0, rollV: 0, bumpCd: 0, spin: 0, def, y: 0, vy: 0, altT: 0, fly: 0,
    };
    this.camPos = new THREE.Vector3(sp[0], 3, sp[1] + 8);
    this.camOff = null;
    this.camLook = new THREE.Vector3(sp[0], 1, sp[1]);
    this.d.pt.reset();
    player.group.position.set(this.state.x, 0, this.state.z);
    player.group.rotation.set(0, this.state.yaw, 0);
    for (const c of this.cars) c.mesh.visible = false;
    this.cars.length = 0;
    if (this.skids) this.skids.clear(); else this.skids = new SkidMarks(this.root);
    if (this.people) this.people.clear(); else this.people = new People(this.root, { mobile: this.d.mobile });
    const mm = document.getElementById('minimap');
    mm.classList.remove('hidden'); mm.classList.add('round');
    this.envTick = 0;
    this.camReset = true;
    this.focus = null;
    this.loadingShown = false;
    this.signalTime = 0;
    this.scene.fog.density = 0.0021;            // the map ends ~700 m out: fade it
    this.startedAt = performance.now();
  }

  exit() {
    super.exit();
    document.body.classList.remove('osm-map');
  }

  // ------------------------------------------------------------ streaming
  key(cx, cz) { return `${cx}_${cz}`; }

  updateCells() {
    const s = this.state;
    if (!this.have) { this.load(); return; }
    this.placeLandmarks();
    const cx = Math.floor(s.x / CELL), cz = Math.floor(s.z / CELL);
    const f = `${cx}_${cz}`;
    if (f !== this.focus) {
      this.focus = f;
      const R = this.radius;
      for (const [k, cell] of this.cells) {
        const [x, z] = k.split('_').map(Number);
        if (Math.abs(x - cx) > R + 1 || Math.abs(z - cz) > R + 1) this.unloadCell(k, cell);
      }
      const want = [];
      for (let dx = -R; dx <= R; dx++) for (let dz = -R; dz <= R; dz++) want.push([cx + dx, cz + dz, dx * dx + dz * dz]);
      want.sort((a, b) => a[2] - b[2]);
      for (const [x, z] of want) {
        const k = this.key(x, z);
        if (this.cells.has(k) || this.pending.has(k)) continue;
        if (!this.have || !this.have.has(k)) { this.cells.set(k, null); continue; }
        this.pending.set(k, 'loading');
        const tryLoad = (attempt) => fetch(`${BASE}cells/${k}.json?v=${MAP_VER}`, { cache: attempt ? 'reload' : 'default' })
          .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
          .then((data) => { if (this.pending.get(k) === 'loading') this.pending.set(k, data); })
          .catch(() => {
            if (attempt < 5 && this.pending.get(k) === 'loading') setTimeout(() => tryLoad(attempt + 1), 700 * (attempt + 1));
            else { this.pending.delete(k); this.focus = null; }        // try again on the next pass
          });
        tryLoad(0);
      }
      this.updateGround(cx, cz);
    }
    // build at most one finished download per frame (nearest first)
    let best = null, bd = Infinity;
    for (const [k, data] of this.pending) {
      if (data === 'loading') continue;
      const [x, z] = k.split('_').map(Number);
      const d2 = (x - cx) ** 2 + (z - cz) ** 2;
      if (d2 < bd) { bd = d2; best = k; }
    }
    if (best) { const data = this.pending.get(best); this.pending.delete(best); this.buildCell(best, data); }
  }

  updateGround(cx, cz) {
    const g = this.index && this.index.ground;
    if (!g) return;
    const tx = Math.floor((cx * CELL - g.x0) / g.tile), tz = Math.floor((cz * CELL - g.z0) / g.tile);
    const keep = new Set();
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      const x = tx + dx, z = tz + dz;
      if (x < 0 || z < 0 || x * g.tile >= g.w || z * g.tile >= g.h) continue;
      const k = `${x}_${z}`;
      keep.add(k);
      if (this.groundTiles.has(k)) continue;
      const tex = this.groundLoader.load(`${BASE}ground/${k}.jpg`);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 8;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(g.tile, g.tile).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ map: tex, color: 0xc4d9a8 }));
      m.position.set(g.x0 + (x + 0.5) * g.tile, -0.05, g.z0 + (z + 0.5) * g.tile);
      m.receiveShadow = true;
      this.root.add(m);
      this.groundTiles.set(k, m);
    }
    for (const [k, m] of this.groundTiles) {
      if (keep.has(k)) continue;
      this.root.remove(m); m.geometry.dispose(); m.material.map.dispose(); m.material.dispose();
      this.groundTiles.delete(k);
    }
  }

  unloadCell(k, cell) {
    this.cells.delete(k);
    this.pending.delete(k);
    if (!cell) return;
    this.root.remove(cell.group);
    cell.group.traverse((o) => {
      if (o.geometry && !o.geometry.userData.shared && o.geometry !== this.treeGeo.trunk && o.geometry !== this.treeGeo.crown && o.geometry !== this.lampGeo) o.geometry.dispose();
      if (o.isSprite) { o.material.map.dispose(); o.material.dispose(); }
    });
    if (cell.lampMesh) cell.lampMesh.dispose();
    if (cell.signMat) { cell.signMat.map.dispose(); cell.signMat.dispose(); }
    for (const r of cell.roads) for (const end of [0, 1]) {
      const list = this.nodes.get(r.keys[end]);
      if (!list) continue;
      const i = list.findIndex((e) => e.seg === r);
      if (i >= 0) list.splice(i, 1);
      if (!list.length) this.nodes.delete(r.keys[end]);
    }
    this.signalList = this.signalList.filter((sg) => sg.cell !== k);
  }

  buildCell(k, data) {
    if (!Array.isArray(data)) {
      const cell = buildCell(this, k, data);
      this.root.add(cell.group);
      this.cells.set(k, cell);
      return;
    }
    const [buildings, small, collector, main, objects = []] = data;
    const group = new THREE.Group();
    const cell = { group, buildings: [], buckets: new Map(), roads: [], objects: [], lampMesh: null };
    // ---- buildings: walls in one of several facade looks, flat roofs
    const W = [{ p: [], u: [], c: [] }];
    for (let i = 0; i < this.mats.walls.length; i++) W.push({ p: [], u: [], c: [] });
    const rp = [], rc = [];
    const col = new THREE.Color(), rcol = new THREE.Color();
    for (const b of buildings) {
      const h = Math.max(3, b[0]), c = b[1];
      const n = c.length / 2;
      if (n < 3) continue;
      const xs = [], zs = [];
      for (let i = 0; i < n; i++) { xs.push(c[i * 2]); zs.push(c[i * 2 + 1]); }
      let cxm = 0, czm = 0;
      for (let i = 0; i < n; i++) { cxm += xs[i]; czm += zs[i]; }
      cxm /= n; czm /= n;
      const hv = hashStr(Math.round(xs[0]), Math.round(zs[0]));
      // houses get brick / arched looks, blocks and towers panel or ribbon windows
      const look = h <= 10 ? [3, 4, 6, 0][Math.floor(hv * 4)] : h <= 30 ? [1, 2, 0, 5][Math.floor(hv * 4)] : [2, 5, 1][Math.floor(hv * 3)];
      const sink = W[look];
      const textured = look > 0;
      if (textured) col.setRGB(0.92 + hv * 0.1, 0.92 + hv * 0.1, 0.92 + hv * 0.1);
      else col.set(b[2] || WALLS[Math.floor(hv * WALLS.length)]);
      if (b[2] && textured) col.set(b[2]).lerp(new THREE.Color(1, 1, 1), 0.55);
      rcol.set(b[3] || ROOFS[Math.floor(((hv * 7.3) % 1) * ROOFS.length)]);
      // wall orientation: outward normal must point away from the centre
      let side = 0;
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n, dx = xs[j] - xs[i], dz = zs[j] - zs[i];
        side += -dz * ((xs[i] + xs[j]) / 2 - cxm) + dx * ((zs[i] + zs[j]) / 2 - czm);
      }
      const flip = side < 0;
      let run = 0;
      let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const ax = xs[i], az = zs[i], bx = xs[j], bz = zs[j];
        const len = Math.hypot(bx - ax, bz - az);
        const u0 = textured ? run / 18 : run / 12, u1 = textured ? (run + len) / 18 : (run + len) / 12, v = textured ? h / 36 : h / 6;
        run += len;
        const A = [ax, 0, az], Bv = [bx, 0, bz], B1 = [bx, h, bz], A1 = [ax, h, az];
        const quad = flip ? [[A, u0, v], [B1, u1, 0], [Bv, u1, v], [A, u0, v], [A1, u0, 0], [B1, u1, 0]]
          : [[A, u0, v], [Bv, u1, v], [B1, u1, 0], [A, u0, v], [B1, u1, 0], [A1, u0, 0]];
        for (const [p, uu, vv] of quad) { sink.p.push(...p); sink.u.push(uu, vv); sink.c.push(col.r, col.g, col.b); }
        minX = Math.min(minX, ax); maxX = Math.max(maxX, ax); minZ = Math.min(minZ, az); maxZ = Math.max(maxZ, az);
      }
      const contour = xs.map((x, i) => new THREE.Vector2(x, zs[i]));
      const tris = THREE.ShapeUtils.triangulateShape(contour, []);
      for (const [a, b2, c2] of tris) {
        const P = [contour[a], contour[b2], contour[c2]];
        // roof faces up: (q - p) x (r - p) must have +y
        const ny = (P[1].y - P[0].y) * (P[2].x - P[0].x) - (P[1].x - P[0].x) * (P[2].y - P[0].y);
        const order = ny >= 0 ? [0, 1, 2] : [0, 2, 1];
        for (const o of order) { rp.push(P[o].x, h, P[o].y); rc.push(rcol.r * 0.9, rcol.g * 0.9, rcol.b * 0.9); }
      }
      const rec = { h, xs, zs, minX, maxX, minZ, maxZ };
      cell.buildings.push(rec);
      // collision buckets (every edge in every bucket its bounding box touches)
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const e = [xs[i], zs[i], xs[j], zs[j], rec];
        const bx0 = Math.floor(Math.min(xs[i], xs[j]) / BUCKET), bx1 = Math.floor(Math.max(xs[i], xs[j]) / BUCKET);
        const bz0 = Math.floor(Math.min(zs[i], zs[j]) / BUCKET), bz1 = Math.floor(Math.max(zs[i], zs[j]) / BUCKET);
        for (let x = bx0; x <= bx1; x++) for (let z = bz0; z <= bz1; z++) {
          const bk = x * 100003 + z;
          let list = cell.buckets.get(bk);
          if (!list) cell.buckets.set(bk, (list = { edges: [], blds: new Set() }));
          list.edges.push(e); list.blds.add(rec);
        }
      }
      // fill interior buckets for height checks (flying over roofs)
      for (let x = Math.floor(minX / BUCKET); x <= Math.floor(maxX / BUCKET); x++) for (let z = Math.floor(minZ / BUCKET); z <= Math.floor(maxZ / BUCKET); z++) {
        const bk = x * 100003 + z;
        let list = cell.buckets.get(bk);
        if (!list) cell.buckets.set(bk, (list = { edges: [], blds: new Set() }));
        list.blds.add(rec);
      }
    }
    W.forEach((w, i) => {
      if (!w.p.length) return;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(w.p, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(w.u, 2));
      g.setAttribute('color', new THREE.Float32BufferAttribute(w.c, 3));
      g.computeVertexNormals();
      const m = new THREE.Mesh(g, i === 0 ? this.mats.wall : this.mats.walls[i - 1]);
      m.receiveShadow = true;           // (buildings don't cast: far cheaper, trees still do)
      group.add(m);
    });
    if (rp.length) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(rp, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(rc, 3));
      g.computeVertexNormals();
      const m = new THREE.Mesh(g, this.mats.roof);
      m.receiveShadow = true;
      group.add(m);
    }
    // ---- roads: one strip per segment + round joints so corners have no gaps
    const walkP = [];
    for (const [kind, segs] of [[1, collector], [2, main]]) {
      const w = ROAD_W[kind] / 2 + WALK;
      for (const [ax, az, bx, bz] of segs) {
        const len = Math.hypot(bx - ax, bz - az);
        if (len < 0.01) continue;
        const nx = -(bz - az) / len * w, nz = (bx - ax) / len * w;
        walkP.push(ax + nx, 0.015, az + nz, bx + nx, 0.015, bz + nz, bx - nx, 0.015, bz - nz, ax + nx, 0.015, az + nz, bx - nx, 0.015, bz - nz, ax - nx, 0.015, az - nz);
        for (const [x, z] of [[ax, az], [bx, bz]]) for (let i = 0; i < 8; i++) {
          const a0 = (i / 8) * Math.PI * 2, a1 = ((i + 1) / 8) * Math.PI * 2;
          walkP.push(x, 0.015, z, x + Math.cos(a0) * w, 0.015, z + Math.sin(a0) * w, x + Math.cos(a1) * w, 0.015, z + Math.sin(a1) * w);
        }
      }
    }
    if (walkP.length) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(walkP, 3));
      const a = g.attributes.position.array;
      for (let i = 0; i < a.length; i += 9) {
        const ny = (a[i + 5] - a[i + 2]) * (a[i + 6] - a[i]) - (a[i + 3] - a[i]) * (a[i + 8] - a[i + 2]);
        if (ny < 0) for (let k2 = 0; k2 < 3; k2++) { const t = a[i + 3 + k2]; a[i + 3 + k2] = a[i + 6 + k2]; a[i + 6 + k2] = t; }
      }
      g.computeVertexNormals();
      const m = new THREE.Mesh(g, this.mats.walk);
      m.receiveShadow = true;
      group.add(m);
    }
    [small, collector, main].forEach((segs, kind) => {
      if (!segs.length) return;
      const w = ROAD_W[kind] / 2, y = ROAD_Y[kind];
      const p = [], uv = [];
      const disc = (x, z) => {
        const N = 8;
        for (let i = 0; i < N; i++) {
          const a0 = (i / N) * Math.PI * 2, a1 = ((i + 1) / N) * Math.PI * 2;
          p.push(x, y, z, x + Math.cos(a1) * w, y, z + Math.sin(a1) * w, x + Math.cos(a0) * w, y, z + Math.sin(a0) * w);
          uv.push(0.1, 0.5, 0.1, 0.5, 0.1, 0.5);
        }
      };
      for (const [ax, az, bx, bz] of segs) {
        const len = Math.hypot(bx - ax, bz - az);
        if (len < 0.01) continue;
        const nx = -(bz - az) / len * w, nz = (bx - ax) / len * w;
        const v1 = len / 8;
        // two triangles, facing up
        p.push(ax + nx, y, az + nz, bx + nx, y, bz + nz, bx - nx, y, bz - nz, ax + nx, y, az + nz, bx - nx, y, bz - nz, ax - nx, y, az - nz);
        uv.push(1, 0, 1, v1, 0, v1, 1, 0, 0, v1, 0, 0);
        disc(ax, az); disc(bx, bz);
        if (kind >= 1) {
          const seg = { ax, az, bx, bz, len, kind, keys: [`${Math.round(ax)},${Math.round(az)}`, `${Math.round(bx)},${Math.round(bz)}`] };
          cell.roads.push(seg);
          for (const end of [0, 1]) {
            let list = this.nodes.get(seg.keys[end]);
            if (!list) this.nodes.set(seg.keys[end], (list = []));
            list.push({ seg, end });
          }
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      // fix winding so every triangle faces up
      const a = g.attributes.position.array;
      for (let i = 0; i < a.length; i += 9) {
        const ny = (a[i + 5] - a[i + 2]) * (a[i + 6] - a[i]) - (a[i + 3] - a[i]) * (a[i + 8] - a[i + 2]);
        if (ny < 0) for (let k2 = 0; k2 < 3; k2++) { const t = a[i + 3 + k2]; a[i + 3 + k2] = a[i + 6 + k2]; a[i + 6 + k2] = t; }
      }
      const uva = g.attributes.uv.array;
      void uva;
      g.computeVertexNormals();
      const m = new THREE.Mesh(g, this.mats.road[kind]);
      m.receiveShadow = true;
      group.add(m);
      cell.segs = cell.segs || [];
      cell.segs.push([kind, segs]);
    });
    // ---- plane trees along the collector and main roads (Tashkent's streets are lined with them)
    const treePts = [];
    const inBuilding = (x, z) => {
      const b = cell.buckets.get(Math.floor(x / BUCKET) * 100003 + Math.floor(z / BUCKET));
      if (!b) return false;
      for (const r2 of b.blds) {
        if (x < r2.minX - 2 || x > r2.maxX + 2 || z < r2.minZ - 2 || z > r2.maxZ + 2) continue;
        return true;
      }
      return false;
    };
    for (const [kind, segs] of [[1, collector], [2, main]]) {
      const off = ROAD_W[kind] / 2 + WALK - 0.9;
      for (const [ax, az, bx, bz] of segs) {
        const len = Math.hypot(bx - ax, bz - az);
        if (len < 14) continue;
        const dx = (bx - ax) / len, dz = (bz - az) / len;
        for (let t = 7; t < len - 7; t += 12 + hashStr(Math.round(ax + t), Math.round(az)) * 6) {
          for (const sd of [-1, 1]) {
            const x = ax + dx * t - dz * off * sd, z = az + dz * t + dx * off * sd;
            if (!inBuilding(x, z)) treePts.push([x, z]);
          }
        }
      }
    }
    if (treePts.length) {
      const pts = treePts.filter((_, i) => i % 2 === 0 || !this.d.mobile).slice(0, this.d.mobile ? 70 : 150);
      const trunk = new THREE.InstancedMesh(this.treeGeo.trunk, this.mats.trunk, pts.length);
      const crown = new THREE.InstancedMesh(this.treeGeo.crown, this.mats.crown, pts.length);
      const tm = new THREE.Matrix4(), tq = new THREE.Quaternion(), tc = new THREE.Color(), yAxis = new THREE.Vector3(0, 1, 0);
      pts.forEach(([x, z], i) => {
        const hv = hashStr(Math.round(x * 3), Math.round(z * 3)), sc = 0.8 + hv * 0.55;
        tm.compose(new THREE.Vector3(x, 0, z), tq.setFromAxisAngle(yAxis, hv * 6.28), new THREE.Vector3(sc, sc * (0.9 + hv * 0.25), sc));
        trunk.setMatrixAt(i, tm); crown.setMatrixAt(i, tm);
        tc.setHSL(0.22 + hv * 0.08, 0.42, 0.28 + hv * 0.1);
        crown.setColorAt(i, tc);
      });
      trunk.castShadow = crown.castShadow = true;
      group.add(trunk, crown);
      cell.trees = [trunk, crown];
    }

    // ---- street objects: signals, bus stops, metro stations and entrances
    const pp = [], pc = [], lampPos = [];
    const box = new THREE.BoxGeometry(1, 1, 1), sph = new THREE.SphereGeometry(0.5, 10, 6);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), c3 = new THREE.Color();
    for (const o of objects) {
      const [type, name] = o;
      const parts = this.models[type];
      if (!parts) continue;
      // stand on the kerb, facing the nearest road so signs read from the street
      const { x, z, rot } = this.faceRoad(o[2], o[3], [small, collector, main]);
      for (const part of parts) {
        const [shape, px, py, pz, sx, sy, sz, color] = part;
        if (type === 'signal' && shape === 'sphere') { lampPos.push([x, z, rot, px, py, pz, color]); continue; }
        const g = shape === 'sphere' ? sph : box;
        m4.compose(new THREE.Vector3(px, py, pz).applyAxisAngle(up, rot).add(new THREE.Vector3(x, 0.02, z)), q.setFromAxisAngle(up, rot), new THREE.Vector3(sx, sy, sz));
        const pos = g.attributes.position, idx = g.index.array;
        c3.set(color);
        for (let i = 0; i < idx.length; i++) {
          const v = new THREE.Vector3().fromBufferAttribute(pos, idx[i]).applyMatrix4(m4);
          pp.push(v.x, v.y, v.z); pc.push(c3.r, c3.g, c3.b);
        }
      }
      if (type === 'signal') { this.signalList.push({ x, z, cell: k, phase: hashStr(Math.round(x), Math.round(z)) * 32 }); }
      else {
        const s = labelSprite(LABELS[type] + (name ? ` · ${name}` : ''), type === 'bus' ? '#1f5f9a' : '#1d6b5a');
        s.position.set(x, 3.4, z);
        s.visible = false;
        group.add(s);
        cell.objects.push({ type, name, x, z, sprite: s });
      }
    }
    if (pp.length) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pp, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(pc, 3));
      g.computeVertexNormals();
      const m = new THREE.Mesh(g, this.mats.props);
      m.castShadow = true;
      group.add(m);
    }
    if (lampPos.length) {
      const lamps = new THREE.InstancedMesh(sph, this.mats.lamp, lampPos.length);
      lampPos.forEach(([x, z, rot, px, py, pz], i) => {
        m4.compose(new THREE.Vector3(px, py, pz).applyAxisAngle(up, rot).add(new THREE.Vector3(x, 0.02, z)), q.setFromAxisAngle(up, rot), new THREE.Vector3(0.19, 0.19, 0.12));
        lamps.setMatrixAt(i, m4);
        lamps.setColorAt(i, LIGHT.off);
      });
      cell.lampMesh = lamps;
      cell.lampInfo = lampPos.map((l) => ({ x: l[0], z: l[1], color: l[6] }));
      group.add(lamps);
    }
    box.dispose();
    this.root.add(group);
    this.cells.set(k, cell);
  }

  // direction (yaw) that makes a street object face the closest road
  // where a street object stands (moved off the carriageway onto the kerb) and which way it faces
  faceRoad(x, z, kinds) {
    let best = Infinity, near = null;
    kinds.forEach((segs, kind) => {
      for (const [ax, az, bx, bz] of segs) {
        const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1;
        const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
        const px = ax + dx * t, pz = az + dz * t, d = (px - x) ** 2 + (pz - z) ** 2;
        if (d < best) { best = d; near = { px, pz, kind, dx, dz, l: Math.sqrt(l2) }; }
      }
    });
    if (!near) return { x, z, rot: 0 };
    const edge = ROAD_W[near.kind] / 2 + (near.kind ? WALK * 0.55 : 1.2);
    let ox = x - near.px, oz = z - near.pz, d = Math.hypot(ox, oz);
    if (d < 0.5) { ox = -near.dz / near.l; oz = near.dx / near.l; d = 1; }      // on the centre line: pick the right side
    const nx = ox / d, nz = oz / d;
    const fx = d < edge ? near.px + nx * edge : x, fz = d < edge ? near.pz + nz * edge : z;
    return { x: fx, z: fz, rot: Math.atan2(-nx, -nz) + Math.PI };
  }

  // ------------------------------------------------------------ world queries
  nearbyBuckets(x, z) {
    const out = [];
    const bx = Math.floor(x / BUCKET), bz = Math.floor(z / BUCKET);
    const ck = this.key(Math.floor(x / CELL), Math.floor(z / CELL));
    const cells = [this.cells.get(ck)];
    // buildings are filed under the cell of their centre: look in the neighbours too
    const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) if (dx || dz) cells.push(this.cells.get(this.key(cx + dx, cz + dz)));
    for (const cell of cells) {
      if (!cell) continue;
      for (let ix = bx - 1; ix <= bx + 1; ix++) for (let iz = bz - 1; iz <= bz + 1; iz++) {
        const b = cell.buckets.get(ix * 100003 + iz);
        if (b) out.push(b);
      }
    }
    return out;
  }

  heightAt(x, z) {
    let h = 0;
    for (const b of this.nearbyBuckets(x, z)) for (const r of b.blds) {
      if (r.h <= h || x < r.minX || x > r.maxX || z < r.minZ || z > r.maxZ) continue;
      let inside = false;
      for (let i = 0, j = r.xs.length - 1; i < r.xs.length; j = i++) {
        if ((r.zs[i] > z) !== (r.zs[j] > z) && x < ((r.xs[j] - r.xs[i]) * (z - r.zs[i])) / (r.zs[j] - r.zs[i]) + r.xs[i]) inside = !inside;
      }
      if (inside) h = r.h;
    }
    return h;
  }

  cameraBlocked(cp) { return this.heightAt(cp.x, cp.z) > cp.y; }

  collide(dt) {
    const s = this.state, fx = this.d.fx, audio = this.d.audio;
    s.bumpCd = Math.max(0, s.bumpCd - dt);
    const hit = (x, z, strength, what = 'building') => {
      if (s.bumpCd > 0) return;
      const hc = this.hitCount || (this.hitCount = {}); hc[what] = (hc[what] || 0) + 1;     // for test drives
      this.lastHit = { what, x, z };
      s.bumpCd = 0.35;
      fx.emitSparks(x, 0.6, z, Math.min(120, 20 + strength * 6), { spread: 6, up: 3, life: 0.6 });
      if (strength > 12) { fx.emitSmoke(x, 0.6, z, 6, true); audio.crash(); s.spin = (Math.random() - 0.5) * 3; }
      else audio.bump();
      this.d.shake(Math.min(1.2, strength * 0.06));
    };
    const flying = s.def.flying && (s.altT > 0.05 || s.y > 0.3);
    const fwdX = -Math.sin(s.yaw), fwdZ = -Math.cos(s.yaw);
    if (!flying) {
      for (const off of [1.5, 0, -1.5]) {
        const px = s.x + fwdX * off, pz = s.z + fwdZ * off, rad = 1.05;
        let pushX = 0, pushZ = 0, worst = 0, hx = 0, hz = 0, hw = false;
        const seen = new Set();
        for (const b of this.nearbyBuckets(px, pz)) for (const e of b.edges) {
          if (seen.has(e)) continue;
          seen.add(e);
          if (s.y > e[4].h) continue;
          const [ax, az, bx, bz] = e;
          const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1;
          const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / l2));
          const cx = ax + dx * t, cz = az + dz * t;
          const ox = px - cx, oz = pz - cz, d = Math.hypot(ox, oz);
          if (d >= rad || d < 1e-4) continue;
          const depth = rad - d;
          if (depth > worst) { worst = depth; pushX = ox / d; pushZ = oz / d; hx = cx; hz = cz; hw = !!e[4].wall; }
        }
        if (worst > 0) {
          s.x += pushX * worst; s.z += pushZ * worst;
          const into = -(fwdX * pushX + fwdZ * pushZ) * Math.sign(s.v || 1);
          const impact = Math.abs(s.v) * Math.max(0.2, into);
          // head-on: most speed gone; scraping along: some; wedged in a corner the pushes add up and it stops
          s.v *= into > 0.7 ? 0.35 : into > 0.25 ? 0.75 : 0.95;
          hit(hx, hz, impact, hw ? 'wall' : 'building');
        }
      }
    }
    for (const c of this.cars) {
      if (s.y > c.height + 0.3) continue;
      if (Math.abs(c.x - s.x) > 14 || Math.abs(c.z - s.z) > 14) continue;
      const r = CityMode.obb(s.x, s.z, s.yaw, 0.95, 2.4, c.x, c.z, c.yaw, c.halfW, c.halfL);
      if (!r) continue;
      s.x += r.nx * r.depth * 0.7; s.z += r.nz * r.depth * 0.7;
      const rel = Math.abs(s.v - c.speed * Math.cos(c.yaw - s.yaw));
      c.speed = Math.max(0, c.speed * 0.4);
      s.v *= 0.55;
      hit((s.x + c.x) / 2, (s.z + c.z) / 2, rel, 'car');
    }
  }

  // ------------------------------------------------------------ traffic lights (OSM nodes)
  lightAt(sg, axis) {
    const p = (this.signalTime + sg.phase) % 32;
    if (axis === 'ns') return p < 13 ? 'g' : p < 16 ? 'y' : 'r';
    return p >= 16.5 && p < 29.5 ? 'g' : p >= 29.5 ? 'y' : 'r';
  }

  updateSignals(dt) {
    this.signalTime += dt;
    this.sigTick = (this.sigTick || 0) - dt;
    if (this.sigTick > 0) return;
    this.sigTick = 0.25;
    const s = this.state;
    for (const cell of this.cells.values()) {
      if (!cell || !cell.lampMesh) continue;
      // each signal head shows the phase of the street it faces; lamps keep their own colour slot
      cell.lampInfo.forEach((l, i) => {
        const p = (this.signalTime + (l.phase ?? hashStr(Math.round(l.x), Math.round(l.z)) * 32)) % 32;
        const st = p < 13 ? 'g' : p < 16 ? 'y' : 'r';
        const on = (l.color === '#ed4545' && st === 'r') || (l.color === '#e9aa35' && st === 'y') || (l.color === '#31ac74' && st === 'g');
        cell.lampMesh.setColorAt(i, on ? LIGHT[st] : LIGHT.off);
      });
      cell.lampMesh.instanceColor.needsUpdate = true;
    }
    // labels only close up
    for (const cell of this.cells.values()) {
      if (!cell) continue;
      for (const o of cell.objects) { const d1 = Math.abs(o.x - s.x) + Math.abs(o.z - s.z); o.sprite.visible = !this.hudOff && d1 > 9 && d1 < 110; }
    }
  }

  // ------------------------------------------------------------ traffic on the real roads
  spawnTraffic() {}

  roadsNear(x, z, rMin, rMax) {
    const out = [];
    for (const cell of this.cells.values()) {
      if (!cell) continue;
      for (const r of cell.roads) {
        const mx = (r.ax + r.bx) / 2, mz = (r.az + r.bz) / 2, d = Math.hypot(mx - x, mz - z);
        if (d > rMin && d < rMax && r.len > 8) out.push(r);
      }
    }
    return out;
  }

  // right-hand traffic: the outer lane of a one-way carriageway, the middle of the right half of a two-way road
  // each car keeps a lane: lanes from OSM (or the width), counted from the kerb on the right
  laneOffset(seg, lane = 0) {
    if (!seg.width) return seg.kind === 2 ? 3.2 : 2.0;
    const per = seg.oneway ? (seg.lanes || Math.max(1, Math.round(seg.width / 3.3))) : Math.max(1, seg.lanes ? Math.floor(seg.lanes / 2) : Math.floor(seg.width / 2 / 3.0));
    const lw = (seg.oneway ? seg.width : seg.width / 2) / per, k = Math.min(lane, per - 1);
    return seg.oneway ? seg.width / 2 - lw * (k + 0.5) : seg.width / 2 - lw * (k + 0.5);
  }

  placeOnSeg(c, seg, fromEnd, t) {
    c.seg = seg; c.rev = fromEnd === 1; c.t = t;
    this.carPose(c);
  }

  carPose(c) {
    const seg = c.seg;
    const ax = c.rev ? seg.bx : seg.ax, az = c.rev ? seg.bz : seg.az, bx = c.rev ? seg.ax : seg.bx, bz = c.rev ? seg.az : seg.bz;
    const f = c.t / seg.len, dx = (bx - ax) / seg.len, dz = (bz - az) / seg.len;
    // right-hand traffic: offset to the right of the direction of travel
    const off = this.laneOffset(seg, c.lane || 0);
    c.x = ax + (bx - ax) * f - dz * off;
    c.z = az + (bz - az) * f + dx * off;
    c.dirX = dx; c.dirZ = dz;
    c.yawT = Math.atan2(-dx, -dz);
  }

  updateTraffic(dt) {
    const s = this.state;
    const k = { low: 0.45, normal: 1, high: 1.6 }[this.d.trafficDensity ? this.d.trafficDensity() : 'normal'] || 1;
    const want = Math.round((this.d.mobile ? 12 : 22) * k);
    // spawn on roads around the player (not right in front of the camera)
    if (this.cars.length < want && this.cells.size) {
      const roads = this.roadsNear(s.x, s.z, 70, 320);
      for (let tries = 0; tries < 3 && roads.length && this.cars.length < want; tries++) {
        const seg = roads[Math.floor(Math.random() * roads.length)];
        const c = this.pool && this.pool.length ? this.pool.pop() : createUzCar(pickUzType());
        if (!c.mesh.parent) this.root.add(c.mesh);
        c.setColor();
        if (c.setTaxi) c.setTaxi(c.type !== 'damas' && Math.random() < 0.18);   // about one car in six is a taxi
        c.mesh.visible = true;
        c.baseSpeed = seg.kind === 2 ? 10 + Math.random() * 5 : 7 + Math.random() * 4;
        c.lane = Math.random() < 0.55 ? 0 : Math.random() < 0.7 ? 1 : 2;
        c.speed = c.baseSpeed;
        this.placeOnSeg(c, seg, seg.oneway || Math.random() < 0.5 ? 0 : 1, Math.random() * seg.len);
        if (this.cars.some((o) => Math.hypot(o.x - c.x, o.z - c.z) < 12)) { (this.pool || (this.pool = [])).push(c); c.mesh.visible = false; continue; }
        c.yaw = c.yawT;
        this.cars.push(c);
      }
    }
    for (let i = this.cars.length - 1; i >= 0; i--) {
      const c = this.cars[i];
      let limit = c.baseSpeed;
      // follow cars ahead, brake for the player
      for (const o of [...this.cars, { x: s.x, z: s.z, speed: Math.abs(s.v), player: true }]) {
        if (o === c) continue;
        const rx = o.x - c.x, rz = o.z - c.z;
        const ahead = rx * c.dirX + rz * c.dirZ, lat = Math.abs(rx * c.dirZ - rz * c.dirX);
        // follow cars going the same way; a car crossing the junction only matters when it is right in front.
        // A driver who has waited a long time edges through (ghost) so junctions never lock up.
        const same = o.player || (o.dirX * c.dirX + o.dirZ * c.dirZ) > 0.5;
        if (!o.player && c.ghost > 0) continue;
        if (same ? ahead > 0 && ahead < 20 && lat < 2.6 : ahead > 0 && ahead < 6 && lat < 1.8) limit = Math.min(limit, Math.max(0, (ahead - (same ? 7 : 3.5)) * 0.8));
        // the player's car crossing in front at a junction: stop dead, don't creep into it
        if (o.player && !(c.goFirst > 0) && ahead > -1 && ahead < 8 && lat < 4.5 && Math.abs(c.dirX * -Math.sin(s.yaw) + c.dirZ * -Math.cos(s.yaw)) < 0.85) limit = 0;
      }
      // red lights at the OSM signal nodes just ahead
      const axis = Math.abs(c.dirX) > Math.abs(c.dirZ) ? 'ew' : 'ns';
      for (const sg of this.signalList) {
        const rx = sg.x - c.x, rz = sg.z - c.z;
        if (Math.abs(rx) > 30 || Math.abs(rz) > 30) continue;
        const ahead = rx * c.dirX + rz * c.dirZ, lat = Math.abs(rx * c.dirZ - rz * c.dirX);
        if (ahead > 2 && ahead < 22 && lat < 9) {
          const st = this.lightAt(sg, axis);
          if (st === 'r' || (st === 'y' && ahead > c.speed * 1.3)) { limit = Math.min(limit, Math.max(0, (ahead - 8) * 0.6)); c.atRed = true; }
        }
      }
      const red = c.atRed; c.atRed = false;
      c.waitT = c.speed < 0.3 && !red ? (c.waitT || 0) + dt : 0;
      if (c.waitT > 8) { c.ghost = 2.5; c.waitT = 0; }
      if (c.ghost > 0) c.ghost -= dt;
      c.stuckT = c.speed < 0.3 ? (c.stuckT || 0) + dt : 0;
      if (c.stuckT > 30) {
        const fx = -Math.sin(s.yaw), fz = -Math.cos(s.yaw), pd2 = Math.hypot(c.x - s.x, c.z - s.z);
        if (pd2 > 40 && ((c.x - s.x) * fx + (c.z - s.z) * fz) / pd2 < 0.3) { this.removeCar(i); continue; }
      }
      c.speed += (limit - c.speed) * Math.min(1, dt * (limit < c.speed ? 4 : 1));
      // waiting on the player for a long time (wedged at a junction): the driver goes round, i.e. the car
      // leaves the street, but only when the player isn't looking at it
      const pd = Math.hypot(c.x - s.x, c.z - s.z);
      c.blockedT = c.speed < 0.8 && pd < 9 ? (c.blockedT || 0) + dt : 0;
      // both waiting for each other: the other driver goes first
      if (c.blockedT > 3 && Math.abs(s.v) < 0.5) { c.goFirst = 4; c.blockedT = 0; }
      if (c.goFirst > 0) c.goFirst -= dt;
      if (c.blockedT > 4) {
        const fx = -Math.sin(s.yaw), fz = -Math.cos(s.yaw);
        if (((c.x - s.x) * fx + (c.z - s.z) * fz) / (pd || 1) < 0.5) { this.removeCar(i); continue; }
      }
      c.setBrake(limit < c.speed - 0.5);
      c.t += c.speed * dt;
      // end of the segment: carry on along a connected road (mostly straight on)
      if (c.t >= c.seg.len) {
        const endKey = c.seg.keys[c.rev ? 0 : 1];
        // never into a one-way street against its direction
        const options = (this.nodes.get(endKey) || []).filter((e) => e.seg !== c.seg && !(e.seg.oneway && e.end === 1));
        if (!options.length) { this.removeCar(i); continue; }
        let best = options[0], bestScore = -Infinity;
        for (const e of options) {
          const s2 = e.seg;
          const ox = e.end === 0 ? s2.bx - s2.ax : s2.ax - s2.bx, oz = e.end === 0 ? s2.bz - s2.az : s2.az - s2.bz;
          const dot = (ox * c.dirX + oz * c.dirZ) / (s2.len || 1);
          const score = dot + Math.random() * 0.9 + (s2.kind === 2 ? 0.2 : 0);
          if (dot > -0.3 && score > bestScore) { bestScore = score; best = e; }
        }
        const over = c.t - c.seg.len;
        this.placeOnSeg(c, best.seg, best.end, Math.min(over, best.seg.len));
      } else this.carPose(c);
      let dy = c.yawT - c.yaw;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      c.yaw += dy * Math.min(1, dt * 6);
      c.mesh.position.set(c.x, 0.02, c.z);
      c.mesh.rotation.set(0, c.yaw, 0);
      const far = Math.abs(c.x - s.x) + Math.abs(c.z - s.z);
      if (c.setDetail) c.setDetail(far < 110);
      if (far > 520) this.removeCar(i);
    }
  }

  removeCar(i) {
    const c = this.cars[i];
    c.mesh.visible = false;
    this.cars.splice(i, 1);
    (this.pool || (this.pool = [])).push(c);
  }

  // ------------------------------------------------------------ per frame
  update(dt) {
    this.updateCells();
    const ck = this.key(Math.floor(this.state.x / CELL), Math.floor(this.state.z / CELL));
    if (!this.cells.has(ck)) {
      // the first cells are still downloading: hold the car, keep the picture alive
      if (!this.loadingShown) { this.loadingShown = true; this.d.ui.popup('TOSHKENT XARITASI YUKLANMOQDA…'); }
      if (!this.everLoaded && performance.now() - this.startedAt > 15000 && this.d.fallbackCity) { this.d.fallbackCity(); return; }
      this.updateCamera(dt, -Math.sin(this.state.yaw), -Math.cos(this.state.yaw));
      this.sky.position.copy(this.d.camera.position);
      return;
    }
    this.everLoaded = true;
    super.update(dt);
  }

  // a sidewalk for a pedestrian: beside a collector or main road 30-130 m away, mid-sidewalk
  sidewalkSpot(x, z) {
    const near = [];
    for (const cell of this.cells.values()) {
      if (!cell) continue;                       // off the map edge: an empty cell
      for (const r of cell.roads) {
        const mx = (r.ax + r.bx) / 2 - x, mz = (r.az + r.bz) / 2 - z, d2 = mx * mx + mz * mz;
        if (d2 > 900 && d2 < 130 * 130 && r.len > 12) near.push(r);
      }
    }
    if (!near.length) return null;
    const r = near[Math.floor(Math.random() * near.length)];
    // on a divided road the pavement is only on the right; the left is the planted median
    const off = ((r.width || ROAD_W[r.kind]) / 2 + WALK * 0.5) * (r.median || Math.random() < 0.5 ? 1 : -1);
    const nx = -(r.bz - r.az) / r.len * off, nz = (r.bx - r.ax) / r.len * off;
    return { ax: r.ax + nx, az: r.az + nz, bx: r.bx + nx, bz: r.bz + nz };
  }

  streetName(x, z) {
    // the street the car is on (OSM name), else the nearest named stop
    let road = null, rd = 30 * 30;
    for (const cell of this.cells.values()) {
      if (!cell || !cell.named) continue;
      for (const sg of cell.named) {
        if (Math.abs(sg.ax - x) > sg.len + 40 || Math.abs(sg.az - z) > sg.len + 40) continue;
        const dx = sg.bx - sg.ax, dz = sg.bz - sg.az, l2 = dx * dx + dz * dz || 1;
        const t = Math.max(0, Math.min(1, ((x - sg.ax) * dx + (z - sg.az) * dz) / l2));
        const d2 = (sg.ax + dx * t - x) ** 2 + (sg.az + dz * t - z) ** 2;
        if (d2 < rd) { rd = d2; road = sg; }
      }
    }
    if (road) return road.name;
    let best = null, bd = 150 * 150;
    for (const cell of this.cells.values()) {
      if (!cell) continue;
      for (const o of cell.objects) {
        if (!o.name) continue;
        const d = (o.x - x) ** 2 + (o.z - z) ** 2;
        if (d < bd) { bd = d; best = o; }
      }
    }
    if (!best) return 'Toshkent';
    return (best.type === 'bus' ? '' : 'Metro · ') + best.name;
  }

  drawMinimap() {
    if (!this.mmCtx) return;
    this.mmTick = (this.mmTick || 0) + 1;
    if (this.mmTick % 3) return;
    const g = this.mmCtx, s = this.state, D = g.canvas.width, R = D / 2;
    const view = 260, k = R / view;
    g.clearRect(0, 0, D, D);
    g.save();
    g.beginPath(); g.arc(R, R, R - 2, 0, Math.PI * 2); g.clip();
    g.fillStyle = '#3a3f47'; g.fillRect(0, 0, D, D);
    g.translate(R, R); g.rotate(s.yaw); g.scale(k, k); g.translate(-s.x, -s.z);
    g.lineCap = 'round';
    const lim = view * 1.5;
    for (const cell of this.cells.values()) {
      if (!cell || !cell.segs) continue;
      for (const [kind, segs] of cell.segs) {
        g.strokeStyle = kind === 2 ? '#f3e3a6' : kind === 1 ? '#d9dde3' : '#8e949d';
        g.lineWidth = ROAD_W[kind] * (kind === 0 ? 1 : 1.3);
        g.beginPath();
        for (const [ax, az, bx, bz] of segs) {
          if (Math.abs(ax - s.x) > lim || Math.abs(az - s.z) > lim) continue;
          g.moveTo(ax, az); g.lineTo(bx, bz);
        }
        g.stroke();
      }
      for (const o of cell.objects) {
        if (Math.abs(o.x - s.x) > lim || Math.abs(o.z - s.z) > lim) continue;
        g.fillStyle = o.type === 'bus' ? '#3d9bff' : '#e53935';
        g.beginPath(); g.arc(o.x, o.z, 6, 0, Math.PI * 2); g.fill();
      }
    }
    // the taxi / navigation route ahead of the car
    if (this.taxiRoute) {
      const r = this.taxiRoute, P = r.pts;
      g.strokeStyle = r.color; g.lineWidth = 9; g.lineJoin = 'round';
      g.beginPath();
      for (let j = Math.max(0, r.from); j < P.length; j++) { if (j === Math.max(0, r.from)) g.moveTo(s.x, s.z); g.lineTo(P[j][0], P[j][1]); }
      g.stroke();
    }
    if (this.taxiTarget) {
      const dx = this.taxiTarget.x - s.x, dz = this.taxiTarget.z - s.z;
      const clamp = Math.min(1, (view - 22) / (Math.hypot(dx, dz) || 1));
      g.fillStyle = '#' + (this.taxiTarget.color || 0x39e2ae).toString(16).padStart(6, '0'); g.strokeStyle = '#162c32'; g.lineWidth = 4;
      g.beginPath(); g.arc(s.x + dx * clamp, s.z + dz * clamp, 10, 0, Math.PI * 2); g.fill(); g.stroke();
    }
    g.fillStyle = '#ffffff';
    for (const c of this.cars) g.fillRect(c.x - 3, c.z - 3, 6, 6);
    g.restore();
    g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = 4;
    g.beginPath(); g.arc(R, R, R - 3, 0, Math.PI * 2); g.stroke();
    const nx = R + Math.sin(s.yaw) * (R - 18), ny = R - Math.cos(s.yaw) * (R - 18);
    g.fillStyle = '#ffffff'; g.font = 'bold 22px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('N', nx, ny);
    g.fillStyle = '#ffd400'; g.strokeStyle = '#3a2f00'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(R, R - 16); g.lineTo(R + 11, R + 12); g.lineTo(R, R + 6); g.lineTo(R - 11, R + 12); g.closePath(); g.fill(); g.stroke();
  }
}
