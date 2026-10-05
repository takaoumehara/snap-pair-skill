import {
  TransportError,
  type CreatedRoom,
  type CreateRoomOptions,
  type JoinRoomOptions,
  type PairingInfo,
  type Peer,
  type PeerRole,
  type Room,
  type RoomStatus,
  type TransportCapabilities,
  type TransportMessage,
  type WritableRoomStatus,
} from '../core/types';
import { buildJoinUrl, createId, generateRoomCode, normalizeRoomCode } from '../core/utils';
import { deriveRoomId, generatePin, isValidPin, normalizePin } from '../pairing/pin';
import { Transport } from './base';
import { decodeWire, WIRE_VERSION, type LeaveReason, type WireBody, type WireMessage } from './protocol';

const MAX_CLAIM_ATTEMPTS = 5;
const MAX_NAME_LENGTH = 80;

/** Callbacks a link reports into; the relay engine ignores calls from links it has replaced. */
export interface RelayLinkHandlers {
  /** A frame arrived (object or JSON text); it is validated with `decodeWire`. */
  onFrame(raw: unknown): void;
  /** The link came back after `onClose` (e.g. a socket reconnected). */
  onOpen(): void;
  /** The link dropped and may come back by itself. */
  onClose(): void;
  /** Hub links (WebRTC host): the direct channel to one peer closed. */
  onPeerGone(peerId: string): void;
}

/** One room's connection to the medium. */
export interface RelayLink {
  send(frame: WireMessage): void;
  close(): void;
}

/** Where a room lives on the medium, and what users type to reach it. */
export interface RelayRoomTarget {
  roomKey: string;
  code: string;
  pin?: string;
  joinUrl?: string;
  expiresAt?: number;
}

export interface RelayTransportOptions {
  /** Default display name for `createRoom` / `joinRoom`. */
  name?: string;
  /** Room capacity including the host. Default: 8. */
  maxPlayers?: number;
  /**
   * What hosts issue and guests type: a six-character room code (`'code'`,
   * default) or a six-digit numeric PIN (`'pin'`). Host and guests must agree.
   */
  pairing?: 'code' | 'pin';
  /** Mixed into the derived room key so apps sharing a relay or browser never collide. Default: `'snap-pair'`. */
  namespace?: string;
  /** When set, `PairingInfo.joinUrl` is this URL with `?room=<code>` (or `?pin=<pin>`). */
  joinBaseUrl?: string;
  /** Heartbeat interval. Default: 2000 ms. */
  heartbeatMs?: number;
  /** A peer silent for this long is dropped by the host (or shown disconnected, for the host). Default: 3 × heartbeat. */
  peerTimeoutMs?: number;
  /** How long `joinRoom` waits for the host to admit this peer. Default: 8000 ms. */
  joinTimeoutMs?: number;
  /** How long a new host listens for an existing host on the same key before claiming it. 0 disables. Default: 250 ms. */
  claimWindowMs?: number;
  /** Let guests propose shared state with `setState`. Default: true. */
  allowGuestState?: boolean;
  /** Host-side admission hook; return false to reject a peer. Capacity is checked first. */
  admit?: (peer: { id: string; name: string }) => boolean | Promise<boolean>;
  /** Fixed peer id (e.g. to survive reloads). Default: random. */
  peerId?: string;
}

interface PendingJoin<TPeer extends Peer, TState> {
  resolve(room: Room<TPeer, TState>): void;
  reject(error: Error): void;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const toError = (error: unknown): Error => (error instanceof Error ? error : new Error(String(error)));

const cleanName = (name: unknown, fallback: string): string =>
  (typeof name === 'string' ? name.trim().slice(0, MAX_NAME_LENGTH) : '') || fallback;

/**
 * Shared engine for transports where one browser (the host) is authoritative
 * and the medium only moves frames: BroadcastChannel, PartyKit, and WebRTC
 * DataChannels. It implements the wire protocol in `./protocol.ts`: admission
 * (`hello` -> `join`), roster and state fan-out, heartbeats and timeouts, room
 * claiming, and messaging. Subclasses only open a `RelayLink` per room.
 *
 * Trust model: there is no server-side admission (`serverAuthoritativeJoin:
 * false`). Anyone who can reach the room key can ask to join; use `admit` to
 * gate peers. The host ignores state and messages from non-members.
 */
export abstract class RelayTransport<TPeer extends Peer = Peer, TState = any> extends Transport<TPeer, TState> {
  readonly capabilities: TransportCapabilities = {
    messaging: true,
    presence: true,
    serverAuthoritativeJoin: false,
  };

