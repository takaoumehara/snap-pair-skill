import type { PairingMethod, TransportKind } from '../core/types';

/**
 * The seven UX presets: what each experience sends, which transports and
 * pairing methods fit it, and how hard to throttle. The CLI, the templates in
 * `src/templates/<id>/`, and SKILL.md's decision table all read from here.
 * Pure data: no browser or Node APIs.
 */

export const PRESET_IDS = [
  'stroke-stream',
  'particle-blast',
  'type-throw',
  'room-quiz-poll',
  'virtual-controller',
  'motion-sensor',
  'local-multi-display',
] as const;

export type PresetId = (typeof PRESET_IDS)[number];

export interface LocalizedText {
  en: string;
  ja: string;
}

export interface PresetMessageShape {
  /** `TransportMessage.type`. */
  type: string;
  /** Who sends it. */
  from: 'controller' | 'host' | 'any';
  /** TypeScript-like payload shape, for docs and AI agents. */
  payload: string;
  description: string;
}

export interface PresetRateLimit {
  /** Maximum messages per second per sender that the template emits. */
  maxPerSecond: number;
  /** How the template stays under it. */
  strategy: 'throttle' | 'batch' | 'debounce' | 'on-change' | 'once';
  /** Largest expected payload in bytes, so transports can be sized (WebRTC chunks above ~16 KiB). */
  maxPayloadBytes: number;
  notes: string;
}

export interface PresetDescriptor {
  id: PresetId;
  name: LocalizedText;
  description: LocalizedText;
  /** One-line "pick this when…" used by the CLI and SKILL.md. */
  useWhen: LocalizedText;
  /** First entry is the default. */
  transports: {
    recommended: TransportKind;
    supported: readonly TransportKind[];
  };
  /** First entry is the default. */
  pairing: readonly PairingMethod[];
  /** Typical room size (including the host). */
  players: { min: number; typical: number; max: number };
  /** True when the preset needs `send`/`broadcast` (so Firebase, which has no messaging, does not fit). */
  needsMessaging: boolean;
  /** Shared room state the host owns, as a TypeScript-like shape (or `null`). */
  state: string | null;
  messages: readonly PresetMessageShape[];
  rateLimit: PresetRateLimit;
  /** Controller-side features `ControllerWrapper` should enable. */
  controller: {
    wakeLock: boolean;
    motionPermission: boolean;
    orientation?: 'portrait' | 'landscape';
  };
  /** `vite-react`: Host.tsx + Controller.tsx on the shared Vite scaffold. `html`: one self-contained file. */
  template: { kind: 'vite-react' | 'html'; dir: string };
  /** Keywords (en + ja) for the CLI's free-text recommender. */
  keywords: { en: readonly string[]; ja: readonly string[] };
}

/** Transports with ephemeral messaging. */
const MESSAGING: readonly TransportKind[] = ['partykit', 'webrtc', 'broadcast'];

