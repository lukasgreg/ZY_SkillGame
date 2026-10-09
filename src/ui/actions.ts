import { ITEMS, type ItemDefId, type MetalId } from '../data/items';
import type { Recipe } from '../data/recipes';
import type { DungeonId } from '../data/dungeons';
import type { Slot } from '../data/items';
import { equip, setStance, unequip, type Action } from '../engine/combat';
import { feed, healPet, release, resurrect } from '../engine/pets';
import { bump } from '../engine/achievements';
import { commission } from '../engine/patterns';
import { chooseEvent, goBack, openBossChest } from '../engine/dungeon';
import { camp, enter, fight, here, leave, lootCorpse, move, reengage, scout, useRepairKit, wayHome } from '../engine/dungeon';
import { PLANS, type PlanId } from '../data/plans';
import { abandon, accept, combineFragments, craftPlan, fortify, handIn } from '../engine/contracts';
import type { SkillId } from '../data/skills';
import { canCraft, craft, repair as playerRepair, repairInfo, smelt, smeltChance } from '../engine/craft';
import { deliverGoods, sellToWanderer, smithBuyPrice, wandererPays } from '../engine/wanderers';
import type { AreaId, GatherLoc, ResourceId } from '../data/resources';
import { eat } from '../engine/character';
import { canGather, findNode, isGatherLoc, pull, swingTime } from '../engine/gather';
import { defaultRng } from '../engine/rng';
import { activeChar, log, type Character, type Contract, type GameState, type ItemInstance, type Location, type Pet, type Stance, type Wanderer } from '../engine/state';
import { buyItem, buyRes, buyResPrice, depositAll, npcRepair, npcRepairCost, sellRes } from '../engine/town';
import { itemParam, skillNum, t } from '../i18n';
import { getState, touch, transient, update } from './store';

const rng = defaultRng;
let flashSeq = 0;

function withChar(fn: (s: GameState, c: Character) => void): void {
  update((s) => {
    const c = activeChar(s);
    if (c) fn(s, c);
  });
}

/** Journal lines and the floating "+0.1" for a skill or stat gain. */
function noteGains(s: GameState, c: Character, skill: SkillId, gain: number, stat: import('../data/skills').StatId | null): void {
  if (gain) {
    log(s, 'log.gain', { skill: `@skill.${skill}`, amount: `#${gain / 10}`, value: `#${c.skills[skill] / 10}` }, 'gain');
    transient.flash = { text: `+${skillNum(gain)} ${t(`skill.${skill}`)}`, id: ++flashSeq };
  }
  if (stat) log(s, 'log.stat', { stat: `@stat.${stat}`, value: c.stats[stat] }, 'gain');
}

/** Runs `done` after `dur` ms while the UI shows a progress state. */
function timed(kind: NonNullable<typeof transient.busy>['kind'], dur: number, done: () => void): void {
  if (transient.busy) return;
  transient.busy = { kind, start: performance.now(), dur };
  touch();
  window.setTimeout(() => {
    transient.busy = null;
    done();
  }, dur);
}

/** One swing, chop, cast or hoe stroke at the current node. */
export function gather(): void {
  const c = activeChar(getState());
  if (!c || transient.busy) return;
  const block = canGather(c);
  if (block) {
    withChar((s) => log(s, `gather.block.${block}`, undefined, 'bad'));
    return;
  }
  const loc = c.location as GatherLoc;
  timed('mine', swingTime(c, rng), () =>
    withChar((s, c) => {
      if (canGather(c)) return; // something changed while swinging
      const r = pull(c, rng);
      if (r.ok) bump(s, 'pulls');
      if (r.ok) log(s, 'log.gather.ok', { amount: r.amount, res: `@res.${r.res}` });
      else log(s, `log.fizzle.${loc}.${Math.floor(rng() * 3)}`, undefined, 'bad');
      noteGains(s, c, r.skill, r.gain, r.stat);
      if (r.toolWarn) log(s, 'log.tool.warn', { item: itemParam(r.tool) }, 'bad');
      if (r.toolBroke) log(s, 'log.tool.broke', { item: itemParam(r.tool) }, 'bad');
      if (r.nodeEmpty) log(s, `log.node.empty.${loc}`, undefined, 'sys');
      if (r.fragment) log(s, 'log.fragment', undefined, 'gain');
    }),
  );
}

