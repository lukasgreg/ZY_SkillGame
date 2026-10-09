import type { Family } from './dungeons';
import type { ResourceId } from './resources';
import type { SkillId } from './skills';

export const ITEM_IDS = [
  // tools
  'pickaxe', 'shovel', 'hatchet', 'fishingRod', 'hoe',
  'smithHammer', 'tinkerTools', 'saw', 'carvingKnife', 'skillet', 'sewingKit',
  // weapons
  'dagger', 'shortsword', 'longsword', 'mace', 'warHammer',
  'club', 'quarterstaff', 'shortbow', 'longbow', 'compositeBow',
  // shields
  'buckler', 'heaterShield', 'woodenShield',
  // armour: five families × six pieces (UO / Andaria)
  'leatherHead', 'leatherNeck', 'leatherChest', 'leatherArms', 'leatherHands', 'leatherLegs',
  'studdedHead', 'studdedNeck', 'studdedChest', 'studdedArms', 'studdedHands', 'studdedLegs',
  'ringHead', 'ringNeck', 'ringChest', 'ringArms', 'ringHands', 'ringLegs',
  'chainHead', 'chainNeck', 'chainChest', 'chainArms', 'chainHands', 'chainLegs',
  'plateHead', 'plateNeck', 'plateChest', 'plateArms', 'plateHands', 'plateLegs',
  // from plans
  'runicHammer', 'reinforcedPack', 'deepBlade', 'ancientBow',
] as const;

export type ItemDefId = (typeof ITEM_IDS)[number];
export type ItemKind = 'tool' | 'weapon' | 'shield' | 'armor' | 'bag';
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
  /** Bags: extra carrying capacity in stones (only the best bag counts). */
  bagBonus?: number;
  gender: Gender;
}

const tool = (id: ItemDefId, toolFor: SkillId, weight: number, maxDur: number, speed: number, price: number, gender: Gender, repairSkill: SkillId = 'tinkering'): ItemDef => ({
  id, kind: 'tool', toolFor, repairSkill, metal: false, weight, maxDur, speed, price, gender,
});
const weapon = (id: ItemDefId, skill: SkillId, dmg: [number, number], speed: number, weight: number, maxDur: number, price: number, gender: Gender, repairSkill: SkillId = 'blacksmithing'): ItemDef => ({
  id, kind: 'weapon', weaponSkill: skill, dmg, repairSkill, metal: repairSkill === 'blacksmithing', weight, maxDur, speed, price, gender,
});
const guard = (id: ItemDefId, kind: 'shield' | 'armor', armor: number, weight: number, maxDur: number, price: number, gender: Gender, repairSkill: SkillId = 'blacksmithing'): ItemDef => ({
  id, kind, armor, repairSkill, metal: repairSkill === 'blacksmithing', weight, maxDur, speed: 1, price, gender,
});

export const ARMOUR_SLOTS = ['head', 'neck', 'chest', 'arms', 'hands', 'legs'] as const;
export type ArmourSlot = (typeof ARMOUR_SLOTS)[number];
export type Slot = 'weapon' | 'shield' | ArmourSlot;
export const SLOTS: Slot[] = ['weapon', 'shield', ...ARMOUR_SLOTS];

/* ---------------- armour families (docs/PLAN_V2.md, phase C) ---------------- */

export type ArmourFamily = 'leather' | 'studded' | 'ring' | 'chain' | 'plate';

export interface ArmourFamilyDef {
  /** Defence of the full six-piece set. */
  setArmor: number;
  setWeight: number;
  minStr: number;
  /** Made from bars (metal variants) or from hides. */
  metal: boolean;
  setPrice: number;
}

export const ARMOUR_FAMILIES: Record<ArmourFamily, ArmourFamilyDef> = {
  leather: { setArmor: 12, setWeight: 9, minStr: 15, metal: false, setPrice: 90 },
  studded: { setArmor: 16, setWeight: 18, minStr: 25, metal: false, setPrice: 150 },
  ring: { setArmor: 22, setWeight: 38, minStr: 28, metal: true, setPrice: 220 },
  chain: { setArmor: 28, setWeight: 45, minStr: 35, metal: true, setPrice: 300 },
  plate: { setArmor: 40, setWeight: 70, minStr: 50, metal: true, setPrice: 480 },
};

/** Each piece's share of the set's defence, weight and materials. */
export const PIECE_SHARE: Record<ArmourSlot, number> = { chest: 0.35, legs: 0.22, arms: 0.14, head: 0.14, neck: 0.08, hands: 0.07 };

