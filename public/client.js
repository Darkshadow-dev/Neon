(() => {
"use strict";
const $ = id => document.getElementById(id);
const canvas = $("game"), ctx = canvas.getContext("2d");
let ws = null, roomCode = "", mode = "1v1", slot = 0, team = 1, ship = "bolt", ready = false;
let world = { width: 1000, height: 620 };
let snapshot = { state: "lobby", players: [], bullets: [], pickups: [] };
let held = { up: false, down: false, left: false, right: false };
const manualHeld = { up: false, down: false, left: false, right: false };
const tiltHeld = { up: false, down: false, left: false, right: false };
let tiltEnabled = false, tiltBase = null;
let stars = [], w = 800, h = 496, dpr = 1, chargeStart = 0, charging = false, lastCharge = 0;
let keyFireStart = 0;
function serverAddress() {
  if (location.protocol === "https:") return "wss://" + location.host;
  if (location.protocol === "http:" && location.host) return "ws://" + location.host;
  return "ws://127.0.0.1:8080";
}
function setConnection(text, online) {
  $("connection").textContent = text;
  $("connDot").parentElement.classList.toggle("online", !!online);
}
function showError(text) { $("lobbyError").textContent = text || ""; }
function connectSocket(onReady) {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
    if (ws.readyState === WebSocket.OPEN) onReady();
    else ws.addEventListener("open", onReady, { once: true });
    return;
  }
  ws = new WebSocket(serverAddress());
  setConnection("CONNECTING", false);
  ws.onopen = () => { setConnection("ONLINE", true); onReady(); };
  ws.onmessage = event => {
    let m; try { m = JSON.parse(event.data); } catch { return; }
    if (m.type === "error") { showError(m.message); $("message").textContent = m.message; return; }
    if (m.type === "welcome") {
      slot = m.slot; team = m.team; roomCode = m.code; mode = m.mode; ship = m.ship || "bolt";
      $("roomTitle").innerHTML = `ROOM <span>${roomCode}</span>`;
      $("modeBadge").textContent = mode.toUpperCase();
      $("lobby").classList.add("hidden"); $("gameShell").classList.remove("hidden");
      $("shipPicker").classList.remove("hidden");
      showError(""); selectShipCard(ship); resize();
    }
    if (m.type === "room") {
      roomCode = m.code; mode = m.mode;
      $("roomTitle").innerHTML = `ROOM <span>${roomCode}</span>`;
      $("modeBadge").textContent = mode.toUpperCase();
      $("playersCount").textContent = `${m.players.length} / ${m.maxPlayers} PILOTS`;
      const blue = m.players.filter(p => p.team === 1).map(p => `${p.name} [${p.ship === "laser" ? "LASER" : "BOLT"}]`);
      const red = m.players.filter(p => p.team === 2).map(p => `${p.name} [${p.ship === "laser" ? "LASER" : "BOLT"}]`);
      $("blueRoster").textContent = blue.join(" · ") || "Waiting for pilots";
      $("redRoster").textContent = red.join(" · ") || "Waiting for rivals";
      const mine = m.players.find(p => p.slot === slot);
      if (mine) {
        ship = mine.ship || ship; ready = !!mine.ready; selectShipCard(ship);
        $("shipStatus").textContent = ready ? "READY — waiting for the other pilots." : "Choose a frame, then ready up.";
        $("readyButton").textContent = ready ? "CANCEL READY" : "READY UP ↗";
      }
      const canChoose = m.state === "lobby";
      $("shipPicker").classList.toggle("hidden", !canChoose);
    }
    if (m.type === "status") {
      $("state").textContent = (m.state || "lobby").toUpperCase();
      $("message").textContent = m.message || "";
      $("overlayTitle").textContent = m.state === "playing" ? "COMBAT LIVE" : m.state === "ended" ? "ROUND COMPLETE" : "ROOM READY";
      $("overlay").classList.toggle("hidden", m.state === "playing");
      $("shipPicker").classList.toggle("hidden", m.state !== "lobby");
      $("restart").classList.toggle("hidden", !(m.state === "ended" && slot === 1));
    }
    if (m.type === "state") {
      snapshot = m; world = m.world || world;
      $("state").textContent = (m.state || "lobby").toUpperCase();
      const me = m.players.find(p => p.slot === slot);
      if (me) {
        $("hpText").textContent = `${Math.ceil(me.hp)} / ${me.maxHp} HP`;
        $("hpBar").style.width = `${Math.max(0, me.hp / me.maxHp * 100)}%`;
        $("weaponName").textContent = me.ship === "laser" ? "PHANTOM LASER" : "BOLT CANNON";
        $("weaponDescription").textContent = me.ship === "laser" ? "Low hull. Burns targets over time; full charge is lethal." : "Strong hull. Fast bolts deal 18–43 damage when charged.";
        $("shieldBar").style.width = `${Math.min(100, me.shield / 60 * 100)}%`;
        $("myLabel").textContent = me.name.toUpperCase();
        $("boostText").textContent = me.damageBoost > 0 ? `DAMAGE BOOST ${me.damageBoost.toFixed(1)}s` : me.shield > 0 ? `SHIELD ${Math.ceil(me.shield)}` : "NO BOOST";
        $("ammo").innerHTML = "● ".repeat(me.ammo) + "○ ".repeat(6 - me.ammo) + `<small>${me.ammo}/6</small>`;
      }
      $("overlay").classList.toggle("hidden", m.state === "playing");
      $("shipPicker").classList.toggle("hidden", m.state !== "lobby");
      if (m.state === "ended") {
        $("overlayTitle").textContent = m.winner === team ? "VICTORY" : "DEFEAT";
        $("message").textContent = mode === "1v1" ? `PLAYER ${m.winner} WINS` : `TEAM ${m.winner} WINS`;
        $("restart").classList.toggle("hidden", slot !== 1);
      }
    }
  };
  ws.onclose = () => {
    setConnection("OFFLINE", false);
    if (!$("gameShell").classList.contains("hidden")) {
      $("overlay").classList.remove("hidden");
      $("overlayTitle").textContent = "CONNECTION LOST";
      $("message").textContent = "Reconnect to the server and create or join a room again.";
    }
    Object.keys(held).forEach(k => { held[k] = false; manualHeld[k] = false; tiltHeld[k] = false; });
  };
  ws.onerror = () => { setConnection("CONNECTION ERROR", false); showError("Cannot reach game server. Try again."); };
}
function send(obj) {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
}
function createRoom() {
  showError("");
  connectSocket(() => send({ type: "create", mode, name: $("pilotName").value.trim().slice(0,18) || "Pilot" }));
}
function joinRoom() {
  showError("");
  const code = $("roomCode").value.trim().toUpperCase();
  if (!/^[A-Z0-9]{6}$/.test(code)) { showError("Enter the 6-character room code."); return; }
  connectSocket(() => send({ type: "join", code, name: $("pilotName").value.trim().slice(0,18) || "Pilot" }));
}
$("createRoom").addEventListener("click", createRoom);
$("joinRoom").addEventListener("click", joinRoom);
$("roomCode").addEventListener("input", () => { $("roomCode").value = $("roomCode").value.toUpperCase().replace(/[^A-Z0-9]/g,"").slice(0,6); });
$("roomCode").addEventListener("keydown", e => { if (e.key === "Enter") joinRoom(); });
document.querySelectorAll("[data-mode]").forEach(b => b.addEventListener("click", () => {
  mode = b.dataset.mode; document.querySelectorAll("[data-mode]").forEach(x => x.classList.toggle("selected", x === b));
}));
function selectShipCard(type) {
  ship = type === "laser" ? "laser" : "bolt";
  document.querySelectorAll("[data-ship]").forEach(card => card.classList.toggle("selected", card.dataset.ship === ship));
}
document.querySelectorAll("[data-ship]").forEach(card => {
  card.addEventListener("click", () => {
    if (ready) return;
    selectShipCard(card.dataset.ship);
    send({ type: "chooseShip", ship });
    $("shipStatus").textContent = `${ship === "laser" ? "PHANTOM LASER" : "BOLT RUNNER"} selected. Press READY UP.`;
  });
});
$("readyButton").addEventListener("click", () => {
  ready = !ready;
  send({ type: "ready", ready });
  $("readyButton").textContent = ready ? "CANCEL READY" : "READY UP ↗";
  $("shipStatus").textContent = ready ? "READY — waiting for the other pilots." : "Not ready. Choose your frame.";
});
$("fullscreen").addEventListener("click", async () => {
  try {
    if (!document.fullscreenElement) {
      const target = document.documentElement;
      if (target.requestFullscreen) await target.requestFullscreen();
      if (screen.orientation && screen.orientation.lock) screen.orientation.lock("landscape").catch(() => {});
      $("fullscreen").textContent = "EXIT FULL";
    } else {
      await document.exitFullscreen();
      $("fullscreen").textContent = "FULLSCREEN";
    }
  } catch { $("fullscreen").textContent = "USE BROWSER FULLSCREEN"; }
});
document.addEventListener("fullscreenchange", () => {
  $("fullscreen").textContent = document.fullscreenElement ? "EXIT FULL" : "FULLSCREEN";
  setTimeout(resize, 150);
});
async function enableTilt() {
  if (typeof DeviceOrientationEvent === "undefined") { $("tiltToggle").textContent = "TILT UNSUPPORTED"; return; }
  try {
    if (typeof DeviceOrientationEvent.requestPermission === "function") {
      const permission = await DeviceOrientationEvent.requestPermission();
      if (permission !== "granted") throw new Error("Motion permission denied");
    }
    tiltEnabled = true; tiltBase = null;
    $("tiltToggle").textContent = "TILT: ON";
    window.addEventListener("deviceorientation", onTilt, true);
  } catch { $("tiltToggle").textContent = "TILT BLOCKED"; }
}
function onTilt(event) {
  if (!tiltEnabled || event.gamma == null || event.beta == null) return;
  if (!tiltBase) { tiltBase = { gamma: event.gamma, beta: event.beta }; return; }
  const gx = event.gamma - tiltBase.gamma, by = event.beta - tiltBase.beta;
  tiltHeld.left = gx < -8; tiltHeld.right = gx > 8;
  tiltHeld.up = by < -8; tiltHeld.down = by > 8;
  Object.keys(held).forEach(k => held[k] = manualHeld[k] || tiltHeld[k]);
  sendInput();
}
$("tiltToggle").addEventListener("click", () => {
  if (tiltEnabled) {
    tiltEnabled = false; tiltBase = null;
    window.removeEventListener("deviceorientation", onTilt, true);
    Object.keys(tiltHeld).forEach(k => tiltHeld[k] = false);
    Object.keys(held).forEach(k => held[k] = manualHeld[k]);
    $("tiltToggle").textContent = "TILT: OFF"; sendInput();
  } else enableTilt();
});

$("copyCode").addEventListener("click", async () => {
  try { await navigator.clipboard.writeText(roomCode); $("copyCode").textContent = "COPIED!"; }
  catch { $("copyCode").textContent = roomCode; }
  setTimeout(() => $("copyCode").textContent = "COPY CODE", 1500);
});
$("leaveRoom").addEventListener("click", () => {
  if (ws) ws.close();
  ws = null; slot = 0; roomCode = "";
  $("gameShell").classList.add("hidden"); $("lobby").classList.remove("hidden");
  snapshot = { state: "lobby", players: [], bullets: [], pickups: [] };
  setConnection("OFFLINE", false);
});
$("restart").addEventListener("click", () => send({ type: "restart" }));
function sendInput() { send({ type: "input", input: held }); }
function setMove(key, value, button) {
  manualHeld[key] = value;
  held[key] = manualHeld[key] || tiltHeld[key];
  if (button) button.classList.toggle("active", value);
  sendInput();
}
document.querySelectorAll("[data-move]").forEach(button => {
  const key = button.dataset.move;
  const down = e => {
    e.preventDefault(); setMove(key, true, button);
    try { button.setPointerCapture(e.pointerId); } catch {}
  };
  const up = e => { e.preventDefault(); setMove(key, false, button); };
  button.addEventListener("pointerdown", down);
  ["pointerup","pointercancel","lostpointercapture"].forEach(ev => button.addEventListener(ev, up));
});
function startCharge(e) {
  e.preventDefault();
  if (charging) return;
  charging = true; chargeStart = performance.now();
  $("fire").classList.add("charging");
  $("chargeText").textContent = "CHARGING";
  try { $("fire").setPointerCapture(e.pointerId); } catch {}
}
function releaseCharge(e) {
  if (e) e.preventDefault();
  if (!charging) return;
  charging = false;
  const charge = Math.max(0, Math.min(1, (performance.now() - chargeStart) / 1400));
  lastCharge = charge;
  send({ type: "shoot", charge });
  $("fire").classList.remove("charging");
  $("chargeText").textContent = charge > .75 ? "MAX SHOT" : charge > .25 ? "CHARGED" : "QUICK SHOT";
  $("chargeBar").style.width = "0%";
  setTimeout(() => { if (!charging) $("chargeText").textContent = "READY"; }, 650);
}
const fireButton = $("fire");
fireButton.addEventListener("pointerdown", startCharge);
["pointerup","pointercancel","lostpointercapture"].forEach(ev => fireButton.addEventListener(ev, releaseCharge));
const keys = { ArrowUp:"up", KeyW:"up", ArrowDown:"down", KeyS:"down", ArrowLeft:"left", KeyA:"left", ArrowRight:"right", KeyD:"right" };
window.addEventListener("keydown", e => {
  if (keys[e.code] && !$("lobby").contains(document.activeElement)) { e.preventDefault(); setMove(keys[e.code], true); }
  if (e.code === "Space" && !$("lobby").contains(document.activeElement) && !e.repeat) {
    e.preventDefault(); keyFireStart = performance.now(); charging = true; chargeStart = keyFireStart;
  }
});
window.addEventListener("keyup", e => {
  if (keys[e.code]) { e.preventDefault(); setMove(keys[e.code], false); }
  if (e.code === "Space" && charging && keyFireStart) {
    e.preventDefault(); charging = true; releaseCharge(e); keyFireStart = 0;
  }
});
window.addEventListener("blur", () => {
  Object.keys(held).forEach(k => { held[k] = false; manualHeld[k] = false; tiltHeld[k] = false; });
  document.querySelectorAll(".active").forEach(b => b.classList.remove("active"));
  sendInput();
  if (charging) releaseCharge();
});
function resize() {
  const rect = canvas.getBoundingClientRect();
  if (!rect.width) return;
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  w = rect.width; h = rect.height;
  canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  stars = Array.from({ length: Math.max(50, Math.floor(w * h / 4500)) }, () => ({
    x: Math.random() * w, y: Math.random() * h, s: Math.random() * 1.7 + .3, a: Math.random() * .55 + .12, drift: .2 + Math.random() * .9
  }));
}
function roundedShip(p, x, y, scale) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(p.angle || 0); ctx.scale(scale, scale);
  const color = p.team === 1 ? "#54f4ff" : "#ff4d9d";
  ctx.shadowBlur = 18; ctx.shadowColor = color; ctx.strokeStyle = color; ctx.lineWidth = 1.8;
  ctx.fillStyle = p.alive ? (p.team === 1 ? "#0d3447" : "#3a142d") : "#293147";
  ctx.beginPath();
  if (p.ship === "laser") {
    ctx.moveTo(27,0); ctx.lineTo(5,-5); ctx.lineTo(-3,-13); ctx.lineTo(-1,-4); ctx.lineTo(-18,-9); ctx.lineTo(-11,0); ctx.lineTo(-18,9); ctx.lineTo(-1,4); ctx.lineTo(-3,13); ctx.lineTo(5,5); ctx.closePath();
  } else {
    ctx.moveTo(24,0); ctx.lineTo(6,-9); ctx.lineTo(-8,-17); ctx.lineTo(-5,-5); ctx.lineTo(-14,0); ctx.lineTo(-5,5); ctx.lineTo(-8,17); ctx.lineTo(6,9); ctx.closePath();
  }
  ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(p.ship === "laser" ? 14 : 8,0); ctx.lineTo(-5,-4); ctx.lineTo(-3,0); ctx.lineTo(-5,4); ctx.closePath(); ctx.fillStyle = color; ctx.fill();
  ctx.strokeStyle = "#d8fbff"; ctx.lineWidth = 1; ctx.beginPath();
  if (p.ship === "laser") { ctx.moveTo(-3,-6); ctx.lineTo(-14,-15); ctx.moveTo(-3,6); ctx.lineTo(-14,15); }
  else { ctx.moveTo(-8,-7); ctx.lineTo(-17,-12); ctx.moveTo(-8,7); ctx.lineTo(-17,12); }
  ctx.stroke();
  if (p.shield > 0) {
    ctx.rotate(-(p.angle || 0)); ctx.strokeStyle = "#8291ff"; ctx.globalAlpha = .5 + Math.sin(performance.now()/100)*.2; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0,0,27,0,Math.PI*2); ctx.stroke();
  }
  if (p.damageBoost > 0) { ctx.rotate(-(p.angle || 0)); ctx.strokeStyle = "#ffe47b"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0,0,31,performance.now()/200,performance.now()/200+Math.PI*1.3); ctx.stroke(); }
  ctx.restore();
}
function draw() {
  if (!w || !h) return;
  ctx.clearRect(0,0,w,h);
  const bg = ctx.createLinearGradient(0,0,w,h); bg.addColorStop(0,"#060d1b"); bg.addColorStop(.55,"#070a17"); bg.addColorStop(1,"#10091d");
  ctx.fillStyle = bg; ctx.fillRect(0,0,w,h);
  const glow = ctx.createRadialGradient(w*.5,h*.5,10,w*.5,h*.5,Math.max(w,h)*.7); glow.addColorStop(0,"#183f5c55"); glow.addColorStop(1,"#03050c00"); ctx.fillStyle=glow;ctx.fillRect(0,0,w,h);
  ctx.strokeStyle="#54f4ff0b";ctx.lineWidth=1;
  const grid=36; for(let x=0;x<w;x+=grid){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,h);ctx.stroke()}for(let y=0;y<h;y+=grid){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke()}
  ctx.save();ctx.strokeStyle="#6887b22a";ctx.setLineDash([3,10]);ctx.beginPath();ctx.moveTo(w/2,0);ctx.lineTo(w/2,h);ctx.stroke();ctx.restore();
  for(const s of stars){s.y+=s.drift*.25;if(s.y>h)s.y=0;ctx.globalAlpha=s.a;ctx.fillStyle="#c7f7ff";ctx.fillRect(s.x,s.y,s.s,s.s)}ctx.globalAlpha=1;
  // Floating angular debris and orbital lanes
  for(let i=0;i<5;i++){ctx.strokeStyle=i%2?"#ff4d9d12":"#54f4ff12";ctx.beginPath();ctx.ellipse(w*.5,h*.5,w*(.15+i*.075),h*(.11+i*.055),-.12,0,Math.PI*2);ctx.stroke()}
  for(const item of snapshot.pickups||[]){
    const x=item.x/world.width*w,y=item.y/world.height*h;ctx.save();ctx.translate(x,y);ctx.rotate(item.angle||0);const color=item.type==="shield"?"#7b8dff":"#ffe47b";ctx.shadowBlur=18;ctx.shadowColor=color;ctx.fillStyle="#111a30";ctx.strokeStyle=color;ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(0,-12);ctx.lineTo(12,0);ctx.lineTo(0,12);ctx.lineTo(-12,0);ctx.closePath();ctx.fill();ctx.stroke();ctx.rotate(-(item.angle||0));ctx.fillStyle=color;ctx.font="bold 12px Orbitron";ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText(item.type==="shield"?"S":"+",0,0);ctx.restore();
  }
  for(const b of snapshot.bullets||[]){
    const x=b.x/world.width*w,y=b.y/world.height*h;ctx.save();ctx.strokeStyle=b.color;ctx.shadowBlur=18;ctx.shadowColor=b.color;ctx.lineWidth=b.kind==="laser"?5:3;ctx.lineCap="round";ctx.beginPath();
    if(b.kind==="laser"){ctx.moveTo(x,y);ctx.lineTo(b.x2/world.width*w,b.y2/world.height*h)}else{ctx.moveTo(x-b.vx*.025/world.width*w,y-b.vy*.025/world.height*h);ctx.lineTo(x,y)}ctx.stroke();ctx.restore();
  }
  for(const p of snapshot.players||[]){
    const x=p.x/world.width*w,y=p.y/world.height*h;roundedShip(p,x,y,Math.min(1,w/800));
    ctx.save();ctx.font="700 10px Orbitron";ctx.textAlign="center";ctx.fillStyle=p.team===1?"#8ffaff":"#ff9cc8";ctx.fillText(p.name||`P${p.slot}`,x,y-28);
    ctx.fillStyle="#25304a";ctx.fillRect(x-20,y-23,40,3);ctx.fillStyle=p.team===1?"#54f4ff":"#ff4d9d";ctx.fillRect(x-20,y-23,40*Math.max(0,p.hp/(p.maxHp||100)),3);ctx.restore();
  }
}
function loop() {
  if (charging) {
    const amount = Math.max(0,Math.min(1,(performance.now()-chargeStart)/1400));
    $("chargeBar").style.width = `${amount*100}%`;
    $("chargeText").textContent = amount >= 1 ? "MAX POWER" : `${Math.round(amount*100)}%`;
  }
  if (ws && ws.readyState === WebSocket.OPEN && slot) sendInput();
  draw(); requestAnimationFrame(loop);
}
window.addEventListener("resize", resize);
resize();
setConnection("READY", false);
requestAnimationFrame(loop);
})();