/* Mete un jugador manejado por la IA de los bots (nivel Pro) a una sala online.
   Uso: node tools/claude-player.js <url-del-juego> <CODIGO> [NOMBRE] */
const WebSocket = require("ws");
const S = require("../public/sim.js");

const [base, code, name = "CLAUDE"] = process.argv.slice(2);
if (!base || !code) { console.log("Uso: node tools/claude-player.js https://tu-juego.onrender.com ABCD [NOMBRE]"); process.exit(1); }
const wsUrl = base.replace(/^http/, "ws").replace(/\/$/, "") + "/ws";

// Si hay proxy de salida (HTTPS_PROXY), conectar a través de él
let agent;
const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
if (proxy && wsUrl.startsWith("wss:")) { try { const { HttpsProxyAgent } = require("https-proxy-agent"); agent = new HttpsProxyAgent(proxy); } catch (_) {} }
const ws = new WebSocket(wsUrl, agent ? { agent } : {});
ws.on("error", (e) => { console.log("Error de conexión:", e.message); process.exit(1); });
let myId = null, me = null, map = null, seed = null, roster = new Map(), others = new Map(), pickups = [], st = 0, mode = "ffa";
let lastShot = -9, clock = 0;

// Modo turbo (TURBO=1): solo cambia la física de este jugador, el servidor confía en su posición
if (process.env.TURBO) {
  Object.assign(S.PHYS, { maxSpeed: S.PHYS.maxSpeed * 2.2, accel: S.PHYS.accel * 2.5, airAccel: S.PHYS.airAccel * 2.5, jumpV: S.PHYS.jumpV * 1.3, djumpV: S.PHYS.djumpV * 1.3, dashSpeed: S.PHYS.dashSpeed * 1.8, dashCd: 0.35 });
}

// Nivel "super profesional": más preciso y rápido que el Pro normal
S.DIFF[3] = { name: "Super Pro", err: 0.015, react: 0.08, turn: 22, lead: 1, rateMul: 1 };

// Sala "falsa": reutiliza la IA de los bots, pero los disparos se envían al servidor
const fake = {
  diff: 3, get map() { return map; }, get state() { return st === 0 ? "play" : "end"; }, get mode() { return mode; },
  get time() { return clock; }, get pickups() { return pickups; }, fighters: others,
  isEnemy: S.Room.prototype.isEnemy,
  fire(f, aim, seq, sd) {
    const w = S.WEAPONS[f.w];
    if (clock - lastShot < w.rate) return false;
    lastShot = clock; f.lastShot = clock;
    if (f.ammo > 0 && --f.ammo === 0) { f.w = 0; f.ammo = -1; }
    send({ t: "fire", s: seq, a: aim, sd, x: f.x, y: f.y, l: f.life });
    return true;
  },
};
const send = (m) => ws.readyState === 1 && ws.send(JSON.stringify(m));

