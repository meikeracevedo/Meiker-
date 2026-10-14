const express = require("express");
const http = require("http");
const path = require("path");
const { WebSocketServer, WebSocket } = require("ws");
const BR = require("./public/br.js");

const PORT = Number(process.env.PORT) || 10000;
const TICK = 1000 / 30;
const MAX_HUMANS = BR.MAX_PLAYERS;
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/ws", maxPayload: 4096 });
// code -> { code, host, mode, diff, clients: Map<ws, {id, name}>, match, idle, nextId }
const rooms = new Map();

app.disable("x-powered-by");
app.get("/healthz", (_req, res) => {
  let players = 0;
  for (const r of rooms.values()) players += r.clients.size;
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
const send = (ws, msg) => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg)); };
function lobbyMsg(room) {
  return {
    t: "lobby", code: room.code, host: room.host, mode: room.mode, diff: room.diff,
    inMatch: !!room.match,
    players: [...room.clients.values()].map(p => ({ id: p.id, name: p.name })),
  };
}
function broadcast(room, msg) {
  const data = JSON.stringify(msg);
  for (const ws of room.clients.keys()) if (ws.readyState === WebSocket.OPEN) ws.send(data);
}

function joinRoom(ws, room, name) {
  if (room.clients.size >= MAX_HUMANS) return send(ws, { t: "err", msg: "Esa sala está llena (máximo 20 personas)." });
  const p = { id: room.nextId++, name: BR.cleanName(name) };
  room.clients.set(ws, p);
  room.idle = 0;
  ws.room = room;
  ws.pid = p.id;
  if (room.host == null) room.host = p.id;
  send(ws, { t: "welcome", id: p.id, code: room.code });
  broadcast(room, lobbyMsg(room));
  // Si hay una partida en curso, puede verla mientras espera la siguiente
  if (room.match) send(ws, Object.assign({ t: "spectate" }, { start: { t: "start", seed: room.match.seed, mode: room.match.mode, plane: room.match.plane, roster: room.match.roster(), loot: room.match.lootList() } }));
}
function leaveRoom(ws) {
  const room = ws.room;
  if (!room) return;
  room.clients.delete(ws);
  if (room.match) room.match.removeHuman(ws.pid);
  if (room.host === ws.pid) {
    const next = room.clients.values().next().value;
    room.host = next ? next.id : null;
  }
  ws.room = null;
  broadcast(room, lobbyMsg(room));
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
      case "ping": send(ws, { t: "pong", c: m.c }); break;
      case "create": {
        if (room) return;
        const code = newCode();
        const r = { code, host: null, mode: m.mode === "solo" ? "solo" : "duo", diff: BR.clamp(Math.round(+m.diff || 1), 0, 2), clients: new Map(), match: null, idle: 0, nextId: 1 };
        rooms.set(code, r);
        joinRoom(ws, r, m.name);
        break;
      }
      case "join": {
        if (room) return;
        const code = String(m.code || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4);
        const r = rooms.get(code);
        if (!r) return send(ws, { t: "err", msg: "No encontramos la sala " + code + ". Revisa el código o crea una nueva." });
        joinRoom(ws, r, m.name);
        break;
      }
      case "set": {
        if (!room || room.host !== ws.pid || room.match) return;
        if (m.mode === "solo" || m.mode === "duo") room.mode = m.mode;
        if (Number.isFinite(+m.diff)) room.diff = BR.clamp(Math.round(+m.diff), 0, 2);
        broadcast(room, lobbyMsg(room));
        break;
      }
      case "start": {
        if (!room || room.host !== ws.pid || room.match) return;
        room.match = new BR.Match({ mode: room.mode, diff: room.diff, humans: [...room.clients.values()] });
        room.matchPlayers = new Set([...room.clients.values()].map(p => p.id));
        broadcast(room, lobbyMsg(room));
        break;
      }
      case "leave": leaveRoom(ws); break;
    }
  });
  ws.on("close", () => leaveRoom(ws));
  ws.on("error", () => {});
});

let last = Date.now();
setInterval(() => {
  const now = Date.now();
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  for (const [code, room] of rooms) {
    if (room.clients.size === 0) {
      room.idle += dt;
      if (room.idle > 120) rooms.delete(code);
      continue;
    }
    const match = room.match;
    if (!match) continue;
    match.update(dt);
    // Simula a 30 Hz pero envía a 20 Hz para gastar menos datos del celular
    room.sendT = (room.sendT || 0) + dt;
    if (room.sendT < 0.05 && match.state !== "end") continue;
    room.sendT = 0;
    const snap = match.snapshot();
    snap.t = "s";
    snap.ev = match.drain();
    broadcast(room, snap);
    if (match.state === "end" && match.endT <= 0) {
      room.match = null;
      broadcast(room, lobbyMsg(room));
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
}, 15000);

server.listen(PORT, "0.0.0.0", () => console.log(`Meiker Battle Royale escuchando en ${PORT}`));
