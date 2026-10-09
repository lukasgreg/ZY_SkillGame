import type { ResourceId } from './resources';
import type { StatId } from './skills';

/** What a potion does (docs/PLAN_V3.md, phase H, after Andaria's alchemy). */
export type PotionEffect =
  | { kind: 'heal'; hp: number }
  | { kind: 'refresh' }
  | { kind: 'cure' }
  | { kind: 'buff'; stat: StatId | 'armor'; amount: number; minutes: number }
  | { kind: 'explosion'; dmg: [number, number] }
  | { kind: 'coat'; hits: number };

export const POTIONS: Partial<Record<ResourceId, PotionEffect>> = {
  potionLesserHeal: { kind: 'heal', hp: 25 },
  potionHeal: { kind: 'heal', hp: 50 },
  potionGreaterHeal: { kind: 'heal', hp: 100 },
  potionRefresh: { kind: 'refresh' },
  potionCure: { kind: 'cure' },
  potionAgility: { kind: 'buff', stat: 'dex', amount: 10, minutes: 10 },
  potionStrength: { kind: 'buff', stat: 'str', amount: 10, minutes: 10 },
  potionWisdom: { kind: 'buff', stat: 'int', amount: 10, minutes: 10 },
  potionStoneskin: { kind: 'buff', stat: 'armor', amount: 6, minutes: 10 },
  potionExplosion: { kind: 'explosion', dmg: [15, 30] },
  potionPoison: { kind: 'coat', hits: 10 },
};

export const isPotion = (id: ResourceId) => id in POTIONS;
