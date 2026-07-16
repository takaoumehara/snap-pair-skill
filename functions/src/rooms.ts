import { randomBytes, randomInt } from 'node:crypto';
import { getApp, getApps, initializeApp } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import {
  buildCreateRoomUpdates,
  finalizeJoinRoom,
  nextJoinRoom,
  nextRoomCreationLimit,
  parseCreateRoomInput,
  parseJoinRoomInput,
} from './room-core.js';
import { compareAndSetJson, restJsonUrl, type CasResult } from './database-cas.js';

if (getApps().length === 0) initializeApp();

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const MAX_CODE_ATTEMPTS = 10;

export interface RoomHandlerDependencies {
  getDb: () => ReturnType<typeof getDatabase>;
  now: () => number;
  randomCode: () => string;
  randomRoomId: () => string;
  runAtomic?: (reference: ReturnType<ReturnType<typeof getDatabase>['ref']>, update: (current: unknown) => any) => Promise<CasResult<any>>;
}

function randomCode(): string {
  return Array.from(
    { length: 6 },
    () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)],
  ).join('');
}

function randomRoomId(): string {
  return randomBytes(16).toString('hex');
}

function invalidInput(error: unknown): never {
  throw new HttpsError(
    'invalid-argument',
    error instanceof Error ? error.message : 'Invalid room request',
  );
}

async function firebaseOperation<T>(message: string, operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    console.error(message, error);
    throw new HttpsError('internal', message);
  }
}

const defaultDependencies: RoomHandlerDependencies = {
  getDb: getDatabase,
  now: Date.now,
  randomCode,
  randomRoomId,
  runAtomic: async (reference, update) => compareAndSetJson(
    restJsonUrl(reference.toString()),
    update,
    { accessToken: async () => (await getApp().options.credential?.getAccessToken())?.access_token },
  ),
};

async function atomic(
  deps: RoomHandlerDependencies,
  reference: ReturnType<ReturnType<typeof getDatabase>['ref']>,
  update: (current: unknown) => any,
) {
  if (deps.runAtomic) return deps.runAtomic(reference, update);
  const result = await reference.transaction(update, undefined, false);
  return { committed: result.committed, value: result.snapshot.val() };
}

export async function createRoomHandler(request: any, deps: RoomHandlerDependencies = defaultDependencies) {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Authentication is required');

  let input;
  try {
    input = parseCreateRoomInput(request.data);
  } catch (error) {
    invalidInput(error);
  }

  const db = deps.getDb();
  const roomId = deps.randomRoomId();
  const now = deps.now();
  const quota = await firebaseOperation(
    'Could not enforce room creation limit',
    () => db.ref(`roomCreationLimits/${uid}`).transaction((current) => nextRoomCreationLimit(current, now)),
  );
  if (!quota.committed) throw new HttpsError('resource-exhausted', 'Room creation limit exceeded');

  for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt += 1) {
    const code = deps.randomCode();
    const pairingCode = {
      roomId,
      hostId: uid,
      createdAt: now,
      expiresAt: now + input.ttlMs,
      maxPlayers: input.maxPlayers,
    };
    const codeRef = db.ref(`pairingCodes/${code}`);
    const reservation = await firebaseOperation(
      'Could not reserve a pairing code',
      () => codeRef.transaction((current) => current === null ? pairingCode : undefined),
    );
    if (!reservation.committed) continue;

    try {
      const updates = buildCreateRoomUpdates({
        roomId,
        code,
        hostId: uid,
        name: input.name,
        maxPlayers: input.maxPlayers,
        ttlMs: input.ttlMs,
        now,
        initialState: input.initialState,
      });
      await firebaseOperation('Could not create room', () => db.ref().update(updates));
      return { roomId, code, expiresAt: pairingCode.expiresAt };
    } catch (error) {
      try {
        await codeRef.transaction((current) =>
          current && (current as { roomId?: unknown }).roomId === roomId ? null : undefined,
        );
      } catch (cleanupError) {
        console.error('Could not release pairing code reservation', cleanupError);
      }
      if (error instanceof HttpsError) throw error;
      console.error('Could not create room', error);
      throw new HttpsError('internal', 'Could not create room');
    }
  }

  throw new HttpsError('resource-exhausted', 'Could not allocate a pairing code');
}

