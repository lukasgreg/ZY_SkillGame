import { MAX_CONTROL_SLOTS, MONSTERS, TAMEABLE, WILD_AREAS, type MonsterId } from '../data/dungeons';
import { RESOURCES, type ResourceId } from '../data/resources';
import { addRes } from './character';
import { craftChance } from './craft';
import { xpToNext } from './levels';
import { clamp, pickWeighted, randInt, type Rng } from './rng';
import { isPowerHour, successChance, trySkillGain } from './skills';
import type { Character, Pet } from './state';

const LOYALTY_DROP_PER_HOUR = 5;
const BOND_AFTER_MS = 24 * 3600_000;
export const PET_MAX_LEVEL = 30;
/** Seconds a taming attempt takes (docs/PLAN_V2.md, phase F). */
export const TAME_MS = 10_000;

/* ---------------- control slots ---------------- */

/** How many slots of animals you can control: one per 10 Intelligence, at least 1, at most 10. */
export function maxSlots(c: Character): number {
  return clamp(Math.floor(c.stats.int / 10), 1, MAX_CONTROL_SLOTS);
}

export function usedSlots(c: Character): number {
  return c.pets.reduce((n, p) => n + (TAMEABLE[p.kind]?.slots ?? 1), 0);
}

export function canControl(c: Character, kind: MonsterId): boolean {
  const t = TAMEABLE[kind];
  return !!t && usedSlots(c) + t.slots <= maxSlots(c);
}

/* ---------------- taming ---------------- */

/** Taming success: UO-like range from the animal's minimum skill, helped a little by Animal Lore. */
export function tameChance(c: Character, kind: MonsterId): number {
  const t = TAMEABLE[kind];
  if (!t) return 0;
  return clamp(craftChance(c.skills.taming / 10, t.min, t.min + 30) + c.skills.animalLore / 2000, 0, 0.95);
}

export function makePet(kind: MonsterId, now: number): Pet {
  const m = MONSTERS[kind];
  return { id: now, kind, hp: m.hp, skill: Math.round(m.skill * 8), loyalty: 70, fedAt: now, tamedAt: now, bonded: false, dead: false, level: 1, xp: 0 };
}

export type TameResult = { ok: true; pet: Pet } | { ok: false; attacked: number; fled: boolean };

/**
 * One taming attempt. Trains Taming and Animal Lore. On a failure the animal may attack (fierce ones
 * more often), dealing a few blows and running off; a calm animal may simply wander away.
 */
export function tryTame(c: Character, kind: MonsterId, rng: Rng, now = Date.now()): TameResult {
  const t = TAMEABLE[kind]!;
  const p = tameChance(c, kind);
  const ok = rng() < p;
  trySkillGain(c, 'taming', p, ok, rng, { rarity: t.slots / 3, tooEasyAt: t.min + 40, mult: isPowerHour() ? 1.5 : 1 });
  trySkillGain(c, 'animalLore', p, ok, rng, { mult: 0.5 });
  if (ok && canControl(c, kind)) {
    const pet = makePet(kind, now);
    c.pets.push(pet);
    return { ok: true, pet };
  }
  if (rng() < (t.fierce ? 0.5 : 0.15)) {
    const m = MONSTERS[kind];
    const dmg = randInt(rng, m.dmg[0], m.dmg[1]) * 2;
    c.hp = Math.max(1, c.hp - dmg);
    return { ok: false, attacked: dmg, fled: true };
  }
  return { ok: false, attacked: 0, fled: rng() < 0.25 };
}

/* ---------------- the Wilds ---------------- */

export function wildAreaOpen(c: Character, id: number): boolean {
  return c.skills.tracking / 10 >= WILD_AREAS[id - 1].need;
}

/** Tracking finds an animal in the area; the better your tracking, the likelier the rarer ones. */
export function track(c: Character, rng: Rng): MonsterId | null {
  const area = WILD_AREAS[c.wildsArea - 1];
  const skill = c.skills.tracking / 10;
  const p = clamp(0.5 + (skill - area.need) / 60, 0.3, 0.95);
  const ok = rng() < p;
  trySkillGain(c, 'tracking', p, ok, rng, { tooEasyAt: area.need + 45, mult: isPowerHour() ? 1.5 : 1 });
  if (!ok) return null;
  const weights = area.animals.map(([k, w]) => [k, w * (1 + skill / 50) ** (TAMEABLE[k]!.slots / 4)] as [MonsterId, number]);
  return pickWeighted(rng, weights);
}

/* ---------------- levels (phase G) ---------------- */

export function petMaxHp(p: Pet): number {
  return Math.round(MONSTERS[p.kind].hp * (1 + 0.04 * ((p.level ?? 1) - 1)));
}

export function petDmgMult(p: Pet): number {
  return 1 + 0.03 * ((p.level ?? 1) - 1);
}

