import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TransportError, type TransportMessage } from '../core/types';
import { ROOM_CODE_ALPHABET } from '../core/utils';
import { deriveRoomId } from '../pairing/pin';
import { createBroadcastBus, flush, waitFor } from '../testing/fakes';
import { BroadcastChannelTransport, isBroadcastChannelSupported, type BroadcastChannelTransportOptions } from './broadcast';
import type { RelayRoomTarget } from './relay';

let bus: ReturnType<typeof createBroadcastBus>;
const open: BroadcastChannelTransport[] = [];

function make(options: BroadcastChannelTransportOptions = {}) {
  const transport = new BroadcastChannelTransport({ BroadcastChannel: bus.BroadcastChannel, claimWindowMs: 0, ...options });
  open.push(transport);
  return transport;
}

async function hostAndGuests(guestCount = 1, options: BroadcastChannelTransportOptions = {}) {
  const host = make({ name: 'Host', ...options });
  await host.connect();
  const created = await host.createRoom({ initialState: { score: 0 } });
  const guests: BroadcastChannelTransport[] = [];
  for (let i = 0; i < guestCount; i += 1) {
    const guest = make({ name: `Guest ${i + 1}`, ...options });
    await guest.connect();
    await guest.joinRoom(created.pairing.code);
    guests.push(guest);
  }
  await flush();
  return { host, guests, ...created };
}

beforeEach(() => {
  bus = createBroadcastBus();
});

afterEach(async () => {
  for (const transport of open.splice(0)) await transport.disconnect();
  vi.unstubAllGlobals();
});

describe('BroadcastChannelTransport: feature detection', () => {
  it('fails clearly when BroadcastChannel is missing', async () => {
    vi.stubGlobal('BroadcastChannel', undefined);
    expect(isBroadcastChannelSupported()).toBe(false);
    const transport = new BroadcastChannelTransport();
    const errors: Error[] = [];
    transport.onError((error) => errors.push(error));

    const failure = await transport.connect().catch((error) => error);
    expect(failure).toBeInstanceOf(TransportError);
    expect(failure.code).toBe('unsupported');
    expect(failure.message).toContain('BroadcastChannel is not available');
    expect(transport.status).toBe('error');
    expect(errors).toEqual([failure]);
  });

  it('uses the global BroadcastChannel when present', async () => {
    vi.stubGlobal('BroadcastChannel', bus.BroadcastChannel);
    expect(isBroadcastChannelSupported()).toBe(true);
    const transport = new BroadcastChannelTransport({ claimWindowMs: 0 });
    open.push(transport);
    await transport.connect();
    await transport.createRoom({ initialState: null });
    expect(bus.instances).toHaveLength(1);
  });

  it('requires connect() before rooms', async () => {
    const transport = make();
    await expect(transport.createRoom({ initialState: null })).rejects.toMatchObject({ code: 'not-connected' });
  });

  it('reports relay capabilities', () => {
    expect(make().capabilities).toEqual({ messaging: true, presence: true, serverAuthoritativeJoin: false });
    expect(make().kind).toBe('broadcast');
  });
});

