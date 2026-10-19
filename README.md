# NEON DUEL Online — Chat Remake

## Run
1. Install Node.js 18+.
2. Open a terminal in this folder.
3. Run `npm install`
4. Run `npm start`
5. Open `http://localhost:8080`. For two-device LAN tests, use the laptop's local IP address on the other device.

## Render
Use a Web Service with build command `npm install` and start command `npm start`. Render supplies the `PORT` variable.

## Storage rules
- Callsign and ship color are stored in browser `localStorage`.
- Friend list is stored in browser `localStorage`.
- Friend DM history is stored locally, limited to the last 300 messages per friend.
- Global chat is never written to localStorage and is not stored by the server. It is live-only and disappears on reload/disconnect.
- The recipient must be online for a new DM; this server does not queue offline messages.
- Local storage does not sync across devices and is not a verified account.

## Prototype limitations
Two-player rooms, canvas arena, movement, shooting, health, global chat, and direct messages are included. This is a prototype: hit detection and room state are not suitable for competitive/anti-cheat use without further server-authoritative validation and rate limits.
