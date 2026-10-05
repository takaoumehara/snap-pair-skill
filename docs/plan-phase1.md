# snap-pair refactor — Phase 1 plan

Status: implemented on `feat/phase1-core-transport`.

## Goal

snap-pair is growing from "a Firebase pairing hook" into a DevTool for
multi-screen interactive web experiences: several pairing methods (QR, PIN,
broadcast), several transports (Firebase, PartyKit, WebRTC,
BroadcastChannel), client utilities (wake lock, orientation), and seven UX
presets (Stroke Stream, Particle Blast, Type Throw, Room Quiz/Poll, Virtual
Controller, Motion/Sensor, Local Multi-Display).

Phase 1 lays the foundation for that without changing current behavior. It
adds transport-agnostic types, a `Transport` abstraction, a Firebase
implementation of it, and a host pairing HUD.

## Current architecture (before Phase 1)

```text
src/hooks/useSnapPair.ts        React hook: auth lifecycle, RTDB reads/writes,
                                slice subscriptions, presence/onDisconnect,
                                race guards, and React state, all in one file
src/services/snapPairServer.ts  Callable client for createSnapRoom / joinSnapRoom
                                (response validation + error mapping)
src/types/index.ts              SnapPlayer, SnapRoom
functions/src/                  Admin-SDK room server (create/join/cleanup)
database.rules.json             Membership-gated reads, narrowly scoped writes
```

Problems for the long-term vision:

- Firebase SDK calls are interleaved with React state, so no other backend can
  be plugged in and the I/O can't be used outside React.
- Types are named after the Firebase implementation (`SnapPlayer`/`SnapRoom`),
  and there are no types for connection status, messages, or pairing info.
- There is no host-side pairing UI; every app rebuilds the QR and code panel.

## Target architecture (all phases)

```text
src/core/{types.ts,useSnapPair.ts}
src/pairing/{qr.ts,pin.ts}
src/transports/{base.ts,firebase.ts,partykit.ts,webrtc.ts,broadcast.ts}
src/client/{wakeLock.ts,orientation.ts}
src/components/{HostHUD.tsx,ControllerWrapper.tsx}
src/cli/{index.ts,wizard.ts}
src/i18n/locales/{ja,en}.json
src/templates/
SKILL.md
```

Layers, bottom-up: **core types** → **transports** (one backend each, all
behind `Transport`) → **pairing** (how a peer finds a room) → **React
adapter** (`useSnapPair`) → **components / presets / templates** → **CLI**.

## Phase 1 scope (this change)

| File | What |
| --- | --- |
| `src/core/types.ts` | Transport-agnostic types: `Peer`, `PeerRole`, `Room`, `RoomStatus`, `ConnectionStatus`, `TransportMessage`, `TransportCapabilities`, `PairingInfo` (room code, optional 6-digit PIN, join URL, expiry), `TransportKind`, `PairingMethod`, `Unsubscribe`, `TransportError`. |
| `src/core/utils.ts` | `normalizeRoomCode`, `withTimeout`, `buildJoinUrl`, `ROOM_CODE_ALPHABET` (moved out of the hook so the hook and the transport share them). |
| `src/transports/base.ts` | Abstract `Transport`: `connect`/`disconnect`, `createRoom`/`joinRoom`/`leaveRoom`, `setState`, `send`/`broadcast`, `onStatus`/`onRoom`/`onState`/`onPeers`/`onMessage`/`onError` returning idempotent unsubscribe handles, `capabilities`, plus protected emit helpers. |
| `src/transports/firebase.ts` | `FirebaseRoomStore` (every RTDB read/write, moved verbatim from the hook), `toSnapRoom`, `callCreateRoom`/`callJoinRoom`, and `FirebaseTransport extends Transport`. |
| `src/core/useSnapPair.ts` | The hook, now delegating all RTDB I/O to `FirebaseRoomStore`. |
| `src/hooks/useSnapPair.ts` | Re-export shim (still `package.json` `main`). |
| `src/types/index.ts` | `SnapPlayer`/`SnapRoom` as interfaces extending `Peer`/`Room`, plus re-exports of the core types. |
| `src/components/HostHUD.tsx` | Host pairing panel: QR (via `renderQr`), room code, optional PIN, join link + copy, peer count, connection status, overridable labels. |
| `src/index.ts` | Barrel for the Phase 1 surface. |

### Key design decisions

1. **Stateless store + stateful transport.** The hook's tests pin exact RTDB
   call sequences, effect dependencies, and race guards (auth-uid changes,
   room switches, late callbacks, presence after unmount). Rather than rebuild
   the hook on top of the event-emitting `FirebaseTransport` and risk subtle
   changes, all RTDB I/O moved into `FirebaseRoomStore`, keyed by
   `(db, databasePath)` exactly like the old `getRoomRef`. The hook keeps its
   React state, auth lifecycle, and guards and calls the store. `FirebaseTransport`
   composes the same store with the callable server, so there is one
   implementation of every path and write.
