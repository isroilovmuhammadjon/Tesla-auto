// AI rival racer. It drives a real car among the same traffic as the player and tries to
// out-score them: it reads the traffic ahead in every lane, picks the most open lane,
// only changes lanes when the path is clear, keeps a safe gap, and saves nitro for open road.
import * as THREE from 'three';
import { createSportsCar } from './carModels.js?v=5399783e';
import { CARS, LANES } from './config.js?v=5399783e';
import { Powertrain } from './physics.js?v=5399783e';

const TRAFFIC_WINDOW_AHEAD = -600;   // traffic only exists between these z values
const TRAFFIC_WINDOW_BEHIND = 35;

function labelTexture(text, color) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const ctx = c.getContext('2d');
  ctx.fillStyle = 'rgba(5,8,18,0.75)';
  ctx.beginPath(); ctx.roundRect(4, 8, 248, 48, 12); ctx.fill();
  ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.stroke();
  ctx.fillStyle = color;
  ctx.font = 'bold 26px Orbitron, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, 128, 33);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Rival {
  constructor(scene) {
    this.scene = scene;
    this.car = null;
    this.active = false;
    // fields shared with traffic so collisions / following treat the rival like any vehicle
    this.isRival = true;
    this.halfW = 1.0; this.halfL = 2.3; this.height = 1.25; this.mass = 1.6;
    this.layer = 0; this.y = 0; this.hit = false;
  }

  // traffic-compatible no-ops
  setBlink() {}
  setBrake(on) { this.braking = on; }

  spawn(playerIndex) {
    const pool = CARS.map((c, i) => i).filter((i) => i !== playerIndex && !CARS[i].flying);
    const idx = pool[Math.floor(Math.random() * pool.length)];
    this.def = CARS[idx];
    this.pt = new Powertrain(this.def);
    this.dispose();
    this.car = createSportsCar(this.def);
    this.mesh = this.car.group;
    const tex = labelTexture(`AI · ${this.def.name}`, '#ff4fd8');
    this.label = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
    this.label.scale.set(3.2, 0.8, 1);
    this.label.position.set(0, 2.4, 0);
    this.mesh.add(this.label);
    this.scene.add(this.mesh);

    this.active = true;
    this.hit = false;
    this.lane = this.targetLane = 1;
    this.x = LANES[1];
    this.y = 0; this.vy = 0; this.vx = 0;
    this.rx = 0; this.rz = 0; this.wx = 0; this.wz = 0; this.spin = 0; this.yaw = 0;
    this.z = 0;
    this.speed = 0; this.baseSpeed = 0;
    this.latVel = 0;
    this.nitro = 1; this.nitroOn = false;
    this.decisionTimer = 0;
    this.overtakes = 0;
    this.mesh.position.set(this.x, 0, 0);
    this.mesh.rotation.set(0, 0, 0);
    this.mesh.visible = true;
  }

  hide() {
    this.active = false;
    if (this.mesh) this.mesh.visible = false;
  }

  dispose() {
    if (this.car) {
      this.scene.remove(this.car.group);
      this.car.dispose();
      if (this.label) { this.label.material.map.dispose(); this.label.material.dispose(); }
      this.car = null;
    }
  }

  // Distance ahead of the player in metres (positive = rival is ahead)
  get lead() { return -this.z; }

  // Nearest obstacle ahead in a lane: { gap, speed }
  scanLane(lane, traffic, player) {
    let gap = 400, speed = 999;
    const lx = LANES[lane];
    const consider = (o, ox, oz, ohl, ospeed, inLane) => {
      if (!inLane) return;
      const dz = this.z - oz;                              // > 0: obstacle is ahead
      if (dz < -(ohl + this.halfL + 2)) return;            // well behind us
      const g = dz - ohl - this.halfL;
      if (g < gap) { gap = g; speed = ospeed; }
    };
    for (const c of traffic.active) {
      if (c.layer !== 0) continue;
      const inLane = c.hit ? Math.abs(c.x - lx) < c.halfW + 1.4 : (c.lane === lane || c.targetLane === lane);
      consider(c, c.x, c.z, c.halfL, c.hit ? 0 : c.speed, inLane);
    }
    if (player && player.y < 1.5) {
      consider(null, player.x, 0, 2.2, player.speed, Math.abs(player.x - lx) < 2.6);
    }
    return { gap, speed };
  }

  // Is anything alongside us in this lane (blocks a lane change)?
  laneBlockedNearby(lane, traffic, player) {
    const lx = LANES[lane];
    for (const c of traffic.active) {
      if (c.layer !== 0) continue;
      const inLane = c.hit ? Math.abs(c.x - lx) < c.halfW + 1.4 : (c.lane === lane || c.targetLane === lane);
      if (!inLane) continue;
      const dz = c.z - this.z;                             // > 0: behind us
      const closing = Math.max(0, c.speed - this.speed);
      if (dz > -(c.halfL + this.halfL + 6) && dz < c.halfL + this.halfL + 6 + closing * 2) return true;
    }
    if (player && player.y < 1.5 && Math.abs(player.x - lx) < 2.6 && Math.abs(this.z) < 9) return true;
    return false;
  }

  update(dt, P, traffic, time, racing) {
    if (!this.active) return;
    if (this.hit) {
      traffic.updateWreck(this, dt, P.speed, false);
      return;
    }
    const vmaxBase = this.def.maxSpeed / 3.6;
    const inWindow = this.z > TRAFFIC_WINDOW_AHEAD && this.z < TRAFFIC_WINDOW_BEHIND;
    let desired = 0;

    if (racing) {
      if (inWindow) {
        // ---- choose a lane (re-evaluated a few times per second)
        this.decisionTimer -= dt;
        if (this.decisionTimer <= 0 && this.targetLane === this.lane) {
          this.decisionTimer = 0.25;
          const scoreOf = (l) => {
            const s = this.scanLane(l, traffic, P);
            // time until we'd have to slow down, in metres of free road
            return s.gap + Math.max(-60, (s.speed - this.speed) * 3);
          };
          const here = scoreOf(this.lane);
          let best = this.lane, bestScore = here;
          for (const l of [this.lane - 1, this.lane + 1]) {
            if (l < 0 || l > 3 || this.laneBlockedNearby(l, traffic, P)) continue;
            const s = scoreOf(l) - 12;                     // small cost for changing lanes
            if (s > bestScore) { best = l; bestScore = s; }
          }
          if (best !== this.lane && bestScore > here + 10) this.targetLane = best;
        }
        // ---- speed: follow the nearest obstacle in the lanes we occupy
        const a = this.scanLane(this.lane, traffic, P);
        const b = this.targetLane !== this.lane ? this.scanLane(this.targetLane, traffic, P) : a;
        const gap = Math.min(a.gap, b.gap);
        const ahead = a.gap <= b.gap ? a.speed : b.speed;
        // physically correct following: never faster than what our brakes can shed in the gap ahead
        // (v² ≤ v_ahead² + 2·a·d), using 75 % of max braking to keep a margin
        const margin = 6 + this.speed * 0.25;
        const room = Math.max(0, gap - margin);
        const vAhead = Math.max(0, ahead);
        desired = Math.min(vmaxBase, Math.sqrt(vAhead * vAhead + 2 * this.pt.brakeDecel * 0.75 * room));
        // ---- nitro on long open stretches only
        const open = gap > 170 && Math.abs(this.x - LANES[this.targetLane]) < 0.4;
        this.nitroOn = open && this.nitro > (this.nitroOn ? 0.02 : 0.3);
      } else if (this.z <= TRAFFIC_WINDOW_AHEAD) {
        desired = vmaxBase * 0.92;                          // far ahead: steady cruise
        this.nitroOn = false;
      } else {
        desired = vmaxBase * 1.08;                          // far behind: push to catch up
        this.nitroOn = this.nitro > 0.2;
      }
    }

    // ---- longitudinal dynamics: the exact same powertrain model as the player car
    const err = desired - this.speed;
    const throttle = err > 0.3 ? Math.min(1, err / 3) : 0;
    const brake = err < -1 ? Math.min(1, (-err - 1) / 5) : 0;
    const acc = this.pt.step(dt, this.speed, throttle, brake, this.nitroOn && throttle > 0);
    this.speed = Math.max(0, this.speed + acc * dt);
    this.setBrake(brake > 0.05);
    if (this.nitroOn) this.nitro = Math.max(0, this.nitro - dt / (4.2 * this.def.nitro));
    else this.nitro = Math.min(1, this.nitro + dt * 0.035);

    // ---- lateral: smooth lane change with limited grip
    const tx = LANES[this.targetLane];
    const want = THREE.MathUtils.clamp((tx - this.x) * 3, -9, 9) * Math.min(1, this.speed / 8 + 0.2);
    this.latVel += THREE.MathUtils.clamp((want - this.latVel) * 7, -24, 24) * dt;
    this.x += this.latVel * dt;
    if (Math.abs(tx - this.x) < 0.15 && Math.abs(this.latVel) < 0.6) { this.lane = this.targetLane; }

    this.z += (P.speed - this.speed) * dt;

    // ---- safety net: never overlap a traffic vehicle
    for (const c of traffic.active) {
      if (c.layer !== 0) continue;
      if (Math.abs(c.x - this.x) >= c.halfW + this.halfW + 0.2) continue;
      const minDz = c.halfL + this.halfL + 0.6;
      const dz = this.z - c.z;
      if (Math.abs(dz) >= minDz) continue;
      if (dz > 0) { this.z = c.z + minDz; this.speed = Math.min(this.speed, c.speed); }
      else if (!c.hit) { c.z = this.z - minDz; c.mesh.position.z = c.z; }
    }

    // ---- visuals
    this.yaw += (-this.latVel * 0.03 - this.yaw) * Math.min(1, dt * 8);
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.set(0, this.yaw, 0);
    this.car.body.rotation.z = THREE.MathUtils.lerp(this.car.body.rotation.z, this.latVel * 0.01, Math.min(1, dt * 6));
    this.car.update(dt, this.speed, (tx - this.x) * 0.3, this.braking, this.nitroOn, time, 0, 0);
    // label always readable: fade out when the rival is far away
    this.mesh.visible = this.z > -650 && this.z < 60;
  }
}
