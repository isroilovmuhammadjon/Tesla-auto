// "TOSHKENT" map: procedural, simplified versions of well-known Tashkent landmarks, Soviet panel
// blocks, plane trees (chinar), Uzbek road signs and flags. Everything is built from primitives.
import * as THREE from 'three';

// ---------------------------------------------------------------- helpers
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0.1, ...extra });
const glow = (color, k = 2) => new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k) });
function mesh(geo, mat, x = 0, y = 0, z = 0, parent) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  if (parent) parent.add(m);
  return m;
}
// half sphere (dome) of radius r, optionally stretched upwards (onion-ish domes)
const domeGeo = (r, stretch = 1, seg = 24) => new THREE.SphereGeometry(r, seg, 12, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, stretch, 1);

// Text on a sign / facade
export function textTexture(text, { w = 1024, h = 256, bg = '#0b5d2e', fg = '#ffffff', border = '#ffffff', font = 'bold 110px Rajdhani, Arial, sans-serif', sub = '' } = {}) {
  return canvasTex(w, h, (g) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    if (border) { g.strokeStyle = border; g.lineWidth = 10; g.strokeRect(14, 14, w - 28, h - 28); }
    g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = font;
    g.fillText(text, w / 2, sub ? h * 0.42 : h / 2);
    if (sub) { g.font = 'bold 54px Rajdhani, Arial, sans-serif'; g.fillText(sub, w / 2, h * 0.78); }
  });
}

// Uzbekistan flag: blue / white / green with thin red stripes, crescent and 12 stars
export function flagTexture() {
  return canvasTex(256, 128, (g, w, h) => {
    g.fillStyle = '#0099b5'; g.fillRect(0, 0, w, h / 3);
    g.fillStyle = '#ffffff'; g.fillRect(0, h / 3, w, h / 3);
    g.fillStyle = '#1eb53a'; g.fillRect(0, (2 * h) / 3, w, h / 3);
    g.fillStyle = '#ce1126'; g.fillRect(0, h / 3 - 2, w, 4); g.fillRect(0, (2 * h) / 3 - 2, w, 4);
    g.fillStyle = '#ffffff';
    g.beginPath(); g.arc(30, 21, 13, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#0099b5';
    g.beginPath(); g.arc(35, 21, 12, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#ffffff';
    const rows = [3, 4, 5];
    rows.forEach((n, r) => { for (let i = 0; i < n; i++) { g.beginPath(); g.arc(78 - i * 9, 33 - r * 9, 2.2, 0, Math.PI * 2); g.fill(); } });
  });
}

// Soviet panel-block facade at night: muted wall colour, balconies, warm lit windows
export function panelTexture(wall) {
  return canvasTex(128, 256, (g, w, h) => {
    g.fillStyle = wall; g.fillRect(0, 0, w, h);
    const cols = 6, rows = 12;
    const cw = w / cols, rh = h / rows;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = c * cw, y = r * rh;
        // balcony slab every other column
        if (c % 2 === 0) { g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x + 1, y + rh * 0.62, cw * 2 - 2, rh * 0.3); }
        const lit = Math.random() < 0.42;
        const warm = Math.random();
        g.fillStyle = lit
          ? (warm < 0.7 ? `rgb(${235 + Math.random() * 20 | 0},${170 + Math.random() * 40 | 0},${90 + Math.random() * 40 | 0})`
            : `rgb(${190 + Math.random() * 30 | 0},${210 + Math.random() * 30 | 0},${235 + Math.random() * 20 | 0})`)
          : `rgb(${20 + Math.random() * 12 | 0},${22 + Math.random() * 12 | 0},${28 + Math.random() * 12 | 0})`;
        g.fillRect(x + cw * 0.2, y + rh * 0.15, cw * 0.6, rh * 0.45);
      }
    }
  });
}

