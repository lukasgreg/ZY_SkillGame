import { ITEMS, type ItemDefId } from '../data/items';
import { type ResourceId } from '../data/resources';
import type { Character, GameState } from '../engine/state';
import { depositGold, npcRepairCost, sellPrice, withdraw, withdrawGold } from '../engine/town';
import { num, t } from '../i18n';
import { bankAll, buy, repair, sell, travel } from './actions';
import { Card, Durability } from './common';
import { Pack } from './Pack';
import { transient, update } from './store';

const SHOP: ItemDefId[] = ['pickaxe', 'shovel'];

export function TownPanel({ s, c }: { s: GameState; c: Character }) {
  const busy = transient.busy;
  if (c.location !== 'town') {
    return (
      <Card title={t('loc.town')}>
        <p>{t('town.notHere')}</p>
        <button class="btn btn-primary" disabled={!!busy} onClick={() => travel('town')}>
          {busy?.kind === 'travel' ? t('mine.walking') : t('mine.goTown')}
        </button>
      </Card>
    );
  }

  const sellable = Object.entries(c.pack.res) as [ResourceId, number][];
  const banked = Object.entries(s.bank.res) as [ResourceId, number][];
  const damaged = c.pack.items.filter((i) => i.dur < i.maxDur);

  return (
    <div class="grid-2">
      <div class="stack">
        <Card title={t('town.trader')} note={t('town.traderNote')}>
          {sellable.length === 0 ? (
            <p class="muted">{t('town.nothingToSell')}</p>
          ) : (
            <table class="trade">
              <tbody>
                {sellable.map(([id, n]) => (
                  <tr key={id}>
                    <th>
                      {t(`res.${id}`)} <span class="muted">× {n}</span>
                    </th>
                    <td class="muted">{t('town.each', { p: num(sellPrice(s, id), 1) })}</td>
                    <td class="actions">
                      <button class="btn btn-small" onClick={() => sell(id, 1)}>
                        {t('town.sell1')}
                      </button>
                      <button class="btn btn-small" onClick={() => sell(id, n)}>
                        {t('town.sellAll')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        <Card title={t('town.provisioner')}>
          <table class="trade">
            <tbody>
              {SHOP.map((id) => (
                <tr key={id}>
                  <th>{t(`item.${id}`)}</th>
                  <td class="muted">
                    {ITEMS[id].maxDur} · ×{num(1 / ITEMS[id].speed, 2)}
                  </td>
                  <td class="actions">
                    <button class="btn btn-small" disabled={c.gold < ITEMS[id].price} onClick={() => buy(id)}>
                      {t('town.buy', { p: ITEMS[id].price })}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card title={t('town.smith')} note={t('town.smithNote')}>
          {damaged.length === 0 ? (
            <p class="muted">{t('town.nothingToRepair')}</p>
          ) : (
            damaged.map((i) => (
              <div class="tool alt" key={i.uid}>
                <span>{t(`item.${i.def}`)}</span>
                <Durability it={i} />
                {i.maxDur <= 6 ? (
                  <span class="muted small">{t('town.cantRepair')}</span>
                ) : (
                  <button class="btn btn-small" disabled={c.gold < npcRepairCost(i)} onClick={() => repair(i)}>
                    {t('town.repair', { p: npcRepairCost(i) })}
                  </button>
                )}
              </div>
            ))
          )}
        </Card>
      </div>

      <div class="stack">
        <Card title={t('town.bank')} note={t('town.bankNote')}>
          <div class="row">
            <button class="btn" disabled={sellable.length === 0} onClick={bankAll}>
              {t('town.depositAll')}
            </button>
          </div>
          {banked.length === 0 ? (
            <p class="muted">{t('town.bankEmpty')}</p>
          ) : (
            <table class="trade">
              <tbody>
                {banked.map(([id, n]) => (
                  <tr key={id}>
                    <th>{t(`res.${id}`)}</th>
                    <td>× {n}</td>
                    <td class="actions">
                      <button class="btn btn-small" onClick={() => update((st) => withdraw(st, c, id, n))}>
                        {t('town.withdrawAll')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div class="row gold-row">
            <span>
              {t('town.gold')}: <b>{num(s.bank.gold)}</b>
            </span>
            <button class="btn btn-small" disabled={c.gold <= 0} onClick={() => update((st) => depositGold(st, c, c.gold))}>
              {t('town.depositGold')}
            </button>
            <button class="btn btn-small" disabled={s.bank.gold <= 0} onClick={() => update((st) => withdrawGold(st, c, st.bank.gold))}>
              {t('town.withdrawGold')}
            </button>
          </div>
        </Card>
        <Pack c={c} />
        <button class="btn btn-primary" disabled={!!busy} onClick={() => travel('mine')}>
          {busy?.kind === 'travel' ? t('mine.walking') : t('mine.goMine')}
        </button>
      </div>
    </div>
  );
}
