import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import type { Transport } from '../transports/base';
import type { ConnectionStatus, Peer, Room, WritableRoomStatus } from './types';
import { normalizeRoomCode } from './utils';

/** What `useSnapPair` returns, in Firebase mode and with a custom transport alike. */
export interface SnapPairApi<TPlayer extends Peer, TState> {
  room: Room<TPlayer, TState> | null;
  loading: boolean;
  error: string | null;
  setError: Dispatch<SetStateAction<string | null>>;
  /** Firebase: `.info/connected`. Custom transport: `transport.status === 'connected'`. */
  dbConnected: boolean;
  localGuest: { id: string; name: string };
  /** Firebase: signed in. Custom transport: connected (or reconnecting). */
  authReady: boolean;
  createRoom(initialState: TState): Promise<Room<TPlayer, TState> | null>;
  joinRoom(code: string): Promise<Room<TPlayer, TState> | null>;
  updateState(stateUpdates: TState): Promise<Room<TPlayer, TState> | null>;
  updateOwnPlayer(playerUpdates: Record<string, any>): Promise<Room<TPlayer, TState> | null>;
  updateRoomStatus(status: 'waiting' | 'playing' | 'finished' | 'abandoned'): Promise<Room<TPlayer, TState> | null>;
  leaveRoom(): Promise<void>;
  normalizeCode(value: string): string;
}

/** A transport instance (caller-owned) or a factory (hook-owned: created once, disconnected on unmount). */
export type SnapPairTransportSource<TPlayer extends Peer, TState> =
  | Transport<TPlayer, TState>
  | (() => Transport<TPlayer, TState>);

export interface UseSnapPairTransportOptions<TPlayer extends Peer, TState> {
  /**
   * Backend for the room. An instance stays owned by the caller (the hook
   * only subscribes); a factory is called once and the hook disconnects the
   * transport on unmount. Use the instance form when you also need
   * `transport.broadcast()` / `onMessage()` for ephemeral input; keep it
   * stable (`useState(() => new X())`), because a new instance re-subscribes
   * and reconnects. To create one inline, pass a factory instead.
   */
  transport: SnapPairTransportSource<TPlayer, TState>;
  /** Display name for `createRoom`/`joinRoom`; `id` is replaced by the transport's peer id once connected. */
  guest: { id: string; name: string };
  /** Call `transport.connect()` on mount when it is idle or disconnected. Default: true. */
  autoConnect?: boolean;
  onStatus?: (msg: string) => void;
  /** Maps `room.state` before it reaches React (same role as in Firebase mode). */
  parseGameState?: (rawVal: any) => TState | undefined;
  db?: undefined;
}

/** The transport's own id for this client: relay transports expose `peerId`, Firebase exposes `uid`. */
function transportPeerId(transport: Transport<any, any>): string | undefined {
  const candidate = transport as unknown as { peerId?: unknown; uid?: unknown };
  if (typeof candidate.peerId === 'string' && candidate.peerId) return candidate.peerId;
  if (typeof candidate.uid === 'string' && candidate.uid) return candidate.uid;
  return undefined;
}

const messageOf = (error: unknown, fallback: string) =>
  (error instanceof Error && error.message) || (typeof error === 'string' && error) || fallback;

/**
 * `useSnapPair` over any `Transport` (BroadcastChannel, PartyKit, WebRTC,
 * Firebase, or your own). Internal: reached through `useSnapPair({ transport })`.
 */
