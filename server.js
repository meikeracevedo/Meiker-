const express = require("express");
const http = require("http");
const path = require("path");
const { WebSocketServer, WebSocket } = require("ws");
const Sim = require("./public/sim.js");

const PORT = Number(process.env.PORT) || 10000;
const TICK = 1000 / 30;
const MAX_HUMANS = 8;
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/ws", maxPayload: 2048 });
const rooms = new Map(); // code -> { room, clients: Map<ws, fighterId>, idle }

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

function joinRoom(ws, entry, name) {
  if (entry.clients.size >= MAX_HUMANS) return send(ws, { t: "err", msg: "Esa sala está llena (máximo 8 personas)." });
  const f = entry.room.addHuman(name);
  entry.clients.set(ws, f.id);
  entry.idle = 0;
  ws.entry = entry;
  ws.fid = f.id;
  const r = entry.room;
  send(ws, { t: "welcome", id: f.id, code: r.code, mode: r.mode, bots: r.botCount, diff: r.diff, roster: r.roster() });
}

function leaveRoom(ws) {
  const entry = ws.entry;
  if (!entry) return;
  entry.clients.delete(ws);
  entry.room.removeHuman(ws.fid);
  ws.entry = null;
}

wss.on("connection", (ws) => {
  ws.alive = true;
  ws.on("pong", () => { ws.alive = true; });
  ws.on("message", (raw) => {
    let m;
    try { m = JSON.parse(raw.toString()); } catch { return; }
    if (!m || typeof m.t !== "string") return;
    const entry = ws.entry;
    switch (m.t) {
      case "st": if (entry) entry.room.onClientState(ws.fid, m); break;
      case "fire": if (entry) entry.room.onClientFire(ws.fid, m); break;
      case "ping": send(ws, { t: "pong", c: m.c }); break;
      case "create": {
        if (entry) return;
        const code = newCode();
        const room = new Sim.Room({ code, mode: m.mode, bots: m.bots, diff: m.diff });
        const e = { room, clients: new Map(), idle: 0 };
        rooms.set(code, e);
        joinRoom(ws, e, m.name);
        break;
      }
      case "join": {
        if (entry) return;
        const code = String(m.code || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4);
        const e = rooms.get(code);
        if (!e) return send(ws, { t: "err", msg: "No encontramos la sala " + (code || "") + ". Revisa el código o crea una nueva." });
        joinRoom(ws, e, m.name);
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
  for (const [code, e] of rooms) {
    if (e.clients.size === 0) {
      e.idle += dt;
      if (e.idle > 90) rooms.delete(code);
      continue;
    }
    e.room.update(dt);
    const snap = e.room.snapshot();
    snap.t = "s";
    snap.ev = e.room.drain();
    const data = JSON.stringify(snap);
    for (const ws of e.clients.keys()) if (ws.readyState === WebSocket.OPEN) ws.send(data);
  }
}, TICK);

// Cierra conexiones muertas (celular que se bloqueó, wifi caído)
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.alive) { ws.terminate(); continue; }
    ws.alive = false;
    ws.ping();
  }
}, 15000);

server.listen(PORT, "0.0.0.0", () => console.log(`Meiker Stick Battle escuchando en ${PORT}`));
