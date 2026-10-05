# Changelog

## 2.1.0 - 2026-10-05

### Added
- **Experimental Proximity pairing (Web Audio ultrasonic):** host emits an inaudible ~18–20 kHz FSK token (PIN or room code); a nearby phone page listens on the mic, demodulates, and joins via the existing transport. QR and 6-digit PIN stay primary.
  - Pure codec: `encodeSoundToken` / `decodeSoundToken` (synthetic-buffer round-trip tested)
  - Live helpers: `startSoundEmitter`, `startSoundListener`, `isSoundPairSupported`, `normalizeSoundToken`
  - React: `useSoundPairing` hook; optional `HostHUD` `enableSoundPairing` toggle
  - Pairing method `'sound'` on PartyKit, WebRTC, and BroadcastChannel (`TRANSPORT_PAIRING`)
- Docs site, README (en + ja), SKILL.md, and pairing matrix updated with limitations (noise, mic permission, browser support).

### Notes
- Sound pairing is **not** a secret channel — anyone in earshot can recover the token. Gate sensitive rooms with `admit`.
- Firebase transport still uses QR / room code for admission; sound can still convey a room code for a guest to type or auto-join after decode in app code.

## 2.0.0 - 2026-10-05

First npm release of `snap-pair-core` (Phases 1-3). May contain breaking changes relative to 1.x.

### Added (Phase 3: CLI, presets, templates, packaging; see `docs/plan-phase3.md`)
- `snap-pair` CLI (`npx snap-pair init`, `presets`, `recommend`, `--help`,
  `--version`). The interactive wizard (`node:readline/promises`, no new
  dependencies) offers four paths: by experience (seven presets), by
  architecture (same device / realtime / P2P / managed), by stack (Firebase /
  Cloudflare-PartyKit / no backend), or a free-text consult that runs a
  rule-based en/ja keyword recommender (no paid API). Every choice lists pros,
  cons, and free-tier cost notes. For CI and agents, flags (`--yes`,
  `--preset`, `--transport`, `--pairing`, `--out`, `--json`, `--lang`, ...)
  answer every question.
- `snap-pair.config.json`: JSON Schema (`CONFIG_JSON_SCHEMA`, shipped as
  `snap-pair-core/config.schema.json`) plus `validateConfig`, which also
  checks that the preset, transport, and pairing method fit together.
- `src/presets`: registry of the seven presets (`PRESETS`, `getPreset`,
  `supportedTransports`, `pairingFor`, `presetsForTransport`). Each entry has
  en/ja names and descriptions, transports, pairing methods, message shapes,
  rate limits, controller needs, and recommender keywords.
- `src/templates`: starter apps for Stroke Stream, Particle Blast, Type Throw,
  Room Quiz/Poll, Virtual Controller, and Motion/Sensor (Vite + React host
  and controller pages on a shared scaffold, plus a PartyKit relay), and a
  single-file BroadcastChannel demo for Local Multi-Display. They are
  typechecked against the library (`tsconfig.templates.json`).
- `src/i18n`: `en`/`ja` dictionaries, `t()`, `tList()`, `createTranslator()`,
  and `detectLocale()` (`LC_ALL`/`LC_MESSAGES`/`LANG`/`Intl` in Node,
  `navigator.languages` in browsers, `en` fallback).
- `ControllerWrapper`: controller-side shell with connection status, a
  reconnect banner, a wake-lock toggle, the iOS motion-permission button, and
  fullscreen with orientation lock. All strings are localized.
- `src/client/fullscreen.ts`: `enterFullscreen`, `exitFullscreen`,
  `isFullscreen`, `isFullscreenSupported`, `onFullscreenChange`.
- `useSnapPair({ transport })`: the hook accepts any `Transport` instance or
  factory and returns the same shape as before. Without `transport` it uses
  the Firebase path exactly as before.
- `WebRTCTransport` recovery: ICE restart when a guest's connection fails,
  then fresh offers with exponential backoff after its channel drops
  (`reconnect` option). The host keeps failed peers for a grace period.
- `WebRTCTransport` chunking: frames over `maxMessageBytes` (16 KiB) are
  split and reassembled (`maxReassembledBytes`, 1 MiB) via
  `src/transports/chunking.ts` (`splitMessage`, `Reassembler`).
- Build: tsup produces `dist/` (ESM + CJS + `.d.ts`) and the `snap-pair` bin.

### Changed (Phase 3)
- Packaging: `main`/`module`/`types` point to `dist/`. The `exports` map
  covers `.`, `./hooks/useSnapPair`, the legacy deep imports
  `./src/hooks/useSnapPair(.ts)`, `./transports/*`, `./config.schema.json`,
  and `./package.json`. Also added: `"type": "module"`,
  `"sideEffects": false`, `engines.node >= 18`, a `files` allowlist, and a
  `prepublishOnly` gate (typecheck, test, build). The version stays 1.0.1.
- `react` is now a peer dependency (`>=18.2.0`), and so is `react-dom`
  (optional: the library itself does not import it). Both remain
  devDependencies. `firebase` stays a dependency because the default
  `useSnapPair` path imports it.
- `HostHUD` accepts `locale` (`'en'`, `'ja'`, `'auto'`). `labels` still
  overrides single strings. `HostHUDLabels.pairing` (optional) names the
  region.
