import { AFFIX_IDS, CORPSE_MS, DUNGEONS, DUNGEON_IDS, MONSTERS, OMEN_IDS, type Affix, type DungeonDef, type DungeonId, type EventId, type MonsterId, type Omen } from '../data/dungeons';
import { addRes } from './character';
import { loot, playRound, startCombat, type Action, type Outcome } from './combat';
import { mulberry32, pickWeighted, randInt, type Rng } from './rng';
import { maxHp, maxStamina, trySkillGain } from './skills';
import { gainXp, killXp, xpToNext } from './levels';
import { ITEMS, type ItemDefId, type MetalId } from '../data/items';
import { PLAN_WEIGHTS } from '../data/plans';
import { RECIPES } from '../data/recipes';
import type { ResourceId } from '../data/resources';
import { makeCrafted } from './craft';
import { canControl, gainPetXp, tryTame } from './pets';
import { addPattern, rollPattern } from './patterns';
import type { Character, DNode, Foe, GameState, LogEntry, RoomType, Run } from './state';

/* ---------------- map generation (seeded) ---------------- */

/** The omen of an expedition follows from its seed, so the board can show it before you go in. */
export function omenOf(seed: number): Omen {
  const rng = mulberry32(seed ^ 0x5eed);
  return rng() < 0.35 ? 'none' : OMEN_IDS[1 + Math.floor(rng() * (OMEN_IDS.length - 1))];
}

function roomWeights(layer: number, layers: number, d: DungeonDef, omen: Omen): [RoomType, number][] {
  const depth = layer / layers;
  const monster = 46 * (omen === 'calm' ? 0.6 : 1);
  const treasure = 7 * (omen === 'rich' ? 2 : 1);
  const cache = 7 * (omen === 'rich' ? 2 : 1);
  const trap = 9 * (omen === 'darkness' ? 2 : 1);
  const event = 11 * (omen === 'calm' ? 2 : 1);
  return [
    ['monster', monster],
    ['elite', layer >= 3 ? 5 + depth * 10 + d.skulls : 0],
    ['treasure', treasure],
    ['shrine', 4],
    ['trap', trap],
    ['event', event],
    ['campfire', depth > 0.3 ? 4 : 0],
    ['cache', cache],
  ];
}

/**
 * Builds the room graph for a seed (docs/PLAN_V2.md, phase D): 14–30 layers of 2–5 rooms, links to
 * nearby rooms so several routes run side by side, dead-end side rooms, sealed layers, and the boss.
 */
