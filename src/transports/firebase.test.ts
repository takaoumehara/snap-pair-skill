import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SnapPairServer } from '../services/snapPairServer';

const valueListeners = new Map<string, Array<(snapshot: any) => void>>();
const listenerUnsubscribes = new Map<string, ReturnType<typeof vi.fn>>();
const roomData: Record<string, unknown> = {};
const calls: string[] = [];
const updateMock = vi.fn(async (target: { path: string }, _value: unknown) => { calls.push(`update:${target.path}`); });
const offMock = vi.fn();
const disconnectUpdateMock = vi.fn(async (_value: unknown) => { calls.push('onDisconnect.update'); });
const disconnectSetMock = vi.fn(async (_value: unknown) => { calls.push('onDisconnect.set'); });
const disconnectCancelMock = vi.fn(async () => undefined);
const signInAnonymouslyMock = vi.fn();

vi.mock('firebase/auth', () => ({
  signInAnonymously: (...args: any[]) => signInAnonymouslyMock(...args),
}));

vi.mock('firebase/database', () => ({
  ref: (_db: unknown, path = '') => ({ path }),
  get: vi.fn(async (target: { path: string }) => {
    calls.push(`get:${target.path}`);
    const slice = target.path.split('/').at(-1)!;
    return { val: () => roomData[slice] ?? null };
  }),
  update: (target: { path: string }, value: unknown) => updateMock(target, value),
  onValue: vi.fn((target: { path: string }, listener: (snapshot: any) => void) => {
    calls.push(`onValue:${target.path}`);
    valueListeners.set(target.path, [...(valueListeners.get(target.path) ?? []), listener]);
    const unsubscribe = vi.fn(() => {
      valueListeners.set(target.path, (valueListeners.get(target.path) ?? []).filter((l) => l !== listener));
    });
    listenerUnsubscribes.set(target.path, unsubscribe);
    return unsubscribe;
  }),
  off: (target: { path: string }, event: string, listener: (snapshot: any) => void) => {
    offMock(target, event, listener);
    valueListeners.set(target.path, (valueListeners.get(target.path) ?? []).filter((l) => l !== listener));
  },
  serverTimestamp: () => ({ '.sv': 'timestamp' }),
  onDisconnect: vi.fn((target: { path: string }) => ({
    update: (value: unknown) => disconnectUpdateMock(value),
    set: (value: unknown) => { calls.push(`onDisconnect.set:${target.path}`); return disconnectSetMock(value); },
    cancel: () => disconnectCancelMock(),
  })),
}));

import { FirebaseRoomStore, FirebaseTransport, toSnapRoom } from './firebase';

function emit(path: string, value: unknown) {
  for (const listener of valueListeners.get(path) ?? []) listener({ val: () => value });
}

const HOST_META = { hostId: 'uid-1', code: 'ABC234', maxPlayers: 4, status: 'waiting', createdAt: 1, updatedAt: 2 };
const HOST_PLAYERS = { 'uid-1': { id: 'uid-1', name: 'Host', connected: true, role: 'host' } };

function makeServer(overrides: Partial<SnapPairServer> = {}): SnapPairServer {
  return {
    createRoom: vi.fn().mockResolvedValue({ roomId: 'room-1', code: 'ABC234', expiresAt: 999 }),
    joinRoom: vi.fn().mockResolvedValue({ roomId: 'room-1', playerId: 'uid-2' }),
    ...overrides,
  };
}

function makeTransport(options: Partial<ConstructorParameters<typeof FirebaseTransport>[0]> = {}) {
  return new FirebaseTransport({
    db: {} as any,
    auth: { currentUser: { uid: 'uid-1' } } as any,
    server: makeServer(),
    maxPlayers: 4,
    ...options,
  });
}

beforeEach(() => {
  valueListeners.clear();
  listenerUnsubscribes.clear();
  calls.length = 0;
  for (const key of Object.keys(roomData)) delete roomData[key];
  Object.assign(roomData, { meta: HOST_META, players: HOST_PLAYERS, state: { round: 1 } });
  updateMock.mockClear();
  offMock.mockClear();
  disconnectUpdateMock.mockClear();
  disconnectSetMock.mockClear();
  disconnectCancelMock.mockClear();
  signInAnonymouslyMock.mockReset();
});