describe('BroadcastChannelTransport: rooms', () => {
  it('creates a room with a font-safe code on a channel named after the derived key', async () => {
    const host = make({ name: 'Host', joinBaseUrl: 'https://play.example.com/join', channelPrefix: 'demo' });
    await host.connect();
    const { room, pairing } = await host.createRoom({ initialState: { score: 0 } });

    expect(pairing.code).toMatch(new RegExp(`^[${ROOM_CODE_ALPHABET}]{6}$`));
    expect(pairing.pin).toBeUndefined();
    expect(pairing.roomId).toBe(await deriveRoomId(pairing.code, { kind: 'code' }));
    expect(pairing.joinUrl).toBe(`https://play.example.com/join?room=${pairing.code}`);
    expect(bus.instances[0].name).toBe(`demo:${pairing.roomId}`);
    expect(room).toMatchObject({ id: pairing.roomId, code: pairing.code, hostId: host.peerId, status: 'waiting', maxPlayers: 8, state: { score: 0 } });
    expect(room.players[host.peerId]).toMatchObject({ name: 'Host', role: 'host', connected: true });
    expect(host.isHost).toBe(true);
  });

  it('admits guests and keeps every roster in sync', async () => {
    const { host, guests: [a, b], room } = await hostAndGuests(2);
    await waitFor(() => a.peers.length === 3);

    for (const transport of [host, a, b]) {
      expect(transport.room?.id).toBe(room.id);
      expect(transport.room?.hostId).toBe(host.peerId);
      expect(transport.peers.map((peer) => peer.name).sort()).toEqual(['Guest 1', 'Guest 2', 'Host']);
    }
    expect(a.room?.players[a.peerId]).toMatchObject({ role: 'participant', connected: true });
    expect(a.isHost).toBe(false);
  });

  it('uses numeric PINs in pin mode and accepts formatted or full-width input', async () => {
    const host = make({ pairing: 'pin', joinBaseUrl: 'https://play.example.com/' });
    await host.connect();
    const { pairing } = await host.createRoom({ initialState: null });
    expect(pairing.pin).toMatch(/^\d{6}$/);
    expect(pairing.code).toBe(pairing.pin);
    expect(pairing.roomId).toBe(await deriveRoomId(pairing.pin!, { kind: 'pin' }));
    expect(pairing.joinUrl).toBe(`https://play.example.com/?pin=${pairing.pin}`);

    const guest = make({ pairing: 'pin' });
    await guest.connect();
    const fullWidth = pairing.pin!.replace(/\d/g, (d) => String.fromCharCode(0xff10 + Number(d)));
    const room = await guest.joinRoom(`${fullWidth.slice(0, 3)} - ${fullWidth.slice(3)}`);
    expect(room.id).toBe(pairing.roomId);
  });

  it('rejects malformed codes and PINs', async () => {
    const guest = make();
    await guest.connect();
    await expect(guest.joinRoom('nope')).rejects.toMatchObject({ code: 'invalid' });
    const pinGuest = make({ pairing: 'pin' });
    await pinGuest.connect();
    await expect(pinGuest.joinRoom('12345')).rejects.toMatchObject({ code: 'invalid' });
  });

  it('times out when no host answers and closes the channel', async () => {
    const guest = make({ joinTimeoutMs: 40, heartbeatMs: 10 });
    await guest.connect();
    await expect(guest.joinRoom('ABC234')).rejects.toMatchObject({ code: 'backend', message: 'No host answered for room ABC234.' });
    await flush();
    expect(bus.openChannels()).toBe(0);
    expect(guest.room).toBeNull();
  });

  it('a guest that starts waiting before the host appears is admitted by hello retries', async () => {
    const host = make({ heartbeatMs: 10 });
    const guest = make({ heartbeatMs: 10 });
    await Promise.all([host.connect(), guest.connect()]);
    const target: RelayRoomTarget = { roomKey: await deriveRoomId('ABC234', { kind: 'code' }), code: 'ABC234' };
    (host as any).allocateHostRoom = async () => target;

    const joining = guest.joinRoom('ABC234');
    await flush(15);
    await host.createRoom({ initialState: null });
    await expect(joining).resolves.toMatchObject({ code: 'ABC234', hostId: host.peerId });
  });

  it('rejects guests beyond maxPlayers', async () => {
    const { pairing } = await hostAndGuests(1, { maxPlayers: 2 });
    const third = make({ maxPlayers: 2 });
    await third.connect();
    await expect(third.joinRoom(pairing.code)).rejects.toMatchObject({ code: 'forbidden', message: 'The room is full.' });
  });

  it('lets the host gate admission with admit()', async () => {
    const admit = vi.fn(async ({ name }: { name: string }) => name !== 'Mallory');
    const host = make({ admit });
    await host.connect();
    const { pairing } = await host.createRoom({ initialState: null });

    const mallory = make({ name: 'Mallory' });
    await mallory.connect();
    await expect(mallory.joinRoom(pairing.code)).rejects.toMatchObject({ code: 'forbidden', message: 'The host declined the join request.' });

    const alice = make({ name: 'Alice' });
    await alice.connect();
    await expect(alice.joinRoom(pairing.code)).resolves.toBeTruthy();
    expect(admit).toHaveBeenCalledWith({ id: alice.peerId, name: 'Alice' });
    expect(host.peers.map((peer) => peer.name).sort()).toEqual(['Alice', 'HOST']);
  });

  it('re-picks a room key when another host already owns it (claim window)', async () => {
    const keys = ['shared', 'shared', 'fresh'];
    const makeHost = () => {
      const host = make({ claimWindowMs: 20 });
      (host as any).allocateHostRoom = async (): Promise<RelayRoomTarget> => {
        const roomKey = keys.shift()!;
        return { roomKey, code: roomKey === 'fresh' ? 'FRESH2' : 'SHARED' };
      };
      return host;
    };
    const first = makeHost();
    const second = makeHost();
    await Promise.all([first.connect(), second.connect()]);

    expect((await first.createRoom({ initialState: null })).pairing.roomId).toBe('shared');
    expect((await second.createRoom({ initialState: null })).pairing).toMatchObject({ roomId: 'fresh', code: 'FRESH2' });
    expect(first.room?.id).toBe('shared');
  });
});

