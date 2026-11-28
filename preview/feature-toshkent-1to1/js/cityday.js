// Daytime Tashkent street furniture and textures for the open city: sunny facades of panel blocks,
// Uzbek shop signs, bus stops, traffic lights and a warm afternoon sky.
import * as THREE from 'three';

function canvasTex(w, h, draw, srgb = true) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// Soviet panel block in daylight: pale wall, rows of windows with white frames, glazed balconies
export function dayPanelTexture(wall, seed = 1) {
  let r = seed * 9301 + 49297;
  const rnd = () => ((r = (r * 9301 + 49297) % 233280) / 233280);
  // A Soviet-era panel block as it looks today: every flat's owner has glazed (or not) their own balcony
  // in their own frame colour, air conditioners hang under the windows, rust and rain streak the panels.
  return canvasTex(256, 512, (g, w, h) => {
    g.fillStyle = wall; g.fillRect(0, 0, w, h);
    const cols = 6, rows = 12, cw = w / cols, rh = h / rows;
    // uneven panels: a few slightly lighter or darker (replaced / repainted)
    for (let row = 0; row < rows; row++) for (let c = 0; c < cols; c += 2) {
      const k = rnd(); if (k < 0.2) { g.fillStyle = `rgba(${k < 0.1 ? '0,0,0' : '255,255,255'},0.05)`; g.fillRect(c * cw, row * rh, cw * 2, rh); }
    }
    g.strokeStyle = 'rgba(0,0,0,0.12)'; g.lineWidth = 2;
    for (let y = 0; y <= rows; y++) { g.beginPath(); g.moveTo(0, y * rh + 1); g.lineTo(w, y * rh + 1); g.stroke(); }
    for (let x = 0; x <= cols; x += 2) { g.beginPath(); g.moveTo(x * cw + 1, 0); g.lineTo(x * cw + 1, h); g.stroke(); }
    const FRAMES = ['#f2f1ec', '#f2f1ec', '#f2f1ec', '#7a5236', '#a9adb0', '#e9e2cf'];
    for (let row = 0; row < rows; row++) {
      for (let c = 0; c < cols; c++) {
        const x = c * cw, y = row * rh;
        if (c % 3 === 1) {
          const kind = rnd();
          if (kind < 0.16) {
            // open balcony: railing, dark inside, sometimes washing on a line
            g.fillStyle = '#3a3f44'; g.fillRect(x + 2, y + rh * 0.12, cw - 4, rh * 0.5);
            g.fillStyle = '#c9c5bb'; g.fillRect(x + 1, y + rh * 0.55, cw - 2, rh * 0.37);
            for (let k = x + 4; k < x + cw - 3; k += 5) { g.fillStyle = 'rgba(60,60,60,0.5)'; g.fillRect(k, y + rh * 0.55, 1, rh * 0.37); }
            if (rnd() < 0.6) for (let k = 0; k < 4; k++) { g.fillStyle = ['#d6453d', '#f0f0f0', '#3d6fb3', '#e8c547'][(k + row) % 4]; g.fillRect(x + 6 + k * 8, y + rh * 0.2, 5, rh * 0.18); }
            continue;
          }
          // glazed box, in the owner's choice of frame
          const fr = FRAMES[Math.floor(rnd() * FRAMES.length)];
          const deep = rnd() < 0.5 ? 2 : 0;
          g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(x + 3 + deep, y + rh * 0.12 + 3, cw - 4, rh * 0.82);   // its shadow on the wall
          g.fillStyle = fr; g.fillRect(x + 1, y + rh * 0.1, cw - 2, rh * 0.82);
          const tint = rnd() < 0.15 ? '#5f88a8' : rnd() < 0.5 ? '#4f6475' : '#647a8c';
          const panes = 2 + Math.floor(rnd() * 3), pw = (cw - 6) / panes;
          for (let k = 0; k < panes; k++) { g.fillStyle = tint; g.fillRect(x + 3 + k * pw + 1, y + rh * 0.16, pw - 2, rh * 0.4); }
          g.fillStyle = 'rgba(255,255,255,0.3)'; g.fillRect(x + 3, y + rh * 0.16, cw - 6, 2);
          g.fillStyle = 'rgba(0,0,0,0.1)'; g.fillRect(x + 1, y + rh * 0.6, cw - 2, rh * 0.32);   // solid lower panel
          continue;
        }
        g.fillStyle = '#f1efe9'; g.fillRect(x + cw * 0.16, y + rh * 0.16, cw * 0.68, rh * 0.52);
        const tone = 55 + rnd() * 45;
        g.fillStyle = `rgb(${tone | 0},${(tone + 18) | 0},${(tone + 34) | 0})`;
        g.fillRect(x + cw * 0.2, y + rh * 0.2, cw * 0.6, rh * 0.44);
        g.fillStyle = 'rgba(255,255,255,0.22)'; g.fillRect(x + cw * 0.2, y + rh * 0.2, cw * 0.6, rh * 0.08);
        g.fillStyle = '#f1efe9'; g.fillRect(x + cw * 0.49, y + rh * 0.2, 2, rh * 0.44);
        const cu = rnd();
        if (cu < 0.35) { g.fillStyle = ['rgba(230,220,200,0.75)', 'rgba(210,190,160,0.7)', 'rgba(190,205,220,0.6)'][Math.floor(cu * 8.5) % 3]; g.fillRect(x + cw * 0.2, y + rh * 0.2, cw * (cu < 0.15 ? 0.6 : 0.28), rh * 0.44); }
        if (rnd() < 0.22) {        // air conditioner under the window, with its drip streak
          const ax = x + cw * (0.2 + rnd() * 0.3);
          g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(ax + 6, y + rh * 0.84, 3, rh * 0.6);
          g.fillStyle = '#eef0ef'; g.fillRect(ax, y + rh * 0.7, cw * 0.42, rh * 0.18);
          g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(ax + 3, y + rh * 0.74, cw * 0.42 - 6, 2);
        }
        if (rnd() < 0.12) { g.fillStyle = 'rgba(70,50,30,0.08)'; g.fillRect(x + cw * 0.3, y + rh * 0.68, cw * 0.3, rh * (1 + rnd())); }   // rain streak
      }
    }
  });
}

