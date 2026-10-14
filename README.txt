NEON DUEL REMOTE MULTIPLAYER
=============================

Real two-human-player WebSocket prototype. Server owns movement, shots, health and winner.
Files: server.js, package.json, public/index.html, public/style.css, public/client.js.

ANDROID HOST (Termux)
1. Install Termux from its official F-Droid or GitHub source.
2. In Termux:
   pkg update
   pkg upgrade
   pkg install nodejs
   termux-setup-storage
3. Copy/extract this folder in Termux storage, then cd into neon_duel_remote.
4. Run:
   npm install
   npm start
5. On the host phone open http://127.0.0.1:8080.

LAN TEST
Find the phone's Wi-Fi IP in Android network details. Another device on the same Wi-Fi opens
http://PHONE-LAN-IP:8080. To connect manually, use ws://PHONE-LAN-IP:8080.
This only works on the same network, unless the router/network permits other access.

REMOTE INTERNET
A phone on mobile data or home Wi-Fi is commonly behind NAT/CGNAT; a private address like
192.168.x.x cannot be reached from the internet. You need ONE of:
- Private mesh VPN installed on host and players; connect using host's VPN IP. Usually safest/easiest.
- Secure TCP/WebSocket tunnel that provides a public endpoint.
- Public IP plus router port forwarding to the phone (often impossible on carrier mobile data).
For public browser play, host the page over HTTPS and connect via WSS. This server has no built-in TLS.
Use a reputable tunnel/reverse proxy that terminates TLS, or a WSS-capable VPN/reverse proxy.
Do not expose plain ws:// to the public internet.

OPTIONAL TOKEN
Set NEON_DUEL_TOKEN to a long random secret before running the server. WebSocket clients must use
ws://host:8080/?token=SECRET (or wss://...). This is a simple shared-secret gate, not full authentication;
URLs can leak in logs. Don't treat it as production security.

ANDROID
Keep Termux running; battery optimization can stop it. Test with screen on. `termux-wake-lock`
may help if the relevant Termux add-on is installed. Android background execution is not guaranteed.

RULES
Two connected clients; blue is Player 1, red is Player 2. Controls are touch pad and hold FIRE, or
WASD/arrows and Space. Auto-aim points toward the opponent. Hits do 10 damage.

SECURITY / LIMITATIONS
Educational prototype only: no TLS, user accounts, robust auth, rate limiting, anti-cheat or reconnect
recovery. The server limits to two players and WebSocket payloads to 2048 bytes. For public hosting,
add TLS/WSS, authentication, Origin checks, rate limits, monitoring and robust abuse handling.
