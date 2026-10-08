import { ITEMS, type ItemDefId } from '../data/items';
import { RESOURCES, type ResourceId } from '../data/resources';
import { addRes, makeItem } from './character';
import type { Character, GameState, ItemInstance } from './state';

/** Price pressure halves every 30 minutes. */
const PRESSURE_HALF_LIFE_MS = 30 * 60 * 1000;

function pressure(s: GameState, id: ResourceId, now: number): number {
  const m = s.market[id];
  if (!m) return 0;
  return m.pressure * Math.pow(0.5, (now - m.t) / PRESSURE_HALF_LIFE_MS);
}

/** What the trader pays for one unit right now. Selling a lot pushes the price down (Andaria's iron trader). */
export function sellPrice(s: GameState, id: ResourceId, now = Date.now()): number {
  const base = RESOURCES[id].price;
  return Math.max(1, Math.round((base / (1 + pressure(s, id, now) / 60)) * 10) / 10);
}

/** Sells `n` units one by one so the price slides as you sell. Returns gold earned. */
export function sellRes(s: GameState, c: Character, id: ResourceId, n: number, now = Date.now()): number {
  const have = c.pack.res[id] ?? 0;
  n = Math.min(n, have);
  let gold = 0;
  for (let i = 0; i < n; i++) {
    gold += sellPrice(s, id, now);
    s.market[id] = { pressure: pressure(s, id, now) + 1, t: now };
  }
  gold = Math.floor(gold);
  addRes(c.pack, id, -n);
  c.gold += gold;
  return gold;
}

export function buyItem(s: GameState, c: Character, def: ItemDefId): ItemInstance | null {
  const price = ITEMS[def].price;
  if (c.gold < price) return null;
  c.gold -= price;
  const it = makeItem(s, def);
  c.pack.items.push(it);
  if (c.tool === null && ITEMS[def].kind === 'tool') c.tool = it.uid;
  return it;
}

/** NPC smith repair: costs gold, restores durability, but lowers max by 5 (worse than a player repair). */
export function npcRepairCost(it: ItemInstance): number {
  return Math.max(1, Math.ceil((it.maxDur - it.dur) * ITEMS[it.def].price * 0.02));
}

export function npcRepair(c: Character, it: ItemInstance): boolean {
  const cost = npcRepairCost(it);
  if (it.dur >= it.maxDur || c.gold < cost || it.maxDur <= 6) return false;
  c.gold -= cost;
  it.maxDur -= 5;
  it.dur = it.maxDur;
  return true;
}

export function depositAll(s: GameState, c: Character): number {
  let n = 0;
  for (const [id, v] of Object.entries(c.pack.res) as [ResourceId, number][]) {
    addRes(s.bank, id, v);
    n += v;
  }
  c.pack.res = {};
  return n;
}

export function withdraw(s: GameState, c: Character, id: ResourceId, n: number): void {
  n = Math.min(n, s.bank.res[id] ?? 0);
  addRes(s.bank, id, -n);
  addRes(c.pack, id, n);
}

export function depositGold(s: GameState, c: Character, n: number): void {
  n = Math.min(n, c.gold);
  c.gold -= n;
  s.bank.gold += n;
}

export function withdrawGold(s: GameState, c: Character, n: number): void {
  n = Math.min(n, s.bank.gold);
  s.bank.gold -= n;
  c.gold += n;
}
