import { DUNGEONS, DUNGEON_IDS, MONSTERS } from '../data/dungeons';
import { RESOURCES, type ResourceId } from '../data/resources';
import { ABILITY_COST, abilityOk, armorValue, bandageHeal, fleeChance, hitChance, usesArrows, weaponInfo, type Ability } from '../engine/combat';
import { canLeave, corpseFresh, exits, here, scoutCost } from '../engine/dungeon';
import { maxHp, maxStamina } from '../engine/skills';
import type { Character, DNode, GameState, Run, Stance } from '../engine/state';
import { nameOf, num, t } from '../i18n';
import {
  campHere, changeStance, enterDungeon, fieldRepair, fightAction, leaveDungeon, lootMyCorpse, moveTo, reengageFoes, scoutDungeon, useWayHome,
} from './actions';
import { Card, JournalLines, Meter } from './common';
import { transient } from './store';

const GLYPH: Record<DNode['type'], string> = { start: '⌂', monster: '⚔', elite: '✦', treasure: '◆', shrine: '✚', trap: '⚠', boss: '☠' };
const ABILITIES: Ability[] = ['secondWind', 'crushingBlow', 'leap', 'warcry'];
const STANCES: Stance[] = ['normal', 'combat', 'defensive'];

function Rating({ n, glyph, label }: { n: number; glyph: string; label: string }) {
  return (
    <span class="rating" title={label} aria-label={`${label} ${n}/5`}>
      {Array.from({ length: 5 }, (_, i) => (
        <span key={i} class={i < n ? 'on' : ''}>
          {glyph}
        </span>
      ))}
    </span>
  );
}

function Countdown({ until }: { until: number }) {
  const s = Math.max(0, Math.round((until - Date.now()) / 1000));
  return (
    <b class="countdown">
      {Math.floor(s / 60)}:{String(s % 60).padStart(2, '0')}
    </b>
  );
}

