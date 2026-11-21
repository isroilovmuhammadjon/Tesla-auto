// All sound is synthesised with the Web Audio API — no audio files needed.
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.musicLevel = 0.3;
  }

  get ready() { return !!this.ctx; }

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.9;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -12; comp.knee.value = 10; comp.ratio.value = 3.5;
    comp.attack.value = 0.005; comp.release.value = 0.2;
    this.master.connect(comp).connect(ctx.destination);

    this.sfx = ctx.createGain(); this.sfx.gain.value = 0.85; this.sfx.connect(this.master);
    this.musicBus = ctx.createGain(); this.musicBus.gain.value = 0; this.musicBus.connect(this.master);

    this.noise = this.makeNoise(2);
    this.buildEngine();
    this.wind = this.noiseLoop('bandpass', 600, 0.6);
    this.nitroN = this.noiseLoop('bandpass', 1600, 1.2);
    this.scrapeN = this.noiseLoop('highpass', 2800, 0.8);
    this.buildHum();

    this.music = new Synthwave(ctx, this.musicBus, this.noise);
    this.music.start();
    this.setMusicLevel(this.musicLevel);
  }

  makeNoise(seconds) {
    const len = this.ctx.sampleRate * seconds;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  distCurve(k) {
    const n = 1024, curve = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i * 2) / n - 1;
      curve[i] = ((1 + k) * x) / (1 + k * Math.abs(x));
    }
    return curve;
  }

  buildEngine() {
    const c = this.ctx;
    this.eOut = c.createGain(); this.eOut.gain.value = 0; this.eOut.connect(this.sfx);
    this.eFilter = c.createBiquadFilter(); this.eFilter.type = 'lowpass'; this.eFilter.Q.value = 3; this.eFilter.frequency.value = 900;
    const shaper = c.createWaveShaper(); shaper.curve = this.distCurve(6); shaper.oversample = '2x';
    const mix = c.createGain(); mix.gain.value = 0.45;
    mix.connect(shaper); shaper.connect(this.eFilter); this.eFilter.connect(this.eOut);
    this.eOsc = [['sawtooth', 1, 0.5], ['square', 0.5, 0.4], ['sawtooth', 2.004, 0.16], ['triangle', 0.25, 0.55]].map(([type, mul, gain]) => {
      const o = c.createOscillator(); o.type = type; o.frequency.value = 50 * mul;
      const g = c.createGain(); g.gain.value = gain;
      o.connect(g).connect(mix); o.start();
      return { o, mul };
    });
  }

  // Electric drive whine + hover thruster hum (AERO ION)
  buildHum() {
    const c = this.ctx;
    this.humOut = c.createGain(); this.humOut.gain.value = 0; this.humOut.connect(this.sfx);
    this.humA = c.createOscillator(); this.humA.type = 'sine'; this.humA.frequency.value = 200;
    this.humB = c.createOscillator(); this.humB.type = 'triangle'; this.humB.frequency.value = 401;
    const gb = c.createGain(); gb.gain.value = 0.35;
    this.humA.connect(this.humOut); this.humB.connect(gb).connect(this.humOut);
    this.humA.start(); this.humB.start();
    this.hoverN = this.noiseLoop('bandpass', 220, 2.5);
  }

  noiseLoop(type, freq, q) {
    const c = this.ctx;
    const src = c.createBufferSource(); src.buffer = this.noise; src.loop = true;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain(); g.gain.value = 0;
    src.connect(f).connect(g).connect(this.sfx); src.start();
    return { f, g };
  }

  setMuted(m) {
    this.muted = m;
    if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.ctx.currentTime, 0.05);
  }

  setMusicLevel(v) {
    this.musicLevel = v;
    if (this.ctx) this.musicBus.gain.setTargetAtTime(v, this.ctx.currentTime, 0.4);
  }

  // Continuous sounds, called every frame
  update({ rpm = 900, load = 0, engine = 0, wind = 0, nitro = false, scrape = false, electric = false, hover = 0 }) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const f = 26 + (rpm / 60) * 1.5;
    for (const { o, mul } of this.eOsc) o.frequency.setTargetAtTime(f * mul, t, 0.04);
    this.eFilter.frequency.setTargetAtTime(260 + rpm * 0.2 + load * 1500, t, 0.05);
    // electric car: no combustion growl, a rising motor whine instead
    this.eOut.gain.setTargetAtTime(electric ? 0 : engine * (0.1 + load * 0.15), t, 0.06);
    this.humA.frequency.setTargetAtTime(120 + rpm * 0.12, t, 0.05);
    this.humB.frequency.setTargetAtTime(241 + rpm * 0.24, t, 0.05);
    this.humOut.gain.setTargetAtTime(electric ? engine * (0.035 + load * 0.04) : 0, t, 0.06);
    this.hoverN.g.gain.setTargetAtTime(electric ? hover * engine * 0.18 : 0, t, 0.1);
    this.wind.g.gain.setTargetAtTime(wind * wind * 0.25, t, 0.1);
    this.wind.f.frequency.setTargetAtTime(400 + wind * 900, t, 0.1);
    this.nitroN.g.gain.setTargetAtTime(nitro ? 0.2 : 0, t, 0.06);
    this.scrapeN.g.gain.setTargetAtTime(scrape ? 0.22 : 0, t, 0.03);
  }

  // ---------- one-shots ----------
  burst(dur, type, f0, f1, gain, q = 1, delay = 0) {
    const c = this.ctx, t = c.currentTime + delay;
    const src = c.createBufferSource(); src.buffer = this.noise;
    const f = c.createBiquadFilter(); f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(g).connect(this.sfx);
    src.start(t, Math.random()); src.stop(t + dur + 0.05);
  }

  tone(type, f0, f1, dur, gain, delay = 0) {
    const c = this.ctx, t = c.currentTime + delay;
    const o = c.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.sfx); o.start(t); o.stop(t + dur + 0.05);
  }

  crash() {
    if (!this.ctx) return;
    this.burst(1.4, 'lowpass', 4000, 150, 1.0, 0.7);
    this.burst(0.5, 'highpass', 2500, 6000, 0.35, 0.7);
    this.tone('sine', 110, 32, 0.6, 0.9);
    [420, 613, 877, 1290].forEach((fq, i) => this.tone('square', fq, fq * 0.8, 0.25 + i * 0.08, 0.06, 0.02 * i));
    this.burst(0.3, 'bandpass', 1800, 900, 0.3, 3, 0.25); // glass/debris tinkle
  }

  nearMiss() {
    if (!this.ctx) return;
    this.burst(0.4, 'bandpass', 500, 3500, 0.45, 1.8);
    this.tone('sine', 1320, 1760, 0.18, 0.12, 0.05);
  }

  // ground impact (landing, falling wreck); strength ~ impact speed in m/s
  thud(strength = 5) {
    if (!this.ctx) return;
    const g = Math.min(1, strength / 12);
    this.tone('sine', 95, 35, 0.35, 0.6 * g);
    this.burst(0.35, 'lowpass', 1800, 200, 0.5 * g, 0.7);
  }

  bump() {
    if (!this.ctx) return;
    this.tone('sine', 140, 60, 0.2, 0.45);
    this.burst(0.25, 'bandpass', 1400, 500, 0.35, 1.5);
    [520, 790].forEach((fq) => this.tone('square', fq, fq * 0.85, 0.12, 0.04));
  }

  // short exhaust "pop" on an upshift
  shift() {
    if (!this.ctx) return;
    this.burst(0.09, 'bandpass', 900, 300, 0.22, 1.2);
    this.tone('square', 110, 70, 0.07, 0.05);
  }

  nitroStart() { if (this.ctx) this.burst(0.6, 'highpass', 600, 4000, 0.4, 0.8); }
  click() { if (this.ctx) this.tone('sine', 900, 1300, 0.07, 0.12); }
  beep(go) { if (this.ctx) this.tone('square', go ? 1046 : 523, go ? 1046 : 523, go ? 0.55 : 0.2, 0.12); }
}

