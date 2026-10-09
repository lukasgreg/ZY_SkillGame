import { MONSTERS, type MonsterId } from '../data/dungeons';
import { PROFESSIONS, skillCap } from '../data/professions';
import type { SkillId, StatId } from '../data/skills';
import { maxHp, maxStamina } from './skills';
import type { Character } from './state';

/** Endor-style progression (docs/PLAN_V2.md, phase A). */
export const MAX_LEVEL = 50;
/** Skill caps stop rising at this level; later levels only raise stats. */
export const CAP_LEVEL = 30;

/** Experience needed to go from `level` to `level + 1`. */
export function xpToNext(level: number): number {
  return level >= MAX_LEVEL ? Infinity : Math.round(300 * Math.pow(1.15, level - 1));
}

/** Share of the profession's skill cap available at a level: 50% at level 1, 100% from level 30. */
export function capFactor(level: number): number {
  return Math.min(1, 0.5 + (0.5 * (level - 1)) / (CAP_LEVEL - 1));
}

/** The skill cap that applies right now, in tenths. */
export function effectiveCap(c: Character, id: SkillId): number {
  return Math.floor(skillCap(c.profession, id) * capFactor(c.level));
}

/** Stats at a level: from the rolled starting stats up to the profession caps at level 50. */
export function statsAt(c: Character, level: number): Record<StatId, number> {
  const caps = PROFESSIONS[c.profession].statCaps;
  const k = (level - 1) / (MAX_LEVEL - 1);
  const out = {} as Record<StatId, number>;
  for (const s of ['str', 'dex', 'int'] as StatId[]) {
    const base = c.statBase[s];
    out[s] = Math.round(base + Math.max(0, caps[s] - base) * k);
  }
  return out;
}

/** Adds experience and applies any level-ups (stats rise, hits and stamina refill). Returns levels gained. */
export function gainXp(c: Character, amount: number): number {
  if (amount < 0 || c.level >= MAX_LEVEL) return 0;
  c.xp += amount;
  let gained = 0;
  while (c.level < MAX_LEVEL && c.xp >= xpToNext(c.level)) {
    c.xp -= xpToNext(c.level);
    c.level += 1;
    gained += 1;
  }
  if (c.level >= MAX_LEVEL) c.xp = 0;
  if (gained) {
    const st = statsAt(c, c.level);
    for (const s of ['str', 'dex', 'int'] as StatId[]) c.stats[s] = Math.max(c.stats[s], st[s]);
    c.hp = maxHp(c);
    c.stamina = maxStamina(c);
  }
  return gained;
}

/* ---------------- experience sources ---------------- */

export function killXp(kind: MonsterId): number {
  const m = MONSTERS[kind];
  return Math.round((m.hp * (m.skill + 10)) / 40);
}

/** Contracts are the craftsman's main road to levels (Endor's bulk orders). */
export const contractXp = (gold: number) => Math.round(gold * 1.5);
export const GATHER_XP = 1;
export const craftXp = (recipeMin: number) => Math.max(0.5, recipeMin / 20);
