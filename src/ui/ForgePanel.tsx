import { useState } from 'preact/hooks';
import { METALS, METAL_IDS, type MetalId } from '../data/items';
import { RECIPES, type Recipe } from '../data/recipes';
import { SMELTING, type ResourceId } from '../data/resources';
import type { SkillId } from '../data/skills';
import { canCraft, craftChance, exceptionalChance, recipeInputs, recipeRange, repairInfo, smeltChance } from '../engine/craft';
import type { Character } from '../engine/state';
import { itemName, nameOf, num, t } from '../i18n';
import { craftItem, repairOwn, smeltOre, stopQueue, travel } from './actions';
import { Card, Durability } from './common';
import { Pack } from './Pack';
import { transient } from './store';

const CRAFT_SKILLS: SkillId[] = ['blacksmithing', 'tinkering'];
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

function RecipeRow({ c, r, metal }: { c: Character; r: Recipe; metal: MetalId | null }) {
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
          <button class="btn btn-small" disabled={busy || block !== null} onClick={() => craftItem(r, metal, 1)}>
            {t('forge.craft')}
          </button>
          <button class="btn btn-small" disabled={busy || block !== null} onClick={() => craftItem(r, metal, 5)}>
            {t('forge.craftN', { n: 5 })}
          </button>
        </span>
      </div>
    </li>
  );
}

export function ForgePanel({ c }: { c: Character }) {
  const [skill, setSkill] = useState<SkillId>('blacksmithing');
  const [metal, setMetal] = useState<MetalId>('iron');
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
          <div class="row tight">
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
                <button key={m} role="radio" aria-checked={metal === m} class={`metal ${metal === m ? 'on' : ''}`} onClick={() => setMetal(m)}>
                  {t(`res.${METALS[m].bar}`)} <span class="muted">({c.pack.res[METALS[m].bar] ?? 0})</span>
                </button>
              ))}
            </div>
          )}
          <WorkBar />
          <ul class="recipes">
            {recipes.map((r) => (
              <RecipeRow key={r.id} c={c} r={r} metal={r.bars ? metal : null} />
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
