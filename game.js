/* =====================================================================
   LOW VISIBILITY — a Miles Low first-person shooter (Do Better Network)
   ===================================================================== */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as skClone } from 'three/addons/utils/SkeletonUtils.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { makeLayout } from './layout.js';

const CONFIG = {
  city: 'LAS VEGAS, NV', area: 'WESTSIDE',
  tracks: [ /* { title: '500 DEGREES', src: 'music/500-degrees.mp3' } */ ],
};

/* ---------- utils ---------- */
const rand = (a, b) => a + Math.random() * (b - a);
let _seed = 1337; const srand = () => (_seed = (_seed * 16807) % 2147483647) / 2147483647;
const pick = (a, r = Math.random) => a[Math.floor(r() * a.length)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const damp = (a, b, k, dt) => lerp(a, b, 1 - Math.exp(-k * dt));
const wrap = a => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
const $ = id => document.getElementById(id);
const isTouch = matchMedia('(pointer:coarse)').matches; if (isTouch) document.body.classList.add('touch');
const store = { get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} } };

/* ---------- settings ---------- */
const SET = Object.assign({ music: true, musicVol: .6, sfxVol: .9, sens: 1, quality: isTouch ? 'low' : 'high' }, store.get('lv_settings', {}));
const saveSet = () => store.set('lv_settings', SET);
const QUALITY = {
  low: { pr: 1, shadows: false, shadowSize: 1024, msaa: 0, fxaa: true, fogSprites: 14, charDist: 60, bloomRes: .35 },
  med: { pr: 1.25, shadows: true, shadowSize: 1024, msaa: 0, fxaa: true, fogSprites: 26, charDist: 75, bloomRes: .5 },
  high: { pr: 1.75, shadows: true, shadowSize: 2048, msaa: 4, fxaa: false, fogSprites: 40, charDist: 95, bloomRes: .5 },
};
const Q = () => QUALITY[SET.quality] || QUALITY.med;

/* ---------- height fog: thick at street level, thinning with height, drifting ---------- */
// scene.fog is a THREE.Fog whose `near` carries the density and `far` carries time.
THREE.ShaderChunk.fog_pars_vertex = '#ifdef USE_FOG\nvarying vec3 vFogWorld;\n#endif';
THREE.ShaderChunk.fog_vertex = '#ifdef USE_FOG\nvFogWorld = (vec4(mvPosition.xyz - viewMatrix[3].xyz, 0.0) * viewMatrix).xyz;\n#endif';
THREE.ShaderChunk.fog_pars_fragment = `#ifdef USE_FOG
uniform vec3 fogColor; varying vec3 vFogWorld;
#ifdef FOG_EXP2
uniform float fogDensity;
#else
uniform float fogNear; uniform float fogFar;
#endif
float lvHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float lvNoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(lvHash(i), lvHash(i + vec2(1.0, 0.0)), f.x), mix(lvHash(i + vec2(0.0, 1.0)), lvHash(i + vec2(1.0, 1.0)), f.x), f.y); }
#endif`;
THREE.ShaderChunk.fog_fragment = `#ifdef USE_FOG
#ifdef FOG_EXP2
  vec3 fr2 = vFogWorld - cameraPosition; float fogFactor = 1.0 - exp(-fogDensity * fogDensity * dot(fr2, fr2));
#else
  vec3 fr = vFogWorld - cameraPosition; float fd = length(fr);
  float h0 = max(cameraPosition.y, 0.0), h1 = max(vFogWorld.y, 0.0), dh = h1 - h0, k = 0.07;
  float hf = abs(dh) > 0.05 ? (exp(-k * h0) - exp(-k * h1)) / (k * dh) : exp(-k * h0);
  vec2 q = vFogWorld.xz * 0.03 + vec2(fogFar * 0.02, fogFar * 0.012);
  float n = lvNoise(q) * 0.6 + lvNoise(q * 2.3 + 7.1) * 0.4;
  float dens = fogNear * (0.32 + 0.68 * hf) * (0.8 + 0.4 * n) + smoothstep(182.0, 238.0, length(vFogWorld.xz)) * 0.021;
  float fogFactor = 1.0 - exp(-dens * dens * fd * fd);
#endif
  gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, clamp(fogFactor, 0.0, 1.0));
#endif`;

/* ---------- renderer / scenes ---------- */
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', stencil: false });
renderer.setPixelRatio(Math.min(devicePixelRatio, Q().pr));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = Q().shadows;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
$('game').appendChild(renderer.domElement);

const HAZE = new THREE.Color('#8d7283');
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(HAZE.clone(), 0.045, 0);
const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.1, 2600);
camera.rotation.order = 'YXZ';
const gunScene = new THREE.Scene();
const gunCam = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.01, 10);

