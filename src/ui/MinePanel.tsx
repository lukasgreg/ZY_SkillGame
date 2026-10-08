import { ITEMS } from '../data/items';
import { MINE_LEVELS, type ResourceId } from '../data/resources';
import { toolInHand } from '../engine/character';
import { canMine, levelUnlocked, pullChance } from '../engine/mining';
import type { Character, GameState } from '../engine/state';
import { num, t } from '../i18n';
import { hold, mine, searchVein, setMineLevel, travel } from './actions';
import { Card, Durability, JournalLines } from './common';
import { Pack } from './Pack';
import { transient } from './store';

/** Fleck colour for each resource in the vein engraving. */
export const RES_COLOR: Record<ResourceId, string> = {
  ironOre: '#8a5a3c', copperOre: '#c4703a', silverOre: '#b9c0c8', goldOre: '#d8a93a', mithrilOre: '#7fb6d6',
  clay: '#a7714a', stone: '#8d8a83', coal: '#2b2724', sandstone: '#d1b27a', marble: '#e8e2d6',
  obsidian: '#3b3346', sulfur: '#d9cf4a', roughGem: '#5fb08a',
};

function VeinArt({ res }: { res: ResourceId | null }) {
  const fleck = res ? RES_COLOR[res] : 'transparent';
  const pts = [[38, 52], [52, 40], [61, 58], [45, 66], [70, 46], [56, 72], [33, 40], [66, 66]];
  return (
    <svg viewBox="0 0 100 100" class="vein-art" aria-hidden="true">
      <path d="M14 70 L22 34 L44 18 L72 22 L88 46 L82 76 L54 88 L26 84 Z" class="rock" />
      <path d="M22 34 L44 18 L52 30 L36 44 Z M72 22 L88 46 L70 40 Z" class="rock-hi" />
      <path d="M30 60 Q48 50 64 62 M40 44 Q56 38 70 50" class="seam" />
      {pts.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={2.6 + (i % 3)} fill={fleck} stroke="#2e2213" stroke-width="0.6" />
      ))}
    </svg>
  );
}

function PickIcon({ swinging }: { swinging: boolean }) {
  return (
    <div class={`pick ${swinging ? 'swing' : ''}`}>
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <g transform="rotate(35 50 58)">
          <rect x="46" y="28" width="7" height="60" fill="#6b4421" />
          <path d="M18 34 Q50 10 84 30 L80 36 Q50 20 22 40 Z" fill="#5e5e5e" stroke="#2e2213" stroke-width="2" />
        </g>
      </svg>
    </div>
  );
}

export function MinePanel({ s, c }: { s: GameState; c: Character }) {
  const busy = transient.busy;
  if (c.location !== 'mine') {
    return (
      <div class="grid-2">
        <Card title={t('loc.town')}>
          <p>{t('mine.inTown')}</p>
          <button class="btn btn-primary" disabled={!!busy} onClick={() => travel('mine')}>
            {busy?.kind === 'travel' ? t('mine.walking') : t('mine.goMine')}
          </button>
        </Card>
        <Pack c={c} />
      </div>
    );
  }

  const skill = c.skills.mining / 10;
  const vein = c.vein;
  const block = canMine(c);
  const tool = toolInHand(c);
  const p = vein ? pullChance(skill, vein.res) : 0;

  return (
    <div class="grid-2">
      <div class="stack">
        <nav class="levels" aria-label={t('loc.mine')}>
          {MINE_LEVELS.map((l) => {
            const open = levelUnlocked(c, l.id);
            return (
              <button
                key={l.id}
                class={`chip ${c.mineLevel === l.id ? 'on' : ''}`}
                disabled={!open || !!busy}
                onClick={() => setMineLevel(l.id)}
                title={l.gnarlHeld ? t('mine.gnarlHeld') : !open ? t('mine.needSkill', { n: l.need }) : undefined}
              >
                <b>{t('mine.level', { n: l.id })}</b>
                <span>{l.gnarlHeld ? t('mine.gnarlHeld') : t(`mine.level.${l.id}`)}</span>
              </button>
            );
          })}
        </nav>

        <Card class="node">
          <h2 class="card-title">{t(`mine.level.${c.mineLevel}`)}</h2>
          <div class="ring">
            <svg class="ring-svg" viewBox="0 0 100 100" aria-hidden="true">
              <circle cx="50" cy="50" r="45" class="ring-bg" />
              {busy && (busy.kind === 'mine' || busy.kind === 'search') && (
                <circle key={busy.start} cx="50" cy="50" r="45" class="ring-fg" style={{ animationDuration: `${busy.dur}ms` }} />
              )}
            </svg>
            <VeinArt res={vein && vein.left > 0 ? vein.res : null} />
            {busy?.kind === 'mine' && <PickIcon swinging />}
            {transient.flash && (
              <span key={transient.flash.id} class="flash">
                {transient.flash.text}
              </span>
            )}
          </div>
          {vein ? (
            <>
              <div class="node-name">{t(`res.${vein.res}`)}</div>
              <div class="node-sub">{vein.left > 0 ? t('mine.pullsLeft', { count: vein.left }) : t('mine.exhausted')}</div>
              {vein.left > 0 && <div class="node-sub">{t('mine.chance', { p: Math.round(p * 100) })}</div>}
            </>
          ) : (
            <div class="node-sub">{t('mine.noVeinYet')}</div>
          )}
          <div class="row center">
            <button class="btn btn-primary btn-big" disabled={!!busy || (block !== null && block !== 'tired')} onClick={mine}>
              {busy?.kind === 'mine' ? t('mine.mining') : t('mine.mine')}
            </button>
            <button class="btn" disabled={!!busy} onClick={searchVein}>
              {busy?.kind === 'search' ? t('mine.searching') : t('mine.search')}
            </button>
          </div>
          {block && block !== 'noVein' && <p class="warn">{t(`mine.block.${block}`)}</p>}
          <button class="btn btn-quiet" disabled={!!busy} onClick={() => travel('town')}>
            {busy?.kind === 'travel' ? t('mine.walking') : t('mine.goTown')}
          </button>
        </Card>
      </div>

      <div class="stack">
        <Card title={t('mine.tool')}>
          {tool ? (
            <div class="tool">
              <strong>{t(`item.${tool.def}`)}</strong>
              <Durability it={tool} />
            </div>
          ) : (
            <p class="warn">{t('mine.noTool')}</p>
          )}
          {c.pack.items
            .filter((i) => i.uid !== c.tool && ITEMS[i.def].toolFor === 'mining')
            .map((i) => (
              <div class="tool alt" key={i.uid}>
                <span>{t(`item.${i.def}`)}</span>
                <Durability it={i} />
                <button class="btn btn-small" disabled={!!busy} onClick={() => hold(i.uid)}>
                  {t('pack.hold')}
                </button>
              </div>
            ))}
          <p class="muted small">
            {t('skill.mining')} {num(skill, 1)}
          </p>
        </Card>
        <Pack c={c} />
        <Card title={t('mine.recent')}>
          <JournalLines entries={s.journal} limit={8} />
        </Card>
      </div>
    </div>
  );
}
