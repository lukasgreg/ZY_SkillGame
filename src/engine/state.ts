import type { Affix, DungeonId, EventId, MonsterId, Omen } from '../data/dungeons';
import type { ItemDefId, MetalId, Slot } from '../data/items';
import type { PlanId } from '../data/plans';
import type { ProfessionId, RaceId } from '../data/professions';
import type { AreaId, GatherLoc, ResourceId } from '../data/resources';
import type { SkillId, StatId } from '../data/skills';

export const SAVE_VERSION = 12;

export type Lock = 'up' | 'down' | 'locked';
export type Location = 'town' | GatherLoc | 'dungeon';
export type Stance = 'normal' | 'combat' | 'defensive';

export interface ItemInstance {
  uid: number;
  def: ItemDefId;
  dur: number;
  maxDur: number;
  quality: 'normal' | 'exceptional';
  /** Metal for items made from bars. */
  mat?: MetalId;
  /** Made with a runic hammer: tougher and worth twice as much. */
  runic?: boolean;
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
  /** Rolled starting stats; levels raise stats from here toward the profession caps. */
  statBase: Record<StatId, number>;
  level: number;
  /** Experience toward the next level. */
  xp: number;
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
  /** Worn equipment: uids of items in the pack. */
  equip: Partial<Record<Slot, number>>;
  stance: Stance;
  /** The dungeon expedition in progress, if any. */
  run: Run | null;
  /** Where this character last died, until it decays. */
  corpse: Corpse | null;
  pets: Pet[];
  /** One-use plans owned, by count. */
  plans: Partial<Record<PlanId, number>>;
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

export type RoomType = 'start' | 'monster' | 'elite' | 'treasure' | 'shrine' | 'trap' | 'event' | 'campfire' | 'cache' | 'boss';

export interface DNode {
  id: number;
  layer: number;
  type: RoomType;
  next: number[];
  /** Entering this room seals the way back (a collapse or a drop). */
  oneWay: boolean;
  /** A side room that leads nowhere; you come back the way you came. */
  dead?: boolean;
  cleared: boolean;
  /** What happens in an event room. */
  event?: EventId;
  /** Monsters still here after you fled or died, with their wounds; they heal slowly from `foesAt`. */
  foes?: Foe[];
  foesAt?: number;
}

export interface Foe {
  kind: MonsterId;
  hp: number;
  /** Maximum hits (giants have more than their kind). */
  max?: number;
  affix?: Affix;
  /** Rounds left stunned. */
  stunned: number;
}

/** A tamed animal (design 7). */
export interface Pet {
  id: number;
  kind: MonsterId;
  hp: number;
  /** Fighting skill in tenths; grows as the pet fights. */
  skill: number;
  /** Loyalty when last fed; it drops 5 per hour from `fedAt`. */
  loyalty: number;
  fedAt: number;
  tamedAt: number;
  bonded: boolean;
  /** A bonded pet that died: it waits as a spirit until Animal Healing brings it back. */
  dead: boolean;
}

export interface Combat {
  foes: Foe[];
  /** A summoned animal (Call of the Wild) fighting for this battle only. */
  summon: Foe | null;
  summoned: boolean;
  round: number;
  secondWindUsed: boolean;
  /** A bandage being applied; it lands at the end of the round unless you are hit. */
  bandaging: boolean;
  /** Rounds left of Warrior's Cry: enemies hit less often. */
  cowed: number;
  /** Leap: you act first next round. */
  first: boolean;
  /** Waiting this round: enemies hit you less. */
  guard?: boolean;
  /** Arrows loosed this fight; some can be picked up afterwards. */
  arrowsShot?: number;
}

export interface Run {
  dungeon: DungeonId;
  seed: number;
  nodes: DNode[];
  at: number;
  path: number[];
  /** You crossed a one-way passage: no walking out until the boss falls or Way Home. */
  sealed: boolean;
  bossDown: boolean;
  combat: Combat | null;
  /** You fled but couldn't go back: you're out of the fight in a corner of this room. */
  retreated: boolean;
  /** How much was scouted before entering (0 none, 1 rooms, 2 rooms + passages). */
  scouted: number;
  log: LogEntry[];
  /** Gold and goods found this run (for the summary). */
  loot: number;
  omen?: Omen;
  /** Damage bonus for the rest of the run (from an altar). */
  buff?: number;
  /** The boss's chest has been opened. */
  chestOpened?: boolean;
}

export interface Corpse {
  dungeon: DungeonId;
  seed: number;
  nodes: DNode[];
  node: number;
  pack: Inventory;
  gold: number;
  equip: Partial<Record<Slot, number>>;
  decaysAt: number;
}

/** A bulk order (UO's Bulk Order Deed): deliver `n` matching items or goods for a reward. */
export interface Contract {
  id: number;
  giver: string;
  wants: ItemDefId | null;
  wantsRes?: ResourceId;
  minMat: MetalId | null;
  exceptional: boolean;
  n: number;
  delivered: number;
  reward: { gold: number; plan?: PlanId; res?: { id: ResourceId; n: number } };
  expiresAt: number;
}

export interface GameState {
  version: number;
  chars: Character[];
  active: number | null;
  /** Shared bank for all characters in this save; patterns live here so any character can use them. */
  bank: Inventory & { gold: number; patterns: Record<string, number> };
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
  /** The seed of the next expedition per dungeon (so scouting applies to the run you will get). */
  dungeonSeeds: Partial<Record<DungeonId, number>>;
  scouted: Partial<Record<DungeonId, number>>;
  /** Dungeons whose boss has fallen at least once. */
  cleared: DungeonId[];
  contractOffers: Contract[];
  contracts: Contract[];
  stats: Stats;
  /** Achievement id → when it was earned. */
  achievements: Record<string, number>;
  nextContractAt: number;
  uidSeq: number;
  lastSeen: number;
  /** When the player last did something (not background ticks); decides which copy wins in cloud sync. */
  editedAt?: number;
}

/** Lifetime counters shared by all characters in the save (they feed achievements). */
export interface Stats {
  pulls: number;
  crafts: number;
  exceptional: number;
  runic: number;
  plans: number;
  sales: number;
  contracts: number;
  goldEarned: number;
  hires: number;
  kills: number;
  bosses: number;
  deaths: number;
  recovered: number;
  tamed: number;
}

export const newStats = (): Stats => ({
  pulls: 0, crafts: 0, exceptional: 0, runic: 0, plans: 0, sales: 0, contracts: 0, goldEarned: 0,
  hires: 0, kills: 0, bosses: 0, deaths: 0, recovered: 0, tamed: 0,
});

export function newGameState(lang: 'en' | 'cs'): GameState {
  return {
    version: SAVE_VERSION,
    chars: [],
    active: null,
    bank: { res: {}, items: [], gold: 0, patterns: {} },
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
    dungeonSeeds: {},
    scouted: {},
    cleared: [],
    contractOffers: [],
    contracts: [],
    stats: newStats(),
    achievements: {},
    nextContractAt: 0,
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
