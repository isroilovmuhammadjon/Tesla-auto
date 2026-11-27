// STREET RACING 3D — game bootstrap, state machine and main loop.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

import {
  CARS, PLAYER_LIMIT, PLAYER_HALF_W, PLAYER_HALF_L, STORAGE, storageGet, storageSet,
  PLAYER_MASS, GRAVITY, MAX_ALTITUDE, GANTRY_Y, LAMP_ARM_Y, LAMP_ARM_X, SEDAN_INDEX,
} from './config.js';
import { createSportsCar } from './carModels.js';
import { World } from './world.js';
import { Traffic, restHeight } from './traffic.js';
import { Effects } from './effects.js';
import { AudioEngine } from './audio.js';
import { input, initInput, resetInput, isTouchDevice, tilt, setTilt, calibrateTilt } from './input.js';
import { Rival } from './rival.js';
import { Powertrain } from './physics.js';
import { Multiplayer } from './multiplayer.js';
import { LocalRoom } from './lanroom.js';
import { hostOnline, joinOnline, cleanCode } from './online.js';
import { CityMode } from './city.js';
import { TaxiShift } from './taxi.js';
import { createUzPlayer, UZ_CARS } from './uzplayer.js';
import { OsmCity } from './osmcity.js';
import { setTrafficPalette } from './carModels.js';
import { scanRooms, getPlugin, canHostOnThisDevice, nativePlatform, LAN_PORT } from './lan.js';
import { LANES } from './config.js';
import { UI } from './ui.js';

// ---------------------------------------------------------------- renderer
const canvas = document.getElementById('game');
// Phones/tablets get lighter settings (fewer lights, smaller shadow map, 2x MSAA)
const TOUCH = isTouchDevice();
const MOBILE = TOUCH && Math.min(screen.width, screen.height) < 900;
const NATIVE = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
document.body.classList.toggle('is-touch', TOUCH);
// Anti-aliasing happens in the composer's MSAA render target, so the canvas itself doesn't need it.
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
// Adaptive quality: render resolution is tuned at runtime to hold the display's refresh rate (60/120/144 Hz).
const Q = {
  // never render below the screen's native 1x — dropping under that is what made the game blurry
  pr: Math.min(window.devicePixelRatio, MOBILE ? 1.25 : 1.5),
  max: Math.min(window.devicePixelRatio, 2),
  min: Math.min(window.devicePixelRatio, MOBILE ? 0.85 : 1),
  refresh: 60, frames: 0, time: 0, best: [], good: 0, fpsShown: 0, fpsTimer: 0, fpsFrames: 0,
};
renderer.setPixelRatio(Q.pr);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.25;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x1a1f3d, 0.0036);
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 3000);
camera.position.set(6, 2.5, 8);

scene.environment = buildEnvMap(renderer);

// ---------------------------------------------------------------- lights
const hemi = new THREE.HemisphereLight(0x8ea4e0, 0x2c2436, 1.5);
scene.add(hemi);
const moon = new THREE.DirectionalLight(0xb8c8ff, 2.4);
moon.position.set(-30, 60, 25);
moon.target.position.set(0, 0, -15);
moon.castShadow = true;
moon.shadow.mapSize.set(MOBILE ? 512 : 1024, MOBILE ? 512 : 1024);
Object.assign(moon.shadow.camera, { left: -18, right: 18, top: 32, bottom: -32, near: 1, far: 160 });
moon.shadow.bias = -0.0004;
moon.shadow.normalBias = 0.02;
scene.add(moon, moon.target);

// Showroom lights used by the menu / garage
const showLight = new THREE.SpotLight(0xd6e6ff, 0, 30, 0.6, 0.6, 1);
showLight.position.set(2, 10, 3);
const showRim = new THREE.PointLight(0x00d4ff, 0, 14, 1.2);
showRim.position.set(-2, 2.5, -5);
scene.add(showLight, showLight.target, showRim);

// ---------------------------------------------------------------- systems
const world = new World(scene, renderer);
const traffic = new Traffic(scene);
const rival = new Rival(scene);
// open-city free roam (TOSHKENT SHAHAR)
const cityDeps = {
  taxiActive: () => taxi.active && !!taxi.def,
  getPlayer: () => player,
  get pt() { return pt; },
  input, tilt, camera, moon, hemi, renderer,
  get bloom() { return bloom; },
  setHeadlight: (on) => { if (headlight) headlight.visible = on; },
  trafficDensity: () => S.traffic,
  // the real map could not be downloaded: drive the built-in city instead
  fallbackCity: () => { ui.popup('XARITA YUKLANMADI — KLASSIK SHAHAR'); city.exit(); startCity('classic'); },
  get audio() { return audio; },
  get fx() { return fx; },
  get ui() { return ui; },
  get world() { return world; },
  get lampLights() { return world.lampLights; },
  mobile: MOBILE,
  time: () => G.time,
  getView: () => G.view,
  setFov: (f, dt) => setFov(f, dt),
  shake: (v) => { G.shake = Math.max(G.shake, v); },
  shakeAmount: () => { G.shake *= 0.9; return G.shake; },
  hud: (o) => ui.updateHud({ speedKmh: o.speedKmh, gear: o.gear, nitro: o.nitro, nitroActive: o.nitroActive,
    score: o.distance, distance: o.distance, best: G.best, combo: 1, comboOn: false }),
};
// TOSHKENT SHAHAR: the real city from OpenStreetMap; the older hand-made grid stays as KLASSIK
const classicCity = new CityMode(scene, cityDeps);
const osmCity = new OsmCity(scene, cityDeps);
osmCity.load().catch(() => {});
let city = osmCity;
const taxi = new TaxiShift(osmCity);
traffic.extra = [rival];
const fx = new Effects(scene);
const audio = new AudioEngine();
const ui = new UI();

traffic.onImpact = (x, y, z, strength) => {
  fx.emitSparks(x, y + 0.1, z, Math.min(160, 30 + strength * 10), { spread: 8, up: 4, life: 0.8 });
  fx.emitSmoke(x, y + 0.4, z, 4, true);
  if (Math.abs(z) < 60) audio.thud(strength * Math.max(0.2, 1 - Math.abs(z) / 60));
};

const composer = new EffectComposer(renderer);
if (renderer.capabilities.isWebGL2) {
  composer.renderTarget1.samples = MOBILE ? 2 : 4;   // MSAA for smooth edges
  composer.renderTarget2.samples = MOBILE ? 2 : 4;
}
composer.addPass(new RenderPass(scene, camera));
// moderate glow: strong bloom smeared the whole picture and made it look hazy
const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.5, 0.35, 0.92);
composer.addPass(bloom);
composer.addPass(new OutputPass());

// ---------------------------------------------------------------- state
const G = {
  mode: 'loading',
  carIndex: firstCar(),
  garageIndex: 0,
  best: parseInt(storageGet(STORAGE.best, '0'), 10) || 0,
  time: 0,
  dragAngle: 0,
  countdown: 0,
  lastCount: 0,
  shake: 0,
  hintTimer: 0,
  view: storageGet('sr3d_view', 'chase') === 'cockpit' ? 'cockpit' : 'chase',
  lookWas: false,
};
const freshPlayer = () => ({
  x: 2, y: 0, vy: 0, altTarget: 0, fly: 0,
  latVel: 0, speed: 0, nitro: 1, nitroActive: false, nitroBlend: 0,
  distance: 0, score: 0, nearMisses: 0, combo: 1, comboTimer: 0, topSpeed: 0,
  rpm: 900, gear: 1, accel: 0, scraping: false, yaw: 0, bumpCooldown: 0,
  pitch: 0, pitchV: 0, roll: 0, rollV: 0, heave: 0,
});
const P = freshPlayer();
const crash = { t: 0, spin: 0, vx: 0, vy: 0, wx: 0, wz: 0, rx: 0, rz: 0, yaw: 0 };
let player = null;
let pt = null;          // player powertrain (engine, gearbox, brakes)
let headlight = null;

const camBase = new THREE.Vector3().copy(camera.position);
const camLook = new THREE.Vector3(0, 1, -8);
const tmpV = new THREE.Vector3();
const tmpL = new THREE.Vector3();
const FLIP_Y = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);

// the black sedan is new: pick it once for everyone, after that keep the player's own choice
function firstCar() {
  if (storageGet('sr3d_sedan_intro', '') !== '1') { storageSet('sr3d_sedan_intro', '1'); storageSet(STORAGE.car, SEDAN_INDEX); return SEDAN_INDEX; }
  return clampIndex(parseInt(storageGet(STORAGE.car, '0'), 10));
}
function clampIndex(i) { return Number.isFinite(i) && i >= 0 && i < CARS.length ? i : 0; }

// ---------------------------------------------------------------- environment map
function buildEnvMap(r) {
  const pmrem = new THREE.PMREMGenerator(r);
  const env = new THREE.Scene();
  env.background = new THREE.Color(0x05070e);
  const geo = new THREE.PlaneGeometry(1, 1);
  const panel = (color, k, pos, scale) => {
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k), side: THREE.DoubleSide }));
    m.position.set(...pos); m.scale.set(...scale); m.lookAt(0, 0, 0);
    env.add(m);
  };
  panel(0x9fc0ff, 2.2, [0, 12, 0], [26, 5, 1]);
  panel(0x00d4ff, 3.0, [-12, 3, 2], [2, 10, 1]);
  panel(0xff2bd6, 2.4, [12, 3, -4], [2, 9, 1]);
  panel(0xffb070, 2.0, [0, 4, -12], [16, 2.5, 1]);
  panel(0xffd7a0, 1.6, [4, 6, 12], [10, 2, 1]);
  panel(0x1b2440, 1.0, [0, -6, 0], [40, 40, 1]);
  const tex = pmrem.fromScene(env, 0.035).texture;
  pmrem.dispose();
  return tex;
}

// ---------------------------------------------------------------- player car
function setPlayerCar(index) { setPlayerDef(CARS[index]); }
// any player car: a racing / city car from CARS, or an Uzbek taxi from uzplayer.js
function setPlayerDef(def) {
  if (player) {
    scene.remove(player.group);
    player.dispose();
  }
  player = def.uz ? createUzPlayer(def) : createSportsCar(def);
  pt = new Powertrain(def);
  // physical falloff (decay 2): the road just ahead stays lit, but a truck far ahead no longer glows white
  headlight = new THREE.SpotLight(0xe6efff, 900, 50, 0.38, 0.5, 2);
  headlight.position.set(0, 0.8, -2.0);
  headlight.target.position.set(0, 0, -30);
  player.group.add(headlight, headlight.target);
  player.group.position.x = P.x;
  scene.add(player.group);
}

// ---------------------------------------------------------------- mode changes
function toMenu() {
  if (G.inCity) leaveCity();
  G.mode = 'menu';
  rival.hide();
  player.setInterior(false);
  document.body.classList.remove('cockpit');
  resetInput();
  traffic.clear();
  fx.clear();
  ui.show('menu');
  ui.setHud(false);
  ui.countdown(null);
  ui.setSpeedLines(0);
  ui.setMenuInfo(G.best, CARS[G.carIndex].name);
  player.group.rotation.set(0, 0, 0);
  player.body.rotation.set(0, 0, 0);
  player.body.position.y = 0;
  P.y = 0; P.fly = 0;
  audio.setMusicLevel(0.34);
  document.body.classList.toggle('touch-mode', false);
  document.getElementById('touch').classList.add('hidden');
}

function toGarage() {
  G.mode = 'garage';
  G.garageIndex = G.carIndex;
  G.dragAngle = 0;
  ui.show('garage');
  ui.renderGarage(G.garageIndex, G.carIndex);
}

function changeGarageCar(dir) {
  G.garageIndex = (G.garageIndex + dir + CARS.length) % CARS.length;
  setPlayerCar(G.garageIndex);
  ui.renderGarage(G.garageIndex, G.carIndex);
  audio.click();
}