const hemi = new THREE.HemisphereLight('#c9b3d8', '#6d5a48', 1.05); scene.add(hemi);
const sun = new THREE.DirectionalLight('#ffb07a', 2.2);
sun.castShadow = true; sun.shadow.mapSize.set(Q().shadowSize, Q().shadowSize);
Object.assign(sun.shadow.camera, { left: -55, right: 55, top: 55, bottom: -55, near: 1, far: 240 });
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.035;
scene.add(sun, sun.target);
const SUN_OFF = new THREE.Vector3(-75, 42, 28);
const muzzleLight = new THREE.PointLight('#ffcf7a', 0, 16, 2); scene.add(muzzleLight);
const pulseLight = new THREE.PointLight('#ffe7a0', 0, 60, 1.5); scene.add(pulseLight);
gunScene.add(new THREE.HemisphereLight('#e6d6f0', '#5a4b40', 1.6));
const gk = new THREE.DirectionalLight('#ffc89a', 2.4); gk.position.set(-1, 2, 1); gunScene.add(gk);
const gr = new THREE.DirectionalLight('#a07cff', 1.3); gr.position.set(2, 0.5, -1); gunScene.add(gr);
const gunFlashLight = new THREE.PointLight('#ffcc77', 0, 3, 1.5); gunFlashLight.position.set(.1, -.05, -.8); gunScene.add(gunFlashLight);

// a dusk sky baked into an environment map so metal, glass and paint pick up real reflections
function makeEnvMap() {
  const s = new THREE.Scene();
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    vertexShader: 'varying vec3 v; void main(){ v = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `varying vec3 v; void main(){ vec3 d = normalize(v); float h = d.y;
      vec3 top = vec3(.09,.07,.2), hor = vec3(.95,.52,.34), gnd = vec3(.22,.18,.16);
      vec3 c = h > 0.0 ? mix(hor, top, pow(h, .45)) : mix(hor * .55, gnd, pow(-h, .35));
      float s = max(dot(d, normalize(vec3(-.85, .12, .3))), 0.0); c += vec3(1.0, .6, .3) * pow(s, 14.0) * 3.0;
      gl_FragColor = vec4(c, 1.0); }`,
  });
  s.add(new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), mat));
  const pm = new THREE.PMREMGenerator(renderer); const t = pm.fromScene(s, 0).texture; pm.dispose(); return t;
}

/* ---------- post-processing ---------- */
const GradeShader = {
  uniforms: { tDiffuse: { value: null }, time: { value: 0 }, vig: { value: .34 }, hurt: { value: 0 }, grain: { value: .03 }, sat: { value: 1 }, flash: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float time, vig, hurt, grain, sat, flash; varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main(){
      vec2 uv = vUv, c = uv - 0.5; float r = length(c);
      float ca = 0.0012 + hurt * 0.007;
      vec3 col = vec3(texture2D(tDiffuse, uv + c * ca).r, texture2D(tDiffuse, uv).g, texture2D(tDiffuse, uv - c * ca).b);
      float l = dot(col, vec3(0.299, 0.587, 0.114)); col = mix(vec3(l), col, sat);
      col = mix(col, col * vec3(1.04, 0.98, 1.07), 0.6);
      col *= 1.0 - vig * smoothstep(0.32, 0.95, r);
      col = mix(col, vec3(0.5, 0.03, 0.04), hurt * smoothstep(0.25, 0.9, r) * 0.85);
      col += flash * vec3(1.0, 0.9, 0.65);
      col += (h(uv * vec2(1931.0, 1087.0) + fract(time)) - 0.5) * grain;
      gl_FragColor = vec4(col, 1.0);
    }`,
};
let composer, bloomPass, fxaaPass, gradePass, gunPass;
function buildComposer() {
  const q = Q(), dpr = renderer.getPixelRatio();
  const rt = new THREE.WebGLRenderTarget(innerWidth * dpr, innerHeight * dpr, { type: THREE.HalfFloatType, samples: q.msaa });
  if (composer) composer.dispose();
  composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  gunPass = new RenderPass(gunScene, gunCam); gunPass.clear = false; gunPass.clearDepth = true; composer.addPass(gunPass);
  bloomPass = new UnrealBloomPass(new THREE.Vector2(innerWidth * q.bloomRes, innerHeight * q.bloomRes), .55, .5, .85); composer.addPass(bloomPass);
  composer.addPass(new OutputPass());
  fxaaPass = new ShaderPass(FXAAShader); fxaaPass.enabled = q.fxaa; composer.addPass(fxaaPass);
  gradePass = new ShaderPass(GradeShader); composer.addPass(gradePass);
  composer.setPixelRatio(dpr); composer.setSize(innerWidth, innerHeight);
  fxaaPass.material.uniforms.resolution.value.set(1 / (innerWidth * dpr), 1 / (innerHeight * dpr));
}
function applyQuality() {
  const q = Q();
  renderer.setPixelRatio(Math.min(devicePixelRatio, q.pr));
  if (renderer.shadowMap.enabled !== q.shadows) { renderer.shadowMap.enabled = q.shadows; scene.traverse(o => { if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.needsUpdate = true); }); }
  if (sun.shadow.mapSize.x !== q.shadowSize) { sun.shadow.mapSize.set(q.shadowSize, q.shadowSize); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; } }
  buildComposer();
  if (typeof buildFogSprites === 'function' && fogSprites.length) buildFogSprites();
}

