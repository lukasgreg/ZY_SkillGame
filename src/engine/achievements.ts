import { DUNGEON_IDS } from '../data/dungeons';
import { SKILL_IDS } from '../data/skills';
import { MAX_BUNKHOUSE } from './workers';
import { log, type GameState, type Stats } from './state';

export type AchievementGroup = 'work' | 'skill' | 'craft' | 'trade' | 'adventure' | 'wild';

interface AchievementDef {
  id: string;
  group: AchievementGroup;
  /** Hidden until earned (shown as "???"). */
  secret?: boolean;
  test: (s: GameState) => boolean;
}

const bestSkill = (s: GameState) => Math.max(0, ...s.chars.flatMap((c) => SKILL_IDS.map((id) => c.skills[id])));
const totalSkill = (s: GameState) => Math.max(0, ...s.chars.map((c) => SKILL_IDS.reduce((n, id) => n + c.skills[id], 0)));
const wealth = (s: GameState) => s.bank.gold + s.chars.reduce((n, c) => n + c.gold, 0);

const a = (id: string, group: AchievementGroup, test: AchievementDef['test'], secret = false): AchievementDef => ({ id, group, test, secret });

export const ACHIEVEMENTS: AchievementDef[] = [
  a('firstPull', 'work', (s) => s.stats.pulls >= 1),
  a('pulls500', 'work', (s) => s.stats.pulls >= 500),
  a('pulls5000', 'work', (s) => s.stats.pulls >= 5000),
  a('firstWorker', 'work', (s) => s.stats.hires >= 1),
  a('fullBunkhouse', 'work', (s) => s.bunkhouse >= MAX_BUNKHOUSE),

  a('skill30', 'skill', (s) => bestSkill(s) >= 300),
  a('skill50', 'skill', (s) => bestSkill(s) >= 500),
  a('skill80', 'skill', (s) => bestSkill(s) >= 800),
  a('skill100', 'skill', (s) => bestSkill(s) >= 1000),
  a('total300', 'skill', (s) => totalSkill(s) >= 3000),
  a('total700', 'skill', (s) => totalSkill(s) >= 7000),

  a('firstCraft', 'craft', (s) => s.stats.crafts >= 1),
  a('crafts250', 'craft', (s) => s.stats.crafts >= 250),
  a('exceptional', 'craft', (s) => s.stats.exceptional >= 1),
  a('exceptional50', 'craft', (s) => s.stats.exceptional >= 50),
  a('runic', 'craft', (s) => s.stats.runic >= 1),
  a('plan', 'craft', (s) => s.stats.plans >= 1),

  a('firstSale', 'trade', (s) => s.stats.sales >= 1),
  a('rep30', 'trade', (s) => s.reputation >= 30),
  a('contract', 'trade', (s) => s.stats.contracts >= 1),
  a('contracts10', 'trade', (s) => s.stats.contracts >= 10),
  a('gold1k', 'trade', (s) => wealth(s) >= 1000),
  a('gold10k', 'trade', (s) => wealth(s) >= 10000),

  a('firstKill', 'adventure', (s) => s.stats.kills >= 1),
  a('kills200', 'adventure', (s) => s.stats.kills >= 200),
  a('boss', 'adventure', (s) => s.stats.bosses >= 1),
  a('allBosses', 'adventure', (s) => DUNGEON_IDS.every((id) => s.cleared.includes(id))),
  a('warrens', 'adventure', (s) => s.cleared.includes('warrens')),
  a('died', 'adventure', (s) => s.stats.deaths >= 1, true),
  a('recovered', 'adventure', (s) => s.stats.recovered >= 1, true),

  a('tame', 'wild', (s) => s.stats.tamed >= 1),
  a('bonded', 'wild', (s) => s.chars.some((c) => c.pets.some((p) => p.bonded))),
  a('fullPack', 'wild', (s) => s.chars.some((c) => c.pets.length >= 3)),
];

/** Unlocks anything newly earned. Returns the ids unlocked by this call. */
export function checkAchievements(s: GameState, now = Date.now()): string[] {
  const got: string[] = [];
  for (const def of ACHIEVEMENTS) {
    if (s.achievements[def.id] || !def.test(s)) continue;
    s.achievements[def.id] = now;
    got.push(def.id);
    log(s, 'log.achievement', { name: `@ach.${def.id}` }, 'gain');
  }
  return got;
}

export function bump(s: GameState, key: keyof Stats, n = 1): void {
  s.stats[key] += n;
}
