// Planar vehicle dynamics for the city: a two-axle ("bicycle") model with real tyre forces.
//
// - Each axle's tyres make side force from their slip angle with a Pacejka-style curve:
//   it grows almost linearly for small angles, peaks at about 7-8 degrees and drops a little
//   past the peak, so a car that is pushed too hard slides instead of turning on rails.
// - Grip depends on the load on the axle: braking moves weight to the front (the nose dives
//   and the front bites), accelerating moves it to the back.
// - Friction circle: a tyre that is braking or driving hard has less grip left for cornering,
//   so braking in a corner or flooring it out of one makes the car run wide or step out.
// - The sedan drives its front wheels (it pushes wide when you floor it in a turn); the sports
//   cars drive the rear (they can oversteer). Below walking pace the model blends into plain
//   rolling-wheel geometry, where the slip angle formulas stop making sense.
//
// Body frame: x forward, y to the left; r = yaw rate, positive when turning left.

import * as THREE from 'three';

const G = 9.81;

export function chassisFor(def) {
  // Uzbek taxis (uzplayer.js) carry their own mass and axle positions; all but the Damas drive the front wheels
  if (def.chassis) {
    const c = def.chassis, L = c.a + c.b;
    return {
      m: c.m, a: c.a, b: c.b, L, Iz: c.m * c.a * c.b * 1.05, h: c.h,
      mu: 0.95 * (0.9 + 0.1 * def.handling) * (c.grip || 1), Cf: 125000 * (c.m / 1200) * (0.85 + 0.15 * def.handling), Cr: 140000 * (c.m / 1200) * (0.85 + 0.15 * def.handling),
      // lock from the real turning circle (wall to wall): radius = wheelbase / tan(lock)
      esc: 1, muF: 0.94, muR: 1.06, drive: c.rear ? 'rear' : 'front', maxWheel: c.lock || 0.46,
    };
  }
  const sedan = def.style === 'malibu';
  const m = sedan ? 1540 : 1450;
  const a = sedan ? 1.18 : 1.3;          // centre of mass to front axle (m); front-heavy sedan
  const b = sedan ? 1.65 : 1.3;          // ... to rear axle
  return {
    m, a, b, L: a + b,
    Iz: m * a * b * 1.05,                // yaw inertia
    h: sedan ? 0.56 : 0.48,              // centre of mass height
    mu: 0.98 * (0.9 + 0.1 * def.handling) * (sedan ? 1 : 1.06),
    Cf: 150000 * (0.85 + 0.15 * def.handling),  // cornering stiffness per axle (N/rad): grip peaks near 8 degrees
    Cr: 170000 * (0.85 + 0.15 * def.handling),
    esc: sedan ? 1 : 0.35,
    // roll-stiffness balance: a family sedan is set up to run wide at the limit, never to spin
    muF: sedan ? 0.93 : 0.99, muR: sedan ? 1.07 : 1.01,               // stability control: the family sedan catches slides, sports cars let you drift
    drive: sedan ? 'front' : def.flying ? 'all' : 'rear',
    maxWheel: sedan ? 0.46 : 0.6,        // road-wheel lock (rad): the sedan's 11.4 m turning circle
  };
}

// side force of one axle (Pacejka "magic formula" with B·C·D equal to the cornering stiffness)
function tyre(alpha, Fmax, Ca) {
  if (Fmax <= 1) return 0;
  const C = 1.3, B = Ca / (C * Fmax);
  return -Fmax * Math.sin(C * Math.atan(B * alpha - 0.08 * (B * alpha - Math.atan(B * alpha))));
}

/**
 * Advances the car's velocities by dt.
 * s: { v (forward m/s), latV (left m/s), r (yaw rate), ax (last forward accel) }
 * delta: road-wheel angle, positive = left
 * aLong: longitudinal acceleration asked for by the powertrain / brakes (m/s²)
 * braking: 0..1 brake pedal (braking force is split 65 / 35 front / rear)
 * Returns { slide: 0..1 tyre squeal amount, ay: lateral acceleration }
 */
