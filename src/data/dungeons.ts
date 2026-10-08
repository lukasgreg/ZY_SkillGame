import type { ResourceId } from './resources';

export const MONSTER_IDS = [
  'rat', 'smuggler', 'thug', 'smugglerChief',
  'iceBat', 'frostWolf', 'caveTroll', 'frostfang',
  'skeleton', 'ghoul', 'wraith', 'hollowLord',
  'zombie', 'boneKnight', 'lichAcolyte', 'bonepriest',
  'gnarlScout', 'gnarlBrute', 'gnarlShaman', 'gnarlWarlord',
  'boar', 'wolf', 'bear', 'direwolf', 'drake',
] as const;
export type MonsterId = (typeof MONSTER_IDS)[number];

export interface MonsterDef {
  id: MonsterId;
  hp: number;
  /** Fighting skill in whole points: used for its hit chance, your hit chance against it, and skill gain limits. */
  skill: number;
  dmg: [number, number];
  armor: number;
  /** Initiative bonus. */
  speed: number;
  gold: [number, number];
  /** Extra drops: [resource, chance, min, max]. */
  drops?: [ResourceId, number, number, number][];
}

const m = (id: MonsterId, hp: number, skill: number, dmg: [number, number], armor: number, speed: number, gold: [number, number], drops?: MonsterDef['drops']): MonsterDef => ({
  id, hp, skill, dmg, armor, speed, gold, drops,
});

export const MONSTERS: Record<MonsterId, MonsterDef> = {
  rat: m('rat', 12, 15, [2, 5], 0, 12, [0, 3]),
  smuggler: m('smuggler', 25, 25, [3, 8], 1, 8, [3, 10], [['bandage', 0.2, 1, 3]]),
  thug: m('thug', 45, 35, [5, 10], 2, 6, [10, 25], [['planFragment', 0.08, 1, 1]]),
  smugglerChief: m('smugglerChief', 90, 42, [6, 12], 3, 8, [60, 120], [['planFragment', 0.6, 1, 2], ['wayHome', 0.3, 1, 1]]),

  iceBat: m('iceBat', 18, 28, [3, 6], 0, 16, [2, 6]),
  frostWolf: m('frostWolf', 38, 38, [5, 10], 1, 12, [4, 12]),
  caveTroll: m('caveTroll', 80, 45, [8, 14], 3, 3, [20, 45], [['planFragment', 0.12, 1, 1]]),
  frostfang: m('frostfang', 150, 55, [10, 18], 4, 10, [120, 220], [['dragonScale', 0.5, 1, 2], ['planFragment', 0.6, 1, 2], ['wayHome', 0.3, 1, 1]]),

  skeleton: m('skeleton', 42, 48, [6, 11], 3, 8, [6, 18]),
  ghoul: m('ghoul', 58, 52, [7, 13], 2, 7, [8, 20]),
  wraith: m('wraith', 75, 62, [10, 16], 0, 14, [25, 60], [['etherealOre', 0.25, 1, 2], ['planFragment', 0.15, 1, 1]]),
  hollowLord: m('hollowLord', 200, 68, [12, 20], 5, 9, [200, 350], [['etherealOre', 0.7, 2, 4], ['planFragment', 0.8, 1, 3], ['wayHome', 0.4, 1, 1]]),

  zombie: m('zombie', 72, 58, [9, 15], 3, 4, [10, 25]),
  boneKnight: m('boneKnight', 95, 72, [12, 18], 6, 7, [18, 40]),
  lichAcolyte: m('lichAcolyte', 105, 78, [14, 22], 3, 10, [40, 90], [['etherealOre', 0.35, 1, 2], ['planFragment', 0.2, 1, 1]]),
  bonepriest: m('bonepriest', 280, 84, [16, 26], 6, 10, [300, 500], [['etherealOre', 0.8, 3, 5], ['planFragment', 1, 2, 3], ['wayHome', 0.5, 1, 1]]),

  gnarlScout: m('gnarlScout', 65, 68, [10, 16], 3, 14, [15, 35]),
  gnarlBrute: m('gnarlBrute', 115, 78, [14, 24], 6, 5, [25, 55]),
  gnarlShaman: m('gnarlShaman', 125, 88, [16, 26], 4, 11, [60, 120], [['etherealOre', 0.4, 1, 3], ['planFragment', 0.25, 1, 1]]),
  gnarlWarlord: m('gnarlWarlord', 400, 96, [20, 32], 8, 10, [500, 900], [['dragonScale', 0.8, 2, 4], ['planFragment', 1, 2, 4], ['wayHome', 0.6, 1, 2]]),

  boar: m('boar', 30, 30, [4, 9], 1, 9, [0, 2]),
  wolf: m('wolf', 36, 38, [5, 10], 1, 13, [0, 2]),
  bear: m('bear', 70, 50, [8, 15], 2, 7, [0, 4]),
  direwolf: m('direwolf', 90, 64, [11, 18], 2, 14, [5, 15], [['planFragment', 0.1, 1, 1]]),
  drake: m('drake', 220, 85, [16, 26], 5, 11, [80, 160], [['dragonScale', 0.9, 2, 4], ['planFragment', 0.6, 1, 2]]),
};

