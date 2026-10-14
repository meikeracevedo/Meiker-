/* Meiker Battle Royale — cliente 3D */
import * as THREE from '/vendor/three.module.min.js';

const BR = window.BR;
const { SIZE, EYE, PH, WEAPONS, LOOT } = BR;
const $ = (id) => document.getElementById(id);
const clamp = BR.clamp;
// Hecho para celular: los controles táctiles siempre están activos (en PC el mouse funciona como un dedo)
const realTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
const isTouch = true;

/* ---------- Ajustes ---------- */
const settings = { name: '', sound: true, vibe: true, assist: true, hq: false, mode: 'duo', diff: 1, sens: 1 };
try { Object.assign(settings, JSON.parse(localStorage.getItem('meiker-br') || '{}')); } catch (_) {}
if (settings.v !== 3) { settings.hq = false; settings.v = 3; }
const save = () => { try { localStorage.setItem('meiker-br', JSON.stringify(settings)); } catch (_) {} };

/* ---------- Sonido sintetizado ---------- */
const AC = { ctx: null, out: null, noise: null, last: {} };
function audioInit() {
  if (AC.ctx) { if (AC.ctx.state === 'suspended') AC.ctx.resume(); return; }
  const C = window.AudioContext || window.webkitAudioContext; if (!C) return;
  const c = new C(), comp = c.createDynamicsCompressor(), g = c.createGain(); g.gain.value = 0.5;
  g.connect(comp); comp.connect(c.destination);
  const buf = c.createBuffer(1, c.sampleRate, c.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  Object.assign(AC, { ctx: c, out: g, noise: buf });
}
function env(g, t, peak, dur) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.005 + dur); }
function noise(t, dur, type, f0, f1, vol) {
  const c = AC.ctx, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
  s.buffer = AC.noise; f.type = type; f.frequency.setValueAtTime(f0, t); if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
  env(g, t, vol, dur); s.connect(f); f.connect(g); g.connect(AC.out); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
}
function tone(t, type, f0, f1, dur, vol) {
  const c = AC.ctx, o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, t); if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  env(g, t, vol, dur); o.connect(g); g.connect(AC.out); o.start(t); o.stop(t + dur + 0.05);
}
function sfx(name, vol = 1, arg) {
  if (!settings.sound || !AC.ctx || vol < 0.03) return;
  const now = AC.ctx.currentTime, key = name + (arg ?? '');
  if (AC.last[key] && now - AC.last[key] < 0.035) return;
  AC.last[key] = now;
  const t = now + 0.005, v = vol;
  switch (name) {
    case 'shot':
      if (arg === 0) { noise(t, 0.1, 'bandpass', 2000, 600, 0.5 * v); tone(t, 'square', 260, 80, 0.06, 0.12 * v); }
      else if (arg === 1) noise(t, 0.06, 'bandpass', 2600, 1100, 0.4 * v);
      else if (arg === 2) { noise(t, 0.3, 'lowpass', 2400, 250, 0.95 * v); tone(t, 'sine', 120, 40, 0.2, 0.5 * v); }
      else if (arg === 3) { noise(t, 0.11, 'bandpass', 1600, 500, 0.6 * v); tone(t, 'square', 200, 70, 0.06, 0.13 * v); }
      else { noise(t, 0.5, 'lowpass', 3600, 160, 0.95 * v); tone(t, 'sawtooth', 900, 100, 0.12, 0.2 * v); tone(t, 'sine', 80, 35, 0.35, 0.5 * v); }
      break;
    case 'hit': tone(t, 'sine', 1500, 1100, 0.05, 0.25 * v); break;
    case 'head': tone(t, 'triangle', 2100, 1700, 0.08, 0.3 * v); tone(t + 0.04, 'sine', 2600, 0, 0.06, 0.2 * v); break;
    case 'shieldhit': tone(t, 'triangle', 900, 1400, 0.06, 0.18 * v); break;
    case 'hurt': tone(t, 'square', 180, 70, 0.12, 0.18 * v); noise(t, 0.06, 'lowpass', 900, 0, 0.3 * v); break;
    case 'jump': tone(t, 'sine', 280, 520, 0.1, 0.1 * v); break;
    case 'land': noise(t, 0.12, 'lowpass', 500, 0, 0.4 * v); break;
    case 'chute': noise(t, 0.4, 'highpass', 800, 3000, 0.3 * v); break;
    case 'wind': noise(t, 0.6, 'bandpass', 500, 900, 0.18 * v); break;
    case 'pick': tone(t, 'sine', 660, 0, 0.08, 0.22 * v); tone(t + 0.07, 'sine', 990, 0, 0.12, 0.22 * v); break;
    case 'heal': [440, 554, 660].forEach((f, i) => tone(t + i * 0.08, 'sine', f, 0, 0.14, 0.18 * v)); break;
    case 'kill': [523, 659, 784, 1047].forEach((f, i) => tone(t + i * 0.06, 'triangle', f, 0, 0.14, 0.22 * v)); break;
    case 'die': tone(t, 'sawtooth', 320, 50, 0.6, 0.22 * v); break;
    case 'slam': noise(t, 0.6, 'lowpass', 900, 50, 1.1 * v); tone(t, 'sine', 90, 30, 0.5, 0.7 * v); break;
    case 'empty': tone(t, 'square', 900, 0, 0.03, 0.08 * v); break;
    case 'reload': noise(t, 0.05, 'bandpass', 1200, 0, 0.3 * v); noise(t + 0.25, 0.05, 'bandpass', 900, 0, 0.3 * v); break;
    case 'reloaded': noise(t, 0.04, 'bandpass', 2200, 0, 0.35 * v); tone(t + 0.05, 'square', 600, 0, 0.03, 0.08 * v); break;
    case 'zone': tone(t, 'sine', 300, 200, 0.6, 0.2 * v); tone(t + 0.3, 'sine', 300, 200, 0.6, 0.2 * v); break;
    case 'win': [523, 659, 784, 1047, 1319].forEach((f, i) => tone(t + i * 0.1, 'triangle', f, 0, 0.3, 0.25 * v)); break;
  }
}
const vibrate = (p) => { if (settings.vibe && navigator.vibrate) try { navigator.vibrate(p); } catch (_) {} };

/* ---------- Three.js ---------- */
const canvas = $('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
// Siempre de noche: luna, estrellas, faroles y ventanas encendidas
const SKY = new THREE.Color('#070b18');
scene.background = SKY;
scene.fog = new THREE.Fog(SKY, 40, 230);
const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 1800);
scene.add(camera);
scene.add(new THREE.HemisphereLight(0x5d74b8, 0x0d1018, 1.05));
const moonLight = new THREE.DirectionalLight(0xaec2ff, 0.9);
moonLight.position.set(-0.6, 1, 0.4);
scene.add(moonLight);
{
  const n = 900, pos = new Float32Array(n * 3), r = BR.rng(7);
  for (let i = 0; i < n; i++) {
    const a = r() * Math.PI * 2, e = 0.08 + r() * 1.4, R = 1500;
    pos[i * 3] = Math.cos(a) * Math.cos(e) * R; pos[i * 3 + 1] = Math.sin(e) * R; pos[i * 3 + 2] = Math.sin(a) * Math.cos(e) * R;
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const stars = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xdfe8ff, size: 2.2, sizeAttenuation: false, fog: false }));
  camera.add(stars); stars.position.set(0, 0, 0);
  stars.onBeforeRender = () => { stars.quaternion.copy(camera.quaternion).invert(); };
  const moon = new THREE.Mesh(new THREE.SphereGeometry(40, 20, 14), new THREE.MeshBasicMaterial({ color: '#fff3c4', fog: false }));
  moon.position.set(-900, 700, 400);
  scene.add(moon);
  scene.userData.moon = moon;
}
// Linterna del jugador y fogonazo
const flashlight = new THREE.SpotLight(0xfff1d0, 30, 45, 0.55, 0.6, 1.2);
flashlight.target = new THREE.Object3D();
scene.add(flashlight, flashlight.target);
const muzzleLight = new THREE.PointLight(0xffc066, 0, 14, 1.5);
scene.add(muzzleLight);
const overlay = $('overlay'), octx = overlay.getContext('2d');
let VW = innerWidth, VH = innerHeight, G_LOWRES = false;
function resize() {
  VW = innerWidth; VH = innerHeight;
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, settings.hq ? 1.75 : G_LOWRES ? 0.85 : 1.15));
  renderer.setSize(VW, VH, false);
  camera.aspect = VW / VH; camera.fov = VW > VH ? 70 : 85; camera.updateProjectionMatrix();
  overlay.width = VW * Math.min(devicePixelRatio || 1, 2); overlay.height = VH * Math.min(devicePixelRatio || 1, 2);
  octx.setTransform(overlay.width / VW, 0, 0, overlay.height / VH, 0, 0);
  checkRotate();
}
addEventListener('resize', resize);

const matCache = new Map();
const lambert = (color, opts) => {
  const key = color + JSON.stringify(opts || {});
  if (!matCache.has(key)) matCache.set(key, new THREE.MeshLambertMaterial(Object.assign({ color }, opts || {})));
  return matCache.get(key);
};

