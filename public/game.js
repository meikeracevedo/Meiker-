/* Meiker Stick Battle — cliente */
(() => {
'use strict';
const S = window.MeikerSim;
const W = S.WEAPONS;
const $ = (id) => document.getElementById(id);
const clamp = S.clamp;
const TAU = Math.PI * 2;
const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
const canvas = $('game');
const ctx = canvas.getContext('2d', { alpha: false });

/* ---------- Ajustes guardados ---------- */
const settings = { name: '', sound: true, vibe: true, assist: true, full: true, mode: 'ffa', bots: 5, diff: 1 };
try { Object.assign(settings, JSON.parse(localStorage.getItem('meiker-settings') || '{}')); } catch (_) {}
const saveSettings = () => { try { localStorage.setItem('meiker-settings', JSON.stringify(settings)); } catch (_) {} };

/* ---------- Audio sintetizado ---------- */
const AC = { ctx: null, out: null, noise: null, last: {} };
function audioInit() {
  if (AC.ctx) { if (AC.ctx.state === 'suspended') AC.ctx.resume(); return; }
  const C = window.AudioContext || window.webkitAudioContext;
  if (!C) return;
  const c = new C();
  const comp = c.createDynamicsCompressor();
  const g = c.createGain(); g.gain.value = 0.55;
  g.connect(comp); comp.connect(c.destination);
  const buf = c.createBuffer(1, c.sampleRate, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  Object.assign(AC, { ctx: c, out: g, noise: buf });
}
function env(g, t, a, peak, dec) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec);
}
function noise(t, dur, type, f0, f1, vol, q) {
  const c = AC.ctx, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
  s.buffer = AC.noise; f.type = type; f.Q.value = q || 0.8;
  f.frequency.setValueAtTime(f0, t); if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
  env(g, t, 0.004, vol, dur);
  s.connect(f); f.connect(g); g.connect(AC.out);
  s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
}
function tone(t, type, f0, f1, dur, vol) {
  const c = AC.ctx, o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, t); if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  env(g, t, 0.005, vol, dur);
  o.connect(g); g.connect(AC.out); o.start(t); o.stop(t + dur + 0.05);
}
function sfx(name, vol = 1, arg) {
  if (!settings.sound || !AC.ctx || vol <= 0.02) return;
  const now = AC.ctx.currentTime;
  const key = name + (arg ?? '');
  if (AC.last[key] && now - AC.last[key] < 0.03) return;
  AC.last[key] = now;
  const t = now + 0.005, v = vol;
  switch (name) {
    case 'shot':
      switch (arg) {
        case 0: noise(t, 0.09, 'bandpass', 2200, 700, 0.5 * v, 1.2); tone(t, 'square', 300, 90, 0.05, 0.12 * v); break;
        case 1: noise(t, 0.05, 'bandpass', 2600, 1200, 0.38 * v, 1.4); break;
        case 2: noise(t, 0.28, 'lowpass', 2400, 300, 0.9 * v); tone(t, 'sine', 120, 45, 0.18, 0.5 * v); break;
        case 3: noise(t, 0.1, 'bandpass', 1700, 600, 0.55 * v, 1); tone(t, 'square', 220, 80, 0.06, 0.12 * v); break;
        case 4: noise(t, 0.45, 'lowpass', 3500, 200, 0.9 * v); tone(t, 'sawtooth', 900, 120, 0.12, 0.2 * v); tone(t, 'sine', 90, 40, 0.3, 0.5 * v); break;
        case 5: noise(t, 0.5, 'bandpass', 400, 1600, 0.5 * v, 0.7); break;
      }
      break;
    case 'boom': noise(t, 0.9, 'lowpass', 900, 60, 1.1 * v); tone(t, 'sine', 80, 30, 0.6, 0.8 * v); break;
    case 'hit': tone(t, 'sine', 1500, 1100, 0.05, 0.25 * v); break;
    case 'hurt': tone(t, 'square', 180, 70, 0.12, 0.18 * v); noise(t, 0.06, 'lowpass', 900, 0, 0.3 * v); break;
    case 'jump': tone(t, 'sine', 280, 560, 0.1, 0.12 * v); break;
    case 'djump': tone(t, 'sine', 420, 900, 0.12, 0.12 * v); break;
    case 'pad': tone(t, 'triangle', 200, 1200, 0.3, 0.25 * v); break;
    case 'dash': noise(t, 0.14, 'highpass', 900, 3500, 0.35 * v); break;
    case 'land': noise(t, 0.08, 'lowpass', 500, 0, 0.35 * v); break;
    case 'pick': tone(t, 'sine', 660, 0, 0.08, 0.25 * v); tone(t + 0.07, 'sine', 990, 0, 0.12, 0.25 * v); break;
    case 'kill': [523, 659, 784, 1047].forEach((f, i) => tone(t + i * 0.06, 'triangle', f, 0, 0.14, 0.22 * v)); break;
    case 'die': tone(t, 'sawtooth', 320, 50, 0.6, 0.22 * v); break;
    case 'empty': tone(t, 'square', 900, 0, 0.03, 0.08 * v); break;
    case 'spawn': tone(t, 'sine', 400, 800, 0.25, 0.15 * v); break;
  }
}
function vibrate(ms) { if (settings.vibe && navigator.vibrate) try { navigator.vibrate(ms); } catch (_) {} }

/* ---------- Estado del juego ---------- */
const G = {
  screen: 'menu', session: null, myId: null, map: null, seed: null,
  ents: new Map(), me: null, bullets: [], parts: [], rags: [], texts: [], pickups: [],
  st: 0, tl: 300, sc: [0, 0], md: 'ffa', wn: -1, lim: 20,
  cam: { x: 1200, y: 1000, shake: 0, follow: null, followT: 0 },
  paused: false, deadAt: 0, killer: '', hurtFlash: 0, time: 0, code: null, ping: null,
  boardAuto: false, endAt: 0,
};
let VW = innerWidth, VH = innerHeight, DPR = 1, ZOOM = 1, SAL = 0;

function resize() {
  VW = innerWidth; VH = innerHeight;
  DPR = Math.min(window.devicePixelRatio || 1, VW * VH > 900000 ? 1.5 : 2);
  canvas.width = Math.round(VW * DPR); canvas.height = Math.round(VH * DPR);
  const target = clamp(VH * 1.15, 620, 1000);
  ZOOM = Math.min(VH / target, VW / 640);
  vignette = null;
  SAL = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--sal')) || 0;
  checkRotate();
}
addEventListener('resize', resize);

/* ---------- Sesiones: solo, online y fondo del menú ---------- */
function offlineSession(opts, demo) {
  const room = new S.Room(opts);
  let myId = null;
  if (!demo) myId = room.addHuman(opts.name).id;
  return {
    kind: demo ? 'demo' : 'offline', room, myId, code: null,
    update(dt) {
      if (G.paused && !demo) return;
      if (G.me && G.me.alive) room.onClientState(myId, stateMsg());
      room.update(dt);
      onSnapshot(room.snapshot(), room.drain(), 0);
    },
    fire(m) { room.onClientFire(myId, m); },
    close() {},
  };
}
function onlineSession(kind, payload) {
  return new Promise((resolve, reject) => {
    if (location.protocol === 'file:') return reject(new Error('Para jugar online abre el juego desde el servidor, no como archivo.'));
    const ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws');
    let welcomed = false, sendT = 0, pingT = 0;
    const sess = {
      kind: 'online', ws, myId: null, code: null,
      update(dt) {
        sendT += dt; pingT += dt;
        if (sendT >= 1 / 30 && G.me && G.me.alive && ws.readyState === 1) { sendT = 0; ws.send(JSON.stringify(Object.assign({ t: 'st' }, stateMsg()))); }
        if (pingT > 2 && ws.readyState === 1) { pingT = 0; ws.send(JSON.stringify({ t: 'ping', c: performance.now() })); }
      },
      fire(m) { if (ws.readyState === 1) ws.send(JSON.stringify(Object.assign({ t: 'fire' }, m))); },
      close() { sess.closed = true; try { ws.close(); } catch (_) {} },
    };
    const timer = setTimeout(() => { if (!welcomed) { ws.close(); reject(new Error('El servidor no respondió. Si está en Render gratis puede tardar ~50 s en despertar: inténtalo otra vez.')); } }, 25000);
    ws.onopen = () => ws.send(JSON.stringify(Object.assign({ t: kind }, payload)));
    ws.onmessage = (ev) => {
      let m; try { m = JSON.parse(ev.data); } catch (_) { return; }
      if (m.t === 's') { if (welcomed && G.session === sess) onSnapshot(m, m.ev || [], 1); }
      else if (m.t === 'welcome') {
        welcomed = true; clearTimeout(timer);
        sess.myId = m.id; sess.code = m.code; sess.roster = m.roster;
        resolve(sess);
      } else if (m.t === 'err') { clearTimeout(timer); ws.close(); reject(new Error(m.msg)); }
      else if (m.t === 'pong') G.ping = Math.round(performance.now() - m.c);
    };
    ws.onerror = () => {};
    ws.onclose = () => {
      clearTimeout(timer);
      if (!welcomed) reject(new Error('Uy, no pudimos conectar con el servidor. Revisa tu internet e inténtalo otra vez.'));
      else if (!sess.closed && G.session === sess) {
        backToMenu('Uy, se cayó la conexión. Revisa tu internet y vuelve a entrar con el código ' + sess.code + '.', true);
      }
    };
  });
}