// Modern glass tower facade (Tashkent City)
export function glassTexture() {
  return canvasTex(128, 256, (g, w, h) => {
    g.fillStyle = '#0d2238'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 8) for (let x = 0; x < w; x += 16) {
      const lit = Math.random() < 0.35;
      g.fillStyle = lit ? `rgba(160,210,255,${0.55 + Math.random() * 0.4})` : `rgba(40,80,120,${0.4 + Math.random() * 0.3})`;
      g.fillRect(x + 1, y + 1, 14, 6);
    }
  });
}

// ---------------------------------------------------------------- landmarks
// Every builder returns a Group with its base at y = 0, facing the road along -x/+x as given by `side`.

function tvTower() {
  const g = new THREE.Group();
  const steel = std(0xb8bec8, { metalness: 0.6, roughness: 0.4 });
  // three splayed legs
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const leg = mesh(new THREE.BoxGeometry(3, 70, 3), steel, Math.cos(a) * 14, 32, Math.sin(a) * 14, g);
    leg.rotation.z = Math.cos(a) * 0.2;
    leg.rotation.x = -Math.sin(a) * 0.2;
  }
  mesh(new THREE.CylinderGeometry(2.2, 4.5, 150, 12), steel, 0, 125, 0, g);
  // observation pod with lit windows
  mesh(new THREE.CylinderGeometry(11, 9, 9, 24), std(0x9aa4b2, { metalness: 0.5 }), 0, 108, 0, g);
  mesh(new THREE.CylinderGeometry(11.2, 11.2, 2.2, 24, 1, true), glow(0x9fd8ff, 2.2), 0, 109, 0, g);
  mesh(new THREE.CylinderGeometry(7, 7, 5, 20), std(0x9aa4b2), 0, 125, 0, g);
  mesh(new THREE.CylinderGeometry(7.2, 7.2, 1.4, 20, 1, true), glow(0xffd08a, 2), 0, 125, 0, g);
  mesh(new THREE.CylinderGeometry(0.8, 1.8, 50, 8), steel, 0, 225, 0, g);
  // aviation lights along the shaft (blue) and a red tip
  for (let y = 60; y < 200; y += 20) mesh(new THREE.SphereGeometry(0.9, 8, 6), glow(0x3d9bff, 3), 0, y, 4.4 - y * 0.012, g);
  const tip = mesh(new THREE.SphereGeometry(1.4, 8, 6), glow(0xff2020, 4), 0, 251, 0, g);
  tip.userData.blink = true;
  g.userData = { name: 'Toshkent teleminorasi', width: 40, setback: 24 };
  return g;
}

function minorMosque() {
  const g = new THREE.Group();
  const white = std(0xe9e6df);
  const tile = std(0x2fb7c9, { emissive: 0x1aa0b8, emissiveIntensity: 0.35, roughness: 0.4 });
  mesh(new THREE.BoxGeometry(34, 14, 28), white, 0, 7, 0, g);
  // front arcade
  for (let i = -3; i <= 3; i++) mesh(new THREE.CylinderGeometry(0.7, 0.7, 10, 10), white, -18, 5, i * 3.8, g);
  mesh(new THREE.BoxGeometry(3, 1.4, 28), white, -18, 10.5, 0, g);
  // drum + turquoise dome
  mesh(new THREE.CylinderGeometry(8, 8, 6, 24), white, 0, 17, 0, g);
  mesh(domeGeo(8.3, 1.15), tile, 0, 20, 0, g);
  mesh(new THREE.CylinderGeometry(0.15, 0.15, 4, 6), glow(0xffd27a, 2), 0, 31, 0, g);
  // two minarets
  for (const z of [-17, 17]) {
    mesh(new THREE.CylinderGeometry(1.6, 2, 34, 12), white, -14, 17, z, g);
    mesh(new THREE.CylinderGeometry(2.6, 2.6, 1.2, 12), white, -14, 28, z, g);
    mesh(new THREE.CylinderGeometry(2.62, 2.62, 0.5, 12, 1, true), glow(0x49d6e8, 2), -14, 28.6, z, g);
    mesh(domeGeo(1.7, 1.4, 12), tile, -14, 34, z, g);
  }
  // floodlit facade strip
  mesh(new THREE.BoxGeometry(0.3, 0.4, 34), glow(0xfff0d0, 1.8), -17.2, 0.6, 0, g);
  g.userData = { name: 'Minor masjidi', width: 45, setback: 22 };
  return g;
}