/** Czech grammar for adjective agreement: plural nouns (rukávce, rukavice, kalhoty) take the "-é" form, like neuter. */
const PIECE_GENDER: Record<ArmourFamily, Record<ArmourSlot, Gender>> = {
  leather: { head: 'f', neck: 'm', chest: 'f', arms: 'n', hands: 'n', legs: 'n' },
  studded: { head: 'f', neck: 'm', chest: 'f', arms: 'n', hands: 'n', legs: 'n' },
  ring: { head: 'f', neck: 'm', chest: 'f', arms: 'n', hands: 'n', legs: 'n' },
  chain: { head: 'f', neck: 'm', chest: 'f', arms: 'n', hands: 'n', legs: 'n' },
  plate: { head: 'f', neck: 'm', chest: 'm', arms: 'n', hands: 'n', legs: 'n' },
};

export const ARMOUR_INFO: Partial<Record<ItemDefId, { family: ArmourFamily; piece: ArmourSlot }>> = {};

function armourDefs(): Record<string, ItemDef> {
  const out: Record<string, ItemDef> = {};
  for (const [family, f] of Object.entries(ARMOUR_FAMILIES) as [ArmourFamily, ArmourFamilyDef][]) {
    for (const piece of ARMOUR_SLOTS) {
      const id = `${family}${piece[0].toUpperCase()}${piece.slice(1)}` as ItemDefId;
      const share = PIECE_SHARE[piece];
      ARMOUR_INFO[id] = { family, piece };
      out[id] = {
        id, kind: 'armor', armor: Math.round(f.setArmor * share * 10) / 10, metal: f.metal,
        repairSkill: f.metal ? 'blacksmithing' : 'tailoring',
        weight: Math.round(f.setWeight * share * 10) / 10, maxDur: f.metal ? 60 : 45, speed: 1,
        price: Math.round(f.setPrice * share), gender: PIECE_GENDER[family][piece],
      };
    }
  }
  return out;
}

export const ITEMS = {
  pickaxe: tool('pickaxe', 'mining', 4, 50, 1, 30, 'm'),
  shovel: tool('shovel', 'mining', 3, 35, 1.15, 18, 'f'),
  hatchet: tool('hatchet', 'lumberjacking', 4, 50, 1, 26, 'f'),
  fishingRod: tool('fishingRod', 'fishing', 1, 50, 1, 16, 'm', 'carpentry'),
  hoe: tool('hoe', 'farming', 3, 60, 1, 18, 'f'),
  smithHammer: tool('smithHammer', 'blacksmithing', 3, 60, 1, 22, 'n'),
  tinkerTools: tool('tinkerTools', 'tinkering', 2, 50, 1, 20, 'n'),
  saw: tool('saw', 'carpentry', 2, 50, 1, 20, 'f'),
  carvingKnife: tool('carvingKnife', 'bowcraft', 1, 50, 1, 16, 'm'),
  skillet: tool('skillet', 'cooking', 2, 70, 1, 14, 'f'),
  sewingKit: tool('sewingKit', 'tailoring', 1, 50, 1, 12, 'f'),

  dagger: weapon('dagger', 'piercing', [3, 8], 0.7, 1, 40, 16, 'f'),
  shortsword: weapon('shortsword', 'edged', [6, 12], 0.9, 4, 50, 40, 'm'),
  longsword: weapon('longsword', 'edged', [10, 18], 1.1, 6, 60, 64, 'm'),
  mace: weapon('mace', 'blunt', [8, 15], 1.0, 6, 60, 48, 'm'),
  warHammer: weapon('warHammer', 'blunt', [14, 24], 1.4, 10, 70, 100, 'n'),
  club: weapon('club', 'blunt', [5, 10], 0.9, 4, 40, 12, 'm', 'carpentry'),
  quarterstaff: weapon('quarterstaff', 'blunt', [8, 14], 1.0, 4, 50, 30, 'f', 'carpentry'),
  shortbow: weapon('shortbow', 'archery', [6, 12], 1.0, 3, 45, 30, 'm', 'bowcraft'),
  longbow: weapon('longbow', 'archery', [10, 18], 1.2, 4, 55, 70, 'm', 'bowcraft'),
  compositeBow: weapon('compositeBow', 'archery', [14, 22], 1.1, 4, 65, 140, 'm', 'bowcraft'),

  buckler: guard('buckler', 'shield', 3, 5, 50, 40, 'm'),
  heaterShield: guard('heaterShield', 'shield', 7, 10, 70, 96, 'm'),
  woodenShield: guard('woodenShield', 'shield', 4, 6, 50, 34, 'm', 'carpentry'),
  ...(armourDefs() as Record<string, ItemDef>),

  /** Each use while crafting makes a runic item; durability counts charges. */
  runicHammer: { id: 'runicHammer', kind: 'tool', repairSkill: 'blacksmithing', metal: false, weight: 3, maxDur: 5, speed: 1, price: 400, gender: 'n' },
  reinforcedPack: { id: 'reinforcedPack', kind: 'bag', repairSkill: 'tinkering', metal: false, weight: 3, maxDur: 200, speed: 1, price: 260, bagBonus: 50, gender: 'm' },
  deepBlade: { ...weapon('deepBlade', 'edged', [16, 26], 1.0, 6, 120, 900, 'f'), metal: false },
  ancientBow: weapon('ancientBow', 'archery', [18, 28], 1.1, 4, 110, 800, 'm', 'bowcraft'),
} as Record<ItemDefId, ItemDef>;

