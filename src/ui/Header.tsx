import { packWeight } from '../engine/character';
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
        <h1>{c.name}</h1>
        <p>
          {t(`race.${c.race}`)} · {t(`prof.${c.profession}`)} · {t(`loc.${c.location}`)}
        </p>
      </div>
      <div class="hud-bars">
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
