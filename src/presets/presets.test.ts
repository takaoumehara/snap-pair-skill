import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  getPreset,
  isPresetId,
  pairingFor,
  PRESET_IDS,
  PRESETS,
  presetName,
  presetsForTransport,
  supportedTransports,
  TRANSPORT_PAIRING,
} from './index';

const templatesDir = resolve(dirname(fileURLToPath(import.meta.url)), '../templates');

describe('presets registry', () => {
  it('has the seven presets, in id order, with unique ids', () => {
    expect(PRESETS.map((p) => p.id)).toEqual([...PRESET_IDS]);
    expect(PRESET_IDS).toHaveLength(7);
    expect(new Set(PRESET_IDS).size).toBe(7);
  });

  it.each(PRESETS.map((p) => [p.id, p] as const))('%s is complete and consistent', (_id, preset) => {
    for (const text of [preset.name, preset.description, preset.useWhen]) {
      expect(text.en.length).toBeGreaterThan(3);
      expect(text.ja.length).toBeGreaterThan(1);
    }
    expect(preset.transports.supported).toContain(preset.transports.recommended);
    expect(supportedTransports(preset)[0] ?? preset.transports.recommended).toBeTruthy();
    expect(supportedTransports(preset)).toContain(preset.transports.recommended);
    expect(preset.pairing.length).toBeGreaterThan(0);
    expect(pairingFor(preset, preset.transports.recommended)[0]).toBe(preset.pairing[0]);
    expect(preset.players.min).toBeLessThanOrEqual(preset.players.typical);
    expect(preset.players.typical).toBeLessThanOrEqual(preset.players.max);
    expect(preset.players.max).toBeLessThanOrEqual(300);
    expect(preset.messages.length).toBeGreaterThan(0);
    expect(preset.rateLimit.maxPerSecond).toBeGreaterThan(0);
    // WebRTC frames above ~16 KiB need chunking; keep preset payloads far below.
    expect(preset.rateLimit.maxPayloadBytes).toBeLessThanOrEqual(16 * 1024);
    expect(preset.keywords.en.length).toBeGreaterThan(3);
    expect(preset.keywords.ja.length).toBeGreaterThan(3);
    expect(preset.keywords.en.every((k) => k === k.toLowerCase())).toBe(true);
  });

  it.each(PRESETS.map((p) => [p.id, p] as const))('%s ships a template', (_id, preset) => {
    const dir = join(templatesDir, preset.template.dir);
    expect(existsSync(join(dir, 'README.md'))).toBe(true);
    if (preset.template.kind === 'vite-react') {
      expect(existsSync(join(dir, 'src/Host.tsx'))).toBe(true);
      expect(existsSync(join(dir, 'src/Controller.tsx'))).toBe(true);
    } else {
      expect(existsSync(join(dir, 'index.html'))).toBe(true);
    }
  });

  it('never offers Firebase for presets that need messaging', () => {
    for (const preset of PRESETS) {
      if (preset.needsMessaging) expect(supportedTransports(preset)).not.toContain('firebase');
    }
    expect(presetsForTransport('firebase')).toEqual([]);
  });

  it('local-multi-display is BroadcastChannel-only with broadcast pairing', () => {
    const preset = getPreset('local-multi-display')!;
    expect(supportedTransports(preset)).toEqual(['broadcast']);
    expect(pairingFor(preset, 'broadcast')).toEqual(['broadcast']);
    expect(preset.template.kind).toBe('html');
  });

  it('filters pairing methods by transport', () => {
    const quiz = getPreset('room-quiz-poll')!;
    expect(pairingFor(quiz, 'partykit')).toEqual(['pin', 'qr', 'code']);
    expect(pairingFor(quiz, 'broadcast')).toEqual(['pin', 'code']);
    expect(TRANSPORT_PAIRING.firebase).not.toContain('pin');
  });

  it('lists presets for a transport, recommended first', () => {
    const webrtc = presetsForTransport('webrtc').map((p) => p.id);
    expect(webrtc.slice(0, 3)).toEqual(['stroke-stream', 'virtual-controller', 'motion-sensor']);
    expect(webrtc).not.toContain('local-multi-display');
    expect(presetsForTransport('broadcast')[0].id).toBe('local-multi-display');
    expect(presetsForTransport('broadcast')).toHaveLength(7);
  });

  it('looks presets up and names them per locale', () => {
    expect(isPresetId('type-throw')).toBe(true);
    expect(isPresetId('nope')).toBe(false);
    expect(getPreset('nope')).toBeUndefined();
    const preset = getPreset('room-quiz-poll')!;
    expect(presetName(preset, 'ja')).toBe('ルームクイズ/投票');
    expect(presetName(preset, 'en')).toBe('Room Quiz / Poll');
  });
});
