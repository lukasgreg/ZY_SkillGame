import { skillCap } from '../data/professions';
import { SKILLS, SKILL_IDS, type SkillCategory, type SkillId } from '../data/skills';
import { totalSkills } from '../engine/skills';
import type { Character, Lock } from '../engine/state';
import { num, skillNum, t } from '../i18n';
import { Card, Meter } from './common';
import { update } from './store';

const CATS: SkillCategory[] = ['gathering', 'crafting', 'combat', 'wilderness'];
const NEXT: Record<Lock, Lock> = { up: 'down', down: 'locked', locked: 'up' };
const GLYPH: Record<Lock, string> = { up: '▲', down: '▼', locked: '■' };

export function SkillsPanel({ c }: { c: Character }) {
  const cycle = (id: SkillId) => update(() => (c.locks[id] = NEXT[c.locks[id]]));
  return (
    <div class="stack">
      <Card title={t('skills.total', { t: num(totalSkills(c) / 10, 1) })} note={t('skills.note')}>
        <Meter value={totalSkills(c)} max={7000} kind="skill" />
      </Card>
      <div class="grid-2">
        {CATS.map((cat) => (
          <Card key={cat} title={t(`skillcat.${cat}`)}>
            <ul class="skills">
              {SKILL_IDS.filter((id) => SKILLS[id].category === cat).map((id) => {
                const cap = skillCap(c.profession, id);
                const lock = c.locks[id];
                return (
                  <li key={id} class={cap === 0 ? 'off' : ''}>
                    <button class={`lock lock-${lock}`} onClick={() => cycle(id)} title={t(`skills.lock.${lock}`)} aria-label={t(`skills.lock.${lock}`)}>
                      {GLYPH[lock]}
                    </button>
                    <span class="skill-name">{t(`skill.${id}`)}</span>
                    <span class="skill-val">{skillNum(c.skills[id])}</span>
                    <span class="skill-cap muted">{t('skills.cap', { cap: cap / 10 })}</span>
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