export function searchNode(): void {
  const c = activeChar(getState());
  if (!c || transient.busy || !isGatherLoc(c.location)) return;
  const loc = c.location;
  timed('search', 1200 + rng() * 800, () =>
    withChar((s, c) => {
      c.node = findNode(c, rng);
      if (c.node) log(s, `log.node.found.${loc}`, { res: `@res.${c.node.res}` }, 'sys');
      else log(s, 'log.node.none', undefined, 'bad');
    }),
  );
}

export function travel(to: Location): void {
  const c = activeChar(getState());
  if (!c || transient.busy || c.location === to || c.location === 'dungeon') return;
  timed('travel', 2500, () =>
    withChar((s, c) => {
      c.location = to;
      c.node = null;
      log(s, `log.travel.${to}`, undefined, 'sys');
    }),
  );
}

export function setArea(loc: GatherLoc, id: AreaId): void {
  if (transient.busy) return;
  withChar((s, c) => {
    if (c.areas[loc] === id) return;
    c.areas[loc] = id;
    c.node = null;
    log(s, 'log.area', { area: `@area.${loc}.${id}` }, 'sys');
  });
}

export function eatFood(id: ResourceId): void {
  withChar((s, c) => {
    if (eat(c, id)) log(s, 'log.eat', { res: `@res.${id}` }, 'good');
  });
}

export function deliver(w: Wanderer): void {
  withChar((s, c) => {
    const live = s.wanderers.find((x) => x.id === w.id);
    if (live?.wantsRes && deliverGoods(s, c, live)) {
      bump(s, 'sales');
      bump(s, 'goldEarned', live.offer);
      log(s, 'log.wanderer.goods', { n: live.wantsRes.n, res: `@res.${live.wantsRes.id}`, name: live.name, gold: live.offer }, 'good');
    }
  });
}

export function sell(id: ResourceId, n: number): void {
  withChar((s, c) => {
    const amount = Math.min(n, c.pack.res[id] ?? 0);
    if (!amount) return;
    const gold = sellRes(s, c, id, amount);
    log(s, 'log.sold', { amount, res: `@res.${id}`, gold }, 'good');
  });
}

export function buy(def: ItemDefId): void {
  withChar((s, c) => {
    if (buyItem(s, c, def)) log(s, 'log.bought', { item: itemParam({ def }), gold: ITEMS[def].price }, 'good');
  });
}

export function repair(it: ItemInstance): void {
  withChar((s, c) => {
    const cost = npcRepairCost(it);
    const live = c.pack.items.find((i) => i.uid === it.uid);
    if (live && npcRepair(c, live)) log(s, 'log.repaired', { item: itemParam(it), gold: cost }, 'good');
  });
}

export function hold(uid: number): void {
  withChar((_, c) => {
    if (c.pack.items.some((i) => i.uid === uid)) c.tool = uid;
  });
}

export function bankAll(): void {
  withChar((s, c) => {
    const n = depositAll(s, c);
    if (n) log(s, 'log.deposit', { amount: n }, 'good');
  });
}

/** Repeats a timed step up to `n` times; `step` returns false to stop early. */
function repeat(kind: 'smelt' | 'craft', n: number, dur: () => number, step: () => boolean): void {
  if (transient.busy || n <= 0) return;
  transient.queue = n - 1;
  const run = () =>
    timed(kind, dur(), () => {
      const more = step();
      if (more && transient.queue > 0) {
        transient.queue -= 1;
        run();
      } else {
        transient.queue = 0;
        touch();
      }
    });
  run();
}

export function stopQueue(): void {
  transient.queue = 0;
  touch();
}

const workTime = (c: Character) => Math.round((2200 + rng() * 1200) * (1 - c.stats.dex / 400));