export function stepChassis(s, P, dt, delta, aLong, braking) {
  const n = dt > 1 / 90 ? 4 : 2;
  const h = dt / n;
  let slide = 0, ay = 0;
  for (let i = 0; i < n; i++) {
    const vx = s.v, vy = s.latV, r = s.r;
    const speed = Math.abs(vx);
    // weight on each axle, with transfer from the last step's acceleration
    const shift = (P.m * s.ax * P.h) / P.L;
    const Fzf = Math.max(P.m * G * 0.15, (P.m * G * P.b) / P.L - shift);
    const Fzr = Math.max(P.m * G * 0.15, (P.m * G * P.a) / P.L + shift);
    // longitudinal force per axle
    const Fx = P.m * aLong;
    let Fxf, Fxr;
    if (Fx >= 0) {
      Fxf = P.drive === 'front' ? Fx : P.drive === 'all' ? Fx * 0.45 : 0;
      Fxr = Fx - Fxf;
    } else {
      const bf = braking > 0 ? 0.65 : (P.drive === 'front' ? 1 : P.drive === 'all' ? 0.5 : 0);   // engine braking on the driven axle
      Fxf = Fx * bf; Fxr = Fx - Fxf;
    }
    // what each tyre can give: µ·Fz in total, shared between driving/braking and cornering;
    // a more heavily loaded tyre is a little less grippy per kilo (load sensitivity)
    const Fz0 = P.m * G / 2;
    const limF = P.mu * P.muF * Fzf * (1 - 0.1 * (Fzf / Fz0 - 1)), limR = P.mu * P.muR * Fzr * (1 - 0.1 * (Fzr / Fz0 - 1));
    // electronic brake-force distribution: the rear brakes never take more than half of the rear tyres'
    // grip, so braking in a turn leaves the rear enough side force (the front brakes take the rest)
    const rearShare = 0.5 + 0.4 * (1 - Math.min(1, Math.abs(delta) / 0.08));     // straight ahead the rear may brake harder
    if (Fx < 0 && braking > 0 && Math.abs(Fxr) > limR * rearShare) {
      const extra = Math.abs(Fxr) - limR * rearShare;
      Fxr = -limR * rearShare; Fxf = -(Math.abs(Fxf) + extra);
    }
    // ABS: a braked front wheel never locks — it keeps about a third of its grip for steering
    if (Fx < 0 && braking > 0) Fxf = Math.max(Fxf, -limF * (0.97 - 0.27 * Math.min(1, Math.abs(delta) / 0.08)));
    const spinF = Math.abs(Fxf) > limF, spinR = Math.abs(Fxr) > limR;
    Fxf = Math.max(-limF, Math.min(limF, Fxf));
    Fxr = Math.max(-limR, Math.min(limR, Fxr));
    const latF = Math.sqrt(Math.max(0, limF * limF - Fxf * Fxf)) * (spinF ? 0.55 : 1);
    const latR = Math.sqrt(Math.max(0, limR * limR - Fxr * Fxr)) * (spinR ? 0.55 : 1);

    // dynamic model above walking pace, rolling geometry below (slip angles explode near 0)
    const w = vx > 0 ? Math.max(0, Math.min(1, (speed - 1.5) / 3.5)) : 0;
    let dv = (Fxf * Math.cos(delta) + Fxr) / P.m;
    let dvy = 0, dr = 0;
    if (w > 0) {
      const af = Math.atan2(vy + P.a * r, speed) - delta;
      const ar = Math.atan2(vy - P.b * r, speed);
      const Fyf = tyre(af, latF, P.Cf);
      const Fyr = tyre(ar, latR, P.Cr);
      dv = (Fxf * Math.cos(delta) - Fyf * Math.sin(delta) + Fxr) / P.m + vy * r;
      dvy = (Fyf * Math.cos(delta) + Fxf * Math.sin(delta) + Fyr) / P.m - vx * r;
      dr = (P.a * (Fyf * Math.cos(delta) + Fxf * Math.sin(delta)) - P.b * Fyr) / P.Iz;
      // stability control: when the car rotates faster than the steering asks for (the tail is
      // coming round), brake one wheel to pull it straight and ease off the power
      // the yaw rate a sound car would make: what the steering asks for, capped by the grip
      const Kus = (P.m / P.L) * (P.b / P.Cf - P.a / P.Cr);
      const rWant = (vx * Math.tan(delta)) / (P.L + Math.max(0, Kus) * vx * vx);
      const rCap = (1.0 * P.mu * G) / Math.max(speed, 1);
      const rRef = Math.sign(rWant) * Math.min(Math.abs(rWant), rCap);
      const over = Math.abs(r) - Math.abs(rRef) - 0.05;
      if (P.esc > 0 && over > 0 && Math.sign(r) === Math.sign(rRef || r)) {
        // the stability control catches a slide; it doesn't fight a car that is simply turning
        dr -= Math.sign(r) * Math.max(0, over - 0.03) * 6 * P.esc;
        dv -= Math.max(0, over - 0.03) * 2 * P.esc;
      }
      if (P.esc > 0) dvy -= vy * Math.max(0, Math.abs(Math.atan2(vy, speed)) - 0.05) * 6 * P.esc;
      // a growing sideslip (the tail stepping out) is braked away, as stability control does
      const beta = Math.atan2(vy, speed);
      if (P.esc > 0 && Math.abs(beta) > 0.07 && Math.sign(beta) === -Math.sign(r || -beta)) dr += Math.sign(beta) * (Math.abs(beta) - 0.07) * 8 * P.esc;
      ay = dvy + vx * r;
      // how far past the grip peak the tyres are (for squeal and smoke)
      const peak = 0.13;
      slide = Math.max(slide, Math.min(1, Math.max(Math.abs(af) - peak, Math.abs(ar) - peak) * 6) * Math.min(1, speed / 8));
    }
    if (spinF || spinR) slide = Math.max(slide, Math.min(1, speed / 6 + 0.3) * (Fx > 0 ? 0.6 : 0.9));
    s.v += dv * h;
    s.latV += dvy * h;
    s.r += dr * h;
    // blend towards plain rolling geometry at low speed and in reverse
    const rKin = (vx * Math.tan(delta)) / P.L;
    if (w < 1) {
      const k = 1 - w;
      s.r += (rKin - s.r) * Math.min(1, k * 12 * h * 10);
      s.latV += (rKin * P.b - s.latV) * Math.min(1, k * 12 * h * 10);
      if (w === 0) ay = vx * rKin;
    }
    s.ax = (s.ax * 0.8) + (dv - vy * r) * 0.2;
  }
  return { slide, ay };
}

