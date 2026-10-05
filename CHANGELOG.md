# Changelog

## Unreleased

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