  /** This client's peer id on the medium. */
  readonly peerId: string;

  /** Hub media (WebRTC star) need the host to forward guest messages to other guests. */
  protected readonly hostForwards: boolean = false;

  protected readonly relayOptions: Required<Omit<RelayTransportOptions, 'name' | 'admit' | 'joinBaseUrl' | 'peerId'>>
    & Pick<RelayTransportOptions, 'name' | 'admit' | 'joinBaseUrl'>;

  private role: PeerRole | null = null;
  private roomKey: string | null = null;
  private link: RelayLink | null = null;
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private readonly lastSeen = new Map<string, number>();
  private readonly admitting = new Set<string>();
  private hostSeenAt = 0;
  private guestName = '';
  private pendingJoin: PendingJoin<TPeer, TState> | null = null;
  private claim: { taken: boolean } | null = null;
  /** Bumped on every room change so late async work and stale links are ignored. */
  private session = 0;

  constructor(options: RelayTransportOptions = {}, defaults: Partial<RelayTransportOptions> = {}) {
    super();
    const merged = { ...defaults, ...options };
    const heartbeatMs = merged.heartbeatMs ?? 2000;
    this.peerId = merged.peerId || createId();
    this.relayOptions = {
      name: merged.name,
      admit: merged.admit,
      joinBaseUrl: merged.joinBaseUrl,
      maxPlayers: merged.maxPlayers ?? 8,
      pairing: merged.pairing ?? 'code',
      namespace: merged.namespace ?? 'snap-pair',
      heartbeatMs,
      peerTimeoutMs: merged.peerTimeoutMs ?? heartbeatMs * 3,
      joinTimeoutMs: merged.joinTimeoutMs ?? 8000,
      claimWindowMs: merged.claimWindowMs ?? 250,
      allowGuestState: merged.allowGuestState ?? true,
    };
  }

  // ---- Subclass hooks ------------------------------------------------------

  /** Feature-detects and loads whatever the medium needs; throw `TransportError('unsupported')` if it can't work. */
  protected abstract prepare(): Promise<void>;

  /** Opens the medium for one room. Resolve once frames can be sent. */
  protected abstract openLink(roomKey: string, role: PeerRole, handlers: RelayLinkHandlers): Promise<RelayLink>;

  /** Picks a room for a new host. Default: a fresh code or PIN hashed into a key. */
  protected async allocateHostRoom(): Promise<RelayRoomTarget> {
    const { pairing, namespace, joinBaseUrl } = this.relayOptions;
    if (pairing === 'pin') {
      const pin = generatePin();
      return {
        roomKey: await deriveRoomId(pin, { namespace, kind: 'pin' }),
        code: pin,
        pin,
        joinUrl: joinBaseUrl ? buildJoinUrl(joinBaseUrl, pin, 'pin') : undefined,
      };
    }
    const code = generateRoomCode();
    return {
      roomKey: await deriveRoomId(code, { namespace, kind: 'code' }),
      code,
      joinUrl: joinBaseUrl ? buildJoinUrl(joinBaseUrl, code) : undefined,
    };
  }

  /** Maps what a guest typed onto a room. Throws `TransportError('invalid')` for malformed input. */
  protected async resolveGuestRoom(input: string): Promise<RelayRoomTarget> {
    const { pairing, namespace } = this.relayOptions;
    if (pairing === 'pin') {
      const pin = normalizePin(input);
      if (!isValidPin(pin)) throw new TransportError('invalid', 'Enter a six-digit PIN.');
      return { roomKey: await deriveRoomId(pin, { namespace, kind: 'pin' }), code: pin, pin };
    }
    const code = normalizeRoomCode(input);
    if (!code) throw new TransportError('invalid', 'Enter a room code.');
    return { roomKey: await deriveRoomId(code, { namespace, kind: 'code' }), code };
  }

