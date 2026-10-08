import type { ItemDefId, MetalId } from '../data/items';
import type { ProfessionId, RaceId } from '../data/professions';
import type { AreaId, GatherLoc, ResourceId } from '../data/resources';
import type { SkillId, StatId } from '../data/skills';

export const SAVE_VERSION = 4;

export type Lock = 'up' | 'down' | 'locked';
export type Location = 'town' | GatherLoc;

export interface ItemInstance {
  uid: number;
  def: ItemDefId;
  dur: number;
  maxDur: number;
  quality: 'normal' | 'exceptional';
  /** Metal for items made from bars. */
  mat?: MetalId;
}

export interface Inventory {
  res: Partial<Record<ResourceId, number>>;
  items: ItemInstance[];
}

/** A gathering spot: an ore vein, a tree, a fish shoal or a field patch. */
export interface Node {
  res: ResourceId;
  /** Successful pulls left before it is exhausted. */
  left: number;
}

export interface Character {
  id: number;
  name: string;
  race: RaceId;
  profession: ProfessionId;
  stats: Record<StatId, number>;
  /** Integer tenths (184 = 18.4). */
  skills: Record<SkillId, number>;
  locks: Record<SkillId, Lock>;
  hp: number;
  stamina: number;
  gold: number;
  pack: Inventory;
  location: Location;
  /** Chosen area (level, grove, fishing spot, field) per gathering location. */
  areas: Record<GatherLoc, AreaId>;
  node: Node | null;
  /** uid of the preferred tool in hand, if any. */
  tool: number | null;
  /** Timestamp of the last regeneration tick. */
  regenAt: number;
  createdAt: number;
}

/** A journal line. `p` values starting with '@' are translation keys resolved at render time. */
export interface LogEntry {
  k: string;
  p?: Record<string, string | number>;
  c?: 'gain' | 'bad' | 'sys' | 'good';
  t: number;
}

export interface MarketEntry {
  /** Units recently sold to the trader; lowers the price, decays over time. */
  pressure: number;
  t: number;
}

/** An NPC warrior or ranger visiting the shop with a request. */
export interface Wanderer {
  id: number;
  name: string;
  kind: 'warrior' | 'ranger';
  /** An item to buy, or null when the request is a bundle of goods (`wantsRes`). */
  wants: ItemDefId | null;
  wantsRes?: { id: ResourceId; n: number };
  /** Lowest acceptable metal, or null for any. */
  minMat: MetalId | null;
  exceptional: boolean;
  offer: number;
  leavesAt: number;
}

/** A hired gatherer who works for the bank while you play or are away. */
export interface Worker {
  id: number;
  name: string;
  job: GatherLoc;
  /** Integer tenths, capped at your best skill in the job minus 10. */
  skill: number;
  area: AreaId;
  toolDur: number;
  toolMax: number;
  /** Milliseconds accumulated toward the next attempt. */
  acc: number;
  /** Wage owed but not yet paid (fractions of a gold piece). */
  owed: number;
  produced: Partial<Record<ResourceId, number>>;
}

export interface GameState {
  version: number;
  chars: Character[];
  active: number | null;
  /** Shared bank for all characters in this save. */
  bank: Inventory & { gold: number };
  journal: LogEntry[];
  market: Partial<Record<ResourceId, MarketEntry>>;
  settings: { lang: 'en' | 'cs' };
  wanderers: Wanderer[];
  nextWandererAt: number;
  /** Items sold to wanderers; unlocks better customers. */
  reputation: number;
  workers: Worker[];
  /** Total hires so far; each one costs more. */
  hires: number;
  bunkhouse: number;
  /** When workers were last simulated. */
  workersAt: number;
  uidSeq: number;
  lastSeen: number;
}

export function newGameState(lang: 'en' | 'cs'): GameState {
  return {
    version: SAVE_VERSION,
    chars: [],
    active: null,
    bank: { res: {}, items: [], gold: 0 },
    journal: [],
    market: {},
    settings: { lang },
    wanderers: [],
    nextWandererAt: Date.now() + 20_000,
    reputation: 0,
    workers: [],
    hires: 0,
    bunkhouse: 0,
    workersAt: Date.now(),
    uidSeq: 1,
    lastSeen: Date.now(),
  };
}

export function activeChar(s: GameState): Character | null {
  return s.chars.find((c) => c.id === s.active) ?? null;
}

export function log(s: GameState, k: string, p?: LogEntry['p'], c?: LogEntry['c']): void {
  s.journal.push({ k, p, c, t: Date.now() });
  if (s.journal.length > 200) s.journal.splice(0, s.journal.length - 200);
}

export function nextUid(s: GameState): number {
  return s.uidSeq++;
}