function selectGarageCar() {
  G.carIndex = G.garageIndex;
  storageSet(STORAGE.car, G.carIndex);
  ui.renderGarage(G.garageIndex, G.carIndex);
  ui.setMenuInfo(G.best, CARS[G.carIndex].name);
  audio.nearMiss();
}

function leaveGarage() {
  if (G.garageIndex !== G.carIndex) setPlayerCar(G.carIndex);
  toMenu();
}

// opts.lane: start lane x (multiplayer grid); opts.noRival: no AI rival (multiplayer)
function startRun(opts = {}) {
  if (player.def !== CARS[G.carIndex]) setPlayerCar(G.carIndex);
  if (!G.mp && traffic.sync) {   // back to single player: own traffic and own map again
    traffic.sync = null;
    world.setTheme(G.map); setTrafficPalette(G.map);
  }
  resetInput();
  traffic.clear();
  fx.clear();
  Object.assign(P, freshPlayer());
  pt.reset();
  if (typeof opts.lane === 'number') P.x = opts.lane;
  player.group.position.set(P.x, 0, 0);
  player.group.rotation.set(0, 0, 0);
  player.body.rotation.set(0, 0, 0);
  player.body.position.y = 0;
  ui.setAltitude(player.canFly ? 0 : null);
  if (opts.noRival) rival.hide();
  else { rival.spawn(G.carIndex); G.rivalAhead = false; ui.setRival(0, rival.def.name); }
  camBase.set(P.x * 0.82, 2.6, 6.8);
  camLook.set(P.x, 1, -9);
  G.shake = 0;
  G.mode = 'countdown';
  G.countdown = 3;
  G.lastCount = 0;
  G.hintTimer = 6;
  ui.show(null);
  ui.setHud(true);
  ui.hint(true);
  audio.setMusicLevel(0.26);
  document.body.classList.toggle('touch-mode', TOUCH);
  document.getElementById('touch').classList.toggle('hidden', !TOUCH);
  if (TOUCH) enterFullscreen();
}

// ---------- full screen (website only; the installed apps are already full screen)
const STANDALONE = navigator.standalone === true
  || ['standalone', 'fullscreen'].some((m) => window.matchMedia(`(display-mode: ${m})`).matches);
const fsElement = () => document.fullscreenElement || document.webkitFullscreenElement || null;

// Resolves true when the browser really went full screen. iPhone Safari may not support it at all.
async function enterFullscreen() {
  if (NATIVE || STANDALONE || fsElement()) return true;
  const el = document.documentElement;
  try {
    if (el.requestFullscreen) await el.requestFullscreen({ navigationUI: 'hide' });
    else if (el.webkitRequestFullscreen) await el.webkitRequestFullscreen();
    else return false;
  } catch (e) { return false; }
  try { await screen.orientation.lock('landscape'); } catch (e) { /* not supported here */ }
  return true;
}

function renderFsButtons() {
  document.body.classList.toggle('show-fs', !NATIVE && !STANDALONE && !fsElement());
}

function showFsGuide(open) {
  if (open) pauseGame();
  document.getElementById('fsGuide').classList.toggle('active', open);
}

async function goFullscreen() {
  if (!(await enterFullscreen())) showFsGuide(true);
}

for (const ev of ['fullscreenchange', 'webkitfullscreenchange']) {
  document.addEventListener(ev, () => { renderFsButtons(); setTimeout(onResize, 300); });
}
// iOS reports the new size late after a rotation
window.addEventListener('orientationchange', () => setTimeout(onResize, 400));
renderFsButtons();

// TOSHKENT SHAHAR is driven in the black sedan, whatever is picked for racing
function startCity(which = 'osm', def = CARS[SEDAN_INDEX], opts = {}) {
  taxi.stop();
  city = which === 'classic' ? classicCity : osmCity;
  if (player.def !== def) setPlayerDef(def);
  // an everyday Uzbek car: no score / best / nitro panels, a dial that fits the car, its own key hint
  const uzDrive = !!(def && def.uz);
  document.body.classList.toggle('uz-drive', uzDrive);
  ui.setSpeedoMax(uzDrive ? (def.maxSpeed > 150 ? 200 : 140) : undefined);
  G.mp = null;
  resetInput();
  traffic.clear();
  rival.hide();
  fx.clear();
  ui.show(null);
  ui.setHud(true);
  ui.setAltitude(null);
  ui.countdown(null);
  ui.setSpeedLines(0);
  P.y = 0; P.fly = 0;
  G.inCity = true;
  G.mode = 'city';
  G.shake = 0;
  city.enter(def, opts);
  document.body.classList.toggle('touch-mode', TOUCH);
  document.getElementById('touch').classList.toggle('hidden', !TOUCH);
  audio.setMusicLevel(0.22);
  ui.popup(opts.taxi ? 'TOSHKENT TAKSI' : which === 'classic' ? 'KLASSIK SHAHAR' : 'TOSHKENT SHAHAR');
  if (TOUCH) enterFullscreen();
}

// HUD off (H): only the view through the windshield — no speedometer, map, labels or route line
function toggleHud(force) {
  G.hudOff = force !== undefined ? force : !G.hudOff;
  document.body.classList.toggle('hud-off', G.hudOff);
  osmCity.hudOff = G.hudOff;
  taxi.ribbonAt = -1;
  ui.popup(G.hudOff ? 'HUD O\'CHIQ (H)' : 'HUD YONIQ');
}

// ---------------------------------------------------------------- TOSHKENT TAKSI
function taxiEntry(id) { return UZ_CARS.find((c) => c.id === id) || UZ_CARS[0]; }
function taxiCarDef(entry) { return entry.sedan ? CARS[SEDAN_INDEX] : entry; }
function openTaxiGarage() {
  G.mode = 'taxigarage';
  const box = $id('taxiCars');
  if (!box.children.length) {
    for (const c of UZ_CARS) {
      const b = document.createElement('button');
      b.className = 'taxi-car'; b.dataset.action = 'taxiCar'; b.dataset.car = c.id;
      b.innerHTML = `<b>${c.name}</b><small>${c.cls.toUpperCase()}</small>`;
      box.appendChild(b);
    }
  }
  const bal = Number(storageGet('sr3d_taxi_balance', 0)) || 0;
  $id('taxiGarageBal').textContent = Math.round(bal).toLocaleString('ru-RU').replace(/\u00a0/g, ' ') + " so'm";
  $id('taxiGarageTrips').textContent = storageGet('sr3d_taxi_trips', '0');
  pickTaxiCar(storageGet('sr3d_taxi_car', 'cobalt'));
  ui.show('taxiGarage');
}
function pickTaxiCar(id) {
  const e = taxiEntry(id);
  G.taxiCar = e.id;
  storageSet('sr3d_taxi_car', e.id);
  document.querySelectorAll('.taxi-car').forEach((b) => b.classList.toggle('on', b.dataset.car === e.id));
  const fmt = (n) => n.toLocaleString('ru-RU').replace(/\u00a0/g, ' ');
  $id('taxiCarInfo').textContent = `${e.tagline}. Tarif: ${fmt(e.fare[0])} so'm + ${fmt(e.fare[1])} so'm/km` + (e.maxSpeed ? ` · maks. ${e.maxSpeed} km/soat` : '');
  const def = taxiCarDef(e);
  if (player.def !== def) setPlayerDef(def);      // the menu showcase shows the chosen car
}
function startTaxiShift() {
  const e = taxiEntry(G.taxiCar || 'cobalt');
  startCity('osm', taxiCarDef(e), { taxi: true });
  taxi.start(e);
}

// search: streets, mahallas, districts, bus stops, metro stations and entrances, landmarks (map/search.json)
function openFind(on) {
  const box = $id('findBox');
  box.hidden = !on;
  if (on) {
    taxi.ensureData().then(() => { const inp = $id('findInput'); inp.value = ''; renderFind(''); inp.focus(); });
  }
}
function renderFind(q) {
  const list = $id('findList');
  list.innerHTML = '';
  if (taxi.phase === 'nav') {
    const li = document.createElement('li');
    li.tabIndex = 0;
    li.innerHTML = "<b>✕ Navigatsiyani to'xtatish</b>";
    li.addEventListener('click', () => { taxi.clearNav(); openFind(false); });
    list.appendChild(li);
  }
  for (const e of taxi.find(q)) {
    const li = document.createElement('li');
    li.tabIndex = 0;
    li.innerHTML = `<b></b><small></small>`;
    li.firstChild.textContent = e[1];
    li.lastChild.textContent = `${e[0]}${e[4] ? ' · ' + e[4] : ''}`;
    li.addEventListener('click', () => { if (taxi.navigateTo(e)) openFind(false); });
    li.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' && taxi.navigateTo(e)) openFind(false); });
    list.appendChild(li);
  }
}

function leaveCity() {
  taxi.stop();
  city.exit();
  G.inCity = false;
  document.body.classList.remove('uz-drive');
  ui.setSpeedoMax();
  ui.setLimit(null);            // the city's speed-limit sign does not belong in a race
  moon.position.set(-30, 60, 25);
  moon.target.position.set(0, 0, -15);
  setTrafficPalette(G.map);
  if (player.def !== CARS[G.carIndex]) setPlayerCar(G.carIndex);   // back to the racing car
  player.group.position.set(P.x, 0, 0);
}

function pauseGame() {
  if (G.mode !== 'playing' && G.mode !== 'countdown' && G.mode !== 'city') return;
  G.pausedFrom = G.mode;
  G.mode = 'paused';
  resetInput();
  ui.show('pause');
  audio.setMusicLevel(0.14);
  audio.update({ engine: 0 });
}

function resumeGame() {
  if (G.mode !== 'paused') return;
  G.mode = G.pausedFrom || 'playing';
  ui.show(null);
  audio.setMusicLevel(0.26);
}

// Fatal impact: momentum exchange between the two bodies, then both become free rigid bodies
// (gravity, bounces, flips). `car` is null when hitting a fixed structure (gantry / lamp arm).
function triggerCrash(car, closing, hitPoint) {
  G.mode = 'crashing';
  crash.t = 0;
  const m1 = PLAYER_MASS, m2 = car ? car.mass : 1e6;
  const side = car ? (Math.sign(P.x - car.x) || (Math.random() < 0.5 ? -1 : 1)) : (Math.random() < 0.5 ? -1 : 1);
  const e = 0.2; // restitution
  if (car) {
    const v1 = P.speed, v2 = car.speed;
    const vp = (m1 * v1 + m2 * v2 - m2 * e * (v1 - v2)) / (m1 + m2);
    const vc = (m1 * v1 + m2 * v2 + m1 * e * (v1 - v2)) / (m1 + m2);
    P.speed = Math.max(0, vp);
    car.speed = Math.max(0, vc);
    // the lighter the other vehicle, the harder it is thrown
    const k = Math.min(2, m1 / m2) * Math.min(1.5, closing / 25);
    car.hit = true;
    car.vy = (car.air ? 0 : 1.5 + Math.random() * 3) * k + (car.air ? -1 : 0);
    car.vx = -side * (2 + closing * 0.08) * k;
    car.spin = -side * (1 + Math.random() * 2.5) * k;
    car.wz = -side * (Math.random() * 3) * k;
    car.wx = (Math.random() - 0.5) * 2 * k;
  } else {
    P.speed *= 0.15;
  }
  // player body reaction scales with impact energy and mass ratio
  const kp = Math.min(2.2, (m2 / (m1 + m2)) * 2) * Math.min(1.6, closing / 22);
  crash.vy = (P.fly > 0.5 ? 0 : 2 + Math.random() * 3) * kp + (P.fly > 0.5 ? P.vy : 0);
  crash.vx = side * (2 + closing * 0.1) * Math.min(1.4, kp);
  crash.spin = side * (2.5 + Math.random() * 3) * Math.min(1.5, kp);
  crash.wz = side * (Math.random() * 4) * kp;
  crash.wx = -(0.5 + Math.random() * 2.5) * kp;
  crash.rx = 0; crash.rz = 0; crash.yaw = player.group.rotation.y;
  P.fly = 0; // thrusters cut out — gravity takes over

  const [hx, hy, hz] = hitPoint;
  fx.emitSparks(hx, hy, hz, 240, { spread: 14, up: 7, life: 1.1 });
  fx.emitSmoke(hx, hy, hz, 14);
  fx.emitDebris(hx, hy, hz, 22, CARS[G.carIndex].color);
  G.shake = 1.3;
  P.nitroActive = false;
  ui.flash();
  ui.popup('CRASH!', true);
  audio.crash();
  audio.setMusicLevel(0.12);
}

