import type { SkillId } from './skills';

export const RESOURCE_IDS = [
  // mining
  'ironOre', 'copperOre', 'silverOre', 'goldOre', 'mithrilOre',
  'clay', 'stone', 'coal', 'sandstone', 'marble', 'obsidian', 'sulfur', 'roughGem',
  // smelting
  'ironBar', 'steelBar', 'copperBar', 'silverBar', 'goldBar', 'mithrilBar',
  // lumberjacking
  'log', 'oakLog', 'ashLog', 'yewLog', 'heartwood', 'resin',
  // fishing
  'perch', 'carp', 'pike', 'sturgeon', 'pearl',
  // farming
  'wheat', 'feather', 'flax', 'herb', 'bloodmoss',
  // crafted goods
  'arrow', 'bread', 'cookedFish', 'fishPie', 'herbalStew', 'smokedSturgeon', 'foundersFeast', 'fortifyingPowder',
  // rare: contract rewards and finds
  'etherealOre', 'ancientWood', 'dragonScale', 'planFragment',
  // adventuring
  'bandage', 'repairKit', 'wayHome',
] as const;

export type ResourceId = (typeof RESOURCE_IDS)[number];

export interface ResourceDef {
  id: ResourceId;
  /** Stones per unit. */
  weight: number;
  /** Base price a trader pays per unit. */
  price: number;
  /** 0 common .. 3 legendary; boosts skill gain chance. */
  rarity: number;
  /** Eating restores stamina and hits. */
  food?: { stamina: number; hp: number };
}

const r = (id: ResourceId, weight: number, price: number, rarity: number, food?: ResourceDef['food']): ResourceDef => ({ id, weight, price, rarity, food });

export const RESOURCES: Record<ResourceId, ResourceDef> = {
  ironOre: r('ironOre', 1, 3, 0),
  copperOre: r('copperOre', 1, 6, 0.3),
  silverOre: r('silverOre', 1, 11, 0.6),
  goldOre: r('goldOre', 1, 20, 1),
  mithrilOre: r('mithrilOre', 1, 60, 2),
  clay: r('clay', 1, 1, 0),
  stone: r('stone', 2, 1, 0),
  coal: r('coal', 0.5, 2, 0),
  sandstone: r('sandstone', 2, 3, 0.2),
  marble: r('marble', 2, 7, 0.4),
  obsidian: r('obsidian', 1, 14, 0.8),
  sulfur: r('sulfur', 0.5, 8, 0.5),
  roughGem: r('roughGem', 0.1, 45, 1.5),

  ironBar: r('ironBar', 0.5, 5, 0),
  steelBar: r('steelBar', 0.5, 12, 0.4),
  copperBar: r('copperBar', 0.5, 11, 0.3),
  silverBar: r('silverBar', 0.5, 20, 0.6),
  goldBar: r('goldBar', 0.5, 36, 1),
  mithrilBar: r('mithrilBar', 0.5, 105, 2),

  log: r('log', 2, 2, 0),
  oakLog: r('oakLog', 2, 4, 0.3),
  ashLog: r('ashLog', 2, 7, 0.6),
  yewLog: r('yewLog', 2, 13, 1),
  heartwood: r('heartwood', 2, 35, 2),
  resin: r('resin', 0.2, 6, 0.5),

  perch: r('perch', 0.5, 2, 0),
  carp: r('carp', 1, 4, 0.3),
  pike: r('pike', 1, 8, 0.6),
  sturgeon: r('sturgeon', 2, 18, 1),
  pearl: r('pearl', 0.1, 60, 2),

  wheat: r('wheat', 0.5, 1, 0),
  feather: r('feather', 0.05, 1, 0),
  flax: r('flax', 0.5, 3, 0.3),
  herb: r('herb', 0.2, 6, 0.6),
  bloodmoss: r('bloodmoss', 0.2, 16, 1.2),

  arrow: r('arrow', 0.05, 1, 0),
  bread: r('bread', 0.3, 3, 0, { stamina: 10, hp: 5 }),
  cookedFish: r('cookedFish', 0.4, 4, 0, { stamina: 15, hp: 5 }),
  fishPie: r('fishPie', 0.6, 10, 0.3, { stamina: 25, hp: 10 }),
  herbalStew: r('herbalStew', 0.8, 18, 0.6, { stamina: 35, hp: 25 }),
  smokedSturgeon: r('smokedSturgeon', 1, 30, 1, { stamina: 50, hp: 20 }),
  foundersFeast: r('foundersFeast', 1, 90, 2, { stamina: 100, hp: 80 }),
  fortifyingPowder: r('fortifyingPowder', 0.1, 40, 2),

  etherealOre: r('etherealOre', 1, 80, 3),
  ancientWood: r('ancientWood', 2, 70, 3),
  dragonScale: r('dragonScale', 0.5, 150, 3),
  planFragment: r('planFragment', 0, 15, 2),

  bandage: r('bandage', 0.1, 2, 0),
  repairKit: r('repairKit', 1, 15, 0.3),
  wayHome: r('wayHome', 0.1, 120, 2),
};

/**
 * Smelting at the forge uses the Mining skill. Two ore make one bar; a failure wastes one ore.
 * Ranges loosely follow Andaria's smelting table.
 */
