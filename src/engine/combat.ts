import { MONSTERS, type Family, type MonsterId } from '../data/dungeons';
import { healPet, petDmgMult, petMaxHp, petSkillCap } from './pets';
import { ARMOUR_SLOTS, ITEMS, METALS, itemWeight, minStr, slotOf, type Slot } from '../data/items';
import { RESOURCES, type ResourceId } from '../data/resources';
import type { SkillId } from '../data/skills';
import { addRes, eat } from './character';
import { wear } from './craft';
import { chance, clamp, randInt, type Rng } from './rng';
import { isPowerHour, maxHp, maxStamina, trySkillGain } from './skills';
import type { Character, Combat, Foe, ItemInstance, LogEntry, Pet, Run, Stance } from './state';

/* ---------------- equipment ---------------- */

export function equipped(c: Character, slot: Slot): ItemInstance | null {
  const uid = c.equip[slot];
  return uid === undefined ? null : c.pack.items.find((i) => i.uid === uid) ?? null;
}

export function isEquipped(c: Character, uid: number): boolean {
  return Object.values(c.equip).includes(uid);
}

const DEFENCE_SLOTS: Slot[] = ['shield', ...ARMOUR_SLOTS];

/** Wears an item in its slot (replacing what was there). Heavy armour needs the strength for it. */
export function equip(c: Character, uid: number): boolean {
  const it = c.pack.items.find((i) => i.uid === uid);
  const slot = it && slotOf(it.def);
  if (!slot || c.stats.str < minStr(it.def)) return false;
  c.equip[slot] = uid;
  return true;
}

export function unequip(c: Character, slot: Slot): void {
  delete c.equip[slot];
}

/** Fists when nothing is held: a weak blunt attack. */
const FISTS = { skill: 'blunt' as SkillId, dmg: [1, 4] as [number, number], speed: 0.8 };

export function weaponInfo(c: Character): { skill: SkillId; dmg: [number, number]; speed: number; item: ItemInstance | null } {
  const w = equipped(c, 'weapon');
  if (!w) return { ...FISTS, item: null };
  const d = ITEMS[w.def];
  return { skill: d.weaponSkill!, dmg: d.dmg!, speed: d.speed, item: w };
}

function qualityMult(it: ItemInstance): number {
  return (it.quality === 'exceptional' ? 1.2 : 1) * (it.runic ? 1.25 : 1);
}

export function armorValue(c: Character): number {
  let a = 0;
  for (const slot of DEFENCE_SLOTS) {
    const it = equipped(c, slot);
    if (!it) continue;
    const d = ITEMS[it.def];
    a += (d.armor ?? 0) * (it.mat ? METALS[it.mat].armorMult : 1) * qualityMult(it);
  }
  return Math.round(a * 10) / 10;
}

/** Damage still taken from a family after armour of warding metals (silver vs undead…), weighted by each piece's share of armour. */
export function wardMult(c: Character, fam: Family): number {
  const total = armorValue(c);
  if (!total) return 1;
  let cut = 0;
  for (const slot of DEFENCE_SLOTS) {
    const it = equipped(c, slot);
    const w = it?.mat ? METALS[it.mat].wards?.[fam] : undefined;
    if (!it || w === undefined) continue;
    const share = ((ITEMS[it.def].armor ?? 0) * METALS[it.mat!].armorMult * qualityMult(it)) / total;
    cut += share * (1 - w);
  }
  return 1 - cut;
}

/** Armour soaks this share of its defence value from each blow. */
export const ARMOUR_SCALE = 0.5;

/** Weight of everything worn (armour and shield). */
export function wornWeight(c: Character): number {
  return DEFENCE_SLOTS.reduce((n, sl) => {
    const it = equipped(c, sl);
    return n + (it ? itemWeight(it.def, it.mat) : 0);
  }, 0);
}

/** Stamina each combat round costs in your armour (plate about 3, leather 0). */
export function roundStamina(c: Character): number {
  return Math.round(wornWeight(c) / 25);
}

export function exhausted(c: Character): boolean {
  return c.stamina < 1;
}

export function usesArrows(c: Character): boolean {
  return weaponInfo(c).skill === 'archery';
}

/* ---------------- stances ---------------- */