function madrasa() {
  const g = new THREE.Group();
  const brick = std(0xc9a46e, { roughness: 0.95 });
  const tile = std(0x1f7fb8, { emissive: 0x0f5f9a, emissiveIntensity: 0.4 });
  const turq = std(0x33c4c9, { emissive: 0x1aa0a8, emissiveIntensity: 0.35 });
  mesh(new THREE.BoxGeometry(12, 12, 60), brick, 0, 6, 0, g);
  // central portal (pishtaq) with a deep arch
  mesh(new THREE.BoxGeometry(14, 24, 20), brick, -1, 12, 0, g);
  mesh(new THREE.BoxGeometry(1, 16, 11), std(0x5a3e22), -8.1, 9, 0, g);
  mesh(new THREE.CylinderGeometry(5.5, 5.5, 1, 20, 1, false, 0, Math.PI).rotateX(Math.PI / 2).rotateY(Math.PI / 2), std(0x5a3e22), -8.1, 17, 0, g);
  mesh(new THREE.BoxGeometry(1.2, 2, 18), tile, -8.2, 22, 0, g);     // blue tile band
  mesh(new THREE.BoxGeometry(1.2, 0.8, 56), turq, -6.2, 11.6, 0, g);
  // corner towers (guldasta)
  for (const z of [-30, 30]) {
    mesh(new THREE.CylinderGeometry(2.2, 2.6, 18, 12), brick, -4, 9, z, g);
    mesh(domeGeo(2.4, 1.2, 12), turq, -4, 18, z, g);
  }
  // domes behind
  for (const z of [-16, 16]) mesh(domeGeo(5, 1.2), tile, 3, 12, z, g);
  // warm floodlights
  mesh(new THREE.BoxGeometry(0.3, 0.4, 60), glow(0xffc070, 1.6), -6.3, 0.6, 0, g);
  g.userData = { name: "Ko'kaldosh madrasasi", width: 64, setback: 12 };
  return g;
}

