import { describe, expect, it, vi } from 'vitest';
import { Transport } from './base';
import {
  TransportError,
  type CreatedRoom,
  type CreateRoomOptions,
  type Room,
  type TransportCapabilities,
  type TransportMessage,
} from '../core/types';

function makeRoom(overrides: Partial<Room> = {}): Room {
  return {
    id: 'room-1',
    code: 'ABC234',
    hostId: 'host',
    maxPlayers: 2,
    players: { host: { id: 'host', name: 'Host', connected: true } },
    status: 'waiting',
    createdAt: 1,
    updatedAt: 1,
    state: { score: 0 },
    ...overrides,
  };
}

/** Minimal in-memory transport used to exercise the base-class contract. */
class MemoryTransport extends Transport {
  readonly kind = 'broadcast' as const;
  readonly delivered: TransportMessage[] = [];

  constructor(readonly capabilities: TransportCapabilities = { messaging: true, presence: false, serverAuthoritativeJoin: false }) {
    super();
  }

  async connect() { this.setStatus('connected'); }
  async disconnect() { this.emitRoom(null); this.setStatus('disconnected'); }
  async createRoom({ initialState }: CreateRoomOptions): Promise<CreatedRoom> {
    const room = makeRoom({ state: initialState });
    this.emitRoom(room);
    return { room, pairing: { roomId: room.id, code: room.code } };
  }
  async joinRoom() { const room = makeRoom(); this.emitRoom(room); return room; }
  async leaveRoom() { this.emitRoom(null); }
  async setState(state: unknown) { this.emitRoom({ ...(this.room ?? makeRoom()), state }); }

  protected async deliver(message: TransportMessage) {
    this.delivered.push(message);
    this.emitMessage(message);
  }

  fail(error: Error) { this.emitError(error); }
}

describe('Transport base class', () => {
  it('starts idle and emits status changes once per distinct value', async () => {
    const transport = new MemoryTransport();
    const statuses: string[] = [];
    transport.onStatus((status) => statuses.push(status));
    await transport.connect();
    await transport.connect();
    await transport.disconnect();
    expect(statuses).toEqual(['idle', 'connected', 'disconnected']);
    expect(transport.status).toBe('disconnected');
  });

  it('fans a room snapshot out to room, state, and peer listeners', async () => {
    const transport = new MemoryTransport();
    const onRoom = vi.fn();
    const onState = vi.fn();
    const onPeers = vi.fn();
    transport.onRoom(onRoom);
    transport.onState(onState);
    transport.onPeers(onPeers);

    await transport.createRoom({ initialState: { score: 3 } });
    expect(onRoom).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'room-1', state: { score: 3 } }));
    expect(onState).toHaveBeenLastCalledWith({ score: 3 });
    expect(onPeers).toHaveBeenLastCalledWith([{ id: 'host', name: 'Host', connected: true }]);
    expect(transport.peers).toHaveLength(1);

    await transport.leaveRoom();
    expect(onRoom).toHaveBeenLastCalledWith(null);
    expect(onState).toHaveBeenLastCalledWith(undefined);
    expect(onPeers).toHaveBeenLastCalledWith([]);
    expect(transport.room).toBeNull();
  });

  it('does not emit a second null room when already out of a room', async () => {
    const transport = new MemoryTransport();
    const onRoom = vi.fn();
    transport.onRoom(onRoom);
    await transport.leaveRoom();
    expect(onRoom).not.toHaveBeenCalled();
  });

  it('replays the current room to late subscribers', async () => {
    const transport = new MemoryTransport();
    await transport.joinRoom();
    const onRoom = vi.fn();
    transport.onRoom(onRoom);
    expect(onRoom).toHaveBeenCalledWith(expect.objectContaining({ id: 'room-1' }));
  });

  it('returns idempotent unsubscribe handles that only remove their own registration', async () => {
    const transport = new MemoryTransport();
    const listener = vi.fn();
    const first = transport.onState(listener);
    transport.onState(listener);
    first();
    first();
    await transport.setState({ a: 1 });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('isolates throwing listeners', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const transport = new MemoryTransport();
    const healthy = vi.fn();
    transport.onState(() => { throw new Error('boom'); });
    transport.onState(healthy);
    await transport.setState({ ok: true });
    expect(healthy).toHaveBeenCalledWith({ ok: true });
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('forwards errors to error listeners', () => {
    const transport = new MemoryTransport();
    const onError = vi.fn();
    transport.onError(onError);
    transport.fail(new Error('lost'));
    expect(onError).toHaveBeenCalledWith(new Error('lost'));
  });

  it('stamps and delivers messages; broadcast omits a recipient', async () => {
    const transport = new MemoryTransport();
    const onMessage = vi.fn();
    transport.onMessage(onMessage);
    await transport.joinRoom();
    await transport.send({ type: 'tap', payload: { x: 1 }, to: 'host' });
    await transport.broadcast('reset', null);
    expect(transport.delivered).toEqual([
      expect.objectContaining({ type: 'tap', to: 'host', sentAt: expect.any(Number) }),
      expect.objectContaining({ type: 'reset', payload: null }),
    ]);
    expect(transport.delivered[1]).not.toHaveProperty('to');
    expect(onMessage).toHaveBeenCalledTimes(2);
  });

  it('rejects sending outside a room', async () => {
    const transport = new MemoryTransport();
    await expect(transport.broadcast('x', 1)).rejects.toMatchObject({ code: 'not-in-room' });
  });

  it('rejects sending when the transport has no messaging capability', async () => {
    const transport = new MemoryTransport({ messaging: false, presence: true, serverAuthoritativeJoin: true });
    await transport.joinRoom();
    const error = await transport.broadcast('x', 1).catch((e) => e);
    expect(error).toBeInstanceOf(TransportError);
    expect(error.code).toBe('unsupported');
  });

  it('removeAllListeners drops every subscription', async () => {
    const transport = new MemoryTransport();
    const listener = vi.fn();
    transport.onRoom(listener);
    transport.onStatus(listener);
    listener.mockClear();
    transport.removeAllListeners();
    await transport.connect();
    await transport.joinRoom();
    expect(listener).not.toHaveBeenCalled();
  });
});
