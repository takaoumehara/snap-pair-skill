import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ConnectionStatus, TransportMessage } from '../core/types';
import { createFakePartyKit, FakeSocket, flush, waitFor } from '../testing/fakes';
import {
  buildPartyKitUrl,
  createWebSocketFactory,
  loadPartySocketFactory,
  PartyKitTransport,
  type PartyKitTransportOptions,
} from './partykit';

// The example server needs `partykit/server` types, which this package does not
// install; a variable specifier keeps it out of `tsc` while vitest still runs it.
const SERVER_MODULE = '../../examples/partykit/server';
const { default: SnapPairRelay } = await import(/* @vite-ignore */ SERVER_MODULE) as {
  default: new (room: unknown) => { onMessage(message: string, sender: unknown): void };
};

const open: PartyKitTransport[] = [];

function make(options: Partial<PartyKitTransportOptions> & Pick<PartyKitTransportOptions, 'socketFactory'>) {
  const transport = new PartyKitTransport({ host: 'relay.example.dev', claimWindowMs: 0, ...options });
  open.push(transport);
  return transport;
}

function deployment() {
  return createFakePartyKit((room) => new SnapPairRelay(room));
}

afterEach(async () => {
  for (const transport of open.splice(0)) await transport.disconnect();
  vi.unstubAllGlobals();
});