// ---------- procedural synthwave soundtrack ----------
class Synthwave {
  constructor(ctx, out, noise) {
    this.ctx = ctx; this.out = out; this.noise = noise;
    this.bpm = 112; this.step = 0; this.timer = null;
    this.prog = [
      { root: 45, chord: [57, 60, 64] },   // Am
      { root: 41, chord: [53, 57, 60] },   // F
      { root: 48, chord: [55, 60, 64] },   // C
      { root: 43, chord: [55, 59, 62] },   // G
    ];
    const beat = 60 / this.bpm;
    this.delay = ctx.createDelay(1); this.delay.delayTime.value = beat * 0.75;
    const fb = ctx.createGain(); fb.gain.value = 0.32;
    const wet = ctx.createGain(); wet.gain.value = 0.3;
    this.delay.connect(fb).connect(this.delay);
    this.delay.connect(wet).connect(out);
    this.arpBus = ctx.createGain(); this.arpBus.connect(out); this.arpBus.connect(this.delay);
  }

  start() {
    if (this.timer) return;
    this.next = this.ctx.currentTime + 0.1;
    this.timer = setInterval(() => this.schedule(), 25);
  }

  schedule() {
    const now = this.ctx.currentTime;
    if (this.next < now - 0.05) this.next = now + 0.05; // tab was in background
    const spb = 60 / this.bpm / 4;
    while (this.next < now + 0.15) {
      this.play(this.step, this.next, spb);
      this.next += spb;
      this.step = (this.step + 1) % 64;
    }
  }

