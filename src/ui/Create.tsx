import { useState } from 'preact/hooks';
import { PROFESSIONS, type ProfessionId, type RaceId } from '../data/professions';
import { SKILL_IDS, type StatId } from '../data/skills';
import { createCharacter, rollCharacter } from '../engine/character';
import { defaultRng } from '../engine/rng';
import { log } from '../engine/state';
import { skillNum, t } from '../i18n';
import { update } from './store';

const RACE_IDS: RaceId[] = ['human', 'elf', 'barbarian'];
const PROF_IDS: ProfessionId[] = ['craftsman', 'warrior', 'ranger'];
const STATS: StatId[] = ['str', 'dex', 'int'];

export function Create({ onCancel, onCreated }: { onCancel?: () => void; onCreated?: () => void }) {
  const [name, setName] = useState('');
  const [race, setRace] = useState<RaceId>('human');
  const [prof, setProf] = useState<ProfessionId>('craftsman');
  const [roll, setRoll] = useState(() => rollCharacter('human', 'craftsman', defaultRng));
  const [err, setErr] = useState(false);

  const reroll = (r = race, p = prof) => setRoll(rollCharacter(r, p, defaultRng));
  const pickRace = (r: RaceId) => {
    setRace(r);
    reroll(r, prof);
  };
  const pickProf = (p: ProfessionId) => {
    setProf(p);
    reroll(race, p);
  };

  const begin = (e: Event) => {
    e.preventDefault();
    const n = name.trim();
    if (!n) {
      setErr(true);
      return;
    }
    update((s) => {
      const c = createCharacter(s, n.slice(0, 24), race, prof, roll);
      log(s, 'log.welcome', { name: c.name }, 'sys');
    });
    onCreated?.();
  };

  const talents = SKILL_IDS.filter((id) => roll.skills[id] > 0).sort((a, b) => roll.skills[b] - roll.skills[a]);

  return (
    <form class="create" onSubmit={begin}>
      <header class="create-head">
        <h1>{t('create.title')}</h1>
        <p>{t('create.intro')}</p>
      </header>

      <div class="create-grid">
        <section class="card">
          <label class="field">
            <span class="field-label">{t('create.name')}</span>
            <input
              id="char-name"
              value={name}
              maxLength={24}
              placeholder={t('create.namePh')}
              onInput={(e) => {
                setName((e.target as HTMLInputElement).value);
                setErr(false);
              }}
            />
          </label>
          {err && <p class="error">{t('create.nameRequired')}</p>}

          <fieldset class="choice">
            <legend>{t('create.race')}</legend>
            {RACE_IDS.map((r) => (
              <label key={r} class={`choice-opt ${race === r ? 'on' : ''}`}>
                <input type="radio" name="race" checked={race === r} onChange={() => pickRace(r)} />
                <strong>{t(`race.${r}`)}</strong>
                <span>{t(`race.${r}.desc`)}</span>
              </label>
            ))}
          </fieldset>

          <fieldset class="choice">
            <legend>{t('create.profession')}</legend>
            {PROF_IDS.map((p) => (
              <label key={p} class={`choice-opt ${prof === p ? 'on' : ''}`}>
                <input type="radio" name="prof" checked={prof === p} onChange={() => pickProf(p)} />
                <strong>{t(`prof.${p}`)}</strong>
                <span>{t(`prof.${p}.desc`)}</span>
              </label>
            ))}
          </fieldset>
        </section>

        <section class="card">
          <h2 class="card-title">{t('create.rolled')}</h2>
          <table class="kv">
            <tbody>
              {STATS.map((s) => (
                <tr key={s}>
                  <th>{t(`stat.${s}`)}</th>
                  <td>{roll.stats[s]}</td>
                  <td class="muted">{t('char.max', { cap: PROFESSIONS[prof].statCaps[s] })}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <table class="kv">
            <tbody>
              {talents.map((id) => (
                <tr key={id}>
                  <th>{t(`skill.${id}`)}</th>
                  <td>{skillNum(roll.skills[id])}</td>
                  <td />
                </tr>
              ))}
            </tbody>
          </table>
          <div class="row">
            <button type="button" class="btn" onClick={() => reroll()}>
              {t('create.reroll')}
            </button>
            {onCancel && (
              <button type="button" class="btn" onClick={onCancel}>
                {t('create.cancel')}
              </button>
            )}
            <button type="submit" class="btn btn-primary">
              {t('create.begin')}
            </button>
          </div>
        </section>
      </div>
    </form>
  );
}
