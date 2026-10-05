/**
 * Test doubles for browser APIs the Phase 2 transports use. Test-only: not
 * exported from src/index.ts.
 */

type MessageListener = (event: { data: unknown }) => void;

// ---- BroadcastChannel ------------------------------------------------------

/**
 * In-memory BroadcastChannel bus. Like the real API, a message reaches every
 * other open channel with the same name (never the sender), asynchronously,
 * as a structured clone.
 */
export function createBroadcastBus() {
  const byName = new Map<string, Set<FakeBroadcastChannel>>();
  const instances: FakeBroadcastChannel[] = [];

  class FakeBroadcastChannel {
    readonly name: string;
    closed = false;
    /** When true, the channel neither sends nor receives (simulates a frozen tab). */
    muted = false;
    onmessage: MessageListener | null = null;
    private readonly listeners = new Set<MessageListener>();

    constructor(name: string) {
      this.name = name;
      if (!byName.has(name)) byName.set(name, new Set());
      byName.get(name)!.add(this);
      instances.push(this);
    }

    postMessage(data: unknown) {
      if (this.closed) throw new Error('InvalidStateError: channel is closed');
      if (this.muted) return;
      const copy = structuredClone(data);
      for (const other of byName.get(this.name) ?? []) {
        if (other !== this) queueMicrotask(() => other.dispatch(copy));
      }
    }

    addEventListener(_type: 'message', listener: MessageListener) { this.listeners.add(listener); }
    removeEventListener(_type: 'message', listener: MessageListener) { this.listeners.delete(listener); }

    close() {
      this.closed = true;
      byName.get(this.name)?.delete(this);
    }

    private dispatch(data: unknown) {
      if (this.closed || this.muted) return;
      const event = { data };
      this.onmessage?.(event);
      for (const listener of [...this.listeners]) listener(event);
    }
  }

  return {
    BroadcastChannel: FakeBroadcastChannel as unknown as typeof BroadcastChannel,
    instances,
    openChannels: (name?: string) => [...byName.entries()]
      .filter(([key]) => !name || key === name)
      .reduce((count, [, set]) => count + set.size, 0),
  };
}

// ---- PartyKit / WebSocket ----------------------------------------------------

type SocketListener = (event: any) => void;

/** Fake WebSocket with the readyState/event surface `PartyKitTransport` uses. */
export class FakeSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 3;

  readyState = FakeSocket.CONNECTING;
  readonly sent: string[] = [];
  private readonly listeners = new Map<string, Set<SocketListener>>();
  /** Called with each frame the client sends while open. */
  onClientSend: ((data: string) => void) | null = null;
  onClientClose: (() => void) | null = null;

  constructor(readonly url = '', readonly id = '') {}

  addEventListener(type: string, listener: SocketListener) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(listener);
  }

  removeEventListener(type: string, listener: SocketListener) {
    this.listeners.get(type)?.delete(listener);
  }

  send(data: string) {
    if (this.readyState !== FakeSocket.OPEN) throw new Error('InvalidStateError: socket is not open');
    this.sent.push(data);
    this.onClientSend?.(data);
  }

  close() {
    if (this.readyState === FakeSocket.CLOSED) return;
    this.readyState = FakeSocket.CLOSED;
    this.onClientClose?.();
  }

  // Server-side controls.
  serverOpen() {
    this.readyState = FakeSocket.OPEN;
    this.emit('open', {});
  }

  serverSend(data: string) {
    this.emit('message', { data });
  }

  serverDrop() {
    if (this.readyState === FakeSocket.CLOSED) return;
    this.readyState = FakeSocket.CLOSED;
    this.emit('close', { code: 1006 });
    this.onClientClose?.();
  }

  emit(type: string, event: unknown) {
    for (const listener of [...(this.listeners.get(type) ?? [])]) listener(event);
  }
}

interface FakePartyConnection {
  id: string;
  socket: FakeSocket;
  send(message: string): void;
  close(code?: number, reason?: string): void;
}

/** Minimal `Party.Room` for running examples/partykit/server.ts in-process. */
export class FakePartyRoom {
  readonly connections = new Map<string, FakePartyConnection>();
  constructor(readonly id: string) {}

