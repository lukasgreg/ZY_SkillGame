import { useState } from 'preact/hooks';
import { getLang, t } from '../i18n';
import { cloud, connectWith, disconnect, downloadNow, keepLocal, uploadNow, usePending } from './cloudSync';
import { Card } from './common';
import { getState } from './store';

const TOKEN_URL = 'https://github.com/settings/personal-access-tokens/new';
const when = (ms: number) =>
  ms ? new Date(ms).toLocaleString(getLang() === 'cs' ? 'cs-CZ' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : '—';

/** Shown on every screen when the cloud holds a newer save than this device. */
export function CloudBanner() {
  const p = cloud.pending;
  if (!p) return null;
  const mine = getState();
  return (
    <div class="cloud-banner" role="alert">
      <p>
        <strong>{t('cloud.newerTitle')}</strong> {t('cloud.newerText', { cloud: when(p.editedAt ?? p.lastSeen), here: when(mine.editedAt ?? 0) })}
      </p>
      <p class="small">{t('cloud.newerChars', { names: p.chars.map((c) => c.name).join(', ') || '—' })}</p>
      <div class="row">
        <button class="btn btn-primary" onClick={usePending}>
          {t('cloud.useCloud')}
        </button>
        <button class="btn" onClick={() => void keepLocal()}>
          {t('cloud.keepLocal')}
        </button>
      </div>
    </div>
  );
}

export function CloudCard() {
  const [token, setToken] = useState('');
  const [confirm, setConfirm] = useState<'' | 'download' | 'disconnect'>('');
  const busy = cloud.status === 'checking' || cloud.status === 'uploading';
  return (
    <Card title={t('cloud.title')} note={t('cloud.note')}>
      {cloud.cfg ? (
        <>
          <p class="small">
            {t('cloud.connected', { login: cloud.cfg.login })} · <b>{t(`cloud.status.${cloud.status}`)}</b>
          </p>
          <p class="small muted">{t('cloud.lastUpload', { at: when(cloud.lastUpload) })}</p>
          {cloud.error && <p class="error small">{t(`cloud.error.${cloud.error}`)}</p>}
          <div class="row">
            <button class="btn" disabled={busy} onClick={() => void uploadNow(true)}>
              {t('cloud.upload')}
            </button>
            {confirm === 'download' ? (
              <>
                <button class="btn btn-danger" onClick={() => void downloadNow().then(() => setConfirm(''))}>
                  {t('cloud.downloadYes')}
                </button>
                <button class="btn" onClick={() => setConfirm('')}>
                  {t('settings.cancel')}
                </button>
              </>
            ) : (
              <button class="btn" disabled={busy} onClick={() => setConfirm('download')}>
                {t('cloud.download')}
              </button>
            )}
          </div>
          <div class="row">
            {confirm === 'disconnect' ? (
              <>
                <button class="btn btn-small btn-danger" onClick={() => (disconnect(), setConfirm(''))}>
                  {t('cloud.disconnectYes')}
                </button>
                <button class="btn btn-small" onClick={() => setConfirm('')}>
                  {t('settings.cancel')}
                </button>
              </>
            ) : (
              <button class="btn btn-small btn-quiet" onClick={() => setConfirm('disconnect')}>
                {t('cloud.disconnect')}
              </button>
            )}
          </div>
        </>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void connectWith(token).then((ok) => ok && setToken(''));
          }}
        >
          <ol class="how small">
            <li>
              {t('cloud.step1')}{' '}
              <a href={TOKEN_URL} target="_blank" rel="noopener">
                github.com/settings/personal-access-tokens
              </a>
            </li>
            <li>{t('cloud.step2')}</li>
            <li>{t('cloud.step3')}</li>
          </ol>
          <label class="field">
            <span class="field-label">{t('cloud.token')}</span>
            <input id="cloud-token" type="password" autocomplete="off" value={token} placeholder="github_pat_…" onInput={(e) => setToken((e.target as HTMLInputElement).value)} />
          </label>
          {cloud.error && <p class="error small">{t(`cloud.error.${cloud.error}`)}</p>}
          <button class="btn btn-primary" type="submit" disabled={!token.trim() || busy}>
            {busy ? t('cloud.status.checking') : t('cloud.connect')}
          </button>
          <p class="small muted">{t('cloud.privacy')}</p>
        </form>
      )}
    </Card>
  );
}