export function generate(id: DungeonId, seed: number): DNode[] {
  const d = DUNGEONS[id];
  const rng = mulberry32(seed);
  const omen = omenOf(seed);
  const layers = randInt(rng, 5 + d.clocks * 3, 8 + d.clocks * 4);
  const nodes: DNode[] = [{ id: 0, layer: 0, type: 'start', next: [], oneWay: false, cleared: true }];
  const sealed = new Set<number>();
  const seals = 1 + Math.floor(d.clocks / 2);
  for (let i = 0; i < seals; i++) sealed.add(randInt(rng, 3, layers - 3));
  const pos = new Map<number, number>([[0, 0.5]]);
  let prev = [0];
  for (let layer = 1; layer < layers; layer++) {
    const last = layer === layers - 1;
    const width = last ? 1 : layer === 1 ? randInt(rng, 2, 3) : randInt(rng, 2, 5);
    const cur: number[] = [];
    for (let i = 0; i < width; i++) {
      const type: RoomType = last ? 'boss' : layer === 1 ? 'monster' : pickWeighted(rng, roomWeights(layer, layers, d, omen))!;
      const n: DNode = { id: nodes.length, layer, type, next: [], oneWay: sealed.has(layer), cleared: false };
      if (type === 'event') n.event = pickEvent(d, rng);
      nodes.push(n);
      cur.push(n.id);
      pos.set(n.id, width === 1 ? 0.5 : i / (width - 1));
    }
    // Link each room forward to the nearest room, sometimes to a neighbour as well.
    const near = (p: number) => cur.slice().sort((x, y) => Math.abs(pos.get(x)! - pos.get(p)!) - Math.abs(pos.get(y)! - pos.get(p)!));
    for (const p of prev) {
      if (nodes[p].dead) continue;
      const order = near(p);
      nodes[p].next.push(order[0]);
      if (order.length > 1 && rng() < 0.55) nodes[p].next.push(order[1]);
    }
    const live = prev.filter((p) => !nodes[p].dead);
    for (const c of cur) {
      if (prev.some((p) => nodes[p].next.includes(c))) continue;
      const from = live.slice().sort((x, y) => Math.abs(pos.get(x)! - pos.get(c)!) - Math.abs(pos.get(y)! - pos.get(c)!))[0];
      nodes[from].next.push(c);
    }
    // Side rooms: some rooms lead nowhere but hold something worth the detour.
    if (layer >= 2 && layer < layers - 2 && cur.length > 2) {
      for (const c of cur) {
        if (rng() < 0.18 && cur.filter((x) => !nodes[x].dead).length > 2) {
          nodes[c].dead = true;
          nodes[c].type = pickWeighted<RoomType>(rng, [['cache', 4], ['treasure', 3], ['event', 3], ['elite', 2]])!;
          if (nodes[c].type === 'event') nodes[c].event = pickEvent(d, rng, true);
          nodes[c].oneWay = false;
        }
      }
      // A room whose only way on became a side room gets a link to the nearest real way on.
      const ways = cur.filter((x) => !nodes[x].dead);
      for (const p of prev) {
        if (nodes[p].dead || nodes[p].next.some((x) => !nodes[x].dead)) continue;
        nodes[p].next.push(ways.slice().sort((x, y) => Math.abs(pos.get(x)! - pos.get(p)!) - Math.abs(pos.get(y)! - pos.get(p)!))[0]);
      }
    }
    prev = cur;
  }
  return nodes;
}

function pickEvent(d: DungeonDef, rng: Rng, side = false): EventId {
  const pool: [EventId, number][] = [
    ['adventurer', 3], ['fountain', 3], ['altar', 2], ['merchant', 2], ['tunnel', 2],
    ['lair', d.skulls >= 3 || d.id === 'wilds' ? (side ? 4 : 1) : 0],
  ];
  return pickWeighted(rng, pool)!;
}

/** Monsters waiting in a room, by depth: deeper rooms hold more of the tougher kinds, and the odd wanderer. */
export function roomFoes(id: DungeonId, node: DNode, seed: number): MonsterId[] {
  const d = DUNGEONS[id];
  const rng = mulberry32(seed * 31 + node.id * 7919);
  const omen = omenOf(seed);
  if (node.type === 'boss') return [d.boss, d.pool[d.pool.length - 1]];
  if (node.type === 'elite') return [d.elite];
  const extra = omen === 'infested' ? 1 : 0;
  const n = Math.min(4, 1 + extra + Math.floor(rng() * (1 + node.layer / 5)));
  const out: MonsterId[] = [];
  for (let i = 0; i < n; i++) {
    let pool = d.pool;
    if (omen === 'restless' && rng() < 0.4) pool = ['skeleton', 'zombie', 'banshee'];
    else if (rng() < 0.08) pool = DUNGEONS[DUNGEON_IDS[Math.max(0, DUNGEON_IDS.indexOf(id) - 1)]].pool;
    const k = Math.min(pool.length - 1, Math.floor(Math.pow(rng(), 1.2 - node.layer / 40) * pool.length));
    out.push(pool[k]);
  }
  return out;
}

/** Chance that a monster in a room carries an affix: grows with depth and the dungeon's skulls. */
function rollAffix(d: DungeonDef, layer: number, rng: Rng): Affix | undefined {
  if (layer < 3 || rng() >= 0.04 * d.skulls + layer * 0.008) return undefined;
  return AFFIX_IDS[Math.floor(rng() * AFFIX_IDS.length)];
}

/** Monsters heal 2% of their hits per minute after you leave them. */
const FOE_REGEN_PER_MIN = 0.02;