export const PRESETS: readonly PresetDescriptor[] = [
  {
    id: 'stroke-stream',
    name: { en: 'Stroke Stream', ja: 'ストロークストリーム' },
    description: {
      en: 'Phones draw with a finger; strokes stream live onto a shared big screen.',
      ja: 'スマホで指で描いた線が、共有の大画面にリアルタイムで流れます。',
    },
    useWhen: {
      en: 'collaborative drawing, signatures, live sketch walls',
      ja: '共同お絵かき、サイン、ライブスケッチウォール',
    },
    transports: { recommended: 'webrtc', supported: ['webrtc', 'partykit', 'broadcast'] },
    pairing: ['qr', 'code', 'pin'],
    players: { min: 2, typical: 6, max: 16 },
    needsMessaging: true,
    state: '{ background: string } | null',
    messages: [
      {
        type: 'stroke',
        from: 'controller',
        payload: '{ id: string; color: string; width: number; points: [x: number, y: number][]; end?: boolean }',
        description: 'Points are normalized to 0..1. A stroke is sent in batches; `end` closes it.',
      },
      { type: 'clear', from: 'host', payload: '{}', description: 'Host clears the canvas.' },
    ],
    rateLimit: {
      maxPerSecond: 30,
      strategy: 'batch',
      maxPayloadBytes: 4096,
      notes: 'Batch pointer samples every 33 ms (max 64 points per message); never send per pointermove event.',
    },
    controller: { wakeLock: true, motionPermission: false, orientation: 'portrait' },
    template: { kind: 'vite-react', dir: 'stroke-stream' },
    keywords: {
      en: ['draw', 'drawing', 'paint', 'sketch', 'stroke', 'canvas', 'whiteboard', 'doodle', 'signature', 'pen'],
      ja: ['お絵かき', '絵', '描', 'ペン', 'ストローク', 'キャンバス', 'ホワイトボード', 'らくがき', '落書き', 'サイン'],
    },
  },
  {
    id: 'particle-blast',
    name: { en: 'Particle Blast', ja: 'パーティクルブラスト' },
    description: {
      en: 'Taps and swipes on phones fire particle bursts and fireworks on the big screen.',
      ja: 'スマホのタップやスワイプで、大画面にパーティクルや花火が弾けます。',
    },
    useWhen: {
      en: 'audience reactions, event openings, cheering, visual effects',
      ja: '観客のリアクション、イベントのオープニング、応援、演出',
    },
    transports: { recommended: 'partykit', supported: ['partykit', 'webrtc', 'broadcast'] },
    pairing: ['qr', 'pin', 'code'],
    players: { min: 2, typical: 30, max: 300 },
    needsMessaging: true,
    state: null,
    messages: [
      {
        type: 'blast',
        from: 'controller',
        payload: '{ x: number; y: number; power: number; hue: number }',
        description: 'x/y in 0..1 where the burst starts; power 0..1 from swipe speed; hue 0..360.',
      },
    ],
    rateLimit: {
      maxPerSecond: 10,
      strategy: 'throttle',
      maxPayloadBytes: 128,
      notes: 'Throttle to 10/s per phone; the host also caps live particles (e.g. 2000) so big rooms stay smooth.',
    },
    controller: { wakeLock: true, motionPermission: false, orientation: 'portrait' },
    template: { kind: 'vite-react', dir: 'particle-blast' },
    keywords: {
      en: ['particle', 'particles', 'firework', 'fireworks', 'confetti', 'explosion', 'burst', 'tap', 'cheer', 'reaction', 'effect'],
      ja: ['パーティクル', '花火', '紙吹雪', '爆発', 'タップ', '応援', 'リアクション', 'エフェクト', '演出'],
    },
  },
  {
    id: 'type-throw',
    name: { en: 'Type Throw', ja: 'タイプスロー' },
    description: {
      en: 'Type a short message on a phone and flick it onto the shared screen.',
      ja: 'スマホで短いメッセージを入力して、共有画面へフリックで投げ込みます。',
    },
    useWhen: {
      en: 'live comments, Q&A walls, guestbooks, word clouds',
      ja: 'ライブコメント、質問ウォール、寄せ書き、ワードクラウド',
    },
    transports: { recommended: 'partykit', supported: ['partykit', 'webrtc', 'broadcast'] },
    pairing: ['qr', 'pin', 'code'],
    players: { min: 2, typical: 30, max: 300 },
    needsMessaging: true,
    state: null,
    messages: [
      {
        type: 'throw',
        from: 'controller',
        payload: '{ text: string; vx: number; vy: number; color: string }',
        description: 'text is trimmed to 140 characters; vx/vy is the flick velocity in screens per second.',
      },
    ],
    rateLimit: {
      maxPerSecond: 2,
      strategy: 'throttle',
      maxPayloadBytes: 1024,
      notes: 'One throw per 500 ms per phone; the host keeps the newest 100 messages on screen. Moderate text before showing it publicly.',
    },
    controller: { wakeLock: true, motionPermission: false, orientation: 'portrait' },
    template: { kind: 'vite-react', dir: 'type-throw' },
    keywords: {
      en: ['text', 'type', 'typing', 'message', 'comment', 'comments', 'chat', 'throw', 'word', 'guestbook', 'q&a', 'question wall'],
      ja: ['文字', 'テキスト', 'メッセージ', 'コメント', 'チャット', '投げ', '寄せ書き', '入力', '質問'],
    },
  },
  {
    id: 'room-quiz-poll',
    name: { en: 'Room Quiz / Poll', ja: 'ルームクイズ/投票' },
    description: {
      en: 'The host shows a question; everyone in the room answers on their phone and the tally updates live.',
      ja: 'ホストが問題を出し、会場の全員がスマホで回答。集計がリアルタイムに更新されます。',
    },
    useWhen: {
      en: 'quizzes, polls, votes, surveys, classrooms, audience Q&A at scale',
      ja: 'クイズ、投票、アンケート、授業、大人数の会場参加',
    },
    transports: { recommended: 'partykit', supported: ['partykit', 'broadcast', 'webrtc'] },
    pairing: ['pin', 'qr', 'code'],
    players: { min: 2, typical: 40, max: 300 },
    needsMessaging: true,
    state: '{ questionId: string; question: string; choices: string[]; open: boolean; tally: number[] }',
    messages: [
      {
        type: 'vote',
        from: 'controller',
        payload: '{ questionId: string; choice: number }',
        description: 'One vote per question per peer; the host keeps the latest vote per peer id.',
      },
    ],
    rateLimit: {
      maxPerSecond: 1,
      strategy: 'once',
      maxPayloadBytes: 128,
      notes: 'Votes are rare; the host publishes the tally in state at most 4 times per second (throttled) so 300 voters do not flood the room.',
    },
    controller: { wakeLock: true, motionPermission: false, orientation: 'portrait' },
    template: { kind: 'vite-react', dir: 'room-quiz-poll' },
    keywords: {
      en: ['quiz', 'poll', 'polls', 'vote', 'voting', 'survey', 'question', 'questions', 'answer', 'audience', 'classroom', 'trivia', 'election'],
      ja: ['クイズ', '投票', 'アンケート', '問題', '回答', '答え', '会場', '授業', '教室', '選択'],
    },
  },
  {
    id: 'virtual-controller',
    name: { en: 'Virtual Controller', ja: 'バーチャルコントローラー' },
    description: {
      en: 'Phones become gamepads (d-pad + buttons) for a game running on the big screen.',
      ja: 'スマホが大画面で動くゲームのゲームパッド(十字キー+ボタン)になります。',
    },
    useWhen: {
      en: 'couch multiplayer games, kiosks, presentations clickers',
      ja: 'みんなで遊ぶゲーム、キオスク、プレゼンのリモコン',
    },
    transports: { recommended: 'webrtc', supported: ['webrtc', 'partykit', 'broadcast'] },
    pairing: ['qr', 'code', 'pin'],
    players: { min: 2, typical: 4, max: 8 },
    needsMessaging: true,
    state: '{ phase: "lobby" | "playing" | "over"; scores: Record<string, number> }',
    messages: [
      {
        type: 'input',
        from: 'controller',
        payload: '{ seq: number; x: number; y: number; buttons: number }',
        description: 'x/y in -1..1 from the d-pad/stick; buttons is a bitmask (A=1, B=2). seq lets the host drop stale input.',
      },
    ],
    rateLimit: {
      maxPerSecond: 60,
      strategy: 'on-change',
      maxPayloadBytes: 96,
      notes: 'Send on change, capped at 60/s, plus a 5/s keepalive while a button is held. Prefer WebRTC for latency.',
    },
    controller: { wakeLock: true, motionPermission: false, orientation: 'landscape' },
    template: { kind: 'vite-react', dir: 'virtual-controller' },
    keywords: {
      en: ['controller', 'gamepad', 'joystick', 'game', 'games', 'play', 'button', 'buttons', 'd-pad', 'remote', 'clicker', 'arcade'],
      ja: ['コントローラ', 'ゲームパッド', 'ゲーム', 'ボタン', '十字キー', 'リモコン', '操作', '遊'],
    },
  },
  {
    id: 'motion-sensor',
    name: { en: 'Motion / Sensor', ja: 'モーション/センサー' },
    description: {
      en: 'Tilt and shake phones: device orientation and motion steer things on the big screen.',
      ja: 'スマホを傾けたり振ったり: 端末の向きと加速度で大画面のものを動かします。',
    },
    useWhen: {
      en: 'tilt steering, shake-to-cheer, balance games, physical installations',
      ja: '傾けて操作、振って応援、バランスゲーム、インスタレーション',
    },
    transports: { recommended: 'webrtc', supported: ['webrtc', 'partykit', 'broadcast'] },
    pairing: ['qr', 'code', 'pin'],
    players: { min: 2, typical: 4, max: 16 },
    needsMessaging: true,
    state: null,
    messages: [
      {
        type: 'motion',
        from: 'controller',
        payload: '{ beta: number; gamma: number; shake: number }',
        description: 'beta/gamma tilt in degrees from DeviceOrientation; shake is 0..1 from acceleration magnitude.',
      },
    ],
    rateLimit: {
      maxPerSecond: 30,
      strategy: 'throttle',
      maxPayloadBytes: 96,
      notes: 'Sensors fire at 60–100 Hz; throttle to 30/s and smooth on the host. iOS needs a permission tap (ControllerWrapper shows it).',
    },
    controller: { wakeLock: true, motionPermission: true, orientation: 'portrait' },
    template: { kind: 'vite-react', dir: 'motion-sensor' },
    keywords: {
      en: ['tilt', 'motion', 'gyro', 'gyroscope', 'accelerometer', 'shake', 'sensor', 'sensors', 'orientation', 'balance', 'steer'],
      ja: ['傾', 'モーション', 'ジャイロ', '加速度', '振', 'センサー', '向き', 'バランス'],
    },
  },
  {
    id: 'local-multi-display',
    name: { en: 'Local Multi-Display', ja: 'ローカルマルチディスプレイ' },
    description: {
      en: 'Several windows or monitors on one computer show parts of one synchronized scene.',
      ja: '1台のコンピューターの複数のウィンドウやモニターが、同期した1つのシーンを分担して表示します。',
    },
    useWhen: {
      en: 'video walls, exhibitions, multi-monitor dashboards, offline demos',
      ja: 'ビデオウォール、展示、マルチモニターのダッシュボード、オフラインデモ',
    },
    transports: { recommended: 'broadcast', supported: ['broadcast'] },
    pairing: ['broadcast'],
    players: { min: 2, typical: 3, max: 16 },
    needsMessaging: true,
    state: '{ startedAt: number; scene: number }',
    messages: [
      { type: 'tick', from: 'host', payload: '{ t: number; scene: number }', description: 'Leader clock so every window renders the same frame.' },
      { type: 'hello', from: 'any', payload: '{ id: string; index: number }', description: 'Window announces itself and picks its slice of the scene.' },
    ],
    rateLimit: {
      maxPerSecond: 60,
      strategy: 'throttle',
      maxPayloadBytes: 256,
      notes: 'Same-machine BroadcastChannel is cheap, but send the clock (not frames) and let each window render locally.',
    },
    controller: { wakeLock: true, motionPermission: false },
    template: { kind: 'html', dir: 'local-multi-display' },
    keywords: {
      en: ['multi-display', 'multi display', 'multiple displays', 'monitors', 'monitor', 'screens', 'windows', 'tabs', 'video wall', 'same machine', 'same computer', 'offline', 'exhibition'],
      ja: ['マルチディスプレイ', '複数画面', '複数のモニター', 'モニター', 'ウィンドウ', 'タブ', 'ビデオウォール', '同じパソコン', '同じPC', 'オフライン', '展示'],
    },
  },
];