/** Animals a ranger can tame (design 7): Taming needed and control slots used (max 5). */
export const TAMEABLE: Partial<Record<MonsterId, { min: number; slots: number }>> = {
  rat: { min: 0, slots: 1 },
  iceBat: { min: 15, slots: 1 },
  boar: { min: 20, slots: 1 },
  wolf: { min: 30, slots: 1 },
  frostWolf: { min: 40, slots: 1 },
  bear: { min: 50, slots: 2 },
  direwolf: { min: 65, slots: 2 },
  drake: { min: 85, slots: 3 },
};

export const MAX_CONTROL_SLOTS = 5;

export const DUNGEON_IDS = ['wilds', 'cellar', 'frostCave', 'manor', 'crypt', 'warrens'] as const;
export type DungeonId = (typeof DUNGEON_IDS)[number];

export interface DungeonDef {
  id: DungeonId;
  /** Andaria-style ratings: skulls = difficulty 1–5, clocks = length 1–5. */
  skulls: number;
  clocks: number;
  /** Ordinary monsters, the elite and the boss. */
  pool: MonsterId[];
  elite: MonsterId;
  boss: MonsterId;
  /** Treasure gold range for chests. */
  chest: [number, number];
}

export const DUNGEONS: Record<DungeonId, DungeonDef> = {
  wilds: { id: 'wilds', skulls: 2, clocks: 1, pool: ['boar', 'wolf'], elite: 'bear', boss: 'drake', chest: [10, 40] },
  cellar: { id: 'cellar', skulls: 1, clocks: 1, pool: ['rat', 'smuggler'], elite: 'thug', boss: 'smugglerChief', chest: [20, 60] },
  frostCave: { id: 'frostCave', skulls: 2, clocks: 2, pool: ['iceBat', 'frostWolf'], elite: 'caveTroll', boss: 'frostfang', chest: [40, 120] },
  manor: { id: 'manor', skulls: 3, clocks: 2, pool: ['skeleton', 'ghoul'], elite: 'wraith', boss: 'hollowLord', chest: [80, 200] },
  crypt: { id: 'crypt', skulls: 4, clocks: 4, pool: ['zombie', 'boneKnight'], elite: 'lichAcolyte', boss: 'bonepriest', chest: [140, 320] },
  warrens: { id: 'warrens', skulls: 5, clocks: 5, pool: ['gnarlScout', 'gnarlBrute'], elite: 'gnarlShaman', boss: 'gnarlWarlord', chest: [250, 500] },
};

/** Seconds a dead character's corpse lasts before it decays with everything on it (design 6.4). */
export const CORPSE_MS = 5 * 60_000;
