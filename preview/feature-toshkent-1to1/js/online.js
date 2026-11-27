// Online rooms over the internet (works on the website, any network, any device).
// The host's game runs the room (LocalRoom); players connect peer-to-peer with WebRTC.
// PeerJS's free public broker only introduces the devices — game data goes directly between them.
import { LocalRoom } from './lanroom.js?v=78ee488d';

const PREFIX = 'sr3d-tsh-';            // namespace on the public broker
let peerLib = null;

function loadPeerJs() {
  if (window.Peer) return Promise.resolve(window.Peer);
  if (peerLib) return peerLib;
  peerLib = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'lib/peerjs.min.js';
    s.onload = () => (window.Peer ? resolve(window.Peer) : reject(new Error('PeerJS missing')));
    s.onerror = () => { peerLib = null; reject(new Error('Could not load PeerJS')); };
    document.head.appendChild(s);
  });
  return peerLib;
}

const randomCode = () => String(Math.floor(10000 + Math.random() * 90000));
export const cleanCode = (v) => String(v || '').replace(/\D/g, '').slice(0, 5);

function openPeer(Peer, id) {
  return new Promise((resolve, reject) => {
    const peer = id ? new Peer(id, { debug: 0 }) : new Peer({ debug: 0 });
    const timer = setTimeout(() => { peer.destroy(); reject(new Error('timeout')); }, 12000);
    peer.on('open', () => { clearTimeout(timer); resolve(peer); });
    peer.on('error', (e) => { clearTimeout(timer); peer.destroy(); reject(e); });
  });
}

// ---------- host: returns { code, socket (for our own Multiplayer client), stop() }
export async function hostOnline() {
  const Peer = await loadPeerJs();
  let peer = null, code = null;
  for (let i = 0; i < 4 && !peer; i++) {
    code = randomCode();
    try { peer = await openPeer(Peer, PREFIX + code); } catch (e) { if (!e || e.type !== 'unavailable-id') throw e; }
  }
  if (!peer) throw new Error('No free room code');

  const conns = new Map();   // id -> DataConnection
  let nextId = 1;
  const room = new LocalRoom({
    sendTo: (id, obj) => { const c = conns.get(id); if (c && c.open) c.send(JSON.stringify(obj)); },
    broadcastAll: (obj, exclude) => {
      const text = JSON.stringify(obj);
      for (const [id, c] of conns) if (id !== exclude && c.open) c.send(text);
    },
  });
  peer.on('connection', (conn) => {
    const id = nextId++;
    conn.on('open', () => { conns.set(id, conn); room.onOpen(id); });
    conn.on('data', (d) => { let m; try { m = JSON.parse(d); } catch (e) { return; } room.onMessage(id, m); });
    const gone = () => { if (conns.delete(id)) room.onClose(id); };
    conn.on('close', gone);
    conn.on('error', gone);
  });
  // the broker connection can drop on mobile networks; players already in keep playing
  peer.on('disconnected', () => { try { peer.reconnect(); } catch (e) { /* ignore */ } });

  return {
    code,
    socket: () => room.createLocalSocket(),   // create it right when connecting (its open event fires on the next microtask)
    stop() { for (const c of conns.values()) { try { c.close(); } catch (e) { /* ignore */ } } peer.destroy(); },
  };
}

// ---------- player: a WebSocket-like object connected to room <code>
export async function joinOnline(code) {
  const Peer = await loadPeerJs();
  const peer = await openPeer(Peer, null);
  const conn = peer.connect(PREFIX + cleanCode(code), { reliable: true, serialization: 'raw' });
  const sock = {
    readyState: 0,
    onopen: null, onmessage: null, onclose: null, onerror: null,
    send(text) { if (sock.readyState === 1) conn.send(text); },
    close() {
      if (sock.readyState === 3) return;
      sock.readyState = 3;
      try { conn.close(); } catch (e) { /* ignore */ }
      peer.destroy();
      if (sock.onclose) sock.onclose();
    },
  };
  conn.on('open', () => { sock.readyState = 1; if (sock.onopen) sock.onopen(); });
  conn.on('data', (d) => { if (sock.onmessage) sock.onmessage({ data: d }); });
  conn.on('close', () => sock.close());
  conn.on('error', () => { if (sock.onerror) sock.onerror(); sock.close(); });
  // room code that doesn't exist
  peer.on('error', (e) => { if (sock.readyState === 0) { if (sock.onerror) sock.onerror(e); sock.close(); } });
  return sock;
}
