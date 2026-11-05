
/* ---------- audio ---------- */
const AU = { ctx: null };
function initAudio() {
  if (AU.ctx) { if (AU.ctx.state === 'suspended') AU.ctx.resume(); return; }
  const C = window.AudioContext || window.webkitAudioContext; if (!C) return;
  const ctx = AU.ctx = new C();
  AU.master = ctx.createGain(); AU.master.gain.value = 1; AU.master.connect(ctx.destination);
  const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4; comp.connect(AU.master);
  AU.sfx = ctx.createGain(); AU.sfx.connect(comp);
  // a generated street-reverb tail so shots ring off the houses
  const ir = ctx.createBuffer(2, ctx.sampleRate * 1.7, ctx.sampleRate);
  for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 3.4) * (i < 900 ? i / 900 : 1); }
  const verb = ctx.createConvolver(); verb.buffer = ir; const wet = ctx.createGain(); wet.gain.value = .26; AU.sfx.connect(verb); verb.connect(wet); wet.connect(comp);
  AU.music = ctx.createGain(); AU.music.connect(comp);
  AU.amb = ctx.createGain(); AU.amb.connect(comp);
  const nb = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), d = nb.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; AU.noise = nb;
  applyVolumes(); Music.init(); Ambience.init();
}
function applyVolumes() {
  if (!AU.ctx) return; const t = AU.ctx.currentTime;
  AU.sfx.gain.setTargetAtTime(.85 * SET.sfxVol, t, .05); AU.amb.gain.setTargetAtTime(.6 * SET.sfxVol, t, .2);
  AU.music.gain.setTargetAtTime(SET.music ? .34 * SET.musicVol : 0, t, .12);
}
function nz({ dur = .15, f = 1500, q = .7, type = 'lowpass', g = .5, at = 0, dest, f2 }) {
  if (!AU.ctx) return; const ctx = AU.ctx, t = ctx.currentTime + Math.max(0, at);
  const s = ctx.createBufferSource(); s.buffer = AU.noise; const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.setValueAtTime(f, t); if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + dur); fl.Q.value = q;
  const gn = ctx.createGain(); gn.gain.setValueAtTime(g, t); gn.gain.exponentialRampToValueAtTime(.0008, t + dur);
  s.connect(fl); fl.connect(gn); gn.connect(dest || AU.sfx); s.start(t, Math.random() * 1.2); s.stop(t + dur + .05);
}
function tn({ f = 440, f2, dur = .1, type = 'sine', g = .3, at = 0, dest, atk = .003 }) {
  if (!AU.ctx) return; const ctx = AU.ctx, t = ctx.currentTime + Math.max(0, at);
  const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
  const gn = ctx.createGain(); gn.gain.setValueAtTime(.0001, t); gn.gain.exponentialRampToValueAtTime(g, t + atk); gn.gain.exponentialRampToValueAtTime(.0008, t + dur);
  o.connect(gn); gn.connect(dest || AU.sfx); o.start(t); o.stop(t + dur + .05);
}
const SFX = {
  rifle() { nz({ dur: .07, f: 4200, type: 'highpass', g: .5 }); nz({ dur: .3, f: 760, g: .5 }); tn({ f: 150, f2: 40, dur: .16, g: .75 }); nz({ dur: .22, f: 520, g: .14, at: .13 }); if (Math.random() < .5) tn({ f: 5200, dur: .03, type: 'triangle', g: .025, at: .42 + Math.random() * .1 }); },
  pistol() { nz({ dur: .06, f: 5200, type: 'highpass', g: .55 }); nz({ dur: .24, f: 950, g: .38 }); tn({ f: 200, f2: 50, dur: .13, g: .65 }); nz({ dur: .18, f: 600, g: .1, at: .12 }); },
  enemy(dist) { const v = .55 / (1 + dist / 9); nz({ dur: .12, f: clamp(3400 - dist * 38, 420, 3400), g: v }); tn({ f: 110, f2: 38, dur: .12, g: v * .8 }); nz({ dur: .3, f: 400, g: v * .25, at: .1 + dist / 340 }); },
  whiz() { nz({ dur: .13, f: 3200, f2: 900, type: 'bandpass', q: 3, g: .16 }); },
  hit() { tn({ f: 1900, dur: .04, type: 'square', g: .1 }); },
  kill() { tn({ f: 900, dur: .07, type: 'triangle', g: .25 }); tn({ f: 1350, dur: .12, type: 'triangle', g: .25, at: .06 }); },
  head() { tn({ f: 1700, dur: .05, type: 'square', g: .12 }); tn({ f: 2500, dur: .14, type: 'triangle', g: .22, at: .04 }); },
  ric() { tn({ f: rand(2200, 3400), f2: rand(1200, 1800), dur: .18, type: 'sine', g: .06 }); },
  thud() { nz({ dur: .08, f: 420, g: .12 }); },
  reload(w) { const T = w.snd === 'rifle' ? [.32, 1.1, 1.62] : [.24, .8, 1.15]; nz({ dur: .05, f: 2600, type: 'bandpass', q: 3, g: .5, at: T[0] }); nz({ dur: .07, f: 1700, type: 'bandpass', q: 3, g: .6, at: T[1] }); tn({ f: 320, dur: .05, type: 'square', g: .05, at: T[1] }); nz({ dur: .06, f: 3300, type: 'bandpass', q: 3, g: .55, at: T[2] }); nz({ dur: .05, f: 2400, type: 'bandpass', q: 3, g: .4, at: T[2] + .09 }); },
  empty() { tn({ f: 2600, dur: .025, type: 'square', g: .08 }); },
  swap() { nz({ dur: .06, f: 2200, type: 'bandpass', q: 2, g: .35 }); nz({ dur: .05, f: 3200, type: 'bandpass', q: 3, g: .25, at: .2 }); },
  boom() { nz({ dur: 1.8, f: 500, f2: 80, g: .9 }); tn({ f: 90, f2: 22, dur: 1.2, g: .9 }); nz({ dur: .3, f: 3000, g: .4 }); nz({ dur: 2.4, f: 300, g: .25, at: .35 }); },
  pulse() { tn({ f: 160, f2: 1300, dur: .9, g: .35 }); tn({ f: 1046, dur: 1.2, type: 'triangle', g: .15, at: .3 }); tn({ f: 1568, dur: 1.2, type: 'triangle', g: .12, at: .45 }); nz({ dur: 1, f: 6000, type: 'highpass', g: .15 }); },
  rescue() { [523, 659, 784, 1046].forEach((f, i) => tn({ f, dur: .4, type: 'triangle', g: .18, at: i * .08 })); },
  hurt() { tn({ f: 95, f2: 60, dur: .18, g: .5 }); nz({ dur: .12, f: 500, g: .3 }); },
  step(surf, run) {
    const g = run ? .12 : .08, p = rand(.85, 1.15);
    if (surf === 'dirt') { nz({ dur: .1, f: 1300 * p, type: 'bandpass', q: .7, g: g * 1.3 }); nz({ dur: .05, f: 4200, type: 'highpass', g: g * .45, at: .012 }); }
    else if (surf === 'grass') nz({ dur: .11, f: 800 * p, g: g * 1.1 });
    else { nz({ dur: .045, f: 2300 * p, type: 'bandpass', q: 1.1, g }); tn({ f: 85 * p, f2: 55, dur: .07, g: g * .9 }); }
  },
  land(k) { nz({ dur: .14, f: 600, g: .12 + k * .2 }); tn({ f: 70, f2: 40, dur: .12, g: .15 + k * .3 }); },
  spotted() { tn({ f: 660, dur: .07, type: 'square', g: .07 }); tn({ f: 880, dur: .1, type: 'square', g: .07, at: .09 }); },
  pickup() { tn({ f: 700, dur: .08, type: 'triangle', g: .2 }); tn({ f: 1050, dur: .1, type: 'triangle', g: .2, at: .06 }); },
  machineHit() { tn({ f: 300 + Math.random() * 80, dur: .05, type: 'square', g: .07 }); },
};
const Music = {
  bpm: 72, step: 0, next: 0, timer: null, mode: 'synth', tracks: [], ti: 0, audio: null, label: 'HAZE — DBN INSTRUMENTAL',
  init() { if (CONFIG.tracks.length) this.useTracks(CONFIG.tracks); else this.startSynth(); this.syncUI(); },
  setLabel(t) { this.label = t; this.syncUI(); },
  startSynth() {
    this.mode = 'synth'; this.setLabel('HAZE — DBN INSTRUMENTAL'); if (this.timer) clearInterval(this.timer);
    this.next = AU.ctx.currentTime + .1; this.step = 0;
    this.timer = setInterval(() => { if (!SET.music || this.mode !== 'synth') return; const now = AU.ctx.currentTime; if (this.next < now) this.next = now + .05; while (this.next < now + .15) { this.play(this.step, this.next); this.next += 60 / this.bpm / 4; this.step = (this.step + 1) % 64; } }, 30);
  },
  play(s, t) {
    const ctx = AU.ctx, at = t - ctx.currentTime, bar = Math.floor(s / 16), st = s % 16, dest = AU.music;
    const roots = [36, 32, 29, 31], chords = [[60, 63, 67, 70], [56, 60, 63, 67], [53, 56, 60, 63], [55, 59, 62, 65]];
    const hz = m => 440 * Math.pow(2, (m - 69) / 12);
    if ([0, 7, 10].includes(st) || (bar % 2 && st === 13)) { tn({ f: 130, f2: 40, dur: .25, g: .8, at, dest }); tn({ f: hz(roots[bar]), dur: st === 0 ? 1.1 : .5, g: .55, at, dest, type: 'sine', atk: .01 }); }
    if (st === 8) { nz({ dur: .18, f: 1600, type: 'bandpass', q: 1, g: .5, at, dest }); nz({ dur: .12, f: 1400, type: 'bandpass', q: 1, g: .35, at: at + .012, dest }); }
    if (st % 2 === 0) nz({ dur: .035, f: 8500, type: 'highpass', g: st % 4 ? .1 : .16, at, dest });
    if ((bar === 1 || bar === 3) && st >= 12) nz({ dur: .02, f: 9000, type: 'highpass', g: .09, at: at + 60 / this.bpm / 8, dest });
    if (st === 0) for (const n of chords[bar]) { const o = ctx.createOscillator(), o2 = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain(); o.type = o2.type = 'sawtooth'; o.frequency.value = hz(n - 12); o2.frequency.value = hz(n - 12) * 1.006; f.type = 'lowpass'; f.frequency.value = 650; g.gain.setValueAtTime(.0001, t); g.gain.linearRampToValueAtTime(.035, t + .6); g.gain.linearRampToValueAtTime(.0001, t + 3.3); o.connect(f); o2.connect(f); f.connect(g); g.connect(dest); o.start(t); o2.start(t); o.stop(t + 3.4); o2.stop(t + 3.4); }
    const mel = [[0, 75], [3, 74], [6, 72], [10, 70], [14, 67]];
    if (bar % 2 === 0) for (const [ms, n] of mel) if (st === ms) tn({ f: hz(n + 12), dur: .7, type: 'triangle', g: .06, at, dest });
  },
  useTracks(list) {
    this.mode = 'tracks'; this.tracks = list; this.ti = 0;
    if (!this.audio) { this.audio = new Audio(); this.audio.addEventListener('ended', () => this.nextTrack()); try { AU.ctx.createMediaElementSource(this.audio).connect(AU.music); } catch {} }
    this.playTrack();
  },
  playTrack() { const t = this.tracks[this.ti]; if (!t) return; this.audio.src = t.src; this.setLabel(t.title.toUpperCase()); if (SET.music) this.audio.play().catch(() => {}); },
  nextTrack() { if (this.mode === 'tracks') { this.ti = (this.ti + 1) % this.tracks.length; this.playTrack(); } },
  set(on) {
    SET.music = on; saveSet(); applyVolumes();
    if (this.mode === 'tracks' && this.audio) { on ? this.audio.play().catch(() => {}) : this.audio.pause(); }
    if (on && this.mode === 'synth' && AU.ctx) this.next = AU.ctx.currentTime + .1;
    this.syncUI();
  },
  toggle() { this.set(!SET.music); toast(SET.music ? 'MUSIC ON' : 'MUSIC OFF'); },
  syncUI() {
    $('npT').textContent = SET.music ? this.label : 'MUSIC OFF'; $('np').classList.toggle('off', !SET.music);
    $('npMute').textContent = SET.music ? '♪' : '✕';
    const b = $('setMusic'); b.textContent = SET.music ? 'ON' : 'OFF'; b.classList.toggle('off', !SET.music);
    $('tMusic').classList.toggle('off', !SET.music); $('tMusic').textContent = SET.music ? '♪' : '✕';
  },
};
// wind through the streets, the machines' hum, sirens far off across the city
const Ambience = {
  init() {
    const ctx = AU.ctx;
    const src = ctx.createBufferSource(); src.buffer = AU.noise; src.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 380; bp.Q.value = .55;
    const lfo = ctx.createOscillator(); lfo.frequency.value = .055; const lg = ctx.createGain(); lg.gain.value = 210; lfo.connect(lg); lg.connect(bp.frequency); lfo.start();
    const g = ctx.createGain(); g.gain.value = 0; src.connect(bp); bp.connect(g); g.connect(AU.amb); src.start(); this.wind = g;
    const o1 = ctx.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = 55; const o2 = ctx.createOscillator(); o2.frequency.value = 110.6;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 240; const hg = ctx.createGain(); hg.gain.value = 0;
    o1.connect(lp); o2.connect(lp); lp.connect(hg); hg.connect(AU.amb); o1.start(); o2.start(); this.hum = hg;
    this.sirenT = 14;
  },
  update(dt, hum, wind) {
    if (!this.hum) return; const t = AU.ctx.currentTime;
    this.hum.gain.setTargetAtTime(hum * .24, t, .3); this.wind.gain.setTargetAtTime(.05 + wind * .12, t, .6);
    this.sirenT -= dt; if (this.sirenT <= 0) { this.sirenT = rand(30, 75); this.siren(); }
  },
  siren() {
    const ctx = AU.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = 740; const lf = ctx.createOscillator(); lf.frequency.value = .42; const lfg = ctx.createGain(); lfg.gain.value = 160; lf.connect(lfg); lfg.connect(o.frequency);
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1000; const g = ctx.createGain(); g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(.03, t + 1.8); g.gain.exponentialRampToValueAtTime(.0001, t + 7.5);
    o.connect(f); f.connect(g); g.connect(AU.amb); o.start(t); lf.start(t); o.stop(t + 7.6); lf.stop(t + 7.6);
  },
};