export const createSnapRoom = onCall({ enforceAppCheck: true }, (request) => createRoomHandler(request));

export async function joinRoomHandler(request: any, deps: RoomHandlerDependencies = defaultDependencies) {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Authentication is required');

  let input;
  try {
    input = parseJoinRoomInput(request.data);
  } catch (error) {
    invalidInput(error);
  }

  const db = deps.getDb();
  const now = deps.now();
  const codeSnapshot = await firebaseOperation(
    'Could not read pairing code',
    () => db.ref(`pairingCodes/${input.code}`).get(),
  );
  const codeRecord = codeSnapshot.val() as {
    roomId?: unknown;
    expiresAt?: unknown;
    maxPlayers?: unknown;
  } | null;

  if (!codeRecord || typeof codeRecord.roomId !== 'string') {
    throw new HttpsError('not-found', 'Pairing code was not found');
  }
  if (typeof codeRecord.expiresAt !== 'number' || codeRecord.expiresAt <= now) {
    throw new HttpsError('deadline-exceeded', 'Pairing code has expired');
  }
  if (
    !Number.isInteger(codeRecord.maxPlayers)
    || Number(codeRecord.maxPlayers) < 2
    || Number(codeRecord.maxPlayers) > 300
  ) {
    throw new HttpsError('failed-precondition', 'Room capacity is invalid');
  }

  const roomId = codeRecord.roomId;
  const roomRef = db.ref(`rooms/${roomId}`);
  // Prime the complete transaction location. A fresh Admin SDK worker (most
  // visibly in the Emulator) may otherwise invoke the first transaction
  // callback with an empty local cache, which our safe validator correctly
  // aborts before it has seen the server room.
  const roomSnapshot = await firebaseOperation(
    'Could not read room',
    () => roomRef.get(),
  );
  const meta = roomSnapshot.child('meta').val() as { status?: unknown } | null;
  if (!meta) throw new HttpsError('not-found', 'Room was not found');
  if (meta.status !== 'waiting') {
    throw new HttpsError('failed-precondition', 'Room is not waiting for participants');
  }

  const player = {
    id: uid,
    name: input.name,
    connected: true,
    role: 'participant' as const,
    joinedAt: now,
    lastSeenAt: now,
  };
  const joined = await firebaseOperation(
    'Could not reserve room capacity',
    () => atomic(deps, roomRef, (current) => {
      const operationNow = deps.now();
      const reserved = nextJoinRoom(current, uid, operationNow);
      if (!reserved) return undefined;
      const member = reserved.joinState?.members?.[uid] as true | { expiresAt?: unknown } | undefined;
      const expectedExpiresAt = member !== true && typeof member?.expiresAt === 'number'
        ? member.expiresAt
        : undefined;
      return finalizeJoinRoom(reserved, uid, expectedExpiresAt, player, operationNow);
    }),
  );
  if (!joined.committed) {
    const current = joined.value as {
      meta?: { status?: unknown; pairingCodeExpiresAt?: unknown };
    } | null;
    const classificationNow = deps.now();
    if (current?.meta?.status !== 'waiting') {
      throw new HttpsError('failed-precondition', 'Room is not waiting for participants');
    }
    if (
      typeof current?.meta?.pairingCodeExpiresAt !== 'number'
      || current.meta.pairingCodeExpiresAt <= classificationNow
    ) {
      throw new HttpsError('deadline-exceeded', 'Pairing code has expired');
    }
    throw new HttpsError('resource-exhausted', 'Room is full');
  }

  await firebaseOperation(
    'Could not persist room membership',
    () => db.ref(`roomMembers/${roomId}/${uid}`).set(true),
  );

  return { roomId, playerId: uid };
}

export const joinSnapRoom = onCall({ enforceAppCheck: true }, (request) => joinRoomHandler(request));