  getConnection(id: string) { return this.connections.get(id); }
  getConnections() { return this.connections.values(); }

  broadcast(message: string, without: string[] = []) {
    for (const connection of this.connections.values()) {
      if (!without.includes(connection.id)) connection.send(message);
    }
  }
}

interface PartyServerLike {
  onConnect?(connection: any): void;
  onMessage(message: string, sender: any): void;
  onClose?(connection: any): void;
}

/**
 * In-process PartyKit deployment: `factory` is a `PartyKitSocketFactory` whose
 * sockets talk to one `Server` instance per room, with async delivery.
 */
export function createFakePartyKit(createServer: (room: FakePartyRoom) => PartyServerLike) {
  const rooms = new Map<string, { room: FakePartyRoom; server: PartyServerLike }>();
  const sockets: FakeSocket[] = [];
  const params: Array<{ host: string; party: string; room: string; id: string }> = [];

  const roomFor = (id: string) => {
    if (!rooms.has(id)) {
      const room = new FakePartyRoom(id);
      rooms.set(id, { room, server: createServer(room) });
    }
    return rooms.get(id)!;
  };

  const factory = (p: { host: string; party: string; room: string; id: string }) => {
    params.push(p);
    const socket = new FakeSocket(`fake://${p.host}/${p.party}/${p.room}`, p.id);
    sockets.push(socket);
    const { room, server } = roomFor(p.room);
    const connection: FakePartyConnection = {
      id: p.id,
      socket,
      send: (message) => queueMicrotask(() => { if (socket.readyState === FakeSocket.OPEN) socket.serverSend(message); }),
      close: () => socket.serverDrop(),
    };
    socket.onClientSend = (data) => queueMicrotask(() => {
      if (room.connections.get(p.id) === connection) server.onMessage(data, connection);
    });
    // Queued like messages, so frames sent before close() reach the server first (as on a real socket).
    socket.onClientClose = () => queueMicrotask(() => {
      if (room.connections.get(p.id) !== connection) return;
      room.connections.delete(p.id);
      server.onClose?.(connection);
    });
    queueMicrotask(() => {
      room.connections.set(p.id, connection);
      server.onConnect?.(connection);
      socket.serverOpen();
    });
    return socket;
  };

  return { factory, sockets, params, rooms };
}

// ---- WebRTC ------------------------------------------------------------------

export class FakeDataChannel {
  /** Largest message (UTF-8 bytes) `send` accepts, like an SCTP limit. Default: unlimited. */
  static maxMessageSize = Infinity;

  readyState: 'connecting' | 'open' | 'closing' | 'closed' = 'connecting';
  peer: FakeDataChannel | null = null;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onclose: (() => void) | null = null;
  readonly sent: unknown[] = [];

  constructor(readonly label: string, readonly options?: RTCDataChannelInit) {}

  send(data: unknown) {
    if (this.readyState !== 'open') throw new Error('InvalidStateError: channel is not open');
    if (typeof data === 'string' && new TextEncoder().encode(data).length > FakeDataChannel.maxMessageSize) {
      throw new TypeError('OperationError: message too large');
    }
    this.sent.push(data);
    const peer = this.peer;
    queueMicrotask(() => { if (peer?.readyState === 'open') peer.onmessage?.({ data }); });
  }

  open() {
    this.readyState = 'open';
    this.onopen?.();
  }

  close() {
    if (this.readyState === 'closed') return;
    this.readyState = 'closed';
    this.onclose?.();
    const peer = this.peer;
    queueMicrotask(() => peer?.close());
  }
}

let nextPcId = 1;

/**
 * Fake RTCPeerConnection. SDP strings carry the connection id; when the
 * answerer sets its local answer, the offerer's DataChannels are paired with
 * counterparts delivered via `ondatachannel`, and both ends open. Each
 * `setLocalDescription` trickles one ICE candidate and then end-of-candidates
 * on a later task, like browsers do.
 */
export class FakeRTCPeerConnection {
  static instances: FakeRTCPeerConnection[] = [];
  static bySdp = new Map<string, FakeRTCPeerConnection>();

