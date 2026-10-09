import { useState } from 'preact/hooks';
import { TAMEABLE } from '../data/dungeons';
import { xpToNext } from '../engine/levels';
import type { ResourceId } from '../data/resources';
import { PET_MAX_LEVEL, RESURRECT_BANDAGES, RESURRECT_SKILL, loyaltyNow, maxSlots, petFood, petMaxHp, usedSlots, vetHeal } from '../engine/pets';
import { transient } from './store';
import type { Character, Pet } from '../engine/state';
import { skillNum, t } from '../i18n';
import { feedPet, releasePet, resurrectPet, vetPet } from './actions';
import { Card, Meter } from './common';

function PetRow({ c, p }: { c: Character; p: Pet }) {
  const [confirm, setConfirm] = useState(false);
  const loyalty = Math.round(loyaltyNow(p));
  const food = (Object.keys(c.pack.res) as ResourceId[]).find((id) => petFood(id));
  return (
    <li class="worker">
      <div class="worker-head">
        <strong>{t(`mon.${p.kind}`)}</strong>
        <span class="small">{t('hud.level', { n: p.level ?? 1 })}</span>
        {p.bonded && <span class="pill pill-working">{t('pet.bonded')}</span>}
        {p.dead && <span class="pill pill-unpaid">{t('pet.spirit')}</span>}
        <span class="muted small">{t('pet.slots', { count: TAMEABLE[p.kind]?.slots ?? 1, n: TAMEABLE[p.kind]?.slots ?? 1 })}</span>
      </div>
      <div class="hud-bar small">
        <span>{t('hud.hp')}</span>
        <Meter value={p.hp} max={petMaxHp(p)} kind="hp" />
        <b>
          {Math.floor(p.hp)}/{petMaxHp(p)}
        </b>
      </div>
      <div class="hud-bar small">
        <span>{t('pet.loyalty')}</span>
        <Meter value={loyalty} max={100} kind="weight" />
        <b>{loyalty}%</b>
      </div>
      <div class="small">
        {t('pet.skill')} <b>{skillNum(p.skill)}</b>
        {(p.level ?? 1) < PET_MAX_LEVEL && <span class="muted"> · {t('pet.xp', { xp: Math.floor(p.xp ?? 0), next: xpToNext(p.level ?? 1) })}</span>}
      </div>
      <div class="row">
        {!p.dead && (
          <button class="btn btn-small" disabled={!food} onClick={() => food && feedPet(p.id, food)}>
            {food ? t('pet.feed', { food: t(`res.${food}`) }) : t('pet.noFood')}
          </button>
        )}
        {!p.dead && (
          <button class="btn btn-small" disabled={!!transient.busy || !(c.pack.res.bandage ?? 0) || p.hp >= petMaxHp(p)} onClick={() => vetPet(p.id)}>
            {t('pet.heal', { n: vetHeal(c) })}
          </button>
        )}
        {p.dead && (
          <button class="btn btn-small btn-primary" disabled={c.skills.animalHealing < RESURRECT_SKILL || (c.pack.res.bandage ?? 0) < RESURRECT_BANDAGES} onClick={() => resurrectPet(p.id)}>
            {t('pet.resurrect')}
          </button>
        )}
        {confirm ? (
          <>
            <button class="btn btn-small btn-danger" onClick={() => releasePet(p.id)}>
              {t('pet.releaseYes')}
            </button>
            <button class="btn btn-small" onClick={() => setConfirm(false)}>
              {t('settings.cancel')}
            </button>
          </>
        ) : (
          <button class="btn btn-small btn-quiet" onClick={() => setConfirm(true)}>
            {t('pet.release')}
          </button>
        )}
      </div>
    </li>
  );
}

export function Stable({ c }: { c: Character }) {
  if (!c.pets.length && c.skills.taming < 100) return null;
  return (
    <Card title={t('pet.title', { n: usedSlots(c), max: maxSlots(c) })} note={t('pet.note')}>
      {c.pets.length === 0 ? (
        <p class="muted small">{t('pet.none')}</p>
      ) : (
        <ul class="workers">
          {c.pets.map((p) => (
            <PetRow key={p.id} c={c} p={p} />
          ))}
        </ul>
      )}
    </Card>
  );
}
