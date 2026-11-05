
/* ---------- game state ---------- */
let state = 'title';
const P = { pos: new THREE.Vector3(), vel: new THREE.Vector3(), yaw: 0, pitch: 0, onGround: true, crouch: false, sprint: false, slideT: 0, slideDir: new THREE.Vector3(), hp: 100, lastHurt: -99, eye: 1.68, ads: 0, wi: 0, swapTo: -1, guns: [], lastShot: -99, swapT: 0, deadT: 0,
  bobT: 0, bobA: 0, roll: 0, fovB: 75, sprintK: 0, crouchK: 0, heat: 0, land: { x: 0, v: 0 }, kick: { x: 0, v: 0 }, kickY: { x: 0, v: 0 } };
const M = { score: 0, mult: 1, streak: 0, lastKill: -99, kills: 0, heads: 0, shots: 0, hits: 0, saved: 0, machinesDown: 0, time: 0, pulse: 0, pulseT: 0, winT: 0, density: .045, densityTarget: .046, trauma: 0, refillT: 0, lowWarned: false, borderT: 0 };
let enemies = [], neighbors = [], machines = [], pickups = [];
let gtime = 0, frameNo = 0;
const keys = {}; let mouseDown = false, rightDown = false;
const smooth01 = x => x * x * (3 - 2 * x);
const noise1 = t => Math.sin(t) * .5 + Math.sin(t * 2.31 + 1.3) * .3 + Math.sin(t * 4.73 + 2.1) * .2;
function sstep(s, dt, k, c) { const n = Math.max(1, Math.ceil(dt / .006)), h = dt / n; for (let i = 0; i < n; i++) { s.v += (-k * s.x - c * s.v) * h; s.x += s.v * h; } return s.x; }
const machineLight = new THREE.PointLight('#b37bff', 0, 26, 1.6); scene.add(machineLight);
const enemyFlash = new THREE.PointLight('#ffb070', 0, 14, 2); scene.add(enemyFlash);

/* ---------- Haze Machines ---------- */
const machineMats = { core: new THREE.MeshBasicMaterial({ color: '#b37bff' }), ring: new THREE.MeshBasicMaterial({ color: '#7dffb0' }), tank: new THREE.MeshStandardMaterial({ color: '#4a4652', roughness: .5, metalness: .6 }), base: new THREE.MeshStandardMaterial({ color: '#26252b', roughness: .7, metalness: .5 }) };
function makeMachine(x, z) {
  const g = new THREE.Group(); g.position.set(x, 0, z); let h = 12, half = 2.7; const rings = [];
  if (TPL.machine) { const t = TPL.machine, mm = new THREE.Mesh(t.geo, t.mat); mm.castShadow = mm.receiveShadow = true; mm.rotation.y = Math.PI / 4; g.add(mm); h = t.h; half = Math.max(t.w, t.d) * .36; }
  else { const base = new THREE.Mesh(new THREE.BoxGeometry(5.4, 1.1, 5.4), machineMats.base); base.position.y = .55; g.add(base); const st = new THREE.Mesh(new THREE.CylinderGeometry(.75, 1, 11, 16), machineMats.tank); st.position.y = 6.6; g.add(st); for (let i = 0; i < 4; i++) { const r = new THREE.Mesh(new THREE.TorusGeometry(1, .07, 6, 24), machineMats.ring); r.rotation.x = Math.PI / 2; g.add(r); rings.push(r); } }
  const core = new THREE.Mesh(new THREE.SphereGeometry(.9, 16, 12), machineMats.core); core.position.y = h * .55; g.add(core);
  const beacon = new THREE.Sprite(new THREE.SpriteMaterial({ map: TX.glow, color: '#c08aff', fog: false, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); beacon.position.y = h + 1; beacon.scale.setScalar(9); g.add(beacon);
  // a violet column of haze venting into the sky
  const col = new THREE.Mesh(new THREE.CylinderGeometry(2.4, .7, 40, 16, 1, true).translate(0, 20, 0), droneConeMat()); col.material.uniforms.col.value.set('#9a5cff'); col.material.uniforms.op.value = .35; col.rotation.x = Math.PI; col.position.y = h + 40; col.renderOrder = 2; g.add(col);
  scene.add(g); const c = addDyn(x, z, half * 2, half * 2, h, true);
  return { g, core, rings, beacon, col, x, z, hp: 520, max: 520, alive: true, box: { x0: x - half, x1: x + half, y0: 0, y1: h, z0: z - half, z1: z + half }, puffT: 0, wreck: null, flash: 0, top: h + .5, coll: c };
}

/* ---------- spawn / reset ---------- */
function addDyn(x, z, w, d, top, nb) { const c = addCollider(x, z, w, d, top, 0, 0, { noBullet: nb, dyn: true }); buildGrid(); return c; }
function clearEntities() {
  for (const e of enemies) { scene.remove(e.g); scene.remove(e.cone); scene.remove(e.icon); }
  for (const c of crates) scene.remove(c.g); crates = [];
  for (let i = colliders.length - 1; i >= 0; i--) if (colliders[i].dyn) colliders.splice(i, 1); buildGrid();
  for (const n of neighbors) { scene.remove(n.g); if (n.beam) scene.remove(n.beam); }
  for (const m of machines) { scene.remove(m.g); if (m.wreck) scene.remove(m.wreck); }
  for (const p of pickups) scene.remove(p.g);
  enemies = []; neighbors = []; machines = []; pickups = [];
}
function freeSpot(cx, cz, rMin, rMax, avoid, minAvoid = 45) { for (let i = 0; i < 90; i++) { const a = Math.random() * Math.PI * 2, d = rand(rMin, rMax), x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d; if (!pointFree(x, z, .8)) continue; if (avoid && Math.hypot(x - avoid.x, z - avoid.z) < minAvoid) continue; return { x, z }; } return null; }
function spawnRunner(x, z, mode, home) {
  const m = makeRunner(); scene.add(m.g);
  const e = Object.assign(m, { type: 'runner', pos: new THREE.Vector3(x, 0, z), vel: new THREE.Vector2(), yaw: Math.random() * 6, hp: 100, state: 'patrol', home: home || { x, z }, roam: mode === 'guard' ? 13 : 36, guard: mode === 'guard', susp: 0, last: new THREE.Vector3(), los: false, losT: Math.random() * .2, see: false, fireT: rand(.6, 1.4), burst: 0, burstT: 0, wp: null, wait: rand(0, 2), stuck: 0, stun: 0, reveal: 0, unseen: 0, strafe: 1, strafeT: 0, searchT: 0, dead: false, deadT: 0, hot: false, spd: 0, dustT: 0 });
  e.g.position.copy(e.pos); e.g.rotation.y = e.yaw;
  addSenses(e); enemies.push(e); return e;
}
function spawnDrone(x, z, home) {
  const m = makeDrone(); m.g.scale.setScalar(1.35); scene.add(m.g);
  const e = Object.assign(m, { type: 'drone', pos: new THREE.Vector3(x, 6.5, z), vel: new THREE.Vector2(), yaw: 0, hp: 30, state: 'patrol', home: home || { x, z }, roam: 50, susp: 0, last: new THREE.Vector3(), los: false, losT: Math.random() * .2, see: false, fireT: rand(1, 2), burst: 0, burstT: 0, wp: null, wait: 0, stun: 0, reveal: 0, unseen: 0, orbit: Math.random() * 6, searchT: 0, dead: false, deadT: 0, vy: 0, hot: false, crashed: false });
  addSenses(e); enemies.push(e); return e;
}
function resetMission() {
  clearEntities();
  Object.assign(M, { score: 0, mult: 1, streak: 0, lastKill: -99, kills: 0, heads: 0, shots: 0, hits: 0, saved: 0, machinesDown: 0, time: 0, pulse: 35, pulseT: 0, winT: 0, densityTarget: .046, trauma: 0, refillT: 0, lowWarned: false, borderT: 50 });
  Object.assign(P, { yaw: LAY.spawn.yaw, pitch: 0, hp: 100, lastHurt: -99, crouch: false, sprint: false, slideT: 0, onGround: true, ads: 0, wi: 0, swapTo: -1, swapT: 0, deadT: 0, heat: 0, bobA: 0, sprintK: 0, crouchK: 0 });
  P.land.x = P.land.v = P.kick.x = P.kick.v = P.kickY.x = P.kickY.v = 0;
  P.pos.set(LAY.spawn.x, 0, LAY.spawn.z); P.vel.set(0, 0, 0);
  P.guns = WEAPONS.map(w => ({ w, mag: w.mag, reserve: w.reserve, reloadT: 0, cool: 0 }));
  VM.guns.forEach((g, i) => g.visible = i === 0);
  const SP = LAY.spawn;
  for (const s of machineSpots) machines.push(makeMachine(s.x, s.z));
  for (const m of machines) for (let i = 0; i < 4; i++) { const p = freeSpot(m.x, m.z, 6, 15); if (p) spawnRunner(p.x, p.z, 'guard', { x: m.x, z: m.z }); }
  for (let i = 0; i < 12; i++) { const p = freeSpot(0, 0, 10, 160, SP, 55); if (p) spawnRunner(p.x, p.z, 'patrol'); }
  for (let i = 0; i < 4; i++) { const p = freeSpot(0, 0, 20, 150, SP, 70); if (p) spawnDrone(p.x, p.z); }
  const spots = neighborSpots.slice().sort(() => Math.random() - .5), chosen = [];
  for (const s of spots) { if (chosen.length >= 8) break; if (Math.hypot(s.x - SP.x, s.z - SP.z) < 25) continue; if (chosen.some(c => Math.hypot(c.x - s.x, c.z - s.z) < 38)) continue; if (!pointFree(s.x, s.z, .3)) continue; chosen.push(s); }
  for (const s of chosen) { const n = makeNeighbor(); n.g.position.set(s.x, 0, s.z); n.g.rotation.y = s.yaw + rand(-.5, .5); scene.add(n.g); neighbors.push(Object.assign(n, { x: s.x, z: s.z, saved: false, hold: 0, t: 0, phase: Math.random() * 6 })); }
  spawnCrates(); tipIdx = 0; lockT = null;
  $('oN').querySelector('b').textContent = `0/${neighbors.length}`; feedEl.innerHTML = '';
}

/* ---------- player: weight, stride-synced bob, landing springs ---------- */
const fwd = new THREE.Vector3(), right = new THREE.Vector3(), tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();
const touch = { mx: 0, my: 0, lookDX: 0, lookDY: 0, fire: false, ads: false };
function surfaceAt(x, z) { const r = LAY.roadEdgeDist(x, z).d; if (r < 0) return 'road'; if (r < 2.6) return 'walk'; if (Math.hypot(x - LAY.park.cx, z - LAY.park.cz) < 23) return 'grass'; return 'dirt'; }
function updatePlayer(dt) {
  const g = P.guns[P.wi];
  let mx = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0), mz = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0);
  if (isTouch) { mx += touch.mx; mz += -touch.my; }
  const ml = Math.hypot(mx, mz); if (ml > 1) { mx /= ml; mz /= ml; }
  const wantSprint = (keys.ShiftLeft || keys.ShiftRight || (isTouch && touch.my < -.92)) && mz > .3 && !P.crouch && P.slideT <= 0;
  P.sprint = wantSprint && !(mouseDown || touch.fire) && !(rightDown || touch.ads);
  const adsTarget = (rightDown || touch.ads) && !P.sprint && g.reloadT <= 0 && P.swapT <= 0 && P.slideT <= 0 ? 1 : 0;
  P.ads = clamp(P.ads + Math.sign(adsTarget - P.ads) * dt * 5.2, 0, 1); if (Math.abs(adsTarget - P.ads) < dt * 5.2) P.ads = adsTarget;
  fwd.set(-Math.sin(P.yaw), 0, -Math.cos(P.yaw)); right.set(Math.cos(P.yaw), 0, -Math.sin(P.yaw));
  let speed = P.sprint ? 7.4 : P.crouch ? 2.5 : 4.6; speed *= lerp(1, .58, P.ads);
  let tx = (fwd.x * mz + right.x * mx) * speed, tz = (fwd.z * mz + right.z * mx) * speed;
  if (P.slideT > 0) { P.slideT -= dt; const k = clamp(P.slideT / .85, 0, 1); const s = lerp(2.6, 10.5, k * k); tx = P.slideDir.x * s; tz = P.slideDir.z * s; P.vel.x = tx; P.vel.z = tz; if (P.slideT <= 0) P.crouch = true; }
  else {
    const cur = Math.hypot(P.vel.x, P.vel.z), want = Math.hypot(tx, tz), accel = P.onGround ? (want > cur ? 34 : 24) : 5;
    const dvx = tx - P.vel.x, dvz = tz - P.vel.z, dl = Math.hypot(dvx, dvz), mxd = accel * dt;
    if (dl > mxd) { P.vel.x += dvx / dl * mxd; P.vel.z += dvz / dl * mxd; } else { P.vel.x = tx; P.vel.z = tz; }
  }
  P.vel.y -= 20 * dt; const vy0 = P.vel.y;
  const px = P.pos.x, pz = P.pos.z;
  P.pos.x += P.vel.x * dt; P.pos.z += P.vel.z * dt; P.pos.y += P.vel.y * dt;
  pushOut(P.pos, .42, P.pos.y, P.pos.y + (P.crouch || P.slideT > 0 ? 1.15 : 1.75));
  // bumping a wall soaks up the velocity going into it
  if (dt > 0) { const rvx = (P.pos.x - px) / dt, rvz = (P.pos.z - pz) / dt; if (Math.hypot(rvx, rvz) < Math.hypot(P.vel.x, P.vel.z) - .5) { P.vel.x = lerp(P.vel.x, rvx, .6); P.vel.z = lerp(P.vel.z, rvz, .6); } }
  const gnd = groundAt(P.pos.x, P.pos.z, P.pos.y);
  if (P.pos.y <= gnd) {
    if (!P.onGround) { const imp = -vy0; if (imp > 2.2) { P.land.v -= imp * .3; VM.pos.v.y -= imp * .05; VM.rot.v.x -= imp * .12; SFX.land(clamp((imp - 2.2) / 8, 0, 1)); if (imp > 9) M.trauma = Math.min(1, M.trauma + .3); footDust(); } }
    P.pos.y = gnd; P.vel.y = 0; P.onGround = true;
  } else if (P.pos.y > gnd + .05) P.onGround = false;
  const hs = Math.hypot(P.vel.x, P.vel.z);
  P.eye = damp(P.eye, P.slideT > 0 ? .9 : P.crouch ? 1.08 : 1.68, 10, dt);
  // the head dips each time a foot lands; footsteps fire on the same beat
  if (P.onGround && P.slideT <= 0 && hs > .35) { const L = P.sprint ? 2.15 : P.crouch ? 1.05 : 1.55, prev = P.bobT; P.bobT += hs * dt / L * Math.PI; if (Math.floor(prev / Math.PI) !== Math.floor(P.bobT / Math.PI)) { if (!P.crouch || Math.random() < .35) SFX.step(surfaceAt(P.pos.x, P.pos.z), P.sprint); } }
  P.bobA = damp(P.bobA, P.onGround && P.slideT <= 0 ? clamp(hs / 4.6, 0, 1.6) : 0, 7, dt);
  P.sprintK = damp(P.sprintK, P.sprint ? 1 : 0, 8, dt); P.crouchK = damp(P.crouchK, P.crouch || P.slideT > 0 ? 1 : 0, 10, dt);
  P.heat = Math.max(0, P.heat - dt * 2.2);
  // look (touch); mouse look is applied as it arrives
  if (isTouch) { const s = .0055 * SET.sens * lerp(1, .55, P.ads) * (lockClose ? .6 : 1); P.yaw -= touch.lookDX * s; P.pitch -= touch.lookDY * s; VM.lookDX += touch.lookDX * .6; VM.lookDY += touch.lookDY * .6; touch.lookDX = touch.lookDY = 0; }
  P.pitch = clamp(P.pitch, -1.5, 1.5);
  if (gtime - P.lastHurt > 4 && P.hp < 100) P.hp = Math.min(100, P.hp + 28 * dt);
  // camera
  const A = P.bobA * (1 - P.crouchK * .4) * (1 - P.ads * .75) * (1 + P.sprintK * .5);
  const by = (Math.abs(Math.sin(P.bobT)) - .64) * .05 * A, bx = Math.sin(P.bobT) * .028 * A;
  const land = sstep(P.land, dt, 150, 13), kp = sstep(P.kick, dt, 230, 23), ky = sstep(P.kickY, dt, 230, 23);
  camera.position.set(P.pos.x + right.x * bx, P.pos.y + P.eye + by + land, P.pos.z + right.z * bx);
  let sx = 0, sy = 0, sz = 0;
  if (M.trauma > 0) { const s = M.trauma * M.trauma; camera.position.x += noise1(gtime * 23) * s * .22; camera.position.y += noise1(gtime * 19 + 7) * s * .18; sx = noise1(gtime * 17 + 3) * s * .03; sy = noise1(gtime * 15 + 9) * s * .03; sz = noise1(gtime * 13 + 5) * s * .05; M.trauma = Math.max(0, M.trauma - dt * 1.3); }
  const lv = P.vel.x * right.x + P.vel.z * right.z;
  P.roll = damp(P.roll, (P.slideT > 0 ? -.075 : -lv * .0055) + Math.sin(P.bobT) * .005 * A, 8, dt);
  camera.rotation.set(P.pitch + kp + sx, P.yaw + ky + sy, P.roll + sz);
  P.fovB = damp(P.fovB, 75 + P.sprintK * 7 + (P.slideT > 0 ? 9 : 0), 6, dt);
  const fov = lerp(P.fovB, g.w.adsFov, smooth01(P.ads)); if (Math.abs(camera.fov - fov) > .01) { camera.fov = fov; camera.updateProjectionMatrix(); }
  updateInteract(dt);
  for (let i = pickups.length - 1; i >= 0; i--) { const p = pickups[i]; p.t += dt; p.g.rotation.y += dt * 2; p.g.position.y = .35 + Math.sin(p.t * 3) * .1; if (Math.hypot(p.g.position.x - P.pos.x, p.g.position.z - P.pos.z) < 1.7) { P.guns[0].reserve = Math.min(360, P.guns[0].reserve + 75); P.guns[1].reserve = Math.min(120, P.guns[1].reserve + 24); SFX.pickup(); toast('+ AMMO'); scene.remove(p.g); pickups.splice(i, 1); } else if (p.t > 45) { scene.remove(p.g); pickups.splice(i, 1); } }
}
function footDust() { for (let i = 0; i < 3; i++) spawnPart({ pos: tmp.set(P.pos.x + rand(-.4, .4), .1, P.pos.z + rand(-.4, .4)), vel: tmp2.set(rand(-.8, .8), .3, rand(-.8, .8)), tex: TX.smoke, color: '#c2ad92', s0: .4, s1: 1.4, a0: .45, life: .8, drag: 2 }); }
function jump() { if (P.onGround && state === 'play') { P.vel.y = 6.2; P.onGround = false; if (P.crouch) P.crouch = false; P.slideT = 0; VM.pos.v.y += .25; } }
function crouchToggle() {
  if (state !== 'play') return;
  if (P.sprint && P.onGround && P.slideT <= 0) { P.slideT = .85; P.crouch = true; P.slideDir.set(-Math.sin(P.yaw), 0, -Math.cos(P.yaw)); SFX.step('dirt', true); footDust(); return; }
  if (P.slideT > 0) { P.slideT = 0; P.crouch = false; return; }
  P.crouch = !P.crouch;
}

