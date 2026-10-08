import { ITEMS, durState } from '../data/items';
import { MINE_LEVELS, MINING_YIELDS, RESOURCES, type MineLevelId, type ResourceId } from '../data/resources';
import type { StatId } from '../data/skills';
import { addRes, packWeight, toolInHand } from './character';
import { clamp, pickWeighted, randInt, type Rng } from './rng';
import { isPowerHour, maxWeight, trySkillGain, tryStatGain } from './skills';
import type { Character, ItemInstance, Vein } from './state';

export const STAMINA_PER_PULL = 2;

/** Why mining can't start right now, or null if it can. */
export type MineBlock = 'notInMine' | 'noTool' | 'tired' | 'overweight' | 'noVein' | 'veinEmpty';

export function canMine(c: Character): MineBlock | null {
  if (c.location !== 'mine') return 'notInMine';
  if (!toolInHand(c)) return 'noTool';
  if (c.stamina < STAMINA_PER_PULL) return 'tired';
  if (packWeight(c.pack) + 1 > maxWeight(c)) return 'overweight';
  if (!c.vein) return 'noVein';
  if (c.vein.left <= 0) return 'veinEmpty';
  return null;
}

/** Skill (whole points) needed to work a resource. */
export function mineMin(res: ResourceId): number {
  return MINING_YIELDS[res].min;
}

/** Success chance for one pull: 30% at the minimum skill rising to 95% at the "best yield" skill. */
export function pullChance(skill: number, res: ResourceId): number {
  const y = MINING_YIELDS[res];
  if (skill < y.min) return 0;
  const k = clamp((skill - y.min) / (Math.min(y.best, 100) - y.min || 1), 0, 1);
  return 0.3 + 0.65 * k;
}

/** Finds a new vein on the character's level among resources the skill allows. */
export function findVein(c: Character, rng: Rng): Vein | null {
  const level = MINE_LEVELS.find((l) => l.id === c.mineLevel)!;
  const skill = c.skills.mining / 10;
  const options = level.veins.filter(([res]) => skill >= mineMin(res));
  const res = pickWeighted(rng, options);
  if (!res) return null;
  return { res, left: randInt(rng, 8, 18) };
}

export function levelUnlocked(c: Character, id: MineLevelId): boolean {
  const level = MINE_LEVELS.find((l) => l.id === id)!;
  return !level.gnarlHeld && c.skills.mining / 10 >= level.need;
}

/** Milliseconds for one swing: 2–5 s, faster with DEX, slower with a failing or slow tool. */
export function swingTime(c: Character, rng: Rng): number {
  const tool = toolInHand(c);
  const speed = tool ? ITEMS[tool.def].speed * (durState(tool.dur, tool.maxDur) === 'failing' ? 1.25 : 1) : 1;
  return Math.round((2000 + rng() * 3000) * (1 - c.stats.dex / 400) * speed);
}

export interface PullResult {
  ok: boolean;
  res: ResourceId;
  amount: number;
  gain: number;
  stat: StatId | null;
  toolBroke: ItemInstance | null;
  toolWarn: boolean;
  veinEmpty: boolean;
}

/** Resolves one pull at the current vein. Caller must check canMine first. */
export function pull(c: Character, rng: Rng, now: Date = new Date()): PullResult {
  const vein = c.vein!;
  const y = MINING_YIELDS[vein.res];
  const skill = c.skills.mining / 10;
  const p = pullChance(skill, vein.res);
  const ok = rng() < p;
  let amount = 0;
  if (ok) {
    const k = clamp((skill - y.min) / (Math.min(y.best, 100) - y.min || 1), 0.2, 1);
    amount = 1 + Math.floor(rng() * y.perPull * k);
    const room = Math.floor((maxWeight(c) - packWeight(c.pack)) / RESOURCES[vein.res].weight);
    amount = Math.max(1, Math.min(amount, room));
    addRes(c.pack, vein.res, amount);
    vein.left -= 1;
  }
  c.stamina = Math.max(0, c.stamina - STAMINA_PER_PULL);

  const gain = trySkillGain(c, 'mining', p, ok, rng, {
    rarity: RESOURCES[vein.res].rarity,
    tooEasyAt: Math.min(y.best, 100) + 15,
    mult: isPowerHour(now) ? 1.5 : 1,
  });
  const stat = tryStatGain(c, 'mining', rng);

  // Tool wear (design 4b): every pull, success or fizzle, costs 1 durability.
  const tool = toolInHand(c)!;
  tool.dur -= 1;
  let toolBroke: ItemInstance | null = null;
  if (tool.dur <= 0) {
    toolBroke = tool;
    c.pack.items = c.pack.items.filter((i) => i !== tool);
    c.tool = null;
  }
  const toolWarn = !toolBroke && tool.dur === Math.ceil(tool.maxDur * 0.1);

  return { ok, res: vein.res, amount, gain, stat, toolBroke, toolWarn, veinEmpty: vein.left <= 0 };
}
