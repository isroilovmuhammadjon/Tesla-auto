// Road network of Tashkent for taxi routing (map/graph.json, built from OpenStreetMap).
// Edges follow the real streets; one-way streets are only usable forwards; bridges and tunnels
// only meet the streets they really join (OSM shares a node there), so a road passing over or
// under another never "connects" to it. Costs are travel times from the street's speed class.
const GRID = 100;

class Heap {
  constructor() { this.k = []; this.v = []; }
  get size() { return this.k.length; }
  push(key, val) {
    const k = this.k, v = this.v; let i = k.length; k.push(key); v.push(val);
    while (i > 0) { const p = (i - 1) >> 1; if (k[p] <= key) break; k[i] = k[p]; v[i] = v[p]; i = p; }
    k[i] = key; v[i] = val;
  }
  pop() {
    const k = this.k, v = this.v, top = v[0], last = k.length - 1;
    const lk = k[last], lv = v[last]; k.pop(); v.pop();
    if (last > 0) {
      let i = 0;
      for (;;) {
        let c = 2 * i + 1; if (c >= last) break;
        if (c + 1 < last && k[c + 1] < k[c]) c++;
        if (k[c] >= lk) break;
        k[i] = k[c]; v[i] = v[c]; i = c;
      }
      k[i] = lk; v[i] = lv;
    }
    return top;
  }
}

