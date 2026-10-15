# NEON DUEL Online — v3.0

A server-authoritative real-time multiplayer arena game built with Node.js, WebSockets, HTML, CSS and Canvas. Designed for desktop and mobile browsers.

## What's included

- Public room directory with live refresh and private rooms joined by a six-character code.
- Username and room name, public/private visibility, host-controlled map/mode/team size/timer/pickup/bot settings.
- Four ships: Bolt Runner, Phantom Laser, Reactor Warden and Dash Wraith.
- Three maps: Open Grid, Broken Bastion (destructible cover with visible HP), and The Labyrinth.
- Three modes: Elimination, Neon Ball (1v1, 2v2 or 4v4; carry the ball into the goal), and Capture the Flag.
- 60, 90, 120 or 180 second match timers; team score and win-state HUD.
- Optional bots to fill unoccupied slots when the host starts a room.
- Keyboard, touch controls, charge-to-fire, mobile fullscreen and optional phone tilt.
- Mobile responsive UI, with a simpler low-clutter arena.

## Run locally

Requirements: Node.js 18 or newer.

```bash
npm install
npm start
```

Open `http://localhost:8080` on the host computer. To play on the same Wi-Fi/hotspot, open `http://HOST-LAN-IP:8080` on another device. Allow Node.js through the computer firewall on private networks.

## Deploy to Render

- Push these files to the repository root. `server.js` and `package.json` belong in the root; `index.html`, `style.css`, and `client.js` belong in `public/`.
- Use a **Web Service** with build command `npm install` and start command `npm start`.
- Render provides `PORT`; the server reads it automatically and binds to `0.0.0.0`.
- Use the HTTPS Render URL; the browser automatically uses secure WebSockets (`wss://`).

## Room flow

1. Enter a username and create a room, or join a listed public room / enter a private room code.
2. Choose a ship and press READY. If the host enabled bots, the host can ready to fill vacant slots and start with bots. Without bots, all slots must be filled and players must ready.
3. The creator can change settings while in the lobby. Room code is shown in the heading and can be copied.

## Ship roster

- **Bolt Runner** — 100 HP, balanced chargeable projectiles.
- **Phantom Laser** — 72 HP, beam attack and damage-over-time effect.
- **Reactor Warden** — 125 HP, slowly recharging energy; incoming damage partly feeds/reflects through its energy system and energy boosts its next shot.
- **Dash Wraith** — 55 HP, high movement speed, low-damage two-round magazine and dash ability (Shift / mobile DASH).

## Maps and objectives

- **Open Grid** — open arena.
- **Broken Bastion** — cover walls show their remaining durability and can be destroyed by fire.
- **The Labyrinth** — multiple corridors and chokepoints; walls can be damaged.
- **Elimination** — defeat the opposing team.
- **Neon Ball** — pick up the ball and carry it into the opposing goal.
- **Capture the Flag** — take the enemy flag and bring it to your home flag.

## Notes / current test scope

This is a substantial playable v3 foundation, not a professionally balanced release. The first test pass should focus on two-browser connection, room list visibility, room settings, reconnect/leave behavior, wall collisions, bots, scoring and mobile input. Room state is held in memory and resets if the server restarts; public rooms disappear when their server process is restarted. A production public server would need persistent identities, rate limits, moderation/reporting, and stronger matchmaking/anti-cheat protections.
