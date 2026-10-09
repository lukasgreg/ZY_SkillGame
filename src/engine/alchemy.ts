import { POTIONS } from '../data/potions';
import type { ResourceId } from '../data/resources';
import type { StatId } from '../data/skills';
import { addRes } from './character';
import { statsAt } from './levels';
import { randInt, type Rng } from './rng';
import { maxHp, maxStamina } from './skills';
import type { Character, Combat } from './state';

/** Poison from monsters (docs/PLAN_V3.md, phase H): 2–6 a tick for 4 ticks. */
export const POISON = { dmg: [2, 6] as [number, number], ticks: 4 };
/** Hits a poison-coated weapon keeps working. */
export const COAT_ROUNDS = 4;

export type PotionOutcome =
  | { kind: 'heal'; n: number }
  | { kind: 'refresh' }
  | { kind: 'cure'; had: boolean }
  | { kind: 'buff'; stat: StatId | 'armor'; amount: number }
  | { kind: 'explosion'; hits: number[] }
  | { kind: 'coat'; hits: number };

/** Drinks (or throws) one potion. `cb` is the current fight, needed for explosions. Returns null if it can't be used now. */
export function usePotion(c: Character, id: ResourceId, rng: Rng, cb: Combat | null = null, now = Date.now()): PotionOutcome | null {
  const fx = POTIONS[id];
  if (!fx || !(c.pack.res[id] ?? 0)) return null;
  if (fx.kind === 'explosion' && !cb) return null;
  addRes(c.pack, id, -1);
  switch (fx.kind) {
    case 'heal': {
      const n = Math.min(fx.hp, maxHp(c) - Math.floor(c.hp));
      c.hp = Math.min(maxHp(c), c.hp + fx.hp);
      return { kind: 'heal', n };
    }
    case 'refresh':
      c.stamina = maxStamina(c);
      return { kind: 'refresh' };
    case 'cure': {
      const had = !!c.poison;
      c.poison = null;
      return { kind: 'cure', had };
    }
    case 'buff': {
      // Drinking again refreshes the duration rather than stacking.
      const old = c.buffs.find((b) => b.stat === fx.stat);
      if (old) old.until = now + fx.minutes * 60_000;
      else {
        c.buffs.push({ stat: fx.stat, amount: fx.amount, until: now + fx.minutes * 60_000 });
        if (fx.stat !== 'armor') c.stats[fx.stat] += fx.amount;
      }
      return { kind: 'buff', stat: fx.stat, amount: fx.amount };
    }
    case 'explosion': {
      const hits: number[] = [];
      for (const f of cb!.foes) {
        if (f.hp <= 0) continue;
        const d = randInt(rng, fx.dmg[0], fx.dmg[1]);
        f.hp = Math.max(0, f.hp - d);
        hits.push(d);
      }
      return { kind: 'explosion', hits };
    }
    case 'coat':
      c.coat = fx.hits;
      return { kind: 'coat', hits: fx.hits };
  }
}

/** Armour from a Stoneskin potion. */
export function armorBuff(c: Character): number {
  return (c.buffs ?? []).filter((b) => b.stat === 'armor').reduce((n, b) => n + b.amount, 0);
}

/** Ends expired potion effects (stats never fall below what your level gives). Returns the stats that wore off. */
export function tickBuffs(c: Character, now = Date.now()): (StatId | 'armor')[] {
  const gone = (c.buffs ?? []).filter((b) => b.until <= now);
  if (!gone.length) return [];
  c.buffs = c.buffs.filter((b) => b.until > now);
  const base = statsAt(c, c.level);
  for (const b of gone) if (b.stat !== 'armor') c.stats[b.stat] = Math.max(base[b.stat], c.stats[b.stat] - b.amount);
  return gone.map((b) => b.stat);
}

/** One tick of poison on you. Returns the damage (poison never kills outside a fight: it stops at 1 hit). */
export function poisonTick(c: Character, rng: Rng, lethal: boolean): number {
  if (!c.poison) return 0;
  const d = randInt(rng, c.poison.dmg[0], c.poison.dmg[1]);
  c.hp = lethal ? c.hp - d : Math.max(1, c.hp - d);
  c.poison.left -= 1;
  if (c.poison.left <= 0) c.poison = null;
  return d;
}