export function useTransportSnapPair<TPlayer extends Peer, TState>({
  transport: source,
  guest,
  autoConnect = true,
  onStatus,
  parseGameState,
}: UseSnapPairTransportOptions<TPlayer, TState>): SnapPairApi<TPlayer, TState> {
  const ownedRef = useRef<Transport<TPlayer, TState> | null>(null);
  const owned = typeof source === 'function';
  if (owned && !ownedRef.current) ownedRef.current = source();
  const transport = owned ? ownedRef.current! : source;

  const parseRef = useRef(parseGameState);
  parseRef.current = parseGameState;
  const onStatusRef = useRef(onStatus);
  useEffect(() => { onStatusRef.current = onStatus; }, [onStatus]);

  const mapRoom = useCallback((value: Room<TPlayer, TState> | null): Room<TPlayer, TState> | null => {
    if (!value) return null;
    const parse = parseRef.current;
    return parse ? { ...value, state: parse(value.state) } : value;
  }, []);

  const [status, setStatus] = useState<ConnectionStatus>(transport.status);
  const [room, setRoom] = useState<Room<TPlayer, TState> | null>(() => mapRoom(transport.room));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [peerId, setPeerId] = useState(() => transportPeerId(transport));
  /** Bumped by leaveRoom (and transport changes) so late create/join results are dropped. */
  const generationRef = useRef(0);

  useEffect(() => {
    let disposed = false;
    generationRef.current += 1;
    setRoom(mapRoom(transport.room));
    setPeerId(transportPeerId(transport));

    const unsubscribes = [
      transport.onStatus((next) => {
        if (disposed) return;
        setStatus(next);
        if (next === 'connected') setPeerId(transportPeerId(transport));
        onStatusRef.current?.(`${transport.kind} transport: ${next}`);
      }),
      transport.onRoom((next) => { if (!disposed) setRoom(mapRoom(next)); }),
      transport.onError((err) => { if (!disposed) setError(err.message); }),
    ];

    if (autoConnect && (transport.status === 'idle' || transport.status === 'disconnected')) {
      transport.connect().then(
        () => { if (!disposed) setPeerId(transportPeerId(transport)); },
        (err: unknown) => { if (!disposed) setError(messageOf(err, 'Could not connect')); },
      );
    }

    return () => {
      disposed = true;
      for (const unsubscribe of unsubscribes) unsubscribe();
      if (owned) void transport.disconnect().catch(() => undefined);
    };
    // `owned` is derived from `source`'s kind; a factory is only ever called once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transport, autoConnect, mapRoom]);

  const authReady = status === 'connected' || status === 'reconnecting';
  const localGuest = { id: peerId ?? guest.id, name: guest.name };
  const localId = localGuest.id;

  const run = useCallback(async <T,>(
    fallback: string,
    action: () => Promise<T>,
  ): Promise<T | null> => {
    const generation = generationRef.current;
    setLoading(true);
    setError(null);
    try {
      const result = await action();
      return generation === generationRef.current ? result : null;
    } catch (err) {
      if (generation === generationRef.current) setError(messageOf(err, fallback));
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const createRoom = useCallback(async (initialState: TState) => {
    if (!authReady) {
      setError('Cannot create room: the transport is not connected yet.');
      return null;
    }
    return run('Could not create room', async () => {
      const { room: created } = await transport.createRoom({ initialState, name: guest.name || 'HOST' });
      return mapRoom(created);
    });
  }, [authReady, run, transport, guest.name, mapRoom]);

  const joinRoom = useCallback(async (code: string) => {
    if (!authReady) {
      setError('Cannot join room: the transport is not connected yet.');
      return null;
    }
    if (!String(code ?? '').trim()) {
      setError('Enter a room code.');
      return null;
    }
    // Codes are validated by the transport: relay transports may expect a numeric PIN instead of a room code.
    return run('Could not join room', async () => mapRoom(await transport.joinRoom(code, { name: guest.name || 'PLAYER' })));
  }, [authReady, run, transport, guest.name, mapRoom]);

  const updateState = useCallback(async (state: TState) => {
    if (!room) return null;
    return run('State update failed', async () => {
      await transport.setState(state);
      return mapRoom(transport.room);
    });
  }, [room, run, transport, mapRoom]);

  const updateOwnPlayer = useCallback(async (playerUpdates: Record<string, any>) => {
    if (!room || !localId) return null;
    const updateSelf = (transport as unknown as { updateSelf?: (u: Record<string, any>) => Promise<void> }).updateSelf;
    if (typeof updateSelf !== 'function') {
      setError(`The ${transport.kind} transport does not support player updates.`);
      return null;
    }
    return run('Player update failed', async () => {
      await updateSelf.call(transport, playerUpdates);
      return mapRoom(transport.room);
    });
  }, [room, localId, run, transport, mapRoom]);

  const updateRoomStatus = useCallback(async (next: 'waiting' | 'playing' | 'finished' | 'abandoned') => {
    if (!room) return null;
    if (room.hostId !== localId) {
      setError('Only the host can modify the room status.');
      return null;
    }
    const setRoomStatus = (transport as unknown as { setRoomStatus?: (s: WritableRoomStatus) => Promise<void> }).setRoomStatus;
    if (typeof setRoomStatus !== 'function') {
      setError(`The ${transport.kind} transport does not support room status.`);
      return null;
    }
    return run('Status update failed', async () => {
      await setRoomStatus.call(transport, next);
      return mapRoom(transport.room);
    });
  }, [room, localId, run, transport, mapRoom]);

  const leaveRoom = useCallback(async () => {
    generationRef.current += 1;
    try {
      await transport.leaveRoom();
    } catch (err) {
      console.error('Failed to leave the room:', err);
    }
    setRoom(null);
  }, [transport]);

  return {
    room,
    loading,
    error,
    setError,
    dbConnected: status === 'connected',
    localGuest,
    authReady,
    createRoom,
    joinRoom,
    updateState,
    updateOwnPlayer,
    updateRoomStatus,
    leaveRoom,
    normalizeCode: normalizeRoomCode,
  };
}
