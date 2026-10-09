import { describe, expect, it } from 'vitest';
import { SKILL_IDS } from '../data/skills';
import { createCharacter, rollCharacter, packWeight } from './character';
import { canGather, findNode, pull, pullChance } from './gather';
import { mulberry32 } from './rng';
import { exportSave, importSave } from './save';
import { gainAmount, gainChance, successChance, totalSkills, trySkillGain } from './skills';
import { newGameState } from './state';
import { npcRepair, sellPrice, sellRes } from './town';

function setup(seed = 1) {
  const rng = mulberry32(seed);
  const s = newGameState('en');
  const c = createCharacter(s, 'Bodrik', 'barbarian', 'craftsman', rollCharacter('barbarian', 'craftsman', rng));
  c.level = 30; // full skill caps for rule tests
  return { s, c, rng };
}

describe('skill formulas', () => {
  it('success chance is linear between min and max', () => {
    expect(successChance(0, 0, 30)).toBe(0);
    expect(successChance(15, 0, 30)).toBe(0.5);
    expect(successChance(50, 0, 30)).toBe(1);
  });

  it('gain chance falls as skill rises and is zero when too easy', () => {
    expect(gainChance(5, 0.5, true)).toBeGreaterThan(gainChance(50, 0.5, true));
    expect(gainChance(50, 0.5, true)).toBeGreaterThan(gainChance(95, 0.5, true));
    expect(gainChance(40, 0.5, true, { tooEasyAt: 40 })).toBe(0);
    expect(gainChance(40, 0.5, false)).toBeCloseTo(gainChance(40, 0.5, true) / 2);
  });

  it('rare tasks give more gain chance', () => {
    expect(gainChance(70, 0.5, true, { rarity: 2 })).toBeCloseTo(gainChance(70, 0.5, true) * 2);
  });

  it('gains below 10 skill can be up to 0.3', () => {
    const rng = mulberry32(3);
    const seen = new Set<number>();
    for (let i = 0; i < 200; i++) seen.add(gainAmount(5, rng));
    expect([...seen].sort()).toEqual([1, 2, 3]);
    expect(gainAmount(80, rng)).toBe(1);
  });

  it('respects the profession cap and locks', () => {
    const { c, rng } = setup();
    c.skills.edged = 200; // craftsman cap for edged is 20
    for (let i = 0; i < 1000; i++) trySkillGain(c, 'edged', 0.5, true, rng);
    expect(c.skills.edged).toBe(200);
    c.locks.fishing = 'locked';
    for (let i = 0; i < 1000; i++) trySkillGain(c, 'fishing', 0.5, true, rng);
    expect(c.skills.fishing).toBe(0);
  });

  it('enforces the 700 total cap using skills marked down', () => {
    const { c, rng } = setup();
    for (const id of SKILL_IDS) c.skills[id] = 0;
    c.skills.mining = 400;
    c.skills.blacksmithing = 1000;
    c.skills.carpentry = 1000;
    c.skills.tinkering = 1000;
    c.skills.tailoring = 1000;
    c.skills.bowcraft = 1000;
    c.skills.cooking = 1000;
    c.skills.lumberjacking = 600;
    expect(totalSkills(c)).toBe(7000);
    for (let i = 0; i < 2000; i++) trySkillGain(c, 'mining', 0.5, true, rng);
    expect(c.skills.mining).toBe(400);
    c.locks.cooking = 'down';
    for (let i = 0; i < 2000; i++) trySkillGain(c, 'mining', 0.5, true, rng);
    expect(c.skills.mining).toBeGreaterThan(400);
    expect(totalSkills(c)).toBe(7000);
  });
});

describe('mining', () => {
  it('cannot mine in town, can at a vein', () => {
    const { c, rng } = setup();
    expect(canGather(c)).toBe('notThere');
    c.location = 'mine';
    expect(canGather(c)).toBe('noNode');
    c.node = findNode(c, rng);
    expect(canGather(c)).toBe(null);
  });

  it('pull chance needs the minimum skill', () => {
    expect(pullChance(29, 'copperOre')).toBe(0);
    expect(pullChance(30, 'copperOre')).toBeCloseTo(0.3);
    expect(pullChance(60, 'copperOre')).toBeCloseTo(0.95);
  });

  it('pulls wear the tool and break it at 0', () => {
    const { c, rng } = setup();
    c.location = 'mine';
    c.node = { res: 'ironOre', left: 999 };
    c.stamina = 1e9;
    const tool = c.pack.items[0];
    tool.dur = 2;
    pull(c, rng);
    expect(tool.dur).toBe(1);
    const r = pull(c, rng);
    expect(r.toolBroke).toBe(true);
    expect(r.tool).toBe(tool);
    expect(c.tool).toBe(null);
    expect(canGather(c)).toBe('noTool');
  });

  it('respects the weight limit', () => {
    const { c } = setup();
    c.location = 'mine';
    c.node = { res: 'ironOre', left: 5 };
    c.pack.res.stone = 500;
    expect(packWeight(c.pack)).toBeGreaterThan(100);
    expect(canGather(c)).toBe('overweight');
  });

  it('pacing: active mining from 0 to 30 takes a reasonable time', () => {
    const { c, rng } = setup(7);
    c.skills.mining = 0;
    c.location = 'mine';
    let ms = 0;
    let pulls = 0;
    while (c.skills.mining < 300 && pulls < 20000) {
      if (!c.node || c.node.left <= 0) c.node = findNode(c, rng);
      c.stamina = 1e9;
      c.pack.res = {};
      c.pack.items[0].dur = 50;
      pull(c, rng);
      ms += 3500;
      pulls++;
    }
    const minutes = ms / 60000;
    // design target: ~20–30 min of active play (allow a wide band while tuning)
    expect(minutes).toBeGreaterThan(8);
    expect(minutes).toBeLessThan(60);
  });
});

describe('town', () => {
  it('selling lowers the trader price', () => {
    const { s, c } = setup();
    c.pack.res.ironOre = 200;
    const before = sellPrice(s, 'ironOre');
    const gold = sellRes(s, c, 'ironOre', 200);
    expect(gold).toBeGreaterThan(0);
    expect(sellPrice(s, 'ironOre')).toBeLessThan(before);
    expect(c.pack.res.ironOre).toBeUndefined();
  });

  it('npc repair lowers max durability', () => {
    const { c } = setup();
    const t = c.pack.items[0];
    t.dur = 10;
    expect(npcRepair(c, t)).toBe(true);
    expect(t.maxDur).toBe(45);
    expect(t.dur).toBe(45);
  });
});

