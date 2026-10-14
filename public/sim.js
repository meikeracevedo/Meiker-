/* Meiker Stick Battle — simulación compartida.
   La usa el servidor (Node) para las salas online y el navegador para el modo solo,
   así las dos versiones se comportan exactamente igual. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MeikerSim = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const approach = (v, t, d) => (v < t ? Math.min(v + d, t) : Math.max(v - d, t));
  const num = (v, d) => (Number.isFinite(+v) ? +v : d);

  const PHYS = {
    gravity: 2200, maxSpeed: 370, accel: 3600, airAccel: 2400, friction: 3000,
    jumpV: 930, djumpV: 840, maxFall: 1500, w: 24, h: 60,
    dashSpeed: 980, dashTime: 0.15, dashCd: 1.0, padV: 1650, coyote: 0.1, buffer: 0.13,
  };
  const SHOULDER = 38;

  const WEAPONS = [
    { key: 'pistol', name: 'Pistola', dmg: 20, rate: 0.28, speed: 1500, spread: 0.03, pellets: 1, life: 0.8, ammo: -1, recoil: 60, kb: 120, shake: 2, len: 16 },
    { key: 'smg', name: 'Subfusil', dmg: 10, rate: 0.085, speed: 1650, spread: 0.085, pellets: 1, life: 0.65, ammo: 72, recoil: 25, kb: 70, shake: 1.5, len: 22 },
    { key: 'shotgun', name: 'Escopeta', dmg: 11, rate: 0.78, speed: 1350, spread: 0.24, pellets: 8, life: 0.33, ammo: 14, recoil: 560, kb: 150, shake: 7, len: 26 },
    { key: 'rifle', name: 'Rifle', dmg: 23, rate: 0.15, speed: 2000, spread: 0.03, pellets: 1, life: 0.8, ammo: 40, recoil: 45, kb: 140, shake: 2.5, len: 30 },
    { key: 'sniper', name: 'Francotirador', dmg: 95, rate: 1.2, speed: 3400, spread: 0.003, pellets: 1, life: 0.8, ammo: 7, recoil: 420, kb: 700, shake: 8, len: 38 },
    { key: 'rocket', name: 'Bazuca', dmg: 100, rate: 1.1, speed: 900, spread: 0.01, pellets: 1, life: 2.4, ammo: 5, recoil: 300, kb: 0, shake: 12, len: 30, splash: 160 },
  ];
  const PICK_HP = 6, PICK_ARMOR = 7;
  const PICK_NAMES = { 6: 'Botiquín', 7: 'Escudo' };
  const DIFF = [
    { name: 'Fácil', err: 0.2, react: 0.7, turn: 4, lead: 0, rateMul: 1.6 },
    { name: 'Normal', err: 0.1, react: 0.4, turn: 7, lead: 0.5, rateMul: 1.2 },
    { name: 'Pro', err: 0.045, react: 0.2, turn: 12, lead: 1, rateMul: 1 },
  ];
  const THEMES = [
    { name: 'Ciudad de noche', sky: ['#07070a', '#1a1622'], far: '#141319', mid: '#1c1b22', solid: '#222228', top: '#F5B50A', plat: '#2c2c33', glow: 'rgba(245,181,10,.55)' },
    { name: 'Desierto rojo', sky: ['#0d0806', '#2b170c'], far: '#1c120c', mid: '#2a1a10', solid: '#2b2019', top: '#F5B50A', plat: '#3a2a1f', glow: 'rgba(255,170,60,.5)' },
    { name: 'Neón', sky: ['#05050b', '#141030'], far: '#121029', mid: '#1a1636', solid: '#1f1d2e', top: '#F5B50A', plat: '#2a2740', glow: 'rgba(160,140,255,.45)' },
    { name: 'Selva', sky: ['#050a07', '#0f1e15'], far: '#0e1912', mid: '#14241a', solid: '#1b241e', top: '#F5B50A', plat: '#26332a', glow: 'rgba(120,230,150,.4)' },
    { name: 'Nieve', sky: ['#0a0c10', '#1a2230'], far: '#161c26', mid: '#1e2632', solid: '#262b33', top: '#F5B50A', plat: '#323945', glow: 'rgba(200,225,255,.45)' },
  ];
  const COLORS = ['#F5B50A', '#F5F5F4', '#4FD1FF', '#FF6FAE', '#3DDC84', '#FF8A3D', '#B18CFF', '#7CF2E0', '#FFE08A', '#C7C7CC'];
  const BOT_NAMES = ['Pecoso', 'Mono', 'Flaco', 'Toño', 'Chepe', 'Nacho', 'Rolo', 'Paisa', 'Mancha', 'Gato', 'Pibe', 'Chucho', 'Lalo', 'Kike', 'Pelusa'];

  /* ---------- Geometría ---------- */
  function segRect(x0, y0, x1, y1, rx, ry, rw, rh) {
    const dx = x1 - x0, dy = y1 - y0;
    let t0 = 0, t1 = 1;
    const p = [-dx, dx, -dy, dy];
    const q = [x0 - rx, rx + rw - x0, y0 - ry, ry + rh - y0];
    for (let i = 0; i < 4; i++) {
      if (p[i] === 0) { if (q[i] < 0) return -1; }
      else {
        const t = q[i] / p[i];
        if (p[i] < 0) { if (t > t1) return -1; if (t > t0) t0 = t; }
        else { if (t < t0) return -1; if (t < t1) t1 = t; }
      }
    }
    return t0;
  }
  function segSolids(map, x0, y0, x1, y1) {
    let best = -1;
    for (const s of map.solids) {
      const t = segRect(x0, y0, x1, y1, s.x, s.y, s.w, s.h);
      if (t >= 0 && (best < 0 || t < best)) best = t;
    }
    return best;
  }
  function overlapSolid(map, x0, y0, x1, y1) {
    for (const s of map.solids) if (x1 > s.x && x0 < s.x + s.w && y1 > s.y && y0 < s.y + s.h) return s;
    return null;
  }
  const canSee = (map, x0, y0, x1, y1) => segSolids(map, x0, y0, x1, y1) < 0;

  /* ---------- Mapa aleatorio ---------- */
  function generateMap(seed) {
    const r = rng(seed);
    const W = Math.round(2400 + r() * 1200), H = 1500, floorY = H - 140;
    const solids = [], plats = [], pads = [];
    solids.push({ x: -300, y: floorY, w: W + 600, h: 600, floor: true });
    solids.push({ x: -600, y: -3000, w: 600, h: H + 3600, wall: true });
    solids.push({ x: W, y: -3000, w: 600, h: H + 3600, wall: true });

    const covers = [];
    let x = 260 + r() * 120;
    while (x < W - 260) {
      if (r() < 0.55) {
        const w = Math.round(70 + r() * 150), h = Math.round(46 + r() * 64);
        const b = { x: Math.round(x), y: floorY - h, w, h };
        solids.push(b); covers.push(b); x += w;
      }
      x += 170 + r() * 260;
    }
    const gap = 185, tiers = 4 + (r() < 0.5 ? 1 : 0);
    for (let t = 1; t <= tiers; t++) {
      const baseY = floorY - t * gap;
      let px = 40 + r() * 260;
      while (px < W - 160) {
        const w = Math.round(150 + r() * 280);
        if (r() < 0.72) {
          const y = Math.round(baseY + (r() - 0.5) * 36);
          const ww = Math.min(w, Math.round(W - 40 - px));
          if (ww > 110) {
            if (t >= 2 && r() < 0.22) solids.push({ x: Math.round(px), y, w: ww, h: 30 });
            else plats.push({ x: Math.round(px), y, w: ww, h: 12 });
          }
        }
        px += w + 110 + r() * 230;
      }
    }
    const padCount = 2 + Math.floor(r() * 2);
    for (let i = 0, tries = 0; i < padCount && tries < 60; tries++) {
      const px = Math.round(150 + r() * (W - 360));
      const p = { x: px, y: floorY, w: 60 };
      if (covers.some(c => p.x + p.w + 40 > c.x && p.x - 40 < c.x + c.w)) continue;
      if (pads.some(o => Math.abs(o.x - p.x) < 500)) continue;
      pads.push(p); i++;
    }
    // Superficies donde se puede estar parado
    const surfaces = [];
    for (const s of solids) if (!s.wall) surfaces.push({ x: Math.max(s.x, 30), x2: Math.min(s.x + s.w, W - 30), y: s.y, floor: !!s.floor });
    for (const p of plats) surfaces.push({ x: p.x, x2: p.x + p.w, y: p.y, plat: true });
    const free = (px, py) => !overlapSolid(map0, px - 14, py - PHYS.h - 4, px + 14, py - 0.5) && !pads.some(p => px > p.x - 30 && px < p.x + p.w + 30 && py === p.y);
    const map0 = { solids };
    function sample(filter, n, minD) {
      const out = [];
      const list = surfaces.filter(filter);
      for (let tries = 0; out.length < n && tries < 600; tries++) {
        const s = list[Math.floor(r() * list.length)];
        if (!s || s.x2 - s.x < 70) continue;
        const px = Math.round(s.x + 30 + r() * (s.x2 - s.x - 60)), py = s.y;
        if (!free(px, py)) continue;
        if (out.some(o => Math.hypot(o.x - px, o.y - py) < minD)) continue;
        out.push({ x: px, y: py });
      }
      return out;
    }
    const spawns = sample(() => true, 18, 160);
    const pickupSpots = sample(s => !s.floor, 8, 260).concat(sample(s => s.floor, 4, 400));
    // Decoración de fondo
    const sky = [];
    for (let i = 0, bx = -200; bx < W * 0.6 + 900; i++) {
      const w = 60 + r() * 140; sky.push({ x: bx, w, h: 140 + r() * 380, lights: Math.floor(r() * 1000) }); bx += w + r() * 40;
    }
    const stars = [];
    for (let i = 0; i < 90; i++) stars.push({ x: r(), y: r() * 0.7, s: 0.6 + r() * 1.6, p: r() * 6.28 });
    const theme = Math.floor(r() * THEMES.length);
    return { seed, W, H, floorY, solids, plats, pads, spawns, pickupSpots, sky, stars, theme, themeName: THEMES[theme].name };
  }

  /* ---------- Física del stickman ---------- */
  function makeFighter(id, name, bot, team, color) {
    return {
      id, name, bot: !!bot, team, color,
      x: 0, y: 0, vx: 0, vy: 0, aim: 0, face: 1,
      hp: 100, armor: 0, alive: false, respawn: 0.3, shield: 0,
      w: 0, ammo: -1, wv: 0, kills: 0, deaths: 0, streak: 0, life: 0, seq: 0,
      lastShot: -9, onGround: false, onPlat: false, coyote: 0, jbuf: 0, jumps: 0,
      jumpHeld: false, dashHeld: false, dashT: 0, dashCd: 0, dropT: 0, dashDir: 1, run: 0,
      ai: null, lastAttacker: null,
    };
  }

  function stepFighter(f, inp, dt, map, fx) {
    const P = PHYS;
    f.coyote = Math.max(0, f.coyote - dt);
    f.jbuf = Math.max(0, f.jbuf - dt);
    f.dashCd = Math.max(0, f.dashCd - dt);
    f.dropT = Math.max(0, f.dropT - dt);
    const mx = clamp(num(inp.mx, 0), -1, 1);
    if (inp.jump && !f.jumpHeld) f.jbuf = P.buffer;
    f.jumpHeld = !!inp.jump;
    if (inp.dash && !f.dashHeld && f.dashCd <= 0) {
      f.dashT = P.dashTime; f.dashCd = P.dashCd;
      f.dashDir = Math.abs(mx) > 0.2 ? Math.sign(mx) : f.face;
      fx && fx('dash', f);
    }
    f.dashHeld = !!inp.dash;
    if (inp.down && f.onPlat) { f.dropT = 0.25; f.onGround = false; }
    if (!f.onGround && f.coyote <= 0 && f.jumps === 0) f.jumps = 1;
    if (f.jbuf > 0) {
      if (f.onGround || f.coyote > 0) {
        f.vy = -P.jumpV; f.jbuf = 0; f.coyote = 0; f.onGround = false; f.jumps = 1;
        fx && fx('jump', f);
      } else if (f.jumps < 2) {
        f.vy = -P.djumpV; f.jbuf = 0; f.jumps = 2;
        fx && fx('djump', f);
      }
    }
    if (f.dashT > 0) {
      f.dashT -= dt; f.vx = f.dashDir * P.dashSpeed; f.vy = Math.min(f.vy, 0) * 0.3;
    } else {
      if (Math.abs(mx) > 0.08) {
        const target = mx * P.maxSpeed;
        const a = f.onGround ? P.accel : P.airAccel;
        // Si va más rápido que el máximo (retroceso, empujón) frena suave
        if (Math.abs(f.vx) > P.maxSpeed && Math.sign(f.vx) === Math.sign(target)) f.vx = approach(f.vx, target, a * 0.25 * dt);
        else f.vx = approach(f.vx, target, a * dt);
      } else {
        f.vx = approach(f.vx, 0, (f.onGround ? P.friction : P.airAccel * 0.35) * dt);
      }
      f.vy = Math.min(f.vy + P.gravity * dt, P.maxFall);
    }
    const wasGround = f.onGround, fallV = f.vy;
    f.onGround = false; f.onPlat = false;
    const steps = Math.max(1, Math.ceil(dt * 120)), h = dt / steps, hw = P.w / 2;
    for (let i = 0; i < steps; i++) {
      // Eje X
      f.x += f.vx * h;
      let s = overlapSolid(map, f.x - hw, f.y - P.h, f.x + hw, f.y);
      if (s) {
        if (f.vx > 0) f.x = s.x - hw - 0.01; else if (f.vx < 0) f.x = s.x + s.w + hw + 0.01;
        else f.x = f.x < s.x + s.w / 2 ? s.x - hw - 0.01 : s.x + s.w + hw + 0.01;
        f.vx = 0;
      }
      // Eje Y
      const prevY = f.y;
      f.y += f.vy * h;
      s = overlapSolid(map, f.x - hw, f.y - P.h, f.x + hw, f.y);
      if (s) {
        if (f.vy >= 0 && prevY <= s.y + 1) { f.y = s.y; f.vy = 0; f.onGround = true; }
        else if (f.vy < 0) { f.y = s.y + s.h + P.h + 0.01; f.vy = 0; }
        else { f.y = s.y; f.vy = 0; f.onGround = true; }
      } else if (f.vy >= 0 && f.dropT <= 0) {
        for (const p of map.plats) {
          if (f.x + hw > p.x && f.x - hw < p.x + p.w && prevY <= p.y + 0.5 && f.y >= p.y) {
            f.y = p.y; f.vy = 0; f.onGround = true; f.onPlat = true; break;
          }
        }
      }
    }
    if (f.onGround) {
      f.jumps = 0; f.coyote = P.coyote;
      for (const p of map.pads) {
        if (f.x > p.x - 6 && f.x < p.x + p.w + 6 && Math.abs(f.y - p.y) < 2) {
          f.vy = -P.padV; f.onGround = false; f.jumps = 1; f.coyote = 0;
          fx && fx('pad', f); break;
        }
      }
      if (f.onGround && !wasGround && fallV > 900) fx && fx('land', f);
      f.run += Math.abs(f.vx) * dt * 0.032;
    }
    f.x = clamp(f.x, 0, map.W); if (f.y < -700) { f.y = -700; f.vy = Math.max(f.vy, 0); }
    if (f.y > map.H + 200) f.y = map.floorY;
    f.face = Math.cos(f.aim) >= 0 ? 1 : -1;
  }

  function spreadAngles(wIdx, aim, seed) {
    const w = WEAPONS[wIdx] || WEAPONS[0], r = rng(seed), out = [];
    for (let i = 0; i < w.pellets; i++) {
      if (w.pellets > 1) out.push(aim + ((i + 0.5) / w.pellets - 0.5) * 2 * w.spread + (r() - 0.5) * w.spread * 0.35);
      else out.push(aim + (r() - 0.5) * 2 * w.spread);
    }
    return out;
  }
  function applyRecoil(f, wIdx, aim) {
    const w = WEAPONS[wIdx] || WEAPONS[0];
    f.vx -= Math.cos(aim) * w.recoil;
    f.vy -= Math.sin(aim) * w.recoil * (f.onGround ? 0.25 : 0.7);
  }
  // Las balas nacen en el hombro y avanzan 26 px enseguida: así nunca atraviesan una pared pegada
  function makeBullets(f, wIdx, aim, seq, seed) {
    const w = WEAPONS[wIdx] || WEAPONS[0], out = [];
    const ox = f.x, oy = f.y - SHOULDER;
    spreadAngles(wIdx, aim, seed).forEach((a, i) => {
      out.push({ id: f.id + ':' + seq + ':' + i, owner: f.id, team: f.team, w: wIdx, x: ox, y: oy, vx: Math.cos(a) * w.speed, vy: Math.sin(a) * w.speed, life: w.life, adv: 26 / w.speed });
    });
    return out;
  }

  /* ---------- Sala (lógica de partida) ---------- */
  function Room(opts) {
    opts = opts || {};
    this.code = opts.code || 'SOLO';
    this.mode = opts.mode === 'team' ? 'team' : 'ffa';
    this.diff = clamp(Math.round(num(opts.diff, 1)), 0, 2);
    this.botCount = clamp(Math.round(num(opts.bots, 5)), 0, 9);
    this.fighters = new Map();
    this.bullets = [];
    this.events = [];
    this.time = 0;
    this.nextId = 1;
    this.newMatch(true);
    for (let i = 0; i < this.botCount; i++) this.addBot();
  }
  Room.prototype.usedColors = function () { return new Set([...this.fighters.values()].map(f => f.color)); };
  Room.prototype.pickColor = function (bot) {
    if (this.mode === 'team' && bot) return ['#FF5A5F', '#FF8A8D', '#E0484D'][this.fighters.size % 3];
    const used = this.usedColors();
    const list = bot ? COLORS.slice(2) : COLORS;
    return list.find(c => !used.has(c)) || list[Math.floor(Math.random() * list.length)];
  };
  Room.prototype.roster = function () {
    return [...this.fighters.values()].map(f => [f.id, f.name, f.bot ? 1 : 0, f.team, f.color]);
  };
  Room.prototype.emitRoster = function () { this.events.push({ t: 'roster', l: this.roster() }); };
  Room.prototype.addBot = function () {
    const id = this.nextId++;
    const used = new Set([...this.fighters.values()].map(f => f.name));
    const pool = BOT_NAMES.filter(n => !used.has('Bot ' + n));
    const name = 'Bot ' + (pool[Math.floor(Math.random() * pool.length)] || id);
    const f = makeFighter(id, name, true, this.mode === 'team' ? 1 : id, this.pickColor(true));
    f.respawn = 0.2 + Math.random() * 0.6;
    this.fighters.set(id, f); this.emitRoster();
    return f;
  };
  Room.prototype.addHuman = function (name) {
    const id = this.nextId++;
    const clean = String(name || '').replace(/[^\p{L}\p{N} _.-]/gu, '').trim().slice(0, 14) || 'Jugador';
    const f = makeFighter(id, clean, false, this.mode === 'team' ? 0 : id, this.pickColor(false));
    f.respawn = 0.1;
    this.fighters.set(id, f);
    this.events.push({ t: 'join', n: clean });
    this.emitRoster();
    return f;
  };
  Room.prototype.removeHuman = function (id) {
    const f = this.fighters.get(id);
    if (!f) return;
    this.fighters.delete(id);
    this.bullets = this.bullets.filter(b => b.owner !== id);
    this.events.push({ t: 'leave', n: f.name });
    this.emitRoster();
  };
  Room.prototype.humanCount = function () { let n = 0; for (const f of this.fighters.values()) if (!f.bot) n++; return n; };
  Room.prototype.scoreLimit = function () { return this.mode === 'team' ? 40 : 20; };

  Room.prototype.newMatch = function (first) {
    this.seed = (Math.random() * 2147483647) | 0;
    this.map = generateMap(this.seed);
    const r = Math.random;
    this.pickups = this.map.pickupSpots.map((s, i) => ({ id: i, x: s.x, y: s.y, kind: this.randomKind(r), active: true, t: 0 }));
    this.state = 'play';
    this.timeLeft = 300;
    this.teamScore = [0, 0];
    this.winner = -1;
    this.bullets = [];
    this.firstBlood = false;
    for (const f of this.fighters.values()) {
      f.kills = 0; f.deaths = 0; f.streak = 0; f.alive = false; f.respawn = 0.15 + Math.random() * 0.3; f.ai = null;
    }
    if (!first) this.events.push({ t: 'map', n: this.map.themeName });
  };
  Room.prototype.randomKind = function (r) {
    const v = r();
    if (v < 0.17) return 1; if (v < 0.32) return 2; if (v < 0.48) return 3;
    if (v < 0.58) return 4; if (v < 0.67) return 5; if (v < 0.86) return PICK_HP; return PICK_ARMOR;
  };
  Room.prototype.spawn = function (f) {
    const enemies = [...this.fighters.values()].filter(o => o !== f && o.alive && (this.mode === 'ffa' || o.team !== f.team));
    let best = null, bestScore = -1;
    for (const s of this.map.spawns) {
      let d = 3000;
      for (const e of enemies) d = Math.min(d, Math.hypot(e.x - s.x, e.y - s.y));
      const score = d + Math.random() * 350;
      if (score > bestScore) { bestScore = score; best = s; }
    }
    best = best || { x: this.map.W / 2, y: this.map.floorY };
    Object.assign(f, {
      x: best.x, y: best.y, vx: 0, vy: 0, hp: 100, armor: 0, alive: true, shield: 1.6,
      w: 0, ammo: -1, onGround: true, jumps: 0, dashT: 0, dashCd: 0, lastAttacker: null,
    });
    f.wv++; f.life++;
    f.aim = best.x < this.map.W / 2 ? 0 : Math.PI;
    this.events.push({ t: 'spawn', id: f.id, x: best.x, y: best.y, l: f.life });
  };

  Room.prototype.fire = function (f, aim, seq, seed, fromClient) {
    if (!f.alive || this.state !== 'play') return false;
    const w = WEAPONS[f.w] || WEAPONS[0];
    if (fromClient) {
      // Presupuesto de disparos: tolera mensajes que llegan juntos por la red sin permitir disparar más rápido
      f.budget = Math.min(2.5, (f.budget == null ? 1 : f.budget) + (this.time - (f.budgetT == null ? this.time : f.budgetT)) / w.rate);
      f.budgetT = this.time;
      if (f.budget < 0.8) return false;
      f.budget -= 1;
    } else if (this.time - f.lastShot < w.rate) return false;
    if (f.ammo === 0) { f.w = 0; f.ammo = -1; f.wv++; return false; }
    f.lastShot = this.time; f.shield = 0; f.aim = aim;
    const wIdx = f.w;
    if (f.ammo > 0) { f.ammo--; if (f.ammo === 0) { f.w = 0; f.ammo = -1; f.wv++; } }
    for (const b of makeBullets(f, wIdx, aim, seq, seed)) { this.bullets.push(b); this.stepBullet(b, b.adv); }
    this.events.push({ t: 'shot', o: f.id, s: seq, a: +aim.toFixed(4), w: wIdx, sd: seed, x: Math.round(f.x), y: Math.round(f.y) });
    return true;
  };
  Room.prototype.isEnemy = function (a, b) { return a !== b && (this.mode === 'ffa' || a.team !== b.team); };

  Room.prototype.damage = function (target, amount, attacker, wIdx, kx, ky, x, y, bid) {
    if (!target.alive) return;
    if (target.shield > 0) { this.events.push({ t: 'hit', id: target.id, by: attacker ? attacker.id : 0, d: 0, x: Math.round(x), y: Math.round(y), b: bid }); return; }
    const absorbed = Math.min(target.armor, amount * 0.66);
    target.armor -= absorbed;
    target.hp -= amount - absorbed;
    if (target.bot) { target.vx += kx; target.vy += ky; }
    if (attacker && attacker !== target) target.lastAttacker = attacker.id;
    this.events.push({ t: 'hit', id: target.id, by: attacker ? attacker.id : 0, d: Math.round(amount), x: Math.round(x), y: Math.round(y), kx: Math.round(kx), ky: Math.round(ky), b: bid });
    if (target.hp <= 0) this.kill(target, attacker, wIdx);
  };
  Room.prototype.kill = function (victim, killer, wIdx) {
    victim.alive = false; victim.hp = 0; victim.respawn = 2.6; victim.deaths++; victim.streak = 0;
    let streak = 0, first = false;
    if (killer && killer !== victim) {
      killer.kills++; killer.streak++; streak = killer.streak;
      if (this.mode === 'team') this.teamScore[killer.team]++;
      if (!this.firstBlood) { this.firstBlood = true; first = true; }
    } else {
      victim.kills = Math.max(0, victim.kills - 1);
    }
    this.events.push({ t: 'kill', k: killer ? killer.id : 0, v: victim.id, w: wIdx, s: streak, fb: first ? 1 : 0, x: Math.round(victim.x), y: Math.round(victim.y), vx: Math.round(victim.vx), vy: Math.round(victim.vy) });
    if (killer && killer !== victim) {
      const lim = this.scoreLimit();
      if (this.mode === 'team' ? this.teamScore[killer.team] >= lim : killer.kills >= lim) this.endMatch();
    }
  };
  Room.prototype.endMatch = function () {
    if (this.state !== 'play') return;
    this.state = 'end'; this.endT = 8;
    if (this.mode === 'team') this.winner = this.teamScore[0] === this.teamScore[1] ? -1 : this.teamScore[0] > this.teamScore[1] ? 0 : 1;
    else {
      let best = null;
      for (const f of this.fighters.values()) if (!best || f.kills > best.kills || (f.kills === best.kills && f.deaths < best.deaths)) best = f;
      this.winner = best ? best.id : -1;
    }
    this.events.push({ t: 'end', wn: this.winner });
  };
  Room.prototype.explode = function (b, x, y) {
    const w = WEAPONS[b.w], owner = this.fighters.get(b.owner);
    this.events.push({ t: 'boom', x: Math.round(x), y: Math.round(y), r: w.splash, b: b.id });
    for (const f of [...this.fighters.values()]) {
      if (!f.alive) continue;
      const self = f.id === b.owner;
      if (!self && owner && !this.isEnemy(owner, f)) continue;
      const cx = f.x, cy = f.y - 32, d = Math.hypot(cx - x, cy - y);
      if (d > w.splash) continue;
      const fall = 1 - d / w.splash, nx = (cx - x) / (d || 1), ny = (cy - y) / (d || 1) - 0.35;
      const kb = 1150 * fall;
      if (self && f.shield <= 0) { if (f.bot) { f.vx += nx * kb; f.vy += ny * kb; } }
      this.damage(f, w.dmg * fall * (self ? 0.35 : 1) + (self ? 0 : 10), owner || null, b.w, nx * kb, ny * kb, cx, cy, null);
    }
  };
  // Avanza una bala; devuelve true si debe desaparecer
  Room.prototype.stepBullet = function (b, dt) {
    if (b.dead) return true;
    const nx = b.x + b.vx * dt, ny = b.y + b.vy * dt;
    let best = 2, hitF = null;
    const tw = segSolids(this.map, b.x, b.y, nx, ny);
    if (tw >= 0) best = tw;
    const owner = this.fighters.get(b.owner);
    for (const f of this.fighters.values()) {
      if (!f.alive || f.id === b.owner) continue;
      if (owner ? !this.isEnemy(owner, f) : f.team === b.team && this.mode === 'team') continue;
      const t = segRect(b.x, b.y, nx, ny, f.x - 15, f.y - 64, 30, 64);
      if (t >= 0 && t < best) { best = t; hitF = f; }
    }
    if (best <= 1) {
      const hx = b.x + (nx - b.x) * best, hy = b.y + (ny - b.y) * best;
      const w = WEAPONS[b.w];
      if (w.splash) this.explode(b, hx, hy);
      else if (hitF) {
        const sp = Math.hypot(b.vx, b.vy) || 1;
        this.damage(hitF, w.dmg, owner || null, b.w, (b.vx / sp) * w.kb, (b.vy / sp) * w.kb * 0.5 - 60, hx, hy, b.id);
      }
      b.dead = true; return true;
    }
    b.x = nx; b.y = ny; b.life -= dt;
    if (b.life <= 0) { b.dead = true; return true; }
    return false;
  };

  Room.prototype.onClientState = function (id, m) {
    const f = this.fighters.get(id);
    if (!f || !f.alive || !m || num(m.l, -1) !== f.life) return;
    f.x = clamp(num(m.x, f.x), 0, this.map.W);
    f.y = clamp(num(m.y, f.y), -700, this.map.H);
    f.vx = clamp(num(m.vx, 0), -3000, 3000);
    f.vy = clamp(num(m.vy, 0), -3000, 3000);
    f.aim = num(m.a, f.aim);
    f.onGround = !!m.g; f.dashT = m.d ? 0.05 : 0;
  };
  Room.prototype.onClientFire = function (id, m) {
    const f = this.fighters.get(id);
    if (!f || !f.alive || !m || num(m.l, -1) !== f.life) return;
    if (Number.isFinite(+m.x) && Math.hypot(+m.x - f.x, +m.y - f.y) < 120) { f.x = +m.x; f.y = +m.y; }
    this.fire(f, num(m.a, f.aim), Math.round(num(m.s, 0)), Math.round(num(m.sd, 1)) >>> 0, true);
  };

  /* ---------- Bots ---------- */
  Room.prototype.updateBot = function (b, dt) {
    const D = DIFF[this.diff];
    const ai = b.ai || (b.ai = { t: 0, target: null, goal: null, strafe: 1, strafeT: 0, seen: 0, err: 0, errT: 0, jumpT: 0, lastX: b.x, stuckT: 0, wander: null, hurtT: 0 });
    const map = this.map, w = WEAPONS[b.w];
    const inp = { mx: 0, jump: false, down: false, dash: false };
    if (this.state !== 'play') { stepFighter(b, inp, dt, map); return; }
    ai.t -= dt; ai.strafeT -= dt; ai.errT -= dt; ai.jumpT -= dt;
    const sx = b.x, sy = b.y - SHOULDER;
    if (ai.t <= 0) {
      ai.t = 0.3 + Math.random() * 0.25;
      let best = null, bestS = Infinity;
      for (const e of this.fighters.values()) {
        if (!e.alive || !this.isEnemy(b, e)) continue;
        const d = Math.hypot(e.x - b.x, e.y - b.y);
        const vis = canSee(map, sx, sy, e.x, e.y - 34);
        const s = d - (vis ? 350 : 0) - (b.lastAttacker === e.id ? 450 : 0) - (e.shield > 0 ? -400 : 0);
        if (s < bestS) { bestS = s; best = e; }
      }
      ai.target = best ? best.id : null;
      ai.goal = null;
      const wantGun = b.w === 0, wantHp = b.hp < 50, wantArmor = b.armor < 30;
      let bp = null, bd = 1300;
      for (const p of this.pickups) {
        if (!p.active) continue;
        const ok = (p.kind < PICK_HP && wantGun) || (p.kind === PICK_HP && wantHp) || (p.kind === PICK_ARMOR && wantArmor && Math.random() < 0.5);
        if (!ok) continue;
        const d = Math.hypot(p.x - b.x, p.y - b.y) * (p.kind === PICK_HP && b.hp < 35 ? 0.5 : 1);
        if (d < bd) { bd = d; bp = p; }
      }
      if (bp) ai.goal = { x: bp.x, y: bp.y };
    }
    const tgt = ai.target != null ? this.fighters.get(ai.target) : null;
    let visible = false, dist = 9999;
    if (tgt && tgt.alive) {
      dist = Math.hypot(tgt.x - b.x, tgt.y - b.y);
      visible = canSee(map, sx, sy, tgt.x, tgt.y - 34);
    }
    ai.seen = visible ? ai.seen + dt : 0;
    const range = w.speed * w.life * 0.9;
    const combat = visible && dist < range + 150 && !(ai.goal && b.w === 0 && dist > 420);
    let G = ai.goal || (tgt && tgt.alive ? { x: tgt.x, y: tgt.y } : null);
    if (!G) {
      if (!ai.wander || Math.abs(ai.wander.x - b.x) < 40) { const s = map.spawns[Math.floor(Math.random() * map.spawns.length)]; ai.wander = s ? { x: s.x, y: s.y } : { x: map.W / 2, y: map.floorY }; }
      G = ai.wander;
    }
    const dx = G.x - b.x, dy = G.y - b.y;
    if (combat && !ai.goal) {
      const pd = { pistol: 380, smg: 300, shotgun: 170, rifle: 460, sniper: 760, rocket: 480 }[w.key];
      if (ai.strafeT <= 0) { ai.strafeT = 0.5 + Math.random() * 0.9; ai.strafe = Math.random() < 0.5 ? -1 : 1; }
      if (dist > pd + 90) inp.mx = Math.sign(dx);
      else if (dist < pd - 90) inp.mx = -Math.sign(dx);
      else inp.mx = ai.strafe * 0.8;
      if (b.onGround && ai.jumpT <= 0 && Math.random() < dt * 1.4) { inp.jump = true; ai.jumpT = 0.4; }
    } else {
      inp.mx = Math.abs(dx) > 28 ? Math.sign(dx) : 0;
    }
    if (dy < -90 && ai.jumpT <= 0 && (b.onGround || (b.jumps < 2 && b.vy > -120))) {
      if (Math.abs(dx) < 520 || Math.random() < dt * 2) { inp.jump = true; ai.jumpT = b.onGround ? 0.22 : 0.4; }
    }
    if (dy > 90 && b.onPlat && Math.abs(dx) < 600) inp.down = true;
    if (Math.abs(inp.mx) > 0.1 && b.onGround && Math.abs(b.x - ai.lastX) < 0.4) {
      ai.stuckT += dt; if (ai.stuckT > 0.18 && ai.jumpT <= 0) { inp.jump = true; ai.jumpT = 0.3; ai.stuckT = 0; }
    } else ai.stuckT = 0;
    ai.lastX = b.x;
    if (b.lastAttacker && b.hp < 60 && Math.random() < dt * 0.8 * (this.diff + 1)) inp.dash = true;
    // Puntería
    if (tgt && tgt.alive) {
      if (ai.errT <= 0) { ai.errT = 0.35 + Math.random() * 0.3; ai.err = (Math.random() - 0.5) * 2 * D.err; }
      const flight = dist / w.speed;
      const tx = tgt.x + tgt.vx * flight * D.lead, ty = tgt.y - 34 + (tgt.onGround ? 0 : tgt.vy * flight * D.lead * 0.5);
      let desired = Math.atan2(ty - sy, tx - sx) + ai.err;
      if (w.splash) desired = Math.atan2(tgt.y - 6 - sy, tx - sx) + ai.err * 0.5;
      let diff = Math.atan2(Math.sin(desired - b.aim), Math.cos(desired - b.aim));
      const turn = D.turn * dt;
      b.aim += clamp(diff, -turn, turn);
      b.aim = Math.atan2(Math.sin(b.aim), Math.cos(b.aim));
      diff = Math.atan2(Math.sin(desired - b.aim), Math.cos(desired - b.aim));
      if (visible && dist < range && ai.seen > D.react && Math.abs(diff) < 0.3 && this.time - b.lastShot > w.rate * D.rateMul) {
        const wi = b.w;
        if (!(w.splash && dist < 140) && this.fire(b, b.aim, ++b.seq, (Math.random() * 4294967295) >>> 0, false)) applyRecoil(b, wi, b.aim);
      }
    } else if (Math.abs(inp.mx) > 0.1) {
      b.aim = inp.mx > 0 ? 0 : Math.PI;
    }
    stepFighter(b, inp, dt, map);
  };

  /* ---------- Bucle principal ---------- */
  Room.prototype.update = function (dt) {
    dt = Math.min(dt, 0.05);
    this.time += dt;
    if (this.state === 'play') {
      this.timeLeft -= dt;
      if (this.timeLeft <= 0) { this.timeLeft = 0; this.endMatch(); }
    } else {
      this.endT -= dt;
      if (this.endT <= 0) this.newMatch(false);
    }
    for (const f of this.fighters.values()) {
      if (!f.alive) {
        if (this.state === 'play') { f.respawn -= dt; if (f.respawn <= 0) this.spawn(f); }
        continue;
      }
      f.shield = Math.max(0, f.shield - dt);
      if (f.bot) this.updateBot(f, dt);
    }
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      if (this.stepBullet(this.bullets[i], dt)) this.bullets.splice(i, 1);
    }
    for (const p of this.pickups) {
      if (!p.active) { p.t -= dt; if (p.t <= 0) { p.active = true; p.kind = this.randomKind(Math.random); } continue; }
      if (this.state !== 'play') continue;
      for (const f of this.fighters.values()) {
        if (!f.alive || Math.abs(f.x - p.x) > 34 || Math.abs(f.y - 30 - (p.y - 24)) > 48) continue;
        if (p.kind === PICK_HP) { if (f.hp >= 100) continue; f.hp = Math.min(100, f.hp + 50); }
        else if (p.kind === PICK_ARMOR) { if (f.armor >= 100) continue; f.armor = Math.min(100, f.armor + 50); }
        else { f.w = p.kind; f.ammo = WEAPONS[p.kind].ammo; f.wv++; }
        this.events.push({ t: 'pick', id: f.id, k: p.kind, x: p.x, y: p.y });
        p.active = false; p.t = p.kind >= PICK_HP ? 14 : 10;
        break;
      }
    }
  };
  Room.prototype.snapshot = function () {
    const r1 = v => Math.round(v * 10) / 10;
    return {
      st: this.state === 'play' ? 0 : 1, tl: Math.ceil(this.timeLeft), sd: this.seed, md: this.mode,
      sc: this.teamScore, wn: this.winner, lim: this.scoreLimit(),
      f: [...this.fighters.values()].map(f => [
        f.id, r1(f.x), r1(f.y), Math.round(f.vx), Math.round(f.vy), Math.round(f.aim * 1000) / 1000,
        Math.max(0, Math.ceil(f.hp)), f.w, f.ammo, f.alive ? 1 : 0, f.shield > 0 ? 1 : 0,
        f.kills, f.deaths, f.life, f.wv, Math.ceil(f.armor), f.onGround ? 1 : 0, f.dashT > 0 ? 1 : 0,
      ]),
      pk: this.pickups.map(p => (p.active ? p.kind : -1)),
    };
  };
  Room.prototype.drain = function () { const e = this.events; this.events = []; return e; };

  return {
    rng, clamp, PHYS, SHOULDER, WEAPONS, PICK_HP, PICK_ARMOR, PICK_NAMES, DIFF, THEMES, COLORS,
    segRect, segSolids, canSee, overlapSolid, generateMap, makeFighter, stepFighter,
    spreadAngles, applyRecoil, makeBullets, Room,
  };
});
