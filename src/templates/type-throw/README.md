# Type Throw

Type a short message on a phone and flick it onto the shared screen: live
comments, Q&A walls, guestbooks.

| | |
| --- | --- |
| Preset id | `type-throw` |
| Transports | **partykit** (recommended), webrtc, broadcast |
| Pairing | QR (default), PIN, room code |
| Room size | 2–300 (typical 30) |

## Files

- `src/Host.tsx`: messages fly in from the bottom and settle; the newest 100 stay on screen.
- `src/Controller.tsx`: text field plus a flick card (or a Throw button).

## Messages

```ts
// controller -> host (sendToHost)
{ type: 'throw', payload: { text: string; vx: number; vy: number; color: string } } // text ≤ 140 chars
```

## Rate limits and safety

One throw per 500 ms per phone. The host trims text to 140 characters, renders
it as plain text (React escapes it), and validates colors. **Moderate before
showing text publicly** (word filter, host approval queue, or the `admit`
option on relay transports to limit who can join).

## Run

```bash
npm install
npx partykit dev   # partykit / webrtc only
npm run dev
```