export function smeltOre(ore: ResourceId, n: number): void {
  const c = activeChar(getState());
  if (!c || c.location !== 'town') return;
  repeat('smelt', n, () => Math.round(workTime(c) * 0.6), () => {
    let more = false;
    withChar((s, c) => {
      if ((c.pack.res[ore] ?? 0) < 2 || smeltChance(c, ore) <= 0) return;
      const r = smelt(c, ore, rng);
      if (r.ok) log(s, 'log.smelt.ok', { res: `@res.${r.bar}` });
      else log(s, 'log.smelt.fail', undefined, 'bad');
      noteGains(s, c, 'mining', r.gain, r.stat);
      more = (c.pack.res[ore] ?? 0) >= 2;
    });
    return more;
  });
}

export function craftItem(r: Recipe, metal: MetalId | null, n: number, runic = false): void {
  const c = activeChar(getState());
  if (!c || c.location !== 'town' || canCraft(c, r, metal, getState())) return;
  repeat('craft', n, () => workTime(c), () => {
    let more = false;
    withChar((s, c) => {
      if (canCraft(c, r, metal, s)) return;
      const res = craft(s, c, r, metal, rng, new Date(), runic);
      if (res.ok) bump(s, 'crafts');
      if (res.item?.quality === 'exceptional') bump(s, 'exceptional');
      if (res.item?.runic) bump(s, 'runic');
      if (res.item) log(s, res.item.quality === 'exceptional' ? 'log.craft.exc' : 'log.craft.ok', { item: itemParam(res.item) }, res.item.quality === 'exceptional' ? 'gain' : undefined);
      else if (res.res) log(s, 'log.craft.res', { n: res.res.n, res: `@res.${res.res.id}` });
      else log(s, 'log.craft.fail', undefined, 'bad');
      noteGains(s, c, r.skill, res.gain, res.stat);
      if (res.toolBroke) log(s, 'log.tool.broke', { item: itemParam({ def: res.toolBroke }) }, 'bad');
      more = canCraft(c, r, metal, s) === null;
    });
    return more;
  });
}

export function repairOwn(it: ItemInstance): void {
  const c = activeChar(getState());
  if (!c || transient.busy || c.location !== 'town') return;
  timed('repair', workTime(c), () =>
    withChar((s, c) => {
      const live = c.pack.items.find((i) => i.uid === it.uid);
      const info = live && repairInfo(c, live);
      if (!live || !info) return;
      const r = playerRepair(c, live, rng);
      log(s, r.ok ? 'log.repair.ok' : 'log.repair.fail', { item: itemParam(live), n: r.lostMax }, r.ok ? 'good' : 'bad');
      noteGains(s, c, info.skill, r.gain, null);
      if (r.toolBroke) log(s, 'log.tool.broke', { item: itemParam({ def: r.toolBroke }) }, 'bad');
    }),
  );
}

export function sellWanderer(w: Wanderer, it: ItemInstance): void {
  withChar((s, c) => {
    const live = s.wanderers.find((x) => x.id === w.id);
    const item = c.pack.items.find((i) => i.uid === it.uid);
    if (!live || !item) return;
    const gold = wandererPays(live, item);
    if (sellToWanderer(s, c, live, item)) {
      bump(s, 'sales');
      bump(s, 'goldEarned', gold);
      log(s, 'log.wanderer.sold', { item: itemParam(item), name: live.name, gold }, 'good');
    }
  });
}

export function sellToSmith(it: ItemInstance): void {
  withChar((s, c) => {
    const item = c.pack.items.find((i) => i.uid === it.uid);
    if (!item) return;
    const gold = smithBuyPrice(item);
    c.pack.items = c.pack.items.filter((i) => i !== item);
    if (c.tool === item.uid) c.tool = null;
    c.gold += gold;
    log(s, 'log.smith.sold', { item: itemParam(item), gold }, 'good');
  });
}

export function buyResource(id: ResourceId, n: number): void {
  withChar((s, c) => {
    if (buyRes(c, id, n)) log(s, 'log.boughtRes', { n, res: `@res.${id}`, gold: buyResPrice(id, n) }, 'good');
  });
}

