import { useState } from 'preact/hooks';
import { METALS, METAL_IDS, type MetalId } from '../data/items';
import { RECIPES, type Recipe } from '../data/recipes';
import { SMELTING, type ResourceId } from '../data/resources';
import type { SkillId } from '../data/skills';
import { canCraft, canRunic, craftChance, exceptionalChance, findTool, recipeInputs, recipeRange, repairInfo, smeltChance } from '../engine/craft';
import { FRAGMENTS_PER_PLAN, PLANS, PLAN_IDS } from '../data/plans';
import type { Character } from '../engine/state';
import { itemName, nameOf, num, t } from '../i18n';
import { combine, craftFromPlan, craftItem, fortifyItem, repairOwn, smeltOre, stopQueue, travel } from './actions';
import { Card, Durability } from './common';
import { Pack } from './Pack';
import { transient } from './store';

const CRAFT_SKILLS: SkillId[] = ['blacksmithing', 'tinkering', 'carpentry', 'bowcraft', 'tailoring', 'cooking'];
const pct = (p: number) => Math.round(p * 100);

/** Progress strip for the action in progress, with a Stop for batches. */
export function WorkBar() {
  const b = transient.busy;
  if (!b || (b.kind !== 'craft' && b.kind !== 'smelt' && b.kind !== 'repair')) return null;
  return (
    <div class="workbar">
      <div class="workbar-track">
        <span key={b.start} style={{ animationDuration: `${b.dur}ms` }} />
      </div>
      {transient.queue > 0 && (
        <>
          <span class="muted small">{t('forge.queue', { n: transient.queue })}</span>
          <button class="btn btn-small" onClick={stopQueue}>
            {t('forge.stop')}
          </button>
        </>
      )}
    </div>
  );
}

function RecipeRow({ c, r, metal, runic }: { c: Character; r: Recipe; metal: MetalId | null; runic: boolean }) {
  const busy = !!transient.busy;
  const [min, max] = recipeRange(r, metal);
  const block = canCraft(c, r, metal);
  const skill = c.skills[r.skill] / 10;
  const name = 'item' in r.out ? itemName(r.out.item, metal) : t(`res.${r.out.res}`);
  const inputs = recipeInputs(r, metal);
  return (
    <li class={`recipe ${block === 'noSkill' ? 'off' : ''}`}>
      <div class="recipe-head">
        <strong>{name}</strong>
        <span class="muted small">
          {num(min)}–{num(max)}
        </span>
      </div>
      <div class="recipe-needs small">
        {inputs.map(([id, n]) => (
          <span key={id} class={(c.pack.res[id] ?? 0) < n ? 'short' : ''}>
            {n}× {t(`res.${id}`)} <span class="muted">({c.pack.res[id] ?? 0})</span>
          </span>
        ))}
      </div>
      <div class="recipe-foot">
        {block === 'noSkill' ? (
          <span class="muted small">{t('forge.block.noSkill', { skill: t(`skill.${r.skill}`), n: min })}</span>
        ) : block === 'noTool' ? (
          <span class="warn small">{t('forge.block.noTool', { tool: itemName(r.tool) })}</span>
        ) : (
          <span class="small">
            {t('forge.chance', { p: pct(craftChance(skill, min, max)) })}
            {'item' in r.out && <> · {t('forge.exc', { p: pct(exceptionalChance(c, r, metal)) })}</>}
          </span>
        )}
        <span class="recipe-btns">
          <button class="btn btn-small" disabled={busy || block !== null} onClick={() => craftItem(r, metal, 1, runic && canRunic(c, r))}>
            {t('forge.craft')}
          </button>
          <button class="btn btn-small" disabled={busy || block !== null} onClick={() => craftItem(r, metal, 5, runic && canRunic(c, r))}>
            {t('forge.craftN', { n: 5 })}
          </button>
        </span>
      </div>
    </li>
  );
}