export const STANCE_DEALT: Record<Stance, number> = { normal: 1, combat: 1.25, defensive: 0.7 };
export const STANCE_TAKEN: Record<Stance, number> = { normal: 1, combat: 1.25, defensive: 0.7 };

/** Stances are a warrior's art (Andaria). */
export function canStance(c: Character, st: Stance): boolean {
  if (st !== 'normal' && c.profession !== 'warrior') return false;
  if (st === 'combat') return c.skills.tactics >= 500;
  if (st === 'defensive') return c.skills.shieldBlock >= 500 && !!equipped(c, 'shield');
  return true;
}

/** Andaria rule: changing stance costs all current stamina. */
export function setStance(c: Character, st: Stance): boolean {
  if (c.stance === st || !canStance(c, st)) return false;
  c.stance = st;
  c.stamina = 0;
  return true;
}

export type Ability = 'secondWind' | 'crushingBlow' | 'leap' | 'warcry' | 'callWild';
export const ABILITY_COST: Record<Ability, number> = { secondWind: 0, crushingBlow: 15, leap: 20, warcry: 15, callWild: 30 };

/** Who may use an ability at all: warriors their stance moves, rangers Call of the Wild. */
export function abilityFor(c: Character, a: Ability): boolean {
  return a === 'callWild' ? c.profession === 'ranger' : c.profession === 'warrior';
}

export function abilityOk(c: Character, cb: Combat, a: Ability): boolean {
  if (!abilityFor(c, a) || c.stamina < ABILITY_COST[a]) return false;
  switch (a) {
    case 'secondWind':
      return c.stance === 'normal' && !cb.secondWindUsed;
    case 'crushingBlow':
      return weaponInfo(c).skill === 'blunt';
    case 'leap':
      return c.stance === 'combat';
    case 'warcry':
      return c.stance === 'defensive';
    case 'callWild':
      return c.profession === 'ranger' && !cb.summoned;
  }
}

/* ---------------- resolution ---------------- */

export type Action =
  | { type: 'attack' }
  | { type: 'ability'; id: Ability }
  | { type: 'bandage' }
  | { type: 'eat'; res: ResourceId }
  | { type: 'healPet' }
  | { type: 'wait' }
  | { type: 'flee' };

export type Outcome = 'continue' | 'won' | 'died' | 'fled';

function say(run: Run, k: string, p?: LogEntry['p'], c?: LogEntry['c']): void {
  run.log.push({ k, p, c, t: Date.now() });
  if (run.log.length > 40) run.log.splice(0, run.log.length - 40);
}

const foeName = (f: Foe) => `@mon.${f.kind}`;

/** UO-style hit chance: (attacker + 20) / ((defender + 20) × 2), with a small Tactics bonus. */
export function hitChance(atk: number, def: number, tactics = 0): number {
  return clamp(((atk + 20) / ((def + 20) * 2)) * (1 + tactics / 400), 0.05, 0.95);
}

export function startCombat(kinds: MonsterId[]): Combat {
  return { foes: kinds.map((k) => ({ kind: k, hp: MONSTERS[k].hp, stunned: 0 })), summon: null, summoned: false, round: 1, secondWindUsed: false, bandaging: false, cowed: 0, first: false };
}

function gainOpts(foeSkill: number, now: Date) {
  return { tooEasyAt: foeSkill + 25, mult: isPowerHour(now) ? 1.5 : 1 };
}

