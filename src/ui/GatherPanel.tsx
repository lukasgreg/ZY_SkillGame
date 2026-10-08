import { ITEMS } from '../data/items';
import { AREAS, GATHER_LOCS, GATHER_SKILL, type GatherLoc, type ResourceId } from '../data/resources';
import { areaOpen, canGather, gatherTool, isGatherLoc, pullChance } from '../engine/gather';
import type { Character, GameState } from '../engine/state';
import { itemName, nameOf, num, t } from '../i18n';
import { gather, hold, searchNode, setArea, travel } from './actions';
import { Card, Durability, JournalLines } from './common';
import { Pack } from './Pack';
import { transient } from './store';

/** Fleck colour for each resource in the node engraving. */
const RES_COLOR: Partial<Record<ResourceId, string>> = {
  ironOre: '#8a5a3c', copperOre: '#c4703a', silverOre: '#b9c0c8', goldOre: '#d8a93a', mithrilOre: '#7fb6d6',
  clay: '#a7714a', stone: '#8d8a83', coal: '#2b2724', sandstone: '#d1b27a', marble: '#e8e2d6',
  obsidian: '#3b3346', sulfur: '#d9cf4a', roughGem: '#5fb08a',
  log: '#7a5a34', oakLog: '#5f4426', ashLog: '#a39a7c', yewLog: '#8a3b22', heartwood: '#b0452e', resin: '#d69a2a',
  perch: '#7d8f5a', carp: '#b08a3a', pike: '#5c6e4a', sturgeon: '#58616a', pearl: '#f2ede2',
  wheat: '#d8b452', feather: '#f1ece0', flax: '#7a8fb8', herb: '#5f8a45', bloodmoss: '#9b2b2b',
};

function NodeArt({ loc, res }: { loc: GatherLoc; res: ResourceId | null }) {
  const fleck = (res && RES_COLOR[res]) || 'transparent';
  if (loc === 'forest') {
    return (
      <svg viewBox="0 0 100 100" class="node-art" aria-hidden="true">
        <rect x="45" y="56" width="10" height="34" class="trunk" />
        <path d="M50 10 L80 52 L62 52 L84 74 L16 74 L38 52 L20 52 Z" class="crown" />
        {[[42, 40], [58, 46], [50, 62], [36, 66], [66, 66]].map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r="3" fill={fleck} stroke="#2e2213" stroke-width="0.6" />
        ))}
      </svg>
    );
  }
  if (loc === 'coast') {
    return (
      <svg viewBox="0 0 100 100" class="node-art" aria-hidden="true">
        <ellipse cx="50" cy="56" rx="38" ry="26" class="water" />
        <path d="M22 50 Q30 44 38 50 T54 50 T70 50 M28 62 Q36 56 44 62 T60 62 T76 62" class="ripple" />
        {[[40, 54], [56, 58], [48, 66]].map(([x, y], i) => (
          <path key={i} d={`M${x - 6} ${y} Q${x} ${y - 5} ${x + 6} ${y} Q${x} ${y + 5} ${x - 6} ${y} L${x - 10} ${y - 3} L${x - 10} ${y + 3} Z`} fill={fleck} stroke="#2e2213" stroke-width="0.6" />
        ))}
      </svg>
    );
  }
  if (loc === 'farm') {
    return (
      <svg viewBox="0 0 100 100" class="node-art" aria-hidden="true">
        <path d="M12 72 L50 52 L88 72 L50 92 Z" class="soil" />
        <path d="M24 72 L56 56 M34 77 L66 61 M44 82 L76 66" class="furrow" />
        {[[34, 66], [46, 60], [44, 74], [56, 68], [58, 80], [68, 74]].map(([x, y], i) => (
          <g key={i}>
            <path d={`M${x} ${y} L${x} ${y - 12}`} stroke="#4f6b2e" stroke-width="1.6" />
            <circle cx={x} cy={y - 13} r="3" fill={fleck} stroke="#2e2213" stroke-width="0.6" />
          </g>
        ))}
      </svg>
    );
  }
  const pts = [[38, 52], [52, 40], [61, 58], [45, 66], [70, 46], [56, 72], [33, 40], [66, 66]];
  return (
    <svg viewBox="0 0 100 100" class="node-art" aria-hidden="true">
      <path d="M14 70 L22 34 L44 18 L72 22 L88 46 L82 76 L54 88 L26 84 Z" class="rock" />
      <path d="M22 34 L44 18 L52 30 L36 44 Z M72 22 L88 46 L70 40 Z" class="rock-hi" />
      <path d="M30 60 Q48 50 64 62 M40 44 Q56 38 70 50" class="seam" />
      {pts.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={2.6 + (i % 3)} fill={fleck} stroke="#2e2213" stroke-width="0.6" />
      ))}
    </svg>
  );
}

function ToolIcon({ swinging, loc }: { swinging: boolean; loc: GatherLoc }) {
  return (
    <div class={`pick ${swinging ? 'swing' : ''} pick-${loc}`}>
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <g transform="rotate(35 50 58)">
          <rect x="46" y="28" width="7" height="60" fill="#6b4421" />
          {loc === 'mine' && <path d="M18 34 Q50 10 84 30 L80 36 Q50 20 22 40 Z" fill="#5e5e5e" stroke="#2e2213" stroke-width="2" />}
          {loc === 'forest' && <path d="M53 26 L80 20 Q86 34 78 46 L53 40 Z" fill="#6e6e6e" stroke="#2e2213" stroke-width="2" />}
          {loc === 'farm' && <path d="M53 28 L78 28 L78 38 L53 34 Z" fill="#6e6e6e" stroke="#2e2213" stroke-width="2" />}
          {loc === 'coast' && <path d="M50 28 Q70 10 92 30" fill="none" stroke="#2e2213" stroke-width="1.2" />}
        </g>
      </svg>
    </div>
  );
}

