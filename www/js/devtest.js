// Test drives for development (loaded only with ?test in the URL): drives the car along a navigation
// route to a search result, faster than real time, with the HUD off, and reports what went wrong:
// collisions (with what), time stuck, samples off the drawn carriageway, cells still loading, districts crossed.
window.__testDrive = async (fromName, toName, { maxV = 14, budget = 900, shots = null, realtime = false } = {}) => {
  const S = window.__sr3d, T = S.taxi; await T.ensureData();
  const find = (q) => T.search.find((e) => e[1] === q) || T.find(q)[0];
  const A = find(fromName), B = find(toName);
  if (!A || !B) return { err: 'not found', A: !!A, B: !!B };
  const st0 = T.stopNear(A[2], A[3]); const p0 = T.graph.pointAt(st0.e, st0.s);
  await S.teleport(p0.x, p0.z, Math.atan2(-p0.ux, -p0.uz));
  if (!S.G.hudOff) S.toggleHud(true);
  if (!T.navigateTo(B)) return { err: 'no route' };
  const c = S.city, s = c.state, inp = c.d.input; c.hitCount = {}; const hitLog = [];
  const out = { from: `${A[1]} (${A[4]})`, to: `${B[1]} (${B[4]})`, km: +(T.route.length / 1000).toFixed(2), offRoad: [], samples: 0, stuck: 0, maxPending: 0, districts: new Set() };
  let simT = 0, stuckT = 0, rev = 0, lastHit = null, nextShot = shots ? shots[0] : Infinity, shotI = 0;
  window.__drivePos = [];
  while (T.phase === 'nav' && simT < budget) {
    const r = T.route, P = r.pts, C = r.cum, j = T.prog;
    const here = C[j] + (C[j + 1] - C[j]) * (T.progT || 0), left = r.length - here;
    const look = Math.max(4, Math.min(16, Math.abs(s.v) * 1.1 + 3));
    let tgt = P[P.length - 1];
    for (let k = j + 1; k < P.length; k++) if (C[k] - here > look) { tgt = P[k]; break; }
    // keep to the right-hand lane like a driver: aim at the lane centre, not the road's centre line
    const ne = T.graph.nearest(tgt[0], tgt[1]), E = ne ? T.graph.edges[ne.e] : null;
    if (E && left > 30) {
      const k2 = Math.min(P.length - 1, j + 1), ux = P[k2][0] - P[j][0], uz = P[k2][1] - P[j][1], ul = Math.hypot(ux, uz) || 1;
      const off = Math.min(1.6, E.oneway ? Math.max(0, E.width / 2 - 1.8) : Math.max(1.3, E.width / 4));
      tgt = [tgt[0] - (uz / ul) * off, tgt[1] + (ux / ul) * off];
    }
    const fx = -Math.sin(s.yaw), fz = -Math.cos(s.yaw), dx = tgt[0] - s.x, dz = tgt[1] - s.z;
    const ang = Math.atan2(fx * dz - fz * dx, fx * dx + fz * dz);
    inp.up = inp.down = inp.left = inp.right = false;
    if (rev > 0) { rev -= 0.13; inp.down = true; if (ang < 0) inp.right = true; else inp.left = true; }
    else {
      if (ang > 0.05) inp.right = true; else if (ang < -0.05) inp.left = true;
      let want = Math.abs(ang) > 0.45 ? 4 : maxV;
      // follow the car ahead in the lane
      for (const o of c.cars) {
        const rx = o.x - s.x, rz = o.z - s.z, ahead = rx * fx + rz * fz, lat = Math.abs(rx * fz - rz * fx);
        if (ahead > 0 && ahead < 22 && lat < 2.2) want = Math.min(want, Math.max(0, (ahead - 8) * 0.7));
      }
      if (left < 45) want = Math.min(want, Math.max(0, (left - 2) * 0.32));
      if (s.v < want - 0.4) inp.up = true; else if (s.v > want + 0.8 && s.v > 0.3) inp.down = true;
      // waiting in a queue or at a light is not being stuck
      const queued = c.cars.some((o) => Math.hypot(o.x - s.x, o.z - s.z) < 13);
      stuckT = Math.abs(s.v) < 0.6 && left > 12 && !queued ? stuckT + 0.13 : 0;
      if (stuckT > 2) { stuckT = 0; rev = 2.4; out.stuck++; }
    }
    // realtime: the game's own frame loop drives (for recording); otherwise 4 fixed steps per decision
    if (realtime) { const t1 = performance.now(); await new Promise((r) => setTimeout(r, 130)); simT += (performance.now() - t1) / 1000; }
    else { S.step(4, 1 / 30); simT += 4 / 30; }
    if (c.lastHit && c.lastHit !== lastHit) {
      lastHit = c.lastHit;
      if (lastHit.what === 'car' && (out.carHits || (out.carHits = [])).length < 15) {
        let best = null, bd = 1e9;
        for (const o of c.cars) { const d2 = (o.x - s.x) ** 2 + (o.z - s.z) ** 2; if (d2 < bd) { bd = d2; best = o; } }
        if (best) {
          let dy = best.yaw - s.yaw; while (dy > Math.PI) dy -= 2 * Math.PI; while (dy < -Math.PI) dy += 2 * Math.PI;
          const rx = best.x - s.x, rz = best.z - s.z;
          out.carHits.push({ v: +s.v.toFixed(1), other: +best.speed.toFixed(1), headDiffDeg: Math.round(dy * 57.3), ahead: +(rx * -Math.sin(s.yaw) + rz * -Math.cos(s.yaw)).toFixed(1), lat: +(rx * -Math.cos(s.yaw) + rz * Math.sin(s.yaw)).toFixed(1), x: Math.round(s.x), z: Math.round(s.z) });
        }
      }
      if (lastHit.what !== 'car' && hitLog.length < 12) {
        const n = T.graph.nearest(lastHit.x, lastHit.z), E = T.graph.edges[n.e];
        hitLog.push([lastHit.what, Math.round(lastHit.x), Math.round(lastHit.z), +n.d.toFixed(1), E.width, E.name]);
      }
    }
    if (Math.round(simT * 7.5) % 15 === 0) {
      out.samples++;
      let on = false;
      for (let ix = -1; ix <= 1 && !on; ix++) for (let iz = -1; iz <= 1 && !on; iz++) {
        const cell = c.cells.get(`${Math.floor(s.x / 500) + ix}_${Math.floor(s.z / 500) + iz}`);
        if (cell && cell.onRoad && cell.onRoad(s.x, s.z, 1.0)) on = true;
      }
      if (!on) { out.offRoadCount = (out.offRoadCount || 0) + 1; if (out.offRoad.length < 10) out.offRoad.push([Math.round(s.x), Math.round(s.z)]); }
      out.maxPending = Math.max(out.maxPending, c.pending.size);
      const pl = T.placeName(s.x, s.z, null); if (pl && pl[4]) out.districts.add(pl[4]);
      window.__drivePos.push([Math.round(s.x), Math.round(s.z)]);
      await new Promise((r2) => setTimeout(r2, 0));
    }
    // pause for a screenshot: the caller takes it and clears __shotReady
    if (simT >= nextShot) {
      shotI++; nextShot = shots && shotI < shots.length ? shots[shotI] : Infinity;
      inp.up = inp.left = inp.right = false;
      window.__shotReady = { x: Math.round(s.x), z: Math.round(s.z), t: Math.round(simT), street: c.streetName(s.x, s.z) };
      while (window.__shotReady) await new Promise((r2) => setTimeout(r2, 100));
    }
  }
  out.arrived = T.phase !== 'nav';
  out.simMin = +(simT / 60).toFixed(1);
  out.districts = [...out.districts];
  out.hits = c.hitCount; out.hitLog = hitLog;
  inp.up = inp.down = inp.left = inp.right = false;
  window.__driveResult = out;
  return out;
};

// Matched views: put the camera where a reference photo was taken (lat/lon from its EXIF, compass heading,
// eye height) with the game paused, so the same street can be compared side by side.
window.__viewAt = async (lat, lon, heading, { eye = 1.6, fov = 55, pitch = 0 } = {}) => {
  const S = window.__sr3d;
  const x = 83688.15960 * lon - 21.21882 * lat - 5797037.69, z = -1.1002137 * lon - 111050.703 * lat + 4587580.68;
  const yaw = -heading * Math.PI / 180;
  if (S.G.hudOff !== true) S.toggleHud(true);
  await S.teleport(x + Math.sin(yaw) * 60, z + Math.cos(yaw) * 60, yaw);     // car parked behind the camera, out of view
  await new Promise((r) => setTimeout(r, 600));
  S.G.mode = 'debug';
  const cam = S.camera;
  cam.fov = fov; cam.updateProjectionMatrix();
  cam.position.set(x, eye, z);
  cam.up.set(0, 1, 0);
  cam.lookAt(x - Math.sin(yaw) * 50, eye + Math.tan(pitch * Math.PI / 180) * 50, z - Math.cos(yaw) * 50);
  cam.updateMatrixWorld();
  for (let i = 0; i < 3; i++) { S.composer.render(); await new Promise((r) => setTimeout(r, 50)); }
  return { x: Math.round(x), z: Math.round(z) };
};

