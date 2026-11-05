
/* ---------- generated 3D models (Higgsfield) ---------- */
const TPL = {};
const TPL_SPEC = {
  suv: { len: 5.0 }, sedan: { len: 4.8 }, pickup: { len: 5.4 }, minivan: { len: 5.1 }, hatch: { len: 4.0 }, hazevan: { len: 6.0 },
  dumpster: { w: 2.0 }, bin: { h: 1.05 }, cart: { len: 1.0 }, mailbox: { h: 1.15 }, bench: { w: 3.4 },
  house1: { w: 11 }, house2: { w: 11 }, house3: { w: 11 }, machine: { h: 10 },
  mall: { w: 42 }, gas: { w: 20 }, apts: { w: 30 }, church: { len: 20 },
  shrub: { h: 1.25 }, joshua: { h: 5 }, boulder: { w: 2.2 },
  rifle: { raw: true }, rifle_lo: { raw: true }, pistol: { len: .2 },
};
const CIV_CARS = ['suv', 'sedan', 'pickup', 'minivan', 'hatch'];
function toFloat(geo) { for (const n in geo.attributes) { const a = geo.attributes[n]; if (a.array instanceof Float32Array && !a.isInterleavedBufferAttribute) continue; const arr = new Float32Array(a.count * a.itemSize); for (let i = 0; i < a.count; i++) for (let k = 0; k < a.itemSize; k++) arr[i * a.itemSize + k] = a.getComponent(i, k); geo.setAttribute(n, new THREE.BufferAttribute(arr, a.itemSize)); } return geo; }
function makeTemplate(key, gltf) {
  let m = null; gltf.scene.updateMatrixWorld(true); gltf.scene.traverse(o => { if (o.isMesh && !m) m = o; }); if (!m) return;
  const geo = toFloat(m.geometry.clone()); geo.applyMatrix4(m.matrixWorld); if (!geo.attributes.normal) geo.computeVertexNormals();
  const mat = m.material; mat.emissiveMap = null; mat.emissive && mat.emissive.set(0x000000); if (!mat.metalnessMap) mat.metalness = .05; mat.roughness = Math.max(mat.roughness, .55);
  const spec = TPL_SPEC[key] || {};
  if (!spec.raw) { geo.computeBoundingBox(); const b = geo.boundingBox, sz = b.getSize(new THREE.Vector3()); geo.translate(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2); const k = spec.len ? spec.len / sz.z : spec.w ? spec.w / sz.x : spec.h / sz.y; geo.scale(k, k, k); TPL[key] = { key, geo, mat, w: sz.x * k, h: sz.y * k, d: sz.z * k }; }
  else TPL[key] = { key, geo, mat };
}
const INST = {}; const CHUNKS = []; const _UP = new THREE.Vector3(0, 1, 0);
function inst(key, x, y, z, ry, color, s = 1) { if (!TPL[key]) return; const ck = key + '|' + Math.floor((x + 256) / 64) + ',' + Math.floor((z + 256) / 64); (INST[ck] || (INST[ck] = [])).push({ x, y, z, ry, color, s }); }
function buildInstances() {
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), c = new THREE.Color();
  for (const ck in INST) {
    const k = ck.split('|')[0], t = TPL[k], list = INST[ck]; const im = new THREE.InstancedMesh(t.geo, t.mat, list.length); const tinted = list.some(p => p.color);
    list.forEach((p, i) => { q.setFromAxisAngle(_UP, p.ry); m4.compose(_v.set(p.x, p.y, p.z), q, _sc.set(p.s, p.s, p.s)); im.setMatrixAt(i, m4); if (tinted) im.setColorAt(i, c.set(p.color || '#ffffff')); });
    im.castShadow = im.receiveShadow = true; im.computeBoundingSphere(); scene.add(im); CHUNKS.push({ im, c: im.boundingSphere.center.clone(), r: im.boundingSphere.radius });
  }
}
const BLOBS = [];
function buildBlobs() {
  if (!BLOBS.length) return;
  const im = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: TX.blob, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -16 }), BLOBS.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion();
  BLOBS.forEach((b, i) => { q.setFromAxisAngle(_UP, b.ry); m4.compose(_v.set(b.x, .03, b.z), q, _sc.set(b.w, 1, b.d)); im.setMatrixAt(i, m4); });
  im.renderOrder = 1; scene.add(im);
}
function placeCar(x, z, ry, key) {
  const t = TPL[key || pick(CIV_CARS)]; if (!t) return;
  inst(t.key, x, 0, z, ry + Math.PI / 2);
  BLOBS.push({ x, z, ry, w: t.d * 1.12, d: t.w * 1.3 });
  addCollider(x, z, t.d, t.w, t.h * .92, ry, 0, { noBullet: true });
  addCollider(x, z, t.d, t.w, t.h * .55, ry, 0, { noMove: true, metal: true });
  addCollider(x, z, t.d * .55, t.w * .92, t.h, ry, 0, { noMove: true, metal: true });
}
function prop(key, x, z, ry, o = {}) { const t = TPL[key]; if (!t) return; const s = o.s || 1; inst(key, x, 0, z, ry, o.color, s); if (o.collide !== false) addCollider(x, z, t.w * .9 * s, t.d * .9 * s, t.h * s, ry, 0, { noBullet: !!o.noBullet }); }

