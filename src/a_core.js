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
