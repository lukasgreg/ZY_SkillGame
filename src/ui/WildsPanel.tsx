import { TAMEABLE, WILD_AREAS } from '../data/dungeons';
import { canControl, maxSlots, tameChance, usedSlots, wildAreaOpen } from '../engine/pets';
import type { Character, GameState } from '../engine/state';
import { num, t } from '../i18n';
import { letQuarryGo, setWildsArea, tameQuarry, trackAnimals, travel } from './actions';
import { Card, JournalLines } from './common';
import { Stable } from './Stable';
import { transient } from './store';

/** Calming words spoken while taming, one every two seconds. */
export const TAME_PHRASES = 5;

export function WildsPanel({ s, c }: { s: GameState; c: Character }) {
  const busy = transient.busy;
  const q = c.quarry;
  const tame = q ? TAMEABLE[q] : undefined;
  return (
    <div class="grid-2">
      <div class="stack">
        <nav class="levels" aria-label={t('loc.wilds')}>
          {WILD_AREAS.map((a) => (
            <button key={a.id} class={`chip ${c.wildsArea === a.id ? 'on' : ''}`} disabled={!wildAreaOpen(c, a.id) || !!busy} onClick={() => setWildsArea(a.id)}>
              <b>{t(`wilds.area.${a.id}`)}</b>
              <span>
                {t('skill.tracking')} {a.need}+
              </span>
            </button>
          ))}
        </nav>
        <Card class="node" title={t(`wilds.area.${c.wildsArea}`)}>
          <p class="small muted">{t('wilds.note', { n: usedSlots(c), max: maxSlots(c) })}</p>
          {q ? (
            <div class="quarry">
              <div class="node-name">{t(`mon.${q}`)}</div>
              <div class="node-sub">
                {t('wilds.needs', { skill: tame!.min, slots: tame!.slots })} · {t('wilds.chance', { p: Math.round(tameChance(c, q) * 100) })}
              </div>
              {tame!.fierce && <div class="small warn">{t('wilds.fierce')}</div>}
              {busy?.kind === 'tame' && (
                <>
                  <div class="workbar">
                    <div class="workbar-track">
                      <span key={busy.start} style={{ animationDuration: `${busy.dur}ms` }} />
                    </div>
                  </div>
                  <p class="phrase">“{t(`wilds.phrase.${transient.phrase % TAME_PHRASES}`)}”</p>
                </>
              )}
              <div class="row center">
                <button class="btn btn-primary btn-big" disabled={!!busy || !canControl(c, q)} onClick={tameQuarry}>
                  {busy?.kind === 'tame' ? t('wilds.taming') : t('wilds.tame')}
                </button>
                <button class="btn" disabled={!!busy} onClick={letQuarryGo}>
                  {t('wilds.letGo')}
                </button>
              </div>
              {!canControl(c, q) && <p class="warn small">{t('wilds.noSlots')}</p>}
            </div>
          ) : (
            <p class="node-sub">{t('wilds.nothing')}</p>
          )}
          <div class="row center">
            <button class="btn" disabled={!!busy} onClick={trackAnimals}>
              {busy?.kind === 'search' ? t('wilds.tracking') : t('wilds.track')}
            </button>
          </div>
          <p class="muted small">
            {t('skill.tracking')} {num(c.skills.tracking / 10, 1)} · {t('skill.taming')} {num(c.skills.taming / 10, 1)}
          </p>
          <button class="btn btn-quiet" disabled={!!busy} onClick={() => travel('town')}>
            {busy?.kind === 'travel' ? t('mine.walking') : t('mine.goTown')}
          </button>
        </Card>
      </div>
      <div class="stack">
        <Stable c={c} />
        <Card title={t('mine.recent')}>
          <JournalLines entries={s.journal} limit={8} />
        </Card>
      </div>
    </div>
  );
}
