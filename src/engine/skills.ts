import { ITEMS } from '../data/items';
import { PROFESSIONS, skillCap } from '../data/professions';
import { SKILLS, SKILL_IDS, TOTAL_SKILL_CAP, TOTAL_STAT_CAP, type SkillId, type StatId } from '../data/skills';
import { chance, clamp, pickWeighted, type Rng } from './rng';
import type { Character } from './state';

/** Linear success chance between min and max skill (whole points), as in UO. */
export function successChance(skill: number, min: number, max: number): number {
  if (max <= min) return skill >= min ? 1 : 0;
  return clamp((skill - min) / (max - min), 0, 1);
}

export interface GainOpts {
  /** 0 common .. 3 plan; multiplies gain chance by (1 + rarity * 0.5). */
  rarity?: number;
  /** Extra multiplier, e.g. powerhour 1.5 or repairs 0.3. */
  mult?: number;
  /** Skill (whole points) at or above which the task is "too easy" and gives no gain. */
  tooEasyAt?: number;
}

/**
 * Chance that one attempt raises the skill (design section 4).
 * Highest at low skill and when the success chance is near 50%.
 */
export function gainChance(skill: number, p: number, success: boolean, opts: GainOpts = {}): number {
  if (opts.tooEasyAt !== undefined && skill >= opts.tooEasyAt) return 0;
  const headroom = clamp((100 - skill) / 100, 0, 1);
  const challenge = 1 - Math.abs(p - 0.5) * 1.2;
  const rare = 1 + (opts.rarity ?? 0) * 0.5;
  return clamp(0.75 * Math.pow(headroom, 1.6) * challenge * rare * (success ? 1 : 0.5) * (opts.mult ?? 1), 0, 1);
}

/** Gain size in tenths: below 10 skill it can be 0.1–0.3, then mostly 0.1. */
export function gainAmount(skill: number, rng: Rng): number {
  if (skill < 10) {
    const r = rng();
    return r < 0.5 ? 1 : r < 0.85 ? 2 : 3;
  }
  if (skill < 50) return rng() < 0.1 ? 2 : 1;
  return 1;
}

export function totalSkills(c: Character): number {
  return SKILL_IDS.reduce((s, id) => s + c.skills[id], 0);
}

/**
 * Rolls a skill gain for one attempt and applies it, respecting the profession cap,
 * the skill lock and the 700 total cap (lowering a skill marked "down" to make room).
 * Returns the gain in tenths (0 when nothing happened).
 */
export function trySkillGain(c: Character, id: SkillId, p: number, success: boolean, rng: Rng, opts: GainOpts = {}): number {
  if (c.locks[id] !== 'up') return 0;
  const cur = c.skills[id];
  const cap = skillCap(c.profession, id);
  if (cur >= cap) return 0;
  if (!chance(rng, gainChance(cur / 10, p, success, opts))) return 0;
  let amount = Math.min(gainAmount(cur / 10, rng), cap - cur);
  const over = totalSkills(c) + amount - TOTAL_SKILL_CAP;
  if (over > 0) {
    const donor = SKILL_IDS.find((s) => s !== id && c.locks[s] === 'down' && c.skills[s] >= over);
    if (!donor) return 0;
    c.skills[donor] -= over;
  }
  c.skills[id] = cur + amount;
  return amount;
}

export function totalStats(c: Character): number {
  return c.stats.str + c.stats.dex + c.stats.int;
}

/** Small chance per skill use to raise a stat tied to that skill. Returns the stat raised, or null. */
export function tryStatGain(c: Character, id: SkillId, rng: Rng): StatId | null {
  const caps = PROFESSIONS[c.profession].statCaps;
  const total = totalStats(c);
  if (total >= TOTAL_STAT_CAP) return null;
  const base = 0.05 * (1 - total / TOTAL_STAT_CAP) + 0.01;
  if (!chance(rng, base)) return null;
  const options = (Object.entries(SKILLS[id].stats) as [StatId, number][]).filter(([s]) => c.stats[s] < caps[s]);
  const stat = pickWeighted(rng, options);
  if (!stat) return null;
  c.stats[stat] += 1;
  return stat;
}

/** Powerhour (Andaria): Friday–Sunday, 18:00–22:00 local time. */
export function isPowerHour(d: Date = new Date()): boolean {
  const day = d.getDay();
  const h = d.getHours();
  return (day === 5 || day === 6 || day === 0) && h >= 18 && h < 22;
}

/** 40 + 3.5 × STR (UO), plus the best bag carried. */
export function maxWeight(c: Character): number {
  const bag = Math.max(0, ...c.pack.items.map((i) => ITEMS[i.def].bagBonus ?? 0));
  return 40 + 3.5 * c.stats.str + bag;
}

export function maxHp(c: Character): number {
  return 50 + c.stats.str;
}

export function maxStamina(c: Character): number {
  return c.stats.dex;
}
