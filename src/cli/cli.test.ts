import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { PassThrough } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PRESETS, supportedTransports } from '../presets';
import { buildConfig, validateConfig } from './config';
import { main, parseArgs } from './main';
import { findTemplatesDir, packageVersion, planScaffold } from './wizard';

let cwd: string;

beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), 'sp-cli-'));
});

afterEach(() => {
  rmSync(cwd, { recursive: true, force: true });
});

function collect() {
  const stream = new PassThrough();
  let text = '';
  stream.on('data', (chunk) => { text += chunk.toString(); });
  return { stream, text: () => text };
}

/** Runs the CLI with `answers` piped to stdin (one per line). */
async function run(argv: string[], answers?: string[], env: Record<string, string> = { LANG: 'en_US.UTF-8' }) {
  const stdin = new PassThrough();
  const stdout = collect();
  const stderr = collect();
  if (answers) stdin.end(answers.map((line) => `${line}\n`).join(''));
  else stdin.end();
  const code = await main(argv, { stdin, stdout: stdout.stream, stderr: stderr.stream, cwd, env });
  return { code, stdout: stdout.text(), stderr: stderr.text() };
}

const readJson = (path: string) => JSON.parse(readFileSync(path, 'utf8'));

describe('parseArgs', () => {
  it('parses commands, booleans, and values (spaced or inline)', () => {
    const args = parseArgs(['init', '--yes', '--preset=type-throw', '--transport', 'partykit', '--max-players', '20', '--no-scaffold', '--lang', 'ja']);
    expect(args).toMatchObject({
      command: 'init',
      options: { yes: true, preset: 'type-throw', transport: 'partykit', maxPlayers: 20, scaffold: false, lang: 'ja' },
    });
    expect(parseArgs([]).command).toBe('init');
    expect(parseArgs(['recommend', 'a', 'quiz']).positionals).toEqual(['a', 'quiz']);
    expect(parseArgs(['-h']).help).toBe(true);
    expect(parseArgs(['-v']).version).toBe(true);
  });

  it('rejects unknown flags, missing values, and bad --lang / --max-players', () => {
    expect(() => parseArgs(['--wat'])).toThrow('Unknown option "--wat"');
    expect(() => parseArgs(['--preset'])).toThrow('Option --preset needs a value.');
    expect(() => parseArgs(['--preset', '--yes'])).toThrow('Option --preset needs a value.');
    expect(() => parseArgs(['--lang', 'fr'])).toThrow('--lang must be one of: en, ja');
    expect(() => parseArgs(['--max-players', 'many'])).toThrow('--max-players must be an integer');
  });
});

describe('snap-pair --help / --version', () => {
  it('prints help in the detected or requested language', async () => {
    const en = await run(['--help']);
    expect(en.code).toBe(0);
    expect(en.stdout).toContain('Usage: snap-pair <command> [options]');
    expect(en.stdout).toContain('--preset <id>');

    const ja = await run(['help'], undefined, { LANG: 'ja_JP.UTF-8' });
    expect(ja.stdout).toContain('使い方: snap-pair');
    expect((await run(['--help', '--lang', 'en'], undefined, { LANG: 'ja_JP.UTF-8' })).stdout).toContain('Usage:');
  });

  it('prints the package version', async () => {
    const { code, stdout } = await run(['--version']);
    expect(code).toBe(0);
    expect(stdout.trim()).toBe(readJson(resolve(__dirname, '../../package.json')).version);
    expect(packageVersion()).toBe(stdout.trim());
  });
});