/** One swing or shot at the first living foe. */
function attack(c: Character, run: Run, cb: Combat, rng: Rng, opts: { dmgMult?: number; hitBonus?: number; stun?: number } = {}): void {
  const target = cb.foes.find((f) => f.hp > 0);
  if (!target) return;
  const mon = MONSTERS[target.kind];
  let w = weaponInfo(c);
  if (w.skill === 'archery') {
    if (!(c.pack.res.arrow ?? 0)) {
      // Out of arrows: fight on with your fists.
      w = { ...FISTS, item: null };
      say(run, 'fight.noArrows', undefined, 'bad');
    } else {
      addRes(c.pack, 'arrow', -1);
      cb.arrowsShot = (cb.arrowsShot ?? 0) + 1;
    }
  }
  const atk = c.skills[w.skill] / 10;
  const tired = exhausted(c);
  const p = clamp(hitChance(atk, mon.skill, c.skills.tactics / 10) + (opts.hitBonus ?? 0) - (tired ? 0.15 : 0), 0.05, 0.97);
  const hit = rng() < p;
  const now = new Date();
  const g1 = trySkillGain(c, w.skill, p, hit, rng, gainOpts(mon.skill, now));
  const g2 = trySkillGain(c, 'tactics', p, hit, rng, gainOpts(mon.skill, now));
  if (g1) say(run, 'log.gain', { skill: `@skill.${w.skill}`, amount: `#${g1 / 10}`, value: `#${c.skills[w.skill] / 10}` }, 'gain');
  if (g2) say(run, 'log.gain', { skill: '@skill.tactics', amount: `#${g2 / 10}`, value: `#${c.skills.tactics / 10}` }, 'gain');
  if (!hit) {
    say(run, 'fight.miss', { foe: foeName(target) });
    return;
  }
  const g3 = trySkillGain(c, 'anatomy', p, true, rng, { ...gainOpts(mon.skill, now), mult: 0.5 });
  if (g3) say(run, 'log.gain', { skill: '@skill.anatomy', amount: `#${g3 / 10}`, value: `#${c.skills.anatomy / 10}` }, 'gain');
  const it = w.item;
  const md = it?.mat ? METALS[it.mat] : null;
  const metal = (md?.dmgMult ?? 1) * (md?.slays?.[mon.family] ?? 1);
  const q = it ? qualityMult(it) : 1;
  const bonus = 1 + c.skills.tactics / 2000 + c.skills.anatomy / 2000 + c.stats.str / 300;
  const crit = rng() < c.skills.anatomy / 2000;
  let dmg = randInt(rng, w.dmg[0], w.dmg[1]) * metal * q * bonus * STANCE_DEALT[c.stance] * (opts.dmgMult ?? 1) * (crit ? 1.5 : 1) * (tired ? 0.75 : 1);
  dmg *= run.buff ?? 1;
  const foeArmor = mon.armor + (target.affix === 'armored' ? 4 : 0);
  dmg = Math.max(1, Math.round(dmg - foeArmor * (0.5 + rng() * 0.5)));
  target.hp -= dmg;
  say(run, crit ? 'fight.crit' : 'fight.hit', { foe: foeName(target), dmg }, 'good');
  if (md?.slays?.[mon.family]) say(run, 'fight.slay', { metal: `@mat.${md.id}`, foe: foeName(target) }, 'gain');
  if (md?.drain) {
    const heal = Math.max(1, Math.round(dmg * md.drain));
    c.hp = Math.min(maxHp(c), c.hp + heal);
    say(run, 'fight.drain', { n: heal }, 'good');
  }
  if (it && chance(rng, 0.3) && wear(c, it)) {
    delete c.equip.weapon;
    say(run, 'log.tool.broke', { item: `%${it.def}|${it.mat ?? ''}|${it.quality === 'exceptional' ? 1 : 0}|${it.runic ? 1 : 0}` }, 'bad');
  }
  if (target.hp <= 0) {
    target.hp = 0;
    say(run, 'fight.kill', { foe: foeName(target) }, 'gain');
  } else if (opts.stun && rng() < opts.stun) {
    target.stunned = 1;
    say(run, 'fight.stun', { foe: foeName(target) }, 'good');
  }
}

type Ally = { pet: Pet } | { summon: Foe };

/** Your living pets and summon, in battle order. */
export function allies(c: Character, cb: Combat): Ally[] {
  const out: Ally[] = c.pets.filter((p) => !p.dead && p.hp > 0).map((pet) => ({ pet }));
  if (cb.summon && cb.summon.hp > 0) out.push({ summon: cb.summon });
  return out;
}

const allyKind = (a: Ally) => ('pet' in a ? a.pet.kind : a.summon.kind);
const allyName = (a: Ally) => `@mon.${allyKind(a)}`;

