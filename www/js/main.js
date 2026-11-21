// STREET RACING 3D — game bootstrap, state machine and main loop.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

import {
  CARS, PLAYER_LIMIT, PLAYER_HALF_W, PLAYER_HALF_L, STORAGE, storageGet, storageSet,
  PLAYER_MASS, GRAVITY, MAX_ALTITUDE, GANTRY_Y, LAMP_ARM_Y, LAMP_ARM_X,
} from './config.js';
import { createSportsCar } from './carModels.js';
import { World } from './world.js';
import { Traffic, restHeight } from './traffic.js';
import { Effects } from './effects.js';
import { AudioEngine } from './audio.js';
import { input, initInput, resetInput, isTouchDevice, tilt, setTilt, calibrateTilt } from './input.js';
import { Rival } from './rival.js';
import { Powertrain } from './physics.js';
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
scene.add(new THREE.HemisphereLight(0x8ea4e0, 0x2c2436, 1.5));
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
const world = new World(scene, renderer, MOBILE ? { lampLights: 4, buildingsPerSide: 22 } : {});
const traffic = new Traffic(scene);
const rival = new Rival(scene);
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
  carIndex: clampIndex(parseInt(storageGet(STORAGE.car, '0'), 10)),
  garageIndex: 0,
  best: parseInt(storageGet(STORAGE.best, '0'), 10) || 0,
  time: 0,
  dragAngle: 0,
  countdown: 0,
  lastCount: 0,
  shake: 0,
  hintTimer: 0,
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
function setPlayerCar(index) {
  if (player) {
    scene.remove(player.group);
    player.dispose();
  }
  player = createSportsCar(CARS[index]);
  pt = new Powertrain(CARS[index]);
  headlight = new THREE.SpotLight(0xe6efff, 220, 120, 0.38, 0.5, 1.2);
  headlight.position.set(0, 0.8, -2.0);
  headlight.target.position.set(0, 0, -30);
  player.group.add(headlight, headlight.target);
  player.group.position.x = P.x;
  scene.add(player.group);
}