function resetWorld() {
  G.ents.clear(); G.bullets = []; G.parts = []; G.rags = []; G.texts = []; G.pickups = [];
  G.map = null; G.seed = null; G.me = null; G.myId = null; G.st = 0; G.wn = -1;
  feedEl.innerHTML = ''; toastsEl.innerHTML = '';
}
function startDemo() {
  resetWorld();
  G.session = offlineSession({ mode: 'ffa', bots: 6, diff: 1 }, true);
  G.session.update(0.016);
}
function beginPlay(sess) {
  G.session = sess;
  G.myId = sess.myId;
  G.code = sess.code;
  const me = S.makeFighter(sess.myId, settings.name || 'Jugador', false, 0, '#F5B50A');
  me.alive = false; me.life = 0; me.lastShotT = -9; me.flash = 0; me.kick = 0; me.hurt = 0;
  G.me = me;
  G.paused = false;
  G.screen = 'play';
  show($('menu'), false); show($('hud'), true); show($('touch'), isTouch);
  $('codeChip').hidden = !sess.code; $('codeText').textContent = sess.code || '';
  $('pingChip').hidden = sess.kind !== 'online';
  $('touch').classList.remove('used');
  document.body.style.cursor = isTouch ? '' : 'none';
  checkRotate();
  if (sess.kind === 'online' && sess.code) {
    try { history.replaceState(null, '', '/?sala=' + sess.code); } catch (_) {}
    toast('Sala ' + sess.code + ': comparte el código con tu parcero');
  }
}
async function startGame() {
  audioInit();
  const name = ($('nameInput').value || '').trim().slice(0, 14);
  settings.name = name; saveSettings();
  if (isTouch && settings.full) goFullscreen();
  const tab = currentTab;
  const opts = { name: name || 'Jugador', mode: settings.mode, bots: settings.bots, diff: settings.diff };
  if (tab === 'solo') {
    G.session && G.session.close();
    resetWorld();
    const sess = offlineSession(opts, false);
    G.session = sess;
    beginPlay(sess);
    return;
  }
  const code = $('codeInput').value.trim().toUpperCase();
  if (tab === 'join' && code.length < 4) { setNote('Escribe el código de 4 letras que te pasó tu parcero.', true); return; }
  show($('loading'), true);
  $('loadingText').textContent = tab === 'join' ? 'Entrando a la sala ' + code + '…' : 'Creando tu sala…';
  try {
    const sess = await onlineSession(tab === 'join' ? 'join' : 'create', tab === 'join' ? { name: opts.name, code } : opts);
    G.session && G.session.close();
    resetWorld();
    applyRoster(sess.roster);
    beginPlay(sess);
  } catch (err) {
    setNote(err.message, true);
  } finally {
    show($('loading'), false);
  }
}
function backToMenu(msg, err) {
  if (G.session) G.session.close();
  G.screen = 'menu';
  show($('hud'), false); show($('touch'), false); show($('pause'), false); show($('board'), false);
  show($('menu'), true);
  document.body.style.cursor = '';
  try { history.replaceState(null, '', '/'); } catch (_) {}
  if (msg) {
    setNote(msg, err);
    if (err && G.code) { $('codeInput').value = G.code; setTab('join'); }
  } else setTab(currentTab);
  G.code = null;
  checkRotate();
  startDemo();
}

/* ---------- Red: snapshots y eventos ---------- */
function ensureEnt(id) {
  let e = G.ents.get(id);
  if (!e) {
    e = { id, name: '?', bot: false, team: 0, color: '#F5F5F4', buf: [], x: 0, y: 0, rx: 0, ry: 0, raim: 0, vx: 0, vy: 0, aim: 0, hp: 100, w: 0, ammo: -1,
      alive: false, shield: 0, kills: 0, deaths: 0, life: 0, wv: 0, armor: 0, g: 1, dash: 0, run: 0, hurt: 0, flash: 0, kick: 0 };
    G.ents.set(id, e);
  }
  return e;
}
function applyRoster(list) {
  const ids = new Set();
  for (const [id, name, bot, team, color] of list) {
    const e = ensureEnt(id);
    Object.assign(e, { name, bot: !!bot, team, color });
    ids.add(id);
  }
  for (const id of [...G.ents.keys()]) if (!ids.has(id)) G.ents.delete(id);
  if (G.me) { const e = G.ents.get(G.myId); if (e) { G.me.color = e.color; G.me.team = e.team; G.me.name = e.name; } }
}

function onSnapshot(s, events, online) {
  const now = performance.now() / 1000;
  for (const ev of events) if (ev.t === 'roster') applyRoster(ev.l);
  if (s.sd !== G.seed) {
    G.seed = s.sd; G.map = S.generateMap(s.sd);
    G.bullets = []; G.parts = []; G.rags = [];
    bgCache = null;
    if (G.me) G.me.alive = false;
    if (!G.cam.init) { G.cam.x = G.map.W / 2; G.cam.y = G.map.floorY - 300; G.cam.init = true; }
  }
  const prevSt = G.st;
  G.st = s.st; G.tl = s.tl; G.sc = s.sc; G.md = s.md; G.wn = s.wn; G.lim = s.lim;
  G.pickups = s.pk;
  for (const a of s.f) {
    const e = ensureEnt(a[0]);
    const life = a[13];
    if (life !== e.life) e.buf.length = 0;
    Object.assign(e, { hp: a[6], w: a[7], ammo: a[8], alive: !!a[9], shield: a[10], kills: a[11], deaths: a[12], life, wv: a[14], armor: a[15] });
    e.buf.push({ t: now, x: a[1], y: a[2], vx: a[3], vy: a[4], aim: a[5], g: a[16], dash: a[17] });
    if (e.buf.length > 14) e.buf.shift();
    if (!e.buf[1]) { e.rx = a[1]; e.ry = a[2]; e.raim = a[5]; }
    if (G.me && e.id === G.myId) syncMe(e, a);
  }
  for (const ev of events) handleEvent(ev, online);
  if (prevSt === 1 && G.st === 0 && G.boardAuto) { show($('board'), false); G.boardAuto = false; }
}
function syncMe(e, a) {
  const me = G.me;
  me.hp = e.hp; me.armor = e.armor; me.shield = e.shield; me.kills = e.kills; me.deaths = e.deaths;
  if (e.alive && e.life !== me.life) {
    Object.assign(me, { x: a[1], y: a[2], vx: 0, vy: 0, alive: true, life: e.life, w: e.w, ammo: e.ammo, wv: e.wv, aim: a[5], jumps: 0, dashT: 0 });
    G.cam.x = me.x; G.cam.y = me.y - 120;
    show(bannerEl, false);
    sfx('spawn', 0.8);
  } else if (!e.alive && me.alive) me.alive = false;
  if (e.wv !== me.wv) { me.w = e.w; me.ammo = e.ammo; me.wv = e.wv; }
}
function entPos(id) {
  if (G.me && id === G.myId) return { x: G.me.x, y: G.me.y, vx: G.me.vx, vy: G.me.vy, color: G.me.color };
  const e = G.ents.get(id);
  return e ? { x: e.rx, y: e.ry, vx: e.vx, vy: e.vy, color: e.color } : null;
}
function nameOf(id) { const e = G.ents.get(id); return e ? e.name : '?'; }
function distToCam(x, y) { return Math.hypot(x - G.cam.x, y - G.cam.y); }
const volAt = (x, y) => clamp(1.15 - distToCam(x, y) / 1500, 0, 1);

function handleEvent(ev, online) {
  const me = G.me;
  switch (ev.t) {
    case 'shot': {
      if (me && ev.o === G.myId) break;
      const e = G.ents.get(ev.o);
      const p = e && e.buf.length ? { x: online ? e.rx : ev.x, y: online ? e.ry : ev.y } : { x: ev.x, y: ev.y };
      const fake = { id: ev.o, team: e ? e.team : 0, x: p.x, y: p.y };
      spawnVisualBullets(S.makeBullets(fake, ev.w, ev.a, ev.s, ev.sd), ev.a, p.x, p.y, ev.w);
      if (e) { e.flash = 0.06; e.kick = 1; e.raim = ev.a; }
      sfx('shot', volAt(p.x, p.y) * 0.8, ev.w);
      break;
    }
    case 'hit': {
      if (ev.b) G.bullets = G.bullets.filter(b => b.id !== ev.b);
      const tgt = G.ents.get(ev.id);
      if (ev.d <= 0) { burst(ev.x, ev.y, '#8ec9ff', 6, 160); break; }
      burst(ev.x, ev.y, tgt ? tgt.color : '#fff', Math.min(14, 4 + ev.d / 6), 260, 'blood');
      if (tgt) tgt.hurt = 0.12;
      if (me && ev.id === G.myId) {
        me.vx += ev.kx || 0; me.vy += ev.ky || 0; me.hurt = 0.12;
        G.hurtFlash = Math.min(1, G.hurtFlash + ev.d / 60);
        G.cam.shake = Math.max(G.cam.shake, 4 + ev.d / 10);
        vibrate(ev.d > 40 ? 70 : 25);
        sfx('hurt', 0.8);
      } else if (me && ev.by === G.myId) {
        floatText(ev.x, ev.y - 20, String(ev.d), ev.d >= 60 ? '#FF5A5F' : '#F5B50A', ev.d >= 60 ? 22 : 16);
        sfx('hit', 0.9);
      }
      break;
    }
    case 'kill': {
      const p = entPos(ev.v) || { x: ev.x, y: ev.y, vx: 0, vy: 0, color: '#fff' };
      ragdoll(p.x, p.y, p.vx + (ev.vx || 0) * 0.3, p.vy - 300, p.color);
      burst(p.x, p.y - 30, p.color, 18, 380, 'blood');
      addFeed(ev);
      if (me && ev.v === G.myId) {
        me.alive = false; G.deadAt = performance.now();
        G.killer = ev.k && ev.k !== ev.v ? nameOf(ev.k) : '';
        G.cam.shake = 10; vibrate([60, 40, 90]); sfx('die', 1);
        showDeathBanner();
      } else if (me && ev.k === G.myId) {
        sfx('kill', 1); vibrate(30);
        const names = { 2: 'Doble baja', 3: 'Triple baja', 4: 'Cuádruple', 5: 'Imparable', 7: 'Leyenda', 10: 'Nadie te para' };
        toast(ev.fb ? 'Primera sangre' : names[ev.s] || '+1 baja · ' + nameOf(ev.v), !!(ev.fb || names[ev.s]));
      } else sfx('die', volAt(p.x, p.y) * 0.4);
      break;
    }
    case 'boom': {
      if (ev.b) G.bullets = G.bullets.filter(b => b.id !== ev.b);
      explosion(ev.x, ev.y, ev.r);
      const d = distToCam(ev.x, ev.y);
      G.cam.shake = Math.max(G.cam.shake, clamp(22 - d / 60, 0, 22));
      if (d < 500) vibrate(50);
      sfx('boom', volAt(ev.x, ev.y));
      break;
    }
    case 'pick': {
      burst(ev.x, ev.y - 26, ev.k === S.PICK_HP ? '#3DDC84' : ev.k === S.PICK_ARMOR ? '#8ec9ff' : '#F5B50A', 10, 200);
      if (me && ev.id === G.myId) { toast('+ ' + (W[ev.k] ? W[ev.k].name : S.PICK_NAMES[ev.k])); sfx('pick', 1); vibrate(15); }
      else sfx('pick', volAt(ev.x, ev.y) * 0.4);
      break;
    }
    case 'spawn': {
      const e = G.ents.get(ev.id);
      if (e) { e.buf.length = 0; e.rx = ev.x; e.ry = ev.y; }
      burst(ev.x, ev.y - 30, '#F5B50A', 10, 160);
      break;
    }
    case 'end': {
      G.endAt = performance.now();
      setTimeout(() => { if (G.screen === 'play' && G.st === 1) { openBoard(true); } }, 900);
      const iWon = me && (G.md === 'team' ? ev.wn === 0 : ev.wn === G.myId);
      if (me) { toast(iWon ? 'Ganaste, qué nivel' : 'Se acabó la partida', true); if (iWon) vibrate([40, 40, 40, 40, 120]); }
      break;
    }
    case 'map': if (G.screen === 'play') toast('Nuevo mapa: ' + ev.n); break;
    case 'join': if (G.screen === 'play' && G.session.kind === 'online') toast(ev.n + ' entró a la sala'); break;
    case 'leave': if (G.screen === 'play' && G.session.kind === 'online') toast(ev.n + ' salió de la sala'); break;
  }
}

