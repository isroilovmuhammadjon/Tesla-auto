// Wi-Fi multiplayer client. Talks to server/mp_server.py over WebSocket.
// Other players are drawn as "ghost" cars (no collisions, so network lag can never cause an
// unfair crash). Everyone's world scrolls with their own distance, so a remote car sits at
// z = myDistance - theirDistance, extrapolated with their speed between updates.
import * as THREE from 'three';
import { createSportsCar } from './carModels.js?v=3812a101';
import { CARS } from './config.js?v=3812a101';

function nameTexture(text, color) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(5,8,18,0.78)';
  g.beginPath(); g.roundRect(4, 8, 248, 48, 12); g.fill();
  g.strokeStyle = color; g.lineWidth = 3; g.stroke();
  g.fillStyle = color; g.font = 'bold 26px Orbitron, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text.slice(0, 14), 128, 33);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// turn whatever the player typed (192.168.1.5, 192.168.1.5:8080, http://…) into a ws:// URL
export function wsUrlFrom(addr) {
  let a = String(addr || '').trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '');
  if (/^wss?:\/\//i.test(a)) return /\/ws$/.test(a) ? a : a + '/ws';
  if (!/:\d+$/.test(a)) a += ':8080';
  return `ws://${a}/ws`;
}

// one id per open game tab: the room replaces an older connection from the same tab instead of
// listing the same player twice
const CLIENT_ID = Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

export class Multiplayer {
  constructor(scene, hooks = {}) {
    this.scene = scene;
    this.hooks = hooks;
    this.ws = null;
    this.connected = false;
    this.id = null;
    this.hostId = null;
    this.lobby = null;
    this.remotes = new Map();
    this.sendTimer = 0;
  }

  get isHost() { return this.id !== null && this.id === this.hostId; }

  // addr: "192.168.1.5:8080" for a Wi-Fi server, or a ready socket object for a room hosted on this phone
  connect(addr, name, car) {
    this.disconnect();
    // a second tap while the first connection is still opening must not join the room twice
    if (this.pending) { try { this.pending.close(); } catch (e) { /* ignore */ } this.pending = null; }
    return new Promise((resolve, reject) => {
      let ws;
      try { ws = typeof addr === 'object' && addr ? addr : new WebSocket(wsUrlFrom(addr)); } catch (e) { reject(e); return; }
      this.pending = ws;
      const timer = setTimeout(() => { if (this.pending === ws) this.pending = null; try { ws.close(); } catch (e) { /* ignore */ } reject(new Error('timeout')); }, typeof addr === 'object' ? 20000 : 6000);
      ws.onopen = () => {
        clearTimeout(timer);
        if (this.pending !== ws) { try { ws.close(); } catch (e) { /* ignore */ } reject(new Error('superseded')); return; }
        this.pending = null;
        this.ws = ws;
        this.connected = true;
        this.send({ t: 'hello', name, car, cid: CLIENT_ID });
        resolve();
      };
      ws.onerror = () => { clearTimeout(timer); if (!this.connected) reject(new Error('connection failed')); };
      ws.onclose = () => {
        if (this.ws !== ws) return;          // an old or abandoned socket
        const was = this.connected;
        this.connected = false;
        this.ws = null;
        this.clearRemotes();
        if (was && this.hooks.onDisconnect) this.hooks.onDisconnect();
      };
      ws.onmessage = (e) => {
        let m;
        try { m = JSON.parse(e.data); } catch (err) { return; }
        this.onMessage(m);
      };
    });
  }

  disconnect() {
    if (this.ws) {
      this.connected = false;
      try { this.ws.close(); } catch (e) { /* ignore */ }
      this.ws = null;
    }
    this.clearRemotes();
    this.id = null;
    this.hostId = null;
    this.lobby = null;
  }

  send(obj) {
    if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(obj));
  }

  onMessage(m) {
    const h = this.hooks;
    switch (m.t) {
      case 'welcome': this.id = m.id; this.hostId = m.hostId; break;
      case 'lobby': this.lobby = m; this.hostId = m.hostId; if (h.onLobby) h.onLobby(m); break;
      case 'start': if (h.onStart) h.onStart(m); break;
      case 'state': this.onState(m); break;
      case 'finished': if (h.onFinished) h.onFinished(m); break;
      case 'results': if (h.onResults) h.onResults(m); break;
      case 'left': this.removeRemote(m.id); break;
      case 'error': if (h.onError) h.onError(m.message); break;
      default: break;
    }
  }

  playerName(id) {
    const p = this.lobby && this.lobby.players.find((q) => q.id === id);
    return p ? p.name : 'Player';
  }

  // ---------- remote cars
  makeRemote(id, carIndex) {
    const def = CARS[carIndex] || CARS[0];
    const car = createSportsCar(def);
    const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: nameTexture(this.playerName(id), '#00e5ff'), transparent: true, depthWrite: false }));
    label.scale.set(3.2, 0.8, 1);
    label.position.set(0, 2.5, 0);
    car.group.add(label);
    car.group.visible = false;
    this.scene.add(car.group);
    const r = { id, carIndex, car, label, last: null, x: 0, y: 0, z: 0, yaw: 0 };
    this.remotes.set(id, r);
    return r;
  }

  removeRemote(id) {
    const r = this.remotes.get(id);
    if (!r) return;
    this.scene.remove(r.car.group);
    r.car.dispose();
    r.label.material.map.dispose();
    r.label.material.dispose();
    this.remotes.delete(id);
  }

  clearRemotes() { for (const id of [...this.remotes.keys()]) this.removeRemote(id); }

  onState(m) {
    let r = this.remotes.get(m.id);
    if (r && r.carIndex !== m.car) { this.removeRemote(m.id); r = null; }
    if (!r) r = this.makeRemote(m.id, m.car);
    const first = !r.last;
    r.last = { ...m, recv: performance.now() };
    if (first) { r.x = m.x; r.y = m.y; }
  }

  // Send our state ~15 times per second
  sendState(dt, s) {
    this.sendTimer -= dt;
    if (this.sendTimer > 0 || !this.connected) return;
    this.sendTimer = 1 / 15;
    this.send({ t: 'state', ...s });
  }

  // Place remote cars in our world (relative to our own distance travelled)
  update(dt, myDistance, time) {
    const now = performance.now();
    for (const r of this.remotes.values()) {
      const s = r.last;
      if (!s) continue;
      const age = (now - s.recv) / 1000;
      if (age > 3) { r.car.group.visible = false; continue; }   // stale: player paused or dropped
      const d = s.d + s.v * Math.min(age, 0.4);                  // extrapolate between packets
      const k = 1 - Math.exp(-dt * 12);
      r.x += (s.x - r.x) * k;
      r.y += (s.y - r.y) * k;
      r.z = myDistance - d;
      r.yaw += (s.yaw - r.yaw) * k;
      const g = r.car.group;
      g.visible = r.z > -650 && r.z < 80;
      g.position.set(r.x, r.y, r.z);
      g.rotation.set(s.rx || 0, r.yaw, s.rz || 0);
      r.car.update(dt, s.v, 0, !!s.brake, !!s.nitro, time, s.fly || 0, r.y);
    }
  }

  // distances of other players (for race position)
  remoteDistances() {
    const now = performance.now();
    const out = [];
    for (const r of this.remotes.values()) {
      if (!r.last) continue;
      out.push({ id: r.id, d: r.last.d + r.last.v * Math.min((now - r.last.recv) / 1000, 0.4) });
    }
    return out;
  }
}
