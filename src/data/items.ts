import type { ResourceId } from './resources';
import type { SkillId } from './skills';

export const ITEM_IDS = [
  // tools
  'pickaxe', 'shovel', 'hatchet', 'smithHammer', 'tinkerTools',
  // weapons
  'dagger', 'shortsword', 'longsword', 'mace', 'warHammer',
  // shields
  'buckler', 'heaterShield',
  // armor
  'chainCoif', 'ringmailTunic', 'plateHelm', 'platemail',
] as const;

export type ItemDefId = (typeof ITEM_IDS)[number];
export type ItemKind = 'tool' | 'weapon' | 'shield' | 'armor';
/** Grammatical gender of the Czech name, for adjective agreement (měděný meč / měděná dýka / měděné kladivo). */
export type Gender = 'm' | 'f' | 'n';

export interface ItemDef {
  id: ItemDefId;
  kind: ItemKind;
  /** For tools: the skill the tool is used for. */
  toolFor?: SkillId;
  /** The crafting skill used to repair it. */
  repairSkill: SkillId;
  /** Made from bars, so it comes in metal variants. */
  metal: boolean;
  weight: number;
  maxDur: number;
  /** Tools: action time multiplier (lower is faster). Weapons: swing speed class. */
  speed: number;
  /** Base value in gold (iron, normal quality, full durability). */
  price: number;
  weaponSkill?: SkillId;
  dmg?: [number, number];
  armor?: number;
  gender: Gender;
}

const tool = (id: ItemDefId, toolFor: SkillId, weight: number, maxDur: number, speed: number, price: number, gender: Gender): ItemDef => ({
  id, kind: 'tool', toolFor, repairSkill: 'tinkering', metal: false, weight, maxDur, speed, price, gender,
});
const weapon = (id: ItemDefId, skill: SkillId, dmg: [number, number], speed: number, weight: number, maxDur: number, price: number, gender: Gender): ItemDef => ({
  id, kind: 'weapon', weaponSkill: skill, dmg, repairSkill: 'blacksmithing', metal: true, weight, maxDur, speed, price, gender,
});
const guard = (id: ItemDefId, kind: 'shield' | 'armor', armor: number, weight: number, maxDur: number, price: number, gender: Gender): ItemDef => ({
  id, kind, armor, repairSkill: 'blacksmithing', metal: true, weight, maxDur, speed: 1, price, gender,
});

export const ITEMS: Record<ItemDefId, ItemDef> = {
  pickaxe: tool('pickaxe', 'mining', 4, 50, 1, 30, 'm'),
  shovel: tool('shovel', 'mining', 3, 35, 1.15, 18, 'f'),
  hatchet: tool('hatchet', 'lumberjacking', 4, 50, 1, 26, 'f'),
  smithHammer: tool('smithHammer', 'blacksmithing', 3, 60, 1, 22, 'n'),
  tinkerTools: tool('tinkerTools', 'tinkering', 2, 50, 1, 20, 'n'),

  dagger: weapon('dagger', 'piercing', [3, 8], 0.7, 1, 40, 16, 'f'),
  shortsword: weapon('shortsword', 'edged', [6, 12], 0.9, 4, 50, 40, 'm'),
  longsword: weapon('longsword', 'edged', [10, 18], 1.1, 6, 60, 64, 'm'),
  mace: weapon('mace', 'blunt', [8, 15], 1.0, 6, 60, 48, 'm'),
  warHammer: weapon('warHammer', 'blunt', [14, 24], 1.4, 10, 70, 100, 'n'),

  buckler: guard('buckler', 'shield', 3, 5, 50, 40, 'm'),
  heaterShield: guard('heaterShield', 'shield', 7, 10, 70, 96, 'm'),
  chainCoif: guard('chainCoif', 'armor', 3, 3, 45, 48, 'f'),
  ringmailTunic: guard('ringmailTunic', 'armor', 6, 12, 60, 110, 'f'),
  plateHelm: guard('plateHelm', 'armor', 5, 5, 60, 80, 'f'),
  platemail: guard('platemail', 'armor', 12, 25, 80, 200, 'f'),
};

export const METAL_IDS = ['iron', 'steel', 'copper', 'silver', 'gold', 'mithril'] as const;
export type MetalId = (typeof METAL_IDS)[number];

export interface MetalDef {
  id: MetalId;
  bar: ResourceId;
  /** Added to a recipe's min/max skill when crafted in this metal. */
  offset: number;
  durMult: number;
  priceMult: number;
  /** Boosts skill gain like rare resources do. */
  rarity: number;
  dmgMult: number;
  armorMult: number;
}

export const METALS: Record<MetalId, MetalDef> = {
  iron: { id: 'iron', bar: 'ironBar', offset: 0, durMult: 1, priceMult: 1, rarity: 0, dmgMult: 1, armorMult: 1 },
  steel: { id: 'steel', bar: 'steelBar', offset: 10, durMult: 1.3, priceMult: 1.8, rarity: 0.4, dmgMult: 1.1, armorMult: 1.15 },
  copper: { id: 'copper', bar: 'copperBar', offset: 15, durMult: 1.1, priceMult: 1.6, rarity: 0.3, dmgMult: 1.05, armorMult: 1.05 },
  silver: { id: 'silver', bar: 'silverBar', offset: 25, durMult: 1.15, priceMult: 2.6, rarity: 0.6, dmgMult: 1.1, armorMult: 1.1 },
  gold: { id: 'gold', bar: 'goldBar', offset: 35, durMult: 0.9, priceMult: 4, rarity: 1, dmgMult: 1, armorMult: 1 },
  mithril: { id: 'mithril', bar: 'mithrilBar', offset: 50, durMult: 1.8, priceMult: 8, rarity: 2, dmgMult: 1.3, armorMult: 1.35 },
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
