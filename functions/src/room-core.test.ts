import { describe, expect, it } from 'vitest';
import {
  buildCreateRoomUpdates,
  buildRoomRecords,
  finalizeJoinRoom,
  nextJoinRoom,
  nextJoinState,
  normalizeCode,
  parseCreateRoomInput,
  parseJoinRoomInput,
  nextRoomCreationLimit,
  ROOM_CREATE_LIMIT,
  ROOM_CREATE_WINDOW_MS,
} from './room-core.js';

describe('normalizeCode', () => {
  it('removes separators and uppercases the six-character code', () => {
    expect(normalizeCode(' ab-c 234 ')).toBe('ABC234');
  });

  it('rejects an empty code', () => {
    expect(() => normalizeCode('---')).toThrow('pairing code');
  });

  it.each([234_567, null, undefined, {}])('rejects non-string code %j', (code) => {
    expect(() => normalizeCode(code)).toThrow('pairing code');
  });
});

describe('parseCreateRoomInput', () => {
  it.each([
    ['undefined', { value: undefined }],
    ['NaN', { value: Number.NaN }],
    ['Infinity', { value: Infinity }],
    ['function', { value: () => null }],
    ['too deep', { a: { b: { c: { d: { e: { f: { g: { h: { i: 1 } } } } } } } } }],
    ['too large', { value: 'x'.repeat(32_768) }],
    ['too many nodes', Array.from({ length: 501 }, (_, i) => i)],
  ])('rejects non-bounded JSON initialState: %s', (_label, initialState) => {
    expect(() => parseCreateRoomInput({ name: 'Host', initialState })).toThrow('initialState');
  });

  it('rejects cyclic initialState', () => {
    const initialState: Record<string, unknown> = {};
    initialState.self = initialState;
    expect(() => parseCreateRoomInput({ name: 'Host', initialState })).toThrow('initialState');
  });
  it('accepts the supported capacity and TTL boundaries', () => {
    expect(parseCreateRoomInput({ name: 'Host', maxPlayers: 300, ttlMs: 86_400_000 })).toEqual({
      name: 'Host',
      maxPlayers: 300,
      ttlMs: 86_400_000,
      initialState: null,
    });

    expect(parseCreateRoomInput({ name: 'Host', maxPlayers: 2, ttlMs: 30_000 })).toEqual({
      name: 'Host',
      maxPlayers: 2,
      ttlMs: 30_000,
      initialState: null,
    });
  });

  it.each([
    ['whitespace-only', '   '],
    ['81-character', 'a'.repeat(81)],
    ['non-string', 123],
  ])('rejects a %s display name', (_label, name) => {
    expect(() => parseCreateRoomInput({ name })).toThrow('name');
  });

  it.each([1, 301, 2.5])('rejects invalid maxPlayers %s', (maxPlayers) => {
    expect(() => parseCreateRoomInput({ name: 'Host', maxPlayers })).toThrow('maxPlayers');
  });

  it.each([29_999, 86_400_001])('rejects invalid ttlMs %s', (ttlMs) => {
    expect(() => parseCreateRoomInput({ name: 'Host', ttlMs })).toThrow('ttlMs');
  });
});

describe('parseJoinRoomInput', () => {
  it('normalizes the code and trims the participant name', () => {
    expect(parseJoinRoomInput({ code: 'ab-c234', name: '  Guest  ' })).toEqual({
      code: 'ABC234',
      name: 'Guest',
    });
  });

  it.each([
    ['whitespace-only', '   '],
    ['81-character', 'a'.repeat(81)],
    ['non-string', 123],
  ])('rejects a %s display name', (_label, name) => {
    expect(() => parseJoinRoomInput({ code: 'ABC234', name })).toThrow('name');
  });
});