// A whole taxi trip through the normal game flow: open TOSHKENT TAKSI, pick a car, start the shift, accept
// the first order with Enter, drive to the passenger's kerb, wait for boarding, make a deliberate wrong
// turn on the way to the destination, follow the recalculated route, stop at the kerb and get paid.
window.__testShift = async ({ car = 'gentra', budget = 2400, wrongTurnAfter = 15, force = null } = {}) => {
  const S = window.__sr3d, T = S.taxi;
  T.forceOrder = force;
  window.__sr3dNoAutoPause = true;
  if (S.G.hudOff) S.toggleHud(false);
  S.toMenu(); await new Promise((r) => setTimeout(r, 400));
  document.querySelector('[data-action=taxi]').click(); await new Promise((r) => setTimeout(r, 300));
  document.querySelector(`[data-car=${car}]`).click();
  document.querySelector('[data-action=taxiStart]').click();
  for (let i = 0; i < 120 && T.phase !== 'offer'; i++) await new Promise((r) => setTimeout(r, 250));
  const o = T.order;
  const log = { car, order: { kind: o.kind, from: o.pickName.title, to: o.destName.title, km: +(o.dist / 1000).toFixed(2), fare: o.fare, eta: o.eta, toPassengerM: Math.round(o.pickRoute.length) }, phases: [], wrongTurn: null, stuck: 0 };
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Enter', key: 'Enter' }));
  await new Promise((r) => setTimeout(r, 200));
  const c = S.city, s = c.state, inp = c.d.input;
  T.lastTrip = null;
  let simT = 0, rev = 0, stuckT = 0, detourAt = null, lastPhase = '', detour = null, kturn = null;
  const hitsNow = () => Object.values(c.hitCount || {}).reduce((a, b) => a + b, 0);
  // a real wrong turn: at the next junction ahead take a street the route does not use, and keep
  // driving along it until the game plans again
  const G = T.graph, nodeAt = new Map();
  for (let n = 0; n < G.nx.length; n++) nodeAt.set(Math.round(G.nx[n]) + ',' + Math.round(G.nz[n]), n);
  const planDetour = (r, here) => {
    const P = r.pts, C = r.cum;
    for (let k = 1; k < P.length - 1; k++) {
      if (C[k] - here < 25) continue;
      if (C[k] - here > 600) break;
      const n = nodeAt.get(Math.round(P[k][0]) + ',' + Math.round(P[k][1]));
      if (n === undefined || G.out[n].length < 3) continue;
      const hx = P[k + 1][0] - P[k][0], hz = P[k + 1][1] - P[k][1], inx = P[k][0] - P[k - 1][0], inz = P[k][1] - P[k - 1][1];
      for (const [ej, d2] of G.out[n]) {
        const ep = d2 > 0 ? G.edges[ej].pts : G.edges[ej].pts.slice().reverse();
        if (ep.length < 2 || G.edges[ej].len < 30 || G.edges[ej].kind > 1) continue;
        const bx = ep[1][0] - ep[0][0], bz = ep[1][1] - ep[0][1], lb = Math.hypot(bx, bz) || 1;
        const offRoute = (bx * hx + bz * hz) / lb / (Math.hypot(hx, hz) || 1) < 0.5;
        const notBack = (bx * inx + bz * inz) / lb / (Math.hypot(inx, inz) || 1) > -0.5;
        if (offRoute && notBack) return { pts: P.slice(0, k + 1).concat(ep.slice(1)), at: k };
      }
    }
    return null;
  };
  while (simT < budget) {
    if (T.phase !== lastPhase) {
      log.phases.push([T.phase, Math.round(simT)]); lastPhase = T.phase;
      if (T.phase === 'toDrop' && T.route) log.dropStart = { car: [Math.round(s.x), Math.round(s.z), +s.yaw.toFixed(2)], fwd: [+(-Math.sin(s.yaw)).toFixed(2), +(-Math.cos(s.yaw)).toFixed(2)], pts: T.route.pts.slice(0, 8).map((p) => [Math.round(p[0]), Math.round(p[1])]) };
    }
    if (T.phase === 'boarding' && !log.pickupKerb) {
      const k = T.order.pickKerb, side = (s.x - k.cx) * k.side[0] + (s.z - k.cz) * k.side[1];
      log.pickupKerb = { distToPassengerM: +Math.hypot(s.x - k.x, s.z - k.z).toFixed(1), onPassengerSide: side > -0.8 };
    }
    if (['paid', 'offer', 'search'].includes(T.phase) && log.phases.some((p) => p[0] === 'alighting')) break;
    if (T.route && (T.phase === 'toPickup' || T.phase === 'toDrop')) {
      if (T.phase === 'toDrop' && detourAt === null) detourAt = simT + wrongTurnAfter;
      const r = T.route, P = r.pts, C = r.cum, j = T.prog;
      const here = C[j] + (C[j + 1] - C[j]) * (T.progT || 0), left = r.length - here;
      let tgt = P[P.length - 1];
      const look = Math.max(4, Math.min(16, Math.abs(s.v) * 1.1 + 3));
      for (let k = j + 1; k < P.length; k++) if (C[k] - here > look) { tgt = P[k]; break; }
      const fx = -Math.sin(s.yaw), fz = -Math.cos(s.yaw), dx = tgt[0] - s.x, dz = tgt[1] - s.z;
      const ang = Math.atan2(fx * dz - fz * dx, fx * dx + fz * dz);
      const rAng = () => { const a = P[Math.min(P.length - 2, j)], b = P[Math.min(P.length - 1, j + 1)], rx = b[0] - a[0], rz = b[1] - a[1]; return Math.atan2(fx * rz - fz * rx, fx * rx + fz * rz); };
      inp.up = inp.down = inp.left = inp.right = false;
      if (T.phase === 'toDrop' && simT > detourAt && !log.wrongTurn) {
        detour = planDetour(r, here);
        log.wrongTurn = { atSimSec: Math.round(simT), routeKmBefore: +(r.length / 1000).toFixed(2), reroutesBefore: T.reroutes, junction: detour ? detour.pts[detour.at].map(Math.round) : null };
        if (detour) { detour.cum = [0]; for (let q = 1; q < detour.pts.length; q++) detour.cum.push(detour.cum[q - 1] + Math.hypot(detour.pts[q][0] - detour.pts[q - 1][0], detour.pts[q][1] - detour.pts[q - 1][1])); detour.until = simT + 60; }
      }
      if (detour && (T.reroutes > log.wrongTurn.reroutesBefore || simT > detour.until)) detour = null;
      if (detour) {
        // pursue the detour polyline (nearest point, then look ahead)
        const P2 = detour.pts, C2 = detour.cum; let bi = 0, bd = Infinity;
        for (let q = 0; q < P2.length; q++) { const dd = (P2[q][0] - s.x) ** 2 + (P2[q][1] - s.z) ** 2; if (dd < bd) { bd = dd; bi = q; } }
        let tg = P2[P2.length - 1]; for (let q = bi + 1; q < P2.length; q++) if (C2[q] - C2[bi] > 9) { tg = P2[q]; break; }
        const fx2 = -Math.sin(s.yaw), fz2 = -Math.cos(s.yaw), ddx = tg[0] - s.x, ddz = tg[1] - s.z;
        const a2 = Math.atan2(fx2 * ddz - fz2 * ddx, fx2 * ddx + fz2 * ddz);
        if (a2 > 0.05) inp.right = true; else if (a2 < -0.05) inp.left = true;
        const want2 = Math.abs(a2) > 0.45 ? 4 : 9;
        if (s.v < want2 - 0.4) inp.up = true; else if (s.v > want2 + 0.8) inp.down = true;
      } else if (rev > 0) { rev -= 0.13; inp.down = true; if (ang < 0) inp.right = true; else inp.left = true; }
      else if (kturn || (Math.abs(rAng()) > 1.9 && Math.abs(s.v) < 4 && left > 12 && (log.kturns || 0) < 25)) {
        // three-point turn on a narrow street: forward on full lock towards the route, back on the
        // opposite lock, until the car points along the route
        if (!kturn) { kturn = { fwd: true, t: 0, hits: hitsNow(), n: 0 }; log.kturns = (log.kturns || 0) + 1; (log.kturnAt = log.kturnAt || []).push([Math.round(simT), Math.round(s.x), Math.round(s.z), +rAng().toFixed(2)]); }
        kturn.t += 0.13;
        if (Math.abs(rAng()) < 0.6) kturn = null;
        else if (kturn.fwd) {
          if (ang > 0) inp.right = true; else inp.left = true;
          if (s.v < 2) inp.up = true;
          if (kturn.t > 2.6 || hitsNow() > kturn.hits) { kturn.fwd = false; kturn.t = 0; kturn.hits = hitsNow(); }
        } else {
          if (ang > 0) inp.left = true; else inp.right = true;
          if (s.v > -2) inp.down = true;
          if (kturn.t > 2.2 || hitsNow() > kturn.hits) { kturn.fwd = true; kturn.t = 0; kturn.hits = hitsNow(); if (++kturn.n > 6) kturn = null; }
        }
      }
      else {
        if (ang > 0.05) inp.right = true; else if (ang < -0.05) inp.left = true;
        let want = Math.abs(ang) > 0.45 ? 4 : 13;
        // like a driver: slow down before a sharp corner in the next 25 m, and keep it slow in a 3-5 m lane
        { let turn = 0; const h0 = Math.atan2(P[Math.min(P.length - 1, j + 1)][1] - P[j][1], P[Math.min(P.length - 1, j + 1)][0] - P[j][0]);
          for (let k = j + 1; k < P.length - 1 && C[k] - here < 25; k++) { let d = Math.atan2(P[k + 1][1] - P[k][1], P[k + 1][0] - P[k][0]) - h0; d = Math.atan2(Math.sin(d), Math.cos(d)); turn = Math.max(turn, Math.abs(d)); }
          if (turn > 1.2) want = Math.min(want, 3.2); else if (turn > 0.7) want = Math.min(want, 5.5);
          if (c.roadHere && c.roadHere.width < 5.2) want = Math.min(want, 7); }
        if (left < 45) want = Math.min(want, Math.max(0, (left - 2) * 0.32));
        for (const o2 of c.cars) { const rx = o2.x - s.x, rz = o2.z - s.z, ah = rx * fx + rz * fz, lat = Math.abs(rx * fz - rz * fx); if (ah > 0 && ah < 22 && lat < 2.2) want = Math.min(want, Math.max(0, (ah - 8) * 0.7)); }
        if (s.v < want - 0.4) inp.up = true; else if (s.v > want + 0.8 && s.v > 0.3) inp.down = true;
        const queued = c.cars.some((o2) => Math.hypot(o2.x - s.x, o2.z - s.z) < 13);
        stuckT = Math.abs(s.v) < 0.6 && left > 12 && !queued ? stuckT + 0.13 : 0;
        if (stuckT > 2) { stuckT = 0; log.stuck++;
          // stuck again at the same place: back out further each time (a player would reverse out of a courtyard)
          const prevS = log.stuckAt && log.stuckAt[log.stuckAt.length - 1];
          const same = prevS && Math.hypot(prevS.x - s.x, prevS.z - s.z) < 10;
          rev = same ? Math.min(9, (prevS.rev || 2.4) + 2.4) : 2.4;
          (log.stuckAt = log.stuckAt || []).push({ t: Math.round(simT), x: Math.round(s.x), z: Math.round(s.z), phase: T.phase, ang: +ang.toFixed(2), hit: c.lastHit ? (c.lastHit.what || c.lastHit.kind || String(c.lastHit)) : null, road: c.roadHere ? [c.roadHere.kind, c.roadHere.width, c.roadHere.name] : null, left: Math.round(left), reroutes: T.reroutes, rev }); }
      }
      if (log.wrongTurn && !log.wrongTurn.routeKmAfter && T.reroutes > log.wrongTurn.reroutesBefore) log.wrongTurn.routeKmAfter = +(T.route.length / 1000).toFixed(2);
    } else { inp.up = inp.left = inp.right = false; inp.down = s.v > 0.5; }
    S.step(4, 1 / 30); simT += 4 / 30;
    if (Math.round(simT * 7.5) % 15 === 0) await new Promise((r) => setTimeout(r, 0));
  }
  inp.up = inp.down = inp.left = inp.right = false;
  log.simMin = +(simT / 60).toFixed(1);
  log.kturns = log.kturns || 0;
  log.paid = !!(T.lastTrip && T.lastTrip.paid) && log.phases.some((p) => p[0] === 'paid'); log.fare = T.lastTrip && T.lastTrip.fare; log.reroutes = T.lastTrip ? T.lastTrip.reroutes : T.reroutes;
  log.savedBalance = localStorage.getItem('sr3d_taxi_balance'); log.savedTrips = localStorage.getItem('sr3d_taxi_trips');
  log.nextOrderOffered = T.phase === 'offer' || T.phase === 'paid' || T.phase === 'search';
  window.__shiftResult = log; T.forceOrder = null;
  return log;
};