  /** Called by every `leaveRoom()` after the link is closed (e.g. to leave a signaling room); must be idempotent. */
  protected async releaseRoom(): Promise<void> {}

  /** Called by `disconnect()` after leaving the room. */
  protected async teardown(): Promise<void> {}

  // ---- Lifecycle -----------------------------------------------------------

  async connect(): Promise<void> {
    if (this.status === 'connected' || this.status === 'reconnecting') return;
    this.setStatus('connecting');
    try {
      await this.prepare();
    } catch (error) {
      const failure = error instanceof TransportError ? error : new TransportError('backend', toError(error).message);
      this.setStatus('error');
      this.emitError(failure);
      throw failure;
    }
    this.setStatus('connected');
  }

  async disconnect(): Promise<void> {
    await this.leaveRoom();
    try {
      await this.teardown();
    } catch (error) {
      this.emitError(toError(error));
    }
    this.setStatus('disconnected');
  }

  // ---- Rooms ---------------------------------------------------------------

  async createRoom({ initialState, name }: CreateRoomOptions<TState>): Promise<CreatedRoom<TPeer, TState>> {
    this.requireConnected();
    await this.leaveRoom();
    const session = this.session;
    const hostName = cleanName(name ?? this.relayOptions.name, 'HOST');

    for (let attempt = 0; attempt < MAX_CLAIM_ATTEMPTS; attempt += 1) {
      const target = await this.allocateHostRoom();
      this.assertSession(session);
      await this.attachLink(target.roomKey, 'host', session);

      if (this.relayOptions.claimWindowMs > 0) {
        const claim = { taken: false };
        this.claim = claim;
        this.post({ t: 'hello', role: 'host', name: hostName });
        await sleep(this.relayOptions.claimWindowMs);
        this.assertSession(session);
        this.claim = null;
        if (claim.taken) {
          this.detachLink();
          continue;
        }
      }

      const now = Date.now();
      const host = { id: this.peerId, name: hostName, connected: true, role: 'host' } as TPeer;
      const room: Room<TPeer, TState> = {
        id: target.roomKey,
        code: target.code,
        hostId: this.peerId,
        maxPlayers: this.relayOptions.maxPlayers,
        players: { [this.peerId]: host },
        status: 'waiting',
        createdAt: now,
        updatedAt: now,
        state: initialState,
      };
      this.emitRoom(room);
      this.startHeartbeat(session);
      this.post({ t: 'join', peer: host, snapshot: room });

      const pairing: PairingInfo = { roomId: target.roomKey, code: target.code };
      if (target.pin) pairing.pin = target.pin;
      if (target.joinUrl) pairing.joinUrl = target.joinUrl;
      if (target.expiresAt) pairing.expiresAt = target.expiresAt;
      return { room, pairing };
    }

    await this.leaveRoom();
    throw new TransportError('backend', 'Every generated room code was already in use; try again.');
  }

  async joinRoom(code: string, { name }: JoinRoomOptions = {}): Promise<Room<TPeer, TState>> {
    this.requireConnected();
    await this.leaveRoom();
    const session = this.session;
    const target = await this.resolveGuestRoom(code);
    this.assertSession(session);
    this.guestName = cleanName(name ?? this.relayOptions.name, 'PLAYER');

    try {
      await this.attachLink(target.roomKey, 'participant', session);
    } catch (error) {
      if (session === this.session) await this.leaveRoom();
      throw error;
    }

    const { joinTimeoutMs, heartbeatMs } = this.relayOptions;
    return new Promise<Room<TPeer, TState>>((resolve, reject) => {
      const sayHello = () => this.post({ t: 'hello', role: 'participant', name: this.guestName });
      const retry = setInterval(sayHello, Math.min(1000, heartbeatMs));
      const settle = () => {
        clearInterval(retry);
        clearTimeout(timer);
        this.pendingJoin = null;
      };
      const timer = setTimeout(
        () => this.failJoin(new TransportError('backend', `No host answered for room ${target.code}.`)),
        joinTimeoutMs,
      );
      this.pendingJoin = {
        resolve: (room) => { settle(); resolve(room); },
        reject: (error) => { settle(); reject(error); },
      };
      sayHello();
    });
  }

