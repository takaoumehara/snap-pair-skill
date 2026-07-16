const CODE_PATTERN = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/;
const MIN_TTL_MS = 30_000;
const MAX_TTL_MS = 86_400_000;
const DEFAULT_TTL_MS = 300_000;
const DEFAULT_MAX_PLAYERS = 50;
export const INITIAL_STATE_MAX_BYTES = 32_768;
export const INITIAL_STATE_MAX_DEPTH = 8;
export const INITIAL_STATE_MAX_NODES = 500;
export const ROOM_CREATE_LIMIT = 10;
export const ROOM_CREATE_WINDOW_MS = 60 * 60 * 1000;

type JsonObject = Record<string, unknown>;

function validateJsonValue(value: unknown, depth: number, seen: Set<object>, counter: { nodes: number }): void {
  counter.nodes += 1;
  if (counter.nodes > INITIAL_STATE_MAX_NODES) throw new Error('initialState exceeds 500 nodes');
  if (depth > INITIAL_STATE_MAX_DEPTH) throw new Error('initialState exceeds maximum depth 8');
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('initialState numbers must be finite');
    return;
  }
  if (typeof value !== 'object') throw new Error('initialState must be JSON-compatible');
  if (seen.has(value)) throw new Error('initialState must not contain cycles');
  if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype) {
    throw new Error('initialState must contain only JSON objects and arrays');
  }
  seen.add(value);
  for (const child of Array.isArray(value) ? value : Object.values(value as Record<string, unknown>)) {
    validateJsonValue(child, depth + 1, seen, counter);
  }
  seen.delete(value);
}

export function validateInitialState(value: unknown): void {
  validateJsonValue(value, 0, new Set(), { nodes: 0 });
  const serialized = JSON.stringify(value);
  if (serialized === undefined || Buffer.byteLength(serialized, 'utf8') > INITIAL_STATE_MAX_BYTES) {
    throw new Error('initialState exceeds serialized maximum of 32768 bytes');
  }
}

export function nextRoomCreationLimit(current: unknown, now: number) {
  if (typeof current !== 'object' || current === null) return { windowStartedAt: now, count: 1 };
  const value = current as { windowStartedAt?: unknown; count?: unknown };
  if (typeof value.windowStartedAt !== 'number' || !Number.isInteger(value.count) || Number(value.count) < 0
    || now - value.windowStartedAt >= ROOM_CREATE_WINDOW_MS) {
    return { windowStartedAt: now, count: 1 };
  }
  if (Number(value.count) >= ROOM_CREATE_LIMIT) return undefined;
  return { windowStartedAt: value.windowStartedAt, count: Number(value.count) + 1 };
}

export interface CreateRoomInput {
  name: string;
  maxPlayers: number;
  ttlMs: number;
  initialState: unknown;
}

export interface JoinRoomInput {
  code: string;
  name: string;
}

export interface JoinState {
  count: number;
  members: Record<string, true | JoinReservation>;
}

export interface JoinReservation {
  state: 'reserved';
  expiresAt: number;
}

const JOIN_RESERVATION_TTL_MS = 30_000;

export type BuildRoomRecordsParams = Parameters<typeof buildRoomRecords>[0];

function parseName(value: unknown): string {
  if (typeof value !== 'string') {
    throw new Error('name must be a string');
  }

  const name = value.trim();
  if (name.length < 1 || name.length > 80) {
    throw new Error('name must contain 1 to 80 characters');
  }
  return name;
}

export function normalizeCode(value: unknown): string {
  if (typeof value !== 'string') {
    throw new Error('pairing code must be a string');
  }

  const code = value
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');

  if (!CODE_PATTERN.test(code)) {
    throw new Error('pairing code must contain 6 supported characters');
  }
  return code;
}

export function parseCreateRoomInput(value: unknown): CreateRoomInput {
  const input = (value ?? {}) as JsonObject;
  const maxPlayers = input.maxPlayers ?? DEFAULT_MAX_PLAYERS;
  const ttlMs = input.ttlMs ?? DEFAULT_TTL_MS;

  if (!Number.isInteger(maxPlayers) || Number(maxPlayers) < 2 || Number(maxPlayers) > 300) {
    throw new Error('maxPlayers must be an integer from 2 to 300');
  }
  if (!Number.isInteger(ttlMs) || Number(ttlMs) < MIN_TTL_MS || Number(ttlMs) > MAX_TTL_MS) {
    throw new Error('ttlMs must be an integer from 30000 to 86400000');
  }

  const initialState = Object.prototype.hasOwnProperty.call(input, 'initialState') ? input.initialState : null;
  validateInitialState(initialState);
  return {
    name: parseName(input.name),
    maxPlayers: Number(maxPlayers),
    ttlMs: Number(ttlMs),
    initialState,
  };
}

export function parseJoinRoomInput(value: unknown): JoinRoomInput {
  const input = (value ?? {}) as JsonObject;
  return {
    code: normalizeCode(input.code),
    name: parseName(input.name),
  };
}

