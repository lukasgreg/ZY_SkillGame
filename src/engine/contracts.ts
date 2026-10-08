import { ITEMS, METALS, METAL_IDS, type ItemDefId, type MetalId } from '../data/items';
import { FRAGMENTS_PER_PLAN, PLANS, PLAN_WEIGHTS, type PlanId } from '../data/plans';
import { RECIPES, type Recipe } from '../data/recipes';
import { RESOURCES, type ResourceId } from '../data/resources';
import type { SkillId } from '../data/skills';
import { addRes } from './character';
import { canCraft, craft, type CraftResult } from './craft';
import { chance, pickWeighted, randInt, type Rng } from './rng';
import type { Character, Contract, GameState, ItemInstance } from './state';

export const MAX_OFFERS = 3;
export const MAX_ACTIVE = 3;
const CONTRACT_TTL_MS = 24 * 3600_000;
const GIVERS = ['Captain Radim', 'Quartermaster Ulla', 'Sister Agáta', 'Merchant Ferko', 'Warden Hrdoš', 'Lady Svatava', 'Old Wenzel'];
const CRAFTS: SkillId[] = ['blacksmithing', 'tinkering', 'carpentry', 'bowcraft', 'cooking'];

function metalRank(m: MetalId | undefined | null): number {
  return METALS[m ?? 'iron'].offset;
}

/** A bulk order sized to what this character can make: recipes within about 25 points below their skill. */
export function makeContract(c: Character, rng: Rng, now: number): Contract | null {
  const skills = CRAFTS.filter((sk) => c.skills[sk] >= 100);
  const skill = pickWeighted(rng, skills.map((sk) => [sk, c.skills[sk]] as const));
  if (!skill) return null;
  const lvl = c.skills[skill] / 10;
  let options = RECIPES.filter((r) => r.skill === skill && r.min <= lvl && r.min >= lvl - 25);
  if (!options.length) options = RECIPES.filter((r) => r.skill === skill && r.min <= lvl);
  if (!options.length) return null;
  const r: Recipe = options[Math.floor(rng() * options.length)];

  let wants: ItemDefId | null = null;
  let wantsRes: ResourceId | undefined;
  let minMat: MetalId | null = null;
  let exceptional = false;
  let n: number;
  let unit: number;
  if ('item' in r.out) {
    wants = r.out.item;
    n = randInt(rng, 5, 12);
    exceptional = chance(rng, lvl >= 60 ? 0.35 : 0.1);
    if (r.bars && lvl >= 40 && chance(rng, 0.4)) {
      const metals = METAL_IDS.filter((m) => m !== 'iron' && METALS[m].offset <= lvl - r.min);
      minMat = metals.length ? metals[Math.floor(rng() * metals.length)] : null;
    }
    unit = ITEMS[wants].price * (minMat ? METALS[minMat].priceMult : 1) * (exceptional ? 2.5 : 1);
  } else {
    wantsRes = r.out.res;
    n = r.out.n * randInt(rng, 5, 15);
    unit = RESOURCES[wantsRes].price;
  }

  const reward: Contract['reward'] = { gold: Math.round(unit * n * 1.4) };
  const roll = rng();
  if (roll < 0.35) reward.plan = pickWeighted(rng, PLAN_WEIGHTS)!;
  else if (roll < 0.7) {
    const id: ResourceId = chance(rng, 0.1) ? 'dragonScale' : skill === 'carpentry' || skill === 'bowcraft' ? 'ancientWood' : 'etherealOre';
    reward.res = { id, n: randInt(rng, 1, 3) + Math.floor(n / 6) };
  } else reward.gold = Math.round(reward.gold * 1.3);

  return {
    id: now + Math.floor(rng() * 1000),
    giver: GIVERS[Math.floor(rng() * GIVERS.length)],
    wants, wantsRes, minMat, exceptional, n, delivered: 0, reward,
    expiresAt: now + CONTRACT_TTL_MS,
  };
}