// Steering measurement with the player's own controls (input.left/right = the A/D keys or the touch
// buttons): cruise straight at `kmh`, hold D for `hold` seconds, release, and log yaw rate over time.
// Collisions are switched off for the test so a wall can't end it early.
window.__steerTest = async ({ kmh = 60, hold = 2, tap = false, fps = 60, car = null } = {}) => {
  const S = window.__sr3d, c = S.city, inp = c.d.input;
  if (S.G.mode !== 'city') S.startCity('osm');
  await new Promise((r) => setTimeout(r, 300));
  const s = c.state, coll = c.collide;
  c.collide = () => {};
  S.G.mode = 'debug';
  Object.assign(s, { x: 30000, z: 30000, yaw: 0, v: kmh / 3.6, latV: 0, r: 0, ax: 0, steer: 0, spin: 0 });
  const dt = 1 / fps, out = [];
  let t = 0, first = null, peak = 0, release = null, settle = null;
  inp.left = inp.right = inp.down = false; inp.up = false;
  // hold speed like a driver keeping the throttle steady
  const cruise = () => { inp.up = s.v < kmh / 3.6 - 0.2; };
  for (; t < 0.5; t += dt) { cruise(); S.G.mode = 'city'; c.update(dt); S.G.mode = 'debug'; }
  const t0 = t;
  for (; t < t0 + hold + 3; t += dt) {
    cruise();
    inp.right = t - t0 < (tap ? 0.12 : hold);
    S.G.mode = 'city'; c.update(dt); S.G.mode = 'debug';
    const yr = -s.r;                                        // + = to the right
    if (first === null && yr > 0.02) first = t - t0;
    peak = Math.max(peak, yr);
    if (!inp.right && release === null) release = t;
    if (release !== null && settle === null && Math.abs(yr) < 0.02) settle = t - release;
    if (Math.round((t - t0) * fps) % Math.max(1, Math.round(fps / 10)) === 0) out.push([+(t - t0).toFixed(2), +yr.toFixed(3), +s.steer.toFixed(3), +(s.v * 3.6).toFixed(0)]);
  }
  inp.left = inp.right = inp.up = false;
  c.collide = coll; S.G.mode = 'city';
  const v = kmh / 3.6;
  return { kmh, fps, tap, msToTurn: first === null ? null : Math.round(first * 1000), peakYawRate: +peak.toFixed(3), minRadiusM: peak > 0 ? Math.round(v / peak) : null, latG: +(v * peak / 9.81).toFixed(2), msToStraighten: settle === null ? null : Math.round(settle * 1000), trace: out };
};