/* ---------- particles, tracers, bullet holes, brass ---------- */
const particles = [], partPool = [];
function spawnPart(o) {
  let s = partPool.pop(); if (!s) { s = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false })); scene.add(s); }
  s.visible = true; const m = s.material; m.map = o.tex || TX.glow; m.color.set(o.color || '#ffffff'); m.blending = o.add ? THREE.AdditiveBlending : THREE.NormalBlending; m.fog = o.fog !== false; m.needsUpdate = true; m.rotation = Math.random() * 6;
  s.position.copy(o.pos);
  particles.push({ s, v: o.vel ? o.vel.clone() : new THREE.Vector3(), life: 0, max: o.life || .5, s0: o.s0 || 1, s1: o.s1 ?? o.s0 ?? 1, a0: o.a0 ?? 1, grav: o.grav || 0, drag: o.drag || 0, spin: o.spin || 0 });
}
function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i]; p.life += dt; const k = p.life / p.max;
    if (k >= 1) { p.s.visible = false; partPool.push(p.s); particles.splice(i, 1); continue; }
    p.v.y -= p.grav * dt; if (p.drag) p.v.multiplyScalar(Math.max(0, 1 - p.drag * dt)); p.s.position.addScaledVector(p.v, dt);
    const sc = lerp(p.s0, p.s1, 1 - (1 - k) * (1 - k)); p.s.scale.set(sc, sc, 1); p.s.material.opacity = p.a0 * (1 - k) * (k < .1 ? k * 10 : 1); if (p.spin) p.s.material.rotation += p.spin * dt;
  }
}
const tracers = []; const trGeo = new THREE.BoxGeometry(.018, .018, 1); trGeo.translate(0, 0, .5);
function tracer(a, b, color, life = .06) {
  let t = tracers.find(t => !t.m.visible);
  if (!t) { t = { m: new THREE.Mesh(trGeo, new THREE.MeshBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })), life: 0, max: life }; scene.add(t.m); tracers.push(t); }
  t.m.material.color.set(color); t.m.visible = true; t.life = t.max = life; t.m.position.copy(a); t.m.lookAt(b); t.m.scale.set(1, 1, a.distanceTo(b)); t.m.material.opacity = .9;
}
function updateTracers(dt) { for (const t of tracers) if (t.m.visible) { t.life -= dt; t.m.material.opacity = Math.max(0, t.life / t.max) * .9; if (t.life <= 0) t.m.visible = false; } }
const _pv = new THREE.Vector3(), _pv2 = new THREE.Vector3();
// kind: 'dust' (ground / walls), 'metal' (cars), 'soft' (plants), 'machine'
function impact(p, n, kind = 'dust') {
  const N = n || _pv2.set(0, 1, 0);
  if (kind === 'metal') { for (let i = 0; i < 7; i++) spawnPart({ pos: p, vel: _pv.set(N.x * 3 + rand(-3, 3), N.y * 3 + rand(1, 4), N.z * 3 + rand(-3, 3)), color: '#ffd28a', add: true, s0: .12, s1: .02, life: rand(.18, .35), grav: 14, fog: false }); SFX.ric(); }
  else { for (let i = 0; i < 3; i++) spawnPart({ pos: p, vel: _pv.set(N.x * 2.5 + rand(-1.5, 1.5), N.y * 2.5 + rand(.5, 2.5), N.z * 2.5 + rand(-1.5, 1.5)), color: '#cbb89c', s0: .06, s1: .03, life: .5, grav: 9, tex: TX.blob }); }
  spawnPart({ pos: _pv.copy(p).addScaledVector(N, .15), vel: _pv2.set(N.x * .8, .5 + N.y * .4, N.z * .8), tex: TX.smoke, color: kind === 'metal' ? '#9a9090' : '#c2ad92', s0: .25, s1: 1.4, a0: .6, life: .9, drag: 1.5, spin: rand(-1, 1) });
}
function hazePuff(p, big = 1) { spawnPart({ pos: p, vel: _pv.set(rand(-1, 1), rand(.3, 1.4), rand(-1, 1)), tex: TX.smoke, color: '#c7a8e6', s0: .5 * big, s1: 2.2 * big, a0: .7, life: .9, spin: rand(-1, 1) }); spawnPart({ pos: p, vel: _pv.set(rand(-3, 3), rand(1, 3), rand(-3, 3)), color: '#d9b8ff', add: true, s0: .35, s1: .05, life: .3 }); }
const DEC = { n: 96, i: 0, mesh: null };
const _zero = new THREE.Matrix4().makeScale(0, 0, 0), _dq = new THREE.Quaternion(), _dq2 = new THREE.Quaternion(), _Z = new THREE.Vector3(0, 0, 1), _dm = new THREE.Matrix4(), _dv = new THREE.Vector3(), _ds = new THREE.Vector3();
function buildDecals() {
  DEC.mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: TX.decal, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }), DEC.n);
  for (let i = 0; i < DEC.n; i++) DEC.mesh.setMatrixAt(i, _zero); DEC.mesh.frustumCulled = false; DEC.mesh.renderOrder = 1; scene.add(DEC.mesh);
}
function decal(p, n, s = .13) {
  _dq.setFromUnitVectors(_Z, n); _dq2.setFromAxisAngle(n, Math.random() * 6.28); _dq.premultiply(_dq2);
  _dm.compose(_dv.copy(p).addScaledVector(n, .012), _dq, _ds.set(s, s, s)); DEC.mesh.setMatrixAt(DEC.i, _dm); DEC.i = (DEC.i + 1) % DEC.n; DEC.mesh.instanceMatrix.needsUpdate = true;
}
const BR = { n: 16, i: 0, list: [], mesh: null };
function buildBrass() {
  BR.mesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(.0052, .0052, .023, 8).rotateZ(Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#d9a646', metalness: .85, roughness: .3 }), BR.n);
  for (let i = 0; i < BR.n; i++) { BR.mesh.setMatrixAt(i, _zero); BR.list.push({ p: new THREE.Vector3(), v: new THREE.Vector3(), r: new THREE.Euler(), w: new THREE.Vector3(), t: 9 }); }
  BR.mesh.frustumCulled = false; gunScene.add(BR.mesh);
}
function ejectBrass(pos, vel) { const b = BR.list[BR.i]; BR.i = (BR.i + 1) % BR.n; b.p.copy(pos); b.v.copy(vel); b.r.set(rand(0, 6), rand(0, 6), rand(0, 6)); b.w.set(rand(-25, 25), rand(-35, 35), rand(-25, 25)); b.t = 0; }
const _bq = new THREE.Quaternion(), _bm = new THREE.Matrix4(), _b1 = new THREE.Vector3(1, 1, 1);
function updateBrass(dt) {
  let any = false;
  for (let i = 0; i < BR.n; i++) { const b = BR.list[i]; if (b.t >= 9) continue; any = true; b.t += dt; if (b.t > .65) { b.t = 9; BR.mesh.setMatrixAt(i, _zero); continue; } b.v.y -= 6.5 * dt; b.p.addScaledVector(b.v, dt); b.r.x += b.w.x * dt; b.r.y += b.w.y * dt; b.r.z += b.w.z * dt; _bq.setFromEuler(b.r); _bm.compose(b.p, _bq, _b1); BR.mesh.setMatrixAt(i, _bm); }
  if (any) BR.mesh.instanceMatrix.needsUpdate = true;
}

/* ---------- drifting fog banks ---------- */
const fogSprites = []; let fogMat, fogMesh;
function buildFogSprites() {
  if (fogMesh) { scene.remove(fogMesh); fogMesh.geometry.dispose(); } fogSprites.length = 0;
  const n = Q().fogSprites, g = new THREE.InstancedBufferGeometry().copy(new THREE.PlaneGeometry(1, 1));
  g.setAttribute('offset', new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3)); g.setAttribute('sz', new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3)); g.instanceCount = n;
  fogMat = fogMat || new THREE.ShaderMaterial({ uniforms: { map: { value: TX.smoke }, color: { value: HAZE.clone() }, opacity: { value: .2 } }, transparent: true, depthWrite: false,
    vertexShader: `attribute vec3 offset, sz; varying vec2 vUv; void main(){ vUv = uv; vec4 mv = viewMatrix * vec4(offset, 1.0); float c = cos(sz.z), s = sin(sz.z); vec2 p = vec2(position.x * c - position.y * s, position.x * s + position.y * c) * sz.xy; mv.xy += p; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform sampler2D map; uniform vec3 color; uniform float opacity; varying vec2 vUv; void main(){ vec4 t = texture2D(map, vUv); gl_FragColor = vec4(color, t.a * opacity); }` });
  fogMesh = new THREE.Mesh(g, fogMat); fogMesh.frustumCulled = false; scene.add(fogMesh);
  for (let i = 0; i < n; i++) { const sc = rand(10, 22); fogSprites.push({ position: new THREE.Vector3(rand(-36, 36), rand(.8, 5), rand(-36, 36)), userData: { v: new THREE.Vector3(rand(-.7, .7), rand(-.04, .06), rand(-.7, .7)) }, w: sc, h: sc * .5, r: rand(0, 6) }); }
}
function syncFog() { const o = fogMesh.geometry.attributes.offset, z = fogMesh.geometry.attributes.sz; fogSprites.forEach((s, i) => { o.setXYZ(i, s.position.x, s.position.y, s.position.z); z.setXYZ(i, s.w, s.h, s.r); }); o.needsUpdate = z.needsUpdate = true; }