/* ---------- small procedural pieces ---------- */
function palm(x, y, z, r = Math.random) {
  const h = 6.5 + r() * 3.8, lean = (r() - .5) * .14, la = r() * 6.28;
  const tg = new THREE.CylinderGeometry(.17, .28, h, 8, 6); tg.translate(0, h / 2, 0);
  const uv = tg.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i), uv.getY(i) * h / 2);
  put('trunk', tg, '#ffffff', x, y, z, la, lean, 0);
  const tx = x + Math.sin(la) * Math.sin(lean) * h, tz = z + Math.cos(la) * Math.sin(lean) * h, ty = y + h * Math.cos(lean);
  put('trunk', new THREE.SphereGeometry(.42, 8, 6), '#9a8466', tx, ty - .15, tz);
  const n = 10 + Math.floor(r() * 4);
  for (let i = 0; i < n; i++) put('frond', frondGeo(r), pick(['#d7e0b8', '#c6d4a3', '#e2d9a8', '#bcc796'], r), tx, ty, tz, i / n * Math.PI * 2 + r() * .3, .75 + r() * .6, 0);
  addCollider(x, z, .5, .5, h, 0, 0, { noBullet: true });
}
// a frond bends down along its length and folds into a shallow V across its width
function frondGeo(r) {
  const g = new THREE.PlaneGeometry(1.2, 4.6, 2, 7); g.translate(0, 2.3, 0);
  const p = g.attributes.position, droop = 1.3 + r() * 1.2;
  for (let k = 0; k < p.count; k++) { const x = p.getX(k), y = p.getY(k), t = y / 4.6; p.setZ(k, t * t * droop + Math.abs(x) * .32); }
  g.computeVertexNormals(); return g;
}
function yucca(x, y, z, s = 1) { for (let i = 0; i < 7; i++) { const g = new THREE.ConeGeometry(.11 * s, 1.45 * s, 4); g.translate(0, .72 * s, 0); put('plain', g, pick(['#556b35', '#4e6431', '#5f7a3b']), x, y, z, i * .9, (i % 3) * .3 + .2, 0); } }
function shrub(x, z, s = 1, ry = Math.random() * 6.28) { if (TPL.shrub) inst('shrub', x, 0, z, ry, null, s * (.8 + Math.random() * .5)); else yucca(x, 0, z, s); }
function container(x, z, ry, color) { addBox('plain', 6.06, 2.6, 2.44, x, 0, z, color, { collide: true, ry }); for (let i = -2.7; i <= 2.7; i += .45) addBox('plain', .1, 2.5, 2.5, x + Math.cos(ry) * i, .05, z - Math.sin(ry) * i, color, { ry }); BLOBS.push({ x, z, ry, w: 7, d: 3.4 }); }
let _jersey;
function barrier(x, z, ry) {
  if (!_jersey) { const s = new THREE.Shape(); s.moveTo(-.31, 0); s.lineTo(.31, 0); s.lineTo(.31, .08); s.lineTo(.13, .3); s.lineTo(.09, .84); s.lineTo(-.09, .84); s.lineTo(-.13, .3); s.lineTo(-.31, .08); s.closePath(); _jersey = new THREE.ExtrudeGeometry(s, { depth: 2.96, bevelEnabled: true, bevelSize: .02, bevelThickness: .02, bevelSegments: 1, curveSegments: 1 }); _jersey.translate(0, 0, -1.48); }
  put('concrete', _jersey.clone(), '#d9d4cc', x, 0, z, ry + Math.PI / 2);
  addCollider(x, z, 3, .62, .84, ry, 0, { exact: true });
}
const streetGlows = [], floodGlows = [], signs = [];
function lightCone(x, y, z, len, rad, color, ry = 0, rx = 0) { const g = new THREE.CylinderGeometry(.22, rad, len, 18, 1, true); g.translate(0, -len / 2, 0); put('lightcone', g, color, x, y, z, ry, rx); }
function floodlight(x, z, dx, dz) {
  put('metal', new THREE.CylinderGeometry(.12, .18, 9, 8).translate(0, 4.5, 0), '#55575b', x, 0, z);
  const ry = Math.atan2(dx, dz);
  addBox('metal', 2.2, .5, .5, x, 8.8, z, '#2e3034', { ry });
  for (const s of [-.65, .65]) { const lx = x + Math.cos(ry) * s, lz = z - Math.sin(ry) * s; floodGlows.push(new THREE.Vector3(lx + dx * .3, 8.95, lz + dz * .3)); lightCone(lx + dx * .3, 8.9, lz + dz * .3, 11, 4.2, '#fff2d0', ry, -.62); }
  addCollider(x, z, .4, .4, 9, 0, 0, { noBullet: true });
}