/** New offers appear on the board every 20–40 minutes; accepted contracts expire after a day. */
export function tickContracts(s: GameState, c: Character | null, rng: Rng, now: number): boolean {
  let changed = false;
  const before = s.contracts.length;
  s.contracts = s.contracts.filter((k) => k.expiresAt > now);
  if (s.contracts.length !== before) changed = true;
  if (c && now >= s.nextContractAt) {
    if (s.contractOffers.length >= MAX_OFFERS) s.contractOffers.shift();
    const k = makeContract(c, rng, now);
    if (k) s.contractOffers.push(k);
    s.nextContractAt = now + randInt(rng, 20, 40) * 60_000;
    changed = true;
  }
  return changed;
}

export function accept(s: GameState, k: Contract, now = Date.now()): boolean {
  if (s.contracts.length >= MAX_ACTIVE || !s.contractOffers.includes(k)) return false;
  s.contractOffers = s.contractOffers.filter((x) => x !== k);
  s.contracts.push({ ...k, expiresAt: now + CONTRACT_TTL_MS });
  return true;
}

export function fits(k: Contract, it: ItemInstance): boolean {
  if (it.def !== k.wants) return false;
  if (k.minMat && metalRank(it.mat) < metalRank(k.minMat)) return false;
  if (k.exceptional && it.quality !== 'exceptional') return false;
  return it.dur >= it.maxDur * 0.5;
}

/** Hands in whatever matches from the pack. Returns how many were delivered and whether it completed. */
export function handIn(s: GameState, c: Character, k: Contract): { given: number; done: boolean } {
  let given = 0;
  const need = k.n - k.delivered;
  if (k.wantsRes) {
    given = Math.min(need, c.pack.res[k.wantsRes] ?? 0);
    addRes(c.pack, k.wantsRes, -given);
  } else {
    const worn = Object.values(c.equip);
    const items = c.pack.items.filter((i) => fits(k, i) && !worn.includes(i.uid)).slice(0, need);
    given = items.length;
    c.pack.items = c.pack.items.filter((i) => !items.includes(i));
  }
  k.delivered += given;
  const done = k.delivered >= k.n;
  if (done) {
    c.gold += k.reward.gold;
    if (k.reward.plan) c.plans[k.reward.plan] = (c.plans[k.reward.plan] ?? 0) + 1;
    if (k.reward.res) addRes(c.pack, k.reward.res.id, k.reward.res.n);
    s.reputation += 3;
    s.contracts = s.contracts.filter((x) => x !== k);
  }
  return { given, done };
}

export function abandon(s: GameState, k: Contract): void {
  s.contracts = s.contracts.filter((x) => x !== k);
}

/* ---------------- plans ---------------- */

/** Pieces five fragments into a random plan. */
export function combineFragments(c: Character, rng: Rng): PlanId | null {
  if ((c.pack.res.planFragment ?? 0) < FRAGMENTS_PER_PLAN) return null;
  addRes(c.pack, 'planFragment', -FRAGMENTS_PER_PLAN);
  const id = pickWeighted(rng, PLAN_WEIGHTS)!;
  c.plans[id] = (c.plans[id] ?? 0) + 1;
  return id;
}

/** Crafts from a plan. The plan is used up only when the item is made; a failure just costs materials. */
export function craftPlan(s: GameState, c: Character, id: PlanId, rng: Rng): CraftResult | null {
  if (!(c.plans[id] ?? 0) || canCraft(c, PLANS[id], null)) return null;
  const r = craft(s, c, PLANS[id], null, rng);
  if (r.ok) {
    c.plans[id] = (c.plans[id] ?? 1) - 1;
    if (!c.plans[id]) delete c.plans[id];
  }
  return r;
}

/** Fortifying powder: +10 maximum durability (and current) on one item. */
export function fortify(c: Character, it: ItemInstance): boolean {
  if (!(c.pack.res.fortifyingPowder ?? 0) || !c.pack.items.includes(it)) return false;
  addRes(c.pack, 'fortifyingPowder', -1);
  it.maxDur += 10;
  it.dur += 10;
  return true;
}