// Follow a real bend with the keyboard only, like a player: W/S to hold `kmh`, and A/D pressed or released
// 20 times a second depending on whether the car is left or right of the lane line ahead. Reports how far
// the car strays from the lane (the real game loop is stepped, collisions on).
window.__bendTest = async ({ edge, from = 40, kmh = 60, legacy = false, record = false, reactMs = 50, driver = 'aim' } = {}) => {
  const S = window.__sr3d, T = S.taxi, c = S.city; await T.ensureData();
  const g = T.graph, E = g.edges[edge];
  const lane = (sx) => { const p = g.pointAt(edge, sx); const off = E.oneway ? Math.max(0, E.width / 2 - 1.8) : E.width / 4; return { x: p.x - p.uz * off, z: p.z + p.ux * off, ux: p.ux, uz: p.uz }; };
  // start inside the bend, on the lane line, pointing along it (the first metres of an OSM way can kink)
  const p0 = lane(from), p1 = lane(from + 6);
  await S.teleport(p0.x, p0.z, Math.atan2(-(p1.x - p0.x), -(p1.z - p0.z)));
  c.legacySteer = legacy === true; c.steerV2 = legacy === "v2";
  // handling only: no traffic in the way (it made runs depend on where cars happened to be)
  const traffic = c.updateTraffic; c.updateTraffic = () => {}; for (const car of c.cars) car.mesh.visible = false; c.cars.length = 0;
  const s = c.state; s.v = kmh / 3.6; c.hitCount = {};
  const keys = { up: false, left: false, right: false, down: false };
  const press = (code, on) => window.dispatchEvent(new KeyboardEvent(on ? 'keydown' : 'keyup', { code, key: code }));
  const set = (k, code, on) => { if (keys[k] !== on) { keys[k] = on; press(code, on); } };
  let maxErr = 0, sumErr = 0, n = 0, presses = 0, lastRight = false, lastLeft = false;
  const t0 = performance.now();
  while (true) {
    // nearest lane point and the lateral error; aim 12 m ahead
    let best = from, bd = 1e9;
    for (let sx = Math.max(0, from - 20); sx < Math.min(E.len, from + 120); sx += 1) { const q = lane(sx); const d2 = (q.x - s.x) ** 2 + (q.z - s.z) ** 2; if (d2 < bd) { bd = d2; best = sx; } }
    from = best;
    if (best > E.len - 30) break;
    const q = lane(best), err = (s.x - q.x) * -q.uz + (s.z - q.z) * q.ux;          // + = right of the lane line
    maxErr = Math.max(maxErr, Math.abs(err)); sumErr += err * err; n++;
    const a = lane(Math.min(E.len, best + 10 + s.v * 0.6));
    const fx = -Math.sin(s.yaw), fz = -Math.cos(s.yaw), dx = a.x - s.x, dz = a.z - s.z;
    const ang = Math.atan2(fx * dz - fz * dx, fx * dx + fz * dz);
    // a person decides every ~250 ms (reactMs) and holds the key until the next decision
    const decide = !window.__lastDecide || performance.now() - window.__lastDecide >= reactMs;
    if (decide) window.__lastDecide = performance.now();
    let kk = ang > 0.012 ? 1 : ang < -0.012 ? -1 : 0;
    if (driver === 'pursuit') {
      const Ld = Math.hypot(a.x - s.x, a.z - s.z), need = 2 * Math.sin(ang) / Ld, have = -s.r / Math.max(1, s.v), band = 0.0012, sn = Math.sign(need);
      if (Math.abs(need) < band) kk = Math.abs(have) > 2 * band ? -Math.sign(have) : 0;
      else if (Math.sign(have) !== sn || Math.abs(have) < Math.abs(need) - band) kk = sn; else kk = 0;
    }
    const right = decide ? kk > 0 : lastRight, left = decide ? kk < 0 : lastLeft;
    if (right && !lastRight) presses++; if (left && !lastLeft) presses++;
    lastRight = right; lastLeft = left;
    set('right', 'KeyD', right); set('left', 'KeyA', left);
    set('up', 'KeyW', s.v < kmh / 3.6 - 0.3); set('down', 'KeyS', s.v > kmh / 3.6 + 1.5);
    await new Promise((r) => setTimeout(r, 50));
    if (performance.now() - t0 > 40000) break;
  }
  for (const [k, code] of [['up', 'KeyW'], ['left', 'KeyA'], ['right', 'KeyD'], ['down', 'KeyS']]) set(k, code, false);
  c.legacySteer = false; c.steerV2 = false; c.updateTraffic = traffic;
  return { kmh, legacy, hits: { ...(c.hitCount || {}) }, maxErrM: +maxErr.toFixed(2), rmsErrM: +Math.sqrt(sumErr / Math.max(1, n)).toFixed(2), keyPresses: presses, seconds: +((performance.now() - t0) / 1000).toFixed(1) };
};

// Live (real-time game loop) steering probe with real key events on an open straight: cruise at `kmh`
// with W, then `pattern` = 'tap' (D for 120 ms), 'hold' (D for 2 s) or 'lane' (D 0.6 s, A 0.6 s);
// samples key state, virtual wheel, road-wheel angle, yaw rate and position every frame.
window.__liveSteer = async ({ kmh = 60, pattern = 'hold', legacy = false, x = 30000, z = 30000 } = {}) => {
  const S = window.__sr3d, c = S.city;
  await S.teleport(x, z, 0);
  const coll = c.collide; c.collide = () => {};
  c.legacySteer = legacy === true; c.steerV2 = legacy === "v2";
  const s = c.state; s.v = kmh / 3.6;
  const key = (code, on) => window.dispatchEvent(new KeyboardEvent(on ? 'keydown' : 'keyup', { code, key: code }));
  const log = []; let alive = true;
  const sample = () => { if (!alive) return; log.push([+(performance.now() / 1000).toFixed(3), c.d.input.right ? 1 : c.d.input.left ? -1 : 0, +(s.wheelU || 0).toFixed(2), +(-s.steer * 57.3).toFixed(2), +(-s.r).toFixed(3), +(s.v * 3.6).toFixed(0), Math.round(s.x * 10) / 10, Math.round(s.z * 10) / 10]); requestAnimationFrame(sample); };
  const cruise = setInterval(() => { const want = s.v < kmh / 3.6 - 0.3; if (want !== c.d.input.up) key('KeyW', want); }, 30);
  await new Promise((r) => setTimeout(r, 600));
  const t0 = performance.now() / 1000; sample();
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  if (pattern === 'tap') { key('KeyD', true); await wait(120); key('KeyD', false); await wait(1800); }
  else if (pattern === 'hold') { key('KeyD', true); await wait(2000); key('KeyD', false); await wait(1500); }
  else { key('KeyD', true); await wait(600); key('KeyD', false); key('KeyA', true); await wait(600); key('KeyA', false); await wait(1500); }
  alive = false; clearInterval(cruise); key('KeyW', false);
  c.collide = coll; c.legacySteer = false; c.steerV2 = false;
  const rows = log.map((r) => [+(r[0] - t0).toFixed(2), ...r.slice(1)]);
  const first = rows.find((r) => Math.abs(r[4]) > 0.02);
  const lat = rows.length ? Math.round(((rows[rows.length - 1][6] - rows[0][6]) * 1 + 0) * 10) / 10 : 0;
  return { kmh, pattern, legacy, frames: rows.length, msToHeadingChange: first ? Math.round(first[0] * 1000) : null, peakWheelDeg: Math.max(...rows.map((r) => Math.abs(r[3]))), peakYaw: Math.max(...rows.map((r) => Math.abs(r[4]))), lateralShiftM: lat, rows: rows.filter((_, i) => i % 6 === 0) };
};

// Longitudinal checks with real keys on an open straight: pull away (W), lift off, normal brake (S tapped
// to ~4 m/s² feel = held S), hard brake, stop and stay stopped, reverse only when S is held at a standstill.
window.__pedalTest = async () => {
  const S = window.__sr3d, c = S.city; await S.teleport(30000, 30000, 0);
  const coll = c.collide; c.collide = () => {};
  const s = c.state, key = (code, on) => window.dispatchEvent(new KeyboardEvent(on ? 'keydown' : 'keyup', { code, key: code }));
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const kmh = () => +(s.v * 3.6).toFixed(1), out = {};
  let t = performance.now();
  key('KeyW', true);
  while (s.v < 100 / 3.6 && performance.now() - t < 20000) await wait(20);
  out.zeroTo100s = +((performance.now() - t) / 1000).toFixed(2);
  key('KeyW', false);
  const v0 = kmh(); await wait(3000); out.liftOff3sFrom = [v0, kmh()];
  // hard brake from current speed to stop
  const vb = s.v, zb = s.z; t = performance.now(); key('KeyS', true);
  let minV = s.v; while (s.v > 0.05 && performance.now() - t < 10000) { await wait(16); minV = Math.min(minV, s.v); }
  key('KeyS', false);
  out.hardBrakeFromKmh = +(vb * 3.6).toFixed(0); out.hardBrakeM = +Math.abs(s.z - zb).toFixed(1); out.hardBrakeS = +((performance.now() - t) / 1000).toFixed(2);
  await wait(1500); out.afterStopKmh = kmh();             // must stay stopped (no creeping into reverse)
  key('KeyS', true); await wait(1500); out.reverseWhenHeldKmh = kmh(); key('KeyS', false); await wait(1500); out.reverseReleasedKmh = kmh();
  c.collide = coll;
  return out;
};

