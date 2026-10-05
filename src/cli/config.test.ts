import { describe, expect, it } from 'vitest';
import { PRESETS, supportedTransports } from '../presets';
import { buildConfig, CONFIG_JSON_SCHEMA, validateConfig } from './config';

const base = { version: 1, preset: 'room-quiz-poll', transport: 'partykit', pairing: 'pin' };

describe('validateConfig', () => {
  it('accepts a minimal config and a full one', () => {
    expect(validateConfig(base)).toMatchObject({ ok: true, errors: [] });
    const full = {
      ...base,
      $schema: './node_modules/snap-pair-core/dist/config.schema.json',
      locale: 'ja',
      maxPlayers: 300,
      namespace: 'my-app.v1',
      partykit: { host: 'relay.example.partykit.dev', party: 'main' },
    };
    expect(validateConfig(full).ok).toBe(true);
  });

  it('accepts preset null (config-only Firebase apps)', () => {
    expect(validateConfig({ version: 1, preset: null, transport: 'firebase', pairing: 'qr', firebase: { databasePath: 'rooms' } }).ok).toBe(true);
  });

  it('rejects non-objects and missing fields', () => {
    expect(validateConfig(null)).toEqual({ ok: false, errors: ['config must be a JSON object'] });
    expect(validateConfig([])).toMatchObject({ ok: false });
    const { errors } = validateConfig({});
    expect(errors).toEqual(expect.arrayContaining([
      '"version" must be 1',
      '"preset" is required (use null for no template)',
      expect.stringContaining('"transport" must be one of'),
      expect.stringContaining('"pairing" must be one of'),
    ]));
  });

  it('rejects unknown fields and bad values', () => {
    const { errors } = validateConfig({
      ...base,
      extra: 1,
      locale: 'fr',
      maxPlayers: 301,
      namespace: 'bad space',
      partykit: { host: 1, party: '', port: 1 },
    });
    expect(errors).toEqual(expect.arrayContaining([
      'unknown field "extra"',
      expect.stringContaining('"locale"'),
      '"maxPlayers" must be an integer from 2 to 300',
      expect.stringContaining('"namespace"'),
      'unknown field "partykit.port"',
      '"partykit.host" must be a string',
      '"partykit.party" must be a non-empty string',
    ]));
    expect(validateConfig({ ...base, maxPlayers: 2.5 }).ok).toBe(false);
    expect(validateConfig({ ...base, preset: 'nope' }).errors[0]).toMatch(/"preset" must be one of/);
  });

  it('validates the webrtc and firebase sections', () => {
    const webrtc = { version: 1, preset: 'virtual-controller', transport: 'webrtc', pairing: 'qr' };
    expect(validateConfig(webrtc).errors).toEqual(['"webrtc.signaling" is required when transport is "webrtc"']);
    expect(validateConfig({ ...webrtc, webrtc: { signaling: 'partykit', iceServers: [{ urls: ['stun:a', 'turn:b'], username: 'u' }] } }).ok).toBe(true);
    expect(validateConfig({ ...webrtc, webrtc: { signaling: 'firebase' } }).errors[0]).toMatch(/signaling/);
    expect(validateConfig({ ...webrtc, webrtc: { signaling: 'partykit', iceServers: [{}] } }).errors[0]).toMatch(/iceServers/);
    expect(validateConfig({ ...base, preset: null, transport: 'firebase', pairing: 'qr', firebase: { databasePath: '', x: 1 } }).errors)
      .toEqual(['unknown field "firebase.x"', '"firebase.databasePath" must be a non-empty string']);
  });

  it('enforces preset/transport/pairing compatibility', () => {
    expect(validateConfig({ ...base, transport: 'firebase', pairing: 'qr' }).errors[0])
      .toBe('preset "room-quiz-poll" does not support the firebase transport (use partykit, broadcast, webrtc)');
    expect(validateConfig({ ...base, transport: 'firebase', preset: null, pairing: 'pin' }).errors[0])
      .toMatch(/pairing "pin" is not available on the firebase transport/);
    expect(validateConfig({ ...base, preset: 'local-multi-display', transport: 'broadcast', pairing: 'pin' }).errors[0])
      .toMatch(/does not use pin pairing on broadcast/);
  });

  it('JSON schema enumerates the same values the validator accepts', () => {
    expect(CONFIG_JSON_SCHEMA.properties.preset.enum).toEqual([...PRESETS.map((p) => p.id), null]);
    expect(CONFIG_JSON_SCHEMA.required).toEqual(['version', 'preset', 'transport', 'pairing']);
    expect(JSON.parse(JSON.stringify(CONFIG_JSON_SCHEMA)).additionalProperties).toBe(false);
  });
});

describe('buildConfig', () => {
  it('builds a valid config for every preset and supported transport', () => {
    for (const preset of PRESETS) {
      for (const transport of supportedTransports(preset)) {
        const config = buildConfig({ preset: preset.id, transport });
        expect(validateConfig(config), `${preset.id}/${transport}`).toMatchObject({ ok: true });
      }
    }
  });

  it('fills transport sections and defaults', () => {
    expect(buildConfig({ preset: 'virtual-controller', transport: 'webrtc' })).toMatchObject({
      pairing: 'qr', maxPlayers: 8, locale: 'en', partykit: { host: '', party: 'main' }, webrtc: { signaling: 'partykit' },
    });
    expect(buildConfig({ preset: 'room-quiz-poll', transport: 'partykit', partykitHost: 'x.partykit.dev', locale: 'ja' })).toMatchObject({
      pairing: 'pin', maxPlayers: 300, locale: 'ja', partykit: { host: 'x.partykit.dev' },
    });
    expect(buildConfig({ preset: 'room-quiz-poll', transport: 'webrtc' }).maxPlayers).toBe(16);
    expect(buildConfig({ preset: null, transport: 'firebase' })).toMatchObject({ pairing: 'qr', firebase: { databasePath: 'rooms' } });
  });
});
