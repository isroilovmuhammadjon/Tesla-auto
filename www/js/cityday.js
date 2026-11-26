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
  return canvasTex(128, 256, (g, w, h) => {
    g.fillStyle = wall; g.fillRect(0, 0, w, h);
    const cols = 6, rows = 12, cw = w / cols, rh = h / rows;
    // panel seams
    g.strokeStyle = 'rgba(0,0,0,0.10)'; g.lineWidth = 1;
    for (let y = 0; y <= rows; y++) { g.beginPath(); g.moveTo(0, y * rh + 0.5); g.lineTo(w, y * rh + 0.5); g.stroke(); }
    for (let x = 0; x <= cols; x += 2) { g.beginPath(); g.moveTo(x * cw + 0.5, 0); g.lineTo(x * cw + 0.5, h); g.stroke(); }
    for (let row = 0; row < rows; row++) {
      for (let c = 0; c < cols; c++) {
        const x = c * cw, y = row * rh;
        const balcony = c % 3 === 1;
        if (balcony) {
          // glazed balcony box
          g.fillStyle = rnd() < 0.5 ? '#e8e4da' : '#d9d3c4';
          g.fillRect(x + 1, y + rh * 0.12, cw - 2, rh * 0.8);
          g.fillStyle = '#5d7387';
          g.fillRect(x + 3, y + rh * 0.18, cw - 6, rh * 0.34);
          g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(x + 3, y + rh * 0.18, cw - 6, 2);
          continue;
        }
        g.fillStyle = '#f1efe9'; g.fillRect(x + cw * 0.16, y + rh * 0.16, cw * 0.68, rh * 0.52);   // frame
        const tone = 60 + rnd() * 40;
        g.fillStyle = `rgb(${tone | 0},${(tone + 18) | 0},${(tone + 34) | 0})`;
        g.fillRect(x + cw * 0.2, y + rh * 0.2, cw * 0.6, rh * 0.44);
        g.fillStyle = 'rgba(255,255,255,0.22)'; g.fillRect(x + cw * 0.2, y + rh * 0.2, cw * 0.6, rh * 0.08);   // sky reflection
        g.fillStyle = '#f1efe9'; g.fillRect(x + cw * 0.49, y + rh * 0.2, 1.5, rh * 0.44);
        if (rnd() < 0.25) { g.fillStyle = 'rgba(230,220,200,0.7)'; g.fillRect(x + cw * 0.2, y + rh * 0.2, cw * 0.28, rh * 0.44); }  // curtain
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