describe('BroadcastChannelTransport: state and messaging', () => {
  it('host state reaches every guest', async () => {
    const { host, guests: [a, b] } = await hostAndGuests(2);
    const seen: unknown[] = [];
    b.onState((state) => seen.push(state));

    await host.setState({ score: 5 });
    await waitFor(() => (b.room?.state as any)?.score === 5);
    expect(a.room?.state).toEqual({ score: 5 });
    expect(seen).toContainEqual({ score: 5 });
  });

  it('guest proposals go through the host, which re-broadcasts them', async () => {
    const { host, guests: [a, b] } = await hostAndGuests(2);
    await a.setState({ score: 9 });
    expect(a.room?.state).toEqual({ score: 0 }); // Not applied until the host confirms.
    await waitFor(() => (b.room?.state as any)?.score === 9);
    expect(host.room?.state).toEqual({ score: 9 });
    expect(a.room?.state).toEqual({ score: 9 });
  });

  it('ignores guest proposals when allowGuestState is off on the host', async () => {
    const host = make({ allowGuestState: false });
    await host.connect();
    const { pairing } = await host.createRoom({ initialState: { score: 0 } });
    const guest = make();
    await guest.connect();
    await guest.joinRoom(pairing.code);
    await guest.setState({ score: 99 });
    await flush(5);
    expect(host.room?.state).toEqual({ score: 0 });
  });

  it('host-only room status updates', async () => {
    const { host, guests: [a] } = await hostAndGuests(1);
    await expect(a.setRoomStatus('playing')).rejects.toMatchObject({ code: 'forbidden' });
    await host.setRoomStatus('playing');
    await waitFor(() => a.room?.status === 'playing');
  });

  it('broadcasts messages to everyone else, stamped with sender and time', async () => {
    const { host, guests: [a, b] } = await hostAndGuests(2);
    const inbox = new Map<string, TransportMessage[]>([[host.peerId, []], [a.peerId, []], [b.peerId, []]]);
    for (const t of [host, a, b]) t.onMessage((message) => inbox.get(t.peerId)!.push(message));

    await a.broadcast('tap', { x: 1 });
    await waitFor(() => inbox.get(host.peerId)!.length === 1 && inbox.get(b.peerId)!.length === 1);
    expect(inbox.get(a.peerId)).toEqual([]);
    expect(inbox.get(host.peerId)![0]).toMatchObject({ type: 'tap', payload: { x: 1 }, from: a.peerId });
    expect(typeof inbox.get(b.peerId)![0].sentAt).toBe('number');
  });

  it('delivers addressed messages only to their recipient', async () => {
    const { host, guests: [a, b] } = await hostAndGuests(2);
    const got = { host: 0, b: 0 };
    host.onMessage(() => { got.host += 1; });
    b.onMessage(() => { got.b += 1; });

    await a.send({ type: 'secret', payload: 1, to: b.peerId });
    await waitFor(() => got.b === 1);
    await flush(5);
    expect(got.host).toBe(0);
  });

  it('ignores malformed frames, other rooms, and other protocol versions', async () => {
    const { host, room } = await hostAndGuests(0);
    const received: TransportMessage[] = [];
    host.onMessage((message) => received.push(message));
    const intruder = new bus.BroadcastChannel(bus.instances[0].name);
    const base = { v: 1, room: room.id, from: 'x', t: 'message', message: { type: 'hi', payload: 1 } };
    intruder.postMessage('not json');
    intruder.postMessage({ ...base, v: 2 });
    intruder.postMessage({ ...base, room: 'elsewhere' });
    intruder.postMessage({ ...base, t: 'unknown' });
    intruder.postMessage(base); // well-formed, but `x` is not a member
    await flush(5);
    expect(received).toEqual([]);
    intruder.close();
  });
});