export const SMELTING: Partial<Record<ResourceId, { bar: ResourceId; min: number; max: number }>> = {
  ironOre: { bar: 'ironBar', min: 0, max: 40 },
  copperOre: { bar: 'copperBar', min: 25, max: 60 },
  silverOre: { bar: 'silverBar', min: 40, max: 75 },
  goldOre: { bar: 'goldBar', min: 55, max: 90 },
  mithrilOre: { bar: 'mithrilBar', min: 75, max: 100 },
};

/**
 * Gathering yields (Andaria model): `min` is the skill needed to gather it, `best` the skill at
 * which yield peaks. `perPull` is the max amount from one successful pull at full yield.
 */
export interface Yield {
  skill: SkillId;
  min: number;
  best: number;
  perPull: number;
}

const y = (skill: SkillId, min: number, best: number, perPull: number): Yield => ({ skill, min, best, perPull });

export const YIELDS: Partial<Record<ResourceId, Yield>> = {
  ironOre: y('mining', 0, 30, 3),
  copperOre: y('mining', 30, 60, 3),
  silverOre: y('mining', 45, 75, 2),
  goldOre: y('mining', 60, 90, 2),
  mithrilOre: y('mining', 80, 110, 1),
  clay: y('mining', 0, 50, 5),
  stone: y('mining', 2, 60, 4),
  coal: y('mining', 10, 70, 4),
  sandstone: y('mining', 25, 75, 3),
  marble: y('mining', 30, 90, 3),
  obsidian: y('mining', 30, 100, 2),
  sulfur: y('mining', 40, 100, 3),
  roughGem: y('mining', 75, 110, 1),

  log: y('lumberjacking', 0, 30, 3),
  oakLog: y('lumberjacking', 25, 55, 3),
  ashLog: y('lumberjacking', 45, 75, 2),
  yewLog: y('lumberjacking', 65, 95, 2),
  heartwood: y('lumberjacking', 85, 110, 1),
  resin: y('lumberjacking', 20, 80, 2),

  perch: y('fishing', 0, 35, 2),
  carp: y('fishing', 25, 60, 2),
  pike: y('fishing', 45, 80, 1),
  sturgeon: y('fishing', 70, 105, 1),
  pearl: y('fishing', 60, 110, 1),

  wheat: y('farming', 0, 30, 5),
  feather: y('farming', 0, 40, 6),
  flax: y('farming', 20, 55, 4),
  herb: y('farming', 40, 75, 3),
  bloodmoss: y('farming', 70, 105, 2),
};

export const GATHER_LOCS = ['mine', 'forest', 'coast', 'farm'] as const;
export type GatherLoc = (typeof GATHER_LOCS)[number];
export type AreaId = 1 | 2 | 3 | 4;

export const GATHER_SKILL: Record<GatherLoc, SkillId> = {
  mine: 'mining',
  forest: 'lumberjacking',
  coast: 'fishing',
  farm: 'farming',
};

export interface Area {
  id: AreaId;
  /** Resources found here, with spawn weights for nodes (vein, tree, shoal, patch). */
  nodes: [ResourceId, number][];
  /** Skill (whole points) needed to work this area. */
  need: number;
  /** Held by the Gnarl: must be cleared (later milestone) first. */
  gnarlHeld: boolean;
}

const area = (id: AreaId, need: number, nodes: [ResourceId, number][], gnarlHeld = false): Area => ({ id, need, nodes, gnarlHeld });

export const AREAS: Record<GatherLoc, Area[]> = {
  mine: [
    area(1, 0, [['ironOre', 10], ['stone', 4], ['clay', 3], ['coal', 3]]),
    area(2, 30, [['ironOre', 4], ['copperOre', 8], ['silverOre', 4], ['coal', 3], ['sandstone', 3], ['marble', 2]]),
    area(3, 55, [['copperOre', 3], ['silverOre', 6], ['goldOre', 5], ['marble', 3], ['obsidian', 2], ['sulfur', 2], ['roughGem', 1]]),
    area(4, 80, [['goldOre', 5], ['mithrilOre', 3], ['obsidian', 3], ['roughGem', 2]], true),
  ],
  forest: [
    area(1, 0, [['log', 10], ['oakLog', 3]]),
    area(2, 30, [['log', 3], ['oakLog', 8], ['ashLog', 4], ['resin', 2]]),
    area(3, 55, [['ashLog', 6], ['yewLog', 6], ['resin', 3]]),
    area(4, 80, [['yewLog', 5], ['heartwood', 4], ['resin', 2]]),
  ],
  coast: [
    area(1, 0, [['perch', 10], ['carp', 2]]),
    area(2, 30, [['perch', 3], ['carp', 8], ['pike', 4]]),
    area(3, 55, [['carp', 3], ['pike', 7], ['sturgeon', 3], ['pearl', 1]]),
    area(4, 80, [['pike', 3], ['sturgeon', 7], ['pearl', 2]]),
  ],
  farm: [
    area(1, 0, [['wheat', 10], ['feather', 5]]),
    area(2, 20, [['wheat', 4], ['flax', 8], ['feather', 3]]),
    area(3, 45, [['flax', 3], ['herb', 8], ['wheat', 2]]),
    area(4, 70, [['herb', 4], ['bloodmoss', 6]]),
  ],
};
