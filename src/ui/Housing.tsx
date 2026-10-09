import { useState } from 'preact/hooks';
import { DAY_MS, EVICT_DAYS, HOUSES, HOUSE_IDS, activeHouse, giveUpLease, rentHouse, type HouseId } from '../engine/housing';
import { log, type GameState } from '../engine/state';
import { getLang, num, t } from '../i18n';
import { Card } from './common';
import { update } from './store';

const when = (ms: number) => new Date(ms).toLocaleString(getLang() === 'cs' ? 'cs-CZ' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' });

function perks(id: HouseId): string {
  const d = HOUSES[id];
  const out = [t('house.perk.workers', { n: d.workerSlots }), t('house.perk.garden', { n: d.gardenPerHour }), t('house.perk.xp', { p: Math.round(d.xpBonus * 100) })];
  if (d.forge) out.push(t('house.perk.forge'));
  if (d.kennel) out.push(t('house.perk.kennel'));
  if (d.lab) out.push(t('house.perk.lab'));
  if (d.trophies) out.push(t('house.perk.trophies'));
  return out.join(' · ');
}

/** The town clerk's office: rent a house, move up, or give up the lease. */
export function HousingCard({ s }: { s: GameState }) {
  const [confirm, setConfirm] = useState(false);
  const house = s.house;
  const live = activeHouse(s);
  const unpaid = house && !live;
  return (
    <Card title={t('house.title')} note={t('house.note')}>
      {house ? (
        <div class="house-now">
          <p>
            <strong>{t(`house.${house.tier}`)}</strong> · {t('house.rentDay', { p: num(HOUSES[house.tier].rent) })}
          </p>
          {unpaid ? (
            <p class="warn small">{t('house.unpaid', { d: EVICT_DAYS, at: when(house.paidUntil + EVICT_DAYS * DAY_MS) })}</p>
          ) : (
            <p class="small muted">{t('house.paidUntil', { at: when(house.paidUntil) })}</p>
          )}
          <p class="small">{perks(house.tier)}</p>
        </div>
      ) : (
        <p class="muted small">{t('house.none')}</p>
      )}
      <table class="trade">
        <tbody>
          {HOUSE_IDS.map((id) => {
            const d = HOUSES[id];
            return (
              <tr key={id}>
                <th>
                  {t(`house.${id}`)}
                  <div class="small muted">{perks(id)}</div>
                </th>
                <td class="small muted">{t('house.rentDay', { p: num(d.rent) })}</td>
                <td class="actions">
                  <button
                    class="btn btn-small"
                    disabled={house?.tier === id || s.bank.gold < d.rent * 2}
                    onClick={() => update((st) => rentHouse(st, id) && log(st, 'log.house.rented', { house: `@house.${id}`, gold: d.rent * 2 }, 'gain'))}
                  >
                    {house?.tier === id ? t('house.yours') : t('house.rent', { p: num(d.rent * 2) })}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {house &&
        (confirm ? (
          <div class="row">
            <button class="btn btn-small btn-danger" onClick={() => (update((st) => giveUpLease(st)), setConfirm(false))}>
              {t('house.leaveYes')}
            </button>
            <button class="btn btn-small" onClick={() => setConfirm(false)}>
              {t('settings.cancel')}
            </button>
          </div>
        ) : (
          <button class="btn btn-small btn-quiet" onClick={() => setConfirm(true)}>
            {t('house.leave')}
          </button>
        ))}
    </Card>
  );
}
