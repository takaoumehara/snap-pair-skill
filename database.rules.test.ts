import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

type RuleNode = Record<string, unknown>;

const rules = JSON.parse(
  readFileSync(new URL('./database.rules.json', import.meta.url), 'utf8'),
) as { rules: RuleNode };

describe('Realtime Database security rules', () => {
  it('keeps pairing and membership authority on the server', () => {
    const pairingCode = (rules.rules.pairingCodes as RuleNode).$code as RuleNode;
    const membership = (((rules.rules.roomMembers as RuleNode).$roomId as RuleNode).$uid) as RuleNode;

    expect(pairingCode['.read']).toBe(false);
    expect(pairingCode['.write']).toBe(false);
    expect(membership['.write']).toBe(false);
    expect(membership['.read']).toBe(false);
    const creationLimit = (rules.rules.roomCreationLimits as RuleNode).$uid as RuleNode;
    expect(creationLimit['.read']).toBe(false);
    expect(creationLimit['.write']).toBe(false);
  });

  it('gates readable room slices by membership without exposing joinState through a parent grant', () => {
    const room = ((rules.rules.rooms as RuleNode).$roomId) as RuleNode;

    expect(room['.read']).not.toEqual(expect.stringContaining('auth'));
    expect((room.meta as RuleNode)['.read']).toContain("root.child('roomMembers')");
    expect((room.players as RuleNode)['.read']).toContain("root.child('roomMembers')");
    expect((room.state as RuleNode)['.read']).toContain("root.child('roomMembers')");
    expect(room['.write']).not.toBe(true);
    expect(room['.write']).not.toEqual(expect.stringContaining('auth'));
  });

  it('allows clients to write only scoped mutable room fields', () => {
    const room = ((rules.rules.rooms as RuleNode).$roomId) as RuleNode;
    const meta = room.meta as RuleNode;
    const player = ((room.players as RuleNode).$uid) as RuleNode;

    expect((meta.status as RuleNode)['.write']).toContain("child('hostId').val() === auth.uid");
    expect((room.joinState as RuleNode)['.read']).toBe(false);
    expect((room.joinState as RuleNode)['.write']).toBe(false);
    expect(player['.write']).not.toEqual(expect.stringContaining('auth'));
    expect((player.id as RuleNode)['.write']).toBe(false);
    expect((player.role as RuleNode)['.write']).toBe(false);
    expect((player.joinedAt as RuleNode)['.write']).toBe(false);
    expect((player.name as RuleNode)['.write']).toContain('auth.uid === $uid');
    expect((player.connected as RuleNode)['.write']).toContain('auth.uid === $uid');
    expect((player.lastSeenAt as RuleNode)['.write']).toContain('auth.uid === $uid');
    expect((player.$other as RuleNode)['.validate']).toBe(false);
  });

  it('indexes both cleanup queries', () => {
    expect((rules.rules.pairingCodes as RuleNode)['.indexOn']).toContain('expiresAt');
    expect((rules.rules.rooms as RuleNode)['.indexOn']).toContain('meta/updatedAt');
  });

  it('bounds client timestamps to one minute around RTDB now', () => {
    const room = ((rules.rules.rooms as RuleNode).$roomId) as RuleNode;
    const meta = room.meta as RuleNode;
    const player = ((room.players as RuleNode).$uid) as RuleNode;
    for (const validation of [
      (meta.updatedAt as RuleNode)['.validate'],
      (player.lastSeenAt as RuleNode)['.validate'],
    ]) {
      expect(validation).toContain('newData.isNumber()');
      expect(validation).toContain('now - 60000');
      expect(validation).toContain('now + 60000');
    }
  });
});