/* ---------- Efectos visuales ---------- */
function spawnVisualBullets(list, aim, x, y, wIdx) {
  for (const b of list) {
    b.trail = 0; b.age = 0;
    stepVisualBullet(b, b.adv);
    G.bullets.push(b);
  }
  const w = W[wIdx];
  const mx = x + Math.cos(aim) * (16 + w.len), my = y - S.SHOULDER + Math.sin(aim) * (16 + w.len);
  G.parts.push({ type: 'flash', x: mx, y: my, a: aim, life: 0.05, max: 0.05, size: w.pellets > 1 || w.splash ? 1.6 : 1 });
  if (!w.splash) G.parts.push({ type: 'shell', x: x, y: y - S.SHOULDER, vx: -Math.cos(aim) * 80 + (Math.random() - 0.5) * 60, vy: -220 - Math.random() * 120, life: 1.2, max: 1.2, a: 0, va: 20 });
  for (let i = 0; i < (w.splash ? 8 : 3); i++) G.parts.push({ type: 'smoke', x: mx, y: my, vx: Math.cos(aim) * 60 + (Math.random() - 0.5) * 40, vy: -20 - Math.random() * 30, life: 0.5, max: 0.5, size: w.splash ? 10 : 5 });
}
function stepVisualBullet(b, dt) {
  const map = G.map; if (!map) return true;
  const nx = b.x + b.vx * dt, ny = b.y + b.vy * dt;
  const t = S.segSolids(map, b.x, b.y, nx, ny);
  if (t >= 0) {
    const hx = b.x + (nx - b.x) * t, hy = b.y + (ny - b.y) * t;
    burst(hx, hy, '#F5B50A', 4, 180, 'spark');
    b.x = hx; b.y = hy; return true;
  }
  b.x = nx; b.y = ny; b.life -= dt; b.age += dt;
  if (W[b.w].splash && Math.random() < 0.7) G.parts.push({ type: 'smoke', x: b.x, y: b.y, vx: (Math.random() - 0.5) * 30, vy: -20, life: 0.6, max: 0.6, size: 7 });
  return b.life <= 0;
}
function burst(x, y, color, n, speed, type = 'spark') {
  if (G.parts.length > 600) return;
  for (let i = 0; i < n; i++) {
    const a = Math.random() * TAU, s = speed * (0.3 + Math.random() * 0.7);
    G.parts.push({ type, x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - (type === 'blood' ? 120 : 0), life: 0.35 + Math.random() * 0.35, max: 0.7, color, size: type === 'blood' ? 2 + Math.random() * 3 : 2 });
  }
}
function explosion(x, y, r) {
  G.parts.push({ type: 'ring', x, y, life: 0.35, max: 0.35, r });
  G.parts.push({ type: 'glow', x, y, life: 0.25, max: 0.25, r });
  for (let i = 0; i < 22; i++) {
    const a = Math.random() * TAU, s = 100 + Math.random() * 420;
    G.parts.push({ type: 'fire', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 80, life: 0.4 + Math.random() * 0.4, max: 0.8, size: 6 + Math.random() * 10 });
  }
  for (let i = 0; i < 12; i++) G.parts.push({ type: 'smoke', x: x + (Math.random() - 0.5) * r * 0.6, y: y + (Math.random() - 0.5) * r * 0.6, vx: (Math.random() - 0.5) * 80, vy: -40 - Math.random() * 60, life: 1.1, max: 1.1, size: 16 });
}
function ragdoll(x, y, vx, vy, color) {
  const parts = [
    { kind: 'head', ox: 0, oy: -53, len: 0 },
    { kind: 'seg', ox: 0, oy: -34, len: 20, a: Math.PI / 2 },
    { kind: 'seg', ox: -5, oy: -12, len: 22, a: Math.PI / 2 + 0.3 },
    { kind: 'seg', ox: 5, oy: -12, len: 22, a: Math.PI / 2 - 0.3 },
    { kind: 'seg', ox: -6, oy: -36, len: 18, a: 0.8 },
    { kind: 'seg', ox: 6, oy: -36, len: 18, a: -0.8 + Math.PI },
  ];
  for (const p of parts) {
    G.rags.push({ kind: p.kind, x: x + p.ox, y: y + p.oy, vx: vx * 0.5 + (Math.random() - 0.5) * 380, vy: vy * 0.5 - Math.random() * 300, a: p.a || 0, va: (Math.random() - 0.5) * 18, len: p.len, color, life: 3.2 });
  }
}
function floatText(x, y, text, color, size) { G.texts.push({ x, y, text, color, size, life: 0.8, vy: -90 }); }

/* ---------- UI del HUD ---------- */
const feedEl = $('feed'), toastsEl = $('toasts'), bannerEl = $('banner');
function addFeed(ev) {
  const div = document.createElement('div');
  div.className = 'feed-item' + (ev.k === G.myId || ev.v === G.myId ? ' mine' : '');
  const kc = G.ents.get(ev.k), vc = G.ents.get(ev.v);
  const wName = W[ev.w] ? W[ev.w].name : '';
  if (!ev.k || ev.k === ev.v) div.innerHTML = `<b style="color:${vc ? vc.color : '#fff'}">${esc(nameOf(ev.v))}</b><span class="w">se voló solo</span>`;
  else div.innerHTML = `<b style="color:${kc ? kc.color : '#fff'}">${esc(nameOf(ev.k))}</b><span class="w">${esc(wName)}</span><b style="color:${vc ? vc.color : '#fff'}">${esc(nameOf(ev.v))}</b>`;
  feedEl.prepend(div);
  while (feedEl.children.length > (VH < 520 ? 3 : 5)) feedEl.lastChild.remove();
  setTimeout(() => div.remove(), 6000);
}
function toast(text, big) {
  const d = document.createElement('div');
  d.className = 'toast' + (big ? ' big' : '');
  d.textContent = text;
  toastsEl.append(d);
  while (toastsEl.children.length > 3) toastsEl.firstChild.remove();
  setTimeout(() => d.remove(), big ? 2200 : 2600);
}
function showDeathBanner() {
  bannerEl.innerHTML = `<h3>${G.killer ? 'Te bajó ' + esc(G.killer) : 'Te caíste solito'}</h3><p>Vuelves en</p><span class="rx-num" id="respawnNum">3</span>`;
  show(bannerEl, true);
}
const esc = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function show(el, on) { el.classList.toggle('hidden', !on); }
const hudCache = {};
function setText(id, v) { if (hudCache[id] !== v) { hudCache[id] = v; $(id).textContent = v; } }
function setStyle(id, prop, v) { const k = id + prop; if (hudCache[k] !== v) { hudCache[k] = v; $(id).style[prop] = v; } }
function updateHud() {
  const me = G.me; if (!me) return;
  setText('hudName', me.name);
  setStyle('hpBar', 'width', clamp(me.hp, 0, 100) + '%');
  setStyle('hpBar', 'background', me.hp < 35 ? '#FF5A5F' : '#F5B50A');
  setStyle('armorBar', 'width', clamp(me.armor, 0, 100) + '%');
  const t = Math.max(0, G.tl);
  setText('hudTimer', G.st === 1 ? 'Fin' : Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0'));
  if (G.md === 'team') {
    setText('hudScore', `Tu equipo ${G.sc[0]} · ${G.sc[1]} Bots`);
  } else {
    let lead = 0; for (const e of G.ents.values()) lead = Math.max(lead, e.kills);
    setText('hudScore', `Tú ${me.kills} · top ${lead} / ${G.lim}`);
  }
  const w = W[me.w] || W[0];
  setText('weaponName', w.name);
  setText('weaponAmmo', me.ammo < 0 ? '∞' : String(me.ammo));
  $('weaponBox').classList.toggle('low', me.ammo >= 0 && me.ammo <= Math.max(2, w.ammo * 0.2));
  if (G.ping != null) setText('pingChip', G.ping + ' ms');
  if (!me.alive && G.st === 0 && !bannerEl.classList.contains('hidden')) {
    const n = $('respawnNum');
    if (n) n.textContent = Math.max(1, Math.ceil((2600 - (performance.now() - G.deadAt)) / 1000));
  }
  if (G.st === 1 && G.boardAuto) {
    const left = Math.max(0, Math.ceil(8 - (performance.now() - G.endAt) / 1000));
    setText('boardSub', 'Siguiente mapa en ' + left + ' s');
  }
}
function openBoard(auto) {
  G.boardAuto = !!auto;
  const list = [...G.ents.values()].sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);
  let title = 'Tabla';
  if (G.st === 1) {
    if (G.md === 'team') title = G.wn === 0 ? 'Ganó tu equipo' : G.wn === 1 ? 'Ganaron los bots' : 'Empate';
    else title = G.wn === G.myId ? 'Ganaste, qué nivel' : (nameOf(G.wn) + ' ganó la partida');
  }
  $('boardTitle').textContent = title;
  hudCache.boardSub = null;
  $('boardSub').textContent = G.st === 1 ? 'Siguiente mapa en 8 s' : (G.md === 'team' ? `Tu equipo ${G.sc[0]} · ${G.sc[1]} Bots · meta ${G.lim}` : `Gana el primero en llegar a ${G.lim} bajas`);
  $('boardBody').innerHTML = list.map((e, i) => {
    const win = G.st === 1 && (G.md === 'team' ? e.team === G.wn : e.id === G.wn);
    return `<tr class="${e.id === G.myId ? 'me' : ''} ${win ? 'win' : ''}"><td>${i + 1}</td><td><span class="dot" style="background:${e.color}"></span>${esc(e.name)}${e.bot ? '<span class="tag">bot</span>' : ''}${e.id === G.myId ? '<span class="tag">tú</span>' : ''}</td><td>${e.kills}</td><td>${e.deaths}</td></tr>`;
  }).join('');
  show($('board'), true);
}

