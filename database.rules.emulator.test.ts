import { readFileSync } from 'node:fs';
import {
  assertFails,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { get, ref, remove, set } from 'firebase/database';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { compareAndSetJson } from './functions/src/database-cas.js';

const projectId = 'demo-snap-pair-rules-test';
const roomId = 'room-a';

let testEnv: RulesTestEnvironment;

describe.skipIf(!process.env.FIREBASE_DATABASE_EMULATOR_HOST)(
  'Realtime Database security rules (Emulator)',
  () => {
    beforeAll(async () => {
      const emulator = new URL(`http://${process.env.FIREBASE_DATABASE_EMULATOR_HOST}`);
      testEnv = await initializeTestEnvironment({
        projectId,
        database: {
          host: emulator.hostname,
          port: Number(emulator.port),
          rules: readFileSync(new URL('./database.rules.json', import.meta.url), 'utf8'),
        },
      });
    });

    beforeEach(async () => {
      await testEnv.clearDatabase();
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const db = context.database();
        await set(ref(db), {
          roomMembers: { [roomId]: { host: true, participant: true } },
          rooms: { [roomId]: { meta: { hostId: 'host', status: 'waiting' } } },
        });
      });
    });

    afterAll(async () => {
      if (testEnv) await testEnv.cleanup();
    });

    it('denies a participant phase/status mutation', async () => {
      const participantDb = testEnv.authenticatedContext('participant').database();
      await assertFails(set(ref(participantDb, `rooms/${roomId}/meta/status`), 'playing'));
    });

    it('never revives a room deleted after the ETag read and before the first conditional write', async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await set(ref(context.database(), 'rooms/deletion-race'), { meta: { status: 'waiting' } });
      });
      let deleted = false;
      const request = async (input: string | URL | Request, init?: RequestInit) => {
        if (!deleted && init?.method === 'PUT') {
          deleted = true;
          await testEnv.withSecurityRulesDisabled(async (context) => {
            await remove(ref(context.database(), 'rooms/deletion-race'));
          });
        }
        return fetch(input, init);
      };
      const emulatorHost = process.env.FIREBASE_DATABASE_EMULATOR_HOST;
      const result = await compareAndSetJson(
        `http://${emulatorHost}/rooms/deletion-race.json?ns=${projectId}`,
        (current) => current === null ? undefined : { ...(current as object), changed: true },
        { request, accessToken: async () => 'owner' },
      );
      expect(result).toEqual({ committed: false, value: null });
      await testEnv.withSecurityRulesDisabled(async (context) => {
        expect((await get(ref(context.database(), 'rooms/deletion-race'))).exists()).toBe(false);
      });
    });
  },
);
