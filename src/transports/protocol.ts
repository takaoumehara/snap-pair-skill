import type { Peer, PeerRole, Room, RoomStatus, TransportMessage } from '../core/types';

/**
 * snap-pair relay wire protocol, version 1.
 *
 * Shared by `BroadcastChannelTransport` (structured-clone objects),
 * `PartyKitTransport` (JSON text frames), and `WebRTCTransport` (JSON over a
 * DataChannel). The host is authoritative for the roster and the shared state;
 * the medium only moves frames.
 *
 * Every frame is an envelope:
 *
 * ```text
 * { v: 1, room: <roomKey>, from: <peerId>, to?: <peerId>, t: <type>, ...body }
 * ```
 *
 * `to` addresses one peer. Peers on a shared medium (BroadcastChannel) drop
 * frames addressed to someone else; relays (the PartyKit server, the WebRTC
 * host) route them.
 *
 * | `t`       | Sent by          | Body                         | Meaning |
 * | --------- | ---------------- | ---------------------------- | ------- |
 * | `hello`   | guest, new host  | `role`, `name`               | Guest: "admit me" (retried until a `join` for it arrives). Host: "I am claiming this room"; an existing host answers `leave{reason:'taken'}`. |
 * | `join`    | host             | `peer`, `snapshot`           | `peer` was admitted or reconnected; `snapshot` is the full `Room` every guest adopts. |
 * | `leave`   | anyone, relay    | `peerId`, `reason`           | Guest -> host: `left`. Host -> all: a peer left (`left`/`timeout`), the room ended (`closed`), or an admission failed (`rejected`/`full`/`taken`). Relay -> all: a socket dropped (`disconnected`). |
 * | `state`   | host, guest      | `state?`, `status?`, `updatedAt` | Host -> all: new shared state and/or room status. Guest -> host: proposed state; it takes effect when the host re-broadcasts it. |
 * | `message` | anyone           | `message`                    | Application `TransportMessage`; `message.from` is the sender. |
 * | `ping`    | everyone         | -                            | Heartbeat. Peers silent for `peerTimeoutMs` are dropped (by the host) or shown as disconnected (the host, by guests). |
 *
 * Unknown `t` values and other versions are ignored, so the protocol can grow.
 */
export const WIRE_VERSION = 1;

export type LeaveReason = 'left' | 'closed' | 'timeout' | 'rejected' | 'full' | 'taken' | 'disconnected';

export type WireBody =
  | { t: 'hello'; role: PeerRole; name: string }
  | { t: 'join'; peer: Peer; snapshot: Room }
  | { t: 'leave'; peerId: string; reason: LeaveReason }
  | { t: 'state'; state?: unknown; status?: RoomStatus; updatedAt: number }
  | { t: 'message'; message: TransportMessage }
  | { t: 'ping' };

export type WireType = WireBody['t'];

export type WireMessage = WireBody & {
  v: typeof WIRE_VERSION;
  /** Room key (channel suffix, PartyKit room name, or WebRTC signaling room id). */
  room: string;
  from: string;
  to?: string;
};

const isObject = (value: unknown): value is Record<string, any> => typeof value === 'object' && value !== null;
const isString = (value: unknown): value is string => typeof value === 'string' && value.length > 0;

/**
 * Parses a frame (JSON text or an already-decoded object) and returns `null`
 * for anything malformed, from another protocol version, or of unknown type.
 */
export function decodeWire(raw: unknown): WireMessage | null {
  let value: unknown = raw;
  if (typeof raw === 'string') {
    try {
      value = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!isObject(value) || value.v !== WIRE_VERSION || !isString(value.room) || !isString(value.from)) return null;
  if (value.to !== undefined && !isString(value.to)) return null;

  switch (value.t) {
    case 'hello':
      return (value.role === 'host' || value.role === 'participant') && typeof value.name === 'string' ? value as WireMessage : null;
    case 'join':
      return isObject(value.peer) && isString(value.peer.id) && isObject(value.snapshot) && isObject(value.snapshot.players) ? value as WireMessage : null;
    case 'leave':
      return isString(value.peerId) && isString(value.reason) ? value as WireMessage : null;
    case 'state':
      return typeof value.updatedAt === 'number' ? value as WireMessage : null;
    case 'message':
      return isObject(value.message) && typeof value.message.type === 'string' ? value as WireMessage : null;
    case 'ping':
      return value as WireMessage;
    default:
      return null;
  }
}

export function encodeWire(message: WireMessage): string {
  return JSON.stringify(message);
}