/** Leaves the living monsters of the current fight in their room, wounds and all. */
function stash(run: Run, node: DNode, now = Date.now()): void {
  if (!run.combat) return;
  node.foes = run.combat.foes.filter((f) => f.hp > 0).map((f) => ({ ...f, stunned: 0 }));
  node.foesAt = now;
  if (!node.foes.length) {
    delete node.foes;
    delete node.foesAt;
  }
}

/** The monsters waiting in a room: wounded ones you left behind (healed a little), or a fresh group. */
export function waitingFoes(run: Run, node: DNode, now = Date.now()): Foe[] {
  if (node.foes?.length) {
    const mins = Math.max(0, (now - (node.foesAt ?? now)) / 60_000);
    return node.foes.map((f) => {
      const max = f.max ?? MONSTERS[f.kind].hp;
      return { ...f, stunned: 0, hp: Math.min(max, Math.round(f.hp + max * FOE_REGEN_PER_MIN * mins)) };
    });
  }
  const d = DUNGEONS[run.dungeon];
  const rng = mulberry32(run.seed * 17 + node.id * 131);
  return roomFoes(run.dungeon, node, run.seed).map((k) => {
    const affix = node.type === 'boss' ? undefined : rollAffix(d, node.layer, rng);
    const max = Math.round(MONSTERS[k].hp * (affix === 'giant' ? 1.5 : 1));
    return { kind: k, hp: max, max, stunned: 0, affix };
  });
}

function engage(run: Run, node: DNode): void {
  const foes = waitingFoes(run, node);
  const wounded = !!node.foes?.length;
  delete node.foes;
  delete node.foesAt;
  run.combat = { ...startCombat([]), foes };
  if (wounded) say(run, 'dun.foesWounded', { count: foes.length }, 'bad');
  else say(run, node.type === 'boss' ? 'dun.boss' : 'dun.ambush', { count: foes.length }, 'bad');
}

/* ---------------- board & scouting ---------------- */

export function nextSeed(s: GameState, id: DungeonId, rng: Rng): number {
  if (!s.dungeonSeeds[id]) s.dungeonSeeds[id] = Math.floor(rng() * 2 ** 31);
  return s.dungeonSeeds[id]!;
}

export function scoutCost(id: DungeonId, level: 1 | 2, seed?: number): number {
  const base = DUNGEONS[id].skulls * (level === 1 ? 20 : 60);
  return seed !== undefined && omenOf(seed) === 'darkness' ? Math.round(base / 2) : base;
}

/** Pays a scout (design 6.3). A ranger with Tracking 30+ gets the first level free. */
export function scout(s: GameState, c: Character, id: DungeonId, level: 1 | 2): boolean {
  const cur = s.scouted[id] ?? 0;
  if (cur >= level) return false;
  const free = level === 1 && c.skills.tracking >= 300;
  const cost = free ? 0 : scoutCost(id, level, s.dungeonSeeds[id]);
  if (c.gold < cost) return false;
  c.gold -= cost;
  s.scouted[id] = level;
  return true;
}

/* ---------------- runs ---------------- */

function say(run: Run, k: string, p?: LogEntry['p'], cls?: LogEntry['c']): void {
  run.log.push({ k, p, c: cls, t: Date.now() });
  if (run.log.length > 40) run.log.splice(0, run.log.length - 40);
}

export function corpseFresh(c: Character, now = Date.now()): boolean {
  return !!c.corpse && c.corpse.decaysAt > now;
}

export function enter(s: GameState, c: Character, id: DungeonId, rng: Rng, now = Date.now()): Run | null {
  if (c.location !== 'town' || c.run) return null;
  // Going back for your corpse: the same layout, with the rooms you cleared still cleared.
  const recover = corpseFresh(c, now) && c.corpse!.dungeon === id;
  const seed = recover ? c.corpse!.seed : nextSeed(s, id, rng);
  const nodes = recover ? c.corpse!.nodes.map((n) => ({ ...n, next: [...n.next], foes: n.foes?.map((f) => ({ ...f })) })) : generate(id, seed);
  const run: Run = {
    dungeon: id, seed, nodes, at: 0, path: [0], sealed: false, bossDown: false, combat: null, retreated: false,
    scouted: recover ? 2 : s.scouted[id] ?? 0, log: [], loot: 0, omen: omenOf(seed),
  };
  if (recover) {
    say(run, 'dun.recover', undefined, 'sys');
  } else {
    delete s.dungeonSeeds[id];
    delete s.scouted[id];
  }
  say(run, `dun.enter.${id}`, undefined, 'sys');
  if (run.omen && run.omen !== 'none') say(run, `omen.${run.omen}.log`, undefined, 'sys');
  c.run = run;
  c.location = 'dungeon';
  return run;
}

