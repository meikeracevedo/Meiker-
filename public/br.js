/* Meiker Battle Royale 3D — simulación compartida.
   La usa el servidor (salas online) y el navegador (partida solo contra bots).
   Unidades en metros. Eje Y hacia arriba; la isla ocupa x,z en [0, SIZE]. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BR = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const SIZE = 460, EYE = 1.6, RAD = 0.45, HEIGHT = 1.8, MAX_PLAYERS = 20;
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

  // mag: balas por cargador; ammo: munición total con la que viene el arma; reload: segundos
  const WEAPONS = [
    { key: 'pistol', name: 'Pistola', dmg: 20, rate: 0.3, spread: 0.02, pellets: 1, range: 110, ammo: 48, mag: 12, reload: 1.1, head: 1.8 },
    { key: 'smg', name: 'Subfusil', dmg: 13, rate: 0.085, spread: 0.05, pellets: 1, range: 75, ammo: 150, mag: 30, reload: 1.6, head: 1.5 },
    { key: 'shotgun', name: 'Escopeta', dmg: 12, rate: 0.9, spread: 0.11, pellets: 8, range: 32, ammo: 30, mag: 5, reload: 2.2, head: 1.25 },
    { key: 'rifle', name: 'Rifle de asalto', dmg: 21, rate: 0.12, spread: 0.026, pellets: 1, range: 200, ammo: 180, mag: 30, reload: 2, head: 1.7 },
    { key: 'sniper', name: 'Francotirador', dmg: 95, rate: 1.4, spread: 0.02, pellets: 1, range: 400, ammo: 20, mag: 5, reload: 2.6, head: 2, adsSpread: 0.0012 },
  ];
  const ADS_SPREAD = 0.45, SPAWN_PROT = 3, LAND_PROT = 2.5, FLY_TIME = 18;
  const RANK = [1, 2, 3, 5, 4]; // qué tan buena es cada arma (para bots)
  const LOOT = { MED: 10, SHIELD: 11, AMMO: 12 };
  const LOOT_NAMES = { 10: 'Botiquín', 11: 'Escudo', 12: 'Munición' };
  const DIFF = [
    { name: 'Fácil', err: 0.1, react: 0.9, rate: 1.8, range: 50 },
    { name: 'Normal', err: 0.055, react: 0.55, rate: 1.35, range: 80 },
    { name: 'Pro', err: 0.025, react: 0.3, rate: 1.05, range: 120 },
  ];
  const ZONE = [
    { wait: 65, shrink: 30, r: 195, dps: 2 },
    { wait: 40, shrink: 25, r: 120, dps: 3 },
    { wait: 32, shrink: 22, r: 68, dps: 5 },
    { wait: 26, shrink: 20, r: 32, dps: 7 },
    { wait: 20, shrink: 18, r: 12, dps: 10 },
    { wait: 15, shrink: 15, r: 0, dps: 15 },
  ];
  const TEAM_COLORS = ['#F5B50A', '#4FD1FF', '#FF6FAE', '#3DDC84', '#FF8A3D', '#B18CFF', '#F5F5F4', '#7CF2E0', '#FF5A5F', '#C9E265'];
  const BOT_NAMES = ['Pecoso', 'Mono', 'Flaco', 'Toño', 'Chepe', 'Nacho', 'Rolo', 'Paisa', 'Mancha', 'Gato', 'Pibe', 'Chucho', 'Lalo', 'Kike', 'Pelusa', 'Tato', 'Caliche', 'Juancho', 'Mafe', 'Lucho', 'Coco', 'Beto'];
  const TOWN_NAMES = ['Puerto Arepa', 'La Loma', 'Villa Mango', 'El Ventarrón', 'Pico Neblina', 'Playa Brava', 'Los Cauchos', 'San Tintico', 'Bahía Panela', 'El Guadual', 'Mirador Luna', 'Riverópolis'];
  const CAMP_NAMES = ['Bodega Norte', 'Campamento', 'Base Militar', 'El Depósito', 'Torre Radio', 'Contenedores'];

  /* ---------- Isla aleatoria ---------- */
  function segDist(px, pz, ax, az, bx, bz) {
    const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1;
    const t = clamp(((px - ax) * dx + (pz - az) * dz) / l2, 0, 1);
    return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
  }
  function World(seed) {
    this.seed = seed >>> 0;
    const r = rng(seed);
    // Zonas: Meiker City (la ciudad grande, cerca del centro), Meketown y pueblos con nombre al azar
    this.towns = [];
    const names = TOWN_NAMES.slice();
    for (let i = names.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [names[i], names[j]] = [names[j], names[i]]; }
    const plan = [{ name: 'Meiker City', big: 2, spread: 0.22, rad: 40 }, { name: 'Meketown', big: 1, spread: 0.62, rad: 30 }];
    for (let i = 0; i < 5; i++) plan.push({ name: names[i], big: 0, spread: 0.66, rad: 20 + r() * 8 });
    for (const pl of plan) {
      for (let tries = 0; tries < 500; tries++) {
        const x = SIZE / 2 + (r() - 0.5) * SIZE * pl.spread * 1.4, z = SIZE / 2 + (r() - 0.5) * SIZE * pl.spread * 1.4;
        const h = this.rawHeight(x, z);
        if (h < 3 || this.towns.some(t => Math.hypot(t.x - x, t.z - z) < t.r + pl.rad + 34)) continue;
        if (Math.hypot(x - SIZE / 2, z - SIZE / 2) > SIZE * 0.36) continue;
        this.towns.push({ x, z, r: pl.rad, base: h, name: pl.name, big: pl.big });
        break;
      }
    }
    const land = (x, z) => this.rawHeight(x, z) > 2.5;
    // Campamentos militares
    this.camps = [];
    for (let tries = 0; this.camps.length < 3 && tries < 500; tries++) {
      const x = 40 + r() * (SIZE - 80), z = 40 + r() * (SIZE - 80);
      if (this.rawHeight(x, z) < 3 || this.towns.some(t => Math.hypot(t.x - x, t.z - z) < t.r + 34) || this.camps.some(c => Math.hypot(c.x - x, c.z - z) < 60)) continue;
      this.camps.push({ x, z, name: CAMP_NAMES[this.camps.length % CAMP_NAMES.length] });
    }
    // Carreteras: árbol de caminos que une todas las zonas
    const nodes = this.towns.concat(this.camps);
    this.roads = [];
    const linked = [0];
    while (linked.length < nodes.length) {
      let best = null, bd = Infinity;
      for (const i of linked) for (let j = 0; j < nodes.length; j++) {
        if (linked.includes(j)) continue;
        const d = Math.hypot(nodes[i].x - nodes[j].x, nodes[i].z - nodes[j].z);
        if (d < bd) { bd = d; best = [i, j]; }
      }
      linked.push(best[1]);
      this.roads.push({ ax: nodes[best[0]].x, az: nodes[best[0]].z, bx: nodes[best[1]].x, bz: nodes[best[1]].z });
    }
    const nearRoad = (x, z, m) => this.roads.some(rd => segDist(x, z, rd.ax, rd.az, rd.bx, rd.bz) < m);

    this.boxes = []; this.buildings = []; this.trees = []; this.rocks = []; this.crates = []; this.lamps = []; this.walls = []; this.towers = []; this.statues = [];
    const lootSpots = [];
    for (const t of this.towns) {
      const n = t.big === 2 ? 12 : t.big === 1 ? 8 : 4 + Math.floor(r() * 3);
      if (t.big === 2) { // Plaza con estatua en Meiker City
        const st = { minX: t.x - 1.2, maxX: t.x + 1.2, minZ: t.z - 1.2, maxZ: t.z + 1.2, minY: t.base - 0.5, maxY: t.base + 4.5, type: 's' };
        this.statues.push(st); this.boxes.push(st);
        for (let k = 0; k < 4; k++) lootSpots.push({ x: t.x + Math.cos(k * 1.57) * 4, z: t.z + Math.sin(k * 1.57) * 4 });
      }
      for (let i = 0, tries = 0; i < n && tries < 160; tries++) {
        const a = r() * Math.PI * 2, d = (t.big === 2 ? 9 : 0) + r() * t.r * 0.85;
        const floors = t.big === 2 ? 2 + Math.floor(r() * 4) : t.big === 1 ? 1 + Math.floor(r() * 3) : 1 + Math.floor(r() * 2);
        const w = 7 + r() * (t.big ? 7 : 5), dd = 7 + r() * 5, h = 1 + floors * 3.5 + r();
        const x = t.x + Math.cos(a) * d, z = t.z + Math.sin(a) * d;
        const b = { minX: x - w / 2, maxX: x + w / 2, minZ: z - dd / 2, maxZ: z + dd / 2, minY: t.base - 1, maxY: t.base + h, type: 'b', hue: Math.floor(r() * 5), floors };
        if (this.buildings.some(o => b.minX < o.maxX + 5 && b.maxX > o.minX - 5 && b.minZ < o.maxZ + 5 && b.maxZ > o.minZ - 5)) continue;
        if (this.statues.some(o => b.minX < o.maxX + 6 && b.maxX > o.minX - 6 && b.minZ < o.maxZ + 6 && b.maxZ > o.minZ - 6)) continue;
        if (nearRoad(x, z, Math.hypot(w, dd) / 2 + 4)) continue;
        this.buildings.push(b); this.boxes.push(b); i++;
        const spots = 4 + Math.floor(r() * 3) + (floors > 2 ? 2 : 0);
        for (let k = 0; k < spots; k++) {
          const side = Math.floor(r() * 4), off = r();
          lootSpots.push({ x: side < 2 ? b.minX + off * w : (side === 2 ? b.minX - 2.2 : b.maxX + 2.2), z: side >= 2 ? b.minZ + off * dd : (side === 0 ? b.minZ - 2.2 : b.maxZ + 2.2) });
        }
      }
      // Muros bajos para cubrirse
      const nw = t.big ? 5 : 2 + Math.floor(r() * 2);
      for (let k = 0, tries = 0; k < nw && tries < 40; tries++) {
        const a = r() * Math.PI * 2, d = t.r * (0.4 + r() * 0.7), len = 5 + r() * 5, horiz = r() < 0.5;
        const x = t.x + Math.cos(a) * d, z = t.z + Math.sin(a) * d, hh = this.rawHeight(x, z);
        const wl = { minX: x - (horiz ? len / 2 : 0.25), maxX: x + (horiz ? len / 2 : 0.25), minZ: z - (horiz ? 0.25 : len / 2), maxZ: z + (horiz ? 0.25 : len / 2), minY: Math.min(t.base, hh) - 0.5, maxY: Math.max(t.base, hh) + 1.3, type: 'w' };
        if (this.boxes.some(o => wl.minX < o.maxX + 2 && wl.maxX > o.minX - 2 && wl.minZ < o.maxZ + 2 && wl.maxZ > o.minZ - 2) || nearRoad(x, z, len / 2 + 3)) continue;
        this.walls.push(wl); this.boxes.push(wl); k++;
        lootSpots.push({ x: x + (horiz ? 0 : 1.2), z: z + (horiz ? 1.2 : 0) });
      }
      // Torre de agua en las zonas grandes
      if (t.big || r() < 0.3) {
        for (let tries = 0; tries < 30; tries++) {
          const a = r() * Math.PI * 2, d = t.r * (0.6 + r() * 0.5), x = t.x + Math.cos(a) * d, z = t.z + Math.sin(a) * d;
          const tw = { minX: x - 1.6, maxX: x + 1.6, minZ: z - 1.6, maxZ: z + 1.6, minY: t.base - 1, maxY: t.base + 14, type: 'tw', x, z, base: this.rawHeight(x, z) };
          if (this.boxes.some(o => tw.minX < o.maxX + 3 && tw.maxX > o.minX - 3 && tw.minZ < o.maxZ + 3 && tw.maxZ > o.minZ - 3) || nearRoad(x, z, 5)) continue;
          tw.base = this.heightAt ? tw.base : tw.base;
          this.towers.push(tw); this.boxes.push(tw); break;
        }
      }
      const nl = t.big === 2 ? 8 : t.big ? 5 : 3;
      for (let k = 0; k < nl; k++) { const a = r() * Math.PI * 2, d = r() * t.r; this.lamps.push({ x: t.x + Math.cos(a) * d, z: t.z + Math.sin(a) * d }); }
    }
    for (const c of this.camps) {
      const n = 5 + Math.floor(r() * 4);
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2 + r() * 0.5, d = 4 + r() * 8, sz = 1.2 + r() * 0.9, tall = r() < 0.3;
        const cx = c.x + Math.cos(a) * d, cz = c.z + Math.sin(a) * d, ch = this.rawHeight(cx, cz);
        if (nearRoad(cx, cz, 3)) continue;
        const cr = { minX: cx - sz / 2 * (tall ? 2.2 : 1), maxX: cx + sz / 2 * (tall ? 2.2 : 1), minZ: cz - sz / 2, maxZ: cz + sz / 2, minY: ch - 0.6, maxY: ch + sz * (tall ? 1.6 : 1), type: 'c', s: sz };
        this.crates.push(cr); this.boxes.push(cr);
        lootSpots.push({ x: cx + Math.cos(a) * (sz + 0.8), z: cz + Math.sin(a) * (sz + 0.8) });
      }
      lootSpots.push({ x: c.x, z: c.z }); lootSpots.push({ x: c.x + 2, z: c.z - 2 });
      this.lamps.push({ x: c.x + 1.5, z: c.z + 1.5 });
    }
    // Faroles a lo largo de las carreteras
    for (const rd of this.roads) {
      const L = Math.hypot(rd.bx - rd.ax, rd.bz - rd.az), nx = -(rd.bz - rd.az) / L, nz = (rd.bx - rd.ax) / L;
      for (let d = 30; d < L - 30; d += 45) { const k = d / L; this.lamps.push({ x: rd.ax + (rd.bx - rd.ax) * k + nx * 4.5, z: rd.az + (rd.bz - rd.az) * k + nz * 4.5 }); }
    }
    this.lamps = this.lamps.filter(l => !this.boxes.some(b => l.x > b.minX - 0.5 && l.x < b.maxX + 0.5 && l.z > b.minZ - 0.5 && l.z < b.maxZ + 0.5));
    const inZone = (x, z, m) => this.towns.some(t => Math.hypot(t.x - x, t.z - z) < t.r + m) || this.camps.some(c => Math.hypot(c.x - x, c.z - z) < 16 + m);
    for (let i = 0, tries = 0; i < 30 && tries < 2000; tries++) {
      const x = 30 + r() * (SIZE - 60), z = 30 + r() * (SIZE - 60);
      if (!land(x, z) || inZone(x, z, 4) || nearRoad(x, z, 5)) continue;
      const sz = 1.4 + r() * 2.2, h = this.heightAt(x, z);
      const rock = { minX: x - sz / 2, maxX: x + sz / 2, minZ: z - sz / 2, maxZ: z + sz / 2, minY: h - 1, maxY: h + sz * 0.75, type: 'r', s: sz };
      this.rocks.push(rock); this.boxes.push(rock); i++;
    }
    for (let i = 0, tries = 0; i < 100 && tries < 4000; tries++) {
      const x = 25 + r() * (SIZE - 50), z = 25 + r() * (SIZE - 50);
      if (!land(x, z) || inZone(x, z, 8) || nearRoad(x, z, 5)) continue;
      const h = this.heightAt(x, z), sz = 0.75 + r() * 0.5;
      const tree = { minX: x - 0.35, maxX: x + 0.35, minZ: z - 0.35, maxZ: z + 0.35, minY: h - 0.5, maxY: h + 9 * sz, type: 't', s: sz, x, z };
      this.trees.push(tree); this.boxes.push(tree); i++;
    }
    // Rejilla para buscar obstáculos rápido
    this.cell = 20; this.gn = Math.ceil(SIZE / this.cell); this.grid = [];
    for (let i = 0; i < this.gn * this.gn; i++) this.grid.push([]);
    this.boxes.forEach((b, i) => {
      const x0 = clamp(Math.floor(b.minX / this.cell), 0, this.gn - 1), x1 = clamp(Math.floor(b.maxX / this.cell), 0, this.gn - 1);
      const z0 = clamp(Math.floor(b.minZ / this.cell), 0, this.gn - 1), z1 = clamp(Math.floor(b.maxZ / this.cell), 0, this.gn - 1);
      for (let gx = x0; gx <= x1; gx++) for (let gz = z0; gz <= z1; gz++) this.grid[gx * this.gn + gz].push(i);
    });
    for (let i = 0, tries = 0; i < 30 && tries < 1000; tries++) {
      const x = 25 + r() * (SIZE - 50), z = 25 + r() * (SIZE - 50);
      if (!land(x, z) || this.blocked(x, z)) continue;
      lootSpots.push({ x, z }); i++;
    }
    this.lootSpots = lootSpots.filter(sp => sp.x > 10 && sp.x < SIZE - 10 && sp.z > 10 && sp.z < SIZE - 10 && !this.blocked(sp.x, sp.z) && this.heightAt(sp.x, sp.z) > 0.5);
    // Lugares para los vehículos: sobre las carreteras, cerca de las zonas
    this.vehicleSpots = [];
    for (const rd of this.roads) {
      const L = Math.hypot(rd.bx - rd.ax, rd.bz - rd.az), yaw = Math.atan2(-(rd.bx - rd.ax), -(rd.bz - rd.az));
      for (const k of [0.3, 0.7]) {
        const x = rd.ax + (rd.bx - rd.ax) * k, z = rd.az + (rd.bz - rd.az) * k;
        if (L < 50 && k > 0.5) continue;
        if (this.heightAt(x, z) > 0.8 && !this.blocked(x, z)) this.vehicleSpots.push({ x, z, yaw: yaw + (k > 0.5 ? Math.PI : 0) });
      }
    }
  }
  World.prototype.rawHeight = function (x, z) {
    const n = fbm(x / 85, z / 85, this.seed);
    const ridge = vnoise(x / 36, z / 36, this.seed + 99);
    const dx = (x - SIZE / 2) / (SIZE / 2), dz = (z - SIZE / 2) / (SIZE / 2);
    const d = Math.sqrt(dx * dx + dz * dz);
    const mask = 1 - smooth(0.68, 0.98, d);
    return (Math.pow(n, 1.6) * 22 + ridge * 2.5 + 3) * mask - (1 - mask) * 9;
  };
  World.prototype.heightAt = function (x, z) {
    let h = this.rawHeight(x, z);
    for (const t of this.towns) {
      const d = Math.hypot(t.x - x, t.z - z);
      if (d < t.r + 16) { const w = 1 - smooth(t.r, t.r + 16, d); h = h * (1 - w) + t.base * w; }
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
  World.prototype.collide = function (f) { return this.collideCircle(f, RAD, f.y, f.y + HEIGHT); };
  World.prototype.collideCircle = function (f, rad, y0, y1) {
    let hit = false;
    for (const k of this.near(f.x, f.z, tmpNear)) {
      const b = this.boxes[k];
      if (y1 <= b.minY || y0 >= b.maxY - 0.05) continue;
      const cx = clamp(f.x, b.minX, b.maxX), cz = clamp(f.z, b.minZ, b.maxZ);
      let dx = f.x - cx, dz = f.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= rad * rad) continue;
      hit = true;
      if (d2 > 1e-8) { const d = Math.sqrt(d2); f.x = cx + dx / d * rad; f.z = cz + dz / d * rad; }
      else {
        const pen = [f.x - b.minX, b.maxX - f.x, f.z - b.minZ, b.maxZ - f.z];
        const m = pen.indexOf(Math.min(...pen));
        if (m === 0) f.x = b.minX - rad; else if (m === 1) f.x = b.maxX + rad; else if (m === 2) f.z = b.minZ - rad; else f.z = b.maxZ + rad;
      }
    }
    return hit;
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

  /* ---------- Vehículos ---------- */
  const VEHICLES = [
    { key: 'jeep', name: 'Jeep', seats: 4, max: 19, accel: 9, turn: 1.5, radius: 1.5 },
    { key: 'buggy', name: 'Buggy', seats: 2, max: 25, accel: 13, turn: 1.9, radius: 1.25 },
  ];
  // Puestos (x lateral, altura, z hacia atrás) relativos al carro
  const SEATS = [[-0.42, 0.75, -0.05], [0.42, 0.75, -0.05], [-0.42, 0.85, 1.15], [0.42, 0.85, 1.15]];
  function seatPos(v, seat) {
    const s = SEATS[seat], c = Math.cos(v.yaw), n = Math.sin(v.yaw);
    return { x: v.x + s[0] * c + s[2] * n, y: v.y + s[1], z: v.z - s[0] * n + s[2] * c };
  }
  // inp: { mz: acelerar(+)/reversa(-), mx: girar }
  function stepVehicle(v, inp, dt, world) {
    const T = VEHICLES[v.type];
    const th = clamp(num(inp.mz, 0), -1, 1), st = clamp(num(inp.mx, 0), -1, 1);
    if (th > 0.05) v.speed = Math.min(T.max, v.speed + T.accel * th * dt * (v.speed < 0 ? 2.5 : 1));
    else if (th < -0.05) v.speed = Math.max(-T.max * 0.4, v.speed + T.accel * th * dt * (v.speed > 0 ? 2.5 : 1));
    else v.speed *= Math.pow(0.4, dt);
    if (Math.abs(v.speed) < 0.08 && Math.abs(th) < 0.05) v.speed = 0;
    // Gira más fácil a velocidad media; en reversa el volante se invierte
    const turnK = clamp(Math.abs(v.speed) / 5, 0, 1) * (1 - clamp((Math.abs(v.speed) - 15) / 25, 0, 0.4)) * Math.sign(v.speed || 1);
    v.yaw -= st * T.turn * turnK * dt;
    v.yaw = Math.atan2(Math.sin(v.yaw), Math.cos(v.yaw));
    const fx = -Math.sin(v.yaw), fz = -Math.cos(v.yaw);
    const nx = v.x + fx * v.speed * dt, nz = v.z + fz * v.speed * dt;
    if (world.heightAt(nx, nz) < 0.3 || nx < 5 || nz < 5 || nx > SIZE - 5 || nz > SIZE - 5) { v.speed *= -0.3; v.bump = 1; }
    else { v.x = nx; v.z = nz; }
    v.y = world.heightAt(v.x, v.z);
    if (world.collideCircle(v, T.radius, v.y + 0.2, v.y + 1.8)) { if (Math.abs(v.speed) > 4) v.bump = 1; v.speed *= -0.25; }
    v.y = world.heightAt(v.x, v.z);
  }

  /* ---------- Movimiento ---------- */
  function dirFrom(yaw, pitch) {
    const c = Math.cos(pitch);
    return [-Math.sin(yaw) * c, Math.sin(pitch), -Math.cos(yaw) * c];
  }
  function spreadDirs(wIdx, d, seed, ads) {
    const w = WEAPONS[wIdx], r = rng(seed), out = [];
    const spread = ads ? (w.adsSpread != null ? w.adsSpread : w.spread * ADS_SPREAD) : w.spread;
    // base ortonormal alrededor de d
    let ux = -d[2], uy = 0, uz = d[0]; let ul = Math.hypot(ux, uz) || 1; ux /= ul; uz /= ul;
    const vx = d[1] * uz - d[2] * uy, vy = d[2] * ux - d[0] * uz, vz = d[0] * uy - d[1] * ux;
    for (let i = 0; i < w.pellets; i++) {
      const a = r() * Math.PI * 2, s = Math.sqrt(r()) * spread;
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
      veh: 0, seat: 0, runT: 0,
      hp: 100, sh: 0, alive: true, ph: PH.PLANE, slots: [-1, -1], ammo: [0, 0], mag: [0, 0], reloadEnd: 0, prot: 0, cur: 0, meds: 0, shields: 0, iv: 0,
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
    const ground = world.heightAt(f.x, f.z);
    if (f.ph === PH.PLANE) {
      // Volando al inicio: se mueve libre sobre la isla hasta que decide caer (o se acaba el tiempo)
      f.flyT = Math.max(0, (f.flyT == null ? FLY_TIME : f.flyT) - dt);
      f.vx = approach(f.vx, wx * 17, 30 * dt); f.vz = approach(f.vz, wz * 17, 30 * dt);
      const hover = Math.max(ground + 45, f.flyY || f.y);
      f.vy = (hover - f.y) * 2;
      if (chuteEdge || f.flyT <= 0) { f.ph = PH.FALL; f.vy = -2; fx && fx('drop', f); }
    } else if (f.ph === PH.FALL) {
      // Caída lenta y controlada; empujando hacia adelante cae más rápido
      f.vx = approach(f.vx, wx * 10, 18 * dt); f.vz = approach(f.vz, wz * 10, 18 * dt);
      f.vy = approach(f.vy, mz > 0.3 ? -17 : -9, 20 * dt);
    } else if (f.ph === PH.CHUTE) {
      f.vx = approach(f.vx, wx * 12, 20 * dt); f.vz = approach(f.vz, wz * 12, 20 * dt);
      f.vy = approach(f.vy, mz > 0.3 ? -14 : -10, 40 * dt);
    } else {
      const sp = inp.sprint && mz > 0.5 ? 8.8 : 6.4, a = f.grounded ? 60 : 14;
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
      f.y = world.heightAt(f.x, f.z); f.vy = 0; f.vx = 0; f.vz = 0; f.ph = PH.GROUND; f.grounded = true; f.prot = Math.max(f.prot || 0, LAND_PROT);
      fx && fx('slam', f);
    }
    if (f.ph === PH.GROUND || f.ph === PH.CHUTE) world.collide(f);
  }

  /* ---------- Partida ---------- */
  // opts: { mode:'solo'|'duo', diff, seed, humans:[{id,name}], botStart }
  function Match(opts) {
    this.mode = opts.mode === 'duo' ? 'duo' : 'solo';
    this.diff = clamp(Math.round(num(opts.diff, 1)), 0, 2);
    this.seed = (opts.seed != null ? opts.seed : Math.random() * 4294967295) >>> 0;
    this.world = new World(this.seed);
    this.fighters = new Map(); this.items = new Map(); this.events = [];
    this.time = 0; this.planeT = 0; this.state = 'play'; this.nextItem = 1; this.endT = 0; this.winner = -1;
    const r = rng(this.seed ^ 0x9e3779b9);
    this.plane = null;
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
    this.spawnAll(r);
    this.vehicles = new Map();
    const spots = this.world.vehicleSpots.slice();
    for (let i = spots.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [spots[i], spots[j]] = [spots[j], spots[i]]; }
    spots.slice(0, 9).forEach((sp, i) => {
      const v = { id: i + 1, type: r() < 0.55 ? 0 : 1, x: sp.x, z: sp.z, y: this.world.heightAt(sp.x, sp.z), yaw: sp.yaw, speed: 0, seats: [0, 0, 0, 0], bump: 0 };
      this.vehicles.set(v.id, v);
    });
    // Botín inicial
    for (const s of this.world.lootSpots) if (r() < 0.82) this.addItem(this.randomKind(r), s.x, s.z, true);
    this.events.push({ t: 'start', seed: this.seed, mode: this.mode, plane: null, roster: this.roster(), loot: this.lootList() });
  }
  // Cada equipo aparece en un punto distinto de la isla, lejos de los demás
  Match.prototype.spawnAll = function (r) {
    const W = this.world, teams = new Map();
    for (const f of this.fighters.values()) { if (!teams.has(f.team)) teams.set(f.team, []); teams.get(f.team).push(f); }
    const points = [];
    for (const [, list] of teams) {
      let best = null, bestD = -1;
      for (let i = 0; i < 60; i++) {
        const x = 25 + r() * (SIZE - 50), z = 25 + r() * (SIZE - 50);
        if (W.heightAt(x, z) < 1.2 || W.blocked(x, z)) continue;
        let d = 999; for (const p of points) d = Math.min(d, Math.hypot(p.x - x, p.z - z));
        if (d > bestD) { bestD = d; best = { x, z }; }
        if (d > 50 && i > 20) break;
      }
      best = best || W.toLand(SIZE / 2, SIZE / 2);
      points.push(best);
      list.forEach((f, i) => {
        let x = best.x + (i ? 2.5 : 0), z = best.z + (i ? 1.5 : 0);
        if (W.blocked(x, z) || W.heightAt(x, z) < 0.6) { x = best.x; z = best.z; }
        const y = W.heightAt(x, z) + 60;
        Object.assign(f, { x, z, y, flyY: y, flyT: FLY_TIME, ph: PH.PLANE, grounded: false, prot: 0, yaw: Math.atan2(-(SIZE / 2 - x), -(SIZE / 2 - z)) });
        f.slots = [0, -1]; f.mag = [WEAPONS[0].mag, 0]; f.ammo = [24, 0]; f.cur = 0; f.iv++;
      });
    }
  };
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
    z.tx = clamp(tx, 30, SIZE - 30); z.tz = clamp(tz, 30, SIZE - 30); z.tr = st.r;
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
    if (!t.alive || this.state === 'end' || t.prot > 0 || (t.ph !== PH.GROUND && by)) return;
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
    if (v.veh) this.leaveVehicle(v, true);
    if (k && k !== v) k.kills++;
    // Deja todo su botín en el piso
    const drops = [];
    v.slots.forEach((s, i) => { if (s >= 0) drops.push([s, Math.max(v.ammo[i] + v.mag[i], 10)]); });
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
    v.slots = [-1, -1]; v.ammo = [0, 0]; v.mag = [0, 0]; v.meds = 0; v.shields = 0; v.iv++;
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
  Match.prototype.fire = function (f, o, d, seed, fromClient, ads) {
    if (!f.alive || f.ph !== PH.GROUND || this.state === 'end' || (f.veh && f.seat === 0)) return false;
    const slot = f.cur, wIdx = f.slots[slot];
    if (wIdx < 0 || f.mag[slot] <= 0 || f.reloadEnd > this.time) return false;
    const w = WEAPONS[wIdx];
    if (fromClient) {
      f.budget = Math.min(2.5, f.budget + (this.time - f.budgetT) / w.rate); f.budgetT = this.time;
      if (f.budget < 0.8) return false;
      f.budget -= 1;
      if (Math.hypot(o[0] - f.x, o[1] - (f.y + EYE), o[2] - f.z) > 3) { o = [f.x, f.y + EYE, f.z]; }
    } else if (this.time - f.lastShot < w.rate) return false;
    f.lastShot = this.time; f.prot = 0;
    f.mag[slot]--;
    const dl = Math.hypot(d[0], d[1], d[2]) || 1; d = [d[0] / dl, d[1] / dl, d[2] / dl];
    const dirs = spreadDirs(wIdx, d, seed, ads);
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
    this.events.push({ t: 'shot', o: f.id, x: +o[0].toFixed(2), y: +o[1].toFixed(2), z: +o[2].toFixed(2), d: d.map(v => +v.toFixed(4)), w: wIdx, sd: seed, e: ends, a: ads ? 1 : 0 });
    for (const [t, h] of hits) this.damage(t, h.dmg, f, wIdx, h.head);
    return true;
  };
  Match.prototype.enterVehicle = function (f, vid) {
    const v = this.vehicles.get(vid);
    if (!v || !f.alive || f.veh || f.ph !== PH.GROUND || Math.hypot(f.x - v.x, f.z - v.z) > 4.5) return false;
    const n = VEHICLES[v.type].seats;
    let seat = -1;
    for (let i = 0; i < n; i++) if (!v.seats[i]) { seat = i; break; }
    if (seat < 0) return false;
    v.seats[seat] = f.id; f.veh = v.id; f.seat = seat; f.reloadEnd = 0;
    const p = seatPos(v, seat); f.x = p.x; f.y = p.y; f.z = p.z; f.vx = f.vz = f.vy = 0;
    this.events.push({ t: 'vin', id: f.id, v: v.id, s: seat });
    return true;
  };
  Match.prototype.leaveVehicle = function (f, dead) {
    const v = this.vehicles.get(f.veh);
    if (v) v.seats[f.seat] = 0;
    const seat = f.seat; f.veh = 0; f.seat = 0;
    if (dead || !v) return;
    // Se baja por su lado del carro; si está bloqueado, por el otro o por detrás
    const side = SEATS[seat][0] < 0 ? -1 : 1, c = Math.cos(v.yaw), n = Math.sin(v.yaw);
    for (const [lx, lz] of [[side * 2, 0], [-side * 2, 0], [0, 3.2], [0, -3.2]]) {
      const x = v.x + lx * c + lz * n, z = v.z - lx * n + lz * c;
      if (this.world.heightAt(x, z) > 0.4 && !this.world.blocked(x, z)) { f.x = x; f.z = z; break; }
    }
    f.y = this.world.heightAt(f.x, f.z); f.vx = f.vz = f.vy = 0; f.grounded = true;
    this.events.push({ t: 'vout', id: f.id, v: v.id, x: +f.x.toFixed(2), z: +f.z.toFixed(2) });
  };
  Match.prototype.onVeh = function (id, m) {
    const f = this.fighters.get(id); if (!f || !m) return;
    if (m.a === 'in') this.enterVehicle(f, num(m.i, -1));
    else if (m.a === 'out' && f.veh) this.leaveVehicle(f, false);
  };
  Match.prototype.updateVehicles = function (dt) {
    for (const v of this.vehicles.values()) {
      const driver = v.seats[0] ? this.fighters.get(v.seats[0]) : null;
      if (!driver || driver.bot) stepVehicle(v, { mz: 0, mx: 0 }, dt, this.world);
      for (let i = 0; i < 4; i++) {
        const f = v.seats[i] ? this.fighters.get(v.seats[i]) : null;
        if (!f || !f.alive || f.veh !== v.id) { v.seats[i] = 0; continue; }
        const p = seatPos(v, i); f.x = p.x; f.y = p.y; f.z = p.z; f.grounded = true;
        const fx = -Math.sin(v.yaw), fz = -Math.cos(v.yaw); f.vx = fx * v.speed; f.vz = fz * v.speed;
      }
      // Atropellar
      if (Math.abs(v.speed) > 6 && this.state !== 'end') {
        const R = VEHICLES[v.type].radius + 0.6;
        for (const f of this.fighters.values()) {
          if (!f.alive || f.veh || f.runT > this.time || Math.abs(f.x - v.x) > R || Math.abs(f.z - v.z) > R) continue;
          if (Math.hypot(f.x - v.x, f.z - v.z) > R || Math.abs(f.y - v.y) > 2.2) continue;
          if (driver && !this.isEnemy(driver, f)) continue;
          f.runT = this.time + 0.8;
          if (f.bot) { f.vx += -Math.sin(v.yaw) * v.speed * 0.8; f.vz += -Math.cos(v.yaw) * v.speed * 0.8; f.vy = 5; f.grounded = false; }
          this.damage(f, Math.abs(v.speed) * 3.6, driver, -3, false);
          this.events.push({ t: 'bump', v: v.id });
        }
      }
    }
  };
  Match.prototype.reload = function (f) {
    const slot = f.cur, w = f.slots[slot];
    if (!f.alive || w < 0 || f.reloadEnd > this.time || f.mag[slot] >= WEAPONS[w].mag || f.ammo[slot] <= 0) return false;
    // Un poco más corta que en el cliente para absorber el retraso de la red
    f.reloadEnd = this.time + WEAPONS[w].reload * (f.bot ? 1 : 0.85); f.reloadSlot = slot;
    return true;
  };
  Match.prototype.finishReload = function (f) {
    const slot = f.reloadSlot, w = f.slots[slot];
    f.reloadEnd = 0;
    if (w < 0) return;
    const need = Math.min(WEAPONS[w].mag - f.mag[slot], f.ammo[slot]);
    f.mag[slot] += need; f.ammo[slot] -= need; f.iv++;
  };
  Match.prototype.pickup = function (f, it, swap) {
    if (!f.alive || f.ph !== PH.GROUND || f.veh || !it || Math.hypot(f.x - it.x, f.z - it.z) > 3) return false;
    if (it.k < 10) {
      const same = f.slots.indexOf(it.k);
      if (same >= 0) { f.ammo[same] = Math.min(WEAPONS[it.k].ammo * 1.5, f.ammo[same] + it.a); }
      else {
        let slot = f.slots.indexOf(-1);
        if (slot < 0) {
          if (!swap) return false;
          slot = f.cur;
          if (f.bot) slot = RANK[f.slots[0]] <= RANK[f.slots[1]] ? 0 : 1;
          this.addItem(f.slots[slot], f.x + 0.8, f.z + 0.8, false, f.ammo[slot] + f.mag[slot]);
          if (f.reloadEnd && f.reloadSlot === slot) f.reloadEnd = 0;
        }
        f.slots[slot] = it.k; f.mag[slot] = Math.min(WEAPONS[it.k].mag, it.a); f.ammo[slot] = it.a - f.mag[slot];
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
    if (f.veh) {
      f.yaw = num(m.yw, f.yaw); f.pitch = clamp(num(m.pt, f.pitch), -1.5, 1.5);
      const v = this.vehicles.get(f.veh);
      // El conductor manda la posición del carro (se ignoran saltos imposibles)
      if (v && f.seat === 0 && Array.isArray(m.v) && m.v.length === 4) {
        const x = num(m.v[0], v.x), z = num(m.v[1], v.z);
        if (Math.hypot(x - v.x, z - v.z) < 40) { v.x = clamp(x, 0, SIZE); v.z = clamp(z, 0, SIZE); v.y = this.world.heightAt(v.x, v.z); v.yaw = num(m.v[2], v.yaw); v.speed = clamp(num(m.v[3], 0), -15, 30); }
      }
      return;
    }
    const ph = clamp(Math.round(num(m.ph, f.ph)), 0, 3);
    if (ph < f.ph) return;
    f.ph = ph;
    if (f.ph !== PH.GROUND && ph === PH.GROUND) f.prot = LAND_PROT;
    f.x = clamp(num(m.x, f.x), 0, SIZE); f.z = clamp(num(m.z, f.z), 0, SIZE); f.y = clamp(num(m.y, f.y), -20, 160);
    f.vx = num(m.vx, 0); f.vy = num(m.vy, 0); f.vz = num(m.vz, 0);
    f.yaw = num(m.yw, f.yaw); f.pitch = clamp(num(m.pt, f.pitch), -1.5, 1.5);
    f.grounded = !!m.g;
  };
  Match.prototype.onFire = function (id, m) {
    const f = this.fighters.get(id);
    if (!f || !m || num(m.l, -1) !== f.life || !Array.isArray(m.o) || !Array.isArray(m.d)) return;
    const o = m.o.slice(0, 3).map(v => num(v, 0)), d = m.d.slice(0, 3).map(v => num(v, 0));
    if (Number.isInteger(m.c) && (m.c === 0 || m.c === 1) && f.cur !== m.c) { f.cur = m.c; f.reloadEnd = 0; }
    this.fire(f, o, d, num(m.sd, 1) >>> 0, true, !!m.a);
  };
  Match.prototype.onPick = function (id, m) { const f = this.fighters.get(id); if (f) this.pickup(f, this.items.get(num(m.i, -1)), true); };
  Match.prototype.onUse = function (id, m) { const f = this.fighters.get(id); if (f) this.use(f, m.k === 'shield' ? 'shield' : 'med'); };
  Match.prototype.onSlot = function (id, m) { const f = this.fighters.get(id); if (f && (m.c === 0 || m.c === 1)) { if (f.cur !== m.c) f.reloadEnd = 0; f.cur = m.c; } };
  Match.prototype.onReload = function (id) { const f = this.fighters.get(id); if (f) this.reload(f); };

  /* ---------- Bots ---------- */
  const near2 = [];
  Match.prototype.updateBot = function (b, dt) {
    const D = DIFF[this.diff], W = this.world;
    const ai = b.ai || (b.ai = {});
    if (ai.lx == null) Object.assign(ai, { t: 0, target: null, goal: null, strafe: 1, strafeT: 0, seen: 0, stuckT: 0, lx: b.x, lz: b.z, avoid: 0, avoidT: 0, errT: 0, ex: 0, ey: 0, wander: null });
    const inp = { mx: 0, mz: 0, jump: false, chute: false, sprint: false };
    if (b.ph !== PH.GROUND) {
      // Bots volando: escogen una zona, vuelan hasta allá y caen
      if (!ai.land) {
        const zones = W.towns.concat(W.camps), t = zones[Math.floor(Math.random() * zones.length)];
        ai.land = Math.random() < 0.8 && t ? { x: t.x + (Math.random() - 0.5) * 20, z: t.z + (Math.random() - 0.5) * 20 } : { x: b.x + (Math.random() - 0.5) * 80, z: b.z + (Math.random() - 0.5) * 80 };
        ai.dropAt = 2 + Math.random() * 12;
      }
      const dx = ai.land.x - b.x, dz = ai.land.z - b.z, d = Math.hypot(dx, dz);
      b.yaw = Math.atan2(-dx, -dz);
      inp.mz = d > 4 ? 1 : 0;
      if (b.ph === PH.PLANE && (d < 25 || (b.flyT != null && FLY_TIME - b.flyT > ai.dropAt + 8))) inp.chute = true;
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
        const score = (s, i) => (b.ammo[i] + b.mag[i] > 0 ? 1 : -9) + (d < 15 ? (s === 2 ? 3 : s === 1 ? 2 : 0) : d > 80 ? (s === 4 ? 3 : s === 3 ? 2 : 0) : (s === 3 ? 3 : s === 1 ? 2 : 0));
        const c = score(b.slots[0], 0) >= score(b.slots[1], 1) ? 0 : 1;
        if (c !== b.cur) { b.cur = c; b.reloadEnd = 0; }
      } else if (b.slots[b.cur] < 0 || b.ammo[b.cur] + b.mag[b.cur] <= 0) { const o = 1 - b.cur; if (b.slots[o] >= 0 && b.ammo[o] + b.mag[o] > 0) { b.cur = o; b.reloadEnd = 0; } }
      if (!tgt0 && b.slots[b.cur] >= 0 && b.mag[b.cur] < WEAPONS[b.slots[b.cur]].mag * 0.5) this.reload(b);
      // Curarse cuando está tranquilo
      if (!tgt0) { if (b.hp < 65 && b.meds > 0) this.use(b, 'med'); else if (b.sh < 50 && b.shields > 0) this.use(b, 'shield'); }
    }
    const tgt = ai.target != null ? this.fighters.get(ai.target) : null;
    const wIdx = b.slots[b.cur], hasGun = wIdx >= 0 && b.ammo[b.cur] + b.mag[b.cur] > 0;
    if (hasGun && b.mag[b.cur] <= 0) this.reload(b);
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
      if (ai.seen > D.react && Math.abs(dyaw) < 0.12 && dist < w.range && this.time - b.lastShot > w.rate * D.rate && b.mag[b.cur] > 0) {
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
        inp.mz = d > 1.2 ? 1 : 0; inp.sprint = d > 12 && !tgt;
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
    this.updateZone(dt);
    this.updateVehicles(dt);
    this.zoneTick = (this.zoneTick || 0) + dt;
    const tick = this.zoneTick >= 1; if (tick) this.zoneTick -= 1;
    for (const f of this.fighters.values()) {
      if (!f.alive) continue;
      if (f.prot > 0) f.prot = Math.max(0, f.prot - dt);
      if (f.reloadEnd && this.time >= f.reloadEnd) this.finishReload(f);
      if (f.bot && !f.veh) this.updateBot(f, dt);
      if (tick && f.ph === PH.GROUND && this.outside(f) && this.state !== 'end') this.damage(f, this.zone.dps, null, -1, false);
    }
    // Recoger automáticamente lo que no necesita botón
    this.pickT = (this.pickT || 0) + dt;
    if (this.pickT > 0.2) {
      this.pickT = 0;
      for (const f of this.fighters.values()) {
        if (!f.alive || f.bot || f.ph !== PH.GROUND || f.veh) continue;
        for (const it of this.items.values()) {
          if (Math.abs(it.x - f.x) > 1.6 || Math.abs(it.z - f.z) > 1.6) continue;
          if (it.k >= 10 || f.slots.includes(-1) || f.slots.includes(it.k)) this.pickup(f, it, false);
        }
      }
    }
  };
  // Foto del estado. Datos públicos primero; inventario solo para el equipo de quien la recibe.
  // Los muertos van cortos: [id, -1, bajas, puesto]
  Match.prototype.snapshot = function (viewerTeam) {
    const z = this.zone, r1 = v => Math.round(v * 10) / 10, r2 = v => Math.round(v * 100) / 100;
    return {
      st: this.state === 'play' ? 1 : 2, al: this.aliveCount(), at: this.aliveTeams().size,
      z: [r1(z.cx), r1(z.cz), r1(z.r), r1(z.tx), r1(z.tz), r1(z.tr), z.stage, Math.ceil(z.t), z.shrinking ? 1 : 0],
      f: [...this.fighters.values()].map(f => {
        if (!f.alive) return [f.id, -1, f.kills, f.place];
        const a = [f.id, r1(f.x), r1(f.y), r1(f.z), r2(f.yaw), r2(f.pitch), Math.max(0, Math.ceil(f.hp)), Math.ceil(f.sh), 1, f.ph,
          f.slots[f.cur], f.kills, f.life, r1(f.vx), r1(f.vy), r1(f.vz), f.grounded ? 1 : 0, f.reloadEnd ? 1 : 0, f.prot > 0 ? 1 : 0, f.place, f.veh, f.seat];
        if (viewerTeam == null || f.team === viewerTeam) a.push(f.iv, f.slots[0], f.slots[1], f.ammo[0], f.ammo[1], f.cur, f.meds, f.shields, f.mag[0], f.mag[1]);
        return a;
      }),
      v: [...this.vehicles.values()].map(v => [v.id, v.type, r1(v.x), r1(v.y), r1(v.z), r2(v.yaw), r1(v.speed), v.seats[0], v.seats[1], v.seats[2], v.seats[3], v.bump ? (v.bump = 0, 1) : 0]),
    };
  };
  Match.prototype.drain = function () { const e = this.events; this.events = []; return e; };

  return {
    SIZE, EYE, RAD, HEIGHT, MAX_PLAYERS, PLANE_Y, PH, WEAPONS, LOOT, LOOT_NAMES, DIFF, ZONE, TEAM_COLORS,
    FLY_TIME, VEHICLES, SEATS, seatPos, stepVehicle, ADS_SPREAD, SPAWN_PROT, rng, clamp, World, Match, makeFighter, stepFighter, planePos, dirFrom, spreadDirs, rayFighters, cleanName,
  };
});
