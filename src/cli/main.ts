import type { Readable, Writable } from 'node:stream';
import { createTranslator, detectLocale, isLocale, type Locale } from '../i18n';
import { PRESETS, presetName, presetText, supportedTransports } from '../presets';
import { recommend } from './recommend';
import { CliError, packageVersion, runInit, type InitOptions } from './wizard';

export interface ParsedArgs {
  command: string;
  positionals: string[];
  options: InitOptions;
  help: boolean;
  version: boolean;
}

const VALUE_FLAGS: Record<string, keyof InitOptions> = {
  '--path': 'path',
  '--preset': 'preset',
  '--transport': 'transport',
  '--pairing': 'pairing',
  '--architecture': 'architecture',
  '--stack': 'stack',
  '--describe': 'describe',
  '--out': 'out',
  '--partykit-host': 'partykitHost',
  '--max-players': 'maxPlayers',
  '--lang': 'lang',
};

/** Parses `argv` (without `node` and the script). Throws `CliError` for unknown flags or missing values. */
export function parseArgs(argv: readonly string[]): ParsedArgs {
  const options: InitOptions = {};
  const positionals: string[] = [];
  let help = false;
  let version = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--') {
      positionals.push(...argv.slice(i + 1));
      break;
    }
    if (!arg.startsWith('-') || arg === '-') {
      positionals.push(arg);
      continue;
    }
    const eq = arg.indexOf('=');
    const flag = eq > 0 ? arg.slice(0, eq) : arg;
    const inline = eq > 0 ? arg.slice(eq + 1) : undefined;

    switch (flag) {
      case '-h': case '--help': help = true; continue;
      case '-v': case '--version': version = true; continue;
      case '-y': case '--yes': options.yes = true; continue;
      case '--json': options.json = true; continue;
      case '--force': options.force = true; continue;
      case '--no-scaffold': options.scaffold = false; continue;
      case '--scaffold': options.scaffold = true; continue;
      default: break;
    }

    const key = VALUE_FLAGS[flag];
    if (!key) throw new CliError(`Unknown option "${flag}". Run \`snap-pair --help\`.`);
    const value = inline ?? argv[i + 1];
    if (value === undefined || (inline === undefined && value.startsWith('--'))) {
      throw new CliError(`Option ${flag} needs a value.`);
    }
    if (inline === undefined) i += 1;

    if (key === 'maxPlayers') {
      const n = Number(value);
      if (!Number.isInteger(n)) throw new CliError('--max-players must be an integer from 2 to 300.');
      options.maxPlayers = n;
    } else if (key === 'lang') {
      if (!isLocale(value)) throw new CliError(`--lang must be one of: en, ja (got "${value}").`);
      options.lang = value;
    } else {
      (options as Record<string, unknown>)[key] = value;
    }
  }

  const [command = 'init', ...rest] = positionals;
  return { command, positionals: rest, options, help, version };
}

export interface CliIO {
  stdin: Readable;
  stdout: Writable;
  stderr: Writable;
  cwd?: string;
  env?: Record<string, string | undefined>;
}

const println = (stream: Writable, text = '') => stream.write(`${text}\n`);

/** Runs the CLI; resolves the process exit code. */
export async function main(argv: readonly string[], io: CliIO): Promise<number> {
  let locale: Locale = detectLocale(io.env ? { env: io.env } : {});
  let json = argv.includes('--json');
  try {
    const args = parseArgs(argv);
    locale = args.options.lang ?? locale;
    json = Boolean(args.options.json);
    const tr = createTranslator(locale);
    // In --json mode stdout carries only the JSON document; everything human-readable goes to stderr.
    const human = json ? io.stderr : io.stdout;

    if (args.version) {
      println(io.stdout, packageVersion());
      return 0;
    }
    if (args.help || args.command === 'help') {
      println(io.stdout, tr.tList('cli.help').join('\n'));
      return 0;
    }

    switch (args.command) {
      case 'init': {
        if (args.positionals.length > 0) throw new CliError(tr.t('cli.unknownCommand', { value: args.positionals.join(' ') }));
        const result = await runInit({ ...args.options, lang: locale, cwd: args.options.cwd ?? io.cwd }, { input: io.stdin, output: human });
        if (json) println(io.stdout, JSON.stringify(result, null, 2));
        return 0;
      }
      case 'presets': {
        if (json) {
          println(io.stdout, JSON.stringify(PRESETS, null, 2));
          return 0;
        }
        println(human, `${tr.t('cli.presetsTitle')}:`);
        for (const preset of PRESETS) {
          println(human, `  ${preset.id.padEnd(20)} ${presetName(preset, locale)}: ${presetText(preset.description, locale)}`);
          println(human, `  ${''.padEnd(20)} ${tr.t('cli.transport')}: ${supportedTransports(preset).join(', ')} · ${tr.t('cli.pairing')}: ${preset.pairing.join(', ')}`);
        }
        return 0;
      }
      case 'recommend': {
        const text = [args.options.describe, ...args.positionals].filter(Boolean).join(' ');
        const result = recommend(text, locale);
        if (json) {
          println(io.stdout, JSON.stringify(result, null, 2));
          return 0;
        }
        const preset = PRESETS.find((p) => p.id === result.preset)!;
        if (result.fallback) println(human, tr.t('cli.consultNoMatch'));
        println(human, tr.t('cli.consultResult', {
          preset: `${presetName(preset, locale)} (${preset.id})`,
          transport: tr.t(`transports.${result.transport}.name`),
          pairing: tr.t(`pairing.${result.pairing}.name`),
        }));
        for (const reason of result.reasons) println(human, `  - ${reason}`);
        println(human, `  $ ${tr.t('cli.cost')}: ${tr.t(`transports.${result.transport}.cost`)}`);
        return 0;
      }
      default:
        throw new CliError(tr.t('cli.unknownCommand', { value: args.command }));
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (json) println(io.stdout, JSON.stringify({ ok: false, error: message }, null, 2));
    println(io.stderr, `snap-pair: ${message}`);
    return error instanceof CliError ? error.exitCode : 1;
  }
}