// Light contact: the cars bump off each other, lose speed and keep going.
function bump(c, frontal, push) {
  const m1 = PLAYER_MASS, m2 = c.mass, e = 0.35;
  if (frontal) {
    const v1 = P.speed, v2 = c.speed;
    P.speed = Math.max(0, (m1 * v1 + m2 * v2 - m2 * e * (v1 - v2)) / (m1 + m2));
    c.speed = Math.max(0, (m1 * v1 + m2 * v2 + m1 * e * (v1 - v2)) / (m1 + m2));
    c.baseSpeed = Math.max(c.baseSpeed, c.speed);
  } else {
    // side swipe: lateral impulse split by mass, a little speed scrubbed off
    const rel = P.latVel;
    P.latVel = -rel * e * (m2 / (m1 + m2)) * 2 + Math.sign(P.x - c.x) * 2.5;
    P.speed *= 0.93;
  }
  P.x += push;
  const hx = (P.x + c.x) / 2, hz = c.z > 0 ? c.z - c.halfL : c.z + c.halfL;
  fx.emitSparks(hx, P.y + 0.5, frontal ? hz : 0, 40, { spread: 6, up: 3, vz: P.speed * 0.2, life: 0.6 });
  G.shake = Math.max(G.shake, 0.6);
  P.combo = 1; P.comboTimer = 0;
  P.bumpCooldown = 0.35;
  ui.popup('BUMP', true);
  audio.bump();
}

function gameOver() {
  G.mode = 'gameover';
  const score = Math.floor(P.score);
  const isBest = score > G.best;
  if (isBest) { G.best = score; storageSet(STORAGE.best, score); }
  ui.setHud(false);
  document.getElementById('touch').classList.add('hidden');
  ui.setSpeedLines(0);
  ui.showGameOver({ score, distance: P.distance, topSpeed: P.topSpeed, nearMisses: P.nearMisses, best: G.best, isBest, rivalLead: rival.active ? rival.lead : null, rivalName: rival.def ? rival.def.name : '' });
  audio.setMusicLevel(0.3);
}

// ---------------------------------------------------------------- per-mode updates
function computeRpm(dt, throttle) {
  const vmax = CARS[G.carIndex].maxSpeed / 3.6;
  const th = [0, 0.11, 0.24, 0.39, 0.56, 0.75, 1.0];
  const r = Math.min(P.speed / vmax, 1.05);
  let g = 0;
  while (g < 5 && r >= th[g + 1]) g++;
  const f = Math.min(1.1, (r - th[g]) / (th[g + 1] - th[g]));
  const target = P.speed < 0.5 ? (throttle ? 5200 : 900) : 1800 + f * 5600;
  P.rpm += (target - P.rpm) * Math.min(1, dt * 8);
  P.gear = P.speed < 0.5 ? 'N' : g + 1;
}

function updateShowcase(dt) {
  const target = G.mode === 'garage' ? 0 : 30;
  P.speed += (target - P.speed) * (1 - Math.exp(-dt * 1.2));
  if (Math.abs(P.speed - target) < 0.05) P.speed = target;
  const dz = P.speed * dt;
  world.update(dz, camera, dt);
  fx.update(dt, dz);
  const tx = G.mode === 'garage' ? 2 : 2 + Math.sin(G.time * 0.35) * 0.7;
  const prevX = P.x;
  P.x += (tx - P.x) * Math.min(1, dt * 1.5);
  const lat = (P.x - prevX) / Math.max(dt, 1e-4);
  // the flying car shows off by hovering
  const hoverT = player.canFly ? 0.9 + Math.sin(G.time * 1.6) * 0.15 : 0;
  P.y += (hoverT - P.y) * Math.min(1, dt * 2);
  P.fly += ((player.canFly ? 1 : 0) - P.fly) * Math.min(1, dt * 2);
  player.group.position.set(P.x, P.y, 0);
  player.group.rotation.set(0, -lat * 0.03, player.canFly ? Math.sin(G.time * 1.1) * 0.03 : 0);
  player.update(dt, P.speed, lat * 0.3, false, false, G.time, P.fly, P.y);

  // Orbit camera
  let pos, look;
  if (G.mode !== 'garage') {
    const a = G.time * 0.12 + 0.6;
    pos = tmpV.set(P.x + Math.sin(a) * 5.6, 1.9 + P.y + Math.sin(G.time * 0.3) * 0.5, Math.cos(a) * 8.5);
    look = new THREE.Vector3(P.x - 1.2, 0.8 + P.y, 0);
  } else {
    const a = G.time * 0.25 + G.dragAngle + 0.9;
    pos = tmpV.set(P.x + Math.sin(a) * 5.4, 2.3 + P.y, Math.cos(a) * 6.0);
    look = new THREE.Vector3(P.x, -0.35 + P.y, 0);
  }
  camBase.lerp(pos, 1 - Math.exp(-dt * 3));
  camLook.lerp(look, 1 - Math.exp(-dt * 3));
  camera.position.copy(camBase);
  camera.lookAt(camLook);
  setFov(G.mode === 'menu' ? 50 : 46, dt);

  const k = G.mode === 'garage' ? 1 : 0.45;
  showLight.intensity += (10 * k - showLight.intensity) * Math.min(1, dt * 3);
  showRim.intensity += (14 * k - showRim.intensity) * Math.min(1, dt * 3);
  showLight.position.set(P.x, 10, 3);
  showLight.target.position.set(P.x, 0, 0);
  showRim.position.set(P.x - 2, 2.5, -5);

  computeRpm(dt, false);
  audio.update({ rpm: P.rpm, load: 0.15, engine: 0.55, wind: P.speed / 90, electric: player.canFly, hover: P.fly });
}

function updateCountdown(dt) {
  G.countdown -= dt;
  const n = Math.ceil(G.countdown);
  if (n !== G.lastCount && n > 0) {
    G.lastCount = n;
    ui.countdown(String(n));
    audio.beep(false);
  }
  if (G.countdown <= 0) {
    ui.countdown('GO!');
    audio.beep(true);
    G.mode = 'playing';
    if (G.mp) G.mp.t0 = G.time;
    setTimeout(() => { if (G.mode === 'playing' || G.mode === 'paused') ui.countdown(null); }, 900);
  }
  world.update(0, camera, dt);
  rival.update(dt, P, traffic, G.time, false);
  if (G.mp) { mp.update(dt, P.distance, G.time); mp.sendState(dt, mpState()); }
  if (tilt.enabled) calibrateTilt();            // whatever angle you hold the phone at = straight
  pt.rev(dt, input.up);
  P.rpm = pt.rpm; P.gear = 'N';
  // revving on the line: the body squats and rocks with the engine
  const rev = input.up ? 1 : 0;
  updateSuspension(dt, rev * 2.5, 0, 0);
  applyBodyPose();
  player.update(dt, 0, 0, input.down, false, G.time, 0, 0);
  fadeShowLights(dt);
  updateChaseCamera(dt);
  audio.update({ rpm: P.rpm, load: input.up ? 0.9 : 0.1, engine: 1, wind: 0, electric: player.canFly });
  pushHud();
}

// Spring-damper suspension: pitch from longitudinal acceleration, roll from lateral acceleration,
// heave from small road bumps. Gives the car visible weight.
function updateSuspension(dt, longAcc, latAcc, sf) {
  const k = 70, c = 8.5;                         // stiffness, damping
  const pitchT = THREE.MathUtils.clamp(longAcc * 0.0028, -0.07, 0.05);
  const rollT = THREE.MathUtils.clamp(latAcc * 0.0045, -0.08, 0.08);
  P.pitchV += ((pitchT - P.pitch) * k - P.pitchV * c) * dt;
  P.pitch += P.pitchV * dt;
  P.rollV += ((rollT - P.roll) * k - P.rollV * c) * dt;
  P.roll += P.rollV * dt;
  const d = P.distance;
  P.heave = (Math.sin(d * 1.9) * 0.5 + Math.sin(d * 0.71 + 1.3) * 0.35 + Math.sin(d * 3.7) * 0.15) * 0.012 * sf * (1 - P.fly);
}

function applyBodyPose() {
  player.body.rotation.x = P.pitch;
  player.body.rotation.z = P.roll;
  player.body.position.y = P.heave;
}

function updatePlaying(dt) {
  const def = CARS[G.carIndex];
  const finished = !!(G.mp && G.mp.finished);
  const throttle = input.up && !finished;
  const brake = input.down || (finished && P.speed > 12);
  const keySteer = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  const steer = keySteer !== 0 ? keySteer : (tilt.enabled ? tilt.axis : 0);
  P.bumpCooldown = Math.max(0, P.bumpCooldown - dt);

  // ---- nitro
  const wasNitro = P.nitroActive;
  P.nitroActive = input.nitro && P.nitro > 0.01 && P.speed > 5;
  if (P.nitroActive && !wasNitro) audio.nitroStart();
  if (P.nitroActive) P.nitro = Math.max(0, P.nitro - dt / (4.2 * def.nitro));
  else P.nitro = Math.min(1, P.nitro + dt * 0.035);
  P.nitroBlend += ((P.nitroActive ? 1 : 0) - P.nitroBlend) * Math.min(1, dt * 4);

  // ---- flight (AERO ION): thrust holds a target altitude against gravity
  const flying = !!def.flying;
  if (flying) {
    const lift = (input.rise ? 1 : 0) - (input.sink ? 1 : 0);
    P.altTarget = THREE.MathUtils.clamp(P.altTarget + lift * 7 * dt, 0, MAX_ALTITUDE);
    // thrust = gravity compensation + PD controller; net vertical acceleration is limited like a real lift system
    const thrust = GRAVITY + THREE.MathUtils.clamp((P.altTarget - P.y) * 5 - P.vy * 3.6, -GRAVITY * 0.9, 12);
    const engaged = P.altTarget > 0.05 || P.y > 0.05;
    P.vy += ((engaged ? thrust : 0) - GRAVITY) * dt;
    P.y += P.vy * dt;
    if (P.y <= 0) {
      if (P.vy < -4) { G.shake = Math.max(G.shake, Math.min(1, -P.vy * 0.08)); audio.thud(-P.vy); }
      P.y = 0; P.vy = 0;
    }
    P.fly += ((P.y > 0.12 || P.altTarget > 0.05 ? 1 : 0) - P.fly) * Math.min(1, dt * 3);
  }

  // ---- longitudinal: real powertrain (power-limited acceleration, drag, gearbox, ≈1 g brakes)
  const vmaxBase = def.maxSpeed / 3.6;
  const a = pt.step(dt, P.speed, throttle || P.nitroActive ? 1 : 0, brake ? 1 : 0, P.nitroActive, P.fly > 0.5);
  P.speed = Math.max(0, P.speed + a * dt);
  P.accel += (a - P.accel) * Math.min(1, dt * 5);
  if (pt.shifted > 0) {                           // gear change: drive cuts, the body pitches forward
    P.pitchV -= 0.32;
    G.shake = Math.max(G.shake, 0.1);
    audio.shift();
  }

  // ---- lateral: tyre grip limits how fast lateral velocity can change (inertia)
  const sf = Math.min(1, P.speed / 8);
  const steerSpeed = (6 + P.speed * 0.06) * def.handling * (P.fly > 0.5 ? 0.85 : 1);
  const target = steer * steerSpeed * Math.max(sf, P.fly * 0.6);
  const grip = (P.fly > 0.5 ? 16 : 26) * def.handling;  // max lateral accel (m/s²)
  const prevLat = P.latVel;
  P.latVel += THREE.MathUtils.clamp((target - P.latVel) * 7, -grip, grip) * dt;
  const latAcc = (P.latVel - prevLat) / Math.max(dt, 1e-4);
  P.x += P.latVel * dt;
  P.scraping = false;
  const limit = P.y > 1.2 ? 8.2 : PLAYER_LIMIT;   // flying above the barriers gives a little more room
  if (Math.abs(P.x) > limit) {
    const s = Math.sign(P.x);
    P.x = s * limit;
    if (P.speed > 3 && P.y < 1.2) {
      P.scraping = true;
      P.speed *= 1 - 0.55 * dt;
      fx.emitSparks(s * (limit + 0.9), 0.5 + P.y, (Math.random() - 0.3) * 3, 6, { spread: 3, up: 3, vz: 6, vx: -s * 2, life: 0.5 });
      G.shake = Math.max(G.shake, 0.25);
    }
    if (Math.sign(P.latVel) === s) P.latVel *= -0.3;  // bounce off the barrier
  }

  const dz = P.speed * dt;
  P.distance += dz;
  P.score += dz * (0.5 + P.speed / 40) * (P.nitroActive ? 1.5 : 1);
  P.topSpeed = Math.max(P.topSpeed, P.speed * 3.6);
  if (P.comboTimer > 0) { P.comboTimer -= dt; if (P.comboTimer <= 0) P.combo = 1; }

  // ---- world + traffic
  world.update(dz, camera, dt);
  traffic.update(dt, P.speed, P.distance, G.time, true);
  rival.update(dt, P, traffic, G.time, true);
  trackRival();
  if (G.mp) updateMpSession(dt);
  fx.update(dt, dz);

  checkCollisions();
  if (G.mode !== 'playing') return; // crashed this frame

  // ---- car visuals
  updateSuspension(dt, P.fly > 0.5 ? P.vy * 3 : P.accel, latAcc + P.latVel * 0.8, sf);
  const yawT = -P.latVel * 0.03;
  P.yaw += (yawT - P.yaw) * Math.min(1, dt * 8);
  player.group.position.set(P.x, P.y, 0);
  // when flying the car banks into turns like an aircraft and pitches with climb/descent
  const bank = -P.latVel * 0.035 * P.fly;
  const climb = THREE.MathUtils.clamp(P.vy * 0.03, -0.18, 0.18) * P.fly;
  player.group.rotation.set(climb, P.yaw, bank);
  applyBodyPose();
  player.update(dt, P.speed, steer * sf, brake, P.nitroActive, G.time, P.fly, P.y);

  P.rpm = pt.rpm;
  P.gear = P.speed < 0.5 && !throttle ? 'N' : pt.gear;
  fadeShowLights(dt);
  updateChaseCamera(dt);

  const sp = Math.min(1, P.speed / vmaxBase);
  ui.setSpeedLines(Math.max(P.nitroBlend * 0.75, (sp - 0.72) * 1.4));
  audio.update({ rpm: P.rpm, load: throttle || P.nitroActive ? 1 : 0.05, engine: 1, wind: P.speed / 90 + P.y * 0.01, nitro: P.nitroActive, scrape: P.scraping, electric: flying, hover: P.fly });

  if (G.hintTimer > 0) { G.hintTimer -= dt; if (G.hintTimer <= 0) ui.hint(false); }
  pushHud();
}

