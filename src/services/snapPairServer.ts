import { FirebaseError } from 'firebase/app';
import {
  httpsCallable,
  type Functions,
} from 'firebase/functions';

export interface CreateSnapRoomRequest {
  name: string;
  maxPlayers: number;
  ttlMs: number;
  initialState: unknown;
}

export interface CreateSnapRoomResponse {
  roomId: string;
  code: string;
  expiresAt: number;
}

export interface JoinSnapRoomRequest {
  code: string;
  name: string;
}

export interface JoinSnapRoomResponse {
  roomId: string;
  playerId: string;
}

export interface SnapPairServer {
  createRoom(input: CreateSnapRoomRequest): Promise<CreateSnapRoomResponse>;
  joinRoom(input: JoinSnapRoomRequest): Promise<JoinSnapRoomResponse>;
}

export type SnapPairServerErrorCategory = 'auth' | 'not-found' | 'expired' | 'capacity' | 'state' | 'invalid' | 'temporary' | 'network' | 'schema';

export class SnapPairServerError extends Error {
  constructor(public readonly category: SnapPairServerErrorCategory, message: string) {
    super(message);
    this.name = 'SnapPairServerError';
  }
}

type UnaryCallable = (data: unknown) => Promise<{ data: unknown }>;

type CallableFactory = (
  functions: Functions,
  name: string,
) => UnaryCallable;

const CREATE_CODE_PATTERN = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/;
const FIREBASE_KEY_FORBIDDEN_PATTERN = /[.#$[\]/]|[\u0000-\u001F\u007F]/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isSafeFirebaseKey(value: unknown): value is string {
  return typeof value === 'string'
    && value.length > 0
    && value === value.trim()
    && !FIREBASE_KEY_FORBIDDEN_PATTERN.test(value);
}

export function parseCreateRoomResponse(value: unknown): CreateSnapRoomResponse {
  if (
    !isRecord(value)
    || !isSafeFirebaseKey(value.roomId)
    || typeof value.code !== 'string'
    || !CREATE_CODE_PATTERN.test(value.code)
    || typeof value.expiresAt !== 'number'
    || !Number.isSafeInteger(value.expiresAt)
    || value.expiresAt <= 0
  ) {
    throw new Error('Invalid response from createSnapRoom.');
  }
  return { roomId: value.roomId, code: value.code, expiresAt: value.expiresAt };
}

export function parseJoinRoomResponse(value: unknown): JoinSnapRoomResponse {
  if (
    !isRecord(value)
    || !isSafeFirebaseKey(value.roomId)
    || !isSafeFirebaseKey(value.playerId)
  ) {
    throw new Error('Invalid response from joinSnapRoom.');
  }
  return { roomId: value.roomId, playerId: value.playerId };
}

const CALLABLE_ERRORS: Record<string, [SnapPairServerErrorCategory, string]> = {
  'functions/unauthenticated': ['auth', 'Sign in before creating or joining a room.'],
  'functions/not-found': ['not-found', 'The pairing code or room was not found.'],
  'functions/deadline-exceeded': ['expired', 'The pairing code has expired.'],
  'functions/resource-exhausted': ['capacity', 'The room is full or no pairing code is currently available.'],
  'functions/failed-precondition': ['state', 'The room is no longer available.'],
  'functions/invalid-argument': ['invalid', 'The room request is invalid.'],
  'functions/internal': ['temporary', 'The room service is temporarily unavailable. Please try again.'],
  'functions/unavailable': ['temporary', 'The room service is temporarily unavailable. Please try again.'],
};

function toPublicError(error: unknown): SnapPairServerError {
  if (error instanceof SnapPairServerError) return error;
  if (error instanceof FirebaseError) {
    const [category, message] = CALLABLE_ERRORS[error.code] ?? ['temporary', 'The room request could not be completed. Please try again.'];
    return new SnapPairServerError(category, message);
  }
  return new SnapPairServerError('network', 'Could not reach the room service. Please try again.');
}

export function createSnapPairServer(
  functions: Functions,
  callableFactory: CallableFactory = httpsCallable,
): SnapPairServer {
  const create = callableFactory(functions, 'createSnapRoom');
  const join = callableFactory(functions, 'joinSnapRoom');

  return {
    async createRoom(input) {
      try {
        return parseCreateRoomResponse((await create(input)).data);
      } catch (error) {
        if (error instanceof Error && error.message === 'Invalid response from createSnapRoom.') throw new SnapPairServerError('schema', 'The room service returned an invalid response.');
        throw toPublicError(error);
      }
    },
    async joinRoom(input) {
      try {
        return parseJoinRoomResponse((await join(input)).data);
      } catch (error) {
        if (error instanceof Error && error.message === 'Invalid response from joinSnapRoom.') throw new SnapPairServerError('schema', 'The room service returned an invalid response.');
        throw toPublicError(error);
      }
    },
  };
}