/** Where to go when you're in town. */
function Destinations({ c }: { c: Character }) {
  const busy = transient.busy;
  return (
    <div class="grid-2">
      <Card title={t('gather.setOut')} note={t('gather.setOutNote')}>
        <ul class="dests">
          {GATHER_LOCS.map((loc) => {
            const skill = GATHER_SKILL[loc];
            const tool = gatherTool(c, skill);
            return (
              <li key={loc}>
                <div>
                  <strong>{t(`loc.${loc}`)}</strong>
                  <span class="muted small">
                    {' '}
                    · {t(`skill.${skill}`)} {num(c.skills[skill] / 10, 1)}
                  </span>
                  <div class={`small ${tool ? 'muted' : 'warn'}`}>{tool ? nameOf(tool) : t('gather.needTool', { tool: itemName(toolFor(loc)) })}</div>
                </div>
                <button class="btn btn-primary btn-small" disabled={!!busy} onClick={() => travel(loc)}>
                  {busy?.kind === 'travel' ? t('mine.walking') : t('gather.go')}
                </button>
              </li>
            );
          })}
        </ul>
      </Card>
      <Pack c={c} />
    </div>
  );
}

const toolFor = (loc: GatherLoc) => (Object.values(ITEMS).find((d) => d.toolFor === GATHER_SKILL[loc])!.id);

export function GatherPanel({ s, c }: { s: GameState; c: Character }) {
  const busy = transient.busy;
  if (!isGatherLoc(c.location)) return <Destinations c={c} />;

  const loc = c.location;
  const skillId = GATHER_SKILL[loc];
  const skill = c.skills[skillId] / 10;
  const node = c.node;
  const block = canGather(c);
  const tool = gatherTool(c, skillId);
  const p = node ? pullChance(skill, node.res) : 0;
  const areaId = c.areas[loc];

  return (
    <div class="grid-2">
      <div class="stack">
        <nav class="levels" aria-label={t(`loc.${loc}`)}>
          {AREAS[loc].map((a) => {
            const open = areaOpen(c, loc, a.id);
            return (
              <button
                key={a.id}
                class={`chip ${areaId === a.id ? 'on' : ''}`}
                disabled={!open || !!busy}
                onClick={() => setArea(loc, a.id)}
                title={a.gnarlHeld ? t('mine.gnarlHeld') : !open ? t('gather.needSkill', { skill: t(`skill.${skillId}`), n: a.need }) : undefined}
              >
                <b>{a.gnarlHeld ? t('mine.gnarlHeld') : t(`area.${loc}.${a.id}`)}</b>
                <span>
                  {t(`skill.${skillId}`)} {a.need}+
                </span>
              </button>
            );
          })}
        </nav>

        <Card class="node">
          <h2 class="card-title">{t(`area.${loc}.${areaId}`)}</h2>
          <div class="ring">
            <svg class="ring-svg" viewBox="0 0 100 100" aria-hidden="true">
              <circle cx="50" cy="50" r="45" class="ring-bg" />
              {busy && (busy.kind === 'mine' || busy.kind === 'search') && (
                <circle key={busy.start} cx="50" cy="50" r="45" class="ring-fg" style={{ animationDuration: `${busy.dur}ms` }} />
              )}
            </svg>
            <NodeArt loc={loc} res={node && node.left > 0 ? node.res : null} />
            {busy?.kind === 'mine' && <ToolIcon swinging loc={loc} />}
            {transient.flash && (
              <span key={transient.flash.id} class="flash">
                {transient.flash.text}
              </span>
            )}
          </div>
          {node ? (
            <>
              <div class="node-name">{t(`res.${node.res}`)}</div>
              <div class="node-sub">{node.left > 0 ? t('gather.left', { count: node.left }) : t(`gather.empty.${loc}`)}</div>
              {node.left > 0 && <div class="node-sub">{t('mine.chance', { p: Math.round(p * 100) })}</div>}
            </>
          ) : (
            <div class="node-sub">{t(`gather.none.${loc}`)}</div>
          )}
          <div class="row center">
            <button class="btn btn-primary btn-big" disabled={!!busy || (block !== null && block !== 'tired')} onClick={gather}>
              {busy?.kind === 'mine' ? t(`gather.doing.${loc}`) : t(`gather.do.${loc}`)}
            </button>
            <button class="btn" disabled={!!busy} onClick={searchNode}>
              {busy?.kind === 'search' ? t('mine.searching') : t(`gather.search.${loc}`)}
            </button>
          </div>
          {block && block !== 'noNode' && <p class="warn">{t(`gather.block.${block}`)}</p>}
          <button class="btn btn-quiet" disabled={!!busy} onClick={() => travel('town')}>
            {busy?.kind === 'travel' ? t('mine.walking') : t('mine.goTown')}
          </button>
        </Card>
      </div>

      <div class="stack">
        <Card title={t('mine.tool')}>
          {tool ? (
            <div class="tool">
              <strong>{nameOf(tool)}</strong>
              <Durability it={tool} />
            </div>
          ) : (
            <p class="warn">{t('gather.needTool', { tool: itemName(toolFor(loc)) })}</p>
          )}
          {c.pack.items
            .filter((i) => i.uid !== tool?.uid && ITEMS[i.def].toolFor === skillId)
            .map((i) => (
              <div class="tool alt" key={i.uid}>
                <span>{nameOf(i)}</span>
                <Durability it={i} />
                <button class="btn btn-small" disabled={!!busy} onClick={() => hold(i.uid)}>
                  {t('pack.hold')}
                </button>
              </div>
            ))}
          <p class="muted small">
            {t(`skill.${skillId}`)} {num(skill, 1)}
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