describe('save', () => {
  it('round-trips through export with Czech names', () => {
    const { s, c } = setup();
    c.name = 'Řehoř Žlutý';
    const back = importSave(exportSave(s));
    expect(back.chars[0].name).toBe('Řehoř Žlutý');
  });
});

import { canCraft, craft, craftChance, itemValue, repair, smelt } from './craft';
import { RECIPES } from '../data/recipes';
import { deliverGoods, matches, sellToWanderer, spawnWanderer, tickWanderers, wandererPays } from './wanderers';

describe('crafting', () => {
  const longsword = RECIPES.find((r) => r.id === 'longsword')!;

  it('craftsman starts with smithing and tinkering tools', () => {
    const { c } = setup();
    expect(c.pack.items.map((i) => i.def).sort()).toEqual(['club', 'hatchet', 'pickaxe', 'smithHammer', 'tinkerTools']);
  });

  it('smelts two ore into a bar', () => {
    const { c } = setup();
    c.pack.res.ironOre = 2;
    const r = smelt(c, 'ironOre', () => 0);
    expect(r.ok).toBe(true);
    expect(c.pack.res.ironBar).toBe(1);
    expect(c.pack.res.ironOre).toBeUndefined();
  });

  it('metal raises the required skill', () => {
    const { c } = setup();
    c.skills.blacksmithing = 400;
    c.pack.res.ironBar = 20;
    c.pack.res.mithrilBar = 20;
    expect(canCraft(c, longsword, 'iron')).toBe(null);
    expect(canCraft(c, longsword, 'mithril')).toBe('noSkill');
  });

  it('a successful craft makes an item and uses bars; failure loses some', () => {
    const { s, c } = setup();
    c.skills.blacksmithing = 600;
    c.pack.res.ironBar = 16;
    const ok = craft(s, c, longsword, 'iron', () => 0.01);
    expect(ok.ok).toBe(true);
    expect(ok.item?.def).toBe('longsword');
    expect(c.pack.res.ironBar).toBe(8);
    const fail = craft(s, c, longsword, 'iron', () => 0.99);
    expect(fail.ok).toBe(false);
    expect(c.pack.res.ironBar!).toBeLessThan(8);
    expect(c.pack.res.ironBar!).toBeGreaterThan(0);
  });

  it('craft chance follows the recipe range', () => {
    expect(craftChance(34, 35, 65)).toBe(0);
    expect(craftChance(35, 35, 65)).toBeCloseTo(0.1);
    expect(craftChance(65, 35, 65)).toBeCloseTo(0.95);
  });

  it('repair restores durability but lowers max', () => {
    const { s, c } = setup();
    c.skills.blacksmithing = 800;
    c.pack.res.ironBar = 8;
    const it = craft(s, c, longsword, 'iron', () => 0.01).item!;
    it.dur = 5;
    const before = it.maxDur;
    const r = repair(c, it, () => 0.01);
    expect(r.ok).toBe(true);
    expect(it.maxDur).toBeLessThan(before);
    expect(it.dur).toBe(it.maxDur);
  });

  it('exceptional and metal items are worth more', () => {
    const { s, c } = setup();
    c.skills.blacksmithing = 1000;
    c.pack.res.ironBar = 8;
    c.pack.res.silverBar = 8;
    const a = craft(s, c, longsword, 'iron', () => 0.99 * 0 + 0.5).item;
    const b = craft(s, c, longsword, 'silver', () => 0.5).item;
    expect(a && b && itemValue(b) > itemValue(a)).toBe(true);
  });
});

describe('wanderers', () => {
  it('arrive over time, buy matching items and leave', () => {
    const { s, c } = setup();
    const rng = mulberry32(5);
    const now = Date.now();
    s.nextWandererAt = now;
    expect(tickWanderers(s, rng, now)).toBe(true);
    let w = s.wanderers[0];
    while (!w.wants) w = spawnWanderer(s, rng, now);
    s.wanderers = [w];
    const it = { uid: 999, def: w.wants, dur: 50, maxDur: 50, quality: 'exceptional' as const, mat: 'mithril' as const };
    c.pack.items.push(it);
    expect(matches(w, it)).toBe(true);
    const gold = c.gold;
    expect(sellToWanderer(s, c, w, it)).toBe(true);
    expect(c.gold).toBe(gold + wandererPays(w, it));
    expect(wandererPays(w, it)).toBeGreaterThan(w.offer);
    expect(s.reputation).toBe(1);
    expect(s.wanderers.length).toBe(0);
    let g = spawnWanderer(s, rng, now);
    while (!g.wantsRes) g = spawnWanderer(s, rng, now);
    s.wanderers = [g];
    expect(deliverGoods(s, c, g)).toBe(false);
    c.pack.res[g.wantsRes.id] = g.wantsRes.n;
    expect(deliverGoods(s, c, g)).toBe(true);
    expect(c.pack.res[g.wantsRes.id]).toBeUndefined();
    s.wanderers.push(spawnWanderer(s, rng, now));
    tickWanderers(s, rng, now + 3_600_000);
    expect(s.wanderers.every((x) => x.leavesAt > now + 3_600_000)).toBe(true);
  });
});

import { buildBunkhouse, catchUp, giveTool, hire, hireCost, OFFLINE_CAP_MS, slots, train, workerCap } from './workers';