- WebRTC signals carry an optional per-connection `session` id (and
  `restart` for ICE restarts), so stale answers and candidates are ignored.
  Phase 2 peers without it still interoperate.

### Added (Phase 2: transports, pairing, client utilities; see `docs/plan-phase2.md`)
- `src/transports/protocol.ts`: versioned JSON wire protocol (`hello`, `join`,
  `leave`, `state`, `message`, `ping`) with `decodeWire`/`encodeWire`.
- `src/transports/relay.ts`: `RelayTransport`, a shared host-authoritative
  engine. It handles admission (`admit` hook, `maxPlayers`), roster/state
  fan-out, heartbeats and timeouts, room-key claiming, and messaging.
- `src/transports/broadcast.ts`: `BroadcastChannelTransport` for
  same-machine multi-tab/window rooms. It works offline and fails with
  `TransportError('unsupported')` when `BroadcastChannel` is missing.
- `src/transports/partykit.ts`: `PartyKitTransport` over WebSocket with an
  injectable socket factory (`partysocket` if importable, else the global
  `WebSocket` with reconnect/backoff). Also `buildPartyKitUrl`.
- `examples/partykit/`: minimal relay server (`server.ts`, `partykit.json`,
  README). The unit tests run this server.
- `src/transports/webrtc.ts`: `WebRTCTransport`, a DataChannel star
  (host <-> guests). Signaling goes over any messaging transport, with
  configurable `iceServers`. ICE restart and automatic re-offer are not done
  yet (`TODO(phase3)`).
- `src/pairing/pin.ts`: `generatePin` (CSPRNG, no modulo bias),
  `normalizePin` (full-width digits, dashes, spaces), `isValidPin`,
  `verifyPin` (constant-time compare), `formatPin`, and
  `deriveRoomId`/`deriveChannelName` (SHA-256 via SubtleCrypto, with an
  identical pure-JS fallback).
- `src/pairing/qr.ts`: `buildPairingJoinUrl`, `parseJoinUrl`, `loadQrLib`,
  `toQrDataUrl`, `createQrRenderer`, and `useQrRenderer` (optional `qrcode`).
- `src/client/wakeLock.ts`: `createWakeLock`, `useWakeLock`, and
  `isWakeLockSupported`. The lock is re-acquired when the page becomes
  visible again.
- `src/client/orientation.ts`: `needsPermission`,
  `requestOrientationPermission` (iOS 13+ user-gesture flow),
  `subscribeOrientation`, `subscribeMotion`, `lockScreenOrientation`,
  `unlockScreenOrientation`, and `getScreenOrientation`. All are SSR-safe.
- `src/core/utils.ts`: `getRandomBytes`, `generateRoomCode`, `createId`.
- Optional peer dependencies: `partysocket`, `qrcode`. No new runtime
  dependency.
- Tests for every new module, using fakes for BroadcastChannel, WebSocket,
  PartyKit, RTCPeerConnection, wake lock, device orientation/motion, and
  crypto.

### Changed (Phase 2)
- `HostHUD` hides the QR figure when `renderQr` returns `null`/`undefined`.
  It also shows the PIN row only when the PIN differs from the room code.

### Added (Phase 1: core + transport foundation; see `docs/plan-phase1.md`)
- `src/core/types.ts`: transport-agnostic types (`Peer`, `PeerRole`, `Room`,
  `RoomStatus`, `ConnectionStatus`, `TransportMessage`,
  `TransportCapabilities`, `PairingInfo`, `TransportKind`, `PairingMethod`,
  `Unsubscribe`) and `TransportError`.
- `src/core/utils.ts`: `normalizeRoomCode`, `withTimeout`, `buildJoinUrl`,
  `ROOM_CODE_ALPHABET`.
- `src/transports/base.ts`: abstract `Transport` class with lifecycle, room,
  state, messaging, and subscription APIs.
- `src/transports/firebase.ts`: `FirebaseTransport` (same RTDB paths and
  callables as before, compatible with `database.rules.json`),
  `FirebaseRoomStore`, `toSnapRoom`, `callCreateRoom`, `callJoinRoom`.
- `src/components/HostHUD.tsx`: host pairing HUD (pluggable `renderQr`, room
  code, optional PIN, join link + copy, peer count, connection status,
  overridable labels). No new runtime dependency.
- `src/index.ts`: barrel export for the new surface.
- Unit tests for `Transport`, `FirebaseTransport`/`FirebaseRoomStore`, and
  `HostHUD`.

### Changed
- `useSnapPair` now lives in `src/core/useSnapPair.ts` and delegates all RTDB
  I/O to `FirebaseRoomStore`. `src/hooks/useSnapPair.ts` (package `main`)
  re-exports it with the same signature and behavior.
- `SnapPlayer`/`SnapRoom` are now interfaces extending the core `Peer`/`Room`
  types (structurally identical).

## 1.0.1 - 2026-10-04

### Fixed
- Repository, homepage, and bug-tracker links now point to the public repo
  https://github.com/takaoumehara/snap-pair-skill (README in all languages,
  `package.json`, and `tools/snap-pair-provisioner/package.json`).
