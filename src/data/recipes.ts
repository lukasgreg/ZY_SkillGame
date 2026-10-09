import { ARMOUR_FAMILIES, ARMOUR_INFO, PIECE_SHARE, type ArmourFamily, type ArmourSlot, type ItemDefId } from './items';
import type { ResourceId } from './resources';
import type { SkillId } from './skills';

export interface Recipe {
  id: string;
  skill: SkillId;
  /** Skill range in whole points (before the metal offset): can attempt at `min`, no gains at `max`. */
  min: number;
  max: number;
  /** Tool that must be in the pack; it wears by 1 per attempt. */
  tool: ItemDefId;
  /** Bars of the chosen metal (metal recipes only). */
  bars?: number;
  inputs?: Partial<Record<ResourceId, number>>;
  out: { item: ItemDefId } | { res: ResourceId; n: number };
  /** Extra rarity for skill gain (plans use 3). */
  rarity?: number;
}

const smith = (id: ItemDefId, min: number, bars: number, inputs?: Recipe['inputs']): Recipe => ({
  id, skill: 'blacksmithing', min, max: min + 30, tool: 'smithHammer', bars, inputs, out: { item: id },
});
const tinker = (id: ItemDefId, min: number, inputs: Recipe['inputs']): Recipe => ({
  id, skill: 'tinkering', min, max: min + 30, tool: 'tinkerTools', inputs, out: { item: id },
});
const wood = (skill: 'carpentry' | 'bowcraft', id: ItemDefId, min: number, inputs: Recipe['inputs']): Recipe => ({
  id, skill, min, max: min + 30, tool: skill === 'carpentry' ? 'saw' : 'carvingKnife', inputs, out: { item: id },
});
/** Alchemy (Andaria): a mortar, reagents, two potions per brew. */
const brew = (res: ResourceId, min: number, inputs: Recipe['inputs']): Recipe => ({
  id: res, skill: 'alchemy', min, max: min + 35, tool: 'mortar', inputs, out: { res, n: 2 },
});
const cook = (res: ResourceId, min: number, inputs: Recipe['inputs'], n = 1): Recipe => ({
  id: res, skill: 'cooking', min, max: min + 30, tool: 'skillet', inputs, out: { res, n },
});

export const RECIPES: Recipe[] = [
  { id: 'steelBar', skill: 'blacksmithing', min: 30, max: 60, tool: 'smithHammer', inputs: { ironBar: 2, coal: 1 }, out: { res: 'steelBar', n: 1 } },
  smith('dagger', 10, 2),
  smith('buckler', 15, 5),
  smith('shortsword', 20, 5),
  smith('mace', 25, 6),
  smith('longsword', 35, 8),
  smith('heaterShield', 45, 12),
  smith('warHammer', 50, 12, { log: 1 }),
  ...armourRecipes(),

  tinker('tinkerTools', 0, { ironBar: 2 }),
  tinker('shovel', 5, { ironBar: 2, log: 1 }),
  tinker('smithHammer', 10, { ironBar: 3, log: 1 }),
  tinker('pickaxe', 15, { ironBar: 3, log: 1 }),
  tinker('hatchet', 15, { ironBar: 3, log: 1 }),
  tinker('hoe', 10, { ironBar: 2, log: 1 }),
  tinker('saw', 20, { ironBar: 3 }),
  tinker('carvingKnife', 20, { ironBar: 2 }),
  tinker('skillet', 25, { ironBar: 4 }),

  wood('carpentry', 'club', 0, { log: 2 }),
  wood('carpentry', 'fishingRod', 5, { log: 1, flax: 1 }),
  wood('carpentry', 'woodenShield', 15, { log: 4 }),
  wood('carpentry', 'quarterstaff', 25, { oakLog: 3 }),

  { id: 'arrow', skill: 'bowcraft', min: 0, max: 35, tool: 'carvingKnife', inputs: { log: 1, feather: 4 }, out: { res: 'arrow', n: 10 } },
  wood('bowcraft', 'shortbow', 10, { log: 3, flax: 1 }),
  wood('bowcraft', 'longbow', 35, { ashLog: 4, flax: 2 }),
  wood('bowcraft', 'compositeBow', 60, { yewLog: 4, flax: 2, resin: 2 }),

  { id: 'bandage', skill: 'tailoring', min: 0, max: 35, tool: 'sewingKit', inputs: { flax: 1 }, out: { res: 'bandage', n: 3 } },
  { id: 'repairKit', skill: 'tinkering', min: 30, max: 60, tool: 'tinkerTools', inputs: { ironBar: 2, log: 1, resin: 1 }, out: { res: 'repairKit', n: 1 } },
  tinker('sewingKit', 10, { ironBar: 1, flax: 2 }),

  tinker('mortar', 15, { ironBar: 1, stone: 2 }),
  brew('potionLesserHeal', 4, { ginseng: 2 }),
  brew('potionCure', 12, { garlic: 2 }),
  brew('potionAgility', 12, { bloodmoss: 2 }),
  brew('potionStrength', 13, { mandrake: 2 }),
  brew('potionExplosion', 15, { sulfur: 2 }),
  brew('potionPoison', 16, { nightshade: 2 }),
  brew('potionWisdom', 19, { batWing: 2 }),
  brew('potionRefresh', 24, { pearl: 1 }),
  brew('potionStoneskin', 24, { obsidian: 1, mandrake: 1 }),
  brew('potionHeal', 35, { ginseng: 3, herb: 1 }),
  brew('potionGreaterHeal', 65, { ginseng: 3, herb: 2, bloodmoss: 1 }),

  cook('bread', 0, { wheat: 2 }),
  cook('cookedFish', 5, { perch: 1 }),
  cook('fishPie', 25, { carp: 1, wheat: 1 }),
  cook('herbalStew', 45, { pike: 1, herb: 1 }),
  cook('smokedSturgeon', 65, { sturgeon: 1, coal: 1 }),
];

/** Armour pieces: blacksmiths make ring, chain and plate from bars; tailors make leather and studded from hides. */
function armourRecipes(): Recipe[] {
  const familyMin: Record<ArmourFamily, number> = { leather: 0, studded: 25, ring: 25, chain: 35, plate: 55 };
  const pieceOffset: Record<ArmourSlot, number> = { neck: 0, hands: 0, head: 2, arms: 4, legs: 6, chest: 8 };
  const setBars: Partial<Record<ArmourFamily, number>> = { ring: 40, chain: 50, plate: 70 };
  const out: Recipe[] = [];
  for (const [def, info] of Object.entries(ARMOUR_INFO) as [ItemDefId, { family: ArmourFamily; piece: ArmourSlot }][]) {
    const share = PIECE_SHARE[info.piece];
    const min = familyMin[info.family] + pieceOffset[info.piece];
    if (ARMOUR_FAMILIES[info.family].metal) {
      out.push(smith(def, min, Math.max(2, Math.round(setBars[info.family]! * share))));
    } else {
      const inputs: Recipe['inputs'] = { hide: Math.max(1, Math.round(20 * share)) };
      if (info.family === 'studded') inputs.ironBar = Math.max(1, Math.round(8 * share));
      out.push({ id: def, skill: 'tailoring', min, max: min + 30, tool: 'sewingKit', inputs, out: { item: def } });
    }
  }
  return out;
}

export function recipeFor(def: ItemDefId): Recipe | undefined {
  return RECIPES.find((r) => 'item' in r.out && r.out.item === def);
}
