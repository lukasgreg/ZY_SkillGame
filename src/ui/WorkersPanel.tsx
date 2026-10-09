import { useState } from 'preact/hooks';
import { ITEMS } from '../data/items';
import { AREAS, GATHER_LOCS, GATHER_SKILL, type ResourceId } from '../data/resources';
import { defaultRng } from '../engine/rng';
import { log, type Character, type GameState, type Worker } from '../engine/state';
import {
  MAX_BUNKHOUSE, buildBunkhouse, bunkhouseCost, dismiss, giveTool, hire, hireCost, slots, status, train, trainCost,
  wagePerHour, workerAreaOpen, workerCap,
} from '../engine/workers';
import { itemParam, nameOf, num, skillNum, t } from '../i18n';
import { Card, Meter } from './common';
import { update } from './store';

function WorkerCard({ s, c, w }: { s: GameState; c: Character; w: Worker }) {
  const [confirm, setConfirm] = useState(false);
  const st = status(s, w);
  const cap = workerCap(s, w.job);
  const tools = c.pack.items.filter((i) => ITEMS[i.def].toolFor === GATHER_SKILL[w.job]);
  const produced = Object.entries(w.produced) as [ResourceId, number][];
  return (
    <li class="worker">
      <div class="worker-head">
        <strong>{w.name}</strong>
        <span class="muted small">{t(`worker.job.${w.job}`)}</span>
        <span class={`pill pill-${st}`}>{t(`worker.status.${st}`)}</span>
      </div>
      <div class="small">
        {t(`skill.${GATHER_SKILL[w.job]}`)} <b>{skillNum(w.skill)}</b> <span class="muted">/ {skillNum(cap)}</span>
        <span class="muted"> · {t('worker.wage', { g: num(wagePerHour(w), 1) })}</span>
      </div>
      <div class="levels small-chips">
        {AREAS[w.job].map((a) => (
          <button
            key={a.id}
            class={`chip ${w.area === a.id ? 'on' : ''}`}
            disabled={!workerAreaOpen(w, a.id, s.cleared.includes('warrens'))}
            onClick={() => update(() => (w.area = a.id))}
          >
            <b>{a.gnarlHeld && !s.cleared.includes('warrens') ? t('mine.gnarlHeld') : t(`area.${w.job}.${a.id}`)}</b>
          </button>
        ))}
      </div>
      <div class="dur">
        <Meter value={w.toolDur} max={w.toolMax} kind="dur" />
        <span class="dur-text">
          {t('worker.tool')} {Math.max(0, w.toolDur)}/{w.toolMax}
        </span>
      </div>
      {produced.length > 0 && (
        <div class="small muted">
          {t('worker.produced')}: {produced.map(([id, n]) => `${n}× ${t(`res.${id}`)}`).join(', ')}
        </div>
      )}
      <div class="row">
        <button class="btn btn-small" disabled={s.bank.gold < trainCost(w) || w.skill + 10 > cap} onClick={() => update((st) => train(st, w))}>
          {t('worker.train', { p: trainCost(w) })}
        </button>
        {tools.map((it) => (
          <button
            key={it.uid}
            class="btn btn-small"
            onClick={() =>
              update((st) => {
                if (giveTool(c, w, it)) log(st, 'log.workers.tool', { item: itemParam(it), name: w.name }, 'good');
              })
            }
          >
            {t('worker.give', { item: nameOf(it), d: it.dur })}
          </button>
        ))}
        {confirm ? (
          <>
            <button class="btn btn-small btn-danger" onClick={() => update((st) => dismiss(st, w))}>
              {t('worker.dismissYes')}
            </button>
            <button class="btn btn-small" onClick={() => setConfirm(false)}>
              {t('settings.cancel')}
            </button>
          </>
        ) : (
          <button class="btn btn-small btn-quiet" onClick={() => setConfirm(true)}>
            {t('worker.dismiss')}
          </button>
        )}
      </div>
    </li>
  );
}

export function WorkersPanel({ s, c }: { s: GameState; c: Character }) {
  const cost = hireCost(s);
  const full = s.workers.length >= slots(s);
  const bh = bunkhouseCost(s.bunkhouse);
  const canBuild =
    s.bunkhouse < MAX_BUNKHOUSE && (c.pack.res.oakLog ?? 0) >= bh.oakLog && c.gold >= bh.gold && c.skills.carpentry / 10 >= bh.carpentry && c.location === 'town';
  return (
    <div class="grid-2">
      <Card title={t('worker.title', { n: s.workers.length, max: slots(s) })} note={t('worker.note')}>
        <p class="small">
          {t('worker.bankGold', { g: num(s.bank.gold) })}
        </p>
        {s.workers.length === 0 ? (
          <p class="muted">{t('worker.none')}</p>
        ) : (
          <ul class="workers">
            {s.workers.map((w) => (
              <WorkerCard key={w.id} s={s} c={c} w={w} />
            ))}
          </ul>
        )}
      </Card>
      <div class="stack">
        <Card title={t('worker.hireTitle')} note={t('worker.hireNote')}>
          <ul class="dests">
            {GATHER_LOCS.map((job) => (
              <li key={job}>
                <span>
                  <strong>{t(`worker.job.${job}`)}</strong>
                  <span class="muted small"> · {t('worker.startSkill', { v: skillNum(Math.min(workerCap(s, job), 100)) })}</span>
                </span>
                <button
                  class="btn btn-small btn-primary"
                  disabled={full || s.bank.gold < cost}
                  onClick={() =>
                    update((st) => {
                      const w = hire(st, job, defaultRng);
                      if (w) st.stats.hires += 1;
                      if (w) log(st, 'log.workers.hired', { name: w.name, job: `@worker.job.${job}`, gold: cost }, 'good');
                    })
                  }
                >
                  {t('worker.hire', { p: num(cost) })}
                </button>
              </li>
            ))}
          </ul>
          {full && <p class="warn small">{t('worker.full')}</p>}
        </Card>
        <Card title={t('worker.bunkhouse', { n: s.bunkhouse, max: MAX_BUNKHOUSE })} note={t('worker.bunkhouseNote')}>
          {s.bunkhouse >= MAX_BUNKHOUSE ? (
            <p class="muted">{t('worker.bunkhouseMax')}</p>
          ) : (
            <>
              <p class="small">
                {t('worker.bunkhouseCost', { oak: bh.oakLog, gold: bh.gold, skill: bh.carpentry })}
              </p>
              <button
                class="btn"
                disabled={!canBuild}
                onClick={() =>
                  update((st) => {
                    if (buildBunkhouse(st, c)) log(st, 'log.workers.bunkhouse', { n: st.bunkhouse }, 'good');
                  })
                }
              >
                {t('worker.build')}
              </button>
              {c.location !== 'town' && <p class="muted small">{t('forge.notHere')}</p>}
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