// ---------------------------------------------------------------- mode changes
function toMenu() {
  G.mode = 'menu';
  rival.hide();
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

function startRun() {
  if (player.def !== CARS[G.carIndex]) setPlayerCar(G.carIndex);
  resetInput();
  traffic.clear();
  fx.clear();
  Object.assign(P, freshPlayer());
  pt.reset();
  player.group.position.set(P.x, 0, 0);
  player.group.rotation.set(0, 0, 0);
  player.body.rotation.set(0, 0, 0);
  player.body.position.y = 0;
  ui.setAltitude(player.canFly ? 0 : null);
  rival.spawn(G.carIndex);
  G.rivalAhead = false;
  ui.setRival(0, rival.def.name);
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
  // mobile browsers: go full screen on the first race (the APK is already full screen)
  if (TOUCH && !NATIVE && !document.fullscreenElement && document.documentElement.requestFullscreen) {
    document.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
  }
}

function pauseGame() {
  if (G.mode !== 'playing' && G.mode !== 'countdown') return;
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
  const target = G.mode === 'menu' ? 30 : 0;
  P.speed += (target - P.speed) * (1 - Math.exp(-dt * 1.2));
  if (Math.abs(P.speed - target) < 0.05) P.speed = target;
  const dz = P.speed * dt;
  world.update(dz, camera, dt);
  fx.update(dt, dz);
  const tx = G.mode === 'menu' ? 2 + Math.sin(G.time * 0.35) * 0.7 : 2;
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
  if (G.mode === 'menu') {
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
    setTimeout(() => { if (G.mode === 'playing' || G.mode === 'paused') ui.countdown(null); }, 900);
  }
  world.update(0, camera, dt);
  rival.update(dt, P, traffic, G.time, false);
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
  const throttle = input.up;
  const brake = input.down;
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
    if (Math.abs(g.position.z) < 0.4 + PLAYER_HALF_L && py1 > GANTRY_Y[0] && py0 < GANTRY_Y[1]) {
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
  if (crash.t > 2.8) gameOver();
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

function updateChaseCamera(dt, extraBack = 0) {
  const sf = Math.min(1, P.speed / 90);
  const nf = P.nitroBlend;
  const portrait = camera.aspect < 1 ? (1 - camera.aspect) * 4 : 0; // pull back on tall screens
  const x = P.x * 0.85;
  // lower and closer than before: nearby road detail streaming past is what sells the speed
  const z = 5.9 + sf * 1.0 + nf * 0.8 + extraBack + portrait + P.fly * 1.2;
  let y = P.y + 2.2 + sf * 0.15 + extraBack * 0.5 + portrait * 0.4;
  // Never let the camera end up inside a vehicle: rise over anything that occupies the camera spot
  for (const c of traffic.active) {
    if (Math.abs(c.x - x) < c.halfW + 1.3 && Math.abs(c.z - z) < c.halfL + 1.6 && y > c.y - 1 && y < c.y + c.height + 1.3) {
      y = c.y + c.height + 1.3;
    }
  }
  tmpV.set(x, y, z);
  camBase.lerp(tmpV, 1 - Math.exp(-dt * 7));
  camLook.lerp(tmpV.set(P.x * 0.9, P.y + 0.9, -10), 1 - Math.exp(-dt * 9));

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
  switch (e.code) {
    case 'KeyP':
    case 'Escape':
      if (G.mode === 'playing' || G.mode === 'countdown') pauseGame();
      else if (G.mode === 'paused') resumeGame();
      else if (G.mode === 'garage') leaveGarage();
      break;
    case 'KeyM': toggleMute(); break;
    case 'Enter':
      if (G.mode === 'menu' || G.mode === 'gameover') startRun();
      else if (G.mode === 'garage') selectGarageCar();
      break;
    case 'ArrowLeft': case 'KeyA': if (G.mode === 'garage') changeGarageCar(-1); break;
    case 'ArrowRight': case 'KeyD': if (G.mode === 'garage') changeGarageCar(1); break;
    default: break;
  }
}

const actions = {
  play: startRun,
  garage: toGarage,
  back: leaveGarage,
  prev: () => changeGarageCar(-1),
  next: () => changeGarageCar(1),
  select: selectGarageCar,
  resume: resumeGame,
  restart: startRun,
  menu: () => { if (G.garageIndex !== G.carIndex) setPlayerCar(G.carIndex); toMenu(); },
  pause: () => (G.mode === 'paused' ? resumeGame() : pauseGame()),
  mute: toggleMute,
  tilt: async () => {
    const on = await setTilt(!tilt.enabled);
    storageSet(STORAGE.tilt, on ? 1 : 0);
    applyTiltUi(on);
    if (on) calibrateTilt();
  },
};

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

// Android back button / app switching (Capacitor native shell)
function setupNative() {
  if (!NATIVE) return;
  let App = null;
  try { App = window.Capacitor.Plugins?.App || window.Capacitor.registerPlugin?.('App'); } catch (e) { App = null; }
  if (!App || !App.addListener) return;
  App.addListener('backButton', () => {
    if (G.mode === 'playing' || G.mode === 'countdown') pauseGame();
    else if (G.mode === 'paused') resumeGame();
    else if (G.mode === 'garage') leaveGarage();
    else if (G.mode === 'gameover' || G.mode === 'crashing') toMenu();
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
    fn();
    btn.blur();
  }
});

// Unlock audio on the first interaction anywhere
const unlock = () => audio.init();
window.addEventListener('pointerdown', unlock);

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
function frame() {
  requestAnimationFrame(frame);
  const raw = clock.getDelta();
  step(Math.min(raw, 1 / 20));
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
  // Measure for 1.5 s, then adjust resolution
  Q.frames++; Q.time += raw; Q.best.push(raw);
  if (Q.time < 1.5) return;
  Q.best.sort((a, b) => a - b);
  const fastHz = 1 / Q.best[Math.floor(Q.best.length * 0.1)];
  const snapped = COMMON_HZ.reduce((p, c) => (Math.abs(c - fastHz) < Math.abs(p - fastHz) ? c : p), 60);
  Q.refresh = Math.max(Q.refresh, snapped);
  const fps = Q.frames / Q.time;
  if (fps < 20) { Q.frames = 0; Q.time = 0; Q.best.length = 0; return; } // throttled/background tab, not a GPU limit
  let pr = Q.pr;
  if (fps < Q.refresh * 0.9 && Q.pr > Q.min) { pr = Math.max(Q.min, Q.pr - 0.1); Q.good = 0; }
  else if (fps >= Q.refresh * 0.97) { if (++Q.good >= 3 && Q.pr < Q.max) { pr = Math.min(Q.max, Q.pr + 0.05); Q.good = 0; } }
  else Q.good = 0;
  if (pr !== Q.pr) setQuality(pr);
  Q.frames = 0; Q.time = 0; Q.best.length = 0;
}

function step(dt) {
  G.time += dt;
  switch (G.mode) {
    case 'menu':
    case 'garage': updateShowcase(dt); break;
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

  // Compile every shader up front so the first spawn doesn't stutter
  const releaseWarm = traffic.prewarm(4);
  world.update(0, camera, 0);
  renderer.compile(scene, camera);
  composer.render();
  releaseWarm();

  toMenu();
  window.__sr3dReady = true;
  frame();
}

// expose a small debug handle for testing in the console
window.__sr3d = {
  G, P, traffic, rival, startRun, toMenu,
  Q, setQuality,
  step: (n = 1, dt = 1 / 60) => { for (let i = 0; i < n; i++) step(dt); composer.render(); },
};

boot();