// Names the map only has in Russian Cyrillic ("Газалхон улица", "Рынок металла") are shown in Uzbek
// Latin script like the rest of the game: the street word is translated, the rest transliterated.
const CYR = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'j', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'x', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sh', ъ: "'", ы: 'i', ь: '', э: 'e', ю: 'yu', я: 'ya', ў: "o'", қ: 'q', ғ: "g'", ҳ: 'h' };
const WORDS = [[/\s*улица$/i, " ko'chasi"], [/^улица\s+(.+)$/i, "$1 ko'chasi"], [/\s*переулок$/i, " tor ko'chasi"], [/\s*проезд$/i, " o'tish yo'li"], [/\s*тупик$/i, " berk ko'chasi"], [/\s*проспект$/i, ' shoh ko\'chasi'], [/^рынок\s+(.+)$/i, '$1 bozori'], [/\s*рынок$/i, ' bozori'], [/^махалля\s+/i, ''], [/\s*махалля$/i, ' mahallasi']];
export function uzLatin(n) {
  if (!n || !/[А-Яа-яЁёЎўҚқҒғҲҳ]/.test(n)) return n;
  let t = n;
  for (const [re, to] of WORDS) t = t.replace(re, to);
  t = t.replace(/[А-Яа-яЁёЎўҚқҒғҲҳ]/g, (ch) => { const lo = ch.toLowerCase(), l = CYR[lo] ?? lo; return ch === lo ? l : l.charAt(0).toUpperCase() + l.slice(1); });
  t = t.replace(/\s+/g, ' ').trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export class RoadGraph {
  static load(url) {
    if (!RoadGraph.pending) RoadGraph.pending = fetch(url).then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); }).then((d) => new RoadGraph(d))
      .catch((e) => { RoadGraph.pending = null; throw e; });
    return RoadGraph.pending;
  }

  constructor(d) {
    this.names = d.names = d.names.map(uzLatin);
    const N = d.nodes.length / 2;
    this.nx = new Float32Array(N); this.nz = new Float32Array(N);
    for (let i = 0; i < N; i++) { this.nx[i] = d.nodes[2 * i]; this.nz[i] = d.nodes[2 * i + 1]; }
    // edge e: from u to v, length (m), kind 0..2, flags (1 one-way, 2 bridge, 4 tunnel, 8 roundabout), name, km/h, width, points
    this.edges = d.edges.map(([u, v, len10, kind, flags, name, speed, mid, width, way], i) => {
      const pts = [[this.nx[u], this.nz[u]]];
      for (let j = 0; j < mid.length; j += 2) pts.push([mid[j], mid[j + 1]]);
      pts.push([this.nx[v], this.nz[v]]);
      const cum = [0];
      for (let j = 1; j < pts.length; j++) cum.push(cum[j - 1] + Math.hypot(pts[j][0] - pts[j - 1][0], pts[j][1] - pts[j - 1][1]));
      return { i, u, v, len: cum[cum.length - 1] || len10 / 10, kind, flags, oneway: !!(flags & 1), name: name >= 0 ? d.names[name] : '', speed, width: width || 6, pts, cum, way: way ?? -1 };
    });
    // turn restrictions at a node: "node|fromWay" -> { no: Set(toWay), only: toWay }
    this.turns = new Map();
    for (const [n, from, to, only] of d.turns || []) {
      const k = n + '|' + from; let t = this.turns.get(k); if (!t) this.turns.set(k, (t = { no: new Set(), only: null }));
      if (only) t.only = to; else t.no.add(to);
    }
    this.out = Array.from({ length: N }, () => []);
    for (const e of this.edges) {
      this.out[e.u].push([e.i, 1]);
      if (!e.oneway) this.out[e.v].push([e.i, -1]);
    }
    this.grid = new Map();
    for (const e of this.edges) for (let j = 0; j < e.pts.length - 1; j++) {
      const [ax, az] = e.pts[j], [bx, bz] = e.pts[j + 1];
      const x0 = Math.floor(Math.min(ax, bx) / GRID), x1 = Math.floor(Math.max(ax, bx) / GRID);
      const z0 = Math.floor(Math.min(az, bz) / GRID), z1 = Math.floor(Math.max(az, bz) / GRID);
      for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
        const k = x * 100003 + z; let l = this.grid.get(k); if (!l) this.grid.set(k, (l = [])); l.push([e.i, j]);
      }
    }
  }

  // closest point on the network; heading (unit dx, dz) prefers the carriageway going that way,
  // filter(edge) can skip edges (e.g. no stopping on main roads)
  nearest(x, z, { heading = null, filter = null, radius = 1 } = {}) {
    let best = null, bd = Infinity;
    const gx = Math.floor(x / GRID), gz = Math.floor(z / GRID);
    for (let r = 0; r <= radius + 2 && !best; r++) {
      for (let ix = gx - r; ix <= gx + r; ix++) for (let iz = gz - r; iz <= gz + r; iz++) {
        if (Math.max(Math.abs(ix - gx), Math.abs(iz - gz)) !== r) continue;
        for (const [ei, j] of this.grid.get(ix * 100003 + iz) || []) {
          const e = this.edges[ei];
          if (filter && !filter(e)) continue;
          const [ax, az] = e.pts[j], [bx, bz] = e.pts[j + 1];
          const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1;
          const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
          const px = ax + dx * t, pz = az + dz * t;
          let d = Math.hypot(px - x, pz - z);
          const l = Math.sqrt(l2), ux = dx / l, uz = dz / l;
          if (heading) {
            const dot = ux * heading[0] + uz * heading[1];
            if (e.oneway && dot < -0.3) d += 25;            // the other carriageway of a divided road
            d += (1 - Math.abs(dot)) * 6;
          }
          if (d < bd) { bd = d; best = { e: ei, s: e.cum[j] + t * l, x: px, z: pz, ux, uz, d: Math.hypot(px - x, pz - z) }; }
        }
      }
      if (best && r >= 1) break;
    }
    return best;
  }

  pointAt(e, s) {
    const E = this.edges[e];
    s = Math.max(0, Math.min(E.len, s));
    let j = 1; while (j < E.cum.length - 1 && E.cum[j] < s) j++;
    const a = E.pts[j - 1], b = E.pts[j], seg = E.cum[j] - E.cum[j - 1] || 1, t = (s - E.cum[j - 1]) / seg;
    return { x: a[0] + (b[0] - a[0]) * t, z: a[1] + (b[1] - a[1]) * t, ux: (b[0] - a[0]) / seg, uz: (b[1] - a[1]) / seg };
  }

  // points of edge e between distances s0 and s1 (s1 < s0 walks it backwards)
  slice(e, s0, s1) {
    const E = this.edges[e], out = [];
    const p0 = this.pointAt(e, s0); out.push([p0.x, p0.z]);
    if (s1 >= s0) { for (let j = 1; j < E.pts.length - 1; j++) if (E.cum[j] > s0 && E.cum[j] < s1) out.push(E.pts[j]); }
    else { for (let j = E.pts.length - 2; j >= 1; j--) if (E.cum[j] < s0 && E.cum[j] > s1) out.push(E.pts[j]); }
    const p1 = this.pointAt(e, s1); out.push([p1.x, p1.z]);
    return out;
  }

  // travel time; private lanes and driveways only as a last resort
  cost(E) { return E.len / (Math.max(8, E.speed) / 3.6 * 0.85) * (E.flags & 32 ? 3 : 1); }

  // from = { e, s, dir } (dir +1 = travelling u->v, -1 = v->u, 0 = either; reversing costs a U-turn)
  // to   = { e, s, dir } the stop, reached driving in direction dir along its edge
  // The search runs over (edge, direction) states so a turn can be judged by where you come from:
  // OSM turn restrictions are obeyed, left turns cost a little more than right turns, U-turns only at dead ends.
  route(from, to) {
    const E = this.edges, NE = E.length;
    const g = new Float64Array(NE * 2).fill(Infinity);
    const prev = new Int32Array(NE * 2).fill(-1);
    const heap = new Heap();
    const tx = this.pointAt(to.e, to.s), vmax = 80 / 3.6;
    const F = E[from.e], T = E[to.e];
    if (to.dir < 0 && T.oneway) return null;
    const speedT = (e) => Math.max(8, e.speed) / 3.6 * 0.85;
    const sid = (ei, dir) => ei * 2 + (dir > 0 ? 0 : 1);
    const endNode = (ei, dir) => (dir > 0 ? E[ei].v : E[ei].u);
    const h = (n) => Math.hypot(this.nx[n] - tx.x, this.nz[n] - tx.z) / vmax;
    const UTURN = 25;
    // turning round where you stand: easy on a wide street, a 3-point turn between walls on a narrow
    // mahalla lane (a car needs ~10-12 m), so a driver there would rather go round the block
    const UT0 = F.width >= 11 ? UTURN : F.width >= 8 ? 60 : 150;
    // heading at the end / start of an edge, for turn costs
    const headOut = (ei, dir) => { const p = E[ei].pts, a = dir > 0 ? p[p.length - 2] : p[1], b = dir > 0 ? p[p.length - 1] : p[0]; return [b[0] - a[0], b[1] - a[1]]; };
    const headIn = (ei, dir) => { const p = E[ei].pts, a = dir > 0 ? p[0] : p[p.length - 1], b = dir > 0 ? p[1] : p[p.length - 2]; return [b[0] - a[0], b[1] - a[1]]; };
    const turnCost = (ei, d1, ej, d2) => {
      const [ax, az] = headOut(ei, d1), [bx, bz] = headIn(ej, d2);
      const ang = Math.atan2(ax * bz - az * bx, ax * bx + az * bz);      // + = right (x east, z south)
      if (Math.abs(ang) < 0.5) return 0;
      // a square or sharper corner between two mahalla lanes (house walls on the corner, 3-4 m lanes) is a
      // slow shuffle at best: prefer the way round unless it is much longer
      return (ang > 0 ? 2 : 6) + tightCost(ei, ej, ang);
    };
    const tightCost = (ei, ej, ang) => {
      const narrow = Math.min(E[ei].width, E[ej].width);
      // (survey: every such corner tested is passable slowly, so these are time costs for a slow corner, not bans)
      return narrow < 4.5 ? (Math.abs(ang) > 1.9 ? 45 : Math.abs(ang) > 1.15 ? 12 : 0) : narrow < 6 && Math.abs(ang) > 1.9 ? 15 : 0;
    };
    const allowed = (n, ei, ej) => {
      const t = this.turns.get(n + '|' + E[ei].way);
      if (!t) return true;
      if (t.only !== null && t.only !== undefined) return E[ej].way === t.only;
      return !t.no.has(E[ej].way);
    };
    const push = (st, c, n) => { if (c < g[st]) { g[st] = c; heap.push(c + h(n), st); return true; } return false; };
    if (from.dir >= 0 || !F.oneway) { const st = sid(from.e, 1); if (push(st, (F.len - from.s) / speedT(F) + (from.dir < 0 ? UT0 : 0), F.v)) prev[st] = -2; }
    if (!F.oneway) { const st = sid(from.e, -1); if (push(st, from.s / speedT(F) + (from.dir > 0 ? UT0 : 0), F.u)) prev[st] = -2; }
    let best = Infinity, bestState = -1;
    if (from.e === to.e) {
      const forward = to.s >= from.s;
      if (to.dir >= 0 && forward && from.dir >= 0) { best = (to.s - from.s) / speedT(F); bestState = -3; }
      if (to.dir <= 0 && !forward && !F.oneway && from.dir <= 0) { best = (from.s - to.s) / speedT(F); bestState = -3; }
    }
    const goalAdd = (to.dir >= 0 ? to.s : T.len - to.s) / speedT(T);
    while (heap.size) {
      const st = heap.pop();
      const ei = st >> 1, dir = st & 1 ? -1 : 1, n = endNode(ei, dir);
      if (g[st] + h(n) >= best) break;
      const outs = this.out[n];
      for (const [ej, d2] of outs) {
        const uturn = ej === ei && d2 === -dir;
        if (uturn && outs.length > 1) continue;                    // U-turns only where the street ends
        if (!allowed(n, ei, ej)) continue;
        const tc = uturn ? UTURN : turnCost(ei, dir, ej, d2);
        if (ej === to.e && d2 === (to.dir >= 0 ? 1 : -1)) {
          const c = g[st] + tc + goalAdd;
          if (c < best) { best = c; bestState = st; }
        }
        const s2 = sid(ej, d2);
        const c = g[st] + tc + this.cost(E[ej]);
        if (push(s2, c, endNode(ej, d2))) prev[s2] = st;
      }
    }
    if (bestState === -1) return null;
    let pts, tight = 0; const corners = [];
    if (bestState === -3) pts = this.slice(from.e, from.s, to.s);
    else {
      const chain = [];
      let st = bestState;
      while (st >= 0) { chain.push(st); st = prev[st]; }
      chain.reverse();
      const first = chain[0], fdir = first & 1 ? -1 : 1;
      pts = this.slice(from.e, from.s, fdir > 0 ? F.len : 0);
      let last = first;
      for (const st2 of chain.slice(1)) {
        const ei = st2 >> 1, dir = st2 & 1 ? -1 : 1;
        // count the square corners between narrow lanes the route still has to take
        const li = last >> 1, ld = last & 1 ? -1 : 1, [ax, az] = headOut(li, ld), [bx, bz] = headIn(ei, dir);
        const tang = Math.atan2(ax * bz - az * bx, ax * bx + az * bz);
        if (li !== ei && tightCost(li, ei, tang) >= 12) { tight++; const np = ld > 0 ? E[li].pts[E[li].pts.length - 1] : E[li].pts[0]; corners.push({ w: [E[li].width, E[ei].width], ang: Math.abs(tang), at: [Math.round(np[0]), Math.round(np[1])] }); }
        last = st2;
        const p = dir > 0 ? E[ei].pts : E[ei].pts.slice().reverse();
        for (let j = 1; j < p.length; j++) pts.push(p[j]);
      }
      const tail = to.dir >= 0 ? this.slice(to.e, 0, to.s) : this.slice(to.e, T.len, to.s);
      for (let j = 1; j < tail.length; j++) pts.push(tail[j]);
    }
    const cum = [0];
    for (let j = 1; j < pts.length; j++) cum.push(cum[j - 1] + Math.hypot(pts[j][0] - pts[j - 1][0], pts[j][1] - pts[j - 1][1]));
    return { pts, cum, length: cum[cum.length - 1], time: best, tight, corners };
  }

  // a stop on an edge: the kerb on the right-hand side of travel direction dir, set back from the lane
  kerb(stop) {
    const E = this.edges[stop.e], p = this.pointAt(stop.e, stop.s);
    const dx = p.ux * stop.dir, dz = p.uz * stop.dir;
    const off = E.width / 2 + 1.2;            // on the pavement just past the kerb
    // x east, z south: for travel direction (dx, dz) the right-hand side is (-dz, dx)
    return { x: p.x - dz * off, z: p.z + dx * off, cx: p.x, cz: p.z, dx, dz, side: [-dz, dx] };
  }
}