export function dayGlassTexture() {
  return canvasTex(128, 256, (g, w, h) => {
    const grd = g.createLinearGradient(0, 0, w, h);
    grd.addColorStop(0, '#7fa6c9'); grd.addColorStop(0.5, '#4f7499'); grd.addColorStop(1, '#8db3d2');
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(220,235,245,0.55)'; g.lineWidth = 1.2;
    for (let x = 0; x <= w; x += w / 8) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
    for (let y = 0; y <= h; y += h / 16) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
  });
}

// ---------------------------------------------------------------- shop signs (one atlas, many planes)
export const SHOP_SIGNS = [
  ["DO'KON", '#1d6fb8'], ['OZIQ-OVQAT', '#1f8a4c'], ['NON', '#b8741d'], ['DORIXONA', '#1aa38f'],
  ['CHOYXONA', '#8a3b1d'], ['MEVA-SABZAVOT', '#3f8f2c'], ['SARTAROSHXONA', '#5a2d82'], ['KIYIM-KECHAK', '#c2185b'],
  ['UYALI ALOQA', '#e05a00'], ['MAISHIY TEXNIKA', '#2a4a9a'], ['OSHXONA • PALOV', '#a32020'], ['SHIRINLIKLAR', '#d8467d'],
  ["QURILISH MOLLARI", '#6b5a2a'], ["GO'SHT", '#9c1c1c'], ['KITOBLAR', '#2d6a5a'], ['BANK', '#0d4a8a'],
  ['SAMSA • KABOB', '#b5461b'], ['OSH MARKAZI', '#7a1f1f'], ["KO'ZOYNAKLAR", '#3a4f8a'], ['GULLAR', '#c23a77'],
  ['MAHSULOTLAR 24/7', '#2e7d32'], ['XOZMAG', '#5d4037'], ['TOSHKENT NON', '#a0522d'], ['STOMATOLOGIYA', '#00838f'],
];
const SIGN_ROWS = SHOP_SIGNS.length;
let signTex = null;
export function signAtlas() {
  if (signTex) return signTex;
  signTex = canvasTex(1024, 64 * SIGN_ROWS, (g, w) => {
    SHOP_SIGNS.forEach(([text, bg], i) => {
      const y = i * 64;
      g.fillStyle = bg; g.fillRect(0, y, w, 64);
      g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(0, y, w, 6);
      g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, y + 58, w, 6);
      g.fillStyle = '#ffffff'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = 'bold 40px Rajdhani, Arial, sans-serif';
      g.fillText(text, w / 2, y + 34);
    });
  });
  return signTex;
}
// a sign plane facing +z with the UVs of atlas row i
export function signGeometry(i, width, height) {
  const geo = new THREE.PlaneGeometry(width, height);
  const uv = geo.attributes.uv;
  const v0 = 1 - (i + 1) / SIGN_ROWS, v1 = 1 - i / SIGN_ROWS;
  for (let k = 0; k < uv.count; k++) uv.setY(k, uv.getY(k) > 0.5 ? v1 - 0.002 : v0 + 0.002);
  return geo;
}

