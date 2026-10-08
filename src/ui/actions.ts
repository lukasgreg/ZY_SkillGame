import { ITEMS, type ItemDefId, type MetalId } from '../data/items';
import type { Recipe } from '../data/recipes';
import type { SkillId } from '../data/skills';
import { canCraft, craft, repair as playerRepair, repairInfo, smelt, smeltChance } from '../engine/craft';
import { sellToWanderer, smithBuyPrice, wandererPays } from '../engine/wanderers';
import type { MineLevelId, ResourceId } from '../data/resources';
import { toolInHand } from '../engine/character';
import { canMine, findVein, pull, swingTime } from '../engine/mining';
import { defaultRng } from '../engine/rng';
import { activeChar, log, type Character, type GameState, type ItemInstance, type Location, type Wanderer } from '../engine/state';
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

export function mine(): void {
  const c = activeChar(getState());
  if (!c || transient.busy) return;
  const block = canMine(c);
  if (block) {
    withChar((s) => log(s, `mine.block.${block}`, undefined, 'bad'));
    return;
  }
  timed('mine', swingTime(c, rng), () =>
    withChar((s, c) => {
      if (canMine(c)) return; // something changed while swinging
      const tool = toolInHand(c)!;
      const r = pull(c, rng);
      if (r.ok) log(s, 'log.mine.ok', { amount: r.amount, res: `@res.${r.res}` });
      else log(s, `log.mine.fizzle.${Math.floor(rng() * 3)}`, undefined, 'bad');
      noteGains(s, c, 'mining', r.gain, r.stat);
      if (r.toolWarn) log(s, 'log.tool.warn', { item: itemParam(tool) }, 'bad');
      if (r.toolBroke) log(s, 'log.tool.broke', { item: itemParam(tool) }, 'bad');
      if (r.veinEmpty) log(s, 'log.mine.exhausted', undefined, 'sys');
    }),
  );
}

export function searchVein(): void {
  const c = activeChar(getState());
  if (!c || transient.busy || c.location !== 'mine') return;
  timed('search', 1200 + rng() * 800, () =>
    withChar((s, c) => {
      c.vein = findVein(c, rng);
      if (c.vein) log(s, 'log.mine.vein', { res: `@res.${c.vein.res}` }, 'sys');
      else log(s, 'log.mine.noVein', undefined, 'bad');
    }),
  );
}

export function travel(to: Location): void {
  const c = activeChar(getState());
  if (!c || transient.busy || c.location === to) return;
  timed('travel', 2500, () =>
    withChar((s, c) => {
      c.location = to;
      log(s, to === 'mine' ? 'log.travel.mine' : 'log.travel.town', undefined, 'sys');
    }),
  );
}

export function setMineLevel(id: MineLevelId): void {
  if (transient.busy) return;
  withChar((s, c) => {
    if (c.mineLevel === id) return;
    c.mineLevel = id;
    c.vein = null;
    log(s, 'log.level', { level: `@mine.level.${id}` }, 'sys');
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

export function craftItem(r: Recipe, metal: MetalId | null, n: number): void {
  const c = activeChar(getState());
  if (!c || c.location !== 'town' || canCraft(c, r, metal)) return;
  repeat('craft', n, () => workTime(c), () => {
    let more = false;
    withChar((s, c) => {
      if (canCraft(c, r, metal)) return;
      const res = craft(s, c, r, metal, rng);
      if (res.item) log(s, res.item.quality === 'exceptional' ? 'log.craft.exc' : 'log.craft.ok', { item: itemParam(res.item) }, res.item.quality === 'exceptional' ? 'gain' : undefined);
      else if (res.res) log(s, 'log.craft.res', { n: res.res.n, res: `@res.${res.res.id}` });
      else log(s, 'log.craft.fail', undefined, 'bad');
      noteGains(s, c, r.skill, res.gain, res.stat);
      if (res.toolBroke) log(s, 'log.tool.broke', { item: itemParam({ def: res.toolBroke }) }, 'bad');
      more = canCraft(c, r, metal) === null;
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
    if (sellToWanderer(s, c, live, item)) log(s, 'log.wanderer.sold', { item: itemParam(item), name: live.name, gold }, 'good');
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
    if (buyRes(c, id, n)) log(s, 'log.boughtRes', { n, res: `@res.${id}`, gold: buyResPrice(id) * n }, 'good');
  });
}