describe('workers', () => {
  it('hiring gets more expensive and is limited by slots', () => {
    const { s } = setup();
    s.bank.gold = 10_000;
    const c1 = hireCost(s);
    expect(hire(s, 'mine', () => 0.5)).not.toBe(null);
    expect(hireCost(s)).toBeGreaterThan(c1);
    hire(s, 'forest', () => 0.5);
    expect(s.workers.length).toBe(slots(s));
    expect(hire(s, 'coast', () => 0.5)).toBe(null);
  });

  it('worker skill is capped at the best character skill minus 10', () => {
    const { s, c } = setup();
    s.bank.gold = 100_000;
    c.skills.mining = 250;
    const w = hire(s, 'mine', () => 0.5)!;
    expect(workerCap(s, 'mine')).toBe(150);
    while (train(s, w));
    expect(w.skill).toBe(150);
  });

  it('works offline up to the cap, delivers to the bank, wears the tool and draws wages', () => {
    const { s, c, rng } = setup();
    s.bank.gold = 1000;
    c.skills.mining = 400;
    const w = hire(s, 'mine', rng)!;
    const gold = s.bank.gold;
    const pick = c.pack.items.find((i) => i.def === 'pickaxe')!;
    expect(giveTool(c, w, pick)).toBe(true);
    w.toolDur = 1000;
    s.workersAt = Date.now() - 24 * 3600_000;
    const r = catchUp(s, Date.now(), rng);
    expect(r.ms).toBe(OFFLINE_CAP_MS);
    expect(Object.values(s.bank.res).reduce((a, b) => a + (b ?? 0), 0)).toBeGreaterThan(50);
    expect(w.toolDur).toBeLessThan(1000 - 30);
    expect(w.toolDur).toBeGreaterThan(1000 - 120);
    expect(s.bank.gold).toBeLessThan(gold);
  });

  it('stops without a tool or wages', () => {
    const { s, c, rng } = setup();
    s.bank.gold = 200;
    c.skills.mining = 300;
    const w = hire(s, 'mine', rng)!;
    w.toolDur = 3;
    s.workersAt = Date.now() - 6 * 3600_000;
    catchUp(s, Date.now(), rng);
    expect(w.toolDur).toBe(0);
  });

  it('bunkhouse needs carpentry, oak and gold, and adds a slot', () => {
    const { s, c } = setup();
    c.skills.carpentry = 200;
    c.gold = 1000;
    c.pack.res.oakLog = 15;
    expect(buildBunkhouse(s, c)).toBe(true);
    expect(slots(s)).toBe(3);
    expect(c.pack.res.oakLog).toBeUndefined();
  });
});

import { accept, combineFragments, craftPlan, fortify, handIn, makeContract, tickContracts } from './contracts';
import { maxWeight } from './skills';

describe('contracts and plans', () => {
  it('offers contracts sized to the character and pays out on completion', () => {
    const { s, c } = setup();
    const rng = mulberry32(9);
    c.skills.blacksmithing = 450;
    expect(tickContracts(s, c, rng, Date.now())).toBe(true);
    expect(s.contractOffers.length).toBe(1);
    let k = makeContract(c, rng, Date.now())!;
    while (!k.wants) k = makeContract(c, rng, Date.now())!;
    s.contractOffers = [k];
    expect(accept(s, k)).toBe(true);
    const live = s.contracts[0];
    for (let i = 0; i < live.n; i++) {
      c.pack.items.push({ uid: 5000 + i, def: live.wants!, dur: 100, maxDur: 100, quality: 'exceptional', mat: 'mithril' });
    }
    const gold = c.gold;
    const r = handIn(s, c, live);
    expect(r.done).toBe(true);
    expect(c.gold).toBe(gold + live.reward.gold);
    expect(s.contracts.length).toBe(0);
    expect(s.reputation).toBe(3);
  });

  it('fragments make a plan, and a plan is used up on success', () => {
    const { s, c } = setup();
    c.pack.res.planFragment = 5;
    const id = combineFragments(c, () => 0)!;
    expect(c.plans[id]).toBe(1);
    c.plans = { fortifyingPowder: 1 };
    c.skills.tinkering = 900;
    c.pack.res.sulfur = 4;
    c.pack.res.roughGem = 1;
    c.pack.res.coal = 4;
    const r = craftPlan(s, c, 'fortifyingPowder', () => 0.01)!;
    expect(r.ok).toBe(true);
    expect(c.plans.fortifyingPowder).toBeUndefined();
    expect(c.pack.res.fortifyingPowder).toBe(3);
    const it = c.pack.items[0];
    const max = it.maxDur;
    expect(fortify(c, it)).toBe(true);
    expect(it.maxDur).toBe(max + 10);
  });

  it('a reinforced pack raises carrying capacity', () => {
    const { c } = setup();
    const base = maxWeight(c);
    c.pack.items.push({ uid: 777, def: 'reinforcedPack', dur: 200, maxDur: 200, quality: 'normal' });
    expect(maxWeight(c)).toBe(base + 50);
  });
});

import { canStance, equip, hitChance, setStance, weaponInfo } from './combat';
import { camp, canLeave, decay, enter, exits, fight, generate, here, leave, move, scout, waitingFoes } from './dungeon';
import { DUNGEON_IDS } from '../data/dungeons';

function warrior(seed = 3) {
  const rng = mulberry32(seed);
  const s = newGameState('en');
  const c = createCharacter(s, 'Ragna', 'barbarian', 'warrior', rollCharacter('barbarian', 'warrior', rng));
  c.level = 30;
  return { s, c, rng };
}

describe('combat', () => {
  it('warriors start armed and armoured', () => {
    const { c } = warrior();
    expect(weaponInfo(c).skill).toBe('edged');
    expect(c.equip.shield).toBeDefined();
    expect(c.equip.head).toBeDefined();
  });

  it('hit chance is 50% between equals and rises with skill', () => {
    expect(hitChance(50, 50)).toBeCloseTo(0.6);
    expect(hitChance(80, 50)).toBeGreaterThan(hitChance(50, 50));
  });

  it('stances need training and cost all stamina', () => {
    const { c } = warrior();
    c.skills.tactics = 400;
    expect(canStance(c, 'combat')).toBe(false);
    c.skills.tactics = 500;
    c.stamina = 30;
    expect(setStance(c, 'combat')).toBe(true);
    expect(c.stamina).toBe(0);
  });

  it('equipping a ranged weapon needs arrows to attack', () => {
    const { c } = warrior();
    c.pack.items.push({ uid: 4242, def: 'shortbow', dur: 40, maxDur: 40, quality: 'normal' });
    expect(equip(c, 4242)).toBe(true);
    expect(weaponInfo(c).skill).toBe('archery');
  });
});