function PlansCard({ c }: { c: Character }) {
  const busy = !!transient.busy;
  const owned = PLAN_IDS.filter((id) => (c.plans[id] ?? 0) > 0);
  const frags = c.pack.res.planFragment ?? 0;
  const powder = c.pack.res.fortifyingPowder ?? 0;
  if (!owned.length && !frags && !powder) return null;
  return (
    <Card title={t('plan.title')} note={t('plan.note')}>
      {frags > 0 && (
        <div class="row tight">
          <span class="small">{t('plan.fragments', { n: frags, need: FRAGMENTS_PER_PLAN })}</span>
          <button class="btn btn-small" disabled={frags < FRAGMENTS_PER_PLAN} onClick={combine}>
            {t('plan.combine')}
          </button>
        </div>
      )}
      <ul class="recipes">
        {owned.map((id) => {
          const r = PLANS[id];
          const block = canCraft(c, r, null);
          const skill = c.skills[r.skill] / 10;
          return (
            <li key={id} class="recipe">
              <div class="recipe-head">
                <strong class="plan-name">
                  {t(`plan.${id}`)} <span class="muted">×{c.plans[id]}</span>
                </strong>
                <span class="muted small">
                  {t(`skill.${r.skill}`)} {r.min}–{r.max}
                </span>
              </div>
              <div class="small muted">{t(`plan.${id}.desc`)}</div>
              <div class="recipe-needs small">
                {recipeInputs(r, null).map(([rid, n]) => (
                  <span key={rid} class={(c.pack.res[rid] ?? 0) < n ? 'short' : ''}>
                    {n}× {t(`res.${rid}`)} <span class="muted">({c.pack.res[rid] ?? 0})</span>
                  </span>
                ))}
              </div>
              <div class="recipe-foot">
                <span class="small">
                  {block ? t(`forge.block.${block}`, { tool: itemName(r.tool), skill: t(`skill.${r.skill}`), n: r.min }) : t('forge.chance', { p: pct(craftChance(skill, r.min, r.max)) })}
                </span>
                <button class="btn btn-small btn-primary" disabled={busy || block !== null} onClick={() => craftFromPlan(id)}>
                  {t('forge.craft')}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      {powder > 0 && (
        <>
          <p class="card-note">{t('plan.fortifyNote', { n: powder })}</p>
          {c.pack.items.map((i) => (
            <div class="row tight" key={i.uid}>
              <span class="small">
                {nameOf(i)} <span class="muted">{i.dur}/{i.maxDur}</span>
              </span>
              <button class="btn btn-small" onClick={() => fortifyItem(i)}>
                {t('plan.fortify')}
              </button>
            </div>
          ))}
        </>
      )}
    </Card>
  );
}

export function ForgePanel({ c }: { c: Character }) {
  const [skill, setSkill] = useState<SkillId>('blacksmithing');
  const [metal, setMetal] = useState<MetalId>('iron');
  const [runic, setRunic] = useState(false);
  const hammer = findTool(c, 'runicHammer');
  const busy = !!transient.busy;

  if (c.location !== 'town') {
    return (
      <Card title={t('nav.forge')}>
        <p>{t('forge.notHere')}</p>
        <button class="btn btn-primary" disabled={busy} onClick={() => travel('town')}>
          {transient.busy?.kind === 'travel' ? t('mine.walking') : t('mine.goTown')}
        </button>
      </Card>
    );
  }

  const recipes = RECIPES.filter((r) => r.skill === skill);
  const ores = (Object.keys(SMELTING) as ResourceId[]).filter((o) => (c.pack.res[o] ?? 0) > 0);
  const damaged = c.pack.items.filter((i) => i.dur < i.maxDur && repairInfo(c, i));

  return (
    <div class="grid-2">
      <div class="stack">
        <Card>
          <div class="crafts">
            {CRAFT_SKILLS.map((id) => (
              <button key={id} class={`chip ${skill === id ? 'on' : ''}`} onClick={() => setSkill(id)}>
                <b>{t(`skill.${id}`)}</b>
                <span>{num(c.skills[id] / 10, 1)}</span>
              </button>
            ))}
          </div>
          {skill === 'blacksmithing' && (
            <div class="metals" role="radiogroup" aria-label={t('forge.metal')}>
              {METAL_IDS.map((m) => (
                <button key={m} role="radio" aria-checked={metal === m} class={`metal ${metal === m ? 'on' : ''}`} onClick={() => setMetal(m)} title={m === 'iron' ? undefined : t(`metal.fx.${m}`)}>
                  {t(`res.${METALS[m].bar}`)} <span class="muted">({c.pack.res[METALS[m].bar] ?? 0})</span>
                </button>
              ))}
            </div>
          )}
          {skill === 'blacksmithing' && hammer && (
            <label class="runic">
              <input type="checkbox" id="use-runic" checked={runic} onChange={(e) => setRunic((e.target as HTMLInputElement).checked)} />
              {t('forge.useRunic', { n: hammer.dur })}
            </label>
          )}
          {skill === 'blacksmithing' && metal !== 'iron' && <p class="small muted metal-fx">{t(`metal.fx.${metal}`)}</p>}
          <WorkBar />
          <ul class="recipes">
            {recipes.map((r) => (
              <RecipeRow key={r.id} c={c} r={r} metal={r.bars ? metal : null} runic={runic} />
            ))}
          </ul>
        </Card>
      </div>

      <div class="stack">
        <Card title={t('forge.smelter')} note={t('forge.smelterNote')}>
          {ores.length === 0 ? (
            <p class="muted">{t('forge.noOre')}</p>
          ) : (
            <table class="trade">
              <tbody>
                {ores.map((o) => {
                  const p = smeltChance(c, o);
                  const n = c.pack.res[o] ?? 0;
                  return (
                    <tr key={o}>
                      <th>
                        {t(`res.${o}`)} <span class="muted">× {n}</span>
                      </th>
                      <td class="muted small">{p > 0 ? t('forge.chance', { p: pct(p) }) : t('forge.needMining', { n: SMELTING[o]!.min })}</td>
                      <td class="actions">
                        <button class="btn btn-small" disabled={busy || p <= 0 || n < 2} onClick={() => smeltOre(o, 1)}>
                          {t('forge.smelt')}
                        </button>
                        <button class="btn btn-small" disabled={busy || p <= 0 || n < 2} onClick={() => smeltOre(o, Math.floor(n / 2) + 2)}>
                          {t('forge.smeltAll')}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Card>

        <PlansCard c={c} />
        <Card title={t('forge.repairs')} note={t('forge.repairsNote')}>
          {damaged.length === 0 ? (
            <p class="muted">{t('forge.nothingToRepair')}</p>
          ) : (
            damaged.map((i) => {
              const info = repairInfo(c, i)!;
              const hasTool = c.pack.items.some((x) => x.def === info.tool);
              return (
                <div class="tool alt" key={i.uid}>
                  <span>{nameOf(i)}</span>
                  <Durability it={i} />
                  {hasTool ? (
                    <button class="btn btn-small" disabled={busy} onClick={() => repairOwn(i)}>
                      {t('forge.repair', { p: pct(info.p) })}
                    </button>
                  ) : (
                    <span class="warn small">{t('forge.block.noTool', { tool: itemName(info.tool) })}</span>
                  )}
                </div>
              );
            })
          )}
        </Card>
        <Pack c={c} />
      </div>
    </div>
  );
}
