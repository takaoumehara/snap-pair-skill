import { describe, expect, it } from 'vitest';
import * as helper from './ai-update-helper.mjs';

const {
  MARKER,
  buildPrompt,
  bumpType,
  compareSemver,
  composeReport,
  diffLockVersions,
  diffManifestRanges,
  ecosystemOf,
  extractGeminiText,
  findMarkerComment,
  findReportIssue,
  groupChanges,
  parseCliArgs,
  parseDependabotBody,
  parseGitHubRepo,
  runtimeNameFor,
  selectReleasesBetween,
  sliceChangelog,
  usagePattern,
} = helper;

const lock = (deps: Record<string, string>, dev: Record<string, string>, versions: Record<string, string>) => ({
  name: 'x',
  lockfileVersion: 3,
  packages: {
    '': { name: 'x', dependencies: deps, devDependencies: dev },
    ...Object.fromEntries(Object.entries(versions).map(([n, v]) => [`node_modules/${n}`, { version: v }])),
  },
});

describe('diffLockVersions', () => {
  it('reports direct dependency changes only when present', () => {
    const before = lock({ firebase: '^12.0.0' }, { vitest: '^3.0.0' }, {
      firebase: '12.0.0',
      vitest: '3.2.4',
      tslib: '2.6.0',
      'node_modules/foo/node_modules/bar': '1.0.0',
    });
    const after = lock({ firebase: '^12.1.0' }, { vitest: '^3.0.0' }, {
      firebase: '12.1.0',
      vitest: '3.2.4',
      tslib: '2.7.0',
    });
    expect(diffLockVersions(before, after)).toEqual([
      { name: 'firebase', from: '12.0.0', to: '12.1.0', direct: true },
    ]);
  });

  it('falls back to top-level transitive changes (security updates)', () => {
    const before = lock({ firebase: '^12.0.0' }, {}, { firebase: '12.0.0', undici: '6.0.0', gone: '1.0.0' });
    const after = lock({ firebase: '^12.0.0' }, {}, { firebase: '12.0.0', undici: '6.21.2' });
    expect(diffLockVersions(before, after)).toEqual([
      { name: 'undici', from: '6.0.0', to: '6.21.2', direct: false },
    ]);
  });

  it('ignores nested node_modules copies', () => {
    const before = { packages: { '': {}, 'node_modules/a/node_modules/b': { version: '1.0.0' } } };
    const after = { packages: { '': {}, 'node_modules/a/node_modules/b': { version: '2.0.0' } } };
    expect(diffLockVersions(before, after)).toEqual([]);
  });
});

describe('diffManifestRanges', () => {
  it('diffs declared ranges across dependency fields', () => {
    expect(
      diffManifestRanges(
        { dependencies: { zod: '^3.23.0' }, devDependencies: { vitest: '^2.0.0' } },
        { dependencies: { zod: '^3.23.0' }, devDependencies: { vitest: '^3.2.4' } },
      ),
    ).toEqual([{ name: 'vitest', from: '^2.0.0', to: '^3.2.4', direct: true }]);
  });
});

describe('parseDependabotBody', () => {
  it('parses a single npm bump', () => {
    const body =
      'Bumps [firebase-admin](https://github.com/firebase/firebase-admin-node) from 13.10.0 to 13.11.0.\n<details>…</details>';
    expect(parseDependabotBody(body)).toEqual([{ name: 'firebase-admin', from: '13.10.0', to: '13.11.0', dir: '.' }]);
  });

  it('parses a grouped bump with directory and table', () => {
    const body = [
      'Bumps the functions-minor-patch group with 2 updates in the /functions directory: [firebase-functions](https://github.com/firebase/firebase-functions) and [typescript](https://github.com/microsoft/TypeScript).',
      '',
      'Updates `firebase-functions` from 7.2.5 to 7.3.0',
      '- [Release notes](https://github.com/firebase/firebase-functions/releases)',
      '',
      '| Package | From | To |',
      '| --- | --- | --- |',
      '| [typescript](https://github.com/microsoft/TypeScript) | `5.8.3` | `5.9.2` |',
    ].join('\n');
    expect(parseDependabotBody(body)).toEqual([
      { name: 'firebase-functions', from: '7.2.5', to: '7.3.0', dir: 'functions' },
      { name: 'typescript', from: '5.8.3', to: '5.9.2', dir: 'functions' },
    ]);
  });

  it('parses GitHub Actions bumps and scoped packages', () => {
    expect(parseDependabotBody('Bumps [actions/checkout](https://github.com/actions/checkout) from 4 to 5.')).toEqual([
      { name: 'actions/checkout', from: '4', to: '5', dir: '.' },
    ]);
    expect(
      parseDependabotBody('Bumps [@modelcontextprotocol/sdk](https://github.com/x/y) from 1.0.0 to v1.2.0-beta.1. Details'),
    ).toEqual([{ name: '@modelcontextprotocol/sdk', from: '1.0.0', to: '1.2.0-beta.1', dir: '.' }]);
  });

  it('returns [] for empty or unrelated bodies', () => {
    expect(parseDependabotBody('')).toEqual([]);
    expect(parseDependabotBody('Fixes a typo in README')).toEqual([]);
  });
});

