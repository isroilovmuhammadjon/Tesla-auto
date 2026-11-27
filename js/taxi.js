// TOSHKENT TAKSI: a taxi shift on the real Tashkent map.
//
// Started from the prototype (Toshkent-Taksi.patch): passenger marker, pickup -> drop-off, a fare
// in so'm paid once and a balance saved on the device. Now every order is routed along the real
// road network (route.js, OpenStreetMap): the offer shows pickup, destination, road distance, ETA and
// fare before you accept; the route is drawn on the road and the minimap and recalculated after a
// wrong turn; the passenger waits on the pavement at a kerb you can reach, and only gets in or out
// once you have stopped next to them on their side of the street.
import * as THREE from 'three';
import { storageGet, storageSet } from './config.js?v=90b4fc68';
import { RoadGraph } from './route.js?v=90b4fc68';
import { MAP_VER } from './osmcity.js?v=90b4fc68';

const KEY_BAL = 'sr3d_taxi_balance', KEY_TRIPS = 'sr3d_taxi_trips';
// where a taxi may stop: not on main roads, bridges, tunnels or roundabouts, and not in lanes too narrow to pull in
const STOP_OK = (e) => e.kind <= 1 && !(e.flags & (2 | 4 | 8)) && e.len > 22 && e.width >= 5;
const KINDS = ['mahalla', 'metro', 'bozor', 'uzoq'];
const KIND_LABEL = { mahalla: "Mahalla ichida", metro: 'Metroga', bozor: 'Bozordan', uzoq: "Shahar bo'ylab" };

