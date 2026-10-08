import { PROFESSIONS, RACES, skillCap, type ProfessionId, type RaceId } from '../data/professions';
import { SKILL_IDS, type SkillId, type StatId } from '../data/skills';
import { ITEMS, type ItemDefId } from '../data/items';
import { RESOURCES } from '../data/resources';
import { randInt, type Rng } from './rng';
import { maxHp, maxStamina } from './skills';
import { nextUid, type Character, type GameState, type Inventory, type ItemInstance, type Lock } from './state';

export interface Roll {
  stats: Record<StatId, number>;
  skills: Record<SkillId, number>;
}

/** Rolls starting stats and skills for a race + profession (Andaria-style random ranges). */
export function rollCharacter(race: RaceId, prof: ProfessionId, rng: Rng): Roll {
  const p = PROFESSIONS[prof];
  const r = RACES[race];
  const stats = { ...p.statStart };
  for (const [s, [lo, hi]] of Object.entries(r.statMods) as [StatId, [number, number]][]) {
    stats[s] += randInt(rng, lo, hi);
  }
  if (r.humanPenalty) stats[rng() < 0.5 ? 'str' : 'int'] -= randInt(rng, 1, 5);

  const skills = Object.fromEntries(SKILL_IDS.map((id) => [id, 0])) as Record<SkillId, number>;
  for (const [id, [lo, hi]] of Object.entries(p.startSkills) as [SkillId, [number, number]][]) {
    skills[id] = randInt(rng, lo * 10, hi * 10);
  }
  for (const id of r.skillBonus) {
    skills[id] = Math.min(skills[id] + randInt(rng, 15, 50), skillCap(prof, id));
  }
  return { stats, skills };
}

export function makeItem(s: GameState, def: ItemDefId): ItemInstance {
  const d = ITEMS[def];
  return { uid: nextUid(s), def, dur: d.maxDur, maxDur: d.maxDur, quality: 'normal' };
}

export function createCharacter(s: GameState, name: string, race: RaceId, prof: ProfessionId, roll: Roll): Character {
  const pick = makeItem(s, 'pickaxe');
  const c: Character = {
    id: nextUid(s),
    name,
    race,
    profession: prof,
    stats: { ...roll.stats },
    skills: { ...roll.skills },
    locks: Object.fromEntries(SKILL_IDS.map((id) => [id, 'up'])) as Record<SkillId, Lock>,
    hp: 0,
    stamina: 0,
    gold: PROFESSIONS[prof].startGold,
    pack: { res: {}, items: prof === 'craftsman' ? [pick, makeItem(s, 'hatchet'), makeItem(s, 'smithHammer'), makeItem(s, 'tinkerTools')] : [pick] },
    location: 'town',
    areas: { mine: 1, forest: 1, coast: 1, farm: 1 },
    node: null,
    plans: {},
    tool: pick.uid,
    regenAt: Date.now(),
    createdAt: Date.now(),
  };
  c.hp = maxHp(c);
  c.stamina = maxStamina(c);
  s.chars.push(c);
  s.active = c.id;
  return c;
}

export function packWeight(inv: Inventory): number {
  let w = 0;
  for (const [id, n] of Object.entries(inv.res)) w += RESOURCES[id as keyof typeof RESOURCES].weight * (n ?? 0);
  for (const it of inv.items) w += ITEMS[it.def].weight;
  return Math.round(w * 10) / 10;
}

export function addRes(inv: Inventory, id: keyof typeof RESOURCES, n: number): void {
  inv.res[id] = (inv.res[id] ?? 0) + n;
  if (inv.res[id]! <= 0) delete inv.res[id];
}


/** Regenerates hp and stamina by race speed for time elapsed since the last tick. Values are fractional; the UI floors them. */
export function regen(c: Character, now: number): void {
  const r = RACES[c.race].regen;
  const secs = (now - c.regenAt) / 1000;
  c.regenAt = now;
  if (secs <= 0) return;
  c.hp = Math.min(maxHp(c), c.hp + secs / r.hp);
  c.stamina = Math.min(maxStamina(c), c.stamina + secs / r.stamina);
}

/** Eats one unit of food: restores stamina and hits. Returns false if it isn't food or none is left. */
export function eat(c: Character, id: keyof typeof RESOURCES): boolean {
  const food = RESOURCES[id].food;
  if (!food || !(c.pack.res[id] ?? 0)) return false;
  addRes(c.pack, id, -1);
  c.stamina = Math.min(maxStamina(c), c.stamina + food.stamina);
  c.hp = Math.min(maxHp(c), c.hp + food.hp);
  return true;
}
