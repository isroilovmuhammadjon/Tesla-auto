// Black mid-size sedan modelled on the 2019+ Malibu from the user's photos.
// The body is lofted from cross-sections (plan width, hood/deck line, roof line, wheel arches),
// then the grille, lamps, plates, shut lines and handles are painted on as projected decals so they
// follow the curved surface. Brand logos are left out: the badge is a plain gold emblem.
import * as THREE from 'three';
import { mergeGeometries, toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';

export const MALIBU = {
  L: 4.93, halfW: 0.93, wheelR: 0.34, track: 0.8,
  frontZ: -1.5, rearZ: 1.33,            // wheel centres (wheelbase 2.83 m)
};
const L = MALIBU.L, Z0 = -L / 2;
const zAt = (u) => Z0 + u * L;
const uAt = (z) => (z - Z0) / L;
const UF = uAt(MALIBU.frontZ), UR = uAt(MALIBU.rearZ);

// smooth interpolation through [u, value] pairs (Catmull-Rom on values)
function curve(table) {
  return (u) => {
    if (u <= table[0][0]) return table[0][1];
    const n = table.length;
    for (let i = 1; i < n; i++) {
      if (u > table[i][0]) continue;
      const [u0, v0] = table[i - 1], [u1, v1] = table[i];
      const t = (u - u0) / (u1 - u0);
      const vm = i > 1 ? table[i - 2][1] : v0 - (v1 - v0);
      const vp = i < n - 1 ? table[i + 1][1] : v1 + (v1 - v0);
      const t2 = t * t, t3 = t2 * t;
      return 0.5 * (2 * v0 + (-vm + v1) * t + (2 * vm - 5 * v0 + 4 * v1 - vp) * t2 + (-vm + 3 * v0 - 3 * v1 + vp) * t3);
    }
    return table[n - 1][1];
  };
}

// side view: top of the body below the glass (nose, hood, beltline, trunk lid)
const TOP = curve([[0, 0.6], [0.012, 0.69], [0.035, 0.775], [0.08, 0.83], [0.15, 0.87], [0.25, 0.91], [0.335, 0.955],
  [0.45, 0.982], [0.6, 1.0], [0.75, 1.022], [0.85, 1.04], [0.92, 1.048], [0.965, 1.042], [0.985, 1.02], [1, 0.97]]);
// roof line over the glasshouse (windshield, roof, long fastback rear window)
const ROOF = curve([[0.335, 0.958], [0.38, 1.12], [0.43, 1.29], [0.47, 1.385], [0.52, 1.44], [0.58, 1.46], [0.64, 1.447],
  [0.69, 1.405], [0.74, 1.32], [0.8, 1.2], [0.85, 1.09], [0.875, 1.044]]);
const BASE = curve([[0, 0.3], [0.05, 0.27], [0.12, 0.255], [0.5, 0.255], [0.88, 0.27], [0.95, 0.3], [1, 0.36]]);
// plan view half width
const HW = curve([[0, 0.7], [0.015, 0.8], [0.04, 0.858], [0.08, 0.893], [0.14, 0.918], [0.25, 0.93], [0.7, 0.93],
  [0.85, 0.925], [0.93, 0.9], [0.975, 0.86], [1, 0.8]]);
const GH0 = 0.335, GH1 = 0.875;   // glasshouse from the windshield base to the rear-window base

const ARCH_R = 0.43;
function archY(u) {   // underside of the wheel opening at this station (0 = no arch)
  const z = zAt(u);
  let y = 0;
  for (const wz of [MALIBU.frontZ, MALIBU.rearZ]) {
    const dz = z - wz;
    if (Math.abs(dz) < ARCH_R) y = Math.max(y, MALIBU.wheelR + Math.sqrt(ARCH_R * ARCH_R - dz * dz));
  }
  return y;
}
function flare(u) {   // slight bulge of the fenders over the wheels
  const d = Math.min(Math.abs(u - UF), Math.abs(u - UR)) * L;
  return d < 0.7 ? 0.012 * (1 + Math.cos(Math.PI * d / 0.7)) / 2 : 0;
}

// right half of the body cross-section at u, bottom centre -> around the side -> top centre (fixed count)
function section(u) {
  const yb = BASE(u), yt = TOP(u), hw = HW(u) + flare(u);
  const ya = Math.max(yb, archY(u));
  const yS = Math.max(yt - 0.15, ya + 0.02);      // shoulder (widest point)
  const side = (f, inset) => [hw - inset, ya + (yS - ya) * f];   // lower body tucks in towards the sill
  return [
    [0, yb], [0.56, yb], [0.585, ya], [hw - 0.06, ya],
    side(0.06, 0.03), side(0.25, 0.018), side(0.5, 0.006),
    side(0.78, 0.001), [hw, yS],
    [hw - 0.018, yt - 0.075], [hw - 0.06, yt - 0.03], [hw - 0.16, yt - 0.006],
    [hw * 0.55, yt + 0.012], [0, yt + 0.018],
  ];
}
function ghSection(u) {
  const hw = HW(u), belt = TOP(u) - 0.004, yr = Math.max(ROOF(u), belt);
  const hb = hw - 0.075, hr = hw * 0.69;
  return [[hb, belt], [hb - (hb - hr) * 0.5, belt + (yr - belt) * 0.58], [hr, yr - 0.03], [hr * 0.62, yr - 0.004], [0, yr + 0.004]];
}

function loftGeometry(us, secFn, capFront, capRear) {
  const n = secFn(us[0]).length;
  const pos = [], idx = [];
  for (const u of us) for (const [x, y] of secFn(u)) pos.push(x, y, zAt(u));
  for (let i = 0; i < us.length - 1; i++) {
    for (let j = 0; j < n - 1; j++) {
      const a = i * n + j, b = a + 1, c = a + n, d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
  }
  const right = new THREE.BufferGeometry();
  right.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  right.setIndex(idx);
  const parts = [right.toNonIndexed()];
  // end caps (fan from the middle of the section)
  const cap = (u, front) => {
    const pts = secFn(u), z = zAt(u);
    const cy = (pts[0][1] + pts[pts.length - 1][1]) / 2;
    const p = [];
    for (let j = 0; j < pts.length - 1; j++) {
      const A = [pts[j][0], pts[j][1], z], B = [pts[j + 1][0], pts[j + 1][1], z];
      if (front) p.push(0, cy, z, ...B, ...A); else p.push(0, cy, z, ...A, ...B);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    parts.push(g);
  };
  if (capFront) cap(us[0], true);
  if (capRear) cap(us[us.length - 1], false);
  // mirror to the left side (flip x and the winding)
  const halves = parts.map((g) => g);
  for (const g of halves) {
    const m = g.clone();
    const a = m.attributes.position.array;
    for (let i = 0; i < a.length; i += 3) a[i] = -a[i];
    for (let i = 0; i < a.length; i += 9) for (let k = 0; k < 3; k++) { const t = a[i + 3 + k]; a[i + 3 + k] = a[i + 6 + k]; a[i + 6 + k] = t; }
    parts.push(m);
  }
  const merged = mergeGeometries(parts.map((g) => { g.deleteAttribute('normal'); g.deleteAttribute('uv'); return g; }));
  return toCreasedNormals(merged, Math.PI / 3.6);
}

const range = (a, b, step) => { const r = []; for (let u = a; u < b - 1e-9; u += step) r.push(u); r.push(b); return r; };

// ---------------------------------------------------------------- decals
// Surface point seen along an axis: 'front' (ray +z), 'rear' (ray -z), 'side' (ray -x on the right)
function inside(pts, x, y) {
  // right-half polygon closed along the centre line
  let c = false;
  const n = pts.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
function hitFront(x, y, rear) {
  const ax = Math.abs(x);
  const test = (u) => inside(section(u), ax, y);
  const step = 0.01;
  let prev = rear ? 1 : 0;
  if (test(prev)) return [x, y, zAt(prev)];
  for (let k = 1; k <= 60; k++) {
    const u = rear ? 1 - k * step : k * step;
    if (test(u)) {
      let a = prev, b = u;
      for (let it = 0; it < 12; it++) { const m = (a + b) / 2; if (test(m)) b = m; else a = m; }
      return [x, y, zAt(b)];
    }
    prev = u;
  }
  return null;
}
function hitSide(z, y) {
  const u = uAt(z);
  if (u < 0 || u > 1) return null;
  const pts = section(u);
  let best = -1;
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
    if ((y0 - y) * (y1 - y) > 0 || y0 === y1) continue;
    const x = x0 + ((x1 - x0) * (y - y0)) / (y1 - y0);
    if (x > best) best = x;
  }
  return best > HW(u) - 0.12 ? [best, y, z] : null;   // not the wheel-well liner
}

// grid over a rectangle in the projection plane, snapped onto the body
function decalGeometry(kind, a0, a1, y0, y1, na, ny) {
  const pos = [], uv = [], ok = [];
  for (let j = 0; j <= ny; j++) {
    for (let i = 0; i <= na; i++) {
      const a = a0 + ((a1 - a0) * i) / na, y = y0 + ((y1 - y0) * j) / ny;
      const p = kind === 'side' ? hitSide(a, y) : hitFront(a, y, kind === 'rear');
      ok.push(!!p);
      if (p) {
        if (kind === 'front') p[2] -= 0.004; else if (kind === 'rear') p[2] += 0.004; else p[0] += 0.004;
        pos.push(...p);
      } else pos.push(0, 0, 0);
      // texture x runs the way a viewer facing that side reads it
      const tu = kind === 'rear' ? i / na : 1 - i / na;
      uv.push(tu, j / ny);
    }
  }
  const idx = [];
  const W1 = na + 1;
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < na; i++) {
      const a = j * W1 + i, b = a + 1, c = a + W1, d = c + 1;
      if (!(ok[a] && ok[b] && ok[c] && ok[d])) continue;
      if (kind === 'rear') idx.push(a, b, c, b, d, c);
      else idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
function mirrorX(geo) {
  const m = geo.clone();
  const a = m.attributes.position.array;
  for (let i = 0; i < a.length; i += 3) a[i] = -a[i];
  const ix = m.index.array;
  for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; }
  m.computeVertexNormals();
  return m;
}

// canvas painters. Each decal gets three canvases: colour (with alpha), metal/rough, lights.
function painter(w, h, a0, a1, y0, y1, flip) {
  const mk = () => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  const col = mk(), mr = mk(), lit = mk();
  const P = {
    col: col.getContext('2d'), mr: mr.getContext('2d'), lit: lit.getContext('2d'),
    // metres -> pixels (flip: the projection's 'a' axis is mirrored for the viewer)
    X: (a) => (flip ? (a1 - a) / (a1 - a0) : (a - a0) / (a1 - a0)) * w,
    Y: (y) => (1 - (y - y0) / (y1 - y0)) * h,
    S: w / (a1 - a0),
    canvases: { col, mr, lit },
  };
  P.mr.fillStyle = 'rgb(0,200,0)'; P.mr.fillRect(0, 0, w, h);   // default: dielectric, fairly rough
  return P;
}
// draw the same path in colour and in metal/rough (chrome, gold, black plastic, lens)
const FINISH = {
  chrome: ['#e9edf2', 'rgb(0,28,255)'],
  gold: ['#d9a93c', 'rgb(0,70,255)'],
  black: ['#0a0b0d', 'rgb(0,170,0)'],
  gloss: ['#050608', 'rgb(0,40,0)'],
  lens: ['#15181d', 'rgb(0,18,160)'],
  redlens: ['#5a0610', 'rgb(0,30,40)'],
  line: ['rgba(0,0,0,0.85)', 'rgb(0,220,0)'],
};
function fill(P, path, finish) {
  const [c, m] = FINISH[finish];
  for (const [ctx, st] of [[P.col, c], [P.mr, m]]) { ctx.save(); ctx.fillStyle = st; path(ctx); ctx.fill(); ctx.restore(); }
}
function stroke(P, path, finish, width) {
  const [c, m] = FINISH[finish];
  for (const [ctx, st] of [[P.col, c], [P.mr, m]]) { ctx.save(); ctx.strokeStyle = st; ctx.lineWidth = width; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; path(ctx); ctx.stroke(); ctx.restore(); }
}
const poly = (P, pts) => (g) => { g.beginPath(); pts.forEach(([a, y], i) => (i ? g.lineTo(P.X(a), P.Y(y)) : g.moveTo(P.X(a), P.Y(y)))); g.closePath(); };
const mirrorPts = (pts) => pts.map(([x, y]) => [-x, y]);
const rrect = (P, a, y, w, h, r) => (g) => {   // centred rounded rect in metres
  const x0 = Math.min(P.X(a - w / 2), P.X(a + w / 2)), y0 = P.Y(y + h / 2), W = Math.abs(P.X(a + w / 2) - P.X(a - w / 2)), H = P.Y(y - h / 2) - y0;
  g.beginPath(); g.roundRect(x0, y0, W, H, r * P.S);
};

// Uzbek-style plate (fictional number)
function plate(P, cx, cy, wm, hm) {
  const g = P.col;
  const x = Math.min(P.X(cx - wm / 2), P.X(cx + wm / 2)), y = P.Y(cy + hm / 2), w = Math.abs(P.X(cx + wm / 2) - P.X(cx - wm / 2)), h = P.Y(cy - hm / 2) - y;
  g.save();
  g.fillStyle = '#f4f5f2'; g.strokeStyle = '#111'; g.lineWidth = Math.max(1, h * 0.06);
  g.beginPath(); g.roundRect(x, y, w, h, h * 0.12); g.fill(); g.stroke();
  g.beginPath(); g.moveTo(x + w * 0.18, y + h * 0.1); g.lineTo(x + w * 0.18, y + h * 0.9); g.stroke();
  g.fillStyle = '#111'; g.textBaseline = 'middle'; g.textAlign = 'center';
  g.font = `bold ${h * 0.62}px Arial, sans-serif`;
  g.fillText('01', x + w * 0.09, y + h * 0.54);
  g.fillText('A 777 AA', x + w * 0.52, y + h * 0.54);
  // flag + UZ
  const fx = x + w * 0.86, fw = w * 0.09, fh = h * 0.3, fy = y + h * 0.14;
  g.fillStyle = '#0099b5'; g.fillRect(fx, fy, fw, fh / 3);
  g.fillStyle = '#ffffff'; g.fillRect(fx, fy + fh / 3, fw, fh / 3);
  g.fillStyle = '#1eb53a'; g.fillRect(fx, fy + (2 * fh) / 3, fw, fh / 3);
  g.fillStyle = '#0c4da2'; g.font = `bold ${h * 0.32}px Arial, sans-serif`; g.fillText('UZ', fx + fw / 2, y + h * 0.72);
  g.restore();
  P.mr.save(); P.mr.fillStyle = 'rgb(0,120,0)'; P.mr.fillRect(x, y, w, h); P.mr.restore();
}

function goldBadge(P, cx, cy, w, h) {
  // a plain gold emblem with a chrome outline (no brand logo)
  fill(P, rrect(P, cx, cy, w + 0.02, h + 0.02, h * 0.45), 'chrome');
  fill(P, rrect(P, cx, cy, w, h, h * 0.4), 'gold');
  stroke(P, (g) => { g.beginPath(); g.moveTo(P.X(cx - w * 0.36), P.Y(cy)); g.lineTo(P.X(cx + w * 0.36), P.Y(cy)); }, 'chrome', Math.max(1, h * 0.12 * P.S));
}

function frontPaint() {
  const a0 = -0.96, a1 = 0.96, y0 = 0.24, y1 = 0.86;
  const P = painter(1024, 332, a0, a1, y0, y1, true);
  for (const s of [1, -1]) {
    const m = (pts) => (s > 0 ? pts : mirrorPts(pts));
    // headlight: slim, swept up and back from the grille bar to the fender
    const lamp = m([[0.43, 0.705], [0.6, 0.74], [0.8, 0.775], [0.93, 0.795], [0.92, 0.765], [0.78, 0.735], [0.6, 0.69], [0.45, 0.665]]);
    fill(P, poly(P, lamp), 'lens');
    stroke(P, poly(P, lamp), 'chrome', 2);
    // chrome reflector inside + projector
    fill(P, poly(P, m([[0.5, 0.69], [0.66, 0.72], [0.66, 0.705], [0.5, 0.677]])), 'chrome');
    fill(P, (g) => { g.beginPath(); g.arc(P.X(s * 0.72), P.Y(0.738), 0.022 * P.S, 0, Math.PI * 2); }, 'chrome');
    // lower corner: vertical LED light in a chrome C
    const fog = m([[0.66, 0.36], [0.76, 0.37], [0.8, 0.52], [0.73, 0.54], [0.7, 0.5], [0.72, 0.4]]);
    fill(P, poly(P, fog), 'black');
    stroke(P, poly(P, m([[0.7, 0.52], [0.74, 0.39], [0.77, 0.39]])), 'chrome', 3);
  }
  // upper grille between the lamps
  fill(P, poly(P, [[-0.42, 0.665], [0.42, 0.665], [0.44, 0.75], [-0.44, 0.75]]), 'black');
  for (let y = 0.677; y < 0.745; y += 0.016) stroke(P, (g) => { g.beginPath(); g.moveTo(P.X(-0.4), P.Y(y)); g.lineTo(P.X(0.4), P.Y(y)); }, 'gloss', 2);
  // chrome bar across the grille, into the headlights
  fill(P, poly(P, [[-0.5, 0.692], [0.5, 0.692], [0.5, 0.714], [-0.5, 0.714]]), 'chrome');
  goldBadge(P, 0, 0.703, 0.2, 0.06);
  // big lower grille with chrome trim lines
  const lower = [[-0.6, 0.33], [0.6, 0.33], [0.53, 0.575], [-0.53, 0.575]];
  fill(P, poly(P, lower), 'black');
  // honeycomb
  P.col.save(); P.col.strokeStyle = 'rgba(40,44,52,0.9)'; P.col.lineWidth = 1;
  poly(P, lower)(P.col); P.col.clip();
  for (let x = -0.6; x < 0.6; x += 0.03) for (let y = 0.33; y < 0.58; y += 0.026) {
    P.col.beginPath(); P.col.arc(P.X(x + ((Math.round(y / 0.026) % 2) * 0.015)), P.Y(y), 0.009 * P.S, 0, Math.PI * 2); P.col.stroke();
  }
  P.col.restore();
  stroke(P, poly(P, lower), 'chrome', 3);
  for (const y of [0.53, 0.37]) stroke(P, (g) => { g.beginPath(); g.moveTo(P.X(-0.55 + (0.575 - y) * 0.25), P.Y(y)); g.lineTo(P.X(0.55 - (0.575 - y) * 0.25), P.Y(y)); }, 'chrome', 3);
  plate(P, 0, 0.45, 0.52, 0.11);
  // black lower lip
  fill(P, poly(P, [[-0.8, 0.255], [0.8, 0.255], [0.75, 0.3], [-0.75, 0.3]]), 'black');

  // lights layer: LED strip along the top of each headlight + the corner lights
  const g = P.lit;
  g.strokeStyle = '#ffffff'; g.lineCap = 'round';
  for (const s of [1, -1]) {
    g.lineWidth = 0.012 * P.S;
    g.beginPath(); g.moveTo(P.X(s * 0.47), P.Y(0.7)); g.lineTo(P.X(s * 0.62), P.Y(0.731)); g.lineTo(P.X(s * 0.8), P.Y(0.766)); g.lineTo(P.X(s * 0.9), P.Y(0.783)); g.stroke();
    g.fillStyle = '#e8f2ff'; g.beginPath(); g.arc(P.X(s * 0.72), P.Y(0.738), 0.016 * P.S, 0, Math.PI * 2); g.fill();
    g.lineWidth = 0.014 * P.S;
    g.beginPath(); g.moveTo(P.X(s * 0.715), P.Y(0.51)); g.lineTo(P.X(s * 0.745), P.Y(0.4)); g.stroke();
  }
  return { P, a0, a1, y0, y1 };
}

function rearPaint() {
  const a0 = -0.96, a1 = 0.96, y0 = 0.3, y1 = 1.06;
  const P = painter(1024, 406, a0, a1, y0, y1, false);
  for (const s of [1, -1]) {
    const m = (pts) => (s > 0 ? pts : mirrorPts(pts));
    // wide slim tail lamp from the trunk lid round onto the quarter panel
    const lamp = m([[0.3, 0.915], [0.55, 0.92], [0.8, 0.935], [0.95, 0.955], [0.95, 1.01], [0.8, 0.995], [0.55, 0.975], [0.3, 0.96]]);
    fill(P, poly(P, lamp), 'redlens');
    stroke(P, poly(P, lamp), 'chrome', 2);
    // reflector + exhaust surround
    fill(P, rrect(P, s * 0.82, 0.47, 0.12, 0.025, 0.01), 'redlens');
    const ex = m([[0.5, 0.345], [0.78, 0.345], [0.75, 0.42], [0.53, 0.42]]);
    fill(P, poly(P, ex), 'chrome');
    fill(P, poly(P, m([[0.53, 0.355], [0.75, 0.355], [0.73, 0.41], [0.55, 0.41]])), 'black');
  }
  // chrome bar across the trunk lid between the lamps + emblem
  fill(P, poly(P, [[-0.31, 0.928], [0.31, 0.928], [0.31, 0.947], [-0.31, 0.947]]), 'chrome');
  goldBadge(P, 0, 0.975, 0.17, 0.05);
  // plate recess + plate
  fill(P, rrect(P, 0, 0.69, 0.62, 0.17, 0.03), 'gloss');
  plate(P, 0, 0.69, 0.52, 0.11);
  // lower black bumper band
  fill(P, poly(P, [[-0.86, 0.33], [0.86, 0.33], [0.88, 0.44], [0.5, 0.43], [0.5, 0.345], [-0.5, 0.345], [-0.5, 0.43], [-0.88, 0.44]]), 'black');
  // lights layer: LED graphics (tinted red by the tail material; brighter when braking)
  const g = P.lit;
  g.strokeStyle = '#ffffff'; g.fillStyle = '#ffffff'; g.lineCap = 'round';
  for (const s of [1, -1]) {
    g.lineWidth = 0.011 * P.S;
    g.beginPath(); g.moveTo(P.X(s * 0.34), P.Y(0.945)); g.lineTo(P.X(s * 0.6), P.Y(0.952)); g.lineTo(P.X(s * 0.9), P.Y(0.975)); g.stroke();
    g.beginPath(); g.moveTo(P.X(s * 0.62), P.Y(0.93)); g.lineTo(P.X(s * 0.92), P.Y(0.96)); g.lineTo(P.X(s * 0.92), P.Y(0.995)); g.stroke();
  }
  // plate light
  g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(P.X(-0.26), P.Y(0.75), (0.52) * P.S, 0.01 * P.S);
  return { P, a0, a1, y0, y1 };
}

function sidePaint() {
  // projection axis 'a' is z (front at -z). The viewer on the right side sees the front on the right.
  const a0 = Z0, a1 = -Z0, y0 = 0.26, y1 = 1.07;
  const P = painter(2048, 336, a0, a1, y0, y1, true);
  const line = (pts) => stroke(P, (g) => { g.beginPath(); pts.forEach(([z, y], i) => (i ? g.lineTo(P.X(z), P.Y(y)) : g.moveTo(P.X(z), P.Y(y)))); }, 'line', 2.2);
  const zF = zAt(0.305), zB = zAt(0.555), zR = zAt(0.745);
  line([[zF, 0.985], [zF + 0.02, 0.6], [zF - 0.005, 0.33]]);                      // front door leading edge
  line([[zB, 1.0], [zB, 0.3]]);                                                   // B-pillar shut line
  const rz = MALIBU.rearZ;
  line([[zR, 1.02], [zR - 0.03, 0.82], [rz - 0.5, 0.68], [rz - 0.44, 0.55]]);     // rear door around the arch
  line([[zF - 0.005, 0.31], [zR - 0.25, 0.31]]);                                  // sill
  // fuel door (right side only visible; harmless mirrored)
  stroke(P, rrect(P, zAt(0.86), 0.9, 0.17, 0.12, 0.03), 'line', 2);
  // chrome door handles
  for (const z of [zAt(0.49), zAt(0.705)]) fill(P, rrect(P, z, 0.905, 0.19, 0.035, 0.016), 'chrome');
  // subtle lower body crease highlight
  P.col.save(); P.col.strokeStyle = 'rgba(160,170,185,0.10)'; P.col.lineWidth = 2;
  P.col.beginPath(); P.col.moveTo(P.X(zAt(0.27)), P.Y(0.46)); P.col.lineTo(P.X(zAt(0.72)), P.Y(0.48)); P.col.stroke(); P.col.restore();
  return { P, a0, a1, y0, y1 };
}

function texFrom(canvas, srgb) {
  const t = new THREE.CanvasTexture(canvas);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

let cache = null;   // geometry + textures are built once and shared
function buildShared() {
  if (cache) return cache;
  const us = [...range(0, 0.04, 0.004), ...range(0.044, 0.96, 0.008), ...range(0.964, 1, 0.004)];
  const body = loftGeometry(us, section, true, true);
  const glass = loftGeometry(range(GH0, GH1, 0.008), ghSection, false, false);
  // roof skin (body colour) over the middle of the glasshouse
  const roofSec = (u) => { const g = ghSection(u); return [[g[2][0] * 0.93, g[2][1] + 0.004], [g[3][0], g[3][1] + 0.006], [0, g[4][1] + 0.006]]; };
  const roof = loftGeometry(range(0.47, 0.7, 0.01), roofSec, false, false);

  const F = frontPaint(), R = rearPaint(), S = sidePaint();
  const front = decalGeometry('front', F.a0, F.a1, F.y0, F.y1, 120, 40);
  const rear = decalGeometry('rear', R.a0, R.a1, R.y0, R.y1, 120, 48);
  const sideR = decalGeometry('side', S.a0, S.a1, S.y0, S.y1, 220, 40);
  const sideL = mirrorX(sideR);
  const tex = (D) => ({ col: texFrom(D.P.canvases.col, true), mr: texFrom(D.P.canvases.mr, false), lit: texFrom(D.P.canvases.lit, true) });
  cache = { body, glass, roof, front, rear, sideR, sideL, tF: tex(F), tR: tex(R), tS: tex(S) };
  return cache;
}

// chrome window surround (DLO) + beltline trim, following the glasshouse
function dloCurves() {
  const pt = (u, t, side) => {
    const g = ghSection(u);
    const a = g[0], b = g[1], c = g[2];
    const p = t < 0.58 ? [a[0] + (b[0] - a[0]) * (t / 0.58), a[1] + (b[1] - a[1]) * (t / 0.58)]
      : [b[0] + (c[0] - b[0]) * ((t - 0.58) / 0.42), b[1] + (c[1] - b[1]) * ((t - 0.58) / 0.42)];
    return new THREE.Vector3(side * (p[0] + 0.006), p[1], zAt(u));
  };
  const out = [];
  for (const side of [1, -1]) {
    const belt = [], top = [];
    for (let u = 0.345; u <= 0.85; u += 0.012) belt.push(pt(u, 0.02, side));
    for (let u = 0.36; u <= 0.815; u += 0.01) top.push(pt(u, 0.86, side));
    out.push(belt, top);
  }
  return out;
}

const DECAL = { transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 };

// Builds the Malibu exterior into `body` (Group). Returns parts the car controller needs.
export function buildMalibu(body, mats) {
  const sh = buildShared();
  const add = (geo, mat, cast = true) => { const m = new THREE.Mesh(geo, mat); m.castShadow = cast; m.receiveShadow = false; body.add(m); return m; };
  add(sh.body, mats.body);
  add(sh.glass, mats.glass);
  add(sh.roof, mats.body);

  const chrome = mats.chrome;
  const decalMat = (t) => new THREE.MeshPhysicalMaterial({
    map: t.col, metalnessMap: t.mr, roughnessMap: t.mr, metalness: 1, roughness: 1,
    clearcoat: 0.5, clearcoatRoughness: 0.08, envMapIntensity: 1.5, ...DECAL,
  });
  const litMat = (t, color) => new THREE.MeshBasicMaterial({ map: t.lit, color, ...DECAL, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  const own = [];
  const mk = (geo, mat, cast = false) => { own.push(mat); return add(geo, mat, cast); };
  mk(sh.front, decalMat(sh.tF));
  mk(sh.rear, decalMat(sh.tR));
  const sideMat = decalMat(sh.tS);
  mk(sh.sideR, sideMat); add(sh.sideL, sideMat, false);
  mk(sh.front, litMat(sh.tF, new THREE.Color(2.6, 2.7, 3.0)));
  const tailLit = new THREE.Mesh(sh.rear, litMat(sh.tR, new THREE.Color(1, 1, 1)));
  tailLit.material.dispose();
  tailLit.material = new THREE.MeshBasicMaterial({ map: sh.tR.lit, color: mats.tail.color, ...DECAL, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  tailLit.material.color = mats.tail.color;   // same Color object: brake lights brighten with the tail material
  own.push(tailLit.material);
  body.add(tailLit);

  // chrome window trim
  for (const pts of dloCurves()) {
    const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 60, 0.011, 6, false), chrome);
    body.add(tube);
  }
  // gloss-black B-pillar between the doors (reads as a four-door saloon, not a coupe)
  const pillarMat = new THREE.MeshStandardMaterial({ color: 0x07080a, roughness: 0.35, metalness: 0.3 });
  own.push(pillarMat);
  for (const side of [1, -1]) {
    const pos = [];
    const P = (u, t) => {
      const g = ghSection(u), a = g[0], b = g[1], c = g[2];
      const p = t < 0.58 ? [a[0] + (b[0] - a[0]) * (t / 0.58), a[1] + (b[1] - a[1]) * (t / 0.58)]
        : [b[0] + (c[0] - b[0]) * ((t - 0.58) / 0.42), b[1] + (c[1] - b[1]) * ((t - 0.58) / 0.42)];
      return [side * (p[0] + 0.007), p[1], zAt(u)];
    };
    const n = 6, u0 = 0.548, u1 = 0.566;
    for (let i = 0; i < n; i++) {
      const t0 = (i / n) * 0.86, t1 = ((i + 1) / n) * 0.86;
      const q = [P(u0, t0), P(u1, t0), P(u1, t1), P(u0, t1)];
      const tri = side > 0 ? [0, 2, 1, 0, 3, 2] : [0, 1, 2, 0, 2, 3];
      for (const k of tri) pos.push(...q[k]);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    body.add(new THREE.Mesh(g, pillarMat));
  }
  // side mirrors (body colour on a black base), visible from the driver's seat too
  for (const s of [1, -1]) {
    const m = new THREE.Group();
    const shell = new THREE.Mesh(new THREE.SphereGeometry(0.11, 16, 10).scale(1.0, 0.62, 1.15), mats.body);
    shell.position.set(s * 0.1, 0, 0);
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.05, 0.14), mats.carbon);
    const glass = new THREE.Mesh(new THREE.CircleGeometry(0.085, 16).scale(1, 0.6, 1), mats.glass);
    glass.position.set(s * 0.1, 0, 0.105);
    m.add(shell, base, glass);
    m.position.set(s * 0.95, 1.01, zAt(0.372));
    m.userData.keepInCockpit = true;
    body.add(m);
  }
  // shark-fin antenna
  const fin = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8).scale(0.45, 0.8, 1.8), mats.carbon);
  fin.position.set(0, ROOF(0.71) + 0.02, zAt(0.71));
  body.add(fin);
  // dark underbody so the road doesn't show through the wheel wells
  const under = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.04, L * 0.9), mats.carbon);
  under.position.set(0, 0.27, 0.05);
  body.add(under);
  return { ownMats: own };
}

// 18" machined alloy with five twin spokes, low-profile tyre, brake disc + caliper
export function makeMalibuWheel(mats, side) {
  const pivot = new THREE.Group();
  const spin = new THREE.Group();
  pivot.add(spin);
  const R = MALIBU.wheelR, rimR = 0.232, w = 0.235;
  // tyre: lathe profile with rounded shoulders, axis along x
  const prof = [];
  const n = 10;
  for (let i = 0; i <= n; i++) {
    const a = -Math.PI / 2 + (Math.PI * i) / n;
    prof.push(new THREE.Vector2(R - 0.035 + Math.cos(a) * 0.035, Math.sin(a) * (w / 2)));
  }
  prof.unshift(new THREE.Vector2(rimR, -w / 2 + 0.01));
  prof.push(new THREE.Vector2(rimR, w / 2 - 0.01));
  const tyre = new THREE.Mesh(new THREE.LatheGeometry(prof, 36).rotateZ(Math.PI / 2), mats.tire);
  tyre.castShadow = true;
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(rimR, rimR, w - 0.02, 32, 1, true).rotateZ(Math.PI / 2), mats.spoke);
  const lip = new THREE.Mesh(new THREE.TorusGeometry(rimR - 0.004, 0.011, 8, 40).rotateY(Math.PI / 2), mats.rim);
  lip.position.x = side * (w / 2 - 0.02);
  const back = new THREE.Mesh(new THREE.CircleGeometry(rimR - 0.01, 28).rotateY(side * Math.PI / 2), mats.spoke);
  back.position.x = side * 0.02;
  spin.add(tyre, barrel, lip, back);
  const spokeGeo = new THREE.BoxGeometry(0.026, rimR - 0.06, 0.034).translate(0, (rimR - 0.06) / 2 + 0.05, 0);
  for (let i = 0; i < 5; i++) {
    for (const d of [-0.13, 0.13]) {
      const sp = new THREE.Mesh(spokeGeo, mats.rim);
      sp.position.x = side * (w / 2 - 0.035);
      sp.rotation.x = (i / 5) * Math.PI * 2 + d;
      sp.rotation.z = side * 0.06;
      spin.add(sp);
    }
  }
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.064, 0.03, 20).rotateZ(Math.PI / 2), mats.spoke);
  cap.position.x = side * (w / 2 - 0.03);
  const capC = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.032, 12).rotateZ(Math.PI / 2), mats.chrome);
  capC.position.x = side * (w / 2 - 0.025);
  spin.add(cap, capC);
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.02, 28).rotateZ(Math.PI / 2), mats.disc);
  disc.position.x = side * 0.0;
  spin.add(disc);
  const caliper = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.16, 0.12), mats.caliper);
  caliper.position.set(side * 0.04, 0.1, -0.09);
  pivot.add(caliper);
  return { pivot, spin };
}

export function malibuBodyTop(u) { return u >= GH0 && u <= GH1 ? ROOF(u) : TOP(u); }