/** A pet or summon attacks the first living foe. Pets learn as they fight. */
function allyAttack(c: Character, run: Run, cb: Combat, a: Ally, rng: Rng): void {
  const target = cb.foes.find((f) => f.hp > 0);
  if (!target) return;
  const mon = MONSTERS[target.kind];
  const me = MONSTERS[allyKind(a)];
  const skill = 'pet' in a ? a.pet.skill / 10 : me.skill * 0.8;
  const hit = rng() < hitChance(skill, mon.skill);
  if ('pet' in a && a.pet.skill < petSkillCap(a.pet) && rng() < 0.15) a.pet.skill += 1;
  if (!hit) {
    say(run, 'fight.allyMiss', { ally: allyName(a), foe: foeName(target) });
    return;
  }
  const lvl = 'pet' in a ? petDmgMult(a.pet) : 1;
  const dmg = Math.max(1, Math.round(randInt(rng, me.dmg[0], me.dmg[1]) * lvl * (0.8 + skill / 500 + c.skills.animalLore / 4000) - mon.armor * 0.5));
  target.hp -= dmg;
  say(run, 'fight.allyHit', { ally: allyName(a), foe: foeName(target), dmg }, 'good');
  if (target.hp <= 0) {
    target.hp = 0;
    say(run, 'fight.kill', { foe: foeName(target) }, 'gain');
  }
}

/** A foe goes for one of your animals instead of you. */
function foeAttackAlly(c: Character, run: Run, f: Foe, a: Ally, rng: Rng): void {
  const mon = MONSTERS[f.kind];
  const def = 'pet' in a ? a.pet.skill / 10 : MONSTERS[a.summon.kind].skill * 0.8;
  if (rng() >= hitChance(mon.skill, def)) {
    say(run, 'fight.foeMissAlly', { foe: foeName(f), ally: allyName(a) });
    return;
  }
  const dmg = Math.max(1, Math.round(randInt(rng, mon.dmg[0], mon.dmg[1]) - MONSTERS[allyKind(a)].armor * 0.5));
  say(run, 'fight.allyHurt', { foe: foeName(f), ally: allyName(a), dmg }, 'bad');
  if ('summon' in a) {
    a.summon.hp -= dmg;
    if (a.summon.hp <= 0) say(run, 'fight.summonGone', { ally: allyName(a) }, 'sys');
    return;
  }
  a.pet.hp -= dmg;
  if (a.pet.hp > 0) return;
  a.pet.hp = 0;
  if (a.pet.bonded) {
    a.pet.dead = true;
    say(run, 'fight.petFallen', { ally: allyName(a) }, 'bad');
  } else {
    c.pets = c.pets.filter((p) => p !== a.pet);
    say(run, 'fight.petLost', { ally: allyName(a) }, 'bad');
  }
}

/** A foe's attack on you: shield block, armor, stance and wear. With pets around, half the blows go to them. */
function foeAttack(c: Character, run: Run, cb: Combat, f: Foe, rng: Rng): boolean {
  const mon = MONSTERS[f.kind];
  const team = allies(c, cb);
  if (team.length && rng() < 0.5) {
    foeAttackAlly(c, run, f, team[Math.floor(rng() * team.length)], rng);
    return false;
  }
  const w = weaponInfo(c);
  const def = c.skills[w.skill] / 10;
  const p = hitChance(mon.skill, def) * (cb.cowed > 0 ? 0.75 : 1) * (cb.guard ? 0.75 : 1);
  if (rng() >= p) {
    say(run, 'fight.foeMiss', { foe: foeName(f) });
    return false;
  }
  const shield = equipped(c, 'shield');
  const now = new Date();
  if (shield) {
    const pb = c.skills.shieldBlock / 3000 + 0.05;
    const blocked = rng() < pb;
    const g = trySkillGain(c, 'shieldBlock', Math.max(pb, 0.2), blocked, rng, gainOpts(mon.skill, now));
    if (g) say(run, 'log.gain', { skill: '@skill.shieldBlock', amount: `#${g / 10}`, value: `#${c.skills.shieldBlock / 10}` }, 'gain');
    if (blocked) {
      say(run, 'fight.block', { foe: foeName(f) }, 'good');
      if (wear(c, shield)) {
        delete c.equip.shield;
        say(run, 'log.tool.broke', { item: `%${shield.def}|${shield.mat ?? ''}|0|0` }, 'bad');
      }
      return false;
    }
  }
  const armor = armorValue(c);
  const reduce = (c.stance === 'defensive' ? armor * 0.75 : armor * (0.4 + rng() * 0.6)) * ARMOUR_SCALE;
  const rage = f.affix === 'enraged' ? 1.3 : 1;
  const dmg = Math.max(1, Math.round(randInt(rng, mon.dmg[0], mon.dmg[1]) * rage * STANCE_TAKEN[c.stance] * wardMult(c, mon.family) - reduce));
  c.hp -= dmg;
  say(run, 'fight.hurt', { foe: foeName(f), dmg }, 'bad');
  if (chance(rng, 0.25)) {
    const worn = ARMOUR_SLOTS.map((sl) => [sl, equipped(c, sl)] as const).filter(([, it]) => it);
    if (worn.length) {
      const [sl, it] = worn[Math.floor(rng() * worn.length)];
      if (wear(c, it!)) {
        delete c.equip[sl];
        say(run, 'log.tool.broke', { item: `%${it!.def}|${it!.mat ?? ''}|0|0` }, 'bad');
      }
    }
  }
  return true;
}