// Chorsu bazaar: the great turquoise dome covered in a blue / white / turquoise geometric pattern, standing on
// a drum ringed with tall pointed arched windows, over a lower ring of arches and blue tile panels; two smaller
// domes beside it. (Before: a plain blue dome on white cylinders.) Pattern and proportions from photos
// (docs/compare/street-chorsu.jpg); the tile motif is an original approximation, not traced.
function chorsuDomeTex() {
  return canvasTex(2048, 512, (g, w, h) => {
    g.fillStyle = '#1aa3b4'; g.fillRect(0, 0, w, h);
    const gores = 32, gw = w / gores;
    for (let i = 0; i < gores; i++) {
      const x = i * gw;
      // a pointed lozenge down each gore, white outline, dark blue core, small stars between
      for (let row = 0; row < 6; row++) {
        const y0 = h * (0.08 + row * 0.15), y1 = y0 + h * 0.13;
        g.fillStyle = row % 2 ? '#0d5f9e' : '#127fb8';
        g.beginPath(); g.moveTo(x + gw / 2, y0); g.lineTo(x + gw * 0.92, (y0 + y1) / 2); g.lineTo(x + gw / 2, y1); g.lineTo(x + gw * 0.08, (y0 + y1) / 2); g.closePath(); g.fill();
        g.strokeStyle = '#e9f4f2'; g.lineWidth = 3; g.stroke();
        g.fillStyle = '#f2e9c8'; g.beginPath(); g.arc(x + gw / 2, (y0 + y1) / 2, gw * 0.08, 0, Math.PI * 2); g.fill();
      }
      g.fillStyle = 'rgba(255,255,255,0.75)'; g.fillRect(x, 0, 2, h);       // white rib between gores
    }
    g.fillStyle = '#e8eee9'; g.fillRect(0, h * 0.965, w, h * 0.035);        // white band at the foot
    g.fillStyle = '#0c4f86'; g.fillRect(0, 0, w, h * 0.03);
  });
}
function archBandTex(n, { wall = '#efe7d6', arch = '#24323b', tile = null } = {}) {
  return canvasTex(2048, 256, (g, w, h) => {
    g.fillStyle = wall; g.fillRect(0, 0, w, h);
    const aw = w / n;
    for (let i = 0; i < n; i++) {
      const x = i * aw + aw * 0.14, ww = aw * 0.72, top = h * 0.12, bot = h * 0.9;
      if (tile) { g.fillStyle = tile; g.fillRect(i * aw + 2, h * 0.04, aw - 4, h * 0.92); }
      g.fillStyle = wall; g.fillRect(x - 4, top - 4, ww + 8, bot - top + 8);
      g.fillStyle = arch;
      g.beginPath(); g.moveTo(x, bot); g.lineTo(x, top + ww * 0.55);
      g.quadraticCurveTo(x, top, x + ww / 2, top - ww * 0.05); g.quadraticCurveTo(x + ww, top, x + ww, top + ww * 0.55);
      g.lineTo(x + ww, bot); g.closePath(); g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.5)'; g.lineWidth = 2; for (let k = 1; k < 4; k++) { g.beginPath(); g.moveTo(x + ww * k / 4, top + ww * 0.3); g.lineTo(x + ww * k / 4, bot); g.stroke(); }
    }
  });
}
function chorsu() {
  const g = new THREE.Group();
  const domeTex = chorsuDomeTex(); domeTex.wrapS = THREE.RepeatWrapping;
  const dome = new THREE.MeshStandardMaterial({ map: domeTex, roughness: 0.35, metalness: 0.15, emissive: 0x0a3f4a, emissiveIntensity: 0.15 });
  const drumTex = archBandTex(28); drumTex.wrapS = THREE.RepeatWrapping;
  const lowTex = archBandTex(40, { wall: '#e6dcc7', arch: '#2c3a44', tile: '#1f78b4' }); lowTex.wrapS = THREE.RepeatWrapping;
  const drum = new THREE.MeshStandardMaterial({ map: drumTex, roughness: 0.8 });
  const low = new THREE.MeshStandardMaterial({ map: lowTex, roughness: 0.8 });
  const plain = std(0xe3dac6);
  mesh(new THREE.CylinderGeometry(31, 31.5, 7, 64, 1, true), low, 0, 3.5, 0, g);          // lower arcade with blue tile panels
  mesh(new THREE.CylinderGeometry(31, 31, 0.8, 64), plain, 0, 7.4, 0, g);                 // ledge
  mesh(new THREE.CylinderGeometry(25.5, 26, 6.5, 64, 1, true), drum, 0, 11, 0, g);       // drum with tall arched windows
  mesh(new THREE.CylinderGeometry(26.6, 26.6, 0.7, 64), plain, 0, 14.4, 0, g);
  mesh(new THREE.SphereGeometry(26, 64, 20, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.55, 1), dome, 0, 14.6, 0, g);
  mesh(new THREE.CylinderGeometry(1.2, 2.2, 1.6, 16), plain, 0, 29.6, 0, g);             // lantern on top
  for (const [x, z] of [[-10, 38], [-10, -38]]) {
    mesh(new THREE.CylinderGeometry(8.5, 8.5, 6.5, 32, 1, true), low, x, 3.25, z, g);
    mesh(new THREE.SphereGeometry(8.6, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.62, 1), dome, x, 6.5, z, g);
  }
  g.userData = { name: 'Chorsu bozori', width: 80, setback: 36 };
  return g;
}