export function here(run: Run): DNode {
  return run.nodes[run.at];
}

/** Rooms you can step into next. */
export function exits(run: Run): DNode[] {
  if (run.combat) return [];
  const node = here(run);
  if (!node.cleared && !run.retreated) return [];
  return node.next.map((i) => run.nodes[i]);
}

export function canLeave(run: Run): boolean {
  return !run.combat && (!run.sealed || run.bossDown);
}

export function leave(c: Character): boolean {
  const run = c.run;
  if (!run || !canLeave(run)) return false;
  c.run = null;
  c.location = 'town';
  return true;
}

/** Way Home (Andaria's Cesta domů): the only way out of a sealed section, even mid-fight. */
export function wayHome(c: Character): boolean {
  if (!c.run || !(c.pack.res.wayHome ?? 0)) return false;
  addRes(c.pack, 'wayHome', -1);
  c.run = null;
  c.location = 'town';
  return true;
}

/** Steps into a room and resolves what happens on entering it. */
export function move(s: GameState, c: Character, to: number, rng: Rng): boolean {
  const run = c.run;
  if (!run || !exits(run).some((n) => n.id === to)) return false;
  const node = run.nodes[to];
  run.at = to;
  run.path.push(to);
  run.retreated = false;
  if (node.oneWay && !run.sealed) {
    run.sealed = true;
    say(run, rng() < 0.5 ? 'dun.collapse' : 'dun.drop', undefined, 'bad');
  }
  resolveRoom(s, c, run, node, rng);
  return true;
}

function resolveRoom(s: GameState, c: Character, run: Run, node: DNode, rng: Rng): void {
  // Your body is the first thing you reach: grab everything, then deal with whatever is here.
  if (c.corpse && c.corpse.node === node.id && c.corpse.seed === run.seed && lootCorpse(c)) {
    s.stats.recovered += 1;
    say(run, 'dun.corpseGrabbed', undefined, 'gain');
  }
  if (node.foes?.length) {
    engage(run, node);
    return;
  }
  if (node.cleared) return;
  switch (node.type) {
    case 'monster':
    case 'elite':
    case 'boss':
      engage(run, node);
      break;
    case 'treasure': {
      const d = DUNGEONS[run.dungeon];
      const gold = randInt(rng, d.chest[0], d.chest[1]);
      c.gold += gold;
      run.loot += gold;
      say(run, 'dun.chest', { gold }, 'gain');
      if (rng() < 0.25) {
        addRes(c.pack, 'planFragment', 1);
        say(run, 'fight.drop', { n: 1, res: '@res.planFragment' }, 'gain');
      }
      if (rng() < 0.08) {
        addRes(c.pack, 'wayHome', 1);
        say(run, 'fight.drop', { n: 1, res: '@res.wayHome' }, 'gain');
      }
      node.cleared = true;
      break;
    }
    case 'shrine':
      c.hp = Math.min(maxHp(c), c.hp + Math.round(maxHp(c) * 0.5));
      c.stamina = maxStamina(c);
      say(run, 'dun.shrine', undefined, 'good');
      node.cleared = true;
      break;
    case 'trap': {
      const avoid = 0.25 + c.stats.dex / 200 + c.skills.tracking / 4000;
      if (rng() < avoid) say(run, 'dun.trapAvoided', undefined, 'good');
      else {
        const dmg = Math.round(maxHp(c) * (0.1 + rng() * 0.15));
        c.hp -= dmg;
        say(run, 'dun.trapHit', { dmg }, 'bad');
        if (c.hp <= 0) {
          die(s, c);
          return;
        }
      }
      node.cleared = true;
      break;
    }
    case 'campfire':
      c.hp = maxHp(c);
      c.stamina = maxStamina(c);
      say(run, 'dun.campfire', undefined, 'good');
      node.cleared = true;
      break;
    case 'cache':
      openCache(c, run, rng);
      node.cleared = true;
      break;
    case 'event':
      say(run, `event.${node.event}.intro`, undefined, 'sys');
      break;
    case 'start':
      break;
  }
}