// 3-D box collisions against traffic (ground + air) and fixed overhead structures.
function checkCollisions() {
  const PH = 1.28;                                // player body height
  const py0 = P.y, py1 = P.y + PH;
  const bodies = rival.active && !rival.hit ? traffic.active.concat([rival]) : traffic.active;
  for (const c of bodies) {
    if (c.hit) continue;
    const dxAbs = Math.abs(c.x - P.x);
    const ox = c.halfW + PLAYER_HALF_W - dxAbs;
    const oz = c.halfL + PLAYER_HALF_L - Math.abs(c.z);
    const oy = Math.min(py1, c.y + c.height) - Math.max(py0, c.y);
    if (ox > 0 && oz > 0 && oy > 0) {
      const ahead = c.z < 0;
      const closing = ahead ? P.speed - c.speed : c.speed - P.speed;
      const sideHit = ox < oz && ox < 0.8;
      const hitPoint = [(P.x + c.x) / 2, Math.max(py0, c.y) + 0.6, ahead ? c.z + c.halfL : c.z - c.halfL];
      if (sideHit && Math.abs(P.latVel) < 12) {
        if (P.bumpCooldown <= 0) bump(c, false, Math.sign(P.x - c.x) * (ox + 0.05));
        else P.x += Math.sign(P.x - c.x) * (ox + 0.05);
      } else if (!sideHit && closing < 8) {
        // low-speed nudge: separate along z by moving the traffic car
        c.z = ahead ? -(c.halfL + PLAYER_HALF_L + 0.1) : c.halfL + PLAYER_HALF_L + 0.1;
        if (P.bumpCooldown <= 0) bump(c, true, 0);
      } else {
        triggerCrash(c, Math.max(closing, Math.abs(P.latVel)), hitPoint);
        return;
      }
      continue;
    }
    // near miss: closest distance between the two boxes when the car passes
    if (!c.passed && c.z > 0) {
      c.passed = true;
      const hGap = Math.max(0, dxAbs - c.halfW - 1.0);
      const vGap = Math.max(0, P.y - (c.y + c.height), c.y - py1);
      const gap = Math.hypot(hGap, vGap);
      if (gap < 1.15 && P.speed > 20) {
        P.nearMisses++;
        const pts = 250 * P.combo;
        P.score += pts;
        P.nitro = Math.min(1, P.nitro + 0.1);
        ui.popup(vGap > hGap ? `SKIM +${pts}` : `NEAR MISS +${pts}`);
        audio.nearMiss();
        P.combo = Math.min(5, P.combo + 1);
        P.comboTimer = 3.5;
      }
    }
  }

  if (P.y < 5) return; // overhead structures are only reachable in the air
  for (const g of world.gantries) {
    if (Math.abs(g.position.z) < 0.4 + PLAYER_HALF_L && py1 > GANTRY_Y[0] && py0 < world.gantryTop) {
      triggerCrash(null, P.speed, [P.x, GANTRY_Y[0], g.position.z]);
      return;
    }
  }
  for (const l of world.lamps) {
    const side = Math.sign(l.position.x);
    if (P.x * side > LAMP_ARM_X && Math.abs(l.position.z) < 0.3 + PLAYER_HALF_L && py1 > LAMP_ARM_Y[0] && py0 < LAMP_ARM_Y[1]) {
      triggerCrash(null, P.speed, [P.x, LAMP_ARM_Y[0], l.position.z]);
      return;
    }
  }
}

// After a fatal crash the player car is a free rigid body: gravity, bounces, flips, friction.
function updateCrashing(dt) {
  crash.t += dt;
  const ts = crash.t < 0.9 ? 0.35 : 1;            // brief slow motion
  const sdt = dt * ts;

  crash.vy -= GRAVITY * sdt;
  P.y += crash.vy * sdt;
  crash.rx += crash.wx * sdt;
  crash.rz += crash.wz * sdt;
  crash.yaw += crash.spin * sdt;
  P.x = THREE.MathUtils.clamp(P.x + crash.vx * sdt, -8.4, 8.4);
  if (Math.abs(P.x) >= 8.4) crash.vx *= -0.3;

  const floor = restHeight(1.28, crash.rx, crash.rz);
  const grounded = P.y <= floor + 0.02;
  if (P.y < floor) {
    if (crash.vy < -3) {
      fx.emitSparks(P.x, floor, 0, 60 + Math.min(120, -crash.vy * 12), { spread: 9, up: 4, vz: P.speed * 0.3, life: 0.8 });
      fx.emitSmoke(P.x, floor + 0.3, 0, 6, true);
      fx.emitDebris(P.x, floor + 0.3, 0, 6, CARS[G.carIndex].color);
      G.shake = Math.max(G.shake, Math.min(1.2, -crash.vy * 0.1));
      audio.thud(-crash.vy);
    }
    P.y = floor;
    crash.vy = crash.vy < -1.5 ? -crash.vy * 0.3 : 0;
    crash.wx *= 0.55; crash.wz *= 0.55; crash.spin *= 0.7;
    P.speed *= 0.8;
  }
  if (grounded) {
    P.speed *= Math.exp(-sdt * 1.8);
    crash.spin *= Math.exp(-sdt * 1.6);
    crash.vx *= Math.exp(-sdt * 2.5);
    if (Math.abs(crash.vy) < 0.5) {
      crash.wx *= Math.exp(-sdt * 4); crash.wz *= Math.exp(-sdt * 4);
      crash.rx += (Math.round(crash.rx / Math.PI) * Math.PI - crash.rx) * Math.min(1, sdt * 4);
      crash.rz += (Math.round(crash.rz / Math.PI) * Math.PI - crash.rz) * Math.min(1, sdt * 4);
    }
    if (P.speed > 5 && Math.random() < 0.5) fx.emitSparks(P.x, 0.15, 0, 4, { spread: 4, up: 2, vz: P.speed * 0.3 });
  } else {
    P.speed *= Math.exp(-sdt * 0.3);               // airborne: only air drag
  }

  const dz = P.speed * sdt;
  world.update(dz, camera, sdt);
  traffic.update(sdt, P.speed, P.distance, G.time, false);
  rival.update(sdt, P, traffic, G.time, true);
  fx.update(sdt, dz);

  player.group.position.set(P.x, P.y, 0);
  player.group.rotation.set(crash.rx, crash.yaw, crash.rz);
  player.body.rotation.set(0, 0, 0);
  player.body.position.y = 0;
  player.update(sdt, grounded ? P.speed : 0, 0, true, false, G.time, 0, P.y);
  if (Math.random() < 0.25) fx.emitSmoke(P.x, P.y + 0.8, 0, 1, true);

  updateChaseCamera(dt, 3 * Math.min(1, crash.t));
  audio.update({ rpm: 900, load: 0, engine: Math.max(0, 1 - crash.t), wind: P.speed / 90, scrape: grounded && P.speed > 6 });
  ui.setSpeedLines(0);
  pushHud();
  if (G.mp) { mp.update(dt, P.distance, G.time); mp.sendState(dt, mpState()); }
  if (crash.t > 2.8) { if (G.mp) respawnMp(); else gameOver(); }
}

function updateGameOver(dt) {
  P.speed *= Math.exp(-dt * 1.5);
  const dz = P.speed * dt;
  world.update(dz, camera, dt);
  traffic.update(dt, P.speed, P.distance, G.time, false);
  rival.update(dt, P, traffic, G.time, true);
  fx.update(dt, dz);
  if (Math.random() < 0.12) fx.emitSmoke(P.x, P.y + 0.8, 0, 1, true);
  const a = G.time * 0.15;
  tmpV.set(P.x + Math.sin(a) * 9, 3.2 + P.y, Math.cos(a) * 9);
  camBase.lerp(tmpV, 1 - Math.exp(-dt * 1.2));
  camLook.lerp(tmpV.set(P.x, 0.6 + P.y, 0), 1 - Math.exp(-dt * 2));
  camera.position.copy(camBase);
  camera.lookAt(camLook);
  setFov(55, dt);
  audio.update({ engine: 0 });
}

function fadeShowLights(dt) {
  showLight.intensity *= Math.exp(-dt * 4);
  showRim.intensity *= Math.exp(-dt * 4);
}

