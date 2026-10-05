import {
  ref,
  get,
  update,
  onValue,
  off,
  DataSnapshot,
  serverTimestamp,
  onDisconnect,
  type Database,
} from 'firebase/database';
import { signInAnonymously, type Auth } from 'firebase/auth';
import type { Functions } from 'firebase/functions';
import {
  TransportError,
  type CreatedRoom,
  type CreateRoomOptions,
  type JoinRoomOptions,
  type Peer,
  type Room,
  type TransportCapabilities,
  type Unsubscribe,
  type WritableRoomStatus,
} from '../core/types';
import { normalizeRoomCode, withTimeout } from '../core/utils';
import {
  createSnapPairServer,
  type CreateSnapRoomRequest,
  type CreateSnapRoomResponse,
  type JoinSnapRoomRequest,
  type JoinSnapRoomResponse,
  type SnapPairServer,
} from '../services/snapPairServer';
import { Transport } from './base';

const DEFAULT_TIMEOUT_MS = 12000;
const ROOM_SLICES = ['meta', 'players', 'state'] as const;
const OWN_PLAYER_MUTABLE_FIELDS = new Set(['name', 'connected', 'lastSeenAt']);

/** Raw values of the member-readable room slices (`rooms/{roomId}/{meta,players,state}`). */
export interface FirebaseRoomSlices {
  meta?: unknown;
  players?: unknown;
  state?: unknown;
}

export interface RoomMappingOptions<TState> {
  /** Fallback when `meta/maxPlayers` is missing. */
  maxPlayers: number;
  parseGameState?: (rawVal: any) => TState | undefined;
}

