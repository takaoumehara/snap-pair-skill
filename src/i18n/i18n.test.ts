import { describe, expect, it } from 'vitest';
import { defaultHostHUDLabels, getHostHUDLabels } from '../components/HostHUD';
import {
  createTranslator,
  detectLocale,
  getMessages,
  isLocale,
  resolveLocale,
  SUPPORTED_LOCALES,
  t,
  tList,
} from './index';
import en from './locales/en.json';
import ja from './locales/ja.json';

/** Every leaf path of a JSON object, with arrays treated as leaves. */
function leafPaths(value: unknown, prefix = ''): string[] {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return Object.entries(value).flatMap(([key, child]) => leafPaths(child, prefix ? `${prefix}.${key}` : key));
  }
  return [prefix];
}

describe('locale dictionaries', () => {
  it('ja has exactly the same keys as en', () => {
    expect(leafPaths(ja).sort()).toEqual(leafPaths(en).sort());
  });

  it('keeps placeholders identical across locales', () => {
    const placeholders = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort();
    for (const path of leafPaths(en)) {
      const enValue = t(path, undefined, 'en');
      if (enValue === path) continue; // arrays
      expect(placeholders(t(path, undefined, 'ja')), path).toEqual(placeholders(enValue));
    }
  });

  it('the English HUD dictionary matches defaultHostHUDLabels', () => {
    expect(getHostHUDLabels('en')).toEqual(defaultHostHUDLabels);
    expect(getHostHUDLabels('ja').status.connected).toBe('オンライン');
  });
});

describe('t / tList', () => {
  it('looks up dot paths and interpolates', () => {
    expect(t('hud.scanToJoin')).toBe('Scan to join');
    expect(t('hud.scanToJoin', undefined, 'ja')).toBe('スキャンして参加');
    expect(t('cli.written', { file: 'a.json' })).toBe('Wrote a.json');
    expect(t('cli.choose', { max: 4 }, 'ja')).toBe('1〜4 を選択');
  });

  it('leaves unknown placeholders and falls back to the key', () => {
    expect(t('cli.written')).toBe('Wrote {file}');
    expect(t('does.not.exist')).toBe('does.not.exist');
    expect(t('hud')).toBe('hud'); // not a string leaf
  });

  it('falls back to English for unknown locales', () => {
    expect(t('hud.pin', undefined, 'fr')).toBe('PIN');
    expect(tList('transports.webrtc.pros', 'de')).toEqual(en.transports.webrtc.pros);
  });

  it('returns string lists', () => {
    expect(tList('transports.broadcast.cons', 'ja')).toHaveLength(2);
    expect(tList('hud.pin')).toEqual([]);
  });

  it('createTranslator binds a locale', () => {
    const tr = createTranslator('ja-JP');
    expect(tr.locale).toBe('ja');
    expect(tr.t('controller.reconnect')).toBe('再接続');
    expect(createTranslator('xx').locale).toBe('en');
    expect(getMessages('ja').hud.pin).toBe('PIN');
  });
});

describe('detectLocale', () => {
  it('resolves BCP 47 and POSIX tags', () => {
    expect(resolveLocale('ja_JP.UTF-8')).toBe('ja');
    expect(resolveLocale('en-US')).toBe('en');
    expect(resolveLocale('C')).toBeUndefined();
    expect(resolveLocale('')).toBeUndefined();
    expect(isLocale('ja')).toBe(true);
    expect(isLocale('fr')).toBe(false);
    expect(SUPPORTED_LOCALES).toEqual(['en', 'ja']);
  });

  it('uses LC_ALL > LC_MESSAGES > LANG in Node', () => {
    expect(detectLocale({ env: { LANG: 'ja_JP.UTF-8' }, intlLocale: 'en-US' })).toBe('ja');
    expect(detectLocale({ env: { LC_ALL: 'en_US.UTF-8', LANG: 'ja_JP.UTF-8' } })).toBe('en');
    expect(detectLocale({ env: { LC_MESSAGES: 'ja_JP', LANG: 'en_US' } })).toBe('ja');
  });

  it('skips C/POSIX and unsupported values, then uses Intl', () => {
    expect(detectLocale({ env: { LC_ALL: 'C', LANG: 'fr_FR' }, intlLocale: 'ja-JP', languages: [] })).toBe('ja');
    expect(detectLocale({ env: {}, intlLocale: 'fr-FR', languages: [] })).toBe('en');
  });

  it('uses the browser language list when given', () => {
    expect(detectLocale({ languages: ['fr-FR', 'ja'], intlLocale: 'en-US' })).toBe('ja');
    expect(detectLocale({ languages: ['de'], intlLocale: 'de-DE' })).toBe('en');
  });

  it('works with no sources in Node', () => {
    expect(SUPPORTED_LOCALES).toContain(detectLocale());
  });
});
