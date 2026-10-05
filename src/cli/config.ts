import type { PairingMethod, TransportKind } from '../core/types';
import { SUPPORTED_LOCALES, type Locale } from '../i18n';
import { getPreset, isPresetId, pairingFor, PRESET_IDS, supportedTransports, TRANSPORT_PAIRING, type PresetId } from '../presets';

/**
 * `snap-pair.config.json`: what `snap-pair init` decided, read by the
 * generated app (`src/snap.ts` in every template) and by AI agents.
 *
 * ```json
 * {
 *   "$schema": "./node_modules/snap-pair-core/dist/config.schema.json",
 *   "version": 1,
 *   "preset": "room-quiz-poll",
 *   "transport": "partykit",
 *   "pairing": "pin",
 *   "locale": "en",
 *   "maxPlayers": 300,
 *   "partykit": { "host": "snap-pair-relay.<user>.partykit.dev", "party": "main" }
 * }
 * ```
 *
 * | Field | Type | Notes |
 * | --- | --- | --- |
 * | `version` | `1` | Required. |
 * | `preset` | preset id or `null` | `null` = no template (e.g. a Firebase shared-state app). |
 * | `transport` | `firebase` \| `partykit` \| `webrtc` \| `broadcast` | Required. Must be supported by the preset. |
 * | `pairing` | `qr` \| `code` \| `pin` \| `broadcast` | Required. Must be offered by the transport (`pin`: relay transports only; `broadcast`: BroadcastChannel only). |
 * | `locale` | `en` \| `ja` | UI language for HostHUD / ControllerWrapper. Default `en`. |
 * | `maxPlayers` | integer 2–300 | Room capacity including the host. |
 * | `namespace` | string | Room-key namespace for relay transports (`RelayTransportOptions.namespace`). |
 * | `partykit` | `{ host?, party? }` | PartyKit host (also used for WebRTC signaling). Empty host = read `VITE_PARTYKIT_HOST`. |
 * | `webrtc` | `{ signaling, iceServers? }` | `signaling`: `partykit` or `broadcast` (same-machine tests). |
 * | `firebase` | `{ databasePath? }` | Firebase web config stays in env vars (`VITE_FIREBASE_*`), never in this file. |
 */

export const CONFIG_FILE_NAME = 'snap-pair.config.json';
export const CONFIG_VERSION = 1;

export const TRANSPORT_KINDS: readonly TransportKind[] = ['firebase', 'partykit', 'webrtc', 'broadcast'];
export const PAIRING_METHODS: readonly PairingMethod[] = ['qr', 'code', 'pin', 'broadcast'];

export interface SnapPairConfig {
  $schema?: string;
  version: typeof CONFIG_VERSION;
  preset: PresetId | null;
  transport: TransportKind;
  pairing: PairingMethod;
  locale?: Locale;
  maxPlayers?: number;
  namespace?: string;
  partykit?: { host?: string; party?: string };
  webrtc?: { signaling: 'partykit' | 'broadcast'; iceServers?: Array<{ urls: string | string[]; username?: string; credential?: string }> };
  firebase?: { databasePath?: string };
}

