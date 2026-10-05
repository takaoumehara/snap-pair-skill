// Public surface (Phase 1 + Phase 2). package.json "main" still points at
// src/hooks/useSnapPair.ts for backward compatibility; see docs/plan-phase1.md
// and docs/plan-phase2.md.
export * from './core/types';
export {
  buildJoinUrl,
  createId,
  generateRoomCode,
  getRandomBytes,
  normalizeRoomCode,
  ROOM_CODE_ALPHABET,
  withTimeout,
} from './core/utils';
export { useSnapPair, type UseSnapPairOptions } from './core/useSnapPair';

// Transports
export { Transport } from './transports/base';
export {
  FirebaseRoomStore,
  FirebaseTransport,
  toSnapRoom,
  type FirebaseRoomSlices,
  type FirebaseTransportOptions,
} from './transports/firebase';
export {
  decodeWire,
  encodeWire,
  WIRE_VERSION,
  type LeaveReason,
  type WireBody,
  type WireMessage,
  type WireType,
} from './transports/protocol';
export {
  RelayTransport,
  type RelayLink,
  type RelayLinkHandlers,
  type RelayRoomTarget,
  type RelayTransportOptions,
} from './transports/relay';
export {
  BroadcastChannelTransport,
  isBroadcastChannelSupported,
  type BroadcastChannelTransportOptions,
} from './transports/broadcast';
export {
  buildPartyKitUrl,
  createWebSocketFactory,
  loadPartySocketFactory,
  PartyKitTransport,
  type PartyKitSocketFactory,
  type PartyKitSocketLike,
  type PartyKitSocketParams,
  type PartyKitTransportOptions,
} from './transports/partykit';
export {
  DEFAULT_ICE_SERVERS,
  isWebRTCSupported,
  RTC_SIGNAL_TYPE,
  WebRTCTransport,
  type RtcSignal,
  type WebRTCTransportOptions,
} from './transports/webrtc';

// Pairing
export {
  deriveChannelName,
  deriveRoomId,
  formatPin,
  generatePin,
  isValidPin,
  normalizePin,
  PIN_LENGTH,
  verifyPin,
  type DeriveRoomIdOptions,
} from './pairing/pin';
export {
  buildPairingJoinUrl,
  createQrRenderer,
  loadQrLib,
  parseJoinUrl,
  toQrDataUrl,
  useQrRenderer,
  type JoinUrlParams,
  type QrCodeLib,
  type QrOptions,
  type QrRenderer,
} from './pairing/qr';

// Client utilities
export {
  createWakeLock,
  isWakeLockSupported,
  useWakeLock,
  type WakeLockController,
  type WakeLockOptions,
} from './client/wakeLock';
export {
  getScreenOrientation,
  isMotionSupported,
  isOrientationSupported,
  lockScreenOrientation,
  needsPermission,
  requestOrientationPermission,
  subscribeMotion,
  subscribeOrientation,
  unlockScreenOrientation,
  type MotionReading,
  type OrientationReading,
  type ScreenOrientationLock,
  type SensorPermission,
} from './client/orientation';

// Components
export { HostHUD, defaultHostHUDLabels, type HostHUDLabels, type HostHUDProps } from './components/HostHUD';
export type { SnapPlayer, SnapRoom } from './types';
export {
  createSnapPairServer,
  SnapPairServerError,
  type SnapPairServer,
  type SnapPairServerErrorCategory,
} from './services/snapPairServer';
