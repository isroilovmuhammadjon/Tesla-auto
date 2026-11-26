// A multiplayer room that runs inside the game itself, so a phone can host without a laptop.
// Same protocol as server/mp_server.py. Remote players reach it through the native LanHost
// plugin (Android WebSocket server); the hosting player is connected through an in-memory socket.

const MAX_PLAYERS = 8;

export class LocalRoom {
  // sendTo(id, obj) and broadcastAll(obj, excludeId) deliver to remote (native) clients
  constructor({ sendTo, broadcastAll, onInfo }) {
    this.sendTo = sendTo;
    this.broadcastAll = broadcastAll;
    this.onInfo = onInfo || (() => {});
    this.players = new Map();     // id -> { id, name, car, joined, local }
    this.localSockets = new Map(); // id -> in-memory socket (the host's own client)
    this.nextId = 1000;           // local ids never clash with native connection ids
    this.hostId = null;
    this.phase = 'lobby';
    this.mode = 'race';
    this.distance = 3000;
    this.traffic = 'normal';      // host's choice, the same for everyone
    this.map = 'tashkent';
    this.seed = 1;
    this.startedAt = 0;
    this.finishers = [];
  }

  // ---------- transport
  send(p, obj) {
    if (p.local) { const s = this.localSockets.get(p.id); if (s) s.deliver(obj); }
    else this.sendTo(p.id, obj);
  }

  broadcast(obj, exclude = null) {
    // local players directly, remote players with one native call
    for (const p of this.players.values()) if (p.joined && p.local && p !== exclude) this.send(p, obj);
    this.broadcastAll(obj, exclude && !exclude.local ? exclude.id : -1);
  }

  // A WebSocket-like object for the hosting player's own Multiplayer client
  createLocalSocket() {
    const id = this.nextId++;
    const room = this;
    const sock = {
      readyState: 1,
      onopen: null, onmessage: null, onclose: null, onerror: null,
      send(text) { let m; try { m = JSON.parse(text); } catch (e) { return; } room.onMessage(id, m); },
      close() { if (sock.readyState !== 1) return; sock.readyState = 3; room.onClose(id); if (sock.onclose) sock.onclose(); },
      // microtask, not setTimeout: timers are throttled when the app is in the background
      deliver(obj) { const data = JSON.stringify(obj); queueMicrotask(() => { if (sock.readyState === 1 && sock.onmessage) sock.onmessage({ data }); }); },
    };
    this.localSockets.set(id, sock);
    this.onOpen(id, true);
    queueMicrotask(() => sock.onopen && sock.onopen());
    return sock;
  }

  // ---------- connection events
  onOpen(id, local = false) {
    this.players.set(id, { id, name: 'Player', car: 0, joined: false, local });
  }

  onClose(id) {
    const p = this.players.get(id);
    this.players.delete(id);
    this.localSockets.delete(id);
    if (!p || !p.joined) return;
    if (this.hostId === id) {
      const next = [...this.players.values()].find((q) => q.joined);
      this.hostId = next ? next.id : null;
    }
    this.broadcast({ t: 'left', id });
    if (![...this.players.values()].some((q) => q.joined)) this.phase = 'lobby';
    this.checkRaceDone();
    this.broadcast(this.lobby());
    this.publishInfo();
  }

  joined() { return [...this.players.values()].filter((p) => p.joined); }

  lobby() {
    return {
      t: 'lobby', hostId: this.hostId, phase: this.phase, mode: this.mode, distance: this.distance, traffic: this.traffic, map: this.map,
      players: this.joined().map((p) => ({ id: p.id, name: p.name, car: p.car })),
    };
  }

  // what Wi-Fi discovery shows for this room
  info() {
    const host = this.players.get(this.hostId);
    return {
      game: 'street-racing-3d', name: host ? `${host.name}'s room` : 'Phone room',
      mode: this.mode, distance: this.distance, phase: this.phase,
      players: this.joined().length, max: MAX_PLAYERS,
    };
  }

  publishInfo() { this.onInfo(this.info()); }

  startMsg() {
    // one seed and start time per session (late joiners get the same): identical traffic for all players
    return { t: 'start', mode: this.mode, distance: this.distance, seed: this.seed, startedAt: this.startedAt, traffic: this.traffic, map: this.map, order: this.joined().map((p) => p.id) };
  }

  checkRaceDone() {
    if (this.phase !== 'racing') return;
    const done = new Set(this.finishers.map((f) => f.id));
    const racers = this.joined();
    if (racers.length && racers.every((p) => done.has(p.id))) this.endRace();
  }

  endRace() {
    this.phase = 'lobby';
    this.broadcast({ t: 'results', mode: this.mode, list: this.finishers });
    this.broadcast(this.lobby());
    this.publishInfo();
  }

  // ---------- protocol (mirrors server/mp_server.py)
  onMessage(id, m) {
    const p = this.players.get(id);
    if (!p || !m || typeof m !== 'object') return;
    const t = m.t;
    if (t === 'hello') {
      if (this.joined().length >= MAX_PLAYERS) { this.send(p, { t: 'error', message: 'Room is full' }); return; }
      p.name = String(m.name || 'Player').trim().slice(0, 16) || 'Player';
      p.car = Number(m.car) || 0;
      p.joined = true;
      if (this.hostId === null) this.hostId = p.id;
      this.send(p, { t: 'welcome', id: p.id, hostId: this.hostId });
      this.broadcast(this.lobby());
      if (this.phase === 'driving') this.send(p, this.startMsg());
      this.publishInfo();
      return;
    }
    if (!p.joined) return;
    if (t === 'car') { p.car = Number(m.car) || 0; this.broadcast(this.lobby()); }
    else if (t === 'config' && id === this.hostId && this.phase === 'lobby') {
      if (m.mode === 'race' || m.mode === 'free') this.mode = m.mode;
      if (typeof m.distance === 'number') this.distance = Math.max(1000, Math.min(20000, Math.round(m.distance)));
      if (['low', 'normal', 'high'].includes(m.traffic)) this.traffic = m.traffic;
      if (m.map === 'tashkent' || m.map === 'neon') this.map = m.map;
      this.broadcast(this.lobby());
      this.publishInfo();
    } else if (t === 'start' && id === this.hostId && this.phase === 'lobby') {
      this.finishers = [];
      this.seed = 1 + Math.floor(Math.random() * (2 ** 31 - 2));
      this.startedAt = Date.now();
      this.phase = this.mode === 'race' ? 'racing' : 'driving';
      this.broadcast(this.startMsg());
      this.broadcast(this.lobby());
      this.publishInfo();
    } else if (t === 'join' && this.phase === 'driving') {
      this.send(p, this.startMsg());
    } else if (t === 'state') {
      m.id = id;
      this.broadcast(m, p);
    } else if (t === 'finish' && this.phase === 'racing') {
      if (!this.finishers.some((f) => f.id === id)) {
        const entry = { id, name: p.name, car: p.car, time: Number(m.time) || 0, place: this.finishers.length + 1 };
        this.finishers.push(entry);
        this.broadcast({ t: 'finished', ...entry });
        this.checkRaceDone();
      }
    } else if (t === 'end' && id === this.hostId && this.phase !== 'lobby') {
      this.endRace();
    }
  }
}
