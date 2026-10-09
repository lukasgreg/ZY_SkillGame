import { CloudError, connect, download, newer, upload, type CloudConfig } from '../engine/cloud';
import { saveLocal } from '../engine/save';
import type { GameState } from '../engine/state';
import { getState, replaceState, touch } from './store';

const KEY = 'zy-cloud';
const AUTO_MS = 2 * 60_000;

export type CloudStatus = 'off' | 'checking' | 'synced' | 'uploading' | 'error' | 'conflict';

/** UI-facing cloud state (not part of the save). */
export const cloud = {
  cfg: null as CloudConfig | null,
  status: 'off' as CloudStatus,
  error: '' as '' | CloudError['kind'],
  lastUpload: 0,
  /** A newer save found in the cloud, waiting for the player to choose. */
  pending: null as GameState | null,
  /** Auto-upload stays off until the startup check has run, so an old device can't overwrite a newer cloud save. */
  checked: false,
};

function readCfg(): CloudConfig | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as CloudConfig) : null;
  } catch {
    return null;
  }
}

function writeCfg(cfg: CloudConfig | null): void {
  try {
    if (cfg) localStorage.setItem(KEY, JSON.stringify(cfg));
    else localStorage.removeItem(KEY);
  } catch {
    /* storage blocked: the connection lasts for this visit only */
  }
}

function fail(e: unknown): void {
  cloud.status = 'error';
  cloud.error = e instanceof CloudError ? e.kind : 'network';
  touch();
}

let lastUploaded = '';

export async function uploadNow(force = false): Promise<void> {
  if (!cloud.cfg || (!cloud.checked && !force)) return;
  const s = getState();
  saveLocal(s);
  const snapshot = JSON.stringify(s);
  if (!force && snapshot === lastUploaded) return;
  cloud.status = 'uploading';
  touch();
  try {
    await upload(fetch, cloud.cfg, s);
    lastUploaded = snapshot;
    cloud.lastUpload = Date.now();
    cloud.status = 'synced';
    cloud.error = '';
    cloud.checked = true;
  } catch (e) {
    fail(e);
    return;
  }
  touch();
}

/** Startup check: load nothing silently; if the cloud is newer, ask; if this device is newer, upload. */
let checking = false;

export async function check(): Promise<void> {
  if (!cloud.cfg || cloud.pending || checking) return;
  checking = true;
  cloud.status = 'checking';
  touch();
  try {
    const remote = await download(fetch, cloud.cfg);
    const which = newer(getState(), remote);
    if (which === 'cloud') {
      cloud.pending = remote;
      cloud.status = 'conflict';
    } else {
      cloud.checked = true;
      cloud.status = 'synced';
      if (which === 'local') await uploadNow();
    }
    cloud.error = '';
  } catch (e) {
    fail(e);
  }
  checking = false;
  touch();
}

export function usePending(): void {
  if (!cloud.pending) return;
  replaceState(cloud.pending);
  cloud.pending = null;
  cloud.checked = true;
  cloud.status = 'synced';
  lastUploaded = JSON.stringify(getState());
  touch();
}

export async function keepLocal(): Promise<void> {
  cloud.pending = null;
  cloud.checked = true;
  await uploadNow(true);
}

export async function connectWith(token: string): Promise<boolean> {
  cloud.status = 'checking';
  cloud.error = '';
  touch();
  try {
    cloud.cfg = await connect(fetch, token.trim(), getState());
    writeCfg(cloud.cfg);
  } catch (e) {
    cloud.cfg = null;
    fail(e);
    return false;
  }
  await check();
  return true;
}

export function disconnect(): void {
  cloud.cfg = null;
  cloud.status = 'off';
  cloud.pending = null;
  cloud.checked = false;
  writeCfg(null);
  touch();
}

/** Loads the cloud copy on request (Settings → Download). */
export async function downloadNow(): Promise<void> {
  if (!cloud.cfg) return;
  try {
    const remote = await download(fetch, cloud.cfg);
    if (remote) {
      cloud.pending = remote;
      usePending();
    }
  } catch (e) {
    fail(e);
  }
}

export function startCloud(): void {
  cloud.cfg = readCfg();
  if (!cloud.cfg) return;
  void check();
  window.setInterval(() => void uploadNow(), AUTO_MS);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void uploadNow();
    else void check();
  });
}