/** JSON Schema (draft-07) for `snap-pair.config.json`. Cross-field rules (preset/transport/pairing fit) live in `validateConfig`. */
export const CONFIG_JSON_SCHEMA = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  $id: 'https://github.com/takaoumehara/snap-pair-skill/snap-pair.config.schema.json',
  title: 'snap-pair config',
  description: 'Choices made by `snap-pair init`: UX preset, transport, and pairing method.',
  type: 'object',
  additionalProperties: false,
  required: ['version', 'preset', 'transport', 'pairing'],
  properties: {
    $schema: { type: 'string' },
    version: { const: CONFIG_VERSION },
    preset: { description: 'UX preset id, or null for no template.', enum: [...PRESET_IDS, null] },
    transport: { enum: [...TRANSPORT_KINDS] },
    pairing: { enum: [...PAIRING_METHODS] },
    locale: { enum: [...SUPPORTED_LOCALES] },
    maxPlayers: { type: 'integer', minimum: 2, maximum: 300 },
    namespace: { type: 'string', minLength: 1, maxLength: 64, pattern: '^[A-Za-z0-9._-]+$' },
    partykit: {
      type: 'object',
      additionalProperties: false,
      properties: {
        host: { type: 'string', description: 'e.g. my-relay.me.partykit.dev; empty = VITE_PARTYKIT_HOST' },
        party: { type: 'string', minLength: 1 },
      },
    },
    webrtc: {
      type: 'object',
      additionalProperties: false,
      required: ['signaling'],
      properties: {
        signaling: { enum: ['partykit', 'broadcast'] },
        iceServers: {
          type: 'array',
          items: {
            type: 'object',
            required: ['urls'],
            properties: {
              urls: { oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }] },
              username: { type: 'string' },
              credential: { type: 'string' },
            },
          },
        },
      },
    },
    firebase: {
      type: 'object',
      additionalProperties: false,
      properties: { databasePath: { type: 'string', minLength: 1 } },
    },
  },
} as const;

export type ConfigValidation =
  | { ok: true; config: SnapPairConfig; errors: [] }
  | { ok: false; config?: undefined; errors: string[] };

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const KNOWN_KEYS = new Set(Object.keys(CONFIG_JSON_SCHEMA.properties));

/**
 * Validates a parsed config (shape per `CONFIG_JSON_SCHEMA` plus the
 * cross-field rules). Error messages are English and name the offending field.
 */