  static reset() {
    FakeRTCPeerConnection.instances = [];
    FakeRTCPeerConnection.bySdp.clear();
  }

  readonly id = nextPcId++;
  readonly channels: FakeDataChannel[] = [];
  readonly addedCandidates: RTCIceCandidateInit[] = [];
  localDescription: RTCSessionDescriptionInit | null = null;
  remoteDescription: RTCSessionDescriptionInit | null = null;
  connectionState: RTCPeerConnectionState = 'new';
  onicecandidate: ((event: { candidate: any }) => void) | null = null;
  ondatachannel: ((event: { channel: FakeDataChannel }) => void) | null = null;
  onconnectionstatechange: (() => void) | null = null;

  constructor(readonly config?: RTCConfiguration) {
    FakeRTCPeerConnection.instances.push(this);
  }

  createDataChannel(label: string, options?: RTCDataChannelInit) {
    const channel = new FakeDataChannel(label, options);
    this.channels.push(channel);
    return channel;
  }

  /** Options passed to every createOffer call (e.g. `{ iceRestart: true }`). */
  readonly offerOptions: Array<RTCOfferOptions | undefined> = [];
  restartIceCalls = 0;

  async createOffer(options?: RTCOfferOptions): Promise<RTCSessionDescriptionInit> {
    this.offerOptions.push(options);
    const generation = this.offerOptions.length;
    return { type: 'offer', sdp: generation > 1 ? `offer:${this.id}:${generation}` : `offer:${this.id}` };
  }

  restartIce() {
    this.restartIceCalls += 1;
  }

  /** Test control: moves to `state` and fires `onconnectionstatechange` (e.g. simulate ICE `failed`). */
  simulateConnectionState(state: RTCPeerConnectionState) {
    this.connectionState = state;
    this.onconnectionstatechange?.();
  }
  async createAnswer(): Promise<RTCSessionDescriptionInit> { return { type: 'answer', sdp: `answer:${this.id}` }; }

  async setLocalDescription(description: RTCSessionDescriptionInit) {
    this.localDescription = description;
    FakeRTCPeerConnection.bySdp.set(description.sdp!, this);
    setTimeout(() => {
      if (this.connectionState === 'closed') return;
      const init = { candidate: `candidate:${this.id}`, sdpMid: '0', sdpMLineIndex: 0 };
      this.onicecandidate?.({ candidate: { ...init, toJSON: () => init } });
      this.onicecandidate?.({ candidate: null });
    }, 0);
    if (description.type === 'answer') this.connectToOfferer();
  }

  async setRemoteDescription(description: RTCSessionDescriptionInit) {
    this.remoteDescription = description;
  }

  async addIceCandidate(candidate: RTCIceCandidateInit) {
    if (!this.remoteDescription) throw new Error('InvalidStateError: no remote description');
    this.addedCandidates.push(candidate);
  }

  close() {
    if (this.connectionState === 'closed') return;
    this.connectionState = 'closed';
    for (const channel of this.channels) channel.close();
  }

  private connectToOfferer() {
    const offerer = FakeRTCPeerConnection.bySdp.get(this.remoteDescription?.sdp ?? '');
    if (!offerer) return;
    setTimeout(() => {
      if (this.connectionState === 'closed' || offerer.connectionState === 'closed') return;
      // An ICE-restart answer reconnects the transport; already-paired channels stay as they are.
      for (const local of offerer.channels.filter((channel) => !channel.peer)) {
        const remote = new FakeDataChannel(local.label, local.options);
        this.channels.push(remote);
        local.peer = remote;
        remote.peer = local;
        this.ondatachannel?.({ channel: remote });
        remote.open();
        local.open();
      }
      for (const pc of [this, offerer]) {
        pc.connectionState = 'connected';
        pc.onconnectionstatechange?.();
      }
    }, 0);
  }
}

/** Resolves after pending microtasks and `ms` of (real) timers. */
export const flush = (ms = 0) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Polls `predicate` until it holds or `timeoutMs` elapses (real timers). */
export async function waitFor(predicate: () => boolean, timeoutMs = 1000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('waitFor timed out');
    await flush(2);
  }
}