function money(n) { return Math.round(n).toLocaleString('ru-RU').replace(/ /g, ' ') + " so'm"; }
function km(m) { return m < 950 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`; }

// ------------------------------------------------------------------ 3D bits
function person(shirt) {
  const g = new THREE.Group();
  const part = (geo, color, x, y) => { const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, roughness: 0.8 })); m.position.set(x, y, 0); m.castShadow = true; g.add(m); return m; };
  part(new THREE.CapsuleGeometry(0.23, 0.42, 4, 10), shirt, 0, 1.1);
  part(new THREE.SphereGeometry(0.17, 12, 10), 0xbd8769, 0, 1.66);
  part(new THREE.SphereGeometry(0.175, 12, 6, 0, Math.PI * 2, 0, Math.PI * 0.5), 0x1d1712, 0, 1.69);
  const legs = [-1, 1].map((s) => part(new THREE.CapsuleGeometry(0.09, 0.55, 3, 8), 0x253041, 0.12 * s, 0.44));
  const arms = [-1, 1].map((s) => part(new THREE.CapsuleGeometry(0.07, 0.42, 3, 8), shirt, 0.27 * s, 1.08));
  // a raised arm while waiting: hailing the taxi
  g.userData = { legs, arms };
  return g;
}

function marker() {
  const group = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.RingGeometry(2.0, 2.5, 40), new THREE.MeshBasicMaterial({ color: 0xffc04c, side: THREE.DoubleSide, transparent: true, opacity: 0.9, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.2;
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 40, 12, 1, true), new THREE.MeshBasicMaterial({ color: 0xffc04c, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide }));
  beam.position.y = 20;
  group.add(ring, beam);
  return { group, ring, beam };
}

function arrowTexture() {
  const c = document.createElement('canvas'); c.width = 64; c.height = 128;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 64, 128);
  g.fillStyle = 'rgba(255,255,255,0.95)';
  g.beginPath(); g.moveTo(32, 18); g.lineTo(58, 58); g.lineTo(44, 58); g.lineTo(32, 40); g.lineTo(20, 58); g.lineTo(6, 58); g.closePath(); g.fill();
  const t = new THREE.CanvasTexture(c); t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ------------------------------------------------------------------ the shift
export class TaxiShift {
  constructor(city) {
    this.city = city;
    const $ = (id) => document.getElementById(id);
    this.el = {
      panel: $('taxiPanel'), wallet: $('taxiWallet'), trip: $('taxiTrip'), help: $('taxiHelp'), turn: $('taxiTurn'), cls: $('taxiCls'),
      offer: $('taxiOffer'), oKind: $('txKind'), oFrom: $('txFrom'), oTo: $('txTo'), oDist: $('txDist'), oFare: $('txFare'), oPick: $('txPick'),
      toast: $('taxiToast'),
    };
    this.active = false;
    this.graph = null;
    this.search = null;
    this.kindTurn = 0;
  }

  get balance() { return Math.max(0, Number(storageGet(KEY_BAL, 0)) || 0); }

  async ensureData() {
    if (this.graph && this.search) return true;
    try {
      const [g, s] = await Promise.all([RoadGraph.load('map/graph.json?v=' + MAP_VER), this.search ? Promise.resolve(this.search) : fetch('map/search.json?v=' + MAP_VER).then((r) => r.json())]);
      this.graph = g; this.search = s;
      return true;
    } catch (e) { console.error(e); return false; }
  }

  start(def) {
    this.stop();
    this.active = true;
    this.def = def;
    this.rate = def.fare || [7000, 2000];
    this.ensure3D();
    this.pin.group.visible = false; this.pax.visible = false; this.ribbon.visible = false;
    this.el.panel.hidden = false;
    this.el.offer.hidden = true;
    this.el.cls.textContent = `${def.name} · ${def.cls}`;
    this.el.wallet.textContent = money(this.balance);
    this.say('Buyurtma qidirilmoqda…', 'Xarita yuklanmoqda');
    this.phase = 'search';
    this.timer = 1.2;
    this.trips = Number(storageGet(KEY_TRIPS, 0)) || 0;
    this.ensureData().then((ok) => { if (!ok && this.active) this.say('Yo\'l tarmog\'i yuklanmadi', 'Internetni tekshiring'); });
  }

  ensure3D() {
    if (!this.pin) {
      this.pin = marker(); this.city.root.add(this.pin.group);
      this.pax = person(0x257a84); this.city.root.add(this.pax);
      this.ribbonMat = new THREE.MeshBasicMaterial({ map: arrowTexture(), color: 0xffc04c, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -10, polygonOffsetUnits: -10 });
      this.ribbon = new THREE.Mesh(new THREE.BufferGeometry(), this.ribbonMat);
      this.ribbon.frustumCulled = false;
      this.city.root.add(this.ribbon);
    }
  }

  stop() {
    this.active = false;
    this.phase = null; this.order = null; this.route = null;
    if (this.el.panel) this.el.panel.hidden = true;
    if (this.el.offer) this.el.offer.hidden = true;
    this.city.taxiTarget = null; this.city.taxiRoute = null;
    if (this.pin) { this.pin.group.visible = false; this.pax.visible = false; this.ribbon.visible = false; }
  }

  say(trip, help = '') {
    if (this.el.trip.textContent !== trip) this.el.trip.textContent = trip;
    if (this.el.help.textContent !== help) this.el.help.textContent = help;
  }

  toast(text) {
    const t = this.el.toast; if (!t) return;
    t.textContent = text; t.hidden = false; t.classList.remove('show'); void t.offsetWidth; t.classList.add('show');
    clearTimeout(this.toastT); this.toastT = setTimeout(() => { t.hidden = true; }, 2600);
  }

  // ---------------------------------------------------------------- orders
  carSnap() {
    const s = this.city.state, fx = -Math.sin(s.yaw), fz = -Math.cos(s.yaw);
    const n = this.graph.nearest(s.x, s.z, { heading: [fx, fz] });
    if (!n) return null;
    const E = this.graph.edges[n.e];
    const dot = n.ux * fx + n.uz * fz;
    return { e: n.e, s: n.s, dir: E.oneway ? 1 : (dot >= 0 ? 1 : -1), d: n.d };
  }

  // a legal stop near (x, z): on a street where you may stop, a few metres from the ends
  stopNear(x, z, prefer0 = false) {
    const f = prefer0 ? (e) => STOP_OK(e) && e.kind === 0 : STOP_OK;
    const n = this.graph.nearest(x, z, { filter: f, radius: 3 }) || this.graph.nearest(x, z, { filter: STOP_OK, radius: 4 });
    if (!n) return null;
    const E = this.graph.edges[n.e];
    return { e: n.e, s: Math.max(9, Math.min(E.len - 9, n.s)), d: n.d };
  }

  randomStop(cx, cz, rMin, rMax, prefer0) {
    for (let i = 0; i < 25; i++) {
      const a = Math.random() * Math.PI * 2, r = rMin + Math.random() * (rMax - rMin);
      const st = this.stopNear(cx + Math.cos(a) * r, cz + Math.sin(a) * r, prefer0);
      if (st && st.d < 120 && this.inMap(cx + Math.cos(a) * r, cz + Math.sin(a) * r)) return st;
    }
    return null;
  }

  inMap() { return true; }

  // the best direction to approach a stop from: the shorter of the two routes (one-way: forwards only)
  routeTo(from, stop) {
    const E = this.graph.edges[stop.e];
    let best = null;
    for (const dir of E.oneway ? [1] : [1, -1]) {
      const r = this.graph.route(from, { e: stop.e, s: stop.s, dir });
      if (r && (!best || r.time < best.r.time)) best = { r, dir };
    }
    return best;
  }

  placeName(x, z, types) {
    let best = null, bd = 350 * 350;
    for (const e of this.search) {
      if (types && !types.includes(e[0])) continue;
      const d = (e[2] - x) ** 2 + (e[3] - z) ** 2;
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  describe(stop, extra) {
    const p = this.graph.pointAt(stop.e, stop.s);
    const E = this.graph.edges[stop.e];
    const near = extra || this.placeName(p.x, p.z, ['mahalla', 'bekat', 'bozor', 'metro', 'diqqatga sazovor']);
    const street = E.name || "nomsiz ko'cha";
    const any = near || this.placeName(p.x, p.z, null);
    const district = any && any[4] ? any[4].replace(/ tumani$/i, '') : '';
    if (!near) return { title: street, sub: district };
    return { title: near[1], sub: [street !== near[1] ? street : '', district].filter(Boolean).join(' · ') };
  }

  pickFrom(types, cx, cz, rMin, rMax) {
    const c = this.search.filter((e) => types.includes(e[0]) && Math.hypot(e[2] - cx, e[3] - cz) > rMin && Math.hypot(e[2] - cx, e[3] - cz) < rMax);
    return c.length ? c[Math.floor(Math.random() * c.length)] : null;
  }

  makeOrder() {
    const s = this.city.state;
    const from = this.carSnap();
    if (!from) return null;
    const kind = KINDS[this.kindTurn++ % KINDS.length];
    let pickup, dest, pickPlace = null, destPlace = null;
    if (kind === 'bozor') {
      pickPlace = this.pickFrom(['bozor'], s.x, s.z, 250, 3500);
      if (pickPlace) pickup = this.stopNear(pickPlace[2], pickPlace[3]);
    }
    if (!pickup) pickup = this.randomStop(s.x, s.z, 180, 900, kind === 'mahalla');
    if (!pickup) return null;
    const pp = this.graph.pointAt(pickup.e, pickup.s);
    if (kind === 'metro') {
      destPlace = this.pickFrom(['metro kirishi'], pp.x, pp.z, 900, 6000);
      if (destPlace) dest = this.stopNear(destPlace[2], destPlace[3]);
    } else if (kind === 'uzoq') {
      destPlace = this.pickFrom(['diqqatga sazovor', 'tuman', 'bozor', 'universitet'], pp.x, pp.z, 5000, 14000) || this.pickFrom(['mahalla'], pp.x, pp.z, 5000, 12000);
      if (destPlace) dest = this.stopNear(destPlace[2], destPlace[3]);
    } else if (kind === 'mahalla') {
      destPlace = this.pickFrom(['mahalla'], pp.x, pp.z, 700, 2600);
      dest = destPlace ? this.stopNear(destPlace[2], destPlace[3], true) : this.randomStop(pp.x, pp.z, 700, 2400, true);
    } else {
      dest = this.randomStop(pp.x, pp.z, 1500, 5000, false);
    }
    if (!dest || dest.e === pickup.e) return null;
    const toPick = this.routeTo(from, pickup);
    if (!toPick) return null;
    // a dispatcher offers passengers who are close by road, not just as the crow flies
    this.tries = (this.tries || 0) + 1;
    if (toPick.r.length > 2200 && this.tries < 6) return null;
    this.tries = 0;
    pickup.dir = toPick.dir;
    const trip = this.routeTo({ e: pickup.e, s: pickup.s, dir: pickup.dir }, dest);
    if (!trip) return null;
    dest.dir = trip.dir;
    const dist = trip.r.length;
    const fare = Math.round((this.rate[0] + this.rate[1] * dist / 1000) / 500) * 500;
    const eta = Math.max(2, Math.round(trip.r.time * 1.25 / 60));
    return { kind, pickup, dest, dist, fare, eta, pickRoute: toPick.r, pickName: this.describe(pickup, pickPlace), destName: this.describe(dest, destPlace),
      destPlace: destPlace && destPlace[0] === 'metro kirishi' ? destPlace : null };
  }

  showOffer(o) {
    this.order = o; this.phase = 'offer';
    const el = this.el;
    el.oKind.textContent = KIND_LABEL[o.kind];
    el.oFrom.textContent = o.pickName.title + (o.pickName.sub ? ` — ${o.pickName.sub}` : '');
    el.oTo.textContent = o.destName.title + (o.destName.sub ? ` — ${o.destName.sub}` : '');
    el.oPick.textContent = `Yo'lovchigacha ${km(o.pickRoute.length)}`;
    el.oDist.textContent = `${km(o.dist)} · ~${o.eta} daqiqa`;
    el.oFare.textContent = money(o.fare);
    el.offer.hidden = false;
    this.say('Yangi buyurtma', 'Qabul qilasizmi? (Enter / N)');
  }

  accept() {
    if (this.phase !== 'offer' || !this.order) return;
    this.el.offer.hidden = true;
    this.phase = 'toPickup';
    this.reroutes = 0;
    const k = this.graph.kerb(this.order.pickup);
    this.order.pickKerb = k;
    this.pax.visible = true;
    this.pax.position.set(k.x, 0, k.z);
    this.pax.rotation.y = Math.atan2(k.cx - k.x, k.cz - k.z);
    this.setRoute(this.order.pickRoute, 0xffc04c);
    this.setPin(k.x, k.z, 0xffc04c);
    this.toast("Buyurtma qabul qilindi");
  }

  decline() {
    if (this.phase !== 'offer') return;
    this.el.offer.hidden = true;
    this.order = null; this.phase = 'search'; this.timer = 0.6;
  }

  key(code) {
    if (this.phase === 'offer') {
      if (code === 'Enter' || code === 'KeyY') { this.accept(); return true; }
      if (code === 'KeyN' || code === 'Backspace') { this.decline(); return true; }
    }
    return false;
  }

  setPin(x, z, color) {
    this.pin.group.visible = true;
    this.pin.group.position.set(x, 0, z);
    this.pin.ring.material.color.setHex(color);
    this.pin.beam.material.color.setHex(color);
    this.city.taxiTarget = { x, z, color };
  }

  setRoute(r, color) {
    this.route = r; this.prog = 0; this.offT = 0;
    this.ribbonMat.color.setHex(color);
    this.routeColor = color;
    this.ribbonAt = -1;
    this.city.taxiRoute = { pts: r.pts, from: 0, color: '#' + color.toString(16).padStart(6, '0') };
  }

  reroute() {
    const target = this.phase === 'toPickup' ? this.order.pickup : this.order.dest;
    const from = this.carSnap();
    if (!from) return;
    const r = this.graph.route(from, target);
    if (!r) return;
    this.reroutes++;
    this.setRoute(r, this.routeColor);
    this.toast("Marshrut qayta hisoblandi");
  }

  // progress along the route polyline and how far the car is from it
  track() {
    const s = this.city.state, P = this.route.pts;
    let best = this.prog, bd = Infinity;
    const j0 = Math.max(0, this.prog - 3), j1 = Math.min(P.length - 2, this.prog + 60);
    for (let j = j0; j <= j1; j++) {
      const [ax, az] = P[j], [bx, bz] = P[j + 1];
      const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((s.x - ax) * dx + (s.z - az) * dz) / l2));
      const d = (ax + dx * t - s.x) ** 2 + (az + dz * t - s.z) ** 2;
      if (d < bd) { bd = d; best = j; this.progT = t; }
    }
    this.prog = best;
    const left = this.route.length - (this.route.cum[best] + (this.route.cum[best + 1] - this.route.cum[best]) * (this.progT || 0));
    return { off: Math.sqrt(bd), left };
  }

  // next turn instruction: first bend of more than 35 degrees in the next 400 m
  nextTurn() {
    const P = this.route.pts, C = this.route.cum, j0 = this.prog + 1;
    const here = C[this.prog];
    for (let j = j0; j < P.length - 1; j++) {
      if (C[j] - here > 400) break;
      const ax = P[j][0] - P[j - 1][0], az = P[j][1] - P[j - 1][1];
      // look a little further for the outgoing direction (OSM curves are split into short pieces)
      let k = j + 1; while (k < P.length - 1 && C[k] - C[j] < 12) k++;
      const bx = P[k][0] - P[j][0], bz = P[k][1] - P[j][1];
      const la = Math.hypot(ax, az), lb = Math.hypot(bx, bz);
      if (la < 0.5 || lb < 0.5) continue;
      const cross = (ax * bz - az * bx) / (la * lb), dot = (ax * bx + az * bz) / (la * lb);
      const ang = Math.atan2(cross, dot);
      if (Math.abs(ang) > 0.6) {
        // x east, z south: a positive cross product (ax*bz - az*bx) is a turn to the right
        const dist = Math.max(0, C[j] - here - (this.progT || 0) * (C[this.prog + 1] - here));
        const dirTxt = Math.abs(ang) > 2.4 ? 'orqaga qayriling' : ang > 0 ? "o'ngga buriling" : "chapga buriling";
        return `${Math.round(dist / 10) * 10} m dan keyin ${dirTxt}`;
      }
    }
    return 'To\'g\'riga';
  }

  updateRibbon() {
    const P = this.route.pts, C = this.route.cum;
    if (this.ribbonAt === this.prog) return;
    this.ribbonAt = this.prog;
    const pos = [], uv = [];
    const start = C[this.prog], w = 0.6;
    let v = 0;
    for (let j = this.prog; j < P.length - 1 && C[j] - start < 260; j++) {
      const [ax, az] = P[j], [bx, bz] = P[j + 1];
      const len = Math.hypot(bx - ax, bz - az); if (len < 0.1) continue;
      const nx = -(bz - az) / len * w, nz = (bx - ax) / len * w, y = 0.1;
      pos.push(ax - nx, y, az - nz, bx - nx, y, bz - nz, bx + nx, y, bz + nz, ax - nx, y, az - nz, bx + nx, y, bz + nz, ax + nx, y, az + nz);
      const v1 = v + len / 2.2;
      uv.push(0, v, 0, v1, 1, v1, 0, v, 1, v1, 1, v);
      v = v1;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    this.ribbon.geometry.dispose();
    this.ribbon.geometry = g;
    this.ribbon.material.side = THREE.DoubleSide;
    this.ribbon.visible = true;
  }

  // is the car stopped beside the kerb point k, on the passenger's side of the street?
  atKerb(k) {
    const s = this.city.state;
    const d = Math.hypot(s.x - k.x, s.z - k.z);
    const along = (s.x - k.cx) * k.dx + (s.z - k.cz) * k.dz;
    const side = (s.x - k.cx) * k.side[0] + (s.z - k.cz) * k.side[1];      // + = towards the passenger
    const E = this.graph.edges[(this.phase === 'toPickup' || this.phase === 'boarding' ? this.order.pickup : this.order.dest).e];
    const sideOk = side > (E.oneway ? -E.width / 2 + 0.6 : -0.8);
    return { near: d < 11 && Math.abs(along) < 10, stopped: Math.abs(s.v) < 0.9, sideOk, d };
  }

  // ---------------------------------------------------------------- per frame
  update(dt) {
    if (!this.active) return;
    const s = this.city.state;
    this.el.wallet.textContent = money(this.balance);
    if (!this.graph) return;
    if (this.phase === 'search' || this.phase === 'paid') {
      this.timer -= dt;
      if (this.timer > 0) return;
      this.timer = 0.8;
      const o = this.makeOrder();
      if (o) this.showOffer(o); else this.say('Buyurtma qidirilmoqda…', 'Yaqin atrofda yo\'lovchi yo\'q');
      return;
    }
    if (this.phase === 'offer') return;
    if (this.updateNav(dt)) return;
    // passenger getting in / out: a short walk between the kerb and the rear door
    if (this.phase === 'boarding' || this.phase === 'alighting') {
      const k = this.phase === 'boarding' ? this.order.pickKerb : this.order.destKerb;
      if (Math.abs(s.v) > 1.5 && this.phase === 'boarding') {         // drove off: they stay on the pavement
        this.phase = 'toPickup'; this.pax.position.set(k.x, 0, k.z); this.toast("Yo'lovchi o'tirib ulgurmadi"); return;
      }
      this.anim += dt;
      const t = Math.min(1, this.anim / 2.2);
      const rx = -Math.cos(s.yaw), rz = Math.sin(s.yaw);         // car's left
      const door = { x: s.x - rx * 1.0 + Math.sin(s.yaw) * 0.4, z: s.z - rz * 1.0 + Math.cos(s.yaw) * 0.4 };   // right rear door
      const a = this.phase === 'boarding' ? k : door, b = this.phase === 'boarding' ? door : { x: k.x + k.side[0] * 1.5, z: k.z + k.side[1] * 1.5 };
      this.pax.visible = true;
      this.pax.position.set(a.x + (b.x - a.x) * t, 0, a.z + (b.z - a.z) * t);
      this.pax.rotation.y = Math.atan2(b.x - a.x, b.z - a.z);
      const sw = Math.sin(this.anim * 9) * 0.5;
      this.pax.userData.legs[0].rotation.x = sw; this.pax.userData.legs[1].rotation.x = -sw;
      if (t >= 1) {
        if (this.phase === 'boarding') {
          this.pax.visible = false;
          this.phase = 'toDrop';
          const r = this.graph.route({ e: this.order.pickup.e, s: this.order.pickup.s, dir: this.order.pickup.dir }, this.order.dest);
          const k2 = this.graph.kerb(this.order.dest);
          this.order.destKerb = k2;
          this.setRoute(r, 0x39e2ae);
          this.setPin(k2.x, k2.z, 0x39e2ae);
          this.toast("Yo'lovchi o'tirdi — manzilga boring");
        } else this.pay();
      }
      return;
    }
    // driving to the passenger or to the destination
    const tr = this.track();
    // off the route for a moment (a wrong turn): plan again from here, at most every 3 s
    this.offT = tr.off > 22 ? this.offT + dt : 0;
    this.sinceReroute = (this.sinceReroute || 0) + dt;
    if (this.offT > 1.2 && this.sinceReroute > 3) { this.offT = 0; this.sinceReroute = 0; this.reroute(); return; }
    this.updateRibbon();
    this.city.taxiRoute.from = this.prog;
    const k = this.phase === 'toPickup' ? this.order.pickKerb : this.order.destKerb;
    const at = this.atKerb(k);
    const what = this.phase === 'toPickup' ? `Yo'lovchini olish: ${this.order.pickName.title}` : `Manzil: ${this.order.destName.title}`;
    let help = `${km(Math.max(0, tr.left))} · ${this.nextTurn()}`;
    if (tr.left < 60 || at.near) help = at.near && !at.sideOk ? "Yo'lovchi ko'chaning narigi tomonida — o'sha tomonda to'xtang" : at.near ? (at.stopped ? 'To\'xtadingiz…' : 'Belgi yonida to\'xtang') : `${Math.round(tr.left)} m · belgi yonida to'xtang`;
    this.say(what, help);
    this.el.turn.textContent = this.phase === 'toDrop' ? `Narx: ${money(this.order.fare)}` : `Smena: ${this.trips} ta safar`;
    if (at.near && at.stopped && at.sideOk) {
      this.anim = 0;
      if (this.phase === 'toPickup') this.phase = 'boarding';
      else { this.phase = 'alighting'; this.ribbon.visible = false; this.city.taxiRoute = null; }
    }
    // the passenger hails as you get close
    if (this.phase === 'toPickup' && this.pax.visible) {
      const near = Math.hypot(s.x - k.x, s.z - k.z) < 60;
      this.pax.userData.arms[1].rotation.z = near ? 2.6 : 0;
      this.pax.userData.arms[1].position.y = near ? 1.45 : 1.08;
    }
  }

  pay() {
    if (this.order.paid) return;
    this.order.paid = true;
    const bal = this.balance + this.order.fare;
    storageSet(KEY_BAL, bal);
    this.trips++;
    storageSet(KEY_TRIPS, this.trips);
    this.el.wallet.textContent = money(bal);
    this.pax.visible = false;
    this.pin.group.visible = false;
    this.ribbon.visible = false;
    this.city.taxiTarget = null; this.city.taxiRoute = null;
    this.say('Safar tugadi', `+${money(this.order.fare)} · ${this.order.destName.title}`);
    this.toast(`+${money(this.order.fare)}`);
    this.lastTrip = { ...this.order, reroutes: this.reroutes };
    this.order = null;
    this.phase = 'paid';
    this.timer = 1.5;     // the next order comes straight away
  }

  // ---------------------------------------------------------------- search (streets, mahallas, stops, metro, landmarks)
  find(q, limit = 12) {
    if (!this.search || !q || q.length < 2) return [];
    const norm = (t) => t.toLowerCase().replace(/[ʻʼ‘’`']/g, "'").replace(/o'/g, 'o').replace(/g'/g, 'g');
    const nq = norm(q);
    const s = this.city.state;
    const out = [];
    for (const e of this.search) {
      const n = norm(e[1]);
      const i = n.indexOf(nq);
      if (i < 0) continue;
      out.push({ e, score: (i === 0 ? 0 : 1) + Math.hypot(e[2] - s.x, e[3] - s.z) / 20000 + (e[0] === "ko'cha" ? 0.1 : 0) });
    }
    out.sort((a, b) => a.score - b.score);
    return out.slice(0, limit).map((o) => o.e);
  }

  // drive to a search result (outside an order): highlight it and route to the nearest legal stop
  navigateTo(entry) {
    if (!this.graph) return false;
    if (this.phase && this.phase !== 'search' && this.phase !== 'offer' && this.phase !== 'paid' && this.phase !== 'nav') { this.toast('Avval buyurtmani tugating'); return false; }
    const stop = this.stopNear(entry[2], entry[3]) || this.graph.nearest(entry[2], entry[3]);
    const from = this.carSnap();
    if (!stop || !from) return false;
    const best = this.routeTo(from, { e: stop.e, s: stop.s ?? 0 });
    if (!best) return false;
    this.el.offer.hidden = true;
    this.ensure3D();
    if (!this.active) {       // plain TOSHKENT SHAHAR: navigation without a shift
      this.active = true; this.def = null;
      this.el.panel.hidden = false; this.el.cls.textContent = 'NAVIGATSIYA'; this.el.turn.textContent = '';
    }
    this.phase = 'nav';
    this.order = { dest: { e: stop.e, s: stop.s, dir: best.dir }, destName: { title: entry[1], sub: entry[4] || '' }, fare: 0, nav: true };
    this.order.destKerb = this.graph.kerb(this.order.dest);
    this.setRoute(best.r, 0x4fc3ff);
    this.setPin(entry[2], entry[3], 0x4fc3ff);
    return true;
  }

  updateNav(dt) {
    if (this.phase !== 'nav') return false;
    const tr = this.track();
    this.offT = tr.off > 22 ? this.offT + dt : 0;
    if (this.offT > 1.2) {
      this.offT = 0;
      const from = this.carSnap(); const r = from && this.graph.route(from, this.order.dest);
      if (r) { this.setRoute(r, 0x4fc3ff); this.toast('Marshrut qayta hisoblandi'); }
    }
    this.updateRibbon();
    if (this.city.taxiRoute) this.city.taxiRoute.from = this.prog;
    this.say(this.order.destName.title, tr.left < 25 ? 'Yetib keldingiz' : `${km(tr.left)} · ${this.nextTurn()}`);
    if (tr.left < 25 && Math.abs(this.city.state.v) < 1) { this.clearNav(); this.toast('Yetib keldingiz'); }
    return true;
  }

  clearNav() {
    this.phase = this.active && this.def ? 'search' : null;
    this.timer = 2;
    this.order = null;
    if (this.pin) { this.pin.group.visible = false; this.ribbon.visible = false; }
    this.city.taxiTarget = null; this.city.taxiRoute = null;
    if (!this.def) { this.active = false; this.el.panel.hidden = true; }
  }
}
