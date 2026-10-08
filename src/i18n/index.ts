import { cs } from './cs';
import { en } from './en';

export type Lang = 'en' | 'cs';
export type Params = Record<string, string | number>;

const DICTS: Record<Lang, Record<string, string>> = { en, cs };
let lang: Lang = 'en';

export function setLang(l: Lang): void {
  lang = l;
  document.documentElement.lang = l;
}

export function getLang(): Lang {
  return lang;
}

export function detectLang(): Lang {
  const nav = (typeof navigator !== 'undefined' && navigator.language) || 'en';
  return nav.toLowerCase().startsWith('cs') || nav.toLowerCase().startsWith('sk') ? 'cs' : 'en';
}

/** Formats a number for the current language (Czech uses a decimal comma). */
export function num(v: number, decimals = 0): string {
  return v.toLocaleString(lang === 'cs' ? 'cs-CZ' : 'en-GB', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

/** Skill value stored as tenths → "18.4" / "18,4". */
export const skillNum = (tenths: number) => num(tenths / 10, 1);

function resolve(v: string | number): string {
  if (typeof v === 'number') return num(v);
  if (v.startsWith('@')) return t(v.slice(1));
  if (v.startsWith('#')) return num(Number(v.slice(1)), 1);
  return v;
}

export function t(key: string, params?: Params): string {
  const dict = DICTS[lang];
  let msg: string | undefined;
  if (params && typeof params.count === 'number') {
    const cat = new Intl.PluralRules(lang).select(params.count);
    msg = dict[`${key}_${cat}`] ?? dict[`${key}_other`];
  }
  msg ??= dict[key] ?? en[key as keyof typeof en] ?? key;
  if (!params) return msg;
  return msg.replace(/\{(\w+)\}/g, (_, k: string) => (k in params ? resolve(params[k]) : `{${k}}`));
}
