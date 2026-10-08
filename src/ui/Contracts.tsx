import { useState } from 'preact/hooks';
import { METALS } from '../data/items';
import { MAX_ACTIVE, fits } from '../engine/contracts';
import type { Character, Contract, GameState } from '../engine/state';
import { itemName, num, t } from '../i18n';
import { abandonContract, acceptContract, handInContract } from './actions';
import { Card, Meter } from './common';

function What({ k }: { k: Contract }) {
  return (
    <>
      <strong>
        {k.n}× {k.wants ? itemName(k.wants, k.minMat) : t(`res.${k.wantsRes}`)}
      </strong>
      <div class="req small">
        {k.minMat && <span>{t('town.reqMetal', { metal: t(`res.${METALS[k.minMat].bar}`) })}</span>}
        {k.exceptional && <span>{t('town.reqExc')}</span>}
        {k.wants && <span>{t('town.reqCond')}</span>}
      </div>
    </>
  );
}

function Reward({ k }: { k: Contract }) {
  return (
    <div class="small reward">
      {t('contract.reward')}: <b>{t('contract.gold', { g: num(k.reward.gold) })}</b>
      {k.reward.plan && (
        <>
          {' + '}
          <b class="plan-name">{t('contract.planOf', { plan: t(`plan.${k.reward.plan}`) })}</b>
        </>
      )}
      {k.reward.res && (
        <>
          {' + '}
          <b>
            {k.reward.res.n}× {t(`res.${k.reward.res.id}`)}
          </b>
        </>
      )}
    </div>
  );
}

function Active({ c, k }: { c: Character; k: Contract }) {
  const [confirm, setConfirm] = useState(false);
  const have = k.wantsRes ? c.pack.res[k.wantsRes] ?? 0 : c.pack.items.filter((i) => fits(k, i)).length;
  const hours = Math.max(0, Math.round((k.expiresAt - Date.now()) / 3600_000));
  return (
    <li class="contract">
      <div class="small muted">{t('contract.from', { giver: k.giver })}</div>
      <What k={k} />
      <Meter value={k.delivered} max={k.n} kind="skill" />
      <div class="row tight small">
        <span>{t('contract.progress', { d: k.delivered, n: k.n, h: hours })}</span>
        <span class="muted">{t('town.youHave', { n: have })}</span>
      </div>
      <Reward k={k} />
      <div class="row">
        <button class="btn btn-small btn-primary" disabled={have === 0 || c.location !== 'town'} onClick={() => handInContract(k)}>
          {t('contract.handIn')}
        </button>
        {confirm ? (
          <>
            <button class="btn btn-small btn-danger" onClick={() => abandonContract(k)}>
              {t('contract.abandonYes')}
            </button>
            <button class="btn btn-small" onClick={() => setConfirm(false)}>
              {t('settings.cancel')}
            </button>
          </>
        ) : (
          <button class="btn btn-small btn-quiet" onClick={() => setConfirm(true)}>
            {t('contract.abandon')}
          </button>
        )}
      </div>
    </li>
  );
}

export function ContractBoard({ s, c }: { s: GameState; c: Character }) {
  const full = s.contracts.length >= MAX_ACTIVE;
  return (
    <Card title={t('contract.title')} note={t('contract.note')}>
      {s.contracts.length > 0 && (
        <>
          <h3 class="sub">{t('contract.active', { n: s.contracts.length, max: MAX_ACTIVE })}</h3>
          <ul class="contracts">
            {s.contracts.map((k) => (
              <Active key={k.id} c={c} k={k} />
            ))}
          </ul>
        </>
      )}
      <h3 class="sub">{t('contract.offers')}</h3>
      {s.contractOffers.length === 0 ? (
        <p class="muted small">{t('contract.none')}</p>
      ) : (
        <ul class="contracts">
          {s.contractOffers.map((k) => (
            <li key={k.id} class="contract">
              <div class="small muted">{t('contract.from', { giver: k.giver })}</div>
              <What k={k} />
              <Reward k={k} />
              <button class="btn btn-small" disabled={full} onClick={() => acceptContract(k)}>
                {t('contract.accept')}
              </button>
            </li>
          ))}
        </ul>
      )}
      {full && <p class="muted small">{t('contract.full')}</p>}
    </Card>
  );
}
