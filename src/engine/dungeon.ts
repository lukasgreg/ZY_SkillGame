import { CORPSE_MS, DUNGEONS, type DungeonId, type MonsterId } from '../data/dungeons';
import { addRes } from './character';
import { loot, playRound, startCombat, type Action, type Outcome } from './combat';
import { mulberry32, pickWeighted, randInt, type Rng } from './rng';
import { maxHp, maxStamina, trySkillGain } from './skills';
import type { Character, DNode, GameState, LogEntry, RoomType, Run } from './state';

/* ---------------- map generation (seeded) ---------------- */

/** Builds the room graph for a seed: layers of 1–3 rooms, a boss at the end, and sealed passages. */
export function generate(id: DungeonId, seed: number): DNode[] {
  const d = DUNGEONS[id];
  const rng = mulberry32(seed);
  const layers = 3 + d.clocks * 2;
  const nodes: DNode[] = [{ id: 0, layer: 0, type: 'start', next: [], oneWay: false, cleared: true }];
  let prev = [0];
  // Sealed layers: a collapse or a drop. Longer dungeons have more of them.
  const sealed = new Set<number>();
  if (d.clocks >= 2) sealed.add(randInt(rng, 2, Math.max(2, Math.floor(layers / 2))));
  if (d.clocks >= 4) sealed.add(randInt(rng, Math.floor(layers / 2) + 1, layers - 2));
  for (let layer = 1; layer < layers; layer++) {
    const width = layer === layers - 1 ? 1 : randInt(rng, 1, 3);
    const cur: number[] = [];
    for (let i = 0; i < width; i++) {
      const type: RoomType =
        layer === layers - 1
          ? 'boss'
          : layer === 1
            ? 'monster'
            : pickWeighted<RoomType>(rng, [['monster', 55], ['elite', layer >= 3 ? 12 : 0], ['treasure', 12], ['shrine', 8], ['trap', 13]])!;
      const n: DNode = { id: nodes.length, layer, type, next: [], oneWay: sealed.has(layer), cleared: false };
      nodes.push(n);
      cur.push(n.id);
    }
    // Every room links forward to 1–2 rooms, and every new room has a way in.
    for (const p of prev) {
      const a = cur[Math.floor(rng() * cur.length)];
      nodes[p].next.push(a);
      if (cur.length > 1 && rng() < 0.5) {
        const b = cur[Math.floor(rng() * cur.length)];
        if (!nodes[p].next.includes(b)) nodes[p].next.push(b);
      }
    }
    for (const c of cur) if (!prev.some((p) => nodes[p].next.includes(c))) nodes[prev[Math.floor(rng() * prev.length)]].next.push(c);
    prev = cur;
  }
  return nodes;
}

/** Monsters waiting in a room, by depth. Deeper rooms hold more and nastier foes. */
export function roomFoes(id: DungeonId, node: DNode, seed: number): MonsterId[] {
  const d = DUNGEONS[id];
  const rng = mulberry32(seed * 31 + node.id * 7919);
  if (node.type === 'boss') return [d.boss, d.pool[1]];
  if (node.type === 'elite') return [d.elite];
  const n = Math.min(3, 1 + Math.floor(rng() * (1 + node.layer / 3)));
  return Array.from({ length: n }, () => d.pool[rng() < 0.35 + node.layer * 0.06 ? 1 : 0]);
}

/* ---------------- board & scouting ---------------- */

export function nextSeed(s: GameState, id: DungeonId, rng: Rng): number {
  if (!s.dungeonSeeds[id]) s.dungeonSeeds[id] = Math.floor(rng() * 2 ** 31);
  return s.dungeonSeeds[id]!;
}

export function scoutCost(id: DungeonId, level: 1 | 2): number {
  return DUNGEONS[id].skulls * (level === 1 ? 20 : 60);
}

/** Pays a scout (design 6.3). A ranger with Tracking 30+ gets the first level free. */
export function scout(s: GameState, c: Character, id: DungeonId, level: 1 | 2): boolean {
  const cur = s.scouted[id] ?? 0;
  if (cur >= level) return false;
  const free = level === 1 && c.skills.tracking >= 300;
  const cost = free ? 0 : scoutCost(id, level);
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
  const nodes = recover ? c.corpse!.nodes.map((n) => ({ ...n, next: [...n.next] })) : generate(id, seed);
  const run: Run = {
    dungeon: id, seed, nodes, at: 0, path: [0], sealed: false, bossDown: false, combat: null, retreated: false,
    scouted: recover ? 2 : s.scouted[id] ?? 0, log: [], loot: 0,
  };
  if (recover) {
    nodes[c.corpse!.node].cleared = false;
    say(run, 'dun.recover', undefined, 'sys');
  } else {
    delete s.dungeonSeeds[id];
    delete s.scouted[id];
  }
  say(run, `dun.enter.${id}`, undefined, 'sys');
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
  if (node.cleared) return;
  switch (node.type) {
    case 'monster':
    case 'elite':
    case 'boss': {
      const foes = roomFoes(run.dungeon, node, run.seed);
      run.combat = startCombat(foes);
      say(run, node.type === 'boss' ? 'dun.boss' : 'dun.ambush', { count: foes.length }, 'bad');
      break;
    }
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
    case 'start':
      break;
  }
  if (c.corpse && c.corpse.node === node.id && corpseFresh(c) && node.cleared) say(run, 'dun.corpseHere', undefined, 'sys');
}

/** Plays a round of the current fight and handles winning, fleeing and dying. */
export function fight(s: GameState, c: Character, action: Action, rng: Rng): Outcome | null {
  const run = c.run;
  if (!run?.combat) return null;
  const out = playRound(c, run, action, rng);
  if (out === 'won') {
    const node = here(run);
    loot(c, run, run.combat.foes, rng);
    run.combat = null;
    node.cleared = true;
    if (node.type === 'boss') {
      run.bossDown = true;
      if (!s.cleared.includes(run.dungeon)) s.cleared.push(run.dungeon);
      say(run, 'dun.bossDown', undefined, 'gain');
    }
    if (c.corpse && c.corpse.node === node.id && corpseFresh(c)) say(run, 'dun.corpseHere', undefined, 'sys');
  } else if (out === 'fled') {
    // Monsters stay. Step back a room if the way back isn't sealed behind this room.
    run.combat = null;
    const node = here(run);
    if (run.path.length > 1 && !node.oneWay) {
      run.path.pop();
      run.at = run.path[run.path.length - 1];
      say(run, 'dun.backed', undefined, 'sys');
    } else {
      run.retreated = true;
      say(run, 'dun.cornered', undefined, 'sys');
    }
  } else if (out === 'died') die(s, c);
  return out;
}

/** Faces the monsters again after fleeing into a corner of their room. */
export function reengage(c: Character): boolean {
  const run = c.run;
  if (!run || run.combat || here(run).cleared) return false;
  run.retreated = false;
  run.combat = startCombat(roomFoes(run.dungeon, here(run), run.seed));
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
  if (!run || !k || k.decaysAt <= now || run.at !== k.node || run.combat || !here(run).cleared) return false;
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