const byId = new Map<string, PresetDescriptor>(PRESETS.map((preset) => [preset.id, preset]));

export function isPresetId(value: unknown): value is PresetId {
  return typeof value === 'string' && byId.has(value);
}

export function getPreset(id: string): PresetDescriptor | undefined {
  return byId.get(id);
}

/** Transports that can carry `preset`; Firebase never qualifies for presets that need messaging. */
export function supportedTransports(preset: PresetDescriptor): TransportKind[] {
  return preset.transports.supported.filter((kind) => !preset.needsMessaging || MESSAGING.includes(kind));
}

/** Pairing methods each transport can offer. */
export const TRANSPORT_PAIRING: Record<TransportKind, readonly PairingMethod[]> = {
  firebase: ['qr', 'code'],
  partykit: ['qr', 'code', 'pin'],
  webrtc: ['qr', 'code', 'pin'],
  broadcast: ['broadcast', 'code', 'pin'],
};

/** Pairing methods that fit both the preset and the transport, in the preset's order of preference. */
export function pairingFor(preset: PresetDescriptor, transport: TransportKind): PairingMethod[] {
  const allowed = TRANSPORT_PAIRING[transport];
  const fromPreset = preset.pairing.filter((method) => allowed.includes(method));
  return fromPreset.length > 0 ? fromPreset : [...allowed];
}

/** Presets that support `transport`, recommended-first. */
export function presetsForTransport(transport: TransportKind): PresetDescriptor[] {
  const fits = PRESETS.filter((preset) => supportedTransports(preset).includes(transport));
  return [
    ...fits.filter((preset) => preset.transports.recommended === transport),
    ...fits.filter((preset) => preset.transports.recommended !== transport),
  ];
}

export function presetName(preset: PresetDescriptor, locale: string): string {
  return locale === 'ja' ? preset.name.ja : preset.name.en;
}

export function presetText(text: LocalizedText, locale: string): string {
  return locale === 'ja' ? text.ja : text.en;
}