ws.on("open", () => send({ t: "join", name, code: code.toUpperCase() }));
ws.on("message", (raw) => {
  const m = JSON.parse(raw);
  if (m.t === "err") { console.log("Error:", m.msg); process.exit(1); }
  if (m.t === "welcome") {
    myId = m.id; mode = m.mode;
    me = S.makeFighter(myId, name, true, 0, "#fff"); me.alive = false;
    for (const r of m.roster) roster.set(r[0], r);
    console.log(`Dentro de la sala ${m.code} como ${name} (id ${myId})`);
    return;
  }
  if (m.t !== "s" || !me) return;
  for (const ev of m.ev) {
    // Esquive: si un rival dispara apuntándome, salto o impulso al instante
    if (ev.t === "shot" && ev.o !== myId && me.alive) {
      const o = others.get(ev.o);
      if (o && fake.isEnemy(o, me)) {
        const a = Math.atan2(me.y - 34 - (ev.y - S.SHOULDER), me.x - ev.x);
        const d = Math.hypot(me.x - ev.x, me.y - ev.y);
        if (d < 1400 && Math.abs(Math.atan2(Math.sin(a - ev.a), Math.cos(a - ev.a))) < 0.35) dodge();
      }
    }
    if (ev.t === "roster") { roster = new Map(ev.l.map(r => [r[0], r])); }
    if (ev.t === "hit" && ev.id === myId) { me.vx += ev.kx || 0; me.vy += ev.ky || 0; me.lastAttacker = ev.by; }
    if (ev.t === "kill" && ev.k === myId) { console.log("Baja a", roster.get(ev.v)?.[1]); if (process.env.NINJA) { spinT = 0.8; me.jbuf = S.PHYS.buffer; } }
    if (ev.t === "kill" && ev.v === myId) { me.alive = false; console.log("Me bajó", roster.get(ev.k)?.[1] || "el piso"); }
  }
  if (m.sd !== seed) { seed = m.sd; map = S.generateMap(seed); me.alive = false; }
  st = m.st; mode = m.md;
  pickups = map.pickupSpots.map((p, i) => ({ x: p.x, y: p.y, kind: m.pk[i], active: m.pk[i] >= 0 }));
  const seen = new Set();
  for (const a of m.f) {
    const [id, x, y, vx, vy, aim, hp, w, ammo, alive, shield, kills, deaths, life, wv, armor, g] = a;
    if (id === myId) {
      me.hp = hp; me.armor = armor; me.shield = shield ? 1 : 0;
      if (alive && life !== me.life) Object.assign(me, { x, y, vx: 0, vy: 0, alive: true, life, w, ammo, wv, ai: null });
      else if (!alive) me.alive = false;
      if (wv !== me.wv) Object.assign(me, { w, ammo, wv });
      me.team = roster.get(id)?.[3] ?? me.team;
      others.set(id, me);
      seen.add(id);
      continue;
    }
    seen.add(id);
    const o = others.get(id) || S.makeFighter(id, "", true, 0, "");
    Object.assign(o, { x, y, vx, vy, aim, hp, w, alive: !!alive, shield: shield ? 1 : 0, onGround: !!g, team: roster.get(id)?.[3] ?? id });
    others.set(id, o);
  }
  for (const id of [...others.keys()]) if (!seen.has(id)) others.delete(id);
});
ws.on("close", () => { console.log("Conexión cerrada"); process.exit(0); });

function dodge() {
  if (me.dashCd <= 0 && Math.random() < 0.45) {
    me.dashT = S.PHYS.dashTime; me.dashCd = S.PHYS.dashCd;
    me.dashDir = Math.random() < 0.5 ? -1 : 1;
  } else if (me.onGround || me.jumps < 2) me.jbuf = S.PHYS.buffer;
}
let hopT = 0, ninjaT = 3, spinT = 0;
// Modo ninja (NINJA=1): cada pocos segundos se teletransporta a la espalda del rival más cercano
function ninjaStep(dt) {
  ninjaT -= dt;
  if (spinT > 0) { spinT -= dt; me.aim += dt * 18; return true; }
  if (ninjaT > 0) return false;
  ninjaT = 2.5 + Math.random() * 2.5;
  let best = null, bd = Infinity;
  for (const o of others.values()) {
    if (o === me || !o.alive || o.shield || !fake.isEnemy(me, o)) continue;
    const d = Math.hypot(o.x - me.x, o.y - me.y);
    if (d < bd) { bd = d; best = o; }
  }
  if (!best) return false;
  const back = Math.cos(best.aim) >= 0 ? -1 : 1;
  for (const off of [70 * back, -70 * back]) {
    const x = best.x + off, y = best.y;
    if (x < 20 || x > map.W - 20 || S.overlapSolid(map, x - 12, y - 60, x + 12, y - 0.5)) continue;
    Object.assign(me, { x, y, vx: 0, vy: 0 });
    me.aim = Math.atan2(best.y - 34 - (y - S.SHOULDER), best.x - x);
    lastShot = -9;
    send({ t: "st", x: me.x, y: me.y, vx: 0, vy: 0, a: me.aim, l: me.life, g: 1, d: 0 });
    console.log("Teletransporte detrás de", roster.get(best.id)?.[1]);
    return false;
  }
  return false;
}
setInterval(() => {
  const dt = 1 / 30; clock += dt;
  if (!me || !me.alive || !map) return;
  // Movimiento evasivo constante: saltitos impredecibles
  hopT -= dt;
  if (hopT <= 0) { hopT = 0.35 + Math.random() * 0.6; if (me.onGround && Math.random() < 0.6) me.jbuf = S.PHYS.buffer; }
  if (process.env.NINJA && ninjaStep(dt)) {
    // Giro de celebración en el aire después de cada baja
    S.stepFighter(me, { mx: 0, jump: true }, dt, map);
  } else S.Room.prototype.updateBot.call(fake, me, dt);
  send({ t: "st", x: me.x, y: me.y, vx: me.vx, vy: me.vy, a: me.aim, l: me.life, g: me.onGround ? 1 : 0, d: me.dashT > 0 ? 1 : 0 });
}, 1000 / 30);
