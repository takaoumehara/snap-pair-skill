import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = dirname(fileURLToPath(import.meta.url));
const skill = readFileSync(resolve(root, 'SKILL.md'), 'utf8');

describe('snap-pair skill bundle', () => {
  it('ships a standalone One Room reference instead of requiring this repository', () => {
    const reference = 'references/one-room-one-decision.md';
    expect(skill).toContain(`[One Room, One Decision](${reference})`);
    expect(existsSync(resolve(root, reference))).toBe(true);
    expect(skill).not.toContain('Use `demo/` when');
  });

  it('lists every preset in the decision table and documents the CLI and config schema', async () => {
    const { PRESET_IDS } = await import('./src/presets');
    for (const id of PRESET_IDS) expect(skill).toContain(`| \`${id}\` |`);
    expect(skill).toContain('npx snap-pair init');
    expect(skill).toContain('snap-pair.config.json');
    expect(skill).toMatch(/no ephemeral messaging/);
  });

  it('documents both supported conflict-safe server update strategies', () => {
    expect(skill).toMatch(/Admin SDK `transaction\(\)`/);
    expect(skill).toMatch(/REST ETag compare-and-set/);
  });
});
