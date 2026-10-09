import { deserialize, serialize } from './save';
import type { GameState } from './state';

/**
 * Cloud save in a secret GitHub Gist. The game is a static site, so the browser talks to the
 * GitHub API directly with a token the player creates (Gists read/write only).
 */
export const GIST_FILE = 'ardenhal-save.json';
const GIST_DESC = 'Ardenhal save game (https://lukasgreg.github.io/ZY_SkillGame/)';
const API = 'https://api.github.com';

export interface CloudConfig {
  token: string;
  gistId: string;
  login: string;
}

export type Fetch = typeof fetch;

export class CloudError extends Error {
  constructor(public kind: 'auth' | 'notFound' | 'network' | 'badSave', message: string) {
    super(message);
  }
}

async function call<T>(f: Fetch, token: string, path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await f(`${API}${path}`, {
      ...init,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      },
    });
  } catch (e) {
    throw new CloudError('network', String(e));
  }
  if (res.status === 401 || res.status === 403) throw new CloudError('auth', `GitHub said ${res.status}`);
  if (res.status === 404) throw new CloudError('notFound', 'Not found');
  if (!res.ok) throw new CloudError('network', `GitHub said ${res.status}`);
  return (await res.json()) as T;
}

interface GistFile {
  content?: string;
  truncated?: boolean;
  raw_url?: string;
}
interface Gist {
  id: string;
  files: Record<string, GistFile>;
}

/** Checks the token, then finds the player's save gist or creates one with the current save. */
export async function connect(f: Fetch, token: string, s: GameState): Promise<CloudConfig> {
  const user = await call<{ login: string }>(f, token, '/user');
  const gists = await call<Gist[]>(f, token, '/gists?per_page=100');
  const found = gists.find((g) => GIST_FILE in g.files);
  if (found) return { token, gistId: found.id, login: user.login };
  const made = await call<Gist>(f, token, '/gists', {
    method: 'POST',
    body: JSON.stringify({ description: GIST_DESC, public: false, files: { [GIST_FILE]: { content: serialize(s) } } }),
  });
  return { token, gistId: made.id, login: user.login };
}

/** Downloads the cloud save, or null if the gist has no save yet. */
export async function download(f: Fetch, cfg: CloudConfig): Promise<GameState | null> {
  const g = await call<Gist>(f, cfg.token, `/gists/${cfg.gistId}`);
  const file = g.files[GIST_FILE];
  if (!file) return null;
  let text = file.content ?? '';
  if (file.truncated && file.raw_url) {
    try {
      text = await (await f(file.raw_url)).text();
    } catch (e) {
      throw new CloudError('network', String(e));
    }
  }
  try {
    return deserialize(text);
  } catch {
    throw new CloudError('badSave', 'The cloud file is not a valid save.');
  }
}

export async function upload(f: Fetch, cfg: CloudConfig, s: GameState): Promise<void> {
  await call<Gist>(f, cfg.token, `/gists/${cfg.gistId}`, {
    method: 'PATCH',
    body: JSON.stringify({ files: { [GIST_FILE]: { content: serialize(s) } } }),
  });
}

/**
 * Which copy to keep: the one the player last touched. A fresh, empty game never beats a cloud
 * save. Background ticks don't count, so merely opening an old device can't make it look newer.
 */
export function newer(local: GameState, cloud: GameState | null): 'local' | 'cloud' | 'same' {
  if (!cloud) return 'local';
  if (!local.chars.length && cloud.chars.length) return 'cloud';
  const d = (cloud.editedAt ?? 0) - (local.editedAt ?? 0);
  if (Math.abs(d) < 5000) return 'same';
  return d > 0 ? 'cloud' : 'local';
}