/** A loot cache: things the dungeon's monsters leave lying around, a little gold, maybe a fragment. */
function openCache(c: Character, run: Run, rng: Rng): void {
  const d = DUNGEONS[run.dungeon];
  const drops = d.pool.flatMap((k) => MONSTERS[k].drops ?? []).filter(([res]) => res !== 'wayHome');
  const picks = randInt(rng, 1, 3);
  for (let i = 0; i < picks && drops.length; i++) {
    const [res, , lo, hi] = drops[Math.floor(rng() * drops.length)];
    const n = randInt(rng, lo, hi + 1);
    addRes(c.pack, res, n);
    say(run, 'fight.drop', { n, res: `@res.${res}` }, 'gain');
  }
  const gold = randInt(rng, 5, 15) * d.skulls;
  c.gold += gold;
  run.loot += gold;
  say(run, 'dun.cache', { gold }, 'good');
  if (rng() < 0.12) {
    addRes(c.pack, 'planFragment', 1);
    say(run, 'fight.drop', { n: 1, res: '@res.planFragment' }, 'gain');
  }
}

/* ---------------- events ---------------- */

/** The choices an event offers (button labels are `event.<id>.<choice>`). */
export const EVENT_CHOICES: Record<EventId, string[]> = {
  adventurer: ['help', 'rob', 'leave'],
  fountain: ['drink', 'fill', 'leave'],
  altar: ['offer', 'smash', 'leave'],
  merchant: ['buyScroll', 'buyKit', 'leave'],
  tunnel: ['dig', 'leave'],
  lair: ['sneak', 'tame', 'fight', 'leave'],
};

export function eventCost(run: Run, ev: EventId, choice: string): number {
  const sk = DUNGEONS[run.dungeon].skulls;
  if (ev === 'altar' && choice === 'offer') return 40 * sk;
  if (ev === 'merchant' && choice === 'buyScroll') return 240;
  if (ev === 'merchant' && choice === 'buyKit') return 35;
  return 0;
}