/* ---------- weapons ---------- */
const _o = new THREE.Vector3(), _d = new THREE.Vector3(), _hp = new THREE.Vector3(), _mz = new THREE.Vector3(), _n = new THREE.Vector3(), _ej = new THREE.Vector3(), _ev = new THREE.Vector3();
let semiReady = true;
function updateWeapons(dt) {
  const g = P.guns[P.wi];
  g.cool -= dt;
  if (P.swapT > 0) { const was = P.swapT; P.swapT -= dt; if (was > .25 && P.swapT <= .25 && P.swapTo >= 0) { P.wi = P.swapTo; P.swapTo = -1; VM.guns.forEach((m, k) => m.visible = k === P.wi); } }
  if (g.reloadT > 0) { g.reloadT -= dt; if (g.reloadT <= 0) { const n = Math.min(g.w.mag - g.mag, g.reserve); g.mag += n; g.reserve -= n; } }
  const firing = mouseDown || touch.fire;
  if (!firing) semiReady = true;
  if (firing && g.cool <= 0 && g.reloadT <= 0 && P.swapT <= 0 && P.slideT <= 0 && (g.w.auto || semiReady) && P.sprintK < .35) { semiReady = false; fire(g); }
}
function reload() { const g = P.guns[P.wi]; if (g.reloadT > 0 || g.mag === g.w.mag || g.reserve <= 0 || state !== 'play' || P.swapT > 0) return; g.reloadT = g.w.reload; SFX.reload(g.w); }
function swap(i) { if (state !== 'play' || P.swapT > 0) return; if (i == null) i = 1 - P.wi; if (i === P.wi) return; P.guns[P.wi].reloadT = 0; P.swapTo = i; P.swapT = .5; SFX.swap(); }
const _hA = new THREE.Vector3(), _hB = new THREE.Vector3(), _hC = new THREE.Vector3();
// bullets test the animated skeleton: head, torso and legs follow the pose
function hitRunner(e, o, d, maxT) {
  if (raySphere(o, d, e.pos.x, e.pos.y + 1, e.pos.z, 1.4, maxT) < 0) return null;
  let best = maxT, part = null;
  if (!e.B) {
    const th = raySphere(o, d, e.pos.x, e.pos.y + 1.68, e.pos.z, .2, best); if (th >= 0) { best = th; part = 'head'; }
    const tb = rayCapsule(o, d, _hB.set(e.pos.x, e.pos.y + .35, e.pos.z), _hC.set(e.pos.x, e.pos.y + 1.4, e.pos.z), .3, best); if (tb >= 0 && tb < best - (part ? .2 : 0)) { best = tb; part = 'body'; }
    return part ? { t: best, part } : null;
  }
  e.B.Head.getWorldPosition(_hA); e.B.head_end.getWorldPosition(_hB); _hA.lerp(_hB, .45);
  const th = raySphere(o, d, _hA.x, _hA.y, _hA.z, .17, best); if (th >= 0) { best = th; part = 'head'; }
  e.B.Hips.getWorldPosition(_hB); e.B.neck.getWorldPosition(_hC);
  const tb = rayCapsule(o, d, _hB, _hC, .25, best); if (tb >= 0 && tb < best - (part ? .2 : 0)) { best = tb; part = 'body'; }
  for (const [u, f] of [['LeftUpLeg', 'LeftFoot'], ['RightUpLeg', 'RightFoot']]) { e.B[u].getWorldPosition(_hB); e.B[f].getWorldPosition(_hC); const tl = rayCapsule(o, d, _hB, _hC, .13, best); if (tl >= 0 && tl < best - (part ? .2 : 0)) { best = tl; part = 'leg'; } }
  return part ? { t: best, part } : null;
}
function fire(g) {
  if (g.mag <= 0) { SFX.empty(); g.cool = .25; if (g.reserve > 0) reload(); else if (P.wi === 0 && P.guns[1].mag + P.guns[1].reserve > 0) { swap(1); toast('RIFLE EMPTY — FIND AMMO ▣'); } return; }
  g.mag--; g.cool = g.w.interval; M.shots++; P.lastShot = gtime;
  SFX[g.w.snd]();
  const moving = Math.hypot(P.vel.x, P.vel.z) > 1;
  const spread = lerp(g.w.hip, g.w.adsS, P.ads) * (moving ? 1.6 : 1) * (P.crouch ? .75 : 1) * (P.onGround ? 1 : 2) * (1 + P.heat * .7);
  P.heat = Math.min(1, P.heat + .14);
  camera.updateMatrixWorld(); camera.getWorldDirection(_d); _d.x += rand(-1, 1) * spread; _d.y += rand(-1, 1) * spread; _d.z += rand(-1, 1) * spread; _d.normalize();
  _o.copy(camera.position);
  const st = rayStatic(_o, _d, g.w.range); _n.copy(hitNormal);
  let best = st.t, hitE = null, part = null, hitM = null;
  for (const e of enemies) {
    if (e.dead) continue;
    if (e.type === 'runner') { const h = hitRunner(e, _o, _d, best); if (h) { best = h.t; hitE = e; part = h.part; } }
    else { const t = raySphere(_o, _d, e.pos.x, e.pos.y, e.pos.z, 1.4, best); if (t >= 0) { best = t; hitE = e; part = 'body'; } }
  }
  for (const m of machines) { if (!m.alive) continue; const t = rayAABB(_o.x, _o.y, _o.z, _d.x, _d.y, _d.z, m.box, best); if (t >= 0 && t < best) { best = t; hitM = m; hitE = null; } }
  _hp.copy(_o).addScaledVector(_d, best);
  const gun = VM.guns[P.wi]; gun.updateMatrixWorld(true);
  _mz.copy(gun.userData.muzzle); gun.localToWorld(_mz); _mz.applyMatrix4(camera.matrixWorld);
  tracer(_mz, _hp, P.wi === 0 ? '#ffd27a' : '#ffe9b0', .05);
  if (hitE) { M.hits++; const mul = part === 'head' ? g.w.head : part === 'leg' ? .75 : 1; damageEnemy(hitE, g.w.dmg * mul, part === 'head', _hp); hazePuff(_hp, .6); }
  else if (hitM) { M.hits++; damageMachine(hitM, g.w.dmg, _hp); }
  else if (st.hit) { const metal = st.hit !== 'ground' && st.hit.mt; impact(_hp, _n, metal ? 'metal' : 'dust'); if (st.hit === 'ground' || st.hit.ex) decal(_hp, _n); }
  // recoil: the camera kicks and settles, the gun punches back and climbs
  const ak = 1 - P.ads * .45;
  P.kick.v += g.w.kick * 32 * ak; P.pitch += g.w.kick * .33; P.kickY.v += rand(-1, 1) * g.w.kick * 9; P.yaw += rand(-1, 1) * g.w.kick * .12;
  VM.pos.v.z += g.w.back * 20 * (1 - P.ads * .5); VM.pos.v.y += g.w.back * 3; VM.rot.v.x += g.w.up * (1 - P.ads * .55); VM.rot.v.z += rand(-1, 1) * g.w.roll; VM.rot.v.y += rand(-1, 1) * g.w.roll * .35;
  VM.flashT = .05; gunFlashLight.intensity = 6; muzzleLight.intensity = 10; muzzleLight.position.copy(camera.position).addScaledVector(_d, 1.2);
  // brass flies out of the ejection port
  _ej.copy(gun.userData.eject); gun.localToWorld(_ej); _ev.set(rand(.7, 1.1), rand(.8, 1.3), rand(.1, .4)).applyQuaternion(gun.quaternion); ejectBrass(_ej, _ev);
  if (M.shots % 3 === 0) spawnPart({ pos: tmp.copy(_mz), vel: tmp2.set(rand(-.2, .2), .5, rand(-.2, .2)), tex: TX.smoke, color: '#d8d0c8', s0: .15, s1: .9, a0: .25, life: 1.1, drag: 1 });
  // the shot is heard: everyone within 60m comes looking
  for (const e of enemies) { if (e.dead) continue; const d = e.pos.distanceTo(P.pos); if (d < 60 && e.state !== 'alert') { e.state = 'search'; e.last.set(P.pos.x + rand(-7, 7), 0, P.pos.z + rand(-7, 7)); e.searchT = 0; e.susp = Math.max(e.susp, .55); e.wp = null; } }
}
function damageEnemy(e, dmg, head, at) {
  if (e.stun > 0) dmg *= 1.25;
  e.hp -= dmg; SFX.hit();
  if (e.type === 'runner') flinch(e, head, P.pos.x, P.pos.z);
  if (e.state !== 'alert') alertEnemy(e);
  if (e.hp <= 0) { killEnemy(e, head); hitmarker(true); if (head) SFX.head(); else SFX.kill(); }
  else hitmarker(false);
}
function killEnemy(e, head) {
  e.dead = true; e.deadT = 0; e.eyes.forEach(s => s.visible = false); e.rv.visible = false; e.cone.visible = false; e.icon.visible = false; M.kills++; if (head) M.heads++;
  if (e.A) { for (const k of ['lo', 'aim', 'walk', 'run']) e.A[k].fadeOut(.14); e.A.die.reset().setEffectiveWeight(1).fadeIn(.1).play(); e.animAcc = 0; }
  const now = gtime; M.streak = now - M.lastKill < 5 ? M.streak + 1 : 1; M.lastKill = now; M.mult = Math.min(3, 1 + (M.streak - 1) * .25);
  const pts = Math.round(((e.type === 'drone' ? 150 : 100) + (head ? 50 : 0)) * M.mult); M.score += pts; M.pulse = Math.min(100, M.pulse + (head ? 16 : 12));
  feed(`<span class="g">MILES LOW</span> ★ ${e.type === 'drone' ? 'HAZE DRONE' : 'HAZE RUNNER'}${head ? ' <span class="r">◎ HEADSHOT</span>' : ''} <span class="g">+${pts}</span>`);
  if (head) toast('HEADSHOT'); if (M.streak >= 3) toast(`${M.streak} STREAK · x${M.mult.toFixed(2)}`);
  for (let i = 0; i < 4; i++) hazePuff(tmp.copy(e.pos).setY(e.pos.y + (e.type === 'drone' ? 0 : 1.2)), 1.2);
  { const g = new THREE.Group(); const box = new THREE.Mesh(new RoundedBoxGeometry(.5, .28, .32, 2, .04), MAT.ammo); box.castShadow = true; g.add(box); const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: TX.glow, color: '#f2c14e', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: .6 })); s.scale.setScalar(1.4); g.add(s); g.position.set(e.pos.x + rand(-.5, .5), .35, e.pos.z + rand(-.5, .5)); scene.add(g); pickups.push({ g, t: 0 }); }
  if (e.type === 'drone') { e.vy = 1.5; impact(e.pos, null, 'metal'); }
}
function damageMachine(m, dmg, at) {
  m.hp -= dmg; m.flash = .08; SFX.machineHit(); impact(at, null, 'metal'); hitmarker(false);
  if (m.hp <= 0 && m.alive) destroyMachine(m);
  else if (Math.random() < .25) for (const e of enemies) if (!e.dead && e.state !== 'alert' && Math.hypot(e.pos.x - m.x, e.pos.z - m.z) < 30) alertEnemy(e);
}
function destroyMachine(m) {
  m.alive = false; M.machinesDown++; const pts = Math.round(1000 * M.mult); M.score += pts; M.pulse = Math.min(100, M.pulse + 40);
  SFX.boom(); M.trauma = Math.min(1, M.trauma + Math.max(.35, 1.1 - P.pos.distanceTo(tmp.set(m.x, 0, m.z)) / 70));
  for (let i = 0; i < 26; i++) spawnPart({ pos: tmp.set(m.x + rand(-2, 2), rand(1, 10), m.z + rand(-2, 2)), vel: tmp2.set(rand(-8, 8), rand(2, 14), rand(-8, 8)), color: pick(['#ffb050', '#ff7a30', '#ffe0a0', '#c08aff']), add: true, s0: rand(1.5, 3.5), s1: .3, life: rand(.5, 1.1), grav: 9, fog: false });
  for (let i = 0; i < 14; i++) spawnPart({ pos: tmp.set(m.x + rand(-3, 3), rand(1, 9), m.z + rand(-3, 3)), vel: tmp2.set(rand(-2, 2), rand(1, 4), rand(-2, 2)), tex: TX.smoke, color: '#3a3038', s0: 3, s1: 9, a0: .8, life: rand(2, 3.5), spin: rand(-.5, .5) });
  m.g.visible = false; scene.remove(m.g);
  const w = new THREE.Group(); const b = new THREE.Mesh(new THREE.BoxGeometry(6, 1.1, 6), machineMats.base); b.position.y = .55; w.add(b); const s = new THREE.Mesh(new THREE.CylinderGeometry(.9, 1.1, 3.5, 12), machineMats.base); s.position.set(.3, 2.2, 0); s.rotation.z = .5; w.add(s); w.position.set(m.x, 0, m.z); scene.add(w); m.wreck = w;
  const i = colliders.indexOf(m.coll); if (i >= 0) colliders.splice(i, 1); addDyn(m.x, m.z, 6, 6, 1.25, false);
  const left = 3 - M.machinesDown; M.densityTarget = [.007, .016, .027, .046][left];
  feed(`<span class="g">MILES LOW</span> ★ HAZE MACHINE <span class="g">+${pts}</span>`);
  if (left > 0) {
    banner('HAZE MACHINE DOWN', `${left} LEFT — THE HAZE IS THINNING`);
    for (let k = 0; k < 3 + M.machinesDown; k++) { const p = freeSpot(P.pos.x, P.pos.z, 42, 65); if (p) { const e = spawnRunner(p.x, p.z, 'patrol'); e.state = 'search'; e.last.copy(P.pos); } }
    const p = freeSpot(P.pos.x, P.pos.z, 40, 70); if (p) { const d = spawnDrone(p.x, p.z); d.state = 'search'; d.last.copy(P.pos); }
  } else { banner('THE HAZE IS LIFTED', 'THE BLOCK CAN SEE AGAIN'); M.winT = 4.5; }
}