function ezgulikArch() {
  const g = new THREE.Group();
  const white = std(0xf2f0ea);
  const gold = std(0xd4a843, { metalness: 0.8, roughness: 0.3, emissive: 0x6a4a10, emissiveIntensity: 0.4 });
  for (let i = 0; i < 8; i++) {
    for (const x of [-4, 4]) mesh(new THREE.CylinderGeometry(0.7, 0.8, 16, 12), white, x, 8, -21 + i * 6, g);
  }
  mesh(new THREE.BoxGeometry(11, 2, 46), white, 0, 17, 0, g);
  // storks (laylaklar) on top
  for (let i = 0; i < 8; i++) {
    const s = new THREE.Group();
    mesh(new THREE.SphereGeometry(0.8, 10, 8).scale(1, 0.8, 1.6), gold, 0, 0, 0, s);
    mesh(new THREE.ConeGeometry(0.25, 2, 6).rotateX(-0.9), gold, 0, 1.2, -1, s);
    mesh(new THREE.BoxGeometry(3.4, 0.1, 0.8), gold, 0, 0.3, 0.2, s);
    s.position.set(0, 19, -21 + i * 6);
    g.add(s);
  }
  mesh(new THREE.BoxGeometry(0.3, 0.3, 46), glow(0xfff2d0, 2), -5.6, 16, 0, g);
  g.userData = { name: 'Mustaqillik maydoni · Ezgulik ravog\'i', width: 50, setback: 10 };
  return g;
}

function temurMuseum() {
  const g = new THREE.Group();
  const white = std(0xe9e6df);
  const blue = std(0x1d72c8, { emissive: 0x0d52a0, emissiveIntensity: 0.5, roughness: 0.3 });
  mesh(new THREE.CylinderGeometry(18, 18, 14, 32), white, 0, 7, 0, g);
  for (let i = 0; i < 20; i++) { const a = (i / 20) * Math.PI * 2; mesh(new THREE.CylinderGeometry(0.6, 0.6, 13, 8), white, Math.cos(a) * 19.5, 6.5, Math.sin(a) * 19.5, g); }
  mesh(new THREE.CylinderGeometry(13, 13, 5, 32), white, 0, 16.5, 0, g);
  mesh(domeGeo(13.2, 1.1, 32), blue, 0, 19, 0, g);
  const ribMat = glow(0x6fc6ff, 1.4);
  for (let i = 0; i < 16; i++) {
    const rib = mesh(new THREE.TorusGeometry(13.25, 0.12, 4, 20, Math.PI / 2), ribMat, 0, 19, 0, g);
    rib.rotation.y = (i / 16) * Math.PI * 2;
    rib.scale.set(1, 1.1, 1);
  }
  mesh(new THREE.CylinderGeometry(19.8, 19.8, 0.5, 32, 1, true), glow(0xfff0c8, 1.6), 0, 13.2, 0, g);
  g.userData = { name: 'Amir Temur muzeyi', width: 42, setback: 24 };
  return g;
}

function hotelUzbekistan() {
  const g = new THREE.Group();
  const facade = canvasTex(256, 256, (c, w, h) => {
    c.fillStyle = '#d8d4ca'; c.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 14) for (let x = 0; x < w; x += 14) {
      c.fillStyle = Math.random() < 0.4 ? '#f3c37a' : '#2a2f3a';
      c.fillRect(x + 3, y + 3, 8, 8);
    }
  });
  facade.wrapS = facade.wrapT = THREE.RepeatWrapping;
  facade.repeat.set(3, 3);
  const body = new THREE.MeshBasicMaterial({ map: facade, color: 0xbfbfbf });
  // concave facade from slightly rotated slabs
  for (let i = -3; i <= 3; i++) {
    const slab = mesh(new THREE.BoxGeometry(10, 58, 12.5), body, Math.abs(i) * 1.8, 29, i * 12, g);
    slab.rotation.y = i * 0.06;
  }
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(44, 6), new THREE.MeshBasicMaterial({ map: textTexture('UZBEKISTAN', { bg: '#0b1020', fg: '#7ad7ff', border: '' }), toneMapped: false }));
  sign.position.set(-5.5, 62, 0);
  sign.rotation.y = -Math.PI / 2;
  g.add(sign);
  g.userData = { name: '"O\'zbekiston" mehmonxonasi', width: 90, setback: 10 };
  return g;
}