export function bandageHeal(c: Character): number {
  return Math.round(8 + c.skills.healing / 20 + c.skills.anatomy / 50);
}

/** Flee chance: DEX against the quickest foe. */
export function fleeChance(c: Character, cb: Combat): number {
  const fastest = Math.max(...cb.foes.filter((f) => f.hp > 0).map((f) => MONSTERS[f.kind].speed));
  return clamp(0.6 + (c.stats.dex - 40) / 100 - fastest / 80, 0.15, 0.9);
}

/**
 * Resolves one round: you and every living foe act in initiative order.
 * Returns how the fight stands afterwards.
 */
export function playRound(c: Character, run: Run, action: Action, rng: Rng): Outcome {
  const cb = run.combat!;
  const myInit = c.stats.dex + randInt(rng, 0, 10) + (1.2 - weaponInfo(c).speed) * 20 + (cb.first ? 100 : 0);
  cb.first = false;
  type Turn = { who: 'me' } | { who: 'foe'; f: Foe } | { who: 'ally'; a: Ally };
  const order: Turn[] = [{ who: 'me' }];
  for (const f of cb.foes) if (f.hp > 0) order.push({ who: 'foe', f });
  for (const a of allies(c, cb)) order.push({ who: 'ally', a });
  const init = new Map<unknown, number>();
  for (const o of order) {
    const kind = o.who === 'foe' ? o.f.kind : o.who === 'ally' ? allyKind(o.a) : null;
    const swift = o.who === 'foe' && o.f.affix === 'swift' ? 8 : 0;
    init.set(o, kind ? MONSTERS[kind].speed + swift + randInt(rng, 0, 10) : myInit);
  }
  order.sort((a, b) => init.get(b)! - init.get(a)!);

  let hitThisRound = false;
  for (const o of order) {
    if (c.hp <= 0) break;
    if (o.who === 'me') {
      const r = myTurn(c, run, cb, action, rng);
      if (r === 'fled') return 'fled';
    } else if (o.who === 'ally') {
      const alive = 'pet' in o.a ? o.a.pet.hp > 0 && !o.a.pet.dead && c.pets.includes(o.a.pet) : o.a.summon.hp > 0;
      if (alive) allyAttack(c, run, cb, o.a, rng);
    } else if (o.f.hp > 0) {
      if (o.f.stunned > 0) {
        o.f.stunned -= 1;
        say(run, 'fight.stunned', { foe: foeName(o.f) });
      } else if (foeAttack(c, run, cb, o.f, rng)) hitThisRound = true;
    }
  }

  if (c.hp <= 0) {
    c.hp = 0;
    return 'died';
  }
  if (cb.bandaging) {
    cb.bandaging = false;
    if (hitThisRound) say(run, 'fight.bandageBroken', undefined, 'bad');
    else {
      const heal = bandageHeal(c);
      c.hp = Math.min(maxHp(c), c.hp + heal);
      say(run, 'fight.bandaged', { n: heal }, 'good');
      const g = trySkillGain(c, 'healing', 0.5, true, rng, { mult: isPowerHour() ? 1.5 : 1 });
      if (g) say(run, 'log.gain', { skill: '@skill.healing', amount: `#${g / 10}`, value: `#${c.skills.healing / 10}` }, 'gain');
    }
  }
  if (cb.cowed > 0) cb.cowed -= 1;
  cb.guard = false;
  const cost = roundStamina(c);
  if (cost) {
    const was = c.stamina;
    c.stamina = Math.max(0, c.stamina - cost);
    if (was >= 1 && c.stamina < 1) say(run, 'fight.exhausted', undefined, 'bad');
  }
  cb.round += 1;
  return cb.foes.every((f) => f.hp <= 0) ? 'won' : 'continue';
}

