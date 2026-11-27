// Particle effects: sparks, smoke and debris (crashes, barrier scrapes).
import * as THREE from 'three';

function dotTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.3, 'rgba(255,255,255,0.6)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.MAX = 800;
    this.sparks = [];
    this.pos = new Float32Array(this.MAX * 3);
    this.col = new Float32Array(this.MAX * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setDrawRange(0, 0);
    this.geo = geo;
    const tex = dotTexture();
    this.points = new THREE.Points(geo, new THREE.PointsMaterial({
      size: 0.22, map: tex, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    this.points.frustumCulled = false;
    scene.add(this.points);

    this.smoke = [];
    for (let i = 0; i < 48; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: 0x6a7080, transparent: true, opacity: 0, depthWrite: false }));
      s.visible = false;
      scene.add(s);
      this.smoke.push({ s, life: 0, max: 1, vx: 0, vy: 0, vz: 0, grow: 1 });
    }

    this.debris = [];
    const dg = new THREE.BoxGeometry(0.28, 0.06, 0.34);
    for (let i = 0; i < 30; i++) {
      const m = new THREE.Mesh(dg, new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.6, roughness: 0.4 }));
      m.visible = false; m.castShadow = true;
      scene.add(m);
      this.debris.push({ m, life: 0, vx: 0, vy: 0, vz: 0, rx: 0, rz: 0 });
    }
  }

  emitSparks(x, y, z, count, { spread = 6, up = 4, vz = 0, vx = 0, life = 0.7 } = {}) {
    for (let i = 0; i < count && this.sparks.length < this.MAX; i++) {
      const max = life * (0.5 + Math.random() * 0.8);
      this.sparks.push({
        x, y, z, life: max, max,
        vx: vx + (Math.random() - 0.5) * spread, vy: Math.random() * up, vz: vz + (Math.random() - 0.5) * spread,
        r: 3 + Math.random(), g: 1.2 + Math.random() * 1.2, b: 0.3 + Math.random() * 0.3,
      });
    }
  }

  emitSmoke(x, y, z, count, dark = false) {
    let n = 0;
    for (const p of this.smoke) {
      if (p.life > 0) continue;
      p.max = p.life = 1.4 + Math.random() * 1.4;
      p.s.position.set(x + (Math.random() - 0.5), y + Math.random() * 0.5, z + (Math.random() - 0.5));
      p.vx = (Math.random() - 0.5) * 1.5; p.vy = 0.8 + Math.random() * 1.2; p.vz = (Math.random() - 0.5) * 1.5;
      p.grow = 1.5 + Math.random() * 2;
      p.s.scale.setScalar(1);
      p.s.material.color.setHex(dark ? 0x2a2d33 : 0x7a8090);
      p.s.visible = true;
      if (++n >= count) break;
    }
  }

  emitDebris(x, y, z, count, color) {
    let n = 0;
    for (const d of this.debris) {
      if (d.life > 0) continue;
      d.life = 3 + Math.random() * 2;
      d.m.position.set(x, y, z);
      d.vx = (Math.random() - 0.5) * 10; d.vy = 3 + Math.random() * 6; d.vz = (Math.random() - 0.5) * 10;
      d.rx = (Math.random() - 0.5) * 20; d.rz = (Math.random() - 0.5) * 20;
      d.m.material.color.setHex(Math.random() < 0.5 ? color : 0x1a1a1a);
      d.m.visible = true;
      if (++n >= count) break;
    }
  }

  clear() {
    this.sparks.length = 0;
    this.geo.setDrawRange(0, 0);
    for (const p of this.smoke) { p.life = 0; p.s.visible = false; }
    for (const d of this.debris) { d.life = 0; d.m.visible = false; }
  }

  update(dt, dz) {
    // sparks
    let n = 0;
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const p = this.sparks[i];
      p.life -= dt;
      if (p.life <= 0) { this.sparks[i] = this.sparks[this.sparks.length - 1]; this.sparks.pop(); continue; }
      p.vy -= 12 * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt + dz;
      if (p.y < 0.03) { p.y = 0.03; p.vy *= -0.35; p.vx *= 0.7; p.vz *= 0.7; }
    }
    for (const p of this.sparks) {
      const k = p.life / p.max;
      this.pos[n * 3] = p.x; this.pos[n * 3 + 1] = p.y; this.pos[n * 3 + 2] = p.z;
      this.col[n * 3] = p.r * k; this.col[n * 3 + 1] = p.g * k * k; this.col[n * 3 + 2] = p.b * k * k;
      n++;
    }
    this.geo.setDrawRange(0, n);
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;

    // smoke
    for (const p of this.smoke) {
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) { p.s.visible = false; continue; }
      const k = p.life / p.max;
      p.s.position.x += p.vx * dt; p.s.position.y += p.vy * dt; p.s.position.z += p.vz * dt + dz;
      p.s.scale.setScalar(1 + (1 - k) * p.grow * 3);
      p.s.material.opacity = Math.min(1, (1 - k) * 6) * k * 0.55;
    }

    // debris
    for (const d of this.debris) {
      if (d.life <= 0) continue;
      d.life -= dt;
      if (d.life <= 0) { d.m.visible = false; continue; }
      d.vy -= 15 * dt;
      d.m.position.x += d.vx * dt; d.m.position.y += d.vy * dt; d.m.position.z += d.vz * dt + dz;
      if (d.m.position.y < 0.04) {
        d.m.position.y = 0.04; d.vy *= -0.3; d.vx *= 0.6; d.vz *= 0.6; d.rx *= 0.6; d.rz *= 0.6;
      }
      d.m.rotation.x += d.rx * dt; d.m.rotation.z += d.rz * dt;
    }
  }
}