  async leaveRoom(): Promise<void> {
    this.session += 1;
    const pending = this.pendingJoin;
    this.pendingJoin = null;
    pending?.reject(new TransportError('not-in-room', 'Left the room before the host admitted this peer.'));

    if (this.room && this.link) {
      this.post({ t: 'leave', peerId: this.peerId, reason: this.role === 'host' ? 'closed' : 'left' });
    }
    this.detachLink();
    this.role = null;
    this.roomKey = null;
    this.claim = null;
    this.admitting.clear();
    try {
      await this.releaseRoom();
    } catch (error) {
      this.emitError(toError(error));
    }
    this.emitRoom(null);
  }

  /** Host: applies and broadcasts. Guest: proposes to the host, which re-broadcasts it (unless `allowGuestState` is off there). */
  async setState(state: TState): Promise<void> {
    const room = this.requireRoom();
    if (this.role === 'host') {
      this.applyHostState({ state });
    } else {
      this.post({ t: 'state', state, updatedAt: Date.now() }, room.hostId);
    }
  }

  /** Host only. */
  async setRoomStatus(status: WritableRoomStatus): Promise<void> {
    this.requireRoom();
    if (this.role !== 'host') throw new TransportError('forbidden', 'Only the host can modify the room status.');
    this.applyHostState({ status });
  }

  /** True when this client created the current room. */
  get isHost(): boolean {
    return this.role === 'host' && Boolean(this.room);
  }

  protected deliver(message: TransportMessage): Promise<void> {
    this.post({ t: 'message', message: { ...message, from: this.peerId } }, message.to);
    return Promise.resolve();
  }

  // ---- Link plumbing -------------------------------------------------------

  private async attachLink(roomKey: string, role: PeerRole, session: number): Promise<void> {
    this.role = role;
    this.roomKey = roomKey;
    const link = await this.openLink(roomKey, role, {
      onFrame: (raw) => { if (session === this.session) this.receive(raw); },
      onOpen: () => { if (session === this.session) this.handleLinkOpen(); },
      onClose: () => { if (session === this.session && this.status === 'connected') this.setStatus('reconnecting'); },
      onPeerGone: (peerId) => { if (session === this.session && this.role === 'host') this.dropPeer(peerId, 'disconnected'); },
    });
    if (session !== this.session) {
      link.close();
      this.assertSession(session);
    }
    this.link = link;
  }

  private detachLink(): void {
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.heartbeat = null;
    this.lastSeen.clear();
    const link = this.link;
    this.link = null;
    try {
      link?.close();
    } catch (error) {
      this.emitError(toError(error));
    }
  }

  private handleLinkOpen(): void {
    if (this.status === 'reconnecting') this.setStatus('connected');
    const room = this.room;
    if (!room) return;
    // Re-announce: the relay may have forgotten us, and peers may have dropped us meanwhile.
    if (this.role === 'host') this.post({ t: 'join', peer: room.players[this.peerId], snapshot: room });
    else this.post({ t: 'hello', role: 'participant', name: this.guestName });
  }

  private post(body: WireBody, to?: string): void {
    if (!this.link || !this.roomKey) return;
    const frame = { ...body, v: WIRE_VERSION, room: this.roomKey, from: this.peerId } as WireMessage;
    if (to) frame.to = to;
    try {
      this.link.send(frame);
    } catch (error) {
      this.emitError(new TransportError('backend', `Send failed: ${toError(error).message}`));
    }
  }

  // ---- Receiving -----------------------------------------------------------

  private receive(raw: unknown): void {
    const frame = decodeWire(raw);
    if (!frame || frame.room !== this.roomKey || frame.from === this.peerId) return;
    if (frame.to && frame.to !== this.peerId) {
      if (this.role === 'host' && this.hostForwards && frame.t === 'message' && this.room?.players[frame.from]) {
        this.link?.send(frame);
      }
      return;
    }
    if (this.role === 'host') this.receiveAsHost(frame);
    else this.receiveAsGuest(frame);
  }