describe('dungeons', () => {
  it('generates the same map from the same seed, ending in a boss', () => {
    for (const id of DUNGEON_IDS) {
      const a = generate(id, 1234);
      expect(generate(id, 1234)).toEqual(a);
      expect(a[a.length - 1].type).toBe('boss');
      // every room except the start is reachable
      const reach = new Set([0]);
      for (const n of a) if (reach.has(n.id)) n.next.forEach((x) => reach.add(x));
      expect(reach.size).toBe(a.length);
    }
  });

  it('scouting costs gold, trackers scout the first level free', () => {
    const { s, c } = warrior();
    c.gold = 0;
    expect(scout(s, c, 'manor', 1)).toBe(false);
    c.skills.tracking = 300;
    expect(scout(s, c, 'manor', 1)).toBe(true);
  });

  it('a full run: fight, clear rooms and walk out', () => {
    const { s, c } = warrior(11);
    const rng = mulberry32(11);
    for (const k of ['edged', 'tactics', 'shieldBlock', 'anatomy'] as const) c.skills[k] = 1000;
    c.stats.str = 100;
    const run = enter(s, c, 'cellar', rng)!;
    expect(c.location).toBe('dungeon');
    let steps = 0;
    while (!run.bossDown && steps++ < 200) {
      c.hp = 999;
      if (run.combat) fight(s, c, { type: 'attack' }, rng);
      else {
        const ex = exits(run);
        if (!ex.length) break;
        move(s, c, ex[0].id, rng);
      }
    }
    expect(run.bossDown).toBe(true);
    expect(canLeave(run)).toBe(true);
    expect(leave(c)).toBe(true);
    expect(c.location).toBe('town');
    expect(s.cleared).toContain('cellar');
  });

  it('dying leaves a corpse you can loot within five minutes', () => {
    const { s, c } = warrior(5);
    const rng = mulberry32(5);
    const run = enter(s, c, 'frostCave', rng)!;
    const gold = (c.gold = 77);
    move(s, c, exits(run)[0].id, rng);
    expect(run.combat).not.toBe(null);
    c.hp = 1;
    let out = null;
    for (let i = 0; i < 200 && out !== 'died'; i++) {
      c.skills.edged = 0;
      c.skills.shieldBlock = 0;
      c.hp = 1;
      out = fight(s, c, { type: 'wait' }, rng);
      if (out === 'won') break;
    }
    expect(out).toBe('died');
    expect(c.location).toBe('town');
    expect(c.gold).toBe(0);
    expect(c.pack.items.length).toBe(0);
    const corpseNode = c.corpse!.node;
    // go back with a fresh body: walking into the room grabs the corpse before the fight resumes
    for (const k of ['edged', 'tactics', 'shieldBlock'] as const) c.skills[k] = 1000;
    const again = enter(s, c, 'frostCave', rng)!;
    expect(again.seed).toBe(c.corpse!.seed);
    move(s, c, corpseNode, rng);
    expect(c.corpse).toBe(null);
    expect(c.gold).toBeGreaterThanOrEqual(gold);
    expect(c.pack.items.length).toBeGreaterThan(0);
    expect(again.combat).not.toBe(null);
    expect(s.stats.recovered).toBe(1);
  });

  it('monsters you flee from keep their wounds and heal only slowly', () => {
    const { s, c } = warrior(21);
    const rng = mulberry32(21);
    const run = enter(s, c, 'manor', rng)!;
    const first = exits(run)[0].id;
    move(s, c, first, rng);
    const foe = run.combat!.foes[0];
    foe.hp = 5;
    c.stats.dex = 200;
    let out = null;
    for (let i = 0; i < 20 && out !== 'fled'; i++) {
      c.hp = 999;
      out = fight(s, c, { type: 'flee' }, rng);
    }
    expect(out).toBe('fled');
    const node = run.nodes[first];
    expect(node.foes?.length).toBeGreaterThan(0);
    // ten minutes later they have healed 20% of their hits, not all of it
    node.foesAt = Date.now() - 10 * 60_000;
    const back = waitingFoes(run, node)[0];
    expect(back.hp).toBeLessThan(42);
    expect(back.hp).toBeGreaterThan(5);
  });

  it('corpses decay after five minutes', () => {
    const { s, c, rng } = warrior();
    enter(s, c, 'cellar', rng);
    c.corpse = { dungeon: 'cellar', seed: 1, nodes: generate('cellar', 1), node: 1, pack: { res: {}, items: [] }, gold: 5, equip: {}, decaysAt: Date.now() - 1 };
    expect(decay(c)).toBe(true);
    expect(c.corpse).toBe(null);
  });

  it('camping restores or gets you ambushed', () => {
    const { s, c, rng } = warrior();
    enter(s, c, 'cellar', rng);
    c.hp = 10;
    const r = camp(s, c, () => 0.99);
    expect(r).toBe('rested');
    expect(c.hp).toBeGreaterThan(10);
    expect(here(c.run!).type).toBe('start');
  });
});

import { canControl, feed, gainPetXp, loyaltyNow, makePet, maxSlots, petMaxHp, resurrect, tameChance, tickPets, track, tryTame, usedSlots } from './pets';
import { startCombat } from './combat';

function ranger(seed = 4) {
  const rng = mulberry32(seed);
  const s = newGameState('en');
  const c = createCharacter(s, 'Ylva', 'elf', 'ranger', rollCharacter('elf', 'ranger', rng));
  c.level = 30;
  const hound = c.pets[0];
  c.pets = []; // most pet tests start with an empty stable
  return { s, c, rng, hound };
}