/* ---------- build the neighborhood from the layout ---------- */
let LAY;
const machineSpots = [], neighborSpots = [];
function buildWorld() {
  LAY = makeLayout(THREE);
  const r = srand;
  const L2W = (o, lx, lz) => { const c = Math.cos(o.ry), s = Math.sin(o.ry); return { x: o.cx + lx * c + lz * s, z: o.cz - lx * s + lz * c }; };
  // desert floor
  const gG = planeGeo(1500, 1500, 10, 60); gG.rotateX(-Math.PI / 2);
  const ground = new THREE.Mesh(gG, new THREE.MeshLambertMaterial({ map: TX.dirt, color: '#cdb596' })); ground.receiveShadow = true; scene.add(ground);

  // ----- roads, curbs, sidewalks, paint -----
  const nearOwnBulb = (rd, x, z) => rd.culdesac && Math.hypot(x - rd.end.x, z - rd.end.z) < 11.6;
  LAY.roads.forEach((rd, i) => {
    const y = .02 + i * .0015, hw = rd.w / 2;
    ribbon('asphalt', rd.samples, -hw, hw, y, '#ffffff', 8);
    for (const sd of [-1, 1]) {
      const ok = sm => { const px = sm.x + sm.nx * sd * (hw + 1.2), pz = sm.z + sm.nz * sd * (hw + 1.2); return LAY.roadEdgeDist(px, pz, rd).d > .35 && !nearOwnBulb(rd, px, pz); };
      const a = hw + .24, b = hw + 2.4;
      ribbon('concrete', rd.samples, sd > 0 ? a : -b, sd > 0 ? b : -a, .11, '#ffffff', 2, ok);
      ribbon('curb', rd.samples, sd * hw, sd * hw, .02, '#e9e4da', 1, ok, .12, -sd);
      ribbon('concrete', rd.samples, sd > 0 ? hw : -a, sd > 0 ? a : -hw, .12, '#f2eee6', 1, ok);
    }
    const farX = sm => !LAY.intersections.some(q => (q.a === rd || q.b === rd) && Math.hypot(q.x - sm.x, q.z - sm.z) < (q.a === rd ? q.b.w : q.a.w) / 2 + 3.2);
    if (rd.median) {
      ribbon('median', rd.samples, -1.1, 1.1, .13, '#d8d2c8', 2, farX);
      for (const sd of [-1, 1]) ribbon('curb', rd.samples, sd * 1.1, sd * 1.1, .02, '#e9e4da', 1, farX, .13, sd);
      for (const sd of [-1, 1]) ribbon('paint', rd.samples, sd * hw / 2 - .07, sd * hw / 2 + .07, y + .004, '#efece4', 1, sm => farX(sm) && Math.floor(sm.s / 3) % 3 === 0);
    } else {
      ribbon('paint', rd.samples, -.27, -.13, y + .004, '#e2b020', 1, farX);
      ribbon('paint', rd.samples, .13, .27, y + .004, '#e2b020', 1, farX);
    }
    if (rd.w >= 11) for (const sd of [-1, 1]) ribbon('paint', rd.samples, sd > 0 ? hw - .62 : -(hw - .48), sd > 0 ? hw - .48 : -(hw - .62), y + .004, '#efece4', 1, farX);
  });
  for (const b of LAY.bulbs) {
    const end = b.road.samples[b.road.samples.length - 1], back = Math.atan2(-end.tz, -end.tx), gap = Math.asin(Math.min(.99, (b.road.w / 2 + .4) / 11.2)) * 1.15;
    const disc = new THREE.CircleGeometry(b.r, 40); disc.rotateX(-Math.PI / 2); const du = disc.attributes.uv; for (let k = 0; k < du.count; k++) du.setXY(k, du.getX(k) * b.r * 2 / 8, du.getY(k) * b.r * 2 / 8);
    put('asphalt', disc, '#ffffff', b.x, .022, b.z);
    // RingGeometry angles run counter-clockwise from +x in its own plane; after laying flat (x,y)->(x,-z)
    const ring = new THREE.RingGeometry(b.r + .24, b.r + 2.4, 48, 1, -back + gap, Math.PI * 2 - gap * 2); ring.rotateX(-Math.PI / 2); put('concrete', ring, '#ffffff', b.x, .11, b.z);
    const face = new THREE.CylinderGeometry(b.r, b.r, .1, 48, 1, true, Math.PI / 2 - back + gap, Math.PI * 2 - gap * 2); put('curb', face, '#e9e4da', b.x, .07, b.z);
  }
  for (const c of LAY.crosswalks) { const ry = Math.atan2(c.tx, c.tz), nx = -c.tz, nz = c.tx; for (let k = -c.w / 2 + .7; k <= c.w / 2 - .6; k += 1.15) addFlat('paint', .55, 2.8, c.x + nx * k, .04, c.z + nz * k, '#ece8de', 1, ry); }

  // ----- houses and their lots -----
  for (const h of LAY.houses) {
    const t = TPL[h.model]; if (!t) continue;
    inst(h.model, h.cx, 0, h.cz, h.ry, pick(['#ffffff', '#f4ece4', '#fff4ea', '#ece6f0', '#f6efe2', '#f0e6dc'], r));
    const cc = L2W(h, 0, 0); addCollider(cc.x, cc.z, t.w * .94, t.d * .9, t.h * .85, h.ry);
  }
  for (const y of LAY.yards) { const c = L2W({ cx: y.x, cz: y.z, ry: y.ry }, y.ox, y.oz); addFlat('yard', y.w, y.d, c.x, .008, c.z, pick(['#ffffff', '#f0e8dc', '#e6ddd0'], r), 3, y.ry); }
  for (const d of LAY.driveways) addFlat('drive', d.w, d.d, d.x, .016, d.z, '#ece8e0', 2, d.ry);
  for (const w of LAY.walls) addBox('block', w.w, 1.8, w.d, w.cx, 0, w.cz, '#d6cbbb', { collide: true, ry: w.ry, tex: 1.6 });
  for (const p of LAY.plants) { if (p.kind === 'palm') palm(p.x, 0, p.z, r); else if (p.kind === 'yucca') yucca(p.x, 0, p.z); else shrub(p.x, p.z, .9); }
  for (const b of LAY.bins) prop('bin', b.x, b.z, b.ry, { noBullet: true });
  for (const m of LAY.mailboxes) prop('mailbox', m.x, m.z, m.ry, { noBullet: true });
  for (const c of LAY.parkedCars) placeCar(c.x, c.z, c.ry);
  for (const c of LAY.curbCars) placeCar(c.x, c.z, c.ry);
  for (const c of LAY.strandedCars) placeCar(c.x, c.z, c.ry);
  for (const s of LAY.neighborSpots) neighborSpots.push(s);

  // ----- street lights (with volumetric cones that read through the haze) -----
  for (const L of LAY.streetlights) {
    put('metal', new THREE.CylinderGeometry(.09, .14, 7.6, 8).translate(0, 3.8, 0), '#5d5f63', L.x, 0, L.z);
    const ry = Math.atan2(L.ax, L.az);
    addBox('metal', .1, .1, 2.7, L.x + L.ax * 1.25, 7.45, L.z + L.az * 1.25, '#5d5f63', { ry });
    const hx = L.x + L.ax * 2.55, hz = L.z + L.az * 2.55;
    addBox('metal', .55, .16, .32, hx, 7.32, hz, '#3b3d40', { ry });
    streetGlows.push(new THREE.Vector3(hx, 7.22, hz));
    lightCone(hx, 7.22, hz, 7.2, 3.3, '#ffb066');
    addFlat('glowDecal', 13, 13, hx, .13, hz, '#ff9a4a', 13);
    addCollider(L.x, L.z, .3, .3, 7.6, 0, 0, { noBullet: true });
  }
  // ----- power poles and sagging lines -----
  { const wires = [], byRoad = {}; for (const p of LAY.poles) (byRoad[p.road] || (byRoad[p.road] = [])).push(p);
    for (const k in byRoad) { const ps = byRoad[k]; ps.forEach((p, i) => {
      put('wood', new THREE.CylinderGeometry(.12, .17, 9.6, 7).translate(0, 4.8, 0), '#5b4636', p.x, 0, p.z);
      const nx = -p.tz, nz = p.tx; addBox('wood', .16, .16, 2.4, p.x, 8.9, p.z, '#4e3c2e', { ry: Math.atan2(nx, nz) });
      addCollider(p.x, p.z, .35, .35, 9.6, 0, 0, { noBullet: true });
      const q = ps[i - 1]; if (q && Math.hypot(q.x - p.x, q.z - p.z) < 45) for (const o of [-1, 0, 1]) { const ax = q.x - q.tz * o, az = q.z + q.tx * o, bx = p.x + nx * o, bz = p.z + nz * o; let px = ax, py = 9.05, pz = az; for (let s = 1; s <= 10; s++) { const t = s / 10, x = lerp(ax, bx, t), z = lerp(az, bz, t), yy = 9.05 - .7 * 4 * t * (1 - t); wires.push(px, py, pz, x, yy, z); px = x; py = yy; pz = z; } }
    }); }
    const wg = new THREE.BufferGeometry(); wg.setAttribute('position', new THREE.Float32BufferAttribute(wires, 3)); scene.add(new THREE.LineSegments(wg, new THREE.LineBasicMaterial({ color: '#1d1a1f' })));
  }
  for (const s of LAY.shelters) prop('bench', s.cx, s.cz, s.ry);
  for (const p of LAY.medianPalms) palm(p.x, .13, p.z, r);
  for (const s of LAY.scatter) { if (s.kind === 'shrub') shrub(s.x, s.z, s.s, s.r); else if (s.kind === 'yucca') yucca(s.x, 0, s.z, s.s); else if (s.kind === 'boulder') { if (TPL.boulder) prop('boulder', s.x, s.z, s.r, { s: s.s }); } else if (TPL.joshua) prop('joshua', s.x, s.z, s.r, { s: .8 + s.s * .3, noBullet: true }); }

  // ----- the strip mall (Star Mart) -----
  { const o = LAY.mall, t = TPL.mall;
    if (t) { inst('mall', o.cx, 0, o.cz, o.ry); const cc = L2W(o, 0, -t.d * .12); addCollider(cc.x, cc.z, t.w * .97, t.d * .72, t.h, o.ry); }
    const w = t ? t.w : 42, d = t ? t.d : 20, h = t ? t.h : 5.5;
    const lot = L2W(o, 0, d / 2 + 9.5); addFlat('lot', w + 6, 17.5, lot.x, .018, lot.z, '#dcdcdc', 8, o.ry);
    for (let k = -6; k <= 6; k++) { const p = L2W(o, k * 3.2, d / 2 + 6.5); addFlat('paint', .14, 5.2, p.x, .03, p.z, '#f0eee6', 1, o.ry); }
    for (let k = 0; k < 6; k++) { const p = L2W(o, (Math.floor(r() * 12) - 5.5) * 3.2, d / 2 + 6.5); placeCar(p.x, p.z, o.ry + Math.PI / 2 + (r() < .5 ? 0 : Math.PI)); }
    for (let k = 0; k < 3; k++) { const p = L2W(o, (r() - .5) * w * .8, d / 2 + 12 + r() * 4); prop('cart', p.x, p.z, r() * 6.28, { noBullet: true }); }
    const shops = [['STAR MART', '24 HRS', '#1a1222', '#f2c14e'], ['NORTH STAR CUTS', 'BARBER', '#101820', '#7fe3ff'], ['LOW KEY', 'WINGS & FISH', '#1a0f0f', '#ff7a5a'], ['DBN', 'COMMUNITY CENTER', '#140f1e', '#c79bff']];
    shops.forEach((s, i) => { const p = L2W(o, (i - 1.5) * w / 4, d / 2 + .12); signs.push({ x: p.x, y: h * .66, z: p.z, w: w / 4 * .72, h: h * .17, ry: o.ry, tex: signTex([{ t: s[0], s: 64, y: 50, c: s[3], glow: 18 }, { t: s[1], s: 30, y: 104, c: '#ffffff' }], s[2], s[3]) }); });
    const mp = L2W(o, -w / 2 - .1, 0); signs.push({ x: mp.x, y: 2.6, z: mp.z, w: 14, h: 3.5, ry: o.ry - Math.PI / 2, tex: muralTex(), lit: true });
    const ps = L2W(o, w / 2 + 1.2, d / 2 + 16); addBox('metal', .4, 7, .4, ps.x, 0, ps.z, '#5d5f63', { collide: true });
    signs.push({ x: ps.x, y: 8.4, z: ps.z, w: 5, h: 3, ry: o.ry, tex: signTex([{ t: '★', s: 72, y: 46, c: '#f2c14e', glow: 30 }, { t: 'OPEN LATE', s: 34, y: 100, c: '#fff' }], '#1a1222', '#f2c14e', 256, 160) });
    for (const sx of [-w / 3, w / 3]) { const lp = L2W(o, sx, d / 2 + 14); put('metal', new THREE.CylinderGeometry(.1, .14, 8, 8).translate(0, 4, 0), '#5d5f63', lp.x, 0, lp.z); streetGlows.push(new THREE.Vector3(lp.x, 8.1, lp.z)); lightCone(lp.x, 8.1, lp.z, 8, 3.6, '#ffd9a0'); }
    neighborSpots.push({ ...L2W(o, -10, d / 2 + 3), yaw: o.ry }, { ...L2W(o, 12, d / 2 + 3), yaw: o.ry });
  }
  // ----- gas station -----
  { const o = LAY.gas, t = TPL.gas;
    if (t) { inst('gas', o.cx, 0, o.cz, o.ry); const cc = L2W(o, 0, -t.d * .3); addCollider(cc.x, cc.z, t.w * .55, t.d * .32, t.h * .6, o.ry); }
    const w = t ? t.w : 20, d = t ? t.d : 22; addFlat('drive', w + 5, d + 5, o.cx, .014, o.cz, '#d9d4cc', 2, o.ry);
    const sp = L2W(o, w / 2 + 2, d / 2 + 2); addBox('metal', .35, 6.5, .35, sp.x, 0, sp.z, '#5d5f63', { collide: true });
    signs.push({ x: sp.x, y: 7.4, z: sp.z, w: 3.6, h: 2.6, ry: o.ry, tex: signTex([{ t: 'STAR GAS', s: 48, y: 40, c: '#ff5a4a', glow: 14 }, { t: 'CLOSED', s: 40, y: 100, c: '#ffffff' }], '#141018', '#ff5a4a', 256, 160) });
    placeCar(...Object.values(L2W(o, -3, 2)), o.ry + Math.PI / 2);
  }
  // ----- apartments and church -----
  for (const [o, key] of [[LAY.apts, 'apts'], [LAY.church, 'church']]) {
    const t = TPL[key]; if (!t) continue;
    inst(key, o.cx, 0, o.cz, o.ry); const cc = L2W(o, 0, key === 'apts' ? -t.d * .12 : 0); addCollider(cc.x, cc.z, t.w * .94, t.d * (key === 'apts' ? .7 : .9), t.h * .85, o.ry);
    const lot = L2W(o, 0, t.d / 2 + 4); addFlat('lot', t.w + 2, 7, lot.x, .018, lot.z, '#dcdcdc', 8, o.ry);
    for (let k = 0; k < 2; k++) { const p = L2W(o, (r() - .5) * t.w * .7, t.d / 2 + 4); placeCar(p.x, p.z, o.ry + Math.PI / 2); }
  }
  // ----- the park -----
  { const o = LAY.park;
    const disc = new THREE.CircleGeometry(1, 48); disc.scale(o.w / 2 + 2, o.d / 2 + 2, 1); disc.rotateX(-Math.PI / 2); const du = disc.attributes.uv; for (let k = 0; k < du.count; k++) du.setXY(k, du.getX(k) * o.w / 4, du.getY(k) * o.d / 4); put('grass', disc, '#ffffff', o.cx, .012, o.cz, o.ry);
    const cp = L2W(o, 8, 0); const ct = planeGeo(15, 27, 1); const cu = ct.attributes.uv; for (let i = 0; i < cu.count; i++) cu.setXY(i, cu.getX(i) / 15, cu.getY(i) / 27); put('court', ct, '#ffffff', cp.x, .02, cp.z, o.ry, -Math.PI / 2);
    for (const s of [-1, 1]) { const hp = L2W(o, 8, s * 14.4), bb = L2W(o, 8, s * 13.5), rim = L2W(o, 8, s * 13.1);
      put('metal', new THREE.CylinderGeometry(.08, .1, 3.3, 10).translate(0, 1.65, 0), '#4a4c50', hp.x, 0, hp.z); addCollider(hp.x, hp.z, .25, .25, 3.3, 0, 0, { noBullet: true });
      addBox('metal', .1, .1, .9, (hp.x + bb.x) / 2, 3.15, (hp.z + bb.z) / 2, '#4a4c50', { ry: o.ry });
      addBox('plain', 1.8, 1.05, .05, bb.x, 2.85, bb.z, '#e8e8e8', { ry: o.ry });
      put('metal', new THREE.TorusGeometry(.23, .018, 6, 20).rotateX(Math.PI / 2), '#d8582a', rim.x, 3.05, rim.z); }
    for (const [lx, lz, col] of [[-12, -8, '#c94f6d'], [-12, 8, '#3f8fa3']]) {
      for (const [a, b] of [[-2.6, -2.6], [2.6, -2.6], [-2.6, 2.6], [2.6, 2.6]]) { const pp = L2W(o, lx + a, lz + b); put('metal', new THREE.CylinderGeometry(.06, .08, 3.2, 8).translate(0, 1.6, 0), '#5a5f66', pp.x, 0, pp.z); addCollider(pp.x, pp.z, .2, .2, 3.2, 0, 0, { noBullet: true }); }
      const sail = new THREE.PlaneGeometry(5.6, 5.6, 6, 6), sp = sail.attributes.position; for (let k = 0; k < sp.count; k++) { const u = sp.getX(k) / 2.8, v = sp.getY(k) / 2.8; sp.setZ(k, -(1 - u * u) * (1 - v * v) * .45); } sail.computeVertexNormals();
      const c = L2W(o, lx, lz); put('sail', sail, col, c.x, 3.15, c.z, o.ry, -Math.PI / 2);
    }
    for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2, p = L2W(o, Math.cos(a) * o.w * .46, Math.sin(a) * o.d * .46); palm(p.x, 0, p.z, r); }
    neighborSpots.push({ ...L2W(o, -12, 0), yaw: o.ry + 1 }, { ...L2W(o, 2, 14), yaw: o.ry + 2 });
  }
  // ----- the Haze Machine lots -----
  for (const o of LAY.lots) {
    const { cx, cz } = o, hs = o.w / 2;
    addFlat('yard', o.w, o.d, cx, .01, cz, '#8f7a60', 3);
    machineSpots.push({ x: cx, z: cz });
    const sides = [[0, -1], [0, 1], [-1, 0], [1, 0]]; let gate = 0, gd = 1e9; sides.forEach(([sx, sz], i) => { const d = LAY.roadEdgeDist(cx + sx * hs, cz + sz * hs).d; if (d < gd) { gd = d; gate = i; } });
    sides.forEach(([sx, sz], i) => { const along = sx === 0, segs = i === gate ? [[-hs, -6], [6, hs]] : [[-hs, hs]];
      for (const [a, b] of segs) { const L = b - a, m = (a + b) / 2; const x = along ? cx + m : cx + sx * hs, z = along ? cz + sz * hs : cz + m; put('fence', planeGeo(L, 2.4, 2), '#c8c8c8', x, 1.25, z, along ? 0 : Math.PI / 2); addCollider(x, z, along ? L : .12, along ? .12 : L, 2.5, 0, 0, { noBullet: true }); for (const p of [a, b]) addBox('metal', .08, 2.5, .08, along ? cx + p : cx + sx * hs, 0, along ? cz + sz * hs : cz + p, '#9a9a9a'); } });
    container(cx - 11, cz - 9, 0, '#8a3b2c'); container(cx + 11, cz + 10, 0, '#2c6a72'); container(cx - 10, cz + 12, Math.PI / 2, '#5a6a3a');
    barrier(cx - 5, cz - 14, 0); barrier(cx + 14, cz + 1, Math.PI / 2);
    placeCar(cx + 8, cz - 13.5, 0, 'hazevan'); placeCar(cx - 3, cz + 15, Math.PI, 'hazevan');
    prop('dumpster', cx + 14.5, cz - 4, Math.PI / 2);
    for (const [a, b] of [[-15, -15], [15, 15]]) { put('metal', new THREE.CylinderGeometry(.1, .14, 8, 8).translate(0, 4, 0), '#5d5f63', cx + a, 0, cz + b); floodGlows.push(new THREE.Vector3(cx + a, 8.1, cz + b)); lightCone(cx + a, 8.1, cz + b, 8, 4, '#d9c0ff'); }
  }

  buildBorder();
  for (const o of LAY.outside) inst(o.model, o.x, 0, o.z, o.ry, '#c8bfb6');

  // ----- materials / meshes -----
  const po = (f, u) => ({ polygonOffset: true, polygonOffsetFactor: f, polygonOffsetUnits: u });
  const mats = {
    asphalt: new THREE.MeshLambertMaterial({ map: TX.asphalt, vertexColors: true, ...po(-1, -4) }),
    lot: new THREE.MeshLambertMaterial({ map: TX.asphalt, vertexColors: true, ...po(-2, -6) }),
    concrete: new THREE.MeshLambertMaterial({ map: TX.concrete, vertexColors: true }),
    median: new THREE.MeshLambertMaterial({ map: TX.concrete, vertexColors: true }),
    curb: new THREE.MeshLambertMaterial({ map: TX.concrete, vertexColors: true, side: THREE.DoubleSide }),
    drive: new THREE.MeshLambertMaterial({ map: TX.concrete, vertexColors: true, ...po(-2, -8) }),
    yard: new THREE.MeshLambertMaterial({ map: TX.gravel, vertexColors: true, ...po(-1, -3) }),
    grass: new THREE.MeshLambertMaterial({ map: TX.grass, vertexColors: true, ...po(-1, -4) }),
    court: new THREE.MeshLambertMaterial({ map: TX.court, vertexColors: true, ...po(-2, -10) }),
    block: new THREE.MeshLambertMaterial({ map: TX.block, vertexColors: true }),
    plain: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .8, metalness: .05 }),
    metal: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .45, metalness: .6 }),
    wood: new THREE.MeshLambertMaterial({ vertexColors: true }),
    trunk: new THREE.MeshLambertMaterial({ map: TX.bark, vertexColors: true }),
    paint: new THREE.MeshLambertMaterial({ vertexColors: true, ...po(-3, -12) }),
    frond: new THREE.MeshLambertMaterial({ map: TX.frond, vertexColors: true, alphaTest: .35, side: THREE.DoubleSide }),
    fence: new THREE.MeshStandardMaterial({ map: TX.fence, vertexColors: true, alphaTest: .3, side: THREE.DoubleSide, metalness: .5, roughness: .5 }),
    glowDecal: new THREE.MeshBasicMaterial({ map: TX.glow, vertexColors: true, transparent: true, opacity: .16, blending: THREE.AdditiveBlending, depthWrite: false, ...po(-4, -4) }),
    lightcone: coneMaterial(),
    sail: new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }),
  };
  const flat = ['asphalt', 'lot', 'paint', 'glowDecal', 'lightcone', 'yard', 'grass', 'court', 'drive'];
  for (const k in BK) {
    const mesh = new THREE.Mesh(mergeGeos(BK[k]), mats[k] || mats.plain);
    mesh.castShadow = !flat.includes(k) && k !== 'concrete' && k !== 'median'; mesh.receiveShadow = !['glowDecal', 'lightcone'].includes(k);
    if (k === 'glowDecal' || k === 'lightcone') mesh.renderOrder = 2;
    if (k === 'lightcone') WORLD.coneMesh = mesh;
    scene.add(mesh);
  }
  buildInstances(); buildBlobs();
  for (const s of signs) { const m = new THREE.Mesh(new THREE.PlaneGeometry(s.w, s.h), s.lit ? new THREE.MeshStandardMaterial({ map: s.tex, roughness: .9 }) : new THREE.MeshBasicMaterial({ map: s.tex })); m.position.set(s.x, s.y, s.z); m.rotation.y = s.ry || 0; scene.add(m); }
  glowBatch(streetGlows, 4.2, '#ffb066'); glowBatch(floodGlows, 5, '#fff0d0');
  buildGrid();
}
const WORLD = { coneMesh: null };
const glowMats = [];
function glowBatch(points, size, color) {
  if (!points.length) return;
  const g = new THREE.InstancedBufferGeometry().copy(new THREE.PlaneGeometry(1, 1)); const o = new Float32Array(points.length * 3); points.forEach((p, i) => o.set([p.x, p.y, p.z], i * 3));
  g.setAttribute('offset', new THREE.InstancedBufferAttribute(o, 3)); g.instanceCount = points.length;
  const m = new THREE.ShaderMaterial({ uniforms: { map: { value: TX.glow }, color: { value: new THREE.Color(color) }, size: { value: size }, fogD: { value: .045 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `attribute vec3 offset; uniform float size, fogD; varying vec2 vUv; varying float vF; void main(){ vUv = uv; vec4 mv = viewMatrix * vec4(offset, 1.0); vF = exp(-pow(fogD * length(mv.xyz) * .5, 2.0)); mv.xy += position.xy * size; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform sampler2D map; uniform vec3 color; varying vec2 vUv; varying float vF; void main(){ vec4 t = texture2D(map, vUv); gl_FragColor = vec4(color * t.a * vF, 1.0); }` });
  const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; mesh.renderOrder = 2; scene.add(mesh); glowMats.push(m);
}
let coneMat;
function coneMaterial() {
  coneMat = new THREE.ShaderMaterial({
    uniforms: { op: { value: .3 }, fogD: { value: .045 } }, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: `varying vec3 vC; varying float vV, vF, vD; void main(){ vC = color; vV = uv.y; vec4 wp = modelMatrix * vec4(position, 1.0);
      vec3 n = normalize(mat3(modelMatrix) * normal), vd = cameraPosition - wp.xyz; vD = length(vd); vF = abs(dot(n, vd / vD)); gl_Position = projectionMatrix * viewMatrix * wp; }`,
    fragmentShader: `uniform float op, fogD; varying vec3 vC; varying float vV, vF, vD;
      void main(){ float a = pow(vV, 1.7) * pow(vF, 1.6) * op * smoothstep(0.8, 5.0, vD) * exp(-pow(fogD * vD * 0.55, 2.0)); gl_FragColor = vec4(vC * a, 1.0); }`,
  });
  return coneMat;
}

/* ---------- quarantine fence around the whole neighborhood ---------- */
function buildBorder() {
  const B = LAY.border, wires = [];
  for (let i = 0; i < B.length; i++) {
    const a = B[i], b = B[(i + 1) % B.length], dx = b.x - a.x, dz = b.z - a.z, L = Math.hypot(dx, dz), mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2;
    const ry = Math.atan2(-dz, dx);
    put('fence', planeGeo(L, 3.6, 2.2), '#c8c8c8', mx, 1.8, mz, ry);
    addCollider(mx, mz, L + .4, .6, 4.6, ry, 0, { noBullet: true });
    let ox = dz / L, oz = -dx / L; if (ox * mx + oz * mz < 0) { ox = -ox; oz = -oz; }
    const n = Math.max(1, Math.round(L / 3.6));
    for (let k = 0; k <= n; k++) { const t = k / n, px = a.x + dx * t, pz = a.z + dz * t; put('metal', new THREE.CylinderGeometry(.05, .06, 4.1, 6).translate(0, 2.05, 0), '#8f8f8f', px, 0, pz); put('metal', boxGeo(.05, .05, .75), '#8f8f8f', px + ox * .28, 4.25, pz + oz * .28, Math.atan2(ox, oz), -.65); }
    for (let w = 0; w < 3; w++) { const h = 4.12 + w * .2, o = .1 + w * .2; wires.push(a.x + ox * o, h, a.z + oz * o, b.x + ox * o, h, b.z + oz * o); }
    for (let k = 0; k < L; k += .45) { const t = k / L, px = a.x + dx * t + ox * .32, pz = a.z + dz * t + oz * .32, ph = k * 3.1; wires.push(px, 4.32 + Math.sin(ph) * .2, pz + 0, px + dx / L * .45, 4.32 + Math.sin(ph + 1.4) * .2, pz + dz / L * .45); }
    if (i % 6 === 3) floodlight(mx - ox * 1.2, mz - oz * 1.2, -ox, -oz);
  }
  const wg = new THREE.BufferGeometry(); wg.setAttribute('position', new THREE.Float32BufferAttribute(wires, 3)); scene.add(new THREE.LineSegments(wg, new THREE.LineBasicMaterial({ color: '#77767a' })));
  const qt = quarantineTex();
  for (const e of LAY.exits) {
    let ix = e.inX - e.x, iz = e.inZ - e.z; const il = Math.hypot(ix, iz) || 1; ix /= il; iz /= il; const nx = -iz, nz = ix;
    const bx = e.x + ix * 4.5, bz = e.z + iz * 4.5, cnt = Math.ceil(e.w / 3.05) + 1;
    for (let k = 0; k < cnt; k++) { const off = (k - (cnt - 1) / 2) * 3.05; barrier(bx + nx * off, bz + nz * off, Math.atan2(-nz, nx)); }
    const sx = e.x + ix * 3.6, sz = e.z + iz * 3.6;
    const s = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 1.9), new THREE.MeshStandardMaterial({ map: qt, roughness: .7, side: THREE.DoubleSide })); s.position.set(sx, 2.25, sz); s.rotation.y = Math.atan2(ix, iz); scene.add(s);
    for (const k of [-1.9, 1.9]) put('metal', new THREE.CylinderGeometry(.05, .05, 3.2, 6).translate(0, 1.6, 0), '#8f8f8f', sx + nx * k - ix * .04, 0, sz + nz * k - iz * .04);
    floodlight(e.x + ix * 2 + nx * (e.w / 2 + 2.5), e.z + iz * 2 + nz * (e.w / 2 + 2.5), ix, iz);
  }
}

