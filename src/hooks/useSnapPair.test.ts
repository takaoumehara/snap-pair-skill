// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SnapPairServer } from '../services/snapPairServer';

let authListener: ((user: { uid: string } | null) => void) | undefined;
const roomListeners = new Map<string, (snapshot: any) => void>();
const infoListeners = new Set<(snapshot: any) => void>();
const updateMock = vi.fn().mockResolvedValue(undefined);
const disconnectSetMock = vi.fn().mockResolvedValue(undefined);
const disconnectUpdateMock = vi.fn().mockResolvedValue(undefined);
const disconnectCancelMock = vi.fn().mockResolvedValue(undefined);
const listenerUnsubscribes: ReturnType<typeof vi.fn>[] = [];
const offMock = vi.fn();
const signInAnonymouslyMock = vi.fn();

vi.mock('firebase/auth', () => ({
  onAuthStateChanged: vi.fn((_auth, listener) => {
    authListener = listener;
    listener((_auth as any).currentUser);
    return vi.fn();
  }),
  signInAnonymously: (...args: any[]) => signInAnonymouslyMock(...args),
}));

vi.mock('firebase/database', () => ({
  ref: (_db: unknown, path = '') => ({ path }),
  get: vi.fn(async () => ({ val: () => ({
    meta: { hostId: 'uid-1', code: 'ABC234', maxPlayers: 2, status: 'waiting', createdAt: 1, updatedAt: 1 },
    players: { 'uid-1': { id: 'uid-1', name: 'Host', connected: true } },
    state: {},
  }) })),
  update: (...args: any[]) => updateMock(...args),
  onValue: vi.fn((target: { path: string }, listener: (snapshot: any) => void) => {
    if (target.path === '.info/connected') infoListeners.add(listener);
    else roomListeners.set(target.path, listener);
    const unsubscribe = vi.fn();
    listenerUnsubscribes.push(unsubscribe);
    return unsubscribe;
  }),
  off: (...args: any[]) => offMock(...args),
  serverTimestamp: () => ({ '.sv': 'timestamp' }),
  onDisconnect: vi.fn(() => ({
    set: (...args: any[]) => disconnectSetMock(...args),
    update: (...args: any[]) => disconnectUpdateMock(...args),
    cancel: (...args: any[]) => disconnectCancelMock(...args),
  })),
}));

import { useSnapPair } from './useSnapPair';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function options(server: SnapPairServer, auth: any = { currentUser: { uid: 'uid-1' } }) {
  return { db: {} as any, auth, server, guest: { id: 'stale-id', name: 'Host' } };
}

beforeEach(() => {
  authListener = undefined;
  roomListeners.clear();
  infoListeners.clear();
  updateMock.mockClear();
  disconnectSetMock.mockReset().mockResolvedValue(undefined);
  disconnectUpdateMock.mockReset().mockResolvedValue(undefined);
  disconnectCancelMock.mockReset().mockResolvedValue(undefined);
  signInAnonymouslyMock.mockReset();
  listenerUnsubscribes.length = 0;
  offMock.mockReset();
});

