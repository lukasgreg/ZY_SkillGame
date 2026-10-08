import { useEffect, useReducer } from 'preact/hooks';
import { regen } from '../engine/character';
import { loadLocal, saveLocal } from '../engine/save';
import { isPowerHour } from '../engine/skills';
import { activeChar, log, newGameState, type GameState } from '../engine/state';
import { defaultRng } from '../engine/rng';
import { tickWanderers } from '../engine/wanderers';
import { detectLang, setLang } from '../i18n';

/** UI-only state that is never saved (an action in progress, flashes). */
export interface Transient {
  busy: null | { kind: 'mine' | 'search' | 'travel' | 'smelt' | 'craft' | 'repair'; start: number; dur: number; label?: string };
  /** Repeats left in a craft/smelt batch; set to 0 to stop after the current one. */
  queue: number;
  /** Last skill gain, for the floating "+0.1" flash. */
  flash: null | { text: string; id: number };
}

let state: GameState = loadLocal() ?? newGameState(detectLang());
setLang(state.settings.lang);
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
