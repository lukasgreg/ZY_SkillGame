import { effectiveCap } from './levels';
import { TOTAL_SKILL_CAP, type SkillId } from '../data/skills';
import { totalSkills } from './skills';
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
  return Math.max(0.1, Math.round((base / (1 + pressure(s, id, now) / 60)) * 10) / 10);
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
  if (c.tool === null && ITEMS[def].toolFor === 'mining') c.tool = it.uid;
  return it;
}

/** Provisioner price for raw goods (logs until Lumberjacking arrives). */
/** What the provisioner charges for `n` units (cheap goods like arrows cost a fraction of a gold piece each). */
export function buyResPrice(id: ResourceId, n = 1): number {
  return Math.ceil(RESOURCES[id].price * 1.5 * n);
}

export function buyRes(c: Character, id: ResourceId, n: number): boolean {
  const cost = buyResPrice(id, n);
  if (c.gold < cost) return false;
  c.gold -= cost;
  addRes(c.pack, id, n);
  return true;
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

/** NPC trainers (Andaria): teach any skill up to 30.0, within your profession's limit. */
export const TRAIN_LIMIT = 300;

/** Gold for the next +1.0; rises 12% per point already known. */
export function trainSkillCost(c: Character, id: SkillId): number {
  return Math.round(4 * Math.pow(1.12, c.skills[id] / 10));
}

export function canTrainSkill(c: Character, id: SkillId): boolean {
  const next = Math.min(c.skills[id] + 10, TRAIN_LIMIT);
  return c.location === 'town' && next > c.skills[id] && next <= effectiveCap(c, id) && c.gold >= trainSkillCost(c, id) && c.locks[id] !== 'locked';
}

export function trainSkill(c: Character, id: SkillId): boolean {
  if (!canTrainSkill(c, id)) return false;
  const gain = Math.min(c.skills[id] + 10, TRAIN_LIMIT) - c.skills[id];
  if (totalSkills(c) + gain > TOTAL_SKILL_CAP) return false;
  c.gold -= trainSkillCost(c, id);
  c.skills[id] += gain;
  return true;
}
