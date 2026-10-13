const express = require("express");
const http = require("http");
const path = require("path");
const { randomUUID } = require("crypto");
const { WebSocketServer, WebSocket } = require("ws");

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/ws", maxPayload: 4096 });
const PORT = Number(process.env.PORT) || 10000;
const MAX_PLAYERS = 32;
const WORLD = { w: 1800, h: 1200 };
const SPEED = 235;
const BULLET_SPEED = 560;
const BULLET_LIFE = 1.05;
const players = new Map();
const sockets = new Map();
const bullets = [];
let nextBulletId = 1;
let lastTick = Date.now();

app.disable("x-powered-by");
app.get("/healthz", (_req, res) => res.status(200).json({ ok: true, players: players.size }));
app.use(express.static(__dirname));
app.get("*", (_req, res) => res.sendFile(path.join(__dirname, "index.html")));

const buildings = [
  {x:210,y:155,w:180,h:125},{x:480,y:135,w:135,h:160},{x:760,y:180,w:205,h:125},{x:1160,y:135,w:170,h:155},{x:1430,y:205,w:170,h:125},
  {x:130,y:430,w:145,h:170},{x:390,y:430,w:205,h:125},{x:690,y:420,w:150,h:185},{x:1010,y:445,w:195,h:130},{x:1360,y:430,w:230,h:170},
  {x:230,y:760,w:190,h:140},{x:520,y:800,w:150,h:175},{x:820,y:750,w:220,h:140},{x:1160,y:790,w:160,h:175},{x:1440,y:760,w:170,h:140},
  {x:700,y:1010,w:150,h:90},{x:1000,y:1010,w:210,h:95}
];
function collides(x,y,r=14) {
  if (x < r || y < r || x > WORLD.w-r || y > WORLD.h-r) return true;
  return buildings.some(b => x+r>b.x && x-r<b.x+b.w && y+r>b.y && y-r<b.y+b.h);
}
function spawnPosition(id) {
  const spots = [{x:75,y:75},{x:900,y:80},{x:1700,y:80},{x:75,y:1120},{x:1700,y:1120},{x:900,y:1120},{x:900,y:600},{x:350,y:600},{x:1500,y:600}];
  const idx = Math.abs([...id].reduce((a,c)=>a+c.charCodeAt(0),0)) % spots.length;
  for(let i=0;i<spots.length;i++){const s=spots[(idx+i)%spots.length];if(!collides(s.x,s.y)&&![...players.values()].some(p=>p.alive&&Math.hypot(p.x-s.x,p.y-s.y)<55))return {...s};}
  for(let i=0;i<100;i++){const x=40+Math.random()*(WORLD.w-80),y=40+Math.random()*(WORLD.h-80);if(!collides(x,y)&&![...players.values()].some(p=>p.alive&&Math.hypot(p.x-x,p.y-y)<40))return{x,y};}
  return {x:80,y:80};
}
function send(ws, msg){if(ws && ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify(msg));}
function broadcast(msg){const data=JSON.stringify(msg);for(const ws of wss.clients)if(ws.readyState===WebSocket.OPEN)ws.send(data);}
function publicPlayer(p){return{id:p.id,name:p.name,x:Math.round(p.x*10)/10,y:Math.round(p.y*10)/10,angle:p.angle,hp:p.hp,kills:p.kills,alive:p.alive};}
function getPlayer(ws){const id=sockets.get(ws);return id?players.get(id):null;}
function tryMove(p,dx,dy,dt){
  const len=Math.hypot(dx,dy);if(len>1){dx/=len;dy/=len;}
  const nx=Math.max(15,Math.min(WORLD.w-15,p.x+dx*SPEED*dt));
  if(!collides(nx,p.y))p.x=nx;
  const ny=Math.max(15,Math.min(WORLD.h-15,p.y+dy*SPEED*dt));
  if(!collides(p.x,ny))p.y=ny;
}
function handleShoot(p,angle){
  if(!p||!p.alive||!Number.isFinite(angle)||Date.now()-p.lastShot<260)return;
  p.lastShot=Date.now();const a=Math.max(-Math.PI*4,Math.min(Math.PI*4,angle));
  bullets.push({id:nextBulletId++,owner:p.id,x:p.x+Math.cos(a)*18,y:p.y+Math.sin(a)*18,vx:Math.cos(a)*BULLET_SPEED,vy:Math.sin(a)*BULLET_SPEED,life:BULLET_LIFE});
}
wss.on("connection",ws=>{
  if(players.size>=MAX_PLAYERS){ws.close(1013,"Servidor lleno");return;}
  const id=randomUUID(),spawn=spawnPosition(id);
  const p={id,name:"Jugador",x:spawn.x,y:spawn.y,angle:0,hp:100,kills:0,alive:true,respawnAt:0,input:{x:0,y:0},lastShot:0,lastHeartbeat:Date.now()};
  players.set(id,p);sockets.set(ws,id);
  send(ws,{type:"welcome",id,players:[...players.values()].map(publicPlayer),count:players.size});
  broadcast({type:"count",count:players.size});
  ws.on("message",raw=>{
    let m;try{m=JSON.parse(raw.toString())}catch{return}
    if(!m||typeof m.type!=="string")return;
    const player=getPlayer(ws);if(!player)return;
    if(m.type==="heartbeat"){player.lastHeartbeat=Date.now();send(ws,{type:"heartbeat",time:Date.now()});return;}
    if(m.type==="join"){player.name=typeof m.name==="string"?m.name.replace(/[^a-zA-Z0-9 _-]/g,"").slice(0,16)||"Jugador":"Jugador";return;}
    if(m.type==="start"){if(!player.alive&&Date.now()>=player.respawnAt){const s=spawnPosition(player.id);player.x=s.x;player.y=s.y;player.hp=100;player.alive=true;}return;}
    if(m.type==="input"){
      if(!player.alive)return;
      const x=Number(m.x),y=Number(m.y),a=Number(m.angle);
      player.input={x:Number.isFinite(x)?Math.max(-1,Math.min(1,x)):0,y:Number.isFinite(y)?Math.max(-1,Math.min(1,y)):0};
      if(Number.isFinite(a))player.angle=Math.atan2(Math.sin(a),Math.cos(a));
      return;
    }
    if(m.type==="shoot"){handleShoot(player,Number(m.angle));return;}
  });
  ws.on("close",()=>{const id=sockets.get(ws);sockets.delete(ws);if(id){players.delete(id);for(let i=bullets.length-1;i>=0;i--)if(bullets[i].owner===id)bullets.splice(i,1);broadcast({type:"count",count:players.size});}});
  ws.on("error",()=>{});
});