/** Resolves the event in the current room. Returns false if the choice isn't possible right now. */
export function chooseEvent(s: GameState, c: Character, choice: string, rng: Rng): boolean {
  const run = c.run;
  const node = run && here(run);
  if (!run || !node || node.type !== 'event' || node.cleared || run.combat || !node.event) return false;
  const ev = node.event;
  const d = DUNGEONS[run.dungeon];
  const cost = eventCost(run, ev, choice);
  if (cost > c.gold) return false;
  c.gold -= cost;
  const done = () => (node.cleared = true);
  switch (`${ev}.${choice}`) {
    case 'adventurer.help': {
      if ((c.pack.res.bandage ?? 0) < 2) return false;
      addRes(c.pack, 'bandage', -2);
      if (rng() < 0.6) {
        const gold = randInt(rng, 30, 80) * d.skulls;
        c.gold += gold;
        run.loot += gold;
        say(run, 'event.adventurer.thanksGold', { gold }, 'gain');
      } else {
        addRes(c.pack, 'planFragment', 2);
        say(run, 'event.adventurer.thanksMap', undefined, 'gain');
      }
      gainXp(c, 20 * d.skulls);
      break;
    }
    case 'adventurer.rob': {
      const gold = randInt(rng, 20, 60) * d.skulls;
      c.gold += gold;
      run.loot += gold;
      s.reputation = Math.max(0, s.reputation - 3);
      say(run, 'event.adventurer.robbed', { gold }, 'bad');
      break;
    }
    case 'fountain.drink':
      if (rng() < 0.7) {
        c.hp = maxHp(c);
        c.stamina = maxStamina(c);
        say(run, 'event.fountain.pure', undefined, 'good');
      } else {
        const dmg = Math.round(maxHp(c) * 0.2);
        c.hp = Math.max(1, c.hp - dmg);
        say(run, 'event.fountain.foul', { dmg }, 'bad');
      }
      break;
    case 'fountain.fill':
      addRes(c.pack, 'herbalStew', 1);
      say(run, 'event.fountain.filled', undefined, 'good');
      break;
    case 'altar.offer':
      run.buff = 1.15;
      say(run, 'event.altar.blessed', undefined, 'gain');
      break;
    case 'altar.smash':
      say(run, 'event.altar.guardian', undefined, 'bad');
      done();
      node.foes = [{ kind: d.elite, hp: MONSTERS[d.elite].hp, max: MONSTERS[d.elite].hp, stunned: 0, affix: 'enraged' }];
      node.foesAt = Date.now();
      engage(run, node);
      return true;
    case 'merchant.buyScroll':
      addRes(c.pack, 'wayHome', 1);
      say(run, 'event.merchant.sold', { res: '@res.wayHome' }, 'good');
      break;
    case 'merchant.buyKit':
      addRes(c.pack, 'repairKit', 1);
      say(run, 'event.merchant.sold', { res: '@res.repairKit' }, 'good');
      break;
    case 'tunnel.dig': {
      if (c.stamina < 20) return false;
      c.stamina -= 20;
      if (rng() < 0.4 + c.skills.mining / 2000) {
        say(run, 'event.tunnel.through', undefined, 'good');
        openCache(c, run, rng);
        openCache(c, run, rng);
      } else say(run, 'event.tunnel.rubble', undefined, 'bad');
      break;
    }
    case 'lair.sneak':
      if (rng() < 0.35 + c.stats.dex / 250 + c.skills.tracking / 3000) say(run, 'event.lair.sneaked', undefined, 'good');
      else {
        say(run, 'event.lair.woke', undefined, 'bad');
        done();
        const k = lairBeast(run);
        node.foes = [{ kind: k, hp: MONSTERS[k].hp, max: MONSTERS[k].hp, stunned: 0 }];
        node.foesAt = Date.now();
        engage(run, node);
        return true;
      }
      break;
    case 'lair.tame': {
      const k = lairBeast(run);
      if (!canControl(c, k)) {
        say(run, 'fight.tameNoSlots', { foe: `@mon.${k}` }, 'bad');
        return false;
      }
      const r = tryTame(c, k, rng);
      if (r.ok) {
        say(run, 'fight.tamed', { foe: `@mon.${k}` }, 'gain');
        s.stats.tamed += 1;
        break;
      }
      say(run, 'event.lair.tameFailed', { foe: `@mon.${k}` }, 'bad');
      done();
      node.foes = [{ kind: k, hp: MONSTERS[k].hp, max: MONSTERS[k].hp, stunned: 0 }];
      node.foesAt = Date.now();
      engage(run, node);
      return true;
    }
    case 'lair.fight': {
      done();
      const k = lairBeast(run);
      node.foes = [{ kind: k, hp: MONSTERS[k].hp, max: MONSTERS[k].hp, stunned: 0 }];
      node.foesAt = Date.now();
      engage(run, node);
      return true;
    }
    default:
      say(run, 'event.left', undefined, 'sys');
  }
  done();
  return true;
}

/** The sleeping beast in a lair: the rarest animals live only here (tameable in phase F). */
export function lairBeast(run: Run): MonsterId {
  const sk = DUNGEONS[run.dungeon].skulls;
  return sk >= 4 ? 'drake' : sk >= 3 ? 'direwolf' : 'bear';
}

/* ---------------- moving back and the boss's chest ---------------- */

/** Steps back to the previous room, unless a collapse or a drop sealed the way behind you. */
export function goBack(c: Character): boolean {
  const run = c.run;
  if (!run || run.combat || run.path.length < 2 || here(run).oneWay) return false;
  run.path.pop();
  run.at = run.path[run.path.length - 1];
  run.retreated = false;
  return true;
}

