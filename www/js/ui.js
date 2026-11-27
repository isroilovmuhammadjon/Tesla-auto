// DOM user interface: screens, HUD, garage, popups.
import { CARS } from './config.js';

const $ = (id) => document.getElementById(id);
const ARC_LEN = 395.84;   // 0.75 * 2π * 84
const CIRC = 527.79;
const SPEEDO_MAX = 360;

const fmt = (n) => Math.floor(n).toLocaleString('en-US');

export class UI {
  constructor() {
    this.screens = ['loading', 'menu', 'garage', 'pause', 'gameover', 'mp', 'mpResults', 'settings', 'taxiGarage'].map($);
    this.hud = $('hud');
    this.els = {
      score: $('hudScore'), dist: $('hudDist'), best: $('hudBest'),
      speed: $('hudSpeed'), gear: $('hudGear'), arc: $('spdArc'), nitro: $('hudNitro'),
      nitroBar: $('hudNitro').parentElement, combo: $('combo'), popups: $('popups'),
      countdown: $('countdown'), speedlines: $('speedlines'), flash: $('flash'),
      pauseBtn: $('pauseBtn'), muteBtn: $('muteBtn'), hint: $('hudHint'), fps: $('fps'),
      alt: $('hudAlt'), altRow: $('altRow'), rival: $('hudRival'), rivalRow: $('rivalRow'),
    };
    this.last = {};
    this.buildTicks();
  }

  buildTicks() {
    const g = $('speedoTicks');
    const ns = 'http://www.w3.org/2000/svg';
    for (let v = 0; v <= SPEEDO_MAX; v += 20) {
      const major = v % 60 === 0;
      const a = ((135 + (v / SPEEDO_MAX) * 270) * Math.PI) / 180;
      const r1 = 72, r2 = major ? 62 : 66;
      const line = document.createElementNS(ns, 'line');
      line.setAttribute('x1', 100 + Math.cos(a) * r1); line.setAttribute('y1', 100 + Math.sin(a) * r1);
      line.setAttribute('x2', 100 + Math.cos(a) * r2); line.setAttribute('y2', 100 + Math.sin(a) * r2);
      line.setAttribute('class', major ? 'tick major' : 'tick');
      g.appendChild(line);
      if (major) {
        const t = document.createElementNS(ns, 'text');
        t.setAttribute('x', 100 + Math.cos(a) * 52); t.setAttribute('y', 100 + Math.sin(a) * 52);
        t.setAttribute('class', 'tick-label');
        t.textContent = v;
        g.appendChild(t);
      }
    }
  }

  show(name) {
    for (const s of this.screens) s.classList.toggle('active', s.id === name);
  }

  setHud(visible) {
    this.hud.classList.toggle('hidden', !visible);
    this.els.pauseBtn.classList.toggle('hidden', !visible);
    document.querySelectorAll('.race-only').forEach((b) => b.classList.toggle('hidden', !visible));
  }

  setMuted(m) {
    this.els.muteBtn.classList.toggle('off', m);
    this.els.muteBtn.textContent = m ? '♪' : '♪';
    this.els.muteBtn.title = m ? 'Sound off (M)' : 'Sound on (M)';
  }

  setMenuInfo(best, carName) {
    $('menuBest').textContent = fmt(best);
    $('menuCar').textContent = carName;
  }

  setText(key, el, value) {
    if (this.last[key] !== value) { this.last[key] = value; el.textContent = value; }
  }

  updateHud({ speedKmh, gear, nitro, nitroActive, score, distance, best, combo, comboOn }) {
    const e = this.els;
    this.setText('speed', e.speed, String(Math.round(speedKmh)));
    this.setText('gear', e.gear, String(gear));
    this.setText('score', e.score, fmt(score));
    this.setText('dist', e.dist, (distance / 1000).toFixed(2) + ' KM');
    this.setText('best', e.best, fmt(best));
    // only touch the DOM when a value actually changes
    const f = Math.min(1, speedKmh / SPEEDO_MAX);
    const arc = `${(ARC_LEN * f).toFixed(0)} ${CIRC}`;
    if (this.last.arc !== arc) { this.last.arc = arc; e.arc.style.strokeDasharray = arc; }
    const nw = (nitro * 100).toFixed(0) + '%';
    if (this.last.nitro !== nw) { this.last.nitro = nw; e.nitro.style.width = nw; }
    if (this.last.nitroOn !== nitroActive) { this.last.nitroOn = nitroActive; e.nitroBar.classList.toggle('active', nitroActive); }
    this.setText('combo', e.combo, comboOn ? `COMBO x${combo}` : '');
    if (this.last.comboOn !== comboOn) { this.last.comboOn = comboOn; e.combo.classList.toggle('on', comboOn); }
  }

