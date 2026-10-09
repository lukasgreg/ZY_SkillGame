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
    expect(hitChance(50, 50)).toBeCloseTo(0.5);
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
    for (let i = 0; i < 50 && out !== 'died'; i++) {
      c.skills.edged = 0;
      out = fight(s, c, { type: 'bandage' }, rng);
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

import { feed, loyaltyNow, resurrect, tameChance, tickPets, usedSlots } from './pets';
import { startCombat } from './combat';

function ranger(seed = 4) {
  const rng = mulberry32(seed);
  const s = newGameState('en');
  const c = createCharacter(s, 'Ylva', 'elf', 'ranger', rollCharacter('elf', 'ranger', rng));
  return { s, c, rng };
}

describe('taming and pets', () => {
  it('rangers start with a bow and arrows', () => {
    const { c } = ranger();
    expect(weaponInfo(c).skill).toBe('archery');
    expect(c.pack.res.arrow).toBe(150);
  });

  it('taming needs skill and control slots; a tamed animal fights for you', () => {
    const { s, c } = ranger();
    const rng = mulberry32(8);
    c.skills.taming = 900;
    expect(tameChance(c, 'drake')).toBeGreaterThan(0);
    expect(tameChance(c, 'skeleton')).toBe(0);
    enter(s, c, 'wilds', rng);
    c.run!.combat = startCombat(['wolf', 'wolf']);
    let tries = 0;
    while (c.pets.length === 0 && tries++ < 30) {
      c.hp = 999;
      fight(s, c, { type: 'tame' }, rng);
    }
    expect(c.pets.length).toBe(1);
    expect(usedSlots(c)).toBe(1);
    // the pet helps finish the fight
    while (c.run?.combat) {
      c.hp = 999;
      fight(s, c, { type: 'attack' }, rng);
    }
    expect(c.run!.log.some((e) => e.k === 'fight.allyHit' || e.k === 'fight.allyMiss')).toBe(true);
  });

  it('loyalty drops over time; hungry pets run off, fed and loyal pets bond', () => {
    const { c } = ranger();
    const now = Date.now();
    c.pets.push({ id: 1, kind: 'wolf', hp: 36, skill: 300, loyalty: 60, fedAt: now - 13 * 3600_000, tamedAt: now - 30 * 3600_000, bonded: false, dead: false });
    expect(loyaltyNow(c.pets[0], now)).toBe(0);
    expect(tickPets(c, now).ran.length).toBe(1);
    c.pets.push({ id: 2, kind: 'wolf', hp: 36, skill: 300, loyalty: 40, fedAt: now, tamedAt: now - 30 * 3600_000, bonded: false, dead: false });
    c.pack.res.perch = 1;
    expect(feed(c, c.pets[0], 'perch', now)).toBe(true);
    expect(tickPets(c, now).bonded.length).toBe(1);
  });

  it('a bonded pet that dies can be brought back with Animal Healing', () => {
    const { c } = ranger();
    c.skills.animalHealing = 1000;
    c.pack.res.bandage = 5;
    c.pets.push({ id: 3, kind: 'bear', hp: 0, skill: 400, loyalty: 80, fedAt: Date.now(), tamedAt: 0, bonded: true, dead: true });
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
