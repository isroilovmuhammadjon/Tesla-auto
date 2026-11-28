// Driveable Uzbek cars for TOSHKENT TAKSI: the everyday cars of Tashkent (original models, no
// badges) with their own size, wheelbase, weight, engine, gearing, sound and fare class.
// The body comes from uzcars.js (same models as the street traffic); here it gets spinning and
// steering wheels, the driver's cabin (C) and the interface the game expects of a player car.
import * as THREE from 'three';
import { createUzCar } from './uzcars.js?v=5399783e';
import { buildCockpit } from './cockpit.js?v=5399783e';

// fares: a game estimate in the range of Tashkent app taxis (base + per km), rounded to 500 so'm
export const UZ_CARS = [
  { id: 'cobalt', uz: 'cobalt', name: 'COBALT', cls: 'Standart', tagline: "Toshkentning eng ko'p taksisi: sedan, 1.5 l", color: 0xf4f4f6,
    maxSpeed: 170, accel: 0.6, handling: 0.82, nitro: 0, fare: [7000, 2000], chassis: { m: 1160, a: 1.06, b: 1.56, h: 0.55, lock: 0.59 }, voice: { pitch: 1, tone: 1 }, cockpit: { s: 0.94, y: 0.04, z: 0.05 } },
  { id: 'gentra', uz: 'gentra', name: 'GENTRA', cls: 'Standart', tagline: 'Lacetti / Gentra: sedan, 1.5 l', color: 0xc3c7ce,
    maxSpeed: 178, accel: 0.64, handling: 0.86, nitro: 0, fare: [7000, 2000], chassis: { m: 1210, a: 1.05, b: 1.55, h: 0.54, lock: 0.6 }, voice: { pitch: 1.04, tone: 1.05 }, cockpit: { s: 0.94, y: 0.0, z: 0.05 } },
  { id: 'nexia', uz: 'nexia', name: 'NEXIA 3', cls: 'Ekonom', tagline: 'Arzon va chidamli sedan, 1.5 l', color: 0xf0f0f2,
    maxSpeed: 170, accel: 0.58, handling: 0.8, nitro: 0, fare: [6000, 1700], chassis: { m: 1120, a: 0.98, b: 1.5, h: 0.57, lock: 0.6, grip: 0.96 }, voice: { pitch: 0.97, tone: 0.95 }, cockpit: { s: 0.91, y: -0.04, z: 0.0 } },
  { id: 'spark', uz: 'spark', name: 'SPARK', cls: 'Ekonom', tagline: "Kichkina xetchbek: mahalla ko'chalari uchun qulay, 1.25 l", color: 0x2e9bd6,
    maxSpeed: 155, accel: 0.55, handling: 0.9, nitro: 0, fare: [6000, 1700], chassis: { m: 960, a: 0.92, b: 1.46, h: 0.56, lock: 0.58, grip: 0.95, steerRate: 1.15, roll: 1.1 }, voice: { pitch: 0.82, tone: 1.15 }, cockpit: { s: 0.88, y: 0.1, z: -0.1 } },
  { id: 'damas', uz: 'damas', name: 'DAMAS', cls: 'Yuk-yo\'lovchi', tagline: "Mikroavtobus: sekin, lekin ko'p joy, 0.8 l", color: 0xf4f4f6,
    maxSpeed: 112, accel: 0.42, handling: 0.66, nitro: 0, fare: [5500, 1500], chassis: { m: 880, a: 0.86, b: 0.98, h: 0.78, rear: true, lock: 0.53, grip: 0.76, steerRate: 0.82, roll: 1.8 }, voice: { pitch: 0.72, tone: 0.85 }, cockpit: { s: 0.8, y: 0.42, z: -0.75 } },
  { id: 'malibu', sedan: true, name: 'QORA SEDAN', cls: 'Komfort', tagline: "Qora o'rta-katta sedan (Malibu uslubida): premium buyurtmalar", color: 0x060709,
    fare: [10000, 2900] },
];

export function createUzPlayer(def) {
  const car = createUzCar(def.uz);
  const m = car.model;
  // the player's car keeps its own paint (traffic shares paint materials)
  const paint = new THREE.MeshPhysicalMaterial({ color: def.color, metalness: 0.4, roughness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.06, envMapIntensity: 0.9 });
  for (const o of car.bodyMeshes) o.material = paint;
  car.detail.children.forEach((o) => { if (o.geometry && o.geometry.parameters && ((o.geometry.parameters.width === 0.12 && o.geometry.parameters.depth === 0.16) || (o.geometry.parameters.width === 0.13 && o.geometry.parameters.depth === 0.2))) o.material = paint; });
  car.setTaxi(true);
  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);
  body.add(car.mesh);
  for (const w of car.wheels) { w.tire.rotation.order = 'YXZ'; w.hub.rotation.order = 'YXZ'; }
  // driver's cabin, scaled to this car
  const cockpit = buildCockpit({ bodyMat: paint, accent: 0xffd27a });
  const c = def.cockpit || { s: 1, y: 0, z: 0 };
  cockpit.root.scale.setScalar(c.s);
  cockpit.root.position.set(0, c.y, c.z);
  body.add(cockpit.root);
  // the driver sits a little higher than the cabin model's default, so the bonnet shows over the dashboard
  const eye = cockpit.eye.clone().multiplyScalar(c.s).add(new THREE.Vector3(0, c.y + (c.eyeUp ?? 0.08), c.z));
  const exterior = [...car.bodyMeshes, car.glassMesh, ...(car.taxiParts || [])];
  const brakeMat = car.tailMat;
  return {
    group, body, def, eye, interior: cockpit.root,
    halfLength: m.L / 2, width: m.W, canFly: false, isUz: true,
    setDaylight() {},
    setInterior(on) {
      cockpit.root.visible = on;
      for (const o of exterior) o.visible = !on;
      car.detail.visible = !on;
    },
    setLookBack(on) { for (const o of cockpit.rearBlockers) o.visible = !on; },
    updateInterior(steer, kmh, rpm, gear, nitro, extra, wheelAngle) {
      cockpit.setSteer(wheelAngle !== undefined ? wheelAngle : steer * 1.7);
      cockpit.drawScreens(kmh, rpm, gear, nitro, extra);
    },
    renderMirror(renderer, scene) { cockpit.renderMirror(renderer, scene, body); },
    update(dt, speed, steer, braking) {
      const rot = (speed * dt) / m.R;
      for (const w of car.wheels) {
        w.tire.rotation.x -= rot; w.hub.rotation.x = w.tire.rotation.x;
        if (w.front) { const t = -steer * 0.38; w.tire.rotation.y += (t - w.tire.rotation.y) * Math.min(1, dt * 10); w.hub.rotation.y = w.tire.rotation.y; }
      }
      brakeMat.emissiveIntensity = braking ? 2.6 : 0.5;
    },
    dispose() {
      paint.dispose();
      cockpit.dispose();
    },
  };
}