function tashkentCity() {
  const g = new THREE.Group();
  const gt = glassTexture();
  gt.wrapS = gt.wrapT = THREE.RepeatWrapping;
  const towers = [[0, 0, 22, 210], [16, -40, 18, 140], [20, 38, 16, 120], [40, 0, 20, 95]];
  for (const [x, z, w, h] of towers) {
    const t = gt.clone(); t.repeat.set(1, Math.round(h / 40)); t.needsUpdate = true;
    mesh(new THREE.BoxGeometry(w, h, w), new THREE.MeshBasicMaterial({ map: t, color: 0xcfe3ff }), x, h / 2, z, g);
    mesh(new THREE.BoxGeometry(w + 0.4, 1, w + 0.4), glow(0x7fd4ff, 2.2), x, h, z, g);
    const b = mesh(new THREE.SphereGeometry(0.9, 8, 6), glow(0xff2020, 4), x, h + 3, z, g);
    b.userData.blink = true;
  }
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(30, 5), new THREE.MeshBasicMaterial({ map: textTexture('TASHKENT CITY', { bg: '#04060c', fg: '#ffffff', border: '' }), toneMapped: false }));
  sign.position.set(-12, 14, 0);
  sign.rotation.y = -Math.PI / 2;
  g.add(sign);
  g.userData = { name: 'Toshkent City', width: 90, setback: 26 };
  return g;
}

function humoArena() {
  const g = new THREE.Group();
  mesh(new THREE.CylinderGeometry(42, 46, 26, 48), std(0x3a4150, { metalness: 0.5, roughness: 0.4 }), 0, 13, 0, g);
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    const rib = mesh(new THREE.BoxGeometry(0.6, 26, 0.6), glow(i % 2 ? 0x2a7dff : 0x5fd2ff, 1.6), Math.cos(a) * 44.2, 13, Math.sin(a) * 44.2, g);
    rib.rotation.z = Math.cos(a) * -0.08; rib.rotation.x = Math.sin(a) * 0.08;
  }
  mesh(domeGeo(42, 0.18, 48), std(0xc8ced8, { metalness: 0.6 }), 0, 26, 0, g);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(26, 5), new THREE.MeshBasicMaterial({ map: textTexture('HUMO ARENA', { bg: '#04060c', fg: '#ffffff', border: '' }), toneMapped: false }));
  sign.position.set(-46.5, 20, 0);
  sign.rotation.y = -Math.PI / 2;
  g.add(sign);
  g.userData = { name: 'Humo Arena', width: 95, setback: 48 };
  return g;
}


// Hazrati Imom (Hast Imom) complex: a wide portal mosque with two tall minarets and two
// turquoise domes on drums, sand-coloured brick. Front (portal side) faces -x.
export function hazratiImam() {
  const g = new THREE.Group();
  const brick = std(0xd8c2a0), tile = std(0x2aa6bd, { roughness: 0.4 }), dark = std(0x5a4632);
  mesh(new THREE.BoxGeometry(30, 12, 60), brick, 0, 6, 0, g);
  // portal (pishtaq) in the middle of the facade, with its arch in deep blue tilework
  mesh(new THREE.BoxGeometry(4, 22, 22), brick, -16, 11, 0, g);
  mesh(new THREE.BoxGeometry(0.4, 15, 11), std(0x1d4f8f), -18.1, 8.5, 0, g);
  mesh(new THREE.BoxGeometry(0.5, 11, 7), dark, -18.3, 6.5, 0, g);
  // gallery of arches along the front
  for (let z = -26; z <= 26; z += 5.2) if (Math.abs(z) > 12) mesh(new THREE.BoxGeometry(0.4, 6, 3.4), dark, -15.2, 4.5, z, g);
  // two domes on drums
  for (const z of [-15, 15]) {
    mesh(new THREE.CylinderGeometry(7, 7, 4, 24), brick, 2, 14, z, g);
    mesh(domeGeo(7.3, 1.25), tile, 2, 16, z, g);
  }
  // two minarets either side of the portal (about 50 m)
  for (const z of [-13.5, 13.5]) {
    mesh(new THREE.CylinderGeometry(1.8, 2.6, 48, 14), brick, -16, 24, z, g);
    mesh(new THREE.CylinderGeometry(3.0, 2.4, 3, 14), brick, -16, 46, z, g);
    mesh(domeGeo(1.9, 1.6, 12), tile, -16, 47.5, z, g);
  }
  g.userData = { name: 'Hazrati Imom majmuasi', width: 64, setback: 30 };
  return g;
}