/* ---------- Construcción de la isla ---------- */
let worldGroup = null, world = null, zoneMesh = null, nextZoneMesh = null, planeMesh = null, mapImg = null;
const BUILD_COLORS = ['#e9dcc4', '#d7b98f', '#c9d7d1', '#e7c7b0', '#b9c4cf'];
const ROOF_COLORS = ['#8c3b2f', '#5a4636', '#3a4a5a', '#7a5a3a', '#4a5a4a'];
function buildWorld(seed) {
  if (world && world.seed === (seed >>> 0)) return;
  if (worldGroup) { scene.remove(worldGroup); worldGroup.traverse(o => { if (o.geometry) o.geometry.dispose(); }); }
  world = new BR.World(seed);
  worldGroup = new THREE.Group();
  // Terreno con colores por altura
  const EXT = 200, N = settings.hq ? 160 : 120, span = SIZE + EXT * 2;
  const geo = new THREE.PlaneGeometry(span, span, N, N);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position, colors = new Float32Array(pos.count * 3), c = new THREE.Color();
  const grassA = new THREE.Color('#6fae4f'), grassB = new THREE.Color('#3f7d3a'), sand = new THREE.Color('#e3cf97'), rock = new THREE.Color('#9a958a'), deep = new THREE.Color('#c2ad78'), town = new THREE.Color('#b9a98a');
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) + SIZE / 2, z = pos.getZ(i) + SIZE / 2;
    const inside = x >= 0 && x <= SIZE && z >= 0 && z <= SIZE;
    const h = inside ? world.heightAt(x, z) : -14;
    pos.setY(i, h);
    if (h < 0.2) c.copy(deep);
    else if (h < 1.6) c.copy(sand);
    else if (h > 38) c.copy(rock);
    else { c.copy(grassA).lerp(grassB, clamp((h - 2) / 34, 0, 1)); c.offsetHSL(0, 0, (Math.sin(x * 0.07) * Math.cos(z * 0.05)) * 0.025); }
    for (const t of world.towns) { const d = Math.hypot(t.x - x, t.z - z); if (d < t.r + 8) c.lerp(town, clamp(1 - d / (t.r + 8), 0, 0.7)); }
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const terrain = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
  terrain.position.set(SIZE / 2, 0, SIZE / 2);
  worldGroup.add(terrain);
  const water = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000), new THREE.MeshLambertMaterial({ color: '#1d4f7a', transparent: true, opacity: 0.9 }));
  water.rotation.x = -Math.PI / 2; water.position.set(SIZE / 2, 0, SIZE / 2);
  worldGroup.add(water);
  // Edificios (instanciados: pocas llamadas de dibujo)
  const box = new THREE.BoxGeometry(1, 1, 1);
  const B = world.buildings;
  const walls = new THREE.InstancedMesh(box, new THREE.MeshLambertMaterial(), B.length);
  const roofs = new THREE.InstancedMesh(box, new THREE.MeshLambertMaterial(), B.length);
  const doors = new THREE.InstancedMesh(box, lambert('#3a2c22'), B.length);
  const wins = new THREE.InstancedMesh(box, new THREE.MeshBasicMaterial({ color: '#ffcf6b' }), B.length * 4 + B.reduce((n, b) => n + Math.max(0, (b.floors || 1) - 1) * 2, 0));
  let wi = B.length * 4;
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s3 = new THREE.Vector3(), p3 = new THREE.Vector3();
  B.forEach((b, i) => {
    const w = b.maxX - b.minX, d = b.maxZ - b.minZ, h = b.maxY - b.minY;
    m.compose(p3.set((b.minX + b.maxX) / 2, b.minY + h / 2, (b.minZ + b.maxZ) / 2), q, s3.set(w, h, d)); walls.setMatrixAt(i, m);
    walls.setColorAt(i, c.set(BUILD_COLORS[b.hue]));
    m.compose(p3.set((b.minX + b.maxX) / 2, b.maxY + 0.25, (b.minZ + b.maxZ) / 2), q, s3.set(w + 0.8, 0.5, d + 0.8)); roofs.setMatrixAt(i, m);
    roofs.setColorAt(i, c.set(ROOF_COLORS[b.hue]));
    m.compose(p3.set((b.minX + b.maxX) / 2, b.minY + 2.1, b.maxZ + 0.02), q, s3.set(1.4, 2.2, 0.1)); doors.setMatrixAt(i, m);
    m.compose(p3.set(b.minX + w * 0.25, b.maxY - 1.8, b.minZ - 0.02), q, s3.set(w * 0.3, 1.1, 0.1)); wins.setMatrixAt(i * 4, m);
    m.compose(p3.set(b.maxX - w * 0.25, b.minY + 2.6, b.minZ - 0.02), q, s3.set(w * 0.25, 1, 0.1)); wins.setMatrixAt(i * 4 + 1, m);
    m.compose(p3.set(b.minX - 0.02, b.maxY - 1.8, (b.minZ + b.maxZ) / 2), q, s3.set(0.1, 1.1, d * 0.4)); wins.setMatrixAt(i * 4 + 2, m);
    m.compose(p3.set(b.maxX + 0.02, b.minY + 2.6, (b.minZ + b.maxZ) / 2), q, s3.set(0.1, 1, d * 0.3)); wins.setMatrixAt(i * 4 + 3, m);
    for (let fl = 1; fl < (b.floors || 1); fl++) {
      const y = b.minY + 1 + fl * 3.5 + 1.2;
      m.compose(p3.set(b.minX + w * 0.5, y, b.maxZ + 0.02), q, s3.set(w * 0.6, 1, 0.1)); wins.setMatrixAt(wi, m); wins.setColorAt(wi++, c.set((i + fl) % 3 ? '#ffcf6b' : '#2a2f3a'));
      m.compose(p3.set(b.minX + w * 0.5, y, b.minZ - 0.02), q, s3.set(w * 0.6, 1, 0.1)); wins.setMatrixAt(wi, m); wins.setColorAt(wi++, c.set((i + fl) % 2 ? '#9fd3ff' : '#ffcf6b'));
    }
    wins.setColorAt(i * 4, c.set(i % 3 ? '#ffcf6b' : '#9fd3ff')); wins.setColorAt(i * 4 + 1, c.set('#ffcf6b')); wins.setColorAt(i * 4 + 2, c.set(i % 2 ? '#ffcf6b' : '#ffe2a3')); wins.setColorAt(i * 4 + 3, c.set('#2a2f3a'));
  });
  [walls, roofs, doors, wins].forEach(o => worldGroup.add(o));
  // Árboles
  const T = world.trees;
  const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.22, 0.32, 1, 6), lambert('#6b4a2e'), T.length);
  const crowns = new THREE.InstancedMesh(new THREE.ConeGeometry(1, 1, 7), new THREE.MeshLambertMaterial({ flatShading: true }), T.length * 2);
  T.forEach((t, i) => {
    const h = (t.maxY - t.minY - 0.5), gy = t.minY + 0.5;
    m.compose(p3.set(t.x, gy + h * 0.2, t.z), q, s3.set(1, h * 0.4, 1)); trunks.setMatrixAt(i, m);
    m.compose(p3.set(t.x, gy + h * 0.5, t.z), q, s3.set(2.6 * t.s, h * 0.55, 2.6 * t.s)); crowns.setMatrixAt(i * 2, m);
    m.compose(p3.set(t.x, gy + h * 0.78, t.z), q, s3.set(1.8 * t.s, h * 0.42, 1.8 * t.s)); crowns.setMatrixAt(i * 2 + 1, m);
    const g = c.set('#2f6b34').offsetHSL((i % 7) * 0.006, 0, ((i * 37) % 10) * 0.012);
    crowns.setColorAt(i * 2, g); crowns.setColorAt(i * 2 + 1, g);
  });
  worldGroup.add(trunks, crowns);
  // Rocas
  const R = world.rocks;
  const rocks = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(0.7, 0), new THREE.MeshLambertMaterial({ color: '#8d8a82', flatShading: true }), R.length);
  R.forEach((r, i) => {
    q.setFromEuler(new THREE.Euler(i, i * 2.3, 0));
    m.compose(p3.set((r.minX + r.maxX) / 2, r.minY + 1 + r.s * 0.2, (r.minZ + r.maxZ) / 2), q, s3.set(r.s, r.s * 0.8, r.s)); rocks.setMatrixAt(i, m);
  });
  q.identity();
  worldGroup.add(rocks);
  // Cajas de los campamentos
  const C = world.crates;
  const crates = new THREE.InstancedMesh(box, new THREE.MeshLambertMaterial(), C.length);
  C.forEach((b, i) => {
    m.compose(p3.set((b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2, (b.minZ + b.maxZ) / 2), q, s3.set(b.maxX - b.minX, b.maxY - b.minY, b.maxZ - b.minZ)); crates.setMatrixAt(i, m);
    crates.setColorAt(i, c.set(i % 3 === 0 ? '#5c6b3a' : i % 3 === 1 ? '#7a5a34' : '#3d5a6b'));
  });
  worldGroup.add(crates);
  // Faroles: poste, bombillo y un círculo de luz en el piso (sin luces reales para que corra en cualquier celular)
  const L = world.lamps;
  const poles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.08, 0.1, 1, 6), lambert('#2b2f36'), L.length);
  const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.28, 8, 6), new THREE.MeshBasicMaterial({ color: '#ffd27a' }), L.length);
  const glowTex = (() => { const cv = document.createElement('canvas'); cv.width = cv.height = 64; const g = cv.getContext('2d'); const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,210,122,.55)'); gr.addColorStop(1, 'rgba(255,210,122,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(cv); })();
  const pools = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }), L.length);
  L.forEach((l, i) => {
    const h = world.heightAt(l.x, l.z);
    m.compose(p3.set(l.x, h + 2.5, l.z), q, s3.set(1, 5, 1)); poles.setMatrixAt(i, m);
    m.compose(p3.set(l.x, h + 5.1, l.z), q, s3.set(1, 1, 1)); bulbs.setMatrixAt(i, m);
    m.compose(p3.set(l.x, h + 0.08, l.z), q, s3.set(16, 1, 16)); pools.setMatrixAt(i, m);
  });
  worldGroup.add(poles, bulbs, pools);
  // Carreteras: cinta oscura que sigue el terreno, con línea amarilla al centro
  const roadPos = [], roadIdx = [], lineM = [];
  for (const rd of world.roads) {
    const L = Math.hypot(rd.bx - rd.ax, rd.bz - rd.az), nx = -(rd.bz - rd.az) / L, nz = (rd.bx - rd.ax) / L, steps = Math.ceil(L / 3);
    const base = roadPos.length / 3;
    for (let k = 0; k <= steps; k++) {
      const t = k / steps, x = rd.ax + (rd.bx - rd.ax) * t, z = rd.az + (rd.bz - rd.az) * t;
      for (const sd of [-3, 3]) { const px = x + nx * sd, pz = z + nz * sd; roadPos.push(px, Math.max(world.heightAt(px, pz), 0.2) + 0.12, pz); }
      if (k < steps) { const a = base + k * 2; roadIdx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
      if (k % 2 === 0 && k < steps) lineM.push({ x, z, yaw: Math.atan2(rd.bx - rd.ax, rd.bz - rd.az) });
    }
  }
  const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.Float32BufferAttribute(roadPos, 3)); rg.setIndex(roadIdx); rg.computeVertexNormals();
  worldGroup.add(new THREE.Mesh(rg, new THREE.MeshLambertMaterial({ color: '#2a2c33', side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2 })));
  const lines = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.25, 1.6).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#F5B50A' }), lineM.length);
  lineM.forEach((l, i) => { q.setFromEuler(new THREE.Euler(0, l.yaw, 0)); m.compose(p3.set(l.x, world.heightAt(l.x, l.z) + 0.16, l.z), q, s3.set(1, 1, 1)); lines.setMatrixAt(i, m); });
  q.identity(); worldGroup.add(lines);
  // Muros bajos
  const W = world.walls;
  const walls2 = new THREE.InstancedMesh(box, lambert('#7d7a72'), W.length);
  W.forEach((b, i) => { m.compose(p3.set((b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2, (b.minZ + b.maxZ) / 2), q, s3.set(b.maxX - b.minX, b.maxY - b.minY, b.maxZ - b.minZ)); walls2.setMatrixAt(i, m); });
  worldGroup.add(walls2);
  // Torres de agua
  for (const t of world.towers) {
    const g = new THREE.Group(), base = t.minY + 1;
    for (const [dx, dz] of [[-1.2, -1.2], [1.2, -1.2], [-1.2, 1.2], [1.2, 1.2]]) { const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 9, 5), lambert('#3a3f48')); leg.position.set(dx, 4.5, dz); g.add(leg); }
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 3.6, 14), lambert('#c9c2b2')); tank.position.y = 10.6; g.add(tank);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(2.4, 1.4, 14), lambert('#8c3b2f')); roof.position.y = 13.1; g.add(roof);
    const light = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), new THREE.MeshBasicMaterial({ color: '#ff4040' })); light.position.y = 13.9; g.add(light);
    g.position.set(t.x, base, t.z); worldGroup.add(g);
  }
  // Estatua de la plaza de Meiker City: un stickman dorado gigante
  for (const st of world.statues) {
    const g = new THREE.Group(), gold = new THREE.MeshBasicMaterial({ color: '#F5B50A' });
    const ped = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.2, 2.4), lambert('#55575e')); ped.position.y = 0.6; g.add(ped);
    const seg = (x1, y1, x2, y2) => { const len = Math.hypot(x2 - x1, y2 - y1); const c = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, len, 6), gold); c.position.set((x1 + x2) / 2, (y1 + y2) / 2, 0); c.rotation.z = Math.atan2(x2 - x1, y2 - y1) * -1; g.add(c); };
    seg(0, 2.6, 0, 4); seg(0, 2.6, -0.4, 1.2); seg(0, 2.6, 0.4, 1.2); seg(0, 3.8, -0.8, 4.6); seg(0, 3.8, 0.8, 4.8);
    const hd = new THREE.Mesh(new THREE.SphereGeometry(0.35, 12, 10), gold); hd.position.y = 4.45; g.add(hd);
    g.position.set((st.minX + st.maxX) / 2, st.minY + 0.5, (st.minZ + st.maxZ) / 2); worldGroup.add(g);
  }
  // Letreros de neón flotando sobre cada zona
  for (const z of world.towns.concat(world.camps)) {
    const cv = document.createElement('canvas'); cv.width = 512; cv.height = 128; const g = cv.getContext('2d');
    g.font = '800 64px Outfit, system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.shadowColor = z.big ? '#F5B50A' : '#9fd3ff'; g.shadowBlur = 18; g.fillStyle = z.big ? '#ffd56a' : '#e8f4ff';
    g.fillText(z.name.toUpperCase(), 256, 64);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, depthWrite: false, fog: false }));
    const big = z.big === 2 ? 1.5 : 1;
    sp.scale.set(26 * big, 6.5 * big, 1); sp.position.set(z.x, (z.base != null ? z.base : world.heightAt(z.x, z.z)) + (z.big === 2 ? 30 : 20), z.z);
    worldGroup.add(sp);
  }
  // Zona
  zoneMesh = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 96, 1, true), new THREE.MeshBasicMaterial({ color: '#8b5cff', transparent: true, opacity: 0.2, side: THREE.DoubleSide, depthWrite: false }));
  zoneMesh.scale.set(SIZE, 900, SIZE); zoneMesh.position.y = 200;
  worldGroup.add(zoneMesh);
  nextZoneMesh = new THREE.Mesh(new THREE.RingGeometry(0.985, 1, 96), new THREE.MeshBasicMaterial({ color: '#F5B50A', transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false }));
  nextZoneMesh.rotation.x = -Math.PI / 2;
  worldGroup.add(nextZoneMesh);
  // Avión
  planeMesh = new THREE.Group();
  const fus = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 1.6, 22, 10), lambert('#f2f2f0')); fus.rotation.x = Math.PI / 2; planeMesh.add(fus);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(2.2, 4, 10), lambert('#F5B50A')); nose.rotation.x = -Math.PI / 2; nose.position.z = -13; planeMesh.add(nose);
  const wing = new THREE.Mesh(new THREE.BoxGeometry(30, 0.5, 4.5), lambert('#F5B50A')); wing.position.z = -1; planeMesh.add(wing);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.5, 5, 3.5), lambert('#F5B50A')); tail.position.set(0, 2.8, 9.5); planeMesh.add(tail);
  const tailw = new THREE.Mesh(new THREE.BoxGeometry(10, 0.4, 2.5), lambert('#f2f2f0')); tailw.position.set(0, 1, 9.5); planeMesh.add(tailw);
  planeMesh.visible = false;
  worldGroup.add(planeMesh);
  scene.add(worldGroup);
  // Imagen del mapa
  mapImg = document.createElement('canvas'); mapImg.width = mapImg.height = 256;
  const mc = mapImg.getContext('2d'), img = mc.createImageData(256, 256);
  for (let j = 0; j < 256; j++) for (let i = 0; i < 256; i++) {
    const h = world.heightAt((i + 0.5) / 256 * SIZE, (j + 0.5) / 256 * SIZE);
    if (h < 0.2) c.set('#1d4f7a'); else if (h < 1.6) c.copy(sand); else if (h > 38) c.copy(rock); else c.copy(grassA).lerp(grassB, clamp((h - 2) / 34, 0, 1));
    const k = (j * 256 + i) * 4; img.data[k] = c.r * 255; img.data[k + 1] = c.g * 255; img.data[k + 2] = c.b * 255; img.data[k + 3] = 255;
  }
  mc.putImageData(img, 0, 0);
  mc.strokeStyle = '#3a3c44'; mc.lineWidth = 2.5;
  for (const rd of world.roads) { mc.beginPath(); mc.moveTo(rd.ax / SIZE * 256, rd.az / SIZE * 256); mc.lineTo(rd.bx / SIZE * 256, rd.bz / SIZE * 256); mc.stroke(); }
  mc.fillStyle = '#c9a86a';
  for (const b of C) mc.fillRect(b.minX / SIZE * 256 - 0.5, b.minZ / SIZE * 256 - 0.5, 2, 2);
  mc.fillStyle = '#e9dcc4';
  for (const b of B) mc.fillRect(b.minX / SIZE * 256, b.minZ / SIZE * 256, Math.max(1.5, (b.maxX - b.minX) / SIZE * 256), Math.max(1.5, (b.maxZ - b.minZ) / SIZE * 256));
}