export function buildRoomRecords(params: {
  roomId: string;
  code: string;
  hostId: string;
  name: string;
  maxPlayers: number;
  ttlMs: number;
  now: number;
  initialState: unknown;
}) {
  const player = {
    id: params.hostId,
    name: params.name,
    connected: true,
    role: 'host' as const,
    joinedAt: params.now,
    lastSeenAt: params.now,
  };

  return {
    room: {
      meta: {
        hostId: params.hostId,
        code: params.code,
        status: 'waiting' as const,
        createdAt: params.now,
        updatedAt: params.now,
        participantCount: 1,
        maxPlayers: params.maxPlayers,
        pairingCodeExpiresAt: params.now + params.ttlMs,
      },
      players: {
        [params.hostId]: player,
      },
      joinState: {
        count: 1,
        members: {
          [params.hostId]: true,
        },
      },
      state: params.initialState,
    },
    pairingCode: {
      roomId: params.roomId,
      hostId: params.hostId,
      createdAt: params.now,
      expiresAt: params.now + params.ttlMs,
      maxPlayers: params.maxPlayers,
    },
    player,
    membership: true as const,
  };
}

export function buildCreateRoomUpdates(params: BuildRoomRecordsParams): Record<string, unknown> {
  const records = buildRoomRecords(params);
  return {
    [`rooms/${params.roomId}`]: records.room,
    [`pairingCodes/${params.code}`]: records.pairingCode,
    [`roomMembers/${params.roomId}/${params.hostId}`]: records.membership,
  };
}

export function nextJoinState(current: unknown, uid: string, maxPlayers: number): JoinState | undefined {
  if (typeof current !== 'object' || current === null) return undefined;

  const value = current as { count?: unknown; members?: unknown };
  if (!Number.isInteger(value.count) || Number(value.count) < 1) return undefined;
  if (typeof value.members !== 'object' || value.members === null || Array.isArray(value.members)) {
    return undefined;
  }

  const members = value.members as Record<string, unknown>;
  if (members[uid] === true) return current as JoinState;
  if (Number(value.count) >= maxPlayers) return undefined;

  return {
    count: Number(value.count) + 1,
    members: { ...members, [uid]: true } as Record<string, true>,
  };
}

export function nextJoinRoom(current: unknown, uid: string, now: number): Record<string, any> | undefined {
  if (typeof current !== 'object' || current === null) return undefined;

  const room = current as Record<string, any>;
  const meta = room.meta;
  const joinState = room.joinState;
  if (typeof meta !== 'object' || meta === null || typeof joinState !== 'object' || joinState === null) {
    return undefined;
  }
  if (meta.status !== 'waiting') return undefined;
  if (typeof meta.pairingCodeExpiresAt !== 'number' || meta.pairingCodeExpiresAt <= now) return undefined;
  if (!Number.isInteger(meta.maxPlayers) || meta.maxPlayers < 2 || meta.maxPlayers > 300) return undefined;
  if (typeof joinState.members !== 'object' || joinState.members === null) return undefined;

  if (joinState.members[uid] === true) return room;

  const members = Object.fromEntries(
    Object.entries(joinState.members).filter(([, member]) => {
      if (member === true) return true;
      return typeof member === 'object'
        && member !== null
        && (member as JoinReservation).state === 'reserved'
        && typeof (member as JoinReservation).expiresAt === 'number'
        && (member as JoinReservation).expiresAt > now;
    }),
  ) as JoinState['members'];

  if (members[uid]) return { ...room, joinState: { count: Object.keys(members).length, members } };
  if (Object.keys(members).length >= meta.maxPlayers) return undefined;

  members[uid] = { state: 'reserved', expiresAt: now + JOIN_RESERVATION_TTL_MS };
  const count = Object.keys(members).length;
  return {
    ...room,
    meta: { ...meta, participantCount: count, updatedAt: now },
    joinState: { count, members },
  };
}

export function finalizeJoinRoom(
  current: unknown,
  uid: string,
  expectedExpiresAt: number | undefined,
  player: Record<string, unknown>,
  now: number,
): Record<string, any> | undefined {
  if (typeof current !== 'object' || current === null) return undefined;

  const room = current as Record<string, any>;
  const joinState = room.joinState;
  if (typeof joinState !== 'object' || joinState === null) return undefined;
  if (typeof joinState.members !== 'object' || joinState.members === null) return undefined;

  const member = joinState.members[uid] as true | JoinReservation | undefined;
  if (member === true) return room;
  const meta = room.meta;
  if (
    typeof meta !== 'object'
    || meta === null
    || meta.status !== 'waiting'
    || typeof meta.pairingCodeExpiresAt !== 'number'
    || meta.pairingCodeExpiresAt <= now
  ) {
    return undefined;
  }
  if (
    !member
    || member.state !== 'reserved'
    || member.expiresAt !== expectedExpiresAt
    || member.expiresAt <= now
  ) {
    return undefined;
  }

  const members = Object.fromEntries(
    Object.entries(joinState.members).filter(([, value]) =>
      value === true
      || (typeof value === 'object'
        && value !== null
        && (value as JoinReservation).state === 'reserved'
        && (value as JoinReservation).expiresAt > now),
    ),
  ) as JoinState['members'];
  if (members[uid] !== member) return undefined;

  members[uid] = true;
  const count = Object.keys(members).length;
  return {
    ...room,
    meta: { ...room.meta, participantCount: count, updatedAt: now },
    players: { ...room.players, [uid]: player },
    joinState: { count, members },
  };
}