// ---------------------------------------------------------------- bus stop (open side faces +z)
export function busStopParts() {
  const frame = [];
  const add = (geo, color, x, y, z) => {
    geo.translate(x, y, z);
    const c = new THREE.Color(color);
    const col = new Float32Array(geo.attributes.position.count * 3);
    for (let i = 0; i < col.length; i += 3) { col[i] = c.r; col[i + 1] = c.g; col[i + 2] = c.b; }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    frame.push(geo);
  };
  add(new THREE.BoxGeometry(4.6, 0.14, 1.9), 0x1f6f8b, 0, 2.62, 0);          // roof
  add(new THREE.BoxGeometry(4.7, 0.06, 2.0), 0xdfe5ea, 0, 2.72, 0);           // roof cap
  for (const x of [-2.2, 2.2]) for (const z of [-0.8, 0.5]) add(new THREE.CylinderGeometry(0.05, 0.05, 2.6, 8), 0x9aa3ad, x, 1.3, z);
  add(new THREE.BoxGeometry(3.2, 0.08, 0.42), 0x8a5a32, 0, 0.48, -0.55);     // bench
  add(new THREE.BoxGeometry(3.2, 0.42, 0.06), 0x8a5a32, 0, 0.75, -0.74);
  add(new THREE.BoxGeometry(0.08, 0.44, 0.4), 0x5b6168, -1.5, 0.24, -0.55);
  add(new THREE.BoxGeometry(0.08, 0.44, 0.4), 0x5b6168, 1.5, 0.24, -0.55);
  add(new THREE.BoxGeometry(4.6, 0.1, 0.1), 0x1f6f8b, 0, 2.5, 0.88);
  const glass = new THREE.BoxGeometry(4.3, 2.0, 0.04).translate(0, 1.4, -0.84);
  const sideGlass = [new THREE.BoxGeometry(0.04, 2.0, 1.2).translate(-2.2, 1.4, -0.2), new THREE.BoxGeometry(0.04, 2.0, 1.2).translate(2.2, 1.4, -0.2)];
  const sign = new THREE.PlaneGeometry(2.6, 0.42).translate(0, 2.4, 0.96);
  const signTexture = canvasTex(512, 84, (g, w, h) => {
    g.fillStyle = '#123f6b'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#ffffff'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = 'bold 44px Rajdhani, Arial, sans-serif';
    g.fillText('🚌  AVTOBUS BEKATI', w / 2, h / 2 + 2);
  });
  return { frame, glass: [glass, ...sideGlass], sign, signTexture };
}