/** Maps raw RTDB slices onto the transport-agnostic `Room` shape. */
export function toSnapRoom<TPeer extends Peer, TState>(
  val: any,
  roomId: string,
  { maxPlayers, parseGameState }: RoomMappingOptions<TState>,
): Room<TPeer, TState> | null {
  if (!val) return null;
  const meta = val.meta || {};

  const playersMap = val.players || {};
  const players: Record<string, TPeer> = {};

  Object.keys(playersMap).forEach((id) => {
    const p = playersMap[id];
    players[id] = {
      id: p.id || id,
      name: p.name || 'PLAYER',
      connected: p.connected ?? true,
      ...p,
    } as TPeer;
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
}

export function callCreateRoom(
  server: SnapPairServer,
  input: CreateSnapRoomRequest,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<CreateSnapRoomResponse> {
  return withTimeout(server.createRoom(input), timeoutMs, 'createRoom: callable');
}

export function callJoinRoom(
  server: SnapPairServer,
  input: JoinSnapRoomRequest,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<JoinSnapRoomResponse> {
  return withTimeout(server.joinRoom(input), timeoutMs, 'joinRoom: callable');
}

/**
 * Stateless Realtime Database primitives for one `(db, databasePath)` pair.
 * Every client-side read and write of the snap-pair data layout lives here, so
 * paths stay in one place and match `database.rules.json`.
 */
export class FirebaseRoomStore {
  constructor(
    readonly db: Database,
    readonly databasePath = 'rooms',
    readonly timeoutMs = DEFAULT_TIMEOUT_MS,
  ) {}

  private roomRef(roomId: string) {
    return ref(this.db, `${this.databasePath}/${roomId}`);
  }

  /** Follows `.info/connected`. */
  watchConnection(listener: (connected: boolean) => void): Unsubscribe {
    const connectedRef = ref(this.db, '.info/connected');
    const handler = (snap: DataSnapshot) => {
      listener(!!snap.val());
    };
    onValue(connectedRef, handler);
    return () => {
      off(connectedRef, 'value', handler);
    };
  }

  /**
   * Listens to the member-readable slices (the room root is not readable).
   * `onSlices` fires once `meta` and `players` have both arrived, then on
   * every slice change. The returned handle releases only these listeners.
   */
  subscribeRoom(
    roomId: string,
    onSlices: (slices: FirebaseRoomSlices) => void,
    onError: (error: Error) => void,
  ): Unsubscribe {
    let active = true;
    let slices: FirebaseRoomSlices = {};
    const unsubscribes = ROOM_SLICES.map((slice) => onValue(
      ref(this.db, `${this.databasePath}/${roomId}/${slice}`),
      (snapshot: DataSnapshot) => {
        if (!active) return;
        slices = { ...slices, [slice]: snapshot.val() };
        if (slices.meta !== undefined && slices.players !== undefined) onSlices(slices);
      },
      (err) => {
        if (active) onError(err);
      },
    ));
    return () => {
      if (!active) return;
      active = false;
      unsubscribes.forEach((unsubscribeSlice) => unsubscribeSlice());
    };
  }

  async readRoom(roomId: string, label: string): Promise<FirebaseRoomSlices> {
    const [meta, players, state] = await withTimeout(Promise.all([
      get(ref(this.db, `${this.databasePath}/${roomId}/meta`)),
      get(ref(this.db, `${this.databasePath}/${roomId}/players`)),
      get(ref(this.db, `${this.databasePath}/${roomId}/state`)),
    ]), this.timeoutMs, label);
    return { meta: meta.val(), players: players.val(), state: state.val() };
  }

  /**
   * Registers presence for `playerId` each time the connection comes up:
   * `onDisconnect` handlers first (player goes offline; a host's room becomes
   * `abandoned`), and only then marks the player connected. The returned
   * handle stops listening and cancels the `onDisconnect` handlers.
   */
  registerPresence({ roomId, playerId, isHost }: { roomId: string; playerId: string; isHost: boolean }): Unsubscribe {
    let disposed = false;

    const myPlayerRef = ref(this.db, `${this.databasePath}/${roomId}/players/${playerId}`);
    const firebaseConnectedRef = ref(this.db, '.info/connected');

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
            const statusRef = ref(this.db, `${this.databasePath}/${roomId}/meta/status`);
            cancelPromises.push(onDisconnect(statusRef).set('abandoned'));
          }

          await Promise.all(cancelPromises);
          if (disposed) {
            await Promise.allSettled([
              onDisconnect(myPlayerRef).cancel(),
              ...(isHost ? [onDisconnect(ref(this.db, `${this.databasePath}/${roomId}/meta/status`)).cancel()] : []),
            ]);
            return;
          }

          // 2. Only after onDisconnect handlers are registered, set connected to true
          await update(this.roomRef(roomId), {
            [`players/${playerId}/connected`]: true,
            [`players/${playerId}/lastSeenAt`]: serverTimestamp(),
            'meta/updatedAt': serverTimestamp(),
          });
        } catch (err) {
          console.error('Failed to configure presence', err);
        }
      }
    };

    onValue(firebaseConnectedRef, handler);

    return () => {
      if (disposed) return;
      disposed = true;
      off(firebaseConnectedRef, 'value', handler);
      const cancellations = [onDisconnect(myPlayerRef).cancel()];
      if (isHost) cancellations.push(onDisconnect(ref(this.db, `${this.databasePath}/${roomId}/meta/status`)).cancel());
      void Promise.allSettled(cancellations).then((results) => {
        for (const result of results) {
          if (result.status === 'rejected') console.error('onDisconnect cancel error', result.reason);
        }
      });
    };
  }

  writeState(roomId: string, state: unknown): Promise<void> {
    return withTimeout(update(this.roomRef(roomId), {
      state,
      'meta/updatedAt': serverTimestamp(),
    }), this.timeoutMs, 'updateState: write');
  }

  /**
   * Writes only the fields the rules let a player change about themselves
   * (`name`, `connected`, `lastSeenAt`). Resolves `false` without writing when
   * nothing allowed remains.
   */
  async writeOwnPlayer(roomId: string, playerId: string, playerUpdates: Record<string, any>): Promise<boolean> {
    const safeUpdates = Object.entries(playerUpdates).filter(([key]) => OWN_PLAYER_MUTABLE_FIELDS.has(key));
    if (safeUpdates.length === 0) return false;
    const roomUpdates: Record<string, unknown> = { 'meta/updatedAt': serverTimestamp() };
    for (const [key, value] of safeUpdates) {
      roomUpdates[`players/${playerId}/${key}`] = value;
    }
    await withTimeout(update(this.roomRef(roomId), roomUpdates), this.timeoutMs, 'updateOwnPlayer: write');
    return true;
  }

  /** Host only (enforced by the rules). */
  writeRoomStatus(roomId: string, status: WritableRoomStatus): Promise<void> {
    return withTimeout(update(this.roomRef(roomId), {
      'meta/status': status,
      'meta/updatedAt': serverTimestamp(),
    }), this.timeoutMs, 'updateRoomStatus: write');
  }

  /** A leaving host abandons the room; a leaving participant goes offline. */
  writeLeave(roomId: string, playerId: string, isHost: boolean): Promise<void> {
    const updates: Record<string, any> = {
      'meta/updatedAt': serverTimestamp(),
    };

    if (isHost) {
      updates['meta/status'] = 'abandoned' as const;
    } else {
      updates[`players/${playerId}/connected`] = false;
    }

    return withTimeout(update(this.roomRef(roomId), updates), this.timeoutMs, 'leaveRoom: update');
  }
}