function myTurn(c: Character, run: Run, cb: Combat, action: Action, rng: Rng): 'fled' | void {
  switch (action.type) {
    case 'attack':
      return attack(c, run, cb, rng);
    case 'ability': {
      if (!abilityOk(c, cb, action.id)) return attack(c, run, cb, rng);
      c.stamina -= ABILITY_COST[action.id];
      say(run, `fight.ability.${action.id}`, undefined, 'sys');
      if (action.id === 'secondWind') {
        cb.secondWindUsed = true;
        c.hp = Math.min(maxHp(c), c.hp + Math.round(maxHp(c) * 0.25));
        c.stamina = Math.min(maxStamina(c), c.stamina + Math.round(maxStamina(c) * 0.5));
      } else if (action.id === 'crushingBlow') attack(c, run, cb, rng, { stun: c.stance === 'combat' ? 0.3 : 0.5 });
      else if (action.id === 'leap') {
        attack(c, run, cb, rng, { dmgMult: 1.5, hitBonus: 0.15 });
        cb.first = true;
      } else if (action.id === 'callWild') {
        cb.summoned = true;
        const kind: MonsterId = c.skills.animalLore >= 600 ? 'bear' : 'wolf';
        cb.summon = { kind, hp: MONSTERS[kind].hp, stunned: 0 };
        say(run, 'fight.summoned', { ally: `@mon.${kind}` }, 'good');
      } else cb.cowed = 2;
      return;
    }
    case 'healPet': {
      const hurt = c.pets.filter((p) => !p.dead && p.hp < petMaxHp(p)).sort((a, b) => a.hp / petMaxHp(a) - b.hp / petMaxHp(b))[0];
      if (!hurt) return;
      const n = healPet(c, hurt, rng);
      if (n) say(run, 'fight.petHealed', { ally: `@mon.${hurt.kind}`, n }, 'good');
      return;
    }
    case 'bandage':
      if (!(c.pack.res.bandage ?? 0)) return;
      addRes(c.pack, 'bandage', -1);
      cb.bandaging = true;
      say(run, 'fight.bandaging', undefined, 'sys');
      return;
    case 'wait':
      cb.guard = true;
      say(run, 'fight.waiting', undefined, 'sys');
      return;
    case 'eat':
      if (eat(c, action.res)) say(run, 'log.eat', { res: `@res.${action.res}` }, 'good');
      return;
    case 'flee':
      if (rng() < fleeChance(c, cb)) {
        say(run, 'fight.fled', undefined, 'sys');
        return 'fled';
      }
      say(run, 'fight.fleeFailed', undefined, 'bad');
      return;
  }
}

/** Gold and drops for the defeated foes. */
export function loot(c: Character, run: Run, foes: Foe[], rng: Rng): number {
  // Pick up about 40% of the arrows you loosed.
  const shot = run.combat?.arrowsShot ?? 0;
  const back = Math.floor(shot * (0.3 + rng() * 0.2));
  if (back > 0) {
    addRes(c.pack, 'arrow', back);
    say(run, 'fight.arrowsBack', { n: back }, 'good');
  }
  let gold = 0;
  for (const f of foes) {
    const m = MONSTERS[f.kind];
    gold += randInt(rng, m.gold[0], m.gold[1]);
    for (const [res, p, lo, hi] of m.drops ?? []) {
      if (rng() < p) {
        const n = randInt(rng, lo, hi);
        addRes(c.pack, res, n);
        say(run, 'fight.drop', { n, res: `@res.${res}` }, 'gain');
      }
    }
  }
  const find = weaponInfo(c).item?.mat ? METALS[weaponInfo(c).item!.mat!].goldFind ?? 0 : 0;
  gold = Math.round(gold * (1 + find));
  c.gold += gold;
  run.loot += gold;
  if (gold) say(run, 'fight.gold', { gold }, 'good');
  return gold;
}

export const isFood = (id: ResourceId) => !!RESOURCES[id].food;
