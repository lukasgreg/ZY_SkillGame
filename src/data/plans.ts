import type { Recipe } from './recipes';

/**
 * One-use plans (design 5.4): a recipe that is used up when the item is made.
 * They come from contracts and from plan fragments found while gathering, and they
 * count as rarity 3 for skill gain, so they are the fastest way to grow at high skill.
 */
export const PLAN_IDS = ['runicHammer', 'reinforcedPack', 'deepBlade', 'ancientBow', 'foundersFeast', 'fortifyingPowder'] as const;
export type PlanId = (typeof PLAN_IDS)[number];

export const PLANS: Record<PlanId, Recipe> = {
  runicHammer: {
    id: 'runicHammer', skill: 'blacksmithing', min: 60, max: 95, tool: 'smithHammer', rarity: 3,
    inputs: { steelBar: 10, roughGem: 1, etherealOre: 2 }, out: { item: 'runicHammer' },
  },
  reinforcedPack: {
    id: 'reinforcedPack', skill: 'tinkering', min: 45, max: 80, tool: 'tinkerTools', rarity: 3,
    inputs: { ironBar: 5, flax: 10, resin: 2 }, out: { item: 'reinforcedPack' },
  },
  deepBlade: {
    id: 'deepBlade', skill: 'blacksmithing', min: 70, max: 105, tool: 'smithHammer', rarity: 3,
    inputs: { silverBar: 12, pearl: 2, etherealOre: 3 }, out: { item: 'deepBlade' },
  },
  ancientBow: {
    id: 'ancientBow', skill: 'bowcraft', min: 65, max: 100, tool: 'carvingKnife', rarity: 3,
    inputs: { heartwood: 3, ancientWood: 2, flax: 3 }, out: { item: 'ancientBow' },
  },
  foundersFeast: {
    id: 'foundersFeast', skill: 'cooking', min: 55, max: 90, tool: 'skillet', rarity: 3,
    inputs: { smokedSturgeon: 2, herbalStew: 2, bread: 4 }, out: { res: 'foundersFeast', n: 3 },
  },
  fortifyingPowder: {
    id: 'fortifyingPowder', skill: 'tinkering', min: 40, max: 75, tool: 'tinkerTools', rarity: 3,
    inputs: { sulfur: 4, roughGem: 1, coal: 4 }, out: { res: 'fortifyingPowder', n: 3 },
  },
};

/** How likely each plan is when fragments are pieced together or a contract pays in plans. */
export const PLAN_WEIGHTS: [PlanId, number][] = [
  ['fortifyingPowder', 5],
  ['reinforcedPack', 4],
  ['foundersFeast', 3],
  ['runicHammer', 2],
  ['ancientBow', 1],
  ['deepBlade', 1],
];

export const FRAGMENTS_PER_PLAN = 5;
/** Chance per successful gathering pull to find a plan fragment. */
export const FRAGMENT_CHANCE = 0.004;
