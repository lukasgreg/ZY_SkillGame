/**
 * Balance simulations. Skipped by default; run with `SIM=1 npx vitest run src/engine/sim.test.ts`.
 * They play the game with simple policies and print how fast things go, so tuning has numbers behind it.
 */
import { describe, it } from 'vitest';
import type { DungeonId } from '../data/dungeons';
import { createCharacter, regen, rollCharacter } from './character';
import { camp, enter, exits, fight, here, leave, move, openBossChest } from './dungeon';
import { findNode, pull, pullStamina } from './gather';
import { effectiveCap } from './levels';
import { mulberry32 } from './rng';
import { maxHp } from './skills';
import { newGameState, type Character, type GameState } from './state';

const SIM = !!(globalThis as { process?: { env?: Record<string, string> } }).process?.env?.SIM;

function fresh(prof: 'craftsman' | 'warrior' | 'ranger', seed: number) {
  const rng = mulberry32(seed);
  const s = newGameState('en');
  const c = createCharacter(s, 'Sim', 'human', prof, rollCharacter('human', prof, rng));
  return { s, c, rng };
}

describe.skipIf(!SIM)('balance simulations', () => {
  it('mining from scratch: real time including waiting for stamina', () => {
    const { c, rng } = fresh('craftsman', 1);
    c.location = 'mine';
    let t = 0; // ms of play
    const marks: string[] = [];
    let next = 300;
    while (t < 20 * 3600_000 && c.skills.mining < 1000) {
      c.regenAt = t;
      if (c.stamina < pullStamina(c)) {
        regen(c, t + 5000);
        t += 5000;
        continue;
      }
      if (!c.node || c.node.left <= 0) {
        c.node = findNode(c, rng);
        t += 1600;
      }
      c.pack.res = {};
      c.pack.items[0].dur = 50;
      pull(c, rng);
      t += 3500;
      regen(c, t);
      if (c.skills.mining >= next) {
        marks.push(`Mining ${next / 10}: ${(t / 3600_000).toFixed(2)} h, level ${c.level}, cap ${effectiveCap(c, 'mining') / 10}`);
        next += 100;
      }
    }
    marks.push(`stopped at Mining ${c.skills.mining / 10}, level ${c.level}, ${(t / 3600_000).toFixed(1)} h`);
    console.log(marks.join('\n'));
  });

  it('a new warrior running dungeons over and over', () => {
    for (const prof of ['warrior', 'ranger'] as const) {
      const { s, c, rng } = fresh(prof, 7);
      const lines: string[] = [];
      let runs = 0;
      let deaths = 0;
      let rounds = 0;
      let bosses = 0;
      let recentDeaths = 0;
      let recentBosses = 0;
      let target: DungeonId = 'cellar';
      while (runs < 120) {
        runs++;
        c.location = 'town';
        c.run = null;
        c.corpse = null;
        c.hp = maxHp(c);
        c.stamina = c.stats.dex;
        c.pack.res.bandage = 10;
        if (prof === 'ranger') c.pack.res.arrow = 150;
        for (const it of c.pack.items) it.dur = it.maxDur;
        for (const p of c.pets) (p.hp = 999, (p.dead = false), (p.fedAt = Date.now()));
        const r = simRun(s, c, target, rng);
        rounds += r.rounds;
        if (r.died) (deaths++, recentDeaths++);
        if (r.boss) (bosses++, recentBosses++);
        if (runs % 10 === 0) {
          lines.push(`${prof} run ${runs} (${target}): level ${c.level}, deaths ${deaths}, bosses ${bosses}, gold ${c.gold}, avg rounds/run ${Math.round(rounds / runs)}`);
          // move up when the current place is easy
          const order: DungeonId[] = ['cellar', 'wilds', 'frostCave', 'manor', 'crypt', 'warrens'];
          const i = order.indexOf(target);
          if (recentDeaths <= 2 && recentBosses >= 6 && i < order.length - 1) target = order[i + 1];
          recentDeaths = 0;
          recentBosses = 0;
        }
      }
      console.log(lines.join('\n'));
    }
  });
});

/** Plays one expedition with a simple policy. Bandage under 40%, flee under 15%, leave after the boss. */
function simRun(s: GameState, c: Character, id: DungeonId, rng: () => number) {
  const run = enter(s, c, id, rng)!;
  let rounds = 0;
  let steps = 0;
  let t = 0;
  c.regenAt = 0;
  while (c.run && steps++ < 800) {
    t += 3000; // a round or a step takes a few seconds; hits and stamina come back meanwhile
    regen(c, t);
    if (run.combat) {
      rounds++;
      const low = c.hp / maxHp(c);
      const act = low < 0.15 ? { type: 'flee' as const } : low < 0.4 && (c.pack.res.bandage ?? 0) > 0 && !run.combat.bandaging ? { type: 'bandage' as const } : { type: 'attack' as const };
      const out = fight(s, c, act, rng);
      if (out === 'died') return { died: true, boss: false, rounds };
      continue;
    }
    if (run.bossDown) {
      openBossChest(s, c, rng);
      leave(c);
      return { died: false, boss: true, rounds };
    }
    const node = here(run);
    if (node.type === 'event' && !node.cleared) {
      node.cleared = true;
      continue;
    }
    if (c.hp < maxHp(c) * 0.6) {
      camp(s, c, rng);
      t += 3000;
      continue;
    }
    const ex = exits(run);
    if (!ex.length) {
      if (run.retreated) {
        leave(c);
        return { died: false, boss: false, rounds };
      }
      break;
    }
    move(s, c, ex[Math.floor(rng() * ex.length)].id, rng);
  }
  leave(c);
  return { died: false, boss: false, rounds };
}
