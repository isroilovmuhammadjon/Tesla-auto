// Minimal GLB reader for the cars exported by scripts/cars/build_cars.py (meshes with POSITION / NORMAL and
// indices, one material per primitive, no textures). Returns { name: { geometry, materials: [names] } } where
// a mesh with several primitives becomes one geometry with groups (one per material).
import * as THREE from 'three';

const COMP = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };
const SIZE = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };

export async function loadGLB(url) {
  const buf = await (await fetch(url)).arrayBuffer();
  const dv = new DataView(buf);
  if (dv.getUint32(0, true) !== 0x46546c67) throw new Error('not a GLB: ' + url);
  let off = 12, json = null, bin = null;
  while (off < buf.byteLength) {
    const len = dv.getUint32(off, true), type = dv.getUint32(off + 4, true);
    if (type === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, off + 8, len)));
    else if (type === 0x004e4942) bin = buf.slice(off + 8, off + 8 + len);
    off += 8 + len;
  }
  const acc = (i) => {
    const a = json.accessors[i], bv = json.bufferViews[a.bufferView], T = COMP[a.componentType], n = SIZE[a.type];
    return new T(bin, (bv.byteOffset || 0) + (a.byteOffset || 0), a.count * n);
  };
  const out = {};
  for (const node of json.nodes || []) {
    if (node.mesh === undefined) continue;
    const mesh = json.meshes[node.mesh];
    const pos = [], nor = [], idx = [], groups = [], mats = [];
    let base = 0;
    for (const p of mesh.primitives) {
      const P = acc(p.attributes.POSITION), N = p.attributes.NORMAL !== undefined ? acc(p.attributes.NORMAL) : null;
      const I = p.indices !== undefined ? acc(p.indices) : null;
      const start = idx.length;
      for (let k = 0; k < P.length; k++) pos.push(P[k]);
      if (N) for (let k = 0; k < N.length; k++) nor.push(N[k]);
      if (I) for (let k = 0; k < I.length; k++) idx.push(I[k] + base); else for (let k = 0; k < P.length / 3; k++) idx.push(k + base);
      groups.push([start, idx.length - start, mats.length]);
      mats.push(p.material !== undefined ? json.materials[p.material].name : 'paint');
      base += P.length / 3;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    if (nor.length) g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); else g.computeVertexNormals();
    g.setIndex(idx);
    for (const [s, c, m] of groups) g.addGroup(s, c, m);
    // node transforms are identity in our exports (applied in Blender)
    out[node.name || mesh.name] = { geometry: g, materials: mats };
  }
  return out;
}