export function validateConfig(value: unknown): ConfigValidation {
  const errors: string[] = [];
  if (!isObject(value)) return { ok: false, errors: ['config must be a JSON object'] };

  for (const key of Object.keys(value)) {
    if (!KNOWN_KEYS.has(key)) errors.push(`unknown field "${key}"`);
  }
  if (value.$schema !== undefined && typeof value.$schema !== 'string') errors.push('"$schema" must be a string');
  if (value.version !== CONFIG_VERSION) errors.push(`"version" must be ${CONFIG_VERSION}`);

  const { preset, transport, pairing } = value;
  if (!('preset' in value)) errors.push('"preset" is required (use null for no template)');
  else if (preset !== null && !isPresetId(preset)) errors.push(`"preset" must be one of ${PRESET_IDS.join(', ')} or null`);
  if (!TRANSPORT_KINDS.includes(transport as TransportKind)) errors.push(`"transport" must be one of ${TRANSPORT_KINDS.join(', ')}`);
  if (!PAIRING_METHODS.includes(pairing as PairingMethod)) errors.push(`"pairing" must be one of ${PAIRING_METHODS.join(', ')}`);

  if (value.locale !== undefined && !(SUPPORTED_LOCALES as readonly unknown[]).includes(value.locale)) {
    errors.push(`"locale" must be one of ${SUPPORTED_LOCALES.join(', ')}`);
  }
  if (value.maxPlayers !== undefined) {
    const n = value.maxPlayers;
    if (typeof n !== 'number' || !Number.isInteger(n) || n < 2 || n > 300) errors.push('"maxPlayers" must be an integer from 2 to 300');
  }
  if (value.namespace !== undefined) {
    const ns = value.namespace;
    if (typeof ns !== 'string' || !/^[A-Za-z0-9._-]{1,64}$/.test(ns)) errors.push('"namespace" must be 1-64 characters of A-Z a-z 0-9 . _ -');
  }

  if (value.partykit !== undefined) {
    if (!isObject(value.partykit)) errors.push('"partykit" must be an object');
    else {
      for (const key of Object.keys(value.partykit)) if (key !== 'host' && key !== 'party') errors.push(`unknown field "partykit.${key}"`);
      if (value.partykit.host !== undefined && typeof value.partykit.host !== 'string') errors.push('"partykit.host" must be a string');
      if (value.partykit.party !== undefined && (typeof value.partykit.party !== 'string' || !value.partykit.party)) errors.push('"partykit.party" must be a non-empty string');
    }
  }
  if (value.webrtc !== undefined) {
    if (!isObject(value.webrtc)) errors.push('"webrtc" must be an object');
    else {
      for (const key of Object.keys(value.webrtc)) if (key !== 'signaling' && key !== 'iceServers') errors.push(`unknown field "webrtc.${key}"`);
      if (value.webrtc.signaling !== 'partykit' && value.webrtc.signaling !== 'broadcast') errors.push('"webrtc.signaling" must be "partykit" or "broadcast"');
      const ice = value.webrtc.iceServers;
      if (ice !== undefined) {
        const validUrls = (urls: unknown) => typeof urls === 'string' || (Array.isArray(urls) && urls.every((u) => typeof u === 'string'));
        if (!Array.isArray(ice) || !ice.every((server) => isObject(server) && validUrls(server.urls))) {
          errors.push('"webrtc.iceServers" must be an array of { urls: string | string[] }');
        }
      }
    }
  }
  if (value.firebase !== undefined) {
    if (!isObject(value.firebase)) errors.push('"firebase" must be an object');
    else {
      for (const key of Object.keys(value.firebase)) if (key !== 'databasePath') errors.push(`unknown field "firebase.${key}"`);
      if (value.firebase.databasePath !== undefined && (typeof value.firebase.databasePath !== 'string' || !value.firebase.databasePath)) {
        errors.push('"firebase.databasePath" must be a non-empty string');
      }
    }
  }

  // Cross-field rules, only once the individual fields are valid.
  if (errors.length === 0) {
    const kind = transport as TransportKind;
    const method = pairing as PairingMethod;
    if (!TRANSPORT_PAIRING[kind].includes(method)) {
      errors.push(`pairing "${method}" is not available on the ${kind} transport (use ${TRANSPORT_PAIRING[kind].join(', ')})`);
    }
    if (preset !== null) {
      const descriptor = getPreset(preset as string)!;
      const transports = supportedTransports(descriptor);
      if (!transports.includes(kind)) {
        errors.push(`preset "${descriptor.id}" does not support the ${kind} transport (use ${transports.join(', ')})`);
      } else if (!pairingFor(descriptor, kind).includes(method)) {
        errors.push(`preset "${descriptor.id}" does not use ${method} pairing on ${kind} (use ${pairingFor(descriptor, kind).join(', ')})`);
      }
    }
    if (kind === 'webrtc' && !isObject(value.webrtc)) errors.push('"webrtc.signaling" is required when transport is "webrtc"');
  }

  return errors.length === 0 ? { ok: true, config: value as unknown as SnapPairConfig, errors: [] } : { ok: false, errors };
}

export interface BuildConfigInput {
  preset: PresetId | null;
  transport: TransportKind;
  pairing?: PairingMethod;
  locale?: Locale;
  maxPlayers?: number;
  partykitHost?: string;
}

/** Builds a valid config with sensible defaults (pairing, capacity, transport sections). */
export function buildConfig({ preset, transport, pairing, locale = 'en', maxPlayers, partykitHost }: BuildConfigInput): SnapPairConfig {
  const descriptor = preset ? getPreset(preset) : undefined;
  const config: SnapPairConfig = {
    $schema: './node_modules/snap-pair-core/dist/config.schema.json',
    version: CONFIG_VERSION,
    preset,
    transport,
    pairing: pairing ?? (descriptor ? pairingFor(descriptor, transport)[0] : TRANSPORT_PAIRING[transport][0]),
    locale,
    maxPlayers: maxPlayers ?? Math.min(descriptor?.players.max ?? 8, transport === 'webrtc' ? 16 : 300),
  };
  if (transport === 'partykit' || transport === 'webrtc') config.partykit = { host: partykitHost ?? '', party: 'main' };
  if (transport === 'webrtc') config.webrtc = { signaling: 'partykit' };
  if (transport === 'firebase') config.firebase = { databasePath: 'rooms' };
  return config;
}