/* ---------- Personajes: stickman v2 ---------- */
// Palitos que brillan con el color del equipo, cabeza clara con bandana, manos, pies y articulaciones
const GEO = {
  head: new THREE.SphereGeometry(0.22, 14, 12), seg: new THREE.CylinderGeometry(0.07, 0.07, 1, 8), joint: new THREE.SphereGeometry(0.085, 8, 6),
  hand: new THREE.SphereGeometry(0.07, 8, 6), foot: new THREE.BoxGeometry(0.13, 0.08, 0.24),
  band: new THREE.TorusGeometry(0.205, 0.04, 6, 18), tail: new THREE.BoxGeometry(0.05, 0.03, 0.28), eye: new THREE.BoxGeometry(0.05, 0.08, 0.03),
  flash: new THREE.SphereGeometry(0.16, 6, 4), chute: new THREE.SphereGeometry(2.3, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2.4),
  bubble: new THREE.SphereGeometry(1.15, 16, 12), shadow: new THREE.CircleGeometry(0.5, 16).rotateX(-Math.PI / 2), halo: new THREE.PlaneGeometry(1, 1),
  box: new THREE.BoxGeometry(1, 1, 1),
};
const flashMat = new THREE.MeshBasicMaterial({ color: '#ffe08a' });
const bubbleMat = new THREE.MeshBasicMaterial({ color: '#8ec9ff', transparent: true, opacity: 0.18, depthWrite: false });
const shadowMat = new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.45, depthWrite: false });
const darkMat = new THREE.MeshBasicMaterial({ color: '#0E0E10' });
const gunMat = new THREE.MeshBasicMaterial({ color: '#2b2d33' }), gunAccent = new THREE.MeshBasicMaterial({ color: '#F5B50A' }), gunWood = new THREE.MeshBasicMaterial({ color: '#6b4a2e' });
const haloTex = (() => { const cv = document.createElement('canvas'); cv.width = cv.height = 64; const g = cv.getContext('2d'); const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(cv); })();
// Modelo de cada arma (cajas simples): [ancho, alto, largo, x, y, z, material]
const GUN_PARTS = [
  [[0.07, 0.11, 0.3, 0, 0, -0.18, gunMat], [0.06, 0.14, 0.07, 0, -0.1, -0.06, gunMat]],
  [[0.08, 0.12, 0.48, 0, 0, -0.26, gunMat], [0.05, 0.18, 0.06, 0, -0.13, -0.24, gunMat], [0.06, 0.12, 0.07, 0, -0.1, -0.06, gunMat]],
  [[0.09, 0.1, 0.75, 0, 0, -0.38, gunMat], [0.1, 0.08, 0.3, 0, -0.08, -0.38, gunWood], [0.08, 0.14, 0.22, 0, -0.04, 0.05, gunWood]],
  [[0.08, 0.12, 0.72, 0, 0, -0.36, gunMat], [0.05, 0.2, 0.07, 0, -0.15, -0.3, gunMat], [0.07, 0.14, 0.22, 0, -0.03, 0.06, gunMat], [0.03, 0.05, 0.12, 0, 0.09, -0.3, gunAccent]],
  [[0.07, 0.09, 1.05, 0, 0, -0.52, gunMat], [0.06, 0.08, 0.3, 0, 0.11, -0.3, gunAccent], [0.08, 0.15, 0.25, 0, -0.04, 0.07, gunWood]],
];
const TMP_Q = new THREE.Quaternion(), TMP_E = new THREE.Euler();
class Avatar {
  constructor(color) {
    const g = this.g = new THREE.Group();
    this.color = new THREE.Color(color);
    const mat = this.mat = new THREE.MeshBasicMaterial({ color });
    const skin = this.skin = new THREE.MeshBasicMaterial({ color: '#f4efe6' });
    const bone = (len) => { const m = new THREE.Mesh(GEO.seg, mat); m.scale.y = len; m.position.y = -len / 2; return m; };
    const halo = new THREE.Mesh(GEO.halo, new THREE.MeshBasicMaterial({ map: haloTex, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    halo.scale.set(2.2, 2.6, 1); halo.position.y = 1.05; this.halo = halo; g.add(halo);
    const sh = this.shadow = new THREE.Mesh(GEO.shadow, shadowMat); sh.position.y = 0.04; g.add(sh);
    this.body = new THREE.Group(); this.body.position.y = 0.92; g.add(this.body);
    const spine = new THREE.Mesh(GEO.seg, mat); spine.scale.set(1.2, 0.56, 1.2); spine.position.y = 0.28; this.body.add(spine);
    const chest = new THREE.Mesh(GEO.joint, mat); chest.position.y = 0.5; chest.scale.set(1.4, 1, 1.2); this.body.add(chest);
    const hip = new THREE.Mesh(GEO.joint, mat); hip.scale.set(1.3, 1, 1.1); this.body.add(hip);
    // Cabeza con bandana y ojos
    const head = this.head = new THREE.Group(); head.position.y = 0.8; this.body.add(head);
    head.add(new THREE.Mesh(GEO.head, skin));
    const band = new THREE.Mesh(GEO.band, mat); band.rotation.x = Math.PI / 2; band.position.y = 0.06; head.add(band);
    for (const [x, ry] of [[-0.04, 0.35], [0.04, -0.2]]) { const t = new THREE.Mesh(GEO.tail, mat); t.position.set(x, 0.04, 0.3); t.rotation.set(-0.5, ry, 0); head.add(t); }
    for (const x of [-0.07, 0.07]) { const e = new THREE.Mesh(GEO.eye, darkMat); e.position.set(x, 0.0, -0.205); head.add(e); }
    const leg = (x) => {
      const thigh = new THREE.Group(); thigh.position.set(x, 0, 0); thigh.add(bone(0.46));
      const knee = new THREE.Group(); knee.position.y = -0.46; knee.add(bone(0.46)); knee.add(new THREE.Mesh(GEO.joint, mat));
      const foot = new THREE.Mesh(GEO.foot, darkMat); foot.position.set(0, -0.47, -0.05); knee.add(foot);
      thigh.add(knee); this.body.add(thigh); return { thigh, knee };
    };
    const arm = (x) => {
      const up = new THREE.Group(); up.position.set(x, 0.5, 0); up.add(bone(0.32)); up.add(new THREE.Mesh(GEO.joint, mat));
      const el = new THREE.Group(); el.position.y = -0.32; el.add(bone(0.3)); el.add(new THREE.Mesh(GEO.joint, mat));
      const hand = new THREE.Mesh(GEO.hand, skin); hand.position.y = -0.31; el.add(hand);
      up.add(el); this.body.add(up); return { up, el };
    };
    this.legL = leg(-0.1); this.legR = leg(0.1); this.armL = arm(-0.15); this.armR = arm(0.15);
    this.gun = new THREE.Group(); this.gun.position.set(0.1, 0.46, -0.3); this.body.add(this.gun);
    this.gunModel = null; this.gunIdx = -2;
    this.flash = new THREE.Mesh(GEO.flash, flashMat); this.flash.visible = false; this.gun.add(this.flash);
    this.chute = new THREE.Mesh(GEO.chute, lambert(color, { side: THREE.DoubleSide })); this.chute.position.y = 4.4; this.chute.visible = false; g.add(this.chute);
    this.bubble = new THREE.Mesh(GEO.bubble, bubbleMat); this.bubble.position.y = 0.95; this.bubble.visible = false; g.add(this.bubble);
    scene.add(g);
    this.flashT = 0; this.hurtT = 0; this.dying = 0;
  }
  setGun(w) {
    if (this.gunIdx === w) return;
    this.gunIdx = w;
    if (this.gunModel) this.gun.remove(this.gunModel);
    this.gunModel = null;
    if (w < 0) return;
    const grp = new THREE.Group();
    for (const [sx, sy, sz, x, y, z, m] of GUN_PARTS[w]) { const b = new THREE.Mesh(GEO.box, m); b.scale.set(sx, sy, sz); b.position.set(x, y, z); grp.add(b); }
    this.gun.add(grp); this.gunModel = grp;
    this.flash.position.z = -(GUN_PARTS[w][0][2] + 0.1);
  }
  hurt() { this.hurtT = 0.12; }
  die() { this.dying = 1.6; this.body.rotation.set(0, 0, 0); }
  update(f, dt) {
    const g = this.g;
    // Animación de caída al morir
    if (!f.alive) {
      if (this.dying > 0) {
        this.dying -= dt;
        const k = clamp(1 - (this.dying - 0.6) / 1, 0, 1);
        this.body.rotation.x = k * 1.45; this.body.position.y = 0.92 - k * 0.65;
        this.armL.up.rotation.set(-1.2 * k, 0, -0.9 * k); this.armR.up.rotation.set(-1.2 * k, 0, 0.9 * k);
        this.halo.visible = false; this.gun.visible = false; this.bubble.visible = false;
        g.visible = this.dying > 0.05;
      } else g.visible = false;
      return;
    }
    g.visible = true;
    this.halo.visible = true;
    this.shadow.visible = f.ph === PH.GROUND;
    g.position.set(f.x, f.y, f.z);
    g.rotation.set(0, f.yaw, 0);
    TMP_E.set(0, -f.yaw, 0); TMP_Q.setFromEuler(TMP_E);
    this.halo.quaternion.copy(camera.quaternion).premultiply(TMP_Q);
    this.bubble.visible = !!f.prot;
    // Destello blanco al recibir daño
    if (this.hurtT > 0) { this.hurtT -= dt; this.mat.color.set('#ffffff'); } else this.mat.color.copy(this.color);
    const sp = Math.hypot(f.vx || 0, f.vz || 0);
    this.chute.visible = f.ph === PH.CHUTE;
    this.gun.visible = f.ph === PH.GROUND && f.w >= 0;
    this.setGun(f.w);
    const { legL, legR, armL, armR } = this;
    this.body.rotation.z = 0;
    if (f.ph === PH.PLANE) {
      // Volando: horizontal, un puño adelante
      this.body.rotation.x = -1.35; this.body.position.y = 1.1 + Math.sin(G.time * 3) * 0.08;
      legL.thigh.rotation.set(0.1, 0, -0.05); legR.thigh.rotation.set(0.25, 0, 0.05); legL.knee.rotation.x = 0.05; legR.knee.rotation.x = 0.35;
      armR.up.rotation.set(Math.PI - 0.1, 0, 0); armR.el.rotation.x = 0; armL.up.rotation.set(0.3, 0, -0.5); armL.el.rotation.x = 0.6;
      this.head.rotation.x = 0.9;
      return;
    }
    if (f.ph === PH.FALL || f.ph === PH.CHUTE) {
      // Cayendo como el hombre verde: piernas recogidas, brazos arriba
      this.body.rotation.x = 0.15; this.body.position.y = 0.92;
      legL.thigh.rotation.set(-0.9, 0, -0.3); legR.thigh.rotation.set(-0.5, 0, 0.3); legL.knee.rotation.x = 1.3; legR.knee.rotation.x = 1.0;
      armL.up.rotation.set(Math.PI * 0.85, 0, -0.5); armR.up.rotation.set(Math.PI * 0.85, 0, 0.5); armL.el.rotation.x = armR.el.rotation.x = 0.3;
      this.head.rotation.x = -0.4;
      return;
    }
    if (this.landT > 0) {
      // Aterrizaje: rodilla al piso y puño en el suelo
      this.landT -= dt;
      this.body.rotation.x = -0.35; this.body.position.y = 0.5;
      legL.thigh.rotation.set(-1.4, 0, 0); legL.knee.rotation.x = 1.5; legR.thigh.rotation.set(0.6, 0, 0); legR.knee.rotation.x = 1.6;
      armR.up.rotation.set(0.5, 0, 0.1); armR.el.rotation.x = 0.2; armL.up.rotation.set(-0.4, 0, -0.6); armL.el.rotation.x = 0.4;
      this.head.rotation.x = 0.3; this.gun.visible = false;
      return;
    }
    if (f.sit) {
      // Sentado en el carro: el conductor con las manos al volante
      this.body.rotation.x = 0; this.body.position.y = 0.45;
      legL.thigh.rotation.set(-1.45, 0, -0.08); legR.thigh.rotation.set(-1.45, 0, 0.08); legL.knee.rotation.x = legR.knee.rotation.x = 1.45;
      this.head.rotation.x = (f.pitch || 0) * 0.4;
      if (!this.gun.visible) { armL.up.rotation.set(1.1, 0, 0.2); armR.up.rotation.set(1.1, 0, -0.2); armL.el.rotation.set(0.4, 0, 0); armR.el.rotation.set(0.4, 0, 0); return; }
    }
    const moving = !f.sit && f.grounded !== false && sp > 0.5, sprint = sp > 7;
    const ph = (f.run || 0) * (sprint ? 2.0 : 2.6), amp = moving ? Math.min(1, sp / 5) : 0;
    // Se inclina hacia adelante al correr
    this.body.rotation.x = sprint ? -0.22 : moving ? -0.08 : 0;
    if (f.sit) { /* piernas ya puestas */ }
    else if (f.grounded === false) {
      legL.thigh.rotation.set(-0.7, 0, 0); legR.thigh.rotation.set(0.35, 0, 0); legL.knee.rotation.x = 1.2; legR.knee.rotation.x = 0.6;
    } else {
      const sw = sprint ? 0.95 : 0.75;
      legL.thigh.rotation.set(Math.sin(ph) * sw * amp, 0, 0); legR.thigh.rotation.set(-Math.sin(ph) * sw * amp, 0, 0);
      legL.knee.rotation.x = Math.max(0, -Math.cos(ph)) * 1.2 * amp + 0.06; legR.knee.rotation.x = Math.max(0, Math.cos(ph)) * 1.2 * amp + 0.06;
    }
    if (!f.sit) this.body.position.y = 0.92 + (moving ? Math.abs(Math.sin(ph)) * 0.06 : Math.sin(G.time * 2) * 0.008);
    else this.body.rotation.x = 0;
    const p = f.pitch || 0;
    this.head.rotation.x = p * 0.5;
    if (this.gun.visible) {
      // Brazos sosteniendo el arma hacia donde apunta
      const big = f.w >= 2;
      armR.up.rotation.set(Math.PI / 2 + p - 0.35, 0, 0); armR.el.rotation.x = 0.35;
      armL.up.rotation.set(Math.PI / 2 + p - (big ? 0.05 : 0.2), 0, 0.55); armL.el.rotation.set(big ? 0.25 : 0.5, 0, -0.55);
      this.gun.rotation.set(p, 0, 0);
      if (f.reloading) { this.gun.rotation.x = p - 0.7; this.gun.rotation.z = 0.4; } else this.gun.rotation.z = 0;
    } else {
      armL.up.rotation.set(-Math.sin(ph) * 0.7 * amp, 0, -0.15); armR.up.rotation.set(Math.sin(ph) * 0.7 * amp, 0, 0.15);
      armL.el.rotation.x = armR.el.rotation.x = 0.35;
    }
    if (this.flashT > 0) { this.flashT -= dt; this.flash.visible = true; this.flash.scale.setScalar(0.7 + Math.random() * 0.8); } else this.flash.visible = false;
  }
  dispose() { scene.remove(this.g); }
}

/* ---------- Vehículos ---------- */
const VCOL = [['#4f5d2f', '#F5B50A'], ['#d4502a', '#1d1f24']];
class VehicleMesh {
  constructor(type) {
    const g = this.g = new THREE.Group(), jeep = type === 0;
    const [main, acc] = VCOL[type];
    const body = new THREE.Mesh(GEO.box, lambert(main)); body.scale.set(jeep ? 2.1 : 1.8, jeep ? 0.75 : 0.5, jeep ? 4.2 : 3.2); body.position.y = jeep ? 0.85 : 0.65; g.add(body);
    const hood = new THREE.Mesh(GEO.box, lambert(acc)); hood.scale.set(jeep ? 2.0 : 1.4, 0.08, jeep ? 1.1 : 0.9); hood.position.set(0, jeep ? 1.25 : 0.93, jeep ? -1.4 : -1.0); g.add(hood);
    // Barra antivuelco y parabrisas
    const bar = lambert('#222428');
    for (const x of [-0.85, 0.85]) { const p = new THREE.Mesh(GEO.box, bar); p.scale.set(0.09, 1.0, 0.09); p.position.set(x * (jeep ? 1 : 0.8), jeep ? 1.7 : 1.4, jeep ? 0.5 : 0.35); g.add(p); }
    const top = new THREE.Mesh(GEO.box, bar); top.scale.set(jeep ? 1.8 : 1.45, 0.09, 0.09); top.position.set(0, jeep ? 2.2 : 1.9, jeep ? 0.5 : 0.35); g.add(top);
    const glass = new THREE.Mesh(GEO.box, new THREE.MeshBasicMaterial({ color: '#9fd3ff', transparent: true, opacity: 0.25 })); glass.scale.set(jeep ? 1.9 : 1.5, 0.6, 0.05); glass.position.set(0, jeep ? 1.55 : 1.2, jeep ? -0.75 : -0.55); glass.rotation.x = -0.3; g.add(glass);
    // Llantas
    this.wheels = [];
    const wg = new THREE.CylinderGeometry(jeep ? 0.45 : 0.42, jeep ? 0.45 : 0.42, jeep ? 0.35 : 0.42, 12); wg.rotateZ(Math.PI / 2);
    const wm = lambert('#141518');
    for (const [x, z] of jeep ? [[-1.05, -1.35], [1.05, -1.35], [-1.05, 1.35], [1.05, 1.35]] : [[-0.98, -1.05], [0.98, -1.05], [-0.98, 1.05], [0.98, 1.05]]) {
      const w = new THREE.Mesh(wg, wm); w.position.set(x, jeep ? 0.45 : 0.42, z); g.add(w); this.wheels.push(w);
    }
    // Luces delanteras y traseras + haz de luz en el piso
    const hl = new THREE.MeshBasicMaterial({ color: '#fff3c4' }), tl = new THREE.MeshBasicMaterial({ color: '#ff3a3a' });
    for (const x of [-0.6, 0.6]) {
      const h = new THREE.Mesh(GEO.box, hl); h.scale.set(0.3, 0.16, 0.06); h.position.set(x, jeep ? 1.05 : 0.75, jeep ? -2.12 : -1.62); g.add(h);
      const t = new THREE.Mesh(GEO.box, tl); t.scale.set(0.26, 0.12, 0.06); t.position.set(x, jeep ? 1.0 : 0.7, jeep ? 2.12 : 1.62); g.add(t);
    }
    const beam = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: GLOW_TEX, color: '#fff1c4', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    beam.scale.set(7, 1, 12); beam.position.set(0, 0.12, jeep ? -8 : -7); g.add(beam);
    scene.add(g);
  }
  update(v, dt) {
    this.g.position.set(v.x, v.y, v.z);
    this.g.rotation.set(0, v.yaw, 0);
    // Inclina el carro según la pendiente
    if (world) {
      const fx = -Math.sin(v.yaw), fz = -Math.cos(v.yaw);
      const hf = world.heightAt(v.x + fx * 1.5, v.z + fz * 1.5), hb = world.heightAt(v.x - fx * 1.5, v.z - fz * 1.5);
      this.g.rotation.x = Math.atan2(hf - hb, 3) ;
    }
    for (const w of this.wheels) w.rotation.x -= (v.speed || 0) * dt / 0.45;
  }
  dispose() { scene.remove(this.g); }
}
const GLOW_TEX = (() => { const cv = document.createElement('canvas'); cv.width = cv.height = 64; const g = cv.getContext('2d'); const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(cv); })();
// Motor: un zumbido que sube de tono con la velocidad
const engine = { osc: null, gain: null };
function engineSound(speed, on) {
  if (!AC.ctx || !settings.sound) { if (engine.gain) engine.gain.gain.value = 0; return; }
  if (!engine.osc) {
    engine.osc = AC.ctx.createOscillator(); engine.osc.type = 'sawtooth';
    const f = AC.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 600;
    engine.gain = AC.ctx.createGain(); engine.gain.gain.value = 0;
    engine.osc.connect(f); f.connect(engine.gain); engine.gain.connect(AC.out); engine.osc.start();
  }
  engine.osc.frequency.value = 45 + Math.abs(speed) * 5.5;
  engine.gain.gain.value = on ? 0.05 + Math.min(0.06, Math.abs(speed) * 0.003) : 0;
}

/* ---------- Botín ---------- */
const lootMeshes = {};
function initLootMeshes() {
  const mk = (geo, color, n) => { const im = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color }), n); im.count = 0; im.frustumCulled = false; scene.add(im); return im; };
  lootMeshes.w = mk(new THREE.BoxGeometry(0.9, 0.28, 0.28), '#F5B50A', 900);
  lootMeshes.m = mk(new THREE.BoxGeometry(0.5, 0.38, 0.5), '#3DDC84', 600);
  lootMeshes.s = mk(new THREE.CylinderGeometry(0.28, 0.28, 0.45, 10), '#6fb8ff', 600);
  lootMeshes.a = mk(new THREE.BoxGeometry(0.55, 0.32, 0.4), '#8a8f5a', 600);
}
initLootMeshes();
let lootDirty = true;
function rebuildLoot() {
  lootDirty = false;
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
  const n = { w: 0, m: 0, s: 0, a: 0 };
  for (const it of G.items.values()) {
    const cat = it.k < 10 ? 'w' : it.k === LOOT.MED ? 'm' : it.k === LOOT.SHIELD ? 's' : 'a';
    const im = lootMeshes[cat]; if (n[cat] >= im.instanceMatrix.count) continue;
    e.set(0, (it.id * 1.7) % 6.28, 0); q.setFromEuler(e);
    m.compose(p.set(it.x, it.y + 0.35, it.z), q, s);
    im.setMatrixAt(n[cat]++, m);
  }
  for (const k in lootMeshes) { lootMeshes[k].count = n[k]; lootMeshes[k].instanceMatrix.needsUpdate = true; }
}