function Board({ s, c }: { s: GameState; c: Character }) {
  const busy = !!transient.busy;
  const inTown = c.location === 'town';
  return (
    <div class="grid-2">
      <Card title={t('dun.board')} note={t('dun.boardNote')}>
        {corpseFresh(c) && (
          <p class="warn">
            {t('dun.corpseWarn', { d: t(`dun.${c.corpse!.dungeon}`) })} <Countdown until={c.corpse!.decaysAt} />
          </p>
        )}
        <ul class="board">
          {DUNGEON_IDS.map((id) => {
            const d = DUNGEONS[id];
            const sc = s.scouted[id] ?? 0;
            const free = c.skills.tracking >= 300;
            return (
              <li key={id}>
                <div class="board-head">
                  <strong>{t(`dun.${id}`)}</strong>
                  {s.cleared.includes(id) && <span class="pill pill-working">{t('dun.cleared')}</span>}
                </div>
                <div class="board-ratings">
                  <Rating n={d.skulls} glyph="☠" label={t('dun.difficulty')} />
                  <Rating n={d.clocks} glyph="⧗" label={t('dun.length')} />
                </div>
                <p class="small muted">{t(`dun.${id}.desc`)}</p>
                {sc >= 2 && <p class="small">{t('dun.scoutBoss', { boss: t(`mon.${d.boss}`) })}</p>}
                <div class="row">
                  <button class="btn btn-small" disabled={!inTown || sc >= 1 || (!free && c.gold < scoutCost(id, 1))} onClick={() => scoutDungeon(id, 1)}>
                    {sc >= 1 ? t('dun.scouted1') : free ? t('dun.trackFree') : t('dun.scout1', { p: scoutCost(id, 1) })}
                  </button>
                  <button class="btn btn-small" disabled={!inTown || sc < 1 || sc >= 2 || c.gold < scoutCost(id, 2)} onClick={() => scoutDungeon(id, 2)}>
                    {sc >= 2 ? t('dun.scouted2') : t('dun.scout2', { p: scoutCost(id, 2) })}
                  </button>
                  <button class="btn btn-small btn-primary" disabled={!inTown || busy} onClick={() => enterDungeon(id)}>
                    {corpseFresh(c) && c.corpse!.dungeon === id ? t('dun.recoverBtn') : t('dun.enterBtn')}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
        {!inTown && <p class="muted small">{t('dun.fromTown')}</p>}
      </Card>
      <Card title={t('dun.howTitle')}>
        <ul class="how small">
          <li>{t('dun.how1')}</li>
          <li>{t('dun.how2')}</li>
          <li>{t('dun.how3')}</li>
          <li>{t('dun.how4')}</li>
        </ul>
      </Card>
    </div>
  );
}

function MapView({ c, run }: { c: Character; run: Run }) {
  const layers = Math.max(...run.nodes.map((n) => n.layer)) + 1;
  const byLayer: DNode[][] = Array.from({ length: layers }, () => []);
  for (const n of run.nodes) byLayer[n.layer].push(n);
  const W = 64;
  const H = 210;
  const pos = (n: DNode) => {
    const col = byLayer[n.layer];
    const i = col.indexOf(n);
    return { x: 28 + n.layer * W, y: (H / (col.length + 1)) * (i + 1) };
  };
  const visited = new Set(run.path);
  const reach = new Set(exits(run).map((n) => n.id));
  const known = (n: DNode) => run.scouted >= 1 || visited.has(n.id) || n.cleared;
  const corpseAt = c.corpse && corpseFresh(c) && c.corpse.seed === run.seed ? c.corpse.node : -1;
  return (
    <div class="map-wrap">
      <svg class="map" viewBox={`0 0 ${28 * 2 + (layers - 1) * W} ${H}`} style={{ width: `${(28 * 2 + (layers - 1) * W) * 1.5}px`, height: `${H * 1.5}px` }} role="img" aria-label={t('dun.map')}>
        {run.nodes.flatMap((n) =>
          n.next.map((to) => {
            const a = pos(n);
            const b = pos(run.nodes[to]);
            const sealed = run.nodes[to].oneWay && (run.scouted >= 2 || visited.has(to));
            const walked = visited.has(n.id) && visited.has(to);
            return <line key={`${n.id}-${to}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} class={`edge ${walked ? 'walked' : ''} ${sealed ? 'sealed' : ''}`} />;
          }),
        )}
        {run.nodes.map((n) => {
          const p = pos(n);
          const cls = ['node', n.id === run.at ? 'here' : '', visited.has(n.id) ? 'seen' : '', reach.has(n.id) ? 'reach' : '', n.cleared ? 'done' : '', n.type === 'boss' ? 'boss' : ''].join(' ');
          return (
            <g key={n.id} class={cls} onClick={reach.has(n.id) ? () => moveTo(n.id) : undefined} role={reach.has(n.id) ? 'button' : undefined}>
              <circle cx={p.x} cy={p.y} r={n.type === 'boss' ? 16 : 13} />
              <text x={p.x} y={p.y + 5} text-anchor="middle">
                {known(n) || n.type === 'boss' ? GLYPH[n.type] : '?'}
              </text>
              {n.id === corpseAt && (
                <text x={p.x + 12} y={p.y - 11} class="corpse-mark">
                  ✝
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function Fight({ c, run }: { c: Character; run: Run }) {
  const cb = run.combat!;
  const busy = !!transient.busy;
  const w = weaponInfo(c);
  const target = cb.foes.find((f) => f.hp > 0);
  const p = target ? hitChance(c.skills[w.skill] / 10, MONSTERS[target.kind].skill, c.skills.tactics / 10) : 0;
  const foods = (Object.keys(c.pack.res) as ResourceId[]).filter((id) => RESOURCES[id].food);
  return (
    <Card title={t('fight.title', { n: cb.round })}>
      <ul class="foes">
        {cb.foes.map((f, i) => (
          <li key={i} class={f.hp <= 0 ? 'dead' : ''}>
            <span>
              {t(`mon.${f.kind}`)}
              {f.stunned > 0 && <span class="muted small"> · {t('fight.stunnedTag')}</span>}
            </span>
            <Meter value={f.hp} max={MONSTERS[f.kind].hp} kind="hp" />
            <span class="small">
              {f.hp}/{MONSTERS[f.kind].hp}
            </span>
          </li>
        ))}
      </ul>
      <div class="stances" role="radiogroup" aria-label={t('fight.stance')}>
        {STANCES.map((st) => (
          <button key={st} role="radio" aria-checked={c.stance === st} class={`metal ${c.stance === st ? 'on' : ''}`} disabled={busy} onClick={() => changeStance(st)} title={t(`stance.${st}.tip`)}>
            {t(`stance.${st}`)}
          </button>
        ))}
      </div>
      <div class="actions-grid">
        <button class="btn btn-primary" disabled={busy} onClick={() => fightAction({ type: 'attack' })}>
          {t('fight.attack', { p: Math.round(p * 100) })}
        </button>
        {ABILITIES.map((a) => (
          <button key={a} class="btn" disabled={busy || !abilityOk(c, cb, a)} onClick={() => fightAction({ type: 'ability', id: a })} title={t(`ability.${a}.tip`)}>
            {t(`ability.${a}`)} {ABILITY_COST[a] ? <span class="muted small">({ABILITY_COST[a]})</span> : null}
          </button>
        ))}
        <button class="btn" disabled={busy || !(c.pack.res.bandage ?? 0) || cb.bandaging} onClick={() => fightAction({ type: 'bandage' })}>
          {t('fight.bandage', { n: c.pack.res.bandage ?? 0, h: bandageHeal(c) })}
        </button>
        {foods.slice(0, 2).map((id) => (
          <button key={id} class="btn" disabled={busy} onClick={() => fightAction({ type: 'eat', res: id })}>
            {t('pack.eat')}: {t(`res.${id}`)} ({c.pack.res[id]})
          </button>
        ))}
        <button class="btn" disabled={busy} onClick={() => fightAction({ type: 'flee' })}>
          {t('fight.flee', { p: Math.round(fleeChance(c, cb) * 100) })}
        </button>
        {(c.pack.res.wayHome ?? 0) > 0 && (
          <button class="btn" disabled={busy} onClick={useWayHome}>
            {t('dun.wayHome', { n: c.pack.res.wayHome ?? 0 })}
          </button>
        )}
      </div>
      {usesArrows(c) && <p class="small muted">{t('fight.arrows', { n: c.pack.res.arrow ?? 0 })}</p>}
    </Card>
  );
}

function Room({ c, run }: { c: Character; run: Run }) {
  const busy = !!transient.busy;
  const node = here(run);
  const next = exits(run);
  const atCorpse = c.corpse && corpseFresh(c) && c.corpse.seed === run.seed && c.corpse.node === node.id && node.cleared;
  const damaged = c.pack.items.filter((i) => i.dur < i.maxDur);
  return (
    <Card title={t(`room.${node.type}`)}>
      {run.sealed && !run.bossDown && <p class="warn small">{t('dun.sealedNote')}</p>}
      {run.bossDown && <p class="good small">{t('dun.bossDownNote')}</p>}
      {atCorpse && (
        <button class="btn btn-primary" onClick={lootMyCorpse}>
          {t('dun.lootCorpse')}
        </button>
      )}
      {run.retreated && (
        <>
          <p class="small">{t('dun.corneredNote')}</p>
          <button class="btn btn-primary" onClick={reengageFoes}>
            {t('dun.reengage')}
          </button>
        </>
      )}
      {next.length > 0 && (
        <>
          <h3 class="sub">{t('dun.onward')}</h3>
          <div class="row">
            {next.map((n) => (
              <button key={n.id} class="btn" disabled={busy} onClick={() => moveTo(n.id)}>
                {run.scouted >= 1 || n.cleared || n.type === 'boss' ? `${GLYPH[n.type]} ${t(`room.${n.type}`)}` : `? ${t('room.unknown')}`}
                {n.oneWay && run.scouted >= 2 && <span class="warn small"> ↯</span>}
              </button>
            ))}
          </div>
        </>
      )}
      <div class="row">
        <button class="btn" disabled={busy} onClick={campHere}>
          {transient.busy?.kind === 'search' ? t('dun.camping') : t('dun.camp')}
        </button>
        <button class="btn" disabled={busy || !canLeave(run)} onClick={leaveDungeon}>
          {t('dun.leave')}
        </button>
        {(c.pack.res.wayHome ?? 0) > 0 && (
          <button class="btn" disabled={busy} onClick={useWayHome}>
            {t('dun.wayHome', { n: c.pack.res.wayHome ?? 0 })}
          </button>
        )}
      </div>
      {(c.pack.res.repairKit ?? 0) > 0 && damaged.length > 0 && (
        <>
          <h3 class="sub">{t('dun.repairKits', { n: c.pack.res.repairKit ?? 0 })}</h3>
          {damaged.map((i) => (
            <div class="row tight" key={i.uid}>
              <span class="small">
                {nameOf(i)} {i.dur}/{i.maxDur}
              </span>
              <button class="btn btn-small" onClick={() => fieldRepair(i.uid)}>
                {t('dun.fieldRepair')}
              </button>
            </div>
          ))}
        </>
      )}
    </Card>
  );
}

export function DungeonPanel({ s, c }: { s: GameState; c: Character }) {
  const run = c.run;
  if (!run) return <Board s={s} c={c} />;
  return (
    <div class="stack">
      <Card title={t(`dun.${run.dungeon}`)} note={t('dun.mapNote')}>
        <MapView c={c} run={run} />
        <div class="row small">
          <span>
            {t('hud.hp')} <b>{Math.floor(c.hp)}</b>/{maxHp(c)}
          </span>
          <span>
            {t('hud.stamina')} <b>{Math.floor(c.stamina)}</b>/{maxStamina(c)}
          </span>
          <span>
            {t('char.armor')} <b>{num(armorValue(c), 1)}</b>
          </span>
          <span>
            {t('dun.lootSoFar')} <b>{run.loot}</b>
          </span>
        </div>
      </Card>
      <div class="grid-2">
        {run.combat ? <Fight c={c} run={run} /> : <Room c={c} run={run} />}
        <Card title={t('dun.log')}>
          <JournalLines entries={run.log} limit={14} />
        </Card>
      </div>
    </div>
  );
}
