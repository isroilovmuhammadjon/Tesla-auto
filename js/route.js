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

export class RoadGraph {
  static load(url) {
    if (!RoadGraph.pending) RoadGraph.pending = fetch(url).then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); }).then((d) => new RoadGraph(d))
      .catch((e) => { RoadGraph.pending = null; throw e; });
    return RoadGraph.pending;
  }

  constructor(d) {
    this.names = d.names;
    const N = d.nodes.length / 2;
    this.nx = new Float32Array(N); this.nz = new Float32Array(N);
    for (let i = 0; i < N; i++) { this.nx[i] = d.nodes[2 * i]; this.nz[i] = d.nodes[2 * i + 1]; }
    // edge e: from u to v, length (m), kind 0..2, flags (1 one-way, 2 bridge, 4 tunnel, 8 roundabout), name, km/h, width, points
    this.edges = d.edges.map(([u, v, len10, kind, flags, name, speed, mid, width], i) => {
      const pts = [[this.nx[u], this.nz[u]]];
      for (let j = 0; j < mid.length; j += 2) pts.push([mid[j], mid[j + 1]]);
      pts.push([this.nx[v], this.nz[v]]);
      const cum = [0];
      for (let j = 1; j < pts.length; j++) cum.push(cum[j - 1] + Math.hypot(pts[j][0] - pts[j - 1][0], pts[j][1] - pts[j - 1][1]));
      return { i, u, v, len: cum[cum.length - 1] || len10 / 10, kind, flags, oneway: !!(flags & 1), name: name >= 0 ? d.names[name] : '', speed, width: width || 6, pts, cum };
    });
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

  cost(E) { return E.len / (Math.max(12, E.speed) / 3.6 * 0.85); }

  // from = { e, s, dir } (dir +1 = travelling u->v, -1 = v->u, 0 = either; reversing costs a U-turn)
  // to   = { e, s, dir } the stop, reached driving in direction dir along its edge
  route(from, to) {
    const N = this.nx.length;
    const g = new Float64Array(N).fill(Infinity);
    const prev = new Int32Array(N).fill(-1), prevDir = new Int8Array(N);
    const heap = new Heap();
    const tx = this.pointAt(to.e, to.s), vmax = 80 / 3.6;
    const h = (n) => Math.hypot(this.nx[n] - tx.x, this.nz[n] - tx.z) / vmax;
    const F = this.edges[from.e], T = this.edges[to.e];
    const UTURN = 25;
    const speedT = (E) => Math.max(12, E.speed) / 3.6 * 0.85;
    const startOpts = [];
    if (from.dir >= 0 || !F.oneway) startOpts.push([F.v, (F.len - from.s) / speedT(F) + (from.dir < 0 ? UTURN : 0), 1]);
    if (!F.oneway) startOpts.push([F.u, from.s / speedT(F) + (from.dir > 0 ? UTURN : 0), -1]);
    let direct = Infinity;
    if (from.e === to.e) {
      const forward = to.s >= from.s;
      if (to.dir >= 0 && forward && (from.dir >= 0)) direct = (to.s - from.s) / speedT(F);
      if (to.dir <= 0 && !forward && !F.oneway && from.dir <= 0) direct = (from.s - to.s) / speedT(F);
    }
    for (const [n, c] of startOpts) if (c < g[n]) { g[n] = c; prev[n] = -2; heap.push(c + h(n), n); }
    // the goal is entered from T.u (dir +1) or T.v (dir -1)
    const goalNode = to.dir >= 0 ? T.u : T.v, goalAdd = (to.dir >= 0 ? to.s : T.len - to.s) / speedT(T);
    if (to.dir < 0 && T.oneway) return null;
    let best = direct, bestVia = direct < Infinity ? 'direct' : null;
    while (heap.size) {
      const n = heap.pop();
      if (g[n] + h(n) >= best) break;
      if (n === goalNode && g[n] + goalAdd < best) { best = g[n] + goalAdd; bestVia = 'graph'; }
      for (const [ei, dir] of this.out[n]) {
        const E = this.edges[ei];
        const m = dir > 0 ? E.v : E.u;
        const c = g[n] + this.cost(E);
        if (c < g[m]) { g[m] = c; prev[m] = ei; prevDir[m] = dir; heap.push(c + h(m), m); }
      }
    }
    if (!bestVia) return null;
    // ---- rebuild the drive as a polyline
    let pts;
    if (bestVia === 'direct') pts = this.slice(from.e, from.s, to.s);
    else {
      const chain = [];
      let n = goalNode;
      while (prev[n] >= 0) { const ei = prev[n], dir = prevDir[n]; chain.push([ei, dir]); n = dir > 0 ? this.edges[ei].u : this.edges[ei].v; }
      chain.reverse();
      const startDir = n === F.v ? 1 : -1;
      pts = this.slice(from.e, from.s, startDir > 0 ? F.len : 0);
      for (const [ei, dir] of chain) {
        const E = this.edges[ei];
        const p = dir > 0 ? E.pts : E.pts.slice().reverse();
        for (let j = 1; j < p.length; j++) pts.push(p[j]);
      }
      const tail = to.dir >= 0 ? this.slice(to.e, 0, to.s) : this.slice(to.e, T.len, to.s);
      for (let j = 1; j < tail.length; j++) pts.push(tail[j]);
    }
    const cum = [0];
    for (let j = 1; j < pts.length; j++) cum.push(cum[j - 1] + Math.hypot(pts[j][0] - pts[j - 1][0], pts[j][1] - pts[j - 1][1]));
    return { pts, cum, length: cum[cum.length - 1], time: best };
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
