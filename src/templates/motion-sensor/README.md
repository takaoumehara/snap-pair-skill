# Motion / Sensor

Tilt and shake phones: DeviceOrientation and DeviceMotion steer things on the
big screen.

| | |
| --- | --- |
| Preset id | `motion-sensor` |
| Transports | **webrtc** (recommended), partykit, broadcast |
| Pairing | QR (default), room code, PIN |
| Room size | 2–16 (typical 4) |

## Files

- `src/Host.tsx`: one ball per phone, accelerated by tilt; shaking makes it flash.
- `src/Controller.tsx`: `ControllerWrapper` with `motion` (the iOS permission button) and a sensor stream.

## Messages

```ts
// controller -> host (sendToHost)
{ type: 'motion', payload: { beta: number; gamma: number; shake: number } } // degrees; shake 0..1
```

## Sensors and permissions

- **iOS 13+** only fires sensor events after `requestOrientationPermission()`
  runs inside a tap. `ControllerWrapper` renders that button when
  `needsPermission()` is true and passes `motionPermission` to its children.
- Sensors need a **secure context** (HTTPS). `npm run dev -- --host` serves
  plain HTTP on your LAN, which most phones treat as insecure; use a tunnel
  (e.g. `npx cloudflared tunnel --url http://localhost:5173`) or deploy to an
  HTTPS host to test on phones.
- Desktops usually expose the API but never fire events.

## Rate limits

Sensors fire at 60–100 Hz. The controller throttles to 30 messages per second
(a strong shake is sent immediately, within that budget) and the host smooths
with a low-pass filter.

## Run

```bash
npm install
npx partykit dev   # signaling for webrtc / relay for partykit
npm run dev
```
