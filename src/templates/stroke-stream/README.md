# Stroke Stream

Phones draw with a finger; strokes stream live onto a shared big screen.

| | |
| --- | --- |
| Preset id | `stroke-stream` |
| Transports | **webrtc** (recommended), partykit, broadcast |
| Pairing | QR (default), room code, PIN |
| Room size | 2–16 (typical 6) |

## Files

- `src/Host.tsx`: full-screen canvas; draws `stroke` batches, keyed by sender and stroke id, and can `clear`.
- `src/Controller.tsx`: drawing pad inside `ControllerWrapper`; batches pointer samples every 33 ms.
- `src/snap.ts`, `src/ui.tsx`, `src/main.tsx`: shared scaffold (transport from `snap-pair.config.json`, HostHUD, join form).

## Messages

```ts
// controller -> host (sendToHost: addressed, so other phones never receive it)
{ type: 'stroke', payload: { id: string; color: string; width: number; points: [x, y][]; end?: true } }
// host -> everyone
{ type: 'clear', payload: {} }
```

Points are normalized to 0..1 so screens of any size line up.

## Rate limits

Never send one message per `pointermove` (phones fire 60–120 per second).
The controller buffers points and flushes at most every 33 ms, 64 points per
message. The host clamps coordinates, widths, and colors because payloads come
from other devices.

## Run

```bash
npm install
npx partykit dev        # only for partykit / webrtc (signaling); skip for broadcast
npm run dev             # open the URL on the big screen; scan the QR code with a phone
```

With `transport: "broadcast"` everything runs in one browser: open the host,
then open the join link it shows in a second tab.
