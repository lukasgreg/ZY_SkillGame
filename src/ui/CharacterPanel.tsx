import { PROFESSIONS, RACES } from '../data/professions';
import type { StatId } from '../data/skills';
import { maxWeight, totalStats } from '../engine/skills';
import type { Character } from '../engine/state';
import { nameOf, num, t } from '../i18n';
import { slotOf, type Slot } from '../data/items';
import { armorValue, equipped, weaponInfo } from '../engine/combat';

import { takeOff, wear } from './actions';
import { Card, Durability, Meter } from './common';
import { Pack } from './Pack';

const SLOTS: Slot[] = ['weapon', 'shield', 'head', 'body'];

function Equipment({ c }: { c: Character }) {
  const worn = Object.values(c.equip);
  const wearable = c.pack.items.filter((i) => slotOf(i.def) && !worn.includes(i.uid));
  const w = weaponInfo(c);
  return (
    <Card title={t('char.equipment')} note={t('char.equipNote', { skill: t(`skill.${w.skill}`), a: num(armorValue(c), 1) })}>
      <ul class="slots">
        {SLOTS.map((sl) => {
          const it = equipped(c, sl);
          return (
            <li key={sl}>
              <span class="muted small">{t(`slot.${sl}`)}</span>
              {it ? (
                <>
                  <strong>{nameOf(it)}</strong>
                  <Durability it={it} />
                  <button class="btn btn-small" onClick={() => takeOff(sl)}>
                    {t('char.takeOff')}
                  </button>
                </>
              ) : (
                <span class="muted">{sl === 'weapon' ? t('char.fists') : '—'}</span>
              )}
            </li>
          );
        })}
      </ul>
      {wearable.length > 0 && (
        <>
          <h3 class="sub">{t('char.inPack')}</h3>
          {wearable.map((i) => (
            <div class="row tight" key={i.uid}>
              <span class="small">{nameOf(i)}</span>
              <button class="btn btn-small" onClick={() => wear(i.uid)}>
                {t('char.wear')}
              </button>
            </div>
          ))}
        </>
      )}
    </Card>
  );
}

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
      <div class="stack">
        <Equipment c={c} />
        <Pack c={c} />
      </div>
    </div>
  );
}
