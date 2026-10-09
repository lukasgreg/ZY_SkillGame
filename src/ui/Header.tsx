import { packWeight } from '../engine/character';
import { MAX_LEVEL, xpToNext } from '../engine/levels';
import { isPowerHour, maxHp, maxStamina, maxWeight } from '../engine/skills';
import type { Character } from '../engine/state';
import { num, t } from '../i18n';
import { Meter } from './common';

export function Header({ c }: { c: Character }) {
  const w = packWeight(c.pack);
  const mw = maxWeight(c);
  return (
    <header class="hud">
      <div class="hud-id">
        <h1>
          {c.name} <span class="lvl">{t('hud.level', { n: c.level })}</span>
        </h1>
        <p>
          {t(`race.${c.race}`)} · {t(`prof.${c.profession}`)} · {t(`loc.${c.location}`)}
        </p>
      </div>
      <div class="hud-bars">
        <div class="hud-bar" title={t('hud.xpTip', { xp: Math.floor(c.xp), next: xpToNext(c.level) })}>
          <span>{t('hud.xp')}</span>
          <Meter value={c.xp} max={c.level >= MAX_LEVEL ? 1 : xpToNext(c.level)} kind="xp" label={t('hud.xp')} />
          <b>{c.level >= MAX_LEVEL ? t('hud.maxLevel') : `${Math.floor((c.xp / xpToNext(c.level)) * 100)}%`}</b>
        </div>
        <div class="hud-bar">
          <span>{t('hud.hp')}</span>
          <Meter value={c.hp} max={maxHp(c)} kind="hp" label={t('hud.hp')} />
          <b>
            {Math.floor(c.hp)}/{maxHp(c)}
          </b>
        </div>
        <div class="hud-bar">
          <span>{t('hud.stamina')}</span>
          <Meter value={c.stamina} max={maxStamina(c)} kind="stamina" label={t('hud.stamina')} />
          <b>
            {Math.floor(c.stamina)}/{maxStamina(c)}
          </b>
        </div>
        <div class="hud-bar">
          <span>{t('hud.weight')}</span>
          <Meter value={w} max={mw} kind="weight" label={t('hud.weight')} />
          <b>
            {num(w)}/{num(mw)}
          </b>
        </div>
      </div>
      <div class="hud-gold">
        <span>{t('hud.gold')}</span>
        <b>{num(c.gold)}</b>
        {isPowerHour() && (
          <span class="powerhour" title={t('hud.powerhourTip')}>
            {t('hud.powerhour')}
          </span>
        )}
      </div>
    </header>
  );
}
