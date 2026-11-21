// Keyboard + touch input.
export const input = { left: false, right: false, up: false, down: false, nitro: false, rise: false, sink: false, look: false };

const KEYMAP = {
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
  ArrowUp: 'up', KeyW: 'up',
  ArrowDown: 'down', KeyS: 'down',
  Space: 'nitro',
  KeyE: 'rise', ShiftLeft: 'rise', ShiftRight: 'rise', PageUp: 'rise',
  KeyQ: 'sink', ControlLeft: 'sink', ControlRight: 'sink', PageDown: 'sink',
  KeyB: 'look',
};

export function resetInput() {
  for (const k of Object.keys(input)) input[k] = false;
  document.querySelectorAll('.tbtn.pressed').forEach((b) => b.classList.remove('pressed'));
}

export function initInput(onKey) {
  window.addEventListener('keydown', (e) => {
    // typing in a text field (multiplayer name / address) must not drive the car
    const tag = e.target && e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') {
      if (!e.repeat && (e.code === 'Enter' || e.code === 'Escape')) onKey(e);
      return;
    }
    const k = KEYMAP[e.code];
    if (k) {
      input[k] = true;
      e.preventDefault();
    }
    if (!e.repeat) onKey(e);
  });
  window.addEventListener('keyup', (e) => {
    const k = KEYMAP[e.code];
    if (k) input[k] = false;
  });
  window.addEventListener('blur', resetInput);

  // Touch buttons
  document.querySelectorAll('[data-key]').forEach((btn) => {
    const key = btn.dataset.key;
    const down = (e) => { e.preventDefault(); input[key] = true; btn.classList.add('pressed'); btn.setPointerCapture?.(e.pointerId); };
    const up = (e) => { e.preventDefault(); input[key] = false; btn.classList.remove('pressed'); };
    btn.addEventListener('pointerdown', down);
    btn.addEventListener('pointerup', up);
    btn.addEventListener('pointercancel', up);
    btn.addEventListener('lostpointercapture', up);
    btn.addEventListener('contextmenu', (e) => e.preventDefault());
  });
}

// ---------- Tilt steering (accelerometer) ----------
// Works in portrait and both landscape orientations; calibrates to how the player holds the phone.
export const tilt = { enabled: false, axis: 0, angle: 0, neutral: 0, available: false };
const IS_IOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1 && !/Android/.test(navigator.userAgent)); // iPadOS reports as a Mac
const screenAngle = () => {
  const a = (screen.orientation && typeof screen.orientation.angle === 'number') ? screen.orientation.angle : (window.orientation || 0);
  return ((a % 360) + 360) % 360;
};
function onMotion(e) {
  const g = e.accelerationIncludingGravity;
  if (!g || g.x === null || g.y === null) return;
  tilt.available = true;
  let x = g.x, y = g.y;
  if (IS_IOS) { x = -x; y = -y; }               // iOS reports the opposite sign
  const a = screenAngle();
  // component of the "up" vector along the screen's horizontal axis
  const sx = a === 90 ? -y : a === 270 ? y : a === 180 ? -x : x;
  const deg = (Math.asin(Math.max(-1, Math.min(1, -sx / 9.81))) * 180) / Math.PI;
  tilt.angle += (deg - tilt.angle) * 0.35;      // light smoothing
  const d = tilt.angle - tilt.neutral;
  const dead = 2.5, full = 24;
  const v = Math.abs(d) < dead ? 0 : (d - Math.sign(d) * dead) / (full - dead);
  tilt.axis = Math.max(-1, Math.min(1, v));
}

export async function setTilt(on) {
  // iOS requires an explicit motion permission; other platforms deliver events without one
  if (on && IS_IOS && typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
    try {
      if ((await DeviceMotionEvent.requestPermission()) !== 'granted') on = false;
    } catch (e) { on = false; }
  }
  tilt.enabled = on;
  window.removeEventListener('devicemotion', onMotion);
  if (on) window.addEventListener('devicemotion', onMotion);
  else tilt.axis = 0;
  return on;
}

export function calibrateTilt() { tilt.neutral = tilt.angle; }

export const isTouchDevice = () =>
  ('ontouchstart' in window) || (window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
