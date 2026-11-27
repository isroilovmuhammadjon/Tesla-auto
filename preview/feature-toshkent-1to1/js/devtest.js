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
window.__bendTest = async ({ edge, from = 40, kmh = 60, legacy = false, record = false, reactMs = 50 } = {}) => {
  const S = window.__sr3d, T = S.taxi, c = S.city; await T.ensureData();
  const g = T.graph, E = g.edges[edge];
  const lane = (sx) => { const p = g.pointAt(edge, sx); const off = E.oneway ? Math.max(0, E.width / 2 - 1.8) : E.width / 4; return { x: p.x - p.uz * off, z: p.z + p.ux * off, ux: p.ux, uz: p.uz }; };
  // start inside the bend, on the lane line, pointing along it (the first metres of an OSM way can kink)
  const p0 = lane(from), p1 = lane(from + 6);
  await S.teleport(p0.x, p0.z, Math.atan2(-(p1.x - p0.x), -(p1.z - p0.z)));
  c.legacySteer = legacy;
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
    const right = decide ? ang > 0.012 : lastRight, left = decide ? ang < -0.012 : lastLeft;
    if (right && !lastRight) presses++; if (left && !lastLeft) presses++;
    lastRight = right; lastLeft = left;
    set('right', 'KeyD', right); set('left', 'KeyA', left);
    set('up', 'KeyW', s.v < kmh / 3.6 - 0.3); set('down', 'KeyS', s.v > kmh / 3.6 + 1.5);
    await new Promise((r) => setTimeout(r, 50));
    if (performance.now() - t0 > 40000) break;
  }
  for (const [k, code] of [['up', 'KeyW'], ['left', 'KeyA'], ['right', 'KeyD'], ['down', 'KeyS']]) set(k, code, false);
  c.legacySteer = false; c.updateTraffic = traffic;
  return { kmh, legacy, hits: { ...(c.hitCount || {}) }, maxErrM: +maxErr.toFixed(2), rmsErrM: +Math.sqrt(sumErr / Math.max(1, n)).toFixed(2), keyPresses: presses, seconds: +((performance.now() - t0) / 1000).toFixed(1) };
};

// Live (real-time game loop) steering probe with real key events on an open straight: cruise at `kmh`
// with W, then `pattern` = 'tap' (D for 120 ms), 'hold' (D for 2 s) or 'lane' (D 0.6 s, A 0.6 s);
// samples key state, virtual wheel, road-wheel angle, yaw rate and position every frame.
window.__liveSteer = async ({ kmh = 60, pattern = 'hold', legacy = false, x = 30000, z = 30000 } = {}) => {
  const S = window.__sr3d, c = S.city;
  await S.teleport(x, z, 0);
  const coll = c.collide; c.collide = () => {};
  c.legacySteer = legacy;
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
  c.collide = coll; c.legacySteer = false;
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
window.__bendSim = ({ edge = 66172, from = 40, kmh = 60, legacy = false, reactMs = 250, fps = 60, traffic = false } = {}) => {
  const S = window.__sr3d, T = S.taxi, c = S.city, g = T.graph, E = g.edges[edge], inp = c.d.input;
  const lane = (sx) => { const p = g.pointAt(edge, sx); const off = E.oneway ? Math.max(0, E.width / 2 - 1.8) : E.width / 4; return { x: p.x - p.uz * off, z: p.z + p.ux * off, ux: p.ux, uz: p.uz }; };
  const p0 = lane(from), p1 = lane(from + 6);
  const s = c.state;
  Object.assign(s, { x: p0.x, z: p0.z, yaw: Math.atan2(-(p1.x - p0.x), -(p1.z - p0.z)), v: kmh / 3.6, latV: 0, r: 0, ax: 0, steer: 0, wheelU: 0, spin: 0 });
  const trf = c.updateTraffic; if (!traffic) { c.updateTraffic = () => {}; for (const car of c.cars) car.mesh.visible = false; c.cars.length = 0; }
  c.legacySteer = legacy; c.hitCount = {};
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
      const k = ang > 0.012 ? 1 : ang < -0.012 ? -1 : 0;
      if (k && k !== lastKey) presses++;
      lastKey = k; inp.right = k > 0; inp.left = k < 0;
    }
    inp.up = s.v < kmh / 3.6 - 0.3; inp.down = s.v > kmh / 3.6 + 1.5;
    c.update(dt); frames++;
    maxYaw = Math.max(maxYaw, Math.abs(s.r));
    if (i % Math.round(fps / 5) === 0) path.push([+(i / fps).toFixed(1), Math.round(s.x * 10) / 10, Math.round(s.z * 10) / 10, +err.toFixed(2), lastKey, +(-s.steer * 57.3).toFixed(1), +(-s.r).toFixed(3)]);
  }
  inp.left = inp.right = inp.up = inp.down = false;
  c.legacySteer = false; c.updateTraffic = trf; S.G.mode = mode;
  return { edge, kmh, legacy, fps, reactMs, seconds: +(frames / fps).toFixed(1), maxErrM: +maxErr.toFixed(2), rmsErrM: +Math.sqrt(sum / Math.max(1, n)).toFixed(2), keyChanges: presses, maxYawRate: +maxYaw.toFixed(2), hits: { ...(c.hitCount || {}) }, path };
};