describe('buildRoomRecords', () => {
  it('builds server-authoritative room, membership, and expiring code records', () => {
    const records = buildRoomRecords({
      roomId: 'room-1',
      code: 'ABC234',
      hostId: 'user-1',
      name: 'Host',
      maxPlayers: 10,
      ttlMs: 60_000,
      now: 1_000,
      initialState: { round: 0 },
    });

    expect(records.pairingCode).toEqual({
      roomId: 'room-1',
      hostId: 'user-1',
      createdAt: 1_000,
      expiresAt: 61_000,
      maxPlayers: 10,
    });
    expect(records.membership).toBe(true);
    expect(records.room.meta.participantCount).toBe(1);
    expect(records.room.meta.pairingCodeExpiresAt).toBe(61_000);
    expect(records.room.players['user-1'].role).toBe('host');
  });
});

describe('buildCreateRoomUpdates', () => {
  it('builds one atomic update containing the room, code, and host membership', () => {
    const updates = buildCreateRoomUpdates({
      roomId: 'room-1',
      code: 'ABC234',
      hostId: 'user-1',
      name: 'Host',
      maxPlayers: 10,
      ttlMs: 60_000,
      now: 1_000,
      initialState: { round: 0 },
    });

    expect(updates['rooms/room-1']).toMatchObject({
      meta: { hostId: 'user-1', code: 'ABC234', participantCount: 1 },
    });
    expect(updates['pairingCodes/ABC234']).toMatchObject({ roomId: 'room-1', expiresAt: 61_000 });
    expect(updates['roomMembers/room-1/user-1']).toBe(true);
  });
});

describe('nextJoinState', () => {
  it('rejects a new member when the room is full', () => {
    expect(nextJoinState({ count: 2, members: { host: true, guest: true } }, 'new-user', 2))
      .toBeUndefined();
  });

  it('keeps repeat joins by the same uid idempotent', () => {
    const current = { count: 2, members: { host: true, guest: true } };
    expect(nextJoinState(current, 'guest', 2)).toEqual(current);
  });

  it('adds a new uid and increments the authoritative count', () => {
    expect(nextJoinState({ count: 1, members: { host: true } }, 'guest', 2)).toEqual({
      count: 2,
      members: { host: true, guest: true },
    });
  });

  it.each([null, {}, { count: 1, members: null }])('rejects malformed join state %j', (state) => {
    expect(nextJoinState(state, 'guest', 2)).toBeUndefined();
  });
});

describe('nextJoinRoom', () => {
  const room = {
    meta: {
      status: 'waiting',
      maxPlayers: 2,
      participantCount: 1,
      pairingCodeExpiresAt: 61_000,
    },
    joinState: { count: 1, members: { host: true } },
  };

  it('rejects an abandoned room inside the transaction decision', () => {
    expect(nextJoinRoom({ ...room, meta: { ...room.meta, status: 'abandoned' } }, 'guest', 1_000))
      .toBeUndefined();
  });

  it.each(['playing', 'finished', 'unknown', undefined])('rejects non-waiting status %s', (status) => {
    expect(nextJoinRoom({ ...room, meta: { ...room.meta, status } }, 'guest', 1_000)).toBeUndefined();
  });

  it('rejects an expired pairing code inside the transaction decision', () => {
    expect(nextJoinRoom(room, 'guest', 61_000)).toBeUndefined();
  });

  it('prunes expired reservations before applying capacity', () => {
    const current = {
      ...room,
      joinState: {
        count: 2,
        members: { host: true, stale: { state: 'reserved', expiresAt: 900 } },
      },
    };

    const next = nextJoinRoom(current, 'guest', 1_000);
    expect(next?.joinState).toEqual({
      count: 2,
      members: { host: true, guest: { state: 'reserved', expiresAt: 31_000 } },
    });
    expect(next?.meta.participantCount).toBe(2);
  });

  it('keeps a permanent member idempotent without creating a lease', () => {
    expect(nextJoinRoom(room, 'host', 1_000)).toEqual(room);
  });
});