describe('semver helpers', () => {
  it('compares and classifies versions', () => {
    expect(compareSemver('1.10.0', '1.9.9')).toBeGreaterThan(0);
    expect(compareSemver('2.0.0-beta.1', '2.0.0')).toBeLessThan(0);
    expect(compareSemver('v3.0.0', '3.0.0')).toBe(0);
    expect(bumpType('1.2.3', '2.0.0')).toBe('major');
    expect(bumpType('1.2.3', '1.3.0')).toBe('minor');
    expect(bumpType('1.2.3', '1.2.4')).toBe('patch');
  });
});

describe('groupChanges', () => {
  it('merges directories, sorts majors first and caps the list', () => {
    const { packages, omitted } = groupChanges(
      [
        { name: 'vitest', from: '3.2.4', to: '3.3.0', dir: '.' },
        { name: 'vitest', from: '2.1.0', to: '3.3.0', dir: 'tools/snap-pair-provisioner' },
        { name: 'zod', from: '3.23.0', to: '3.23.1', dir: 'tools/snap-pair-provisioner' },
        { name: 'actions/checkout', from: '4', to: '5', dir: '.' },
      ],
      2,
    );
    expect(omitted).toBe(1);
    expect(packages.map((p: { name: string }) => p.name)).toEqual(['actions/checkout', 'vitest']);
    expect(packages[0].ecosystem).toBe('github-actions');
    expect(packages[1]).toMatchObject({ from: '2.1.0', to: '3.3.0', bump: 'major', ecosystem: 'npm' });
    expect(packages[1].entries).toHaveLength(2);
  });

  it('detects ecosystems', () => {
    expect(ecosystemOf('@firebase/rules-unit-testing')).toBe('npm');
    expect(ecosystemOf('react')).toBe('npm');
    expect(ecosystemOf('github/codeql-action/init')).toBe('github-actions');
  });
});

describe('parseGitHubRepo', () => {
  it.each([
    ['git+https://github.com/vitest-dev/vitest.git', 'vitest-dev', 'vitest'],
    ['https://github.com/firebase/firebase-js-sdk', 'firebase', 'firebase-js-sdk'],
    ['git@github.com:colinhacks/zod.git', 'colinhacks', 'zod'],
    ['github:facebook/react', 'facebook', 'react'],
    ['facebook/react', 'facebook', 'react'],
    ['git+https://github.com/facebook/react.git#main', 'facebook', 'react'],
  ])('%s', (url, owner, repo) => {
    expect(parseGitHubRepo({ type: 'git', url })).toEqual({ owner, repo });
  });

  it('returns null for non-GitHub or missing repositories', () => {
    expect(parseGitHubRepo({ url: 'https://gitlab.com/a/b.git' })).toBeNull();
    expect(parseGitHubRepo(undefined)).toBeNull();
  });
});

describe('selectReleasesBetween', () => {
  const releases = [
    { tag_name: 'v3.3.0', body: 'c' },
    { tag_name: 'v3.2.5', body: 'b' },
    { tag_name: 'v3.2.4', body: 'a' },
    { tag_name: 'v3.4.0-beta.0', body: 'pre', prerelease: true },
    { tag_name: 'v3.3.1', body: 'draft', draft: true },
  ];

  it('keeps releases in (from, to], newest first', () => {
    expect(selectReleasesBetween(releases, '3.2.4', '3.3.0').map((r: { tag_name: string }) => r.tag_name)).toEqual([
      'v3.3.0',
      'v3.2.5',
    ]);
  });

  it('prefers monorepo tags that name the package', () => {
    const mono = [
      { tag_name: '@firebase/auth@1.2.0' },
      { tag_name: 'firebase@12.1.0' },
      { tag_name: 'firebase@12.0.0' },
    ];
    expect(selectReleasesBetween(mono, '12.0.0', '12.1.0', 'firebase').map((r: { tag_name: string }) => r.tag_name)).toEqual([
      'firebase@12.1.0',
    ]);
  });
});

describe('sliceChangelog', () => {
  const changelog = ['# Changelog', '', '## 2.1.0', '- new thing', '', '## 2.0.0', '- breaking', '', '## 1.9.0', '- old'].join(
    '\n',
  );

  it('returns sections between to (inclusive) and from (exclusive)', () => {
    expect(sliceChangelog(changelog, '1.9.0', '2.1.0')).toBe('## 2.1.0\n- new thing\n\n## 2.0.0\n- breaking');
  });

  it('returns empty string when versions are not found', () => {
    expect(sliceChangelog('no versions here', '1.0.0', '2.0.0')).toBe('');
  });
});