export interface FirebaseTransportOptions<TState> {
  db: Database;
  /** Room membership is tied to the authenticated uid. */
  auth?: Auth;
  /** Used to build the default callable server unless `server` is supplied. */
  functions?: Functions;
  server?: SnapPairServer;
  /** Sign in anonymously in `connect()` when nobody is signed in. Default: true. */
  enableAnonymousAuth?: boolean;
  /** Default: 'rooms'. */
  databasePath?: string;
  /** Default: 2. */
  maxPlayers?: number;
  /** Default: 300000 (5 minutes). */
  pairingCodeLifespanMs?: number;
  parseGameState?: (rawVal: any) => TState | undefined;
  /** Default display name for createRoom/joinRoom. */
  name?: string;
  /** Per-operation network timeout. Default: 12000. */
  timeoutMs?: number;
}

/**
 * `Transport` over Firebase Realtime Database plus the `createSnapRoom` /
 * `joinSnapRoom` callable functions. Creating and joining stay
 * server-authoritative; the client subscribes only after the server admits it.
 *
 * Phase 1 limitations: no `send`/`broadcast` (the rules expose no message
 * path), and `connect()` snapshots the auth uid — reconnect after a sign-in
 * change.
 */
export class FirebaseTransport<TPeer extends Peer = Peer, TState = any> extends Transport<TPeer, TState> {
  readonly kind = 'firebase' as const;
  readonly capabilities: TransportCapabilities = {
    messaging: false,
    presence: true,
    serverAuthoritativeJoin: true,
  };

  readonly store: FirebaseRoomStore;
  private readonly server: SnapPairServer | null;
  private readonly options: FirebaseTransportOptions<TState>;
  private uid: string | null = null;
  private stopConnectionWatch: Unsubscribe | null = null;
  private stopRoom: Unsubscribe | null = null;
  private stopPresence: Unsubscribe | null = null;
  private presenceKey = '';
  private roomGeneration = 0;

  constructor(options: FirebaseTransportOptions<TState>) {
    super();
    this.options = options;
    this.store = new FirebaseRoomStore(options.db, options.databasePath ?? 'rooms', this.timeoutMs);
    this.server = options.server ?? (options.functions ? createSnapPairServer(options.functions) : null);
  }

  /** Auth uid of this client once connected. */
  get peerId(): string | null {
    return this.uid;
  }

