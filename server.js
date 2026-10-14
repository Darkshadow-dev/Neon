const http=require("http"),fs=require("fs"),path=require("path"),crypto=require("crypto"),WebSocket=require("ws");
const HOST="0.0.0.0",PORT=Number(process.env.PORT||8080),DIR=path.join(__dirname,"public"),TOKEN=process.env.NEON_DUEL_TOKEN||"";
const W={width:900,height:560},clients=new Map(),MAX=2,TICK=50;
let players=[],bullets=[],state="waiting",winner=null,bid=1,last=Date.now();
const mime={".html":"text/html; charset=utf-8",".css":"text/css; charset=utf-8",".js":"text/javascript; charset=utf-8"};
const app=http.createServer((q,s)=>{if(!["GET","HEAD"].includes(q.method)){s.writeHead(405);return s.end("Method not allowed")}
 let u;try{u=decodeURIComponent(new URL(q.url,"http://localhost").pathname)}catch{return s.writeHead(400).end()}
 if(u==="/")u="/index.html";const f=path.resolve(DIR,"."+u);if(!f.startsWith(DIR+path.sep)){s.writeHead(403).end();return}
 fs.readFile(f,(e,d)=>{if(e){s.writeHead(404).end("Not found");return}s.writeHead(200,{"Content-Type":mime[path.extname(f)]||"application/octet-stream","Cache-Control":"no-store","X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer","Content-Security-Policy":"default-src 'self'; connect-src 'self' ws: wss:; style-src 'self' 'unsafe-inline'; script-src 'self'; base-uri 'none'; frame-ancestors 'none'"});s.end(q.method==="HEAD"?undefined:d)})});
const wss=new WebSocket.Server({noServer:true,maxPayload:2048});
function send(ws,x){if(ws.readyState===1)ws.send(JSON.stringify(x))}
function broadcast(x){const d=JSON.stringify(x);for(const ws of clients.keys())if(ws.readyState===1)ws.send(d)}
function player(id,x,y,color,angle){return{id,x,y,vx:0,vy:0,color,angle,hp:100,alive:true,cool:0}}
function reset(){players=[player(1,180,280,"#39d7ff",0),player(2,720,280,"#ff426f",Math.PI)];bullets=[];winner=null;state=clients.size===2?"playing":"waiting";for(const c of clients.values()){c.input={};c.cool=0}}
function snap(){broadcast({type:"state",state,winner,world:W,players:players.map(p=>({...p})),bullets:bullets.map(b=>({...b}))})}
app.on("upgrade",(req,sock,head)=>{if(TOKEN){const t=new URL(req.url,"http://localhost").searchParams.get("token")||"";if(t!==TOKEN){sock.write("HTTP/1.1 401 Unauthorized\r\n\r\n");return sock.destroy()}}
 if(clients.size>=MAX){sock.write("HTTP/1.1 503 Service Unavailable\r\n\r\n");return sock.destroy()}
 wss.handleUpgrade(req,sock,head,ws=>wss.emit("connection",ws,req))});
wss.on("connection",ws=>{if(clients.size>=MAX)return ws.close();const used=[...clients.values()].map(c=>c.slot),slot=used.includes(1)?2:1;const c={id:crypto.randomBytes(8).toString("hex"),slot,input:{},cool:0};clients.set(ws,c);send(ws,{type:"welcome",slot,world:W});if(clients.size===2){reset();broadcast({type:"status",state,message:"Both players connected. Duel started!"})}else{state="waiting";broadcast({type:"status",state,message:"Waiting for player 2 to connect..."})}snap();
 ws.on("message",raw=>{let m;try{m=JSON.parse(raw)}catch{return}if(!m||typeof m!=="object")return;if(m.type==="input"){const i=m.input||{};c.input={up:i.up===true,down:i.down===true,left:i.left===true,right:i.right===true,fire:i.fire===true}}if(m.type==="restart"&&clients.size===2){reset();broadcast({type:"status",state,message:"New duel started!"})}});
 ws.on("close",()=>{clients.delete(ws);if(clients.size<2){state="waiting";winner=null;bullets=[];broadcast({type:"status",state,message:"A player disconnected. Waiting for both players..."})}snap()});ws.on("error",()=>{})});
function clamp(n,a,b){return Math.max(a,Math.min(b,n))}
function shoot(p){const a=p.angle,s=470;bullets.push({id:bid++,owner:p.id,x:p.x+Math.cos(a)*22,y:p.y+Math.sin(a)*22,vx:Math.cos(a)*s+p.vx*.15,vy:Math.sin(a)*s+p.vy*.15,life:1.5,color:p.color});if(bullets.length>100)bullets.shift()}
setInterval(()=>{const now=Date.now(),dt=clamp((now-last)/1000,0,.08);last=now;
 if(state==="playing"&&players.length===2&&clients.size===2){for(const p of players){const c=[...clients.values()].find(c=>c.slot===p.id);if(!c||!p.alive)continue;const i=c.input;let x=(i.right?1:0)-(i.left?1:0),y=(i.down?1:0)-(i.up?1:0),n=Math.hypot(x,y);if(n){x/=n;y/=n}p.vx+=x*700*dt;p.vy+=y*700*dt;let v=Math.hypot(p.vx,p.vy);if(v>235){p.vx=p.vx/v*235;p.vy=p.vy/v*235}const drag=Math.pow(.002,dt);p.vx*=drag;p.vy*=drag;p.x=clamp(p.x+p.vx*dt,20,W.width-20);p.y=clamp(p.y+p.vy*dt,20,W.height-20);const e=players.find(q=>q.id!==p.id);if(e)p.angle=Math.atan2(e.y-p.y,e.x-p.x);p.cool=Math.max(0,p.cool-dt);if(i.fire&&p.cool<=0){shoot(p);p.cool=.2}}
 for(let j=bullets.length-1;j>=0;j--){const b=bullets[j];b.x+=b.vx*dt;b.y+=b.vy*dt;b.life-=dt;const t=players.find(p=>p.id!==b.owner);if(t&&t.alive&&Math.hypot(b.x-t.x,b.y-t.y)<17){t.hp=Math.max(0,t.hp-10);bullets.splice(j,1);if(t.hp===0){t.alive=false;state="ended";winner=b.owner;broadcast({type:"status",state,winner,message:`Player ${winner} wins!`})}continue}if(b.life<=0||b.x< -30||b.x>W.width+30||b.y< -30||b.y>W.height+30)bullets.splice(j,1)}}
 snap()},TICK);
app.listen(PORT,HOST,()=>console.log(`NEON DUEL listening on http://${HOST}:${PORT}`));