describe('usage helpers', () => {
  it('builds an ERE matching import/require (with subpaths) and escapes dots', () => {
    const re = new RegExp(usagePattern('socket.io').replace('[[:space:]]', '\\s'));
    expect(re.test("import { io } from 'socket.io';")).toBe(true);
    expect(re.test("const x = require('socket.io/client')")).toBe(true);
    expect(re.test("await import('socket.io')")).toBe(true);
    expect(re.test("import 'socketXio'")).toBe(false);
    expect(re.test("from 'socket.io-client'")).toBe(false);
  });

  it('maps @types packages to their runtime package', () => {
    expect(runtimeNameFor('@types/react')).toBe('react');
    expect(runtimeNameFor('@types/babel__core')).toBe('@babel/core');
    expect(runtimeNameFor('firebase')).toBe('firebase');
  });
});

describe('buildPrompt', () => {
  it('includes versions, release notes, usages and the verdict vocabulary', () => {
    const { packages } = groupChanges([{ name: 'firebase', from: '12.0.0', to: '12.1.0', dir: '.' }]);
    const prompt = buildPrompt({
      mode: 'pr',
      packages,
      contexts: new Map([
        ['firebase', { notes: '### v12.1.0\n- fix', notesSource: 'GitHub releases', usages: ['src/a.ts:1:import x from "firebase/app"'] }],
      ]),
    });
    expect(prompt).toContain('## firebase (npm) 12.0.0 -> 12.1.0 [minor]');
    expect(prompt).toContain('### v12.1.0');
    expect(prompt).toContain('src/a.ts:1:');
    expect(prompt).toMatch(/Not affected.*Possibly affected.*Affected/);
    expect(prompt).toContain('untrusted');
  });

  it('marks packages without usages', () => {
    const { packages } = groupChanges([{ name: 'typescript', from: '5.8.0', to: '5.9.0', dir: '.' }]);
    expect(buildPrompt({ mode: 'cron', packages, contexts: new Map() })).toContain('(no import/require found)');
  });
});

describe('findMarkerComment / findReportIssue', () => {
  it('finds the bot comment by hidden marker', () => {
    const comments = [
      { id: 1, body: 'LGTM' },
      { id: 2, body: `${MARKER}\n## report` },
      { id: 3, body: null },
    ];
    expect(findMarkerComment(comments)?.id).toBe(2);
    expect(findMarkerComment([{ id: 1, body: 'nope' }])).toBeNull();
  });

  it('finds the open report issue, skipping PRs and lookalikes', () => {
    const issues = [
      { number: 1, title: 'AI dependency update report', body: 'no marker' },
      { number: 2, title: 'AI dependency update report', body: MARKER, pull_request: {} },
      { number: 3, title: 'AI dependency update report', body: `${MARKER} x` },
    ];
    expect(findReportIssue(issues)?.number).toBe(3);
  });
});

describe('extractGeminiText', () => {
  it('joins text parts and skips thoughts', () => {
    const res = { candidates: [{ content: { parts: [{ text: 'thinking', thought: true }, { text: 'A' }, { text: 'B' }] } }] };
    expect(extractGeminiText(res)).toBe('AB');
    expect(extractGeminiText({})).toBe('');
  });
});

describe('composeReport', () => {
  it('renders marker, table, note, disclaimer and model footer', () => {
    const { packages } = groupChanges([{ name: 'zod', from: '3.23.0', to: '3.24.0', dir: 'tools/snap-pair-provisioner' }]);
    const body = composeReport({
      mode: 'pr',
      packages,
      note: 'Skipped AI analysis: `GEMINI_API_KEY` is not set.',
      model: 'gemini-3.5-flash',
      timestamp: '2026-10-04T00:00:00.000Z',
    });
    expect(body.startsWith(MARKER)).toBe(true);
    expect(body).toContain('| `zod` | `/tools/snap-pair-provisioner` | 3.23.0 | 3.24.0 | minor |');
    expect(body).toContain('Skipped AI analysis');
    expect(body).toContain('model `gemini-3.5-flash`');
    expect(body).toContain('2026-10-04T00:00:00.000Z');
    expect(body).not.toMatch(/AI-generated/);
  });

  it('adds the AI disclaimer when AI output is present', () => {
    const { packages } = groupChanges([{ name: 'zod', from: null, to: '3.24.0', dir: '.' }]);
    expect(packages[0].bump).toBe('added');
    const body = composeReport({ mode: 'pr', packages, aiMarkdown: '### zod\nNot affected', model: 'm', timestamp: 't' });
    expect(body).toContain('### zod');
    expect(body).toContain('⚠️ AI-generated by `m` on t');
  });

  it('handles the empty case', () => {
    expect(composeReport({ mode: 'cron', packages: [], model: 'm', timestamp: 't' })).toContain('up to date');
  });
});

describe('parseCliArgs', () => {
  it('reads flags and env with defaults', () => {
    const cfg = parseCliArgs(['--dry-run', '--mode', 'pr', '--base', 'abc'], { HEAD_SHA: 'def', GEMINI_MODEL: '' });
    expect(cfg).toMatchObject({ dryRun: true, mode: 'pr', base: 'abc', head: 'def', model: 'gemini-3.5-flash', apiKey: '' });
    expect(parseCliArgs([], { DRY_RUN: '1', AI_HELPER_MODE: 'cron' })).toMatchObject({ dryRun: true, mode: 'cron' });
  });
});
