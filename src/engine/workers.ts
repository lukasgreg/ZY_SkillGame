import { ITEMS } from '../data/items';
import { GATHER_SKILL, YIELDS, type AreaId, type GatherLoc, type ResourceId } from '../data/resources';
import { addRes } from './character';
import { areaOf, pullAmount, pullChance } from './gather';
import { pickWeighted, type Rng } from './rng';
import type { Character, GameState, ItemInstance, Worker } from './state';

/** One worker attempt per minute, online or offline. */
export const WORKER_PULL_MS = 60_000;
/** Offline progress is capped (design 1: 8 h at the start). */
export const OFFLINE_CAP_MS = 8 * 3600_000;
export const BASE_SLOTS = 2;
export const MAX_BUNKHOUSE = 5;
const STARTER_TOOL_DUR = 50;
const WORKER_WEAR_CHANCE = 0.15;

const NAMES = ['Ota', 'Bára', 'Kuba', 'Hedvika', 'Ruprecht', 'Zdena', 'Matěj', 'Ilsa', 'Vok', 'Runa', 'Šimon', 'Dorota', 'Gunnar', 'Alžběta'];

export function slots(s: GameState): number {
  return BASE_SLOTS + s.bunkhouse;
}

/** Each hire costs 60% more than the last. */
export function hireCost(s: GameState): number {
  return Math.round(100 * Math.pow(1.6, s.hires));
}

/** A worker can't be trained past your own best skill in that job minus 10 (tenths). */
export function workerCap(s: GameState, job: GatherLoc): number {
  const best = Math.max(0, ...s.chars.map((c: Character) => c.skills[GATHER_SKILL[job]]));
  return Math.max(0, best - 100);
}

/** Gold for +1.0 skill; grows 7% per point already learned. */
export function trainCost(w: Worker): number {
  return Math.round(20 * Math.pow(1.07, w.skill / 10));
}

/** Wage per hour, paid from the bank: more skilled workers cost more. */
export function wagePerHour(w: Worker): number {
  return 2 + (w.skill / 10) * 0.15;
}

export function hire(s: GameState, job: GatherLoc, rng: Rng, now = Date.now()): Worker | null {
  const cost = hireCost(s);
  if (s.workers.length >= slots(s) || s.bank.gold < cost) return null;
  s.bank.gold -= cost;
  s.hires += 1;
  const w: Worker = {
    id: now + Math.floor(rng() * 1000),
    name: NAMES[Math.floor(rng() * NAMES.length)],
    job,
    skill: Math.min(workerCap(s, job), 100),
    area: 1,
    toolDur: STARTER_TOOL_DUR,
    toolMax: STARTER_TOOL_DUR,
    acc: 0,
    owed: 0,
    produced: {},
  };
  s.workers.push(w);
  return w;
}

export function train(s: GameState, w: Worker): boolean {
  const cost = trainCost(w);
  if (s.bank.gold < cost || w.skill + 10 > workerCap(s, w.job)) return false;
  s.bank.gold -= cost;
  w.skill += 10;
  return true;
}

export function dismiss(s: GameState, w: Worker): void {
  s.workers = s.workers.filter((x) => x !== w);
}

/** Hands a tool from the character's pack to the worker; the old tool is discarded. */
export function giveTool(c: Character, w: Worker, it: ItemInstance): boolean {
  if (ITEMS[it.def].toolFor !== GATHER_SKILL[w.job] || !c.pack.items.includes(it)) return false;
  c.pack.items = c.pack.items.filter((i) => i !== it);
  if (c.tool === it.uid) c.tool = null;
  w.toolDur = it.dur;
  w.toolMax = it.maxDur;
  return true;
}

export function workerAreaOpen(w: Worker, id: AreaId, freed = false): boolean {
  const a = areaOf(w.job, id);
  return (!a.gnarlHeld || freed) && w.skill / 10 >= a.need;
}

const freedOf = (s: GameState) => s.cleared.includes('warrens');

export type WorkerStatus = 'working' | 'noTool' | 'unpaid' | 'nothing';

export function status(s: GameState, w: Worker): WorkerStatus {
  if (w.toolDur <= 0) return 'noTool';
  if (s.bank.gold <= 0) return 'unpaid';
  if (!workableRes(w, freedOf(s)).length) return 'nothing';
  return 'working';
}

function workableRes(w: Worker, freed: boolean): [ResourceId, number][] {
  const area = workerAreaOpen(w, w.area, freed) ? w.area : 1;
  return areaOf(w.job, area).nodes.filter(([res]) => w.skill / 10 >= YIELDS[res]!.min);
}

/** One worker attempt: roll a resource, deliver to the bank, wear the tool, pay the wage. */
function workerPull(s: GameState, w: Worker, rng: Rng): void {
  const res = pickWeighted(rng, workableRes(w, freedOf(s)));
  if (!res) return;
  const skill = w.skill / 10;
  if (rng() < pullChance(skill, res)) {
    const n = pullAmount(skill, res, rng);
    addRes(s.bank, res, n);
    w.produced[res] = (w.produced[res] ?? 0) + n;
  }
  // Workers are careful with tools: a 50-use pickaxe lasts them about five and a half hours.
  if (rng() < WORKER_WEAR_CHANCE) w.toolDur -= 1;
  w.owed += wagePerHour(w) / 60;
  const pay = Math.floor(w.owed);
  if (pay > 0) {
    s.bank.gold -= pay;
    w.owed -= pay;
  }
}

/** Advances one worker by `ms`. Returns what it delivered. */
export function simulate(s: GameState, w: Worker, ms: number, rng: Rng): Partial<Record<ResourceId, number>> {
  const before = { ...w.produced };
  w.acc += ms;
  while (w.acc >= WORKER_PULL_MS) {
    if (status(s, w) !== 'working') {
      w.acc = 0;
      break;
    }
    w.acc -= WORKER_PULL_MS;
    workerPull(s, w, rng);
  }
  const out: Partial<Record<ResourceId, number>> = {};
  for (const [k, v] of Object.entries(w.produced) as [ResourceId, number][]) {
    const d = v - (before[k] ?? 0);
    if (d > 0) out[k] = d;
  }
  return out;
}

/** Runs all workers from `s.workersAt` to `now` (capped for offline time). Returns the combined delivery. */
export function catchUp(s: GameState, now: number, rng: Rng): { ms: number; got: Partial<Record<ResourceId, number>> } {
  const ms = Math.max(0, Math.min(now - s.workersAt, OFFLINE_CAP_MS));
  s.workersAt = now;
  const got: Partial<Record<ResourceId, number>> = {};
  for (const w of s.workers) {
    for (const [k, v] of Object.entries(simulate(s, w, ms, rng)) as [ResourceId, number][]) got[k] = (got[k] ?? 0) + v;
  }
  return { ms, got };
}

export function bunkhouseCost(level: number): { oakLog: number; gold: number; carpentry: number } {
  const n = level + 1;
  return { oakLog: 15 * n, gold: 120 * n * n, carpentry: 15 * n };
}

/** Builds the next bunkhouse level with the active character's carpentry. */
export function buildBunkhouse(s: GameState, c: Character): boolean {
  if (s.bunkhouse >= MAX_BUNKHOUSE) return false;
  const cost = bunkhouseCost(s.bunkhouse);
  if ((c.pack.res.oakLog ?? 0) < cost.oakLog || c.gold < cost.gold || c.skills.carpentry / 10 < cost.carpentry) return false;
  addRes(c.pack, 'oakLog', -cost.oakLog);
  c.gold -= cost.gold;
  s.bunkhouse += 1;
  return true;
}