/* ---------- enemies ---------- */
function visRange() { return 1.75 / M.density; }
function setHot(e, hot) { e.hot = hot; for (const s of e.eyes) s.material = s.userData.halo ? (hot ? MAT.haloHot : MAT.haloDim) : (hot ? MAT.eyeHot : MAT.eyeDim); }
function alertEnemy(e) {
  if (e.dead) return; const was = e.state; e.state = 'alert'; e.last.copy(P.pos); e.unseen = 0; e.susp = 1; setHot(e, true);
  if (was !== 'alert') { e.fireT = Math.max(e.fireT, rand(.45, .9)); for (const o of enemies) if (o !== e && !o.dead && o.state === 'patrol' && o.pos.distanceTo(e.pos) < 22) { o.state = 'search'; o.last.copy(P.pos); o.searchT = 0; o.wp = null; } }
}
const _eo = new THREE.Vector3(), _ed = new THREE.Vector3();
let anySee = false, maxSusp = 0, wasSpotted = false;
function updateEnemies(dt) {
  anySee = false; maxSusp = 0;
  const head = tmp2.set(P.pos.x, P.pos.y + P.eye - .1, P.pos.z);
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    const dx = P.pos.x - e.pos.x, dz = P.pos.z - e.pos.z, dist = Math.hypot(dx, dz);
    if (e.dead) {
      e.deadT += dt;
      if (e.type === 'runner') { animRunner(e, dt, 0, dist, 0); if (!e.A) e.g.rotation.x = lerp(e.g.rotation.x, -Math.PI / 2 * .95, 1 - Math.exp(-dt * 9)); if (e.deadT > 7) e.g.position.y -= dt * .3; }
      else if (!e.crashed) { e.vy -= 16 * dt; e.pos.y += e.vy * dt; e.body.rotation.z += dt * 6; e.body.rotation.x += dt * 2.5; e.rotors.forEach(r => r.rotation.y += dt * 8); if (Math.random() < .5) spawnPart({ pos: e.pos, vel: tmp.set(0, 1, 0), tex: TX.smoke, color: '#2d2a30', s0: .5, s1: 1.8, a0: .7, life: 1.2 }); if (e.pos.y <= .35) { e.pos.y = .35; e.crashed = true; impact(e.pos, null, 'metal'); for (let k = 0; k < 6; k++) spawnPart({ pos: e.pos, vel: tmp.set(rand(-4, 4), rand(2, 6), rand(-4, 4)), color: '#ffb070', add: true, s0: .5, s1: .1, life: .4, grav: 10, fog: false }); SFX.thud(); } e.g.position.copy(e.pos); }
      if (e.deadT > 9) { scene.remove(e.g); scene.remove(e.cone); scene.remove(e.icon); enemies.splice(i, 1); }
      continue;
    }
    e.losT -= dt;
    if (e.losT <= 0) { e.losT = .18 + Math.random() * .06; _eo.set(e.pos.x, e.type === 'drone' ? e.pos.y : e.pos.y + 1.7, e.pos.z); _ed.subVectors(head, _eo); const L = _ed.length(); _ed.divideScalar(L); e.los = L < 160 && !rayStatic(_eo, _ed, L).hit; }
    let vis = visRange() * (P.crouch ? .5 : 1) * (P.sprint ? 1.25 : 1) * (e.type === 'drone' ? 1.15 : 1); if (M.pulseT > 0) vis *= .3;
    let see = false;
    if (state === 'play' && dist < vis && e.los && e.stun <= 0) { const fx = -Math.sin(e.yaw), fz = -Math.cos(e.yaw); const dot = (dx * fx + dz * fz) / (dist || 1); if (e.state !== 'patrol' || dot > .25 || dist < 4.5 || e.type === 'drone') see = true; }
    e.see = see;
    if (see) { e.susp += dt * (.7 + 3.2 * (1 - dist / vis)) * (e.state === 'patrol' ? 1 : 2.5); if (e.susp >= 1 && e.state !== 'alert') alertEnemy(e); }
    else if (e.state !== 'alert') e.susp = Math.max(0, e.susp - dt * .25);
    if (see && e.state === 'alert') anySee = true; if (e.state !== 'alert') maxSusp = Math.max(maxSusp, e.susp);
    if (e.stun > 0) e.stun -= dt; if (e.reveal > 0) { e.reveal -= dt; e.rv.visible = e.reveal > 0; }
    if (e.type === 'runner') updateRunner(e, dt, dx, dz, dist); else updateDrone(e, dt, dx, dz, dist);
    const showCone = state === 'play' && e.state !== 'alert' && e.stun <= 0 && dist < 60;
    e.cone.visible = showCone;
    if (showCone) { const R = Math.min(vis, 70); e.cone.scale.set(R, 1, R); e.cone.position.set(e.pos.x, .2, e.pos.z); e.cone.rotation.y = e.yaw; const fade = 1 - Math.max(0, dist - 40) / 20; e.cone.material.color.set(e.see ? '#ff2020' : e.susp > .05 || e.state === 'search' ? '#ffb020' : '#ff3030'); e.cone.material.opacity = (e.see ? .62 : .4) * fade; }
    const aw = e.state === 'alert' ? 1 : e.state === 'search' ? .9 : e.susp > .05 ? .35 + e.susp * .65 : 0;
    e.icon.visible = aw > 0 && state === 'play'; if (e.icon.visible) { e.icon.material.map = e.state === 'alert' ? TX.ex : TX.q; e.icon.material.opacity = aw; e.icon.position.set(e.pos.x, e.pos.y + (e.type === 'drone' ? 1.3 : 2.3), e.pos.z); e.icon.scale.setScalar(.55 + Math.min(dist, 40) * .012); }
  }
  if (anySee && !wasSpotted) SFX.spotted(); wasSpotted = anySee;
}
// ease into and out of motion instead of snapping to full speed
function moveToward(e, tx, tz, speed, dt, accel = 5) {
  const dx = tx - e.pos.x, dz = tz - e.pos.z, d = Math.hypot(dx, dz); let vx = 0, vz = 0;
  if (d > .05 && speed > 0) { const s = Math.min(speed, d * 2.2); vx = dx / d * s; vz = dz / d * s; }
  const a = 1 - Math.exp(-dt * accel); e.vel.x += (vx - e.vel.x) * a; e.vel.y += (vz - e.vel.y) * a;
  e.pos.x += e.vel.x * dt; e.pos.z += e.vel.y * dt;
}
function faceTo(e, dx, dz, dt, rate = 8) { const ty = Math.atan2(-dx, -dz); e.yaw += wrap(ty - e.yaw) * (1 - Math.exp(-dt * rate)); }
// patrols walk the sidewalks; guards pace around their machine
function randomWaypoint(e) {
  if (!e.guard && Math.random() < .7) for (let i = 0; i < 12; i++) { const r = pick(LAY.roads), sm = pick(r.samples), sd = Math.random() < .5 ? 1 : -1, x = sm.x + sm.nx * sd * (r.w / 2 + 1.3), z = sm.z + sm.nz * sd * (r.w / 2 + 1.3); if (Math.hypot(x - e.home.x, z - e.home.z) < e.roam && pointFree(x, z, .6)) return { x, z }; }
  for (let i = 0; i < 20; i++) { const a = Math.random() * 6.283, r = Math.random() * e.roam, x = e.home.x + Math.cos(a) * r, z = e.home.z + Math.sin(a) * r; if (pointFree(x, z, .6)) return { x, z }; }
  return { x: e.home.x, z: e.home.z };
}
function updateRunner(e, dt, dx, dz, dist) {
  let moveSpd = 0, tx = e.pos.x, tz = e.pos.z, look = null;
  if (e.stun > 0) { /* frozen */ }
  else if (e.state === 'patrol') {
    if (!e.wp) e.wp = randomWaypoint(e);
    if (e.wait > 0) { e.wait -= dt; e.yaw += Math.sin(gtime * .7 + e.id) * dt * .35; }
    else { tx = e.wp.x; tz = e.wp.z; moveSpd = 1.45; if (Math.hypot(tx - e.pos.x, tz - e.pos.z) < 1.2) { e.wp = null; e.wait = rand(1.5, 4.5); } }
  } else if (e.state === 'search') {
    e.searchT += dt; tx = e.last.x; tz = e.last.z; moveSpd = e.searchT < 4 ? 3.6 : 1.6;
    if (Math.hypot(tx - e.pos.x, tz - e.pos.z) < 1.5) { moveSpd = 0; e.yaw += Math.sin(gtime * .9 + e.id) * dt * 1.6; }
    if (e.searchT > 12) { e.state = 'patrol'; e.wp = null; e.susp = 0; }
  } else {
    if (e.see) { e.last.copy(P.pos); e.unseen = 0; } else e.unseen += dt;
    if (e.unseen > 3.5) { e.state = 'search'; e.searchT = 0; setHot(e, false); }
    look = [dx, dz];
    e.strafeT -= dt; if (e.strafeT <= 0) { e.strafe = Math.random() < .5 ? -1 : 1; e.strafeT = rand(1.4, 3); }
    if (!e.see) { tx = e.last.x; tz = e.last.z; moveSpd = 4.4; look = null; }
    else if (dist > 24) { tx = P.pos.x; tz = P.pos.z; moveSpd = 4.2; }
    else if (dist < 8) { tx = e.pos.x - dx; tz = e.pos.z - dz; moveSpd = 2.0; }
    else { tx = e.pos.x + (-dz / dist) * e.strafe * 3; tz = e.pos.z + (dx / dist) * e.strafe * 3; moveSpd = 1.8; }
    if (e.burst > 0) { e.burstT -= dt; if (e.burstT <= 0 && e.see) { enemyShoot(e, dist); e.burst--; e.burstT = .12; } if (!e.see) e.burst = 0; }
    else { e.fireT -= dt; if (e.fireT <= 0 && e.see && dist < 75) { e.burst = 3; e.burstT = 0; e.fireT = rand(1.1, 2.1); } }
  }
  const ox = e.pos.x, oz = e.pos.z;
  moveToward(e, tx, tz, moveSpd, dt, e.state === 'alert' ? 6 : 4);
  pushOut(e.pos, .38, 0, 1.8);
  if (!LAY.insideBorder(e.pos.x, e.pos.z, 2)) { e.pos.x = ox; e.pos.z = oz; e.vel.set(0, 0); }
  const moved = Math.hypot(e.pos.x - ox, e.pos.z - oz), v = moved / Math.max(dt, 1e-4);
  if (moved < (e.vel.length() + .01) * dt * .5) e.vel.multiplyScalar(.5);
  e.spd = lerp(e.spd, v, 1 - Math.exp(-dt * 10));
  if (moveSpd > 0 && v < moveSpd * .25) { e.stuck += dt; if (e.stuck > .8) { e.stuck = 0; e.wp = randomWaypoint(e); if (e.state === 'search') e.last.set(e.pos.x + rand(-8, 8), 0, e.pos.z + rand(-8, 8)); e.strafe *= -1; } } else e.stuck = 0;
  if (!look && e.spd > .25) look = [e.vel.x, e.vel.y];
  if (look && (look[0] || look[1])) faceTo(e, look[0], look[1], dt, e.state === 'alert' ? 9 : 4.5);
  const aim = e.state === 'alert' && e.see ? Math.atan2(P.pos.y + P.eye - (e.pos.y + 1.45), Math.max(dist, 1)) : 0;
  const show = dist < Q().charDist || M.pulseT > 0 || M.density < .015; if (e.model) e.model.visible = show;
  animRunner(e, dt, e.spd, show ? dist : 999, aim);
  e.g.position.copy(e.pos); e.g.rotation.y = e.yaw;
  const pul = e.hot ? 1.12 + Math.sin(gtime * 14) * .12 : 1, hk = clamp(dist / 16, .3, 1); e.eyes.forEach(s => s.scale.setScalar(s.userData.s * pul * (s.userData.halo ? hk : 1)));
  if (e.spd > 3 && dist < 30) { e.dustT -= dt; if (e.dustT <= 0) { e.dustT = .28; spawnPart({ pos: tmp.set(e.pos.x, .12, e.pos.z), vel: tmp2.set(rand(-.4, .4), .3, rand(-.4, .4)), tex: TX.smoke, color: '#c2ad92', s0: .3, s1: 1.1, a0: .35, life: .7, drag: 2 }); } }
}
function updateDrone(e, dt, dx, dz, dist) {
  e.rotors.forEach((r, i) => r.rotation.y += dt * (38 + i * 3));
  let tx = e.pos.x, tz = e.pos.z, ty = 6.5, spd = 0;
  if (e.stun > 0) { ty = 4; }
  else if (e.state === 'patrol') { if (!e.wp || Math.hypot(e.wp.x - e.pos.x, e.wp.z - e.pos.z) < 2) e.wp = randomWaypoint(e); tx = e.wp.x; tz = e.wp.z; spd = 3.5; }
  else if (e.state === 'search') { e.searchT += dt; tx = e.last.x; tz = e.last.z; spd = 4.5; ty = 5.5; if (e.searchT > 12) { e.state = 'patrol'; e.wp = null; } }
  else {
    if (e.see) { e.last.copy(P.pos); e.unseen = 0; } else e.unseen += dt;
    if (e.unseen > 4) { e.state = 'search'; e.searchT = 0; setHot(e, false); }
    e.orbit += dt * .28; tx = e.last.x + Math.cos(e.orbit) * 12; tz = e.last.z + Math.sin(e.orbit) * 12; ty = 4.6; spd = 4.5;
    if (e.burst > 0) { e.burstT -= dt; if (e.burstT <= 0 && e.see) { enemyShoot(e, dist); e.burst--; e.burstT = .1; } }
    else { e.fireT -= dt; if (e.fireT <= 0 && e.see && dist < 60) { e.burst = 4; e.fireT = rand(1.4, 2.4); } }
  }
  const vx0 = e.vel.x, vz0 = e.vel.y;
  moveToward(e, tx, tz, spd, dt, 2.2);
  e.pos.y = lerp(e.pos.y, ty + Math.sin(gtime * 2 + e.orbit) * .35, 1 - Math.exp(-dt * 2));
  if (!LAY.insideBorder(e.pos.x, e.pos.z, 4)) { e.pos.x -= e.vel.x * dt * 2; e.pos.z -= e.vel.y * dt * 2; e.wp = null; }
  if (e.state === 'alert') faceTo(e, dx, dz, dt, 5); else if (spd) faceTo(e, tx - e.pos.x, tz - e.pos.z, dt, 2.5);
  // bank into turns and pitch into acceleration like a real quadcopter
  const c = Math.cos(e.yaw), s = Math.sin(e.yaw), ax = (e.vel.x - vx0) / Math.max(dt, 1e-4), az = (e.vel.y - vz0) / Math.max(dt, 1e-4);
  const fV = -(e.vel.x * s + e.vel.y * c), sV = e.vel.x * c - e.vel.y * s;
  e.tilt.x = damp(e.tilt.x, -fV * .045 - (-(ax * s + az * c)) * .02, 4, dt); e.tilt.y = damp(e.tilt.y, -sV * .05, 4, dt);
  e.body.rotation.set(e.tilt.x, 0, e.tilt.y);
  e.g.position.copy(e.pos); e.g.rotation.y = e.yaw;
  const alert = e.state === 'alert'; e.beam.material.uniforms.col.value.set(alert ? '#ff4a3a' : e.state === 'search' ? '#ffc070' : '#ffe9d0'); e.beam.material.uniforms.op.value = (alert ? .7 : .5) * (dist < 4 ? .3 : 1);
  e.nav.forEach((n, i) => n.visible = Math.sin(gtime * 6 + i) > -.2);
}
const _sa = new THREE.Vector3(), _sb = new THREE.Vector3(), _sc2 = new THREE.Vector3();
function enemyShoot(e, dist) {
  if (e.type === 'drone') _sa.set(e.pos.x, e.pos.y - .2, e.pos.z);
  else if (e.gun && e.model.visible) { _sa.copy(RUN.muzzle); e.gun.localToWorld(_sa); }
  else _sa.set(e.pos.x - Math.sin(e.yaw) * .85, e.pos.y + 1.36, e.pos.z - Math.cos(e.yaw) * .85);
  const pmove = Math.hypot(P.vel.x, P.vel.z);
  let p = (e.type === 'drone' ? .3 : .5) * (1 - dist / 85) * (P.crouch ? .75 : 1) * (pmove > 6 ? .55 : pmove > 2 ? .8 : 1) * (1 - Math.min(.35, M.density * 6));
  p = clamp(p, .06, .75);
  const hit = Math.random() < p;
  _sb.set(P.pos.x, P.pos.y + P.eye - .25, P.pos.z);
  if (!hit) { _sb.x += rand(-1, 1) * 1.4; _sb.y += rand(-.6, 1); _sb.z += rand(-1, 1) * 1.4; _sb.sub(_sa).multiplyScalar(1.6).add(_sa); }
  tracer(_sa, _sb, '#ff5a4a', .07);
  spawnPart({ pos: _sa, color: '#ffb070', add: true, s0: .8, s1: .2, life: .06, fog: false });
  if (dist < 45) { enemyFlash.position.copy(_sa); enemyFlash.intensity = 6; }
  SFX.enemy(dist);
  if (hit) hurt(e.type === 'drone' ? 5 : 8, e.pos);
  else { _sc2.subVectors(_sb, _sa); const L = _sc2.length(); _sc2.divideScalar(L); const w = tmp.subVectors(camera.position, _sa); const t = clamp(w.dot(_sc2), 0, L); if (w.addScaledVector(_sc2, -t).length() < 2) setTimeout(() => SFX.whiz(), Math.min(250, dist * 2)); }
}

