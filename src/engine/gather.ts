import { ITEMS, durState } from '../data/items';
import { FRAGMENT_CHANCE } from '../data/plans';
import { AREAS, GATHER_LOCS, GATHER_SKILL, RESOURCES, YIELDS, type AreaId, type GatherLoc, type ResourceId } from '../data/resources';
import type { SkillId, StatId } from '../data/skills';
import { addRes, packWeight } from './character';
import { wear } from './craft';
import { clamp, pickWeighted, randInt, type Rng } from './rng';
import { isPowerHour, maxWeight, trySkillGain } from './skills';
import { GATHER_XP, gainXp } from './levels';
import type { Character, ItemInstance, Node } from './state';

export const STAMINA_PER_PULL = 2;

export function isGatherLoc(loc: string): loc is GatherLoc {
  return (GATHER_LOCS as readonly string[]).includes(loc);
}

/** The tool used for a gathering skill: the one held if it fits, else the most worn one in the pack. */
export function gatherTool(c: Character, skill: SkillId): ItemInstance | null {
  const fits = c.pack.items.filter((i) => ITEMS[i.def].toolFor === skill);
  return fits.find((i) => i.uid === c.tool) ?? fits.sort((a, b) => a.dur - b.dur)[0] ?? null;
}

/** A heavy pack tires you faster: over half full, each pull costs up to three times the stamina. */
export function pullStamina(c: Character): number {
  const load = packWeight(c.pack) / maxWeight(c);
  return Math.round(STAMINA_PER_PULL * (1 + 2 * Math.max(0, load - 0.5)) * 10) / 10;
}

/** Why gathering can't start right now, or null if it can. */
export type GatherBlock = 'notThere' | 'noTool' | 'tired' | 'overweight' | 'noNode' | 'nodeEmpty';

export function canGather(c: Character): GatherBlock | null {
  if (!isGatherLoc(c.location)) return 'notThere';
  if (!gatherTool(c, GATHER_SKILL[c.location])) return 'noTool';
  if (c.stamina < pullStamina(c)) return 'tired';
  if (packWeight(c.pack) + 1 > maxWeight(c)) return 'overweight';
  if (!c.node) return 'noNode';
  if (c.node.left <= 0) return 'nodeEmpty';
  return null;
}

/** Progress from the minimum skill to the best-yield skill, 0..1. */
function progress(skill: number, res: ResourceId): number {
  const y = YIELDS[res]!;
  return clamp((skill - y.min) / (Math.min(y.best, 100) - y.min || 1), 0, 1);
}

/** Success chance for one pull: 30% at the minimum skill rising to 95% at the "best yield" skill. */
export function pullChance(skill: number, res: ResourceId): number {
  const y = YIELDS[res]!;
  if (skill < y.min) return 0;
  return 0.3 + 0.65 * progress(skill, res);
}

export function areaOf(loc: GatherLoc, id: AreaId) {
  return AREAS[loc].find((a) => a.id === id)!;
}

/** Picks a node (vein, tree, shoal, patch) among resources the skill allows. */
export function rollNode(loc: GatherLoc, id: AreaId, skillWhole: number, rng: Rng): Node | null {
  const options = areaOf(loc, id).nodes.filter(([res]) => skillWhole >= YIELDS[res]!.min);
  const res = pickWeighted(rng, options);
  return res ? { res, left: randInt(rng, 8, 18) } : null;
}

export function findNode(c: Character, rng: Rng): Node | null {
  if (!isGatherLoc(c.location)) return null;
  return rollNode(c.location, c.areas[c.location], c.skills[GATHER_SKILL[c.location]] / 10, rng);
}

/** `freed`: the Gnarl Warrens boss has fallen, so Gnarl-held areas are open. */
export function areaOpen(c: Character, loc: GatherLoc, id: AreaId, freed = false): boolean {
  const a = areaOf(loc, id);
  return (!a.gnarlHeld || freed) && c.skills[GATHER_SKILL[loc]] / 10 >= a.need;
}

/** Milliseconds for one swing or cast: 2–5 s, faster with DEX, slower with a failing or slow tool. */
export function swingTime(c: Character, rng: Rng): number {
  const tool = isGatherLoc(c.location) ? gatherTool(c, GATHER_SKILL[c.location]) : null;
  const speed = tool ? ITEMS[tool.def].speed * (durState(tool.dur, tool.maxDur) === 'failing' ? 1.25 : 1) : 1;
  return Math.round((2000 + rng() * 3000) * (1 - c.stats.dex / 400) * speed);
}

/** Amount from one successful pull at a given skill. */
export function pullAmount(skill: number, res: ResourceId, rng: Rng): number {
  const k = Math.max(0.2, progress(skill, res));
  return 1 + Math.floor(rng() * YIELDS[res]!.perPull * k);
}

export interface PullResult {
  ok: boolean;
  skill: SkillId;
  res: ResourceId;
  amount: number;
  gain: number;
  stat: StatId | null;
  tool: ItemInstance;
  toolBroke: boolean;
  toolWarn: boolean;
  nodeEmpty: boolean;
  /** Found a plan fragment (rare). */
  fragment: boolean;
}

/** Resolves one pull at the current node. Caller must check canGather first. */
export function pull(c: Character, rng: Rng, now: Date = new Date()): PullResult {
  const loc = c.location as GatherLoc;
  const skillId = GATHER_SKILL[loc];
  const node = c.node!;
  const y = YIELDS[node.res]!;
  const skill = c.skills[skillId] / 10;
  const p = pullChance(skill, node.res);
  const ok = rng() < p;
  let amount = 0;
  if (ok) {
    const room = Math.floor((maxWeight(c) - packWeight(c.pack)) / RESOURCES[node.res].weight);
    amount = Math.max(1, Math.min(pullAmount(skill, node.res, rng), room));
    addRes(c.pack, node.res, amount);
    node.left -= 1;
  }
  const fragment = ok && rng() < FRAGMENT_CHANCE;
  if (fragment) addRes(c.pack, 'planFragment', 1);
  c.stamina = Math.max(0, c.stamina - pullStamina(c));

  const gain = trySkillGain(c, skillId, p, ok, rng, {
    rarity: RESOURCES[node.res].rarity,
    tooEasyAt: Math.min(y.best, 100) + 15,
    mult: isPowerHour(now) ? 1.5 : 1,
  });
  const stat = null;
  if (ok) gainXp(c, GATHER_XP);

  // Tool wear (design 4b): every pull, success or fizzle, costs 1 durability.
  const tool = gatherTool(c, skillId)!;
  const toolBroke = wear(c, tool);
  const toolWarn = !toolBroke && tool.dur === Math.ceil(tool.maxDur * 0.1);

  return { ok, skill: skillId, res: node.res, amount, gain, stat, tool, toolBroke, toolWarn, nodeEmpty: node.left <= 0, fragment };
}