// Driver's-eye view from inside the car. Follows the body exactly (suspension pitch/roll included).
function updateCockpitCamera(dt) {
  const sf = Math.min(1, P.speed / 90);
  player.group.updateMatrixWorld(true);
  tmpV.copy(player.eye);
  player.body.localToWorld(tmpV);
  G.shake *= Math.exp(-dt * 3);
  const s = (G.shake + sf * sf * 0.02 * (1 - P.fly)) * 0.25;  // engine/road vibration
  const t = G.time;
  camera.position.set(tmpV.x + Math.sin(t * 43.1) * s * 0.3, tmpV.y + Math.sin(t * 37.3) * s * 0.4, tmpV.z);
  player.body.getWorldQuaternion(camera.quaternion);
  if (input.look) camera.quaternion.multiply(FLIP_Y);
  player.setLookBack(input.look);
  // keep the chase camera parked nearby so switching back is smooth
  camBase.set(P.x * 0.85, P.y + 2.3, 6.2);
  camLook.set(P.x * 0.9, P.y + 0.9, -10);
  setFov(60 + sf * 8 + P.nitroBlend * 4, dt);
  const extra = rival.active ? [`AI ${rival.lead > 0 ? '+' : '-'}${Math.round(Math.abs(rival.lead))} M`] : [];
  if (player.canFly) extra.push(`ALT ${P.y.toFixed(1)} M`);
  player.updateInterior((input.right ? 1 : 0) - (input.left ? 1 : 0) || (tilt.enabled ? tilt.axis : 0),
    P.speed * 3.6, P.rpm, P.gear, P.nitro, extra);
}

function toggleView() {
  G.view = G.view === 'cockpit' ? 'chase' : 'cockpit';
  storageSet('sr3d_view', G.view);
  document.getElementById('viewBtn').classList.toggle('active', G.view === 'cockpit');
  ui.popup(G.view === 'cockpit' ? 'COCKPIT VIEW' : 'CHASE VIEW');
}

function updateChaseCamera(dt, extraBack = 0) {
  const cockpit = G.view === 'cockpit' && G.mode !== 'crashing' && G.mode !== 'gameover';
  player.setInterior(cockpit);
  document.body.classList.toggle('cockpit', cockpit);
  if (cockpit) { updateCockpitCamera(dt); return; }
  const sf = Math.min(1, P.speed / 90);
  const nf = P.nitroBlend;
  const portrait = camera.aspect < 1 ? (1 - camera.aspect) * 4 : 0; // pull back on tall screens
  const x = P.x * 0.85;
  // lower and closer than before: nearby road detail streaming past is what sells the speed
  const back = input.look && G.mode !== 'crashing';           // look-back: camera swings in front of the car
  const dist = 5.9 + sf * 1.0 + nf * 0.8 + extraBack + portrait + P.fly * 1.2;
  const z = back ? -(dist - 0.4) : dist;
  let y = P.y + 2.2 + sf * 0.15 + extraBack * 0.5 + portrait * 0.4;
  // Never let the camera end up inside a vehicle: rise over anything that occupies the camera spot
  for (const c of traffic.active) {
    if (Math.abs(c.x - x) < c.halfW + 1.3 && Math.abs(c.z - z) < c.halfL + 1.6 && y > c.y - 1 && y < c.y + c.height + 1.3) {
      y = c.y + c.height + 1.3;
    }
  }
  tmpV.set(x, y, z);
  tmpL.set(P.x * 0.9, P.y + 0.9, back ? 14 : -10);
  if (back !== G.lookWas) {                                    // cut instantly instead of flying through the car
    camBase.copy(tmpV); camLook.copy(tmpL); G.lookWas = back;
  } else {
    camBase.lerp(tmpV, 1 - Math.exp(-dt * 7));
    camLook.lerp(tmpL, 1 - Math.exp(-dt * 9));
  }

  // Smooth shake (impacts, barrier scrapes, nitro) instead of random per-frame jitter
  G.shake *= Math.exp(-dt * 3);
  const s = G.shake + nf * 0.03 + sf * sf * 0.03 * (1 - P.fly);   // road vibration grows with speed
  const t = G.time;
  const ox = (Math.sin(t * 41.3) + Math.sin(t * 27.9)) * 0.5 * s * 0.25;
  const oy = (Math.sin(t * 37.7) + Math.sin(t * 19.1)) * 0.5 * s * 0.18;
  camera.position.set(camBase.x + ox, camBase.y + oy, camBase.z);
  camera.lookAt(camLook);
  camera.rotation.z -= P.latVel * (0.0025 + P.fly * 0.004);
  setFov(62 + sf * 15 + nf * 8, dt);
}

function setFov(target, dt) {
  const aspect = camera.aspect;
  const t = target + (aspect < 1 ? (1 - aspect) * 30 : 0);
  camera.fov += (t - camera.fov) * Math.min(1, dt * 4);
  camera.updateProjectionMatrix();
}

function pushHud() {
  ui.updateHud({
    speedKmh: P.speed * 3.6, gear: P.gear, nitro: P.nitro, nitroActive: P.nitroActive,
    score: P.score, distance: P.distance, best: Math.max(G.best, Math.floor(P.score)),
    combo: P.combo, comboOn: P.combo > 1 && P.comboTimer > 0,
  });
  if (player.canFly) ui.setAltitude(P.y);
}

// ---------------------------------------------------------------- input / buttons
function toggleMute() {
  audio.setMuted(!audio.muted);
  storageSet(STORAGE.muted, audio.muted ? 1 : 0);
  ui.setMuted(audio.muted);
}

function onKey(e) {
  audio.init();
  if (G.mode === 'city' && !$id('findBox').hidden) { if (e.code === 'Escape') openFind(false); return; }
  if (G.mode === 'city' && taxi.active && taxi.key(e.code)) return;
  if (G.mode === 'taxigarage') {
    if (e.code === 'Enter') startTaxiShift();
    else if (e.code === 'Escape') actions.taxiBack();
    return;
  }
  switch (e.code) {
    case 'KeyP':
    case 'Escape':
      if (G.mode === 'playing' || G.mode === 'countdown' || G.mode === 'city') pauseGame();
      else if (G.mode === 'paused') resumeGame();
      else if (G.mode === 'garage') leaveGarage();
      else if (G.mode === 'mplobby' && !mp.connected && e.code === 'Escape') toMenu();
      break;
    case 'KeyM': toggleMute(); break;
    case 'KeyH': if (G.mode === 'city') toggleHud(); break;
    case 'KeyC': if (G.mode === 'playing' || G.mode === 'countdown' || G.mode === 'city') toggleView(); break;
    case 'Enter':
      if (G.mode === 'menu' || G.mode === 'gameover') { G.mp = null; startRun(); }
      else if (G.mode === 'mplobby' && !mp.connected) mpConnect();
      else if (G.mode === 'garage') selectGarageCar();
      break;
    case 'ArrowLeft': case 'KeyA': if (G.mode === 'garage') changeGarageCar(-1); break;
    case 'ArrowRight': case 'KeyD': if (G.mode === 'garage') changeGarageCar(1); break;
    default: break;
  }
}

const actions = {
  play: () => { G.mp = null; startRun(); },
  garage: toGarage,
  back: leaveGarage,
  prev: () => changeGarageCar(-1),
  next: () => changeGarageCar(1),
  select: selectGarageCar,
  resume: resumeGame,
  restart: () => {
    if (G.mp) { resumeGame(); respawnMp(); }
    else if (G.inCity) {
      G.mode = 'city'; ui.show(null);
      const shift = taxi.active && taxi.def;
      city.enter(player.def, { taxi: !!shift });
      if (shift) taxi.start(taxi.def);
    }
    else startRun();
  },
  taxi: () => openTaxiGarage(),
  taxiCar: (btn) => pickTaxiCar(btn.dataset.car),
  taxiStart: () => startTaxiShift(),
  taxiBack: () => { setPlayerCar(G.carIndex); toMenu(); },
  taxiAccept: () => taxi.accept(),
  taxiSkip: () => taxi.decline(),
  findOpen: () => openFind(true),
  findClose: () => openFind(false),
  hud: () => toggleHud(),
  city: () => startCity('osm'),
  cityClassic: () => startCity('classic'),
  fullscreen: () => goFullscreen(),
  fsClose: () => showFsGuide(false),
  menu: () => {
    if (G.garageIndex !== G.carIndex) setPlayerCar(G.carIndex);
    if (mp.connected) openMp(); else toMenu();
  },
  mpOpen: () => openMp(),
  map: () => {
    G.map = G.map === 'tashkent' ? 'neon' : 'tashkent';
    storageSet('sr3d_map', G.map);
    world.setTheme(G.map);
    traffic.clear();
    renderMapButton();
  },
  settings: () => openSettings(),
  settingsBack: () => closeSettings(),
  set: (btn) => setSetting(btn),
  mpBack: () => { stopScan(); toMenu(); },
  mpConnect: () => mpConnect(),
  mpJoinRoom: (btn) => mpConnect(btn.dataset.addr),
  mpScan: () => startScan(),
  mpHost: () => hostRoom(),
  onlineHost: () => onlineHostRoom(),
  onlineJoin: () => onlineJoinRoom(),
  onlineShare: () => shareOnlineLink(),
  mpLeave: () => { mp.disconnect(); stopHosting(); G.mp = null; G.onlineCode = null; renderMp(); if (WIFI_OK) startScan(); },
  mpMode: (btn) => mp.send({ t: 'config', mode: btn.dataset.mode }),
  mpDist: (btn) => mp.send({ t: 'config', distance: Number(btn.dataset.dist) }),
  mpStart: () => {
    const l = mp.lobby;
    if (l && l.phase === 'driving' && !mp.isHost) mp.send({ t: 'join' });
    else if (l && l.phase !== 'lobby') mp.send({ t: 'end' });
    else { mp.send({ t: 'config', map: G.map }); mp.send({ t: 'start' }); }   // everyone drives the host's map
  },
  mpTraffic: (btn) => mp.send({ t: 'config', traffic: btn.dataset.val }),
  trafficCycle: () => {
    S.traffic = { low: 'normal', normal: 'high', high: 'low' }[S.traffic];
    storageSet('sr3d_traffic', S.traffic);
    applyTraffic();
    renderSettings();
  },
  mpToLobby: () => openMp(),
  pause: () => (G.mode === 'paused' ? resumeGame() : pauseGame()),
  mute: toggleMute,
  view: toggleView,
  tilt: async () => {
    const on = await setTilt(!tilt.enabled);
    storageSet(STORAGE.tilt, on ? 1 : 0);
    applyTiltUi(on);
    if (on) calibrateTilt();
  },
};

function applyTraffic() {
  traffic.density = S.traffic;
  document.querySelectorAll('.traffic-toggle span').forEach((s) => { s.textContent = `TRAFFIC: ${S.traffic.toUpperCase()}`; });
}

function renderMapButton() {
  document.querySelectorAll('.map-toggle span').forEach((s) => { s.textContent = G.map === 'tashkent' ? 'MAP: TOSHKENT' : 'MAP: NEON CITY'; });
}

function applyTiltUi(on) {
  document.body.classList.toggle('tilt-on', on);
  document.querySelectorAll('.tilt-toggle span').forEach((s) => { s.textContent = on ? 'STEER: TILT' : 'STEER: BUTTONS'; });
}

// Rival progress: HUD gap + overtake events
function trackRival() {
  if (!rival.active) return;
  const lead = rival.lead;                      // > 0: rival is ahead of you
  const ahead = lead > 0;
  if (G.rivalAhead !== ahead && P.distance > 30) {
    if (ahead) { ui.popup('RIVAL PASSED YOU', true); }
    else { P.score += 1000; ui.popup('OVERTOOK RIVAL +1000'); audio.nearMiss(); }
  }
  G.rivalAhead = ahead;
  ui.setRival(lead, rival.def.name);
}