setInterval(()=>{
  const now=Date.now(),dt=Math.min((now-lastTick)/1000,0.05);lastTick=now;
  for(const p of players.values()){
    if(p.alive){tryMove(p,p.input.x,p.input.y,dt);if(now-p.lastHeartbeat>45000)p.input={x:0,y:0};}
    else if(now>=p.respawnAt){const s=spawnPosition(p.id);p.x=s.x;p.y=s.y;p.hp=100;p.alive=true;p.input={x:0,y:0};}
  }
  for(let i=bullets.length-1;i>=0;i--){
    const b=bullets[i];b.life-=dt;b.x+=b.vx*dt;b.y+=b.vy*dt;
    let remove=b.life<=0||b.x<0||b.y<0||b.x>WORLD.w||b.y>WORLD.h||collides(b.x,b.y,3);
    if(!remove){
      for(const p of players.values()){
        if(!p.alive||p.id===b.owner)continue;
        if(Math.hypot(p.x-b.x,p.y-b.y)<17){
          p.hp-=34;remove=true;
          if(p.hp<=0){p.hp=0;p.alive=false;p.respawnAt=Date.now()+3500;const killer=players.get(b.owner);if(killer)killer.kills++;}
          break;
        }
      }
    }
    if(remove)bullets.splice(i,1);
  }
  const state={type:"state",players:[...players.values()].map(publicPlayer),bullets:bullets.map(b=>({id:b.id,x:Math.round(b.x),y:Math.round(b.y),vx:b.vx,vy:b.vy}))};
  broadcast(state);
},50);

server.listen(PORT,"0.0.0.0",()=>console.log(`Meiker 2D multiplayer listening on ${PORT}`));
