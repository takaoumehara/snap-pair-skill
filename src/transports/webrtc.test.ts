import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TransportError, type TransportMessage } from '../core/types';
import { createBroadcastBus, FakeDataChannel, FakeRTCPeerConnection, flush, waitFor } from '../testing/fakes';
import type { Transport } from './base';
import { BroadcastChannelTransport } from './broadcast';
import { isWebRTCSupported, RTC_SIGNAL_TYPE, WebRTCTransport, type WebRTCTransportOptions } from './webrtc';

let bus: ReturnType<typeof createBroadcastBus>;
const open: Transport[] = [];

function signaling(name?: string) {
  const transport = new BroadcastChannelTransport({ BroadcastChannel: bus.BroadcastChannel, claimWindowMs: 0, name });
  open.push(transport);
  return transport;
}

function rtc(options: Partial<WebRTCTransportOptions> = {}) {
  const transport = new WebRTCTransport({
    signaling: signaling(options.name),
    RTCPeerConnection: FakeRTCPeerConnection as unknown as WebRTCTransportOptions['RTCPeerConnection'],
    ...options,
  });
  open.unshift(transport); // Disconnect WebRTC transports before their signaling.
  return transport;
}

async function star(guestCount: number, options: Partial<WebRTCTransportOptions> = {}) {
  const host = rtc({ name: 'Host', ...options });
  await host.connect();
  const created = await host.createRoom({ initialState: { n: 0 } });
  const guests: WebRTCTransport[] = [];
  for (let i = 0; i < guestCount; i += 1) {
    const guest = rtc({ name: `Guest ${i + 1}`, ...options });
    await guest.connect();
    await guest.joinRoom(created.pairing.code);
    guests.push(guest);
  }
  await flush();
  return { host, guests, ...created };
}

beforeEach(() => {
  bus = createBroadcastBus();
  FakeRTCPeerConnection.reset();
});

afterEach(async () => {
  for (const transport of open.splice(0)) await transport.disconnect();
  vi.unstubAllGlobals();
});

describe('WebRTCTransport: setup', () => {
  it('fails clearly without RTCPeerConnection', async () => {
    vi.stubGlobal('RTCPeerConnection', undefined);
    expect(isWebRTCSupported()).toBe(false);
    const transport = new WebRTCTransport({ signaling: signaling() });
    await expect(transport.connect()).rejects.toMatchObject({ code: 'unsupported', message: expect.stringContaining('RTCPeerConnection') });
    expect(transport.status).toBe('error');
  });

  it('requires a signaling transport that supports messaging', async () => {
    const noMessaging = { kind: 'firebase', capabilities: { messaging: false, presence: true, serverAuthoritativeJoin: true } } as unknown as Transport;
    const transport = new WebRTCTransport({ signaling: noMessaging, RTCPeerConnection: FakeRTCPeerConnection as any });
    const error = await transport.connect().catch((e) => e);
    expect(error).toBeInstanceOf(TransportError);
    expect(error).toMatchObject({ code: 'unsupported', message: expect.stringContaining('firebase') });
  });

  it('connects the signaling transport when needed', async () => {
    const transport = rtc();
    expect(transport.signaling.status).toBe('idle');
    await transport.connect();
    expect(transport.signaling.status).toBe('connected');
    expect(transport.kind).toBe('webrtc');
  });
});