describe('toSnapRoom', () => {
  it('fills defaults for missing fields and keeps custom player properties', () => {
    const room = toSnapRoom({ meta: {}, players: { a: { score: 3 } }, state: { x: 1 } }, 'room-9', { maxPlayers: 5 });
    expect(room).toMatchObject({
      id: 'room-9', code: '', hostId: '', maxPlayers: 5, status: 'waiting', state: { x: 1 },
      players: { a: { id: 'a', name: 'PLAYER', connected: true, score: 3 } },
    });
  });

  it('uses parseGameState when provided', () => {
    const room = toSnapRoom({ meta: {}, players: {}, state: { raw: true } }, 'r', {
      maxPlayers: 2,
      parseGameState: (val) => ({ parsed: Boolean(val.state.raw) }),
    });
    expect(room?.state).toEqual({ parsed: true });
  });
});

describe('FirebaseRoomStore', () => {
  it('subscribes to the member-readable slices and waits for meta and players', () => {
    const store = new FirebaseRoomStore({} as any, 'rooms');
    const onSlices = vi.fn();
    store.subscribeRoom('room-1', onSlices, vi.fn());
    expect([...valueListeners.keys()]).toEqual(['rooms/room-1/meta', 'rooms/room-1/players', 'rooms/room-1/state']);

    emit('rooms/room-1/meta', HOST_META);
    expect(onSlices).not.toHaveBeenCalled();
    emit('rooms/room-1/players', HOST_PLAYERS);
    expect(onSlices).toHaveBeenLastCalledWith({ meta: HOST_META, players: HOST_PLAYERS });
  });

  it('releases exactly its own listeners once and ignores late callbacks', () => {
    const store = new FirebaseRoomStore({} as any, 'custom/path');
    const onSlices = vi.fn();
    const unsubscribe = store.subscribeRoom('room-1', onSlices, vi.fn());
    const lateMeta = valueListeners.get('custom/path/room-1/meta')![0];
    unsubscribe();
    unsubscribe();
    for (const slice of ['meta', 'players', 'state']) {
      expect(listenerUnsubscribes.get(`custom/path/room-1/${slice}`)).toHaveBeenCalledTimes(1);
    }
    lateMeta({ val: () => HOST_META });
    expect(onSlices).not.toHaveBeenCalled();
    expect(offMock).not.toHaveBeenCalled();
  });

  it('reads the three slices individually', async () => {
    const store = new FirebaseRoomStore({} as any);
    await expect(store.readRoom('room-1', 'test')).resolves.toEqual({
      meta: HOST_META, players: HOST_PLAYERS, state: { round: 1 },
    });
    expect(calls).toEqual(['get:rooms/room-1/meta', 'get:rooms/room-1/players', 'get:rooms/room-1/state']);
  });

  it('writes only rule-permitted own-player fields', async () => {
    const store = new FirebaseRoomStore({} as any);
    await expect(store.writeOwnPlayer('room-1', 'uid-1', { role: 'host', id: 'x' })).resolves.toBe(false);
    expect(updateMock).not.toHaveBeenCalled();

    await expect(store.writeOwnPlayer('room-1', 'uid-1', { name: 'Neo', role: 'host' })).resolves.toBe(true);
    expect(updateMock).toHaveBeenCalledWith({ path: 'rooms/room-1' }, {
      'meta/updatedAt': { '.sv': 'timestamp' },
      'players/uid-1/name': 'Neo',
    });
  });

  it('abandons the room when the host leaves and marks a participant offline otherwise', async () => {
    const store = new FirebaseRoomStore({} as any);
    await store.writeLeave('room-1', 'uid-1', true);
    await store.writeLeave('room-1', 'uid-2', false);
    expect(updateMock.mock.calls.map(([, value]) => value)).toEqual([
      { 'meta/updatedAt': { '.sv': 'timestamp' }, 'meta/status': 'abandoned' },
      { 'meta/updatedAt': { '.sv': 'timestamp' }, 'players/uid-2/connected': false },
    ]);
  });

  it('registers onDisconnect handlers before marking the player connected, and cancels them on cleanup', async () => {
    const store = new FirebaseRoomStore({} as any);
    const stop = store.registerPresence({ roomId: 'room-1', playerId: 'uid-1', isHost: true });
    emit('.info/connected', true);
    await vi.waitFor(() => expect(updateMock).toHaveBeenCalled());
    expect(calls.filter((c) => !c.startsWith('onValue'))).toEqual([
      'onDisconnect.update',
      'onDisconnect.set:rooms/room-1/meta/status',
      'onDisconnect.set',
      'update:rooms/room-1',
    ]);
    expect(disconnectUpdateMock).toHaveBeenCalledWith({ connected: false, lastSeenAt: { '.sv': 'timestamp' } });
    expect(disconnectSetMock).toHaveBeenCalledWith('abandoned');

    stop();
    stop();
    expect(offMock).toHaveBeenCalledTimes(1);
    expect(disconnectCancelMock).toHaveBeenCalledTimes(2);
  });
});

