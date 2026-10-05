// Phase 1 public surface. package.json "main" still points at
// src/hooks/useSnapPair.ts for backward compatibility; see docs/plan-phase1.md.
export * from './core/types';
export { buildJoinUrl, normalizeRoomCode, ROOM_CODE_ALPHABET, withTimeout } from './core/utils';
export { useSnapPair, type UseSnapPairOptions } from './core/useSnapPair';
export { Transport } from './transports/base';
export {
  FirebaseRoomStore,
  FirebaseTransport,
  toSnapRoom,
  type FirebaseRoomSlices,
  type FirebaseTransportOptions,
} from './transports/firebase';
export { HostHUD, defaultHostHUDLabels, type HostHUDLabels, type HostHUDProps } from './components/HostHUD';
export type { SnapPlayer, SnapRoom } from './types';
export {
  createSnapPairServer,
  SnapPairServerError,
  type SnapPairServer,
  type SnapPairServerErrorCategory,
} from './services/snapPairServer';