describe('WebRTCTransport: handshake and star topology', () => {
  it('takes pairing info from the signaling room and opens a data channel per guest', async () => {
    const iceServers = [{ urls: 'turn:turn.example.com', username: 'u', credential: 'c' }];
    const { host, guests: [a], pairing, room } = await star(1, { iceServers });

    expect(room.id).toBe(host.signaling.room!.id);
    expect(pairing.code).toBe(host.signaling.room!.code);
    expect(a.signaling.room?.id).toBe(room.id);
    expect(a.room?.hostId).toBe(host.peerId);
    expect(host.peers.map((p) => p.name).sort()).toEqual(['Guest 1', 'Host']);

    const [guestPc, hostPc] = FakeRTCPeerConnection.instances;
    expect(guestPc.config).toEqual({ iceServers });
    expect(hostPc.config).toEqual({ iceServers });
    expect(guestPc.localDescription?.type).toBe('offer');
    expect(hostPc.remoteDescription).toEqual(guestPc.localDescription);
    expect(guestPc.remoteDescription).toEqual(hostPc.localDescription);
    expect(guestPc.channels[0]).toMatchObject({ label: 'snap-pair', options: { ordered: true }, readyState: 'open' });

    // Trickle ICE in both directions.
    await waitFor(() => hostPc.addedCandidates.length > 0 && guestPc.addedCandidates.length > 0);
    expect(hostPc.addedCandidates[0].candidate).toBe(`candidate:${guestPc.id}`);
    expect(guestPc.addedCandidates[0].candidate).toBe(`candidate:${hostPc.id}`);
  });

  it('uses a public STUN server by default', async () => {
    await star(1);
    expect(FakeRTCPeerConnection.instances[0].config).toEqual({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
  });

  it('carries room traffic over the data channels, not the signaling transport', async () => {
    const { host, guests: [a] } = await star(1);
    const signalTypes: string[] = [];
    a.signaling.onMessage((m) => signalTypes.push(m.type));

    await host.setState({ n: 1 });
    await waitFor(() => (a.room?.state as any)?.n === 1);
    await a.setState({ n: 2 });
    await waitFor(() => (host.room?.state as any)?.n === 2);
    expect(signalTypes).toEqual([]);

    const hostChannel = FakeRTCPeerConnection.instances[1].channels[0];
    expect(hostChannel.sent.map((f) => JSON.parse(f as string).t)).toContain('state');
  });

  it('forwards guest messages through the host to other guests', async () => {
    const { host, guests: [a, b] } = await star(2);
    await waitFor(() => a.peers.length === 3 && b.peers.length === 3);
    const inbox: Record<string, TransportMessage[]> = { host: [], a: [], b: [] };
    host.onMessage((m) => inbox.host.push(m));
    a.onMessage((m) => inbox.a.push(m));
    b.onMessage((m) => inbox.b.push(m));

    await a.broadcast('hello', 1);
    await waitFor(() => inbox.host.length === 1 && inbox.b.length === 1);
    expect(inbox.b[0]).toMatchObject({ type: 'hello', from: a.peerId });

    await b.send({ type: 'dm', payload: 2, to: a.peerId });
    await waitFor(() => inbox.a.length === 1);
    expect(inbox.a[0]).toMatchObject({ type: 'dm', from: b.peerId, to: a.peerId });
    expect(inbox.host).toHaveLength(1); // Addressed to `a`, so the host only forwards it.
  });

  it('drops frames a guest sends on behalf of another peer', async () => {
    const { host, guests: [a, b] } = await star(2);
    const received: TransportMessage[] = [];
    host.onMessage((m) => received.push(m));
    const aPc = FakeRTCPeerConnection.instances.find((pc) => pc.localDescription?.type === 'offer')!;
    aPc.channels[0].send(JSON.stringify({
      v: 1, room: host.room!.id, from: b.peerId, t: 'message', message: { type: 'spoof', payload: 0 },
    }));
    await flush(5);
    expect(received).toEqual([]);
    expect(a.room).not.toBeNull();
  });

  it('buffers ICE candidates that arrive before their offer', async () => {
    const { host, pairing } = await star(0);
    const raw = signaling();
    await raw.connect();
    await raw.joinRoom(pairing.code);
    const roomKey = host.room!.id;
    await raw.broadcast(RTC_SIGNAL_TYPE, { kind: 'ice', room: roomKey, from: 'g1', to: 'host', candidate: { candidate: 'early' } });
    await flush(5);
    await raw.broadcast(RTC_SIGNAL_TYPE, { kind: 'offer', room: roomKey, from: 'g1', to: 'host', sdp: { type: 'offer', sdp: 'offer:x' } });
    await waitFor(() => FakeRTCPeerConnection.instances.at(-1)!.addedCandidates.some((c) => c.candidate === 'early'));
  });
});

describe('WebRTCTransport: teardown', () => {
  it('removes a guest when its data channel closes; with reconnect: false the guest stays reconnecting', async () => {
    const { host, guests: [a] } = await star(1, { reconnect: false });
    const guestPc = FakeRTCPeerConnection.instances[0];
    guestPc.channels[0].close();
    await waitFor(() => host.peers.length === 1);
    expect(a.status).toBe('reconnecting');
    await flush(30);
    expect(FakeRTCPeerConnection.instances).toHaveLength(2); // no re-offer
    expect(a.status).toBe('reconnecting');
  });

  it('leaveRoom closes peer connections and leaves the signaling room', async () => {
    const { host, guests: [a] } = await star(1);
    await a.leaveRoom();
    expect(a.signaling.room).toBeNull();
    expect(FakeRTCPeerConnection.instances[0].connectionState).toBe('closed');
    await waitFor(() => host.peers.length === 1);

    await host.leaveRoom();
    expect(host.signaling.room).toBeNull();
    expect(FakeRTCPeerConnection.instances.every((pc) => pc.connectionState === 'closed')).toBe(true);
  });

  it('times out when no WebRTC host answers, and leaves the signaling room', async () => {
    const plainHost = signaling();
    await plainHost.connect();
    const { pairing } = await plainHost.createRoom({ initialState: null }); // Signaling only: never answers offers.

    const guest = rtc({ connectTimeoutMs: 30 });
    await guest.connect();
    await expect(guest.joinRoom(pairing.code)).rejects.toMatchObject({
      code: 'backend',
      message: 'Timed out opening the WebRTC data channel to the host.',
    });
    expect(guest.signaling.room).toBeNull();
    expect(guest.room).toBeNull();
  });
});

describe('WebRTCTransport: recovery', () => {
  const fast = { reconnect: { baseDelayMs: 5, maxDelayMs: 20, iceRestartGraceMs: 30 }, connectTimeoutMs: 200 };

  it('re-offers after the channel drops, and the host re-admits the guest', async () => {
    const { host, guests: [a] } = await star(1, fast);
    const statuses: string[] = [];
    a.onStatus((s) => statuses.push(s));
    const inbox: TransportMessage[] = [];
    host.onMessage((m) => inbox.push(m));

    FakeRTCPeerConnection.instances[0].channels[0].close();
    await waitFor(() => statuses.includes('reconnecting'));
    await waitFor(() => a.status === 'connected' && host.peers.length === 2);
    expect(statuses).toEqual(['connected', 'reconnecting', 'connected']);
    expect(FakeRTCPeerConnection.instances.length).toBe(4); // a fresh guest + host connection

    // Traffic flows over the new channel in both directions.
    await a.broadcast('after', 1);
    await waitFor(() => inbox.length === 1);
    await host.setState({ n: 42 });
    await waitFor(() => (a.room?.state as any)?.n === 42);
    expect(FakeRTCPeerConnection.instances[2].offerOptions).toEqual([undefined]);
  });

  it('backs off and reports failure after maxAttempts', async () => {
    const { host, guests: [a] } = await star(1, { reconnect: { baseDelayMs: 5, maxDelayMs: 10, maxAttempts: 2 }, connectTimeoutMs: 20 });
    const errors: Error[] = [];
    a.onError((e) => errors.push(e));
    await host.leaveRoom(); // Nobody answers offers any more.
    await waitFor(() => errors.some((e) => /reconnect failed after 2 attempts/.test(e.message)), 2000);
    expect(errors.find((e) => /reconnect failed/.test(e.message))).toBeInstanceOf(TransportError);
    expect(a.status).toBe('reconnecting');
    const offers = FakeRTCPeerConnection.instances.filter((pc) => pc.localDescription?.type === 'offer');
    expect(offers.length).toBe(3); // the original + 2 attempts
  });

  it('restarts ICE on the same connection when it fails, without dropping the guest', async () => {
    const { host, guests: [a] } = await star(1, fast);
    const [guestPc, hostPc] = FakeRTCPeerConnection.instances;
    const peerChanges: number[] = [];
    host.onPeers((peers) => peerChanges.push(peers.length));

    hostPc.simulateConnectionState('failed'); // The host waits (grace period) instead of dropping.
    guestPc.simulateConnectionState('failed');
    await waitFor(() => guestPc.offerOptions.length === 2);
    expect(guestPc.offerOptions[1]).toEqual({ iceRestart: true });
    expect(guestPc.restartIceCalls).toBe(1);
    await waitFor(() => guestPc.connectionState === 'connected' && hostPc.connectionState === 'connected');
    await flush(50); // past the grace period

    expect(FakeRTCPeerConnection.instances).toHaveLength(2); // renegotiated, not replaced
    expect(hostPc.remoteDescription?.sdp).toBe(guestPc.localDescription?.sdp);
    expect(peerChanges).toEqual([]);
    expect(host.peers).toHaveLength(2);
    expect(a.status).toBe('connected');
    await host.setState({ n: 7 });
    await waitFor(() => (a.room?.state as any)?.n === 7);
  });

  it('host drops a guest whose ICE stays failed past the grace period', async () => {
    const { host } = await star(1, fast);
    FakeRTCPeerConnection.instances[1].simulateConnectionState('failed');
    expect(host.peers).toHaveLength(2);
    await waitFor(() => host.peers.length === 1);
  });
});

describe('WebRTCTransport: chunking', () => {
  afterEach(() => {
    FakeDataChannel.maxMessageSize = Infinity;
  });

  it('splits frames above 16 KiB and reassembles them, including host forwarding', async () => {
    FakeDataChannel.maxMessageSize = 16 * 1024; // like a strict SCTP stack
    const { host, guests: [a, b] } = await star(2);
    await waitFor(() => a.peers.length === 3 && b.peers.length === 3);
    const big = 'x'.repeat(100_000) + '😀'.repeat(1000);
    const inbox: Record<string, TransportMessage[]> = { host: [], b: [] };
    host.onMessage((m) => inbox.host.push(m));
    b.onMessage((m) => inbox.b.push(m));

    await a.broadcast('big', big);
    await waitFor(() => inbox.host.length === 1 && inbox.b.length === 1);
    expect(inbox.host[0].payload).toBe(big);
    expect(inbox.b[0].payload).toBe(big);

    await host.setState({ blob: big });
    await waitFor(() => (a.room?.state as any)?.blob === big && (b.room?.state as any)?.blob === big);

    const sent = FakeRTCPeerConnection.instances.flatMap((pc) => pc.channels.flatMap((c) => c.sent as string[]));
    const chunks = sent.filter((frame) => frame.startsWith('{"sp":"chunk"'));
    expect(chunks.length).toBeGreaterThan(10);
    expect(Math.max(...sent.map((frame) => new TextEncoder().encode(frame).length))).toBeLessThanOrEqual(16 * 1024);
  });

  it('honors maxMessageBytes and refuses frames above maxReassembledBytes', async () => {
    const { host, guests: [a] } = await star(1, { maxMessageBytes: 4096, maxReassembledBytes: 50_000 });
    const errors: Error[] = [];
    a.onError((e) => errors.push(e));
    const inbox: TransportMessage[] = [];
    host.onMessage((m) => inbox.push(m));

    await a.broadcast('medium', 'm'.repeat(20_000));
    await waitFor(() => inbox.length === 1);
    const guestSent = FakeRTCPeerConnection.instances[0].channels[0].sent as string[];
    expect(Math.max(...guestSent.map((frame) => frame.length))).toBeLessThanOrEqual(4096);

    await a.broadcast('huge', 'h'.repeat(60_000));
    expect(errors.at(-1)?.message).toMatch(/Send failed: Message is \d+ bytes; the WebRTC transport carries at most 50000/);
    await flush(10);
    expect(inbox).toHaveLength(1);
  });
});
