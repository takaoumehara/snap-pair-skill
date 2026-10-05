// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createBroadcastBus } from '../testing/fakes';
import { BroadcastChannelTransport } from '../transports/broadcast';
import type { Peer } from './types';
import { useSnapPair } from './useSnapPair';

type State = { n: number };

let bus: ReturnType<typeof createBroadcastBus>;
const created: BroadcastChannelTransport[] = [];

function makeTransport(options: ConstructorParameters<typeof BroadcastChannelTransport>[0] = {}) {
  const transport = new BroadcastChannelTransport<Peer, State>({
    BroadcastChannel: bus.BroadcastChannel,
    claimWindowMs: 0,
    heartbeatMs: 1000,
    ...options,
  });
  created.push(transport);
  return transport;
}

beforeEach(() => {
  bus = createBroadcastBus();
});

afterEach(async () => {
  for (const transport of created.splice(0)) await transport.disconnect();
});

async function hostAndGuest() {
  const hostTransport = makeTransport();
  const guestTransport = makeTransport();
  const host = renderHook(() => useSnapPair<Peer, State>({ transport: hostTransport, guest: { id: '', name: 'Host' } }));
  const guest = renderHook(() => useSnapPair<Peer, State>({ transport: guestTransport, guest: { id: '', name: 'Guest' } }));
  await waitFor(() => expect(host.result.current.authReady && guest.result.current.authReady).toBe(true));
  const room = await act(() => host.result.current.createRoom({ n: 0 }));
  expect(room).not.toBeNull();
  await act(async () => { await guest.result.current.joinRoom(room!.code); });
  await waitFor(() => expect(Object.keys(host.result.current.room?.players ?? {})).toHaveLength(2));
  return { host, guest, hostTransport, guestTransport, room: room! };
}