  private receiveAsHost(frame: WireMessage): void {
    if (frame.t === 'hello' && frame.role === 'host') {
      // Another host is claiming our key (or we are both claiming it): tell it to pick another.
      this.post({ t: 'leave', peerId: frame.from, reason: 'taken' }, frame.from);
      return;
    }
    if (frame.t === 'leave' && frame.reason === 'taken' && frame.peerId === this.peerId) {
      if (this.claim) this.claim.taken = true;
      return;
    }

    const room = this.room;
    if (!room) return;
    const isMember = Boolean(room.players[frame.from]);
    if (isMember) this.lastSeen.set(frame.from, Date.now());

    switch (frame.t) {
      case 'hello':
        void this.admit(frame.from, frame.name);
        return;
      case 'leave':
        if (isMember && frame.peerId === frame.from) {
          this.dropPeer(frame.from, frame.reason === 'disconnected' ? 'disconnected' : 'left');
        }
        return;
      case 'state':
        if (isMember && this.relayOptions.allowGuestState) this.applyHostState({ state: frame.state as TState });
        return;
      case 'message':
        if (!isMember) return;
        if (this.hostForwards && !frame.to) this.link?.send(frame);
        this.emitMessage({ ...frame.message, from: frame.from });
        return;
      case 'ping':
        // A peer we dropped is still alive: tell it, so it says hello again.
        if (!isMember) this.post({ t: 'leave', peerId: frame.from, reason: 'timeout' }, frame.from);
        return;
      default:
        return;
    }
  }

  private async admit(peerId: string, rawName: string): Promise<void> {
    const session = this.session;
    let room = this.requireRoom();
    const existing = room.players[peerId];
    if (!existing) {
      if (this.admitting.has(peerId)) return;
      if (Object.keys(room.players).length >= room.maxPlayers) {
        this.post({ t: 'leave', peerId, reason: 'full' }, peerId);
        return;
      }
      const { admit } = this.relayOptions;
      if (admit) {
        this.admitting.add(peerId);
        let allowed = false;
        try {
          allowed = await admit({ id: peerId, name: cleanName(rawName, 'PLAYER') });
        } catch (error) {
          this.emitError(toError(error));
        } finally {
          this.admitting.delete(peerId);
        }
        if (session !== this.session || !this.room) return;
        if (!allowed) {
          this.post({ t: 'leave', peerId, reason: 'rejected' }, peerId);
          return;
        }
        room = this.room;
        if (!room.players[peerId] && Object.keys(room.players).length >= room.maxPlayers) {
          this.post({ t: 'leave', peerId, reason: 'full' }, peerId);
          return;
        }
      }
    }

    const peer = {
      ...room.players[peerId],
      id: peerId,
      name: cleanName(rawName, 'PLAYER'),
      connected: true,
      role: 'participant',
    } as TPeer;
    this.lastSeen.set(peerId, Date.now());
    const next = { ...room, players: { ...room.players, [peerId]: peer }, updatedAt: Date.now() };
    this.emitRoom(next);
    this.post({ t: 'join', peer, snapshot: next });
  }

  private dropPeer(peerId: string, reason: LeaveReason): void {
    const room = this.room;
    if (!room || peerId === this.peerId || !room.players[peerId]) return;
    const players = { ...room.players };
    delete players[peerId];
    this.lastSeen.delete(peerId);
    this.emitRoom({ ...room, players, updatedAt: Date.now() });
    this.post({ t: 'leave', peerId, reason });
  }

  private applyHostState(change: { state?: TState; status?: RoomStatus }): void {
    const room = this.requireRoom();
    const next: Room<TPeer, TState> = { ...room, updatedAt: Date.now() };
    if ('state' in change) next.state = change.state;
    if (change.status) next.status = change.status;
    this.emitRoom(next);
    this.post({ t: 'state', state: next.state, status: next.status, updatedAt: next.updatedAt });
  }