describe('BroadcastChannelTransport: presence', () => {
  it('a leaving guest disappears from every roster', async () => {
    const { host, guests: [a, b] } = await hostAndGuests(2);
    await waitFor(() => b.peers.length === 3);
    await a.leaveRoom();
    expect(a.room).toBeNull();
    await waitFor(() => host.peers.length === 2 && b.peers.length === 2);
    expect(b.room?.players[a.peerId]).toBeUndefined();
  });

  it('a leaving host closes the room for guests', async () => {
    const { host, guests: [a] } = await hostAndGuests(1);
    await host.leaveRoom();
    await waitFor(() => a.room?.status === 'closed');
    expect(a.room?.players[host.peerId].connected).toBe(false);
  });

  it('drops silent guests after the heartbeat timeout and re-admits them when they come back', async () => {
    const options = { heartbeatMs: 10, peerTimeoutMs: 40 };
    const { host, guests: [a, b] } = await hostAndGuests(2, options);
    const aChannel = bus.instances[1]; // Channels are created host first, then guests in join order.
    aChannel.muted = true;

    await waitFor(() => !host.room?.players[a.peerId] && !b.room?.players[a.peerId], 1000);
    expect(host.peers).toHaveLength(2);

    aChannel.muted = false;
    await waitFor(() => Boolean(host.room?.players[a.peerId]), 1000);
    expect(a.room?.id).toBe(host.room?.id);
  });

  it('guests mark a silent host as disconnected and recover when it is heard again', async () => {
    const { host, guests: [a] } = await hostAndGuests(1, { heartbeatMs: 10, peerTimeoutMs: 40 });
    bus.instances[0].muted = true;
    await waitFor(() => a.room?.players[host.peerId].connected === false, 1000);
    expect(a.room?.status).toBe('waiting');
    bus.instances[0].muted = false;
    await waitFor(() => a.room?.players[host.peerId].connected === true, 1000);
  });

  it('disconnect leaves the room, closes the channel, and reports disconnected', async () => {
    const { host, guests: [a] } = await hostAndGuests(1);
    const rooms: unknown[] = [];
    a.onRoom((room) => rooms.push(room));
    await a.disconnect();
    expect(a.status).toBe('disconnected');
    expect(a.room).toBeNull();
    expect(rooms.at(-1)).toBeNull();
    await waitFor(() => host.peers.length === 1);
    expect(bus.openChannels()).toBe(1);
  });

  it('a pending join is rejected when the guest leaves first', async () => {
    const guest = make({ joinTimeoutMs: 1000 });
    await guest.connect();
    const joining = guest.joinRoom('ABC234');
    await flush();
    await guest.leaveRoom();
    await expect(joining).rejects.toMatchObject({ code: 'not-in-room' });
  });
});