describe('taming and pets', () => {
  it('rangers start with a bow, arrows and a hound', () => {
    const { c, hound } = ranger();
    expect(hound.kind).toBe('dog');
    expect(weaponInfo(c).skill).toBe('archery');
    expect(c.pack.res.arrow).toBe(150);
  });

  it('taming happens in the wild: track an animal, then a slow taming; INT sets the slots', () => {
    const { c } = ranger();
    const rng = mulberry32(8);
    c.stats.int = 30;
    expect(maxSlots(c)).toBe(3);
    expect(canControl(c, 'chicken')).toBe(true);
    expect(canControl(c, 'bear')).toBe(false);
    c.stats.int = 100;
    expect(maxSlots(c)).toBe(10);
    c.skills.tracking = 300;
    c.wildsArea = 1;
    let found = null;
    for (let i = 0; i < 20 && !found; i++) found = track(c, rng);
    expect(found).not.toBe(null);
    c.skills.taming = 900;
    let r = tryTame(c, 'dog', rng);
    for (let i = 0; i < 20 && !r.ok; i++) r = tryTame(c, 'dog', rng);
    expect(r.ok).toBe(true);
    expect(usedSlots(c)).toBe(2);
    expect(tameChance(c, 'skeleton')).toBe(0);
  });

  it('a failed taming of a fierce animal can hurt you', () => {
    const { c } = ranger();
    c.skills.taming = 0;
    c.hp = 100;
    let hurt = false;
    for (let i = 0; i < 40 && !hurt; i++) {
      const r = tryTame(c, 'bear', mulberry32(i));
      if (!r.ok && r.attacked > 0) hurt = true;
    }
    expect(hurt).toBe(true);
    expect(c.hp).toBeGreaterThan(0);
  });

  it('pets level up from shared kill experience and grow stronger', () => {
    const { s, c } = ranger(14);
    const rng = mulberry32(14);
    c.stats.int = 100;
    c.pets.push(makePet('wolf', 1));
    const before = petMaxHp(c.pets[0]);
    enter(s, c, 'wilds', rng);
    c.run!.combat = startCombat(['bear']);
    c.skills.archery = 1000;
    c.pack.res.arrow = 100;
    for (let i = 0; i < 60 && c.run?.combat; i++) {
      c.hp = 999;
      c.pets[0].hp = 999;
      fight(s, c, { type: 'attack' }, rng);
    }
    expect(c.pets[0].xp + c.pets[0].level * 1000).toBeGreaterThan(1000);
    expect(gainPetXp(c.pets[0], 100_000)).toBeGreaterThan(0);
    expect(petMaxHp(c.pets[0])).toBeGreaterThan(before);
  });

  it('loyalty drops over time; hungry pets run off, fed and loyal pets bond', () => {
    const { c } = ranger();
    const now = Date.now();
    c.pets.push({ id: 1, kind: 'wolf', hp: 36, skill: 300, loyalty: 60, fedAt: now - 13 * 3600_000, tamedAt: now - 30 * 3600_000, bonded: false, dead: false, level: 1, xp: 0 });
    expect(loyaltyNow(c.pets[0], now)).toBe(0);
    expect(tickPets(c, now).ran.length).toBe(1);
    c.pets.push({ id: 2, kind: 'wolf', hp: 36, skill: 300, loyalty: 40, fedAt: now, tamedAt: now - 30 * 3600_000, bonded: false, dead: false, level: 1, xp: 0 });
    c.pack.res.perch = 1;
    expect(feed(c, c.pets[0], 'perch', now)).toBe(true);
    expect(tickPets(c, now).bonded.length).toBe(1);
  });

  it('a bonded pet that dies can be brought back with Animal Healing', () => {
    const { c } = ranger();
    c.skills.animalHealing = 1000;
    c.pack.res.bandage = 10;
    c.pets.push({ id: 3, kind: 'bear', hp: 0, skill: 400, loyalty: 80, fedAt: Date.now(), tamedAt: 0, bonded: true, dead: true, level: 1, xp: 0 });
    expect(resurrect(c, c.pets[0], () => 0.01)).toBe(true);
    expect(c.pets[0].dead).toBe(false);
  });
});

import { canTrainSkill, trainSkill, trainSkillCost } from './town';

describe('trainers', () => {
  it('teach up to 30 within the profession cap, for rising gold', () => {
    const { c } = setup();
    c.gold = 100_000;
    c.skills.fishing = 0;
    const first = trainSkillCost(c, 'fishing');
    while (trainSkill(c, 'fishing'));
    expect(c.skills.fishing).toBe(300);
    expect(trainSkillCost(c, 'fishing')).toBeGreaterThan(first);
    c.skills.edged = 190; // craftsman cap 20
    expect(trainSkill(c, 'edged')).toBe(true);
    expect(c.skills.edged).toBe(200);
    expect(canTrainSkill(c, 'edged')).toBe(false);
  });
});

import { checkAchievements } from './achievements';

describe('achievements', () => {
  it('unlock once, from stats and from the state of the world', () => {
    const { s, c } = setup();
    c.skills.mining = 200;
    for (const id of SKILL_IDS) if (c.skills[id] >= 300) c.skills[id] = 0;
    expect(checkAchievements(s)).toEqual([]);
    s.stats.pulls = 1;
    c.skills.mining = 300;
    expect(checkAchievements(s).sort()).toEqual(['firstPull', 'skill30']);
    expect(checkAchievements(s)).toEqual([]);
    expect(s.journal[s.journal.length - 1].k).toBe('log.achievement');
  });

  it('old saves migrate with empty stats', () => {
    const { s } = setup();
    const old = JSON.parse(JSON.stringify(s));
    old.version = 7;
    delete old.stats;
    delete old.achievements;
    const back = importSave(btoa(JSON.stringify(old)));
    expect(back.stats.pulls).toBe(0);
    expect(back.achievements).toEqual({});
  });
});

import { connect, download, newer, upload, type CloudConfig } from './cloud';

