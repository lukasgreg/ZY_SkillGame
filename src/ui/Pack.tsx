import { RESOURCES, type ResourceId } from '../data/resources';
import { packWeight } from '../engine/character';
import { maxWeight } from '../engine/skills';
import type { Character } from '../engine/state';
import { nameOf, num, t } from '../i18n';
import { drinkPotion, eatFood } from './actions';
import { POTIONS, isPotion } from '../data/potions';
import { Card } from './common';

export function Pack({ c }: { c: Character }) {
  const res = Object.entries(c.pack.res) as [ResourceId, number][];
  return (
    <Card title={t('pack.title')} note={t('pack.weight', { w: num(packWeight(c.pack), 1), max: num(maxWeight(c), 1) })}>
      {res.length === 0 && c.pack.items.length === 0 ? (
        <p class="muted">{t('pack.empty')}</p>
      ) : (
        <ul class="inv">
          {res.map(([id, n]) => (
            <li key={id}>
              {t(`res.${id}`)} <b>× {n}</b>
              <span class="muted small"> · {num(RESOURCES[id].weight * n, 1)}</span>
              {isPotion(id) && POTIONS[id]!.kind !== 'explosion' && (
                <button class="btn btn-small eat" onClick={() => drinkPotion(id)}>
                  {t('pack.drink')}
                </button>
              )}
              {RESOURCES[id].food && (
                <button class="btn btn-small eat" onClick={() => eatFood(id)} title={t('pack.eatTip', RESOURCES[id].food)}>
                  {t('pack.eat')}
                </button>
              )}
            </li>
          ))}
          {c.pack.items.map((i) => (
            <li key={i.uid}>
              {nameOf(i)}
              {i.uid === c.tool && <span class="muted small"> · {t('pack.inHand')}</span>}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
