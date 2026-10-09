import { useState } from 'preact/hooks';
import { clearLocal, exportSave, importSave } from '../engine/save';
import { log, newGameState, type GameState } from '../engine/state';
import { setLang, skillNum, t, type Lang } from '../i18n';
import { CloudCard } from './Cloud';
import { Card } from './common';
import { replaceState, update } from './store';

export function SettingsPanel({ s, onNewChar }: { s: GameState; onNewChar: () => void }) {
  const [exported, setExported] = useState('');
  const [copied, setCopied] = useState(false);
  const [importText, setImportText] = useState('');
  const [importMsg, setImportMsg] = useState<'' | 'ok' | 'bad'>('');
  const [confirmReset, setConfirmReset] = useState(false);

  const chooseLang = (l: Lang) =>
    update((st) => {
      st.settings.lang = l;
      setLang(l);
    });

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(exported);
      setCopied(true);
    } catch {
      (document.getElementById('export-text') as HTMLTextAreaElement | null)?.select();
    }
  };

  const doImport = () => {
    try {
      const next = importSave(importText);
      log(next, 'log.imported', undefined, 'sys');
      replaceState(next);
      setImportMsg('ok');
      setImportText('');
    } catch {
      setImportMsg('bad');
    }
  };

  return (
    <div class="grid-2">
      <div class="stack">
        <Card title={t('settings.language')}>
          <div class="row">
            {(['en', 'cs'] as Lang[]).map((l) => (
              <button key={l} class={`chip ${s.settings.lang === l ? 'on' : ''}`} onClick={() => chooseLang(l)}>
                <b>{l === 'en' ? 'English' : 'Čeština'}</b>
              </button>
            ))}
          </div>
        </Card>

        <Card title={t('settings.chars')}>
          <ul class="chars">
            {s.chars.map((c) => (
              <li key={c.id}>
                <span>
                  <b>{c.name}</b>{' '}
                  <span class="muted small">
                    {t(`race.${c.race}`)} · {t(`prof.${c.profession}`)} · {t('skill.mining')} {skillNum(c.skills.mining)}
                  </span>
                </span>
                {s.active === c.id ? (
                  <span class="muted small">{t('settings.active')}</span>
                ) : (
                  <button class="btn btn-small" onClick={() => update((st) => (st.active = c.id))}>
                    {t('settings.play')}
                  </button>
                )}
              </li>
            ))}
          </ul>
          <button class="btn" onClick={onNewChar}>
            {t('settings.newChar')}
          </button>
        </Card>

        <p class="muted small">{t('settings.credits')}</p>
      </div>

      <div class="stack">
        <CloudCard />
        <Card title={t('settings.save')} note={t('settings.saveNote')}>
          <div class="row">
            <button
              class="btn"
              onClick={() => {
                setExported(exportSave(s));
                setCopied(false);
              }}
            >
              {t('settings.export')}
            </button>
            {exported && (
              <button class="btn" onClick={copy}>
                {copied ? t('settings.copied') : t('settings.copy')}
              </button>
            )}
          </div>
          {exported && <textarea id="export-text" class="code" readOnly rows={4} value={exported} onFocus={(e) => (e.target as HTMLTextAreaElement).select()} />}

          <label class="field">
            <span class="field-label">{t('settings.import')}</span>
            <textarea
              id="import-text"
              class="code"
              rows={3}
              placeholder={t('settings.importPh')}
              value={importText}
              onInput={(e) => {
                setImportText((e.target as HTMLTextAreaElement).value);
                setImportMsg('');
              }}
            />
          </label>
          <button class="btn" disabled={!importText.trim()} onClick={doImport}>
            {t('settings.importBtn')}
          </button>
          {importMsg === 'ok' && <p class="good">{t('settings.importOk')}</p>}
          {importMsg === 'bad' && <p class="error">{t('settings.importBad')}</p>}
        </Card>

        <Card>
          {confirmReset ? (
            <>
              <p class="error">{t('settings.resetConfirm')}</p>
              <div class="row">
                <button
                  class="btn btn-danger"
                  onClick={() => {
                    clearLocal();
                    replaceState(newGameState(s.settings.lang));
                    setConfirmReset(false);
                  }}
                >
                  {t('settings.resetYes')}
                </button>
                <button class="btn" onClick={() => setConfirmReset(false)}>
                  {t('settings.cancel')}
                </button>
              </div>
            </>
          ) : (
            <button class="btn btn-danger" onClick={() => setConfirmReset(true)}>
              {t('settings.reset')}
            </button>
          )}
        </Card>
      </div>
    </div>
  );
}