2. **Small `Transport` contract.** Only what every planned backend can
   provide. Firebase-only operations (`updateSelf`, `setRoomStatus`) live on
   `FirebaseTransport`. `capabilities` lets callers detect gaps instead of
   catching errors.
3. **No messaging on Firebase yet.** `database.rules.json` has no message path,
   and adding one is a rules and security change. `FirebaseTransport` reports
   `capabilities.messaging = false`, and `send`/`broadcast` reject with
   `TransportError('unsupported')`.
4. **No QR dependency.** `HostHUD` takes `renderQr(value, size)`. A QR encoder
   is ~10–40 kB or several hundred lines to vendor, and apps often already have
   one (`qrcode.react`, `qrcode`). Without `renderQr`, the HUD still shows the
   room code and join link. No new runtime dependency was added.
5. **The PIN is a type only.** The server issues six-character codes from
   `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`. `PairingInfo.pin` and the HUD's PIN row
   exist so Phase 2 can add numeric PINs without a breaking change.
6. **Auth stays in the hook.** `FirebaseTransport.connect()` resolves an
   identity once (current user, or anonymous sign-in). It does not yet react
   to sign-in changes the way the hook does.

## Backward-compatibility strategy

- `package.json` `main` is unchanged (`src/hooks/useSnapPair.ts`) and still
  exports `useSnapPair`, `withTimeout`, and `UseSnapPairOptions`.
- `useSnapPair` keeps the same options, return shape, error strings, timeout
  labels, DB paths, write payloads, and effect dependencies. The one
  intentional difference: the `.info/connected` watcher now also re-subscribes
  when `databasePath` changes (it is keyed on the store), which has no
  observable effect.
- `SnapPlayer`/`SnapRoom` remain exported from `src/types` as interfaces, so
  `extends` and declaration merging still work.
- `src/services/snapPairServer.ts`, `functions/`, and `database.rules.json` are
  untouched; `FirebaseTransport` uses the same callables and paths.
- No version bump. New exports are additive.

## Test strategy

- **Regression:** all existing tests run unchanged (`src/hooks/useSnapPair.test.ts`,
  server parsing, rules shape, skill bundle, provisioner). The hook tests mock
  `firebase/database` at module level, so they now exercise
  `FirebaseRoomStore` too.
- **`src/transports/base.test.ts`:** an in-memory subclass checks status
  de-duplication, room → state/peer fan-out, replay to late subscribers,
  idempotent unsubscribe, listener error isolation, message stamping,
  capability gating, and `removeAllListeners`.
- **`src/transports/firebase.test.ts`:** with mocked `firebase/database` and
  `firebase/auth`, covers slice subscription and release, reads, rule-scoped
  own-player writes, leave semantics, presence ordering (`onDisconnect`
  before `connected: true`) and cancel, connect/auth paths, status from
  `.info/connected`, subscribe-only-after-callable, code normalization,
  room switching with stale callbacks, error surfacing, host-only status,
  unsupported messaging, and leave/disconnect cleanup.
- **`src/components/HostHUD.test.tsx`** (jsdom + Testing Library): waiting
  state, `renderQr` contract, fallback without a QR renderer, PIN row, peer and
  status display, label overrides, clipboard copy and its absence, children.
- None of the new tests need the Firebase emulator.
  `npm run test:rules-emulator` is unchanged.

## Deferred to Phase 2+

- **Pairing:** `src/pairing/qr.ts` (join-URL parsing/deep links, optional
  built-in QR encoder), `src/pairing/pin.ts` (numeric six-digit PINs, which
  need server and rules support in `functions/`), broadcast/LAN discovery.
- **Transports:** `partykit.ts`, `webrtc.ts`, `broadcast.ts`
  (BroadcastChannel for Local Multi-Display), and Firebase messaging (a
  rules-scoped, rate-limited `rooms/$roomId/messages` path with security
  review).
- **Hook on Transport:** make `core/useSnapPair` generic over `Transport`
  (e.g. a `transport` option), move the auth lifecycle into
  `FirebaseTransport` (including reacting to uid changes), and keep the
  current signature as the Firebase default.
- **Client utils:** `src/client/wakeLock.ts`, `src/client/orientation.ts`.
- **Components:** `ControllerWrapper.tsx`, the seven UX presets, and
  `src/templates/`.
- **i18n:** `src/i18n/locales/{ja,en}.json`, wired into `HostHUD` labels.
- **CLI:** `src/cli/{index.ts,wizard.ts}`.
- **Packaging:** point `main`/add `exports` at `src/index.ts` (and a build
  step) in a minor release. Update `SKILL.md` and translated READMEs for the
  new layers.