/* ---------- Trazadoras ---------- */
const MAX_TR = 160;
const trGeo = new THREE.BufferGeometry();
const trPos = new Float32Array(MAX_TR * 6), trCol = new Float32Array(MAX_TR * 6);
trGeo.setAttribute('position', new THREE.BufferAttribute(trPos, 3));
trGeo.setAttribute('color', new THREE.BufferAttribute(trCol, 3));
const tracers = new THREE.LineSegments(trGeo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
tracers.frustumCulled = false;
scene.add(tracers);
const trList = [];
function addTracer(ox, oy, oz, dx, dy, dz, len, sniper) {
  if (trList.length >= MAX_TR) trList.shift();
  trList.push({ a: [ox + dx * 0.9, oy + dy * 0.9, oz + dz * 0.9], b: [ox + dx * len, oy + dy * len, oz + dz * len], life: sniper ? 0.35 : 0.12, max: sniper ? 0.35 : 0.12 });
}
function updateTracers(dt) {
  for (let i = trList.length - 1; i >= 0; i--) { trList[i].life -= dt; if (trList[i].life <= 0) trList.splice(i, 1); }
  for (let i = 0; i < MAX_TR; i++) {
    const t = trList[i];
    if (t) {
      trPos.set(t.a, i * 6); trPos.set(t.b, i * 6 + 3);
      const k = t.life / t.max;
      trCol.set([1 * k, 0.85 * k, 0.45 * k, 1 * k, 0.95 * k, 0.7 * k], i * 6);
    } else { trPos.fill(0, i * 6, i * 6 + 6); }
  }
  trGeo.attributes.position.needsUpdate = true; trGeo.attributes.color.needsUpdate = true;
}

/* ---------- Estado ---------- */
const G = {
  screen: 'menu', session: null, myId: null, me: null, ents: new Map(), avatars: new Map(), items: new Map(), roster: new Map(),
  plane: null, planeT: 0, planeT0: 0, snapAt: 0, st: 0, alive: 20, aliveTeams: 20, zone: null, mode: 'solo', inMatch: false,
  spectate: null, deadAt: 0, killer: '', texts: [], hurt: 0, hitMark: 0, hitHead: false, dmgDirs: [], time: 0, ping: null,
  matchStart: 0, lobby: null, myTeam: -1, results: false, mapBig: false,
  vehicles: new Map(), myCar: null,
};

/* ---------- Sesiones ---------- */
function offlineSession(opts) {
  const match = new BR.Match({ mode: opts.mode, diff: opts.diff, humans: [{ id: 1, name: opts.name }] });
  return {
    kind: 'offline', myId: 1, match,
    update(dt) {
      if (G.paused || G.loading) return;
      const me = G.me;
      if (me && me.alive) match.onState(1, stateMsg());
      match.update(dt);
      onSnapshot(match.snapshot(G.myTeam >= 0 ? G.myTeam : null), match.drain());
    },
    send(m) {
      if (m.t === 'fire') match.onFire(1, m); else if (m.t === 'pick') match.onPick(1, m);
      else if (m.t === 'use') match.onUse(1, m); else if (m.t === 'slot') match.onSlot(1, m); else if (m.t === 'reload') match.onReload(1); else if (m.t === 'veh') match.onVeh(1, m);
    },
    close() {},
  };
}
// Conexión online con reconexión automática: si se cae el internet, vuelve a entrar con el mismo jugador
function onlineSession(kind, payload) {
  return new Promise((resolve, reject) => {
    if (location.protocol === 'file:') return reject(new Error('Para jugar online abre el juego desde el servidor.'));
    const url = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws';
    let welcomedOnce = false, sendT = 0, pingT = 0;
    const sess = {
      kind: 'online', ws: null, myId: null, code: null, token: payload.token || null, closed: false, retries: 0, lastMsg: performance.now(),
      update(dt) {
        const ws = sess.ws;
        sendT += dt; pingT += dt;
        if (!ws || ws.readyState !== 1) return;
        if (sendT >= 1 / 20 && G.me && G.me.alive && G.screen === 'match') { sendT = 0; ws.send(JSON.stringify(Object.assign({ t: 'st' }, stateMsg()))); }
        if (pingT > 2) { pingT = 0; ws.send(JSON.stringify({ t: 'ping', c: performance.now() })); }
        // Sin noticias del servidor por 5 s (red móvil que cambió): fuerza la reconexión
        const quiet = performance.now() - sess.lastMsg;
        G.netBad = quiet > 1500;
        if (quiet > 5000) { try { ws.close(); } catch (_) {} }
      },
      send(m) { if (sess.ws && sess.ws.readyState === 1) sess.ws.send(JSON.stringify(m)); },
      close() { sess.closed = true; G.reconnecting = false; show('reconnect', false); try { sess.ws.send(JSON.stringify({ t: 'leave' })); } catch (_) {} try { sess.ws.close(); } catch (_) {} },
    };
    const timer = setTimeout(() => { if (!welcomedOnce) { sess.closed = true; try { sess.ws.close(); } catch (_) {} reject(new Error('El servidor no respondió. En Render gratis puede tardar ~50 s en despertar: inténtalo otra vez.')); } }, 25000);
    function connect(first) {
      const ws = new WebSocket(url);
      sess.ws = ws;
      ws.onopen = () => {
        sess.lastMsg = performance.now();
        if (first) ws.send(JSON.stringify(Object.assign({ t: kind }, payload)));
        else ws.send(JSON.stringify({ t: 'join', code: sess.code, name: payload.name, token: sess.token }));
      };
      ws.onmessage = (ev) => {
        if (sess.ws !== ws) return;
        sess.lastMsg = performance.now();
        let m; try { m = JSON.parse(ev.data); } catch (_) { return; }
        if (m.t === 'welcome') {
          sess.myId = m.id; sess.code = m.code; sess.token = m.token; sess.retries = 0;
          try { sessionStorage.setItem('meiker-room', JSON.stringify({ code: m.code, token: m.token })); } catch (_) {}
          if (!welcomedOnce) {
            welcomedOnce = true; clearTimeout(timer);
            if (G.session && G.session !== sess) G.session.close();
            G.session = sess; G.myId = m.id; G.code = m.code;
            resolve(sess);
          } else { G.reconnecting = false; show('reconnect', false); toast('Listo, volviste a la partida'); }
          return;
        }
        if (m.t === 'err') {
          if (!welcomedOnce) { clearTimeout(timer); sess.closed = true; ws.close(); reject(new Error(m.msg)); }
          else { sess.closed = true; ws.close(); backToMenu('La sala ya no existe. Crea una nueva o pide otro código.', true); }
          return;
        }
        if (G.session !== sess) return;
        if (m.t === 'lobby') onLobby(m);
        else if (m.t === 's') onSnapshot(m, m.ev || []);
        else if (m.t === 'spectate') startMatchView(m.start, true);
        else if (m.t === 'resume') {
          if (G.inMatch && world && world.seed === (m.start.seed >>> 0) && G.me) {
            G.items.clear(); for (const l of m.start.loot) G.items.set(l[0], { id: l[0], k: l[1], x: l[2], y: l[3], z: l[4], a: l[5] }); lootDirty = true;
          } else startMatchView(m.start, false);
        }
        else if (m.t === 'pong') G.ping = Math.round(performance.now() - m.c);
      };
      ws.onerror = () => {};
      ws.onclose = () => {
        if (sess.ws !== ws || sess.closed) return;
        if (!welcomedOnce) { if (first) { clearTimeout(timer); reject(new Error('Uy, no pudimos conectar con el servidor. Revisa tu internet e inténtalo otra vez.')); } return; }
        if (G.session !== sess) return;
        if (sess.retries >= 15) { backToMenu('Uy, se cayó la conexión. Revisa tu internet y vuelve a entrar con el código ' + sess.code + '.', true, sess.code); return; }
        G.reconnecting = true; show('reconnect', true);
        $('reconnectText').textContent = 'Reconectando… intento ' + (sess.retries + 1);
        setTimeout(() => { if (!sess.closed && G.session === sess) connect(false); }, Math.min(3000, 500 + sess.retries * 400));
        sess.retries++;
      };
    }
    connect(true);
  });
}

/* ---------- Pantallas ---------- */
function show(el, on) { (typeof el === 'string' ? $(el) : el).classList.toggle('hidden', !on); }
let wakeLock = null;
async function keepAwake(on) {
  try {
    if (on && !wakeLock && navigator.wakeLock) { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => { wakeLock = null; }); }
    else if (!on && wakeLock) { await wakeLock.release(); wakeLock = null; }
  } catch (_) {}
}
document.addEventListener('visibilitychange', () => { if (!document.hidden && (G.screen === 'match' || G.screen === 'lobby')) keepAwake(true); });
function setScreen(s) {
  G.screen = s;
  keepAwake(s === 'match' || s === 'lobby');
  show('menu', s === 'menu'); show('lobby', s === 'lobby');
  show('hud', s === 'match'); show('touch', s === 'match' && isTouch);
  if (s !== 'match') { show('pause', false); setMapBig(false); if (document.pointerLockElement) document.exitPointerLock(); }
  checkRotate();
}
function setNote(text, err) { const n = $('menuNote'); n.textContent = text; n.classList.toggle('err', !!err); }

async function startFromMenu() {
  audioInit();
  const name = ($('nameInput').value || '').trim().slice(0, 14);
  settings.name = name; save();
  if (isTouch) goFullscreen();
  const opts = { name: name || 'Jugador', mode: settings.mode, diff: settings.diff };
  if (currentTab === 'solo') {
    if (G.session) G.session.close();
    const sess = offlineSession(opts);
    G.session = sess; G.myId = 1; G.code = null;
    onSnapshot(sess.match.snapshot(), sess.match.drain());
    return;
  }
  const code = $('codeInput').value.trim().toUpperCase();
  let token = null;
  try { const saved = JSON.parse(sessionStorage.getItem('meiker-room') || 'null'); if (saved && saved.code === code) token = saved.token; } catch (_) {}
  if (currentTab === 'join' && code.length < 4) { setNote('Escribe el código de 4 letras que te pasó tu parcero.', true); return; }
  show('loading', true);
  $('loadingText').textContent = currentTab === 'join' ? 'Entrando a la sala ' + code + '…' : 'Creando tu sala…';
  try {
    const sess = await onlineSession(currentTab === 'join' ? 'join' : 'create', currentTab === 'join' ? { name: opts.name, code, token } : opts);
    try { history.replaceState(null, '', '/?sala=' + sess.code); } catch (_) {}
    if (G.screen === 'menu') setScreen('lobby');
  } catch (err) { setNote(err.message, true); }
  finally { show('loading', false); }
}
function backToMenu(msg, err, code) {
  if (G.session) G.session.close();
  G.session = null; clearMatch();
  setScreen('menu'); show('results', false);
  try { history.replaceState(null, '', '/'); } catch (_) {}
  if (msg) { setNote(msg, err); if (code) { $('codeInput').value = code; setTab('join'); } }
  else setTab(currentTab);
  startBackdrop();
}

/* ---------- Lobby ---------- */
function onLobby(m) {
  G.lobby = m;
  const host = m.host === G.myId;
  $('lobbyCode').textContent = m.code;
  $('lobbyMode').classList.toggle('locked', !host); $('lobbyDiff').classList.toggle('locked', !host);
  $('lobbyMode').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.v === m.mode));
  $('lobbyDiff').querySelectorAll('button').forEach(b => b.classList.toggle('on', +b.dataset.v === m.diff));
  const per = m.mode === 'duo' ? 2 : 1;
  $('plist').innerHTML = m.players.map((p, i) => `<li class="${p.id === G.myId ? 'me' : ''}">${p.id === m.host ? '<svg class="ic"><use href="#i-crown"/></svg>' : '<svg class="ic"><use href="#i-user"/></svg>'}${esc(p.name)}${p.id === G.myId ? ' (tú)' : ''}<span class="team">${per > 1 ? 'Equipo ' + (Math.floor(i / per) + 1) : ''}</span></li>`).join('') +
    `<li class="bots"><svg class="ic"><use href="#i-bot"/></svg>+ ${Math.max(0, 20 - m.players.length)} bots</li>`;
  $('lobbyCount').textContent = m.players.length + ' / 20';
  $('startBtn').hidden = !host || m.inMatch;
  $('lobbyNote').textContent = m.inMatch ? 'Hay una partida en curso. Entras en la siguiente; mientras tanto puedes verla.' :
    host ? (m.mode === 'duo' ? 'Dúo: los jugadores van en parejas según el orden de la lista. Los cupos libres se llenan con bots.' : 'Los cupos que falten hasta 20 se llenan con bots. Dale cuando estén todos.') :
      'Esperando a que el anfitrión inicie la partida.';
  if (!m.inMatch && G.screen === 'match' && !G.results) { setScreen('lobby'); startBackdrop(); }
  if (!m.inMatch && G.screen === 'match' && G.results) { /* se queda viendo resultados */ }
  if (G.screen === 'menu') setScreen('lobby');
}

