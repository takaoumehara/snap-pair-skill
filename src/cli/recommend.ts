import type { PairingMethod, TransportKind } from '../core/types';
import { createTranslator, type Locale } from '../i18n';
import { getPreset, pairingFor, PRESETS, presetName, supportedTransports, type PresetDescriptor, type PresetId } from '../presets';

/**
 * Rule-based recommender for the CLI's "describe your idea" path. It scores
 * the free text against each preset's en/ja keywords and a few transport
 * hints (latency, offline, scale, existing stack). Deterministic, offline, and
 * free: no LLM or paid API.
 */

/** Transport hints: English words match on word boundaries; Japanese ones as substrings. */
export const TRANSPORT_HINTS: Record<TransportKind, { en: readonly string[]; ja: readonly string[] }> = {
  webrtc: {
    en: ['low latency', 'latency', 'p2p', 'peer-to-peer', 'peer to peer', 'webrtc', 'lag', 'fast', 'same wifi', 'same wi-fi', 'lan', 'competitive'],
    ja: ['低遅延', '遅延', 'P2P', 'ピアツーピア', '高速', 'ラグ', '同じWi-Fi', '同じWiFi', 'LAN'],
  },
  broadcast: {
    en: ['offline', 'no internet', 'same device', 'same machine', 'same computer', 'one computer', 'no server', 'no backend', 'local only', 'tabs', 'windows'],
    ja: ['オフライン', '同じ端末', '同じパソコン', '同じPC', '1台', 'サーバーなし', 'サーバー不要', 'バックエンドなし', 'ネットなし', 'タブ'],
  },
  partykit: {
    en: ['partykit', 'cloudflare', 'many people', 'hundreds', 'audience', 'event', 'conference', 'scale', 'internet', 'remote', 'websocket'],
    ja: ['PartyKit', 'Cloudflare', '大人数', '数百', '会場', 'イベント', '観客', 'リモート', '遠隔', 'ネット越し'],
  },
  firebase: {
    en: ['firebase', 'persist', 'persistence', 'save', 'login', 'auth', 'authentication', 'database', 'history'],
    ja: ['Firebase', 'ファイアベース', '保存', 'ログイン', '認証', 'データベース', '履歴'],
  },
};

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Returns the keywords from `keywords` that occur in `text`. */
export function matchKeywords(text: string, keywords: { en: readonly string[]; ja: readonly string[] }): string[] {
  const lower = text.toLowerCase();
  const found: string[] = [];
  for (const keyword of keywords.en) {
    // Plain plurals match too ("gamepads", "quizzes" -> "quiz" + "zes" is not handled; list those explicitly).
    const pattern = new RegExp(`(^|[^a-z0-9])${escapeRegExp(keyword.toLowerCase())}(e?s)?($|[^a-z0-9])`);
    if (pattern.test(lower)) found.push(keyword);
  }
  for (const keyword of keywords.ja) {
    if (lower.includes(keyword.toLowerCase())) found.push(keyword);
  }
  return found;
}

/** Largest "N people/players/users/人/名" count in the text, if any. */
export function extractHeadcount(text: string): number | undefined {
  const pattern = /(\d{1,4})\s*(?:\+\s*)?(?:people|persons|players|users|participants|guests|devices|phones|人|名|台)/gi;
  let max: number | undefined;
  for (const match of text.matchAll(pattern)) {
    const n = Number(match[1]);
    if (Number.isFinite(n)) max = Math.max(max ?? 0, n);
  }
  return max;
}

export interface Recommendation {
  preset: PresetId;
  transport: TransportKind;
  pairing: PairingMethod;
  /** Presets with a non-zero score, best first. */
  ranking: Array<{ preset: PresetId; score: number; matched: string[] }>;
  transportHints: Array<{ transport: TransportKind; matched: string[] }>;
  /** Localized, human-readable reasons. */
  reasons: string[];
  /** True when no preset keyword matched and the default was used. */
  fallback: boolean;
}

/**
 * Generic words count less than modality words, so "a tilt racing game"
 * lands on Motion / Sensor rather than Virtual Controller.
 */
export const WEAK_KEYWORDS: ReadonlySet<string> = new Set(['game', 'games', 'play', 'tap', 'remote', 'ゲーム', '遊', '操作', 'タップ', '入力']);
const WEAK_WEIGHT = 0.4;

const keywordScore = (matched: string[]) =>
  Math.round(matched.reduce((sum, keyword) => sum + (WEAK_KEYWORDS.has(keyword) ? WEAK_WEIGHT : 1), 0) * 10) / 10;

export const FALLBACK_PRESET: PresetId = 'room-quiz-poll';
const WEBRTC_STAR_LIMIT = 16;

export function recommend(text: string, locale: Locale = 'en'): Recommendation {
  const tr = createTranslator(locale);
  const transportName = (kind: TransportKind) => tr.t(`transports.${kind}.name`);
  const reasons: string[] = [];

  const ranking = PRESETS
    .map((preset, order) => ({ preset, order, matched: matchKeywords(text, preset.keywords) }))
    .filter((entry) => entry.matched.length > 0)
    .map(({ preset, order, matched }) => ({ preset: preset.id, order, score: keywordScore(matched), matched }))
    // Ties keep registry order.
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .map(({ preset, score, matched }) => ({ preset, score, matched }));

  const fallback = ranking.length === 0;
  const preset: PresetDescriptor = getPreset(fallback ? FALLBACK_PRESET : ranking[0].preset)!;
  if (!fallback) {
    reasons.push(tr.t('cli.reasonPreset', { preset: presetName(preset, locale), keywords: ranking[0].matched.map((k) => `"${k}"`).join(', ') }));
  }

  const transportHints = (Object.keys(TRANSPORT_HINTS) as TransportKind[])
    .map((transport) => ({ transport, matched: matchKeywords(text, TRANSPORT_HINTS[transport]) }))
    .filter((hint) => hint.matched.length > 0)
    .sort((a, b) => b.matched.length - a.matched.length);

  const supported = supportedTransports(preset);
  let transport: TransportKind = preset.transports.recommended;
  const usable = transportHints.find((hint) => supported.includes(hint.transport));
  if (usable) {
    transport = usable.transport;
    reasons.push(tr.t('cli.reasonTransport', { transport: transportName(transport), keywords: usable.matched.map((k) => `"${k}"`).join(', ') }));
  } else {
    reasons.push(tr.t('cli.reasonTransportDefault', { transport: transportName(transport), preset: presetName(preset, locale) }));
  }
  for (const hint of transportHints) {
    if (supported.includes(hint.transport)) continue;
    reasons.push(hint.transport === 'firebase'
      ? tr.t('cli.reasonFirebase', { transport: transportName(transport) })
      : tr.t('cli.reasonTransportUnsupported', { transport: transportName(hint.transport), preset: presetName(preset, locale), fallback: transportName(transport) }));
  }

  const headcount = extractHeadcount(text);
  if (headcount !== undefined && headcount > WEBRTC_STAR_LIMIT && transport === 'webrtc' && supported.includes('partykit')) {
    transport = 'partykit';
    reasons.push(tr.t('cli.reasonScale', { count: headcount, transport: transportName(transport) }));
  }

  return { preset: preset.id, transport, pairing: pairingFor(preset, transport)[0], ranking, transportHints, reasons, fallback };
}
