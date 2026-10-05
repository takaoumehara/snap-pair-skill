import en from './locales/en.json';
import ja from './locales/ja.json';

/**
 * Minimal i18n for the CLI and the React components: two JSON dictionaries,
 * dot-path lookups, `{name}` interpolation, and English fallback. No runtime
 * dependency and nothing touches browser globals at import time (SSR-safe).
 */

export const SUPPORTED_LOCALES = ['en', 'ja'] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'en';

export type Messages = typeof en;

const dictionaries: Record<Locale, Messages> = { en, ja: ja as Messages };

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

/**
 * Maps a BCP 47 tag or POSIX locale (`ja-JP`, `ja_JP.UTF-8`, `en-US`) to a
 * supported locale, or `undefined` when unsupported. `C`/`POSIX` count as unset.
 */
export function resolveLocale(tag: string | null | undefined): Locale | undefined {
  if (!tag) return undefined;
  const base = String(tag).trim().split(/[-_.@]/)[0].toLowerCase();
  return isLocale(base) ? base : undefined;
}

export interface DetectLocaleSources {
  /** Environment variables (Node). Default: `process.env` when available. */
  env?: Record<string, string | undefined>;
  /** Browser language list. Default: `navigator.languages` / `navigator.language`. */
  languages?: readonly string[];
  /** Fallback tag. Default: `Intl.DateTimeFormat().resolvedOptions().locale`. */
  intlLocale?: string;
}

const readEnv = (): Record<string, string | undefined> | undefined => {
  const proc = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
  return proc?.env;
};

const readNavigatorLanguages = (): string[] => {
  const nav = (globalThis as { navigator?: { languages?: readonly string[]; language?: string } }).navigator;
  if (!nav) return [];
  if (nav.languages && nav.languages.length > 0) return [...nav.languages];
  return nav.language ? [nav.language] : [];
};

const readIntlLocale = (): string | undefined => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().locale;
  } catch {
    return undefined;
  }
};

/**
 * Best supported locale for the current environment, falling back to `en`.
 *
 * - Browser (a `window` exists): `navigator.languages`, then `Intl`.
 * - Node: `LC_ALL`, `LC_MESSAGES`, `LANG` (POSIX precedence), then `Intl`,
 *   then `navigator.language` (Node 21+).
 *
 * Pass `sources` to override any input (tests, SSR with an Accept-Language header).
 */
export function detectLocale(sources: DetectLocaleSources = {}): Locale {
  const isBrowser = typeof (globalThis as { window?: unknown }).window !== 'undefined';
  const languages = sources.languages ?? readNavigatorLanguages();
  const intl = sources.intlLocale ?? readIntlLocale();
  const candidates: Array<string | undefined> = [];

  if (isBrowser || (sources.languages && !sources.env)) {
    candidates.push(...languages, intl);
  } else {
    const env = sources.env ?? readEnv() ?? {};
    // LC_ALL overrides everything; an explicit C/POSIX value means "no preference" and falls through.
    candidates.push(env.LC_ALL, env.LC_MESSAGES, env.LANG, intl, ...languages);
  }

  for (const candidate of candidates) {
    const locale = resolveLocale(candidate);
    if (locale) return locale;
  }
  return DEFAULT_LOCALE;
}

/** The full dictionary for `locale` (English for unknown locales). */
export function getMessages(locale: Locale | string = DEFAULT_LOCALE): Messages {
  return dictionaries[resolveLocale(locale) ?? DEFAULT_LOCALE];
}

const lookup = (dictionary: unknown, key: string): unknown =>
  key.split('.').reduce<unknown>(
    (node, part) => (node && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined),
    dictionary,
  );

export type TranslateParams = Record<string, string | number>;

const interpolate = (template: string, params?: TranslateParams): string =>
  params ? template.replace(/\{(\w+)\}/g, (match, name: string) => (name in params ? String(params[name]) : match)) : template;

/**
 * Translates a dot-path key (`'hud.scanToJoin'`), interpolating `{name}`
 * placeholders. Missing keys fall back to English, then to the key itself.
 */
export function t(key: string, params?: TranslateParams, locale: Locale | string = DEFAULT_LOCALE): string {
  const resolved = resolveLocale(locale) ?? DEFAULT_LOCALE;
  let value = lookup(dictionaries[resolved], key);
  if (typeof value !== 'string' && resolved !== DEFAULT_LOCALE) value = lookup(dictionaries[DEFAULT_LOCALE], key);
  return typeof value === 'string' ? interpolate(value, params) : key;
}

/** Like `t`, for keys whose value is a list of strings (e.g. pros/cons). */
export function tList(key: string, locale: Locale | string = DEFAULT_LOCALE): string[] {
  const resolved = resolveLocale(locale) ?? DEFAULT_LOCALE;
  let value = lookup(dictionaries[resolved], key);
  if (!Array.isArray(value) && resolved !== DEFAULT_LOCALE) value = lookup(dictionaries[DEFAULT_LOCALE], key);
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

export interface Translator {
  readonly locale: Locale;
  t(key: string, params?: TranslateParams): string;
  tList(key: string): string[];
}

/** Binds `t`/`tList` to one locale. */
export function createTranslator(locale: Locale | string = DEFAULT_LOCALE): Translator {
  const resolved = resolveLocale(locale) ?? DEFAULT_LOCALE;
  return {
    locale: resolved,
    t: (key, params) => t(key, params, resolved),
    tList: (key) => tList(key, resolved),
  };
}