describe('cloud save (gist)', () => {
  function fakeGitHub() {
    const gists: Record<string, { id: string; files: Record<string, { content: string }> }> = {};
    const calls: string[] = [];
    const f = (async (url: string, init: RequestInit = {}) => {
      const method = init.method ?? 'GET';
      calls.push(`${method} ${url.replace('https://api.github.com', '')}`);
      const auth = (init.headers as Record<string, string>)?.Authorization;
      if (auth !== 'Bearer good') return new Response('{}', { status: 401 });
      const path = url.replace('https://api.github.com', '');
      const json = (v: unknown) => new Response(JSON.stringify(v), { status: 200 });
      if (path === '/user') return json({ login: 'lukasgreg' });
      if (path.startsWith('/gists?')) return json(Object.values(gists));
      if (path === '/gists' && method === 'POST') {
        const body = JSON.parse(init.body as string);
        const g = { id: 'g1', files: body.files };
        gists.g1 = g;
        return json(g);
      }
      const id = path.split('/')[2];
      if (method === 'PATCH') {
        gists[id].files = { ...gists[id].files, ...JSON.parse(init.body as string).files };
        return json(gists[id]);
      }
      return gists[id] ? json(gists[id]) : new Response('{}', { status: 404 });
    }) as unknown as typeof fetch;
    return { f, gists, calls };
  }

  it('connects, creates the gist once, and round-trips a save', async () => {
    const { f, calls } = fakeGitHub();
    const { s, c } = setup();
    c.name = 'Bodrik';
    const cfg = await connect(f, 'good', s);
    expect(cfg).toEqual({ token: 'good', gistId: 'g1', login: 'lukasgreg' });
    const again = await connect(f, 'good', s);
    expect(again.gistId).toBe('g1');
    expect(calls.filter((x) => x.startsWith('POST')).length).toBe(1);
    c.gold = 4321;
    await upload(f, cfg as CloudConfig, s);
    const back = await download(f, cfg);
    expect(back!.chars[0].gold).toBe(4321);
  });

  it('rejects a bad token', async () => {
    const { f } = fakeGitHub();
    const { s } = setup();
    await expect(connect(f, 'bad', s)).rejects.toMatchObject({ kind: 'auth' });
  });

  it('the copy the player touched last wins; an empty game never beats the cloud', () => {
    const a = setup().s;
    const b = setup().s;
    a.editedAt = 1_000_000;
    b.editedAt = 2_000_000;
    expect(newer(a, b)).toBe('cloud');
    expect(newer(b, a)).toBe('local');
    expect(newer(a, null)).toBe('local');
    const empty = newGameState('en');
    empty.editedAt = 9_999_999;
    expect(newer(empty, a)).toBe('cloud');
  });
});

import { buyResPrice } from './town';

describe('archery supplies', () => {
  it('arrows are cheap: fifty for under twenty gold', () => {
    expect(buyResPrice('arrow', 50)).toBeLessThan(20);
    expect(buyResPrice('log', 5)).toBe(15);
  });

  it('without arrows a ranger punches; arrows are partly recovered after a win', () => {
    const { s, c } = ranger(12);
    const rng = mulberry32(12);
    enter(s, c, 'wilds', rng);
    c.run!.combat = startCombat(['boar']);
    c.pack.res.arrow = 0;
    c.skills.blunt = 400;
    const blunt = c.skills.blunt;
    for (let i = 0; i < 300 && c.run?.combat; i++) {
      c.hp = 999;
      fight(s, c, { type: 'attack' }, rng);
    }
    expect(c.run!.log.some((e) => e.k === 'fight.noArrows')).toBe(true);
    expect(c.run!.combat).toBe(null);
    expect(c.skills.blunt).toBeGreaterThanOrEqual(blunt);
    c.pack.res.arrow = 20;
    c.run!.combat = startCombat(['boar']);
    c.skills.archery = 1000;
    for (let i = 0; i < 30 && c.run?.combat; i++) {
      c.hp = 999;
      fight(s, c, { type: 'attack' }, rng);
    }
    expect(c.run!.combat).toBe(null);
    expect(c.pack.res.arrow).toBeLessThanOrEqual(20);
  });

  it('waiting guards: enemies hit less that round', () => {
    const { s, c } = ranger(13);
    const rng = mulberry32(13);
    enter(s, c, 'wilds', rng);
    c.run!.combat = startCombat(['wolf']);
    fight(s, c, { type: 'wait' }, rng);
    expect(c.run!.log.some((e) => e.k === 'fight.waiting')).toBe(true);
    expect(c.run!.combat!.guard).toBe(false);
  });
});

import { capFactor, effectiveCap, gainXp, killXp, statsAt, xpToNext } from './levels';

describe('levels', () => {
  it('xp per level grows; a rat is worth little, the warlord a lot', () => {
    expect(xpToNext(1)).toBe(300);
    expect(xpToNext(20)).toBeGreaterThan(xpToNext(10) * 3);
    expect(killXp('rat')).toBeLessThan(10);
    expect(killXp('gnarlWarlord')).toBeGreaterThan(900);
  });

  it('skill caps open up with level until 30', () => {
    const { c } = setup();
    c.level = 1;
    expect(effectiveCap(c, 'mining')).toBe(500);
    c.level = 30;
    expect(effectiveCap(c, 'mining')).toBe(1000);
    expect(capFactor(45)).toBe(1);
  });

  it('levelling raises stats toward the profession caps and refills hits', () => {
    const { c } = setup();
    c.level = 1;
    c.xp = 0;
    c.hp = 1;
    const str = c.stats.str;
    expect(gainXp(c, xpToNext(1) + xpToNext(2))).toBe(2);
    expect(c.level).toBe(3);
    expect(c.stats.str).toBeGreaterThanOrEqual(str);
    expect(c.hp).toBeGreaterThan(1);
    expect(statsAt(c, 50).str).toBe(90);
  });
});

import { wardMult } from './combat';
import { itemWeight, METALS } from '../data/items';
import { MONSTERS } from '../data/dungeons';
import { smeltChance } from './craft';

describe('metals', () => {
  it('silver slays undead, blackrock gnarl; every monster has a family', () => {
    expect(METALS.silver.slays?.undead).toBe(1.5);
    expect(METALS.blackrock.slays?.gnarl).toBe(1.5);
    expect(Object.values(MONSTERS).every((m) => !!m.family)).toBe(true);
  });

  it('silver armour wards against undead in proportion to its share', () => {
    const { c } = warrior();
    const shield = c.pack.items.find((i) => i.uid === c.equip.shield)!;
    expect(wardMult(c, 'undead')).toBe(1);
    shield.mat = 'silver';
    const w = wardMult(c, 'undead');
    expect(w).toBeLessThan(1);
    expect(w).toBeGreaterThan(0.75);
  });

  it('mithril is half as heavy; dark iron comes rarely from coal for master miners', () => {
    expect(itemWeight('plateChest', 'mithril')).toBe(itemWeight('plateChest') / 2);
    const { c } = setup();
    c.skills.mining = 850;
    expect(smeltChance(c, 'coal')).toBe(0);
    c.skills.mining = 1000;
    expect(smeltChance(c, 'coal')).toBeGreaterThan(0);
    expect(smeltChance(c, 'coal')).toBeLessThan(0.15);
  });
});

import { roundStamina } from './combat';
import { pullStamina } from './gather';
import { ITEMS as ALL_ITEMS, slotOf } from '../data/items';