describe('nextRoomCreationLimit', () => {
  it('exports and enforces ten creates per fixed one-hour window', () => {
    expect(ROOM_CREATE_LIMIT).toBe(10);
    expect(ROOM_CREATE_WINDOW_MS).toBe(3_600_000);
    expect(nextRoomCreationLimit({ windowStartedAt: 1_000, count: 9 }, 2_000)).toEqual({ windowStartedAt: 1_000, count: 10 });
    expect(nextRoomCreationLimit({ windowStartedAt: 1_000, count: 10 }, 2_000)).toBeUndefined();
    expect(nextRoomCreationLimit({ windowStartedAt: 1_000, count: 10 }, 3_601_000)).toEqual({ windowStartedAt: 3_601_000, count: 1 });
  });
});

describe('finalizeJoinRoom', () => {
  const player = {
    id: 'guest-a',
    name: 'Guest A',
    connected: true,
    role: 'participant' as const,
    joinedAt: 1_000,
    lastSeenAt: 1_000,
  };

  it.each(['playing', 'finished', 'abandoned', 'unknown'])(
    'rejects a valid reservation when room status changes to %s before finalization',
    (status) => {
      const reserved = {
        meta: {
          status, maxPlayers: 2, participantCount: 2,
          pairingCodeExpiresAt: 100_000, updatedAt: 1_000,
        },
        players: { host: { id: 'host' } },
        joinState: {
          count: 2,
          members: { host: true, 'guest-a': { state: 'reserved', expiresAt: 31_000 } },
        },
      };

      expect(finalizeJoinRoom(reserved, 'guest-a', 31_000, player, 2_000)).toBeUndefined();
    },
  );

  it('rejects a valid reservation when the pairing code expires before finalization', () => {
    const reserved = {
      meta: {
        status: 'waiting', maxPlayers: 2, participantCount: 2,
        pairingCodeExpiresAt: 2_000, updatedAt: 1_000,
      },
      players: { host: { id: 'host' } },
      joinState: {
        count: 2,
        members: { host: true, 'guest-a': { state: 'reserved', expiresAt: 31_000 } },
      },
    };

    expect(finalizeJoinRoom(reserved, 'guest-a', 31_000, player, 2_000)).toBeUndefined();
  });

  it('prevents delayed A from finalizing after B replaces its expired reservation', () => {
    const base = {
      meta: {
        status: 'waiting', maxPlayers: 2, participantCount: 1,
        pairingCodeExpiresAt: 100_000, updatedAt: 0,
      },
      players: { host: { id: 'host' } },
      joinState: { count: 1, members: { host: true } },
    };
    const reservedByA = nextJoinRoom(base, 'guest-a', 1_000)!;
    const reservedByB = nextJoinRoom(reservedByA, 'guest-b', 31_001)!;

    expect(finalizeJoinRoom(reservedByB, 'guest-a', 31_000, player, 31_002))
      .toBeUndefined();

    const finalizedByB = finalizeJoinRoom(
      reservedByB,
      'guest-b',
      61_001,
      { ...player, id: 'guest-b', name: 'Guest B' },
      31_003,
    );
    expect(finalizedByB?.joinState).toEqual({ count: 2, members: { host: true, 'guest-b': true } });
    expect(finalizedByB?.meta.participantCount).toBe(2);
  });

  it('rejects finalization after the reservation expires', () => {
    const reserved = {
      meta: { participantCount: 2 },
      players: {},
      joinState: {
        count: 2,
        members: { host: true, 'guest-a': { state: 'reserved', expiresAt: 31_000 } },
      },
    };
    expect(finalizeJoinRoom(reserved, 'guest-a', 31_000, player, 31_000)).toBeUndefined();
  });

  it('recognizes a permanent member after playing starts so roomMembers can be repaired', () => {
    const permanent = {
      meta: {
        status: 'playing', maxPlayers: 2, pairingCodeExpiresAt: 1_500,
        participantCount: 2, updatedAt: 1_000,
      },
      players: { 'guest-a': player },
      joinState: { count: 2, members: { host: true, 'guest-a': true } },
    };
    expect(finalizeJoinRoom(permanent, 'guest-a', undefined, player, 2_001)).toEqual(permanent);
  });
});