/* ---------- Entrada ---------- */
const keys = {};
const input = { mx: 0, jump: false, down: false, dash: false, fire: false, aiming: false, aimAngle: 0, quickFire: false };
const mouse = { x: 0, y: 0, down: false, active: false };
const sticks = { move: null, aim: null };
const btn = { jump: false, dash: false };

addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') { if (e.key === 'Enter') startGame(); return; }
  keys[e.code] = true;
  if (G.screen === 'play') {
    if (e.code === 'Escape') togglePause();
    if (e.code === 'Tab') { e.preventDefault(); openBoard(false); }
    if (['Space', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
  }
});
addEventListener('keyup', (e) => {
  keys[e.code] = false;
  if (e.code === 'Tab' && G.screen === 'play' && !G.boardAuto) show($('board'), false);
});
addEventListener('blur', () => { for (const k in keys) keys[k] = false; mouse.down = false; });

canvas.addEventListener('pointerdown', (e) => {
  audioInit();
  if (G.screen !== 'play') return;
  if (e.pointerType === 'mouse') {
    mouse.x = e.clientX; mouse.y = e.clientY; mouse.active = true;
    if (e.button === 0) mouse.down = true;
    return;
  }
  mouse.active = false;
  try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
  $('touch').classList.add('used');
  const s = { id: e.pointerId, ox: e.clientX, oy: e.clientY, x: e.clientX, y: e.clientY, t0: performance.now(), maxD: 0 };
  if (e.clientX < VW * 0.45) { if (!sticks.move) sticks.move = s; }
  else if (!sticks.aim) sticks.aim = s;
});
canvas.addEventListener('pointermove', (e) => {
  if (e.pointerType === 'mouse') { mouse.x = e.clientX; mouse.y = e.clientY; mouse.active = true; return; }
  for (const k of ['move', 'aim']) {
    const s = sticks[k];
    if (s && s.id === e.pointerId) {
      s.x = e.clientX; s.y = e.clientY;
      const R = k === 'move' ? 56 : 64, dx = s.x - s.ox, dy = s.y - s.oy, d = Math.hypot(dx, dy);
      s.maxD = Math.max(s.maxD, d);
      if (d > R * 1.25) { s.ox = s.x - dx / d * R * 1.25; s.oy = s.y - dy / d * R * 1.25; }
    }
  }
});
function endPointer(e) {
  if (e.pointerType === 'mouse') { if (e.button === 0 || e.type === 'pointercancel') mouse.down = false; return; }
  if (sticks.move && sticks.move.id === e.pointerId) sticks.move = null;
  if (sticks.aim && sticks.aim.id === e.pointerId) {
    const s = sticks.aim;
    if (performance.now() - s.t0 < 230 && s.maxD < 16) input.quickFire = true;
    sticks.aim = null;
  }
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
for (const [id, k] of [['jumpBtn', 'jump'], ['dashBtn', 'dash']]) {
  const el = $(id);
  const on = (e) => { e.preventDefault(); audioInit(); btn[k] = true; el.classList.add('on'); $('touch').classList.add('used'); };
  const off = () => { btn[k] = false; el.classList.remove('on'); };
  el.addEventListener('pointerdown', on);
  el.addEventListener('pointerup', off); el.addEventListener('pointercancel', off); el.addEventListener('pointerleave', off);
}

function nearestEnemy(maxD, fromAngle, maxDiff) {
  const me = G.me; if (!me || !G.map) return null;
  let best = null, bestS = Infinity;
  const sx = me.x, sy = me.y - S.SHOULDER;
  for (const e of G.ents.values()) {
    if (e.id === G.myId || !e.alive || (G.md === 'team' && e.team === me.team)) continue;
    const tx = e.rx, ty = e.ry - 34, d = Math.hypot(tx - sx, ty - sy);
    if (d > maxD) continue;
    const a = Math.atan2(ty - sy, tx - sx);
    let diff = 0;
    if (fromAngle != null) { diff = Math.abs(Math.atan2(Math.sin(a - fromAngle), Math.cos(a - fromAngle))); if (diff > maxDiff) continue; }
    if (!S.canSee(G.map, sx, sy, tx, ty)) continue;
    const score = d + diff * 800;
    if (score < bestS) { bestS = score; best = { e, a, d }; }
  }
  return best;
}
function readInput() {
  const me = G.me;
  let mx = 0, jump = false, down = false, dash = false, fire = false;
  if (keys.KeyA || keys.ArrowLeft) mx -= 1;
  if (keys.KeyD || keys.ArrowRight) mx += 1;
  if (keys.KeyW || keys.Space || keys.ArrowUp) jump = true;
  if (keys.KeyS || keys.ArrowDown) down = true;
  if (keys.ShiftLeft || keys.ShiftRight || keys.KeyQ) dash = true;
  if (mouse.down) fire = true;
  if (btn.jump) jump = true;
  if (btn.dash) dash = true;
  const m = sticks.move;
  if (m) {
    const R = 56, dx = (m.x - m.ox) / R, dy = (m.y - m.oy) / R;
    if (Math.abs(dx) > 0.2) mx = clamp(dx * 1.15, -1, 1);
    if (dy < -0.55) jump = true;
    if (dy > 0.6 && Math.abs(dx) < 0.7) down = true;
  }
  input.aiming = false;
  if (me) {
    const a = sticks.aim;
    if (a) {
      const R = 64, dx = a.x - a.ox, dy = a.y - a.oy, d = Math.hypot(dx, dy) / R;
      if (d > 0.22) {
        let ang = Math.atan2(dy, dx);
        if (settings.assist) {
          const t = nearestEnemy(1100, ang, 0.2);
          if (t) ang += Math.atan2(Math.sin(t.a - ang), Math.cos(t.a - ang)) * 0.65;
        }
        me.aim = ang; input.aiming = true;
        if (d > 0.5) fire = true;
      }
    } else if (mouse.active && !isTouchPlaying()) {
      const wx = (mouse.x - VW / 2) / ZOOM + G.cam.rx, wy = (mouse.y - VH / 2) / ZOOM + G.cam.ry;
      me.aim = Math.atan2(wy - (me.y - S.SHOULDER), wx - me.x);
    } else if (Math.abs(mx) > 0.2) {
      me.aim = mx > 0 ? 0 : Math.PI;
    }
    if (input.quickFire) {
      input.quickFire = false;
      const t = nearestEnemy(1300, null, 0);
      if (t) me.aim = t.a;
      fire = true;
    }
  }
  input.mx = mx; input.jump = jump; input.down = down; input.dash = dash; input.fire = fire;
}
const isTouchPlaying = () => sticks.move || sticks.aim;

/* ---------- Jugador local ---------- */
function stateMsg() {
  const me = G.me;
  return { x: Math.round(me.x * 10) / 10, y: Math.round(me.y * 10) / 10, vx: Math.round(me.vx), vy: Math.round(me.vy), a: Math.round(me.aim * 1000) / 1000, l: me.life, g: me.onGround ? 1 : 0, d: me.dashT > 0 ? 1 : 0 };
}
function localFx(name, f) {
  if (name === 'jump') sfx('jump', 0.7);
  else if (name === 'djump') { sfx('djump', 0.7); burst(f.x, f.y, 'rgba(255,255,255,.6)', 6, 120); }
  else if (name === 'pad') { sfx('pad', 1); burst(f.x, f.y, '#F5B50A', 12, 260); vibrate(20); }
  else if (name === 'dash') { sfx('dash', 0.8); for (let i = 0; i < 6; i++) G.parts.push({ type: 'smoke', x: f.x, y: f.y - 30 + (Math.random() - 0.5) * 40, vx: -f.dashDir * 80, vy: 0, life: 0.35, max: 0.35, size: 6 }); }
  else if (name === 'land') { sfx('land', 0.6); burst(f.x, f.y, 'rgba(255,255,255,.4)', 5, 90); }
}
function updateMe(dt) {
  const me = G.me;
  if (!me || !G.map) return;
  me.flash = Math.max(0, me.flash - dt); me.kick = Math.max(0, me.kick - dt * 8); me.hurt = Math.max(0, me.hurt - dt);
  if (!me.alive) return;
  const canAct = G.st === 0 && !G.paused;
  readInput();
  const inp = canAct ? input : { mx: 0 };
  S.stepFighter(me, inp, dt, G.map, localFx);
  me.lastShotT = me.lastShotT ?? -9;
  if (canAct && input.fire) tryFire();
}
function tryFire() {
  const me = G.me, now = performance.now() / 1000;
  const w = W[me.w] || W[0];
  if (now - me.lastShotT < w.rate) return;
  me.lastShotT = now;
  const seq = ++me.seq, seed = (Math.random() * 4294967295) >>> 0, wIdx = me.w;
  spawnVisualBullets(S.makeBullets(me, wIdx, me.aim, seq, seed), me.aim, me.x, me.y, wIdx);
  S.applyRecoil(me, wIdx, me.aim);
  if (me.ammo > 0) { me.ammo--; if (me.ammo === 0) { me.w = 0; me.ammo = -1; toast('Sin balas: vuelves a la pistola'); sfx('empty', 1); } }
  me.flash = 0.06; me.kick = 1;
  G.cam.shake = Math.max(G.cam.shake, w.shake);
  if (w.shake >= 7) vibrate(25);
  sfx('shot', 1, wIdx);
  G.session.fire({ s: seq, a: Math.round(me.aim * 10000) / 10000, sd: seed, x: Math.round(me.x * 10) / 10, y: Math.round(me.y * 10) / 10, l: me.life });
}

/* ---------- Simulación visual ---------- */
function interpolate(now, delay) {
  const t = now - delay;
  for (const e of G.ents.values()) {
    if (G.me && e.id === G.myId) continue;
    const b = e.buf; if (!b.length) continue;
    let s0 = b[b.length - 1], s1 = null;
    if (t < s0.t) {
      for (let i = b.length - 2; i >= 0; i--) if (b[i].t <= t) { s0 = b[i]; s1 = b[i + 1]; break; }
      if (!s1) s0 = b[0];
    }
    if (s1) {
      const k = (t - s0.t) / Math.max(0.001, s1.t - s0.t);
      e.rx = s0.x + (s1.x - s0.x) * k; e.ry = s0.y + (s1.y - s0.y) * k;
      const da = Math.atan2(Math.sin(s1.aim - s0.aim), Math.cos(s1.aim - s0.aim));
      e.raim = s0.aim + da * k;
      e.vx = s1.vx; e.vy = s1.vy; e.g = s1.g; e.dash = s1.dash;
    } else {
      const ex = Math.min(Math.max(0, t - s0.t), 0.1);
      e.rx = s0.x + s0.vx * ex; e.ry = s0.y + (s0.g ? 0 : s0.vy * ex);
      e.raim = s0.aim; e.vx = s0.vx; e.vy = s0.vy; e.g = s0.g; e.dash = s0.dash;
    }
  }
}
function updateVisuals(dt) {
  for (const e of G.ents.values()) {
    if (e.g) e.run += Math.abs(e.vx) * dt * 0.032;
    e.hurt = Math.max(0, e.hurt - dt); e.flash = Math.max(0, e.flash - dt); e.kick = Math.max(0, e.kick - dt * 8);
  }
  if (G.me && G.me.alive && G.me.onGround) {} // la carrera la lleva stepFighter
  for (let i = G.bullets.length - 1; i >= 0; i--) {
    const b = G.bullets[i];
    if (stepVisualBullet(b, dt)) { G.bullets.splice(i, 1); continue; }
    // Corta la bala visual si atraviesa a un rival (el daño real lo confirma el servidor)
    for (const e of G.ents.values()) {
      if (e.id === b.owner || !e.alive || e.id === G.myId) continue;
      if (G.md === 'team' && e.team === b.team) continue;
      if (b.x > e.rx - 15 && b.x < e.rx + 15 && b.y > e.ry - 64 && b.y < e.ry && b.age > 0.02) { b.life = Math.min(b.life, 0.03); }
    }
  }
  const map = G.map;
  for (let i = G.parts.length - 1; i >= 0; i--) {
    const p = G.parts[i];
    p.life -= dt;
    if (p.life <= 0) { G.parts.splice(i, 1); continue; }
    if (p.type === 'spark' || p.type === 'blood' || p.type === 'shell') {
      p.vy += 1400 * dt; p.x += p.vx * dt; p.y += p.vy * dt;
      if (map && p.y > map.floorY && p.vy > 0) { p.y = map.floorY; p.vy *= -0.35; p.vx *= 0.6; }
      if (p.type === 'shell') p.a += p.va * dt;
    } else if (p.type === 'smoke') { p.x += p.vx * dt; p.y += p.vy * dt; p.size += dt * 14; }
    else if (p.type === 'fire') { p.vx *= 0.92; p.vy = p.vy * 0.92 - 20 * dt; p.x += p.vx * dt; p.y += p.vy * dt; }
  }
  for (let i = G.rags.length - 1; i >= 0; i--) {
    const r = G.rags[i];
    r.life -= dt;
    if (r.life <= 0) { G.rags.splice(i, 1); continue; }
    r.vy += 1900 * dt; r.x += r.vx * dt; r.y += r.vy * dt; r.a += r.va * dt;
    if (map) {
      const s = S.overlapSolid(map, r.x - 3, r.y - 3, r.x + 3, r.y + 3);
      if (s) {
        if (r.vy > 0 && r.y - r.vy * dt <= s.y + 3) { r.y = s.y - 3; r.vy *= -0.3; r.vx *= 0.7; r.va *= 0.6; }
        else { r.vx *= -0.4; r.x += r.vx * dt * 2; }
      } else if (r.vy > 0) {
        for (const p of map.plats) if (r.x > p.x && r.x < p.x + p.w && r.y >= p.y && r.y - r.vy * dt <= p.y + 2) { r.y = p.y - 1; r.vy *= -0.3; r.vx *= 0.7; r.va *= 0.6; }
      }
    }
  }
  for (let i = G.texts.length - 1; i >= 0; i--) { const t = G.texts[i]; t.life -= dt; t.y += t.vy * dt; t.vy *= 0.95; if (t.life <= 0) G.texts.splice(i, 1); }
  G.hurtFlash = Math.max(0, G.hurtFlash - dt * 1.6);
}
function updateCamera(dt) {
  const cam = G.cam, map = G.map; if (!map) return;
  let tx = cam.x, ty = cam.y;
  if (G.me && G.screen === 'play') {
    if (G.me.alive) {
      const look = input.aiming || mouse.active ? 90 : 40;
      tx = G.me.x + Math.cos(G.me.aim) * look; ty = G.me.y - 110 + Math.sin(G.me.aim) * look * 0.6;
    }
  } else {
    cam.followT -= dt;
    let f = G.ents.get(cam.follow);
    if (!f || !f.alive || cam.followT <= 0) {
      const alive = [...G.ents.values()].filter(e => e.alive);
      f = alive[Math.floor(Math.random() * alive.length)];
      cam.follow = f ? f.id : null; cam.followT = 7;
    }
    if (f) { tx = f.rx; ty = f.ry - 160; }
  }
  const k = 1 - Math.exp(-dt * (G.screen === 'play' ? 9 : 2.5));
  cam.x += (tx - cam.x) * k; cam.y += (ty - cam.y) * k;
  const hw = VW / 2 / ZOOM, hh = VH / 2 / ZOOM;
  cam.x = map.W < hw * 2 ? map.W / 2 : clamp(cam.x, hw - 80, map.W - hw + 80);
  cam.y = clamp(cam.y, -500 + hh, map.floorY + 110 - hh);
  cam.shake = Math.max(0, cam.shake - dt * 30);
  const sh = cam.shake * (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches ? 0.2 : 1);
  cam.rx = cam.x + (Math.random() - 0.5) * sh; cam.ry = cam.y + (Math.random() - 0.5) * sh;
}

/* ---------- Dibujo ---------- */
let bgCache = null, vignette = null;
function buildBg() {
  const map = G.map, th = S.THEMES[map.theme];
  const sc = 0.5, w = Math.ceil((map.W * 0.6 + 2200) * sc), h = Math.ceil(700 * sc);
  const mk = () => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  const far = mk(), mid = mk();
  const draw = (c, color, list, scaleH, lightsA, seedOff) => {
    const g = c.getContext('2d');
    g.scale(sc, sc);
    for (const b of list) {
      const bx = b.x + 1100 + seedOff, bh = b.h * scaleH, by = 700 - bh;
      g.fillStyle = color;
      g.fillRect(bx, by, b.w - 6, bh);
      if (lightsA > 0) {
        let bits = b.lights;
        for (let yy = by + 16; yy < 690; yy += 26) for (let xx = bx + 10; xx < bx + b.w - 20; xx += 20) {
          bits = (bits * 1103515245 + 12345) & 0x7fffffff;
          if (bits % 7 === 0) { g.fillStyle = `rgba(245,181,10,${lightsA})`; g.fillRect(xx, yy, 8, 10); }
        }
      }
    }
  };
  draw(far, th.far, map.sky, 1, 0.18, 0);
  draw(mid, th.mid, map.sky.map((b, i) => ({ x: b.x * 1.35 + 200, w: b.w * 1.2, h: b.h * 0.55 + 60, lights: b.lights + i })), 1, 0.1, 0);
  bgCache = { far, mid, sc, theme: th };
}
function drawBackground() {
  const map = G.map, th = S.THEMES[map.theme];
  const grd = ctx.createLinearGradient(0, 0, 0, VH);
  grd.addColorStop(0, th.sky[0]); grd.addColorStop(1, th.sky[1]);
  ctx.fillStyle = grd; ctx.fillRect(0, 0, VW, VH);
  const t = G.time;
  ctx.fillStyle = '#fff';
  for (const s of map.stars) {
    const x = ((s.x * VW * 1.4 - G.cam.rx * ZOOM * 0.03) % (VW * 1.4) + VW * 1.4) % (VW * 1.4);
    ctx.globalAlpha = 0.25 + 0.35 * Math.abs(Math.sin(t * 0.7 + s.p));
    ctx.fillRect(x, s.y * VH * 0.8, s.s, s.s);
  }
  ctx.globalAlpha = 1;
  // Luna
  ctx.fillStyle = 'rgba(245,181,10,.9)';
  ctx.beginPath(); ctx.arc(VW * 0.34 - G.cam.rx * ZOOM * 0.02, VH * 0.26, Math.max(18, VH * 0.05), 0, TAU); ctx.fill();
  ctx.fillStyle = th.sky[0];
  ctx.beginPath(); ctx.arc(VW * 0.34 - G.cam.rx * ZOOM * 0.02 + VH * 0.02, VH * 0.26 - VH * 0.012, Math.max(18, VH * 0.05), 0, TAU); ctx.fill();
  if (!bgCache) buildBg();
  for (const [img, p] of [[bgCache.far, 0.3], [bgCache.mid, 0.55]]) {
    const B = map.floorY - (map.floorY - 250) * (1 - p);
    const left = -1100, top = B - 700;
    const sx = VW / 2 + (left - G.cam.rx * p) * ZOOM, sy = VH / 2 + (top - G.cam.ry * p) * ZOOM;
    ctx.drawImage(img, sx, sy, img.width / bgCache.sc * ZOOM, img.height / bgCache.sc * ZOOM);
    const bottom = sy + 700 * ZOOM;
    if (bottom < VH) { ctx.fillStyle = p < 0.5 ? th.far : th.mid; ctx.fillRect(0, bottom - 1, VW, VH - bottom + 1); }
  }
}
function rrect(x, y, w, h, r) {
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h);
}
function drawWorld() {
  const map = G.map, th = S.THEMES[map.theme], t = G.time;
  const hw = VW / 2 / ZOOM + 50, hh = VH / 2 / ZOOM + 50;
  const vis = (x, y, w, h) => x + w > G.cam.rx - hw && x < G.cam.rx + hw && y + h > G.cam.ry - hh && y < G.cam.ry + hh;
  // Sólidos
  for (const s of map.solids) {
    if (!vis(s.x, s.y, s.w, s.h)) continue;
    if (s.wall) {
      ctx.fillStyle = th.solid; ctx.fillRect(s.x, s.y, s.w, s.h);
      ctx.fillStyle = th.top; ctx.fillRect(s.x === map.W ? s.x : s.x + s.w - 4, -600, 4, map.floorY + 600);
      continue;
    }
    if (s.floor) {
      ctx.fillStyle = th.solid; ctx.fillRect(s.x, s.y, s.w, s.h);
      ctx.fillStyle = 'rgba(255,255,255,.03)';
      const start = Math.floor((G.cam.rx - hw) / 80) * 80;
      for (let x = start; x < G.cam.rx + hw; x += 80) ctx.fillRect(x, s.y + 18, 40, 6);
      ctx.fillStyle = th.top; ctx.fillRect(s.x, s.y, s.w, 4);
      continue;
    }
    ctx.fillStyle = th.solid; rrect(s.x, s.y, s.w, s.h, 8); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.05)'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = th.top; rrect(s.x + 2, s.y, s.w - 4, 4, 2); ctx.fill();
  }
  for (const p of map.plats) {
    if (!vis(p.x, p.y, p.w, 30)) continue;
    ctx.fillStyle = th.plat; rrect(p.x, p.y, p.w, p.h, 6); ctx.fill();
    ctx.fillStyle = th.top; ctx.globalAlpha = 0.85; rrect(p.x + 4, p.y, p.w - 8, 3, 2); ctx.fill(); ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(p.x + 10, p.y + p.h, p.w - 20, 3);
  }
  // Trampolines
  for (const p of map.pads) {
    if (!vis(p.x, p.y - 60, p.w, 60)) continue;
    ctx.fillStyle = '#F5B50A'; rrect(p.x, p.y - 8, p.w, 8, 4); ctx.fill();
    ctx.strokeStyle = 'rgba(245,181,10,.6)'; ctx.lineWidth = 3;
    for (let i = 0; i < 3; i++) {
      const yy = p.y - 18 - i * 14 - ((t * 40) % 14);
      ctx.globalAlpha = 0.7 - i * 0.2;
      ctx.beginPath(); ctx.moveTo(p.x + p.w / 2 - 12, yy + 6); ctx.lineTo(p.x + p.w / 2, yy); ctx.lineTo(p.x + p.w / 2 + 12, yy + 6); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  // Objetos
  map.pickupSpots.forEach((s, i) => {
    const kind = G.pickups[i];
    if (!vis(s.x - 30, s.y - 70, 60, 70)) return;
    ctx.fillStyle = 'rgba(245,181,10,.18)'; rrect(s.x - 18, s.y - 4, 36, 4, 2); ctx.fill();
    if (kind == null || kind < 0) return;
    const y = s.y - 30 + Math.sin(t * 3 + i) * 4;
    const col = kind === S.PICK_HP ? '#3DDC84' : kind === S.PICK_ARMOR ? '#8ec9ff' : '#F5B50A';
    ctx.fillStyle = 'rgba(20,20,24,.85)'; rrect(s.x - 19, y - 19, 38, 38, 11); ctx.fill();
    ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.stroke();
    ctx.save(); ctx.translate(s.x, y);
    if (kind === S.PICK_HP) { ctx.fillStyle = col; ctx.fillRect(-3.5, -10, 7, 20); ctx.fillRect(-10, -3.5, 20, 7); }
    else if (kind === S.PICK_ARMOR) { ctx.strokeStyle = col; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(9, -6); ctx.lineTo(9, 1); ctx.quadraticCurveTo(8, 8, 0, 11); ctx.quadraticCurveTo(-8, 8, -9, 1); ctx.lineTo(-9, -6); ctx.closePath(); ctx.stroke(); }
    else { const sc = 22 / (W[kind].len + 10); ctx.scale(sc, sc); drawGun(-W[kind].len / 2 - 2, 2, 0, kind, 1, col); }
    ctx.restore();
  });
}
function drawGun(x, y, aim, wIdx, face, color) {
  const w = W[wIdx] || W[0];
  ctx.save(); ctx.translate(x, y); ctx.rotate(aim); if (face < 0) ctx.scale(1, -1);
  const c = color || '#e9e9ea';
  ctx.fillStyle = c; ctx.strokeStyle = c;
  switch (w.key) {
    case 'pistol': ctx.fillRect(0, -3, 16, 5); ctx.fillRect(1, 1, 4, 7); break;
    case 'smg': ctx.fillRect(-2, -3, 22, 6); ctx.fillRect(4, 2, 4, 9); ctx.fillRect(12, 2, 3, 6); break;
    case 'shotgun': ctx.fillRect(-6, -3, 32, 5); ctx.fillRect(4, 1, 12, 4); ctx.fillRect(-8, -1, 6, 7); break;
    case 'rifle': ctx.fillRect(-8, -3, 38, 5); ctx.fillRect(6, 1, 5, 9); ctx.fillRect(-10, -2, 6, 8); ctx.fillStyle = '#F5B50A'; ctx.fillRect(10, -6, 10, 3); break;
    case 'sniper': ctx.fillRect(-10, -2.5, 48, 4); ctx.fillRect(-12, -2, 8, 8); ctx.fillRect(2, 1, 4, 7); ctx.fillStyle = '#F5B50A'; ctx.fillRect(6, -8, 14, 4); break;
    case 'rocket': ctx.fillRect(-12, -6, 42, 11); ctx.fillStyle = '#F5B50A'; ctx.fillRect(26, -7, 6, 13); ctx.fillStyle = c; ctx.fillRect(4, 5, 5, 7); break;
  }
  ctx.restore();
}
function drawStick(o) {
  const { x, y, aim, run, g, vx, vy, color, w, shield, hurt, flash, kick, dash } = o;
  const face = Math.cos(aim) >= 0 ? 1 : -1;
  const col = hurt > 0 ? '#ffffff' : color;
  const lean = clamp(vx / 370, -1, 1) * 4;
  const hipX = x, hipY = y - 24, neckX = x + lean, neckY = y - 44;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  // Sombra
  ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.beginPath(); ctx.ellipse(x, y + 1, 14, 3, 0, 0, TAU); ctx.fill();
  if (dash) { ctx.globalAlpha = 0.25; ctx.strokeStyle = color; ctx.lineWidth = 10; ctx.beginPath(); ctx.moveTo(x - Math.sign(vx) * 40, y - 30); ctx.lineTo(x, y - 30); ctx.stroke(); ctx.globalAlpha = 1; }
  ctx.strokeStyle = col; ctx.lineWidth = 5;
  // Piernas
  const leg = (i) => {
    let a, a2;
    if (!g) { a = vy < 0 ? (i ? 0.7 : -0.2) * face : (i ? 0.35 : -0.35); a2 = vy < 0 ? a - 1.1 * face : a * 0.6; }
    else if (Math.abs(vx) > 30) { const ph = run + i * Math.PI; a = Math.sin(ph) * 0.75; a2 = a - Math.max(0, Math.cos(ph)) * 0.9 * Math.sign(vx || 1); }
    else { a = i ? 0.2 : -0.2; a2 = a; }
    const kx = hipX + Math.sin(a) * 12, ky = hipY + Math.cos(a) * 12;
    const fx = kx + Math.sin(a2) * 12, fy = ky + Math.cos(a2) * 12;
    ctx.beginPath(); ctx.moveTo(hipX, hipY); ctx.lineTo(kx, ky); ctx.lineTo(fx, fy); ctx.stroke();
  };
  leg(0); leg(1);
  // Cuerpo
  ctx.beginPath(); ctx.moveTo(hipX, hipY); ctx.lineTo(neckX, neckY); ctx.stroke();
  // Brazos + arma
  const shX = x + lean * 0.7, shY = y - S.SHOULDER;
  const dx = Math.cos(aim), dy = Math.sin(aim), px = -dy * face, py = dx * face;
  const back = (kick || 0) * 5;
  const h1x = shX + dx * (13 - back), h1y = shY + dy * (13 - back);
  const h2x = shX + dx * (24 - back) + px * 2, h2y = shY + dy * (24 - back) + py * 2;
  ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(shX, shY); ctx.lineTo(shX + dx * 10 + px * 6, shY + dy * 10 + py * 6); ctx.lineTo(h2x, h2y); ctx.stroke();
  drawGun(h1x, h1y, aim, w, face);
  ctx.strokeStyle = col; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(shX, shY); ctx.lineTo(shX + dx * 5 + px * 7, shY + dy * 5 + py * 7); ctx.lineTo(h1x, h1y); ctx.stroke();
  // Cabeza
  ctx.fillStyle = col;
  ctx.beginPath(); ctx.arc(neckX + lean * 0.3, y - 53, 9, 0, TAU); ctx.fill();
  ctx.fillStyle = '#0E0E10';
  ctx.beginPath(); ctx.arc(neckX + lean * 0.3 + face * 4, y - 54, 1.8, 0, TAU); ctx.fill();
  // Fogonazo
  if (flash > 0) {
    const len = (W[w] || W[0]).len;
    const mx = h1x + dx * (len + 4), my = h1y + dy * (len + 4);
    ctx.fillStyle = 'rgba(255,220,120,.95)';
    ctx.beginPath(); ctx.arc(mx, my, 7 + Math.random() * 4, 0, TAU); ctx.fill();
  }
  if (shield) {
    ctx.strokeStyle = 'rgba(142,201,255,' + (0.45 + 0.3 * Math.sin(G.time * 12)) + ')'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(x, y - 30, 40, 0, TAU); ctx.stroke();
  }
}
function drawLaser(x, y, aim) {
  const sx = x, sy = y - S.SHOULDER, ex = sx + Math.cos(aim) * 1600, ey = sy + Math.sin(aim) * 1600;
  const t = S.segSolids(G.map, sx, sy, ex, ey), k = t >= 0 ? t : 1;
  ctx.strokeStyle = 'rgba(255,90,95,.35)'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(sx + Math.cos(aim) * 40, sy + Math.sin(aim) * 40); ctx.lineTo(sx + (ex - sx) * k, sy + (ey - sy) * k); ctx.stroke();
  ctx.fillStyle = 'rgba(255,90,95,.8)'; ctx.beginPath(); ctx.arc(sx + (ex - sx) * k, sy + (ey - sy) * k, 3, 0, TAU); ctx.fill();
}
function drawEntities() {
  const me = G.me;
  const list = [];
  for (const e of G.ents.values()) {
    if (!e.alive || (me && e.id === G.myId)) continue;
    list.push({ x: e.rx, y: e.ry, aim: e.raim, run: e.run, g: e.g, vx: e.vx, vy: e.vy, color: e.color, w: e.w, shield: e.shield, hurt: e.hurt, flash: e.flash, kick: e.kick, dash: e.dash, e });
  }
  for (const o of list) if (o.w === 4) drawLaser(o.x, o.y, o.aim);
  if (me && me.alive && me.w === 4) drawLaser(me.x, me.y, me.aim);
  for (const o of list) drawStick(o);
  if (me && me.alive) {
    if (input.aiming && me.w !== 4) {
      ctx.strokeStyle = 'rgba(245,181,10,.45)'; ctx.lineWidth = 2; ctx.setLineDash([6, 10]);
      ctx.beginPath(); ctx.moveTo(me.x + Math.cos(me.aim) * 40, me.y - S.SHOULDER + Math.sin(me.aim) * 40); ctx.lineTo(me.x + Math.cos(me.aim) * 190, me.y - S.SHOULDER + Math.sin(me.aim) * 190); ctx.stroke(); ctx.setLineDash([]);
    }
    drawStick({ x: me.x, y: me.y, aim: me.aim, run: me.run, g: me.onGround, vx: me.vx, vy: me.vy, color: me.color, w: me.w, shield: me.shield, hurt: me.hurt, flash: me.flash, kick: me.kick, dash: me.dashT > 0 });
    // Marcador "tú"
    ctx.fillStyle = '#F5B50A';
    ctx.beginPath(); const ty = me.y - 76 + Math.sin(G.time * 4) * 2; ctx.moveTo(me.x - 6, ty - 6); ctx.lineTo(me.x + 6, ty - 6); ctx.lineTo(me.x, ty + 1); ctx.closePath(); ctx.fill();
  }
  // Nombres y vida
  ctx.textAlign = 'center'; ctx.font = '600 13px Outfit, system-ui, sans-serif';
  for (const o of list) {
    const e = o.e, ally = G.md === 'team' && me && e.team === me.team;
    const ty = o.y - 74;
    ctx.fillStyle = 'rgba(14,14,16,.55)'; rrect(o.x - 22, ty + 4, 44, 5, 3); ctx.fill();
    ctx.fillStyle = e.hp < 35 ? '#FF5A5F' : ally ? '#3DDC84' : e.color; rrect(o.x - 22, ty + 4, 44 * clamp(e.hp / 100, 0, 1), 5, 3); ctx.fill();
    ctx.fillStyle = G.md === 'team' ? (ally ? '#F5F5F4' : '#FF8A8D') : 'rgba(245,245,244,.85)';
    ctx.fillText(e.name, o.x, ty - 2);
  }
}
function drawEffects() {
  for (const b of G.bullets) {
    const w = W[b.w];
    if (w.splash) {
      const a = Math.atan2(b.vy, b.vx);
      ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(a);
      ctx.fillStyle = '#e9e9ea'; rrect(-12, -4, 18, 8, 4); ctx.fill();
      ctx.fillStyle = '#F5B50A'; ctx.beginPath(); ctx.arc(-14, 0, 4 + Math.random() * 3, 0, TAU); ctx.fill();
      ctx.restore(); continue;
    }
    const tl = w.key === 'sniper' ? 0.035 : 0.018;
    const len = Math.min(b.age, tl);
    ctx.strokeStyle = w.key === 'sniper' ? 'rgba(255,240,200,.95)' : 'rgba(255,224,138,.9)';
    ctx.lineWidth = w.key === 'sniper' ? 3 : w.pellets > 1 ? 2 : 2.5;
    ctx.beginPath(); ctx.moveTo(b.x - b.vx * len, b.y - b.vy * len); ctx.lineTo(b.x, b.y); ctx.stroke();
  }
  for (const p of G.parts) {
    const k = p.life / p.max;
    switch (p.type) {
      case 'spark': ctx.strokeStyle = p.color; ctx.globalAlpha = k; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 0.02, p.y - p.vy * 0.02); ctx.stroke(); break;
      case 'blood': ctx.fillStyle = p.color; ctx.globalAlpha = Math.min(1, k * 1.5); ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size); break;
      case 'shell': ctx.fillStyle = '#F5B50A'; ctx.globalAlpha = Math.min(1, k * 2); ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a); ctx.fillRect(-2.5, -1, 5, 2.5); ctx.restore(); break;
      case 'smoke': ctx.fillStyle = 'rgba(200,200,205,1)'; ctx.globalAlpha = k * 0.25; ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, TAU); ctx.fill(); break;
      case 'fire': ctx.fillStyle = k > 0.5 ? '#FFE08A' : '#F5B50A'; ctx.globalAlpha = k; ctx.beginPath(); ctx.arc(p.x, p.y, p.size * k + 2, 0, TAU); ctx.fill(); break;
      case 'ring': ctx.strokeStyle = '#F5B50A'; ctx.globalAlpha = k; ctx.lineWidth = 6 * k + 1; ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (1 - k * 0.7), 0, TAU); ctx.stroke(); break;
      case 'glow': ctx.fillStyle = 'rgba(255,230,150,1)'; ctx.globalAlpha = k * 0.6; ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 0.7, 0, TAU); ctx.fill(); break;
      case 'flash': ctx.fillStyle = 'rgba(255,230,150,1)'; ctx.globalAlpha = k; ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a); ctx.beginPath(); ctx.moveTo(0, -6 * p.size); ctx.lineTo(18 * p.size, 0); ctx.lineTo(0, 6 * p.size); ctx.closePath(); ctx.fill(); ctx.restore(); break;
    }
  }
  ctx.globalAlpha = 1;
  for (const r of G.rags) {
    ctx.globalAlpha = Math.min(1, r.life);
    ctx.strokeStyle = r.color; ctx.fillStyle = r.color; ctx.lineWidth = 4.5; ctx.lineCap = 'round';
    if (r.kind === 'head') { ctx.beginPath(); ctx.arc(r.x, r.y, 9, 0, TAU); ctx.fill(); }
    else { const dx = Math.cos(r.a) * r.len / 2, dy = Math.sin(r.a) * r.len / 2; ctx.beginPath(); ctx.moveTo(r.x - dx, r.y - dy); ctx.lineTo(r.x + dx, r.y + dy); ctx.stroke(); }
  }
  ctx.globalAlpha = 1;
  ctx.textAlign = 'center';
  for (const t of G.texts) {
    ctx.globalAlpha = Math.min(1, t.life * 2.5);
    ctx.font = `800 ${t.size}px Outfit, system-ui, sans-serif`;
    ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(14,14,16,.8)'; ctx.strokeText(t.text, t.x, t.y);
    ctx.fillStyle = t.color; ctx.fillText(t.text, t.x, t.y);
  }
  ctx.globalAlpha = 1;
}
function drawScreenUi() {
  // Viñeta de daño / vida baja
  const me = G.me;
  if (me && G.screen === 'play') {
    const low = me.alive && me.hp < 35 ? 0.35 + 0.15 * Math.sin(G.time * 6) : 0;
    const a = Math.max(low, G.hurtFlash * 0.7);
    if (a > 0.01) {
      if (!vignette) { vignette = ctx.createRadialGradient(VW / 2, VH / 2, Math.min(VW, VH) * 0.35, VW / 2, VH / 2, Math.max(VW, VH) * 0.75); vignette.addColorStop(0, 'rgba(255,40,50,0)'); vignette.addColorStop(1, 'rgba(255,40,50,1)'); }
      ctx.globalAlpha = a; ctx.fillStyle = vignette; ctx.fillRect(0, 0, VW, VH); ctx.globalAlpha = 1;
    }
    drawMinimap();
    // Sticks táctiles
    for (const [k, s] of Object.entries(sticks)) {
      if (!s) continue;
      const R = k === 'move' ? 56 : 64;
      ctx.strokeStyle = 'rgba(255,255,255,.22)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(s.ox, s.oy, R, 0, TAU); ctx.stroke();
      if (k === 'aim') { ctx.strokeStyle = 'rgba(245,181,10,.3)'; ctx.setLineDash([4, 6]); ctx.beginPath(); ctx.arc(s.ox, s.oy, R * 0.5, 0, TAU); ctx.stroke(); ctx.setLineDash([]); }
      const dx = s.x - s.ox, dy = s.y - s.oy, d = Math.hypot(dx, dy), m = Math.min(d, R);
      const kx = s.ox + (d ? dx / d * m : 0), ky = s.oy + (d ? dy / d * m : 0);
      ctx.fillStyle = k === 'aim' && d > R * 0.5 ? 'rgba(245,181,10,.75)' : 'rgba(255,255,255,.35)';
      ctx.beginPath(); ctx.arc(kx, ky, 24, 0, TAU); ctx.fill();
    }
    // Mira en PC
    if (mouse.active && me.alive) {
      const x = mouse.x, y = mouse.y;
      ctx.strokeStyle = '#F5B50A'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, 9, 0, TAU);
      ctx.moveTo(x - 16, y); ctx.lineTo(x - 11, y); ctx.moveTo(x + 11, y); ctx.lineTo(x + 16, y);
      ctx.moveTo(x, y - 16); ctx.lineTo(x, y - 11); ctx.moveTo(x, y + 11); ctx.lineTo(x, y + 16); ctx.stroke();
    }
  }
}
function drawMinimap() {
  const map = G.map; if (!map) return;
  const mw = Math.min(170, VW * 0.22), mh = mw * 0.32;
  const x0 = 12 + SAL, y0 = VH < 500 ? 78 : 86;
  const sx = mw / map.W, top = map.floorY - 1000, sy = mh / 1050;
  ctx.fillStyle = 'rgba(14,14,16,.55)'; rrect(x0, y0, mw, mh, 10); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,.1)'; ctx.lineWidth = 1; ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,.22)';
  for (const p of map.plats) ctx.fillRect(x0 + p.x * sx, y0 + (p.y - top) * sy, Math.max(2, p.w * sx), 1.5);
  for (const s of map.solids) if (!s.wall && !s.floor) ctx.fillRect(x0 + s.x * sx, y0 + (s.y - top) * sy, Math.max(2, s.w * sx), Math.max(1.5, s.h * sy));
  ctx.fillRect(x0 + 2, y0 + (map.floorY - top) * sy, mw - 4, 1.5);
  for (const e of G.ents.values()) {
    if (!e.alive || e.id === G.myId) continue;
    ctx.fillStyle = e.color;
    ctx.beginPath(); ctx.arc(x0 + e.rx * sx, y0 + clamp((e.ry - 30 - top) * sy, 2, mh - 2), e.bot ? 2 : 3, 0, TAU); ctx.fill();
  }
  if (G.me && G.me.alive) {
    ctx.fillStyle = '#F5B50A'; ctx.strokeStyle = '#0E0E10'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(x0 + G.me.x * sx, y0 + clamp((G.me.y - 30 - top) * sy, 2, mh - 2), 3.6, 0, TAU); ctx.fill(); ctx.stroke();
  }
}
function render() {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  if (!G.map) { ctx.fillStyle = '#0E0E10'; ctx.fillRect(0, 0, VW, VH); return; }
  drawBackground();
  ctx.setTransform(DPR * ZOOM, 0, 0, DPR * ZOOM, DPR * (VW / 2 - G.cam.rx * ZOOM), DPR * (VH / 2 - G.cam.ry * ZOOM));
  drawWorld();
  drawEntities();
  drawEffects();
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  drawScreenUi();
}