describe('FirebaseTransport', () => {
  it('declares its kind and capabilities', () => {
    const transport = makeTransport();
    expect(transport.kind).toBe('firebase');
    expect(transport.capabilities).toEqual({ messaging: false, presence: true, serverAuthoritativeJoin: true });
  });

  it('connects with the current user and follows .info/connected', async () => {
    const transport = makeTransport();
    const statuses: string[] = [];
    transport.onStatus((status) => statuses.push(status));
    await transport.connect();
    expect(transport.peerId).toBe('uid-1');
    emit('.info/connected', true);
    emit('.info/connected', false);
    emit('.info/connected', true);
    expect(statuses).toEqual(['idle', 'connecting', 'connected', 'reconnecting', 'connected']);
  });

  it('signs in anonymously when nobody is signed in', async () => {
    signInAnonymouslyMock.mockResolvedValue({ user: { uid: 'anon-1' } });
    const transport = makeTransport({ auth: { currentUser: null } as any });
    await transport.connect();
    expect(signInAnonymouslyMock).toHaveBeenCalledTimes(1);
    expect(transport.peerId).toBe('anon-1');
  });

  it('fails to connect without auth or when anonymous auth is disabled', async () => {
    const noAuth = makeTransport({ auth: undefined });
    const onError = vi.fn();
    noAuth.onError(onError);
    await expect(noAuth.connect()).rejects.toMatchObject({ code: 'auth' });
    expect(noAuth.status).toBe('error');
    expect(onError).toHaveBeenCalled();

    const noAnon = makeTransport({ auth: { currentUser: null } as any, enableAnonymousAuth: false });
    await expect(noAnon.connect()).rejects.toThrow('Sign in before creating or joining a room.');
    expect(signInAnonymouslyMock).not.toHaveBeenCalled();
  });

  it('requires connect() and a server before creating a room', async () => {
    await expect(makeTransport().createRoom({ initialState: {} })).rejects.toMatchObject({ code: 'not-connected' });
    const serverless = makeTransport({ server: undefined });
    await serverless.connect();
    await expect(serverless.createRoom({ initialState: {} })).rejects.toMatchObject({ code: 'unsupported' });
  });

  it('creates a room through the callable, then subscribes, reads, and registers presence', async () => {
    let resolveCreate!: (value: any) => void;
    const server = makeServer({ createRoom: vi.fn(() => new Promise<any>((resolve) => { resolveCreate = resolve; })) });
    const transport = makeTransport({ server, name: 'Stage', pairingCodeLifespanMs: 60000 });
    await transport.connect();
    const onRoom = vi.fn();
    transport.onRoom(onRoom);

    const pending = transport.createRoom({ initialState: { round: 0 } });
    expect(server.createRoom).toHaveBeenCalledWith({ name: 'Stage', maxPlayers: 4, ttlMs: 60000, initialState: { round: 0 } });
    await Promise.resolve();
    expect(valueListeners.has('rooms/room-1/meta')).toBe(false);

    resolveCreate({ roomId: 'room-1', code: 'ABC234', expiresAt: 999 });
    const created = await pending;
    expect(created.pairing).toEqual({ roomId: 'room-1', code: 'ABC234', expiresAt: 999 });
    expect(created.room).toMatchObject({ id: 'room-1', hostId: 'uid-1', state: { round: 1 } });
    expect(onRoom).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'room-1' }));
    expect(valueListeners.get('rooms/room-1/state')).toHaveLength(1);

    // Presence: the host registers both onDisconnect handlers once connected.
    emit('.info/connected', true);
    await vi.waitFor(() => expect(disconnectSetMock).toHaveBeenCalledWith('abandoned'));
  });

  it('does not subscribe when the create callable fails', async () => {
    const transport = makeTransport({ server: makeServer({ createRoom: vi.fn().mockRejectedValue(new Error('denied')) }) });
    await transport.connect();
    await expect(transport.createRoom({ initialState: {} })).rejects.toThrow('denied');
    expect([...valueListeners.keys()].filter((path) => path.startsWith('rooms/'))).toEqual([]);
  });

  it('rejects malformed codes without calling the server and normalizes valid ones', async () => {
    const server = makeServer();
    const transport = makeTransport({ server });
    await transport.connect();
    await expect(transport.joinRoom('nope')).rejects.toMatchObject({ code: 'invalid' });
    expect(server.joinRoom).not.toHaveBeenCalled();

    await transport.joinRoom('ab-c234', { name: 'Guest' });
    expect(server.joinRoom).toHaveBeenCalledWith({ code: 'ABC234', name: 'Guest' });
  });

  it('publishes live slice updates and ignores the previous room after switching', async () => {
    const server = makeServer({
      joinRoom: vi.fn()
        .mockResolvedValueOnce({ roomId: 'room-1', playerId: 'uid-1' })
        .mockResolvedValueOnce({ roomId: 'room-2', playerId: 'uid-1' }),
    });
    const transport = makeTransport({ server });
    await transport.connect();
    const onState = vi.fn();
    transport.onState(onState);

    await transport.joinRoom('ABC234');
    emit('rooms/room-1/meta', HOST_META);
    emit('rooms/room-1/players', HOST_PLAYERS);
    emit('rooms/room-1/state', { round: 2 });
    expect(onState).toHaveBeenLastCalledWith({ round: 2 });

    const oldMeta = valueListeners.get('rooms/room-1/meta')![0];
    await transport.joinRoom('DEF345');
    expect(listenerUnsubscribes.get('rooms/room-1/meta')).toHaveBeenCalledTimes(1);
    oldMeta({ val: () => ({ ...HOST_META, code: 'OLD234' }) });
    expect(transport.room?.id).toBe('room-2');
  });

  it('surfaces realtime listener errors through onError', async () => {
    const { onValue } = await import('firebase/database');
    const transport = makeTransport();
    await transport.connect();
    await transport.createRoom({ initialState: {} });
    const metaCall = vi.mocked(onValue).mock.calls.findLast(([target]) => (target as any).path === 'rooms/room-1/meta')!;
    const onError = vi.fn();
    transport.onError(onError);
    (metaCall[2] as (error: Error) => void)(new Error('permission_denied'));
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'Realtime connection error: permission_denied' }));
  });

  it('writes state, own player fields, and host-only status to the room', async () => {
    const transport = makeTransport();
    await transport.connect();
    await transport.createRoom({ initialState: {} });
    updateMock.mockClear();

    await transport.setState({ round: 5 });
    await transport.updateSelf({ name: 'Neo' });
    await transport.setRoomStatus('playing');
    expect(updateMock.mock.calls.map(([, value]) => value)).toEqual([
      { state: { round: 5 }, 'meta/updatedAt': { '.sv': 'timestamp' } },
      { 'meta/updatedAt': { '.sv': 'timestamp' }, 'players/uid-1/name': 'Neo' },
      { 'meta/status': 'playing', 'meta/updatedAt': { '.sv': 'timestamp' } },
    ]);
  });

  it('refuses status changes from non-hosts', async () => {
    const transport = makeTransport({ auth: { currentUser: { uid: 'uid-2' } } as any });
    await transport.connect();
    await transport.joinRoom('ABC234');
    await expect(transport.setRoomStatus('playing')).rejects.toMatchObject({ code: 'forbidden' });
  });

  it('rejects messaging because the rules expose no message path', async () => {
    const transport = makeTransport();
    await transport.connect();
    await transport.createRoom({ initialState: {} });
    await expect(transport.broadcast('tap', {})).rejects.toMatchObject({ code: 'unsupported' });
  });

  it('leaves as host by abandoning the room and releasing listeners and presence', async () => {
    const transport = makeTransport();
    await transport.connect();
    await transport.createRoom({ initialState: {} });
    emit('.info/connected', true);
    await vi.waitFor(() => expect(disconnectSetMock).toHaveBeenCalled());
    const onRoom = vi.fn();
    transport.onRoom(onRoom);
    updateMock.mockClear();

    await transport.leaveRoom();
    expect(updateMock).toHaveBeenCalledWith({ path: 'rooms/room-1' }, {
      'meta/updatedAt': { '.sv': 'timestamp' },
      'meta/status': 'abandoned',
    });
    expect(listenerUnsubscribes.get('rooms/room-1/players')).toHaveBeenCalledTimes(1);
    expect(disconnectCancelMock).toHaveBeenCalledTimes(2);
    expect(onRoom).toHaveBeenLastCalledWith(null);
  });

  it('disconnect leaves the room and stops watching the connection', async () => {
    const transport = makeTransport();
    await transport.connect();
    await transport.createRoom({ initialState: {} });
    await transport.disconnect();
    expect(transport.room).toBeNull();
    expect(transport.status).toBe('disconnected');
    expect(valueListeners.get('.info/connected') ?? []).toHaveLength(0);
  });
});
