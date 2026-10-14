const express = require("express");
const http = require("http");
const path = require("path");
const crypto = require("crypto");
const { WebSocketServer, WebSocket } = require("ws");
const BR = require("./public/br.js");

const PORT = Number(process.env.PORT) || 10000;
const TICK = 1000 / 30;
const SEND_EVERY = 0.05;          // 20 envíos por segundo
const RECONNECT_GRACE = 25;       // segundos que se guarda el puesto si se cae el internet
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const app = express();
const server = http.createServer(app);
// Compresión: el estado del juego es texto muy repetido y se reduce bastante
const wss = new WebSocketServer({
  server, path: "/ws", maxPayload: 4096,
  perMessageDeflate: { threshold: 200, zlibDeflateOptions: { level: 3 }, serverNoContextTakeover: false, clientNoContextTakeover: true },
});
// code -> { code, host, mode, diff, players: Map<id, {id,name,token,ws,goneAt}>, match, idle, nextId, sendT }
const rooms = new Map();

app.disable("x-powered-by");
app.get("/healthz", (_req, res) => {
  let players = 0;
  for (const r of rooms.values()) for (const p of r.players.values()) if (p.ws) players++;
  res.json({ ok: true, rooms: rooms.size, players });
});
app.use(express.static(path.join(__dirname, "public"), {
  setHeaders(res, file) {
    if (file.endsWith("sw.js") || file.endsWith(".html")) res.setHeader("Cache-Control", "no-cache");
  },
}));
app.get("*", (_req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

function newCode() {
  for (;;) {
    let c = "";
    for (let i = 0; i < 4; i++) c += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    if (!rooms.has(c)) return c;
  }
}
const send = (ws, msg) => { if (ws && ws.readyState === WebSocket.OPEN) ws.send(typeof msg === "string" ? msg : JSON.stringify(msg)); };
function lobbyMsg(room) {
  return {
    t: "lobby", code: room.code, host: room.host, mode: room.mode, diff: room.diff, inMatch: !!room.match,
    players: [...room.players.values()].map(p => ({ id: p.id, name: p.name, away: !p.ws })),
  };
}
function broadcastLobby(room) { const m = JSON.stringify(lobbyMsg(room)); for (const p of room.players.values()) send(p.ws, m); }
function startInfo(match) { return { t: "start", seed: match.seed, mode: match.mode, plane: null, roster: match.roster(), loot: match.lootList() }; }

function attach(ws, room, p, resumed) {
  p.ws = ws; p.goneAt = 0;
  ws.room = room; ws.pid = p.id;
  room.idle = 0;
  send(ws, { t: "welcome", id: p.id, code: room.code, token: p.token, resumed: !!resumed });
  broadcastLobby(room);
  if (room.match) {
    const f = room.match.fighters.get(p.id);
    send(ws, { t: f ? "resume" : "spectate", start: startInfo(room.match) });
  }
}
function joinRoom(ws, room, name, token) {
  // Volver a entrar después de que se cayó el internet: recupera el mismo jugador
  if (token) for (const p of room.players.values()) if (p.token === token) { if (p.ws && p.ws !== ws) try { p.ws.close(); } catch (_) {} return attach(ws, room, p, true); }
  const active = [...room.players.values()].length;
  if (active >= BR.MAX_PLAYERS) return send(ws, { t: "err", msg: "Esa sala está llena (máximo 20 personas)." });
  const p = { id: room.nextId++, name: BR.cleanName(name), token: crypto.randomBytes(12).toString("hex"), ws: null, goneAt: 0 };
  room.players.set(p.id, p);
  if (room.host == null) room.host = p.id;
  attach(ws, room, p, false);
}
function dropPlayer(room, p) {
  room.players.delete(p.id);
  if (room.match) room.match.removeHuman(p.id);
  if (room.host === p.id) {
    const next = [...room.players.values()].find(o => o.ws) || room.players.values().next().value;
    room.host = next ? next.id : null;
  }
  broadcastLobby(room);
}
function onClose(ws) {
  const room = ws.room;
  if (!room) return;
  const p = room.players.get(ws.pid);
  ws.room = null;
  if (!p || p.ws !== ws) return;
  if (ws.leaving) return dropPlayer(room, p);
  p.ws = null; p.goneAt = Date.now();   // se guarda el puesto un rato
  broadcastLobby(room);
}

wss.on("connection", (ws) => {
  ws.alive = true;
  ws.on("pong", () => { ws.alive = true; });
  ws.on("message", (raw) => {
    let m;
    try { m = JSON.parse(raw.toString()); } catch { return; }
    if (!m || typeof m.t !== "string") return;
    const room = ws.room;
    const match = room && room.match;
    switch (m.t) {
      case "st": if (match) match.onState(ws.pid, m); break;
      case "fire": if (match) match.onFire(ws.pid, m); break;
      case "pick": if (match) match.onPick(ws.pid, m); break;
      case "use": if (match) match.onUse(ws.pid, m); break;
      case "slot": if (match) match.onSlot(ws.pid, m); break;
      case "reload": if (match) match.onReload(ws.pid); break;
      case "veh": if (match) match.onVeh(ws.pid, m); break;
      case "ping": send(ws, { t: "pong", c: m.c }); break;
      case "create": {
        if (room) return;
        const code = newCode();
        const r = { code, host: null, mode: m.mode === "solo" ? "solo" : "duo", diff: BR.clamp(Math.round(+m.diff || 1), 0, 2), players: new Map(), match: null, idle: 0, nextId: 1, sendT: 0 };
        rooms.set(code, r);
        joinRoom(ws, r, m.name);
        break;
      }
      case "join": {
        if (room) return;
        const code = String(m.code || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4);
        const r = rooms.get(code);
        if (!r) return send(ws, { t: "err", msg: "No encontramos la sala " + code + ". Revisa el código o crea una nueva." });
        joinRoom(ws, r, m.name, typeof m.token === "string" ? m.token : null);
        break;
      }
      case "set": {
        if (!room || room.host !== ws.pid || room.match) return;
        if (m.mode === "solo" || m.mode === "duo") room.mode = m.mode;
        if (Number.isFinite(+m.diff)) room.diff = BR.clamp(Math.round(+m.diff), 0, 2);
        broadcastLobby(room);
        break;
      }
      case "start": {
        if (!room || room.host !== ws.pid || room.match) return;
        room.match = new BR.Match({ mode: room.mode, diff: room.diff, humans: [...room.players.values()].filter(p => p.ws) });
        room.sendT = 1;
        broadcastLobby(room);
        break;
      }
      case "leave": ws.leaving = true; onClose(ws); break;
    }
  });
  ws.on("close", () => onClose(ws));
  ws.on("error", () => {});
});

let last = Date.now();
setInterval(() => {
  const now = Date.now();
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  for (const [code, room] of rooms) {
    for (const p of [...room.players.values()]) if (!p.ws && now - p.goneAt > RECONNECT_GRACE * 1000) dropPlayer(room, p);
    if (![...room.players.values()].some(p => p.ws)) {
      room.idle += dt;
      if (room.idle > 120 || room.players.size === 0 && room.idle > 30) rooms.delete(code);
      if (!room.match) continue;
    }
    const match = room.match;
    if (!match) continue;
    match.update(dt);
    room.sendT += dt;
    if (room.sendT < SEND_EVERY && match.state !== "end") continue;
    room.sendT = 0;
    const ev = match.drain();
    // Cada equipo recibe su propia versión (con su inventario), así se mandan menos datos
    const perTeam = new Map();
    for (const p of room.players.values()) {
      if (!p.ws) continue;
      const f = match.fighters.get(p.id);
      const team = f ? f.team : -1;
      if (!perTeam.has(team)) { const snap = match.snapshot(team); snap.t = "s"; snap.ev = ev; perTeam.set(team, JSON.stringify(snap)); }
      send(p.ws, perTeam.get(team));
    }
    if (match.state === "end" && match.endT <= 0) {
      room.match = null;
      broadcastLobby(room);
    }
  }
}, TICK);

// Cierra conexiones muertas (celular bloqueado, wifi caído)
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.alive) { ws.terminate(); continue; }
    ws.alive = false;
    ws.ping();
  }
}, 10000);

server.listen(PORT, "0.0.0.0", () => console.log(`Meiker Battle Royale escuchando en ${PORT}`));