/* ---------- aim assist (lock-on) ---------- */
let lockT = null, lockSnap = 0, prevAds = false, lockClose = false;
const _ap = new THREE.Vector3(), _cf = new THREE.Vector3(), _ld = new THREE.Vector3();
function aimPoint(e, out) { return e.type === 'drone' ? out.copy(e.pos) : out.set(e.pos.x, e.pos.y + 1.3, e.pos.z); }
function angleTo(e) { aimPoint(e, _ap).sub(camera.position); const d = _ap.length(); return { ang: Math.acos(clamp(_ap.dot(_cf) / d, -1, 1)) * 180 / Math.PI, d }; }
function losTo(e, d) { aimPoint(e, _ap); _ld.subVectors(_ap, camera.position).normalize(); return !rayStatic(camera.position, _ld, Math.max(.1, d - .6)).hit; }
function findTarget(maxAng) { let best = null, bs = 1e9; for (const e of enemies) { if (e.dead) continue; const { ang, d } = angleTo(e); if (ang > maxAng || d > 90) continue; const sc = ang + d * .05; if (sc < bs && losTo(e, d)) { bs = sc; best = e; } } return best; }
function aimAssist(dt) {
  const ads = (rightDown || touch.ads) && !P.sprint && P.guns[P.wi].reloadT <= 0, el = $('lock');
  if (!ads) { lockT = null; prevAds = false; lockClose = false; el.style.display = 'none'; return; }
  camera.getWorldDirection(_cf);
  const fresh = !prevAds; prevAds = true;
  if (lockT) { if (lockT.dead) lockT = null; else { const { ang, d } = angleTo(lockT); if (ang > 14 || d > 90 || !losTo(lockT, d)) lockT = null; } }
  if (!lockT) { lockT = findTarget(fresh ? 16 : 7); lockSnap = lockT ? (fresh ? .22 : .12) : 0; }
  if (!lockT) { el.style.display = 'none'; lockClose = false; return; }
  aimPoint(lockT, _ap); const dx = _ap.x - camera.position.x, dy = _ap.y - camera.position.y, dz = _ap.z - camera.position.z;
  const desYaw = Math.atan2(-dx, -dz), desPitch = Math.atan2(dy, Math.hypot(dx, dz)) - P.kick.x;
  const k = lockSnap > 0 ? 1 - Math.exp(-dt * 20) : 1 - Math.exp(-dt * (isTouch ? 8 : 3.5)); lockSnap -= dt;
  P.yaw += wrap(desYaw - P.yaw) * k; P.pitch += (desPitch - P.pitch) * k; lockClose = true;
  aimPoint(lockT, _ap).project(camera); el.style.display = 'block'; el.style.left = ((_ap.x + 1) / 2 * innerWidth) + 'px'; el.style.top = ((1 - _ap.y) / 2 * innerHeight) + 'px';
}

