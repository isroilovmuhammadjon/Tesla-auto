// Wi-Fi helpers: native plugin access (phone hosting) and room discovery on the local network.
export const LAN_PORT = 8080;

const isNative = () => !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
export const nativePlatform = () => (isNative() && window.Capacitor.getPlatform ? window.Capacitor.getPlatform() : 'web');

// Load Capacitor's JS core (copied into www/lib by CI) so we can talk to native plugins.
let coreLoading = null;
function loadCapacitorCore() {
  if (window.capacitorExports && window.capacitorExports.registerPlugin) return Promise.resolve(window.capacitorExports);
  if (!coreLoading) {
    coreLoading = new Promise((resolve) => {
      const s = document.createElement('script');
      s.src = 'lib/capacitor-core.js';
      s.onload = () => resolve(window.capacitorExports || null);
      s.onerror = () => resolve(null);
      document.head.appendChild(s);
    });
  }
  return coreLoading;
}

// Get a native plugin proxy, trying every way Capacitor exposes plugins.
export async function getPlugin(name) {
  if (!isNative()) return null;
  const cap = window.Capacitor;
  if (typeof cap.registerPlugin === 'function') return cap.registerPlugin(name);
  const core = await loadCapacitorCore();
  if (core && core.registerPlugin) return core.registerPlugin(name);
  if (cap.Plugins && cap.Plugins[name]) return cap.Plugins[name];
  if (typeof cap.nativePromise === 'function') {
    // last resort: raw bridge calls
    return new Proxy({}, {
      get(_, method) {
        if (method === 'addListener') {
          return (eventName, cb) => {
            const callbackId = cap.nativeCallback(name, 'addListener', { eventName }, cb);
            return Promise.resolve({ remove: () => cap.nativePromise(name, 'removeListener', { callbackId, eventName }) });
          };
        }
        return (opts) => cap.nativePromise(name, String(method), opts || {});
      },
    });
  }
  return null;
}

export const canHostOnThisDevice = () => nativePlatform() === 'android';

// ---------------------------------------------------------------- discovery
const COMMON_SUBNETS = ['192.168.1', '192.168.0', '192.168.43', '172.20.10', '192.168.100', '192.168.2', '192.168.31', '192.168.8', '10.0.0', '10.0.1'];
const isPrivateIPv4 = (h) => /^(10|192\.168|172\.(1[6-9]|2\d|3[01]))\.\d+\.\d+$/.test(h) || /^\d+\.\d+\.\d+\.\d+$/.test(h);
const subnetOf = (ip) => ip.split('.').slice(0, 3).join('.');

async function probe(host, port, timeoutMs) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(`http://${host}:${port}/info`, { signal: ctrl.signal, cache: 'no-store', mode: 'cors' });
    if (!r.ok) return null;
    const info = await r.json();
    return info && info.game === 'street-racing-3d' ? { ...info, host, port, addr: `${host}:${port}` } : null;
  } catch (e) {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function webrtcLocalIp() {
  return new Promise((resolve) => {
    let pc;
    const done = (ip) => { try { pc && pc.close(); } catch (e) { /* ignore */ } resolve(ip); };
    try {
      pc = new RTCPeerConnection({ iceServers: [] });
      pc.createDataChannel('x');
      pc.onicecandidate = (e) => {
        const m = e && e.candidate && e.candidate.candidate.match(/ (\d+\.\d+\.\d+\.\d+) \d+ typ host/);
        if (m && !m[1].startsWith('127.') && !m[1].startsWith('169.254.')) done(m[1]);
      };
      pc.createOffer().then((o) => pc.setLocalDescription(o)).catch(() => done(null));
      setTimeout(() => done(null), 1200);
    } catch (e) { done(null); }
  });
}

// Find rooms on the Wi-Fi. Calls onFound(room) as soon as each one answers.
export async function scanRooms({ onFound, onProgress, knownAddrs = [], signal } = {}) {
  const subnets = new Set();
  const direct = new Set();
  // 1. our own Wi-Fi address (Android app knows it exactly)
  try {
    const plugin = await getPlugin('LanHost');
    if (plugin && plugin.getLocalIp) {
      const { ip } = await plugin.getLocalIp();
      if (ip) subnets.add(subnetOf(ip));
    }
  } catch (e) { /* not available */ }
  // 2. the server this page came from, and addresses used before
  if (isPrivateIPv4(location.hostname)) { subnets.add(subnetOf(location.hostname)); direct.add(`${location.hostname}:${location.port || 80}`); }
  for (const a of knownAddrs) {
    const m = String(a || '').replace(/^https?:\/\//, '').match(/^(\d+\.\d+\.\d+\.\d+)(?::(\d+))?/);
    if (m) { subnets.add(subnetOf(m[1])); direct.add(`${m[1]}:${m[2] || LAN_PORT}`); }
  }
  if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') direct.add(`localhost:${location.port || LAN_PORT}`);
  // 2b. browsers / iOS: WebRTC sometimes reveals our own Wi-Fi address
  if (!subnets.size) { const ip = await webrtcLocalIp(); if (ip) subnets.add(subnetOf(ip)); }
  // 3. if we still don't know our network, try the usual home-router / hotspot ranges
  if (!subnets.size) COMMON_SUBNETS.forEach((s) => subnets.add(s));

  const targets = [...direct].map((d) => { const [h, p] = d.split(':'); return [h, Number(p) || LAN_PORT]; });
  for (const s of subnets) for (let i = 1; i < 255; i++) targets.push([`${s}.${i}`, LAN_PORT]);

  const seen = new Set();
  let done = 0;
  let next = 0;
  const worker = async () => {
    while (next < targets.length && !(signal && signal.aborted)) {
      const [h, p] = targets[next++];
      const room = await probe(h, p, 1200);
      done++;
      if (onProgress && done % 16 === 0) onProgress(done / targets.length);
      if (room) {
        const key = room.host === 'localhost' ? `self:${room.port}` : room.addr;
        if (!seen.has(key)) { seen.add(key); onFound(room); }
      }
    }
  };
  await Promise.all(Array.from({ length: 48 }, worker));
  if (onProgress) onProgress(1);
}