// ---------------------------------------------------------------- traffic light on a mast arm
// local frame: pole at the origin, arm along -x, signal head at the arm's end facing +z
export const SIGNAL = { arm: 7, headY: 5.5, lampDY: [0.32, 0, -0.32] };
export function trafficLightParts() {
  const pole = new THREE.CylinderGeometry(0.11, 0.14, 6.2, 10).translate(0, 3.1, 0);
  const arm = new THREE.CylinderGeometry(0.07, 0.08, SIGNAL.arm + 0.2, 8).rotateZ(Math.PI / 2).translate(-SIGNAL.arm / 2, 6.0, 0);
  const hang = new THREE.CylinderGeometry(0.03, 0.03, 0.3, 6).translate(-SIGNAL.arm + 0.05, 5.95, 0);
  const head = new THREE.BoxGeometry(0.36, 1.06, 0.3).translate(-SIGNAL.arm + 0.05, SIGNAL.headY, 0);
  const visor = [];
  for (const dy of SIGNAL.lampDY) visor.push(new THREE.BoxGeometry(0.3, 0.03, 0.18).translate(-SIGNAL.arm + 0.05, SIGNAL.headY + dy + 0.13, 0.22));
  // small pedestrian-height signal on the pole itself
  const low = new THREE.BoxGeometry(0.3, 0.9, 0.26).translate(0, 3.0, 0.18);
  const lamp = new THREE.CircleGeometry(0.1, 14);
  return { metal: [pole, arm, hang], dark: [head, low, ...visor], lamp };
}

// warm late-afternoon sky with soft clouds; the sun sits low in the west-south-west
export function daySky(sunDir) {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { sunDir: { value: sunDir.clone().normalize() } },
    vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform vec3 sunDir; varying vec3 vDir;
      float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
        return mix(mix(h21(i), h21(i+vec2(1,0)), f.x), mix(h21(i+vec2(0,1)), h21(i+vec2(1,1)), f.x), f.y); }
      float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++){ s += a*n2(p); p *= 2.03; a *= 0.5; } return s; }
      void main(){
        vec3 d = normalize(vDir);
        float h = max(d.y, 0.0);
        vec3 zen = vec3(0.24, 0.45, 0.78), hor = vec3(0.78, 0.84, 0.9);
        vec3 c = mix(hor, zen, pow(h, 0.55));
        float s = max(dot(d, normalize(sunDir)), 0.0);
        c += vec3(1.0, 0.82, 0.55) * (pow(s, 6.0) * 0.35 + pow(s, 64.0) * 0.6);
        c += vec3(1.0, 0.95, 0.85) * smoothstep(0.9993, 0.9997, s) * 4.0;
        // clouds on a dome
        vec2 uv = d.xz / (d.y + 0.18) * 1.6;
        float cl = smoothstep(0.52, 0.8, fbm(uv + vec2(3.0, 1.0)));
        vec3 cc = mix(vec3(0.97, 0.95, 0.92), vec3(1.0, 0.9, 0.75), pow(s, 3.0));
        c = mix(c, cc, cl * smoothstep(0.02, 0.22, d.y) * 0.85);
        c = mix(c, hor * 0.95, smoothstep(0.06, -0.05, d.y));   // haze at the horizon
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1500, 32, 16), mat);
  sky.renderOrder = -10;
  sky.frustumCulled = false;
  return sky;
}

