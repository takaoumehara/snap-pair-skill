import { describe, expect, it } from 'vitest';
import { buildStaleRoomDeletionUpdates } from './cleanup.js';

describe('buildStaleRoomDeletionUpdates', () => {
  it('does not create an update for an empty cleanup batch', () => {
    expect(buildStaleRoomDeletionUpdates([])).toEqual({});
  });
  it('deletes room data and membership in one root update', () => {
    expect(buildStaleRoomDeletionUpdates(['room-a', 'room-b'])).toEqual({
      'rooms/room-a': null,
      'roomMembers/room-a': null,
      'rooms/room-b': null,
      'roomMembers/room-b': null,
    });
  });
});
