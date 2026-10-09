import { ACHIEVEMENTS, type AchievementGroup } from '../engine/achievements';
import type { GameState } from '../engine/state';
import { getLang, num, t } from '../i18n';
import { Card } from './common';
import { transient } from './store';

const GROUPS: AchievementGroup[] = ['work', 'skill', 'craft', 'trade', 'adventure', 'wild'];

export function AchievementsPanel({ s }: { s: GameState }) {
  const earned = ACHIEVEMENTS.filter((a) => s.achievements[a.id]).length;
  const date = (ms: number) => new Date(ms).toLocaleDateString(getLang() === 'cs' ? 'cs-CZ' : 'en-GB');
  const st = s.stats;
  return (
    <div class="stack">
      <Card title={t('ach.title', { n: earned, max: ACHIEVEMENTS.length })} note={t('ach.note')}>
        <dl class="statgrid small">
          <div><dt>{t('ach.stat.pulls')}</dt><dd>{num(st.pulls)}</dd></div>
          <div><dt>{t('ach.stat.crafts')}</dt><dd>{num(st.crafts)}</dd></div>
          <div><dt>{t('ach.stat.exceptional')}</dt><dd>{num(st.exceptional)}</dd></div>
          <div><dt>{t('ach.stat.sales')}</dt><dd>{num(st.sales)}</dd></div>
          <div><dt>{t('ach.stat.goldEarned')}</dt><dd>{num(st.goldEarned)}</dd></div>
          <div><dt>{t('ach.stat.kills')}</dt><dd>{num(st.kills)}</dd></div>
          <div><dt>{t('ach.stat.bosses')}</dt><dd>{num(st.bosses)}</dd></div>
          <div><dt>{t('ach.stat.deaths')}</dt><dd>{num(st.deaths)}</dd></div>
        </dl>
      </Card>
      <div class="grid-2">
        {GROUPS.map((g) => (
          <Card key={g} title={t(`ach.group.${g}`)}>
            <ul class="achs">
              {ACHIEVEMENTS.filter((a) => a.group === g).map((a) => {
                const at = s.achievements[a.id];
                const hidden = a.secret && !at;
                return (
                  <li key={a.id} class={at ? 'got' : ''}>
                    <span class="ach-mark" aria-hidden="true">
                      {at ? '★' : '☆'}
                    </span>
                    <div>
                      <strong>{hidden ? '???' : t(`ach.${a.id}`)}</strong>
                      <div class="small muted">{hidden ? t('ach.secret') : t(`ach.${a.id}.desc`)}</div>
                    </div>
                    {at && <span class="small muted">{date(at)}</span>}
                  </li>
                );
              })}
            </ul>
          </Card>
        ))}
      </div>
    </div>
  );
}

/** Banner for freshly earned achievements. */
export function AchievementToast() {
  const tt = transient.toast;
  if (!tt) return null;
  return (
    <div class="toast" role="status" key={tt.id}>
      <span class="ach-mark">★</span>
      <div>
        <div class="toast-head">{t('ach.unlocked')}</div>
        {tt.ids.map((id) => (
          <strong key={id}>{t(`ach.${id}`)}</strong>
        ))}
      </div>
    </div>
  );
}
