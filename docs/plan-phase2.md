# snap-pair refactor — Phase 2 plan

Status: implemented on `feat/phase2-transports` (stacked on Phase 1,
`docs/plan-phase1.md`).

## Goal

Phase 2 adds the remaining transports (BroadcastChannel, PartyKit, WebRTC),
numeric PIN and QR pairing helpers, and the client utilities the UX presets
need (screen wake lock, device orientation/motion). Everything is additive:
`useSnapPair`, `FirebaseTransport`, `functions/`, and `database.rules.json`
behave exactly as before.

## Scope

| File | What | State |
| --- | --- | --- |
| `src/transports/protocol.ts` | Wire protocol v1: envelope `{v, room, from, to?}` plus `hello`/`join`/`leave`/`state`/`message`/`ping`, `decodeWire` (validation) / `encodeWire`. | Implemented |
| `src/transports/relay.ts` | `RelayTransport`: host-authoritative engine shared by the three new transports. | Implemented |
| `src/transports/broadcast.ts` | `BroadcastChannelTransport`, `isBroadcastChannelSupported`. | Implemented |
| `src/transports/partykit.ts` | `PartyKitTransport`, `buildPartyKitUrl`, `createWebSocketFactory`, `loadPartySocketFactory`. | Implemented |
| `examples/partykit/` | `server.ts` (`Party.Server` relay), `partykit.json`, README. | Implemented; not deployed or run against real PartyKit here |
| `src/transports/webrtc.ts` | `WebRTCTransport` (DataChannel star, pluggable signaling). | Core implemented; recovery scaffolded (see below) |
| `src/pairing/pin.ts`, `src/pairing/sha256.ts` | PIN generation/validation/normalization/verification, `deriveRoomId`, `deriveChannelName`, SHA-256 fallback. | Implemented |
| `src/pairing/qr.ts` | `buildPairingJoinUrl`, `parseJoinUrl`, `loadQrLib`, `toQrDataUrl`, `createQrRenderer`, `useQrRenderer`. | Implemented |
| `src/client/wakeLock.ts` | `createWakeLock`, `useWakeLock`, `isWakeLockSupported`. | Implemented |
| `src/client/orientation.ts` | `needsPermission`, `requestOrientationPermission`, `subscribeOrientation`, `subscribeMotion`, `lockScreenOrientation`, `unlockScreenOrientation`, `getScreenOrientation`. | Implemented |
| `src/core/utils.ts` | `getRandomBytes`, `generateRoomCode`, `createId`. | Implemented |
| `src/components/HostHUD.tsx` | Hide the QR figure when `renderQr` returns nothing; don't repeat a PIN that equals the code. | Implemented |
| `src/index.ts` | Exports every new module. | Implemented |
| `src/testing/fakes.ts` | Test doubles (not exported). | Implemented |

## Key design decisions

1. **One protocol engine, three media.** BroadcastChannel, a PartyKit room,
   and a WebRTC star all reduce to "send a frame to the room or to one peer."
   `RelayTransport` implements the room semantics once: admission, roster,
   state, status, messaging, heartbeats, timeouts, and claiming. Each
   transport only implements `prepare()` (feature detection) and
   `openLink()`. The hub medium (WebRTC) sets `hostForwards` so the host
   relays guest messages. Fixes and tests for the protocol therefore apply to
   all three transports.
2. **Host-authoritative, serverless trust model.** The room creator's browser
   holds the roster and state. Guests propose state, and it takes effect when
   the host re-broadcasts it. The host ignores state and messages from
   non-members. Guests accept roster changes only from the host. Nothing
   admits peers on a server, so `capabilities.serverAuthoritativeJoin` is
   `false`. The `admit(peer)` hook and `maxPlayers` are the gates.
   BroadcastChannel is same-origin, same-profile, so every tab is trusted
   equally. The PartyKit example server rejects frames whose `from` is not
   the sender's connection id. The WebRTC host pins frames to the
   DataChannel they arrived on.
3. **Room keys are derived, not raw codes.** A room code or PIN maps to
   `sp` + 24 hex characters of SHA-256 of
   `snap-pair/v1|<namespace>|<kind>|<value>`. The key is the channel suffix
   and the PartyKit room name. Raw PINs never appear in URLs or server logs,
   and apps sharing a relay are namespaced apart. With 10^6 PINs the hash is
   **not** a secret. `crypto.subtle` is missing on plain-HTTP LAN origins
   (phones opening `http://192.168.x.x`), so a pure-JS SHA-256 produces
   byte-identical ids. Tests check it against Node's `crypto`.
4. **Claiming instead of a registry.** No relay knows which keys are in use,
   so a new host sends `hello{role:'host'}` and listens for `claimWindowMs`.
   Defaults: 100 ms on BroadcastChannel, 400 ms on PartyKit, 0 on WebRTC
   because signaling allocates rooms. An existing host answers
   `leave{reason:'taken'}`, and the new host draws another code (up to five
   attempts). This matters for PINs: with 10^6 values, collisions among
   concurrent rooms on one relay are realistic.