// ================================================================ graphics settings
// Presets. Resolution is a fraction of the screen's native pixels (Retina / phone screens included).
const GFX = {
  low:    { res: 0.5,  shadows: 0,    soft: false, msaa: 0, bloom: false, lights: 2, label: 'Fast: no shadows, no glow, 2 street lights' },
  medium: { res: 0.75, shadows: 1024, soft: false, msaa: 2, bloom: true,  lights: 4, label: 'Shadows 1024 · MSAA 2× · glow · 4 street lights' },
  high:   { res: 1.0,  shadows: 2048, soft: false, msaa: 4, bloom: true,  lights: 8, label: 'Native resolution · shadows 2048 · MSAA 4× · 8 street lights' },
  ultra:  { res: 1.0,  shadows: 4096, soft: true,  msaa: 8, bloom: true,  lights: 8, label: 'Max: soft shadows 4096 · MSAA 8× · native resolution' },
};
// Phones: a softer HIGH so the default stays smooth; ULTRA is never capped
const MOBILE_CAP = { pr: 1.6, shadows: 1024, msaa: 2, lights: 4 };
const TIERS = ['low', 'medium', 'high'];
const S = {
  quality: storageGet('sr3d_quality', MOBILE ? 'auto' : 'high'),
  res: storageGet('sr3d_res', 'preset'),          // 'preset' | '0.5' | '0.75' | '1'
  fps: Number(storageGet('sr3d_fps', '0')) || 0,  // 0 = no limit (follows the display: 60/120/144 Hz)
  showFps: storageGet('sr3d_showfps', '1') === '1',
  traffic: storageGet('sr3d_traffic', 'normal'),   // low | normal | high
};
if (!['low', 'normal', 'high'].includes(S.traffic)) S.traffic = 'normal';
// smoother by default: everyone moves to AUTO graphics once (it lowers resolution and effects by
// itself whenever the frame rate drops); the player can still pick a fixed preset afterwards
if (storageGet('sr3d_auto_v2', '') !== '1') {
  storageSet('sr3d_auto_v2', '1');
  if (S.quality !== 'auto') { S.quality = 'auto'; storageSet('sr3d_quality', 'auto'); }
  if (S.res === '4k') { S.res = 'preset'; storageSet('sr3d_res', 'preset'); }
}
if (!GFX[S.quality] && S.quality !== 'auto') S.quality = 'high';

Q.tier = 'high';   // AUTO's current preset

function currentPreset() {
  const name = S.quality === 'auto' ? Q.tier : S.quality;
  const base = GFX[name] || GFX.high;
  if (!MOBILE || name === 'ultra') return base;
  return {
    ...base,
    shadows: Math.min(base.shadows, MOBILE_CAP.shadows),
    msaa: Math.min(base.msaa, MOBILE_CAP.msaa),
    lights: Math.min(base.lights, MOBILE_CAP.lights),
    prCap: MOBILE_CAP.pr,
  };
}

function applyGraphics() {
  const preset = currentPreset();
  const dpr = window.devicePixelRatio || 1;
  // resolution
  const frac = S.res === 'preset' ? preset.res : Number(S.res);
  let pr = Math.min(3, Math.max(0.5, dpr * frac));
  // 4K: render 3840 pixels across the long side of the screen, then scale down (supersampling = sharpest picture)
  if (S.res === '4k') pr = Math.min(5, Math.max(dpr, 3840 / Math.max(window.innerWidth, window.innerHeight)));
  if (preset.prCap && S.res === 'preset') pr = Math.min(pr, preset.prCap);
  Q.max = pr;
  Q.min = MOBILE ? Math.min(pr, 0.75) : Math.min(pr, Math.max(0.5, dpr * 0.5));
  setQuality(pr);
  // shadows
  const want = preset.shadows;
  moon.castShadow = want > 0;
  if (want > 0 && moon.shadow.mapSize.x !== want) {
    moon.shadow.mapSize.set(want, want);
    if (moon.shadow.map) { moon.shadow.map.dispose(); moon.shadow.map = null; }
  }
  const type = preset.soft ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
  if (renderer.shadowMap.type !== type) {
    renderer.shadowMap.type = type;
    scene.traverse((o) => { if (o.material) [].concat(o.material).forEach((m) => { m.needsUpdate = true; }); });
  }
  // anti-aliasing (MSAA on the composer's render targets)
  if (renderer.capabilities.isWebGL2) {
    const samples = Math.min(preset.msaa, renderer.capabilities.maxSamples || 4);
    for (const rt of [composer.renderTarget1, composer.renderTarget2]) {
      if (rt.samples !== samples) { rt.samples = samples; rt.dispose(); }
    }
  }
  bloom.enabled = preset.bloom && !G.inCity;   // the sunny city has no glow
  world.setLampLightCount(preset.lights);
  document.getElementById('fps').classList.toggle('hidden', !S.showFps);
  renderSettings();
}

function renderSettings() {
  document.querySelectorAll('[data-action=set]').forEach((b) => {
    b.classList.toggle('on', String(S[b.dataset.key]) === b.dataset.val);
  });
  const preset = GFX[S.quality];
  const el = document.getElementById('gfxInfo');
  if (el) el.textContent = S.quality === 'auto'
    ? `Auto (now ${Q.tier.toUpperCase()}, render ${Math.round(Q.pr * 100) / 100}×): adjusts itself to stay smooth`
    : `${preset.label}${MOBILE && S.quality !== 'ultra' ? ' (phone-tuned)' : ''} · render ${Math.round(Q.pr * 100) / 100}×`;
}

function setSetting(btn) {
  const key = btn.dataset.key, val = btn.dataset.val;
  if (key === 'fps') S.fps = Number(val);
  else if (key === 'showFps') S.showFps = val === 'true';
  else S[key] = val;
  if (key === 'traffic') { applyTraffic(); storageSet('sr3d_traffic', val); renderSettings(); return; }
  if (key === 'quality' && val === 'auto') Q.tier = 'high';
  storageSet({ quality: 'sr3d_quality', res: 'sr3d_res', fps: 'sr3d_fps', showFps: 'sr3d_showfps' }[key],
    key === 'showFps' ? (S.showFps ? 1 : 0) : S[key]);
  applyGraphics();
}

let settingsFrom = 'menu';
function openSettings() {
  settingsFrom = G.mode === 'paused' ? 'pause' : 'menu';
  ui.show('settings');
  renderSettings();
}
function closeSettings() { ui.show(settingsFrom); }

// ================================================================ Wi-Fi multiplayer
const mp = new Multiplayer(scene, {
  onLobby: () => { if (G.mode === 'mplobby') renderMp(); },
  onStart: (m) => startMpSession(m),
  onFinished: (m) => {
    if (!G.mpFinishers.some((f) => f.id === m.id)) G.mpFinishers.push(m);
    if (m.id !== mp.id && G.mp) ui.popup(`${m.name} FINISHED P${m.place}`);
    if (m.id === mp.id && G.mp) {
      G.mp.place = m.place;
      ui.popup(m.place === 1 ? '🏆 YOU WON! 1ST PLACE' : `FINISHED P${m.place}`);
      if (m.place === 1) audio.nearMiss();
    }
    if (G.mode === 'mplobby' && $id('mpResults').classList.contains('active')) showMpResults(G.mpFinishers, true);
  },
  onResults: (m) => { if (m.mode === 'race') showMpResults(m.list); else if (G.mp) openMp(); },
  onDisconnect: () => {
    // the room closed after we crossed the line: still show our result, not just an error
    if (G.mp && G.mp.finished) {
      if (!G.mpFinishers.some((f) => f.id === mp.id)) G.mpFinishers.push({ id: mp.id, name: $id('mpName').value || 'You', time: G.mp.time || 0, place: G.mp.place || G.mp.localPlace || 1 });
      G.onlineCode = null;
      stopHosting();
      showMpResults(G.mpFinishers, false, true);
      return;
    }
    if (G.mode === 'mplobby' && $id('mpResults').classList.contains('active')) {
      G.onlineCode = null;
      stopHosting();
      $id('mpResultNote').textContent = 'The room has closed — the host left.';
      return;
    }
    const wasOnline = !!G.onlineCode;
    G.mp = null;
    G.onlineCode = null;
    stopHosting();
    openMp();
    (wasOnline ? setOnlineStatus : setMpStatus)(wasOnline ? 'The room was closed (host left or the connection dropped).' : 'Disconnected from the room.', true);
  },
  onError: (msg) => (G.onlineCode || !WIFI_OK ? setOnlineStatus : setMpStatus)(msg, true),
});
G.mp = null;
G.mpFinishers = [];

const $id = (id) => document.getElementById(id);
$id('findInput').addEventListener('input', (e) => renderFind(e.target.value));
const mpDefaultAddr = () => {
  const saved = storageGet('sr3d_mp_addr', '');
  if (saved) return saved;
  // if this page was opened from the multiplayer server, that server is the room
  return /^https?:$/.test(location.protocol) && location.host ? location.host : '';
};

// Wi-Fi rooms only work from the apps or a page served over plain http (a https site may not reach the local network)
const WIFI_OK = NATIVE || location.protocol === 'http:';

function setOnlineStatus(text, err = false) {
  const el = $id('mpOnlineStatus');
  el.textContent = text;
  el.classList.toggle('err', err);
}

// ---------- online rooms (internet, room code)
let online = null;   // { code, stop }
let mpBusy = false;  // a join / host is in progress
async function onlineHostRoom() {
  if (mpBusy || mp.connected) return;      // a double tap must not join the room twice
  mpBusy = true;
  try { await onlineHostRoomNow(); } finally { mpBusy = false; }
}
async function onlineHostRoomNow() {
  const name = $id('mpName').value.trim() || 'Racer';
  storageSet('sr3d_name', name);
  stopScan();
  setOnlineStatus('Creating room…');
  try {
    online = await hostOnline();
    await mp.connect(online.socket(), name, G.carIndex);
    G.onlineCode = online.code;
    G.mpAddr = 'CODE ' + online.code;
    setOnlineStatus('');
    renderMp();
  } catch (e) {
    stopHosting();
    setOnlineStatus('Could not create a room. Check the internet connection and try again.', true);
  }
}

async function onlineJoinRoom(codeArg) {
  if (mpBusy || mp.connected) return;      // a double tap must not join the room twice
  mpBusy = true;
  try { await onlineJoinRoomNow(codeArg); } finally { mpBusy = false; }
}
async function onlineJoinRoomNow(codeArg) {
  const code = cleanCode(codeArg || $id('mpCode').value);
  if (code.length !== 5) { setOnlineStatus('Enter the 5-digit room code', true); return; }
  const name = $id('mpName').value.trim() || 'Racer';
  storageSet('sr3d_name', name);
  stopScan();
  setOnlineStatus('Connecting to room ' + code + '…');
  try {
    const sock = await joinOnline(code);
    await mp.connect(sock, name, G.carIndex);
    G.onlineCode = code;
    G.mpAddr = 'CODE ' + code;
    setOnlineStatus('');
    renderMp();
  } catch (e) {
    setOnlineStatus('Room ' + code + ' not found. Check the code — the host must keep the game open.', true);
  }
}

function onlineLink() {
  return location.origin + location.pathname + '?room=' + G.onlineCode;
}

async function shareOnlineLink() {
  const url = onlineLink();
  const text = `STREET RACING 3D — join my room ${G.onlineCode}`;
  try {
    if (navigator.share) { await navigator.share({ title: 'Street Racing 3D', text, url }); return; }
  } catch (e) { if (e && e.name === 'AbortError') return; }
  try { await navigator.clipboard.writeText(url); ui.popup('LINK COPIED'); } catch (e) { window.prompt('Copy this link:', url); }
}

function setMpStatus(text, err = false) {
  const el = $id('mpStatus');
  el.textContent = text;
  el.classList.toggle('err', err);
}

function openMp() {
  if (G.garageIndex !== G.carIndex) setPlayerCar(G.carIndex);
  G.mp = null;
  G.mode = 'mplobby';
  resetInput();
  traffic.clear();
  fx.clear();
  rival.hide();
  mp.clearRemotes();
  player.setInterior(false);
  player.group.rotation.set(0, 0, 0);
  P.y = 0; P.fly = 0;
  document.body.classList.remove('cockpit');
  ui.setHud(false);
  ui.countdown(null);
  ui.setSpeedLines(0);
  document.getElementById('touch').classList.add('hidden');
  if (!$id('mpName').value) $id('mpName').value = storageGet('sr3d_name', '') || `Racer${Math.floor(10 + Math.random() * 89)}`;
  if (!$id('mpAddr').value) $id('mpAddr').value = WIFI_OK ? mpDefaultAddr() : '';
  $id('mpWifi').classList.toggle('hidden', !WIFI_OK);
  ui.show('mp');
  renderHostButton();
  renderMp();
  if (!mp.connected && WIFI_OK) startScan();
}

