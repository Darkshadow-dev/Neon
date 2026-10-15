const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const WebSocket = require("ws");

const HOST = "0.0.0.0";
const PORT = Number(process.env.PORT || 8080);
const PUBLIC_DIR = path.join(__dirname, "public");
const MAX_ROOMS = 500;
const TICK_MS = 50;
const WORLD = { width: 1000, height: 620 };
const rooms = new Map();
const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml"
};

const server = http.createServer((req, res) => {
  if (!["GET", "HEAD"].includes(req.method)) {
    res.writeHead(405); return res.end("Method not allowed");
  }
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname); }
  catch { res.writeHead(400); return res.end("Bad request"); }
  if (pathname === "/") pathname = "/index.html";
  const filename = path.resolve(PUBLIC_DIR, "." + pathname);
  if (!filename.startsWith(PUBLIC_DIR + path.sep)) {
    res.writeHead(403); return res.end("Forbidden");
  }
  fs.readFile(filename, (err, data) => {
    if (err) { res.writeHead(404); return res.end("Not found"); }
    res.writeHead(200, {
      "Content-Type": mime[path.extname(filename)] || "application/octet-stream",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "Content-Security-Policy": "default-src 'self'; connect-src 'self' ws: wss:; style-src 'self' 'unsafe-inline'; script-src 'self'; base-uri 'none'; frame-ancestors 'none'"
    });
    res.end(req.method === "HEAD" ? undefined : data);
  });
});

const wss = new WebSocket.Server({ noServer: true, maxPayload: 4096 });
server.on("upgrade", (req, socket, head) => {
  wss.handleUpgrade(req, socket, head, ws => wss.emit("connection", ws, req));
});

