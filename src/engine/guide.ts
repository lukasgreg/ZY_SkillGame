import { gainXp } from './levels';
import type { Character, GameState } from './state';

/** The beginner's guide (docs/PLAN_V3.md, phase M): small goals with small rewards. */
export interface GuideStep {
  id: string;
  done: (s: GameState, c: Character) => boolean;
  gold: number;
  xp: number;
}

export const GUIDE: GuideStep[] = [
  { id: 'gather', done: (s) => s.stats.pulls >= 10, gold: 20, xp: 50 },
  { id: 'craft', done: (s) => s.stats.crafts >= 1, gold: 30, xp: 60 },
  { id: 'sell', done: (s) => s.stats.sales >= 1, gold: 40, xp: 80 },
  { id: 'kill', done: (s) => s.stats.kills >= 1, gold: 40, xp: 80 },
  { id: 'contract', done: (s) => s.stats.contracts >= 1, gold: 60, xp: 150 },
  { id: 'boss', done: (s) => s.stats.bosses >= 1, gold: 100, xp: 250 },
  { id: 'tame', done: (s) => s.stats.tamed >= 1, gold: 50, xp: 100 },
  { id: 'home', done: (s) => !!s.house, gold: 0, xp: 150 },
];

export function guideDone(s: GameState): string[] {
  return s.guide ?? [];
}

/** Claims a finished step's reward for the active character. */
export function claimGuide(s: GameState, c: Character, id: string): boolean {
  const step = GUIDE.find((g) => g.id === id);
  if (!step || guideDone(s).includes(id) || !step.done(s, c)) return false;
  s.guide = [...guideDone(s), id];
  c.gold += step.gold;
  gainXp(c, step.xp);
  return true;
}
