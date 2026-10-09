import { SAVE_VERSION, newStats, type GameState } from './state';

const KEY = 'zy-skillgame-save';

export function serialize(s: GameState): string {
  return JSON.stringify(s);
}

/** Migrations by version. Add one entry per bump of SAVE_VERSION. */
const MIGRATIONS: Record<number, (s: any) => any> = {
  1: (s) => ({ ...s, version: 2, wanderers: [], nextWandererAt: Date.now() + 20_000, reputation: 0 }),
  2: (s) => ({
    ...s,
    version: 3,
    chars: s.chars.map(({ mineLevel, vein, ...c }: any) => ({ ...c, areas: { mine: mineLevel ?? 1, forest: 1, coast: 1, farm: 1 }, node: vein ?? null })),
  }),
  3: (s) => ({ ...s, version: 4, workers: [], hires: 0, bunkhouse: 0, workersAt: Date.now() }),
  4: (s) => ({ ...s, version: 5, contractOffers: [], contracts: [], nextContractAt: 0, chars: s.chars.map((c: any) => ({ ...c, plans: {} })) }),
  5: (s) => ({
    ...s,
    version: 6,
    dungeonSeeds: {},
    scouted: {},
    cleared: [],
    chars: s.chars.map((c: any) => ({ ...c, equip: {}, stance: 'normal', run: null, corpse: null })),
  }),
  6: (s) => ({
    ...s,
    version: 7,
    chars: s.chars.map((c: any) => ({ ...c, pets: [], run: c.run?.combat ? { ...c.run, combat: { ...c.run.combat, summon: null, summoned: false } } : c.run })),
  }),
  7: (s) => ({ ...s, version: 8, stats: newStats(), achievements: {} }),
};

export function deserialize(json: string): GameState {
  let s = JSON.parse(json);
  if (typeof s !== 'object' || !s || !Array.isArray(s.chars)) throw new Error('not a save');
  while (s.version < SAVE_VERSION) {
    const m = MIGRATIONS[s.version];
    if (!m) throw new Error(`no migration from v${s.version}`);
    s = m(s);
  }
  return s as GameState;
}

export function loadLocal(): GameState | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? deserialize(raw) : null;
  } catch {
    return null;
  }
}

export function saveLocal(s: GameState): void {
  try {
    s.lastSeen = Date.now();
    localStorage.setItem(KEY, serialize(s));
  } catch {
    /* storage full or blocked: export still works */
  }
}

export function clearLocal(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

/** Export string: base64 of UTF-8 JSON (names may contain Czech letters). */
export function exportSave(s: GameState): string {
  const bytes = new TextEncoder().encode(serialize(s));
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin);
}

export function importSave(text: string): GameState {
  const bin = atob(text.trim());
  const bytes = Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
  return deserialize(new TextDecoder().decode(bytes));
}
