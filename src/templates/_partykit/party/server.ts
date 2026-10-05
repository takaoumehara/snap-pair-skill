import type * as Party from 'partykit/server';

/**
 * Minimal snap-pair relay for `PartyKitTransport` (wire protocol v1, see
 * src/transports/protocol.ts). The room host's browser is authoritative; this
 * server only:
 *
 * 1. checks that each frame is a v1 envelope for this room whose `from` is the
 *    sender's connection id (clients connect with `id = peerId`), so peers
 *    cannot speak for each other;
 * 2. routes frames with `to` to that connection and broadcasts the rest to
 *    everyone except the sender;
 * 3. announces dropped sockets with a `leave` frame (`reason: 'disconnected'`).
 *
 * It stores nothing. Room names are derived keys (hashed codes or PINs), so
 * raw PINs never appear in URLs or logs.
 */

const MAX_FRAME_BYTES = 64 * 1024;
// Raised from the example's 64 so Room Quiz / Poll can reach 300 phones.
const MAX_CONNECTIONS_PER_ROOM = 320;

export default class SnapPairRelay implements Party.Server {
  constructor(readonly room: Party.Room) {}

  onConnect(connection: Party.Connection) {
    if ([...this.room.getConnections()].length > MAX_CONNECTIONS_PER_ROOM) {
      connection.close(1013, 'room is full');
    }
  }

  onMessage(message: string | ArrayBuffer | ArrayBufferView, sender: Party.Connection) {
    if (typeof message !== 'string' || message.length > MAX_FRAME_BYTES) return;
    let frame: { v?: unknown; room?: unknown; from?: unknown; to?: unknown };
    try {
      frame = JSON.parse(message);
    } catch {
      return;
    }
    if (!frame || frame.v !== 1 || frame.room !== this.room.id || frame.from !== sender.id) return;

    if (typeof frame.to === 'string') {
      this.room.getConnection(frame.to)?.send(message);
    } else {
      this.room.broadcast(message, [sender.id]);
    }
  }

  onClose(connection: Party.Connection) {
    this.announceLeave(connection);
  }

  onError(connection: Party.Connection) {
    this.announceLeave(connection);
  }

  private announceLeave(connection: Party.Connection) {
    this.room.broadcast(JSON.stringify({
      v: 1,
      room: this.room.id,
      from: connection.id,
      t: 'leave',
      peerId: connection.id,
      reason: 'disconnected',
    }), [connection.id]);
  }
}

SnapPairRelay satisfies Party.Worker;