/* ---------- Partida ---------- */
function clearMatch() {
  for (const a of G.avatars.values()) a.dispose();
  for (const v of G.vehicles.values()) v.mesh.dispose();
  G.vehicles.clear(); G.myCar = null; engineSound(0, false);
  G.avatars.clear(); G.ents.clear(); G.items.clear(); G.roster.clear(); lootDirty = true;
  G.me = null; G.plane = null; G.inMatch = false; G.spectate = null; G.results = false; G.texts = []; trList.length = 0;
  feedEl.innerHTML = ''; toastsEl.innerHTML = '';
  if (planeMesh) planeMesh.visible = false;
}
const TIPS = ['Empiezas volando: escoge bien dónde caer', 'Meiker City tiene el mejor botín (y más rivales)', 'Toca tu arma para recargar, la otra para cambiar', 'Los carros sirven para huir de la zona', 'Con la mira el disparo es mucho más preciso', 'En dúo, tu compañero puede disparar desde el carro'];
function showLoading(ms) {
  const el = $('loadScreen'); el.classList.remove('out'); show(el, true);
  $('lsTip').textContent = TIPS[Math.floor(Math.random() * TIPS.length)];
  G.loading = true;
  const t0 = performance.now();
  const step = () => {
    const k = Math.min(1, (performance.now() - t0) / ms);
    $('lsFill').style.width = Math.round(k * 100) + '%';
    if (k < 1) requestAnimationFrame(step);
    else { el.classList.add('out'); G.loading = false; setTimeout(() => show(el, false), 400); }
  };
  requestAnimationFrame(step);
}
function startMatchView(start, spectator) {
  backdrop = null;
  if (!spectator) showLoading(2400);
  clearMatch();
  buildWorld(start.seed);
  G.plane = start.plane; G.mode = start.mode; G.planeT = 0; G.snapAt = performance.now();
  for (const r of start.roster) G.roster.set(r[0], { id: r[0], name: r[1], bot: !!r[2], team: r[3], color: r[4] });
  for (const l of start.loot) G.items.set(l[0], { id: l[0], k: l[1], x: l[2], y: l[3], z: l[4], a: l[5] });
  lootDirty = true;
  G.inMatch = true; G.results = false; G.matchStart = performance.now();
  const mine = !spectator && G.roster.get(G.myId);
  if (mine) {
    const me = BR.makeFighter(G.myId, mine.name, false, mine.team, mine.color);
    me.lastShotT = -9; me.seq = 0; me.w = -1;
    G.me = me; G.myTeam = mine.team;
    camPitch = -0.1;
  } else { G.me = null; G.myTeam = -1; }
  setScreen('match'); show('results', false);
  show('spectate', !G.me);
  if (!G.me) { $('specTitle').textContent = 'Viendo la partida'; $('specSub').textContent = 'Entras en la siguiente'; }
  $('pingChip').hidden = G.session.kind !== 'online';
  if (!G.me) toast('Partida en curso', true);
  setAds(false);
}
function ensureAvatar(id) {
  let a = G.avatars.get(id);
  if (!a) { const r = G.roster.get(id); a = new Avatar(r ? r.color : '#ccc'); G.avatars.set(id, a); }
  return a;
}
function onSnapshot(s, events) {
  const now = performance.now() / 1000;
  for (const ev of events) if (ev.t === 'start') startMatchView(ev, false);
  if (!G.inMatch || !world) return;
  G.st = s.st; G.alive = s.al; G.aliveTeams = s.at;
  G.snapAt = performance.now();
  const z = s.z; G.zone = { cx: z[0], cz: z[1], r: z[2], tx: z[3], tz: z[4], tr: z[5], stage: z[6], t: z[7], shrinking: !!z[8] };
  for (const a of s.f) {
    const id = a[0];
    let e = G.ents.get(id);
    if (!e) { e = { id, buf: [], run: 0 }; G.ents.set(id, e); }
    if (a[1] === -1) { e.alive = false; e.kills = a[2]; e.place = a[3]; if (G.me && id === G.myId) syncMe(e, null); continue; }
    if (e.ph === PH.FALL && a[9] === PH.GROUND && id !== G.myId) { shockwave(a[1], a[2], a[3], false); const av0 = G.avatars.get(id); if (av0) av0.landT = 0.6; }
    Object.assign(e, { hp: a[6], sh: a[7], alive: true, ph: a[9], w: a[10], kills: a[11], life: a[12], reloading: !!a[17], prot: !!a[18], place: a[19], veh: a[20], seat: a[21] });
    if (a.length > 22) Object.assign(e, { iv: a[22], slots: [a[23], a[24]], ammo: [a[25], a[26]], cur: a[27], meds: a[28], shields: a[29], mag: [a[30], a[31]] });
    e.buf.push({ t: now, x: a[1], y: a[2], z: a[3], yaw: a[4], pitch: a[5], vx: a[13], vy: a[14], vz: a[15], g: a[16] });
    if (e.buf.length > 12) e.buf.shift();
    if (G.me && id === G.myId) syncMe(e, a);
  }
  if (s.v) for (const a of s.v) {
    let v = G.vehicles.get(a[0]);
    if (!v) { v = { id: a[0], type: a[1], buf: [], mesh: new VehicleMesh(a[1]), x: a[2], y: a[3], z: a[4], yaw: a[5], speed: 0 }; G.vehicles.set(a[0], v); }
    v.seats = [a[7], a[8], a[9], a[10]];
    if (a[11]) sfx('land', volAt(a[2], a[3], a[4]));
    v.buf.push({ t: now, x: a[2], y: a[3], z: a[4], yaw: a[5], speed: a[6] }); if (v.buf.length > 10) v.buf.shift();
  }
  for (const ev of events) handleEvent(ev);
}
function syncMe(e, a) {
  const me = G.me;
  me.kills = e.kills; me.place = e.place;
  if (!a) { if (me.alive) me.alive = false; return; }
  me.hp = e.hp; me.sh = e.sh; me.prot = e.prot;
  // El servidor decide si vas en un carro
  if (e.veh !== (me.veh || 0)) {
    if (e.veh) { me.veh = e.veh; me.seat = e.seat; const v = G.vehicles.get(e.veh); G.myCar = e.seat === 0 && v ? { id: v.id, type: v.type, x: v.buf.at(-1).x, y: v.buf.at(-1).y, z: v.buf.at(-1).z, yaw: v.buf.at(-1).yaw, speed: v.buf.at(-1).speed, seats: v.seats } : null; setAds(false); if (G.myCar) camYaw = G.myCar.yaw; }
    else { me.veh = 0; me.seat = 0; G.myCar = null; me.x = a[1]; me.y = a[2]; me.z = a[3]; me.vx = me.vz = me.vy = 0; engineSound(0, false); }
  }
  if (e.iv != null && e.iv !== me.iv) { me.iv = e.iv; me.slots = e.slots.slice(); me.ammo = e.ammo.slice(); me.mag = e.mag.slice(); me.meds = e.meds; me.shields = e.shields; if (me.slots[me.cur] < 0 && me.slots[1 - me.cur] >= 0) setSlot(1 - me.cur); }
  if (!e.alive && me.alive) me.alive = false;
  if (!me.spawned) {
    me.spawned = true; me.ph = e.ph; me.x = a[1]; me.y = a[2]; me.z = a[3]; me.flyY = a[2]; me.flyT = BR.FLY_TIME; me.vx = me.vz = me.vy = 0; camYaw = a[4]; camPitch = -0.35;
    toast('Estás volando: muévete y toca Caer aquí', true);
  }
}
function nameOf(id) { const r = G.roster.get(id); return r ? r.name : '?'; }
function entPos(id) {
  if (G.me && id === G.myId) return G.me;
  const e = G.ents.get(id); return e && e.rx != null ? { x: e.rx, y: e.ry, z: e.rz } : null;
}
function distTo(x, y, z) { return Math.hypot(x - camera.position.x, y - camera.position.y, z - camera.position.z); }
const volAt = (x, y, z) => clamp(1.1 - distTo(x, y, z) / 260, 0, 1);

function handleEvent(ev) {
  const me = G.me;
  switch (ev.t) {
    case 'lootAdd': for (const l of ev.l) G.items.set(l[0], { id: l[0], k: l[1], x: l[2], y: l[3], z: l[4], a: l[5] }); lootDirty = true; break;
    case 'lootDel': for (const id of ev.ids) G.items.delete(id); lootDirty = true; break;
    case 'shot': {
      if (me && ev.o === G.myId) break;
      const dirs = BR.spreadDirs(ev.w, ev.d, ev.sd, !!ev.a);
      dirs.forEach((d, i) => addTracer(ev.x, ev.y, ev.z, d[0], d[1], d[2], ev.e[i] || 30, ev.w === 4));
      const av = G.avatars.get(ev.o); if (av) av.flashT = 0.05;
      sfx('shot', volAt(ev.x, ev.y, ev.z) * 0.85, ev.w);
      break;
    }
    case 'hit': {
      const t = entPos(ev.id);
      if (ev.d > 0) G.avatars.get(ev.id)?.hurt();
      if (me && ev.id === G.myId) {
        G.hurt = Math.min(1, G.hurt + ev.d / 50);
        const src = entPos(ev.by);
        if (src) G.dmgDirs.push({ a: Math.atan2(src.x - me.x, src.z - me.z), life: 1.2 });
        vibrate(ev.d > 40 ? 70 : 25); sfx('hurt', 0.8);
      } else if (me && ev.by === G.myId) {
        me.dmg = (me.dmg || 0) + ev.d;
        G.hitMark = 0.25; G.hitHead = !!ev.h;
        if (t) G.texts.push({ x: t.x, y: t.y + 2.1, z: t.z, text: String(ev.d), color: ev.h ? '#F5B50A' : ev.s ? '#8ec9ff' : '#ffffff', life: 0.9 });
        sfx(ev.h ? 'head' : ev.s ? 'shieldhit' : 'hit', 1);
      }
      break;
    }
    case 'kill': {
      addFeed(ev);
      G.avatars.get(ev.v)?.die();
      if (me && ev.v === G.myId) {
        me.alive = false; G.deadAt = performance.now(); G.killer = ev.k ? nameOf(ev.k) : ev.w === -1 ? 'la zona' : '';
        vibrate([60, 40, 100]); sfx('die', 1);
        const mate = [...G.ents.values()].find(e => e.alive && e.id !== G.myId && G.roster.get(e.id)?.team === G.myTeam);
        G.spectate = mate ? mate.id : ev.k || null;
        show('spectate', true);
        $('specTitle').textContent = G.killer ? 'Te bajó ' + G.killer : 'Te eliminaron';
        $('specSub').textContent = mate ? 'Viendo a tu compañero ' + nameOf(mate.id) : 'Quedan ' + ev.left + ' jugadores';
      } else if (me && ev.k === G.myId) {
        sfx('kill', 1); vibrate(30);
        toast('Bajaste a ' + nameOf(ev.v) + (ev.h ? ' de un tiro a la cabeza' : '') + ' · quedan ' + ev.left, true);
      } else if (me && G.roster.get(ev.v)?.team === G.myTeam) toast('Cayó tu compañero ' + nameOf(ev.v));
      if (G.spectate === ev.v) {
        const next = [...G.ents.values()].find(e => e.alive && e.id !== G.myId && (G.roster.get(e.id)?.team === G.myTeam)) || [...G.ents.values()].find(e => e.alive);
        G.spectate = ev.k && G.ents.get(ev.k)?.alive ? ev.k : next ? next.id : null;
        if (G.spectate) $('specSub').textContent = 'Viendo a ' + nameOf(G.spectate);
      }
      break;
    }
    case 'vin': if (me && ev.id === G.myId) { toast(ev.s === 0 ? 'Vas manejando. Joystick: acelerar y girar' : 'Vas de pasajero: puedes disparar'); sfx('pick', 0.6); } break;
    case 'vout': if (me && ev.id === G.myId) { me.veh = 0; me.seat = 0; G.myCar = null; me.x = ev.x; me.z = ev.z; me.y = world.heightAt(ev.x, ev.z); me.vx = me.vz = me.vy = 0; engineSound(0, false); } break;
    case 'bump': { const v = G.vehicles.get(ev.v); if (v) sfx('hurt', volAt(v.x, v.y, v.z)); if (G.myCar && G.myCar.id === ev.v) vibrate(40); break; }
    case 'pick': if (me && ev.id === G.myId) { toast('+ ' + (ev.k < 10 ? WEAPONS[ev.k].name : BR.LOOT_NAMES[ev.k])); sfx('pick', 1); vibrate(12); } break;
    case 'use': if (me && ev.id === G.myId) { sfx('heal', 1); toast(ev.k === 'med' ? '+50 de vida' : '+50 de escudo'); } break;
    case 'zone': toast('La zona se va a cerrar. Mira el círculo amarillo en el mapa'); sfx('zone', 0.8); break;
    case 'zoneMove': toast('La zona se está cerrando', true); sfx('zone', 1); break;
    case 'end': setTimeout(showResults, 2200); if (me && G.roster.get(G.myId)?.team === ev.wt) { sfx('win', 1); vibrate([40, 40, 40, 40, 160]); toast('¡Ganaron! Último en pie', true); } break;
  }
}
function showResults() {
  if (!G.inMatch) return;
  G.results = true;
  const me = G.me, e = G.ents.get(G.myId);
  const place = e ? e.place || 1 : 0;
  $('resPlace').textContent = me ? '#' + place : 'Fin';
  $('resTitle').textContent = !me ? 'Se acabó la partida' : place === 1 ? 'Ganaste, qué nivel' : place <= 3 ? 'Casi, quedaste en el podio' : 'Buen intento';
  $('resSub').textContent = me ? `Puesto ${place} de ${G.ents.size}${G.mode === 'duo' ? ' equipos y jugadores' : ''}` : '';
  $('resKills').textContent = e ? e.kills : 0;
  $('resDmg').textContent = me ? Math.round(me.dmg || 0) : 0;
  const secs = Math.round(((me && !me.alive ? G.deadAt : performance.now()) - G.matchStart) / 1000);
  $('resTime').textContent = Math.floor(secs / 60) + ':' + String(secs % 60).padStart(2, '0');
  $('resAgainLabel').textContent = G.session && G.session.kind === 'online' ? 'Volver al lobby' : 'Jugar otra vez';
  show('results', true);
  if (document.pointerLockElement) document.exitPointerLock();
}

