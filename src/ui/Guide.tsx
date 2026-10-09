import { GUIDE, guideDone } from '../engine/guide';
import type { Character, GameState } from '../engine/state';
import { t } from '../i18n';
import { claimGuideStep, hideGuide } from './actions';
import { Card } from './common';

/** The beginner's guide: the next few goals, with a reward to claim for each. */
export function Guide({ s, c }: { s: GameState; c: Character }) {
  const done = guideDone(s);
  if (s.guideHidden || done.length >= GUIDE.length) return null;
  const open = GUIDE.filter((g) => !done.includes(g.id)).slice(0, 3);
  return (
    <Card class="guide" title={t('guide.title', { n: done.length, max: GUIDE.length })}>
      <ul class="guide-steps">
        {open.map((g) => {
          const ready = g.done(s, c);
          return (
            <li key={g.id} class={ready ? 'ready' : ''}>
              <span>
                <strong>{t(`guide.${g.id}`)}</strong> <span class="small muted">{t(`guide.${g.id}.how`)}</span>
              </span>
              {ready ? (
                <button class="btn btn-small btn-primary" onClick={() => claimGuideStep(g.id)}>
                  {t('guide.claim', { g: g.gold, xp: g.xp })}
                </button>
              ) : (
                <span class="small muted">{t('guide.reward', { g: g.gold, xp: g.xp })}</span>
              )}
            </li>
          );
        })}
      </ul>
      <button class="btn btn-quiet btn-small" onClick={hideGuide}>
        {t('guide.hide')}
      </button>
    </Card>
  );
}