describe('buildPartyKitUrl', () => {
  it('matches partysocket URL conventions', () => {
    expect(buildPartyKitUrl({ host: 'my-app.me.partykit.dev', party: 'main', room: 'sp123', id: 'peer1' }))
      .toBe('wss://my-app.me.partykit.dev/party/sp123?_pk=peer1');
    expect(buildPartyKitUrl({ host: 'my-app.me.partykit.dev', party: 'relay', room: 'sp123', id: 'peer1' }))
      .toBe('wss://my-app.me.partykit.dev/parties/relay/sp123?_pk=peer1');
  });

  it('uses ws for local and private hosts, strips schemes, and honors an explicit protocol', () => {
    expect(buildPartyKitUrl({ host: 'localhost:1999', party: 'main', room: 'r', id: 'i' })).toBe('ws://localhost:1999/party/r?_pk=i');
    expect(buildPartyKitUrl({ host: '192.168.1.20:1999', party: 'main', room: 'r', id: 'i' })).toMatch(/^ws:\/\//);
    expect(buildPartyKitUrl({ host: 'https://relay.example.dev/', party: 'main', room: 'r', id: 'i' })).toBe('wss://relay.example.dev/party/r?_pk=i');
    expect(buildPartyKitUrl({ host: 'localhost:1999', party: 'main', room: 'r', id: 'i', protocol: 'wss' })).toMatch(/^wss:\/\//);
  });
});

describe('socket factories', () => {
  it('loads partysocket through the importer and passes the connection params', async () => {
    const constructed: unknown[] = [];
    class FakePartySocket extends FakeSocket {
      constructor(options: unknown) { super(); constructed.push(options); }
    }
    const factory = await loadPartySocketFactory(async () => ({ default: FakePartySocket }));
    expect(factory).toBeTypeOf('function');
    factory!({ host: 'h', party: 'main', room: 'r', id: 'i' });
    expect(constructed).toEqual([{ host: 'h', party: 'main', room: 'r', id: 'i', protocol: undefined }]);
  });

  it('returns null when partysocket cannot be imported (it is an optional peer dependency)', async () => {
    expect(await loadPartySocketFactory(async () => { throw new Error('Cannot find module'); })).toBeNull();
    expect(await loadPartySocketFactory(async () => ({}))).toBeNull();
    expect(await loadPartySocketFactory()).toBeNull(); // not installed in this repo
  });

  it('createWebSocketFactory returns null without a WebSocket implementation', () => {
    vi.stubGlobal('WebSocket', undefined);
    expect(createWebSocketFactory()).toBeNull();
  });

  it('connect() falls back to the global WebSocket with a PartyKit URL', async () => {
    const sockets: FakeSocket[] = [];
    vi.stubGlobal('WebSocket', class extends FakeSocket {
      constructor(url: string) { super(url); sockets.push(this); }
    });
    const transport = make({ host: 'localhost:1999', party: 'snap' });
    await transport.connect();
    const creating = transport.createRoom({ initialState: null });
    await waitFor(() => sockets.length === 1);
    expect(sockets[0].url).toMatch(new RegExp(`^ws://localhost:1999/parties/snap/sp[0-9a-f]{24}\\?_pk=${transport.peerId}$`));
    sockets[0].serverOpen();
    await expect(creating).resolves.toMatchObject({ room: { hostId: transport.peerId } });
  });

  it('connect() fails clearly without partysocket, a factory, or WebSocket', async () => {
    vi.stubGlobal('WebSocket', undefined);
    const transport = make({});
    await expect(transport.connect()).rejects.toMatchObject({ code: 'unsupported', message: expect.stringContaining('partysocket') });
    expect(transport.status).toBe('error');
  });

  it('requires a host', async () => {
    const transport = make({ host: '', socketFactory: deployment().factory });
    await expect(transport.connect()).rejects.toMatchObject({ code: 'invalid' });
  });
});

describe('PartyKitTransport with the example relay server', () => {
  async function room(guestCount: number, options: Partial<PartyKitTransportOptions> = {}) {
    const kit = deployment();
    const host = make({ socketFactory: kit.factory, name: 'Host', ...options });
    await host.connect();
    const created = await host.createRoom({ initialState: { round: 1 } });
    const guests: PartyKitTransport[] = [];
    for (let i = 0; i < guestCount; i += 1) {
      const guest = make({ socketFactory: kit.factory, name: `Guest ${i + 1}`, ...options });
      await guest.connect();
      await guest.joinRoom(created.pairing.code);
      guests.push(guest);
    }
    await flush();
    return { kit, host, guests, ...created };
  }

  it('opens one socket per peer in a room named after the derived key, with id = peerId', async () => {
    const { kit, host, guests: [a], pairing } = await room(1);
    expect(kit.params.map((p) => [p.host, p.party, p.room])).toEqual([
      ['relay.example.dev', 'main', pairing.roomId],
      ['relay.example.dev', 'main', pairing.roomId],
    ]);
    expect(kit.params.map((p) => p.id)).toEqual([host.peerId, a.peerId]);
    expect(pairing.roomId).not.toContain(pairing.code);
  });

  it('syncs roster, state, and status across peers', async () => {
    const { host, guests: [a, b] } = await room(2);
    await waitFor(() => a.peers.length === 3 && b.peers.length === 3);
    await host.setState({ round: 2 });
    await host.setRoomStatus('playing');
    await waitFor(() => b.room?.status === 'playing');
    expect(b.room?.state).toEqual({ round: 2 });
    await b.setState({ round: 3 });
    await waitFor(() => (a.room?.state as any)?.round === 3);
  });

  it('routes addressed messages through the server and broadcasts the rest to everyone else', async () => {
    const { kit, host, guests: [a, b] } = await room(2);
    const inbox: Record<string, TransportMessage[]> = { host: [], a: [], b: [] };
    host.onMessage((m) => inbox.host.push(m));
    a.onMessage((m) => inbox.a.push(m));
    b.onMessage((m) => inbox.b.push(m));

    await a.send({ type: 'dm', payload: 'hi', to: b.peerId });
    await host.broadcast('all', 1);
    await waitFor(() => inbox.b.length === 2 && inbox.a.length === 1);
    await flush(5);
    expect(inbox.host).toEqual([]);
    expect(inbox.b.map((m) => [m.type, m.from])).toEqual([['dm', a.peerId], ['all', host.peerId]]);

    // Frames are JSON text on the wire.
    const sent = kit.sockets[1].sent.map((frame) => JSON.parse(frame));
    expect(sent.find((frame) => frame.t === 'message')).toMatchObject({ v: 1, to: b.peerId, from: a.peerId });
  });

  it('the server drops frames whose `from` is not the sender', async () => {
    const { kit, host, guests: [a] } = await room(1);
    const received: TransportMessage[] = [];
    host.onMessage((m) => received.push(m));
    const frame = { v: 1, room: host.room!.id, from: 'someone-else', t: 'message', message: { type: 'spoof', payload: 1 } };
    kit.sockets[1].send(JSON.stringify(frame));
    await flush(5);
    expect(received).toEqual([]);
    expect(a.room).not.toBeNull();
  });

  it('removes a peer as soon as the server reports its socket closed, then re-admits it after reconnecting', async () => {
    const { kit, host, guests: [a] } = await room(1, { heartbeatMs: 60000, reconnectDelayMs: 5 });
    const statuses: ConnectionStatus[] = [];
    a.onStatus((s) => statuses.push(s));

    kit.sockets[1].serverDrop();
    await waitFor(() => host.peers.length === 1);
    expect(a.status).toBe('reconnecting');

    await waitFor(() => kit.sockets.length === 3 && host.peers.length === 2);
    await waitFor(() => a.status === 'connected');
    expect(statuses).toEqual(['connected', 'reconnecting', 'connected']);
  });

  it('guests see the host as disconnected when its socket drops', async () => {
    const { kit, host, guests: [a] } = await room(1, { reconnectDelayMs: 5 });
    kit.sockets[0].serverDrop();
    await waitFor(() => a.room?.players[host.peerId].connected === false);
    await waitFor(() => a.room?.players[host.peerId].connected === true);
  });

  it('leaves cleanly: closes the socket and the host room ends for guests', async () => {
    const { kit, host, guests: [a] } = await room(1);
    await host.leaveRoom();
    expect(kit.sockets[0].readyState).toBe(FakeSocket.CLOSED);
    await waitFor(() => a.room?.status === 'closed');
  });
});

describe('PartyKitTransport socket handling', () => {
  it('queues frames until the socket opens', async () => {
    let socket!: FakeSocket;
    const transport = make({ socketFactory: () => (socket = new FakeSocket()) });
    await transport.connect();
    const creating = transport.createRoom({ initialState: null });
    await waitFor(() => Boolean(socket));
    socket.serverOpen();
    await creating;
    expect(socket.sent.map((frame) => JSON.parse(frame).t)).toEqual(['join']);
  });

  it('times out when the first connection never opens', async () => {
    const transport = make({ socketFactory: () => new FakeSocket(), connectTimeoutMs: 20 });
    await transport.connect();
    await expect(transport.createRoom({ initialState: null })).rejects.toMatchObject({
      code: 'backend',
      message: 'Timed out connecting to PartyKit at relay.example.dev.',
    });
    expect(transport.room).toBeNull();
  });

  it('lets partysocket reconnect by itself instead of opening a new socket', async () => {
    const sockets: FakeSocket[] = [];
    class SelfHealingSocket extends FakeSocket {
      reconnect = vi.fn();
    }
    const transport = make({ socketFactory: () => { const s = new SelfHealingSocket(); sockets.push(s); queueMicrotask(() => s.serverOpen()); return s; }, reconnectDelayMs: 1 });
    await transport.connect();
    await transport.createRoom({ initialState: null });
    sockets[0].readyState = FakeSocket.CLOSED;
    sockets[0].emit('close', {});
    expect(transport.status).toBe('reconnecting');
    await flush(10);
    expect(sockets).toHaveLength(1);
    sockets[0].serverOpen();
    expect(transport.status).toBe('connected');
    // The host re-announces itself after reconnecting.
    expect(JSON.parse(sockets[0].sent.at(-1)!).t).toBe('join');
  });
});
