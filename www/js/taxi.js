import * as THREE from 'three';
import { storageGet, storageSet } from './config.js';

function curb(seg) {
  const offset = seg.kind === 2 ? 6.6 : 4.2;
  return {
    x: (seg.ax + seg.bx) / 2 - (seg.bz - seg.az) / seg.len * offset,
    z: (seg.az + seg.bz) / 2 + (seg.bx - seg.ax) / seg.len * offset
  };
}

// Walk connected streets so both stops can be reached on the same road network.
function findTrip(city) {
  const { x, z } = city.state;
  const roads = city.roadsNear(x, z, 0, 130);
  roads.sort((a, b) => Math.hypot(a.ax + a.bx - 2*x, a.az + a.bz - 2*z)
                      - Math.hypot(b.ax + b.bx - 2*x, b.az + b.bz - 2*z));
  if (!roads.length) return null;
  const queue = [roads[0]], parent = new Map([[roads[0], null]]);
  let last;
  const targetDistance = 100 + Math.random() * 65;
  for (const seg of queue) {
    const stop = curb(seg);
    const distance = Math.hypot(stop.x - x, stop.z - z);
    if (distance > targetDistance && parent.get(seg)) { last = seg; break; }
    for (const key of seg.keys) for (const edge of city.nodes.get(key) || []) {
      if (!parent.has(edge.seg)) { parent.set(edge.seg, seg); queue.push(edge.seg); }
    }
  }
  if (!last) return null;
  // Pick the pickup along the same path as the destination.
  const path = [last];
  while (parent.get(path[0])) path.unshift(parent.get(path[0]));
  const pickup = path.find(seg => { const p = curb(seg); return Math.hypot(p.x-x,p.z-z)>18; }) || path[0];
  if (pickup === last) return null;
  return { pickup: curb(pickup), drop: curb(last) };
}

function marker() {
  const group = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.RingGeometry(2.2, 2.65, 40),
    new THREE.MeshBasicMaterial({color:0xffc04c, side:THREE.DoubleSide}));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.18;
  group.add(ring);
  const person = new THREE.Group();
  function part(geometry, color, x, y) {
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({color}));
    mesh.position.set(x,y,0); mesh.castShadow = true; person.add(mesh);
  }
  part(new THREE.CapsuleGeometry(.23,.42,4,10),0x257a84,0,1.1);
  part(new THREE.SphereGeometry(.17,12,10),0xbd8769,0,1.66);
  for (const side of [-1,1]) {
    part(new THREE.CapsuleGeometry(.09,.55,3,8),0x253041,.12*side,.44);
    part(new THREE.CapsuleGeometry(.07,.42,3,8),0x257a84,.27*side,1.08);
  }
  group.add(person); return {group,ring,person};
}

export class TaxiShift {
  constructor(city) {
    this.city = city;
    this.label = document.getElementById('taxiTrip');
    this.help = document.getElementById('taxiHelp');
    this.wallet = document.getElementById('taxiWallet');
    this.panel = document.getElementById('taxiPanel');
    this.active = false;
  }
  start() {
    this.stop();
    this.active = true;
    if (!this.pin) { this.pin = marker(); this.city.root.add(this.pin.group); }
    this.pin.group.visible = false;
    this.panel.hidden = false;
    this.balance = Math.max(0, Number(storageGet('sr3d_taxi_balance',0)) || 0);
    this.wallet.textContent = this.money(this.balance);
    this.label.textContent = 'Buyurtma qidirilmoqda…';
    this.help.textContent = 'Toshkent taksi';
    this.timer = 0;
  }
  money(n) { return n.toLocaleString('uz-UZ') + ' so‘m'; }
  stop() {
    this.active = false; this.panel.hidden = true; this.trip = null;
    this.city.taxiTarget = null;
    if (this.pin) this.pin.group.visible = false;
  }
  target(drop) {
    this.drop = drop; this.hold = 0;
    const p = drop ? this.trip.drop : this.trip.pickup;
    this.city.taxiTarget = p;
    this.pin.group.visible = true;
    this.pin.group.position.set(p.x,0,p.z);
    this.pin.person.visible = !drop;
    this.pin.ring.material.color.setHex(drop ? 0x5ce4ab : 0xffc04c);
    this.label.textContent = drop ? 'Yo‘lovchini eltish' : 'Yo‘lovchini olish';
  }
  update(dt) {
    if (!this.active) return;
    if (!this.trip) {
      this.timer -= dt;
      if (this.timer > 0) return;
      this.trip = findTrip(this.city);
      this.timer = 1;
      if (!this.trip) return;
      const {pickup,drop} = this.trip;
      this.fare = 1000 * Math.ceil(4 + Math.hypot(drop.x-pickup.x,drop.z-pickup.z)/60);
      this.target(false);
    }
    const p = this.city.taxiTarget, s = this.city.state;
    const dist = Math.hypot(p.x-s.x,p.z-s.z);
    const near = dist < 12;
    this.hold = near && Math.abs(s.v)<0.8 ? this.hold + dt : 0;
    const info = near ? 'Belgi yonida to‘xtang' : Math.round(dist) + ' m · ' + this.money(this.fare);
    if (this.help.textContent !== info) this.help.textContent = info;
    if (this.hold < 1) return;
    if (!this.drop) { this.target(true); return; }
    this.balance += this.fare;
    storageSet('sr3d_taxi_balance', this.balance);
    this.wallet.textContent = this.money(this.balance);
    this.label.textContent = 'Safar tugadi';
    this.help.textContent = '+' + this.money(this.fare);
    this.trip = null; this.city.taxiTarget = null;
    this.pin.group.visible = false; this.timer = 3;
  }
}