describe('armour pieces and weight', () => {
  it('five families of six pieces, each with a recipe', () => {
    const pieces = Object.keys(ALL_ITEMS).filter((d) => ALL_ITEMS[d as keyof typeof ALL_ITEMS].kind === 'armor');
    expect(pieces.length).toBe(30);
    expect(slotOf('plateHands')).toBe('hands');
    expect(RECIPES.some((r) => r.id === 'plateChest' && r.bars! > 20)).toBe(true);
    expect(RECIPES.some((r) => r.id === 'leatherChest' && r.inputs?.hide)).toBe(true);
  });

  it('plate needs strength; heavy armour costs stamina each round', () => {
    const { c } = warrior();
    c.pack.items.push({ uid: 6001, def: 'plateChest', dur: 60, maxDur: 60, quality: 'normal' });
    c.stats.str = 40;
    expect(equip(c, 6001)).toBe(false);
    c.stats.str = 60;
    expect(equip(c, 6001)).toBe(true);
    expect(roundStamina(c)).toBeGreaterThanOrEqual(1);
  });

  it('a heavy pack makes gathering more tiring', () => {
    const { c } = setup();
    const light = pullStamina(c);
    c.pack.res.stone = 70;
    expect(pullStamina(c)).toBeGreaterThan(light);
  });

  it('old armour items migrate to the new pieces', () => {
    const { s, c } = warrior();
    const old = JSON.parse(JSON.stringify(s));
    old.version = 9;
    old.chars[0].pack.items.push({ uid: 7001, def: 'platemail', dur: 80, maxDur: 80, quality: 'normal' });
    old.chars[0].equip = { ...old.chars[0].equip, body: 7001 };
    delete old.chars[0].equip.chest;
    const back = importSave(btoa(JSON.stringify(old)));
    const ch = back.chars.find((x) => x.id === c.id)!;
    expect(ch.pack.items.find((i) => i.uid === 7001)!.def).toBe('plateChest');
    expect(ch.equip.chest).toBe(7001);
  });
});

import { chooseEvent, goBack, omenOf, openBossChest } from './dungeon';

describe('bigger random dungeons', () => {
  it('maps are large, branching, all reachable, with side rooms and a boss at the end', () => {
    for (const id of DUNGEON_IDS) {
      for (const seed of [1, 2, 3, 99, 12345]) {
        const nodes = generate(id, seed);
        const layers = Math.max(...nodes.map((n) => n.layer)) + 1;
        expect(layers).toBeGreaterThanOrEqual(8);
        expect(layers).toBeLessThanOrEqual(29);
        expect(nodes[nodes.length - 1].type).toBe('boss');
        const reach = new Set([0]);
        for (const n of nodes) if (reach.has(n.id)) n.next.forEach((x) => reach.add(x));
        expect(reach.size).toBe(nodes.length);
        // every non-dead room can still reach the boss
        const boss = nodes.length - 1;
        const canBoss = new Set([boss]);
        for (let i = nodes.length - 1; i >= 0; i--) if (nodes[i].next.some((x) => canBoss.has(x))) canBoss.add(i);
        for (const n of nodes) if (!n.dead && n.type !== 'boss') expect(canBoss.has(n.id)).toBe(true);
      }
    }
    const many = [1, 2, 3, 4, 5, 6, 7, 8].map((sd) => generate('crypt', sd));
    expect(many.some((ns) => ns.some((n) => n.dead))).toBe(true);
    expect(many.some((ns) => ns.some((n) => n.type === 'event'))).toBe(true);
  });

  it('omens follow the seed', () => {
    expect(omenOf(42)).toBe(omenOf(42));
    const seen = new Set(Array.from({ length: 200 }, (_, i) => omenOf(i)));
    expect(seen.size).toBeGreaterThan(3);
  });

  it('events resolve with choices; you can step back out of a side room', () => {
    const { s, c } = warrior(31);
    const rng = mulberry32(31);
    const run = enter(s, c, 'crypt', rng)!;
    const ev = run.nodes.find((n) => n.type === 'event' && n.event === 'fountain') ?? run.nodes.find((n) => n.type === 'event')!;
    ev.event = 'fountain';
    run.at = ev.id;
    run.path.push(ev.id);
    expect(chooseEvent(s, c, 'fill', rng)).toBe(true);
    expect(ev.cleared).toBe(true);
    expect(c.pack.res.herbalStew).toBe(1);
    ev.oneWay = false;
    expect(goBack(c)).toBe(true);
    expect(run.at).not.toBe(ev.id);
  });

  it('the boss chest gives gold, gear and xp once', () => {
    const { s, c } = warrior(32);
    const rng = mulberry32(32);
    const run = enter(s, c, 'manor', rng)!;
    run.at = run.nodes.length - 1;
    run.bossDown = true;
    const items = c.pack.items.length;
    expect(openBossChest(s, c, rng)).toBe(true);
    expect(c.pack.items.length).toBeGreaterThan(items);
    expect(openBossChest(s, c, rng)).toBe(false);
  });
});

import { addPattern, commission, commissionCost, rollPattern } from './patterns';

describe('patterns', () => {
  it('rare metals need a pattern from the bank, used up on success', () => {
    const { s, c } = setup();
    const r = RECIPES.find((x) => x.id === 'longsword')!;
    c.skills.blacksmithing = 1000;
    c.pack.res.silverBar = 20;
    expect(canCraft(c, r, 'silver', s)).toBe('noPattern');
    expect(canCraft(c, r, 'steel', s)).not.toBe('noPattern');
    addPattern(s, 'longsword', 'silver');
    expect(canCraft(c, r, 'silver', s)).toBe(null);
    const res = craft(s, c, r, 'silver', () => 0.01);
    expect(res.item?.mat).toBe('silver');
    expect(s.bank.patterns['longsword:silver']).toBeUndefined();
  });

  it('patterns from harder dungeons lean to rarer metals; the master craftsman is expensive', () => {
    const rng = mulberry32(3);
    const easy = Array.from({ length: 200 }, () => rollPattern(1, rng).metal);
    const hard = Array.from({ length: 200 }, () => rollPattern(5, rng).metal);
    const share = (xs: string[], m: string) => xs.filter((x) => x === m).length / xs.length;
    expect(share(hard, 'blackrock')).toBeGreaterThan(share(easy, 'blackrock'));
    const { s } = warrior();
    const c = s.chars[0];
    addPattern(s, 'mace', 'silver');
    const cost = commissionCost('mace', 'silver');
    expect(cost).toBeGreaterThan(300);
    c.gold = cost;
    const it = commission(s, c, 'mace:silver', rng)!;
    expect(it.mat).toBe('silver');
    expect(c.gold).toBe(0);
  });
});