/* ---------- Bucle principal ---------- */
let lastT = performance.now();
function frame(t) {
  requestAnimationFrame(frame);
  let dt = (t - lastT) / 1000; lastT = t;
  if (dt > 0.1) dt = 0.1;
  if (dt <= 0) return;
  G.time += dt;
  const sess = G.session;
  if (G.screen === 'play') updateMe(dt);
  if (sess) sess.update(dt);
  interpolate(performance.now() / 1000, sess && sess.kind === 'online' ? 0.1 : 0);
  if (!(G.paused && sess && sess.kind === 'offline')) updateVisuals(dt);
  updateCamera(dt);
  render();
  if (G.screen === 'play') updateHud();
}

/* ---------- Menú ---------- */
let currentTab = 'solo';
const nameInput = $('nameInput');
nameInput.value = settings.name || '';
function setNote(text, err) { const n = $('menuNote'); n.textContent = text; n.classList.toggle('err', !!err); }
function setTab(tab) {
  currentTab = tab;
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
  $('optsMatch').hidden = tab === 'join';
  $('optsJoin').hidden = tab !== 'join';
  $('playLabel').textContent = tab === 'solo' ? 'Jugar ya' : tab === 'create' ? 'Crear sala' : 'Entrar a la sala';
  setNote(tab === 'solo' ? 'Partida offline contra bots: funciona hasta sin internet.' : tab === 'create' ? 'Te damos un código de 4 letras para que tu parcero entre.' : 'Pídele el código a quien creó la sala.');
}
document.querySelectorAll('#tabs button').forEach(b => b.addEventListener('click', () => setTab(b.dataset.tab)));
function bindChips(id, key, parse) {
  const el = $(id);
  const sync = () => el.querySelectorAll('button').forEach(b => b.classList.toggle('on', parse(b.dataset.v) === settings[key]));
  el.querySelectorAll('button').forEach(b => b.addEventListener('click', () => { settings[key] = parse(b.dataset.v); saveSettings(); sync(); }));
  sync();
}
bindChips('modeChips', 'mode', v => v);
bindChips('diffChips', 'diff', v => +v);
const botsVal = $('botsVal');
const syncBots = () => { botsVal.textContent = settings.bots; };
$('botsMinus').addEventListener('click', () => { settings.bots = Math.max(0, settings.bots - 1); saveSettings(); syncBots(); });
$('botsPlus').addEventListener('click', () => { settings.bots = Math.min(9, settings.bots + 1); saveSettings(); syncBots(); });
syncBots();
$('codeInput').addEventListener('input', (e) => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4); });
$('playBtn').addEventListener('click', startGame);
$('howBtn').addEventListener('click', () => show($('how'), true));
$('howClose').addEventListener('click', () => show($('how'), false));