  play(s, t, spb) {
    const bar = Math.floor(s / 16) % 4, i = s % 16;
    const { root, chord } = this.prog[bar];
    if (i % 4 === 0) this.kick(t);
    if (i === 4 || i === 12) this.snare(t);
    if (i % 2 === 1) this.hat(t, i === 15 ? 0.1 : 0.045);
    if (i % 2 === 0) this.bass(mtof(root + (i % 4 === 2 ? 12 : 0)), t, spb * 1.7);
    const arp = [chord[0], chord[1], chord[2], chord[0] + 12];
    this.lead(mtof(arp[i % 4] + 12), t, spb * 0.9);
    if (i === 0) this.pad(chord, t, spb * 16);
  }

  env(g, t, a, peak, d) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }

  kick(t) {
    const c = this.ctx, o = c.createOscillator(), g = c.createGain();
    o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    this.env(g, t, 0.003, 0.9, 0.32);
    o.connect(g).connect(this.out); o.start(t); o.stop(t + 0.4);
  }

  snare(t) {
    const c = this.ctx, src = c.createBufferSource(); src.buffer = this.noise;
    const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 1300;
    const g = c.createGain(); this.env(g, t, 0.002, 0.32, 0.18);
    src.connect(f).connect(g).connect(this.out); src.start(t, Math.random()); src.stop(t + 0.25);
    const o = c.createOscillator(); o.type = 'triangle'; o.frequency.value = 190;
    const og = c.createGain(); this.env(og, t, 0.002, 0.18, 0.1);
    o.connect(og).connect(this.out); o.start(t); o.stop(t + 0.15);
  }

  hat(t, gain) {
    const c = this.ctx, src = c.createBufferSource(); src.buffer = this.noise;
    const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7500;
    const g = c.createGain(); this.env(g, t, 0.001, gain, gain > 0.06 ? 0.12 : 0.04);
    src.connect(f).connect(g).connect(this.out); src.start(t, Math.random()); src.stop(t + 0.2);
  }

  bass(freq, t, d) {
    const c = this.ctx, o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = freq;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = 6;
    f.frequency.setValueAtTime(1100, t); f.frequency.exponentialRampToValueAtTime(220, t + d);
    const g = c.createGain(); this.env(g, t, 0.005, 0.3, d);
    o.connect(f).connect(g).connect(this.out); o.start(t); o.stop(t + d + 0.05);
  }

  lead(freq, t, d) {
    const c = this.ctx, o = c.createOscillator(); o.type = 'square'; o.frequency.value = freq;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 2400;
    const g = c.createGain(); this.env(g, t, 0.004, 0.055, d);
    o.connect(f).connect(g).connect(this.arpBus); o.start(t); o.stop(t + d + 0.05);
  }

  pad(chord, t, d) {
    const c = this.ctx;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1000;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.05, t + 0.5);
    g.gain.setValueAtTime(0.05, t + d - 0.4);
    g.gain.linearRampToValueAtTime(0.0001, t + d);
    f.connect(g).connect(this.out);
    for (const n of chord) for (const det of [-8, 8]) {
      const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = mtof(n); o.detune.value = det;
      o.connect(f); o.start(t); o.stop(t + d + 0.05);
    }
  }
}