/* ---------- HUD ---------- */
const feedEl = $('feed'), toastsEl = $('toasts');
const esc = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function addFeed(ev) {
  const d = document.createElement('div');
  d.className = 'feed-item' + (ev.k === G.myId || ev.v === G.myId ? ' mine' : '');
  const kc = G.roster.get(ev.k), vc = G.roster.get(ev.v);
  const how = ev.w === -1 ? 'cayó en la zona' : ev.w === -2 ? 'se desconectó' : ev.w === -3 ? 'atropelló a' : (WEAPONS[ev.w]?.name || '') + (ev.h ? ' · cabeza' : '');
  d.innerHTML = ev.k ? `<b style="color:${kc?.color}">${esc(nameOf(ev.k))}</b><span class="w">${esc(how)}</span><b style="color:${vc?.color}">${esc(nameOf(ev.v))}</b>`
    : `<b style="color:${vc?.color}">${esc(nameOf(ev.v))}</b><span class="w">${esc(how)}</span>`;
  feedEl.prepend(d);
  while (feedEl.children.length > (VH < 520 ? 3 : 5)) feedEl.lastChild.remove();
  setTimeout(() => d.remove(), 6000);
}
function toast(text, big) {
  const d = document.createElement('div'); d.className = 'toast' + (big ? ' big' : ''); d.textContent = text;
  toastsEl.append(d); while (toastsEl.children.length > 2) toastsEl.firstChild.remove();
  setTimeout(() => d.remove(), big ? 2600 : 2800);
}
const cache = {};
function setText(id, v) { if (cache[id] !== v) { cache[id] = v; $(id).textContent = v; } }
function setStyle(id, k, v) { const key = id + k; if (cache[key] !== v) { cache[key] = v; $(id).style[k] = v; } }
function setHidden(id, v) { const key = id + 'h'; if (cache[key] !== v) { cache[key] = v; $(id).hidden = v; } }
function fmt(t) { t = Math.max(0, Math.ceil(t)); return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0'); }
function updateHud() {
  const me = G.me, z = G.zone;
  setText('hudAlive', String(G.alive));
  setText('hudKills', String(me ? me.kills : 0));
  setHidden('pingChip', !(G.netBad || (G.ping || 0) > 300));
  let zt = '';
  if (me && me.alive && me.ph === PH.PLANE) zt = 'Elige dónde caer';
  else if (z) {
    if (z.stage >= BR.ZONE.length - 1 && z.r <= 1) zt = 'Zona final';
    else zt = z.shrinking ? 'Zona cerrándose ' + fmt(z.t) : fmt(z.t);
  }
  const outside = me && me.alive && me.ph === PH.GROUND && z && Math.hypot(me.x - z.cx, me.z - z.cz) > z.r;
  if (outside) zt = 'Fuera de la zona';
  setText('hudZone', zt);
  $('hudZone').classList.toggle('warn', !!outside);
  if (me) {
    setStyle('hpBar', 'width', clamp(me.hp, 0, 100) + '%');
    $('hpBar').parentElement.classList.toggle('low', me.hp < 30);
    setStyle('shBar', 'width', clamp(me.sh, 0, 100) + '%');
    for (let i = 0; i < 2; i++) {
      const el = $('slot' + i), w = me.slots[i];
      const label = w >= 0 ? WEAPONS[w].name : 'Vacío', ammo = w >= 0 ? me.mag[i] + ' / ' + me.ammo[i] : '--';
      const k = 'slot' + i;
      if (cache[k] !== label + ammo + me.cur) {
        cache[k] = label + ammo + me.cur;
        el.querySelector('.slot-name').textContent = label; el.querySelector('b').textContent = w >= 0 ? me.mag[i] + '/' + me.ammo[i] : '--';
        el.classList.toggle('on', me.cur === i && w >= 0); el.classList.toggle('empty', w >= 0 && me.mag[i] <= 0);
      }
    }
    setText('medN', String(me.meds)); setText('shieldN', String(me.shields));
    $('medBtn').disabled = !me.meds; $('shieldBtn').disabled = !me.shields;
    if (G.ads && (!me.alive || me.slots[me.cur] < 0)) setAds(false);
    // Vehículo cercano con puesto libre
    let carNear = null;
    if (me.alive && !me.veh && me.ph === PH.GROUND) {
      let bd = 4.2;
      for (const v of G.vehicles.values()) {
        const d = Math.hypot(v.x - me.x, v.z - me.z), n = BR.VEHICLES[v.type].seats;
        if (d < bd && v.seats && v.seats.slice(0, n).some(x => !x)) { bd = d; carNear = v; }
      }
    }
    G.carNear = carNear;
    setHidden('carBtn', !(carNear || (me.alive && me.veh)));
    if (me.veh) setText('carText', 'Bajar');
    else if (carNear) setText('carText', (carNear.seats[0] ? 'Subir de pasajero al ' : 'Manejar el ') + BR.VEHICLES[carNear.type].name);
    setHidden('speedChip', !G.myCar);
    if (G.myCar) setText('speedChip', Math.round(Math.abs(G.myCar.speed) * 3.6) + ' km/h');
    $('fireBtn').classList.toggle('off', !!(me.veh && me.seat === 0) || me.ph !== PH.GROUND);
    $('aimBtn').classList.toggle('off', me.ph !== PH.GROUND || !!(me.veh && me.seat === 0));
    setHidden('dropBtn', !(me.alive && me.ph === PH.PLANE));
    $('touch').classList.toggle('flying', me.alive && me.ph === PH.PLANE);
    if (me.ph === PH.PLANE) setText('flyLeft', Math.ceil(me.flyT || 0) + ' s');
    $('sprintBtn').classList.toggle('on', !!G.sprintOn);
    const near = me.alive && me.ph === PH.GROUND && !me.veh ? nearestItem(me, 2.6) : null;
    G.nearItem = near;
    const needBtn = near && near.k < 10 && !me.slots.includes(-1) && !me.slots.includes(near.k);
    setHidden('pickBtn', !needBtn);
    if (needBtn) setText('pickText', (isTouch ? 'Cambiar por ' : 'E: cambiar por ') + WEAPONS[near.k].name);
  }
  // Compañeros
  if (G.mode === 'duo' && me) {
    const mates = [...G.roster.values()].filter(r => r.team === G.myTeam && r.id !== G.myId);
    const html = mates.map(r => { const e = G.ents.get(r.id); const hp = e ? e.hp : 0; return `<div class="mate ${e && e.alive ? '' : 'dead'}" style="color:${r.color}">${esc(r.name)}<i><u style="width:${hp}%"></u></i></div>`; }).join('');
    if (cache.team !== html) { cache.team = html; $('teamBox').innerHTML = html; }
  } else if (cache.team) { cache.team = ''; $('teamBox').innerHTML = ''; }
}
function nearestItem(me, maxD) {
  let best = null, bd = maxD;
  for (const it of G.items.values()) {
    const d = Math.hypot(it.x - me.x, it.z - me.z);
    if (d < bd) { bd = d; best = it; }
  }
  return best;
}

/* ---------- Minimapa ---------- */
const mini = $('minimap'), mctx = mini.getContext('2d');
function drawMinimap() {
  if (!world || !mapImg) return;
  const big = G.mapBig, W = mini.width;
  const me = G.me && G.me.alive ? G.me : (G.spectate && entPos(G.spectate)) || { x: SIZE / 2, z: SIZE / 2 };
  const span = big ? SIZE : 200;
  const cx = big ? SIZE / 2 : clamp(me.x, span / 2, SIZE - span / 2), cz = big ? SIZE / 2 : clamp(me.z, span / 2, SIZE - span / 2);
  const k = W / span, tx = (x) => (x - cx) * k + W / 2, tz = (z) => (z - cz) * k + W / 2;
  mctx.fillStyle = '#2f8fc9'; mctx.fillRect(0, 0, W, W);
  mctx.drawImage(mapImg, tx(0), tz(0), SIZE * k, SIZE * k);
  if (big) {
    mctx.font = '600 13px Outfit, system-ui'; mctx.textAlign = 'center';
    for (const t of world.towns.concat(world.camps)) { mctx.fillStyle = 'rgba(14,14,16,.6)'; const w = mctx.measureText(t.name).width + 10; mctx.fillRect(tx(t.x) - w / 2, tz(t.z) - 20, w, 17); mctx.fillStyle = '#fff'; mctx.fillText(t.name, tx(t.x), tz(t.z) - 7); }
  }
  const z = G.zone;
  if (z) {
    mctx.save();
    mctx.beginPath(); mctx.rect(0, 0, W, W); mctx.arc(tx(z.cx), tz(z.cz), Math.max(0, z.r * k), 0, Math.PI * 2, true);
    mctx.fillStyle = 'rgba(110,60,230,.38)'; mctx.fill('evenodd');
    mctx.strokeStyle = '#ffffff'; mctx.lineWidth = 2; mctx.beginPath(); mctx.arc(tx(z.cx), tz(z.cz), Math.max(0, z.r * k), 0, Math.PI * 2); mctx.stroke();
    mctx.setLineDash([6, 5]); mctx.strokeStyle = '#F5B50A'; mctx.beginPath(); mctx.arc(tx(z.tx), tz(z.tz), Math.max(0, z.tr * k), 0, Math.PI * 2); mctx.stroke(); mctx.setLineDash([]);
    mctx.restore();
  }
  if (G.plane && G.st === 0) {
    mctx.strokeStyle = 'rgba(255,255,255,.7)'; mctx.lineWidth = 2; mctx.setLineDash([4, 6]);
    mctx.beginPath(); mctx.moveTo(tx(G.plane.ax), tz(G.plane.az)); mctx.lineTo(tx(G.plane.bx), tz(G.plane.bz)); mctx.stroke(); mctx.setLineDash([]);
    const p = BR.planePos(G.plane, G.planeTNow);
    mctx.fillStyle = '#F5B50A'; mctx.beginPath(); mctx.arc(tx(p.x), tz(p.z), 5, 0, Math.PI * 2); mctx.fill();
  }
  for (const v of G.vehicles.values()) {
    if (v.x == null) continue;
    mctx.save(); mctx.translate(tx(v.x), tz(v.z)); mctx.rotate(-v.yaw);
    mctx.fillStyle = v.seats && v.seats.some(x => x) ? '#F5B50A' : '#e8e8e8'; mctx.fillRect(-3, -5, 6, 10);
    mctx.restore();
  }
  // Compañeros
  for (const r of G.roster.values()) {
    if (r.team !== G.myTeam || r.id === G.myId) continue;
    const e = G.ents.get(r.id); if (!e || !e.alive || e.rx == null) continue;
    mctx.fillStyle = r.color; mctx.strokeStyle = '#0E0E10'; mctx.lineWidth = 2;
    mctx.beginPath(); mctx.arc(tx(e.rx), tz(e.rz), 5, 0, Math.PI * 2); mctx.fill(); mctx.stroke();
  }
  if (G.me && G.me.alive) {
    const x = tx(G.me.x), y = tz(G.me.z), a = -camYaw;
    mctx.save(); mctx.translate(x, y); mctx.rotate(a);
    mctx.fillStyle = '#F5B50A'; mctx.strokeStyle = '#0E0E10'; mctx.lineWidth = 2;
    mctx.beginPath(); mctx.moveTo(0, -9); mctx.lineTo(7, 7); mctx.lineTo(0, 3); mctx.lineTo(-7, 7); mctx.closePath(); mctx.fill(); mctx.stroke();
    mctx.restore();
  }
}
function setMapBig(on) {
  G.mapBig = on; $('mapBtn').classList.toggle('big', on);
  mini.width = mini.height = on ? 640 : 300;
}

/* ---------- Entrada ---------- */
const keys = {};
const input = { mx: 0, mz: 0, jump: false, chute: false, fire: false };
const btn = { fire: false, jump: false };
let camYaw = 0, camPitch = -0.2;
const sticks = { move: null, look: null, fire: null };

addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') { if (e.key === 'Enter') startFromMenu(); return; }
  keys[e.code] = true;
  if (G.screen !== 'match') return;
  if (e.code === 'Escape') togglePause();
  if (e.code === 'KeyE') tryPick();
  if (e.code === 'KeyF') $('carBtn').click();
  if (e.code === 'Digit1') setSlot(0);
  if (e.code === 'Digit2') setSlot(1);
  if (e.code === 'KeyQ') useItem('med');
  if (e.code === 'KeyR') reload();
  if (e.code === 'KeyX' || e.code === 'KeyG') useItem('shield');
  if (e.code === 'KeyM') setMapBig(!G.mapBig);
  if (e.code === 'Space') e.preventDefault();
});
addEventListener('keyup', (e) => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; btn.fire = false; mouseDown = false; });
let mouseDown = false;
canvas.addEventListener('mousedown', (e) => { audioInit(); if (G.screen === 'match' && e.button === 2) setAds(!G.ads); });
addEventListener('mouseup', (e) => { if (e.button === 0) mouseDown = false; if (e.button === 2) setAds(false); });
addEventListener('mousemove', (e) => {
  if (document.pointerLockElement !== canvas) return;
  const k = 0.0024 * settings.sens * (G.ads ? (G.me && G.me.slots[G.me.cur] === 4 ? 0.3 : 0.6) : 1);
  camYaw -= e.movementX * k;
  camPitch = clamp(camPitch - e.movementY * k, -1.35, 1.2);
});
addEventListener('wheel', () => { if (G.screen === 'match' && G.me) setSlot(1 - G.me.cur); }, { passive: true });

// Táctil: izquierda mueve, derecha mira; el botón de disparo también sirve para apuntar
canvas.addEventListener('pointerdown', (e) => {
  audioInit();
  if (G.screen !== 'match' || e.button === 2) return;
  try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
  const s = { id: e.pointerId, ox: e.clientX, oy: e.clientY, x: e.clientX, y: e.clientY, lx: e.clientX, ly: e.clientY };
  if (e.clientX < VW * 0.42 && !sticks.move) sticks.move = s;
  else if (!sticks.look) sticks.look = s;
});
canvas.addEventListener('pointermove', (e) => {
  for (const k of ['move', 'look']) {
    const s = sticks[k]; if (!s || s.id !== e.pointerId) continue;
    s.x = e.clientX; s.y = e.clientY;
    if (k === 'look') lookDelta(s);
    else { const R = 60, dx = s.x - s.ox, dy = s.y - s.oy, d = Math.hypot(dx, dy); if (d > R) { s.ox = s.x - dx / d * R; s.oy = s.y - dy / d * R; } }
  }
});
function lookDelta(s) {
  const k = 0.0055 * settings.sens * (G.ads ? (G.me && G.me.slots[G.me.cur] === 4 ? 0.3 : 0.55) : 1);
  camYaw -= (s.x - s.lx) * k; camPitch = clamp(camPitch - (s.y - s.ly) * k, -1.35, 1.2);
  s.lx = s.x; s.ly = s.y;
}
function endPtr(e) {
  if (sticks.move && sticks.move.id === e.pointerId) sticks.move = null;
  if (sticks.look && sticks.look.id === e.pointerId) sticks.look = null;
}
canvas.addEventListener('pointerup', endPtr); canvas.addEventListener('pointercancel', endPtr);
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
for (const id of ['fireBtn']) {
  const el = $(id);
  el.addEventListener('pointerdown', (e) => { e.preventDefault(); audioInit(); btn.fire = true; el.classList.add('on'); try { el.setPointerCapture(e.pointerId); } catch (_) {} sticks.fire = { id: e.pointerId, x: e.clientX, y: e.clientY, lx: e.clientX, ly: e.clientY }; });
  el.addEventListener('pointermove', (e) => { const s = sticks.fire; if (s && s.id === e.pointerId) { s.x = e.clientX; s.y = e.clientY; lookDelta(s); } });
  const off = () => { btn.fire = false; el.classList.remove('on'); sticks.fire = null; };
  el.addEventListener('pointerup', off); el.addEventListener('pointercancel', off);
}
{
  const el = $('jumpBtn');
  el.addEventListener('pointerdown', (e) => { e.preventDefault(); btn.jump = true; el.classList.add('on'); });
  const off = () => { btn.jump = false; el.classList.remove('on'); };
  el.addEventListener('pointerup', off); el.addEventListener('pointercancel', off); el.addEventListener('pointerleave', off);
}
// Tocar el arma en la mano recarga; tocar la otra la cambia
for (const i of [0, 1]) $('slot' + i).addEventListener('click', () => { const me = G.me; if (!me) return; if (me.cur === i) reload(); else setSlot(i); });
$('sprintBtn').addEventListener('click', () => { G.sprintOn = !G.sprintOn; vibrate(8); });
$('dropBtn').addEventListener('click', () => { G.wantDrop = true; });
$('medBtn').addEventListener('click', () => useItem('med'));
$('shieldBtn').addEventListener('click', () => useItem('shield'));
$('pickBtn').addEventListener('click', tryPick);
$('carBtn').addEventListener('click', () => {
  const me = G.me; if (!me || !me.alive) return;
  if (me.veh) G.session.send({ t: 'veh', a: 'out' });
  else if (G.carNear) G.session.send({ t: 'veh', a: 'in', i: G.carNear.id });
});
$('mapBtn').addEventListener('click', () => setMapBig(!G.mapBig));
const aimingNow = () => G.ads;
$('aimBtn').addEventListener('click', () => setAds(!G.ads));


function setSlot(i) {
  const me = G.me; if (!me || me.slots[i] < 0) return;
  if (me.cur !== i) me.reloadEnd = 0;
  me.cur = i; G.session.send({ t: 'slot', c: i });
}
function reload() {
  const me = G.me; if (!me || !me.alive) return;
  const w = me.slots[me.cur];
  if (w < 0 || me.reloadEnd || me.mag[me.cur] >= WEAPONS[w].mag || me.ammo[me.cur] <= 0) return;
  me.reloadEnd = performance.now() / 1000 + WEAPONS[w].reload; me.reloadSlot = me.cur;
  G.session.send({ t: 'reload' }); sfx('reload', 1);
}
function updateReload() {
  const me = G.me; if (!me || !me.reloadEnd) return;
  if (performance.now() / 1000 >= me.reloadEnd) {
    const slot = me.reloadSlot, w = me.slots[slot]; me.reloadEnd = 0;
    if (w < 0) return;
    const need = Math.min(WEAPONS[w].mag - me.mag[slot], me.ammo[slot]);
    me.mag[slot] += need; me.ammo[slot] -= need; sfx('reloaded', 1);
  }
}
function setAds(on) {
  G.ads = !!on && !!G.me && G.me.alive && G.me.slots[G.me.cur] >= 0;
  $('aimBtn').classList.toggle('on', G.ads);
}
function useItem(k) { const me = G.me; if (me && me.alive) G.session.send({ t: 'use', k }); }
function tryPick() { const me = G.me; if (me && me.alive && G.nearItem) G.session.send({ t: 'pick', i: G.nearItem.id }); }

function readInput() {
  let mx = 0, mz = 0;
  if (keys.KeyW || keys.ArrowUp) mz += 1;
  if (keys.KeyS || keys.ArrowDown) mz -= 1;
  if (keys.KeyA || keys.ArrowLeft) mx -= 1;
  if (keys.KeyD || keys.ArrowRight) mx += 1;
  const m = sticks.move;
  if (m) { const R = 60; mx = clamp((m.x - m.ox) / R, -1, 1); mz = clamp(-(m.y - m.oy) / R, -1, 1); if (Math.hypot(mx, mz) < 0.15) mx = mz = 0; }
  input.mx = mx; input.mz = mz;
  input.sprint = !G.ads && !input.fire && (keys.ShiftLeft || keys.ShiftRight || G.sprintOn || (m && mz > 0.95));
  input.jump = !!(keys.Space || btn.jump);
  input.chute = !!keys.KeyF || (G.me && G.me.ph === PH.PLANE && input.jump);
  input.fire = btn.fire || mouseDown;
  input.sprint = input.sprint && !input.fire;
}