// Amir Temur monument: a stepped granite base and a bronze rider (abstracted); front faces -x
export function temurStatue() {
  const g = new THREE.Group();
  const granite = std(0x7d7470, { roughness: 0.6 }), bronze = std(0x6b4a2b, { metalness: 0.6, roughness: 0.45 });
  mesh(new THREE.CylinderGeometry(9, 10, 0.8, 32), std(0xb9b2a6), 0, 0.4, 0, g);
  mesh(new THREE.BoxGeometry(6, 5, 3.2), granite, 0, 3.3, 0, g);
  mesh(new THREE.BoxGeometry(7, 0.6, 4), granite, 0, 6, 0, g);
  // horse
  mesh(new THREE.BoxGeometry(3.6, 1.5, 1.2), bronze, 0, 7.9, 0, g);
  for (const x of [-1.3, 1.3]) for (const z of [-0.4, 0.4]) mesh(new THREE.CylinderGeometry(0.16, 0.13, 1.8, 6), bronze, x, 6.9 + (x < 0 ? 0.3 : 0), z, g);
  const neck = mesh(new THREE.BoxGeometry(1.3, 1.8, 0.8), bronze, -1.9, 9.0, 0, g); neck.rotation.z = 0.6;
  mesh(new THREE.BoxGeometry(1.2, 0.6, 0.6), bronze, -2.7, 9.7, 0, g);
  // rider with a raised hand
  mesh(new THREE.BoxGeometry(0.9, 1.7, 0.9), bronze, 0.2, 9.4, 0, g);
  mesh(new THREE.SphereGeometry(0.38, 12, 8), bronze, 0.1, 10.5, 0, g);
  const arm = mesh(new THREE.BoxGeometry(0.25, 1.3, 0.25), bronze, -0.4, 10.4, 0.5, g); arm.rotation.z = 0.9;
  g.userData = { name: 'Amir Temur haykali', width: 20, setback: 10 };
  return g;
}


// International Forums Palace (Amir Temur square): a white block behind a tall colonnade of square
// pillars with dark glazing between them, under a wide shallow dome. Front faces -x.
export function forumsPalace() {
  const g = new THREE.Group();
  const white = std(0xeeece6, { roughness: 0.5 }), glass = std(0x1c2a3a, { roughness: 0.15, metalness: 0.4 });
  mesh(new THREE.BoxGeometry(56, 26, 96), white, 0, 13, 0, g);
  mesh(new THREE.BoxGeometry(0.4, 22, 84), glass, -28.3, 12, 0, g);
  for (let z = -42; z <= 42; z += 6) mesh(new THREE.BoxGeometry(2.2, 27, 2.2), white, -29.5, 13.5, z, g);
  mesh(new THREE.BoxGeometry(6, 3, 98), white, -27, 27.5, 0, g);
  mesh(new THREE.CylinderGeometry(24, 26, 5, 40), white, 0, 31, 0, g);
  mesh(domeGeo(24, 0.42, 40), std(0x8fb6d8, { roughness: 0.35, metalness: 0.3 }), 0, 33.5, 0, g);
  mesh(new THREE.BoxGeometry(14, 1.2, 70), std(0xcfcac0), -38, 0.6, 0, g);       // steps
  g.userData = { name: 'Xalqaro anjumanlar saroyi', width: 100, setback: 40 };
  return g;
}

