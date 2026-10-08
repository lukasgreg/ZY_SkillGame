export const RESOURCE_IDS = [
  'ironOre', 'copperOre', 'silverOre', 'goldOre', 'mithrilOre',
  'clay', 'stone', 'coal', 'sandstone', 'marble', 'obsidian', 'sulfur', 'roughGem',
  'ironBar', 'steelBar', 'copperBar', 'silverBar', 'goldBar', 'mithrilBar',
  'log',
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
}

const r = (id: ResourceId, weight: number, price: number, rarity: number): ResourceDef => ({ id, weight, price, rarity });

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
 * Mining yields (Andaria model): `min` is the skill needed to extract it, `best` the skill at
 * which yield peaks. `perPull` is the max amount from one successful pull at full yield.
 */
export interface MiningYield {
  res: ResourceId;
  min: number;
  best: number;
  perPull: number;
}

export const MINING_YIELDS: Partial<Record<ResourceId, MiningYield>> = {
  ironOre: { res: 'ironOre', min: 0, best: 30, perPull: 3 },
  copperOre: { res: 'copperOre', min: 30, best: 60, perPull: 3 },
  silverOre: { res: 'silverOre', min: 45, best: 75, perPull: 2 },
  goldOre: { res: 'goldOre', min: 60, best: 90, perPull: 2 },
  mithrilOre: { res: 'mithrilOre', min: 80, best: 110, perPull: 1 },
  clay: { res: 'clay', min: 0, best: 50, perPull: 5 },
  stone: { res: 'stone', min: 2, best: 60, perPull: 4 },
  coal: { res: 'coal', min: 10, best: 70, perPull: 4 },
  sandstone: { res: 'sandstone', min: 25, best: 75, perPull: 3 },
  marble: { res: 'marble', min: 30, best: 90, perPull: 3 },
  obsidian: { res: 'obsidian', min: 30, best: 100, perPull: 2 },
  sulfur: { res: 'sulfur', min: 40, best: 100, perPull: 3 },
  roughGem: { res: 'roughGem', min: 75, best: 110, perPull: 1 },
};

export type MineLevelId = 1 | 2 | 3 | 4;

export interface MineLevel {
  id: MineLevelId;
  /** Resources found on this level, with spawn weights for veins. */
  veins: [ResourceId, number][];
  /** Mining skill (whole points) needed to work this level. */
  need: number;
  /** Held by the Gnarl: must be cleared (later milestone) before mining. */
  gnarlHeld: boolean;
}

export const MINE_LEVELS: MineLevel[] = [
  { id: 1, veins: [['ironOre', 10], ['stone', 4], ['clay', 3], ['coal', 3]], need: 0, gnarlHeld: false },
  { id: 2, veins: [['ironOre', 4], ['copperOre', 8], ['silverOre', 4], ['coal', 3], ['sandstone', 3], ['marble', 2]], need: 30, gnarlHeld: false },
  { id: 3, veins: [['copperOre', 3], ['silverOre', 6], ['goldOre', 5], ['marble', 3], ['obsidian', 2], ['sulfur', 2], ['roughGem', 1]], need: 55, gnarlHeld: false },
  { id: 4, veins: [['goldOre', 5], ['mithrilOre', 3], ['obsidian', 3], ['roughGem', 2]], need: 80, gnarlHeld: true },
];
