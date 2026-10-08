import type { SkillId, StatId } from './skills';

export type ProfessionId = 'craftsman' | 'warrior' | 'ranger';
export type RaceId = 'human' | 'elf' | 'barbarian';

export interface ProfessionDef {
  id: ProfessionId;
  /** Per-skill maximum in whole points (Andaria style). Unlisted skills use `defaultCap`. */
  caps: Partial<Record<SkillId, number>>;
  defaultCap: number;
  statStart: Record<StatId, number>;
  statCaps: Record<StatId, number>;
  /** Starting skill ranges in whole points [min, max]. Everything else starts at 0. */
  startSkills: Partial<Record<SkillId, [number, number]>>;
  startGold: number;
}

export const PROFESSIONS: Record<ProfessionId, ProfessionDef> = {
  craftsman: {
    id: 'craftsman',
    caps: {
      mining: 100, lumberjacking: 100, blacksmithing: 100, carpentry: 100, tinkering: 100, bowcraft: 100, tailoring: 100,
      cooking: 100, weaponLore: 100, farming: 100,
      fishing: 60, herding: 70, camping: 50, archery: 40, tactics: 40, blunt: 50, edged: 20, piercing: 30,
      healing: 30, anatomy: 20, shieldBlock: 20, taming: 30, animalLore: 30, tracking: 30, animalHealing: 0,
    },
    defaultCap: 30,
    statStart: { str: 40, dex: 40, int: 20 },
    statCaps: { str: 90, dex: 90, int: 70 },
    startSkills: {
      blacksmithing: [20, 30], mining: [15, 25], carpentry: [15, 25],
      lumberjacking: [10, 20], tinkering: [10, 20], bowcraft: [5, 15],
    },
    startGold: 100,
  },
  warrior: {
    id: 'warrior',
    caps: {
      edged: 100, blunt: 100, shieldBlock: 100, tactics: 100, weaponLore: 100, cooking: 100,
      piercing: 80, archery: 80, anatomy: 80, blacksmithing: 50, fishing: 50, camping: 50, healing: 40,
      mining: 30, lumberjacking: 30, carpentry: 30, tinkering: 30, bowcraft: 30, tailoring: 30, farming: 30,
      taming: 30, animalHealing: 30, animalLore: 30, tracking: 30, herding: 30,
    },
    defaultCap: 30,
    statStart: { str: 50, dex: 35, int: 15 },
    statCaps: { str: 100, dex: 85, int: 65 },
    startSkills: {
      blunt: [20, 30], edged: [20, 30], tactics: [10, 20],
      shieldBlock: [10, 20], healing: [5, 15], weaponLore: [5, 15],
    },
    startGold: 60,
  },
  ranger: {
    id: 'ranger',
    caps: {
      archery: 100, taming: 100, animalHealing: 100, tracking: 100, herding: 100, animalLore: 100,
      cooking: 100, camping: 100, fishing: 100, bowcraft: 90, edged: 80, healing: 70, anatomy: 50,
      tactics: 40, piercing: 40, blunt: 40, shieldBlock: 40, farming: 50,
      mining: 30, lumberjacking: 30, blacksmithing: 30, carpentry: 30, tinkering: 30, tailoring: 30, weaponLore: 30,
    },
    defaultCap: 30,
    statStart: { str: 35, dex: 35, int: 30 },
    statCaps: { str: 85, dex: 85, int: 80 },
    startSkills: {
      archery: [20, 30], taming: [15, 25], animalHealing: [10, 20],
      tracking: [10, 20], healing: [5, 15], animalLore: [5, 15],
    },
    startGold: 60,
  },
};

export interface RaceDef {
  id: RaceId;
  /** Stat modifiers rolled in [min, max]. Human rolls a −1..−5 penalty to STR *or* INT. */
  statMods: Partial<Record<StatId, [number, number]>>;
  humanPenalty?: boolean;
  /** Skills that get +1.5..+5.0 at creation. */
  skillBonus: SkillId[];
  /** Seconds to regenerate one point of hp / stamina / mana. */
  regen: { hp: number; stamina: number; mana: number };
}

export const RACES: Record<RaceId, RaceDef> = {
  human: { id: 'human', statMods: { dex: [1, 5] }, humanPenalty: true, skillBonus: ['carpentry', 'edged'], regen: { hp: 3, stamina: 5, mana: 5 } },
  elf: { id: 'elf', statMods: { int: [1, 5], str: [-5, -1] }, skillBonus: ['archery', 'bowcraft'], regen: { hp: 4, stamina: 5, mana: 3 } },
  barbarian: { id: 'barbarian', statMods: { str: [1, 5], int: [-5, -1] }, skillBonus: ['blacksmithing', 'blunt', 'herding'], regen: { hp: 2, stamina: 6, mana: 5 } },
};

export function skillCap(prof: ProfessionId, skill: SkillId): number {
  const p = PROFESSIONS[prof];
  return (p.caps[skill] ?? p.defaultCap) * 10;
}