  setSpeedLines(v) {
    const s = v.toFixed(2);
    if (this.last.lines !== s) {
      this.last.lines = s;
      this.els.speedlines.style.opacity = s;
      this.els.speedlines.classList.toggle('on', v > 0.02); // animate only while visible
    }
  }

  popup(text, warn = false) {
    const d = document.createElement('div');
    d.className = 'popup' + (warn ? ' warn' : '');
    d.textContent = text;
    this.els.popups.appendChild(d);
    setTimeout(() => d.remove(), 1300);
  }

  countdown(value) {
    const c = this.els.countdown;
    c.innerHTML = '';
    if (value === null) return;
    const s = document.createElement('span');
    s.className = 'num' + (value === 'GO!' ? ' go' : '');
    s.textContent = value;
    c.appendChild(s);
  }

  flash() {
    const f = this.els.flash;
    f.classList.remove('on');
    void f.offsetWidth; // restart animation
    f.classList.add('on');
  }

  // altitude readout for the flying car; null hides it
  setAltitude(m) {
    this.els.altRow.classList.toggle('hidden', m === null);
    document.body.classList.toggle('can-fly', m !== null);
    if (m !== null) this.setText('alt', this.els.alt, `${Math.max(0, m).toFixed(1)} M`);
    this.els.hint.textContent = m === null
      ? 'W / ↑ accelerate · A D / ← → steer · SPACE nitro'
      : 'W accelerate · A D steer · E / Q fly up / down · SPACE nitro';
  }

  // lead > 0: the AI rival is ahead of you by `lead` metres
  // generic info row in the score panel (AI rival gap, or race position in multiplayer)
  setInfo(label, text, cls = '') {
    this.els.rivalRow.classList.remove('hidden');
    this.setText('infoLabel', this.els.rivalRow.firstElementChild, label);
    this.setText('rival', this.els.rival, text);
    if (this.last.rivalCls !== cls) { this.last.rivalCls = cls; this.els.rival.className = cls; }
  }

  setRival(lead, name) {
    this.els.rivalRow.classList.remove('hidden');
    this.setText('infoLabel', this.els.rivalRow.firstElementChild, 'AI RIVAL');
    const m = Math.round(Math.abs(lead));
    const txt = lead > 0 ? `▼ ${m} M` : `▲ ${m} M`;
    this.setText('rival', this.els.rival, txt);
    const cls = lead > 0 ? 'lose' : 'win';
    if (this.last.rivalCls !== cls) { this.last.rivalCls = cls; this.els.rival.className = cls; }
  }

  setFps(fps) { this.setText('fps', this.els.fps, `${fps} FPS`); }

  hint(visible) { this.els.hint.classList.toggle('fade', !visible); }

  renderGarage(index, equipped) {
    const car = CARS[index];
    $('garageName').textContent = car.name;
    $('garageTag').textContent = car.tagline;
    $('garageCount').textContent = `${index + 1} / ${CARS.length}`;
    const stats = [
      ['statSpeed', car.maxSpeed / 340, car.maxSpeed + ''],
      ['statAccel', car.accel / 1.3, (car.accel * 8).toFixed(1)],
      ['statHandling', car.handling / 1.35, (car.handling * 8).toFixed(1)],
      ['statNitro', car.nitro / 1.25, (car.nitro * 8).toFixed(1)],
    ];
    for (const [id, f, label] of stats) {
      $(id).style.width = Math.round(Math.min(1, f) * 100) + '%';
      $(id + 'Val').textContent = label;
    }
    const isEq = index === equipped;
    $('garageBadge').classList.toggle('off', !isEq);
    const btn = $('selectBtn');
    btn.disabled = isEq;
    btn.querySelector('span').textContent = isEq ? 'EQUIPPED' : 'SELECT CAR';
  }

  showGameOver({ score, distance, topSpeed, nearMisses, best, isBest, rivalLead, rivalName }) {
    $('goScore').textContent = fmt(score);
    $('goDist').textContent = (distance / 1000).toFixed(2) + ' KM';
    $('goTop').textContent = Math.round(topSpeed) + ' KM/H';
    $('goNear').textContent = nearMisses;
    $('goBest').textContent = fmt(best);
    $('newBest').classList.toggle('hidden', !isBest);
    const box = $('goRivalBox');
    box.classList.toggle('hidden', rivalLead === null || rivalLead === undefined);
    if (rivalLead !== null && rivalLead !== undefined) {
      const m = Math.round(Math.abs(rivalLead));
      const el = $('goRival');
      el.textContent = rivalLead > 0 ? `${rivalName} WON BY ${m} M` : `YOU WON BY ${m} M`;
      el.className = rivalLead > 0 ? 'lose' : 'win';
    }
    this.show('gameover');
  }
}
