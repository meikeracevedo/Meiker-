# Meiker Battle Royale 3D — Render + WebSocket

This package adds a Node.js Web Service entry point and a WebSocket endpoint to the existing repository.

## Add these files to the repository root

- `index.html`
- `server.js`
- `package.json`
- `render.yaml`

Keep the existing `meiker-battle-royale-3d.html` in the same root directory. `index.html` opens that game and displays the WebSocket connection/player count.

## Deploy on Render

Create a **Web Service** connected to the GitHub repository, or use the Blueprint flow with `render.yaml`.

- Runtime: Node
- Build command: `npm install`
- Start command: `npm start`
- Health check path: `/healthz`

Do not deploy this as a Static Site: WebSockets require the Node web process.

## Current milestone

The WebSocket server accepts connections, tracks the connected-player count, handles heartbeat messages, and removes disconnected clients. The existing game still runs locally in each browser. This is the networking foundation, not yet synchronized multiplayer combat. The next milestone is to connect game position/input to `/ws` and move authoritative movement, hit detection, health, and match state into the server.