/* ---------- Jugador local ---------- */
function stateMsg() {
  const me = G.me, r = (v) => Math.round(v * 100) / 100;
  const m = { x: r(me.x), y: r(me.y), z: r(me.z), vx: r(me.vx), vy: r(me.vy), vz: r(me.vz), yw: r(me.yaw), pt: r(me.pitch), ph: me.ph, l: me.life, g: me.grounded ? 1 : 0 };
  if (G.myCar) m.v = [r(G.myCar.x), r(G.myCar.z), r(G.myCar.yaw), r(G.myCar.speed)];
  return m;
}
// Onda expansiva al aterrizar (estilo superhéroe)
const rings = [];
const ringGeo = new THREE.RingGeometry(0.8, 1, 40).rotateX(-Math.PI / 2);
function shockwave(x, y, z, big) {
  const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: '#F5B50A', transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
  m.position.set(x, y + 0.15, z); scene.add(m);
  rings.push({ m, t: 0, max: big ? 9 : 6 });
}
function updateRings(dt) {
  for (let i = rings.length - 1; i >= 0; i--) {
    const r = rings[i]; r.t += dt;
    const k = r.t / 0.6; r.m.scale.setScalar(0.5 + k * r.max); r.m.material.opacity = Math.max(0, 0.9 * (1 - k));
    if (k >= 1) { scene.remove(r.m); r.m.material.dispose(); rings.splice(i, 1); }
  }
}
function localFx(name, f) {
  if (name === 'drop') { sfx('wind', 1); vibrate(25); toast('¡Cayendo! Empuja adelante para bajar más rápido'); }
  if (name === 'slam') { shockwave(f.x, f.y, f.z, true); G.shake = 1; sfx('slam', 1); vibrate([60, 30, 120]); const av = G.avatars.get(G.myId); if (av) av.landT = 0.6; }
  if (name === 'jump') sfx('jump', 0.6);
  else if (name === 'land') { sfx('land', 0.8); vibrate(20); }
  else if (name === 'chute') { sfx('chute', 1); vibrate(30); }
}
function updateMe(dt) {
  const me = G.me; if (!me || !me.alive || !world) return;
  readInput();
  me.yaw = camYaw; me.pitch = camPitch;
  if (!me.spawned) return; // esperando la posición de aparición
  if (G.wantDrop) { input.chute = true; G.wantDrop = false; }
  updateReload();
  if (me.veh) {
    const car = G.myCar;
    if (car) {
      BR.stepVehicle(car, G.results || G.st === 2 ? { mz: 0, mx: 0 } : { mz: input.mz, mx: input.mx }, dt, world);
      const p = BR.seatPos(car, 0); me.x = p.x; me.y = p.y; me.z = p.z;
      me.vx = -Math.sin(car.yaw) * car.speed; me.vz = -Math.cos(car.yaw) * car.speed;
      // La cámara sigue la dirección del carro si no estás mirando a otro lado
      if (!sticks.look && !sticks.fire) {
        camYaw += Math.atan2(Math.sin(car.yaw - camYaw), Math.cos(car.yaw - camYaw)) * Math.min(1, dt * 3);
        camPitch += (-0.06 - camPitch) * Math.min(1, dt * 2);
      }
      engineSound(car.speed, true);
    } else {
      const v = G.vehicles.get(me.veh);
      if (v && v.x != null) { const p = BR.seatPos(v, me.seat); me.x = p.x; me.y = p.y; me.z = p.z; }
      if (input.fire) tryFire();
    }
    return;
  }
  if (G.results) { input.mx = input.mz = 0; input.fire = false; }
  if (G.st === 2) input.fire = false;
  const wasPh = me.ph;
  BR.stepFighter(me, input, dt, world, localFx);
  if (wasPh !== me.ph) G.wantChute = false;
  if (input.fire && me.ph === PH.GROUND) tryFire();
}
const ray = new THREE.Vector3();
function tryFire() {
  const me = G.me, now = performance.now() / 1000;
  const slot = me.cur, w = me.slots[slot];
  if (w < 0 || me.reloadEnd || (me.veh && me.seat === 0)) return;
  const W = WEAPONS[w];
  if (now - me.lastShotT < W.rate) return;
  if (me.mag[slot] <= 0) {
    if (me.ammo[slot] > 0) { reload(); return; }
    if (now - me.lastShotT > 0.5) { me.lastShotT = now; sfx('empty', 1); toast('Sin munición: busca cajas de munición o cambia de arma'); }
    return;
  }
  me.lastShotT = now;
  // Apunta a lo que está en el centro de la pantalla
  camera.getWorldDirection(ray);
  const cx = camera.position.x, cy = camera.position.y, cz = camera.position.z;
  const ox = me.x, oy = me.y + EYE, oz = me.z;
  let aimD = Math.min(world.rayWorld(cx, cy, cz, ray.x, ray.y, ray.z, W.range + 10), W.range + 10);
  const others = [...G.ents.values()].filter(e => e.id !== G.myId && e.alive && e.rx != null).map(e => ({ x: e.rx, y: e.ry, z: e.rz, alive: true, id: e.id, team: G.roster.get(e.id)?.team }));
  const hf = BR.rayFighters(others, cx, cy, cz, ray.x, ray.y, ray.z, aimD, (f) => f.team === G.myTeam);
  aimD = hf.d;
  // Ayuda al apuntar en el celular: si hay un rival cerca del centro, corrige un poco
  let tx = cx + ray.x * aimD, ty = cy + ray.y * aimD, tz = cz + ray.z * aimD;
  if (isTouch && settings.assist && !hf.f) {
    let best = null, bestA = 0.05;
    for (const o of others) {
      if (o.team === G.myTeam) continue;
      const vx = o.x - cx, vy = o.y + 1.15 - cy, vz = o.z - cz, d = Math.hypot(vx, vy, vz);
      if (d > W.range) continue;
      const a = Math.acos(clamp((vx * ray.x + vy * ray.y + vz * ray.z) / d, -1, 1));
      if (a < bestA && world.canSee(ox, oy, oz, o.x, o.y + 1.15, o.z)) { bestA = a; best = o; }
    }
    if (best) { tx = best.x; ty = best.y + 1.15; tz = best.z; }
  }
  let dx = tx - ox, dy = ty - oy, dz = tz - oz; const dl = Math.hypot(dx, dy, dz) || 1;
  dx /= dl; dy /= dl; dz /= dl;
  if (dl < 1.5) { dx = ray.x; dy = ray.y; dz = ray.z; }
  const seed = (Math.random() * 4294967295) >>> 0;
  const ads = !!G.ads;
  const dirs = BR.spreadDirs(w, [dx, dy, dz], seed, ads);
  for (const d of dirs) {
    const wd = world.rayWorld(ox, oy, oz, d[0], d[1], d[2], W.range);
    const h = BR.rayFighters(others, ox, oy, oz, d[0], d[1], d[2], wd, (f) => f.team === G.myTeam);
    addTracer(ox, oy - 0.2, oz, d[0], d[1], d[2], h.d, w === 4);
  }
  me.mag[slot]--;
  const av = G.avatars.get(G.myId); if (av) av.flashT = 0.05;
  muzzleLight.intensity = 6; muzzleLight.position.set(ox + dx * 1.2, oy, oz + dz * 1.2);
  me.prot = false;
  if (me.mag[slot] === 0 && me.ammo[slot] > 0) setTimeout(reload, 250);
  G.kick = Math.min(1, (G.kick || 0) + (w === 4 ? 1 : w === 2 ? 0.7 : 0.25));
  camPitch = clamp(camPitch + (w === 4 ? 0.035 : w === 2 ? 0.025 : 0.008), -1.35, 1.2);
  sfx('shot', 1, w);
  if (w >= 2) vibrate(15);
  G.session.send({ t: 'fire', o: [+ox.toFixed(2), +oy.toFixed(2), +oz.toFixed(2)], d: [+dx.toFixed(4), +dy.toFixed(4), +dz.toFixed(4)], sd: seed, c: slot, l: me.life, a: ads ? 1 : 0 });
}

/* ---------- Interpolación y cámara ---------- */
function interpolate(now, delay) {
  const t = now - delay;
  for (const e of G.ents.values()) {
    if (G.me && e.id === G.myId) continue;
    const b = e.buf; if (!b.length) continue;
    let s0 = b[b.length - 1], s1 = null;
    if (t < s0.t) { for (let i = b.length - 2; i >= 0; i--) if (b[i].t <= t) { s0 = b[i]; s1 = b[i + 1]; break; } if (!s1) s0 = b[0]; }
    if (s1) {
      const k = (t - s0.t) / Math.max(0.001, s1.t - s0.t);
      e.rx = s0.x + (s1.x - s0.x) * k; e.ry = s0.y + (s1.y - s0.y) * k; e.rz = s0.z + (s1.z - s0.z) * k;
      e.ryaw = s0.yaw + Math.atan2(Math.sin(s1.yaw - s0.yaw), Math.cos(s1.yaw - s0.yaw)) * k; e.rpitch = s0.pitch + (s1.pitch - s0.pitch) * k;
    } else {
      const ex = Math.min(Math.max(0, t - s0.t), 0.12);
      e.rx = s0.x + s0.vx * ex; e.ry = s0.y + (s0.g ? 0 : s0.vy * ex); e.rz = s0.z + s0.vz * ex; e.ryaw = s0.yaw; e.rpitch = s0.pitch;
    }
    const last = b[b.length - 1]; e.vx = last.vx; e.vz = last.vz; e.vy = last.vy; e.g = last.g;
  }
}
function interpolateVehicles(now, delay, dt) {
  const t = now - delay;
  for (const v of G.vehicles.values()) {
    if (G.myCar && G.myCar.id === v.id) { Object.assign(v, { x: G.myCar.x, y: G.myCar.y, z: G.myCar.z, yaw: G.myCar.yaw, speed: G.myCar.speed }); v.mesh.update(v, dt); continue; }
    const b = v.buf; if (!b.length) continue;
    let s0 = b[b.length - 1], s1 = null;
    if (t < s0.t) { for (let i = b.length - 2; i >= 0; i--) if (b[i].t <= t) { s0 = b[i]; s1 = b[i + 1]; break; } if (!s1) s0 = b[0]; }
    if (s1) {
      const k = (t - s0.t) / Math.max(0.001, s1.t - s0.t);
      v.x = s0.x + (s1.x - s0.x) * k; v.y = s0.y + (s1.y - s0.y) * k; v.z = s0.z + (s1.z - s0.z) * k;
      v.yaw = s0.yaw + Math.atan2(Math.sin(s1.yaw - s0.yaw), Math.cos(s1.yaw - s0.yaw)) * k; v.speed = s1.speed;
    } else {
      const ex = Math.min(Math.max(0, t - s0.t), 0.12);
      v.x = s0.x - Math.sin(s0.yaw) * s0.speed * ex; v.z = s0.z - Math.cos(s0.yaw) * s0.speed * ex; v.y = s0.y; v.yaw = s0.yaw; v.speed = s0.speed;
    }
    v.mesh.update(v, dt);
  }
}
const tmpV = new THREE.Vector3();
function updateCamera(dt) {
  const me = G.me;
  let follow = null, yaw = camYaw, pitch = camPitch;
  if (me && me.alive) follow = me;
  else if (G.spectate) { const e = G.ents.get(G.spectate); if (e && e.alive && e.rx != null) { follow = { x: e.rx, y: e.ry, z: e.rz, ph: e.ph }; yaw = e.ryaw; pitch = -0.25; } }

  if (!follow) {
    // Vista aérea lenta (menú o sin nadie a quien seguir)
    const t = G.time * 0.05;
    camera.position.set(SIZE / 2 + Math.cos(t) * 520, 230, SIZE / 2 + Math.sin(t) * 520);
    camera.lookAt(SIZE / 2, 10, SIZE / 2);
    return;
  }
  const d = BR.dirFrom(yaw, pitch);
  let dist = 4.3, up = 0.4, side = 1.05;
  if (follow.ph === PH.PLANE) { dist = 8; up = 2.2; side = 0; }
  else if (follow.ph === PH.FALL) { dist = 7; up = 2.4; side = 0; }
  else if (follow.ph === PH.CHUTE) { dist = 8; up = 1.2; side = 0; }
  else if (G.ads && me && me.alive) { dist = 0.05; side = 0.12; up = 0.05; }
  if (me && me.alive && me.veh && !G.ads) { dist = me.seat === 0 ? 8 : 5.5; up = me.seat === 0 ? 1.4 : 1.0; side = me.seat === 0 ? 0 : 0.6; }
  const rx = Math.cos(yaw), rz = -Math.sin(yaw);
  const hx = follow.x + rx * side, hy = follow.y + (follow.ph === PH.PLANE ? 0 : EYE) + up, hz = follow.z + rz * side;
  let cx = hx - d[0] * dist, cy = hy - d[1] * dist, cz = hz - d[2] * dist;
  // Que la cámara no atraviese paredes ni el piso
  if (follow.ph === PH.GROUND) {
    const bx = cx - hx, by = cy - hy, bz = cz - hz, bl = Math.hypot(bx, by, bz);
    const hit = world.rayWorld(hx, hy, hz, bx / bl, by / bl, bz / bl, bl);
    if (hit < bl) { const k = Math.max(0.3, hit - 0.3) / bl; cx = hx + bx * k; cy = hy + by * k; cz = hz + bz * k; }
  }
  cy = Math.max(cy, world.heightAt(cx, cz) + 0.4);
  camera.position.set(cx, cy, cz);
  const sniperAds = G.ads && me && me.alive && me.slots[me.cur] === 4;
  const baseFov = VW > VH ? 70 : 85, fov = G.ads ? (sniperAds ? 18 : baseFov * 0.66) : baseFov;
  if (Math.abs(camera.fov - fov) > 0.1) { camera.fov += (fov - camera.fov) * Math.min(1, dt * 14); camera.updateProjectionMatrix(); }
  if (me && me.alive) {
    flashlight.visible = true;
    flashlight.position.set(me.x, me.y + 1.5, me.z);
    flashlight.target.position.set(me.x + d[0] * 10, me.y + 1.5 + d[1] * 10, me.z + d[2] * 10);
  } else flashlight.visible = false;
  muzzleLight.intensity = Math.max(0, muzzleLight.intensity - dt * 60);
  if (G.shake > 0) { camera.position.x += (Math.random() - 0.5) * G.shake * 0.5; camera.position.y += (Math.random() - 0.5) * G.shake * 0.5; G.shake = Math.max(0, G.shake - dt * 2.2); }
  const kick = (G.kick || 0) * 0.01;
  camera.lookAt(tmpV.set(cx + d[0], cy + d[1] + kick, cz + d[2]));
  G.kick = Math.max(0, (G.kick || 0) - dt * 6);
}

/* ---------- Capa 2D: mira, números de daño, nombres ---------- */
const proj = new THREE.Vector3();
function toScreen(x, y, z) { proj.set(x, y, z).project(camera); if (proj.z > 1) return null; return { x: (proj.x + 1) / 2 * VW, y: (1 - proj.y) / 2 * VH }; }
function drawOverlay(dt) {
  octx.clearRect(0, 0, VW, VH);
  if (G.screen !== 'match' || !G.inMatch) return;
  const me = G.me;
  // Zona: tinte morado si estás afuera
  if (me && me.alive && G.zone && Math.hypot(me.x - G.zone.cx, me.z - G.zone.cz) > G.zone.r) { octx.fillStyle = 'rgba(110,60,230,.18)'; octx.fillRect(0, 0, VW, VH); }
  if (G.hurt > 0.01) {
    const g = octx.createRadialGradient(VW / 2, VH / 2, Math.min(VW, VH) * 0.3, VW / 2, VH / 2, Math.max(VW, VH) * 0.7);
    g.addColorStop(0, 'rgba(255,40,50,0)'); g.addColorStop(1, `rgba(255,40,50,${G.hurt * 0.6})`);
    octx.fillStyle = g; octx.fillRect(0, 0, VW, VH);
    G.hurt = Math.max(0, G.hurt - dt * 1.4);
  }
  // Indicadores de dónde te dispararon
  for (let i = G.dmgDirs.length - 1; i >= 0; i--) {
    const d = G.dmgDirs[i]; d.life -= dt; if (d.life <= 0) { G.dmgDirs.splice(i, 1); continue; }
    const a = d.a - camYaw + Math.PI;
    octx.save(); octx.translate(VW / 2, VH / 2); octx.rotate(-a);
    octx.strokeStyle = `rgba(255,90,95,${Math.min(1, d.life)})`; octx.lineWidth = 6; octx.lineCap = 'round';
    octx.beginPath(); octx.arc(0, 0, Math.min(VW, VH) * 0.22, -Math.PI / 2 - 0.25, -Math.PI / 2 + 0.25); octx.stroke();
    octx.restore();
  }
  // Nombres de compañeros
  octx.textAlign = 'center'; octx.font = '600 13px Outfit, system-ui, sans-serif';
  for (const r of G.roster.values()) {
    if (r.team !== G.myTeam || r.id === G.myId) continue;
    const e = G.ents.get(r.id); if (!e || !e.alive || e.rx == null) continue;
    const s = toScreen(e.rx, e.ry + 2.3, e.rz); if (!s) continue;
    octx.fillStyle = 'rgba(14,14,16,.55)'; const w = octx.measureText(r.name).width + 12; octx.fillRect(s.x - w / 2, s.y - 16, w, 18);
    octx.fillStyle = r.color; octx.fillText(r.name, s.x, s.y - 3);
  }
  // Números de daño
  for (let i = G.texts.length - 1; i >= 0; i--) {
    const t = G.texts[i]; t.life -= dt; t.y += dt * 1.2; if (t.life <= 0) { G.texts.splice(i, 1); continue; }
    const s = toScreen(t.x, t.y, t.z); if (!s) continue;
    octx.globalAlpha = Math.min(1, t.life * 2.5); octx.font = '800 18px Outfit, system-ui, sans-serif';
    octx.lineWidth = 4; octx.strokeStyle = 'rgba(14,14,16,.8)'; octx.strokeText(t.text, s.x, s.y); octx.fillStyle = t.color; octx.fillText(t.text, s.x, s.y);
  }
  octx.globalAlpha = 1;
  // Mira telescópica del francotirador
  if (me && me.alive && G.ads && me.slots[me.cur] === 4) {
    const r = Math.min(VW, VH) * 0.42, cx = VW / 2, cy = VH / 2;
    octx.save(); octx.fillStyle = 'rgba(0,0,0,.92)'; octx.beginPath(); octx.rect(0, 0, VW, VH); octx.arc(cx, cy, r, 0, Math.PI * 2, true); octx.fill('evenodd');
    octx.strokeStyle = 'rgba(0,0,0,.9)'; octx.lineWidth = 2; octx.beginPath(); octx.moveTo(cx - r, cy); octx.lineTo(cx + r, cy); octx.moveTo(cx, cy - r); octx.lineTo(cx, cy + r); octx.stroke();
    octx.strokeStyle = '#F5B50A'; octx.lineWidth = 1.5; octx.beginPath(); octx.arc(cx, cy, 5, 0, Math.PI * 2); octx.stroke();
    octx.restore();
  }
  // Mira
  if (me && me.alive && me.ph === PH.GROUND && !(G.ads && me.slots[me.cur] === 4)) {
    const w = me.slots[me.cur], spread = w >= 0 ? WEAPONS[w].spread * (G.ads ? BR.ADS_SPREAD : 1) : 0.03;
    const gap = 6 + spread * 260 + (G.kick || 0) * 8, cx = VW / 2, cy = VH / 2;
    octx.strokeStyle = 'rgba(255,255,255,.95)'; octx.lineWidth = 2;
    octx.beginPath();
    octx.moveTo(cx - gap - 7, cy); octx.lineTo(cx - gap, cy); octx.moveTo(cx + gap, cy); octx.lineTo(cx + gap + 7, cy);
    octx.moveTo(cx, cy - gap - 7); octx.lineTo(cx, cy - gap); octx.moveTo(cx, cy + gap); octx.lineTo(cx, cy + gap + 7);
    octx.stroke();
    octx.fillStyle = '#F5B50A'; octx.fillRect(cx - 1.5, cy - 1.5, 3, 3);
    if (me.reloadEnd) {
      const W = WEAPONS[me.slots[me.reloadSlot]] || WEAPONS[0];
      const k = 1 - clamp((me.reloadEnd - performance.now() / 1000) / W.reload, 0, 1);
      octx.strokeStyle = 'rgba(255,255,255,.25)'; octx.lineWidth = 4; octx.beginPath(); octx.arc(cx, cy, 26, 0, Math.PI * 2); octx.stroke();
      octx.strokeStyle = '#F5B50A'; octx.beginPath(); octx.arc(cx, cy, 26, -Math.PI / 2, -Math.PI / 2 + k * Math.PI * 2); octx.stroke();
      octx.fillStyle = '#fff'; octx.font = '600 12px Outfit, system-ui'; octx.textAlign = 'center'; octx.fillText('Recargando', cx, cy + 46);
    }
    if (G.hitMark > 0) {
      G.hitMark -= dt;
      octx.strokeStyle = G.hitHead ? '#F5B50A' : '#ffffff'; octx.lineWidth = 2.5;
      octx.beginPath(); for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { octx.moveTo(cx + sx * 6, cy + sy * 6); octx.lineTo(cx + sx * 13, cy + sy * 13); } octx.stroke();
    }
  }
  // Joystick (fantasma cuando no lo tocas, para que sepas dónde va)
  const m = sticks.move;
  if (!m && G.me && G.me.alive) {
    const gx = 110 + (VW > 700 ? 20 : 0), gy = VH - 100;
    octx.strokeStyle = 'rgba(255,255,255,.14)'; octx.lineWidth = 2; octx.beginPath(); octx.arc(gx, gy, 52, 0, Math.PI * 2); octx.stroke();
    octx.fillStyle = 'rgba(255,255,255,.12)'; octx.beginPath(); octx.arc(gx, gy, 20, 0, Math.PI * 2); octx.fill();
  }
  if (m) {
    octx.strokeStyle = 'rgba(255,255,255,.25)'; octx.lineWidth = 2; octx.beginPath(); octx.arc(m.ox, m.oy, 60, 0, Math.PI * 2); octx.stroke();
    const dx = m.x - m.ox, dy = m.y - m.oy, d = Math.hypot(dx, dy), k = Math.min(d, 60) / (d || 1);
    octx.fillStyle = 'rgba(255,255,255,.4)'; octx.beginPath(); octx.arc(m.ox + dx * k, m.oy + dy * k, 24, 0, Math.PI * 2); octx.fill();
  }
}

