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
  8: (s) => ({ ...s, version: 9, chars: s.chars.map((c: any) => ({ ...c, level: 1, xp: 0, statBase: { ...c.stats } })) }),
  9: (s) => migrateArmour(s),
  // v11 only adds optional fields (omens, events, affixes); runs in progress keep working.
  10: (s) => ({ ...s, version: 11 }),
  11: (s) => ({ ...s, version: 12, bank: { ...s.bank, patterns: {} } }),
  12: (s) => ({
    ...s,
    version: 13,
    chars: s.chars.map((c: any) => ({ ...c, wildsArea: 1, quarry: null, pets: c.pets.map((p: any) => ({ ...p, level: 1, xp: 0 })) })),
  }),
  13: (s) => ({
    ...s,
    version: 14,
    chars: s.chars.map((c: any) => ({ ...c, skills: { ...c.skills, alchemy: 0 }, locks: { ...c.locks, alchemy: 'up' }, buffs: [], poison: null, coat: 0 })),
  }),
  14: (s) => ({ ...s, version: 15, house: null }),
};

/** v9 → v10: the four old armour items become pieces of the new families; the body slot becomes chest. */
const OLD_ARMOUR: Record<string, string> = { chainCoif: 'chainHead', ringmailTunic: 'ringChest', plateHelm: 'plateHead', platemail: 'plateChest' };

function migrateArmour(s: any): any {
  const fixItems = (items: any[]) => items.map((i) => (OLD_ARMOUR[i.def] ? { ...i, def: OLD_ARMOUR[i.def] } : i));
  const fixInv = (inv: any) => (inv ? { ...inv, items: fixItems(inv.items ?? []) } : inv);
  const fixWant = (w: any) => (w && OLD_ARMOUR[w.wants] ? { ...w, wants: OLD_ARMOUR[w.wants] } : w);
  const fixEquip = (e: any) => {
    if (!e) return e;
    const { body, ...rest } = e;
    return body === undefined ? rest : { ...rest, chest: body };
  };
  return {
    ...s,
    version: 10,
    bank: fixInv(s.bank),
    wanderers: (s.wanderers ?? []).map(fixWant),
    contracts: (s.contracts ?? []).map(fixWant),
    contractOffers: (s.contractOffers ?? []).map(fixWant),
    chars: s.chars.map((c: any) => ({
      ...c,
      pack: fixInv(c.pack),
      equip: fixEquip(c.equip),
      corpse: c.corpse ? { ...c.corpse, pack: fixInv(c.corpse.pack), equip: fixEquip(c.corpse.equip) } : null,
    })),
  };
}

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
