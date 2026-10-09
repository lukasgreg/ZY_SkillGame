export type StatId = 'str' | 'dex' | 'int';

export const SKILL_IDS = [
  // gathering
  'mining', 'lumberjacking', 'fishing', 'farming',
  // crafting
  'blacksmithing', 'carpentry', 'bowcraft', 'tailoring', 'tinkering', 'cooking', 'alchemy',
  // combat
  'edged', 'blunt', 'piercing', 'archery', 'tactics', 'anatomy', 'shieldBlock', 'weaponLore', 'healing',
  // wilderness
  'taming', 'animalHealing', 'animalLore', 'tracking', 'camping', 'herding',
] as const;

export type SkillId = (typeof SKILL_IDS)[number];

export type SkillCategory = 'gathering' | 'crafting' | 'combat' | 'wilderness';

export interface SkillDef {
  id: SkillId;
  category: SkillCategory;
  /** Which stats grow when this skill is used. Weights sum to 1. */
  stats: Partial<Record<StatId, number>>;
}

const def = (id: SkillId, category: SkillCategory, stats: SkillDef['stats']): SkillDef => ({ id, category, stats });

export const SKILLS: Record<SkillId, SkillDef> = {
  mining: def('mining', 'gathering', { str: 0.8, dex: 0.2 }),
  lumberjacking: def('lumberjacking', 'gathering', { str: 0.7, dex: 0.3 }),
  fishing: def('fishing', 'gathering', { dex: 0.6, str: 0.4 }),
  farming: def('farming', 'gathering', { str: 0.5, int: 0.5 }),
  blacksmithing: def('blacksmithing', 'crafting', { str: 0.7, int: 0.3 }),
  carpentry: def('carpentry', 'crafting', { str: 0.5, dex: 0.5 }),
  bowcraft: def('bowcraft', 'crafting', { dex: 0.7, str: 0.3 }),
  tailoring: def('tailoring', 'crafting', { dex: 0.7, int: 0.3 }),
  tinkering: def('tinkering', 'crafting', { dex: 0.5, int: 0.5 }),
  cooking: def('cooking', 'crafting', { int: 0.6, dex: 0.4 }),
  alchemy: def('alchemy', 'crafting', { int: 0.7, dex: 0.3 }),
  edged: def('edged', 'combat', { str: 0.6, dex: 0.4 }),
  blunt: def('blunt', 'combat', { str: 0.8, dex: 0.2 }),
  piercing: def('piercing', 'combat', { dex: 0.8, str: 0.2 }),
  archery: def('archery', 'combat', { dex: 0.8, str: 0.2 }),
  tactics: def('tactics', 'combat', { str: 0.5, dex: 0.5 }),
  anatomy: def('anatomy', 'combat', { int: 0.6, str: 0.4 }),
  shieldBlock: def('shieldBlock', 'combat', { dex: 0.6, str: 0.4 }),
  weaponLore: def('weaponLore', 'combat', { int: 0.7, str: 0.3 }),
  healing: def('healing', 'combat', { int: 0.6, dex: 0.4 }),
  taming: def('taming', 'wilderness', { int: 0.6, str: 0.4 }),
  animalHealing: def('animalHealing', 'wilderness', { int: 0.6, dex: 0.4 }),
  animalLore: def('animalLore', 'wilderness', { int: 1 }),
  tracking: def('tracking', 'wilderness', { int: 0.6, dex: 0.4 }),
  camping: def('camping', 'wilderness', { int: 0.5, dex: 0.5 }),
  herding: def('herding', 'wilderness', { int: 0.5, dex: 0.5 }),
};

/** Skill values are stored as integer tenths: 184 means 18.4. */
export const SKILL_MAX = 1000;
export const TOTAL_SKILL_CAP = 7000;
export const TOTAL_STAT_CAP = 225;

export const fmtSkill = (tenths: number) => (tenths / 10).toFixed(1);
