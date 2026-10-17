# NEON DUEL Online — v3.1

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


## v3.0.1 usability and physics fixes

- Match options are selected during room creation; there is no in-room settings panel.
- Neon Ball always uses Open Grid, enforced by both the lobby and server.
- Own hull is shown as a 0–100 percentage. Other pilots are shown with health bars only.
- Dash Wraith dashes with Shift on PC or the DASH touch button. It dashes in the current movement direction, or toward its facing direction if standing still.
- Buttons and combat controls disable text selection during mouse/touch play.
- Ball collisions with projectiles, laser beams and moving ships impart directional momentum; impacts can knock the ball loose from a carrier.

## v3.0.2 gameplay fixes
- Phantom Laser beams now remain visible long enough to render and resolve damage only once per shot.
- Reactor Warden has 160 HP and slightly improved speed; Dash Wraith has 65 HP, a 4-shot magazine, lower speed and two rechargeable dash charges.
- Added kill feed, after-action report (kills, deaths, matches played, match duration, score and damage dealt), host skip after 5 seconds, and automatic report close after 20 seconds.
- Rooms with bot fill enabled can accept players during a live match by replacing a bot. The incoming player chooses a ship and readies before taking control.
- Leave button is locked for 20 seconds after joining and again when a match starts.
- Destructible walls visibly change color and show cracks as their durability falls; labyrinth geometry has been revised.


## v3.1 social features

- Every browser player receives a numeric player ID starting at `0`, stored with a random browser token.
- Add friends by exact username or numeric ID; adding is mutual.
- Global leaderboard ranks player profiles by total score and then kills; bots are excluded.
- Six separate public chat channels: English, French, Turkish, Russian, Chinese and Indonesian. These are separate rooms, but messages are not language-filtered.
- Friends chat is visible only to the sender and their friends. No chat UI is present inside a game room.
- Chat history and profile stats are stored in `data/social.json` on the server. On a local server this survives restarts as long as the folder is kept. On Render, attach a persistent disk and store this file on that disk if IDs, stats and chat history must survive redeploys/restarts; an ephemeral filesystem can be reset.
- This first social version uses browser-stored identity tokens, not passwords or verified accounts. Clearing browser storage loses that browser's token unless the server-side token is recovered manually.
