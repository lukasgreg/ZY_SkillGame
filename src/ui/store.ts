import { useEffect, useReducer } from 'preact/hooks';
import { regen } from '../engine/character';
import { loadLocal, saveLocal } from '../engine/save';
import { isPowerHour } from '../engine/skills';
import { activeChar, log, newGameState, type GameState } from '../engine/state';
import { defaultRng } from '../engine/rng';
import { tickWanderers } from '../engine/wanderers';
import { catchUp } from '../engine/workers';
import { tickContracts } from '../engine/contracts';
import { decay } from '../engine/dungeon';
import { restPets, tickPets } from '../engine/pets';
import type { ResourceId } from '../data/resources';
import { detectLang, setLang } from '../i18n';

/** UI-only state that is never saved (an action in progress, flashes). */
export interface Transient {
  busy: null | { kind: 'mine' | 'search' | 'travel' | 'smelt' | 'craft' | 'repair' | 'fight'; start: number; dur: number; label?: string };
  /** Repeats left in a craft/smelt batch; set to 0 to stop after the current one. */
  queue: number;
  /** Last skill gain, for the floating "+0.1" flash. */
  flash: null | { text: string; id: number };
}

let state: GameState = loadLocal() ?? newGameState(detectLang());
setLang(state.settings.lang);
reportAway(state);

/** Simulates workers for the time the game was closed and writes a journal summary. */
function reportAway(s: GameState): void {
  const { ms, got } = catchUp(s, Date.now(), defaultRng);
  const entries = Object.entries(got) as [ResourceId, number][];
  if (ms < 120_000 || entries.length === 0) return;
  log(s, 'log.workers.away', { h: `#${Math.round((ms / 3600_000) * 10) / 10}` }, 'sys');
  for (const [id, n] of entries) log(s, 'log.workers.got', { n, res: `@res.${id}` }, 'good');
}
export const transient: Transient = { busy: null, queue: 0, flash: null };

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

/** Mutates the game state, re-renders and saves. */
export function update(fn: (s: GameState) => void): void {
  fn(state);
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

/** One-second heartbeat: regeneration and powerhour notices. */
export function startClock(): void {
  window.setInterval(() => {
    const c = activeChar(state);
    if (!c) return;
    regen(c, Date.now());
    if (tickWanderers(state, defaultRng, Date.now())) scheduleSave();
    if (tickContracts(state, c, defaultRng, Date.now())) scheduleSave();
    for (const ch of state.chars) {
      if (decay(ch)) log(state, 'log.dun.decayed', { name: ch.name }, 'bad');
      if (!ch.pets.length) continue;
      const { ran, bonded } = tickPets(ch);
      for (const p of ran) log(state, 'log.pet.ran', { pet: `@mon.${p.kind}` }, 'bad');
      for (const p of bonded) log(state, 'log.pet.bondedNow', { pet: `@mon.${p.kind}` }, 'gain');
      if (!ch.run?.combat) restPets(ch, 1000);
    }
    if (state.workers.length) {
      catchUp(state, Date.now(), defaultRng);
      scheduleSave();
    } else state.workersAt = Date.now();
    const ph = isPowerHour();
    if (ph && !wasPowerHour) log(state, 'log.powerhour', undefined, 'sys');
    wasPowerHour = ph;
    emit();
  }, 1000);
  window.addEventListener('beforeunload', () => saveLocal(state));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') saveLocal(state);
  });
}