  private receiveAsGuest(frame: WireMessage): void {
    const pending = this.pendingJoin;
    if (pending && frame.t === 'join' && frame.peer.id === this.peerId) {
      this.hostSeenAt = Date.now();
      this.emitRoom(frame.snapshot as Room<TPeer, TState>);
      this.startHeartbeat(this.session);
      pending.resolve(frame.snapshot as Room<TPeer, TState>);
      return;
    }
    if (pending && frame.t === 'leave' && frame.peerId === this.peerId && frame.reason !== 'timeout') {
      this.failJoin(new TransportError('forbidden', frame.reason === 'full' ? 'The room is full.' : 'The host declined the join request.'));
      return;
    }

    const room = this.room;
    if (!room) return;
    const fromHost = frame.from === room.hostId;

    if (frame.t === 'leave' && frame.peerId === room.hostId) {
      this.setHostConnected(false, frame.reason === 'closed' ? 'closed' : undefined);
      return;
    }
    if (fromHost) {
      this.hostSeenAt = Date.now();
      if (room.players[room.hostId]?.connected === false) this.setHostConnected(true);
    }

    switch (frame.t) {
      case 'join':
        if (fromHost) this.emitRoom(frame.snapshot as Room<TPeer, TState>);
        return;
      case 'leave': {
        if (!fromHost) return; // Only the host's view of the roster counts.
        if (frame.peerId === this.peerId) {
          if (frame.reason === 'timeout' || frame.reason === 'disconnected') {
            this.post({ t: 'hello', role: 'participant', name: this.guestName });
          } else {
            this.emitError(new TransportError('forbidden', 'The host removed this peer from the room.'));
            void this.leaveRoom();
          }
          return;
        }
        const current = this.room!;
        if (!current.players[frame.peerId]) return;
        const players = { ...current.players };
        delete players[frame.peerId];
        this.emitRoom({ ...current, players });
        return;
      }
      case 'state':
        if (!fromHost) return;
        this.emitRoom({
          ...this.room!,
          state: frame.state as TState,
          status: frame.status ?? this.room!.status,
          updatedAt: frame.updatedAt,
        });
        return;
      case 'message':
        this.emitMessage({ ...frame.message, from: frame.from });
        return;
      default:
        return;
    }
  }

  /** Rejects the pending `joinRoom` and tears the half-open room down. */
  private failJoin(error: Error): void {
    const pending = this.pendingJoin;
    if (!pending) return;
    this.pendingJoin = null;
    pending.reject(error);
    void this.leaveRoom();
  }

  private setHostConnected(connected: boolean, status?: RoomStatus): void {
    const room = this.room;
    if (!room) return;
    const host = room.players[room.hostId];
    if (!host || (host.connected === connected && !status)) return;
    this.emitRoom({
      ...room,
      status: status ?? (connected && room.status === 'closed' ? 'waiting' : room.status),
      players: { ...room.players, [room.hostId]: { ...host, connected } },
    });
  }

  // ---- Heartbeat -----------------------------------------------------------

  private startHeartbeat(session: number): void {
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.heartbeat = setInterval(() => {
      if (session === this.session) this.tick();
    }, this.relayOptions.heartbeatMs);
  }

  private tick(): void {
    this.post({ t: 'ping' });
    const room = this.room;
    if (!room) return;
    const now = Date.now();
    const { peerTimeoutMs } = this.relayOptions;
    if (this.role === 'host') {
      for (const id of Object.keys(room.players)) {
        if (id !== this.peerId && now - (this.lastSeen.get(id) ?? 0) > peerTimeoutMs) this.dropPeer(id, 'timeout');
      }
    } else if (room.players[room.hostId]?.connected && now - this.hostSeenAt > peerTimeoutMs) {
      this.setHostConnected(false);
    }
  }

  // ---- Guards --------------------------------------------------------------

  private requireConnected(): void {
    if (this.status !== 'connected' && this.status !== 'reconnecting') {
      throw new TransportError('not-connected', 'Call connect() before using the room.');
    }
  }

  private requireRoom(): Room<TPeer, TState> {
    if (!this.room) throw new TransportError('not-in-room', 'Join or create a room first.');
    return this.room;
  }

  private assertSession(session: number): void {
    if (session !== this.session) throw new TransportError('not-in-room', 'The room changed while it was loading.');
  }
}
