import { MAX_CONTROL_SLOTS, MONSTERS, TAMEABLE, type MonsterId } from '../data/dungeons';
import { RESOURCES, type ResourceId } from '../data/resources';
import { addRes } from './character';
import { craftChance } from './craft';
import { clamp, type Rng } from './rng';
import { isPowerHour, successChance, trySkillGain } from './skills';
import type { Character, Pet } from './state';

const LOYALTY_DROP_PER_HOUR = 5;
const BOND_AFTER_MS = 24 * 3600_000;

export function usedSlots(c: Character): number {
  return c.pets.reduce((n, p) => n + (TAMEABLE[p.kind]?.slots ?? 1), 0);
}

export function canControl(c: Character, kind: MonsterId): boolean {
  const t = TAMEABLE[kind];
  return !!t && usedSlots(c) + t.slots <= MAX_CONTROL_SLOTS;
}

/** Taming success: UO-like range from the animal's minimum skill, helped a little by Animal Lore. */
export function tameChance(c: Character, kind: MonsterId): number {
  const t = TAMEABLE[kind];
  if (!t) return 0;
  return clamp(craftChance(c.skills.taming / 10, t.min, t.min + 30) + c.skills.animalLore / 2000, 0, 0.95);
}

export function makePet(kind: MonsterId, now: number): Pet {
  const m = MONSTERS[kind];
  return { id: now, kind, hp: m.hp, skill: Math.round(m.skill * 8), loyalty: 70, fedAt: now, tamedAt: now, bonded: false, dead: false };
}

/** Rolls a taming attempt and trains Taming. Returns the new pet on success. */
export function tryTame(c: Character, kind: MonsterId, rng: Rng, now = Date.now()): Pet | null {
  const t = TAMEABLE[kind];
  if (!t || !canControl(c, kind)) return null;
  const p = tameChance(c, kind);
  const ok = rng() < p;
  trySkillGain(c, 'taming', p, ok, rng, { rarity: t.slots - 1, tooEasyAt: t.min + 40, mult: isPowerHour() ? 1.5 : 1 });
  trySkillGain(c, 'animalLore', p, ok, rng, { mult: 0.5 });
  if (!ok) return null;
  const pet = makePet(kind, now);
  c.pets.push(pet);
  return pet;
}

export function petMaxHp(p: Pet): number {
  return MONSTERS[p.kind].hp;
}

/** Pet skill cap: a little above the wild animal's. */
export function petSkillCap(p: Pet): number {
  return MONSTERS[p.kind].skill * 10 + 200;
}

export function loyaltyNow(p: Pet, now = Date.now()): number {
  return clamp(p.loyalty - ((now - p.fedAt) / 3600_000) * LOYALTY_DROP_PER_HOUR, 0, 100);
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

export function vetHeal(c: Character): number {
  return Math.round(10 + c.skills.animalHealing / 20 + c.skills.animalLore / 50);
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

/** Bringing back a bonded pet takes Animal Healing 50+ and five bandages; it can fail. */
export function resurrect(c: Character, p: Pet, rng: Rng): boolean | null {
  if (!p.dead || c.skills.animalHealing < 500 || (c.pack.res.bandage ?? 0) < 5) return null;
  addRes(c.pack, 'bandage', -5);
  const chance = 0.3 + 0.65 * successChance(c.skills.animalHealing / 10, 50, 90);
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