function send(ws, obj) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
}
function code() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let result = "";
  for (let i = 0; i < 6; i++) result += alphabet[crypto.randomInt(alphabet.length)];
  return result;
}
function makeRoom(mode) {
  let roomCode;
  do { roomCode = code(); } while (rooms.has(roomCode));
  const room = {
    code: roomCode, mode, maxPlayers: mode === "2v2" ? 4 : 2,
    clients: new Map(), players: [], bullets: [], pickups: [],
    state: "lobby", winner: null, nextBullet: 1, nextPickup: 1,
    lastPickup: Date.now(), created: Date.now()
  };
  rooms.set(roomCode, room);
  return room;
}
function makePlayer(slot, name, mode, ship = "bolt") {
  const team = mode === "1v1" ? (slot === 1 ? 1 : 2) : (slot <= 2 ? 1 : 2);
  const startX = team === 1 ? 160 : WORLD.width - 160;
  const startY = slot % 2 === 1 ? WORLD.height * 0.36 : WORLD.height * 0.64;
  const shipType = ship === "laser" ? "laser" : "bolt";
  const maxHp = shipType === "laser" ? 72 : 100;
  return {
    slot, id: slot, name, team, ship: shipType, x: startX, y: startY,
    vx: 0, vy: 0, angle: team === 1 ? 0 : Math.PI,
    hp: maxHp, maxHp, shield: 0, damageBoost: 0,
    ammo: 6, ammoClock: 0, alive: true, input: {},
    lastShot: 0, burn: 0, burnDps: 0, burnTeam: 0
  };
}
function status(room, message) {
  broadcast(room, { type: "status", state: room.state, message, winner: room.winner });
}
function broadcast(room, obj) {
  const data = JSON.stringify(obj);
  for (const ws of room.clients.keys()) {
    if (ws.readyState === WebSocket.OPEN) ws.send(data);
  }
}
function lobbyInfo(room) {
  return {
    type: "room",
    code: room.code,
    mode: room.mode,
    state: room.state,
    maxPlayers: room.maxPlayers,
    players: room.players.map(p => ({ slot: p.slot, name: p.name, team: p.team, ship: p.ship, ready: !![...room.clients.values()].find(c => c.slot === p.slot)?.ready, hp: p.maxHp, damage: p.ship === "laser" ? "8 + burn" : "18–43" }))
  };
}
function syncLobby(room) {
  broadcast(room, lobbyInfo(room));
}
function resetRound(room) {
  room.players.forEach(p => {
    const fresh = makePlayer(p.slot, p.name, room.mode, p.ship);
    Object.assign(p, fresh);
  });
  room.bullets = [];
  room.pickups = [];
  room.winner = null;
  room.state = room.clients.size === room.maxPlayers && [...room.clients.values()].every(c => c.ready) ? "playing" : "lobby";
  room.lastPickup = Date.now();
  for (const c of room.clients.values()) c.input = {};
  status(room, room.state === "playing" ? "All pilots ready — fight!" : "Waiting for pilots…");
  snap(room);
}
function snap(room) {
  broadcast(room, {
    type: "state", code: room.code, mode: room.mode, state: room.state,
    winner: room.winner, world: WORLD,
    players: room.players.map(p => ({
      id: p.id, slot: p.slot, name: p.name, team: p.team, ship: p.ship,
      x: p.x, y: p.y, vx: p.vx, vy: p.vy, angle: p.angle,
      hp: p.hp, maxHp: p.maxHp, shield: p.shield,
      damageBoost: p.damageBoost, ammo: p.ammo, alive: p.alive
    })),
    bullets: room.bullets.map(b => ({ ...b })),
    pickups: room.pickups.map(p => ({ ...p }))
  });
}
function teamAlive(room, team) {
  return room.players.some(p => p.team === team && p.alive);
}
function nearestEnemy(room, p) {
  let best = null, distance = Infinity;
  for (const q of room.players) {
    if (q.team === p.team || !q.alive) continue;
    const d = Math.hypot(q.x - p.x, q.y - p.y);
    if (d < distance) { distance = d; best = q; }
  }
  return best;
}
function damage(room, target, amount, sourceTeam) {
  if (target.shield > 0) {
    const absorbed = Math.min(target.shield, amount);
    target.shield -= absorbed;
    amount -= absorbed;
  }
  if (amount > 0) target.hp = Math.max(0, target.hp - amount);
  if (target.hp <= 0 && target.alive) {
    target.alive = false;
    target.vx = target.vy = 0;
    if (!teamAlive(room, target.team)) {
      room.state = "ended";
      room.winner = sourceTeam;
      status(room, room.mode === "1v1" ? `PLAYER ${sourceTeam} WINS!` : `TEAM ${sourceTeam} WINS!`);
    }
  }
}
function segmentDistance(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const l2 = dx * dx + dy * dy;
  if (!l2) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
function fire(room, client, charge) {
  const p = room.players.find(x => x.slot === client.slot);
  if (!p || !p.alive || room.state !== "playing") return;
  const now = Date.now();
  if (p.ammo <= 0 || now - p.lastShot < 220) return;
  p.lastShot = now;
  p.ammo--;
  const c = Math.max(0, Math.min(1, Number(charge) || 0));
  const boosted = p.damageBoost > 0;
  const color = p.team === 1 ? "#47f6ff" : "#ff4c9a";
  if (p.ship === "laser") {
    const length = 900;
    const ax = p.x + Math.cos(p.angle) * 24, ay = p.y + Math.sin(p.angle) * 24;
    const bx = ax + Math.cos(p.angle) * length, by = ay + Math.sin(p.angle) * length;
    let hit = null, hitDist = Infinity;
    for (const q of room.players) {
      if (q.team === p.team || !q.alive) continue;
      const d = segmentDistance(q.x, q.y, ax, ay, bx, by);
      const along = (q.x - ax) * Math.cos(p.angle) + (q.y - ay) * Math.sin(p.angle);
      if (d < 25 && along >= 0 && along < hitDist) { hit = q; hitDist = along; }
    }
    if (hit) {
      if (c >= 0.98) {
        damage(room, hit, 1000 * (boosted ? 1.7 : 1), p.team);
        hit.burn = 0;
      } else {
        damage(room, hit, (5 + c * 5) * (boosted ? 1.7 : 1), p.team);
        hit.burn = 3.0;
        hit.burnDps = (4 + c * 3) * (boosted ? 1.7 : 1);
        hit.burnTeam = p.team;
      }
    }
    room.bullets.push({ id: room.nextBullet++, kind: "laser", owner: p.slot, team: p.team,
      x: ax, y: ay, x2: bx, y2: by, life: 0.16, color, charge: c });
  } else {
    const hitDamage = (18 + c * 25) * (boosted ? 1.7 : 1);
    const speed = 460 + c * 250;
    room.bullets.push({ id: room.nextBullet++, kind: "bolt", owner: p.slot, team: p.team,
      x: p.x + Math.cos(p.angle) * 25, y: p.y + Math.sin(p.angle) * 25,
      vx: Math.cos(p.angle) * speed + p.vx * 0.15,
      vy: Math.sin(p.angle) * speed + p.vy * 0.15,
      life: 1.6, damage: hitDamage, color });
  }
}

wss.on("connection", ws => {
  let client = null;
  ws.on("message", raw => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    if (!msg || typeof msg !== "object") return;
    if (msg.type === "create") {
      if (client) return;
      if (rooms.size >= MAX_ROOMS) { send(ws, { type: "error", message: "Room limit reached. Try again shortly." }); return; }
      const mode = msg.mode === "2v2" ? "2v2" : "1v1";
      const room = makeRoom(mode);
      const slot = 1;
      const name = String(msg.name || "Pilot 1").trim().slice(0, 18) || "Pilot 1";
      const c = { ws, slot, input: {}, room, ready: false };
      client = c;
      room.clients.set(ws, c);
      room.players.push(makePlayer(slot, name, mode, "bolt"));
      send(ws, { type: "welcome", slot, team: 1, code: room.code, mode, world: WORLD });
      syncLobby(room);
      status(room, `Room ${room.code} created. Share the code with your opponent.`);
      snap(room);
      return;
    }
    if (msg.type === "join") {
      if (client) return;
      const room = rooms.get(String(msg.code || "").toUpperCase().replace(/[^A-Z0-9]/g, ""));
      if (!room) { send(ws, { type: "error", message: "Room not found. Check the code." }); return; }
      if (room.state === "ended") { send(ws, { type: "error", message: "That round has ended. Ask the host to create a new room." }); return; }
      if (room.clients.size >= room.maxPlayers) { send(ws, { type: "error", message: "That room is full." }); return; }
      const slot = Array.from({ length: room.maxPlayers }, (_, i) => i + 1).find(n => !room.players.some(p => p.slot === n));
      const name = String(msg.name || `Pilot ${slot}`).trim().slice(0, 18) || `Pilot ${slot}`;
      const c = { ws, slot, input: {}, room, ready: false };
      client = c;
      room.clients.set(ws, c);
      room.players.push(makePlayer(slot, name, room.mode, "bolt"));
      send(ws, { type: "welcome", slot, team: room.mode === "1v1" ? (slot === 1 ? 1 : 2) : (slot <= 2 ? 1 : 2), code: room.code, mode: room.mode, world: WORLD });
      syncLobby(room);
      status(room, `${room.clients.size}/${room.maxPlayers} pilots connected. Choose a ship and press READY.`);
      snap(room);
      return;
    }
    if (!client) { send(ws, { type: "error", message: "Create or join a room first." }); return; }
    const room = client.room;
    if (msg.type === "chooseShip") {
      if (room.state !== "lobby") return;
      const p = room.players.find(x => x.slot === client.slot);
      if (!p) return;
      p.ship = msg.ship === "laser" ? "laser" : "bolt";
      p.maxHp = p.ship === "laser" ? 72 : 100;
      p.hp = p.maxHp;
      client.ready = false;
      syncLobby(room);
      snap(room);
      return;
    }
    if (msg.type === "ready") {
      if (room.state !== "lobby") return;
      client.ready = msg.ready === true;
      syncLobby(room);
      const full = room.clients.size === room.maxPlayers;
      const allReady = full && [...room.clients.values()].every(c => c.ready);
      if (allReady) resetRound(room);
      else status(room, full ? "All pilots must press READY to begin." : `${room.clients.size}/${room.maxPlayers} pilots connected. Waiting for more pilots.`);
      snap(room);
      return;
    }
    if (msg.type === "input") {
      const i = msg.input || {};
      client.input = {
        up: i.up === true, down: i.down === true, left: i.left === true, right: i.right === true
      };
      const p = room.players.find(x => x.slot === client.slot);
      if (p) p.input = client.input;
    }
    if (msg.type === "shoot") {
      fire(room, client, msg.charge);
    }
    if (msg.type === "restart" && room.state === "ended" && client.slot === 1) {
      resetRound(room);
      syncLobby(room);
    }
  });
  ws.on("close", () => {
    if (!client) return;
    const room = client.room;
    room.clients.delete(ws);
    room.players = room.players.filter(p => p.slot !== client.slot);
    if (room.clients.size === 0) {
      rooms.delete(room.code);
      return;
    }
    room.state = "lobby";
    room.winner = null;
    room.bullets = [];
    room.pickups = [];
    for (const p of room.players) { p.alive = true; p.hp = p.maxHp; p.shield = 0; p.burn = 0; p.burnDps = 0; }
    status(room, "A pilot disconnected. Waiting for them to reconnect or for the room to be recreated.");
    syncLobby(room);
    snap(room);
  });
  ws.on("error", () => {});
});

