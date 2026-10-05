/**
 * Transport-agnostic types shared by every snap-pair layer (pairing,
 * transports, React hooks, and UI components). Nothing in this file may import
 * a backend SDK.
 */

/** Function returned by every subscription; calling it more than once is a no-op. */
export type Unsubscribe = () => void;

/** Backends that can carry a snap-pair room (all four implemented as of Phase 2). */
export type TransportKind = 'firebase' | 'partykit' | 'webrtc' | 'broadcast';

/** How a peer found the room. `pin` and experimental `sound` work with the relay transports (BroadcastChannel, PartyKit, WebRTC), not Firebase. */
export type PairingMethod = 'qr' | 'code' | 'pin' | 'broadcast' | 'sound';

/**
 * Lifecycle of the link between this client and the transport backend.
 * - `idle`: never connected.
 * - `connecting`: `connect()` in progress, or waiting for the first link.
 * - `connected`: the backend is reachable.
 * - `reconnecting`: the link dropped after having been connected.
 * - `disconnected`: `disconnect()` was called.
 * - `error`: `connect()` failed; call `connect()` again to retry.
 */
export type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'disconnected' | 'error';

/** Roles written by the room server (`functions/src`). */
export type PeerRole = 'host' | 'participant';

export type RoomStatus = 'waiting' | 'playing' | 'finished' | 'closed' | 'abandoned';

/** Statuses a host may write; `closed` is server-only. */
export type WritableRoomStatus = Exclude<RoomStatus, 'closed'>;

/** A participant in a room. Apps may extend it with custom properties. */
export interface Peer {
  id: string;
  name: string;
  connected: boolean;
  role?: PeerRole;
  [key: string]: any;
}

/** A room as seen by a member: metadata, peers keyed by id, and shared state. */
export interface Room<TPeer extends Peer = Peer, TState = any> {
  id: string;
  code: string;
  /** The peer id (auth uid for Firebase) of the room host. */
  hostId: string;
  maxPlayers: number;
  /** Map of peerId -> peer, so concurrent writers never clobber each other. */
  players: Record<string, TPeer>;
  status: RoomStatus;
  createdAt: number;
  updatedAt: number;
  state?: TState;
}

/** Everything a host needs to show so another device can join. */
export interface PairingInfo {
  roomId: string;
  /**
   * What a guest types: a six-character room code from the font-safe alphabet
   * (e.g. `ABC234`), or the PIN itself for relay transports in `pairing: 'pin'` mode.
   */
  code: string;
  /**
   * Six-digit numeric PIN (relay transports in `pairing: 'pin'` mode; then it
   * equals `code`). The Firebase room server does not issue PINs; see docs/plan-phase2.md.
   */
  pin?: string;
  /** URL encoded in the QR code; it should carry the room code. */
  joinUrl?: string;
  /** Epoch ms after which the code can no longer be redeemed. */
  expiresAt?: number;
}

/** An application message carried by transports that support messaging. */
export interface TransportMessage<TPayload = unknown> {
  type: string;
  payload: TPayload;
  /** Sender peer id; filled in by the transport. */
  from?: string;
  /** Recipient peer id; omitted for broadcasts. */
  to?: string;
  /** Epoch ms; filled in by the transport. */
  sentAt?: number;
}

/** Features a transport supports, so callers can degrade gracefully. */
export interface TransportCapabilities {
  /** `send`/`broadcast` deliver ephemeral messages. */
  messaging: boolean;
  /** Peers carry a live `connected` flag. */
  presence: boolean;
  /** A trusted server admits peers; a code alone never grants access. */
  serverAuthoritativeJoin: boolean;
}

export interface CreateRoomOptions<TState = unknown> {
  initialState: TState;
  /** Display name of the host. */
  name?: string;
}

export interface JoinRoomOptions {
  /** Display name of the joining peer. */
  name?: string;
}

export interface CreatedRoom<TPeer extends Peer = Peer, TState = any> {
  room: Room<TPeer, TState>;
  pairing: PairingInfo;
}

export type TransportErrorCode = 'unsupported' | 'not-connected' | 'not-in-room' | 'invalid' | 'auth' | 'forbidden' | 'backend';

export class TransportError extends Error {
  constructor(public readonly code: TransportErrorCode, message: string) {
    super(message);
    this.name = 'TransportError';
  }
}
