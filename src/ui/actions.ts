import { ITEMS, type ItemDefId } from '../data/items';
import type { MineLevelId, ResourceId } from '../data/resources';
import { toolInHand } from '../engine/character';
import { canMine, findVein, pull, swingTime } from '../engine/mining';
import { defaultRng } from '../engine/rng';
import { activeChar, log, type Character, type GameState, type ItemInstance, type Location } from '../engine/state';
import { buyItem, depositAll, npcRepair, npcRepairCost, sellRes } from '../engine/town';
import { skillNum, t } from '../i18n';
import { getState, touch, transient, update } from './store';

const rng = defaultRng;
let flashSeq = 0;

function withChar(fn: (s: GameState, c: Character) => void): void {
  update((s) => {
    const c = activeChar(s);
    if (c) fn(s, c);
  });
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
      if (r.gain) {
        log(s, 'log.gain', { skill: '@skill.mining', amount: `#${r.gain / 10}`, value: `#${c.skills.mining / 10}` }, 'gain');
        transient.flash = { text: `+${skillNum(r.gain)} ${t('skill.mining')}`, id: ++flashSeq };
      }
      if (r.stat) log(s, 'log.stat', { stat: `@stat.${r.stat}`, value: c.stats[r.stat] }, 'gain');
      if (r.toolWarn) log(s, 'log.tool.warn', { item: `@item.${tool.def}` }, 'bad');
      if (r.toolBroke) log(s, 'log.tool.broke', { item: `@item.${tool.def}` }, 'bad');
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
    if (buyItem(s, c, def)) log(s, 'log.bought', { item: `@item.${def}`, gold: ITEMS[def].price }, 'good');
  });
}

export function repair(it: ItemInstance): void {
  withChar((s, c) => {
    const cost = npcRepairCost(it);
    const live = c.pack.items.find((i) => i.uid === it.uid);
    if (live && npcRepair(c, live)) log(s, 'log.repaired', { item: `@item.${it.def}`, gold: cost }, 'good');
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
