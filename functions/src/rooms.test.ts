import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HttpsError } from 'firebase-functions/v2/https';
import { createRoomHandler, joinRoomHandler, type RoomHandlerDependencies } from './rooms.js';

function snapshot(value: any) {
  return {
    val: () => value,
    child: (path: string) => snapshot(path.split('/').reduce((v, key) => v?.[key], value)),
  };
}

function fakeDb(
  initial: Record<string, any> = {},
  afterTransaction?: (path: string, transactionNumber: number, data: Record<string, any>) => void,
) {
  const data = structuredClone(initial);
  const transactionCounts = new Map<string, number>();
  const rootUpdate = vi.fn(async (updates: Record<string, any>) => {
    for (const [path, value] of Object.entries(updates)) setPath(path, value);
  });
  const setPath = (path: string, value: any) => {
    const keys = path.split('/'); let node = data;
    for (const key of keys.slice(0, -1)) node = node[key] ??= {};
    if (value === null) delete node[keys.at(-1)!]; else node[keys.at(-1)!] = value;
  };
  const getPath = (path: string) => path ? path.split('/').reduce((v, key) => v?.[key], data) : data;
  const ref = (path = ''): any => ({
    get: vi.fn(async () => snapshot(getPath(path))),
    set: vi.fn(async (value: any) => setPath(path, value)),
    update: path ? vi.fn(async (updates: any) => Object.entries(updates).forEach(([key, value]) => setPath(`${path}/${key}`, value))) : rootUpdate,
    transaction: vi.fn(async (fn: (value: any) => any) => {
      const before = getPath(path) ?? null;
      const after = fn(structuredClone(before));
      if (after === undefined) return { committed: false, snapshot: snapshot(before) };
      setPath(path, after);
      const transactionNumber = (transactionCounts.get(path) ?? 0) + 1;
      transactionCounts.set(path, transactionNumber);
      afterTransaction?.(path, transactionNumber, data);
      return { committed: true, snapshot: snapshot(after) };
    }),
  });
  return { db: { ref } as any, data, rootUpdate };
}

function deps(db: any): RoomHandlerDependencies {
  return { getDb: () => db, now: () => 1_000, randomCode: () => 'ABC234', randomRoomId: () => 'room-1' };
}