/* ---------- characters ---------- */
const MAT = {
  eyeDim: new THREE.SpriteMaterial({ color: '#ff2020', fog: false, transparent: true, opacity: .7, blending: THREE.AdditiveBlending, depthWrite: false }),
  eyeHot: new THREE.SpriteMaterial({ color: '#ff3a2a', fog: false, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false }),
  haloDim: new THREE.SpriteMaterial({ color: '#ff2020', fog: false, transparent: true, opacity: .32, blending: THREE.AdditiveBlending, depthWrite: false }),
  haloHot: new THREE.SpriteMaterial({ color: '#ff3a2a', fog: false, transparent: true, opacity: .55, blending: THREE.AdditiveBlending, depthWrite: false }),
  reveal: new THREE.MeshBasicMaterial({ color: '#fff6dd', transparent: true, opacity: .55, depthTest: false, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }),
  phone: new THREE.SpriteMaterial({ color: '#e8f4ff', fog: false, transparent: true, opacity: .9, blending: THREE.AdditiveBlending, depthWrite: false }),
  ammo: new THREE.MeshStandardMaterial({ color: '#d9a83a', roughness: .35, metalness: .7, emissive: '#3a2400' }),
  gun: new THREE.MeshStandardMaterial({ color: '#1c1c20', roughness: .4, metalness: .6 }),
  blob: new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -8 }),
  droneShell: new THREE.MeshStandardMaterial({ color: '#2a2a30', roughness: .35, metalness: .7 }),
  droneDark: new THREE.MeshStandardMaterial({ color: '#141418', roughness: .5, metalness: .5 }),
  lens: new THREE.MeshBasicMaterial({ color: '#ff3030' }),
};
const BLOB_GEO = new THREE.PlaneGeometry(1.1, 1.1).rotateX(-Math.PI / 2);
const ASSETS = {};
function b64buf(b64) { const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u.buffer; }
const _gl = new GLTFLoader();
function parseGLB(b64) { return new Promise(res => _gl.parse(b64buf(b64), '', res, () => res(null))); }
async function loadModule(url) { try { return (await import(url)).default; } catch (e) { console.warn('load failed', url, e); return null; } }
const CONE_GEO = new THREE.CircleGeometry(1, 28, (90 - 75.5) * Math.PI / 180, 151 * Math.PI / 180).rotateX(-Math.PI / 2);
const DISC_GEO = new THREE.CircleGeometry(1, 32).rotateX(-Math.PI / 2);
function addSenses(e) {
  e.cone = new THREE.Mesh(e.type === 'drone' ? DISC_GEO : CONE_GEO, new THREE.MeshBasicMaterial({ map: TX.cone, color: '#ff3030', transparent: true, opacity: .2, depthWrite: false, fog: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -16 }));
  e.cone.renderOrder = 3; e.cone.visible = false; scene.add(e.cone);
  e.icon = new THREE.Sprite(new THREE.SpriteMaterial({ map: TX.q, fog: false, transparent: true, depthWrite: false })); e.icon.scale.setScalar(.7); e.icon.visible = false; scene.add(e.icon);
}
// rotate an already-posed bone around a world-space axis (for aim, breathing, flinches)
const _pq = new THREE.Quaternion(), _rq = new THREE.Quaternion(), _wq = new THREE.Quaternion(), UPV = new THREE.Vector3(0, 1, 0), _ax = new THREE.Vector3();
function boneRot(bone, axis, angle) {
  if (!bone || !angle) return;
  bone.parent.getWorldQuaternion(_pq); _rq.setFromAxisAngle(axis, angle);
  _wq.copy(_pq).invert().multiply(_rq).multiply(_pq); bone.quaternion.premultiply(_wq);
}
// ray vs capsule (iq), rd normalized; returns distance or -1
function rayCapsule(ro, rd, pa, pb, r, maxT) {
  const bx = pb.x - pa.x, by = pb.y - pa.y, bz = pb.z - pa.z, ox = ro.x - pa.x, oy = ro.y - pa.y, oz = ro.z - pa.z;
  const baba = bx * bx + by * by + bz * bz, bard = bx * rd.x + by * rd.y + bz * rd.z, baoa = bx * ox + by * oy + bz * oz, rdoa = rd.x * ox + rd.y * oy + rd.z * oz, oaoa = ox * ox + oy * oy + oz * oz;
  const a = baba - bard * bard, b = baba * rdoa - baoa * bard, c = baba * oaoa - baoa * baoa - r * r * baba; let h = b * b - a * c;
  if (h < 0) return -1;
  const t = (-b - Math.sqrt(h)) / a, y = baoa + t * bard;
  if (y > 0 && y < baba) return t >= 0 && t < maxT ? t : -1;
  const cx = y <= 0 ? ox : ro.x - pb.x, cy = y <= 0 ? oy : ro.y - pb.y, cz = y <= 0 ? oz : ro.z - pb.z;
  const b2 = rd.x * cx + rd.y * cy + rd.z * cz, c2 = cx * cx + cy * cy + cz * cz - r * r; h = b2 * b2 - c2;
  if (h > 0) { const t2 = -b2 - Math.sqrt(h); if (t2 >= 0 && t2 < maxT) return t2; }
  return -1;
}

