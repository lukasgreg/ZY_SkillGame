import type { ResourceId } from '../data/resources';
import type { SkillId } from '../data/skills';
import { addRes } from './character';
import { pickWeighted, type Rng } from './rng';
import type { GameState } from './state';

/** Rented houses (docs/PLAN_V3.md, phase K, after Endor's rented houses). */
export const HOUSE_IDS = ['cottage', 'townhouse', 'stoneHouse', 'villa', 'keep'] as const;
export type HouseId = (typeof HOUSE_IDS)[number];

export interface HouseDef {
  id: HouseId;
  rent: number;
  workerSlots: number;
  gardenPerHour: number;
  xpBonus: number;
  forge: boolean;
  kennel: boolean;
  lab: boolean;
  trophies: boolean;
}

const h = (id: HouseId, rent: number, workerSlots: number, gardenPerHour: number, xpBonus: number, forge: boolean, kennel: boolean, lab: boolean, trophies = false): HouseDef => ({
  id, rent, workerSlots, gardenPerHour, xpBonus, forge, kennel, lab, trophies,
});

export const HOUSES: Record<HouseId, HouseDef> = {
  cottage: h('cottage', 25, 1, 2, 0.05, false, false, false),
  townhouse: h('townhouse', 90, 2, 4, 0.1, true, false, false),
  stoneHouse: h('stoneHouse', 250, 3, 6, 0.15, true, true, false),
  villa: h('villa', 700, 4, 10, 0.2, true, true, true),
  keep: h('keep', 2000, 6, 16, 0.25, true, true, true, true),
};

export const DAY_MS = 24 * 3600_000;
/** Unpaid days before the clerk evicts you. */
export const EVICT_DAYS = 3;
const GARDEN_CAP_MS = 8 * 3600_000;
const GARDEN: [ResourceId, number][] = [['ginseng', 3], ['garlic', 3], ['herb', 2], ['wheat', 3], ['flax', 2], ['mandrake', 1]];

export interface HouseState {
  tier: HouseId;
  /** Rent is paid up to this moment. */
  paidUntil: number;
  /** Last time the garden delivered. */
  gardenAt: number;
  /** The "rent unpaid" warning was given (so it isn't repeated every second). */
  warned?: boolean;
}

/** The house whose benefits apply right now (rent paid), or null. */
export function activeHouse(s: GameState, now = Date.now()): HouseDef | null {
  return s.house && s.house.paidUntil > now ? HOUSES[s.house.tier] : null;
}

/** Moving in (or up or down): two days' rent from the bank, paid in advance. */
export function rentHouse(s: GameState, id: HouseId, now = Date.now()): boolean {
  const cost = HOUSES[id].rent * 2;
  if (s.house?.tier === id || s.bank.gold < cost) return false;
  s.bank.gold -= cost;
  s.house = { tier: id, paidUntil: now + 2 * DAY_MS, gardenAt: now };
  return true;
}

export function giveUpLease(s: GameState): void {
  s.house = null;
}

export type RentEvent = 'paid' | 'unpaid' | 'evicted';

/**
 * Collects rent day by day from the bank. If the bank can't pay, the house stops working; after
 * three unpaid days the clerk evicts you. Returns what happened.
 */
export function collectRent(s: GameState, now = Date.now()): RentEvent[] {
  const out: RentEvent[] = [];
  const house = s.house;
  if (!house) return out;
  const rent = HOUSES[house.tier].rent;
  while (house.paidUntil <= now) {
    if (s.bank.gold >= rent) {
      s.bank.gold -= rent;
      house.paidUntil += DAY_MS;
      house.warned = false;
      out.push('paid');
    } else {
      if (now - house.paidUntil >= EVICT_DAYS * DAY_MS) {
        s.house = null;
        out.push('evicted');
      } else if (!house.warned) {
        house.warned = true;
        out.push('unpaid');
      }
      break;
    }
  }
  return out;
}

/** The garden delivers reagents and grain to the bank each hour (offline too, up to 8 hours). */
export function harvestGarden(s: GameState, rng: Rng, now = Date.now()): Partial<Record<ResourceId, number>> {
  const got: Partial<Record<ResourceId, number>> = {};
  const house = activeHouse(s, now);
  if (!house || !s.house) return got;
  const ms = Math.min(now - s.house.gardenAt, GARDEN_CAP_MS);
  const hours = Math.floor(ms / 3600_000);
  if (hours < 1) return got;
  s.house.gardenAt += hours * 3600_000;
  if (now - s.house.gardenAt > GARDEN_CAP_MS) s.house.gardenAt = now;
  for (let i = 0; i < hours * house.gardenPerHour; i++) {
    const id = pickWeighted(rng, GARDEN)!;
    addRes(s.bank, id, 1);
    got[id] = (got[id] ?? 0) + 1;
  }
  return got;
}

/** Craft success bonus from a home forge or lab. */
export function homeCraftBonus(s: GameState, skill: SkillId): number {
  const house = activeHouse(s);
  if (!house) return 0;
  if (house.forge && (skill === 'blacksmithing' || skill === 'tinkering')) return 0.05;
  if (house.lab && skill === 'alchemy') return 0.05;
  return 0;
}