// Tashkent chimes: a slim beige clock tower with a white open belfry and a flag, beside a long one-storey
// pavilion with arched windows and glazed verandas. Front faces -x.
export function chimes() {
  const g = new THREE.Group();
  const beige = std(0xd9cfb4, { roughness: 0.8 }), white = std(0xf2efe8, { roughness: 0.6 }), glass = std(0x2a3640, { roughness: 0.2, metalness: 0.3 });
  mesh(new THREE.BoxGeometry(10, 5.2, 36), beige, 0, 2.6, 0, g);
  mesh(new THREE.BoxGeometry(10.6, 0.5, 36.6), white, 0, 5.3, 0, g);
  for (const z of [-3, 3]) { mesh(new THREE.BoxGeometry(0.3, 3.2, 2.4), white, -5.1, 2.3, z, g); mesh(new THREE.BoxGeometry(0.32, 2.6, 1.9), glass, -5.15, 2.1, z, g); }
  for (const z0 of [-14, 11]) { mesh(new THREE.BoxGeometry(5, 3, 9), glass, -7.5, 1.5, z0, g); mesh(new THREE.BoxGeometry(5.4, 0.25, 9.4), std(0x9aa3a8), -7.5, 3.1, z0, g); }
  mesh(new THREE.BoxGeometry(4.2, 22, 4.2), beige, 0, 11, 9, g);
  mesh(new THREE.BoxGeometry(4.6, 0.6, 4.6), white, 0, 17, 9, g);
  mesh(new THREE.BoxGeometry(4.4, 4, 4.4), white, 0, 20, 9, g);
  mesh(new THREE.BoxGeometry(5.2, 0.6, 5.2), white, 0, 22.3, 9, g);
  const face = mesh(new THREE.CircleGeometry(0.9, 24), std(0x141414), -2.12, 15.3, 9, g); face.rotation.y = -Math.PI / 2;
  mesh(new THREE.BoxGeometry(0.05, 0.9, 0.06), glow(0xffffff, 1), -2.15, 15.5, 9, g);
  mesh(new THREE.CylinderGeometry(0.05, 0.05, 4, 6), std(0xcccccc), 0, 24.6, 9, g);
  mesh(new THREE.BoxGeometry(0.05, 1, 1.6), std(0x2e8b57), 0, 26, 9.8, g);
  g.userData = { name: 'Toshkent kurantlari', width: 30, setback: 10 };
  return g;
}

export const LANDMARK_BUILDERS = [tvTower, minorMosque, ezgulikArch, madrasa, tashkentCity, chorsu, temurMuseum, hotelUzbekistan, humoArena];

// Uzbek road-sign texts for the overhead gantries
export const SIGN_TEXTS = [
  ['Amir Temur shoh ko\'chasi', 'Markaz ↑'],
  ['Mustaqillik maydoni', '2 km'],
  ['Chilonzor ←', 'Yunusobod →'],
  ['Toshkent City', 'Navoiy ko\'chasi'],
  ['Chorsu', 'Shayxontohur'],
  ['Mirobod', 'Sergeli ↓'],
  ['TOSHKENT', 'Xush kelibsiz!'],
];

// ---------------------------------------------------------------- plane trees (chinar)
export function createTrees(count) {
  const trunkGeo = new THREE.CylinderGeometry(0.18, 0.28, 3.2, 6).translate(0, 1.6, 0);
  const crownGeo = new THREE.IcosahedronGeometry(1.9, 1).scale(1, 1.2, 1).translate(0, 4.4, 0);
  const trunks = new THREE.InstancedMesh(trunkGeo, new THREE.MeshLambertMaterial({ color: 0x5a4636 }), count);
  const crowns = new THREE.InstancedMesh(crownGeo, new THREE.MeshLambertMaterial({ color: 0x2f5a2a }), count);
  trunks.frustumCulled = crowns.frustumCulled = false;
  const tint = new THREE.Color();
  for (let i = 0; i < count; i++) { tint.setHSL(0.26 + Math.random() * 0.07, 0.5, 0.3 + Math.random() * 0.12); crowns.setColorAt(i, tint); }
  return { trunks, crowns };
}