describe('rooms callable orchestration', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reserves a code then atomically creates room and membership', async () => {
    const fake = fakeDb();
    await expect(createRoomHandler({ auth: { uid: 'host' }, data: { name: 'Host', maxPlayers: 2, ttlMs: 30_000, initialState: {} } }, deps(fake.db)))
      .resolves.toEqual({ roomId: 'room-1', code: 'ABC234', expiresAt: 31_000 });
    expect(fake.rootUpdate).toHaveBeenCalledOnce();
    expect(fake.data.roomMembers['room-1'].host).toBe(true);
    expect(fake.data.roomCreationLimits.host.count).toBe(1);
  });

  it('releases only its pairing-code reservation when root creation fails', async () => {
    const fake = fakeDb();
    fake.rootUpdate.mockRejectedValueOnce(new Error('write failed'));
    await expect(createRoomHandler({ auth: { uid: 'host' }, data: { name: 'Host', initialState: {} } }, deps(fake.db)))
      .rejects.toMatchObject({ code: 'internal' });
    expect(fake.data.pairingCodes?.ABC234).toBeUndefined();
  });

  it('repairs roomMembers when the same uid retries after its membership write failed', async () => {
    const initial = {
      pairingCodes: { ABC234: { roomId: 'room-1', expiresAt: 31_000, maxPlayers: 2 } },
      rooms: { 'room-1': { meta: { status: 'waiting', maxPlayers: 2, participantCount: 1, pairingCodeExpiresAt: 31_000 }, players: { host: { id: 'host' } }, joinState: { count: 1, members: { host: true } } } },
    };
    const fake = fakeDb(initial);
    const originalRef = fake.db.ref;
    let fail = true;
    fake.db.ref = (path = '') => {
      const result = originalRef(path);
      if (path === 'roomMembers/room-1/guest') result.set = vi.fn(async (value: any) => { if (fail) { fail = false; throw new Error('failed'); } result.transaction(() => value); });
      return result;
    };
    await expect(joinRoomHandler({ auth: { uid: 'guest' }, data: { code: 'ABC234', name: 'Guest' } }, deps(fake.db))).rejects.toMatchObject({ code: 'internal' });
    await expect(joinRoomHandler({ auth: { uid: 'guest' }, data: { code: 'ABC234', name: 'Guest' } }, deps(fake.db))).resolves.toEqual({ roomId: 'room-1', playerId: 'guest' });
    expect(fake.data.roomMembers['room-1'].guest).toBe(true);
    expect(fake.data.rooms['room-1'].joinState.count).toBe(2);
  });

  it('preserves HttpsError and rejects every non-waiting status before reservation', async () => {
    for (const status of ['playing', 'finished', 'abandoned', 'unknown']) {
      const fake = fakeDb({ pairingCodes: { ABC234: { roomId: 'room-1', expiresAt: 31_000, maxPlayers: 2 } }, rooms: { 'room-1': { meta: { status } } } });
      await expect(joinRoomHandler({ auth: { uid: 'guest' }, data: { code: 'ABC234', name: 'Guest' } }, deps(fake.db)))
        .rejects.toMatchObject({ code: 'failed-precondition' });
    }
    await expect(createRoomHandler({ data: {} }, deps(fakeDb().db))).rejects.toBeInstanceOf(HttpsError);
  });

  it('maps a status change after reservation to failed-precondition', async () => {
    const initial = {
      pairingCodes: { ABC234: { roomId: 'room-1', expiresAt: 31_000, maxPlayers: 2 } },
      rooms: { 'room-1': { meta: { status: 'waiting', maxPlayers: 2, participantCount: 1, pairingCodeExpiresAt: 31_000 }, players: { host: { id: 'host' } }, joinState: { count: 1, members: { host: true } } } },
    };
    const fake = fakeDb(initial);
    const handlerDeps = deps(fake.db);
    handlerDeps.runAtomic = async (reference, update) => {
      fake.data.rooms['room-1'].meta.status = 'playing';
      const result = await reference.transaction(update);
      return { committed: result.committed, value: result.snapshot.val() };
    };

    await expect(joinRoomHandler({ auth: { uid: 'guest' }, data: { code: 'ABC234', name: 'Guest' } }, handlerDeps))
      .rejects.toMatchObject({ code: 'failed-precondition' });
  });

  it('maps pairing-code expiry after reservation to deadline-exceeded', async () => {
    const initial = {
      pairingCodes: { ABC234: { roomId: 'room-1', expiresAt: 31_000, maxPlayers: 2 } },
      rooms: { 'room-1': { meta: { status: 'waiting', maxPlayers: 2, participantCount: 1, pairingCodeExpiresAt: 31_000 }, players: { host: { id: 'host' } }, joinState: { count: 1, members: { host: true } } } },
    };
    let now = 1_000;
    const fake = fakeDb(initial);
    const handlerDeps = { ...deps(fake.db), now: () => now };
    handlerDeps.runAtomic = async (reference, update) => {
      now = 31_000;
      const result = await reference.transaction(update);
      return { committed: result.committed, value: result.snapshot.val() };
    };

    await expect(joinRoomHandler(
      { auth: { uid: 'guest' }, data: { code: 'ABC234', name: 'Guest' } },
      handlerDeps,
    )).rejects.toMatchObject({ code: 'deadline-exceeded' });
  });

  it('rejects the next sequential join after one join fills the room', async () => {
    const fake = fakeDb({
      pairingCodes: { ABC234: { roomId: 'room-1', expiresAt: 31_000, maxPlayers: 2 } },
      rooms: { 'room-1': { meta: { status: 'waiting', maxPlayers: 2, participantCount: 1, pairingCodeExpiresAt: 31_000 }, players: { host: { id: 'host' } }, joinState: { count: 1, members: { host: true } } } },
    });
    await expect(joinRoomHandler({ auth: { uid: 'guest-a' }, data: { code: 'ABC234', name: 'A' } }, deps(fake.db))).resolves.toMatchObject({ playerId: 'guest-a' });
    await expect(joinRoomHandler({ auth: { uid: 'guest-b' }, data: { code: 'ABC234', name: 'B' } }, deps(fake.db))).rejects.toMatchObject({ code: 'resource-exhausted' });
    expect(fake.data.rooms['room-1'].joinState.members).toEqual({ host: true, 'guest-a': true });
  });
});
