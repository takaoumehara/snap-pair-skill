# Virtual Controller

Phones become gamepads (d-pad + A/B) for a game running on the big screen.

| | |
| --- | --- |
| Preset id | `virtual-controller` |
| Transports | **webrtc** (recommended, lowest latency), partykit, broadcast |
| Pairing | QR (default), room code, PIN |
| Room size | 2–8 (typical 4) |

## Files

- `src/Host.tsx`: each phone drives a dot; A makes it bigger, B brighter. Replace it with your game loop.
- `src/Controller.tsx`: landscape d-pad and A/B buttons inside `ControllerWrapper` (fullscreen + orientation lock button).

## Messages

```ts
// controller -> host (sendToHost)
{ type: 'input', payload: { seq: number; x: -1 | 0 | 1; y: -1 | 0 | 1; buttons: number } } // A = 1, B = 2
```

`seq` increases per phone, so the host drops out-of-order input. The host also
treats a phone that has been silent for 1 s as released, in case a "button up"
was lost.

## Rate limits

Send on change, capped at 60 per second, plus a keepalive every 200 ms while
something is held. WebRTC keeps input off the internet relay once connected,
and because input is addressed to the host (`sendToHost`), the host's device
does not forward it to the other phones.

## Run

```bash
npm install
npx partykit dev   # signaling for webrtc (and the relay for partykit)
npm run dev
```