/* Pausa y ajustes */
function syncToggles() { document.querySelectorAll('.toggle').forEach(b => b.classList.toggle('on', !!settings[b.dataset.set])); }
document.querySelectorAll('.toggle').forEach(b => b.addEventListener('click', () => {
  const k = b.dataset.set; settings[k] = !settings[k]; saveSettings(); syncToggles();
  if (k === 'full') settings.full ? goFullscreen() : (document.fullscreenElement && document.exitFullscreen && document.exitFullscreen().catch(() => {}));
}));
syncToggles();
function togglePause(force) {
  if (G.screen !== 'play') return;
  const on = force != null ? force : $('pause').classList.contains('hidden');
  show($('pause'), on);
  G.paused = on;
  $('pauseInfo').textContent = G.session && G.session.kind === 'online' ? 'Ojo: la partida sigue corriendo para los demás.' : 'La partida está en pausa.';
  for (const k in keys) keys[k] = false; mouse.down = false; sticks.move = sticks.aim = null;
}
$('pauseBtn').addEventListener('click', () => togglePause(true));
$('resumeBtn').addEventListener('click', () => togglePause(false));
$('quitBtn').addEventListener('click', () => backToMenu());
$('scoreBtn').addEventListener('click', () => openBoard(false));
$('boardClose').addEventListener('click', () => { show($('board'), false); G.boardAuto = false; });
$('codeChip').addEventListener('click', async () => {
  const url = location.origin + '/?sala=' + G.code;
  try {
    if (navigator.share) { await navigator.share({ title: 'Meiker Stick Battle', text: 'Entra a mi sala ' + G.code + ' en Meiker Stick Battle', url }); return; }
    await navigator.clipboard.writeText(url); toast('Link copiado: pásaselo a tu parcero');
  } catch (_) { toast('Código de la sala: ' + G.code); }
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden && G.screen === 'play' && G.session && G.session.kind === 'offline') togglePause(true);
});