export function acceptContract(k: Contract): void {
  update((s) => {
    const live = s.contractOffers.find((x) => x.id === k.id);
    if (live && accept(s, live)) log(s, 'log.contract.accepted', { giver: live.giver }, 'sys');
  });
}

export function handInContract(k: Contract): void {
  withChar((s, c) => {
    const live = s.contracts.find((x) => x.id === k.id);
    if (!live) return;
    const r = handIn(s, c, live);
    if (r.done) {
      bump(s, 'contracts');
      bump(s, 'goldEarned', live.reward.gold);
      log(s, 'log.contract.done', { giver: live.giver, gold: live.reward.gold }, 'gain');
      if (live.reward.plan) log(s, 'log.contract.plan', { plan: `@plan.${live.reward.plan}` }, 'gain');
      if (live.reward.res) log(s, 'log.contract.res', { n: live.reward.res.n, res: `@res.${live.reward.res.id}` }, 'gain');
    } else if (r.given) log(s, 'log.contract.part', { n: r.given, left: live.n - live.delivered }, 'good');
  });
}

export function abandonContract(k: Contract): void {
  update((s) => {
    const live = s.contracts.find((x) => x.id === k.id);
    if (live) abandon(s, live);
  });
}

export function combine(): void {
  withChar((s, c) => {
    const id = combineFragments(c, rng);
    if (id) log(s, 'log.plan.combined', { plan: `@plan.${id}` }, 'gain');
  });
}

export function craftFromPlan(id: PlanId): void {
  const c = activeChar(getState());
  if (!c || transient.busy || c.location !== 'town') return;
  timed('craft', workTime(c) * 1.5, () =>
    withChar((s, c) => {
      const r = craftPlan(s, c, id, rng);
      if (!r) return;
      if (r.ok) {
        bump(s, 'plans');
        bump(s, 'crafts');
      }
      if (r.item) log(s, 'log.plan.made', { item: itemParam(r.item) }, 'gain');
      else if (r.res) log(s, 'log.craft.res', { n: r.res.n, res: `@res.${r.res.id}` }, 'gain');
      else log(s, 'log.plan.failed', { plan: `@plan.${id}` }, 'bad');
      noteGains(s, c, PLANS[id].skill, r.gain, r.stat);
    }),
  );
}

export function fortifyItem(it: ItemInstance): void {
  withChar((s, c) => {
    const live = c.pack.items.find((i) => i.uid === it.uid);
    if (live && fortify(c, live)) log(s, 'log.fortified', { item: itemParam(live) }, 'good');
  });
}

/* ---------------- dungeons ---------------- */

export function scoutDungeon(id: DungeonId, level: 1 | 2): void {
  withChar((s, c) => {
    if (scout(s, c, id, level)) log(s, 'log.dun.scouted', { d: `@dun.${id}` }, 'sys');
  });
}

export function enterDungeon(id: DungeonId): void {
  const c = activeChar(getState());
  if (!c || transient.busy || c.location !== 'town') return;
  timed('travel', 2000, () =>
    withChar((s, c) => {
      if (enter(s, c, id, rng)) log(s, 'log.dun.entered', { d: `@dun.${id}` }, 'sys');
    }),
  );
}

export function moveTo(nodeId: number): void {
  const c = activeChar(getState());
  if (!c?.run || transient.busy) return;
  timed('travel', 700, () => withChar((s, c) => void move(s, c, nodeId, rng)));
}

export function fightAction(a: Action): void {
  const c = activeChar(getState());
  if (!c?.run?.combat || transient.busy) return;
  timed('fight', 450, () =>
    withChar((s, c) => {
      const d = c.run!.dungeon;
      const loot = c.run!.loot;
      const cb = c.run!.combat!;
      const pets = c.pets.length;
      const bossBefore = c.run!.bossDown;
      const out = fight(s, c, a, rng);
      if (c.pets.length > pets) bump(s, 'tamed');
      if (out === 'won') bump(s, 'kills', cb.foes.filter((f) => f.hp <= 0).length);
      if (out === 'died') bump(s, 'deaths');
      if (!bossBefore && c.run?.bossDown) bump(s, 'bosses');
      if (out === 'died') log(s, 'log.dun.died', { d: `@dun.${d}` }, 'bad');
      else if (out === 'won' && c.run?.bossDown && here(c.run).type === 'boss') log(s, 'log.dun.bossDown', { d: `@dun.${d}`, gold: c.run.loot - loot }, 'gain');
    }),
  );
}

