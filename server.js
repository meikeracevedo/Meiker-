const express = require("express");
const http = require("http");
const path = require("path");
const { randomUUID } = require("crypto");
const { WebSocketServer, WebSocket } = require("ws");

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/ws", maxPayload: 2048 });
const PORT = Number(process.env.PORT) || 10000;
const MAX_PLAYERS = 50;
const clients = new Map();

app.disable("x-powered-by");
app.get("/healthz", (_req, res) => {
  res.status(200).json({ ok: true, connectedPlayers: clients.size });
});
app.use(express.static(__dirname, { extensions: ["html"] }));
app.get("*", (_req, res) => res.sendFile(path.join(__dirname, "index.html")));

function send(ws, payload) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload));
}
function broadcast(payload, except = null) {
  const data = JSON.stringify(payload);
  for (const client of wss.clients) {
    if (client !== except && client.readyState === WebSocket.OPEN) client.send(data);
  }
}

wss.on("connection", (ws) => {
  if (clients.size >= MAX_PLAYERS) {
    ws.close(1013, "Servidor lleno");
    return;
  }

  const id = randomUUID();
  clients.set(id, ws);
  send(ws, { type: "welcome", id, count: clients.size });
  broadcast({ type: "count", count: clients.size });

  ws.on("message", (raw) => {
    // The initial server only accepts small JSON heartbeat/presence messages.
    // Game state and combat must be validated server-side before competitive play.
    let message;
    try { message = JSON.parse(raw.toString()); } catch { return; }
    if (!message || message.type !== "heartbeat") return;
    send(ws, { type: "heartbeat", time: Date.now() });
  });

  ws.on("close", () => {
    clients.delete(id);
    broadcast({ type: "count", count: clients.size });
  });
  ws.on("error", () => {
    clients.delete(id);
  });
});

// Keep idle/broken connections from staying in the player count forever.
const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if (ws.isAlive === false) {
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    ws.ping();
  }
}, 30000);
wss.on("connection", ws => {
  ws.isAlive = true;
  ws.on("pong", () => { ws.isAlive = true; });
});
server.on("close", () => clearInterval(heartbeat));

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Meiker server listening on port ${PORT}`);
});
