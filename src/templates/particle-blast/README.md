# Particle Blast

Taps and swipes on phones fire particle bursts on the big screen. Built for
audience reactions: dozens to hundreds of phones in one room.

| | |
| --- | --- |
| Preset id | `particle-blast` |
| Transports | **partykit** (recommended), webrtc, broadcast |
| Pairing | QR (default), PIN, room code |
| Room size | 2–300 (typical 30) |

## Files

- `src/Host.tsx`: canvas particle system (requestAnimationFrame), capped at 2000 live particles.
- `src/Controller.tsx`: tap/swipe area; swipe speed becomes `power`.

## Messages

```ts
// controller -> host (sendToHost)
{ type: 'blast', payload: { x: number; y: number; power: number; hue: number } } // x, y, power in 0..1; hue 0..360
```

## Rate limits

Each phone sends at most 10 blasts per second (`throttle` in `src/snap.ts`).
The host clamps every value and caps the particle count, so 300 excited phones
cannot freeze the screen. Blasts are addressed to the host (`sendToHost`), so
phones don't receive each other's traffic. For big rooms prefer PartyKit: in a
WebRTC star the host's device holds one connection per phone.

## Run

```bash
npm install
npx partykit dev   # local relay on :1999 (partykit / webrtc only)
npm run dev
```