// Dark tyre marks left on the asphalt while the tyres slide: a ring buffer of thin quads.
export class SkidMarks {
  constructor(parent, max = 700) {
    this.max = max;
    const g = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    const m = new THREE.MeshBasicMaterial({ color: 0x0a0a0a, transparent: true, opacity: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    this.mesh = new THREE.InstancedMesh(g, m, max);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.renderOrder = 1;
    parent.add(this.mesh);
    this.next = 0;
    this.last = [null, null, null, null];
    this.m4 = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.yAxis = new THREE.Vector3(0, 1, 0);
  }
  clear() { this.mesh.count = 0; this.next = 0; this.last.fill(null); }
  // wheel i at (x, z) on the ground; on = sliding now
  mark(i, x, z, on, y = 0.03) {
    const prev = this.last[i];
    if (!on) { this.last[i] = null; return; }
    if (!prev) { this.last[i] = [x, z]; return; }
    const dx = x - prev[0], dz = z - prev[1], len = Math.hypot(dx, dz);
    if (len < 0.35) return;
    if (len > 4) { this.last[i] = [x, z]; return; }
    this.q.setFromAxisAngle(this.yAxis, Math.atan2(dx, dz));
    this.m4.compose(new THREE.Vector3((x + prev[0]) / 2, y, (z + prev[1]) / 2), this.q, new THREE.Vector3(0.21, 1, len + 0.05));
    this.mesh.setMatrixAt(this.next, this.m4);
    this.next = (this.next + 1) % this.max;
    this.mesh.count = Math.max(this.mesh.count, this.next === 0 ? this.max : this.next);
    this.mesh.instanceMatrix.needsUpdate = true;
    this.last[i] = [x, z];
  }
}
