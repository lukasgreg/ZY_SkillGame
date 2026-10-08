import type { SkillId } from './skills';

export type ItemDefId = 'pickaxe' | 'shovel';

export interface ItemDef {
  id: ItemDefId;
  kind: 'tool';
  /** The gathering skill this tool is used for. */
  toolFor: SkillId;
  /** The crafting skill used to repair it. */
  repairSkill: SkillId;
  weight: number;
  maxDur: number;
  /** Action time multiplier (lower is faster). */
  speed: number;
  /** Price at the provisioner. */
  price: number;
}

export const ITEMS: Record<ItemDefId, ItemDef> = {
  pickaxe: { id: 'pickaxe', kind: 'tool', toolFor: 'mining', repairSkill: 'tinkering', weight: 4, maxDur: 50, speed: 1, price: 30 },
  shovel: { id: 'shovel', kind: 'tool', toolFor: 'mining', repairSkill: 'tinkering', weight: 3, maxDur: 35, speed: 1.15, price: 18 },
};

/** Durability state words (design 4b). */
export type DurState = 'pristine' | 'worn' | 'damaged' | 'failing';

export function durState(dur: number, maxDur: number): DurState {
  const f = maxDur > 0 ? dur / maxDur : 0;
  if (f >= 0.75) return 'pristine';
  if (f >= 0.4) return 'worn';
  if (f >= 0.15) return 'damaged';
  return 'failing';
}