/* Pantalla completa y orientación */
function goFullscreen() {
  const el = document.documentElement;
  if (document.fullscreenElement || !el.requestFullscreen) return;
  el.requestFullscreen({ navigationUI: 'hide' }).then(() => {
    if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(() => {});
  }).catch(() => {});
}
let rotateSkipped = false;
function checkRotate() {
  show($('rotate'), isTouch && G.screen === 'play' && innerHeight > innerWidth && !rotateSkipped);
}
$('rotateSkip').addEventListener('click', () => { rotateSkipped = true; checkRotate(); });

/* Instalar como app */
let installEvt = null;
const isStandalone = matchMedia('(display-mode: fullscreen)').matches || matchMedia('(display-mode: standalone)').matches || navigator.standalone;
const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvt = e; $('installBtn').hidden = false; });
if (isIOS && !isStandalone) $('installBtn').hidden = false;
$('installBtn').addEventListener('click', async () => {
  if (installEvt) { installEvt.prompt(); const r = await installEvt.userChoice.catch(() => null); if (r && r.outcome === 'accepted') $('installBtn').hidden = true; installEvt = null; return; }
  if (isIOS) setNote('En iPhone: toca Compartir en Safari y luego "Agregar a inicio".');
});
addEventListener('appinstalled', () => { $('installBtn').hidden = true; setNote('Listo, quedó instalada. Ábrela desde tu pantalla de inicio.'); });
if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('/sw.js').catch(() => {});

/* Arranque */
const params = new URLSearchParams(location.search);
const salaParam = (params.get('sala') || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
if (salaParam) { $('codeInput').value = salaParam; setTab('join'); setNote('Te invitaron a la sala ' + salaParam + '. Pon tu nombre y dale entrar.'); }
else setTab('solo');
if (location.protocol === 'file:') document.querySelectorAll('#tabs button[data-tab="create"],#tabs button[data-tab="join"]').forEach(b => { b.disabled = true; b.style.opacity = 0.4; });
resize();
startDemo();
requestAnimationFrame(frame);
window.__G = G;
})();