/** Pet skill cap: a little above the wild animal's, and higher with each level. */
export function petSkillCap(p: Pet): number {
  return MONSTERS[p.kind].skill * 10 + 200 + 10 * ((p.level ?? 1) - 1);
}

/** Adds experience to a pet; each level gives hits, damage and +1.0 fighting skill. Returns levels gained. */
export function gainPetXp(p: Pet, amount: number): number {
  if (p.dead || (p.level ?? 1) >= PET_MAX_LEVEL) return 0;
  p.level ??= 1;
  p.xp = (p.xp ?? 0) + amount;
  let gained = 0;
  while (p.level < PET_MAX_LEVEL && p.xp >= xpToNext(p.level)) {
    p.xp -= xpToNext(p.level);
    p.level += 1;
    p.skill += 10;
    gained += 1;
  }
  if (gained) p.hp = petMaxHp(p);
  return gained;
}

/* ---------------- care ---------------- */

/** Loyalty fades without food; bonded pets are twice as patient. */
export function loyaltyNow(p: Pet, now = Date.now()): number {
  const rate = LOYALTY_DROP_PER_HOUR * (p.bonded ? 0.5 : 1);
  return clamp(p.loyalty - ((now - p.fedAt) / 3600_000) * rate, 0, 100);
}

/** Any food or raw fish and grain will do. */
export function petFood(id: ResourceId): boolean {
  return !!RESOURCES[id].food || ['perch', 'carp', 'pike', 'sturgeon', 'wheat'].includes(id);
}

export function feed(c: Character, p: Pet, id: ResourceId, now = Date.now()): boolean {
  if (!petFood(id) || !(c.pack.res[id] ?? 0) || p.dead) return false;
  addRes(c.pack, id, -1);
  p.loyalty = Math.min(100, loyaltyNow(p, now) + 30);
  p.fedAt = now;
  return true;
}

/** A bandage on a pet heals 10 + Animal Healing / 5 (and a little from Animal Lore). */
export function vetHeal(c: Character): number {
  return Math.round(10 + c.skills.animalHealing / 50 + c.skills.animalLore / 100);
}

/** Out of combat, binding a pet takes 4 s, less with skill. */
export function vetTime(c: Character): number {
  return Math.round(Math.max(1500, 4000 - c.skills.animalHealing * 2.5));
}

/** Animal Healing with a bandage. */
export function healPet(c: Character, p: Pet, rng: Rng): number {
  if (p.dead || !(c.pack.res.bandage ?? 0) || p.hp >= petMaxHp(p)) return 0;
  addRes(c.pack, 'bandage', -1);
  const n = Math.min(petMaxHp(p) - p.hp, vetHeal(c));
  p.hp += n;
  trySkillGain(c, 'animalHealing', 0.5, true, rng, { mult: isPowerHour() ? 1.5 : 1 });
  return n;
}

export const RESURRECT_SKILL = 800;
export const RESURRECT_BANDAGES = 10;

/** Bringing back a bonded pet takes Animal Healing 80 and ten bandages; it can fail. */
export function resurrect(c: Character, p: Pet, rng: Rng): boolean | null {
  if (!p.dead || c.skills.animalHealing < RESURRECT_SKILL || (c.pack.res.bandage ?? 0) < RESURRECT_BANDAGES) return null;
  addRes(c.pack, 'bandage', -RESURRECT_BANDAGES);
  const chance = 0.4 + 0.55 * successChance(c.skills.animalHealing / 10, 80, 100);
  const ok = rng() < chance;
  trySkillGain(c, 'animalHealing', chance, ok, rng, { rarity: 1 });
  if (ok) {
    p.dead = false;
    p.hp = Math.round(petMaxHp(p) * 0.3);
    p.loyalty = 50;
    p.fedAt = Date.now();
  }
  return ok;
}

export function release(c: Character, p: Pet): void {
  c.pets = c.pets.filter((x) => x !== p);
}

/** Loyalty and bonding over time. Returns pets that ran off and pets that just bonded. */
export function tickPets(c: Character, now = Date.now()): { ran: Pet[]; bonded: Pet[] } {
  const ran: Pet[] = [];
  const bonded: Pet[] = [];
  for (const p of c.pets) {
    if (p.dead) continue;
    const l = loyaltyNow(p, now);
    if (l <= 0) ran.push(p);
    else if (!p.bonded && now - p.tamedAt >= BOND_AFTER_MS && l > 50) {
      p.bonded = true;
      bonded.push(p);
    }
  }
  if (ran.length) c.pets = c.pets.filter((p) => !ran.includes(p));
  return { ran, bonded };
}

/** Pets slowly recover between fights (about a third of their hits per hour). */
export function restPets(c: Character, ms: number): void {
  for (const p of c.pets) if (!p.dead) p.hp = Math.min(petMaxHp(p), p.hp + (petMaxHp(p) / 3) * (ms / 3600_000));
}