/* ---------- ammo crates ---------- */
let crates = [];
function spawnCrates() {
  for (const c0 of LAY.crates) {
    const sp = pointFree(c0.x, c0.z, .8) ? c0 : freeSpot(c0.x, c0.z, 0, 5); if (!sp) continue;
    const g = new THREE.Group(); const body = new THREE.Mesh(new RoundedBoxGeometry(1.1, .6, .7, 2, .05), MAT.ammo); body.position.y = .31; body.castShadow = true; g.add(body);
    const lid = new THREE.Mesh(new RoundedBoxGeometry(1.14, .1, .74, 2, .03), MAT.gun); lid.position.y = .64; g.add(lid);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: TX.glow, color: '#f2c14e', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: .8 })); glow.position.y = .85; glow.scale.setScalar(2.6); g.add(glow);
    g.position.set(sp.x, 0, sp.z); g.rotation.y = Math.random() * 6; scene.add(g); crates.push({ g, glow, x: sp.x, z: sp.z, cd: 0 });
  }
}
function updateCrates(dt) {
  for (const c of crates) {
    c.g.visible = Math.hypot(c.x - camera.position.x, c.z - camera.position.z) < 110;
    if (c.cd > 0) { c.cd -= dt; c.glow.visible = false; continue; } c.glow.visible = true; c.glow.material.opacity = .55 + Math.sin(gtime * 3) * .25;
    if (Math.hypot(c.x - P.pos.x, c.z - P.pos.z) < 1.9 && (P.guns[0].reserve < 300 || P.guns[1].reserve < 96)) { P.guns[0].reserve = Math.max(P.guns[0].reserve, 300); P.guns[1].reserve = Math.max(P.guns[1].reserve, 96); c.cd = 25; SFX.pickup(); toast('AMMO REFILLED'); }
  }
  const tot = P.guns[0].mag + P.guns[0].reserve;
  if (tot < 90 && !M.lowWarned) { M.lowWarned = true; tip('RUNNING LOW — FOLLOW THE GOLD ▣ ON YOUR COMPASS TO AN AMMO CRATE'); } if (tot >= 120) M.lowWarned = false;
}

/* ---------- tips ---------- */
const TIPS = () => isTouch ? [
  [2, 'RED GLOW = HAZE RUNNERS. THE RED CONE ON THE GROUND IS WHAT THEY CAN SEE.'],
  [10, 'STAY OUT OF THE CONES. TAP LOW TO CROUCH — THEIR CONES SHRINK BY HALF.'],
  [18, '? OVER A HEAD = THEY NOTICED SOMETHING. ! = THEY SPOTTED YOU.'],
  [26, 'TAP AIM — IT LOCKS ONTO THE NEAREST TARGET IN YOUR SIGHTS.'],
  [34, 'GUNSHOTS ARE LOUD. EVERY RUNNER WITHIN 60m COMES LOOKING.']] : [
  [2, 'RED GLOW = HAZE RUNNERS. THE RED CONE ON THE GROUND IS WHAT THEY CAN SEE.'],
  [10, 'STAY OUT OF THE CONES. CROUCH [C] — THEIR CONES SHRINK BY HALF.'],
  [18, '? OVER A HEAD = THEY NOTICED SOMETHING. ! = THEY SPOTTED YOU.'],
  [26, 'HOLD RIGHT-CLICK TO AIM — IT LOCKS ONTO THE NEAREST TARGET IN YOUR SIGHTS.'],
  [34, 'GUNSHOTS ARE LOUD. EVERY RUNNER WITHIN 60m COMES LOOKING.']];
let tipTO, tipIdx = 0;
function tip(t) { const el = $('tip'); el.textContent = t; el.classList.add('on'); clearTimeout(tipTO); tipTO = setTimeout(() => el.classList.remove('on'), 6500); }
function updateTips(dt) {
  const L = TIPS(); if (tipIdx < L.length && M.time >= L[tipIdx][0]) { tip(L[tipIdx][1]); tipIdx++; }
  M.borderT -= dt; if (M.borderT <= 0 && LAY.distToBorder(P.pos.x, P.pos.z) < 9) { M.borderT = 40; tip('QUARANTINE FENCE — NOBODY GETS OUT UNTIL THE MACHINES GO DOWN.'); }
}

/* ---------- neighbors ---------- */
let interactTarget = null, eHeld = false;
function updateInteract(dt) {
  interactTarget = null; let best = 2.6;
  for (const n of neighbors) { if (n.saved) continue; const d = Math.hypot(n.x - P.pos.x, n.z - P.pos.z); if (d < best) { best = d; interactTarget = n; } }
  const pr = $('prompt');
  if (interactTarget) { pr.style.display = 'block'; $('promptT').innerHTML = 'HOLD <kbd>E</kbd> — GUIDE NEIGHBOR HOME'; if (eHeld) { interactTarget.hold += dt; if (interactTarget.hold >= 1) saveNeighbor(interactTarget); } else interactTarget.hold = Math.max(0, interactTarget.hold - dt * 2); $('promptP').style.width = (interactTarget.hold * 100) + '%'; }
  else pr.style.display = 'none';
  $('tUse').style.display = interactTarget && isTouch ? 'flex' : 'none';
}
function saveNeighbor(n) {
  n.saved = true; M.saved++; n.g.rotation.y = Math.atan2(P.pos.x - n.x, P.pos.z - n.z); const pts = Math.round(250 * M.mult); M.score += pts; M.pulse = Math.min(100, M.pulse + 25);
  if (n.act) n.act.timeScale = 1; n.ph.visible = false;
  SFX.rescue(); banner('NEIGHBOR HOME', `${M.saved}/${neighbors.length} SAFE · +${pts}`);
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(.7, .7, 60, 12, 1, true), new THREE.MeshBasicMaterial({ color: '#ffd77a', transparent: true, opacity: .5, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide })); beam.position.set(n.x, 30, n.z); scene.add(beam); n.beam = beam;
}
function updateNeighbors(dt) {
  for (const n of neighbors) {
    n.t += dt; if (n.done) continue;
    const dist = Math.hypot(n.x - P.pos.x, n.z - P.pos.z);
    if (n.model) n.model.visible = n.saved || dist < Q().charDist || M.density < .015;
    animNeighbor(n, dt, n.model && !n.model.visible ? 999 : dist);
    if (!n.saved) { n.ph.material.opacity = .55 + Math.sin(n.t * 3 + n.phase) * .35; continue; }
    n.saveT = (n.saveT || 0) + dt; if (n.saveT < 2.6) continue;
    n.g.position.y += dt * 2.2; n.g.scale.multiplyScalar(1 - dt * .4); n.beam.material.opacity = Math.max(0, n.beam.material.opacity - dt * .25);
    if (n.beam.material.opacity <= 0) { scene.remove(n.g); scene.remove(n.beam); n.done = true; }
  }
}

