/* Meiker Battle Royale 3D — simulación compartida.
   La usa el servidor (salas online) y el navegador (partida solo contra bots).
   Unidades en metros. Eje Y hacia arriba; la isla ocupa x,z en [0, SIZE]. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BR = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const SIZE = 1200, EYE = 1.6, RAD = 0.45, HEIGHT = 1.8, MAX_PLAYERS = 20;
  const PLANE_Y = 280, PLANE_SPEED = 55;
  const PH = { PLANE: 0, FALL: 1, CHUTE: 2, GROUND: 3 };
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const num = (v, d) => (Number.isFinite(+v) ? +v : d);
  const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  // Ruido con enteros: da exactamente lo mismo en Node, Chrome y Safari
  function hash2(ix, iz, seed) {
    let h = (Math.imul(ix, 374761393) + Math.imul(iz, 668265263) + Math.imul(seed, 1442695041)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }
  function vnoise(x, z, seed) {
    const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz;
    const a = hash2(ix, iz, seed), b = hash2(ix + 1, iz, seed), c = hash2(ix, iz + 1, seed), d = hash2(ix + 1, iz + 1, seed);
    const ux = fx * fx * (3 - 2 * fx), uz = fz * fz * (3 - 2 * fz);
    return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
  }
  function fbm(x, z, seed) {
    let v = 0, amp = 0.5, f = 1;
    for (let i = 0; i < 4; i++) { v += amp * vnoise(x * f, z * f, seed + i * 17); f *= 2.03; amp *= 0.5; }
    return v / 0.9375;
  }

  const WEAPONS = [
    { key: 'pistol', name: 'Pistola', dmg: 20, rate: 0.32, spread: 0.018, pellets: 1, range: 120, ammo: 60, head: 1.8 },
    { key: 'smg', name: 'Subfusil', dmg: 13, rate: 0.085, spread: 0.045, pellets: 1, range: 80, ammo: 150, head: 1.5 },
    { key: 'shotgun', name: 'Escopeta', dmg: 12, rate: 0.95, spread: 0.11, pellets: 8, range: 35, ammo: 30, head: 1.25 },
    { key: 'rifle', name: 'Rifle de asalto', dmg: 21, rate: 0.12, spread: 0.022, pellets: 1, range: 220, ammo: 180, head: 1.7 },
    { key: 'sniper', name: 'Francotirador', dmg: 95, rate: 1.5, spread: 0.0015, pellets: 1, range: 600, ammo: 20, head: 2 },
  ];
  const RANK = [1, 2, 3, 5, 4]; // qué tan buena es cada arma (para bots)
  const LOOT = { MED: 10, SHIELD: 11, AMMO: 12 };
  const LOOT_NAMES = { 10: 'Botiquín', 11: 'Escudo', 12: 'Munición' };
  const DIFF = [
    { name: 'Fácil', err: 0.09, react: 0.8, rate: 1.7, range: 70 },
    { name: 'Normal', err: 0.05, react: 0.5, rate: 1.3, range: 110 },
    { name: 'Pro', err: 0.022, react: 0.28, rate: 1.05, range: 160 },
  ];
  const ZONE = [
    { wait: 95, shrink: 40, r: 520, dps: 1 },
    { wait: 50, shrink: 35, r: 320, dps: 2 },
    { wait: 45, shrink: 30, r: 180, dps: 4 },
    { wait: 40, shrink: 25, r: 90, dps: 6 },
    { wait: 30, shrink: 25, r: 35, dps: 9 },
    { wait: 25, shrink: 25, r: 0, dps: 14 },
  ];
  const TEAM_COLORS = ['#F5B50A', '#4FD1FF', '#FF6FAE', '#3DDC84', '#FF8A3D', '#B18CFF', '#F5F5F4', '#7CF2E0', '#FF5A5F', '#C9E265'];
  const BOT_NAMES = ['Pecoso', 'Mono', 'Flaco', 'Toño', 'Chepe', 'Nacho', 'Rolo', 'Paisa', 'Mancha', 'Gato', 'Pibe', 'Chucho', 'Lalo', 'Kike', 'Pelusa', 'Tato', 'Caliche', 'Juancho', 'Mafe', 'Lucho', 'Coco', 'Beto'];
  const TOWN_NAMES = ['Puerto Arepa', 'La Loma', 'Villa Mango', 'El Ventarrón', 'Pico Neblina', 'Playa Brava', 'Los Cauchos', 'San Tintico', 'Bahía Panela'];

  /* ---------- Isla aleatoria ---------- */
  function World(seed) {
    this.seed = seed >>> 0;
    const r = rng(seed);
    this.towns = [];
    for (let tries = 0; this.towns.length < 6 && tries < 400; tries++) {
      const x = SIZE / 2 + (r() - 0.5) * SIZE * 0.68, z = SIZE / 2 + (r() - 0.5) * SIZE * 0.68;
      const h = this.rawHeight(x, z);
      if (h < 4 || this.towns.some(t => Math.hypot(t.x - x, t.z - z) < 230)) continue;
      this.towns.push({ x, z, r: 45 + r() * 30, base: h, name: TOWN_NAMES[(this.towns.length + Math.floor(r() * 3)) % TOWN_NAMES.length] });
    }
    const used = new Set();
    this.towns.forEach(t => { while (used.has(t.name)) t.name = TOWN_NAMES[(TOWN_NAMES.indexOf(t.name) + 1) % TOWN_NAMES.length]; used.add(t.name); });

    this.boxes = []; this.buildings = []; this.trees = []; this.rocks = [];
    const lootSpots = [];
    for (const t of this.towns) {
      const n = 5 + Math.floor(r() * 5);
      for (let i = 0, tries = 0; i < n && tries < 80; tries++) {
        const a = r() * Math.PI * 2, d = r() * t.r * 0.85;
        const w = 8 + r() * 8, dd = 8 + r() * 7, h = 5 + Math.floor(r() * 2) * 3.5 + r() * 1.5;
        const x = t.x + Math.cos(a) * d, z = t.z + Math.sin(a) * d;
        const b = { minX: x - w / 2, maxX: x + w / 2, minZ: z - dd / 2, maxZ: z + dd / 2, minY: t.base - 1, maxY: t.base + h, type: 'b', hue: Math.floor(r() * 5) };
        if (this.buildings.some(o => b.minX < o.maxX + 7 && b.maxX > o.minX - 7 && b.minZ < o.maxZ + 7 && b.maxZ > o.minZ - 7)) continue;
        this.buildings.push(b); this.boxes.push(b); i++;
        const spots = 3 + Math.floor(r() * 3);
        for (let k = 0; k < spots; k++) {
          const side = Math.floor(r() * 4), off = r();
          let lx = side < 2 ? b.minX + off * w : (side === 2 ? b.minX - 2.2 : b.maxX + 2.2);
          let lz = side >= 2 ? b.minZ + off * dd : (side === 0 ? b.minZ - 2.2 : b.maxZ + 2.2);
          lootSpots.push({ x: lx, z: lz });
        }
      }
    }
    const land = (x, z) => this.rawHeight(x, z) > 2.5;
    const inTown = (x, z, m) => this.towns.some(t => Math.hypot(t.x - x, t.z - z) < t.r + m);
    for (let i = 0, tries = 0; i < 70 && tries < 2000; tries++) {
      const x = 40 + r() * (SIZE - 80), z = 40 + r() * (SIZE - 80);
      if (!land(x, z) || inTown(x, z, 4)) continue;
      const s = 1.4 + r() * 2.2, h = this.heightAt(x, z);
      const rock = { minX: x - s / 2, maxX: x + s / 2, minZ: z - s / 2, maxZ: z + s / 2, minY: h - 1, maxY: h + s * 0.75, type: 'r', s };
      this.rocks.push(rock); this.boxes.push(rock); i++;
    }
    for (let i = 0, tries = 0; i < 280 && tries < 4000; tries++) {
      const x = 30 + r() * (SIZE - 60), z = 30 + r() * (SIZE - 60);
      if (!land(x, z) || inTown(x, z, 10)) continue;
      const h = this.heightAt(x, z), s = 0.8 + r() * 0.6;
      const tree = { minX: x - 0.35, maxX: x + 0.35, minZ: z - 0.35, maxZ: z + 0.35, minY: h - 0.5, maxY: h + 9 * s, type: 't', s, x, z };
      this.trees.push(tree); this.boxes.push(tree); i++;
    }
    for (let i = 0, tries = 0; i < 45 && tries < 1000; tries++) {
      const x = 40 + r() * (SIZE - 80), z = 40 + r() * (SIZE - 80);
      if (!land(x, z) || this.blocked(x, z)) continue;
      lootSpots.push({ x, z }); i++;
    }
    this.lootSpots = lootSpots.filter(s => s.x > 10 && s.x < SIZE - 10 && s.z > 10 && s.z < SIZE - 10 && !this.blocked(s.x, s.z) && this.heightAt(s.x, s.z) > 0.5);
    // Rejilla para buscar obstáculos rápido
    this.cell = 32; this.gn = Math.ceil(SIZE / this.cell); this.grid = [];
    for (let i = 0; i < this.gn * this.gn; i++) this.grid.push([]);
    this.boxes.forEach((b, i) => {
      const x0 = clamp(Math.floor(b.minX / this.cell), 0, this.gn - 1), x1 = clamp(Math.floor(b.maxX / this.cell), 0, this.gn - 1);
      const z0 = clamp(Math.floor(b.minZ / this.cell), 0, this.gn - 1), z1 = clamp(Math.floor(b.maxZ / this.cell), 0, this.gn - 1);
      for (let gx = x0; gx <= x1; gx++) for (let gz = z0; gz <= z1; gz++) this.grid[gx * this.gn + gz].push(i);
    });
  }
  World.prototype.rawHeight = function (x, z) {
    const n = fbm(x / 230, z / 230, this.seed);
    const ridge = vnoise(x / 90, z / 90, this.seed + 99);
    const dx = (x - SIZE / 2) / (SIZE / 2), dz = (z - SIZE / 2) / (SIZE / 2);
    const d = Math.sqrt(dx * dx + dz * dz);
    const mask = 1 - smooth(0.68, 0.98, d);
    return (Math.pow(n, 1.6) * 46 + ridge * 4 + 3) * mask - (1 - mask) * 9;
  };
  World.prototype.heightAt = function (x, z) {
    let h = this.rawHeight(x, z);
    for (const t of this.towns) {
      const d = Math.hypot(t.x - x, t.z - z);
      if (d < t.r + 35) { const w = 1 - smooth(t.r, t.r + 35, d); h = h * (1 - w) + t.base * w; }
    }
    return h;
  };
  // Punto de tierra firme más cercano yendo hacia el centro de la isla
  World.prototype.toLand = function (x, z) {
    const dx = SIZE / 2 - x, dz = SIZE / 2 - z, d = Math.hypot(dx, dz) || 1;
    for (let i = 0; i < 200 && this.heightAt(x, z) < 0.6; i++) { x += dx / d * 4; z += dz / d * 4; }
    return { x, z };
  };
  World.prototype.near = function (x, z, out) {
    out.length = 0;
    const gx = clamp(Math.floor(x / this.cell), 0, this.gn - 1), gz = clamp(Math.floor(z / this.cell), 0, this.gn - 1);
    for (let i = gx - 1; i <= gx + 1; i++) for (let j = gz - 1; j <= gz + 1; j++) {
      if (i < 0 || j < 0 || i >= this.gn || j >= this.gn) continue;
      for (const k of this.grid[i * this.gn + j]) if (out.indexOf(k) < 0) out.push(k);
    }
    return out;
  };
  const tmpNear = [];
  World.prototype.blocked = function (x, z) {
    for (const k of this.near(x, z, tmpNear)) {
      const b = this.boxes[k];
      if (x > b.minX - 1 && x < b.maxX + 1 && z > b.minZ - 1 && z < b.maxZ + 1) return true;
    }
    return false;
  };
  World.prototype.collide = function (f) {
    for (const k of this.near(f.x, f.z, tmpNear)) {
      const b = this.boxes[k];
      if (f.y + HEIGHT <= b.minY || f.y >= b.maxY - 0.05) continue;
      const cx = clamp(f.x, b.minX, b.maxX), cz = clamp(f.z, b.minZ, b.maxZ);
      let dx = f.x - cx, dz = f.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= RAD * RAD) continue;
      if (d2 > 1e-8) { const d = Math.sqrt(d2); f.x = cx + dx / d * RAD; f.z = cz + dz / d * RAD; }
      else {
        const pen = [f.x - b.minX, b.maxX - f.x, f.z - b.minZ, b.maxZ - f.z];
        const m = pen.indexOf(Math.min(...pen));
        if (m === 0) f.x = b.minX - RAD; else if (m === 1) f.x = b.maxX + RAD; else if (m === 2) f.z = b.minZ - RAD; else f.z = b.maxZ + RAD;
      }
    }
  };
  function rayBox(ox, oy, oz, dx, dy, dz, b, maxD) {
    let t0 = 0, t1 = maxD;
    const o = [ox, oy, oz], d = [dx, dy, dz], mn = [b.minX, b.minY, b.minZ], mx = [b.maxX, b.maxY, b.maxZ];
    for (let i = 0; i < 3; i++) {
      if (Math.abs(d[i]) < 1e-9) { if (o[i] < mn[i] || o[i] > mx[i]) return -1; continue; }
      let a = (mn[i] - o[i]) / d[i], c = (mx[i] - o[i]) / d[i];
      if (a > c) { const s = a; a = c; c = s; }
      if (a > t0) t0 = a; if (c < t1) t1 = c;
      if (t0 > t1) return -1;
    }
    return t0;
  }
  function raySphere(ox, oy, oz, dx, dy, dz, cx, cy, cz, r) {
    const lx = cx - ox, ly = cy - oy, lz = cz - oz;
    const tc = lx * dx + ly * dy + lz * dz;
    if (tc < 0) return -1;
    const d2 = lx * lx + ly * ly + lz * lz - tc * tc;
    if (d2 > r * r) return -1;
    return tc - Math.sqrt(r * r - d2);
  }
  // Distancia hasta el primer obstáculo (edificios, rocas, árboles o terreno)
  World.prototype.rayWorld = function (ox, oy, oz, dx, dy, dz, maxD) {
    let best = maxD;
    const ex = ox + dx * maxD, ez = oz + dz * maxD;
    const minX = Math.min(ox, ex) - 1, maxX = Math.max(ox, ex) + 1, minZ = Math.min(oz, ez) - 1, maxZ = Math.max(oz, ez) + 1;
    for (const b of this.boxes) {
      if (b.maxX < minX || b.minX > maxX || b.maxZ < minZ || b.minZ > maxZ) continue;
      const t = rayBox(ox, oy, oz, dx, dy, dz, b, best);
      if (t >= 0 && t < best) best = t;
    }
    const step = 2;
    let prevT = 0;
    for (let t = step; t <= best; t += step) {
      const y = oy + dy * t;
      if (y < this.heightAt(ox + dx * t, oz + dz * t)) {
        let lo = prevT, hi = t;
        for (let i = 0; i < 5; i++) { const m = (lo + hi) / 2; if (oy + dy * m < this.heightAt(ox + dx * m, oz + dz * m)) hi = m; else lo = m; }
        return Math.min(best, lo);
      }
      prevT = t;
      if (y > 120 && dy >= 0) break;
    }
    return best;
  };
  World.prototype.canSee = function (ax, ay, az, bx, by, bz) {
    const dx = bx - ax, dy = by - ay, dz = bz - az, d = Math.hypot(dx, dy, dz);
    if (d < 0.01) return true;
    return this.rayWorld(ax, ay, az, dx / d, dy / d, dz / d, d) >= d - 0.3;
  };
  function rayFighters(fighters, ox, oy, oz, dx, dy, dz, maxD, skip) {
    let best = maxD, hit = null, head = false;
    for (const f of fighters) {
      if (!f.alive || skip(f)) continue;
      const qx = f.x - ox, qz = f.z - oz;
      if (qx * qx + qz * qz > (best + 2) * (best + 2)) continue;
      let t = raySphere(ox, oy, oz, dx, dy, dz, f.x, f.y + 1.6, f.z, 0.25);
      if (t >= 0 && t < best) { best = t; hit = f; head = true; }
      for (const [cy, rr] of [[1.1, 0.42], [0.5, 0.4]]) {
        t = raySphere(ox, oy, oz, dx, dy, dz, f.x, f.y + cy, f.z, rr);
        if (t >= 0 && t < best) { best = t; hit = f; head = false; }
      }
    }
    return { d: best, f: hit, head };
  }

  /* ---------- Movimiento ---------- */
  function dirFrom(yaw, pitch) {
    const c = Math.cos(pitch);
    return [-Math.sin(yaw) * c, Math.sin(pitch), -Math.cos(yaw) * c];
  }
  function spreadDirs(wIdx, d, seed) {
    const w = WEAPONS[wIdx], r = rng(seed), out = [];
    // base ortonormal alrededor de d
    let ux = -d[2], uy = 0, uz = d[0]; let ul = Math.hypot(ux, uz) || 1; ux /= ul; uz /= ul;
    const vx = d[1] * uz - d[2] * uy, vy = d[2] * ux - d[0] * uz, vz = d[0] * uy - d[1] * ux;
    for (let i = 0; i < w.pellets; i++) {
      const a = r() * Math.PI * 2, s = Math.sqrt(r()) * w.spread;
      const p = Math.cos(a) * s, q = Math.sin(a) * s;
      let x = d[0] + ux * p + vx * q, y = d[1] + uy * p + vy * q, z = d[2] + uz * p + vz * q;
      const l = Math.hypot(x, y, z); out.push([x / l, y / l, z / l]);
    }
    return out;
  }
  function planePos(plane, t) {
    const k = clamp(t / plane.dur, 0, 1);
    return { x: plane.ax + (plane.bx - plane.ax) * k, y: PLANE_Y, z: plane.az + (plane.bz - plane.az) * k };
  }
  function makeFighter(id, name, bot, team, color) {
    return {
      id, name, bot: !!bot, team, color, x: SIZE / 2, y: PLANE_Y, z: SIZE / 2, vx: 0, vy: 0, vz: 0, yaw: 0, pitch: 0,
      hp: 100, sh: 0, alive: true, ph: PH.PLANE, slots: [-1, -1], ammo: [0, 0], cur: 0, meds: 0, shields: 0, iv: 0,
      kills: 0, life: 1, lastShot: -9, budget: 1, budgetT: 0, jumpHeld: false, chuteHeld: false, grounded: false,
      place: 0, useT: 0, ai: null, run: 0, dmgDone: 0,
    };
  }
  // Paso de física de un jugador. inp: {mx, mz, jump, chute}; yaw/pitch ya vienen en f
  function stepFighter(f, inp, dt, world, fx) {
    const sy = Math.sin(f.yaw), cy = Math.cos(f.yaw);
    let mx = clamp(num(inp.mx, 0), -1, 1), mz = clamp(num(inp.mz, 0), -1, 1);
    const ml = Math.hypot(mx, mz); if (ml > 1) { mx /= ml; mz /= ml; }
    const wx = -sy * mz + cy * mx, wz = -cy * mz - sy * mx;
    const jumpEdge = inp.jump && !f.jumpHeld; f.jumpHeld = !!inp.jump;
    const chuteEdge = inp.chute && !f.chuteHeld; f.chuteHeld = !!inp.chute;
    const approach = (v, t, a) => (v < t ? Math.min(v + a, t) : Math.max(v - a, t));
    if (f.ph === PH.PLANE) return;
    const ground = world.heightAt(f.x, f.z);
    if (f.ph === PH.FALL) {
      f.vx = approach(f.vx, wx * 24, 40 * dt); f.vz = approach(f.vz, wz * 24, 40 * dt);
      f.vy = approach(f.vy, mz > 0.3 ? -58 : -42, 60 * dt);
      if (f.y - ground < 110 || (chuteEdge && f.y - ground < 230)) { f.ph = PH.CHUTE; fx && fx('chute', f); }
    } else if (f.ph === PH.CHUTE) {
      f.vx = approach(f.vx, wx * 12, 20 * dt); f.vz = approach(f.vz, wz * 12, 20 * dt);
      f.vy = approach(f.vy, mz > 0.3 ? -14 : -10, 40 * dt);
    } else {
      const sp = 6.4, a = f.grounded ? 60 : 14;
      f.vx = approach(f.vx, wx * sp, a * dt); f.vz = approach(f.vz, wz * sp, a * dt);
      if (jumpEdge && f.grounded) { f.vy = 7.2; f.grounded = false; fx && fx('jump', f); }
      f.vy -= 22 * dt;
    }
    const px = f.x, pz = f.z;
    f.x = clamp(f.x + f.vx * dt, 4, SIZE - 4);
    f.z = clamp(f.z + f.vz * dt, 4, SIZE - 4);
    if (f.ph === PH.GROUND && world.heightAt(f.x, f.z) < 0.3) { f.x = px; f.z = pz; f.vx = 0; f.vz = 0; }
    f.y += f.vy * dt;
    const g = world.heightAt(f.x, f.z);
    if (f.ph === PH.GROUND) {
      if (f.y <= g || (f.grounded && f.vy <= 0 && f.y - g < 0.6)) { f.y = g; f.vy = 0; f.grounded = true; }
      else f.grounded = false;
      if (f.grounded) f.run += Math.hypot(f.vx, f.vz) * dt;
    } else if (f.y <= g + 0.05) {
      if (g < 0.6) { const l = world.toLand(f.x, f.z); f.x = l.x; f.z = l.z; }
      f.y = world.heightAt(f.x, f.z); f.vy = 0; f.vx = 0; f.vz = 0; f.ph = PH.GROUND; f.grounded = true; fx && fx('land', f);
    }
    if (f.ph !== PH.FALL) world.collide(f);
  }

  /* ---------- Partida ---------- */
  // opts: { mode:'solo'|'duo', diff, seed, humans:[{id,name}], botStart }
  function Match(opts) {
    this.mode = opts.mode === 'duo' ? 'duo' : 'solo';
    this.diff = clamp(Math.round(num(opts.diff, 1)), 0, 2);
    this.seed = (opts.seed != null ? opts.seed : Math.random() * 4294967295) >>> 0;
    this.world = new World(this.seed);
    this.fighters = new Map(); this.items = new Map(); this.events = [];
    this.time = 0; this.planeT = 0; this.state = 'plane'; this.nextItem = 1; this.endT = 0; this.winner = -1;
    const r = rng(this.seed ^ 0x9e3779b9);
    const ang = r() * Math.PI * 2, cx = SIZE / 2 + (r() - 0.5) * 300, cz = SIZE / 2 + (r() - 0.5) * 300;
    const dx = Math.cos(ang), dz = Math.sin(ang), L = 720;
    this.plane = { ax: clamp(cx - dx * L, 0, SIZE), az: clamp(cz - dz * L, 0, SIZE), bx: clamp(cx + dx * L, 0, SIZE), bz: clamp(cz + dz * L, 0, SIZE) };
    this.plane.dur = Math.hypot(this.plane.bx - this.plane.ax, this.plane.bz - this.plane.az) / PLANE_SPEED;
    this.zone = { cx: SIZE / 2, cz: SIZE / 2, r: SIZE * 0.75, tx: SIZE / 2, tz: SIZE / 2, tr: SIZE * 0.75, stage: -1, t: 0, shrinking: false, fromX: 0, fromZ: 0, fromR: 0, dps: 0 };
    this.nextZone();
    // Jugadores y equipos
    const humans = (opts.humans || []).slice(0, MAX_PLAYERS);
    const per = this.mode === 'duo' ? 2 : 1;
    let team = 0, inTeam = 0;
    const nextTeam = () => { if (inTeam >= per) { team++; inTeam = 0; } inTeam++; return team; };
    for (const h of humans) {
      const t = nextTeam();
      const f = makeFighter(h.id, cleanName(h.name), false, t, TEAM_COLORS[t % TEAM_COLORS.length]);
      this.fighters.set(f.id, f);
    }
    const usedNames = new Set();
    let botId = opts.botStart || 1000;
    while (this.fighters.size < MAX_PLAYERS) {
      const t = nextTeam();
      let n; do { n = BOT_NAMES[Math.floor(r() * BOT_NAMES.length)]; } while (usedNames.has(n) && usedNames.size < BOT_NAMES.length);
      usedNames.add(n);
      const f = makeFighter(botId++, n, true, t, TEAM_COLORS[t % TEAM_COLORS.length]);
      this.fighters.set(f.id, f);
    }
    for (const f of this.fighters.values()) { const p = planePos(this.plane, 0); f.x = p.x; f.y = p.y; f.z = p.z; }
    // Botín inicial
    for (const s of this.world.lootSpots) if (r() < 0.82) this.addItem(this.randomKind(r), s.x, s.z, true);
    this.events.push({ t: 'start', seed: this.seed, mode: this.mode, plane: this.plane, roster: this.roster(), loot: this.lootList() });
  }
  function cleanName(n) { return String(n || '').replace(/[^\p{L}\p{N} _.-]/gu, '').trim().slice(0, 14) || 'Jugador'; }
  Match.prototype.roster = function () { return [...this.fighters.values()].map(f => [f.id, f.name, f.bot ? 1 : 0, f.team, f.color]); };
  Match.prototype.randomKind = function (r) {
    const v = r();
    if (v < 0.13) return 0; if (v < 0.27) return 1; if (v < 0.39) return 2; if (v < 0.52) return 3; if (v < 0.58) return 4;
    if (v < 0.74) return LOOT.MED; if (v < 0.86) return LOOT.SHIELD; return LOOT.AMMO;
  };
  Match.prototype.addItem = function (kind, x, z, silent, amt) {
    const id = this.nextItem++;
    const it = { id, k: kind, x: Math.round(x * 10) / 10, z: Math.round(z * 10) / 10, y: Math.round(this.world.heightAt(x, z) * 10) / 10, a: amt != null ? amt : (kind < 10 ? WEAPONS[kind].ammo : 1) };
    this.items.set(id, it);
    if (!silent) this.events.push({ t: 'lootAdd', l: [[it.id, it.k, it.x, it.y, it.z, it.a]] });
    return it;
  };
  Match.prototype.removeItem = function (id) { if (this.items.delete(id)) this.events.push({ t: 'lootDel', ids: [id] }); };
  Match.prototype.lootList = function () { return [...this.items.values()].map(it => [it.id, it.k, it.x, it.y, it.z, it.a]); };
  Match.prototype.isEnemy = function (a, b) { return a !== b && a.team !== b.team; };
  Match.prototype.nextZone = function () {
    const z = this.zone;
    z.stage++;
    const st = ZONE[Math.min(z.stage, ZONE.length - 1)];
    z.fromX = z.cx; z.fromZ = z.cz; z.fromR = z.r;
    const r = rng(this.seed + z.stage * 7919);
    const maxOff = Math.max(0, z.r - st.r) * 0.85;
    let tx, tz;
    for (let i = 0; i < 30; i++) {
      const a = r() * Math.PI * 2, d = Math.sqrt(r()) * maxOff;
      tx = z.cx + Math.cos(a) * d; tz = z.cz + Math.sin(a) * d;
      if (this.world.heightAt(tx, tz) > 1.5) break;
    }
    z.tx = clamp(tx, 80, SIZE - 80); z.tz = clamp(tz, 80, SIZE - 80); z.tr = st.r;
    z.t = st.wait; z.shrinking = false; z.dps = st.dps;
    if (z.stage > 0) this.events.push({ t: 'zone', s: z.stage });
  };
  Match.prototype.updateZone = function (dt) {
    const z = this.zone;
    if (z.stage >= ZONE.length) return;
    z.t -= dt;
    const st = ZONE[Math.min(z.stage, ZONE.length - 1)];
    if (!z.shrinking) {
      if (z.t <= 0) { z.shrinking = true; z.t = st.shrink; this.events.push({ t: 'zoneMove' }); }
    } else {
      const k = 1 - clamp(z.t / st.shrink, 0, 1);
      z.cx = z.fromX + (z.tx - z.fromX) * k; z.cz = z.fromZ + (z.tz - z.fromZ) * k; z.r = z.fromR + (z.tr - z.fromR) * k;
      if (z.t <= 0) { z.cx = z.tx; z.cz = z.tz; z.r = z.tr; if (z.stage < ZONE.length - 1) this.nextZone(); else z.t = 9999; }
    }
  };
  Match.prototype.outside = function (f) { return Math.hypot(f.x - this.zone.cx, f.z - this.zone.cz) > this.zone.r; };

  Match.prototype.damage = function (t, amount, by, w, head) {
    if (!t.alive || this.state === 'end') return;
    amount = Math.round(amount);
    const s = Math.min(t.sh, amount);
    t.sh -= s; t.hp -= amount - s;
    if (by) by.dmgDone += amount;
    if (t.bot && by) { t.ai = t.ai || {}; t.ai.attacker = by.id; t.ai.t = 0; }
    this.events.push({ t: 'hit', id: t.id, by: by ? by.id : 0, d: amount, h: head ? 1 : 0, s: s > 0 ? 1 : 0 });
    if (t.hp <= 0) this.kill(t, by, w, head);
  };
  Match.prototype.kill = function (v, k, w, head) {
    v.alive = false; v.hp = 0;
    if (k && k !== v) k.kills++;
    // Deja todo su botín en el piso
    const drops = [];
    v.slots.forEach((s, i) => { if (s >= 0) drops.push([s, Math.max(v.ammo[i], 10)]); });
    if (v.meds) drops.push([LOOT.MED, v.meds]);
    if (v.shields) drops.push([LOOT.SHIELD, v.shields]);
    const added = [];
    drops.forEach((d, i) => {
      const a = (i / Math.max(1, drops.length)) * Math.PI * 2;
      let x = v.x + Math.cos(a) * 1.4, z = v.z + Math.sin(a) * 1.4;
      if (this.world.heightAt(x, z) < 0.5) { x = v.x; z = v.z; }
      const it = this.addItem(d[0], x, z, true, d[1]); added.push([it.id, it.k, it.x, it.y, it.z, it.a]);
    });
    if (added.length) this.events.push({ t: 'lootAdd', l: added });
    v.slots = [-1, -1]; v.ammo = [0, 0]; v.meds = 0; v.shields = 0; v.iv++;
    const aliveTeams = this.aliveTeams();
    if (![...this.fighters.values()].some(f => f.alive && f.team === v.team)) {
      const place = aliveTeams.size + 1;
      for (const f of this.fighters.values()) if (f.team === v.team) f.place = place;
    }
    this.events.push({ t: 'kill', k: k && k !== v ? k.id : 0, v: v.id, w: w == null ? -1 : w, h: head ? 1 : 0, left: this.aliveCount() });
    if (aliveTeams.size <= 1) this.endMatch(aliveTeams);
  };
  Match.prototype.aliveTeams = function () { const s = new Set(); for (const f of this.fighters.values()) if (f.alive) s.add(f.team); return s; };
  Match.prototype.aliveCount = function () { let n = 0; for (const f of this.fighters.values()) if (f.alive) n++; return n; };
  Match.prototype.endMatch = function (teams) {
    if (this.state === 'end') return;
    this.state = 'end'; this.endT = 12;
    this.winner = teams.size ? [...teams][0] : -1;
    for (const f of this.fighters.values()) if (f.team === this.winner) f.place = 1;
    this.events.push({ t: 'end', wt: this.winner });
  };
  Match.prototype.removeHuman = function (id) {
    const f = this.fighters.get(id);
    if (f && f.alive) this.kill(f, null, -2, false);
  };

  // Disparo validado (humanos y bots usan lo mismo)
  Match.prototype.fire = function (f, o, d, seed, fromClient) {
    if (!f.alive || f.ph !== PH.GROUND || this.state === 'end') return false;
    const slot = f.cur, wIdx = f.slots[slot];
    if (wIdx < 0 || f.ammo[slot] <= 0) return false;
    const w = WEAPONS[wIdx];
    if (fromClient) {
      f.budget = Math.min(2.5, f.budget + (this.time - f.budgetT) / w.rate); f.budgetT = this.time;
      if (f.budget < 0.8) return false;
      f.budget -= 1;
      if (Math.hypot(o[0] - f.x, o[1] - (f.y + EYE), o[2] - f.z) > 3) { o = [f.x, f.y + EYE, f.z]; }
    } else if (this.time - f.lastShot < w.rate) return false;
    f.lastShot = this.time;
    f.ammo[slot]--;
    const dl = Math.hypot(d[0], d[1], d[2]) || 1; d = [d[0] / dl, d[1] / dl, d[2] / dl];
    const dirs = spreadDirs(wIdx, d, seed);
    const hits = new Map(), ends = [];
    const skip = (t) => t === f || t.team === f.team;
    const list = [...this.fighters.values()];
    for (const p of dirs) {
      const dw = this.world.rayWorld(o[0], o[1], o[2], p[0], p[1], p[2], w.range);
      const hf = rayFighters(list, o[0], o[1], o[2], p[0], p[1], p[2], dw, skip);
      ends.push(Math.round(hf.d * 10) / 10);
      if (hf.f) {
        const h = hits.get(hf.f) || { dmg: 0, head: false };
        h.dmg += w.dmg * (hf.head ? w.head : 1); h.head = h.head || hf.head;
        hits.set(hf.f, h);
      }
    }
    this.events.push({ t: 'shot', o: f.id, x: +o[0].toFixed(2), y: +o[1].toFixed(2), z: +o[2].toFixed(2), d: d.map(v => +v.toFixed(4)), w: wIdx, sd: seed, e: ends });
    for (const [t, h] of hits) this.damage(t, h.dmg, f, wIdx, h.head);
    return true;
  };
  Match.prototype.pickup = function (f, it, swap) {
    if (!f.alive || f.ph !== PH.GROUND || !it || Math.hypot(f.x - it.x, f.z - it.z) > 3) return false;
    if (it.k < 10) {
      const same = f.slots.indexOf(it.k);
      if (same >= 0) { f.ammo[same] = Math.min(WEAPONS[it.k].ammo * 1.5, f.ammo[same] + it.a); }
      else {
        let slot = f.slots.indexOf(-1);
        if (slot < 0) {
          if (!swap) return false;
          slot = f.cur;
          if (f.bot) slot = RANK[f.slots[0]] <= RANK[f.slots[1]] ? 0 : 1;
          this.addItem(f.slots[slot], f.x + 0.8, f.z + 0.8, false, f.ammo[slot]);
        }
        f.slots[slot] = it.k; f.ammo[slot] = it.a;
        if (f.slots[f.cur] < 0 || f.bot) f.cur = slot;
      }
    } else if (it.k === LOOT.MED) { if (f.meds >= 5) return false; f.meds = Math.min(5, f.meds + it.a); }
    else if (it.k === LOOT.SHIELD) { if (f.shields >= 3) return false; f.shields = Math.min(3, f.shields + it.a); }
    else if (it.k === LOOT.AMMO) {
      if (!f.slots.some(s => s >= 0)) return false;
      f.slots.forEach((s, i) => { if (s >= 0) f.ammo[i] = Math.min(WEAPONS[s].ammo * 1.5, f.ammo[i] + Math.ceil(WEAPONS[s].ammo * 0.5)); });
    }
    f.iv++;
    this.removeItem(it.id);
    this.events.push({ t: 'pick', id: f.id, k: it.k });
    return true;
  };
  Match.prototype.use = function (f, what) {
    if (!f.alive || this.time - f.useT < 1.2) return false;
    if (what === 'med' && f.meds > 0 && f.hp < 100) { f.meds--; f.hp = Math.min(100, f.hp + 50); }
    else if (what === 'shield' && f.shields > 0 && f.sh < 100) { f.shields--; f.sh = Math.min(100, f.sh + 50); }
    else return false;
    f.useT = this.time; f.iv++;
    this.events.push({ t: 'use', id: f.id, k: what });
    return true;
  };

  /* Mensajes de jugadores humanos */
  Match.prototype.onState = function (id, m) {
    const f = this.fighters.get(id);
    if (!f || !f.alive || !m || num(m.l, -1) !== f.life) return;
    const ph = clamp(Math.round(num(m.ph, f.ph)), 0, 3);
    if (ph < f.ph) return;
    if (f.ph === PH.PLANE && ph > PH.PLANE) { const p = planePos(this.plane, this.planeT); f.x = p.x; f.y = p.y; f.z = p.z; }
    f.ph = ph;
    if (ph === PH.PLANE) return;
    f.x = clamp(num(m.x, f.x), 0, SIZE); f.z = clamp(num(m.z, f.z), 0, SIZE); f.y = clamp(num(m.y, f.y), -20, PLANE_Y + 10);
    f.vx = num(m.vx, 0); f.vy = num(m.vy, 0); f.vz = num(m.vz, 0);
    f.yaw = num(m.yw, f.yaw); f.pitch = clamp(num(m.pt, f.pitch), -1.5, 1.5);
    f.grounded = !!m.g;
  };
  Match.prototype.onFire = function (id, m) {
    const f = this.fighters.get(id);
    if (!f || !m || num(m.l, -1) !== f.life || !Array.isArray(m.o) || !Array.isArray(m.d)) return;
    const o = m.o.slice(0, 3).map(v => num(v, 0)), d = m.d.slice(0, 3).map(v => num(v, 0));
    if (Number.isInteger(m.c) && (m.c === 0 || m.c === 1)) f.cur = m.c;
    this.fire(f, o, d, num(m.sd, 1) >>> 0, true);
  };
  Match.prototype.onPick = function (id, m) { const f = this.fighters.get(id); if (f) this.pickup(f, this.items.get(num(m.i, -1)), true); };
  Match.prototype.onUse = function (id, m) { const f = this.fighters.get(id); if (f) this.use(f, m.k === 'shield' ? 'shield' : 'med'); };
  Match.prototype.onSlot = function (id, m) { const f = this.fighters.get(id); if (f && (m.c === 0 || m.c === 1)) f.cur = m.c; };

  /* ---------- Bots ---------- */
  const near2 = [];
  Match.prototype.updateBot = function (b, dt) {
    const D = DIFF[this.diff], W = this.world;
    const ai = b.ai || (b.ai = {});
    if (ai.jumpAt == null) {
      ai.jumpAt = this.plane.dur * (0.12 + Math.random() * 0.78);
      const t = W.towns[Math.floor(Math.random() * W.towns.length)];
      ai.land = Math.random() < 0.75 && t ? { x: t.x + (Math.random() - 0.5) * t.r, z: t.z + (Math.random() - 0.5) * t.r } : { x: 100 + Math.random() * (SIZE - 200), z: 100 + Math.random() * (SIZE - 200) };
      Object.assign(ai, { t: 0, target: null, goal: null, strafe: 1, strafeT: 0, seen: 0, stuckT: 0, lx: b.x, lz: b.z, avoid: 0, avoidT: 0, errT: 0, ex: 0, ey: 0, wander: null });
    }
    const inp = { mx: 0, mz: 0, jump: false, chute: false };
    if (b.ph === PH.PLANE) { if (this.planeT >= ai.jumpAt) b.ph = PH.FALL; return; }
    if (b.ph === PH.FALL || b.ph === PH.CHUTE) {
      const dx = ai.land.x - b.x, dz = ai.land.z - b.z;
      b.yaw = Math.atan2(-dx, -dz);
      inp.mz = Math.hypot(dx, dz) > 6 ? 1 : 0;
      if (b.ph === PH.FALL && Math.hypot(dx, dz) > 300) inp.mz = 0.2;
      stepFighter(b, inp, dt, W);
      return;
    }
    if (this.state === 'end') { stepFighter(b, inp, dt, W); return; }
    ai.t -= dt; ai.strafeT -= dt; ai.avoidT -= dt; ai.errT -= dt;
    const eyeY = b.y + EYE;
    if (ai.t <= 0) {
      ai.t = 0.3 + Math.random() * 0.2;
      // Rival visible más cercano
      const cands = [];
      for (const e of this.fighters.values()) {
        if (!e.alive || !this.isEnemy(b, e) || e.ph === PH.PLANE) continue;
        const d = Math.hypot(e.x - b.x, e.z - b.z, e.y - b.y);
        if (d < D.range || e.id === ai.attacker) cands.push([d - (e.id === ai.attacker ? 60 : 0), e]);
      }
      cands.sort((a, c) => a[0] - c[0]);
      ai.target = null;
      for (const [, e] of cands.slice(0, 3)) if (W.canSee(b.x, eyeY, b.z, e.x, e.y + 1.2, e.z)) { ai.target = e.id; break; }
      // Objetivo de movimiento
      const z = this.zone, zr = z.shrinking ? z.r : Math.min(z.r, z.tr + 30);
      const zx = z.shrinking ? z.cx : z.tx, zz = z.shrinking ? z.cz : z.tz;
      const outside = Math.hypot(b.x - zx, b.z - zz) > zr * 0.85;
      ai.goal = null;
      if (outside) ai.goal = { x: zx + (Math.random() - 0.5) * zr * 0.4, z: zz + (Math.random() - 0.5) * zr * 0.4, zone: true };
      else {
        const want = (k) => (k < 10 && (b.slots.includes(-1) || RANK[k] > Math.min(RANK[b.slots[0]] || 0, RANK[b.slots[1]] || 0)) && !b.slots.includes(k)) ||
          (k === LOOT.MED && b.meds < 3) || (k === LOOT.SHIELD && b.shields < 2) || (k === LOOT.AMMO && b.slots.some((s, i) => s >= 0 && b.ammo[i] < WEAPONS[s].ammo * 0.4));
        let best = null, bd = 70;
        for (const it of this.items.values()) {
          const d = Math.abs(it.x - b.x) + Math.abs(it.z - b.z);
          if (d < bd && want(it.k)) { bd = d; best = it; }
        }
        if (best) ai.goal = { x: best.x, z: best.z, item: best.id };
        else {
          if (!ai.wander || Math.hypot(ai.wander.x - b.x, ai.wander.z - b.z) < 6) {
            const a = Math.random() * Math.PI * 2, d = Math.random() * zr * 0.6;
            ai.wander = { x: clamp(zx + Math.cos(a) * d, 20, SIZE - 20), z: clamp(zz + Math.sin(a) * d, 20, SIZE - 20) };
          }
          ai.goal = ai.wander;
        }
      }
      // Mejor arma para la distancia
      const tgt0 = ai.target != null ? this.fighters.get(ai.target) : null;
      if (b.slots[0] >= 0 && b.slots[1] >= 0 && tgt0) {
        const d = Math.hypot(tgt0.x - b.x, tgt0.z - b.z);
        const score = (s, i) => (b.ammo[i] > 0 ? 1 : -9) + (d < 15 ? (s === 2 ? 3 : s === 1 ? 2 : 0) : d > 80 ? (s === 4 ? 3 : s === 3 ? 2 : 0) : (s === 3 ? 3 : s === 1 ? 2 : 0));
        b.cur = score(b.slots[0], 0) >= score(b.slots[1], 1) ? 0 : 1;
      } else if (b.slots[b.cur] < 0 || b.ammo[b.cur] <= 0) { const o = 1 - b.cur; if (b.slots[o] >= 0 && b.ammo[o] > 0) b.cur = o; }
      // Curarse cuando está tranquilo
      if (!tgt0) { if (b.hp < 65 && b.meds > 0) this.use(b, 'med'); else if (b.sh < 50 && b.shields > 0) this.use(b, 'shield'); }
    }
    const tgt = ai.target != null ? this.fighters.get(ai.target) : null;
    const wIdx = b.slots[b.cur], hasGun = wIdx >= 0 && b.ammo[b.cur] > 0;
    if (tgt && tgt.alive && hasGun) {
      const w = WEAPONS[wIdx];
      const dx = tgt.x - b.x, dz = tgt.z - b.z, dist = Math.hypot(dx, dz);
      ai.seen += dt;
      if (ai.errT <= 0) { ai.errT = 0.3 + Math.random() * 0.3; ai.ex = (Math.random() - 0.5) * 2 * D.err; ai.ey = (Math.random() - 0.5) * D.err; }
      const desiredYaw = Math.atan2(-dx, -dz) + ai.ex;
      const desiredPitch = Math.atan2(tgt.y + 1.15 - eyeY, dist) + ai.ey;
      let dyaw = Math.atan2(Math.sin(desiredYaw - b.yaw), Math.cos(desiredYaw - b.yaw));
      b.yaw += clamp(dyaw, -6 * dt, 6 * dt); b.pitch += clamp(desiredPitch - b.pitch, -4 * dt, 4 * dt);
      const pd = [20, 14, 7, 35, 90][wIdx];
      if (ai.strafeT <= 0) { ai.strafeT = 0.5 + Math.random() * 1; ai.strafe = Math.random() < 0.5 ? -1 : 1; if (Math.random() < 0.25 && b.grounded) inp.jump = true; }
      inp.mx = ai.strafe;
      inp.mz = dist > pd + 8 ? 1 : dist < pd - 6 ? -0.8 : 0;
      dyaw = Math.atan2(Math.sin(desiredYaw - b.yaw), Math.cos(desiredYaw - b.yaw));
      if (ai.seen > D.react && Math.abs(dyaw) < 0.12 && dist < w.range && this.time - b.lastShot > w.rate * D.rate) {
        this.fire(b, [b.x, eyeY, b.z], dirFrom(b.yaw, b.pitch), (Math.random() * 4294967295) >>> 0, false);
      }
    } else {
      ai.seen = 0;
      if (tgt && tgt.alive && !hasGun) { const dx = b.x - tgt.x, dz = b.z - tgt.z; ai.goal = { x: b.x + dx, z: b.z + dz }; }
      const g = ai.goal;
      if (g) {
        const dx = g.x - b.x, dz = g.z - b.z, d = Math.hypot(dx, dz);
        let yaw = Math.atan2(-dx, -dz);
        if (ai.avoidT > 0) yaw += ai.avoid;
        b.yaw = yaw; b.pitch *= 0.9;
        inp.mz = d > 1.2 ? 1 : 0;
        if (g.item != null && d < 2.2) { const it = this.items.get(g.item); if (it) this.pickup(b, it, true); ai.t = 0; }
        // Esquiva obstáculos mirando 2.5 m adelante
        const fx = b.x - Math.sin(b.yaw) * 2.5, fz = b.z - Math.cos(b.yaw) * 2.5;
        if (ai.avoidT <= 0 && (W.blocked(fx, fz) || W.heightAt(fx, fz) < 0.5)) { ai.avoid = (Math.random() < 0.5 ? -1 : 1) * (0.9 + Math.random() * 0.6); ai.avoidT = 0.7; }
      }
    }
    // Atascado: salta y cambia de rumbo
    if (Math.abs(inp.mz) + Math.abs(inp.mx) > 0.5 && Math.hypot(b.x - ai.lx, b.z - ai.lz) < 0.6 * dt) {
      ai.stuckT += dt;
      if (ai.stuckT > 0.35) { inp.jump = true; ai.avoid = (Math.random() < 0.5 ? -1 : 1) * 1.6; ai.avoidT = 0.8; ai.stuckT = 0; ai.strafe = -ai.strafe; }
    } else ai.stuckT = 0;
    ai.lx = b.x; ai.lz = b.z;
    stepFighter(b, inp, dt, W);
  };

  Match.prototype.update = function (dt) {
    dt = Math.min(dt, 0.1);
    this.time += dt;
    if (this.state === 'end') { this.endT -= dt; }
    if (this.planeT < this.plane.dur + 1) {
      this.planeT += dt;
      const p = planePos(this.plane, this.planeT);
      for (const f of this.fighters.values()) {
        if (f.ph !== PH.PLANE) continue;
        f.x = p.x; f.y = p.y - 4; f.z = p.z;
        if (this.planeT >= this.plane.dur) { f.ph = PH.FALL; f.vx = 0; f.vz = 0; f.vy = 0; if (!f.bot) this.events.push({ t: 'eject', id: f.id }); }
      }
      if (this.state === 'plane' && this.planeT >= this.plane.dur) this.state = 'play';
    }
    this.updateZone(dt);
    this.zoneTick = (this.zoneTick || 0) + dt;
    const tick = this.zoneTick >= 1; if (tick) this.zoneTick -= 1;
    for (const f of this.fighters.values()) {
      if (!f.alive) continue;
      if (f.bot) this.updateBot(f, dt);
      if (tick && f.ph === PH.GROUND && this.outside(f) && this.state !== 'end') this.damage(f, this.zone.dps, null, -1, false);
    }
    // Recoger automáticamente lo que no necesita botón
    this.pickT = (this.pickT || 0) + dt;
    if (this.pickT > 0.2) {
      this.pickT = 0;
      for (const f of this.fighters.values()) {
        if (!f.alive || f.bot || f.ph !== PH.GROUND) continue;
        for (const it of this.items.values()) {
          if (Math.abs(it.x - f.x) > 1.6 || Math.abs(it.z - f.z) > 1.6) continue;
          if (it.k >= 10 || f.slots.includes(-1) || f.slots.includes(it.k)) this.pickup(f, it, false);
        }
      }
    }
  };
  Match.prototype.snapshot = function () {
    const z = this.zone, r1 = v => Math.round(v * 10) / 10, r2 = v => Math.round(v * 100) / 100;
    return {
      st: this.state === 'plane' ? 0 : this.state === 'play' ? 1 : 2, pt: r1(this.planeT), al: this.aliveCount(), at: this.aliveTeams().size,
      z: [r1(z.cx), r1(z.cz), r1(z.r), r1(z.tx), r1(z.tz), r1(z.tr), z.stage, Math.ceil(z.t), z.shrinking ? 1 : 0],
      f: [...this.fighters.values()].map(f => [
        f.id, r1(f.x), r1(f.y), r1(f.z), r2(f.yaw), r2(f.pitch), Math.max(0, Math.ceil(f.hp)), Math.ceil(f.sh), f.alive ? 1 : 0, f.ph,
        f.slots[f.cur], f.kills, f.life, f.iv, f.slots[0], f.slots[1], f.ammo[0], f.ammo[1], f.cur, f.meds, f.shields, f.place,
        r1(f.vx), r1(f.vy), r1(f.vz), f.grounded ? 1 : 0,
      ]),
    };
  };
  Match.prototype.drain = function () { const e = this.events; this.events = []; return e; };

  return {
    SIZE, EYE, RAD, HEIGHT, MAX_PLAYERS, PLANE_Y, PH, WEAPONS, LOOT, LOOT_NAMES, DIFF, ZONE, TEAM_COLORS,
    rng, clamp, World, Match, makeFighter, stepFighter, planePos, dirFrom, spreadDirs, rayFighters, cleanName,
  };
});