import { en } from '../i18n/en';
import { cs } from '../i18n/cs';
import { RESOURCE_IDS } from '../data/resources';
import { ITEM_IDS } from '../data/items';
import { MONSTER_IDS } from '../data/dungeons';

describe('translations', () => {
  it('every resource, item and monster has an English and Czech name', () => {
    const keys = [...RESOURCE_IDS.map((r) => `res.${r}`), ...ITEM_IDS.map((i) => `item.${i}`), ...MONSTER_IDS.map((m) => `mon.${m}`)];
    const missing = keys.filter((k) => !(k in en) || !(k in cs));
    expect(missing).toEqual([]);
  });
});

import { tickBuffs, usePotion } from './alchemy';

describe('alchemy and poison', () => {
  it('brews potions from reagents with a mortar', () => {
    const { s, c } = setup();
    c.pack.items.push({ uid: 8801, def: 'mortar', dur: 60, maxDur: 60, quality: 'normal' });
    c.skills.alchemy = 400;
    c.pack.res.ginseng = 2;
    const r = RECIPES.find((x) => x.id === 'potionLesserHeal')!;
    expect(canCraft(c, r, null)).toBe(null);
    craft(s, c, r, null, () => 0.01);
    expect(c.pack.res.potionLesserHeal).toBe(2);
  });

  it('potions heal, buff for a while, and the buff wears off back to level stats', () => {
    const { c } = setup();
    c.level = 1;
    c.hp = 10;
    c.pack.res.potionHeal = 1;
    c.pack.res.potionStrength = 1;
    usePotion(c, 'potionHeal', () => 0.5);
    expect(c.hp).toBe(60);
    const str = c.stats.str;
    usePotion(c, 'potionStrength', () => 0.5, null, 1000);
    expect(c.stats.str).toBe(str + 10);
    expect(tickBuffs(c, 1000 + 11 * 60_000)).toEqual(['str']);
    expect(c.stats.str).toBe(str);
  });

  it('spiders poison you; a cure removes it; explosions hit every foe; a coated weapon poisons', () => {
    const { s, c } = warrior(40);
    const rng = mulberry32(40);
    enter(s, c, 'cellar', rng);
    c.run!.combat = startCombat(['spider', 'spider', 'spider']);
    c.skills.edged = 0;
    c.skills.shieldBlock = 0;
    for (let i = 0; i < 40 && !c.poison; i++) {
      c.hp = 999;
      fight(s, c, { type: 'wait' }, rng);
    }
    expect(c.poison).not.toBe(null);
    c.pack.res.potionCure = 1;
    usePotion(c, 'potionCure', rng);
    expect(c.poison).toBe(null);
    c.pack.res.potionExplosion = 1;
    const before = c.run!.combat!.foes.map((f) => f.hp);
    fight(s, c, { type: 'potion', id: 'potionExplosion' }, rng);
    const after = c.run!.combat?.foes.map((f) => f.hp) ?? [0, 0, 0];
    expect(after.every((h, i) => h < before[i])).toBe(true);
  });
});

import { PARAGON } from './combat';

describe('paragons', () => {
  it('are rare, much tougher, and pay out when slain', () => {
    const { s, c } = warrior(50);
    const rng = mulberry32(50);
    // about 2% of monsters in ordinary rooms are paragons
    let seen = 0;
    let total = 0;
    for (let seed = 1; seed < 400; seed++) {
      const run = enter(s, c, 'manor', mulberry32(seed))!;
      for (const n of run.nodes.filter((x) => x.type === 'monster')) {
        const fs = waitingFoes(run, n);
        total += fs.length;
        seen += fs.filter((f) => f.paragon).length;
      }
      c.run = null;
      c.location = 'town';
    }
    expect(seen / total).toBeGreaterThan(0.01);
    expect(seen / total).toBeLessThan(0.04);
    enter(s, c, 'cellar', rng);
    const hp = MONSTERS.smuggler.hp * PARAGON.hp;
    c.run!.combat = startCombat([]);
    c.run!.combat.foes = [{ kind: 'smuggler', hp, max: hp, stunned: 0, paragon: true }];
    for (const k of ['edged', 'tactics'] as const) c.skills[k] = 1000;
    for (let i = 0; i < 200 && c.run?.combat; i++) {
      c.hp = 999;
      fight(s, c, { type: 'attack' }, rng);
    }
    expect(s.stats.paragons).toBe(1);
  });
});

import { activeHouse, collectRent, DAY_MS, harvestGarden, rentHouse } from './housing';

describe('housing', () => {
  it('rent comes from the bank daily; unpaid rent stops perks, and three days evicts', () => {
    const { s } = setup();
    const t0 = 1_000_000_000_000;
    s.bank.gold = 100;
    expect(rentHouse(s, 'cottage', t0)).toBe(true);
    expect(s.bank.gold).toBe(50);
    expect(activeHouse(s, t0)?.workerSlots).toBe(1);
    expect(collectRent(s, t0 + 2.5 * DAY_MS)).toEqual(['paid']);
    expect(collectRent(s, t0 + 3.5 * DAY_MS)).toEqual(['paid']);
    expect(s.bank.gold).toBe(0);
    expect(collectRent(s, t0 + 4.5 * DAY_MS)).toEqual(['unpaid']);
    expect(activeHouse(s, t0 + 4.5 * DAY_MS)).toBe(null);
    expect(collectRent(s, t0 + 7.5 * DAY_MS)).toEqual(['evicted']);
    expect(s.house).toBe(null);
  });

  it('the garden fills the bank hourly', () => {
    const { s } = setup();
    const now = Date.now();
    s.bank.gold = 10_000;
    rentHouse(s, 'villa', now - 3 * 3600_000);
    s.house!.paidUntil = now + DAY_MS;
    const got = harvestGarden(s, mulberry32(1), now);
    expect(Object.values(got).reduce((a, b) => a + (b ?? 0), 0)).toBe(30);
  });
});