/* ---------- sky, mountains, the Strip ---------- */
let skyMat, northStar, mountainMats = [], skylineMat, beams = [], wheel, plane, needleLight, skyGlow, backdrop, strip;
function buildSky() {
  skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color('#141130') }, mid: { value: new THREE.Color('#4d3466') }, horizon: { value: new THREE.Color('#e88a5c') }, haze: { value: HAZE.clone() }, hazeAmt: { value: 1 }, time: { value: 0 }, sunDir: { value: new THREE.Vector3(-.85, .07, .28).normalize() } },
    vertexShader: 'varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform vec3 top; uniform vec3 mid; uniform vec3 horizon; uniform vec3 haze; uniform float hazeAmt; uniform float time; uniform vec3 sunDir; varying vec3 vDir;
      float hs(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float ns(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(hs(i), hs(i + vec2(1.0, 0.0)), f.x), mix(hs(i + vec2(0.0, 1.0)), hs(i + vec2(1.0, 1.0)), f.x), f.y); }
      float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { v += a * ns(p); p *= 2.03; a *= 0.5; } return v; }
      void main(){ vec3 d = normalize(vDir); float h = d.y;
        vec3 c = mix(horizon, mid, smoothstep(0.0, 0.22, h)); c = mix(c, top, smoothstep(0.22, 0.75, h)); if (h < 0.0) c = horizon * 0.75;
        float s = max(dot(d, sunDir), 0.0); c += vec3(1.0, 0.5, 0.25) * pow(s, 6.0) * 0.55 + vec3(1.0, 0.75, 0.45) * pow(s, 90.0) * 1.2;
        if (h > 0.0) { vec2 cp = d.xz / (h + 0.15) * 1.4 + vec2(time * 0.004, time * 0.0025); float cl = smoothstep(0.48, 0.86, fbm(cp));
          vec3 ccol = mix(vec3(0.42, 0.28, 0.45), vec3(1.0, 0.6, 0.42), pow(s, 2.0) * 0.9 + 0.1); c = mix(c, ccol * (0.55 + 0.45 * (1.0 - h)), cl * smoothstep(0.02, 0.2, h) * 0.8); }
        float hz = max(hazeAmt, 0.5) * (1.0 - smoothstep(-0.1, 0.1 + hazeAmt * 0.6, h)); c = mix(c, haze, clamp(hz, 0.0, 1.0));
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
  });
  backdrop = new THREE.Group(); scene.add(backdrop); strip = new THREE.Group(); strip.position.set(80, 0, 1000); strip.scale.setScalar(.78); backdrop.add(strip);
  const sky = new THREE.Mesh(new THREE.SphereGeometry(2000, 32, 16), skyMat); sky.renderOrder = -10; sky.frustumCulled = false; scene.add(sky); skyMat.userData.mesh = sky;
  northStar = new THREE.Sprite(new THREE.SpriteMaterial({ map: TX.star, color: '#fff3d6', fog: false, depthWrite: false, transparent: true, blending: THREE.AdditiveBlending }));
  northStar.scale.set(170, 170, 1); northStar.renderOrder = -9; scene.add(northStar);
  const sg = new THREE.BufferGeometry(), sp = [];
  for (let i = 0; i < 700; i++) { const a = Math.random() * Math.PI * 2, e = .16 + Math.random() * 1.25; sp.push(Math.cos(a) * Math.cos(e) * 1800, Math.sin(e) * 1800, Math.sin(a) * Math.cos(e) * 1800); }
  sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
  const stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: '#ffffff', size: 1.8, sizeAttenuation: false, fog: false, transparent: true, opacity: 0, depthWrite: false })); stars.renderOrder = -9; stars.frustumCulled = false; scene.add(stars); skyMat.userData.stars = stars;
  // three layered ridge lines: far, mid, near
  const ridge = (R, base, amp, seed, color, order) => {
    const N = 220, pos = [], idx = []; let s1 = seed;
    const nz = a => { let v = 0; for (let k = 1; k <= 6; k++) v += Math.sin(a * k * 3 + s1 * k * 1.7) / (k * 1.3) + Math.abs(Math.sin(a * k * 11 + s1 * 3.1)) / (k * 4); return v; };
    for (let i = 0; i <= N; i++) { const a = i / N * Math.PI * 2, west = Math.max(0, -Math.cos(a)), hgt = base + amp * (.55 + .45 * nz(a)) * (.45 + west * .9); pos.push(Math.cos(a) * R, -20, Math.sin(a) * R, Math.cos(a) * R, Math.max(10, hgt), Math.sin(a) * R); if (i) { const p = (i - 1) * 2; idx.push(p, p + 2, p + 1, p + 1, p + 2, p + 3); } }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
    const m = new THREE.MeshBasicMaterial({ color, fog: false, side: THREE.DoubleSide }); const mesh = new THREE.Mesh(g, m); mesh.renderOrder = order; backdrop.add(mesh); mountainMats.push({ m, base: new THREE.Color(color), k: order === -8 ? .95 : order === -7.5 ? .9 : .82 });
  };
  ridge(1300, 60, 260, 1.3, '#3b2c4c', -8); ridge(1050, 30, 160, 4.1, '#33253f', -7.5); ridge(850, 10, 90, 7.7, '#2a1f33', -7.2);
  // the Strip and downtown to the south
  skylineMat = new THREE.MeshBasicMaterial({ map: TX.windows, color: '#ffffff', fog: false, transparent: true });
  const sk = [];
  const tower = (x, z, w, d, h) => { const g = new THREE.BoxGeometry(w, h, d); const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / 18, uv.getY(i) * h / 36); g.translate(x, h / 2, z); sk.push(g); };
  for (let i = 0; i < 30; i++) tower(-460 + Math.random() * 580, 660 + Math.random() * 170, 22 + Math.random() * 34, 22 + Math.random() * 30, 60 + Math.random() * 170);
  for (let i = 0; i < 10; i++) tower(70 + Math.random() * 140, 360 + Math.random() * 70, 18 + Math.random() * 18, 18 + Math.random() * 18, 50 + Math.random() * 80);
  const gold = new THREE.CylinderGeometry(26, 30, 210, 3, 1); gold.translate(-260, 105, 700); sk.push(gold);
  const skyline = new THREE.Mesh(mergeSimple(sk), skylineMat); skyline.renderOrder = -7; strip.add(skyline);
  const needle = new THREE.Mesh(new THREE.CylinderGeometry(4, 9, 250, 10), skylineMat); needle.position.set(-40, 125, 560); needle.renderOrder = -7; strip.add(needle);
  const pod = new THREE.Mesh(new THREE.CylinderGeometry(22, 15, 26, 16), skylineMat); pod.position.set(-40, 228, 560); pod.renderOrder = -7; strip.add(pod);
  needleLight = new THREE.Sprite(new THREE.SpriteMaterial({ map: TX.glow, color: '#ff3030', fog: false, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); needleLight.position.set(-40, 268, 560); needleLight.scale.setScalar(28); strip.add(needleLight);
  const pyrMat = new THREE.MeshBasicMaterial({ color: '#141018', fog: false }); mountainMats.push({ m: pyrMat, base: new THREE.Color('#141018'), k: .9 });
  const pyr = new THREE.Mesh(new THREE.ConeGeometry(90, 105, 4), pyrMat); pyr.position.set(-180, 52, 980); pyr.rotation.y = Math.PI / 4; pyr.renderOrder = -7; strip.add(pyr);
  const beamMat = new THREE.MeshBasicMaterial({ color: '#dfe9ff', fog: false, transparent: true, opacity: .35, blending: THREE.AdditiveBlending, depthWrite: false });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 3.5, 2400, 8, 1, true), beamMat); beam.position.set(-180, 1250, 980); beam.renderOrder = -6; strip.add(beam); beams.push({ m: beam, fixed: true });
  // sweeping searchlights over the Strip
  for (const [x, z, ph] of [[-320, 720, 0], [-90, 760, 2.1], [40, 690, 4.2]]) { const g = new THREE.CylinderGeometry(.6, 16, 1400, 10, 1, true); g.translate(0, 700, 0); const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: '#f4eaff', fog: false, transparent: true, opacity: .1, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })); m.position.set(x, 40, z); m.renderOrder = -6; strip.add(m); beams.push({ m, ph }); }
  // the big wheel
  wheel = new THREE.Group(); const wm = new THREE.MeshBasicMaterial({ color: '#c9b8ff', fog: false, transparent: true, opacity: .85 });
  wheel.add(new THREE.Mesh(new THREE.TorusGeometry(70, 1.4, 6, 64), wm)); for (let i = 0; i < 16; i++) { const sp2 = new THREE.Mesh(new THREE.BoxGeometry(.8, 140, .8), wm); sp2.rotation.z = i / 16 * Math.PI; wheel.add(sp2); }
  for (let i = 0; i < 28; i++) { const a = i / 28 * Math.PI * 2, b = new THREE.Sprite(new THREE.SpriteMaterial({ map: TX.glow, color: i % 2 ? '#ff8ad8' : '#8ad8ff', fog: false, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); b.position.set(Math.cos(a) * 70, Math.sin(a) * 70, 0); b.scale.setScalar(9); wheel.add(b); }
  wheel.position.set(160, 95, 720); wheel.rotation.y = .4; wheel.renderOrder = -6; strip.add(wheel);
  skyGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: TX.glow, color: '#ff9a55', fog: false, transparent: true, opacity: .45, blending: THREE.AdditiveBlending, depthWrite: false })); skyGlow.position.set(-120, 60, 800); skyGlow.scale.set(1400, 420, 1); skyGlow.renderOrder = -9; strip.add(skyGlow);
  plane = new THREE.Sprite(new THREE.SpriteMaterial({ map: TX.glow, color: '#ffffff', fog: false, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); plane.scale.setScalar(10); backdrop.add(plane);
}
function hazeAmt() { return clamp((M.density - .006) / .04, 0, 1); }
const _hc = new THREE.Color('#b4826e');
function updateSky(dt) {
  const h = hazeAmt();
  skyMat.uniforms.hazeAmt.value = h; skyMat.uniforms.time.value = gtime;
  skyMat.uniforms.haze.value.copy(scene.fog.color);
  skyMat.userData.mesh.position.copy(camera.position); backdrop.position.set(camera.position.x, 0, camera.position.z);
  skyMat.userData.stars.position.copy(camera.position); skyMat.userData.stars.material.opacity = (1 - h) * .85;
  northStar.position.copy(camera.position).add(_v.set(0, .5, -1).normalize().multiplyScalar(1500));
  northStar.material.opacity = .55 + (1 - h) * .45 + Math.sin(gtime * 1.7) * .04;
  for (const mm of mountainMats) mm.m.color.copy(mm.base).lerp(scene.fog.color, h * mm.k);
  skylineMat.color.set('#ffffff').lerp(scene.fog.color, h * .95);
  for (const b of beams) { if (b.fixed) { b.m.material.opacity = .5 * (1 - h * .85); continue; } b.m.rotation.z = Math.sin(gtime * .23 + b.ph) * .5; b.m.rotation.x = Math.cos(gtime * .17 + b.ph) * .35; b.m.material.opacity = .065 * (1 - h * .8); }
  wheel.rotation.z += dt * .02; wheel.children.forEach(c => { if (c.material) c.material.opacity = .9 * (1 - h * .85); });
  needleLight.material.opacity = (Math.sin(gtime * 3) > .3 ? 1 : .15) * (1 - h * .7);
  skyGlow.material.opacity = .25 + (1 - h) * .3;
  const pt = (gtime * .012) % 1; plane.position.set(lerp(-1400, 1400, pt), 420 + Math.sin(pt * 6) * 20, lerp(-600, 300, pt)); plane.material.color.set(Math.sin(gtime * 6) > .6 ? '#ff4040' : '#ffffff'); plane.material.opacity = (Math.sin(gtime * 6) > 0 ? 1 : .2) * (1 - h * .8);
  if (coneMat) coneMat.uniforms.fogD.value = M.density; for (const m of glowMats) m.uniforms.fogD.value = M.density;
}
