// A living street: trees that move in the wind and people walking along the sidewalks.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

// ---------------------------------------------------------------- wind
// One clock for every swaying material. Crowns bend more the higher up they are, each tree on its
// own phase, and the leaves flutter on top of that. Done in the vertex shader: costs nothing on the CPU.
export const WIND = { value: 0 };

export function windSway(material, amount = 1) {
  if (material.userData.wind) return material;
  material.userData.wind = true;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uWindT = WIND;
    shader.vertexShader = 'uniform float uWindT;\n' + shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      {
        #ifdef USE_INSTANCING
          vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
        #else
          vec3 ip = vec3(0.0);
        #endif
        float hgt = max(0.0, transformed.y - 1.2);
        float ph = uWindT * 1.15 + ip.x * 0.071 + ip.z * 0.053;
        float gust = 0.65 + 0.35 * sin(uWindT * 0.23 + ip.x * 0.011);
        float bend = (sin(ph) * 0.7 + sin(ph * 2.31 + 1.7) * 0.3) * gust * hgt * hgt * 0.011 * ${amount.toFixed(3)};
        transformed.x += bend;
        transformed.z += bend * 0.55 * cos(ph * 0.71);
        float leaf = sin(uWindT * 6.3 + position.x * 3.1 + position.z * 2.7 + position.y * 1.9 + ip.x) * 0.035 * step(2.4, position.y) * ${amount.toFixed(3)};
        transformed += objectNormal * leaf;
      }`);
  };
  material.customProgramCacheKey = () => 'wind' + amount;
  material.needsUpdate = true;
  return material;
}

// ---------------------------------------------------------------- people
const SHIRTS = [0xf2f2ee, 0x2b4a7a, 0x8c2f2f, 0x3d6b4a, 0xd9c7a5, 0x1d1d22, 0x6a7f99, 0xc45a2c, 0xe8d36a, 0x7b4f8a, 0x9aa4ad, 0x2d6f8f, 0xb03a5b];
const TROUSERS = [0x23272f, 0x2f3d5c, 0x3b3530, 0x4a4f57, 0x1a1a1d, 0x5c5248, 0x31405a];
const SKIN = [0xe6bf9c, 0xd8a77f, 0xc49068, 0xa8754f, 0xf0cfb0];
const HAIR = [0x1b1410, 0x2a1d14, 0x3c2a1a, 0x101010, 0x77706a, 0x5a3c22];

export class People {
  constructor(parent, { mobile = false } = {}) {
    this.n = mobile ? 36 : 80;
    this.list = [];
    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const legGeo = new RoundedBoxGeometry(0.14, 0.88, 0.16, 2, 0.05).translate(0, -0.44, 0);
    const armGeo = new RoundedBoxGeometry(0.095, 0.62, 0.11, 2, 0.04).translate(0, -0.3, 0);
    const parts = {
      torso: new RoundedBoxGeometry(0.4, 0.58, 0.23, 2, 0.08),
      head: new THREE.SphereGeometry(0.105, 12, 9).scale(0.92, 1.08, 1),
      hair: new THREE.SphereGeometry(0.113, 12, 7, 0, Math.PI * 2, 0, Math.PI * 0.52).scale(0.94, 1.06, 1.02),
      legL: legGeo, legR: legGeo, armL: armGeo, armR: armGeo,
    };
    this.mesh = {};
    for (const [k, g] of Object.entries(parts)) {
      const m = new THREE.InstancedMesh(g, mat, this.n);
      m.castShadow = true;
      m.frustumCulled = false;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      parent.add(m);
      this.mesh[k] = m;
    }
    this.m4 = new THREE.Matrix4(); this.p4 = new THREE.Matrix4(); this.r4 = new THREE.Matrix4();
    this.q = new THREE.Quaternion(); this.v = new THREE.Vector3(); this.s1 = new THREE.Vector3(1, 1, 1);
    this.yAxis = new THREE.Vector3(0, 1, 0);
    this.color = new THREE.Color();
    this.hide = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < this.n; i++) this.list.push({ alive: false });
  }

  setVisible(on) { for (const m of Object.values(this.mesh)) m.visible = on; }

  clear() { for (const p of this.list) p.alive = false; }

  // spot = { ax, az, bx, bz } a sidewalk line, from the city; px, pz = the player
  spawn(p, i, spot) {
    const len = Math.hypot(spot.bx - spot.ax, spot.bz - spot.az);
    if (len < 6) return false;
    Object.assign(p, {
      alive: true, ax: spot.ax, az: spot.az, dx: (spot.bx - spot.ax) / len, dz: (spot.bz - spot.az) / len, len,
      t: 2 + Math.random() * (len - 4), dir: Math.random() < 0.5 ? -1 : 1,
      lane: (Math.random() - 0.5) * 1.3, speed: 1.05 + Math.random() * 0.55, phase: Math.random() * 6.28,
      idle: Math.random() < 0.14, size: 0.9 + Math.random() * 0.16, ox: 0, oz: 0, ovx: 0, ovz: 0, yaw: 0, look: Math.random() * 6.28,
    });
    const set = (k, list) => { this.color.setHex(list[Math.floor(Math.random() * list.length)]); this.mesh[k].setColorAt(i, this.color); };
    set('torso', SHIRTS);
    const shirt = this.color.getHex();
    for (const k of ['armL', 'armR']) { this.color.setHex(Math.random() < 0.5 ? shirt : SKIN[Math.floor(Math.random() * SKIN.length)]); this.mesh[k].setColorAt(i, this.color); }
    set('legL', TROUSERS); this.mesh.legR.setColorAt(i, this.color);
    set('head', SKIN);
    set('hair', HAIR);
    for (const m of Object.values(this.mesh)) if (m.instanceColor) m.instanceColor.needsUpdate = true;
    return true;
  }

  // pick(px, pz) -> sidewalk spot or null; car = { x, z, vx, vz }
  update(dt, t, car, pick) {
    const R2 = 150 * 150;
    let spawned = 0;
    for (let i = 0; i < this.n; i++) {
      const p = this.list[i];
      if (p.alive) {
        const cx = p.ax + p.dx * p.t, cz = p.az + p.dz * p.t;
        if ((cx - car.x) ** 2 + (cz - car.z) ** 2 > R2) p.alive = false;
      }
      if (!p.alive && spawned < 4) {
        spawned++;
        const spot = pick(car.x, car.z);
        if (!spot || !this.spawn(p, i, spot)) p.alive = false;
      }
      if (!p.alive) { for (const m of Object.values(this.mesh)) m.setMatrixAt(i, this.hide); continue; }
      // walk along the sidewalk, turn round at the ends
      let moving = !p.idle;
      if (moving) {
        p.t += p.dir * p.speed * dt;
        if (p.t < 1.5 || p.t > p.len - 1.5) { p.dir = -p.dir; p.t = Math.max(1.5, Math.min(p.len - 1.5, p.t)); }
      }
      const nx = -p.dz, nz = p.dx;
      let x = p.ax + p.dx * p.t + nx * p.lane + p.ox, z = p.az + p.dz * p.t + nz * p.lane + p.oz;
      // step out of the way of a car coming at them: anyone in its path for the next ~1.5 s runs
      // sideways out of it, the closer the faster
      const rx = x - car.x, rz = z - car.z;
      const sp = Math.hypot(car.vx, car.vz);
      if (sp > 1.5) {
        const ux = car.vx / sp, uz = car.vz / sp;
        const along = rx * ux + rz * uz;            // ahead of the car (+)
        const lat = rx * uz - rz * ux;              // to one side of its path
        if (along > -2.5 && along < sp * 1.5 + 5 && Math.abs(lat) < 2.6) {
          const sgn = lat >= 0 ? 1 : -1;
          const urgency = 1 - Math.max(0, along) / (sp * 1.5 + 5);
          const tvx = uz * sgn * (2.5 + 3.5 * urgency), tvz = -ux * sgn * (2.5 + 3.5 * urgency);
          p.ovx += (tvx - p.ovx) * Math.min(1, dt * 10); p.ovz += (tvz - p.ovz) * Math.min(1, dt * 10);
          moving = true;
        }
      }
      p.ovx *= Math.exp(-dt * 2); p.ovz *= Math.exp(-dt * 2);
      p.ox += p.ovx * dt; p.oz += p.ovz * dt;
      p.ox *= Math.exp(-dt * 0.25); p.oz *= Math.exp(-dt * 0.25);   // drift back onto their line slowly
      x = p.ax + p.dx * p.t + nx * p.lane + p.ox; z = p.az + p.dz * p.t + nz * p.lane + p.oz;
      const hurry = Math.hypot(p.ovx, p.ovz);
      const want = p.idle && hurry < 0.3 ? p.look + Math.sin(t * 0.3 + i) * 0.4 : hurry > 0.6 ? Math.atan2(p.ovx, p.ovz) : Math.atan2(p.dx * p.dir, p.dz * p.dir);
      let dy = want - p.yaw;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      p.yaw += dy * Math.min(1, dt * 6);
      // gait: legs and arms swing opposite, a small bob each step
      const pace = moving || hurry > 0.3 ? Math.max(p.speed, hurry) : 0;
      p.phase += pace * dt * 5.2;
      const sw = pace > 0 ? Math.sin(p.phase) * Math.min(0.55, 0.28 + pace * 0.12) : Math.sin(t * 1.3 + i) * 0.03;
      const bob = pace > 0 ? Math.abs(Math.cos(p.phase)) * 0.035 : 0;
      this.p4.compose(this.v.set(x, bob, z), this.q.setFromAxisAngle(this.yAxis, p.yaw), this.s1.set(p.size, p.size, p.size));
      const part = (k, px, py, pz, rx2) => {
        this.r4.makeRotationX(rx2).setPosition(px, py, pz);
        this.m4.multiplyMatrices(this.p4, this.r4);
        this.mesh[k].setMatrixAt(i, this.m4);
      };
      part('torso', 0, 1.2, 0, pace > 0 ? 0.04 : 0);
      part('head', 0, 1.63, 0.01, 0);
      part('hair', 0, 1.645, 0.0, 0);
      part('legL', -0.1, 0.92, 0, sw);
      part('legR', 0.1, 0.92, 0, -sw);
      part('armL', -0.25, 1.45, 0, -sw * 0.8);
      part('armR', 0.25, 1.45, 0, sw * 0.8);
    }
    for (const m of Object.values(this.mesh)) m.instanceMatrix.needsUpdate = true;
  }
}