describe('snap-pair init (non-interactive)', () => {
  it('scaffolds a preset and prints a JSON result', async () => {
    const { code, stdout, stderr } = await run(['init', '--yes', '--preset', 'room-quiz-poll', '--out', 'quiz', '--json']);
    expect(code).toBe(0);
    const result = JSON.parse(stdout);
    expect(result).toMatchObject({
      ok: true,
      path: 'ux',
      scaffolded: true,
      outDir: join(cwd, 'quiz'),
      config: { preset: 'room-quiz-poll', transport: 'partykit', pairing: 'pin', locale: 'en', maxPlayers: 300 },
    });
    // Human-readable output goes to stderr in --json mode.
    expect(stderr).toContain('Wrote quiz/snap-pair.config.json');

    const dir = join(cwd, 'quiz');
    expect(result.files).toEqual(expect.arrayContaining([
      '.gitignore', 'README.md', 'index.html', 'package.json', 'partykit.json', 'party/server.ts',
      'snap-pair.config.json', 'src/Controller.tsx', 'src/Host.tsx', 'src/main.tsx', 'src/quiz.ts', 'src/snap.ts', 'src/ui.tsx',
    ]));
    expect(validateConfig(readJson(join(dir, 'snap-pair.config.json'))).ok).toBe(true);
    const pkg = readJson(join(dir, 'package.json'));
    expect(pkg.name).toBe('quiz');
    expect(pkg.dependencies['snap-pair-core']).toBe(`^${packageVersion()}`);
    expect(readJson(join(dir, 'partykit.json')).name).toBe('quiz-relay');
    for (const file of result.files) expect(readFileSync(join(dir, file), 'utf8'), file).not.toMatch(/\{\{\w+\}\}/);
    expect(existsSync(join(dir, '_gitignore'))).toBe(false);
  });

  it('defaults the folder to snap-pair-<preset> and skips the relay for broadcast', async () => {
    const { code, stdout } = await run(['init', '-y', '--preset', 'stroke-stream', '--transport', 'broadcast', '--json']);
    expect(code).toBe(0);
    const result = JSON.parse(stdout);
    expect(result.outDir).toBe(join(cwd, 'snap-pair-stroke-stream'));
    expect(result.config).toMatchObject({ transport: 'broadcast', pairing: 'code' });
    expect(result.files).not.toContain('party/server.ts');
    expect(result.nextSteps.join('\n')).toContain('two tabs of the same browser');
  });

  it('writes only the config with --no-scaffold', async () => {
    const { code, stdout } = await run(['init', '--yes', '--preset', 'virtual-controller', '--no-scaffold', '--out', '.', '--json', '--partykit-host', 'relay.example.dev']);
    expect(code).toBe(0);
    expect(JSON.parse(stdout).files).toEqual(['snap-pair.config.json']);
    expect(readJson(join(cwd, 'snap-pair.config.json'))).toMatchObject({
      transport: 'webrtc', webrtc: { signaling: 'partykit' }, partykit: { host: 'relay.example.dev' },
    });
  });

  it('scaffolds the single-file Local Multi-Display demo', async () => {
    const { stdout } = await run(['init', '--yes', '--preset', 'local-multi-display', '--out', 'wall', '--json']);
    const result = JSON.parse(stdout);
    expect(result.files).toEqual(['README.md', 'index.html', 'snap-pair.config.json']);
    expect(result.config).toMatchObject({ transport: 'broadcast', pairing: 'broadcast' });
    expect(result.nextSteps[0]).toContain(join('wall', 'index.html'));
  });

  it('refuses to overwrite files unless --force', async () => {
    await run(['init', '--yes', '--preset', 'type-throw', '--out', 'app']);
    writeFileSync(join(cwd, 'app/src/Host.tsx'), '// mine');
    const again = await run(['init', '--yes', '--preset', 'type-throw', '--out', 'app']);
    expect(again.code).toBe(1);
    expect(again.stderr).toMatch(/already exist \(use --force to overwrite\): .*src\/Host\.tsx/);
    expect(readFileSync(join(cwd, 'app/src/Host.tsx'), 'utf8')).toBe('// mine');

    expect((await run(['init', '--yes', '--preset', 'type-throw', '--out', 'app', '--force'])).code).toBe(0);
    expect(readFileSync(join(cwd, 'app/src/Host.tsx'), 'utf8')).not.toBe('// mine');
  });

  it('rejects unknown presets and incompatible transports or pairing', async () => {
    const unknown = await run(['init', '--yes', '--preset', 'nope', '--json']);
    expect(unknown.code).toBe(1);
    expect(JSON.parse(unknown.stdout)).toMatchObject({ ok: false, error: expect.stringContaining('Unknown preset "nope"') });

    const incompatible = await run(['init', '--yes', '--preset', 'local-multi-display', '--transport', 'partykit']);
    expect(incompatible.stderr).toContain('does not support the partykit transport. Supported: broadcast');

    const firebase = await run(['init', '--yes', '--preset', 'room-quiz-poll', '--transport', 'firebase']);
    expect(firebase.code).toBe(1);

    const pairing = await run(['init', '--yes', '--preset', 'room-quiz-poll', '--pairing', 'broadcast']);
    expect(pairing.stderr).toContain('does not support broadcast pairing');

    expect((await run(['init', '--yes', '--max-players', '1', '--preset', 'type-throw'])).stderr).toContain('--max-players must be an integer from 2 to 300');
    expect((await run(['deploy'])).stderr).toContain('Unknown command "deploy"');
    expect((await run(['init', '--yes', '--stack', 'aws'])).stderr).toContain('Unknown stack "aws"');
  });

  it('managed / Firebase: writes a config-only Firebase setup', async () => {
    const { code, stdout } = await run(['init', '--yes', '--architecture', 'managed', '--json']);
    expect(code).toBe(0);
    const result = JSON.parse(stdout);
    expect(result).toMatchObject({ path: 'architecture', scaffolded: false, files: ['snap-pair.config.json'], config: { preset: null, transport: 'firebase', pairing: 'qr' } });
    expect(result.nextSteps[0]).toContain('SKILL.md');
    expect(existsSync(join(cwd, 'snap-pair.config.json'))).toBe(true);
  });

  it('stack paths map to transports and offer matching presets', async () => {
    const none = JSON.parse((await run(['init', '--yes', '--stack', 'none', '--json'])).stdout);
    expect(none.config).toMatchObject({ preset: 'local-multi-display', transport: 'broadcast' });
    const cloudflare = JSON.parse((await run(['init', '--yes', '--stack', 'cloudflare', '--no-scaffold', '--out', 'cf', '--json'])).stdout);
    expect(cloudflare.config).toMatchObject({ preset: 'particle-blast', transport: 'partykit' });
    const firebaseWithPreset = JSON.parse((await run(['init', '--yes', '--stack', 'firebase', '--preset', 'type-throw', '--out', 'fb', '--json'])).stdout);
    expect(firebaseWithPreset.config).toMatchObject({ preset: 'type-throw', transport: 'partykit' });
  });

  it('consult path uses the recommender', async () => {
    const { code, stdout } = await run(['init', '--yes', '--describe', 'tilt your phone to steer, 4 friends', '--no-scaffold', '--out', '.', '--json']);
    expect(code).toBe(0);
    const result = JSON.parse(stdout);
    expect(result.path).toBe('consult');
    expect(result.config).toMatchObject({ preset: 'motion-sensor', transport: 'webrtc' });
    expect(result.recommendation.reasons[0]).toContain('"tilt"');
  });
});

