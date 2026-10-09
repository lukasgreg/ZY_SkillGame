import type { ComponentChildren } from 'preact';
import { durState } from '../data/items';
import type { ItemInstance, LogEntry } from '../engine/state';
import { t } from '../i18n';

export function Card(props: { title?: ComponentChildren; note?: ComponentChildren; class?: string; children: ComponentChildren }) {
  return (
    <section class={`card ${props.class ?? ''}`}>
      {props.title && <h2 class="card-title">{props.title}</h2>}
      {props.note && <p class="card-note">{props.note}</p>}
      {props.children}
    </section>
  );
}

export function Meter(props: { value: number; max: number; kind: 'hp' | 'stamina' | 'weight' | 'skill' | 'dur' | 'xp'; label?: string }) {
  const pct = props.max > 0 ? Math.max(0, Math.min(100, (props.value / props.max) * 100)) : 0;
  return (
    <div class={`meter meter-${props.kind}`} role="meter" aria-valuenow={props.value} aria-valuemax={props.max} aria-label={props.label}>
      <span style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Durability({ it }: { it: ItemInstance }) {
  const st = durState(it.dur, it.maxDur);
  return (
    <div class={`dur dur-${st}`}>
      <Meter value={it.dur} max={it.maxDur} kind="dur" />
      <span class="dur-text">
        {t(`dur.${st}`)} · {it.dur}/{it.maxDur}
      </span>
    </div>
  );
}

export function JournalLines({ entries, limit }: { entries: LogEntry[]; limit?: number }) {
  const list = (limit ? entries.slice(-limit) : entries).slice().reverse();
  if (!list.length) return <p class="muted">{t('journal.empty')}</p>;
  return (
    <ol class="journal">
      {list.map((e, i) => (
        <li key={`${e.t}-${i}`} class={e.c ?? ''}>
          {t(e.k, e.p)}
        </li>
      ))}
    </ol>
  );
}
