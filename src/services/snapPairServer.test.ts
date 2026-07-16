import { describe, expect, it, vi } from 'vitest';
import type { Functions } from 'firebase/functions';
import { FirebaseError } from 'firebase/app';
import {
  createSnapPairServer,
  SnapPairServerError,
  parseCreateRoomResponse,
  parseJoinRoomResponse,
} from './snapPairServer';

describe('snapPairServer response parsing', () => {
  it('accepts a valid create room response', () => {
    expect(parseCreateRoomResponse({ roomId: 'room-1', code: 'ABC234', expiresAt: 123 })).toEqual({
      roomId: 'room-1',
      code: 'ABC234',
      expiresAt: 123,
    });
  });

  it.each([
    null,
    {},
    { roomId: '', code: 'ABC234', expiresAt: 123 },
    { roomId: '   ', code: 'ABC234', expiresAt: 123 },
    { roomId: ' room-1', code: 'ABC234', expiresAt: 123 },
    { roomId: 'room-1 ', code: 'ABC234', expiresAt: 123 },
    { roomId: 'room/1', code: 'ABC234', expiresAt: 123 },
    { roomId: 'room.1', code: 'ABC234', expiresAt: 123 },
    { roomId: 'room#1', code: 'ABC234', expiresAt: 123 },
    { roomId: 'room$1', code: 'ABC234', expiresAt: 123 },
    { roomId: 'room[1]', code: 'ABC234', expiresAt: 123 },
    { roomId: 'room\u0000-1', code: 'ABC234', expiresAt: 123 },
    { roomId: 'room\u001f-1', code: 'ABC234', expiresAt: 123 },
    { roomId: 'room\u007f-1', code: 'ABC234', expiresAt: 123 },
    { roomId: 'room-1', code: 'abc234', expiresAt: 123 },
    { roomId: 'room-1', code: 'ABC234', expiresAt: '123' },
    { roomId: 'room-1', code: 'ABC234', expiresAt: 0 },
    { roomId: 'room-1', code: 'ABC234', expiresAt: 1.5 },
    { roomId: 'room-1', code: 'ABC234', expiresAt: Number.MAX_SAFE_INTEGER + 1 },
  ])('rejects malformed create room response: %j', (value) => {
    expect(() => parseCreateRoomResponse(value)).toThrow('Invalid response from createSnapRoom');
  });

  it('accepts a valid join room response', () => {
    expect(parseJoinRoomResponse({ roomId: 'room-1', playerId: 'user-1' })).toEqual({
      roomId: 'room-1',
      playerId: 'user-1',
    });
  });

  it.each([
    null,
    {},
    { roomId: '', playerId: 'user-1' },
    { roomId: '   ', playerId: 'user-1' },
    { roomId: ' room-1', playerId: 'user-1' },
    { roomId: 'room-1 ', playerId: 'user-1' },
    { roomId: 'room/1', playerId: 'user-1' },
    { roomId: 'room.1', playerId: 'user-1' },
    { roomId: 'room#1', playerId: 'user-1' },
    { roomId: 'room$1', playerId: 'user-1' },
    { roomId: 'room[1]', playerId: 'user-1' },
    { roomId: 'room\u0000-1', playerId: 'user-1' },
    { roomId: 'room\u001f-1', playerId: 'user-1' },
    { roomId: 'room\u007f-1', playerId: 'user-1' },
    { roomId: 'room-1', playerId: '' },
    { roomId: 'room-1', playerId: '   ' },
    { roomId: 'room-1', playerId: ' user-1' },
    { roomId: 'room-1', playerId: 'user-1 ' },
    { roomId: 'room-1', playerId: 'user/1' },
    { roomId: 'room-1', playerId: 'user.1' },
    { roomId: 'room-1', playerId: 'user#1' },
    { roomId: 'room-1', playerId: 'user$1' },
    { roomId: 'room-1', playerId: 'user[1]' },
    { roomId: 'room-1', playerId: 'user\u0000-1' },
    { roomId: 'room-1', playerId: 'user\u001f-1' },
    { roomId: 'room-1', playerId: 'user\u007f-1' },
  ])(
    'rejects malformed join room response: %j',
    (value) => {
      expect(() => parseJoinRoomResponse(value)).toThrow('Invalid response from joinSnapRoom');
    },
  );
});

describe('snapPairServer callable errors', () => {
  it.each([
    ['functions/deadline-exceeded', 'expired'],
    ['functions/not-found', 'not-found'],
    ['functions/invalid-argument', 'invalid'],
    ['functions/resource-exhausted', 'capacity'],
    ['functions/unavailable', 'temporary'],
  ])('preserves the typed category for %s', async (code, category) => {
    const call = vi.fn().mockRejectedValue(new FirebaseError(code, 'secret detail'));
    const server = createSnapPairServer({} as Functions, () => call);
    const error = await server.joinRoom({code:'ABC234',name:'Guest'}).catch((caught) => caught);
    expect(error).toBeInstanceOf(SnapPairServerError);
    expect(error.category).toBe(category);
    expect(error.message).not.toContain('secret detail');
  });

  it('classifies malformed callable responses as safe schema errors', async () => {
    const server = createSnapPairServer({} as Functions, () => vi.fn().mockResolvedValue({data:{secret:'raw'}}));
    const error = await server.joinRoom({code:'ABC234',name:'Guest'}).catch((caught) => caught);
    expect(error).toBeInstanceOf(SnapPairServerError);
    expect(error.category).toBe('schema');
    expect(error.message).not.toContain('raw');
  });
  it.each([
    ['functions/unauthenticated', 'Sign in before creating or joining a room.'],
    ['functions/not-found', 'The pairing code or room was not found.'],
    ['functions/deadline-exceeded', 'The pairing code has expired.'],
    ['functions/resource-exhausted', 'The room is full or no pairing code is currently available.'],
    ['functions/failed-precondition', 'The room is no longer available.'],
    ['functions/invalid-argument', 'The room request is invalid.'],
    ['functions/internal', 'The room service is temporarily unavailable. Please try again.'],
  ])('maps %s to a stable user-facing error', async (code, message) => {
    const call = vi.fn().mockRejectedValue(new FirebaseError(code, 'server implementation detail'));
    const server = createSnapPairServer({} as Functions, () => call);

    await expect(server.joinRoom({ code: 'ABC234', name: 'Guest' })).rejects.toThrow(message);
  });

  it('does not expose unknown thrown values', async () => {
    const call = vi.fn().mockRejectedValue({ secret: 'implementation detail' });
    const server = createSnapPairServer({} as Functions, () => call);

    await expect(server.createRoom({ name: 'Host', maxPlayers: 2, ttlMs: 30_000, initialState: null }))
      .rejects.toThrow('Could not reach the room service. Please try again.');
  });
});