export const METAL_IDS = ['iron', 'copper', 'steel', 'silver', 'gold', 'darkIron', 'mithril', 'blackrock'] as const;
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
  /** Rare metals need a pattern to craft (docs/PLAN_V2.md, phase E). */
  rare: boolean;
  /** Weapon damage multiplier against monster families (silver vs undead…). */
  slays?: Partial<Record<Family, number>>;
  /** Armour: share of damage still taken from these families (0.75 = 25% less). */
  wards?: Partial<Record<Family, number>>;
  /** Weapon heals this share of the damage it deals. */
  drain?: number;
  /** Weapon: extra share of gold from kills. */
  goldFind?: number;
  /** Item weight multiplier. */
  weightMult?: number;
}

const metal = (d: Omit<MetalDef, 'rare'> & { rare?: boolean }): MetalDef => ({ rare: false, ...d });

export const METALS: Record<MetalId, MetalDef> = {
  iron: metal({ id: 'iron', bar: 'ironBar', offset: 0, durMult: 1, priceMult: 1, rarity: 0, dmgMult: 1, armorMult: 1 }),
  copper: metal({ id: 'copper', bar: 'copperBar', offset: 15, durMult: 1.1, priceMult: 1.6, rarity: 0.3, dmgMult: 1.05, armorMult: 1.05 }),
  steel: metal({ id: 'steel', bar: 'steelBar', offset: 10, durMult: 1.3, priceMult: 1.8, rarity: 0.4, dmgMult: 1.1, armorMult: 1.15 }),
  silver: metal({ id: 'silver', bar: 'silverBar', offset: 25, durMult: 1.15, priceMult: 2.6, rarity: 0.6, dmgMult: 1.1, armorMult: 1.1, rare: true, slays: { undead: 1.5 }, wards: { undead: 0.75 } }),
  gold: metal({ id: 'gold', bar: 'goldBar', offset: 35, durMult: 0.9, priceMult: 4, rarity: 1, dmgMult: 1, armorMult: 1, rare: true, goldFind: 0.25 }),
  darkIron: metal({ id: 'darkIron', bar: 'darkIronBar', offset: 45, durMult: 1.4, priceMult: 6, rarity: 1.5, dmgMult: 1.2, armorMult: 1.2, rare: true, drain: 0.15 }),
  mithril: metal({ id: 'mithril', bar: 'mithrilBar', offset: 50, durMult: 1.8, priceMult: 8, rarity: 2, dmgMult: 1.3, armorMult: 1.35, rare: true, weightMult: 0.5 }),
  blackrock: metal({ id: 'blackrock', bar: 'blackrockBar', offset: 55, durMult: 1.6, priceMult: 9, rarity: 2.2, dmgMult: 1.25, armorMult: 1.3, rare: true, slays: { gnarl: 1.5, dragon: 1.5 }, wards: { gnarl: 0.8, dragon: 0.8 } }),
};

/** Carried weight of an item (mithril is half as heavy). */
export function itemWeight(def: ItemDefId, mat?: MetalId): number {
  return ITEMS[def].weight * (mat ? METALS[mat].weightMult ?? 1 : 1);
}

/** Where an item is worn, if it can be. */
export function slotOf(def: ItemDefId): Slot | null {
  const d = ITEMS[def];
  if (d.kind === 'weapon') return 'weapon';
  if (d.kind === 'shield') return 'shield';
  return ARMOUR_INFO[def]?.piece ?? null;
}

/** Strength needed to wear an item (armour families only). */
export function minStr(def: ItemDefId): number {
  const a = ARMOUR_INFO[def];
  return a ? ARMOUR_FAMILIES[a.family].minStr : 0;
}

/** Durability state words (design 4b). */
export type DurState = 'pristine' | 'worn' | 'damaged' | 'failing';

export function durState(dur: number, maxDur: number): DurState {
  const f = maxDur > 0 ? dur / maxDur : 0;
  if (f >= 0.75) return 'pristine';
  if (f >= 0.4) return 'worn';
  if (f >= 0.15) return 'damaged';
  return 'failing';
}
