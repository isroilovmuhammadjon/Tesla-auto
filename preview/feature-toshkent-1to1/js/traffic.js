// Traffic: ground cars and flying cars. Spawning, following, lane changes, pooling,
// and rigid-body physics (gravity, bounces, flips) for vehicles that get hit.
import { createTrafficCar, pickTrafficType, TRAFFIC_TYPES } from './carModels.js?v=b55d34f6';
import { LANES, GRAVITY } from './config.js?v=b55d34f6';

const smooth = (t) => t * t * (3 - 2 * t);
export const AIR_LEVELS = [5.2, 10.6, 14.6];   // flying-traffic altitudes (clear of gantries at ~8 m)

// Height of a vehicle's origin above the road when it rests at the given roll/pitch:
// 0 on its wheels, its full height when upside down.
export function restHeight(height, rx, rz) {
  return (height * (1 - Math.cos(rx) * Math.cos(rz))) / 2;
}
// Snap an angle to the nearest flat resting orientation (upright or on its roof)
const settleAngle = (a) => Math.round(a / Math.PI) * Math.PI;

// cars per stretch of road: LOW / NORMAL / HIGH
export const DENSITY = { low: 0.5, normal: 1, high: 1.7 };

// small deterministic hash -> [0, 1) numbers, the same on every device
function hash4(seed, a, b) {
  let h = (seed ^ Math.imul(a, 374761393) ^ Math.imul(b + 7, 668265263)) >>> 0;
  const next = () => {
    h = (h + 0x6d2b79f5) >>> 0;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return [next(), next(), next(), next()];
}

// Multiplayer traffic: every car lives at an absolute road position that depends only on the room's
// seed and the shared clock, so all players see the same cars in the same places.
// Each lane has one speed, so cars in a lane never catch each other up.
const SYNC_SEG = 70;
const SYNC_LANE_KMH = [62, 78, 94, 110];
const SYNC_CHANCE = { low: 0.17, normal: 0.3, high: 0.48 };

export class Traffic {
  constructor(scene) {
    this.scene = scene;
    this.active = [];
    this.pool = {};
    this.spawnTimer = 0;
    this.airTimer = 0;
    this.onImpact = null; // (x, y, z, strength) — set by the game for sparks/sound
    this.extra = [];      // other vehicles traffic must respect (the AI rival)
    this.density = 'normal';
    this.sync = null;     // { seed, startedAt, density } in multiplayer
    this.syncCars = new Map();
  }

  // Create a few cars of every type up front so shaders compile before play.
  prewarm(n = 4) {
    const made = [];
    for (const type of Object.keys(TRAFFIC_TYPES)) for (let i = 0; i < n; i++) made.push(this.acquire(type));
    made.forEach((c, i) => { c.mesh.position.set(LANES[i % 4], c.air ? 8 : 0, -30 - i * 12); c.mesh.visible = true; });
    return () => made.forEach((c) => this.release(c));
  }

  acquire(type) {
    const list = this.pool[type] || (this.pool[type] = []);
    let c = list.pop();
    if (!c) {
      c = createTrafficCar(type);
      this.scene.add(c.mesh);
    }
    c.mesh.visible = true;
    return c;
  }

  release(c) {
    c.mesh.visible = false;
    this.pool[c.type].push(c);
  }

  clear() {
    for (const c of this.active) this.release(c);
    this.active.length = 0;
    this.spawnTimer = 0;
    this.syncCars.clear();
  }

  // place the shared multiplayer traffic around our own distance
  updateSync(distance) {
    const { seed, startedAt, density } = this.sync;
    const t = Math.max(0, (Date.now() - startedAt) / 1000);
    const chance = SYNC_CHANCE[density] || SYNC_CHANCE.normal;
    const want = new Map();
    for (let lane = 0; lane < 4; lane++) {
      const v = SYNC_LANE_KMH[lane] / 3.6;
      const k0 = Math.floor((distance - 60 - v * t) / SYNC_SEG), k1 = Math.floor((distance + 640 - v * t) / SYNC_SEG);
      for (let k = Math.max(2, k0); k <= k1; k++) {
        const [a, b, c, d] = hash4(seed, k, lane);
        if (a >= chance) continue;
        const D = k * SYNC_SEG + b * SYNC_SEG * 0.55 + v * t;
        want.set(lane * 1e7 + k, { lane, v, z: distance - D, typeR: c, colorR: d });
      }
    }
    for (const [key, car] of this.syncCars) {
      if (want.has(key) && !car.hit) continue;
      if (car.hit && car.z < 40 && car.z > -700) continue;      // wrecks stay where they crashed
      this.syncCars.delete(key);
      const i = this.active.indexOf(car);
      if (i >= 0) { this.active.splice(i, 1); this.release(car); }
    }
    for (const [key, w] of want) {
      let car = this.syncCars.get(key);
      if (!car) {
        if (this.syncCars.has(key)) continue;
        const type = pickTrafficType(false, w.typeR);
        car = this.acquire(type);
        this.setup(car, w.lane, 0, w.z, w.v * 3.6, w.colorR);
        car.nextLaneChange = Infinity;
        this.syncCars.set(key, car);
      }
      if (car.hit) continue;
      car.z = w.z; car.speed = car.baseSpeed = w.v;
      car.mesh.position.set(car.x, 0, car.z);
    }
  }

  laneBusy(lane, layer, z, range, except) {
    const myHalf = except ? except.halfL : 5.5;
    for (const o of this.active) {
      if (o === except || o.layer !== layer) continue;
      if ((o.lane === lane || o.targetLane === lane) && Math.abs(o.z - z) < range + o.halfL + myHalf) return true;
    }
    return false;
  }

  // Is it safe for car c to move into lane t? Checks room ahead/behind, including faster cars closing in.
  canMergeInto(c, t) {
    for (const o of this.extra.length ? this.active.concat(this.extra.filter((e) => e.active && !e.hit)) : this.active) {
      if (o === c || o.layer !== c.layer) continue;
      if (o.lane !== t && o.targetLane !== t) continue;
      const dz = o.z - c.z;                     // > 0: o is behind c
      const room = c.halfL + o.halfL;
      if (dz > 0) {
        const closing = Math.max(0, o.speed - c.speed);
        if (dz < room + 10 + closing * 3) return false;
      } else if (-dz < room + 12) return false;
    }
    return true;
  }

  setup(c, lane, layer, z, kmh, colorR) {
    c.setColor(colorR);
    c.baseSpeed = c.speed = kmh / 3.6;
    c.lane = c.targetLane = lane;
    c.layer = layer;
    c.alt = layer === 0 ? 0 : AIR_LEVELS[layer - 1];
    c.x = LANES[lane];
    c.y = c.alt;
    c.z = z;
    c.vy = 0; c.vx = 0;
    c.rx = 0; c.rz = 0; c.wx = 0; c.wz = 0;
    c.spin = 0; c.yaw = 0;
    c.phase = Math.random() * 10;
    c.laneT = 0;
    c.nextLaneChange = 3 + Math.random() * 7;
    c.passed = false;
    c.hit = false;
    c.mesh.position.set(c.x, c.y, c.z);
    c.mesh.rotation.set(0, 0, 0);
    c.setBlink(false);
    c.setBrake(false);
    this.active.push(c);
  }

  trySpawnGround(distance) {
    const ground = this.active.filter((o) => o.layer === 0);
    const k = DENSITY[this.density] || 1;
    const maxCars = Math.round(Math.min(24, 8 + Math.floor(distance / 600)) * k);
    if (ground.length >= maxCars) return;
    const lane = Math.floor(Math.random() * 4);
    const z = -330 - Math.random() * 150;
    if (this.laneBusy(lane, 0, z, 30)) return;
    // keep at least one road lane open in this stretch
    const blocked = new Set([lane]);
    for (const o of ground) if (Math.abs(o.z - z) < 34) { blocked.add(o.lane); blocked.add(o.targetLane); }
    if (blocked.size >= 4) return;
    const type = pickTrafficType(false);
    const kmh = type === 'truck' ? 55 + Math.random() * 25 : 60 + Math.random() * 55;
    this.setup(this.acquire(type), lane, 0, z, kmh);
  }

  trySpawnAir(distance) {
    const air = this.active.filter((o) => o.layer > 0);
    const maxAir = Math.round(Math.min(14, 6 + Math.floor(distance / 900)) * (DENSITY[this.density] || 1));
    if (air.length >= maxAir) return;
    const lane = Math.floor(Math.random() * 4);
    const layer = 1 + Math.floor(Math.random() * AIR_LEVELS.length);
    const z = -330 - Math.random() * 150;
    if (this.laneBusy(lane, layer, z, 30)) return;
    const type = pickTrafficType(true);
    const kmh = type === 'hoverbus' ? 70 + Math.random() * 30 : 85 + Math.random() * 70;
    this.setup(this.acquire(type), lane, layer, z, kmh);
  }

  // Hard rule: two vehicles can never overlap. The rear one is pushed back and slowed to the front one's speed.
  separate() {
    const cars = this.active;
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < cars.length; i++) {
        for (let j = i + 1; j < cars.length; j++) {
          const a = cars[i], b = cars[j];
          if (a.hit || b.hit) continue;            // wrecks are handled by their own physics
          if (a.layer !== b.layer) continue;
          if (Math.abs(a.x - b.x) >= a.halfW + b.halfW + 0.25) continue;
          const minDz = a.halfL + b.halfL + 0.8;
          const dz = b.z - a.z;
          if (Math.abs(dz) >= minDz) continue;
          const [front, rear] = dz > 0 ? [a, b] : [b, a];
          rear.z = front.z + minDz;
          if (rear.speed > front.speed) rear.speed = front.speed;
          rear.mesh.position.z = rear.z;
        }
      }
    }
  }

  // Wrecked vehicle: full rigid-body motion with gravity, ground bounces and flips.
  updateWreck(c, dt, playerSpeed, blinkOn) {
    c.vy -= GRAVITY * dt;
    c.y += c.vy * dt;
    c.x += c.vx * dt;
    c.rx += c.wx * dt;
    c.rz += c.wz * dt;
    c.yaw += c.spin * dt;
    const floor = restHeight(c.height, c.rx, c.rz);
    const grounded = c.y <= floor + 0.02;
    if (c.y < floor) {
      if (c.vy < -3 && this.onImpact) this.onImpact(c.x, floor, c.z, -c.vy);
      c.y = floor;
      c.vy = c.vy < -1.5 ? -c.vy * 0.28 : 0;      // bounce, then stop
      c.wx *= 0.55; c.wz *= 0.55; c.spin *= 0.7;
      c.speed *= 0.82;
      c.vx *= 0.6;
    }
    if (grounded) {
      // tyre/body friction on the road
      c.speed *= Math.exp(-dt * 1.6);
      c.spin *= Math.exp(-dt * 2.2);
      c.vx *= Math.exp(-dt * 3);
      if (Math.abs(c.vy) < 0.5) {
        c.wx *= Math.exp(-dt * 4); c.wz *= Math.exp(-dt * 4);
        c.rx += (settleAngle(c.rx) - c.rx) * Math.min(1, dt * 4);
        c.rz += (settleAngle(c.rz) - c.rz) * Math.min(1, dt * 4);
      }
    }
    if (Math.abs(c.x) > 8.6) { c.x = Math.sign(c.x) * 8.6; c.vx *= -0.3; } // concrete barriers
    c.z += (playerSpeed - c.speed) * dt;
    c.mesh.position.set(c.x, c.y, c.z);
    c.mesh.rotation.set(c.rx, c.yaw, c.rz);
    c.setBlink(blinkOn); // hazard lights
  }

  // spawn: true = ground + air, false = none, 'air' = only flying traffic
  update(dt, playerSpeed, distance, time, spawn = true) {
    if (this.sync) {
      if (spawn) this.updateSync(distance);
      const blinkOn = Math.sin(time * 9) > 0;
      for (const c of this.active) {
        if (c.hit) this.updateWreck(c, dt, playerSpeed, blinkOn);
        else c.mesh.position.set(c.x, 0, c.z);
      }
      return;
    }
    if (spawn) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) {
        this.spawnTimer = (DENSITY[this.density] || 1) > 1.2 ? 0.12 : 0.2;
        if (spawn !== 'air') this.trySpawnGround(distance);
        this.trySpawnAir(distance);
      }
    }

    const blinkOn = Math.sin(time * 9) > 0;
    const others = this.extra.length ? this.active.concat(this.extra.filter((e) => e.active)) : this.active;
    for (const c of this.active) {
      if (c.hit) { this.updateWreck(c, dt, playerSpeed, blinkOn); continue; }

      // follow the car ahead: keep a speed-dependent safe gap (same layer only)
      let limit = c.baseSpeed;
      for (const o of others) {
        if (o === c || o.z >= c.z) continue;
        const sameLane = o.layer === c.layer &&
          (o.lane === c.lane || o.targetLane === c.lane || o.lane === c.targetLane || o.targetLane === c.targetLane);
        const wreckAhead = o.hit && Math.abs(o.x - c.x) < o.halfW + c.halfW + 0.6 && Math.abs(o.y - c.y) < 2.5;
        if (!sameLane && !wreckAhead) continue;
        const gap = c.z - o.z - c.halfL - o.halfL;
        const safe = 5 + c.speed * 0.45;
        if (gap < safe + 15) limit = Math.min(limit, Math.max(0, o.speed + (gap - safe) * 0.6));
      }
      const braking = limit < c.speed - 0.3;
      const prevSpeed = c.speed;
      c.speed += (limit - c.speed) * Math.min(1, dt * (braking ? 5 : 0.8));
      c.setBrake(braking);

      // lane changes (only well ahead of the player so it stays fair)
      c.nextLaneChange -= dt;
      if (c.nextLaneChange <= 0 && c.lane === c.targetLane && c.z < -55 && c.type !== 'truck') {
        c.nextLaneChange = 4 + Math.random() * 8;
        const dir = c.lane === 0 ? 1 : c.lane === 3 ? -1 : (Math.random() < 0.5 ? -1 : 1);
        const t = c.lane + dir;
        if (this.canMergeInto(c, t)) { c.targetLane = t; c.laneT = 0; }
      }
      let yaw = 0;
      let roll = 0;
      if (c.targetLane !== c.lane) {
        c.laneT = Math.min(1, c.laneT + dt / 2.4);
        const a = LANES[c.lane], b = LANES[c.targetLane];
        const nx = a + (b - a) * smooth(c.laneT);
        const vx = (nx - c.x) / Math.max(dt, 1e-4);
        yaw = -vx * 0.02;
        roll = vx * (c.air ? 0.05 : 0.012);           // body leans into the lane change (banks when flying)
        c.x = nx;
        c.setBlink(blinkOn);
        if (c.laneT >= 1) { c.lane = c.targetLane; c.setBlink(false); }
      }
      c.yaw += (yaw - c.yaw) * Math.min(1, dt * 6);
      // suspension: nose dives under braking; flying cars bob on their thrusters
      const decel = (prevSpeed - c.speed) / Math.max(dt, 1e-4);
      c.rx += ((c.air ? 0 : -Math.max(-3, Math.min(6, decel)) * 0.006) - c.rx) * Math.min(1, dt * 6);
      c.rz += (roll - c.rz) * Math.min(1, dt * 5);
      c.y = c.air ? c.alt + Math.sin(time * 1.7 + c.phase) * 0.18 : 0;

      c.z += (playerSpeed - c.speed) * dt;
      c.mesh.position.set(c.x, c.y, c.z);
      c.mesh.rotation.set(c.rx, c.yaw, c.rz);
    }

    this.separate();

    // recycle cars far behind or far ahead
    for (let i = this.active.length - 1; i >= 0; i--) {
      const c = this.active[i];
      if (c.z > 40 || c.z < -700) {
        this.release(c);
        this.active.splice(i, 1);
      }
    }
  }
}