/** The boss's chest (always there): gold, gear in common metals, rare materials, maybe a plan. */
export function openBossChest(s: GameState, c: Character, rng: Rng): boolean {
  const run = c.run;
  if (!run || !run.bossDown || run.chestOpened || here(run).type !== 'boss' || run.combat) return false;
  run.chestOpened = true;
  const d = DUNGEONS[run.dungeon];
  const gold = Math.round(randInt(rng, d.chest[0], d.chest[1]) * 3 * (run.omen === 'rich' ? 1.5 : 1));
  c.gold += gold;
  run.loot += gold;
  say(run, 'dun.chestBoss', { gold }, 'gain');
  const gear = RECIPES.filter((r) => 'item' in r.out && ITEMS[r.out.item].kind !== 'tool' && r.min <= 20 + d.skulls * 15);
  for (let i = 0, n = randInt(rng, 1, 2); i < n; i++) {
    const r = gear[Math.floor(rng() * gear.length)];
    const def = (r.out as { item: ItemDefId }).item;
    const metal: MetalId | null = r.bars ? (['iron', 'copper', 'steel'] as MetalId[])[Math.floor(rng() * 3)] : null;
    const it = makeCrafted(s, def, metal, rng() < 0.2);
    c.pack.items.push(it);
    say(run, 'dun.chestItem', { item: itemParamOf(it) }, 'gain');
  }
  const rare: ResourceId = d.skulls >= 4 ? 'dragonScale' : 'etherealOre';
  const rn = randInt(rng, 1, d.skulls);
  addRes(c.pack, rare, rn);
  say(run, 'fight.drop', { n: rn, res: `@res.${rare}` }, 'gain');
  if (rng() < 0.2 + d.skulls * 0.12) {
    const p = rollPattern(d.skulls, rng);
    addPattern(s, p.def, p.metal);
    say(run, 'dun.chestPattern', { item: `%${p.def}|${p.metal}|0|0` }, 'gain');
  }
  if (rng() < 0.25) {
    const plan = pickWeighted(rng, PLAN_WEIGHTS)!;
    c.plans[plan] = (c.plans[plan] ?? 0) + 1;
    say(run, 'dun.chestPlan', { plan: `@plan.${plan}` }, 'gain');
  }
  const xp = Math.round(xpToNext(c.level) * 0.05);
  gainXp(c, xp);
  say(run, 'fight.xp', { n: xp }, 'gain');
  return true;
}

const itemParamOf = (it: { def: ItemDefId; mat?: MetalId; quality: string; runic?: boolean }) =>
  `%${it.def}|${it.mat ?? ''}|${it.quality === 'exceptional' ? 1 : 0}|${it.runic ? 1 : 0}`;

/** Plays a round of the current fight and handles winning, fleeing and dying. */
export function fight(s: GameState, c: Character, action: Action, rng: Rng): Outcome | null {
  const run = c.run;
  if (!run?.combat) return null;
  const out = playRound(c, run, action, rng);
  if (out === 'won') {
    const node = here(run);
    // Catch your breath after a won fight.
    c.hp = Math.min(maxHp(c), c.hp + Math.round(maxHp(c) * 0.15));
    c.stamina = Math.min(maxStamina(c), c.stamina + Math.round(maxStamina(c) * 0.3));
    loot(c, run, run.combat.foes, rng);
    const omenMult = run.omen === 'infested' ? 1.25 : 1;
    const xp = Math.round(run.combat.foes.filter((f) => f.hp <= 0).reduce((n, f) => n + killXp(f.kind) * (f.affix ? 1.4 : 1), 0) * omenMult);
    if (xp) {
      gainXp(c, xp);
      say(run, 'fight.xp', { n: xp }, 'gain');
      // Pets that fought share about 70% of it (docs/PLAN_V2.md, phase G).
      const team = c.pets.filter((p) => !p.dead && p.hp > 0);
      for (const p of team) {
        if (gainPetXp(p, Math.round((xp * 0.7) / team.length))) say(run, 'fight.petLevel', { pet: `@mon.${p.kind}`, n: p.level }, 'gain');
      }
    }
    run.combat = null;
    node.cleared = true;
    if (node.type === 'boss') {
      run.bossDown = true;
      if (!s.cleared.includes(run.dungeon)) s.cleared.push(run.dungeon);
      say(run, 'dun.bossDown', undefined, 'gain');
    }
    if (c.corpse && c.corpse.node === node.id && corpseFresh(c)) say(run, 'dun.corpseHere', undefined, 'sys');
  } else if (out === 'fled') {
    // Monsters stay, wounds and all. Step back a room if the way back isn't sealed behind this room.
    const node = here(run);
    stash(run, node);
    run.combat = null;
    if (run.path.length > 1 && !node.oneWay) {
      run.path.pop();
      run.at = run.path[run.path.length - 1];
      say(run, 'dun.backed', undefined, 'sys');
    } else {
      run.retreated = true;
      say(run, 'dun.cornered', undefined, 'sys');
    }
  } else if (out === 'died') {
    stash(run, here(run));
    die(s, c);
  }
  return out;
}