function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }
function updateRoom(room, dt, now) {
  if (room.state !== "playing") return;
  for (const p of room.players) {
    if (!p.alive) continue;
    if (p.burn > 0) {
      const burnDt = Math.min(dt, p.burn);
      damage(room, p, (p.burnDps || 0) * burnDt, p.burnTeam || 0);
      p.burn -= burnDt;
      if (p.burn <= 0) { p.burn = 0; p.burnDps = 0; }
      if (!p.alive) continue;
    }
    const i = p.input || {};
    let x = (i.right ? 1 : 0) - (i.left ? 1 : 0);
    let y = (i.down ? 1 : 0) - (i.up ? 1 : 0);
    const n = Math.hypot(x, y);
    if (n) { x /= n; y /= n; }
    p.vx += x * 660 * dt;
    p.vy += y * 660 * dt;
    const speed = Math.hypot(p.vx, p.vy);
    if (speed > 245) { p.vx = p.vx / speed * 245; p.vy = p.vy / speed * 245; }
    const drag = Math.pow(0.003, dt);
    p.vx *= drag; p.vy *= drag;
    p.x = clamp(p.x + p.vx * dt, 26, WORLD.width - 26);
    p.y = clamp(p.y + p.vy * dt, 26, WORLD.height - 26);
    const enemy = nearestEnemy(room, p);
    if (enemy) p.angle = Math.atan2(enemy.y - p.y, enemy.x - p.x);
    p.damageBoost = Math.max(0, p.damageBoost - dt);
    p.ammoClock += dt;
    while (p.ammo < 6 && p.ammoClock >= 1) { p.ammo++; p.ammoClock -= 1; }
    if (p.ammo >= 6) p.ammoClock = 0;
  }
  for (let j = room.bullets.length - 1; j >= 0; j--) {
    const b = room.bullets[j];
    b.life -= dt;
    if (b.kind === "laser") { if (b.life <= 0) room.bullets.splice(j, 1); continue; }
    b.x += b.vx * dt; b.y += b.vy * dt;
    const target = room.players.find(p => p.team !== b.team && p.alive && Math.hypot(p.x - b.x, p.y - b.y) < 20);
    if (target) {
      damage(room, target, b.damage, b.team);
      room.bullets.splice(j, 1);
      continue;
    }
    if (b.life <= 0 || b.x < -40 || b.x > WORLD.width + 40 || b.y < -40 || b.y > WORLD.height + 40) room.bullets.splice(j, 1);
  }
  if (now - room.lastPickup > 7500 && room.pickups.length < 3) {
    room.lastPickup = now;
    const type = Math.random() < 0.5 ? "shield" : "boost";
    room.pickups.push({
      id: room.nextPickup++, type,
      x: 70 + Math.random() * (WORLD.width - 140), y: -25,
      vx: (Math.random() - 0.5) * 35, vy: 45 + Math.random() * 25,
      angle: Math.random() * Math.PI, life: 12
    });
  }
  for (let j = room.pickups.length - 1; j >= 0; j--) {
    const item = room.pickups[j];
    item.y += item.vy * dt; item.x += item.vx * dt; item.angle += dt;
    item.life -= dt;
    const p = room.players.find(p => p.alive && Math.hypot(p.x - item.x, p.y - item.y) < 30);
    if (p) {
      if (item.type === "shield") p.shield = Math.min(60, p.shield + 35);
      else p.damageBoost = Math.max(p.damageBoost, 7);
      room.pickups.splice(j, 1);
    } else if (item.life <= 0 || item.y > WORLD.height + 30) room.pickups.splice(j, 1);
  }
}
setInterval(() => {
  const now = Date.now();
  for (const room of rooms.values()) {
    updateRoom(room, TICK_MS / 1000, now);
    snap(room);
  }
}, TICK_MS);

server.listen(PORT, HOST, () => console.log(`NEON DUEL v2 listening on ${HOST}:${PORT}`));