/* ---------- star pulse ---------- */
const rings = [];
function starPulse() {
  if (state !== 'play') return; if (M.pulse < 100) { toast('STAR PULSE CHARGING'); return; }
  M.pulse = 0; M.pulseT = 7; SFX.pulse(); banner('STAR PULSE', '7 SECONDS OF CLEAR SKY · NEARBY ENEMIES STUNNED'); pulseLight.intensity = 40; pulseLight.position.copy(P.pos).setY(P.pos.y + 3);
  for (const e of enemies) if (!e.dead && e.pos.distanceTo(P.pos) < 55) { e.stun = 3; e.reveal = 7; e.rv.visible = true; }
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1, .15, 8, 48), new THREE.MeshBasicMaterial({ color: '#ffd77a', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  ring.rotation.x = Math.PI / 2; ring.position.copy(P.pos).setY(P.pos.y + 1); scene.add(ring); rings.push({ m: ring, t: 0 });
  M.flash = .5; M.trauma = Math.min(1, M.trauma + .2);
}
function updateRings(dt) { for (let i = rings.length - 1; i >= 0; i--) { const r = rings[i]; r.t += dt; const s = 1 + r.t * 70; r.m.scale.set(s, s, 1 + r.t * 4); r.m.material.opacity = Math.max(0, 1 - r.t / .9); if (r.t > .9) { scene.remove(r.m); rings.splice(i, 1); } } }

/* ---------- player damage ---------- */
function hurt(dmg, from) {
  if (state !== 'play') return;
  P.hp -= dmg; P.lastHurt = gtime; SFX.hurt(); M.trauma = Math.min(1, M.trauma + .18);
  VM.rot.v.z += rand(-1, 1) * 1.5; VM.pos.v.y -= .15; P.kick.v += .5;
  const ang = Math.atan2(from.x - P.pos.x, -(from.z - P.pos.z)) - (-P.yaw); const di = $('dmgdir').firstElementChild;
  di.style.transition = 'none'; di.style.opacity = 1; $('dmgdir').style.transform = `rotate(${wrap(ang) * 180 / Math.PI}deg)`; requestAnimationFrame(() => { di.style.transition = 'opacity 1.1s'; di.style.opacity = 0; });
  if (P.hp <= 0) die();
}
function die() { P.hp = 0; state = 'dead'; P.deadT = 0; releasePointer(); setTimeout(() => { if (state !== 'dead') return; $('deadStats').innerHTML = statsHTML(); show('sDead'); }, 1800); }

/* ---------- HUD ---------- */
const feedEl = $('feed');
function feed(html) { const d = document.createElement('div'); d.innerHTML = html; feedEl.prepend(d); while (feedEl.children.length > 5) feedEl.lastChild.remove(); setTimeout(() => { d.style.opacity = 0; setTimeout(() => d.remove(), 600); }, 4500); }
let bannerTO; function banner(a, b = '') { $('bigT').textContent = a; $('subT').textContent = b; $('banner').classList.add('on'); clearTimeout(bannerTO); bannerTO = setTimeout(() => $('banner').classList.remove('on'), 2600); }
let toastTO; function toast(t) { const el = $('toast'); el.textContent = t; el.classList.add('on'); clearTimeout(toastTO); toastTO = setTimeout(() => el.classList.remove('on'), 1200); }
let hmTO; function hitmarker(kill) { const h = $('hitm'); h.classList.toggle('kill', kill); h.classList.add('on'); clearTimeout(hmTO); hmTO = setTimeout(() => h.classList.remove('on'), kill ? 220 : 110); }
const CMP = { ticks: [], marks: [] };
(() => { const tc = $('cmpTicks'); const names = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' };
  for (let d = 0; d < 360; d += 15) { const el = document.createElement('div'); el.className = 'tk' + (names[d] ? (d === 0 ? ' n' : d % 90 === 0 ? ' c' : '') : ' m'); el.textContent = d === 0 ? '★ N' : (names[d] || ''); tc.appendChild(el); CMP.ticks.push({ el, d }); }
  const mc = $('cmpMarks'); for (let i = 0; i < 40; i++) { const el = document.createElement('div'); el.className = 'mk'; el.style.display = 'none'; mc.appendChild(el); CMP.marks.push(el); } })();
const FOVC = 75;
function updateCompass() {
  const head = ((-P.yaw * 180 / Math.PI) % 360 + 360) % 360;
  for (const t of CMP.ticks) { const rel = ((t.d - head + 540) % 360) - 180; if (Math.abs(rel) > FOVC) { t.el.style.display = 'none'; continue; } t.el.style.display = 'block'; t.el.style.left = (50 + rel / FOVC * 50) + '%'; }
  let k = 0; const place = (x, z, cls, txt) => { if (k >= CMP.marks.length) return; const dx = x - P.pos.x, dz = z - P.pos.z; const hd = Math.atan2(dx, -dz) * 180 / Math.PI; const rel = ((hd - head + 540) % 360) - 180; const el = CMP.marks[k++]; if (Math.abs(rel) > FOVC) { el.style.display = 'none'; return; } el.style.display = 'block'; el.className = 'mk ' + cls; el.style.left = (50 + rel / FOVC * 50) + '%'; el.textContent = txt; };
  for (const m of machines) if (m.alive) place(m.x, m.z, 'mach', '◆ ' + Math.round(Math.hypot(m.x - P.pos.x, m.z - P.pos.z)) + 'm');
  for (const n of neighbors) if (!n.saved && Math.hypot(n.x - P.pos.x, n.z - P.pos.z) < 75) place(n.x, n.z, 'npc', '●');
  for (const e of enemies) if (!e.dead && e.state === 'alert' && e.pos.distanceTo(P.pos) < 70) place(e.pos.x, e.pos.z, 'foe', '▼');
  if (P.guns[0].mag + P.guns[0].reserve < 120) { let bc = null, bd = 1e9; for (const c of crates) { if (c.cd > 0) continue; const d = Math.hypot(c.x - P.pos.x, c.z - P.pos.z); if (d < bd) { bd = d; bc = c; } } if (bc) place(bc.x, bc.z, 'ammo', '▣ AMMO ' + Math.round(bd) + 'm'); }
  for (; k < CMP.marks.length; k++) CMP.marks[k].style.display = 'none';
}
let hudCache = {}, locT = 0;
function setText(id, v) { if (hudCache[id] !== v) { hudCache[id] = v; $(id).textContent = v; } }
function updateHUD(dt) {
  const g = P.guns[P.wi];
  $('hp').style.width = Math.max(0, P.hp) + '%'; $('hpbar').classList.toggle('low', P.hp < 35);
  $('vig').style.opacity = clamp((60 - P.hp) / 60, 0, .85) + (gtime - P.lastHurt < .25 ? .3 : 0);
  const vis = $('vis'); const cls = anySee ? 'spotted' : maxSusp > .15 ? 'search' : '';
  if (hudCache.vis !== cls) { hudCache.vis = cls; vis.className = cls; }
  vis.lastElementChild.textContent = anySee ? 'SPOTTED' : maxSusp > .15 ? 'THEY HEARD SOMETHING' : (P.crouch ? 'HIDDEN — STAYING LOW' : 'HIDDEN IN THE HAZE');
  { let R = visRange() * (P.crouch ? .5 : 1) * (P.sprint ? 1.25 : 1); if (M.pulseT > 0) R *= .3; $('visR').innerHTML = `THEY CAN SEE YOU WITHIN <b>${Math.round(Math.min(R, 99))}m</b>${P.crouch ? ' · CROUCHED' : ''}`; }
  setText('score', M.score.toLocaleString()); setText('mult', M.mult > 1 ? '×' + M.mult.toFixed(2) : '');
  const om = $('oM'); om.querySelector('b').textContent = `${M.machinesDown}/3`; om.classList.toggle('done', M.machinesDown >= 3);
  const on = $('oN'); on.querySelector('b').textContent = `${M.saved}/${neighbors.length}`; on.classList.toggle('done', M.saved >= neighbors.length && neighbors.length > 0);
  $('oK').querySelector('b').textContent = M.kills;
  setText('wname', g.w.name); setText('mag', String(g.mag)); setText('res', '/ ' + g.reserve);
  $('ammo').classList.toggle('low', g.mag <= Math.ceil(g.w.mag * .25));
  setText('ammoH', g.reloadT > 0 ? 'RELOADING…' : g.mag === 0 && g.reserve === 0 ? 'NO AMMO — SWAP [Q]' : g.mag <= Math.ceil(g.w.mag * .25) ? 'RELOAD [R]' : '');
  $('pulseF').style.width = M.pulse + '%'; $('pulse').classList.toggle('ready', M.pulse >= 100);
  setText('pulseT', M.pulseT > 0 ? `STAR PULSE ACTIVE · ${Math.ceil(M.pulseT)}` : M.pulse >= 100 ? (isTouch ? 'STAR PULSE READY · TAP ★' : 'STAR PULSE READY · PRESS F') : 'STAR PULSE');
  locT -= dt; if (locT <= 0) { locT = .4; const nr = LAY.nearestRoads(P.pos.x, P.pos.z); setText('locA', !nr.length ? 'THE WESTSIDE' : nr.length > 1 && nr[1].d < 16 ? `${nr[0].name} & ${nr[1].name}` : nr[0].d < 22 ? nr[0].name : `NEAR ${nr[0].name}`); }
  const moving = Math.hypot(P.vel.x, P.vel.z) > 1; const sp = (6 + (moving ? 8 : 0) + (P.onGround ? 0 : 10) + P.kick.x * 300 + P.heat * 10) * (1 - P.ads) * (P.crouch ? .75 : 1);
  const xh = $('xh'); xh.style.opacity = P.ads > .6 || P.sprintK > .5 || P.slideT > 0 ? 0 : 1;
  xh.children[0].style.top = (-sp - 9) + 'px'; xh.children[1].style.top = sp + 'px'; xh.children[2].style.left = (-sp - 9) + 'px'; xh.children[3].style.left = sp + 'px';
  updateCompass();
}
function statsHTML() { const acc = M.shots ? Math.round(M.hits / M.shots * 100) : 0; const t = Math.floor(M.time); return [[M.score.toLocaleString(), 'SCORE'], [M.kills, 'RUNNERS DOWN'], [M.heads, 'HEADSHOTS'], [`${M.saved}/${neighbors.length}`, 'NEIGHBORS HOME'], [acc + '%', 'ACCURACY'], [`${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`, 'TIME']].map(([a, b]) => `<div><b>${a}</b><span>${b}</span></div>`).join(''); }

/* ---------- view model: springs, bob, sprint, reload choreography ---------- */
const bump = (k, a, b) => { const t = (k - a) / (b - a); return t <= 0 || t >= 1 ? 0 : Math.sin(t * Math.PI); };
const ease = (k, a, b) => smooth01(clamp((k - a) / (b - a), 0, 1));
const RP = { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 };
function reloadPose(k, wi) {
  const tilt = ease(k, 0, .14) * (1 - ease(k, .84, 1));
  RP.rz = .5 * tilt; RP.rx = .14 * tilt; RP.ry = .16 * tilt; RP.x = -.018 * tilt; RP.y = -.04 * tilt; RP.z = .025 * tilt;
  RP.y -= .025 * bump(k, .14, .24); RP.rz += .08 * bump(k, .14, .24);
  RP.y += .035 * bump(k, .5, .6); RP.rx += .09 * bump(k, .5, .6);
  if (wi === 0) { RP.z += .045 * bump(k, .72, .84); RP.rz += .12 * bump(k, .72, .84); } else { RP.z += .03 * bump(k, .72, .82); RP.rx += .06 * bump(k, .72, .82); }
  return RP;
}
const _gp = new THREE.Vector3(), _mp = new THREE.Vector3();
function updateGunView(dt) {
  const gun = VM.guns[P.wi], u = gun.userData, g = P.guns[P.wi]; if (!g) return;
  const a = smooth01(P.ads);
  gunCam.aspect = camera.aspect; const gf = lerp(58, 46, a); gunCam.fov = gf; gunCam.updateProjectionMatrix();
  // turning drags the gun behind the view
  const sw = 1 - a * .7, ldx = clamp(VM.lookDX, -90, 90), ldy = clamp(VM.lookDY, -90, 90);
  VM.rot.v.y += ldx * .0012 * sw; VM.rot.v.x += ldy * .0012 * sw; VM.rot.v.z += ldx * .0009 * sw; VM.pos.v.x -= ldx * .00008 * sw; VM.lookDX = VM.lookDY = 0;
  stepVS(VM.rot, dt, 180, 14); stepVS(VM.pos, dt, 200, 17);
  const lvx = P.vel.x * right.x + P.vel.z * right.z, lvz = P.vel.x * fwd.x + P.vel.z * fwd.z;
  const pos = _gp.copy(u.hip).lerp(u.ads, a);
  const bA = P.bobA * (1 - a * .88) * (1 + P.sprintK * 1.3), ph = P.bobT;
  pos.x += Math.sin(ph) * .012 * bA; pos.y -= (Math.cos(ph * 2) * .5 + .5) * .013 * bA;
  let rx = -(Math.cos(ph * 2) * .5 + .5) * .012 * bA, ry = Math.sin(ph) * .01 * bA, rz = Math.sin(ph) * .02 * bA;
  const br = (1 - Math.min(1, P.bobA) * .7) * (1 - a * .8);
  pos.y += Math.sin(gtime * 1.6) * .0038 * br; pos.x += Math.sin(gtime * .8) * .0022 * br; rx += Math.sin(gtime * 1.6 + .6) * .006 * br;
  pos.x -= lvx * .0035 * (1 - a * .85); rz -= lvx * .013 * (1 - a * .7); pos.z += clamp(lvz, -5, 8) * .0022 * (1 - a);
  pos.y += clamp(-P.vel.y * .004, -.035, .03) * (1 - a * .7);
  pos.y += P.crouchK * .012 * (1 - a); rz -= P.crouchK * .06 * (1 - a);
  if (P.sprintK > .002) { const s = P.sprintK; pos.lerp(u.sprint, s * .9); ry += .62 * s; rz += .3 * s; rx -= .2 * s; }
  if (P.slideT > 0) { rz += .25; pos.x -= .03; }
  if (g.reloadT > 0) { const r = reloadPose(1 - g.reloadT / g.w.reload, P.wi); pos.x += r.x; pos.y += r.y; pos.z += r.z; rx += r.rx; ry += r.ry; rz += r.rz; }
  if (P.swapT > 0) { const d = P.swapT > .25 ? smooth01(1 - (P.swapT - .25) / .25) : smooth01(P.swapT / .25); pos.y -= d * .24; rx -= d * .7; rz += d * .2; }
  if (state === 'dead') pos.y -= Math.min(1, P.deadT) * .4;
  gun.position.copy(pos).add(VM.pos.x);
  gun.rotation.set(rx + VM.rot.x.x, ry + VM.rot.x.y, rz + VM.rot.x.z);
  const scoped = !!u.scope && P.ads > .86 && state === 'play'; $('scope').style.display = scoped ? 'block' : 'none'; gun.visible = !scoped;
  if (VM.flashT > 0) {
    VM.flashT -= dt; gun.updateMatrixWorld(true); _mp.copy(u.muzzle); gun.localToWorld(_mp);
    VM.flash.visible = !scoped; VM.flash.position.copy(_mp); const s = (P.wi === 0 ? .3 : .22) * rand(.8, 1.25); VM.flash.scale.set(s, s, 1); VM.flash.material.rotation = Math.random() * 6;
    VM.flash2.visible = !scoped; VM.flash2.position.copy(_mp); VM.flash2.quaternion.copy(gun.quaternion); VM.flash2.rotateZ(Math.random() * 6); VM.flash2.scale.setScalar(rand(.8, 1.3));
    gunFlashLight.position.copy(_mp);
  } else VM.flash.visible = VM.flash2.visible = false;
  gunFlashLight.intensity = Math.max(0, gunFlashLight.intensity - dt * 140);
  muzzleLight.intensity = Math.max(0, muzzleLight.intensity - dt * 200);
  updateBrass(dt);
}

/* ---------- atmosphere ---------- */
const _hc2 = new THREE.Color('#b4826e');
function updateAtmos(dt) {
  const wasPulse = M.pulseT > 0; M.pulseT = Math.max(0, M.pulseT - dt);
  if (wasPulse && M.pulseT <= 0 && state === 'play' && M.machinesDown < 3) { const left = 3 - M.machinesDown; banner('THE HAZE IS ROLLING BACK IN', `${left} MACHINE${left > 1 ? 'S' : ''} STILL PUMPING IT OUT`); M.refillT = 8; }
  if (M.refillT > 0) M.refillT -= dt;
  const target = M.pulseT > 0 ? .006 : M.densityTarget;
  M.density = lerp(M.density, target, 1 - Math.exp(-dt * (M.pulseT > 0 ? 3 : M.refillT > 0 ? .28 : .5)));
  scene.fog.near = M.density; scene.fog.far = gtime;
  const h = hazeAmt();
  scene.fog.color.copy(HAZE).lerp(_hc2, 1 - h);
  hemi.intensity = lerp(1.25, 1.0, h); sun.intensity = lerp(2.5, 1.35, h); renderer.toneMappingExposure = lerp(1.05, .95, h);
  sun.position.copy(P.pos).add(SUN_OFF); sun.target.position.copy(P.pos);
  pulseLight.intensity = Math.max(0, pulseLight.intensity - dt * 30); enemyFlash.intensity = Math.max(0, enemyFlash.intensity - dt * 120);
  updateSky(dt);
  { const far = Math.min(420, 2.4 / M.density + 40); for (const ch of CHUNKS) ch.im.visible = Math.hypot(ch.c.x - camera.position.x, ch.c.z - camera.position.z) - ch.r < far; }
  fogMat.uniforms.opacity.value = .085 * h + .02; fogMat.uniforms.color.value.copy(scene.fog.color).multiplyScalar(1.12);
  for (const s of fogSprites) { s.position.addScaledVector(s.userData.v, dt); const dx = s.position.x - camera.position.x, dz = s.position.z - camera.position.z, d2 = dx * dx + dz * dz; if (d2 > 40 * 40 || d2 < 8 * 8) { const a = Math.random() * 6.28, r = rand(14, 38); s.position.set(camera.position.x + Math.cos(a) * r, rand(.8, 5), camera.position.z + Math.sin(a) * r); } } syncFog();
  let near = null, nd = 1e9;
  for (const m of machines) {
    if (!m.alive) continue; m.puffT -= dt;
    const d = Math.hypot(m.x - camera.position.x, m.z - camera.position.z); if (d < nd) { nd = d; near = m; }
    m.rings.forEach((r, i) => { r.position.y = 4.4 + ((gtime * 1.6 + i * 2.2) % 8.8); r.scale.setScalar(1 + Math.sin(gtime * 3 + i) * .08); });
    m.beacon.material.opacity = .6 + Math.sin(gtime * 4 + m.x) * .35; m.core.material.color.set(m.flash > 0 ? '#ffffff' : '#b37bff'); m.beacon.scale.setScalar(m.flash > 0 ? 12 : 9); m.flash -= dt;
    m.col.material.uniforms.op.value = .28 + Math.sin(gtime * 1.3 + m.z) * .06;
    if (m.puffT <= 0) { m.puffT = M.refillT > 0 ? .08 : .35; spawnPart({ pos: tmp.set(m.x + rand(-.6, .6), m.top, m.z + rand(-.6, .6)), vel: tmp2.set(rand(-1.5, 1.5), rand(1.5, 3), rand(-1.5, 1.5)), tex: TX.smoke, color: '#b89ccf', s0: 2, s1: 11, a0: .5, life: 3.5, spin: rand(-.4, .4) }); }
  }
  if (near) { machineLight.position.set(near.x, 3.5, near.z); machineLight.intensity = 16 + Math.sin(gtime * 5) * 5; } else machineLight.intensity = 0;
  if (AU.ctx) Ambience.update(dt, near && state === 'play' ? clamp(1 - nd / 70, 0, 1) ** 2 : 0, h);
}

/* ---------- title camera: a slow drift up MLK toward the North Star ---------- */
function idleCam(dt) {
  const sp = LAY.spawn, t = gtime * .045;
  camera.position.set(sp.x + 2.2 + Math.sin(t) * 1.4, 2.3 + Math.sin(t * 1.7) * .45, sp.z - 6 + Math.cos(t * .8) * 7);
  camera.rotation.set(.05 + Math.sin(t * 1.3) * .02, sp.yaw + Math.sin(t * .6) * .32, Math.sin(t * .9) * .01);
  if (camera.fov !== 72) { camera.fov = 72; camera.updateProjectionMatrix(); }
}

/* ---------- menus, settings ---------- */
const menu = $('menu'), hud = $('hud'), touchUI = $('touch');
function show(id) { document.querySelectorAll('.screen').forEach(s => s.classList.toggle('on', s.id === id)); menu.style.display = id ? 'flex' : 'none'; hud.style.display = (state === 'play') ? 'block' : 'none'; touchUI.classList.toggle('on', isTouch && state === 'play'); }
document.querySelectorAll('[data-go]').forEach(b => b.onclick = () => show(b.dataset.go));
$('bPlay').onclick = () => { initAudio(); show('sMissions'); };
$('bCtl').onclick = () => show('sCtl');
$('m1').onclick = () => show('sBrief');
$('bDeploy').onclick = () => startGame();
$('bRetry').onclick = () => startGame(); $('bAgain').onclick = () => startGame();
$('bResume').onclick = () => { state = 'play'; show(null); lockPointer(); };
$('bRestart').onclick = () => startGame();
$('bQuit').onclick = $('bMenu1').onclick = $('bMenu2').onclick = () => { state = 'title'; resetMission(); show('sTitle'); showBest(); };
let settingsBack = 'sTitle';
function openSettings(from) { settingsBack = from; syncSettingsUI(); show('sSettings'); }
function syncSettingsUI() { $('setMusicVol').value = SET.musicVol; $('setSfx').value = SET.sfxVol; $('setSens').value = SET.sens; document.querySelectorAll('#setQ button').forEach(b => b.classList.toggle('on', b.dataset.q === SET.quality)); Music.syncUI(); }
$('bSet1').onclick = () => openSettings('sTitle'); $('bSet2').onclick = () => openSettings('sPause');
$('bSetBack').onclick = () => show(settingsBack);
$('setMusic').onclick = () => { initAudio(); Music.set(!SET.music); };
$('setMusicVol').oninput = e => { SET.musicVol = +e.target.value; saveSet(); applyVolumes(); };
$('setSfx').oninput = e => { SET.sfxVol = +e.target.value; saveSet(); applyVolumes(); };
$('setSens').oninput = e => { SET.sens = +e.target.value; saveSet(); };
document.querySelectorAll('#setQ button').forEach(b => b.onclick = () => { SET.quality = b.dataset.q; saveSet(); applyQuality(); syncSettingsUI(); });
$('npMute').onclick = e => { e.stopPropagation(); initAudio(); Music.toggle(); };
$('bMusic').onclick = () => $('fileIn').click();
$('fileIn').onchange = e => { const files = [...e.target.files]; if (!files.length) return; initAudio(); Music.useTracks(files.map(f => ({ title: f.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' '), src: URL.createObjectURL(f) }))); if (!SET.music) Music.set(true); toast('YOUR MUSIC IS ON'); };
function showBest() { const b = store.get('lv_best', 0); $('best').textContent = b ? `BEST SCORE · ${b.toLocaleString()}` : ''; }
let hintTO;
function startGame() {
  initAudio(); resetMission(); M.density = .046; state = 'play'; show(null); lockPointer();
  banner('FOLLOW THE NORTH STAR', 'SHUT DOWN THE 3 HAZE MACHINES'); $('hint').style.opacity = 1; clearTimeout(hintTO); hintTO = setTimeout(() => $('hint').style.opacity = 0, 18000);
}
function lockPointer() { if (isTouch) return; try { const p = renderer.domElement.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch {} }
function releasePointer() { if (document.pointerLockElement) document.exitPointerLock(); }
function pause() { if (state !== 'play') return; state = 'pause'; mouseDown = rightDown = false; show('sPause'); }
document.addEventListener('pointerlockchange', () => { if (!document.pointerLockElement && state === 'play') pause(); });
function win() {
  state = 'win'; releasePointer();
  const bonus = Math.max(0, Math.round((600 - M.time) * 5)); M.score += bonus;
  const best = store.get('lv_best', 0); if (M.score > best) store.set('lv_best', M.score);
  const s = M.score; $('rank').textContent = s > 9000 ? 'S' : s > 6500 ? 'A' : s > 4500 ? 'B' : 'C';
  $('winStats').innerHTML = statsHTML(); show('sWin');
}

/* ---------- input ---------- */
addEventListener('keydown', e => {
  if (e.repeat) { if (e.code === 'KeyE') eHeld = true; return; }
  keys[e.code] = true;
  if (state === 'play') {
    if (e.code === 'Space') { jump(); e.preventDefault(); }
    if (e.code === 'KeyC' || e.code === 'ControlLeft') crouchToggle();
    if (e.code === 'KeyR') reload();
    if (e.code === 'KeyQ') swap(); if (e.code === 'Digit1') swap(0); if (e.code === 'Digit2') swap(1);
    if (e.code === 'KeyE') eHeld = true;
    if (e.code === 'KeyF') starPulse();
    if (e.code === 'KeyP') pause();
    if (e.code === 'Escape' && !document.pointerLockElement) pause();
  } else if (state === 'pause' && (e.code === 'Escape' || e.code === 'KeyP')) $('bResume').click();
  if (e.code === 'KeyN' && AU.ctx) { Music.mode === 'tracks' ? Music.nextTrack() : toast('LOAD YOUR MUSIC IN SETTINGS'); }
  if (e.code === 'KeyM') { initAudio(); Music.toggle(); }
});
addEventListener('keyup', e => { keys[e.code] = false; if (e.code === 'KeyE') eHeld = false; });
renderer.domElement.addEventListener('mousedown', e => { if (state !== 'play') return; if (!document.pointerLockElement && !isTouch) lockPointer(); if (e.button === 0) mouseDown = true; if (e.button === 2) rightDown = true; });
addEventListener('mouseup', e => { if (e.button === 0) mouseDown = false; if (e.button === 2) rightDown = false; });
addEventListener('contextmenu', e => e.preventDefault());
addEventListener('mousemove', e => { if (state !== 'play' || isTouch) return; const s = .0022 * SET.sens * lerp(1, .5, P.ads) * (lockClose ? .6 : 1); P.yaw -= e.movementX * s; P.pitch -= e.movementY * s; VM.lookDX += e.movementX; VM.lookDY += e.movementY; });
addEventListener('wheel', () => { if (state === 'play') swap(); }, { passive: true });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; mouseDown = rightDown = false; eHeld = false; });
if (isTouch) {
  const joy = $('joy'), knob = $('joyK'), look = $('look'), fb = $('tFire');
  let jid = null, jc = null; const lookPts = new Map();
  const resetJoy = () => { jid = null; touch.mx = touch.my = 0; knob.style.left = '40px'; knob.style.top = '40px'; };
  joy.addEventListener('touchstart', e => { const t = e.changedTouches[0]; jid = t.identifier; const r = joy.getBoundingClientRect(); jc = { x: r.left + r.width / 2, y: r.top + r.height / 2 }; e.preventDefault(); }, { passive: false });
  const startLook = e => { for (const t of e.changedTouches) lookPts.set(t.identifier, { x: t.clientX, y: t.clientY }); };
  look.addEventListener('touchstart', e => { startLook(e); e.preventDefault(); }, { passive: false });
  fb.addEventListener('touchstart', startLook);
  addEventListener('touchmove', e => {
    for (const t of e.changedTouches) {
      if (t.identifier === jid && joy.contains(t.target)) { let dx = t.clientX - jc.x, dy = t.clientY - jc.y; const L = Math.hypot(dx, dy), m = 55; if (L > m) { dx *= m / L; dy *= m / L; } knob.style.left = (40 + dx) + 'px'; knob.style.top = (40 + dy) + 'px'; touch.mx = dx / m; touch.my = dy / m; }
      else if (lookPts.has(t.identifier) && (t.target === look || t.target === fb)) { const lp = lookPts.get(t.identifier); touch.lookDX += t.clientX - lp.x; touch.lookDY += t.clientY - lp.y; lp.x = t.clientX; lp.y = t.clientY; }
    }
  }, { passive: false });
  const end = e => { for (const t of e.changedTouches) { lookPts.delete(t.identifier); if (t.identifier === jid) resetJoy(); } if (e.touches.length === 0) { lookPts.clear(); resetJoy(); touch.fire = false; } };
  addEventListener('touchend', end); addEventListener('touchcancel', end);
  const hold = (id, on, off) => { const el = $(id); el.addEventListener('touchstart', e => { e.preventDefault(); el.classList.add('on'); on(); }, { passive: false }); const up = e => { e.preventDefault(); el.classList.remove('on'); off && off(); }; el.addEventListener('touchend', up, { passive: false }); el.addEventListener('touchcancel', up); };
  hold('tFire', () => touch.fire = true, () => touch.fire = false);
  hold('tAds', () => touch.ads = !touch.ads);
  hold('tJump', jump); hold('tCrouch', crouchToggle); hold('tReload', reload); hold('tSwap', () => swap()); hold('tPulse', starPulse);
  hold('tUse', () => eHeld = true, () => eHeld = false); hold('tPause', pause); hold('tMusic', () => { initAudio(); Music.toggle(); });
}
function onResize() {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight);
  if (composer) { composer.setSize(innerWidth, innerHeight); const dpr = renderer.getPixelRatio(); fxaaPass.material.uniforms.resolution.value.set(1 / (innerWidth * dpr), 1 / (innerHeight * dpr)); }
}
addEventListener('resize', onResize);

