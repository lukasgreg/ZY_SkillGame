import { ITEMS, METALS, type ItemDefId } from '../data/items';
import { type ResourceId } from '../data/resources';
import type { Character, GameState } from '../engine/state';
import { buyResPrice, depositGold, npcRepairCost, sellPrice, withdraw, withdrawGold } from '../engine/town';
import { matchingItems, smithBuyPrice, wandererPays } from '../engine/wanderers';
import { itemName, nameOf, num, t } from '../i18n';
import { bankAll, buy, buyResource, deliver, repair, sell, sellToSmith, sellWanderer, travel } from './actions';
import { Card, Durability } from './common';
import { ContractBoard } from './Contracts';
import { Pack } from './Pack';
import { transient, update } from './store';

const SHOP: ItemDefId[] = ['pickaxe', 'shovel', 'hatchet', 'fishingRod', 'hoe', 'smithHammer', 'tinkerTools', 'saw', 'carvingKnife', 'skillet', 'sewingKit'];
const GOODS: [ResourceId, number][] = [['log', 5], ['bandage', 10], ['arrow', 20], ['flax', 5]];

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

  const now = Date.now();
  const worn = Object.values(c.equip);
  const crafted = c.pack.items.filter((i) => (ITEMS[i.def].kind !== 'tool' || i.uid !== c.tool) && !worn.includes(i.uid));

  return (
    <div class="grid-2">
      <div class="stack">
        <Card title={t('town.wanderers')} note={t('town.wanderersNote')}>
          <p class="small muted">{t('town.reputation', { n: s.reputation })}</p>
          {s.wanderers.length === 0 ? (
            <p class="muted">{t('town.noWanderers')}</p>
          ) : (
            <ul class="wanderers">
              {s.wanderers.map((w) => {
                const leaves = (
                  <span class="muted small">{t('town.leaves', { min: Math.max(1, Math.round((w.leavesAt - now) / 60000)) })}</span>
                );
                if (w.wantsRes) {
                  const have = c.pack.res[w.wantsRes.id] ?? 0;
                  return (
                    <li key={w.id}>
                      <div>
                        {t('town.wants', { name: w.name, kind: t(`wanderer.${w.kind}`), item: '' })}
                        <strong>
                          {w.wantsRes.n}× {t(`res.${w.wantsRes.id}`)}
                        </strong>
                      </div>
                      <div class="wanderer-foot">
                        <b>{t('town.offer', { gold: w.offer })}</b>
                        {leaves}
                      </div>
                      <div class="row tight">
                        <span class="small muted">{t('town.youHave', { n: have })}</span>
                        <button class="btn btn-small btn-primary" disabled={have < w.wantsRes.n} onClick={() => deliver(w)}>
                          {t('town.deliver')}
                        </button>
                      </div>
                    </li>
                  );
                }
                const fits = matchingItems(c, w);
                return (
                  <li key={w.id}>
                    <div>
                      {t('town.wants', { name: w.name, kind: t(`wanderer.${w.kind}`), item: '' })}
                      <strong>{itemName(w.wants!)}</strong>
                    </div>
                    <div class="req small">
                      {w.minMat && <span>{t('town.reqMetal', { metal: t(`res.${METALS[w.minMat].bar}`) })}</span>}
                      {w.exceptional && <span>{t('town.reqExc')}</span>}
                      <span>{t('town.reqCond')}</span>
                    </div>
                    <div class="wanderer-foot">
                      <b>{t('town.offer', { gold: w.offer })}</b>
                      {leaves}
                    </div>
                    {fits.length === 0 ? (
                      <p class="muted small">{t('town.noMatch')}</p>
                    ) : (
                      fits.map((it) => (
                        <div class="row tight" key={it.uid}>
                          <span class="small">{nameOf(it)}</span>
                          <button class="btn btn-small btn-primary" onClick={() => sellWanderer(w, it)}>
                            {t('town.smithBuy', { p: wandererPays(w, it) })}
                          </button>
                        </div>
                      ))
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

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
                  <th>{itemName(id)}</th>
                  <td class="muted small">{t(`skill.${ITEMS[id].toolFor}`)}</td>
                  <td class="actions">
                    <button class="btn btn-small" disabled={c.gold < ITEMS[id].price} onClick={() => buy(id)}>
                      {t('town.buy', { p: ITEMS[id].price })}
                    </button>
                  </td>
                </tr>
              ))}
              {GOODS.map(([id, n]) => (
                <tr key={id}>
                  <th>{t(`res.${id}`)}</th>
                  <td />
                  <td class="actions">
                    <button class="btn btn-small" disabled={c.gold < buyResPrice(id) * n} onClick={() => buyResource(id, n)}>
                      {t('town.buyN', { n, p: buyResPrice(id) * n })}
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
                <span>{nameOf(i)}</span>
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
          {crafted.length > 0 && (
            <>
              <p class="card-note">{t('town.smithBuys')}</p>
              {crafted.map((i) => (
                <div class="tool alt" key={`b${i.uid}`}>
                  <span>{nameOf(i)}</span>
                  <Durability it={i} />
                  <button class="btn btn-small" onClick={() => sellToSmith(i)}>
                    {t('town.smithBuy', { p: smithBuyPrice(i) })}
                  </button>
                </div>
              ))}
            </>
          )}
        </Card>
      </div>

      <div class="stack">
        <ContractBoard s={s} c={c} />
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
      </div>
    </div>
  );
}