5. **Presence = heartbeats + medium signals.** Everyone pings every
   `heartbeatMs` (2 s). The host drops guests silent for `peerTimeoutMs`
   (6 s). A dropped guest that is still alive gets `leave{reason:'timeout'}`
   and says `hello` again, so it rejoins by itself. Guests mark a silent
   host `connected: false`. `ConnectionStatus` describes this client's link
   (socket or channel), not the host's liveness. The PartyKit server's
   `leave{reason:'disconnected'}` and WebRTC channel closes remove peers
   immediately.
6. **Optional peers via variable-specifier dynamic imports.** `partysocket`
   and `qrcode` are optional `peerDependencies`. They are not installed as
   devDependencies; the tests inject fakes and also check the "not
   installed" path. The default loaders use `import(specifier)` with
   `/* @vite-ignore */ /* webpackIgnore: true */`, so TypeScript and
   bundlers never fail when the packages are missing. As a result,
   **bundled browser apps should inject them** with
   `socketFactory: (p) => new PartySocket(p)` or
   `useQrRenderer({ lib: QRCode })`. The automatic import mainly works in
   Node/SSR, vitest, and import-map setups. Without `partysocket`,
   `PartyKitTransport` uses the global `WebSocket` and reconnects with
   exponential backoff (1 s doubling to 10 s).
7. **WebRTC signaling is just messages.** Offers, answers, and ICE
   candidates are `TransportMessage`s of type `snap-pair:rtc`, broadcast on
   the signaling transport. Each side filters on `room`/`to`, and guests
   address the host as `'host'` until its answer arrives. Any transport with
   `capabilities.messaging` works: PartyKit in production, BroadcastChannel
   in tests. Firebase is rejected with `unsupported` because it has no
   messaging (Phase 1 decision 3). Room codes, PINs, and join URLs come from
   the signaling room. After the channels open, room traffic uses the same
   wire protocol over the DataChannels.
8. **SSR-safe client utilities.** No module reads `window`, `document`,
   `navigator`, or `screen` at import time. Everything feature-detects on
   call and degrades to a no-op or `false`/`'unsupported'`. A node-environment
   test imports the whole barrel to enforce this.