// --- the Haze Runner: one rigged mesh, four clips, a rifle in the right hand ---
const RUN = { ok: false, walkSpd: 1.45, runSpd: 4.3 };
const UPPER = new Set(['Spine', 'Spine01', 'Spine02', 'neck', 'Head', 'head_end', 'headfront', 'LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand', 'RightShoulder', 'RightArm', 'RightForeArm', 'RightHand']);
const GRIP_Q = new THREE.Quaternion(0.6817, -0.1497, 0.2025, 0.6869);
const trackBone = t => t.name.slice(0, t.name.lastIndexOf('.'));
function subClip(clip, name, keep) { return new THREE.AnimationClip(name, clip.duration, clip.tracks.filter(t => keep(trackBone(t))).map(t => t.clone())); }
function poseClip(clip, time, keep, name) { const tr = []; for (const t of clip.tracks) { if (!keep(trackBone(t))) continue; const v = Array.from(t.createInterpolant().evaluate(time)); tr.push(new t.constructor(t.name, [0, 1], v.concat(v))); } return new THREE.AnimationClip(name, 1, tr); }
function prepRunner(meshG, anims) {
  const sc = meshG.scene;
  sc.traverse(o => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; const m = o.material; m.roughness = Math.max(.55, m.roughness ?? .6); m.metalness = Math.min(m.metalness ?? 0, .25); m.envMapIntensity = .7; } });
  sc.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(sc); RUN.s = 1.82 / (box.max.y - box.min.y); RUN.y0 = -box.min.y * RUN.s;
  const hp = sc.getObjectByName('Hips').position;
  const fix = (g, name) => { const c = g.animations[0]; c.name = name; if (name !== 'Die') for (const t of c.tracks) if (trackBone(t) === 'Hips' && t.name.endsWith('position')) { const v = t.values; for (let i = 0; i < v.length; i += 3) { v[i] = hp.x; v[i + 2] = hp.z; } } return c; };
  RUN.clips = { Idle: fix(anims.idle, 'Idle'), Walk: fix(anims.walk, 'Walk'), Run: fix(anims.run, 'Run'), Die: fix(anims.die, 'Die') };
  RUN.idleLo = subClip(RUN.clips.Idle, 'IdleLo', b => !UPPER.has(b));
  // the aim pose is the walk's upper body at a frame where the rifle is level; re-base its spine onto the idle hips so it still points forward
  RUN.aim = poseClip(RUN.clips.Walk, .3, b => UPPER.has(b), 'Aim');
  { const ev = (c, n, t) => { const tr = c.tracks.find(x => x.name === n); return tr && new THREE.Quaternion().fromArray(tr.createInterpolant().evaluate(t)); };
    const base = sc.getObjectByName('Hips').children.find(c => UPPER.has(c.name)); RUN.base = base ? base.name : 'Spine02';
    RUN.hipsW = ev(RUN.clips.Walk, 'Hips.quaternion', .3); RUN.baseW = ev(RUN.clips.Walk, RUN.base + '.quaternion', .3); }
  // rifle, darkened, gripped at the pistol grip, barrel along -z
  const hand = sc.getObjectByName('RightHand'), ws = new THREE.Vector3(); hand.getWorldScale(ws);
  const gun = new THREE.Group(); gun.quaternion.copy(GRIP_Q); gun.scale.setScalar(1 / ws.x);
  const t = TPL.rifle_lo || TPL.rifle;
  if (t) {
    const mat = t.mat.clone(); mat.color = new THREE.Color('#5a5a62'); const m = new THREE.Mesh(t.geo, mat); m.castShadow = true;
    t.geo.computeBoundingBox(); const b = t.geo.boundingBox, L = b.max.x - b.min.x, s = .92 / L;
    m.rotation.y = -Math.PI / 2; m.scale.setScalar(s);
    const grip = new THREE.Vector3(b.max.x - L * .37, b.min.y + (b.max.y - b.min.y) * .3, (b.min.z + b.max.z) / 2);
    m.updateMatrix(); grip.applyMatrix4(m.matrix); m.position.set(-grip.x, -grip.y + .02, -grip.z - .03); m.updateMatrix();
    RUN.muzzle = new THREE.Vector3(b.min.x, b.min.y + (b.max.y - b.min.y) * .62, (b.min.z + b.max.z) / 2).applyMatrix4(m.matrix);
    gun.add(m);
  } else { const m = new THREE.Mesh(new THREE.BoxGeometry(.06, .1, .75), MAT.gun); m.position.z = -.22; gun.add(m); RUN.muzzle = new THREE.Vector3(0, .03, -.6); }
  RUN.gun = gun;
  // glowing eyes ride on the head bone; placed from the bind pose
  const head = sc.getObjectByName('Head'), he = sc.getObjectByName('head_end');
  const H = head.getWorldPosition(new THREE.Vector3()), E = he ? he.getWorldPosition(new THREE.Vector3()) : H.clone().add(new THREE.Vector3(0, .2, 0));
  const up = E.clone().sub(H).normalize(), hl = H.distanceTo(E) || .2;
  const c = H.clone().addScaledVector(up, hl * RUN.eyeUp).add(new THREE.Vector3(0, 0, hl * RUN.eyeFwd));
  RUN.eyes = [-1, 0, 1].map(sx => head.worldToLocal(c.clone().add(new THREE.Vector3(sx * .036, 0, sx ? 0 : -.03))));
  const hs = new THREE.Vector3(); head.getWorldScale(hs); RUN.eyeS = 1 / hs.x;
  RUN.scene = sc; RUN.ok = true;
}
RUN.eyeUp = .335; RUN.eyeFwd = .75;
let runnerId = 0;
function makeRunner() {
  if (!RUN.ok) return makeRunnerBox();
  const g = new THREE.Group(); const model = skClone(RUN.scene); model.scale.multiplyScalar(RUN.s); model.position.y = RUN.y0; model.rotation.y = Math.PI; g.add(model);
  const mixer = new THREE.AnimationMixer(model);
  const A = { lo: mixer.clipAction(RUN.idleLo), aim: mixer.clipAction(RUN.aim), walk: mixer.clipAction(RUN.clips.Walk), run: mixer.clipAction(RUN.clips.Run), die: mixer.clipAction(RUN.clips.Die) };
  A.die.setLoop(THREE.LoopOnce, 1); A.die.clampWhenFinished = true;
  for (const k of ['lo', 'aim', 'walk', 'run']) { A[k].play(); A[k].setEffectiveWeight(k === 'lo' || k === 'aim' ? 1 : 0); A[k].time = Math.random() * A[k].getClip().duration; }
  const B = {}; B.base = model.getObjectByName(RUN.base); for (const n of ['Hips', 'Spine', 'Spine01', 'Spine02', 'neck', 'Head', 'head_end', 'LeftUpLeg', 'RightUpLeg', 'LeftFoot', 'RightFoot', 'RightHand']) B[n] = model.getObjectByName(n);
  const gun = RUN.gun.clone(); B.RightHand.add(gun);
  const eyes = RUN.eyes.map((p, i) => { const halo = i === 1, s = new THREE.Sprite(halo ? MAT.haloDim : MAT.eyeDim); s.userData = { halo, s: RUN.eyeS * (halo ? .75 : .15) }; s.position.copy(p); s.scale.setScalar(s.userData.s); B.Head.add(s); return s; });
  const rv = new THREE.Group(); rv.add(new THREE.Mesh(new THREE.CapsuleGeometry(.3, 1.1, 4, 8), MAT.reveal)); rv.children[0].position.y = .92; rv.add(new THREE.Mesh(new THREE.SphereGeometry(.2, 10, 8), MAT.reveal)); rv.children[1].position.y = 1.68; rv.children.forEach(c => c.renderOrder = 999); rv.visible = false; g.add(rv);
  const blob = new THREE.Mesh(BLOB_GEO, MAT.blob); blob.position.y = .025; blob.renderOrder = 1; g.add(blob);
  mixer.update(0);
  return { g, model, mixer, A, w: { idle: 1, walk: 0, run: 0 }, B, gun, eyes, rv, blob, id: runnerId++, animAcc: 0, fl: 0, flv: 0, tw: 0, twv: 0, aimP: 0, breath: Math.random() * 6 };
}
function makeRunnerBox() {
  const g = new THREE.Group(), m = new THREE.MeshStandardMaterial({ color: '#3a3a40', roughness: .8 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(.28, 1.1, 4, 10), m); body.position.y = .95; body.castShadow = true; g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(.17, 12, 10), m); head.position.y = 1.7; g.add(head);
  const e1 = new THREE.Sprite(MAT.eyeDim), e2 = new THREE.Sprite(MAT.eyeDim); e1.position.set(-.06, 1.72, -.16); e2.position.set(.06, 1.72, -.16); e1.userData = e2.userData = { s: .32 }; e1.scale.setScalar(.32); e2.scale.setScalar(.32); g.add(e1, e2);
  const rv = new THREE.Group(); rv.add(new THREE.Mesh(new THREE.CapsuleGeometry(.3, 1.1, 4, 8), MAT.reveal)); rv.children[0].position.y = .92; rv.visible = false; g.add(rv);
  return { g, eyes: [e1, e2], rv, id: runnerId++ };
}
const _q1 = new THREE.Quaternion(), _rgt = new THREE.Vector3();
// blend idle / walk / run by actual ground speed, then layer breathing, aim and hit flinches on top
function animRunner(e, dt, spd, dist, aimPitch) {
  // flinch springs keep running even when the skeleton isn't updated this frame
  const n = Math.ceil(dt / .008), h = dt / n; for (let i = 0; i < n; i++) { e.flv += (-150 * e.fl - 13 * e.flv) * h; e.fl += e.flv * h; e.twv += (-120 * e.tw - 11 * e.twv) * h; e.tw += e.twv * h; }
  if (!e.A) return;
  e.animAcc += dt;
  const near = dist < 48;
  if (!near && (frameNo + e.id) % 3) return;
  const ad = e.animAcc; e.animAcc = 0;
  if (e.dead) { e.mixer.update(ad); return; }
  const tgt = spd < .3 ? 0 : spd < 2.7 ? 1 : 2, k = 1 - Math.exp(-ad * 7);
  e.w.idle = lerp(e.w.idle, tgt === 0 ? 1 : 0, k); e.w.walk = lerp(e.w.walk, tgt === 1 ? 1 : 0, k); e.w.run = lerp(e.w.run, tgt === 2 ? 1 : 0, k);
  e.A.lo.setEffectiveWeight(e.w.idle); e.A.aim.setEffectiveWeight(e.w.idle); e.A.walk.setEffectiveWeight(e.w.walk); e.A.run.setEffectiveWeight(e.w.run);
  e.A.walk.setEffectiveTimeScale(clamp(spd / RUN.walkSpd, .55, 1.7)); e.A.run.setEffectiveTimeScale(clamp(spd / RUN.runSpd, .75, 1.35));
  e.mixer.update(ad);
  // while standing, pin the upper body to the aim pose so the idle's hip sway doesn't swing the rifle off target
  if (e.w.idle > .01 && RUN.hipsW && e.B.base) { _q1.copy(e.B.Hips.quaternion).invert().multiply(RUN.hipsW).multiply(RUN.baseW); e.B.base.quaternion.slerp(_q1, e.w.idle); }
  if (!near) return;
  e.aimP = lerp(e.aimP, aimPitch, 1 - Math.exp(-ad * 6));
  _rgt.set(Math.cos(e.yaw), 0, -Math.sin(e.yaw));
  e.breath += ad * 1.9;
  const br = Math.sin(e.breath) * .022 * e.w.idle;
  // the rig's chain runs Hips > Spine02 > Spine01 > Spine (chest) > neck
  boneRot(e.B.Spine02, _rgt, e.aimP * .35 + br);
  boneRot(e.B.Spine01, _rgt, e.aimP * .35);
  boneRot(e.B.Spine, _rgt, e.aimP * .3 - e.fl * .8);
  boneRot(e.B.Spine, UPV, e.tw);
  boneRot(e.B.neck, _rgt, -e.fl * .6 + br * .5);
}
function flinch(e, head, fromX, fromZ) {
  // lean away from the shot, with a twist toward the side it came from
  const side = Math.sign((fromX - e.pos.x) * Math.cos(e.yaw) - (fromZ - e.pos.z) * Math.sin(e.yaw)) || 1;
  e.flv += head ? 11 : 7; e.twv += -side * rand(2.5, 5);
}

