import { ITEMS, METALS, type ItemDefId, type MetalId } from '../data/items';
import { recipeFor, type Recipe } from '../data/recipes';
import { RESOURCES, SMELTING, type ResourceId } from '../data/resources';
import type { StatId } from '../data/skills';
import { addRes } from './character';
import { clamp, randInt, type Rng } from './rng';
import { isPowerHour, trySkillGain, tryStatGain } from './skills';
import { nextUid, type Character, type GameState, type ItemInstance } from './state';

/* ---------------- shared ---------------- */

/** Attempt chance once skill ≥ min: 10% at min rising to 95% at max (UO-like linear). */
export function craftChance(skill: number, min: number, max: number): number {
  if (skill < min) return 0;
  return 0.1 + 0.85 * clamp((skill - min) / (max - min || 1), 0, 1);
}

export function findTool(c: Character, def: ItemDefId): ItemInstance | null {
  return c.pack.items.filter((i) => i.def === def).sort((a, b) => a.dur - b.dur)[0] ?? null;
}

/** Wears a tool by 1. Returns true when it broke (and removes it). */
export function wear(c: Character, it: ItemInstance, by = 1): boolean {
  it.dur -= by;
  if (it.dur > 0) return false;
  c.pack.items = c.pack.items.filter((i) => i !== it);
  if (c.tool === it.uid) c.tool = null;
  return true;
}

export interface Outcome {
  ok: boolean;
  gain: number;
  stat: StatId | null;
  toolBroke: ItemDefId | null;
}

/* ---------------- smelting ---------------- */

export function smeltChance(c: Character, ore: ResourceId): number {
  const sm = SMELTING[ore];
  if (!sm) return 0;
  const skill = c.skills.mining / 10;
  if (skill < sm.min) return 0;
  return 0.45 + 0.5 * clamp((skill - sm.min) / (sm.max - sm.min), 0, 1);
}

/** Smelts 2 ore into 1 bar at the town forge. A failure wastes 1 ore. */
export function smelt(c: Character, ore: ResourceId, rng: Rng, now = new Date()): Outcome & { bar: ResourceId } {
  const sm = SMELTING[ore]!;
  const p = smeltChance(c, ore);
  const ok = rng() < p;
  if (ok) {
    addRes(c.pack, ore, -2);
    addRes(c.pack, sm.bar, 1);
  } else {
    addRes(c.pack, ore, -1);
  }
  const gain = trySkillGain(c, 'mining', p, ok, rng, { rarity: RESOURCES[ore].rarity, tooEasyAt: sm.max, mult: (isPowerHour(now) ? 1.5 : 1) * 0.6 });
  return { ok, gain, stat: tryStatGain(c, 'mining', rng), toolBroke: null, bar: sm.bar };
}

/* ---------------- crafting ---------------- */

export function recipeRange(r: Recipe, metal: MetalId | null): [number, number] {
  const off = metal ? METALS[metal].offset : 0;
  return [r.min + off, r.max + off];
}

/** Everything the recipe consumes, with the chosen metal's bars resolved. */
export function recipeInputs(r: Recipe, metal: MetalId | null): [ResourceId, number][] {
  const out: [ResourceId, number][] = [];
  if (r.bars && metal) out.push([METALS[metal].bar, r.bars]);
  for (const [id, n] of Object.entries(r.inputs ?? {}) as [ResourceId, number][]) out.push([id, n]);
  return out;
}

export type CraftBlock = 'noTool' | 'noSkill' | 'noMaterials';

export function canCraft(c: Character, r: Recipe, metal: MetalId | null): CraftBlock | null {
  if (!findTool(c, r.tool)) return 'noTool';
  if (c.skills[r.skill] / 10 < recipeRange(r, metal)[0]) return 'noSkill';
  if (recipeInputs(r, metal).some(([id, n]) => (c.pack.res[id] ?? 0) < n)) return 'noMaterials';
  return null;
}

/** Exceptional chance grows with skill above the minimum and with INT. */
export function exceptionalChance(c: Character, r: Recipe, metal: MetalId | null): number {
  if (!('item' in r.out)) return 0;
  const [min, max] = recipeRange(r, metal);
  const k = clamp((c.skills[r.skill] / 10 - min) / (max - min), 0, 1.5);
  return clamp(0.5 * (k - 0.35) + (c.stats.int - 30) / 400, 0, 0.6);
}

