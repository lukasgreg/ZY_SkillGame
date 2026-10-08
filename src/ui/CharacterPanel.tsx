import { PROFESSIONS, RACES } from '../data/professions';
import type { StatId } from '../data/skills';
import { maxWeight, totalStats } from '../engine/skills';
import type { Character } from '../engine/state';
import { num, t } from '../i18n';
import { Card, Meter } from './common';
import { Pack } from './Pack';

const STATS: StatId[] = ['str', 'dex', 'int'];

export function CharacterPanel({ c }: { c: Character }) {
  const caps = PROFESSIONS[c.profession].statCaps;
  const r = RACES[c.race].regen;
  return (
    <div class="grid-2">
      <Card title={t('char.stats')} note={t('char.statTotal', { t: totalStats(c) })}>
        <ul class="skills">
          {STATS.map((s) => (
            <li key={s}>
              <span />
              <span class="skill-name">{t(`stat.${s}`)}</span>
              <span class="skill-val">{c.stats[s]}</span>
              <span class="skill-cap muted">{t('char.max', { cap: caps[s] })}</span>
              <Meter value={c.stats[s]} max={caps[s]} kind="skill" />
            </li>
          ))}
        </ul>
        <p class="small">{t('char.maxWeight', { w: num(maxWeight(c), 1) })}</p>
        <p class="small">{t('char.regen', { hp: r.hp, st: r.stamina })}</p>
        <p class="muted small">
          {t(`race.${c.race}`)} · {t(`prof.${c.profession}`)}
        </p>
      </Card>
      <Pack c={c} />
    </div>
  );
}
