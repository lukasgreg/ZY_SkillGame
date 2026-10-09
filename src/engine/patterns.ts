import { ITEMS, METALS, METAL_IDS, type ItemDefId, type MetalId } from '../data/items';
import { RECIPES, recipeFor } from '../data/recipes';
import { RESOURCES } from '../data/resources';
import { makeCrafted } from './craft';
import { pickWeighted, type Rng } from './rng';
import type { Character, GameState, ItemInstance } from './state';

/**
 * Patterns (docs/PLAN_V2.md, phase E): permission to craft one item in one rare metal, used up on success.
 * They are kept in the shared bank under the key "def:metal".
 */
export const patternKey = (def: ItemDefId, metal: MetalId) => `${def}:${metal}`;

export function parsePattern(key: string): { def: ItemDefId; metal: MetalId } {
  const [def, metal] = key.split(':');
  return { def: def as ItemDefId, metal: metal as MetalId };
}

export function needsPattern(metal: MetalId | null): boolean {
  return !!metal && METALS[metal].rare;
}

export function hasPattern(s: GameState, def: ItemDefId, metal: MetalId): boolean {
  return (s.bank.patterns[patternKey(def, metal)] ?? 0) > 0;
}

export function addPattern(s: GameState, def: ItemDefId, metal: MetalId, n = 1): void {
  const k = patternKey(def, metal);
  s.bank.patterns[k] = (s.bank.patterns[k] ?? 0) + n;
}

export function usePattern(s: GameState, def: ItemDefId, metal: MetalId): boolean {
  const k = patternKey(def, metal);
  if (!(s.bank.patterns[k] ?? 0)) return false;
  s.bank.patterns[k] -= 1;
  if (!s.bank.patterns[k]) delete s.bank.patterns[k];
  return true;
}

/** A random pattern fitting a dungeon's difficulty: tougher dungeons give rarer metals and bigger pieces. */
export function rollPattern(skulls: number, rng: Rng): { def: ItemDefId; metal: MetalId } {
  const items = RECIPES.filter((r) => r.bars && 'item' in r.out && r.min <= 20 + skulls * 15).map((r) => (r.out as { item: ItemDefId }).item);
  const def = items[Math.floor(rng() * items.length)];
  // Rare metals in order of value; each dungeon favours the one matching its skulls (silver at 1, blackrock at 5).
  const rare = METAL_IDS.filter((m) => METALS[m].rare);
  const weights: [MetalId, number][] = rare.map((m, i) => [m, Math.max(0.3, 1 + skulls - 2 * Math.abs(i - (skulls - 1)))]);
  return { def, metal: pickWeighted(rng, weights)! };
}

/** What the master craftsman in town charges: three times the item's worth, bars included at triple price. */
export function commissionCost(def: ItemDefId, metal: MetalId): number {
  const r = recipeFor(def);
  const bars = r?.bars ?? 0;
  return Math.round(ITEMS[def].price * METALS[metal].priceMult * 3 + bars * RESOURCES[METALS[metal].bar].price * 3);
}

/** A fighter without the skill pays the master craftsman to make a pattern's item. */
export function commission(s: GameState, c: Character, key: string, rng: Rng): ItemInstance | null {
  const { def, metal } = parsePattern(key);
  const cost = commissionCost(def, metal);
  if (c.location !== 'town' || c.gold < cost || !usePattern(s, def, metal)) return null;
  c.gold -= cost;
  const it = makeCrafted(s, def, metal, rng() < 0.15);
  c.pack.items.push(it);
  return it;
}