// ---------------------------------------------------------------- more facade styles
// 'brick' 4-5 storey brick house, 'band' modern ribbon windows, 'arch' plastered with arched windows
export function facadeTexture(style, wall, seed = 1) {
  if (style === 'panel') return dayPanelTexture(wall, seed);
  let r = seed * 7919 + 13;
  const rnd = () => ((r = (r * 9301 + 49297) % 233280) / 233280);
  return canvasTex(128, 256, (g, w, h) => {
    g.fillStyle = wall; g.fillRect(0, 0, w, h);
    const rows = 12, rh = h / rows;
    if (style === 'brick') {
      // brick courses
      for (let y = 0; y < h; y += 3) { g.fillStyle = `rgba(0,0,0,${0.04 + rnd() * 0.05})`; g.fillRect(0, y, w, 1); }
      const cols = 4, cw = w / cols;
      for (let row = 0; row < rows; row++) for (let c = 0; c < cols; c++) {
        const x = c * cw, y = row * rh;
        g.fillStyle = '#efe8dc'; g.fillRect(x + cw * 0.22, y + rh * 0.14, cw * 0.56, rh * 0.6);
        const t = 55 + rnd() * 35; g.fillStyle = `rgb(${t | 0},${(t + 15) | 0},${(t + 28) | 0})`;
        g.fillRect(x + cw * 0.26, y + rh * 0.18, cw * 0.48, rh * 0.52);
        g.fillStyle = 'rgba(255,255,255,0.2)'; g.fillRect(x + cw * 0.26, y + rh * 0.18, cw * 0.48, 2);
        g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(x + cw * 0.18, y + rh * 0.76, cw * 0.64, 2);   // sill
        const cu = rnd();
        if (cu < 0.3) { g.fillStyle = cu < 0.12 ? 'rgba(225,212,190,0.75)' : 'rgba(200,180,150,0.6)'; g.fillRect(x + cw * 0.26, y + rh * 0.18, cw * 0.24, rh * 0.52); }
        if (rnd() < 0.15) { g.fillStyle = '#eceeed'; g.fillRect(x + cw * 0.3, y + rh * 0.8, cw * 0.4, rh * 0.15); }   // air conditioner
      }
    } else if (style === 'band') {
      for (let row = 0; row < rows; row++) {
        const y = row * rh;
        g.fillStyle = '#3f5a72'; g.fillRect(0, y + rh * 0.2, w, rh * 0.5);
        g.fillStyle = 'rgba(200,225,240,0.35)'; g.fillRect(0, y + rh * 0.2, w, rh * 0.12);
        g.fillStyle = 'rgba(230,236,240,0.9)';
        for (let x = 0; x < w; x += w / 8) g.fillRect(x, y + rh * 0.2, 1.5, rh * 0.5);
      }
    } else { // arch
      const cols = 5, cw = w / cols;
      for (let row = 0; row < rows; row++) for (let c = 0; c < cols; c++) {
        const x = c * cw + cw * 0.25, y = row * rh + rh * 0.2, ww = cw * 0.5, hh = rh * 0.55;
        g.fillStyle = '#f4efe4';
        g.beginPath(); g.moveTo(x - 2, y + hh + 1); g.lineTo(x - 2, y + ww / 2); g.arc(x + ww / 2, y + ww / 2, ww / 2 + 2, Math.PI, 0); g.lineTo(x + ww + 2, y + hh + 1); g.fill();
        const t = 60 + rnd() * 30; g.fillStyle = `rgb(${t | 0},${(t + 20) | 0},${(t + 30) | 0})`;
        g.beginPath(); g.moveTo(x, y + hh); g.lineTo(x, y + ww / 2); g.arc(x + ww / 2, y + ww / 2, ww / 2, Math.PI, 0); g.lineTo(x + ww, y + hh); g.fill();
      }
    }
  });
}

