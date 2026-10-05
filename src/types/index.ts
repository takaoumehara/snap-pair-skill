// Legacy type names, kept for backward compatibility. New code can import the
// transport-agnostic names (`Peer`, `Room`, ...) from src/core/types.ts.
import type { Peer, Room } from '../core/types';

// Interfaces (not aliases) so consumers can still augment them via declaration merging.
export interface SnapPlayer extends Peer {}

export interface SnapRoom<TPlayer extends SnapPlayer = SnapPlayer, TState = any> extends Room<TPlayer, TState> {}

export type {
  ConnectionStatus,
  PairingInfo,
  PairingMethod,
  Peer,
  PeerRole,
  Room,
  RoomStatus,
  TransportKind,
  TransportMessage,
  Unsubscribe,
  WritableRoomStatus,
} from '../core/types';
