import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  ref,
  get,
  update,
  onValue,
  off,
  DataSnapshot,
  serverTimestamp,
  onDisconnect,
  Database,
} from 'firebase/database';
import { Auth, onAuthStateChanged, signInAnonymously } from 'firebase/auth';
import type { Functions } from 'firebase/functions';
import { SnapPlayer, SnapRoom } from '../types';
import { createSnapPairServer, type SnapPairServer } from '../services/snapPairServer';

export function withTimeout<T>(promise: Promise<T>, ms = 12000, label = 'operation'): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Network timeout: ${label} did not respond. Check your connection and Firebase configuration.`));
    }, ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}

function normalizeCode(value: string): string {
  const code = String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/.test(code) ? code : '';
}

export interface UseSnapPairOptions<TPlayer extends SnapPlayer, TState> {
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
}

export function useSnapPair<TPlayer extends SnapPlayer, TState>({
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
}: UseSnapPairOptions<TPlayer, TState>) {
  const [room, setRoom] = useState<SnapRoom<TPlayer, TState> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dbConnected, setDbConnected] = useState(true);
  const [localGuest, setLocalGuest] = useState(guest);
  const [authReady, setAuthReady] = useState(Boolean(auth?.currentUser));
  const subscribedRef = useRef<string | null>(null);
  const subscriptionGenerationRef = useRef(0);
  const operationGenerationRef = useRef(0);
  const authUidRef = useRef(auth?.currentUser?.uid ?? null);
  const roomUnsubscribesRef = useRef<Array<() => void>>([]);
  const roomSlicesRef = useRef<{ meta?: unknown; players?: unknown; state?: unknown }>({});
  const onStatusRef = useRef(onStatus);
  useEffect(() => { onStatusRef.current = onStatus; }, [onStatus]);
  const server = useMemo(
    () => configuredServer ?? (functions ? createSnapPairServer(functions) : null),
    [configuredServer, functions],
  );

  const getRoomRef = useCallback((roomId: string) => ref(db, `${databasePath}/${roomId}`), [db, databasePath]);

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
        roomUnsubscribesRef.current.forEach((unsubscribeSlice) => unsubscribeSlice());
        roomUnsubscribesRef.current = [];
        subscriptionGenerationRef.current += 1;
        subscribedRef.current = null;
        roomSlicesRef.current = {};
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
  }, [enableAnonymousAuth, auth]);

  // Monitor connection status
  useEffect(() => {
    const connectedRef = ref(db, '.info/connected');
    const handler = (snap: DataSnapshot) => {
      setDbConnected(!!snap.val());
    };
    onValue(connectedRef, handler);
    return () => {
      off(connectedRef, 'value', handler);
    };
  }, [db]);

  // Presence & OnDisconnect Monitoring (Stale presence fix + host auto-abandoned)
  useEffect(() => {
    if (!room || !room.id || !localGuest.id) return;
    let disposed = false;

    const myPlayerRef = ref(db, `${databasePath}/${room.id}/players/${localGuest.id}`);
    const firebaseConnectedRef = ref(db, '.info/connected');
    const isHost = room.hostId === localGuest.id;

    const handler = async (snap: DataSnapshot) => {
      if (disposed) return;
      const isConnected = !!snap.val();
      if (isConnected) {
        try {
          // 1. Establish presence onDisconnect handlers FIRST to ensure stale presence is avoided
          const cancelPromises = [onDisconnect(myPlayerRef).update({
            connected: false,
            lastSeenAt: serverTimestamp(),
          })];

          if (isHost) {
            const statusRef = ref(db, `${databasePath}/${room.id}/meta/status`);
            cancelPromises.push(onDisconnect(statusRef).set('abandoned'));
          }

          await Promise.all(cancelPromises);
          if (disposed) {
            await Promise.allSettled([
              onDisconnect(myPlayerRef).cancel(),
              ...(isHost ? [onDisconnect(ref(db, `${databasePath}/${room.id}/meta/status`)).cancel()] : []),
            ]);
            return;
          }

          // 2. Only after onDisconnect handlers are registered, set connected to true
          await update(getRoomRef(room.id), {
            [`players/${localGuest.id}/connected`]: true,
            [`players/${localGuest.id}/lastSeenAt`]: serverTimestamp(),
            'meta/updatedAt': serverTimestamp(),
          });
        } catch (err) {
          console.error('Failed to configure presence', err);
        }
      }
    };

    onValue(firebaseConnectedRef, handler);

    return () => {
      disposed = true;
      off(firebaseConnectedRef, 'value', handler);
      const cancellations = [onDisconnect(myPlayerRef).cancel()];
      if (isHost) cancellations.push(onDisconnect(ref(db, `${databasePath}/${room.id}/meta/status`)).cancel());
      void Promise.allSettled(cancellations).then((results) => {
        for (const result of results) {
          if (result.status === 'rejected') console.error('onDisconnect cancel error', result.reason);
        }
      });
    };
  }, [room?.id, room?.hostId, localGuest.id, databasePath, db, getRoomRef]);

  const valueToRoom = useCallback((val: any, roomId: string): SnapRoom<TPlayer, TState> | null => {
    if (!val) return null;
    const meta = val.meta || {};

    const playersMap = val.players || {};
    const players: Record<string, TPlayer> = {};

    Object.keys(playersMap).forEach((id) => {
      const p = playersMap[id];
      players[id] = {
        id: p.id || id,
        name: p.name || 'PLAYER',
        connected: p.connected ?? true,
        ...p,
      } as TPlayer;
    });

    return {
      id: roomId,
      code: meta.code || '',
      hostId: meta.hostId || '',
      maxPlayers: meta.maxPlayers ?? maxPlayers,
      players,
      status: meta.status || 'waiting',
      createdAt: meta.createdAt || Date.now(),
      updatedAt: meta.updatedAt || Date.now(),
      state: parseGameState ? parseGameState(val) : val.state,
    };
  }, [parseGameState, maxPlayers]);

  const subscribeToRoom = useCallback((roomId: string) => {
    if (subscribedRef.current === roomId) return;

    roomUnsubscribesRef.current.forEach((unsubscribeSlice) => unsubscribeSlice());
    roomUnsubscribesRef.current = [];

    subscribedRef.current = roomId;
    const generation = ++subscriptionGenerationRef.current;
    roomSlicesRef.current = {};

    for (const slice of ['meta', 'players', 'state'] as const) {
      const unsubscribeSlice = onValue(ref(db, `${databasePath}/${roomId}/${slice}`), (snapshot: DataSnapshot) => {
        if (subscriptionGenerationRef.current !== generation || subscribedRef.current !== roomId) return;
        roomSlicesRef.current = { ...roomSlicesRef.current, [slice]: snapshot.val() };
        if (roomSlicesRef.current.meta !== undefined && roomSlicesRef.current.players !== undefined) {
          setRoom(valueToRoom(roomSlicesRef.current, roomId));
        }
      }, (err) => {
        if (subscriptionGenerationRef.current !== generation || subscribedRef.current !== roomId) return;
        setError('Realtime connection error: ' + err.message);
      });
      roomUnsubscribesRef.current.push(unsubscribeSlice);
    }
  }, [databasePath, db, valueToRoom]);

  const unsubscribe = useCallback(() => {
    if (subscribedRef.current) {
      roomUnsubscribesRef.current.forEach((unsubscribeSlice) => unsubscribeSlice());
      roomUnsubscribesRef.current = [];
      subscriptionGenerationRef.current += 1;
      subscribedRef.current = null;
      roomSlicesRef.current = {};
    }
  }, [databasePath, db]);

  useEffect(() => {
    return () => { unsubscribe(); };
  }, [unsubscribe]);

  const readRoom = useCallback(async (roomId: string, label: string) => {
    const [meta, players, state] = await withTimeout(Promise.all([
      get(ref(db, `${databasePath}/${roomId}/meta`)),
      get(ref(db, `${databasePath}/${roomId}/players`)),
      get(ref(db, `${databasePath}/${roomId}/state`)),
    ]), 12000, label);
    return valueToRoom({ meta: meta.val(), players: players.val(), state: state.val() }, roomId);
  }, [databasePath, db, valueToRoom]);

  const createRoom = useCallback(async (initialState: TState): Promise<SnapRoom<TPlayer, TState> | null> => {
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
      const result = await withTimeout(server.createRoom({
        name: localGuest.name || 'HOST',
        maxPlayers,
        ttlMs: pairingCodeLifespanMs,
        initialState,
      }), 12000, 'createRoom: callable');
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

  const joinRoom = useCallback(async (code: string): Promise<SnapRoom<TPlayer, TState> | null> => {
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
      const result = await withTimeout(server.joinRoom({
        code: normalized,
        name: localGuest.name || 'PLAYER',
      }), 12000, 'joinRoom: callable');
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
  ): Promise<SnapRoom<TPlayer, TState> | null> => {
    if (!room) return null;
    setLoading(true);
    try {
      await withTimeout(update(getRoomRef(room.id), {
        state: stateUpdates,
        'meta/updatedAt': serverTimestamp(),
      }), 12000, 'updateState: write');
      return await readRoom(room.id, 'updateState: read updated');
    } catch (e: any) {
      setError(e.message || 'State update failed');
      return null;
    } finally {
      setLoading(false);
    }
  }, [room, getRoomRef, readRoom]);

  // Fine-grained API: Update own player properties
  const updateOwnPlayer = useCallback(async (
    playerUpdates: Record<string, any>
  ): Promise<SnapRoom<TPlayer, TState> | null> => {
    if (!room || !localGuest.id) return null;
    setLoading(true);
    try {
      const mutableFields = new Set(['name', 'connected', 'lastSeenAt']);
      const safeUpdates = Object.fromEntries(
        Object.entries(playerUpdates).filter(([key]) => mutableFields.has(key)),
      );
      if (Object.keys(safeUpdates).length === 0) return room;
      const roomUpdates: Record<string, unknown> = { 'meta/updatedAt': serverTimestamp() };
      for (const [key, value] of Object.entries(safeUpdates)) {
        roomUpdates[`players/${localGuest.id}/${key}`] = value;
      }
      await withTimeout(update(getRoomRef(room.id), roomUpdates), 12000, 'updateOwnPlayer: write');
      return await readRoom(room.id, 'updateOwnPlayer: read updated');
    } catch (e: any) {
      setError(e.message || 'Player update failed');
      return null;
    } finally {
      setLoading(false);
    }
  }, [room, localGuest.id, getRoomRef, readRoom]);

  // Fine-grained API: Host updates room status
  const updateRoomStatus = useCallback(async (
    status: 'waiting' | 'playing' | 'finished' | 'abandoned'
  ): Promise<SnapRoom<TPlayer, TState> | null> => {
    if (!room) return null;
    if (room.hostId !== localGuest.id) {
      setError('Only the host can modify the room status.');
      return null;
    }
    setLoading(true);
    try {
      await withTimeout(update(getRoomRef(room.id), {
        'meta/status': status,
        'meta/updatedAt': serverTimestamp(),
      }), 12000, 'updateRoomStatus: write');
      return await readRoom(room.id, 'updateRoomStatus: read updated');
    } catch (e: any) {
      setError(e.message || 'Status update failed');
      return null;
    } finally {
      setLoading(false);
    }
  }, [room, localGuest.id, getRoomRef, readRoom]);

  // Leave Room
  const leaveRoom = useCallback(async (): Promise<void> => {
    unsubscribe();
    if (room) {
      try {
        const roomRef = getRoomRef(room.id);
        const isHost = room.hostId === localGuest.id;
        const updates: Record<string, any> = {
          'meta/updatedAt': serverTimestamp(),
        };

        if (isHost) {
          updates['meta/status'] = 'abandoned' as const;
        } else {
          updates[`players/${localGuest.id}/connected`] = false;
        }

        await withTimeout(update(roomRef, updates), 12000, 'leaveRoom: update');
      } catch (err) {
        console.error('Failed to update room status on leave:', err);
      }
    }
    setRoom(null);
  }, [room, localGuest.id, getRoomRef, unsubscribe]);

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
