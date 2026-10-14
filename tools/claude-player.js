/* Mete un jugador manejado por la IA de los bots (nivel Pro) a una sala online.
   Uso: node tools/claude-player.js <url-del-juego> <CODIGO> [NOMBRE] */
const WebSocket = require("ws");
const S = require("../public/sim.js");

const [base, code, name = "CLAUDE"] = process.argv.slice(2);
if (!base || !code) { console.log("Uso: node tools/claude-player.js https://tu-juego.onrender.com ABCD [NOMBRE]"); process.exit(1); }
const wsUrl = base.replace(/^http/, "ws").replace(/\/$/, "") + "/ws";

const ws = new WebSocket(wsUrl);
let myId = null, me = null, map = null, seed = null, roster = new Map(), others = new Map(), pickups = [], st = 0, mode = "ffa";
let lastShot = -9, clock = 0;

// Sala "falsa": reutiliza la IA de los bots, pero los disparos se envían al servidor
const fake = {
  diff: 2, get map() { return map; }, get state() { return st === 0 ? "play" : "end"; }, get mode() { return mode; },
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
    if (ev.t === "roster") { roster = new Map(ev.l.map(r => [r[0], r])); }
    if (ev.t === "hit" && ev.id === myId) { me.vx += ev.kx || 0; me.vy += ev.ky || 0; me.lastAttacker = ev.by; }
    if (ev.t === "kill" && ev.k === myId) console.log("Baja a", roster.get(ev.v)?.[1]);
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

setInterval(() => {
  const dt = 1 / 30; clock += dt;
  if (!me || !me.alive || !map) return;
  S.Room.prototype.updateBot.call(fake, me, dt);
  send({ t: "st", x: me.x, y: me.y, vx: me.vx, vy: me.vy, a: me.aim, l: me.life, g: me.onGround ? 1 : 0, d: me.dashT > 0 ? 1 : 0 });
}, 1000 / 30);