// The bend test without the browser's frame loop (works when the page is hidden): the game's city update is
// stepped at a fixed `fps` and a "driver" sets the same input flags the A/D/W/S keys set, deciding every
// `reactMs` like a person. Logs the path, the keys and the lane error.
window.__bendSim = ({ edge = 66172, from = 40, kmh = 60, legacy = false, reactMs = 250, fps = 60, traffic = false, driver = 'aim' } = {}) => {
  const S = window.__sr3d, T = S.taxi, c = S.city, g = T.graph, E = g.edges[edge], inp = c.d.input;
  const lane = (sx) => { const p = g.pointAt(edge, sx); const off = E.oneway ? Math.max(0, E.width / 2 - 1.8) : E.width / 4; return { x: p.x - p.uz * off, z: p.z + p.ux * off, ux: p.ux, uz: p.uz }; };
  const p0 = lane(from), p1 = lane(from + 6);
  const s = c.state;
  Object.assign(s, { x: p0.x, z: p0.z, yaw: Math.atan2(-(p1.x - p0.x), -(p1.z - p0.z)), v: kmh / 3.6, latV: 0, r: 0, ax: 0, steer: 0, wheelU: 0, spin: 0 });
  const trf = c.updateTraffic; if (!traffic) { c.updateTraffic = () => {}; for (const car of c.cars) car.mesh.visible = false; c.cars.length = 0; }
  c.legacySteer = legacy === true; c.steerV2 = legacy === "v2"; c.hitCount = {};
  const mode = S.G.mode; S.G.mode = 'city';
  const dt = 1 / fps, every = Math.max(1, Math.round(reactMs / 1000 * fps));
  let pos = from, maxErr = 0, sum = 0, n = 0, presses = 0, lastKey = 0, maxYaw = 0, frames = 0;
  const path = [];
  for (let i = 0; i < fps * 60; i++) {
    let best = pos, bd = 1e9;
    for (let sx = Math.max(0, pos - 10); sx < Math.min(E.len, pos + 60); sx += 0.5) { const q = lane(sx); const d2 = (q.x - s.x) ** 2 + (q.z - s.z) ** 2; if (d2 < bd) { bd = d2; best = sx; } }
    pos = best; if (pos > E.len - 30) break;
    const q = lane(pos), err = (s.x - q.x) * -q.uz + (s.z - q.z) * q.ux;
    maxErr = Math.max(maxErr, Math.abs(err)); sum += err * err; n++;
    if (i % every === 0) {
      const a = lane(Math.min(E.len, pos + 10 + s.v * 0.6));
      const fx = -Math.sin(s.yaw), fz = -Math.cos(s.yaw), dx = a.x - s.x, dz = a.z - s.z;
      const ang = Math.atan2(fx * dz - fz * dx, fx * dx + fz * dz);
      // 'aim': press towards the point ahead whenever it is off the nose (a twitchy driver);
      // 'pursuit': compare how much the car is turning with how much the road ahead needs, and press or
      // release the key accordingly (how people actually steer with a keyboard)
      let k;
      if (driver === 'pursuit') {
        const Ld = Math.hypot(a.x - s.x, a.z - s.z), need = 2 * Math.sin(ang) / Ld, have = -s.r / Math.max(1, s.v);
        const band = 0.0012, sn = Math.sign(need);
        if (Math.abs(need) < band) k = Math.abs(have) > 2 * band ? -Math.sign(have) : 0;
        else if (Math.sign(have) !== sn || Math.abs(have) < Math.abs(need) - band) k = sn;   // not turning enough
        else k = 0;                                                                        // let the wheel come back
      } else k = ang > 0.012 ? 1 : ang < -0.012 ? -1 : 0;
      if (k && k !== lastKey) presses++;
      lastKey = k; inp.right = k > 0; inp.left = k < 0;
    }
    inp.up = s.v < kmh / 3.6 - 0.3; inp.down = s.v > kmh / 3.6 + 1.5;
    c.update(dt); frames++;
    maxYaw = Math.max(maxYaw, Math.abs(s.r));
    if (i % Math.round(fps / 5) === 0) path.push([+(i / fps).toFixed(1), Math.round(s.x * 10) / 10, Math.round(s.z * 10) / 10, +err.toFixed(2), lastKey, +(-s.steer * 57.3).toFixed(1), +(-s.r).toFixed(3)]);
  }
  inp.left = inp.right = inp.up = inp.down = false;
  c.legacySteer = false; c.steerV2 = false; c.updateTraffic = trf; S.G.mode = mode;
  return { edge, kmh, legacy, fps, reactMs, seconds: +(frames / fps).toFixed(1), maxErrM: +maxErr.toFixed(2), rmsErrM: +Math.sqrt(sum / Math.max(1, n)).toFixed(2), keyChanges: presses, maxYawRate: +maxYaw.toFixed(2), hits: { ...(c.hitCount || {}) }, path };
};

// Records the game canvas with a caption, speed and the A/D keys drawn on, as WebM, and posts it to a
// receiver on this machine (http://127.0.0.1:8766/<name>) — used for the before/after clips.
window.__record = async (name, run, { caption = '', fps = 30, bps = 3_000_000 } = {}) => {
  const S = window.__sr3d, c = S.city, src = document.getElementById('game') || document.querySelector('canvas');
  const W = 960, H = Math.round(W * src.height / src.width);
  const out = document.createElement('canvas'); out.width = W; out.height = H;
  const g = out.getContext('2d');
  let alive = true;
  const draw = () => {
    if (!alive) return;
    g.drawImage(src, 0, 0, W, H);
    if (caption === null) { requestAnimationFrame(draw); return; }   // clean picture (HUD-off clips)
    const s = c.state, kmh = Math.round(Math.abs(s.v) * 3.6), inp = c.d.input;
    g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillRect(0, H - 64, W, 64); g.fillRect(0, 0, W, 36);
    g.fillStyle = '#fff'; g.font = 'bold 22px Arial'; g.fillText(caption, 14, 25);
    g.font = 'bold 40px Arial'; g.fillText(`${kmh} km/soat`, 14, H - 18);
    g.font = 'bold 26px Arial';
    g.fillStyle = inp.left ? '#ffd24a' : '#666'; g.fillText('A', W - 150, H - 22);
    g.fillStyle = inp.up ? '#ffd24a' : '#666'; g.fillText('W', W - 110, H - 22);
    g.fillStyle = inp.right ? '#ffd24a' : '#666'; g.fillText('D', W - 70, H - 22);
    g.fillStyle = '#fff'; g.font = '18px Arial'; g.fillText(`g'ildirak ${(-(s.steer || 0) * 57.3).toFixed(1)}°`, 260, H - 22);
    requestAnimationFrame(draw);
  };
  requestAnimationFrame(draw);
  const rec = new MediaRecorder(out.captureStream(fps), { mimeType: 'video/webm;codecs=vp9', videoBitsPerSecond: bps });
  const chunks = []; rec.ondataavailable = (e) => chunks.push(e.data);
  rec.start(500);
  const result = await run();
  rec.stop(); alive = false;
  await new Promise((r) => { rec.onstop = r; });
  const blob = new Blob(chunks, { type: 'video/webm' });
  const res = await fetch('http://127.0.0.1:8766/' + name, { method: 'POST', body: blob });
  return { name, bytes: blob.size, posted: res.ok, result };
};

// Car sheet: every Uzbek car model side by side in a small studio scene, from the rear three-quarter
// ('rear'), front ('front') or side ('side'), drawn on an overlay canvas for screenshots.
window.__carSheet = async (view = 'rear', { taxi = false, only = null, color = null } = {}) => {
  const THREE = await import('three');
  const { createUzCar } = await import('./uzcars.js');
  let cv = document.getElementById('carSheet');
  if (!cv) { cv = document.createElement('canvas'); cv.id = 'carSheet'; cv.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;z-index:99999;background:#cfd6dc'; document.body.appendChild(cv); }
  cv.hidden = false;
  const r = new THREE.WebGLRenderer({ canvas: cv, antialias: true });
  r.setSize(innerWidth, innerHeight, false); r.setPixelRatio(Math.min(2, devicePixelRatio));
  r.toneMapping = THREE.ACESFilmicToneMapping; r.outputColorSpace = THREE.SRGBColorSpace;
  const sc = new THREE.Scene(); sc.background = new THREE.Color(0xcfd6dc);
  sc.add(new THREE.HemisphereLight(0xffffff, 0x667766, 1.2));
  const sun = new THREE.DirectionalLight(0xffffff, 2.2); sun.position.set(-6, 10, 8); sc.add(sun);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshStandardMaterial({ color: 0x8a8f94, roughness: 0.9 })); ground.rotation.x = -Math.PI / 2; sc.add(ground);
  const types = only ? [only] : ['cobalt', 'gentra', 'nexia', 'spark', 'malibu', 'damas'];
  types.forEach((t, i) => {
    const c = createUzCar(t); c.setColor(); c.setTaxi(taxi);
    if (color !== null) { const m = new THREE.MeshStandardMaterial({ color, metalness: 0.45, roughness: 0.32 }); for (const o of c.bodyMeshes) o.material = m; }
    const g = c.mesh; g.position.x = (i - (types.length - 1) / 2) * 2.6;
    sc.add(g);
  });
  const cam = new THREE.PerspectiveCamera(only ? 40 : 30, innerWidth / innerHeight, 0.1, 200);
  const k = only ? 0.36 : 1;
  if (view === 'rear') cam.position.set(-9 * k, only ? 1.9 : 4, 24 * k); else if (view === 'front') cam.position.set(8 * k, only ? 1.5 : 2.4, -24 * k); else if (view === 'chase') cam.position.set(0, 2.1, 6.5); else cam.position.set(30 * k, 2, 0);
  cam.lookAt(0, 0.7, 0);
  r.render(sc, cam);
  return 'drawn';
};
window.__carSheetOff = () => { const cv = document.getElementById('carSheet'); if (cv) cv.hidden = true; };

