import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import type { Readable, Writable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import type { PairingMethod, TransportKind } from '../core/types';
import { createTranslator, type Locale, type Translator } from '../i18n';
import {
  getPreset,
  isPresetId,
  pairingFor,
  PRESET_IDS,
  PRESETS,
  presetName,
  presetsForTransport,
  presetText,
  supportedTransports,
  TRANSPORT_PAIRING,
  type PresetDescriptor,
  type PresetId,
} from '../presets';
import { buildConfig, CONFIG_FILE_NAME, PAIRING_METHODS, TRANSPORT_KINDS, validateConfig, type SnapPairConfig } from './config';
import { recommend, type Recommendation } from './recommend';

/**
 * `snap-pair init`: four ways to reach a (preset, transport, pairing) choice,
 * then `snap-pair.config.json` and an optional template scaffold.
 *
 * Every question can be answered by a flag, and `yes` takes the default for
 * the rest, so the same code path serves humans, CI, and tests.
 */

export type InitPath = 'ux' | 'architecture' | 'stack' | 'consult';
export type Architecture = 'same-device' | 'realtime' | 'p2p' | 'managed';
export type Stack = 'firebase' | 'cloudflare' | 'none';

export const INIT_PATHS: readonly InitPath[] = ['ux', 'architecture', 'stack', 'consult'];
export const ARCHITECTURES: Record<Architecture, TransportKind> = {
  'same-device': 'broadcast',
  realtime: 'partykit',
  p2p: 'webrtc',
  managed: 'firebase',
};
export const STACKS: Record<Stack, TransportKind> = { firebase: 'firebase', cloudflare: 'partykit', none: 'broadcast' };

export interface InitOptions {
  path?: InitPath;
  /** Preset id, or `'none'` for a config without a template. */
  preset?: string;
  transport?: string;
  pairing?: string;
  architecture?: string;
  stack?: string;
  describe?: string;
  out?: string;
  partykitHost?: string;
  maxPlayers?: number;
  /** Default true. */
  scaffold?: boolean;
  force?: boolean;
  yes?: boolean;
  json?: boolean;
  lang?: Locale;
  /** Base for relative paths. Default: `process.cwd()`. */
  cwd?: string;
  /** Override where templates are read from (tests). */
  templatesDir?: string;
}

export interface WizardIO {
  input: Readable;
  /** Human-readable output (prompts, explanations). */
  output: Writable;
}

export interface InitResult {
  ok: true;
  path: InitPath;
  config: SnapPairConfig;
  configPath: string;
  outDir: string;
  scaffolded: boolean;
  /** Written files, relative to `outDir`. */
  files: string[];
  recommendation?: Recommendation;
  nextSteps: string[];
}

export class CliError extends Error {
  constructor(message: string, readonly exitCode = 1) {
    super(message);
    this.name = 'CliError';
  }
}

// ---- Package paths -----------------------------------------------------------

const here = dirname(fileURLToPath(import.meta.url));

/** `src/templates` when running from source, `<package>/templates` when running from `dist/cli`. */
export function findTemplatesDir(): string | undefined {
  const candidates = [resolve(here, '../templates'), resolve(here, '../../templates')];
  return candidates.find((dir) => existsSync(join(dir, '_shared')));
}

/** This package's version (src/cli and dist/cli are both two levels below the package root). */
export function packageVersion(): string {
  try {
    return JSON.parse(readFileSync(resolve(here, '../../package.json'), 'utf8')).version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

// ---- Prompting -----------------------------------------------------------------

interface Prompter {
  ask(question: string): Promise<string>;
  close(): void;
}

function createPrompter({ input, output }: WizardIO): Prompter {
  const terminal = Boolean((input as { isTTY?: boolean }).isTTY && (output as { isTTY?: boolean }).isTTY);
  const rl = createInterface({ input, output, terminal });
  // The async iterator buffers lines, so piped answers that arrive before a question are not lost.
  const lines = rl[Symbol.asyncIterator]();
  return {
    async ask(question) {
      output.write(question);
      const { value, done } = await lines.next();
      if (!terminal) output.write('\n');
      if (done) throw new CliError('stdin closed before the wizard finished (use --yes for non-interactive runs).');
      return String(value).trim();
    },
    close: () => rl.close(),
  };
}

interface Choice<T> {
  value: T;
  label: string;
  details?: string[];
  recommended?: boolean;
}

class Session {
  readonly tr: Translator;
  private prompter: Prompter | null = null;

  constructor(readonly options: InitOptions, private readonly io: WizardIO) {
    this.tr = createTranslator(options.lang ?? 'en');
  }

  get locale(): Locale {
    return this.tr.locale;
  }

  log(line = ''): void {
    this.io.output.write(`${line}\n`);
  }

  close(): void {
    this.prompter?.close();
  }

  private ask(question: string): Promise<string> {
    this.prompter ??= createPrompter(this.io);
    return this.prompter.ask(question);
  }

  async choose<T>(title: string, choices: Choice<T>[], defaultIndex = 0): Promise<T> {
    if (this.options.yes) return choices[defaultIndex].value;
    this.log('');
    this.log(title);
    choices.forEach((choice, index) => {
      const tags = [choice.recommended ? this.tr.t('cli.recommended') : '', index === defaultIndex ? this.tr.t('cli.default') : '']
        .filter(Boolean);
      this.log(`  ${index + 1}) ${choice.label}${tags.length ? ` (${tags.join(', ')})` : ''}`);
      for (const detail of choice.details ?? []) this.log(`       ${detail}`);
    });
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const answer = await this.ask(`${this.tr.t('cli.choose', { max: choices.length })} [${defaultIndex + 1}]: `);
      if (answer === '') return choices[defaultIndex].value;
      const n = Number(answer);
      if (Number.isInteger(n) && n >= 1 && n <= choices.length) return choices[n - 1].value;
      const byValue = choices.find((choice) => String(choice.value) === answer);
      if (byValue) return byValue.value;
      this.log(this.tr.t('cli.invalidChoice', { max: choices.length }));
    }
    throw new CliError(this.tr.t('cli.aborted'));
  }

  async confirm(question: string, defaultYes = true): Promise<boolean> {
    if (this.options.yes) return defaultYes;
    const yes = this.tr.t('cli.yes');
    const no = this.tr.t('cli.no');
    const answer = (await this.ask(`${question} [${defaultYes ? yes.toUpperCase() : yes}/${defaultYes ? no : no.toUpperCase()}]: `)).toLowerCase();
    if (answer === '') return defaultYes;
    return ['y', 'yes', 'はい', yes].includes(answer);
  }

  async text(question: string, fallback: string): Promise<string> {
    if (this.options.yes) return fallback;
    const answer = await this.ask(`${question}${fallback ? ` [${fallback}]` : ''} `);
    return answer || fallback;
  }
}

// ---- Descriptions ----------------------------------------------------------------

function transportDetails(tr: Translator, kind: TransportKind): string[] {
  return [
    tr.t(`transports.${kind}.summary`),
    `${tr.t('cli.pros')}:`,
    ...tr.tList(`transports.${kind}.pros`).map((item) => `+ ${item}`),
    `${tr.t('cli.cons')}:`,
    ...tr.tList(`transports.${kind}.cons`).map((item) => `- ${item}`),
    `$ ${tr.t('cli.cost')}: ${tr.t(`transports.${kind}.cost`)}`,
  ];
}

function presetDetails(tr: Translator, preset: PresetDescriptor): string[] {
  const locale = tr.locale;
  return [
    presetText(preset.description, locale),
    `${tr.t('cli.presetCompat')}: ${supportedTransports(preset).map((kind) => (kind === preset.transports.recommended ? `${kind}*` : kind)).join(', ')}`
      + ` · ${tr.t('cli.pairing')}: ${preset.pairing.join(', ')}`,
    `${tr.t('cli.messages')}: ${preset.messages.map((m) => m.type).join(', ')} · ${tr.t('cli.rateLimit')}: ≤${preset.rateLimit.maxPerSecond}/s (${preset.rateLimit.strategy})`,
  ];
}

function transportChoice(tr: Translator, kind: TransportKind, recommended: boolean): Choice<TransportKind> {
  return { value: kind, label: tr.t(`transports.${kind}.name`), details: transportDetails(tr, kind), recommended };
}

// ---- Option parsing helpers ---------------------------------------------------------

function parsePreset(tr: Translator, value: string | undefined): PresetId | null | undefined {
  if (value === undefined) return undefined;
  if (value === 'none') return null;
  if (!isPresetId(value)) throw new CliError(tr.t('cli.unknownPreset', { value, known: [...PRESET_IDS, 'none'].join(', ') }));
  return value;
}

function parseTransport(tr: Translator, value: string | undefined): TransportKind | undefined {
  if (value === undefined) return undefined;
  if (!TRANSPORT_KINDS.includes(value as TransportKind)) {
    throw new CliError(tr.t('cli.unknownTransport', { value, known: TRANSPORT_KINDS.join(', ') }));
  }
  return value as TransportKind;
}

function parsePairing(tr: Translator, value: string | undefined): PairingMethod | undefined {
  if (value === undefined) return undefined;
  if (!PAIRING_METHODS.includes(value as PairingMethod)) {
    throw new CliError(tr.t('cli.unknownPairing', { value, known: PAIRING_METHODS.join(', ') }));
  }
  return value as PairingMethod;
}

function parseEnum<T extends string>(value: string | undefined, allowed: readonly T[], label: string): T | undefined {
  if (value === undefined) return undefined;
  if (!allowed.includes(value as T)) throw new CliError(`Unknown ${label} "${value}". Use one of: ${allowed.join(', ')}`);
  return value as T;
}

// ---- Flows ------------------------------------------------------------------------

interface Decision {
  path: InitPath;
  preset: PresetId | null;
  transport: TransportKind;
  recommendation?: Recommendation;
}

async function choosePreset(s: Session, candidates: PresetDescriptor[], preferred?: PresetId): Promise<PresetDescriptor> {
  const defaultIndex = Math.max(0, candidates.findIndex((preset) => preset.id === preferred));
  const id = await s.choose(
    s.tr.t('cli.askPreset'),
    candidates.map((preset) => ({ value: preset.id, label: `${presetName(preset, s.locale)} (${preset.id})`, details: presetDetails(s.tr, preset) })),
    defaultIndex,
  );
  return getPreset(id)!;
}

async function chooseTransportFor(s: Session, preset: PresetDescriptor): Promise<TransportKind> {
  const supported = supportedTransports(preset);
  const defaultIndex = Math.max(0, supported.indexOf(preset.transports.recommended));
  return s.choose(
    s.tr.t('cli.askTransport'),
    supported.map((kind) => transportChoice(s.tr, kind, kind === preset.transports.recommended)),
    defaultIndex,
  );
}

/** Firebase alone fits no preset (they all need messaging): offer config-only, or PartyKit for the realtime part. */
async function firebaseFlow(s: Session, path: InitPath, presetFlag: PresetId | null | undefined): Promise<Decision> {
  if (presetFlag === null) return { path, preset: null, transport: 'firebase' };
  s.log('');
  s.log(s.tr.t('cli.firebaseNote'));
  const mode = await s.choose(s.tr.t('cli.askTransport'), [
    { value: 'firebase-only' as const, label: s.tr.t('cli.firebaseOnly'), details: transportDetails(s.tr, 'firebase') },
    { value: 'partykit' as const, label: s.tr.t('cli.firebaseWithPartykit'), details: transportDetails(s.tr, 'partykit') },
  ], presetFlag ? 1 : 0);
  if (mode === 'firebase-only') return { path, preset: null, transport: 'firebase' };
  const preset = presetFlag ? getPreset(presetFlag)! : await choosePreset(s, presetsForTransport('partykit'));
  return { path, preset: preset.id, transport: 'partykit' };
}

async function transportFirstFlow(s: Session, path: InitPath, transport: TransportKind, presetFlag: PresetId | null | undefined): Promise<Decision> {
  if (transport === 'firebase') return firebaseFlow(s, path, presetFlag);
  if (presetFlag !== undefined) return { path, preset: presetFlag, transport };
  const preset = await choosePreset(s, presetsForTransport(transport));
  return { path, preset: preset.id, transport };
}

async function decide(s: Session): Promise<Decision> {
  const { options, tr } = s;
  const presetFlag = parsePreset(tr, options.preset);
  const transportFlag = parseTransport(tr, options.transport);
  const architecture = parseEnum(options.architecture, Object.keys(ARCHITECTURES) as Architecture[], 'architecture');
  const stack = parseEnum(options.stack, Object.keys(STACKS) as Stack[], 'stack');
  const pathFlag = parseEnum(options.path, INIT_PATHS, 'path');

  // Explicit choices short-circuit the menu.
  if (presetFlag !== undefined && transportFlag) return { path: pathFlag ?? 'ux', preset: presetFlag, transport: transportFlag };
  if (transportFlag) return transportFirstFlow(s, pathFlag ?? 'architecture', transportFlag, presetFlag);

  let path: InitPath | undefined = pathFlag
    ?? (architecture ? 'architecture' : stack ? 'stack' : options.describe !== undefined ? 'consult' : presetFlag !== undefined ? 'ux' : undefined);
  path ??= await s.choose(tr.t('cli.menuTitle'), INIT_PATHS.map((value) => ({ value, label: tr.t(`cli.menu.${value}`) })));

  switch (path) {
    case 'ux': {
      if (presetFlag === null) return firebaseFlow(s, path, null);
      const preset = presetFlag ? getPreset(presetFlag)! : await choosePreset(s, [...PRESETS], 'room-quiz-poll');
      return { path, preset: preset.id, transport: await chooseTransportFor(s, preset) };
    }
    case 'architecture': {
      const keys = Object.keys(ARCHITECTURES) as Architecture[];
      const chosen = architecture ?? await s.choose(tr.t('cli.askArchitecture'), keys.map((key) => ({
        value: key,
        label: `${tr.t(`architectures.${key}.name`)} → ${tr.t(`transports.${ARCHITECTURES[key]}.name`)}`,
        details: [tr.t(`architectures.${key}.description`), ...transportDetails(tr, ARCHITECTURES[key])],
      })), 1);
      return transportFirstFlow(s, path, ARCHITECTURES[chosen], presetFlag);
    }
    case 'stack': {
      const keys = Object.keys(STACKS) as Stack[];
      const chosen = stack ?? await s.choose(tr.t('cli.askStack'), keys.map((key) => ({
        value: key,
        label: `${tr.t(`stacks.${key}.name`)} → ${tr.t(`transports.${STACKS[key]}.name`)}`,
        details: [tr.t(`stacks.${key}.description`), ...transportDetails(tr, STACKS[key])],
      })), 1);
      if (chosen === 'none') {
        s.log('');
        s.log(tr.t('cli.stackNoneNote'));
      }
      return transportFirstFlow(s, path, STACKS[chosen], presetFlag);
    }
    case 'consult': {
      const text = options.describe ?? await s.text(tr.t('cli.askConsult'), '');
      const recommendation = recommend(text, s.locale);
      const preset = getPreset(recommendation.preset)!;
      s.log('');
      if (recommendation.fallback) s.log(tr.t('cli.consultNoMatch'));
      s.log(tr.t('cli.consultResult', {
        preset: presetName(preset, s.locale),
        transport: tr.t(`transports.${recommendation.transport}.name`),
        pairing: tr.t(`pairing.${recommendation.pairing}.name`),
      }));
      s.log(`${tr.t('cli.consultReasons')}:`);
      for (const reason of recommendation.reasons) s.log(`  - ${reason}`);
      for (const line of transportDetails(tr, recommendation.transport)) s.log(`    ${line}`);
      if (await s.confirm(tr.t('cli.acceptRecommendation'))) {
        return { path, preset: preset.id, transport: recommendation.transport, recommendation };
      }
      const picked = await choosePreset(s, [...PRESETS], preset.id);
      return { path, preset: picked.id, transport: await chooseTransportFor(s, picked), recommendation };
    }
    default:
      throw new CliError(`Unknown path "${String(path)}".`);
  }
}

async function choosePairing(s: Session, preset: PresetDescriptor | undefined, transport: TransportKind): Promise<PairingMethod> {
  const flag = parsePairing(s.tr, s.options.pairing);
  const allowed = preset ? pairingFor(preset, transport) : [...TRANSPORT_PAIRING[transport]];
  if (flag) {
    if (!allowed.includes(flag)) {
      throw new CliError(s.tr.t('cli.unsupportedPairing', { transport, pairing: flag, supported: allowed.join(', ') }));
    }
    return flag;
  }
  if (allowed.length === 1) return allowed[0];
  return s.choose(s.tr.t('cli.askPairing'), allowed.map((method, index) => ({
    value: method,
    label: s.tr.t(`pairing.${method}.name`),
    details: [s.tr.t(`pairing.${method}.description`)],
    recommended: index === 0,
  })));
}

// ---- Scaffolding ------------------------------------------------------------------

interface PlannedFile {
  /** Path relative to the output folder. */
  path: string;
  content: string | Buffer;
}

function listFiles(dir: string, prefix = ''): string[] {
  return readdirSync(dir).sort().flatMap((entry) => {
    const full = join(dir, entry);
    const rel = prefix ? `${prefix}/${entry}` : entry;
    return statSync(full).isDirectory() ? listFiles(full, rel) : [rel];
  });
}

/** `path` relative to `cwd` when it is inside it, absolute otherwise. */
export function displayPath(cwd: string, path: string): string {
  const rel = relative(cwd, path);
  if (rel === '') return '.';
  return rel.startsWith('..') || isAbsolute(rel) ? path : rel;
}

const npmName = (dir: string) =>
  basename(dir).toLowerCase().replace(/[^a-z0-9._~-]+/g, '-').replace(/^[-._]+|-+$/g, '') || 'snap-pair-app';

/** Template file name -> output name (npm drops `.gitignore`, and nested package.json files confuse tooling). */
const outputName = (rel: string) =>
  rel.replace(/(^|\/)_gitignore$/, '$1.gitignore').replace(/(^|\/)package\.json\.tmpl$/, '$1package.json');

export function planScaffold(templatesDir: string, preset: PresetDescriptor, config: SnapPairConfig, outDir: string): PlannedFile[] {
  const sources: Array<{ base: string; dir: string }> = [];
  if (preset.template.kind === 'vite-react') {
    sources.push({ base: join(templatesDir, '_shared'), dir: '' });
    if (config.transport === 'partykit' || (config.transport === 'webrtc' && config.webrtc?.signaling !== 'broadcast')) {
      sources.push({ base: join(templatesDir, '_partykit'), dir: '' });
    }
  }
  sources.push({ base: join(templatesDir, preset.template.dir), dir: '' });

  const files = new Map<string, PlannedFile>();
  const replacements: Record<string, string> = {
    '{{name}}': npmName(outDir),
    '{{version}}': packageVersion(),
    '{{preset}}': preset.id,
  };
  for (const { base } of sources) {
    if (!existsSync(base)) throw new CliError(`Template folder not found: ${base}`);
    for (const rel of listFiles(base)) {
      if (rel === CONFIG_FILE_NAME) continue; // Replaced by the generated config.
      const target = outputName(rel);
      let content: string | Buffer = readFileSync(join(base, rel));
      if (/\.(tmpl|md|json|html|ts|tsx)$/.test(rel)) {
        content = Object.entries(replacements).reduce((text, [token, value]) => text.split(token).join(value), content.toString('utf8'));
      }
      files.set(target, { path: target, content });
    }
  }
  files.set(CONFIG_FILE_NAME, { path: CONFIG_FILE_NAME, content: `${JSON.stringify(config, null, 2)}\n` });
  return [...files.values()];
}

function writePlanned(outDir: string, files: PlannedFile[], force: boolean, tr: Translator): void {
  if (!force) {
    const conflicts = files.filter((file) => existsSync(join(outDir, file.path))).map((file) => file.path);
    if (conflicts.length > 0) throw new CliError(tr.t('cli.conflicts', { files: conflicts.join(', ') }));
  }
  for (const file of files) {
    const target = join(outDir, file.path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, file.content);
  }
}

function nextSteps(tr: Translator, config: SnapPairConfig, preset: PresetDescriptor | undefined, outDir: string, cwd: string, scaffolded: boolean): string[] {
  const dir = displayPath(cwd, outDir);
  if (!preset || !scaffolded) {
    return config.transport === 'firebase' ? [tr.t('cli.next.firebase'), tr.t('cli.next.docs')] : [tr.t('cli.next.docs')];
  }
  if (preset.template.kind === 'html') return [tr.t('cli.next.html', { file: join(dir, 'index.html') }), tr.t('cli.next.docs')];
  const steps = [tr.t('cli.next.install', { dir })];
  const signaling = config.transport === 'partykit' || (config.transport === 'webrtc' && config.webrtc?.signaling === 'partykit');
  if (signaling) steps.push(tr.t('cli.next.partykitDev'));
  steps.push(tr.t(config.transport === 'broadcast' ? 'cli.next.devBroadcast' : 'cli.next.dev'));
  if (signaling) steps.push(tr.t('cli.next.lan'), tr.t('cli.next.partykitDeploy'));
  steps.push(tr.t('cli.next.docs'));
  return steps;
}

// ---- Entry ----------------------------------------------------------------------

export async function runInit(options: InitOptions, io: WizardIO): Promise<InitResult> {
  const s = new Session(options, io);
  try {
    const cwd = options.cwd ?? process.cwd();
    if (!options.yes) {
      s.log(s.tr.t('cli.intro'));
    }
    const decision = await decide(s);
    const preset = decision.preset ? getPreset(decision.preset) : undefined;
    if (preset && !supportedTransports(preset).includes(decision.transport)) {
      throw new CliError(s.tr.t('cli.unsupportedTransport', {
        preset: preset.id,
        transport: decision.transport,
        supported: supportedTransports(preset).join(', '),
      }));
    }
    const pairing = await choosePairing(s, preset, decision.transport);

    if (options.maxPlayers !== undefined && (!Number.isInteger(options.maxPlayers) || options.maxPlayers < 2 || options.maxPlayers > 300)) {
      throw new CliError('--max-players must be an integer from 2 to 300.');
    }
    const config = buildConfig({
      preset: decision.preset,
      transport: decision.transport,
      pairing,
      locale: s.locale,
      maxPlayers: options.maxPlayers,
      partykitHost: options.partykitHost,
    });
    const validation = validateConfig(config);
    if (!validation.ok) throw new CliError(`Generated an invalid config: ${validation.errors.join('; ')}`);

    let scaffold = Boolean(preset) && options.scaffold !== false;
    if (scaffold && !options.yes && options.out === undefined) {
      scaffold = await s.confirm(s.tr.t('cli.askScaffold', { preset: presetName(preset!, s.locale) }));
    }
    const defaultOut = scaffold && preset ? `snap-pair-${preset.id}` : '.';
    const outDir = resolve(cwd, options.out ?? (options.yes ? defaultOut : await s.text(s.tr.t('cli.askOut'), defaultOut)));

    const templatesDir = options.templatesDir ?? findTemplatesDir();
    const planned: PlannedFile[] = scaffold && preset
      ? (() => {
        if (!templatesDir) throw new CliError('Could not find the snap-pair templates folder.');
        return planScaffold(templatesDir, preset, config, outDir);
      })()
      : [{ path: CONFIG_FILE_NAME, content: `${JSON.stringify(config, null, 2)}\n` }];
    writePlanned(outDir, planned, Boolean(options.force), s.tr);

    const configPath = join(outDir, CONFIG_FILE_NAME);
    const steps = nextSteps(s.tr, config, preset, outDir, cwd, scaffold);

    s.log('');
    s.log(`${s.tr.t('cli.summary')}:`);
    s.log(`  ${s.tr.t('cli.preset')}: ${preset ? `${presetName(preset, s.locale)} (${preset.id})` : '-'}`);
    s.log(`  ${s.tr.t('cli.transport')}: ${s.tr.t(`transports.${config.transport}.name`)}`);
    s.log(`  ${s.tr.t('cli.pairing')}: ${s.tr.t(`pairing.${config.pairing}.name`)}`);
    s.log(`  ${s.tr.t('cli.cost')}: ${s.tr.t(`transports.${config.transport}.cost`)}`);
    s.log(s.tr.t('cli.written', { file: displayPath(cwd, configPath) }));
    if (scaffold && preset) s.log(s.tr.t('cli.scaffolded', { preset: preset.id, dir: displayPath(cwd, outDir) }));
    else if (preset) s.log(s.tr.t('cli.noTemplate', { file: CONFIG_FILE_NAME }));
    s.log('');
    s.log(`${s.tr.t('cli.nextSteps')}:`);
    steps.forEach((step, index) => s.log(`  ${index + 1}. ${step}`));

    return {
      ok: true,
      path: decision.path,
      config,
      configPath,
      outDir,
      scaffolded: scaffold,
      files: planned.map((file) => file.path).sort(),
      recommendation: decision.recommendation,
      nextSteps: steps,
    };
  } finally {
    s.close();
  }
}