// --- surveillance drone: smooth shell, spinning rotors, a searchlight that cuts through the haze ---
function droneConeMat() {
  return new THREE.ShaderMaterial({
    uniforms: { col: { value: new THREE.Color('#ffe9d0') }, op: { value: .55 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: `varying float vV, vF, vD; void main(){ vV = uv.y; vec4 wp = modelMatrix * vec4(position, 1.0); vec3 n = normalize(mat3(modelMatrix) * normal), vd = cameraPosition - wp.xyz; vD = length(vd); vF = abs(dot(n, vd / vD)); gl_Position = projectionMatrix * viewMatrix * wp; }`,
    fragmentShader: `uniform vec3 col; uniform float op; varying float vV, vF, vD; void main(){ float a = pow(vV, 1.5) * pow(vF, 1.4) * op * smoothstep(1.0, 6.0, vD); gl_FragColor = vec4(col * a, 1.0); }`,
  });
}
const DRONE_CONE = new THREE.CylinderGeometry(.12, 3.4, 9, 20, 1, true).translate(0, -4.5, 0);
const ROTOR_TX = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); const r = g.createRadialGradient(32, 32, 4, 32, 32, 32); r.addColorStop(0, 'rgba(40,40,44,.9)'); r.addColorStop(.25, 'rgba(60,60,66,.35)'); r.addColorStop(.95, 'rgba(90,90,96,.22)'); r.addColorStop(1, 'rgba(90,90,96,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
function makeDrone() {
  const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
  const shell = new THREE.Mesh(new THREE.SphereGeometry(.42, 20, 12).scale(1, .42, 1.18), MAT.droneShell); shell.castShadow = true; body.add(shell);
  const belly = new THREE.Mesh(new THREE.CylinderGeometry(.16, .24, .12, 16), MAT.droneDark); belly.position.y = -.15; body.add(belly);
  const rotors = [], nav = [];
  for (const [x, z] of [[.62, .6], [-.62, .6], [.62, -.6], [-.62, -.6]]) {
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(.03, .04, .82, 8), MAT.droneDark); arm.rotation.z = Math.PI / 2; arm.rotation.y = Math.atan2(-z, x); arm.position.set(x / 2, 0, z / 2); body.add(arm);
    const mot = new THREE.Mesh(new THREE.CylinderGeometry(.07, .08, .12, 12), MAT.droneShell); mot.position.set(x, .03, z); body.add(mot);
    const r = new THREE.Mesh(new THREE.CircleGeometry(.36, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: ROTOR_TX, transparent: true, depthWrite: false, side: THREE.DoubleSide })); r.position.set(x, .1, z); body.add(r); rotors.push(r);
    const nl = new THREE.Sprite(new THREE.SpriteMaterial({ map: TX.glow, color: z < 0 ? (x < 0 ? '#ff3030' : '#30ff60') : '#ffffff', fog: false, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); nl.position.set(x, -.02, z); nl.scale.setScalar(.35); body.add(nl); nav.push(nl);
  }
  const lens = new THREE.Mesh(new THREE.SphereGeometry(.09, 12, 8), MAT.lens); lens.position.set(0, -.14, -.36); body.add(lens);
  const eye = new THREE.Sprite(MAT.eyeDim); eye.position.set(0, -.14, -.42); eye.userData = { s: .9 }; eye.scale.setScalar(.9); body.add(eye);
  const beam = new THREE.Mesh(DRONE_CONE, droneConeMat()); beam.position.set(0, -.18, -.3); beam.rotation.x = .38; beam.renderOrder = 2; body.add(beam);
  const rv = new THREE.Mesh(new THREE.SphereGeometry(.8, 10, 8), MAT.reveal); rv.visible = false; rv.renderOrder = 999; g.add(rv);
  return { g, body, rotors, nav, beam, eyes: [eye], rv, id: runnerId++, tilt: new THREE.Vector2() };
}

// --- neighbors: Michelle, standing in the yard on her phone, breathing, glancing at you ---
const NB = { ok: false };
function prepNeighbor(gl) {
  NB.scene = gl.scene; NB.clip = gl.animations.find(a => a.name === 'SambaDance') || gl.animations[0];
  NB.scene.traverse(o => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
  NB.ok = !!NB.clip;
}
function makeNeighbor() {
  const g = new THREE.Group(); const blob = new THREE.Mesh(BLOB_GEO, MAT.blob); blob.position.y = .025; blob.scale.setScalar(.9); g.add(blob);
  const ph = new THREE.Sprite(MAT.phone); ph.scale.setScalar(.6); g.add(ph);
  if (!NB.ok) {
    const m = new THREE.MeshStandardMaterial({ color: pick(['#7a2f3a', '#2f5a7a', '#c9a23a', '#3a6a4a']), roughness: .9 });
    const b = new THREE.Mesh(new THREE.CapsuleGeometry(.26, 1.05, 4, 10), m); b.position.y = .9; g.add(b); const hd = new THREE.Mesh(new THREE.SphereGeometry(.15, 12, 10), m); hd.position.y = 1.65; g.add(hd);
    ph.position.set(.2, 1.3, .35); return { g, ph };
  }
  const model = skClone(NB.scene); g.add(model);
  const mixer = new THREE.AnimationMixer(model); const act = mixer.clipAction(NB.clip); act.play(); act.time = .8; act.timeScale = 0; mixer.update(0);
  const B = { spine: model.getObjectByName('mixamorigSpine2'), neck: model.getObjectByName('mixamorigNeck'), head: model.getObjectByName('mixamorigHead'), hips: model.getObjectByName('mixamorigHips') };
  ph.position.set(.12, 1.28, .32);
  return { g, ph, mixer, act, model, B, look: 0, breath: Math.random() * 6 };
}
const _fw = new THREE.Vector3();
function animNeighbor(n, dt, dist) {
  if (!n.mixer) return;
  if (n.saved) { n.mixer.update(dt); return; }
  if (dist > 40) return;
  n.mixer.update(0);
  n.breath += dt * 1.6;
  const ry = n.g.rotation.y; _rgt.set(Math.cos(ry), 0, -Math.sin(ry)); _fw.set(Math.sin(ry), 0, Math.cos(ry));
  // turn the head toward you when you're close
  let want = 0; if (dist < 14) { const dx = P.pos.x - n.g.position.x, dz = P.pos.z - n.g.position.z; want = clamp(wrap(Math.atan2(dx, dz) - ry), -1.1, 1.1); }
  n.look = lerp(n.look, want, 1 - Math.exp(-dt * 3));
  boneRot(n.B.spine, _rgt, Math.sin(n.breath) * .02);
  boneRot(n.B.hips, _fw, Math.sin(n.breath * .23) * .025);
  boneRot(n.B.neck, UPV, n.look * .4); boneRot(n.B.head, UPV, n.look * .6);
}

/* ---------- first-person view model ---------- */
const VM = { root: new THREE.Group(), pos: { x: new THREE.Vector3(), v: new THREE.Vector3() }, rot: { x: new THREE.Vector3(), v: new THREE.Vector3() }, lookDX: 0, lookDY: 0, flashT: 0 };
gunScene.add(VM.root);
function stepVS(s, dt, k, c) { const n = Math.max(1, Math.ceil(dt / .006)), h = dt / n; for (let i = 0; i < n; i++) { s.v.x += (-k * s.x.x - c * s.v.x) * h; s.v.y += (-k * s.x.y - c * s.v.y) * h; s.v.z += (-k * s.x.z - c * s.v.z) * h; s.x.addScaledVector(s.v, h); } }
function buildGuns() {
  const sleeve = new THREE.MeshStandardMaterial({ color: '#232a3d', roughness: .95 }), cuff = new THREE.MeshStandardMaterial({ color: '#30384f', roughness: 1 });
  const skin = new THREE.MeshStandardMaterial({ color: '#6b4630', roughness: .55 }), gold = new THREE.MeshStandardMaterial({ color: '#e0b04a', roughness: .3, metalness: .8 });
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  // tapered forearm from the wrist back out of frame, with a ribbed cuff
  const forearm = (wrist, elbow, m) => {
    const g = new THREE.Group(), v = elbow.clone().sub(wrist), L = v.length(), d = v.clone().normalize();
    const s = new THREE.Mesh(new THREE.CylinderGeometry(.056, .04, L, 16, 3), m); s.position.copy(wrist).addScaledVector(d, L / 2); s.quaternion.setFromUnitVectors(UPV, d); g.add(s);
    const c = new THREE.Mesh(new THREE.CylinderGeometry(.041, .039, .035, 16), cuff); c.position.copy(wrist).addScaledVector(d, .03); c.quaternion.copy(s.quaternion); g.add(c);
    return g;
  };
  // a hand closed around a bar running along `axis`: flattened palm, four two-joint fingers curling toward `wrap`, a thumb
  const fingerMat = skin;
  const cap = (g, a, b, r) => { const v = b.clone().sub(a), L = v.length(); const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, Math.max(.001, L), 3, 8), fingerMat); m.position.copy(a).addScaledVector(v, .5); m.quaternion.setFromUnitVectors(UPV, v.normalize()); g.add(m); };
  const hand = (at, axis, palmDir, r, wrap, withRing, sc = 1) => {
    const g = new THREE.Group(); g.position.copy(at); g.scale.setScalar(sc);
    const q = new THREE.Quaternion().setFromUnitVectors(V(0, 0, 1), axis.clone().normalize()); g.quaternion.copy(q);
    const qi = q.clone().invert(), pd = palmDir.clone().applyQuaternion(qi).setZ(0).normalize(), a0 = Math.atan2(pd.y, pd.x);
    const wl = wrap.clone().applyQuaternion(qi); const sg = (-Math.sin(a0) * wl.x + Math.cos(a0) * wl.y) >= 0 ? 1 : -1;
    const palm = new THREE.Group(); palm.quaternion.setFromUnitVectors(V(1, 0, 0), V(pd.x, pd.y, 0)); palm.position.set(pd.x * (r + .017), pd.y * (r + .017), -.006); g.add(palm);
    const pm = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), skin); pm.scale.set(.019, .036, .05); palm.add(pm);
    const R = r + .0105, P = th => V(Math.cos(th) * R, Math.sin(th) * R, 0);
    [[.03, .0098], [.011, .0102], [-.008, .0098], [-.026, .0088]].forEach(([z, fr], i) => {
      const t0 = a0 + sg * .55, t1 = t0 + sg * (1.05 - i * .04), t2 = t1 + sg * (.95 - i * .05);
      const p0 = P(t0).setZ(z), p1 = P(t1).setZ(z), p2 = P(t2).setZ(z - .002);
      cap(g, p0, p1, fr); cap(g, p1, p2, fr * .92);
    });
    const tb = pd.clone().multiplyScalar(-1).applyAxisAngle(V(0, 0, 1), -sg * .5).multiplyScalar(R);
    cap(g, V(pd.x * r * .6 - pd.y * sg * r * .7, pd.y * r * .6 + pd.x * sg * r * .7, .035), tb.clone().setZ(.0), .0105);
    if (withRing) { const ring = new THREE.Mesh(new THREE.TorusGeometry(R + .006, .0035, 6, 16, .8), gold); ring.rotation.z = a0 + sg * 1.4 - (sg < 0 ? .8 : 0); ring.position.z = .011; g.add(ring); }
    return g;
  };
  // rifle: raw model is 1.9 units long, muzzle at -x; handguard axis and pistol grip measured from its profile
  let RG;
  if (TPL.rifle) {
    RG = new THREE.Group(); const gm = new THREE.Mesh(TPL.rifle.geo, TPL.rifle.mat); gm.rotation.y = -Math.PI / 2; gm.scale.setScalar(.42); RG.add(gm);
    const fore = V(0, .052, -.215), grip = V(0, -.068, .152);
    RG.add(hand(fore, V(0, 0, 1), V(-.45, -1, 0), .036, V(1, 0, 0), false), forearm(V(-.035, -.03, -.17), V(-.2, -.37, .24), sleeve));
    RG.add(hand(grip, V(0, -1, .32), V(.45, 0, 1), .021, V(-1, 0, 0), true), forearm(V(.03, -.115, .215), V(.21, -.42, .4), sleeve));
    RG.userData = { muzzle: V(0, .053, -.405), eject: V(.035, .075, .04), hip: V(.17, -.2, -.5), ads: V(0, -.13, -.36), scope: true, sprint: V(.06, -.26, -.42) };
  } else {
    RG = new THREE.Group(); const b = new THREE.Mesh(new THREE.BoxGeometry(.07, .1, .8), MAT.gun); b.position.z = -.3; RG.add(b);
    RG.userData = { muzzle: V(0, .03, -.72), eject: V(.04, .03, -.1), hip: V(.2, -.22, -.45), ads: V(0, -.1, -.32), sprint: V(.06, -.26, -.42) };
  }
  // pistol: .2m long, muzzle at -z; group origin sits at the center of the grip
  let PG;
  if (TPL.pistol) {
    PG = new THREE.Group(); const pm = new THREE.Mesh(TPL.pistol.geo, TPL.pistol.mat); pm.position.set(0, -.045, -.066); PG.add(pm);
    PG.add(hand(V(0, 0, 0), V(0, -1, .32), V(.3, 0, 1), .017, V(-1, 0, 0), true), forearm(V(.02, -.06, .055), V(.14, -.38, .36), sleeve));
    PG.add(hand(V(-.014, -.012, -.01), V(0, -1, .32), V(-1, 0, -.25), .031, V(0, 0, -1), false, .85), forearm(V(-.045, -.06, .03), V(-.2, -.4, .3), sleeve));
    PG.userData = { muzzle: V(0, .07, -.168), eject: V(.02, .085, -.06), hip: V(.12, -.15, -.52), ads: V(0, -.1, -.42), sprint: V(.05, -.26, -.4) };
  } else {
    PG = new THREE.Group(); const b = new THREE.Mesh(new THREE.BoxGeometry(.035, .045, .2), MAT.gun); b.position.z = -.08; PG.add(b);
    PG.userData = { muzzle: V(0, .02, -.19), eject: V(.02, .03, -.07), hip: V(.15, -.13, -.4), ads: V(0, -.064, -.34), sprint: V(.05, -.26, -.36) };
  }
  for (const G of [RG, PG]) G.traverse(o => { if (o.isMesh) o.frustumCulled = false; });
  VM.guns = [RG, PG]; VM.root.add(RG, PG); PG.visible = false;
  VM.flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: TX.flash, color: '#ffe0a0', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); VM.flash.visible = false; gunScene.add(VM.flash);
  VM.flash2 = new THREE.Mesh(new THREE.ConeGeometry(.04, .22, 10, 1, true).rotateX(Math.PI / 2).translate(0, 0, -.11), new THREE.MeshBasicMaterial({ color: '#ffd9a0', transparent: true, opacity: .7, blending: THREE.AdditiveBlending, depthWrite: false })); VM.flash2.visible = false; gunScene.add(VM.flash2);
  buildBrass();
}
const WEAPONS = [
  { name: 'NORTH STAR AR', mag: 30, reserve: 300, interval: .088, dmg: 28, head: 2.1, hip: .026, adsS: .004, kick: .011, auto: true, reload: 2.05, adsFov: 42, snd: 'rifle', range: 260, back: .05, up: 2.2, roll: 1.1 },
  { name: 'LOW KEY .45', mag: 12, reserve: 96, interval: .16, dmg: 42, head: 2.5, hip: .018, adsS: .003, kick: .026, auto: false, reload: 1.45, adsFov: 60, snd: 'pistol', range: 160, back: .07, up: 5.5, roll: 2.4 },
];
