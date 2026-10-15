# NEON DUEL Online v2

Room-based multiplayer space duel for desktop and mobile browsers. Node.js + WebSocket, with server-authoritative movement, damage, ammo and pickups.

## Features
- Private six-character room codes
- 1v1 and 2v2 team modes
- Two weapon types: charged bolt and charged laser
- Six-round magazine; one round regenerates per second
- Hold and release FIRE to charge a shot
- Falling pickups: shield or temporary damage boost
- Mobile touch controls plus WASD/arrow-key controls
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
- Render will assign `PORT` automatically.

The server runs the game logic and must stay online for remote multiplayer. Do not commit `node_modules`.