describe('useSnapPair secure lifecycle', () => {
  it('subscribes only after create callable succeeds', async () => {
    const pending = deferred<any>();
    const server = { createRoom: vi.fn(() => pending.promise), joinRoom: vi.fn() } as any;
    const opts = { ...options(server), enableAnonymousAuth: false };
    const { result } = renderHook(() => useSnapPair(opts));

    let operation!: Promise<any>;
    act(() => { operation = result.current.createRoom({}); });
    expect([...roomListeners.keys()]).toEqual([]);

    await act(async () => { pending.resolve({ roomId: 'room-1', code: 'ABC234', expiresAt: 10 }); await operation; });
    expect([...roomListeners.keys()]).toEqual([
      'rooms/room-1/meta', 'rooms/room-1/players', 'rooms/room-1/state',
    ]);
  });

  it('does not subscribe when callable fails', async () => {
    const server = { createRoom: vi.fn().mockRejectedValue(new Error('denied')), joinRoom: vi.fn() } as any;
    const opts = options(server);
    const { result } = renderHook(() => useSnapPair(opts));
    await act(async () => { await result.current.createRoom({}); });
    expect([...roomListeners.keys()]).toEqual([]);
  });

  it('passes a normalized six-character code and subscribes only after join succeeds', async () => {
    const pending = deferred<any>();
    const server = { createRoom: vi.fn(), joinRoom: vi.fn(() => pending.promise) } as any;
    const opts = options(server);
    const { result } = renderHook(() => useSnapPair(opts));

    let operation!: Promise<any>;
    act(() => { operation = result.current.joinRoom('ab-c234'); });

    expect(server.joinRoom).toHaveBeenCalledWith({ code: 'ABC234', name: 'Host' });
    expect([...roomListeners.keys()]).toEqual([]);

    await act(async () => {
      pending.resolve({ roomId: 'room-1', playerId: 'uid-1' });
      await operation;
    });
    expect([...roomListeners.keys()]).toEqual([
      'rooms/room-1/meta', 'rooms/room-1/players', 'rooms/room-1/state',
    ]);
  });

  it('does not subscribe when the join callable fails', async () => {
    const server = { createRoom: vi.fn(), joinRoom: vi.fn().mockRejectedValue(new Error('denied')) } as any;
    const opts = options(server);
    const { result } = renderHook(() => useSnapPair(opts));

    await act(async () => { await result.current.joinRoom('ABC234'); });

    expect([...roomListeners.keys()]).toEqual([]);
  });

  it('tracks auth sign-out and uid changes', async () => {
    const server = { createRoom: vi.fn(), joinRoom: vi.fn() } as any;
    const opts = { ...options(server), enableAnonymousAuth: false };
    const { result } = renderHook(() => useSnapPair(opts));
    expect(result.current.localGuest.id).toBe('uid-1');

    act(() => authListener?.(null));
    expect(result.current.authReady).toBe(false);
    act(() => authListener?.({ uid: 'uid-2' }));
    expect(result.current.authReady).toBe(true);
    expect(result.current.localGuest.id).toBe('uid-2');
  });

  it('clears the active room and subscriptions when auth uid changes', async () => {
    const server = { createRoom: vi.fn().mockResolvedValue({ roomId: 'room-1', code: 'ABC234', expiresAt: 10 }), joinRoom: vi.fn() } as any;
    const opts = { ...options(server), enableAnonymousAuth: false };
    const { result } = renderHook(() => useSnapPair(opts));
    await act(async () => { await result.current.createRoom({}); });
    const unsubscribes = listenerUnsubscribes.slice(-3);
    act(() => authListener?.({ uid: 'uid-2' }));
    expect(result.current.room).toBeNull();
    expect(unsubscribes.every((fn) => fn.mock.calls.length === 1)).toBe(true);
  });

  it('ignores an in-flight create completion after auth uid changes', async () => {
    const pending = deferred<any>();
    const server = { createRoom: vi.fn(() => pending.promise), joinRoom: vi.fn() } as any;
    const opts = { ...options(server), enableAnonymousAuth: false };
    const { result } = renderHook(() => useSnapPair(opts));
    let operation!: Promise<any>;
    act(() => { operation = result.current.createRoom({}); });
    act(() => authListener?.({ uid: 'uid-2' }));
    await act(async () => { pending.resolve({ roomId: 'room-old', code: 'ABC234', expiresAt: 10 }); await operation; });
    expect([...roomListeners.keys()]).toEqual([]);
    expect(result.current.error).toMatch(/identity changed/i);
  });

  it('does not finish in-flight anonymous auth after unmount', async () => {
    const pending = deferred<any>();
    signInAnonymouslyMock.mockReturnValue(pending.promise);
    const onStatus = vi.fn();
    const server = { createRoom: vi.fn(), joinRoom: vi.fn() } as any;
    const opts = { ...options(server, { currentUser: null }), onStatus };
    const { unmount } = renderHook(() => useSnapPair(opts));
    unmount();
    await act(async () => { pending.resolve({ user: { uid: 'late-user' } }); await pending.promise; });
    expect(onStatus).not.toHaveBeenCalled();
  });

  it('does not complete presence writes after cleanup', async () => {
    const gate = deferred<void>();
    disconnectSetMock.mockReturnValue(gate.promise);
    const server = { createRoom: vi.fn().mockResolvedValue({ roomId: 'room-1', code: 'ABC234', expiresAt: 10 }), joinRoom: vi.fn() } as any;
    const opts = options(server);
    const { result, unmount } = renderHook(() => useSnapPair(opts));
    await act(async () => { await result.current.createRoom({}); });
    act(() => {
      roomListeners.get('rooms/room-1/meta')?.({ val: () => ({
        hostId: 'uid-1', code: 'ABC234', maxPlayers: 2, status: 'waiting', createdAt: 1, updatedAt: 1,
      }) });
      roomListeners.get('rooms/room-1/players')?.({ val: () => ({
        'uid-1': { id: 'uid-1', name: 'Host', connected: true },
      }) });
      roomListeners.get('rooms/room-1/state')?.({ val: () => ({}) });
    });
    await waitFor(() => expect(infoListeners.size).toBeGreaterThan(1));
    await act(async () => {
      [...infoListeners].at(-1)?.({ val: () => true });
      await Promise.resolve();
    });
    unmount();
    await act(async () => { gate.resolve(); await gate.promise; });
    expect(updateMock).not.toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      'players/uid-1/connected': true,
    }));
  });

  it('does not expose generic updateRoom', () => {
    const server = { createRoom: vi.fn(), joinRoom: vi.fn() } as any;
    const opts = options(server);
    const { result } = renderHook(() => useSnapPair(opts));
    expect(result.current).not.toHaveProperty('updateRoom');
  });

  it('does not restart anonymous sign-in when onStatus identity changes', () => {
    const pending = deferred<any>();
    signInAnonymouslyMock.mockReturnValue(pending.promise);
    const server = { createRoom: vi.fn(), joinRoom: vi.fn() } as any;
    const base = options(server, { currentUser: null });
    let currentOnStatus = vi.fn();
    const { rerender } = renderHook(() => useSnapPair({ ...base, onStatus: currentOnStatus }));
    currentOnStatus = vi.fn();
    rerender();
    act(() => authListener?.(null));
    expect(signInAnonymouslyMock).toHaveBeenCalledTimes(1);
  });

  it('normalizes only six characters from the server alphabet', () => {
    const server = { createRoom: vi.fn(), joinRoom: vi.fn() } as any;
    const opts = options(server);
    const { result } = renderHook(() => useSnapPair(opts));
    expect(result.current.normalizeCode('ab-c234')).toBe('ABC234');
    expect(result.current.normalizeCode('ABC23O')).toBe('');
    expect(result.current.normalizeCode('ABC2345')).toBe('');
  });

  it('releases only its own slice listeners when switching rooms', async () => {
    const server = {
      createRoom: vi.fn().mockResolvedValue({ roomId: 'room-1', code: 'ABC234', expiresAt: 10 }),
      joinRoom: vi.fn().mockResolvedValue({ roomId: 'room-2', playerId: 'uid-1' }),
    } as any;
    const opts = options(server);
    const { result } = renderHook(() => useSnapPair(opts));
    await act(async () => { await result.current.createRoom({}); });
    const roomOneUnsubscribes = listenerUnsubscribes.slice(-3);
    await act(async () => { await result.current.joinRoom('ABC234'); });
    expect(roomOneUnsubscribes.every((unsubscribe) => unsubscribe.mock.calls.length === 1)).toBe(true);
    expect(offMock).not.toHaveBeenCalledWith(expect.objectContaining({ path: expect.stringContaining('rooms/room-1/') }));
  });

  it('ignores late callbacks from the previously subscribed room', async () => {
    const server = {
      createRoom: vi.fn().mockResolvedValue({ roomId: 'room-1', code: 'ABC234', expiresAt: 10 }),
      joinRoom: vi.fn().mockResolvedValue({ roomId: 'room-2', playerId: 'uid-1' }),
    } as any;
    const opts = options(server);
    const { result } = renderHook(() => useSnapPair(opts));
    await act(async () => { await result.current.createRoom({}); });
    const oldMeta = roomListeners.get('rooms/room-1/meta')!;
    const oldPlayers = roomListeners.get('rooms/room-1/players')!;
    await act(async () => { await result.current.joinRoom('ABC234'); });
    act(() => {
      roomListeners.get('rooms/room-2/meta')?.({ val: () => ({ hostId: 'uid-2', code: 'DEF345' }) });
      roomListeners.get('rooms/room-2/players')?.({ val: () => ({ 'uid-2': { id: 'uid-2', name: 'New' } }) });
      oldMeta({ val: () => ({ hostId: 'uid-1', code: 'OLD234' }) });
      oldPlayers({ val: () => ({ 'uid-1': { id: 'uid-1', name: 'Old' } }) });
    });
    expect(result.current.room?.id).toBe('room-2');
    expect(result.current.room?.code).toBe('DEF345');
  });

  it('registers one atomic disconnect update on the player root', async () => {
    const server = { createRoom: vi.fn().mockResolvedValue({ roomId: 'room-1', code: 'ABC234', expiresAt: 10 }), joinRoom: vi.fn() } as any;
    const opts = options(server);
    const { result } = renderHook(() => useSnapPair(opts));
    await act(async () => { await result.current.createRoom({}); });
    act(() => {
      roomListeners.get('rooms/room-1/meta')?.({ val: () => ({ hostId: 'uid-1' }) });
      roomListeners.get('rooms/room-1/players')?.({ val: () => ({ 'uid-1': { id: 'uid-1', name: 'Host' } }) });
    });
    await waitFor(() => expect(infoListeners.size).toBeGreaterThan(1));
    await act(async () => { [...infoListeners].at(-1)?.({ val: () => true }); });
    expect(disconnectUpdateMock).toHaveBeenCalledWith({
      connected: false,
      lastSeenAt: { '.sv': 'timestamp' },
    });
    expect(disconnectSetMock).not.toHaveBeenCalledWith(false);
  });

  it('does not write updatedAt when updateOwnPlayer has no allowed fields', async () => {
    const server = { createRoom: vi.fn().mockResolvedValue({ roomId: 'room-1', code: 'ABC234', expiresAt: 10 }), joinRoom: vi.fn() } as any;
    const opts = options(server);
    const { result } = renderHook(() => useSnapPair(opts));
    await act(async () => { await result.current.createRoom({}); });
    act(() => {
      roomListeners.get('rooms/room-1/meta')?.({ val: () => ({ hostId: 'uid-1' }) });
      roomListeners.get('rooms/room-1/players')?.({ val: () => ({ 'uid-1': { id: 'uid-1', name: 'Host' } }) });
    });
    const writesBefore = updateMock.mock.calls.length;
    await act(async () => { await result.current.updateOwnPlayer({ role: 'host', id: 'spoofed' }); });
    expect(updateMock).toHaveBeenCalledTimes(writesBefore);
  });
});