describe('useSnapPair with a custom transport', () => {
  it('connects on mount and exposes the transport peer id', async () => {
    const transport = makeTransport();
    const onStatus = vi.fn();
    const { result } = renderHook(() => useSnapPair<Peer, State>({ transport, guest: { id: 'ignored', name: 'Host' }, onStatus }));
    expect(result.current.authReady).toBe(false);
    await waitFor(() => expect(result.current.authReady).toBe(true));
    expect(result.current.dbConnected).toBe(true);
    expect(result.current.localGuest).toEqual({ id: transport.peerId, name: 'Host' });
    expect(onStatus).toHaveBeenCalledWith('broadcast transport: connected');
    expect(result.current.room).toBeNull();
  });

  it('keeps the same return shape as Firebase mode', async () => {
    // Inline creation must use the factory form; an inline instance would be a new transport every render.
    const { result } = renderHook(() => useSnapPair<Peer, State>({ transport: () => makeTransport(), guest: { id: '', name: 'Host' } }));
    expect(Object.keys(result.current).sort()).toEqual([
      'authReady', 'createRoom', 'dbConnected', 'error', 'joinRoom', 'leaveRoom', 'loading', 'localGuest',
      'normalizeCode', 'room', 'setError', 'updateOwnPlayer', 'updateRoomStatus', 'updateState',
    ]);
    expect(result.current.normalizeCode('abc-234')).toBe('ABC234');
  });

  it('creates and joins a room, and syncs state both ways', async () => {
    const { host, guest, hostTransport, guestTransport, room } = await hostAndGuest();
    expect(room.hostId).toBe(hostTransport.peerId);
    expect(guest.result.current.room?.hostId).toBe(hostTransport.peerId);
    expect(guest.result.current.room?.players[guestTransport.peerId]?.name).toBe('Guest');

    const updated = await act(() => host.result.current.updateState({ n: 1 }));
    expect(updated?.state).toEqual({ n: 1 });
    await waitFor(() => expect(guest.result.current.room?.state).toEqual({ n: 1 }));

    // Guests propose state; the host re-broadcasts it.
    await act(async () => { await guest.result.current.updateState({ n: 2 }); });
    await waitFor(() => expect(host.result.current.room?.state).toEqual({ n: 2 }));
  });

  it('applies parseGameState to every room snapshot', async () => {
    const transport = makeTransport();
    const parse = (raw: any): State => ({ n: Number(raw?.n ?? 0) * 10 });
    const { result } = renderHook(() => useSnapPair<Peer, State>({ transport, guest: { id: '', name: 'H' }, parseGameState: parse }));
    await waitFor(() => expect(result.current.authReady).toBe(true));
    const room = await act(() => result.current.createRoom({ n: 2 }));
    expect(room?.state).toEqual({ n: 20 });
    expect(result.current.room?.state).toEqual({ n: 20 });
  });

  it('lets only the host change the room status', async () => {
    const { host, guest } = await hostAndGuest();
    const result = await act(() => host.result.current.updateRoomStatus('playing'));
    expect(result?.status).toBe('playing');
    await waitFor(() => expect(guest.result.current.room?.status).toBe('playing'));

    await act(async () => { await guest.result.current.updateRoomStatus('finished'); });
    expect(guest.result.current.error).toBe('Only the host can modify the room status.');
  });

  it('reports transports without player updates', async () => {
    const { guest } = await hostAndGuest();
    let result: unknown;
    await act(async () => { result = await guest.result.current.updateOwnPlayer({ name: 'x' }); });
    expect(result).toBeNull();
    expect(guest.result.current.error).toBe('The broadcast transport does not support player updates.');
  });

  it('surfaces transport errors for invalid codes and unknown rooms', async () => {
    const transport = makeTransport({ joinTimeoutMs: 30 });
    const { result } = renderHook(() => useSnapPair<Peer, State>({ transport, guest: { id: '', name: 'G' } }));
    await waitFor(() => expect(result.current.authReady).toBe(true));

    await act(async () => { await result.current.joinRoom(''); });
    expect(result.current.error).toBe('Enter a room code.');
    await act(async () => { await result.current.joinRoom('nope'); });
    expect(result.current.error).toBe('Enter a room code.');
    await act(async () => { await result.current.joinRoom('ABC234'); });
    expect(result.current.error).toBe('No host answered for room ABC234.');
    expect(result.current.loading).toBe(false);
  });

  it('works with PIN pairing (codes are validated by the transport, not normalizeCode)', async () => {
    const hostTransport = makeTransport({ pairing: 'pin' });
    const guestTransport = makeTransport({ pairing: 'pin' });
    const host = renderHook(() => useSnapPair<Peer, State>({ transport: hostTransport, guest: { id: '', name: 'H' } }));
    const guest = renderHook(() => useSnapPair<Peer, State>({ transport: guestTransport, guest: { id: '', name: 'G' } }));
    await waitFor(() => expect(host.result.current.authReady && guest.result.current.authReady).toBe(true));
    const room = await act(() => host.result.current.createRoom({ n: 0 }));
    expect(room?.code).toMatch(/^\d{6}$/);
    await act(async () => { await guest.result.current.joinRoom(`${room!.code.slice(0, 3)} ${room!.code.slice(3)}`); });
    expect(guest.result.current.error).toBeNull();
    expect(guest.result.current.room?.id).toBe(room!.id);
  });

  it('refuses to create before the transport is connected', async () => {
    const transport = makeTransport();
    const { result } = renderHook(() => useSnapPair<Peer, State>({ transport, guest: { id: '', name: 'H' }, autoConnect: false }));
    await act(async () => { await result.current.createRoom({ n: 0 }); });
    expect(result.current.error).toBe('Cannot create room: the transport is not connected yet.');
    expect(transport.status).toBe('idle');
  });

  it('reports connection failures', async () => {
    const transport = new BroadcastChannelTransport({ BroadcastChannel: undefined });
    vi.stubGlobal('BroadcastChannel', undefined);
    try {
      const { result } = renderHook(() => useSnapPair<Peer, State>({ transport, guest: { id: '', name: 'H' } }));
      await waitFor(() => expect(result.current.error).toMatch(/BroadcastChannel is not available/));
      expect(result.current.authReady).toBe(false);
      expect(result.current.dbConnected).toBe(false);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('leaveRoom clears the room; guests see the host close it', async () => {
    const { host, guest } = await hostAndGuest();
    await act(() => host.result.current.leaveRoom());
    expect(host.result.current.room).toBeNull();
    await waitFor(() => expect(guest.result.current.room?.status).toBe('closed'));
    await act(() => guest.result.current.leaveRoom());
    expect(guest.result.current.room).toBeNull();
  });

  it('disconnects a factory-created transport on unmount, but not a caller-owned instance', async () => {
    const factory = vi.fn(() => makeTransport());
    const owned = renderHook(() => useSnapPair<Peer, State>({ transport: factory, guest: { id: '', name: 'A' } }));
    await waitFor(() => expect(owned.result.current.authReady).toBe(true));
    owned.rerender();
    expect(factory).toHaveBeenCalledTimes(1);
    const ownedTransport = factory.mock.results[0].value as BroadcastChannelTransport;

    const instance = makeTransport();
    const shared = renderHook(() => useSnapPair<Peer, State>({ transport: instance, guest: { id: '', name: 'B' } }));
    await waitFor(() => expect(shared.result.current.authReady).toBe(true));

    owned.unmount();
    shared.unmount();
    await waitFor(() => expect(ownedTransport.status).toBe('disconnected'));
    expect(instance.status).toBe('connected');
  });

  it('throws when switching between Firebase mode and a transport', async () => {
    const transport = makeTransport();
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { rerender } = renderHook((props: { withTransport: boolean }) => useSnapPair<Peer, State>(
      (props.withTransport
        ? { transport, guest: { id: '', name: 'A' } }
        : { db: {} as any, auth: { currentUser: { uid: 'u' } } as any, guest: { id: '', name: 'A' } }) as any,
    ), { initialProps: { withTransport: true } });
    expect(() => rerender({ withTransport: false })).toThrow(/switching between Firebase mode and a custom transport/);
    errors.mockRestore();
  });
});