9. **iOS permission flow.** `requestOrientationPermission()` starts both
   `DeviceOrientationEvent.requestPermission()` and
   `DeviceMotionEvent.requestPermission()` synchronously, before any `await`,
   so both prompts stay inside the user gesture. Rejections (including "not
   from a gesture") resolve to `'denied'` instead of throwing.

## Implemented vs scaffolded

**Fully implemented and unit-tested:** protocol, relay engine,
BroadcastChannel transport, PartyKit transport (partysocket and WebSocket
paths, URL building, queueing, reconnect/backoff, connect timeout), the
PartyKit example server (exercised in-process by the tests), PIN and hashing
helpers, QR helpers and their HostHUD integration, wake lock, and
orientation/motion/screen-orientation helpers.

**WebRTC: implemented**
- offer/answer/trickle-ICE exchange
- ICE candidates queued until the remote description is set; host-side
  buffering of candidates that arrive before their offer
- star routing with host forwarding (broadcast and addressed)
- configurable `iceServers` (default: one public STUN server)
- injectable `RTCPeerConnection`
- peer removal on DataChannel close or connection `failed`/`closed`
- join timeout
- leaving the signaling room on leave

All of it is tested against a fake `RTCPeerConnection`, not real browsers.

**WebRTC: scaffolded / `TODO(phase3)`** (Phase 3 implemented ICE restart,
automatic re-offer with backoff, and chunking; the rest is listed under
"Remaining" in `docs/plan-phase3.md`.)
- ICE restart and automatic re-offer when a guest's channel drops. The guest
  goes to `reconnecting` and must call `joinRoom` again.
- Renegotiation (adding channels or tracks after connect).
- Binary payloads, and chunking of messages larger than the SCTP limit (about
  16 KiB is safe everywhere). Frames are JSON text.
- Mesh topology. Only the host-centric star exists.
- Real-browser or e2e verification (for example Playwright with two
  contexts plus a TURN server).

**Known limitations**
- If `createQrRenderer`'s encoder fails asynchronously, the image is
  omitted but HostHUD's "Scan to join" caption stays, because the HUD can't
  see the async failure. `useQrRenderer()` without an available encoder
  returns `undefined`, so the HUD omits the whole figure.
- No host migration: if the host leaves, guests see `status: 'closed'`.
- PIN rooms on a public PartyKit relay can be enumerated (10^6). The example
  server documents adding rate limiting. Use `admit` for anything sensitive.

## Firebase and numeric PINs

Numeric PINs are **not** wired into Firebase, and `functions/` and
`database.rules.json` are unchanged. Supporting them would need:

- **Functions changes (required).** `functions/src/room-core.ts`
  `CODE_PATTERN` and `functions/src/rooms.ts` `CODE_ALPHABET` only allow
  `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`, which excludes `0` and `1`. PINs need a
  separate code type (for example a `kind: 'pin'` request field and a
  `pairingPins/{pin}` index, or a namespaced `pairingCodes` key), digit
  generation with rejection sampling, and `normalizeCode` acceptance.
- **Abuse controls (required).** Brute-forcing drops from 32^6 ≈ 1.07e9
  codes to 1e6 PINs. `joinSnapRoom` would need per-uid and per-IP join
  rate limiting (there is only `roomCreationLimits` today) and probably
  shorter PIN lifetimes.
- **Rules (likely none).** `pairingCodes/$code` is Admin-only
  (`.read/.write: false`) and uses opaque keys, so a new admin-only path
  needs at most a deny-all entry like the existing ones. Membership-gated
  room paths don't depend on the code format.
- **Client.** `normalizeRoomCode` / `FirebaseTransport.joinRoom` would route
  six-digit input to the PIN path.

## Test strategy and results

New test files (108 tests). They use jsdom where the DOM is needed, and
fakes for every browser API:

| File | Tests | Covers |
| --- | --- | --- |
| `src/pairing/pin.test.ts` | 17 | Format, leading zeros, rejection sampling (stubbed `getRandomValues`), no-crypto failure, rough uniformity, normalization (full-width, dash variants, `ー`), verify, SHA-256 vs Node `crypto` (incl. multi-block/UTF-8), SubtleCrypto fallback, room-id derivation. |
| `src/transports/broadcast.test.ts` | 26 | Feature detection, codes/PINs/join URLs, roster sync, invalid input, join timeout, late host, capacity, `admit`, claiming, host/guest state, status, broadcast/addressed messages, malformed frames, leave/close, heartbeat drop + auto-rejoin, silent host, disconnect, pending-join cancel. |
| `src/transports/partykit.test.ts` | 18 | URL building, partysocket loader (injected, missing), WebSocket fallback, unsupported, end-to-end through `examples/partykit/server.ts` (routing, spoof drop, disconnect notices, reconnect and re-admission, host drop), queueing, connect timeout, self-reconnecting sockets. |
| `src/transports/webrtc.test.ts` | 12 | Unsupported environments, signaling auto-connect, offer/answer/ICE, `iceServers`, traffic over DataChannels only, star forwarding, spoof drop, early-ICE buffering, channel close, leave cleanup, answer timeout. |
| `src/client/wakeLock.test.ts` | 9 | No-op fallback, request/release, request de-duplication, re-acquire on visibility, opt-outs, refusals, release during request, `useWakeLock`. |
| `src/client/orientation.test.ts` | 11 | Missing APIs, no-permission browsers, iOS prompts started synchronously, motion opt-out, denial and rejection paths, event mapping, absolute orientation, motion, orientation lock success and failure. |
| `src/client/ssr.test.ts` | 2 | Node environment: client utils and the full barrel import and degrade without browser globals. |
| `src/pairing/qr.test.tsx` | 13 | Join URL build/parse, optional `qrcode` loading, encoding options, failures, HostHUD integration. |

Result: `npm test` → 21 files passed, 1 skipped (the emulator suite); 263
tests passed, 2 skipped (155 before Phase 2). `npm run typecheck` is clean.

## Phase 3 (left)

- **CLI wizard:** `src/cli/{index.ts,wizard.ts}` to choose transport, pairing
  method, preset, and Firebase/PartyKit setup, and to scaffold a template.
- **i18n:** `src/i18n/locales/{ja,en}.json` wired into `HostHUD` labels and
  transport error messages. Update `SKILL.md` and the translated READMEs for
  the Phase 1–2 layers.
- **Seven UX presets:** Stroke Stream, Particle Blast, Type Throw, Room
  Quiz/Poll, Virtual Controller, Motion/Sensor (built on
  `client/orientation`), and Local Multi-Display (built on
  `BroadcastChannelTransport`).
- **`ControllerWrapper.tsx`:** guest-side shell with wake lock, motion
  permission button, orientation lock, and reconnect UI.
- **Templates:** `src/templates/` starter apps per preset.
- **Hook on Transport:** let `useSnapPair` take any `Transport` (carried over
  from Phase 1).
- **Packaging/exports:** a build step, `exports` map with subpath entries
  (`./transports/*`, `./pairing/*`, `./client/*`), moving `main` to
  `src/index.ts` in a minor release, and listing `react` as a peer
  dependency.
- **WebRTC hardening:** the `TODO(phase3)` items above, plus real-browser e2e.
- **Firebase PINs and messaging:** the functions changes above, and a
  rules-scoped `rooms/$roomId/messages` path, each with a security review.