/* ---------- Bucle ---------- */
let lastT = performance.now(), fpsAcc = 0, fpsN = 0;
function frame(t) {
  requestAnimationFrame(frame);
  let dt = (t - lastT) / 1000; lastT = t;
  if (dt > 0.1) dt = 0.1; if (dt <= 0) return;
  G.time += dt;
  fpsAcc += dt; fpsN++;
  if (fpsAcc > 3) {
    const fps = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0;
    if (fps < 38 && !G_LOWRES && !settings.hq && G.screen === 'match') { G_LOWRES = true; resize(); }
  }
  const sess = G.session;
  G.planeTNow = G.plane ? G.planeT + (sess && sess.kind === 'online' ? (performance.now() - G.snapAt) / 1000 : 0) : 0;
  if (G.screen === 'match' && !G.paused && !G.loading) updateMe(dt);
  if (sess) sess.update(dt);
  if (backdrop && !G.inMatch) { backdrop.update(dt); onSnapshotBackdrop(); }
  interpolate(performance.now() / 1000, sess && sess.kind === 'online' ? 0.12 : 0);
  interpolateVehicles(performance.now() / 1000, sess && sess.kind === 'online' ? 0.12 : 0, dt);
  // Avatares
  for (const e of G.ents.values()) {
    const av = ensureAvatar(e.id);
    if (e.rx == null && !(G.me && e.id === G.myId)) { av.g.visible = false; continue; }
    if (G.me && e.id === G.myId) {
      const me = G.me;
      const myV = me.veh ? G.vehicles.get(me.veh) : null;
      av.update({ x: me.x, y: me.y, z: me.z, yaw: me.veh && me.seat === 0 && myV ? myV.yaw : me.yaw, pitch: me.pitch, vx: me.vx, vz: me.vz, alive: me.alive, ph: me.ph, w: me.veh && me.seat === 0 ? -1 : me.slots[me.cur], run: me.run, grounded: me.grounded, prot: me.prot, reloading: !!me.reloadEnd, sit: me.veh ? me.seat + 1 : 0 }, dt);
      if (G.ads) av.g.visible = false; // con mira: vista en primera persona
    } else {
      if (e.g && e.ph === PH.GROUND) e.run += Math.hypot(e.vx || 0, e.vz || 0) * dt;
      const ev2 = e.veh ? G.vehicles.get(e.veh) : null;
      av.update({ x: e.rx, y: e.ry, z: e.rz, yaw: e.veh && e.seat === 0 && ev2 ? ev2.yaw : e.ryaw, pitch: e.rpitch, vx: e.veh ? 0 : e.vx, vz: e.veh ? 0 : e.vz, alive: e.alive, ph: e.ph, w: e.veh && e.seat === 0 ? -1 : e.w, run: e.run, grounded: !!e.g, prot: e.prot, reloading: e.reloading, sit: e.veh ? e.seat + 1 : 0 }, dt);
    }
  }
  // Avión y zona
  if (planeMesh && G.plane) {
    planeMesh.visible = G.planeTNow < G.plane.dur + 2;
    const p = BR.planePos(G.plane, G.planeTNow); planeMesh.position.set(p.x, p.y, p.z);
    planeMesh.rotation.y = Math.atan2(-(G.plane.bx - G.plane.ax), -(G.plane.bz - G.plane.az));
  }
  if (zoneMesh && G.zone) {
    zoneMesh.visible = true; zoneMesh.scale.set(Math.max(0.1, G.zone.r), 1400, Math.max(0.1, G.zone.r)); zoneMesh.position.set(G.zone.cx, 300, G.zone.cz);
    nextZoneMesh.visible = true; nextZoneMesh.scale.setScalar(Math.max(0.1, G.zone.tr)); nextZoneMesh.position.set(G.zone.tx, world.heightAt(G.zone.tx, G.zone.tz) + 0.6, G.zone.tz);
  } else if (zoneMesh) { zoneMesh.visible = false; nextZoneMesh.visible = false; }
  if (lootDirty) rebuildLoot();
  updateTracers(dt);
  updateRings(dt);
  updateCamera(dt);
  renderer.render(scene, camera);
  drawOverlay(dt);
  if (G.screen === 'match') { updateHud(); drawMinimap(); }
}

/* ---------- Fondo del menú: la isla con bots peleando ---------- */
let backdrop = null;
function startBackdrop() {
  clearMatch();
  backdrop = new BR.Match({ mode: 'solo', diff: 1, humans: [] });
  buildWorld(backdrop.seed);
  G.plane = null; G.zone = null;
  const ev = backdrop.drain();
  for (const r of ev[0].roster) G.roster.set(r[0], { id: r[0], name: r[1], bot: !!r[2], team: r[3], color: r[4] });
  // adelanta la partida para que ya estén en el piso
  for (let i = 0; i < 80; i++) backdrop.update(0.1);
  backdrop.drain();
  for (const it of backdrop.items.values()) G.items.set(it.id, it);
  lootDirty = true;
}
function onSnapshotBackdrop() {
  const s = backdrop.snapshot(); const now = performance.now() / 1000;
  for (const ev of backdrop.drain()) { if (ev.t === 'lootAdd' || ev.t === 'lootDel') handleEvent(ev); if (ev.t === 'shot') { BR.spreadDirs(ev.w, ev.d, ev.sd).forEach((d, i) => addTracer(ev.x, ev.y, ev.z, d[0], d[1], d[2], ev.e[i] || 30, ev.w === 4)); const av = G.avatars.get(ev.o); if (av) av.flashT = 0.05; } }
  for (const a of s.f) {
    let e = G.ents.get(a[0]); if (!e) { e = { id: a[0], buf: [], run: 0 }; G.ents.set(a[0], e); }
    if (a[1] === -1) { if (e.alive) G.avatars.get(e.id)?.die(); e.alive = false; continue; }
    Object.assign(e, { alive: true, ph: a[9], w: a[10], reloading: !!a[17] });
    e.buf.push({ t: now, x: a[1], y: a[2], z: a[3], yaw: a[4], pitch: a[5], vx: a[13], vy: a[14], vz: a[15], g: a[16] }); if (e.buf.length > 4) e.buf.shift();
  }
  if (backdrop.state === 'end' || backdrop.aliveCount() < 4) startBackdrop();
}

/* ---------- Menú ---------- */
let currentTab = 'solo';
$('nameInput').value = settings.name || '';
function setTab(tab) {
  currentTab = tab;
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
  $('optsMatch').hidden = tab === 'join'; $('optsJoin').hidden = tab !== 'join';
  $('playLabel').textContent = tab === 'solo' ? 'Jugar ya' : tab === 'create' ? 'Crear sala' : 'Entrar a la sala';
  setNote(tab === 'solo' ? (settings.mode === 'duo' ? 'Partida offline: tú y un bot compañero contra 18 bots.' : 'Partida offline contra 19 bots. Funciona sin internet.') :
    tab === 'create' ? 'Creas un lobby con código. Tus amigos entran y tú inicias la partida.' : 'Pídele el código a quien creó la sala.');
}
document.querySelectorAll('#tabs button').forEach(b => b.addEventListener('click', () => setTab(b.dataset.tab)));
function bindChips(id, key, parse) {
  const el = $(id);
  const sync = () => el.querySelectorAll('button').forEach(b => b.classList.toggle('on', parse(b.dataset.v) === settings[key]));
  el.querySelectorAll('button').forEach(b => b.addEventListener('click', () => { settings[key] = parse(b.dataset.v); save(); sync(); setTab(currentTab); }));
  sync();
}
bindChips('modeChips', 'mode', v => v);
bindChips('diffChips', 'diff', v => +v);
$('codeInput').addEventListener('input', (e) => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4); });
$('playBtn').addEventListener('click', startFromMenu);
$('howBtn').addEventListener('click', () => show('how', true));
$('howClose').addEventListener('click', () => show('how', false));
// Lobby
$('lobbyMode').querySelectorAll('button').forEach(b => b.addEventListener('click', () => G.session && G.session.send({ t: 'set', mode: b.dataset.v })));
$('lobbyDiff').querySelectorAll('button').forEach(b => b.addEventListener('click', () => G.session && G.session.send({ t: 'set', diff: +b.dataset.v })));
$('startBtn').addEventListener('click', () => { audioInit(); if (isTouch) goFullscreen(); G.session && G.session.send({ t: 'start' }); });
$('lobbyLeave').addEventListener('click', () => backToMenu());
$('shareBtn').addEventListener('click', async () => {
  const url = location.origin + '/?sala=' + G.code;
  try {
    if (navigator.share) { await navigator.share({ title: 'Meiker Battle Royale', text: 'Entra a mi sala ' + G.code, url }); return; }
    await navigator.clipboard.writeText(url); $('lobbyNote').textContent = 'Link copiado. Pásaselo a tu parcero.';
  } catch (_) { $('lobbyNote').textContent = 'Código de la sala: ' + G.code; }
});
// Resultados
$('resAgain').addEventListener('click', () => {
  show('results', false);
  if (G.session && G.session.kind === 'online') { setScreen('lobby'); startBackdrop(); if (G.lobby) onLobby(G.lobby); }
  else { const n = settings.name; G.session && G.session.close(); const sess = offlineSession({ name: n || 'Jugador', mode: settings.mode, diff: settings.diff }); G.session = sess; G.myId = 1; onSnapshot(sess.match.snapshot(), sess.match.drain()); }
});
$('resMenu').addEventListener('click', () => backToMenu());
$('specLeave').addEventListener('click', () => {
  if (G.session && G.session.kind === 'online') { setScreen('lobby'); startBackdrop(); if (G.lobby) onLobby(G.lobby); }
  else showResults();
});
// Pausa
function syncToggles() { document.querySelectorAll('.toggle').forEach(b => b.classList.toggle('on', !!settings[b.dataset.set])); }
document.querySelectorAll('.toggle').forEach(b => b.addEventListener('click', () => {
  const k = b.dataset.set; settings[k] = !settings[k]; save(); syncToggles();
  if (k === 'hq') resize();
}));
syncToggles();
$('sensInput').value = settings.sens;
$('sensInput').addEventListener('input', (e) => { settings.sens = +e.target.value; save(); });
function togglePause(force) {
  if (G.screen !== 'match') return;
  const on = force != null ? force : $('pause').classList.contains('hidden');
  show('pause', on);
  G.paused = on && G.session && G.session.kind === 'offline';
  $('pauseInfo').textContent = G.session && G.session.kind === 'online' ? 'Ojo: la partida sigue corriendo para los demás.' : 'La partida está en pausa.';
  for (const k in keys) keys[k] = false; btn.fire = false; mouseDown = false; sticks.move = sticks.look = null; setAds(false);
  if (on && document.pointerLockElement) document.exitPointerLock();
}
$('pauseBtn').addEventListener('click', () => togglePause(true));
$('resumeBtn').addEventListener('click', () => togglePause(false));
$('quitBtn').addEventListener('click', () => {
  show('pause', false); G.paused = false;
  if (G.session && G.session.kind === 'online') { G.session.close(); }
  backToMenu();
});
document.addEventListener('visibilitychange', () => { if (document.hidden && G.screen === 'match' && G.session?.kind === 'offline') togglePause(true); });

function goFullscreen() {
  const el = document.documentElement;
  if (document.fullscreenElement || !el.requestFullscreen) return;
  el.requestFullscreen({ navigationUI: 'hide' }).then(() => { if (screen.orientation?.lock) screen.orientation.lock('landscape').catch(() => {}); }).catch(() => {});
}
let rotateSkipped = false;
function checkRotate() { show('rotate', isTouch && G.screen === 'match' && innerHeight > innerWidth && !rotateSkipped); }
$('rotateSkip').addEventListener('click', () => { rotateSkipped = true; checkRotate(); });

// Instalar como app
let installEvt = null;
const standalone = matchMedia('(display-mode: fullscreen)').matches || matchMedia('(display-mode: standalone)').matches || navigator.standalone;
const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvt = e; $('installBtn').hidden = false; });
if (isIOS && !standalone) $('installBtn').hidden = false;
$('installBtn').addEventListener('click', async () => {
  if (installEvt) { installEvt.prompt(); const r = await installEvt.userChoice.catch(() => null); if (r?.outcome === 'accepted') $('installBtn').hidden = true; installEvt = null; return; }
  if (isIOS) setNote('En iPhone: toca Compartir en Safari y luego "Agregar a inicio".');
});
if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('/sw.js').catch(() => {});

// Arranque
const sala = (new URLSearchParams(location.search).get('sala') || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
if (sala) { $('codeInput').value = sala; setTab('join'); setNote('Te invitaron a la sala ' + sala + '. Pon tu nombre y dale entrar.'); }
else setTab('solo');
if (!realTouch && !sala) setNote('Este juego está hecho para celular. En PC arrastra con el mouse como si fuera un dedo.');
resize();
startBackdrop();
requestAnimationFrame(frame);
window.__G = G;
window.__dbg = { tryFire: () => tryFire(), aim: (y, p) => { camYaw = y; camPitch = p; } };