describe('snap-pair init (scripted interactive stdin)', () => {
  it('UX path: menu -> preset -> transport -> pairing -> scaffold -> folder', async () => {
    const { code, stdout } = await run(['init'], ['1', '4', '', '2', 'y', 'my-poll']);
    expect(code).toBe(0);
    expect(stdout).toContain('How do you want to choose?');
    expect(stdout).toContain('Which experience?');
    expect(stdout).toContain('Room Quiz / Poll (room-quiz-poll)');
    // Every transport choice explains pros, cons, and cost.
    expect(stdout).toContain('+ Scales to hundreds of peers per room');
    expect(stdout).toContain('- You run (a tiny) server');
    expect(stdout).toMatch(/\$ Cost: Cloudflare has a free tier/);
    expect(stdout).toContain('How do guests join?');
    expect(readJson(join(cwd, 'my-poll/snap-pair.config.json'))).toMatchObject({ preset: 'room-quiz-poll', transport: 'partykit', pairing: 'qr' });
    expect(stdout).toContain('Next steps:');
  });

  it('re-asks after an invalid answer and accepts ids as answers', async () => {
    const { code, stdout } = await run(['init'], ['9', 'ux', 'type-throw', 'broadcast', '', 'n', '.']);
    expect(code).toBe(0);
    expect(stdout).toContain('Please enter a number between 1 and 4.');
    expect(readJson(join(cwd, 'snap-pair.config.json'))).toMatchObject({ preset: 'type-throw', transport: 'broadcast', pairing: 'pin' });
    expect(existsSync(join(cwd, 'src'))).toBe(false);
  });

  it('architecture path with Firebase explains why presets need another transport', async () => {
    const { code, stdout } = await run(['init'], ['2', '4', '1', '', 'fb-app']);
    expect(code).toBe(0);
    expect(stdout).toContain('Serverless managed → Firebase Realtime Database (managed)');
    expect(stdout).toContain('Spark (free): 1 GB stored');
    expect(stdout).toContain('which the Firebase transport does not support yet');
    expect(readJson(join(cwd, 'fb-app/snap-pair.config.json'))).toMatchObject({ preset: null, transport: 'firebase', pairing: 'qr' });
  });

  it('consult path in Japanese: describe, accept, decline scaffolding', async () => {
    const { code, stdout, stderr } = await run(['init', '--lang', 'ja'], ['4', 'スマホでお絵かきして大画面に映したい', '', '', 'n', 'draw']);
    expect(stderr).toBe('');
    expect(code).toBe(0);
    expect(stdout).toContain('アイデアを1〜2文で説明してください');
    expect(stdout).toContain('おすすめ: ストロークストリーム');
    expect(stdout).toContain('長所');
    expect(readJson(join(cwd, 'draw/snap-pair.config.json'))).toMatchObject({ preset: 'stroke-stream', transport: 'webrtc', locale: 'ja' });
  });

  it('consult path: rejecting the recommendation falls back to picking a preset', async () => {
    const { code } = await run(['init'], ['4', 'a big audience quiz', 'n', '5', '', '', 'n', '.']);
    expect(code).toBe(0);
    expect(readJson(join(cwd, 'snap-pair.config.json'))).toMatchObject({ preset: 'virtual-controller', transport: 'webrtc' });
  });

  it('fails cleanly when stdin closes early', async () => {
    const { code, stderr } = await run(['init'], ['1']);
    expect(code).toBe(1);
    expect(stderr).toContain('stdin closed before the wizard finished');
  });
});