// Handling sheet for the current car, stepped at a fixed frame rate on an open straight (collisions off):
// held A/D at 30/60/90 km/h, a lane change (D then A), braking hard while turning, coasting, braking
// from 100 km/h, reverse with S at a standstill, and which way the wheels roll in each case.
window.__handling = ({ fps = 60 } = {}) => {
  const S = window.__sr3d, c = S.city, inp = c.d.input, s = c.state, dt = 1 / fps;
  const coll = c.collide; c.collide = () => {};
  const trf = c.updateTraffic; c.updateTraffic = () => {};
  const mode = S.G.mode; S.G.mode = 'city';
  const P = c.state.chassis;
  const reset = (kmh) => { Object.assign(s, { x: 30000, z: 30000, yaw: 0, v: kmh / 3.6, latV: 0, r: 0, ax: 0, steer: 0, wheelU: 0, spin: 0 }); inp.left = inp.right = inp.up = inp.down = false; };
  const step = (sec, f) => { for (let t = 0; t < sec; t += dt) { if (f) f(t); c.update(dt); } };
  const cruise = (kmh) => { inp.up = s.v < kmh / 3.6 - 0.2; };
  const out = { car: c.state.def && c.state.def.id, fps };
  out.hold = {};
  for (const kmh of [30, 60, 90]) {
    reset(kmh); step(0.3, () => cruise(kmh));
    let peak = 0; step(2.5, () => { cruise(kmh); inp.right = true; peak = Math.max(peak, -s.r); });
    inp.right = false;
    out.hold[kmh] = { latG: +(s.v * peak / 9.81).toFixed(2), radiusM: Math.round(s.v / peak), kmhAfter: Math.round(s.v * 3.6) };
  }
  // lane change at 60: D 0.45 s, A 0.45 s, then hands off
  reset(60); step(0.3, () => cruise(60));
  const x0 = s.x, yaw0 = s.yaw;
  step(0.45, () => { cruise(60); inp.right = true; }); inp.right = false;
  step(0.45, () => { cruise(60); inp.left = true; }); inp.left = false;
  let maxHd = 0; step(2, () => { cruise(60); maxHd = Math.max(maxHd, Math.abs(s.yaw - yaw0)); });
  out.laneChange60 = { shiftM: +(s.x - x0).toFixed(2), headingAfterDeg: +((s.yaw - yaw0) * 57.3).toFixed(1), maxHeadingDegAfter: +(maxHd * 57.3).toFixed(1) };
  // braking in a turn from 90 and 60: hold D, then add S
  out.brakeInTurn = {};
  for (const kmh of [60, 90]) {
    reset(kmh); step(0.3, () => cruise(kmh));
    step(1.0, () => { cruise(kmh); inp.right = true; });
    let maxBeta = 0, wrongYaw = false; const zx = s.x, zz = s.z;
    step(6, () => { inp.up = false; inp.right = true; inp.down = s.v > 0.3; const b = Math.abs(Math.atan2(s.latV, Math.max(1, Math.abs(s.v)))); if (s.v > 3) maxBeta = Math.max(maxBeta, b); if (-s.r < -0.05) wrongYaw = true; });
    inp.right = inp.down = false;
    out.brakeInTurn[kmh] = { maxSlipDeg: +(maxBeta * 57.3).toFixed(1), spunTheOtherWay: wrongYaw, stoppedKmh: Math.round(s.v * 3.6) };
  }
  // coasting from 60 for 3 s, braking 100 -> 0 in a straight line
  reset(60); step(3); out.coast60to = Math.round(s.v * 3.6);
  reset(100); const zb = s.z; let tb = 0; step(8, (t) => { inp.down = s.v > 0.05; if (s.v > 0.05) tb = t; }); inp.down = false;
  out.brake100 = { m: +Math.abs(s.z - zb).toFixed(1), s: +tb.toFixed(2) };
  // reverse: S at a standstill; wheels must roll backwards
  reset(0); const pl = S.G.player || c.d.getPlayer(); const w = pl && pl.group;
  const tyres = []; if (w) w.traverse((o) => { if (o.rotation && o.rotation.order === 'YXZ' && o.isMesh) tyres.push(o); });
  const rx0 = tyres.length ? tyres[0].rotation.x : 0;
  step(2, () => { inp.down = true; }); inp.down = false;
  out.reverse = { kmh: +(s.v * 3.6).toFixed(1), wheelRoll: tyres.length ? Math.sign(tyres[0].rotation.x - rx0) : null };
  reset(0); const rx1 = tyres.length ? tyres[0].rotation.x : 0; step(1.5, () => { inp.up = true; }); inp.up = false;
  out.forwardWheelRoll = tyres.length ? Math.sign(tyres[0].rotation.x - rx1) : null;
  c.collide = coll; c.updateTraffic = trf; S.G.mode = mode; reset(0);
  return out;
};

// A contact sheet of all six everyday cars from the same angles (rear three-quarter, front three-quarter,
// straight behind at chase-camera height), drawn off screen and posted as a PNG to the local receiver.
window.__carGrid = async (name = 'cars-grid.png', { color = 0xf4f4f6 } = {}) => {
  const THREE = await import('three');
  const { createUzCar } = await import('./uzcars.js');
  const types = ['cobalt', 'gentra', 'nexia', 'spark', 'malibu', 'damas'];
  const views = [['rear', [-3.4, 1.7, 6.2]], ['front', [3.2, 1.4, -6.2]], ['chase', [0, 2.1, 6.8]]];
  const cw = 420, ch = 260;
  const r = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  r.setSize(cw, ch, false); r.setPixelRatio(1); r.toneMapping = THREE.ACESFilmicToneMapping; r.outputColorSpace = THREE.SRGBColorSpace;
  const grid = document.createElement('canvas'); grid.width = cw * views.length; grid.height = ch * types.length;
  const gg = grid.getContext('2d');
  for (let i = 0; i < types.length; i++) {
    const sc = new THREE.Scene(); sc.background = new THREE.Color(0xcfd6dc);
    sc.add(new THREE.HemisphereLight(0xffffff, 0x667766, 1.2));
    const sun = new THREE.DirectionalLight(0xffffff, 2.2); sun.position.set(-6, 10, 8); sc.add(sun);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshStandardMaterial({ color: 0x8a8f94, roughness: 0.9 })); ground.rotation.x = -Math.PI / 2; sc.add(ground);
    const c = createUzCar(types[i]); c.setColor();
    if (types[i] !== 'malibu') { const m = new THREE.MeshStandardMaterial({ color, metalness: 0.45, roughness: 0.32 }); for (const o of c.bodyMeshes) o.material = m; }
    sc.add(c.mesh);
    views.forEach(([, p], j) => {
      const cam = new THREE.PerspectiveCamera(40, cw / ch, 0.1, 100); cam.position.set(...p); cam.lookAt(0, 0.7, 0);
      r.render(sc, cam); gg.drawImage(r.domElement, j * cw, i * ch);
      gg.fillStyle = 'rgba(0,0,0,0.6)'; gg.fillRect(j * cw, i * ch, 150, 22); gg.fillStyle = '#fff'; gg.font = 'bold 14px Arial'; gg.fillText(types[i].toUpperCase() + ' · ' + views[j][0], j * cw + 6, i * ch + 16);
    });
  }
  const blob = await new Promise((res) => grid.toBlob(res, 'image/png'));
  const res = await fetch('http://127.0.0.1:8766/' + name, { method: 'POST', body: blob });
  r.dispose();
  return { posted: res.ok, bytes: blob.size };
};