  private get timeoutMs(): number {
    return this.options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async connect(): Promise<void> {
    this.setStatus('connecting');
    try {
      this.uid = await this.resolveIdentity();
    } catch (error) {
      this.setStatus('error');
      const failure = error instanceof TransportError
        ? error
        : new TransportError('auth', `Auth failed: ${(error as Error)?.message ?? error}`);
      this.emitError(failure);
      throw failure;
    }

    if (!this.stopConnectionWatch) {
      let wasConnected = false;
      this.stopConnectionWatch = this.store.watchConnection((connected) => {
        if (connected) {
          wasConnected = true;
          this.setStatus('connected');
        } else {
          this.setStatus(wasConnected ? 'reconnecting' : 'connecting');
        }
      });
    }
  }

  async disconnect(): Promise<void> {
    await this.leaveRoom();
    this.stopConnectionWatch?.();
    this.stopConnectionWatch = null;
    this.setStatus('disconnected');
  }

  async createRoom({ initialState, name }: CreateRoomOptions<TState>): Promise<CreatedRoom<TPeer, TState>> {
    const server = this.requireServer();
    this.requireIdentity();
    const result = await callCreateRoom(server, {
      name: name || this.options.name || 'HOST',
      maxPlayers: this.options.maxPlayers ?? 2,
      ttlMs: this.options.pairingCodeLifespanMs ?? 300000,
      initialState,
    }, this.timeoutMs);
    const room = await this.enterRoom(result.roomId, 'createRoom: read room');
    return {
      room,
      pairing: { roomId: result.roomId, code: result.code, expiresAt: result.expiresAt },
    };
  }

  async joinRoom(code: string, { name }: JoinRoomOptions = {}): Promise<Room<TPeer, TState>> {
    const normalized = normalizeRoomCode(code);
    if (!normalized) throw new TransportError('invalid', 'Enter a room code.');
    const server = this.requireServer();
    this.requireIdentity();
    const result = await callJoinRoom(server, {
      code: normalized,
      name: name || this.options.name || 'PLAYER',
    }, this.timeoutMs);
    return this.enterRoom(result.roomId, 'joinRoom: read room');
  }

  async leaveRoom(): Promise<void> {
    const room = this.room;
    const uid = this.uid;
    this.roomGeneration += 1;
    this.stopRoom?.();
    this.stopRoom = null;
    if (room && uid) {
      try {
        await this.store.writeLeave(room.id, uid, room.hostId === uid);
      } catch (error) {
        this.emitError(error as Error);
      }
    }
    this.releasePresence();
    this.emitRoom(null);
  }

  async setState(state: TState): Promise<void> {
    await this.store.writeState(this.requireRoom().id, state);
  }

  /** Updates this client's own `name` / `connected` / `lastSeenAt`; other keys are dropped. */
  async updateSelf(updates: Partial<Pick<Peer, 'name' | 'connected'>> & { lastSeenAt?: number }): Promise<void> {
    const uid = this.requireIdentity();
    await this.store.writeOwnPlayer(this.requireRoom().id, uid, updates);
  }

  /** Host only. */
  async setRoomStatus(status: WritableRoomStatus): Promise<void> {
    const room = this.requireRoom();
    if (room.hostId !== this.uid) throw new TransportError('forbidden', 'Only the host can modify the room status.');
    await this.store.writeRoomStatus(room.id, status);
  }

  private async resolveIdentity(): Promise<string> {
    const { auth, enableAnonymousAuth = true } = this.options;
    if (!auth) throw new TransportError('auth', 'Firebase Auth is required to create or join a room.');
    if (auth.currentUser) return auth.currentUser.uid;
    if (!enableAnonymousAuth) throw new TransportError('auth', 'Sign in before creating or joining a room.');
    const credential = await withTimeout(signInAnonymously(auth), this.timeoutMs, 'connect: anonymous sign-in');
    return credential.user.uid;
  }

  private requireIdentity(): string {
    if (!this.uid) throw new TransportError('not-connected', 'Call connect() before using the room.');
    return this.uid;
  }

  private requireServer(): SnapPairServer {
    if (!this.server) throw new TransportError('unsupported', 'Firebase Functions is required to create or join a room.');
    return this.server;
  }

  private requireRoom(): Room<TPeer, TState> {
    if (!this.room) throw new TransportError('not-in-room', 'Join or create a room first.');
    return this.room;
  }

  private toRoom(slices: FirebaseRoomSlices, roomId: string) {
    return toSnapRoom<TPeer, TState>(slices, roomId, {
      maxPlayers: this.options.maxPlayers ?? 2,
      parseGameState: this.options.parseGameState,
    });
  }

  /** Subscribes after the server admitted us, then publishes the first full read. */
  private async enterRoom(roomId: string, label: string): Promise<Room<TPeer, TState>> {
    this.stopRoom?.();
    this.releasePresence();
    const generation = ++this.roomGeneration;
    this.stopRoom = this.store.subscribeRoom(roomId, (slices) => {
      if (generation !== this.roomGeneration) return;
      const room = this.toRoom(slices, roomId);
      if (room) this.applyRoom(room);
    }, (err) => {
      if (generation !== this.roomGeneration) return;
      this.emitError(new TransportError('backend', 'Realtime connection error: ' + err.message));
    });

    let room: Room<TPeer, TState> | null;
    try {
      room = this.toRoom(await this.store.readRoom(roomId, label), roomId);
    } catch (error) {
      if (generation === this.roomGeneration) {
        this.stopRoom?.();
        this.stopRoom = null;
      }
      throw error;
    }
    if (generation !== this.roomGeneration || !room) {
      throw new TransportError('not-in-room', 'The room changed while it was loading.');
    }
    this.applyRoom(room);
    return room;
  }

  private applyRoom(room: Room<TPeer, TState>): void {
    this.emitRoom(room);
    if (!this.uid) return;
    const key = `${room.id}\u0000${room.hostId}\u0000${this.uid}`;
    if (key === this.presenceKey) return;
    this.releasePresence();
    this.presenceKey = key;
    this.stopPresence = this.store.registerPresence({
      roomId: room.id,
      playerId: this.uid,
      isHost: room.hostId === this.uid,
    });
  }

  private releasePresence(): void {
    this.stopPresence?.();
    this.stopPresence = null;
    this.presenceKey = '';
  }
}