/** Faces the monsters again after fleeing into a corner of their room. */
export function reengage(c: Character): boolean {
  const run = c.run;
  const node = run && here(run);
  if (!run || !node || run.combat || (node.cleared && !node.foes?.length)) return false;
  run.retreated = false;
  engage(run, node);
  return true;
}

/** Rest in a quiet room (Camping). Wandering monsters may find you; better campers are found less. */
export function camp(s: GameState, c: Character, rng: Rng): 'rested' | 'ambush' | null {
  const run = c.run;
  if (!run || run.combat) return null;
  const p = 0.35 - c.skills.camping / 4000;
  const g = trySkillGain(c, 'camping', 0.5, true, rng);
  if (g) say(run, 'log.gain', { skill: '@skill.camping', amount: `#${g / 10}`, value: `#${c.skills.camping / 10}` }, 'gain');
  if (rng() < p) {
    const d = DUNGEONS[run.dungeon];
    run.combat = startCombat([d.pool[0]]);
    say(run, 'dun.campAmbush', undefined, 'bad');
    return 'ambush';
  }
  c.hp = Math.min(maxHp(c), c.hp + Math.round(maxHp(c) * (0.3 + c.skills.camping / 5000)));
  c.stamina = maxStamina(c);
  say(run, 'dun.camped', undefined, 'good');
  void s;
  return 'rested';
}

/** Death (design 6.4): everything carried stays on the corpse for five minutes. */
export function die(s: GameState, c: Character, now = Date.now()): void {
  const run = c.run!;
  c.corpse = {
    dungeon: run.dungeon,
    seed: run.seed,
    nodes: run.nodes,
    node: run.at,
    pack: c.pack,
    gold: c.gold,
    equip: c.equip,
    decaysAt: now + CORPSE_MS,
  };
  c.pack = { res: {}, items: [] };
  c.gold = 0;
  c.equip = {};
  c.tool = null;
  c.run = null;
  c.location = 'town';
  c.hp = Math.round(maxHp(c) * 0.5);
  c.stamina = 0;
  void s;
}

/** Takes everything back from your corpse when you stand over it. */
export function lootCorpse(c: Character, now = Date.now()): boolean {
  const run = c.run;
  const k = c.corpse;
  if (!run || !k || k.decaysAt <= now || run.at !== k.node || run.seed !== k.seed) return false;
  for (const [id, n] of Object.entries(k.pack.res)) addRes(c.pack, id as never, n ?? 0);
  c.pack.items.push(...k.pack.items);
  c.gold += k.gold;
  for (const [slot, uid] of Object.entries(k.equip)) if (!(slot in c.equip)) (c.equip as Record<string, number>)[slot] = uid!;
  c.corpse = null;
  return true;
}

/** Drops a decayed corpse. */
export function decay(c: Character, now = Date.now()): boolean {
  if (c.corpse && c.corpse.decaysAt <= now) {
    c.corpse = null;
    return true;
  }
  return false;
}

/** Field repair with a repair kit: full durability, −2 maximum, no skill needed. */
export function useRepairKit(c: Character, uid: number): boolean {
  const it = c.pack.items.find((i) => i.uid === uid);
  if (!it || !(c.pack.res.repairKit ?? 0) || it.dur >= it.maxDur) return false;
  addRes(c.pack, 'repairKit', -1);
  it.maxDur = Math.max(1, it.maxDur - 2);
  it.dur = it.maxDur;
  return true;
}