// Can this car physically take the corner from edge `fromE` into edge `toE` (at their shared node)?
// Starts `back` metres before the node in the right-hand lane at `kmh`, tries turn-in points 0..9 m before
// the node with full lock, stepped at 60 fps with collisions on. Reports the best attempt.
window.__cornerTest = ({ fromE, toE, kmh = 8, back = 12, turnAts = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], simSec = 40 } = {}) => {
  const S = window.__sr3d, c = S.city, T = S.taxi, g = T.graph, inp = c.d.input, s = c.state;
  const A = g.edges[fromE], B = g.edges[toE];
  const node = [A.u, A.v].find((n) => n === B.u || n === B.v);
  const aDir = node === A.v ? 1 : -1, bDir = node === B.u ? 1 : -1;
  const sNode = aDir > 0 ? A.len : 0;
  const lane = (e, sx, dir) => { const E = g.edges[e], p = g.pointAt(e, sx), off = E.oneway || E.width < 5 ? 0 : Math.min(1.2, E.width / 4); return { x: p.x - p.uz * off * dir, z: p.z + p.ux * off * dir, ux: p.ux * dir, uz: p.uz * dir }; };
  const bEnd = lane(toE, bDir > 0 ? Math.min(B.len, 15) : Math.max(0, B.len - 15), bDir);
  const trf = c.updateTraffic; c.updateTraffic = () => {};
  const mode = S.G.mode; S.G.mode = 'city';
  const out = [];
  for (const car of c.cars) car.mesh.visible = false; c.cars.length = 0;
  for (const turnAt of turnAts) {
    const p0 = lane(fromE, sNode - aDir * back, aDir);
    Object.assign(s, { x: p0.x, z: p0.z, yaw: Math.atan2(-p0.ux, -p0.uz), v: kmh / 3.6, latV: 0, r: 0, ax: 0, steer: 0, wheelU: 0, spin: 0 });
    c.hitCount = {};
    const np = g.pointAt(fromE, sNode);
    let best = 1e9, hits = 0, turning = false;
    for (let i = 0; i < 60 * simSec; i++) {
      const dn = Math.hypot(s.x - np.x, s.z - np.z);
      if (!turning && dn < turnAt + 0.5) turning = true;
      // after the turn, steer toward the far lane point
      const fx = -Math.sin(s.yaw), fz = -Math.cos(s.yaw), dx = bEnd.x - s.x, dz = bEnd.z - s.z;
      const ang = Math.atan2(fx * dz - fz * dx, fx * dx + fz * dz);
      inp.right = turning && ang > 0.05; inp.left = turning && ang < -0.05;
      inp.up = s.v < kmh / 3.6 - 0.2; inp.down = false;
      c.update(1 / 60);
      best = Math.min(best, Math.hypot(bEnd.x - s.x, bEnd.z - s.z));
      if (best < 2.5) break;
    }
    hits = Object.values(c.hitCount || {}).reduce((a, b) => a + b, 0);
    out.push({ turnAt, reached: best < 2.5, closestM: +best.toFixed(1), hits });
  }
  inp.left = inp.right = inp.up = false; c.updateTraffic = trf; S.G.mode = mode;
  return { fromE, toE, widths: [A.width, B.width], kmh, car: s.def.id, attempts: out, ok: out.some((o) => o.reached && o.hits === 0) };
};

// Same daylight views (position, heading, driver's eye 1.25 m, FOV 55), HUD off, posted as JPEGs: for before/after.
window.__shotViews = async (prefix) => {
  const S = window.__sr3d, T = S.taxi; await T.ensureData();
  const a=83688.15960,b=-21.21882,c=-5797037.69,d=-1.1002137,e=-111050.703,f=4587580.68;
  const ll = (x, z) => { const X=x-c, Z=z-f, det=a*e-b*d; return [(a*Z-d*X)/det, (e*X-b*Z)/det]; };
  const xz = (lat, lon) => [a*lon + b*lat + c, d*lon + e*lat + f];
  const head = (lat, lon, tx, tz) => { const [x, z] = xz(lat, lon); return Math.atan2(tx - x, -(tz - z)) * 180 / Math.PI; };
  const serg = T.search.find((q) => q[0] === 'mahalla' && /Sergeli/i.test(q[4] || ''));
  const sergStop = T.stopNear(serg[2], serg[3], true), sp = T.graph.pointAt(sergStop.e, sergStop.s), [sLat, sLon] = ll(sp.x, sp.z);
  const ork = T.graph.nearest(-2774, 1824), op = T.graph.pointAt(ork.e, ork.s), [oLat, oLon] = ll(op.x, op.z);
  const views = [
    ['spawn', 41.28602, 69.149564, 10.6],
    ['amir-temur-xiyoboni', 41.311897, 69.278703, 130],
    ['kuranti', 41.310097, 69.279908, 171.3],
    ['tinchlik-metro', 41.332279, 69.219193, head(41.332279, 69.219193, -5034, -2409)],
    ['chorsu', 41.326197, 69.235164, head(41.326197, 69.235164, -3609, -1802)],
    ['orikzor-kochasi', oLat, oLon, Math.atan2(op.ux, -op.uz) * 180 / Math.PI],
    ['sergeli-mahalla', sLat, sLon, Math.atan2(sp.ux, -sp.uz) * 180 / Math.PI],
  ];
  const out = [];
  for (const [name, lat, lon, hd] of views) {
    await window.__viewAt(lat, lon, hd, { eye: 1.25, fov: 55 });
    await new Promise((r) => setTimeout(r, 1800));
    S.composer.render();
    const url = (document.getElementById('game') || document.querySelector('canvas')).toDataURL('image/jpeg', 0.86);
    const blob = await (await fetch(url)).blob();
    const res = await fetch(`http://127.0.0.1:8766/${prefix}-${name}.jpg`, { method: 'POST', body: blob });
    out.push([name, +lat.toFixed(6), +lon.toFixed(6), Math.round(hd), res.ok]);
  }
  S.G.mode = 'city';
  return out;
};

// Survey of square corners between narrow lanes: for each car, can it take the corner slowly without
// touching a wall (__cornerTest)? Used to set each car's limit for the taxi pickup filter.
window.__cornerSurvey = async ({ cars = ['spark', 'cobalt', 'damas'], n = 30, seed = 1 } = {}) => {
  const S = window.__sr3d, T = S.taxi; await T.ensureData();
  const g = T.graph, E = g.edges, list = [];
  let r = seed; const rnd = () => ((r = (r * 16807) % 2147483647) / 2147483647);
  const head = (ei, dir, out) => { const p = E[ei].pts, a = out ? (dir > 0 ? p[p.length - 2] : p[1]) : (dir > 0 ? p[0] : p[p.length - 1]), b = out ? (dir > 0 ? p[p.length - 1] : p[0]) : (dir > 0 ? p[1] : p[p.length - 2]); return [b[0] - a[0], b[1] - a[1]]; };
  for (let tries = 0; tries < 200000 && list.length < n; tries++) {
    const A = E[Math.floor(rnd() * E.length)]; if (!A || A.width >= 4.5 || A.len < 14) continue;
    for (const [ej, d2] of g.out[A.v] || []) {
      const B = E[ej]; if (ej === A.i || B.len < 16 || Math.min(A.width, B.width) >= 4.5) continue;
      const [ax, az] = head(A.i, 1, true), [bx, bz] = head(ej, d2, false);
      const ang = Math.atan2(ax * bz - az * bx, ax * bx + az * bz);
      if (Math.abs(ang) < 1.15 || Math.abs(ang) > 2.2) continue;
      list.push({ fromE: A.i, toE: ej, w: [A.width, B.width], ang: +ang.toFixed(2) }); break;
    }
  }
  const out = [];
  for (const car of cars) {
    S.toMenu(); await new Promise((q) => setTimeout(q, 500));
    document.querySelector('[data-action=taxi]').click(); await new Promise((q) => setTimeout(q, 300));
    document.querySelector(`[data-car=${car}]`).click(); document.querySelector('[data-action=taxiStart]').click();
    await new Promise((q) => setTimeout(q, 2500));
    for (const k of list) {
      const p = g.pointAt(k.fromE, Math.max(0, E[k.fromE].len - 10)); await S.teleport(p.x, p.z, 0); await new Promise((q) => setTimeout(q, 900));
      const res = window.__cornerTest({ fromE: k.fromE, toE: k.toE, kmh: 6, turnAts: [1, 3, 5], simSec: 22 });
      out.push({ car, ...k, ok: res.ok });
      window.__surveyProgress = out.length;
    }
  }
  window.__surveyOut = out;
  return out;
};

// One car from a chosen camera angle (azimuth deg: 0 = straight behind, 90 = right side, 180 = front;
// elevation m), daylight studio, posted as PNG: to match a reference photo's angle.
window.__carShot = async (type, { az = 35, el = 1.3, dist = 6.5, color = 0xf2f3f4, name = null, w = 640, h = 420, fov = 40 } = {}) => {
  const THREE = await import('three');
  const { createUzCar } = await import('./uzcars.js');
  const r = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  r.setSize(w, h, false); r.toneMapping = THREE.ACESFilmicToneMapping; r.outputColorSpace = THREE.SRGBColorSpace;
  const sc = new THREE.Scene(); sc.background = new THREE.Color(0xd4dbe1);
  sc.add(new THREE.HemisphereLight(0xffffff, 0x667766, 1.2));
  const sun = new THREE.DirectionalLight(0xffffff, 2.2); sun.position.set(-6, 10, 8); sc.add(sun);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshStandardMaterial({ color: 0x8a8f94, roughness: 0.9 })); ground.rotation.x = -Math.PI / 2; sc.add(ground);
  const c = createUzCar(type); c.setColor();
  const m = new THREE.MeshStandardMaterial({ color, metalness: 0.45, roughness: 0.32 }); for (const o of c.bodyMeshes) o.material = m;
  sc.add(c.mesh);
  const a = az * Math.PI / 180, cam = new THREE.PerspectiveCamera(fov, w / h, 0.1, 100);
  cam.position.set(Math.sin(a) * dist, el, Math.cos(a) * dist); cam.lookAt(0, 0.65, 0);
  r.render(sc, cam);
  const blob = await new Promise((res) => r.domElement.toBlob(res, 'image/png'));
  const res = await fetch('http://127.0.0.1:8766/' + (name || `car-${type}-${az}.png`), { method: 'POST', body: blob });
  r.dispose();
  return res.ok;
};

