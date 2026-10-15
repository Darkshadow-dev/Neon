# NEON DUEL Online v2.1

Room-based multiplayer space duel for desktop and mobile browsers. Node.js + WebSocket, with server-authoritative movement, damage, ammunition and pickups.

## Features
- Private six-character room codes
- 1v1 and 2v2 team modes
- Choose one of two ship frames in the room lobby, then press READY
- Bolt Runner: 100 HP, charged projectile damage (18–43 before boosts)
- Phantom Laser: 72 HP, lower initial damage plus damage-over-time; a fully charged laser is lethal
- Six-round magazine; one round regenerates per second
- Hold and release FIRE to charge your ship's own weapon
- Falling pickups: shield or temporary damage boost
- Mobile touch buttons, optional phone tilt movement, and fullscreen/landscape request
- Mobile buttons and labels cannot be selected as text
- Render-ready: listens on `process.env.PORT`

## Run locally
```sh
npm install
npm start
```
Open `http://localhost:8080`.

## Deploy on Render
- Create a Web Service from this repository.
- Build command: `npm install`
- Start command: `npm start`
- Root directory: leave blank.
- Render assigns `PORT` automatically.

The server runs the game logic and must stay online for remote multiplayer. Rooms are held in memory, so a server restart clears active rooms. Do not commit `node_modules`.
