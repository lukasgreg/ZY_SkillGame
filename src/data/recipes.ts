import type { ItemDefId } from './items';
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
}

const smith = (id: ItemDefId, min: number, bars: number, inputs?: Recipe['inputs']): Recipe => ({
  id, skill: 'blacksmithing', min, max: min + 30, tool: 'smithHammer', bars, inputs, out: { item: id },
});
const tinker = (id: ItemDefId, min: number, inputs: Recipe['inputs']): Recipe => ({
  id, skill: 'tinkering', min, max: min + 30, tool: 'tinkerTools', inputs, out: { item: id },
});

export const RECIPES: Recipe[] = [
  { id: 'steelBar', skill: 'blacksmithing', min: 30, max: 60, tool: 'smithHammer', inputs: { ironBar: 2, coal: 1 }, out: { res: 'steelBar', n: 1 } },
  smith('dagger', 10, 2),
  smith('buckler', 15, 5),
  smith('shortsword', 20, 5),
  smith('mace', 25, 6),
  smith('chainCoif', 30, 6),
  smith('longsword', 35, 8),
  smith('ringmailTunic', 40, 14),
  smith('heaterShield', 45, 12),
  smith('warHammer', 50, 12, { log: 1 }),
  smith('plateHelm', 55, 10),
  smith('platemail', 65, 25),

  tinker('tinkerTools', 0, { ironBar: 2 }),
  tinker('shovel', 5, { ironBar: 2, log: 1 }),
  tinker('smithHammer', 10, { ironBar: 3, log: 1 }),
  tinker('pickaxe', 15, { ironBar: 3, log: 1 }),
  tinker('hatchet', 15, { ironBar: 3, log: 1 }),
];

export function recipeFor(def: ItemDefId): Recipe | undefined {
  return RECIPES.find((r) => 'item' in r.out && r.out.item === def);
}