// Drive up to and across the first signalled junction on the route from `fromName` to `toName` with real
// key events (W/A/S/D, like a player), at `kmh`, obeying the light for this approach. Logs the light at
// each moment, the stop, the crossing, and every other car inside the junction while the player crosses.
window.__junctionRun = async (fromName, toName, { kmh = 50, after = 150, maxSec = 120 } = {}) => {
  const S = window.__sr3d, T = S.taxi, c = S.city, s = c.state; await T.ensureData();
  const find = (q) => T.search.find((e) => e[1] === q) || T.find(q)[0];
  const A = find(fromName), B = find(toName);
  const st0 = T.stopNear(A[2], A[3]); const p0 = T.graph.pointAt(st0.e, st0.s);
  await S.teleport(p0.x, p0.z, Math.atan2(-p0.ux, -p0.uz)); await new Promise((r) => setTimeout(r, 2500));
  if (!T.navigateTo(B)) return { err: 'no route' };
  const P = T.route.pts, C = T.route.cum;
  // first signal within 12 m of the route, at least `after` m along it
  let sig = null, sigAt = 0;
  for (let j = 0; j < P.length && !sig; j++) { if (C[j] < after) continue; for (const sg of c.signalList) if (Math.hypot(sg.x - P[j][0], sg.z - P[j][1]) < 12) { sig = sg; sigAt = C[j]; break; } }
  if (!sig) return { err: 'no signal on route' };
  const key = (code, on) => window.dispatchEvent(new KeyboardEvent(on ? 'keydown' : 'keyup', { code, key: code }));
  const held = {}; const set = (code, on) => { if (!!held[code] !== on) { held[code] = on; key(code, on); } };
  const log = { signal: [Math.round(sig.x), Math.round(sig.z)], signalAtRouteM: Math.round(sigAt), events: [], crossTraffic: [] };
  // the approach direction just before the signal decides which half of the cycle is ours (as for traffic)
  let jj = 1; while (jj < P.length - 1 && C[jj] < sigAt - 20) jj++;
  const adx = P[jj][0] - P[jj - 1][0], adz = P[jj][1] - P[jj - 1][1], axis0 = Math.abs(adx) > Math.abs(adz) ? 'ew' : 'ns';
  log.axis = axis0;
  const t0 = performance.now(); let k = 0, stopped = false, crossed = false, lastLight = null, maxInJunction = 0;
  while (performance.now() - t0 < maxSec * 1000) {
    let bi = k, bd = 1e9; for (let i = Math.max(0, k - 3); i < Math.min(P.length, k + 60); i++) { const d = (P[i][0] - s.x) ** 2 + (P[i][1] - s.z) ** 2; if (d < bd) { bd = d; bi = i; } } k = bi;
    const k2 = Math.min(P.length - 1, k + 1), sx2 = P[k2][0] - P[k][0], sz2 = P[k2][1] - P[k][1], sl = Math.hypot(sx2, sz2) || 1;
    const here = C[k] + Math.max(-sl, Math.min(sl, ((s.x - P[k][0]) * sx2 + (s.z - P[k][1]) * sz2) / sl)), toSig = sigAt - here;
    let tgt = P[P.length - 1]; for (let i = k; i < P.length; i++) if (C[i] - here > Math.max(8, s.v * 1.2)) { tgt = P[i]; break; }
    const fx = -Math.sin(s.yaw), fz = -Math.cos(s.yaw), dx = tgt[0] - s.x, dz = tgt[1] - s.z;
    const ang = Math.atan2(fx * dz - fz * dx, fx * dx + fz * dz);
    set('KeyD', ang > 0.04); set('KeyA', ang < -0.04);
    const light = c.lightAt(sig, axis0);
    if (light !== lastLight) { log.events.push({ t: +((performance.now() - t0) / 1000).toFixed(1), light, toSignalM: Math.round(toSig), kmh: Math.round(s.v * 3.6) }); lastLight = light; }
    let want = kmh / 3.6;
    const stopLine = toSig - 9;                        // stop line ~9 m before the signal node
    if (!crossed && stopLine > -1 && (light === 'r' || (light === 'y' && stopLine > s.v * 1.5))) want = Math.min(want, Math.max(0, Math.sqrt(Math.max(0, 2 * 3 * (stopLine - 1)))));
    for (const o of c.cars) { const rx = o.x - s.x, rz = o.z - s.z, ah = rx * fx + rz * fz, lat = Math.abs(rx * fz - rz * fx); if (ah > 0 && ah < 45 && lat < 2.4) want = Math.min(want, Math.max(0, (ah - 8) / 2)); }
    set('KeyW', s.v < want - 0.3); set('KeyS', s.v > want + 1.2);
    if (!stopped && s.v < 0.3 && stopLine < 12 && stopLine > -2) { stopped = true; log.events.push({ t: +((performance.now() - t0) / 1000).toFixed(1), stoppedAt: Math.round(stopLine), light }); }
    if (toSig < 15 && toSig > -45) {           // inside the junction (a divided avenue's crossing is two carriageways deep): who else is in it, and which way are they going?
      for (const o of c.cars) { const d = Math.hypot(o.x - s.x, o.z - s.z); if (d < 25 && o.speed > 1) { const cross = Math.abs(o.dirX * fx + o.dirZ * fz) < 0.5; if (cross) { maxInJunction++; log.crossTraffic.push({ t: +((performance.now() - t0) / 1000).toFixed(1), d: Math.round(d), speed: Math.round(o.speed * 3.6), theirLight: c.lightAt(sig, Math.abs(o.dirX) > Math.abs(o.dirZ) ? 'ew' : 'ns') }); } } }
    }
    if (!crossed && toSig < -45) { crossed = true; log.events.push({ t: +((performance.now() - t0) / 1000).toFixed(1), crossed: true, light }); }
    if (crossed && toSig < -90) break;
    await new Promise((r) => setTimeout(r, 50));
  }
  for (const code of Object.keys(held)) set(code, false);
  log.hits = { ...(c.hitCount || {}) }; log.crossTrafficMovingSamples = maxInJunction;
  return log;
};

// The six everyday cars driving past the parked player on an ordinary two-way street: first towards the
// camera in the opposite lane, then from behind in the player's lane. No labels anywhere (canvas only).
window.__passBy = async ({ x, z, types = ['cobalt', 'nexia', 'gentra', 'spark', 'damas', 'malibu'], gap = 28 } = {}) => {
  const S = window.__sr3d, c = S.city, s = c.state;
  const { createUzCar } = await import('./uzcars.js');
  await S.teleport(x, z, 0); await new Promise((r) => setTimeout(r, 2500));
  const segs = c.roadsNear(x, z, 0, 500).filter((r) => !r.oneway && r.len > 60).sort((a, b) => {
    const d = (r) => { const t = Math.max(0, Math.min(1, ((x - r.ax) * (r.bx - r.ax) + (z - r.az) * (r.bz - r.az)) / (r.len * r.len))); return Math.hypot(r.ax + (r.bx - r.ax) * t - x, r.az + (r.bz - r.az) * t - z); };
    return d(a) - d(b);
  });
  const seg = segs[0]; if (!seg) return { err: 'no two-way segment' };
  // park the player on the right-hand kerb a third of the way along, facing along the segment
  const ux = (seg.bx - seg.ax) / seg.len, uz = (seg.bz - seg.az) / seg.len, t0 = Math.min(seg.len * 0.35, 60);
  const off = c.laneOffset(seg, 0) + 1.2;
  await S.teleport(seg.ax + ux * t0 - uz * off, seg.az + uz * t0 + ux * off, Math.atan2(-ux, -uz));
  await new Promise((r) => setTimeout(r, 1500));
  for (const o of c.cars) o.mesh.visible = false; c.cars.length = 0;
  const trf = c.updateTraffic.bind(c);
  c.pool = [];                                            // nothing else spawns while the parade runs
  const spawnBefore = c.spawnTraffic; c.maxCars0 = c.maxCars;
  const made = [];
  types.forEach((type, i) => {
    for (const dir of [1]) {
      const car = createUzCar(type); car.setColor(); if (car.setTaxi) car.setTaxi(false);
      c.root.add(car.mesh); car.mesh.visible = true;
      car.baseSpeed = car.speed = 9; car.lane = 0;
      // dir 1: comes from the far end towards the player; dir 0: starts behind the player
      const t = dir === 1 ? Math.min(seg.len - 5, t0 + 40 + i * gap) : Math.max(1, t0 - 30 - i * gap) ;
      c.placeOnSeg(car, seg, dir, dir === 1 ? seg.len - t : t);
      car.yaw = car.yawT; car.pass = { type, dir };
      c.cars.push(car); made.push(car);
    }
  });
  return { seg: [Math.round(seg.ax), Math.round(seg.az), Math.round(seg.bx), Math.round(seg.bz)], name: c.streetName(s.x, s.z), cars: made.length };
};