/* ---------- main loop ---------- */
let last = performance.now() / 1000;
function tick(dt) {
  frameNo++;
  if (state !== 'pause') gtime += dt;
  if (state === 'play') {
    M.time += dt; updatePlayer(dt); aimAssist(dt); updateWeapons(dt); updateCrates(dt); updateTips(dt); updateEnemies(dt); updateNeighbors(dt); updateHUD(dt);
    if (gtime - M.lastKill > 5 && M.mult > 1) { M.mult = 1; M.streak = 0; }
    if (M.winT > 0) { M.winT -= dt; if (M.winT <= 0) win(); }
  } else if (state === 'dead') { P.deadT += dt; camera.position.y = lerp(camera.position.y, P.pos.y + .35, 1 - Math.exp(-dt * 3)); camera.rotation.z = lerp(camera.rotation.z, .6, 1 - Math.exp(-dt * 3)); updateEnemies(dt); }
  else if (state === 'title' || state === 'win') { idleCam(dt); if (frameNo % 2) { updateEnemies(dt); updateNeighbors(dt); } }
  else if (state === 'cam') { updateEnemies(dt); updateNeighbors(dt); }
  if (state !== 'play' && state !== 'pause') $('lock').style.display = 'none';
  if (state !== 'pause') { updateAtmos(dt); updateParticles(dt); updateTracers(dt); updateRings(dt); }
  updateGunView(dt);
  M.flash = Math.max(0, (M.flash || 0) - dt * 1.2);
}
function loop() {
  requestAnimationFrame(loop);
  const now = performance.now() / 1000, dt = Math.min(.05, now - last); last = now;
  tick(dt);
  const gu = gradePass.uniforms; gu.time.value = gtime; gu.hurt.value = state === 'play' || state === 'dead' ? clamp((gtime - P.lastHurt < .3 ? .55 : 0) + clamp((45 - P.hp) / 45, 0, 1) * .7, 0, 1) : 0; gu.flash.value = M.flash * .55; gu.sat.value = state === 'dead' ? Math.max(.15, 1 - P.deadT) : 1;
  gunPass.enabled = state === 'play' || state === 'pause' || state === 'dead' || (state === 'cam' && !!window.__gunView);
  composer.render(dt);
}