// ---------- Wi-Fi room list
let scanCtrl = null;
G.rooms = [];
G.scanning = false;

function startScan() {
  if (scanCtrl) scanCtrl.abort();
  scanCtrl = new AbortController();
  const ctrl = scanCtrl;
  G.rooms = [];
  G.scanning = true;
  G.scanProgress = 0;
  renderRooms();
  scanRooms({
    signal: ctrl.signal,
    knownAddrs: [storageGet('sr3d_mp_addr', ''), G.mpAddr || ''],
    onFound: (room) => { if (ctrl === scanCtrl) { G.rooms.push(room); renderRooms(); } },
    onProgress: (p) => { if (ctrl === scanCtrl) { G.scanProgress = p; renderRooms(); } },
  }).finally(() => { if (ctrl === scanCtrl) { G.scanning = false; renderRooms(); } });
}

function stopScan() { if (scanCtrl) { scanCtrl.abort(); scanCtrl = null; } G.scanning = false; }

function renderRooms() {
  const ul = $id('mpRooms');
  if (!ul) return;
  ul.innerHTML = '';
  for (const r of G.rooms) {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.dataset.action = 'mpJoinRoom';
    b.dataset.addr = r.addr;
    const left = document.createElement('span');
    const name = document.createElement('div');
    name.className = 'room-name';
    name.textContent = r.name || 'Room';
    const meta = document.createElement('div');
    meta.className = 'room-meta';
    const what = r.mode === 'free' ? 'FREE DRIVE' : `RACE ${Math.round((r.distance || 3000) / 1000)} KM`;
    const state = r.phase === 'racing' ? ' · RACING NOW' : r.phase === 'driving' ? ' · DRIVING NOW' : '';
    meta.textContent = `${what} · ${r.players}/${r.max} PLAYERS${state} · ${r.host === 'localhost' ? 'this computer' : r.host}`;
    left.append(name, meta);
    const join = document.createElement('span');
    join.className = 'room-join';
    join.textContent = r.players >= r.max ? 'FULL' : 'JOIN';
    b.append(left, join);
    li.appendChild(b);
    ul.appendChild(li);
  }
  if (G.scanning) {
    const li = document.createElement('li');
    li.innerHTML = '<div class="empty">Searching your Wi-Fi for rooms…<div class="scan-bar"><i></i></div></div>';
    li.querySelector('.scan-bar i').style.width = Math.round((G.scanProgress || 0) * 100) + '%';
    ul.appendChild(li);
  } else if (!G.rooms.length) {
    const li = document.createElement('li');
    li.innerHTML = '<div class="empty"></div>';
    li.firstChild.textContent = canHostOnThisDevice()
      ? 'No rooms found on this Wi-Fi. Host one below, and your friends will see it here.'
      : 'No rooms found on this Wi-Fi. Ask a friend with Android to host a room, or run python3 server/mp_server.py on a laptop.';
    ul.appendChild(li);
  }
}

function renderHostButton() {
  const btn = $id('mpHostBtn');
  const hint = $id('mpHostHint');
  const can = canHostOnThisDevice();
  btn.classList.toggle('hidden', !can);
  hint.classList.toggle('hidden', can);
  const plat = nativePlatform();
  hint.textContent = plat === 'ios'
    ? 'Hosting from an iPhone is coming soon. Join a room hosted on an Android phone or a laptop.'
    : 'To host on this computer run: python3 server/mp_server.py — or host from the Android app. Everyone then picks the room from this list.';
}

// ---------- hosting a room on this phone (Android app)
let host = null;   // { plugin, room, listeners }

async function hostRoom() {
  if (mpBusy || mp.connected || host) return;
  mpBusy = true;
  try { await hostRoomNow(); } finally { mpBusy = false; }
}
async function hostRoomNow() {
  const name = $id('mpName').value.trim() || 'Racer';
  storageSet('sr3d_name', name);
  const plugin = await getPlugin('LanHost');
  if (!plugin) { setMpStatus('Hosting needs the Android app (or a laptop running the server).', true); return; }
  setMpStatus('Opening a room…');
  stopScan();
  let res;
  try {
    res = await plugin.start({ port: LAN_PORT });
  } catch (e) {
    setMpStatus('Could not open a room: ' + (e && e.message ? e.message : e), true);
    return;
  }
  const room = new LocalRoom({
    sendTo: (id, obj) => plugin.send({ id, text: JSON.stringify(obj) }),
    broadcastAll: (obj, exclude) => plugin.broadcast({ exclude, text: JSON.stringify(obj) }),
    onInfo: (info) => plugin.setInfo({ json: JSON.stringify(info) }),
  });
  const listeners = await Promise.all([
    plugin.addListener('open', (e) => room.onOpen(e.id)),
    plugin.addListener('message', (e) => { let m; try { m = JSON.parse(e.text); } catch (err) { return; } room.onMessage(e.id, m); }),
    plugin.addListener('close', (e) => room.onClose(e.id)),
  ]);
  host = { plugin, room, listeners };
  try {
    await mp.connect(room.createLocalSocket(), name, G.carIndex);
    G.mpAddr = res && res.ip ? `${res.ip}:${res.port || LAN_PORT}` : 'this phone';
    setMpStatus('');
    renderMp();
  } catch (e) {
    stopHosting();
    setMpStatus('Could not start the room.', true);
  }
}

function stopHosting() {
  if (online) { const o = online; online = null; try { o.stop(); } catch (e) { /* ignore */ } }
  if (!host) return;
  const h = host;
  host = null;
  h.listeners.forEach((l) => { try { l.remove(); } catch (e) { /* ignore */ } });
  try { h.plugin.stop(); } catch (e) { /* ignore */ }
}

async function mpConnect(addrOverride) {
  if (mpBusy || mp.connected) return;      // a double tap must not join the room twice
  mpBusy = true;
  try { await mpConnectNow(addrOverride); } finally { mpBusy = false; }
}
async function mpConnectNow(addrOverride) {
  const name = $id('mpName').value.trim() || 'Racer';
  const addr = (addrOverride || $id('mpAddr').value).trim();
  if (!addr) { setMpStatus('Enter the server address, e.g. 192.168.1.5:8080', true); return; }
  stopScan();
  storageSet('sr3d_name', name);
  storageSet('sr3d_mp_addr', addr);
  setMpStatus('Connecting…');
  try {
    await mp.connect(addr, name, G.carIndex);
    G.mpAddr = addr;
    setMpStatus('');
    renderMp();
  } catch (e) {
    setMpStatus('Could not connect. Check the address, that the server is running, and that both devices are on the same Wi-Fi.', true);
  }
}

function renderMp() {
  const on = mp.connected;
  $id('mpConnect').classList.toggle('hidden', on);
  $id('mpLobby').classList.toggle('hidden', !on);
  if (!on) return;
  const l = mp.lobby || { players: [], phase: 'lobby', mode: 'race', distance: 3000 };
  $id('mpRoomAddr').textContent = G.mpAddr || '';
  $id('mpRoomAddr').classList.toggle('code', !!G.onlineCode);
  $id('mpShareRow').classList.toggle('hidden', !G.onlineCode);
  $id('mpPlayers').innerHTML = '';
  for (const p of l.players) {
    const li = document.createElement('li');
    if (p.id === mp.id) li.classList.add('me');
    const name = document.createElement('span');
    name.textContent = p.name + (p.id === mp.id ? ' (you)' : '');
    if (p.id === l.hostId) { const t = document.createElement('span'); t.className = 'tag'; t.textContent = 'HOST'; name.appendChild(t); }
    const car = document.createElement('span');
    car.className = 'car';
    car.textContent = (CARS[p.car] || CARS[0]).name;
    li.append(name, car);
    $id('mpPlayers').appendChild(li);
  }
  const host = mp.isHost && l.phase === 'lobby';
  document.querySelectorAll('[data-action=mpMode]').forEach((b) => { b.classList.toggle('on', b.dataset.mode === l.mode); b.disabled = !host; });
  document.querySelectorAll('[data-action=mpDist]').forEach((b) => { b.classList.toggle('on', Number(b.dataset.dist) === l.distance); b.disabled = !host; });
  document.querySelectorAll('[data-action=mpTraffic]').forEach((b) => { b.classList.toggle('on', b.dataset.val === (l.traffic || 'normal')); b.disabled = !host; });
  $id('mpDistRow').classList.toggle('hidden', l.mode !== 'race');
  const start = $id('mpStartBtn');
  let hint = '';
  if (l.phase === 'lobby') {
    start.classList.toggle('hidden', !mp.isHost);
    start.querySelector('span').textContent = l.mode === 'race' ? `START ${l.distance / 1000} KM RACE` : 'START FREE DRIVE';
    hint = mp.isHost ? (l.players.length < 2 ? 'Waiting for friends to join… (you can also start alone)' : '') : 'Waiting for the host to start…';
  } else if (l.phase === 'driving') {
    start.classList.remove('hidden');
    start.querySelector('span').textContent = mp.isHost ? 'END FREE DRIVE' : 'JOIN FREE DRIVE';
    if (!mp.isHost) start.dataset.join = '1';
  } else {
    start.classList.toggle('hidden', !mp.isHost);
    start.querySelector('span').textContent = 'END RACE';
    hint = 'A race is in progress — you will join the next one.';
  }
  if (host && l.phase === 'lobby' && l.players.length < 2) hint = `Your room is open at ${G.mpAddr}. Friends on this Wi-Fi will see it in their room list.`;
  $id('mpLobbyHint').textContent = hint;
}

function startMpSession(m) {
  G.mp = { mode: m.mode, distance: m.distance, finished: false, t0: null, place: null, synced: false };
  // the same traffic for every player: seeded by the room, placed by the shared clock
  traffic.sync = { seed: m.seed || 1, startedAt: m.startedAt || Date.now(), density: m.traffic || S.traffic };
  const map = m.map === 'neon' || m.map === 'tashkent' ? m.map : G.map;
  world.setTheme(map); setTrafficPalette(map);
  G.mpFinishers = [];
  const idx = Math.max(0, (m.order || []).indexOf(mp.id));
  ui.show(null);
  startRun({ lane: LANES[[2, 1, 3, 0][idx % 4]], noRival: true });
  ui.setInfo(m.mode === 'race' ? 'POSITION' : 'PLAYERS', '—');
  ui.popup(m.mode === 'race' ? `RACE · ${m.distance / 1000} KM` : 'FREE DRIVE');
}

// what other players need to draw our car
function mpState() {
  return {
    d: P.distance, x: P.x, y: P.y, v: P.speed, yaw: player.group.rotation.y,
    rx: G.mode === 'crashing' ? crash.rx : 0, rz: G.mode === 'crashing' ? crash.rz : 0,
    brake: input.down, nitro: P.nitroActive, fly: P.fly, car: G.carIndex,
  };
}

function updateMpSession(dt) {
  mp.update(dt, P.distance, G.time);
  mp.sendState(dt, mpState());
  const others = mp.remoteDistances();
  if (G.mp.mode === 'free') {
    // late joiner in free drive: jump next to the group instead of starting kilometres behind
    if (!G.mp.synced && others.length) {
      G.mp.synced = true;
      const lead = Math.max(...others.map((o) => o.d));
      if (Math.abs(lead - P.distance) > 400) {
        P.distance = Math.max(0, lead - 25);
        traffic.clear();
      }
    }
    ui.setInfo('PLAYERS', `${others.length + 1} ONLINE`, 'win');
    return;
  }
  // race: position by distance, finish line at the chosen distance
  const ahead = others.filter((o) => o.d > P.distance).length;
  const left = Math.max(0, G.mp.distance - P.distance);
  if (!G.mp.finished && P.distance >= G.mp.distance) {
    G.mp.finished = true;
    const time = G.mp.t0 === null ? 0 : G.time - G.mp.t0;
    G.mp.time = time;
    mp.send({ t: 'finish', time });
    G.mp.localPlace = ahead + 1;                 // fallback if the room's answer never arrives
    ui.popup(`FINISH! ${time.toFixed(2)} S`);
    audio.nearMiss();
    // after a short victory lap, show the standings (it fills in as the others finish)
    const session = G.mp;
    setTimeout(() => { if (G.mp === session) showMpResults(G.mpFinishers, true); }, 3500);
  }
  if (G.mp.finished) ui.setInfo('FINISHED', G.mp.place ? `P${G.mp.place}` : '…', 'win');
  else ui.setInfo('POSITION', `P${ahead + 1}/${others.length + 1} · ${(left / 1000).toFixed(2)} KM`, ahead === 0 ? 'win' : 'lose');
}