/* ---------- canvas textures ---------- */
function canvasTex(size, draw, repeat = true, h = size) {
  const c = document.createElement('canvas'); c.width = size; c.height = h;
  const g = c.getContext('2d'); draw(g, size, h);
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}
function speckle(g, s, h, n, cols, rmax = 2) { for (let i = 0; i < n; i++) { g.fillStyle = pick(cols); const r = Math.random() * rmax + .4; g.fillRect(Math.random() * s, Math.random() * h, r, r); } }
const TX = {};
function makeTextures() {
  TX.asphalt = canvasTex(512, (g, s) => {
    g.fillStyle = '#3f4045'; g.fillRect(0, 0, s, s);
    speckle(g, s, s, 18000, ['rgba(255,255,255,.07)', 'rgba(0,0,0,.2)', 'rgba(140,130,120,.13)'], 2);
    for (let i = 0; i < 8; i++) { const x = Math.random() * s, y = Math.random() * s, r = 30 + Math.random() * 70; const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(10,10,14,.3)'); gr.addColorStop(1, 'rgba(10,10,14,0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); }
    g.strokeStyle = 'rgba(18,18,20,.6)'; g.lineWidth = 1.4;
    for (let i = 0; i < 7; i++) { let x = Math.random() * s, y = Math.random() * s; g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 9; k++) { x += rand(-18, 18); y += rand(-18, 18); g.lineTo(x, y); } g.stroke(); }
  });
  TX.dirt = canvasTex(512, (g, s) => {
    g.fillStyle = '#b69c7c'; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 26; i++) { const x = Math.random() * s, y = Math.random() * s, r = 40 + Math.random() * 110; const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, `rgba(${Math.random() < .5 ? '90,70,50' : '220,200,170'},.16)`); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); }
    speckle(g, s, s, 22000, ['rgba(80,60,40,.25)', 'rgba(240,225,200,.22)', 'rgba(120,95,70,.25)', 'rgba(60,50,40,.3)'], 2.6);
  });
  TX.concrete = canvasTex(256, (g, s) => { g.fillStyle = '#c3bdb2'; g.fillRect(0, 0, s, s); speckle(g, s, s, 5000, ['rgba(0,0,0,.06)', 'rgba(255,255,255,.18)'], 1.8); g.fillStyle = 'rgba(60,55,50,.45)'; g.fillRect(0, 0, s, 3); g.fillRect(0, 0, 3, s); });
  TX.gravel = canvasTex(256, (g, s) => { g.fillStyle = '#a48f74'; g.fillRect(0, 0, s, s); speckle(g, s, s, 9000, ['#8a7560', '#bba78c', '#6e5d4b', '#c9b89e', '#7c6a58', '#a0806a'], 3); });
  TX.block = canvasTex(256, (g, s) => {
    g.fillStyle = '#e4ddd2'; g.fillRect(0, 0, s, s); speckle(g, s, s, 4000, ['rgba(0,0,0,.08)', 'rgba(255,255,255,.2)'], 1.6);
    g.fillStyle = 'rgba(90,80,70,.4)'; for (let r = 0; r < 4; r++) { g.fillRect(0, r * s / 4, s, 3); for (let c = 0; c < 3; c++) g.fillRect(c * s / 2 + (r % 2) * s / 4, r * s / 4, 3, s / 4); }
  });
  TX.frond = canvasTex(64, (g, s, h) => {
    g.clearRect(0, 0, s, h); g.strokeStyle = '#5e6b33'; g.lineWidth = 3; g.beginPath(); g.moveTo(s / 2, h); g.lineTo(s / 2, 0); g.stroke();
    for (let y = 8; y < h - 6; y += 5) { const L = (1 - y / h) * 8 + (y / h) * 26; g.strokeStyle = pick(['#4f6b2a', '#61803a', '#3f5a24', '#728f40']); g.lineWidth = 3.4; g.beginPath(); g.moveTo(s / 2, y); g.lineTo(s / 2 - L, y + 14); g.moveTo(s / 2, y); g.lineTo(s / 2 + L, y + 14); g.stroke(); }
  }, false, 256);
  TX.bark = canvasTex(64, (g, s, h) => { g.fillStyle = '#6e5b48'; g.fillRect(0, 0, s, h); for (let y = 0; y < h; y += 6) { g.fillStyle = `rgba(40,30,20,${.25 + Math.random() * .25})`; g.fillRect(0, y, s, 2); } speckle(g, s, h, 600, ['rgba(255,240,220,.12)', 'rgba(0,0,0,.2)'], 2); }, true, 256);
  TX.glow = canvasTex(128, (g, s) => { const r = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(.22, 'rgba(255,255,255,.6)'); r.addColorStop(.55, 'rgba(255,255,255,.14)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, s, s); }, false);
  TX.blob = canvasTex(128, (g, s) => { const r = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2); r.addColorStop(0, 'rgba(0,0,0,.62)'); r.addColorStop(.55, 'rgba(0,0,0,.35)'); r.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = r; g.fillRect(0, 0, s, s); }, false);
  TX.lightcone = canvasTex(64, (g, s, h) => { const lg = g.createLinearGradient(0, 0, 0, h); lg.addColorStop(0, 'rgba(255,255,255,.95)'); lg.addColorStop(.35, 'rgba(255,255,255,.35)'); lg.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = lg; g.fillRect(0, 0, s, h); const sg = g.createLinearGradient(0, 0, s, 0); sg.addColorStop(0, 'rgba(0,0,0,1)'); sg.addColorStop(.5, 'rgba(0,0,0,0)'); sg.addColorStop(1, 'rgba(0,0,0,1)'); g.globalCompositeOperation = 'destination-out'; g.globalAlpha = .55; g.fillStyle = sg; g.fillRect(0, 0, s, h); }, false, 128);
  TX.star = canvasTex(256, (g, s) => {
    const c = s / 2; const r = g.createRadialGradient(c, c, 0, c, c, c); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(.07, 'rgba(255,250,225,.95)'); r.addColorStop(.2, 'rgba(255,220,150,.25)'); r.addColorStop(1, 'rgba(255,200,120,0)'); g.fillStyle = r; g.fillRect(0, 0, s, s);
    g.globalCompositeOperation = 'lighter';
    for (const [w, l, a] of [[3, c, 0], [3, c, Math.PI / 2], [1.5, c * .55, Math.PI / 4], [1.5, c * .55, -Math.PI / 4]]) { g.save(); g.translate(c, c); g.rotate(a); const lg = g.createLinearGradient(-l, 0, l, 0); lg.addColorStop(0, 'rgba(255,230,170,0)'); lg.addColorStop(.5, 'rgba(255,245,220,.95)'); lg.addColorStop(1, 'rgba(255,230,170,0)'); g.fillStyle = lg; g.fillRect(-l, -w / 2, l * 2, w); g.restore(); }
  }, false);
  TX.smoke = canvasTex(128, (g, s) => { for (let i = 0; i < 9; i++) { const x = s / 2 + rand(-22, 22), y = s / 2 + rand(-22, 22), rr = rand(22, 46); const r = g.createRadialGradient(x, y, 0, x, y, rr); r.addColorStop(0, 'rgba(255,255,255,.35)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, s, s); } }, false);
  TX.flash = canvasTex(128, (g, s) => { const c = s / 2; g.translate(c, c); for (let i = 0; i < 7; i++) { g.rotate(Math.PI * 2 / 7 + rand(-.2, .2)); const L = rand(30, 62); const lg = g.createLinearGradient(0, 0, L, 0); lg.addColorStop(0, 'rgba(255,250,220,1)'); lg.addColorStop(1, 'rgba(255,160,40,0)'); g.fillStyle = lg; g.beginPath(); g.moveTo(0, -5); g.lineTo(L, 0); g.lineTo(0, 5); g.fill(); } const r = g.createRadialGradient(0, 0, 0, 0, 0, 26); r.addColorStop(0, 'rgba(255,255,240,1)'); r.addColorStop(1, 'rgba(255,190,80,0)'); g.fillStyle = r; g.fillRect(-30, -30, 60, 60); }, false);
  TX.fence = canvasTex(128, (g, s) => { g.clearRect(0, 0, s, s); g.strokeStyle = 'rgba(190,190,190,.95)'; g.lineWidth = 2; for (let i = -s; i < s * 2; i += 16) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + s, s); g.stroke(); g.beginPath(); g.moveTo(i + s, 0); g.lineTo(i, s); g.stroke(); } g.fillStyle = 'rgba(170,170,170,1)'; g.fillRect(0, 0, s, 4); });
  TX.windows = canvasTex(64, (g, s, h) => { g.fillStyle = '#1a1622'; g.fillRect(0, 0, s, h); for (let y = 2; y < h; y += 6) for (let x = 2; x < s; x += 6) { const r = Math.random(); g.fillStyle = r < .35 ? '#ffd38a' : r < .5 ? '#fff1d6' : r < .58 ? '#c58cff' : '#2a2433'; g.fillRect(x, y, 4, 4); } }, true, 128);
  TX.court = canvasTex(256, (g, s) => { g.fillStyle = '#3d6f8a'; g.fillRect(0, 0, s, s); g.fillStyle = '#b5523b'; g.fillRect(16, 16, s - 32, s - 32); g.strokeStyle = '#fff'; g.lineWidth = 3; g.strokeRect(16, 16, s - 32, s - 32); g.beginPath(); g.moveTo(16, s / 2); g.lineTo(s - 16, s / 2); g.stroke(); g.beginPath(); g.arc(s / 2, s / 2, 22, 0, 7); g.stroke(); g.beginPath(); g.arc(s / 2, 16, 60, 0, Math.PI); g.stroke(); g.beginPath(); g.arc(s / 2, s - 16, 60, Math.PI, 0); g.stroke(); }, false);
  TX.cone = canvasTex(256, (g, s) => { const r = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2); r.addColorStop(0, 'rgba(255,255,255,.3)'); r.addColorStop(.8, 'rgba(255,255,255,.42)'); r.addColorStop(.92, 'rgba(255,255,255,.6)'); r.addColorStop(.955, 'rgba(255,255,255,1)'); r.addColorStop(.985, 'rgba(255,255,255,1)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, s, s); }, false);
  const icon = (ch, col) => canvasTex(128, (g, s) => { g.beginPath(); g.arc(s / 2, s / 2, s / 2 - 6, 0, 7); g.fillStyle = 'rgba(15,10,20,.75)'; g.fill(); g.lineWidth = 6; g.strokeStyle = col; g.stroke(); g.fillStyle = col; g.font = '84px Anton, Impact, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(ch, s / 2, s / 2 + 4); }, false);
  TX.q = icon('?', '#ffd24a'); TX.ex = icon('!', '#ff3b3b');
  TX.grass = canvasTex(256, (g, s) => { g.fillStyle = '#7d8a4a'; g.fillRect(0, 0, s, s); speckle(g, s, s, 9000, ['#6b7a3c', '#90a058', '#a39466', '#5f6d35', '#b5a37a'], 2.6); });
  TX.decal = canvasTex(64, (g, s) => { const r = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2); r.addColorStop(0, 'rgba(10,8,8,1)'); r.addColorStop(.25, 'rgba(20,16,14,.9)'); r.addColorStop(.5, 'rgba(60,50,40,.35)'); r.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = r; g.fillRect(0, 0, s, s); }, false);
  TX.hazewall = canvasTex(8, (g, s, h) => { const lg = g.createLinearGradient(0, 0, 0, h); lg.addColorStop(0, 'rgba(255,255,255,0)'); lg.addColorStop(.55, 'rgba(255,255,255,.55)'); lg.addColorStop(1, 'rgba(255,255,255,.95)'); g.fillStyle = lg; g.fillRect(0, 0, s, h); }, false, 128);
}
function signTex(lines, bg, fg, w = 512, h = 128, font = 'Anton') {
  return canvasTex(w, (g) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h); g.textAlign = 'center'; g.textBaseline = 'middle';
    lines.forEach(l => { g.fillStyle = l.c || fg; g.font = `${l.s || 64}px ${font}, Impact, sans-serif`; g.shadowColor = l.c || fg; g.shadowBlur = l.glow || 0; g.fillText(l.t, w / 2, l.y != null ? l.y : h / 2); });
  }, false, h);
}
function quarantineTex() {
  return canvasTex(512, (g, w, h) => {
    g.fillStyle = '#f2c230'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#141414'; for (let x = -h; x < w; x += 46) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 22, 0); g.lineTo(x + 22 + 26, 26); g.lineTo(x + 26, 26); g.fill(); g.beginPath(); g.moveTo(x, h - 26); g.lineTo(x + 22, h - 26); g.lineTo(x + 48, h); g.lineTo(x + 26, h); g.fill(); }
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#141414';
    g.font = '64px Anton, Impact, sans-serif'; g.fillText('QUARANTINE ZONE', w / 2, 82);
    g.font = '700 30px Rajdhani, sans-serif'; g.fillText('NO EXIT · HAZE BEYOND THIS POINT', w / 2, 136);
    g.font = '700 22px Rajdhani, sans-serif'; g.fillText('BY ORDER OF THE HOUSE', w / 2, 176);
  }, false, 220);
}
function muralTex() {
  return canvasTex(1024, (g, w, h) => {
    const bg = g.createLinearGradient(0, 0, w, h); bg.addColorStop(0, '#2a1440'); bg.addColorStop(.5, '#4a1f5e'); bg.addColorStop(1, '#1b2a4a'); g.fillStyle = bg; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(255,${180 + Math.random() * 60},${80 + Math.random() * 80},${Math.random() * .5})`; const x = Math.random() * w, y = Math.random() * h; g.beginPath(); g.arc(x, y, Math.random() * 2.5, 0, 7); g.fill(); }
    g.save(); g.translate(150, 130); g.fillStyle = '#f2c14e'; g.shadowColor = '#f2c14e'; g.shadowBlur = 30; g.beginPath(); for (let i = 0; i < 10; i++) { const r = i % 2 ? 34 : 90, a = i * Math.PI / 5 - Math.PI / 2; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); } g.fill(); g.restore();
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = '150px Anton, Impact, sans-serif';
    g.lineWidth = 14; g.strokeStyle = '#120a1a'; g.strokeText('DO BETTER', 600, 128); g.fillStyle = '#f2c14e'; g.shadowColor = '#ff8a3d'; g.shadowBlur = 20; g.fillText('DO BETTER', 600, 128);
    g.shadowBlur = 0; g.font = '700 26px Rajdhani, sans-serif'; g.fillStyle = '#fff'; g.fillText('THE NORTH STAR IS WATCHING OVER YOU', 600, 222);
  }, false, 256);
}

/* ---------- static geometry batching ---------- */
const BK = {};
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _one = new THREE.Vector3(1, 1, 1), _sc = new THREE.Vector3();
function put(name, geo, color, x, y, z, ry = 0, rx = 0, rz = 0) {
  _e.set(rx, ry, rz, 'YXZ'); _q.setFromEuler(_e); _m.compose(_v.set(x, y, z), _q, _one); geo.applyMatrix4(_m);
  const c = new THREE.Color(color), n = geo.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
  if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  (BK[name] || (BK[name] = [])).push(geo); return geo;
}
function boxGeo(w, h, d, t = 2) {
  const g = new THREE.BoxGeometry(w, h, d), uv = g.attributes.uv, dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) { const i = f * 4 + k; uv.setXY(i, uv.getX(i) * dims[f][0] / t, uv.getY(i) * dims[f][1] / t); }
  return g;
}
function planeGeo(w, h, t = 2, seg = 1) { const g = new THREE.PlaneGeometry(w, h, seg, seg), uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / t, uv.getY(i) * h / t); return g; }
function addBox(name, w, h, d, x, y, z, color, o = {}) { put(name, boxGeo(w, h, d, o.tex || 2), color, x, y + h / 2, z, o.ry || 0, o.rx || 0); if (o.collide) addCollider(x, z, w, d, y + h, o.ry || 0, y, { exact: true, ...o }); }
function addFlat(name, w, d, x, y, z, color, t = 2, ry = 0) { put(name, planeGeo(w, d, t), color, x, y, z, ry, -Math.PI / 2); }
function addPanel(name, w, h, x, y, z, ry, color, off = 0.02, t = 2) { put(name, planeGeo(w, h, t), color, x + Math.sin(ry) * off, y, z + Math.cos(ry) * off, ry); }
// a strip that follows a road: offsets o0 < o1 measured along the road's left normal
function ribbon(bucket, samples, o0, o1, y, color, tex = 4, ok = null, y1 = null, faceNormal = 0) {
  let seg = [];
  const flush = () => {
    if (seg.length > 1) {
      const n = seg.length, pos = new Float32Array(n * 6), nor = new Float32Array(n * 6), uv = new Float32Array(n * 4), idx = [];
      seg.forEach((sm, i) => {
        pos.set([sm.x + sm.nx * o0, y, sm.z + sm.nz * o0, sm.x + sm.nx * o1, y1 == null ? y : y1, sm.z + sm.nz * o1], i * 6);
        if (faceNormal) nor.set([sm.nx * faceNormal, 0, sm.nz * faceNormal, sm.nx * faceNormal, 0, sm.nz * faceNormal], i * 6); else nor.set([0, 1, 0, 0, 1, 0], i * 6);
        uv.set([o0 / tex, sm.s / tex, (y1 == null ? o1 : o0 + (y1 - y)) / tex, sm.s / tex], i * 4);
        if (i) { const a = (i - 1) * 2, b = a + 1, c = i * 2, d = c + 1; if (faceNormal > 0) idx.push(a, c, b, b, c, d); else idx.push(a, b, c, b, d, c); }
      });
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setIndex(idx);
      put(bucket, g, color, 0, 0, 0);
    }
    seg = [];
  };
  for (const sm of samples) { if (ok && !ok(sm)) { flush(); continue; } seg.push(sm); }
  flush();
}
function mergeGeos(list) {
  let vc = 0, ic = 0; for (const g of list) { vc += g.attributes.position.count; ic += g.index ? g.index.count : g.attributes.position.count; }
  const P = new Float32Array(vc * 3), N = new Float32Array(vc * 3), U = new Float32Array(vc * 2), C = new Float32Array(vc * 3), I = new Uint32Array(ic);
  let vo = 0, io = 0;
  for (const g of list) {
    const n = g.attributes.position.count;
    P.set(g.attributes.position.array, vo * 3); N.set(g.attributes.normal.array, vo * 3); U.set(g.attributes.uv.array, vo * 2); C.set(g.attributes.color.array, vo * 3);
    if (g.index) { const a = g.index.array; for (let k = 0; k < a.length; k++) I[io + k] = a[k] + vo; io += a.length; } else { for (let k = 0; k < n; k++) I[io + k] = vo + k; io += n; }
    vo += n; g.dispose();
  }
  const m = new THREE.BufferGeometry();
  m.setAttribute('position', new THREE.BufferAttribute(P, 3)); m.setAttribute('normal', new THREE.BufferAttribute(N, 3)); m.setAttribute('uv', new THREE.BufferAttribute(U, 2)); m.setAttribute('color', new THREE.BufferAttribute(C, 3));
  m.setIndex(new THREE.BufferAttribute(I, 1)); m.computeBoundingSphere(); return m;
}
function mergeSimple(list) { for (const g of list) { if (!g.attributes.color) { const n = g.attributes.position.count; g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(1), 3)); } if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2)); if (!g.attributes.normal) g.computeVertexNormals(); } return mergeGeos(list); }

/* ---------- colliders: oriented boxes on a grid ---------- */
const colliders = []; const GRID = 16, GOFF = 240, GN = 30; const grid = [];
function addCollider(x, z, w, d, top, ry = 0, bottom = 0, o = {}) {
  const c = Math.cos(ry), s = Math.sin(ry), hw = w / 2, hd = d / 2;
  const ex = Math.abs(c) * hw + Math.abs(s) * hd, ez = Math.abs(s) * hw + Math.abs(c) * hd;
  const col = { cx: x, cz: z, hw, hd, c, s, y0: bottom, y1: top, nb: !!o.noBullet, nm: !!o.noMove, dyn: !!o.dyn, ex: !!o.exact, mt: !!o.metal, x0: x - ex, x1: x + ex, z0: z - ez, z1: z + ez };
  colliders.push(col); return col;
}
function buildGrid() { for (let i = 0; i < GN * GN; i++) grid[i] = []; for (const c of colliders) { const a = Math.floor((c.x0 + GOFF) / GRID), b = Math.floor((c.x1 + GOFF) / GRID), e = Math.floor((c.z0 + GOFF) / GRID), f = Math.floor((c.z1 + GOFF) / GRID); for (let i = clamp(a, 0, GN - 1); i <= clamp(b, 0, GN - 1); i++) for (let j = clamp(e, 0, GN - 1); j <= clamp(f, 0, GN - 1); j++) grid[j * GN + i].push(c); } }
const _near = new Set();
function nearColliders(x, z) { _near.clear(); const i = Math.floor((x + GOFF) / GRID), j = Math.floor((z + GOFF) / GRID); for (let a = i - 1; a <= i + 1; a++) for (let b = j - 1; b <= j + 1; b++) { if (a < 0 || b < 0 || a >= GN || b >= GN) continue; for (const c of grid[b * GN + a]) _near.add(c); } return _near; }
function toLocal(c, x, z) { const dx = x - c.cx, dz = z - c.cz; return [dx * c.c - dz * c.s, dx * c.s + dz * c.c]; }
function pushOut(p, r, feet, head) {
  for (const c of nearColliders(p.x, p.z)) {
    if (c.nm || c.y1 <= feet + 0.36 || c.y0 >= head) continue;
    const [lx, lz] = toLocal(c, p.x, p.z);
    const qx = clamp(lx, -c.hw, c.hw), qz = clamp(lz, -c.hd, c.hd), ex = lx - qx, ez = lz - qz, d2 = ex * ex + ez * ez;
    if (d2 >= r * r) continue;
    let nx, nz;
    if (d2 > 1e-8) { const d = Math.sqrt(d2); nx = lx + ex / d * (r - d); nz = lz + ez / d * (r - d); }
    else { const px = c.hw - Math.abs(lx), pz = c.hd - Math.abs(lz); if (px < pz) { nx = Math.sign(lx || 1) * (c.hw + r); nz = lz; } else { nz = Math.sign(lz || 1) * (c.hd + r); nx = lx; } }
    p.x = c.cx + nx * c.c + nz * c.s; p.z = c.cz - nx * c.s + nz * c.c;
  }
}
function pointFree(x, z, r) { if (!LAY.insideBorder(x, z, 3)) return false; for (const c of nearColliders(x, z)) { if (c.nm || c.y1 < .5) continue; const [lx, lz] = toLocal(c, x, z); if (Math.abs(lx) < c.hw + r && Math.abs(lz) < c.hd + r) return false; } return true; }
function groundAt(x, z, feet) { let g = 0; for (const c of nearColliders(x, z)) { if (c.nm || c.y1 > feet + .36 || c.y1 <= g) continue; const [lx, lz] = toLocal(c, x, z); if (Math.abs(lx) < c.hw && Math.abs(lz) < c.hd) g = c.y1; } return g; }
function rayAABB(ox, oy, oz, dx, dy, dz, c, maxT) {
  let tmin = 0, tmax = maxT;
  for (let a = 0; a < 3; a++) {
    const o = a === 0 ? ox : a === 1 ? oy : oz, d = a === 0 ? dx : a === 1 ? dy : dz, lo = a === 0 ? c.x0 : a === 1 ? c.y0 : c.z0, hi = a === 0 ? c.x1 : a === 1 ? c.y1 : c.z1;
    if (Math.abs(d) < 1e-9) { if (o < lo || o > hi) return -1; }
    else { let t1 = (lo - o) / d, t2 = (hi - o) / d; if (t1 > t2) { const t = t1; t1 = t2; t2 = t; } if (t1 > tmin) tmin = t1; if (t2 < tmax) tmax = t2; if (tmin > tmax) return -1; }
  }
  return tmin;
}
const _rn = new THREE.Vector3();
function rayOBB(o, d, c, maxT) {
  const ox = o.x - c.cx, oz = o.z - c.cz;
  const lox = ox * c.c - oz * c.s, loz = ox * c.s + oz * c.c, ldx = d.x * c.c - d.z * c.s, ldz = d.x * c.s + d.z * c.c;
  let tmin = 0, tmax = maxT, ax = -1;
  const sl = (o0, d0, lo, hi, axis) => { if (Math.abs(d0) < 1e-9) return o0 >= lo && o0 <= hi; let t1 = (lo - o0) / d0, t2 = (hi - o0) / d0; if (t1 > t2) { const t = t1; t1 = t2; t2 = t; } if (t1 > tmin) { tmin = t1; ax = axis; } if (t2 < tmax) tmax = t2; return tmin <= tmax; };
  if (!sl(lox, ldx, -c.hw, c.hw, 0) || !sl(o.y, d.y, c.y0, c.y1, 1) || !sl(loz, ldz, -c.hd, c.hd, 2)) return -1;
  if (ax === 0) { const s = -Math.sign(ldx); _rn.set(s * c.c, 0, -s * c.s); } else if (ax === 2) { const s = -Math.sign(ldz); _rn.set(s * c.s, 0, s * c.c); } else _rn.set(0, d.y < 0 ? 1 : -1, 0);
  return tmin;
}
const hitNormal = new THREE.Vector3();
function rayStatic(o, d, maxT) {
  let best = maxT, hit = null;
  if (d.y < 0) { const tg = -o.y / d.y; if (tg < best) { best = tg; hit = 'ground'; hitNormal.set(0, 1, 0); } }
  for (const c of colliders) { if (c.nb) continue; if (c.x1 < Math.min(o.x, o.x + d.x * best) - .01 || c.x0 > Math.max(o.x, o.x + d.x * best) + .01 || c.z1 < Math.min(o.z, o.z + d.z * best) - .01 || c.z0 > Math.max(o.z, o.z + d.z * best) + .01) continue; const t = rayOBB(o, d, c, best); if (t >= 0 && t < best) { best = t; hit = c; hitNormal.copy(_rn); } }
  return { t: best, hit };
}
function raySphere(o, d, cx, cy, cz, r, maxT) { const ox = o.x - cx, oy = o.y - cy, oz = o.z - cz; const b = ox * d.x + oy * d.y + oz * d.z, c = ox * ox + oy * oy + oz * oz - r * r, h = b * b - c; if (h < 0) return -1; const t = -b - Math.sqrt(h); return t >= 0 && t < maxT ? t : -1; }

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
