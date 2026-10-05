import {
  TransportError,
  type ConnectionStatus,
  type CreatedRoom,
  type CreateRoomOptions,
  type JoinRoomOptions,
  type Peer,
  type Room,
  type TransportCapabilities,
  type TransportKind,
  type TransportMessage,
  type Unsubscribe,
} from '../core/types';

type Listener<T> = (value: T) => void;

/**
 * Backend-agnostic room transport. Subclasses implement the abstract methods
 * and report changes through the protected `setStatus` / `emit*` helpers; the
 * base class owns listener bookkeeping so every transport behaves the same:
 *
 * - `on*` returns an idempotent unsubscribe handle.
 * - A throwing listener never prevents other listeners from running.
 * - `onStatus` and `onRoom` replay the current value to new listeners.
 */
export abstract class Transport<TPeer extends Peer = Peer, TState = any> {
  abstract readonly kind: TransportKind;
  abstract readonly capabilities: TransportCapabilities;

  private currentStatus: ConnectionStatus = 'idle';
  private currentRoom: Room<TPeer, TState> | null = null;
  private readonly statusListeners = new Set<Listener<ConnectionStatus>>();
  private readonly roomListeners = new Set<Listener<Room<TPeer, TState> | null>>();
  private readonly stateListeners = new Set<Listener<TState | undefined>>();
  private readonly peerListeners = new Set<Listener<TPeer[]>>();
  private readonly messageListeners = new Set<Listener<TransportMessage>>();
  private readonly errorListeners = new Set<Listener<Error>>();

  // ---- Lifecycle -----------------------------------------------------------

  /** Establishes the backend link (and identity, where the backend needs one). */
  abstract connect(): Promise<void>;

  /** Leaves the current room (best effort) and releases every backend resource. */
  abstract disconnect(): Promise<void>;

  // ---- Rooms ---------------------------------------------------------------

  abstract createRoom(options: CreateRoomOptions<TState>): Promise<CreatedRoom<TPeer, TState>>;

  /** `code` is whatever the pairing method produced (room code, PIN, ...). */
  abstract joinRoom(code: string, options?: JoinRoomOptions): Promise<Room<TPeer, TState>>;

  abstract leaveRoom(): Promise<void>;

  /** Replaces the shared room state. */
  abstract setState(state: TState): Promise<void>;

  // ---- Messaging -----------------------------------------------------------

  /** Sends a message to one peer (`message.to`) or, without `to`, to every peer. */
  async send<TPayload>(message: TransportMessage<TPayload>): Promise<void> {
    if (!this.capabilities.messaging) {
      throw new TransportError('unsupported', `The ${this.kind} transport does not support messaging.`);
    }
    if (!this.currentRoom) throw new TransportError('not-in-room', 'Join or create a room before sending messages.');
    await this.deliver({ ...message, sentAt: message.sentAt ?? Date.now() });
  }

  broadcast<TPayload>(type: string, payload: TPayload): Promise<void> {
    return this.send({ type, payload });
  }

  /** Transports with `capabilities.messaging` override this to put a message on the wire. */
  protected deliver(_message: TransportMessage): Promise<void> {
    return Promise.reject(new TransportError('unsupported', `The ${this.kind} transport does not support messaging.`));
  }

  // ---- Observable state ----------------------------------------------------

  get status(): ConnectionStatus {
    return this.currentStatus;
  }

  get room(): Room<TPeer, TState> | null {
    return this.currentRoom;
  }

  get peers(): TPeer[] {
    return this.currentRoom ? Object.values(this.currentRoom.players) : [];
  }

  onStatus(listener: Listener<ConnectionStatus>): Unsubscribe {
    const unsubscribe = this.addListener(this.statusListeners, listener);
    this.invoke(listener, this.currentStatus);
    return unsubscribe;
  }

  onRoom(listener: Listener<Room<TPeer, TState> | null>): Unsubscribe {
    const unsubscribe = this.addListener(this.roomListeners, listener);
    if (this.currentRoom) this.invoke(listener, this.currentRoom);
    return unsubscribe;
  }

  onState(listener: Listener<TState | undefined>): Unsubscribe {
    return this.addListener(this.stateListeners, listener);
  }

  onPeers(listener: Listener<TPeer[]>): Unsubscribe {
    return this.addListener(this.peerListeners, listener);
  }

  onMessage(listener: Listener<TransportMessage>): Unsubscribe {
    return this.addListener(this.messageListeners, listener);
  }

  onError(listener: Listener<Error>): Unsubscribe {
    return this.addListener(this.errorListeners, listener);
  }

  /** Drops every listener, e.g. when the owner of the transport is torn down. */
  removeAllListeners(): void {
    for (const listeners of [
      this.statusListeners, this.roomListeners, this.stateListeners,
      this.peerListeners, this.messageListeners, this.errorListeners,
    ] as Set<unknown>[]) listeners.clear();
  }

  // ---- Subclass helpers ----------------------------------------------------

  protected setStatus(status: ConnectionStatus): void {
    if (status === this.currentStatus) return;
    this.currentStatus = status;
    this.dispatch(this.statusListeners, status);
  }

  /** Publishes a room snapshot (or `null` after leaving) to room, state, and peer listeners. */
  protected emitRoom(room: Room<TPeer, TState> | null): void {
    if (room === null && this.currentRoom === null) return;
    this.currentRoom = room;
    this.dispatch(this.roomListeners, room);
    this.dispatch(this.stateListeners, room?.state);
    this.dispatch(this.peerListeners, this.peers);
  }

  protected emitMessage(message: TransportMessage): void {
    this.dispatch(this.messageListeners, message);
  }

  protected emitError(error: Error): void {
    this.dispatch(this.errorListeners, error);
  }

  private addListener<T>(listeners: Set<Listener<T>>, listener: Listener<T>): Unsubscribe {
    // Wrap so registering the same function twice yields two independent handles.
    const entry: Listener<T> = (value) => listener(value);
    listeners.add(entry);
    return () => { listeners.delete(entry); };
  }

  private dispatch<T>(listeners: Set<Listener<T>>, value: T): void {
    for (const listener of [...listeners]) this.invoke(listener, value);
  }

  private invoke<T>(listener: Listener<T>, value: T): void {
    try {
      listener(value);
    } catch (error) {
      console.error(`[snap-pair] ${this.kind} transport listener threw`, error);
    }
  }
}