// multiplayer crashes don't end the session: back on the road after a short penalty
function respawnMp() {
  for (const c of [...traffic.active]) {
    if (Math.abs(c.z) < 70) { traffic.release(c); traffic.active.splice(traffic.active.indexOf(c), 1); }
  }
  P.speed = 0; P.latVel = 0; P.y = 0; P.vy = 0; P.altTarget = 0; P.fly = 0;
  P.x = LANES.reduce((a, b) => (Math.abs(b - P.x) < Math.abs(a - P.x) ? b : a));
  pt.reset();
  player.group.position.set(P.x, 0, 0);
  player.group.rotation.set(0, 0, 0);
  player.body.rotation.set(0, 0, 0);
  G.shake = 0;
  G.mode = 'playing';
  ui.setHud(true);
  ui.popup('RESPAWN');
  audio.setMusicLevel(0.26);
}

function showMpResults(list, waiting = false, closed = false) {
  const was = G.mp;
  G.mp = null;
  const players = (mp.lobby && mp.lobby.players) || [];
  const ol = $id('mpResultList');
  ol.innerHTML = '';
  const done = new Set(list.map((f) => f.id));
  for (const f of list) {
    const li = document.createElement('li');
    if (f.id === mp.id) li.classList.add('me');
    li.innerHTML = '<span></span><span></span>';
    li.children[0].textContent = `P${f.place}  ${f.name}`;
    li.children[1].textContent = `${f.time.toFixed(2)} S`;
    ol.appendChild(li);
  }
  for (const p of players) {
    if (done.has(p.id)) continue;
    const li = document.createElement('li');
    li.className = 'dnf' + (p.id === mp.id ? ' me' : '');
    li.innerHTML = `<span></span><span>${waiting ? 'RACING…' : 'DNF'}</span>`;
    li.children[0].textContent = p.name;
    ol.appendChild(li);
  }
  const mine = list.find((f) => f.id === mp.id);
  $id('mpResultTitle').textContent = mine ? (mine.place === 1 ? '🏆 YOU WON!' : `P${mine.place}`) : 'RACE OVER';
  $id('mpResultNote').textContent = closed ? 'The room has closed — the host left.' : waiting ? 'Waiting for the others to finish…' : '';
  G.mode = 'mplobby';
  ui.setHud(false);
  document.getElementById('touch').classList.add('hidden');
  ui.show('mpResults');
  if (was) audio.setMusicLevel(0.3);
}

// Android back button / app switching (Capacitor native shell)
async function setupNative() {
  if (!NATIVE) return;
  let App = null;
  try { App = await getPlugin('App'); } catch (e) { App = null; }
  if (!App || !App.addListener) return;
  App.addListener('backButton', () => {
    if (G.mode === 'playing' || G.mode === 'countdown' || G.mode === 'city') pauseGame();
    else if (G.mode === 'paused') resumeGame();
    else if (G.mode === 'garage') leaveGarage();
    else if (G.mode === 'gameover' || G.mode === 'crashing') toMenu();
    else if (G.mode === 'mplobby') { if (mp.connected) actions.mpLeave(); else { stopScan(); toMenu(); } }
    else if (App.exitApp) App.exitApp();
  });
  App.addListener('pause', () => pauseGame());
}

document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  audio.init();
  const fn = actions[btn.dataset.action];
  if (fn) {
    if (btn.dataset.action !== 'mute') audio.click();
    fn(btn);
    btn.blur();
  }
});

// Unlock audio on the first interaction anywhere
const unlock = () => audio.init();
window.addEventListener('pointerdown', unlock);
window.addEventListener('touchend', unlock);   // iOS unlocks Web Audio on touchend

// Garage drag-to-rotate
let dragX = null;
canvas.addEventListener('pointerdown', (e) => { if (G.mode === 'garage') dragX = e.clientX; });
window.addEventListener('pointermove', (e) => {
  if (dragX !== null && G.mode === 'garage') { G.dragAngle -= (e.clientX - dragX) * 0.008; dragX = e.clientX; }
});
window.addEventListener('pointerup', () => { dragX = null; });

document.addEventListener('visibilitychange', () => { if (document.hidden && !window.__sr3dNoAutoPause) pauseGame(); });

function onResize() {
  const w = window.innerWidth, h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  composer.setSize(w, h);
}
window.addEventListener('resize', onResize);

// ---------------------------------------------------------------- main loop
const clock = new THREE.Clock();
let lastFrameAt = 0;
function frame(now = performance.now()) {
  requestAnimationFrame(frame);
  // FPS limit (Settings): skip display refreshes until the next frame is due
  if (S.fps > 0 && now - lastFrameAt < 1000 / S.fps - 1) return;
  lastFrameAt = now;
  const raw = clock.getDelta();
  // even out frame-to-frame jitter in the timestep (uneven steps read as stutter)
  G.dtSmooth = G.dtSmooth ? G.dtSmooth + (Math.min(raw, 0.1) - G.dtSmooth) * 0.25 : Math.min(raw, 1 / 60);
  const dt = Math.abs(raw - G.dtSmooth) < G.dtSmooth * 0.5 ? G.dtSmooth : raw;
  // one bad frame must never freeze the game: log it and keep drawing
  try { step(Math.min(dt, 1 / 20)); } catch (e) { if (!frame.errs || frame.errs++ < 5) { frame.errs = frame.errs || 1; console.error(e); } }
  composer.render();
  adaptQuality(raw);
}

function setQuality(pr) {
  Q.pr = pr;
  renderer.setPixelRatio(pr);
  composer.setPixelRatio(pr);
  onResize();
}

const COMMON_HZ = [60, 75, 90, 100, 120, 144, 165, 240];
function adaptQuality(raw) {
  if (document.hidden || raw <= 0 || raw > 0.25) return;
  // FPS meter
  Q.fpsFrames++; Q.fpsTimer += raw;
  if (Q.fpsTimer >= 0.5) {
    ui.setFps(Math.round(Q.fpsFrames / Q.fpsTimer));
    Q.fpsFrames = 0; Q.fpsTimer = 0;
  }
  // Only the AUTO graphics setting changes resolution by itself
  if (S.quality !== 'auto') return;
  // Measure for 1.5 s, then adjust resolution
  Q.frames++; Q.time += raw; Q.best.push(raw);
  if (Q.time < 1.5) return;
  Q.best.sort((a, b) => a - b);
  const fastHz = 1 / Q.best[Math.floor(Q.best.length * 0.1)];
  const snapped = COMMON_HZ.reduce((p, c) => (Math.abs(c - fastHz) < Math.abs(p - fastHz) ? c : p), 60);
  Q.refresh = Math.max(Q.refresh, snapped);
  const fps = Q.frames / Q.time;
  if (S.fps > 0) Q.refresh = Math.min(Q.refresh, S.fps);
  let pr = Q.pr;
  if (fps < 24) {
    // a really slow device (hidden tabs never get here): drop straight to the lightest settings
    Q.good = 0;
    if (Q.tier !== 'low') { Q.tier = 'low'; applyGraphics(); }
    else if (Q.pr > Q.min + 0.01) setQuality(Q.min);
    Q.frames = 0; Q.time = 0; Q.best.length = 0;
    return;
  }
  const target = Math.min(Q.refresh, 60) ;            // phones: 60 FPS is the goal for AUTO
  const tierIdx = TIERS.indexOf(Q.tier);
  if (fps < target * 0.85) {
    Q.good = 0;
    if (Q.pr > Q.min + 0.01) pr = Math.max(Q.min, Q.pr - (fps < target * 0.5 ? 0.25 : 0.1));
    else if (tierIdx > 0) { Q.tier = TIERS[tierIdx - 1]; applyGraphics(); Q.frames = 0; Q.time = 0; Q.best.length = 0; return; }
  } else if (fps >= target * 0.97) {
    if (++Q.good >= 3 && Q.pr < Q.max) { pr = Math.min(Q.max, Q.pr + 0.05); Q.good = 0; }
    else if (Q.good >= 8 && Q.pr >= Q.max - 0.01 && tierIdx < TIERS.length - 1) { Q.tier = TIERS[tierIdx + 1]; Q.good = 0; applyGraphics(); Q.frames = 0; Q.time = 0; Q.best.length = 0; return; }
  } else Q.good = 0;
  if (pr !== Q.pr) setQuality(pr);
  Q.frames = 0; Q.time = 0; Q.best.length = 0;
}

function step(dt) {
  G.time += dt;
  switch (G.mode) {
    case 'menu':
    case 'taxigarage':
    case 'garage':
    case 'mplobby': updateShowcase(dt); break;
    case 'city': city.update(dt); taxi.update(dt); world.followCamera(camera); break;
    case 'countdown': updateCountdown(dt); break;
    case 'playing': updatePlaying(dt); break;
    case 'crashing': updateCrashing(dt); break;
    case 'gameover': updateGameOver(dt); break;
    default: break;
  }
}

// ---------------------------------------------------------------- boot
function boot() {
  initInput(onKey);
  audio.muted = storageGet(STORAGE.muted, '0') === '1';
  ui.setMuted(audio.muted);
  G.garageIndex = G.carIndex;
  setPlayerCar(G.carIndex);
  if (TOUCH && storageGet(STORAGE.tilt, '0') === '1') setTilt(true).then(applyTiltUi);
  setupNative();
  applyGraphics();
  G.map = storageGet('sr3d_map', 'tashkent') === 'neon' ? 'neon' : 'tashkent';
  world.setTheme(G.map);
  applyTraffic();
  renderMapButton();
  document.getElementById('viewBtn').classList.toggle('active', G.view === 'cockpit');

  // Compile every shader up front so the first spawn doesn't stutter
  const releaseWarm = traffic.prewarm(4);
  const releaseLandmarks = world.prebuildLandmarks();
  world.update(0, camera, 0);
  renderer.compile(scene, camera);
  composer.render();
  releaseWarm();
  releaseLandmarks();

  toMenu();
  window.__sr3dReady = true;
  frame();
  // opened from a friend's invite link (?room=12345): go straight into that room
  const invite = cleanCode(new URLSearchParams(location.search).get('room'));
  if (invite.length === 5) {
    history.replaceState(null, '', location.pathname);
    openMp();
    $id('mpCode').value = invite;
    onlineJoinRoom(invite);
  }
}

// expose a small debug handle for testing in the console
window.__sr3d = {
  G, P, traffic, rival, world, get city() { return city; }, startRun, startCity, toMenu, taxi, get pt() { return pt; }, toggleHud,
  Q, setQuality, camera, scene, composer, getPlayer: () => player,
  step: (n = 1, dt = 1 / 60) => { for (let i = 0; i < n; i++) step(dt); composer.render(); },
  // testing: put the car somewhere in the open city, standing still, and wait for the map there
  async teleport(x, z, yaw = 0) {
    window.__sr3dNoAutoPause = true;
    if (G.mode !== 'city') startCity('osm');
    const c = city;
    const set = () => Object.assign(c.state, { x, z, yaw, v: 0, latV: 0, r: 0, ax: 0, steer: 0, spin: 0 });
    set(); c.camReset = true; c.focus = null;
    for (let i = 0; i < 120; i++) { await new Promise((r) => setTimeout(r, 100)); set(); if (i > 15 && !(c.pending && c.pending.size)) break; }
    for (let i = 0; i < 6; i++) { set(); await new Promise((r) => setTimeout(r, 150)); }
    return { cells: c.cells.size, pending: c.pending ? c.pending.size : 0 };
  },
};

boot();
if (/[?&]test\b/.test(location.search)) import('./devtest.js');