export function makeCrafted(s: GameState, def: ItemDefId, metal: MetalId | null, exceptional: boolean): ItemInstance {
  const d = ITEMS[def];
  const mult = (d.metal && metal ? METALS[metal].durMult : 1) * (exceptional ? 1.25 : 1);
  const maxDur = Math.round(d.maxDur * mult);
  return { uid: nextUid(s), def, dur: maxDur, maxDur, quality: exceptional ? 'exceptional' : 'normal', mat: d.metal ? metal ?? 'iron' : undefined };
}

export interface CraftResult extends Outcome {
  item: ItemInstance | null;
  res: { id: ResourceId; n: number } | null;
  lost: [ResourceId, number][];
}

/** One crafting attempt. Caller checks canCraft first. A failure loses about half the materials. */
export function craft(s: GameState, c: Character, r: Recipe, metal: MetalId | null, rng: Rng, now = new Date()): CraftResult {
  const [min, max] = recipeRange(r, metal);
  const skill = c.skills[r.skill] / 10;
  const p = craftChance(skill, min, max);
  const ok = rng() < p;
  const inputs = recipeInputs(r, metal);
  const lost: [ResourceId, number][] = [];
  let item: ItemInstance | null = null;
  let res: CraftResult['res'] = null;

  if (ok) {
    for (const [id, n] of inputs) addRes(c.pack, id, -n);
    if ('item' in r.out) {
      item = makeCrafted(s, r.out.item, metal, rng() < exceptionalChance(c, r, metal));
      c.pack.items.push(item);
    } else {
      addRes(c.pack, r.out.res, r.out.n);
      res = { id: r.out.res, n: r.out.n };
    }
  } else {
    for (const [id, n] of inputs) {
      const k = Math.max(1, Math.floor(n * (0.3 + rng() * 0.3)));
      addRes(c.pack, id, -k);
      lost.push([id, k]);
    }
  }

  const rarity = (metal ? METALS[metal].rarity : 0) + (item?.quality === 'exceptional' ? 0.5 : 0);
  const gain = trySkillGain(c, r.skill, p, ok, rng, { rarity, tooEasyAt: max, mult: isPowerHour(now) ? 1.5 : 1 });
  const stat = tryStatGain(c, r.skill, rng);
  const tool = findTool(c, r.tool)!;
  const toolBroke = wear(c, tool) ? tool.def : null;
  return { ok, gain, stat, toolBroke, item, res, lost };
}

/* ---------------- player repair (design 4b) ---------------- */

export function repairInfo(c: Character, it: ItemInstance): { skill: Recipe['skill']; tool: ItemDefId; p: number } | null {
  const r = recipeFor(it.def);
  if (!r) return null;
  const [min, max] = recipeRange(r, it.mat ?? null);
  // Repairing is easier than making: the range starts 10 points lower.
  const p = clamp(craftChance(c.skills[r.skill] / 10, min - 10, max - 10) + 0.1, 0, 0.98);
  return { skill: r.skill, tool: r.tool, p };
}

export interface RepairResult extends Outcome {
  lostMax: number;
}

/** Restores durability; every repair lowers max by 1–5 (less with skill), more on failure. */
export function repair(c: Character, it: ItemInstance, rng: Rng, now = new Date()): RepairResult {
  const info = repairInfo(c, it)!;
  const skill = c.skills[info.skill] / 10;
  const ok = rng() < info.p;
  const lostMax = ok ? randInt(rng, 1, Math.max(1, 5 - Math.floor(skill / 25))) : randInt(rng, 3, 6);
  it.maxDur = Math.max(0, it.maxDur - lostMax);
  if (ok) it.dur = it.maxDur;
  if (it.maxDur <= 0) c.pack.items = c.pack.items.filter((i) => i !== it);
  const gain = trySkillGain(c, info.skill, info.p, ok, rng, { mult: 0.3 * (isPowerHour(now) ? 1.5 : 1) });
  const tool = findTool(c, info.tool)!;
  const toolBroke = wear(c, tool) ? tool.def : null;
  return { ok, gain, stat: null, toolBroke, lostMax };
}

/* ---------------- value ---------------- */

/** What an item is worth to a buyer: base × metal × quality × condition. */
export function itemValue(it: ItemInstance): number {
  const d = ITEMS[it.def];
  const metal = it.mat ? METALS[it.mat].priceMult : 1;
  const q = it.quality === 'exceptional' ? 2.5 : 1;
  const cond = 0.5 + 0.5 * (it.maxDur > 0 ? it.dur / it.maxDur : 0);
  return Math.max(1, Math.round(d.price * metal * q * cond));
}