/* ---------- boot ---------- */
(async () => {
  const setLoad = t => { $('bPlay').textContent = t; };
  $('bPlay').disabled = true; setLoad('LOADING…');
  try { await Promise.race([Promise.all([document.fonts.load('100px Anton'), document.fonts.load('700 20px Rajdhani')]), new Promise(r => setTimeout(r, 1800))]); } catch {}
  let done = 0; const step = p => p.then(v => { done++; setLoad(`LOADING ${Math.round(done / 3 * 100)}%`); return v; });
  const [world, runner, mich] = await Promise.all([step(loadModule('./world.model.js')), step(loadModule('./runner.model.js')), step(loadModule('./michelle.model.js'))]);
  if (world) for (const k in world) { const g = await parseGLB(world[k]); if (g) makeTemplate(k, g); }
  makeTextures(); MAT.eyeDim.map = MAT.eyeHot.map = MAT.haloDim.map = MAT.haloHot.map = MAT.phone.map = TX.glow; MAT.blob.map = TX.blob;
  if (runner) { const [mesh, idle, walk, run, die] = await Promise.all(['mesh', 'idle', 'walk', 'run', 'die'].map(k => parseGLB(runner[k]))); if (mesh && idle && walk && run && die) prepRunner(mesh, { idle, walk, run, die }); }
  if (mich) { const g = await parseGLB(typeof mich === 'string' ? mich : mich.b64); if (g) prepNeighbor(g); }
  const env = makeEnvMap(); scene.environment = env; scene.environmentIntensity = .55; gunScene.environment = env; gunScene.environmentIntensity = .8;
  buildWorld(); buildSky(); buildFogSprites(); buildDecals(); buildGuns(); buildComposer();
  resetMission(); showBest(); syncSettingsUI(); show('sTitle');
  $('bPlay').disabled = false; setLoad('PLAY');
  window.__lv = { hurt, saveNeighbor, neighbors: () => neighbors, scene, fogSprites, ads: v => rightDown = v, fire: v => mouseDown = v, P, M, VM, RUN, enemies: () => enemies, machines: () => machines, startGame, state: () => state, setState: s => state = s, destroyMachine, starPulse, swap, reload, renderer, camera, composer, LAY, keys, jump, crouchToggle, buildGuns, show, applyQuality, SET, spawnRunner, spawnDrone, gunCam, TPL, sim: sec => { for (let t = 0; t < sec; t += .05) tick(.05); }, rebuildGuns: () => { for (const g of VM.guns) VM.root.remove(g); buildGuns(); VM.guns.forEach((g, i) => g.visible = i === P.wi); } };
  loop();
})();
