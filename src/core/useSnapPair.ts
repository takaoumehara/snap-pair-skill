import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { Database } from 'firebase/database';
import { Auth, onAuthStateChanged, signInAnonymously } from 'firebase/auth';
import type { Functions } from 'firebase/functions';
import type { Peer, Room } from './types';
import { normalizeRoomCode } from './utils';
import { useTransportSnapPair, type SnapPairApi, type UseSnapPairTransportOptions } from './useTransportSnapPair';
import { createSnapPairServer, type SnapPairServer } from '../services/snapPairServer';
import {
  callCreateRoom,
  callJoinRoom,
  FirebaseRoomStore,
  toSnapRoom,
  type FirebaseRoomSlices,
} from '../transports/firebase';

export { withTimeout } from './utils';
export type { SnapPairApi, SnapPairTransportSource, UseSnapPairTransportOptions } from './useTransportSnapPair';

const normalizeCode = normalizeRoomCode;

export interface UseSnapPairOptions<TPlayer extends Peer, TState> {
  db: Database; // Injected Firebase Realtime Database instance
  auth?: Auth; // Required at runtime: room membership is tied to the authenticated uid
  functions?: Functions; // Required unless a custom server adapter is supplied
  server?: SnapPairServer;
  guest: { id: string; name: string };
  enableAnonymousAuth?: boolean; // Toggles auto anonymous authentication
  databasePath?: string; // Default: 'rooms'
  maxPlayers?: number; // Supports scaling up to 300
  pairingCodeLifespanMs?: number; // Default: 300000 (5 minutes)
  onStatus?: (msg: string) => void;
  parseGameState?: (rawVal: any) => TState | undefined;
  /** Firebase mode: leave unset. Pass a `Transport` to use `UseSnapPairTransportOptions` instead. */
  transport?: undefined;
}

/**
 * React hook for one snap-pair room.
 *
 * - **Firebase (default):** pass `db`/`auth`/`functions` exactly as before;
 *   behavior and return shape are unchanged.
 * - **Any transport:** pass `transport` (an instance or a factory), e.g.
 *   `useSnapPair({ transport: () => new BroadcastChannelTransport(), guest })`.
 *   See `UseSnapPairTransportOptions`.
 *
 * The mode is fixed for the lifetime of the component; remount (e.g. with a
 * `key`) to switch between Firebase and a custom transport.
 */
export function useSnapPair<TPlayer extends Peer, TState>(options: UseSnapPairOptions<TPlayer, TState>): SnapPairApi<TPlayer, TState>;
export function useSnapPair<TPlayer extends Peer, TState>(options: UseSnapPairTransportOptions<TPlayer, TState>): SnapPairApi<TPlayer, TState>;
export function useSnapPair<TPlayer extends Peer, TState>(
  options: UseSnapPairOptions<TPlayer, TState> | UseSnapPairTransportOptions<TPlayer, TState>,
): SnapPairApi<TPlayer, TState> {
  const usesTransport = Boolean(options.transport);
  const modeRef = useRef(usesTransport);
  if (modeRef.current !== usesTransport) {
    throw new Error('useSnapPair: switching between Firebase mode and a custom transport is not supported; remount the component (e.g. change its key).');
  }
  return usesTransport
    ? useTransportSnapPair(options as UseSnapPairTransportOptions<TPlayer, TState>)
    : useFirebaseSnapPair(options as UseSnapPairOptions<TPlayer, TState>);
}

/**
 * React adapter for the Firebase transport. All Realtime Database I/O goes
 * through `FirebaseRoomStore` (src/transports/firebase.ts); this hook owns the
 * auth lifecycle, React state, and the guards that drop stale async results.
 */
