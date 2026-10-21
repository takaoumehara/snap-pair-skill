import type * as Party from 'partykit/server';

/**
 * Shake pairing lobby for mini apps. Pairs two shake events within a 1.5s
 * window for the same app, generates a room code, and notifies both parties.
 */

const SHAKE_PAIR_WINDOW_MS = 1500;
const MAX_SHAKES = 100;

interface ShakeEntry {
  appId: string;
  timestamp: number;
  peakStrength: number;
  connectionId: string;
  paired: boolean;
}

export default class ShakeLobby implements Party.Server {
  private shakes: Map<string, ShakeEntry> = new Map();

  constructor(readonly room: Party.Room) {}

  onMessage(message: string | ArrayBuffer | ArrayBufferView, sender: Party.Connection) {
    if (typeof message !== 'string') return;
    
    let msg: { type?: string; appId?: string; timestamp?: number; peakStrength?: number };
    try {
      msg = JSON.parse(message);
    } catch {
      return;
    }

    if (msg.type !== 'shake' || typeof msg.appId !== 'string' || typeof msg.timestamp !== 'number') {
      return;
    }

    const now = Date.now();
    const entry: ShakeEntry = {
      appId: msg.appId,
      timestamp: msg.timestamp,
      peakStrength: msg.peakStrength ?? 20,
      connectionId: sender.id,
      paired: false,
    };

    // Clean up old unpaired shakes
    for (const [id, shake] of this.shakes.entries()) {
      if (now - shake.timestamp > SHAKE_PAIR_WINDOW_MS * 2) {
        this.shakes.delete(id);
      }
    }

    // Cap the number of stored shakes
    if (this.shakes.size > MAX_SHAKES) {
      const oldest = Array.from(this.shakes.entries())[0];
      if (oldest) this.shakes.delete(oldest[0]);
    }

    // Look for an unpaired shake from a different connection in the same app within the window
    let partner: ShakeEntry | null = null;
    for (const shake of this.shakes.values()) {
      if (
        !shake.paired &&
        shake.appId === entry.appId &&
        shake.connectionId !== sender.id &&
        Math.abs(shake.timestamp - entry.timestamp) <= SHAKE_PAIR_WINDOW_MS
      ) {
        partner = shake;
        break;
      }
    }

    if (partner) {
      // Pair found! Create a room code and notify both parties
      const roomCode = this.generateRoomCode();
      partner.paired = true;
      entry.paired = true;

      const pairMsg = JSON.stringify({ type: 'shake-paired', roomCode });
      this.room.getConnection(partner.connectionId)?.send(pairMsg);
      sender.send(pairMsg);

      this.shakes.delete(partner.connectionId);
    } else {
      // Check for ambiguity (3+ shakes in the window for the same app)
      const sameAppShakes = Array.from(this.shakes.values()).filter(
        (s) => !s.paired && s.appId === entry.appId && Math.abs(s.timestamp - entry.timestamp) <= SHAKE_PAIR_WINDOW_MS
      );

      if (sameAppShakes.length >= 2) {
        // Too many shakes - ask to retry
        sender.send(JSON.stringify({ type: 'shake-ambiguous' }));
        // Clean up the ambiguous ones
        for (const s of sameAppShakes) {
          this.shakes.delete(s.connectionId);
        }
      } else {
        // Store this shake and wait for a partner
        this.shakes.set(sender.id, entry);
        sender.send(JSON.stringify({ type: 'shake-waiting' }));
      }
    }
  }

  private generateRoomCode(): string {
    // 6-character room code (no look-alikes: 0/O, 1/I/l)
    const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
    let code = '';
    const bytes = new Uint8Array(6);
    crypto.getRandomValues(bytes);
    for (let i = 0; i < 6; i++) {
      code += chars[bytes[i] % chars.length];
    }
    return code.slice(0, 3) + ' ' + code.slice(3);
  }

  onClose(connection: Party.Connection) {
    this.shakes.delete(connection.id);
  }

  onError(connection: Party.Connection) {
    this.shakes.delete(connection.id);
  }
}
