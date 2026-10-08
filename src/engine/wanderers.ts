import { ITEMS, METALS, METAL_IDS, type ItemDefId, type MetalId } from '../data/items';
import { RECIPES } from '../data/recipes';
import { RESOURCES, type ResourceId } from '../data/resources';
import { addRes } from './character';
import { itemValue } from './craft';
import { chance, pickWeighted, randInt, type Rng } from './rng';
import type { Character, GameState, ItemInstance, Wanderer } from './state';

const NAMES = ['Borek', 'Ylva', 'Ragnar', 'Milena', 'Sivar', 'Edda', 'Tomáš', 'Kael', 'Brana', 'Orvin', 'Jitka', 'Hroth', 'Lada', 'Vesna', 'Dobromil', 'Aslaug'];

export const MAX_WANDERERS = 3;

/** Wanderers get pickier and richer as the shop's reputation grows. */
export function repTier(rep: number): number {
  return Math.min(6, Math.floor(rep / 4));
}

function metalRank(m: MetalId | undefined): number {
  return METALS[m ?? 'iron'].offset;
}

/** Goods bundles: rangers buy arrows, everyone buys travel food. */
const GOODS: { id: ResourceId; tier: number; kind: Wanderer['kind'] | null }[] = [
  { id: 'arrow', tier: 0, kind: 'ranger' },
  { id: 'bread', tier: 0, kind: null },
  { id: 'cookedFish', tier: 0, kind: null },
  { id: 'fishPie', tier: 2, kind: null },
  { id: 'herbalStew', tier: 3, kind: null },
  { id: 'smokedSturgeon', tier: 5, kind: null },
];

export function spawnWanderer(s: GameState, rng: Rng, now: number): Wanderer {
  const tier = repTier(s.reputation);
  const kind: Wanderer['kind'] = rng() < 0.65 ? 'warrior' : 'ranger';
  const id = now + Math.floor(rng() * 1000);
  const name = NAMES[Math.floor(rng() * NAMES.length)];
  const leavesAt = now + randInt(rng, 15, 25) * 60_000;
  if (rng() < 0.3) {
    const goods = GOODS.filter((g) => g.tier <= tier && (g.kind === null || g.kind === kind));
    const g = goods[Math.floor(rng() * goods.length)];
    const n = g.id === 'arrow' ? randInt(rng, 2, 6) * 10 : randInt(rng, 3, 8);
    const offer = Math.round(RESOURCES[g.id].price * n * (1.3 + rng() * 0.4));
    return { id, name, kind, wants: null, wantsRes: { id: g.id, n }, minMat: null, exceptional: false, offer, leavesAt };
  }
  const options = RECIPES.filter(
    (r) => 'item' in r.out && ITEMS[r.out.item].kind !== 'tool' && r.min <= 15 + tier * 12 && (kind === 'ranger') === (ITEMS[r.out.item].weaponSkill === 'archery'),
  );
  const r = options[Math.floor(rng() * options.length)];
  const wants = (r.out as { item: ItemDefId }).item;
  let minMat: MetalId | null = null;
  if (ITEMS[wants].metal && chance(rng, tier * 0.1)) {
    const metals = METAL_IDS.filter((m) => m !== 'iron' && METALS[m].offset <= tier * 9);
    minMat = pickWeighted(rng, metals.map((m) => [m, 1] as const));
  }
  const exceptional = chance(rng, 0.12 + tier * 0.05);
  const base = ITEMS[wants].price * (minMat ? METALS[minMat].priceMult : 1) * (exceptional ? 2.5 : 1);
  const offer = Math.round(base * (1.0 + rng() * 0.45));
  return { id, name, kind, wants, minMat, exceptional, offer, leavesAt };
}

/** Removes wanderers who left and lets a new one arrive when it is time. Returns true if anything changed. */
export function tickWanderers(s: GameState, rng: Rng, now: number): boolean {
  const before = s.wanderers.length;
  s.wanderers = s.wanderers.filter((w) => w.leavesAt > now);
  let changed = s.wanderers.length !== before;
  if (now >= s.nextWandererAt && s.wanderers.length < MAX_WANDERERS) {
    s.wanderers.push(spawnWanderer(s, rng, now));
    s.nextWandererAt = now + randInt(rng, 90, 240) * 1000;
    changed = true;
  } else if (now >= s.nextWandererAt) {
    s.nextWandererAt = now + 60_000;
  }
  return changed;
}

export function matches(w: Wanderer, it: ItemInstance): boolean {
  if (it.def !== w.wants) return false;
  if (w.minMat && metalRank(it.mat) < metalRank(w.minMat)) return false;
  if (w.exceptional && it.quality !== 'exceptional') return false;
  return it.dur >= it.maxDur * 0.5;
}

/** Cheapest fitting items first, so the obvious choice is the one you'd sell anyway. */
export function matchingItems(c: Character, w: Wanderer): ItemInstance[] {
  return c.pack.items.filter((i) => matches(w, i)).sort((a, b) => itemValue(a) - itemValue(b));
}

/** The offer, or more if the item beats the request (better metal or exceptional when not asked). */
export function wandererPays(w: Wanderer, it: ItemInstance): number {
  return Math.max(w.offer, Math.round(itemValue(it) * 1.1));
}

export function canDeliverGoods(c: Character, w: Wanderer): boolean {
  return !!w.wantsRes && (c.pack.res[w.wantsRes.id] ?? 0) >= w.wantsRes.n;
}

export function deliverGoods(s: GameState, c: Character, w: Wanderer): boolean {
  if (!canDeliverGoods(c, w)) return false;
  addRes(c.pack, w.wantsRes!.id, -w.wantsRes!.n);
  c.gold += w.offer;
  s.reputation += 1;
  s.wanderers = s.wanderers.filter((x) => x !== w);
  return true;
}

export function sellToWanderer(s: GameState, c: Character, w: Wanderer, it: ItemInstance): boolean {
  if (!matches(w, it) || !c.pack.items.includes(it)) return false;
  c.pack.items = c.pack.items.filter((i) => i !== it);
  c.gold += wandererPays(w, it);
  s.reputation += 1;
  s.wanderers = s.wanderers.filter((x) => x !== w);
  return true;
}

/** The town smith buys any crafted item at a poor price. */
export function smithBuyPrice(it: ItemInstance): number {
  return Math.max(1, Math.floor(itemValue(it) * 0.35));
}
