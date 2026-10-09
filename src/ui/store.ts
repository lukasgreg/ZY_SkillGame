import { useEffect, useReducer } from 'preact/hooks';
import { regen } from '../engine/character';
import { loadLocal, saveLocal } from '../engine/save';
import { isPowerHour } from '../engine/skills';
import { activeChar, log, newGameState, type GameState } from '../engine/state';
import { defaultRng } from '../engine/rng';
import { tickWanderers } from '../engine/wanderers';
import { catchUp } from '../engine/workers';
import { tickContracts } from '../engine/contracts';
import { decay, nextSeed } from '../engine/dungeon';
import { DUNGEON_IDS } from '../data/dungeons';
import { checkAchievements } from '../engine/achievements';
import { restPets, tickPets } from '../engine/pets';
import { poisonTick, tickBuffs } from '../engine/alchemy';
import { activeHouse, collectRent, harvestGarden } from '../engine/housing';
import type { ResourceId } from '../data/resources';
import { detectLang, setLang, type Params } from '../i18n';

export interface ToastItem {
  head: string;
  k: string;
  p?: Params;
}

/** UI-only state that is never saved (an action in progress, flashes). */
export interface Transient {
  busy: null | { kind: 'mine' | 'search' | 'travel' | 'smelt' | 'craft' | 'repair' | 'fight' | 'tame' | 'vet'; start: number; dur: number; label?: string };
  /** Repeats left in a craft/smelt batch; set to 0 to stop after the current one. */
  queue: number;
  /** Which calming phrase is showing while taming. */
  phrase: number;
  /** Last skill gain, for the floating "+0.1" flash. */
  flash: null | { text: string; id: number };
  /** Newly earned achievements, shown as a banner for a few seconds. */
  toast: null | { items: ToastItem[]; id: number };
}

let state: GameState = loadLocal() ?? newGameState(detectLang());
setLang(state.settings.lang);
reportAway(state);

/** Simulates workers for the time the game was closed and writes a journal summary. */
function reportAway(s: GameState): void {
  collectRent(s);
  for (const [id, n] of Object.entries(harvestGarden(s, defaultRng)) as [ResourceId, number][]) log(s, 'log.house.garden', { n, res: `@res.${id}` }, 'good');
  const { ms, got } = catchUp(s, Date.now(), defaultRng);
  const entries = Object.entries(got) as [ResourceId, number][];
  if (ms < 120_000 || entries.length === 0) return;
  log(s, 'log.workers.away', { h: `#${Math.round((ms / 3600_000) * 10) / 10}` }, 'sys');
  for (const [id, n] of entries) log(s, 'log.workers.got', { n, res: `@res.${id}` }, 'good');
}
const listeners = new Set<() => void>();
let saveTimer: number | undefined;

export function getState(): GameState {
  return state;
}

function emit(): void {
  listeners.forEach((l) => l());
}

export function scheduleSave(): void {
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => saveLocal(state), 400);
}

export const transient: Transient = { busy: null, queue: 0, phrase: 0, flash: null, toast: null };
let toastSeq = 0;

/** Shows a banner (achievement earned, level reached) for a few seconds. */
export function showToast(items: ToastItem[]): void {
  if (!items.length) return;
  const id = ++toastSeq;
  transient.toast = { items, id };
  window.setTimeout(() => {
    if (transient.toast?.id === id) {
      transient.toast = null;
      emit();
    }
  }, 5000);
}

function achievements(): void {
  showToast(checkAchievements(state).map((a) => ({ head: 'ach.unlocked', k: `ach.${a}` })));
}

/** Notices characters that levelled up during an action and celebrates it. */
function levelUps(before: Map<number, number>): void {
  const items: ToastItem[] = [];
  for (const c of state.chars) {
    const was = before.get(c.id) ?? c.level;
    if (c.level > was) {
      log(state, 'log.levelUp', { name: c.name, n: c.level }, 'gain');
      items.push({ head: 'toast.levelUp', k: 'toast.levelText', p: { name: c.name, n: c.level } });
    }
  }
  showToast(items);
}

const levelsNow = () => new Map(state.chars.map((c) => [c.id, c.level]));

/** Mutates the game state, re-renders and saves. */
export function update(fn: (s: GameState) => void): void {
  const before = levelsNow();
  fn(state);
  levelUps(before);
  state.editedAt = Date.now();
  achievements();
  emit();
  scheduleSave();
}

/** Re-renders without touching the save (transient changes). */
export function touch(): void {
  emit();
}

export function replaceState(s: GameState): void {
  state = s;
  reportAway(state);
  setLang(s.settings.lang);
  emit();
  saveLocal(state);
}

export function useGame(): GameState {
  const [, bump] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    const force = () => bump(undefined);
    listeners.add(force);
    return () => {
      listeners.delete(force);
    };
  }, []);
  return state;
}

let wasPowerHour = isPowerHour();
let tickCount = 0;

/** One-second heartbeat: regeneration and powerhour notices. */
export function startClock(): void {
  window.setInterval(() => {
    const c = activeChar(state);
    if (!c) return;
    regen(c, Date.now());
    if (tickWanderers(state, defaultRng, Date.now())) scheduleSave();
    if (tickContracts(state, c, defaultRng, Date.now())) scheduleSave();
    for (const id of DUNGEON_IDS) if (state.dungeonSeeds[id] === undefined) nextSeed(state, id, defaultRng);
    tickCount += 1;
    for (const ev of collectRent(state)) {
      if (ev !== 'paid') log(state, `log.house.${ev}`, undefined, 'bad');
    }
    const home = activeHouse(state);
    if (tickCount % 60 === 0) {
      for (const [id, n] of Object.entries(harvestGarden(state, defaultRng)) as [ResourceId, number][]) log(state, 'log.house.garden', { n, res: `@res.${id}` }, 'good');
    }
    for (const ch of state.chars) {
      for (const b of tickBuffs(ch)) log(state, 'log.buffEnded', { name: ch.name, buff: `@buff.${b}` }, 'sys');
      // Poison keeps working out of a fight, every five seconds, but never kills there.
      if (ch.poison && !ch.run?.combat && tickCount % 5 === 0) {
        const d = poisonTick(ch, defaultRng, false);
        if (ch.id === state.active) log(state, 'log.poisonTick', { dmg: d }, 'bad');
      }
      if (decay(ch)) log(state, 'log.dun.decayed', { name: ch.name }, 'bad');
      if (!ch.pets.length) continue;
      const { ran, bonded } = tickPets(ch);
      for (const p of ran) log(state, 'log.pet.ran', { pet: `@mon.${p.kind}` }, 'bad');
      for (const p of bonded) log(state, 'log.pet.bondedNow', { pet: `@mon.${p.kind}` }, 'gain');
      if (!ch.run?.combat) restPets(ch, home?.kennel ? 2000 : 1000);
      ch.xpBonus = home?.xpBonus ?? 0;
    }
    if (state.workers.length) {
      catchUp(state, Date.now(), defaultRng);
      scheduleSave();
    } else state.workersAt = Date.now();
    const ph = isPowerHour();
    if (ph && !wasPowerHour) log(state, 'log.powerhour', undefined, 'sys');
    wasPowerHour = ph;
    achievements();
    emit();
  }, 1000);
  window.addEventListener('beforeunload', () => saveLocal(state));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') saveLocal(state);
  });
}