describe('snap-pair presets / recommend', () => {
  it('lists presets as text and JSON', async () => {
    const text = await run(['presets']);
    expect(text.stdout).toContain('room-quiz-poll');
    expect(JSON.parse((await run(['presets', '--json'])).stdout)).toHaveLength(7);
  });

  it('recommends from positional text', async () => {
    const { stdout } = await run(['recommend', 'a', 'poll', 'for', 'the', 'audience']);
    expect(stdout).toContain('Recommendation: Room Quiz / Poll (room-quiz-poll)');
    const json = JSON.parse((await run(['recommend', '--json', 'phones as gamepads'])).stdout);
    expect(json.preset).toBe('virtual-controller');
  });
});

describe('templates', () => {
  it('scaffold plans have no leftover tokens for every preset and transport', () => {
    const templatesDir = findTemplatesDir()!;
    expect(templatesDir).toBeTruthy();
    for (const preset of PRESETS) {
      for (const transport of supportedTransports(preset)) {
        const config = buildConfig({ preset: preset.id, transport });
        const files = planScaffold(templatesDir, preset, config, join(cwd, 'x'));
        for (const file of files) {
          if (typeof file.content === 'string') expect(file.content, `${preset.id}/${transport}/${file.path}`).not.toMatch(/\{\{\w+\}\}/);
        }
        expect(files.some((file) => file.path === 'party/server.ts')).toBe(transport === 'partykit' || transport === 'webrtc');
      }
    }
  });

  it('the template relay matches examples/partykit/server.ts except for the room cap', () => {
    const root = resolve(__dirname, '../..');
    const example = readFileSync(join(root, 'examples/partykit/server.ts'), 'utf8');
    const template = readFileSync(join(root, 'src/templates/_partykit/party/server.ts'), 'utf8');
    const normalize = (source: string) => source
      .replace(/^\/\/ Raised from.*\n/m, '')
      .replace(/MAX_CONNECTIONS_PER_ROOM = \d+/, 'MAX_CONNECTIONS_PER_ROOM = N');
    expect(normalize(template)).toBe(normalize(example));
    expect(template).toContain('MAX_CONNECTIONS_PER_ROOM = 320');
  });
});