function useFirebaseSnapPair<TPlayer extends Peer, TState>({
  db,
  auth,
  functions,
  server: configuredServer,
  guest,
  enableAnonymousAuth = true,
  databasePath = 'rooms',
  maxPlayers = 2,
  pairingCodeLifespanMs = 300000,
  onStatus,
  parseGameState,
}: UseSnapPairOptions<TPlayer, TState>): SnapPairApi<TPlayer, TState> {
  const [room, setRoom] = useState<Room<TPlayer, TState> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dbConnected, setDbConnected] = useState(true);
  const [localGuest, setLocalGuest] = useState(guest);
  const [authReady, setAuthReady] = useState(Boolean(auth?.currentUser));
  const subscribedRef = useRef<string | null>(null);
  const subscriptionGenerationRef = useRef(0);
  const operationGenerationRef = useRef(0);
  const authUidRef = useRef(auth?.currentUser?.uid ?? null);
  const roomUnsubscribeRef = useRef<(() => void) | null>(null);
  const onStatusRef = useRef(onStatus);
  useEffect(() => { onStatusRef.current = onStatus; }, [onStatus]);
  const server = useMemo(
    () => configuredServer ?? (functions ? createSnapPairServer(functions) : null),
    [configuredServer, functions],
  );

  const store = useMemo(() => new FirebaseRoomStore(db, databasePath), [db, databasePath]);

  const releaseRoomSubscription = useCallback(() => {
    roomUnsubscribeRef.current?.();
    roomUnsubscribeRef.current = null;
  }, []);

  // Handle Anonymous Authentication if enabled
  useEffect(() => {
    let disposed = false;
    let signInFlight = false;

    if (!auth) {
      setAuthReady(false);
      setError('Firebase Auth is required to create or join a room.');
      return;
    }

    const startAnonymousSignIn = () => {
      if (!enableAnonymousAuth || signInFlight || disposed) return;
      signInFlight = true;
      setLoading(true);
      void signInAnonymously(auth)
        .then((cred) => {
          if (!disposed && cred.user) {
            onStatusRef.current?.(`Authenticated anonymously as ${cred.user.uid}`);
          }
        })
        .catch((err) => {
          if (!disposed) setError(`Auth failed: ${err.message}`);
        })
        .finally(() => {
          signInFlight = false;
          if (!disposed) setLoading(false);
        });
    };

    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (disposed) return;
      const nextUid = user?.uid ?? null;
      if (authUidRef.current !== nextUid) {
        authUidRef.current = nextUid;
        operationGenerationRef.current += 1;
        releaseRoomSubscription();
        subscriptionGenerationRef.current += 1;
        subscribedRef.current = null;
        setRoom(null);
      }
      if (user) {
        setLocalGuest((prev) => ({ ...prev, id: user.uid }));
        setAuthReady(true);
        setError((current) => current?.startsWith('Auth failed:') ? null : current);
      } else {
        setLocalGuest((prev) => ({ ...prev, id: '' }));
        setAuthReady(false);
        if (enableAnonymousAuth) startAnonymousSignIn();
        else setError('Sign in before creating or joining a room.');
      }
    });

    return () => {
      disposed = true;
      unsubscribeAuth();
    };
  }, [enableAnonymousAuth, auth, releaseRoomSubscription]);

  // Monitor connection status
  useEffect(() => store.watchConnection(setDbConnected), [store]);

  // Presence & OnDisconnect Monitoring (Stale presence fix + host auto-abandoned)
  useEffect(() => {
    if (!room || !room.id || !localGuest.id) return;
    return store.registerPresence({
      roomId: room.id,
      playerId: localGuest.id,
      isHost: room.hostId === localGuest.id,
    });
  }, [room?.id, room?.hostId, localGuest.id, store]);

  const valueToRoom = useCallback(
    (val: FirebaseRoomSlices, roomId: string) => toSnapRoom<TPlayer, TState>(val, roomId, { maxPlayers, parseGameState }),
    [parseGameState, maxPlayers],
  );

  const subscribeToRoom = useCallback((roomId: string) => {
    if (subscribedRef.current === roomId) return;

    releaseRoomSubscription();

    subscribedRef.current = roomId;
    const generation = ++subscriptionGenerationRef.current;
    const isCurrent = () => subscriptionGenerationRef.current === generation && subscribedRef.current === roomId;

    roomUnsubscribeRef.current = store.subscribeRoom(roomId, (slices) => {
      if (!isCurrent()) return;
      setRoom(valueToRoom(slices, roomId));
    }, (err) => {
      if (!isCurrent()) return;
      setError('Realtime connection error: ' + err.message);
    });
  }, [store, valueToRoom, releaseRoomSubscription]);

  const unsubscribe = useCallback(() => {
    if (subscribedRef.current) {
      releaseRoomSubscription();
      subscriptionGenerationRef.current += 1;
      subscribedRef.current = null;
    }
    // `store` is a dependency so switching db/databasePath tears down the old subscription.
  }, [store, releaseRoomSubscription]);

  useEffect(() => {
    return () => { unsubscribe(); };
  }, [unsubscribe]);

  const readRoom = useCallback(
    async (roomId: string, label: string) => valueToRoom(await store.readRoom(roomId, label), roomId),
    [store, valueToRoom],
  );

  const createRoom = useCallback(async (initialState: TState): Promise<Room<TPlayer, TState> | null> => {
    if (!authReady) {
      setError('Cannot create room: Authentication is still in progress.');
      return null;
    }
    if (!server) {
      setError('Firebase Functions is required to create a room.');
      return null;
    }

    setLoading(true);
    setError(null);
    const operationUid = authUidRef.current;
    const operationGeneration = operationGenerationRef.current;
    try {
      const result = await callCreateRoom(server, {
        name: localGuest.name || 'HOST',
        maxPlayers,
        ttlMs: pairingCodeLifespanMs,
        initialState,
      });
      if (authUidRef.current !== operationUid || operationGenerationRef.current !== operationGeneration) {
        throw new Error('Authentication identity changed while creating the room. Please try again.');
      }
      subscribeToRoom(result.roomId);
      const created = await readRoom(result.roomId, 'createRoom: read room');
      if (authUidRef.current !== operationUid || operationGenerationRef.current !== operationGeneration) return null;
      return created;
    } catch (e: any) {
      setError(e.message || 'Could not create room');
      return null;
    } finally {
      setLoading(false);
    }
  }, [authReady, server, localGuest.name, maxPlayers, pairingCodeLifespanMs, subscribeToRoom, readRoom]);

  const joinRoom = useCallback(async (code: string): Promise<Room<TPlayer, TState> | null> => {
    if (!authReady) {
      setError('Cannot join room: Authentication is still in progress.');
      return null;
    }

    const normalized = normalizeCode(code);
    if (!normalized) {
      setError('Enter a room code.');
      return null;
    }
    if (!server) {
      setError('Firebase Functions is required to join a room.');
      return null;
    }

    setLoading(true);
    setError(null);
    const operationUid = authUidRef.current;
    const operationGeneration = operationGenerationRef.current;
    try {
      const result = await callJoinRoom(server, {
        code: normalized,
        name: localGuest.name || 'PLAYER',
      });
      if (authUidRef.current !== operationUid || operationGenerationRef.current !== operationGeneration) {
        throw new Error('Authentication identity changed while joining the room. Please try again.');
      }
      subscribeToRoom(result.roomId);
      const joinedRoom = await readRoom(result.roomId, 'joinRoom: read room');
      if (authUidRef.current !== operationUid || operationGenerationRef.current !== operationGeneration) return null;
      return joinedRoom;
    } catch (e: any) {
      setError(e.message || 'Could not join room');
      return null;
    } finally {
      setLoading(false);
    }
  }, [authReady, server, localGuest.name, subscribeToRoom, readRoom]);

  // Fine-grained API: Update shared game state
  const updateState = useCallback(async (
    stateUpdates: TState
  ): Promise<Room<TPlayer, TState> | null> => {
    if (!room) return null;
    setLoading(true);
    try {
      await store.writeState(room.id, stateUpdates);
      return await readRoom(room.id, 'updateState: read updated');
    } catch (e: any) {
      setError(e.message || 'State update failed');
      return null;
    } finally {
      setLoading(false);
    }
  }, [room, store, readRoom]);

  // Fine-grained API: Update own player properties
  const updateOwnPlayer = useCallback(async (
    playerUpdates: Record<string, any>
  ): Promise<Room<TPlayer, TState> | null> => {
    if (!room || !localGuest.id) return null;
    setLoading(true);
    try {
      const written = await store.writeOwnPlayer(room.id, localGuest.id, playerUpdates);
      if (!written) return room;
      return await readRoom(room.id, 'updateOwnPlayer: read updated');
    } catch (e: any) {
      setError(e.message || 'Player update failed');
      return null;
    } finally {
      setLoading(false);
    }
  }, [room, localGuest.id, store, readRoom]);

  // Fine-grained API: Host updates room status
  const updateRoomStatus = useCallback(async (
    status: 'waiting' | 'playing' | 'finished' | 'abandoned'
  ): Promise<Room<TPlayer, TState> | null> => {
    if (!room) return null;
    if (room.hostId !== localGuest.id) {
      setError('Only the host can modify the room status.');
      return null;
    }
    setLoading(true);
    try {
      await store.writeRoomStatus(room.id, status);
      return await readRoom(room.id, 'updateRoomStatus: read updated');
    } catch (e: any) {
      setError(e.message || 'Status update failed');
      return null;
    } finally {
      setLoading(false);
    }
  }, [room, localGuest.id, store, readRoom]);

  // Leave Room
  const leaveRoom = useCallback(async (): Promise<void> => {
    unsubscribe();
    if (room) {
      try {
        await store.writeLeave(room.id, localGuest.id, room.hostId === localGuest.id);
      } catch (err) {
        console.error('Failed to update room status on leave:', err);
      }
    }
    setRoom(null);
  }, [room, localGuest.id, store, unsubscribe]);

  return {
    room,
    loading,
    error,
    setError,
    dbConnected,
    localGuest,
    authReady, // Exported to check authentication lifecycle
    createRoom,
    joinRoom,
    updateState, // Granular API
    updateOwnPlayer, // Granular API
    updateRoomStatus, // Granular API
    leaveRoom,
    normalizeCode,
  };
}
