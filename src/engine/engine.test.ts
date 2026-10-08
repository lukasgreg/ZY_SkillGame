import { describe, expect, it } from 'vitest';
import { SKILL_IDS } from '../data/skills';
import { createCharacter, rollCharacter, packWeight } from './character';
import { canMine, findVein, pull, pullChance } from './mining';
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
    expect(canMine(c)).toBe('notInMine');
    c.location = 'mine';
    expect(canMine(c)).toBe('noVein');
    c.vein = findVein(c, rng);
    expect(canMine(c)).toBe(null);
  });

  it('pull chance needs the minimum skill', () => {
    expect(pullChance(29, 'copperOre')).toBe(0);
    expect(pullChance(30, 'copperOre')).toBeCloseTo(0.3);
    expect(pullChance(60, 'copperOre')).toBeCloseTo(0.95);
  });

  it('pulls wear the tool and break it at 0', () => {
    const { c, rng } = setup();
    c.location = 'mine';
    c.vein = { res: 'ironOre', left: 999 };
    c.stamina = 1e9;
    const tool = c.pack.items[0];
    tool.dur = 2;
    pull(c, rng);
    expect(tool.dur).toBe(1);
    const r = pull(c, rng);
    expect(r.toolBroke).toBe(tool);
    expect(c.tool).toBe(null);
    expect(canMine(c)).toBe('noTool');
  });

  it('respects the weight limit', () => {
    const { c } = setup();
    c.location = 'mine';
    c.vein = { res: 'ironOre', left: 5 };
    c.pack.res.stone = 500;
    expect(packWeight(c.pack)).toBeGreaterThan(100);
    expect(canMine(c)).toBe('overweight');
  });

  it('pacing: active mining from 0 to 30 takes a reasonable time', () => {
    const { c, rng } = setup(7);
    c.skills.mining = 0;
    c.location = 'mine';
    let ms = 0;
    let pulls = 0;
    while (c.skills.mining < 300 && pulls < 20000) {
      if (!c.vein || c.vein.left <= 0) c.vein = findVein(c, rng);
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
