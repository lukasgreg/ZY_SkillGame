import { useState } from 'preact/hooks';
import { ARMOUR_INFO, ITEMS, SLOTS, minStr, slotOf, type MetalId, type Slot } from '../data/items';
import { armorValue, equipped, roundStamina, weaponInfo, wornWeight } from '../engine/combat';
import type { Character, ItemInstance } from '../engine/state';
import { nameOf, num, t } from '../i18n';
import { takeOff, wear } from './actions';
import { Card, Durability } from './common';

const METAL_FILL: Record<MetalId, string> = {
  iron: '#8d8f94', copper: '#c4703a', steel: '#a9b6c2', silver: '#dfe3e8', gold: '#d8a93a',
  darkIron: '#45414d', mithril: '#9fd0e8', blackrock: '#2f2d2c',
};
const FAMILY_FILL = { leather: '#8a5a34', studded: '#6b4423' } as const;
const EMPTY = '#e6d3b3';

function fillOf(it: ItemInstance | null): string {
  if (!it) return EMPTY;
  const fam = ARMOUR_INFO[it.def]?.family;
  if (fam === 'leather' || fam === 'studded') return FAMILY_FILL[fam];
  if (ITEMS[it.def].kind === 'weapon' && !ITEMS[it.def].metal) return '#7a5a34';
  return METAL_FILL[it.mat ?? 'iron'];
}

/** A UO-style paperdoll: the body is drawn in what you wear; click a part to change it. */
export function Paperdoll({ c }: { c: Character }) {
  const [sel, setSel] = useState<Slot>('chest');
  const f = (sl: Slot) => fillOf(equipped(c, sl));
  const cls = (sl: Slot) => `part ${sel === sl ? 'sel' : ''} ${equipped(c, sl) ? 'worn' : ''}`;
  const pick = (sl: Slot) => ({ class: cls(sl), onClick: () => setSel(sl), role: 'button' as const, 'aria-label': t(`slot.${sl}`) });
  const worn = Object.values(c.equip);
  const current = equipped(c, sel);
  const options = c.pack.items.filter((i) => slotOf(i.def) === sel && !worn.includes(i.uid));
  const w = weaponInfo(c);
  return (
    <Card title={t('char.equipment')} note={t('char.equipNote', { skill: t(`skill.${w.skill}`), a: num(armorValue(c), 1) })}>
      <div class="doll-wrap">
        <svg class="doll" viewBox="0 0 200 300" aria-label={t('char.paperdoll')}>
          <g {...pick('legs')}>
            <rect x="72" y="156" width="25" height="104" rx="6" fill={f('legs')} />
            <rect x="103" y="156" width="25" height="104" rx="6" fill={f('legs')} />
          </g>
          <g {...pick('chest')}>
            <path d="M66 80 Q100 70 134 80 L130 160 Q100 168 70 160 Z" fill={f('chest')} />
          </g>
          <g {...pick('arms')}>
            <rect x="42" y="80" width="22" height="70" rx="9" fill={f('arms')} />
            <rect x="136" y="80" width="22" height="70" rx="9" fill={f('arms')} />
          </g>
          <g {...pick('hands')}>
            <circle cx="53" cy="160" r="11" fill={f('hands')} />
            <circle cx="147" cy="160" r="11" fill={f('hands')} />
          </g>
          <g {...pick('neck')}>
            <rect x="88" y="60" width="24" height="16" rx="4" fill={f('neck')} />
          </g>
          <g {...pick('head')}>
            <circle cx="100" cy="38" r="24" fill={f('head')} />
            {!equipped(c, 'head') && <path d="M90 36 h4 M106 36 h4 M94 48 q6 4 12 0" class="face" />}
          </g>
          <g {...pick('weapon')}>
            <rect x="140" y="96" width="34" height="80" fill="transparent" class="hit" />
            {equipped(c, 'weapon') ? (
              <path d="M152 170 L170 100 L174 102 L157 172 Z M146 168 L162 176" fill={f('weapon')} stroke="#2e2213" stroke-width="2" />
            ) : (
              <path d="M150 150 l18 -40" class="ghost" />
            )}
          </g>
          <g {...pick('shield')}>
            <ellipse cx="34" cy="130" rx="20" ry="27" fill={equipped(c, 'shield') ? f('shield') : 'transparent'} class={equipped(c, 'shield') ? '' : 'ghost-shape'} />
          </g>
        </svg>

        <div class="doll-side">
          <ul class="doll-slots">
            {SLOTS.map((sl) => {
              const it = equipped(c, sl);
              return (
                <li key={sl}>
                  <button class={`slot-btn ${sel === sl ? 'on' : ''}`} onClick={() => setSel(sl)}>
                    <span class="muted small">{t(`slot.${sl}`)}</span>
                    <span class="small">{it ? nameOf(it) : sl === 'weapon' ? t('char.fists') : '—'}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      <div class="doll-detail">
        <h3 class="sub">{t(`slot.${sel}`)}</h3>
        {current ? (
          <div class="tool alt">
            <strong>{nameOf(current)}</strong>
            <Durability it={current} />
            <button class="btn btn-small" onClick={() => takeOff(sel)}>
              {t('char.takeOff')}
            </button>
          </div>
        ) : (
          <p class="muted small">{t('char.slotEmpty')}</p>
        )}
        {options.map((i) => {
          const need = minStr(i.def);
          const weak = c.stats.str < need;
          return (
            <div class="row tight" key={i.uid}>
              <span class="small">
                {nameOf(i)}
                {ITEMS[i.def].armor ? <span class="muted"> · {t('char.armorShort', { a: ITEMS[i.def].armor! })}</span> : null}
                {weak && <span class="warn"> · {t('char.needStr', { n: need })}</span>}
              </span>
              <button class="btn btn-small" disabled={weak} onClick={() => wear(i.uid)}>
                {t('char.wear')}
              </button>
            </div>
          );
        })}
        <p class="small muted">{t('char.weightNote', { w: num(wornWeight(c), 1), s: roundStamina(c) })}</p>
      </div>
    </Card>
  );
}