export function changeStance(st: Stance): void {
  withChar((_, c) => void setStance(c, st));
}

export function leaveDungeon(): void {
  withChar((s, c) => {
    const run = c.run;
    if (run && leave(c)) log(s, 'log.dun.left', { d: `@dun.${run.dungeon}`, gold: run.loot }, 'good');
  });
}

export function useWayHome(): void {
  withChar((s, c) => {
    if (wayHome(c)) log(s, 'log.dun.wayHome', undefined, 'sys');
  });
}

export function campHere(): void {
  const c = activeChar(getState());
  if (!c?.run || c.run.combat || transient.busy) return;
  timed('search', 3000, () => withChar((s, c) => void camp(s, c, rng)));
}

export function reengageFoes(): void {
  withChar((_, c) => void reengage(c));
}

export function lootMyCorpse(): void {
  withChar((s, c) => {
    if (lootCorpse(c)) {
      bump(s, 'recovered');
      log(s, 'log.dun.corpseLooted', undefined, 'gain');
    }
  });
}

export function wear(uid: number): void {
  withChar((_, c) => void equip(c, uid));
}

export function takeOff(slot: Slot): void {
  withChar((_, c) => unequip(c, slot));
}

export function fieldRepair(uid: number): void {
  withChar((s, c) => {
    const it = c.pack.items.find((i) => i.uid === uid);
    if (it && useRepairKit(c, uid)) log(s, 'log.repairKit', { item: itemParam(it) }, 'good');
  });
}

/* ---------------- pets ---------------- */

function withPet(id: number, fn: (s: GameState, c: Character, p: Pet) => void): void {
  withChar((s, c) => {
    const p = c.pets.find((x) => x.id === id);
    if (p) fn(s, c, p);
  });
}

export function feedPet(id: number, food: ResourceId): void {
  withPet(id, (s, c, p) => {
    if (feed(c, p, food)) log(s, 'log.pet.fed', { pet: `@mon.${p.kind}`, res: `@res.${food}` }, 'good');
  });
}

export function healMyPet(id: number): void {
  withPet(id, (s, c, p) => {
    const n = healPet(c, p, rng);
    if (n) log(s, 'log.pet.healed', { pet: `@mon.${p.kind}`, n }, 'good');
  });
}

export function resurrectPet(id: number): void {
  withPet(id, (s, c, p) => {
    const r = resurrect(c, p, rng);
    if (r !== null) log(s, r ? 'log.pet.back' : 'log.pet.backFailed', { pet: `@mon.${p.kind}` }, r ? 'gain' : 'bad');
  });
}

export function releasePet(id: number): void {
  withPet(id, (s, c, p) => {
    release(c, p);
    log(s, 'log.pet.released', { pet: `@mon.${p.kind}` }, 'sys');
  });
}

export function eventChoice(choice: string): void {
  withChar((s, c) => void chooseEvent(s, c, choice, rng));
}

export function stepBack(): void {
  const c = activeChar(getState());
  if (!c?.run || transient.busy) return;
  timed('travel', 500, () => withChar((_, c) => void goBack(c)));
}

export function openChest(): void {
  withChar((s, c) => {
    const d = c.run?.dungeon;
    if (openBossChest(s, c, rng)) log(s, 'log.dun.chest', { d: `@dun.${d}` }, 'gain');
  });
}

export function commissionPattern(key: string): void {
  withChar((s, c) => {
    const it = commission(s, c, key, rng);
    if (it) log(s, 'log.commission', { item: itemParam(it) }, 'gain');
  });
}
