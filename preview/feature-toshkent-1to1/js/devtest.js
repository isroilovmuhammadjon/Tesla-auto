// Test drives for development (loaded only with ?test in the URL): drives the car along a navigation
// route to a search result, faster than real time, with the HUD off, and reports what went wrong:
// collisions (with what), time stuck, samples off the drawn carriageway, cells still loading, districts crossed.
window.__testDrive = async (fromName, toName, { maxV = 14, budget = 900, shots = null } = {}) => {
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
    S.step(4, 1 / 30); simT += 4 / 30;
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
window.__testShift = async ({ car = 'gentra', budget = 2400, wrongTurnAfter = 15 } = {}) => {
  const S = window.__sr3d, T = S.taxi;
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
  let simT = 0, rev = 0, stuckT = 0, detourAt = null, lastPhase = '';
  while (simT < budget) {
    if (T.phase !== lastPhase) { log.phases.push([T.phase, Math.round(simT)]); lastPhase = T.phase; }
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
      inp.up = inp.down = inp.left = inp.right = false;
      if (T.phase === 'toDrop' && simT > detourAt && simT < detourAt + 7) {
        inp.up = s.v < 9; inp.left = simT < detourAt + 2.5;
        if (!log.wrongTurn) log.wrongTurn = { atSimSec: Math.round(simT), routeKmBefore: +(r.length / 1000).toFixed(2), reroutesBefore: T.reroutes };
      } else if (rev > 0) { rev -= 0.13; inp.down = true; if (ang < 0) inp.right = true; else inp.left = true; }
      else {
        if (ang > 0.05) inp.right = true; else if (ang < -0.05) inp.left = true;
        let want = Math.abs(ang) > 0.45 ? 4 : 13;
        if (left < 45) want = Math.min(want, Math.max(0, (left - 2) * 0.32));
        for (const o2 of c.cars) { const rx = o2.x - s.x, rz = o2.z - s.z, ah = rx * fx + rz * fz, lat = Math.abs(rx * fz - rz * fx); if (ah > 0 && ah < 22 && lat < 2.2) want = Math.min(want, Math.max(0, (ah - 8) * 0.7)); }
        if (s.v < want - 0.4) inp.up = true; else if (s.v > want + 0.8 && s.v > 0.3) inp.down = true;
        const queued = c.cars.some((o2) => Math.hypot(o2.x - s.x, o2.z - s.z) < 13);
        stuckT = Math.abs(s.v) < 0.6 && left > 12 && !queued ? stuckT + 0.13 : 0;
        if (stuckT > 2) { stuckT = 0; rev = 2.4; log.stuck++; }
      }
      if (log.wrongTurn && !log.wrongTurn.routeKmAfter && T.reroutes > log.wrongTurn.reroutesBefore) log.wrongTurn.routeKmAfter = +(T.route.length / 1000).toFixed(2);
    } else { inp.up = inp.left = inp.right = false; inp.down = s.v > 0.5; }
    S.step(4, 1 / 30); simT += 4 / 30;
    if (Math.round(simT * 7.5) % 15 === 0) await new Promise((r) => setTimeout(r, 0));
  }
  inp.up = inp.down = inp.left = inp.right = false;
  log.simMin = +(simT / 60).toFixed(1);
  log.paid = !!(T.lastTrip && T.lastTrip.paid); log.fare = T.lastTrip && T.lastTrip.fare; log.reroutes = T.lastTrip ? T.lastTrip.reroutes : T.reroutes;
  log.savedBalance = localStorage.getItem('sr3d_taxi_balance'); log.savedTrips = localStorage.getItem('sr3d_taxi_trips');
  log.nextOrderOffered = T.phase === 'offer' || T.phase === 'paid' || T.phase === 'search';
  window.__shiftResult = log;
  return log;
};
