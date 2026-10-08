import { RESOURCES, type ResourceId } from '../data/resources';
import { packWeight } from '../engine/character';
import { maxWeight } from '../engine/skills';
import type { Character } from '../engine/state';
import { nameOf, num, t } from '../i18n';
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