// ---------------------------------------------------------------- ground floors: shopfronts and entrances
// atlas rows, each a 6 m x 3.2 m bay: [kind, label]
export const STOREFRONTS = [
  ['shop', '#1d6fb8'], ['shop', '#1f8a4c'], ['cafe', '#8a3b1d'], ['pharmacy', '#1aa38f'],
  ['shop', '#c2185b'], ['entrance', '#9aa0a6'], ['bank', '#0d4a8a'], ['shop', '#e05a00'],
];
let storeTex = null;
export function storefrontAtlas() {
  if (storeTex) return storeTex;
  const W = 256, H = 136, n = STOREFRONTS.length;
  storeTex = canvasTex(W, H * n, (g) => {
    STOREFRONTS.forEach(([kind, col], i) => {
      const y0 = i * H;
      g.fillStyle = '#cfc9bd'; g.fillRect(0, y0, W, H);                       // plaster
      g.fillStyle = '#8f8a80'; g.fillRect(0, y0 + H - 12, W, 12);              // plinth
      if (kind === 'entrance') {
        // residential entrance: steel door, concrete canopy, small windows either side
        g.fillStyle = '#6b4b32'; g.fillRect(W * 0.4, y0 + H * 0.3, W * 0.2, H * 0.62);
        g.fillStyle = '#2b2f36'; g.fillRect(W * 0.44, y0 + H * 0.36, W * 0.12, H * 0.2);
        g.fillStyle = '#7d7a74'; g.fillRect(W * 0.34, y0 + H * 0.22, W * 0.32, H * 0.08);
        for (const x of [0.1, 0.72]) { g.fillStyle = '#eee'; g.fillRect(W * x, y0 + H * 0.3, W * 0.18, H * 0.3); g.fillStyle = '#4d5d6c'; g.fillRect(W * x + 3, y0 + H * 0.3 + 3, W * 0.18 - 6, H * 0.3 - 6); }
        g.fillStyle = '#1b5e9e'; g.fillRect(W * 0.46, y0 + H * 0.12, W * 0.08, H * 0.07);   // house number
        return;
      }
      // big shop windows with mullions and a glass door
      g.fillStyle = '#2a3036'; g.fillRect(W * 0.04, y0 + H * 0.2, W * 0.92, H * 0.68);
      const glass = g.createLinearGradient(0, y0 + H * 0.2, 0, y0 + H * 0.88);
      glass.addColorStop(0, '#9fb8c8'); glass.addColorStop(0.35, '#4f6676'); glass.addColorStop(1, '#2c3a44');
      g.fillStyle = glass; g.fillRect(W * 0.06, y0 + H * 0.23, W * 0.88, H * 0.63);
      // goods / interior colours
      for (let k = 0; k < 14; k++) {
        g.fillStyle = `hsla(${(k * 47 + i * 30) % 360},55%,55%,0.55)`;
        g.fillRect(W * (0.08 + (k % 7) * 0.12), y0 + H * (0.6 + Math.floor(k / 7) * 0.12), W * 0.08, H * 0.09);
      }
      if (kind === 'cafe') { g.fillStyle = 'rgba(255,214,150,0.45)'; g.fillRect(W * 0.06, y0 + H * 0.23, W * 0.88, H * 0.3); }
      if (kind === 'pharmacy') { g.fillStyle = '#19a35b'; g.fillRect(W * 0.8, y0 + H * 0.26, 18, 6); g.fillRect(W * 0.8 + 6, y0 + H * 0.26 - 6, 6, 18); }
      g.fillStyle = '#d9dde2';
      for (const x of [0.06, 0.36, 0.64, 0.94]) g.fillRect(W * x - 2, y0 + H * 0.2, 4, H * 0.68);
      // door
      g.fillStyle = '#1c2228'; g.fillRect(W * 0.42, y0 + H * 0.3, W * 0.16, H * 0.58);
      g.fillStyle = 'rgba(160,190,205,0.6)'; g.fillRect(W * 0.44, y0 + H * 0.33, W * 0.12, H * 0.5);
      // fascia band in the shop colour above the windows
      g.fillStyle = col; g.fillRect(0, y0 + H * 0.04, W, H * 0.13);
    });
  });
  storeTex.wrapS = THREE.RepeatWrapping;
  return storeTex;
}
export function storefrontGeometry(row, length) {
  const geo = new THREE.PlaneGeometry(length, 3.2);
  const uv = geo.attributes.uv, n = STOREFRONTS.length;
  const v0 = 1 - (row + 1) / n, v1 = 1 - row / n;
  const reps = Math.max(1, Math.round(length / 6));
  for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * reps, uv.getY(k) > 0.5 ? v1 - 0.003 : v0 + 0.003);
  return geo;
}

// zebra crossing (stripes along the road) and the blue pedestrian-crossing sign
export function zebraTexture() {
  return canvasTex(256, 64, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = 'rgba(238,240,242,0.95)';
    for (let x = 4; x < w; x += 24) g.fillRect(x, 0, 12, h);
  });
}
export function crossingSignTexture() {
  return canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#1557b0'; g.fillRect(6, 6, w - 12, h - 12);
    g.fillStyle = '#ffffff';
    g.beginPath(); g.moveTo(w / 2, 14); g.lineTo(w - 16, h - 18); g.lineTo(16, h - 18); g.closePath(); g.fill();
    g.fillStyle = '#111';
    g.beginPath(); g.arc(w / 2 + 4, 46, 6, 0, Math.PI * 2); g.fill();
    g.lineWidth = 6; g.strokeStyle = '#111'; g.lineCap = 'round';
    g.beginPath(); g.moveTo(w / 2 + 2, 54); g.lineTo(w / 2 - 4, 78); g.lineTo(w / 2 - 14, 96); g.moveTo(w / 2 - 4, 78); g.lineTo(w / 2 + 10, 96); g.moveTo(w / 2, 60); g.lineTo(w / 2 + 14, 70); g.stroke();
    g.fillStyle = '#111';
    for (let x = 30; x < w - 30; x += 12) g.fillRect(x, h - 30, 7, 6);
  });
}
