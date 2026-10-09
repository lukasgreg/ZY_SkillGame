import { skillCap } from '../data/professions';
import { CAP_LEVEL, effectiveCap } from '../engine/levels';
import { SKILLS, SKILL_IDS, type SkillCategory, type SkillId } from '../data/skills';
import { totalSkills } from '../engine/skills';
import { log, type Character, type Lock } from '../engine/state';
import { TRAIN_LIMIT, canTrainSkill, trainSkill, trainSkillCost } from '../engine/town';
import { num, skillNum, t } from '../i18n';
import { Card, Meter } from './common';
import { update } from './store';

function trainOne(id: SkillId): void {
  update((s) => {
    const c = s.chars.find((x) => x.id === s.active);
    if (c && trainSkill(c, id)) log(s, 'log.trained', { skill: `@skill.${id}`, value: `#${c.skills[id] / 10}` }, 'gain');
  });
}

const CATS: SkillCategory[] = ['gathering', 'crafting', 'combat', 'wilderness'];
const NEXT: Record<Lock, Lock> = { up: 'down', down: 'locked', locked: 'up' };
const GLYPH: Record<Lock, string> = { up: '▲', down: '▼', locked: '■' };

export function SkillsPanel({ c }: { c: Character }) {
  const cycle = (id: SkillId) => update(() => (c.locks[id] = NEXT[c.locks[id]]));
  return (
    <div class="stack">
      <Card title={t('skills.total', { t: num(totalSkills(c) / 10, 1) })} note={t('skills.note')}>
        {c.location === 'town' && <p class="small">{t('skills.trainers', { g: num(c.gold) })}</p>}
        <Meter value={totalSkills(c)} max={7000} kind="skill" />
      </Card>
      <div class="grid-2">
        {CATS.map((cat) => (
          <Card key={cat} title={t(`skillcat.${cat}`)}>
            <ul class="skills">
              {SKILL_IDS.filter((id) => SKILLS[id].category === cat).map((id) => {
                const cap = effectiveCap(c, id);
                const full = skillCap(c.profession, id);
                const lock = c.locks[id];
                return (
                  <li key={id} class={full === 0 ? 'off' : ''} title={cap < full ? t('skills.capLater', { cap: full / 10, l: CAP_LEVEL }) : undefined}>
                    <button class={`lock lock-${lock}`} onClick={() => cycle(id)} title={t(`skills.lock.${lock}`)} aria-label={t(`skills.lock.${lock}`)}>
                      {GLYPH[lock]}
                    </button>
                    <span class="skill-name">{t(`skill.${id}`)}</span>
                    <span class="skill-val">{skillNum(c.skills[id])}</span>
                    <span class="skill-cap muted">
                      {c.location === 'town' && c.skills[id] < Math.min(TRAIN_LIMIT, cap) ? (
                        <button class="btn btn-small train" disabled={!canTrainSkill(c, id)} onClick={() => trainOne(id)} title={t('skills.trainTip')}>
                          {t('skills.train', { p: trainSkillCost(c, id) })}
                        </button>
                      ) : (
                        t('skills.cap', { cap: cap / 10 })
                      )}
                    </span>
                    <Meter value={c.skills[id]} max={1000} kind="skill" />
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
