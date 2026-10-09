import { useEffect, useState } from 'preact/hooks';
import { activeChar } from '../engine/state';
import { t } from '../i18n';
import { AchievementToast, AchievementsPanel } from './AchievementsPanel';
import { CharacterPanel } from './CharacterPanel';
import { Card, JournalLines } from './common';
import { Create } from './Create';
import { DungeonPanel } from './DungeonPanel';
import { ForgePanel } from './ForgePanel';
import { Header } from './Header';
import { GatherPanel } from './GatherPanel';
import { SettingsPanel } from './SettingsPanel';
import { SkillsPanel } from './SkillsPanel';
import { TownPanel } from './TownPanel';
import { useGame } from './store';
import { WorkersPanel } from './WorkersPanel';

const TABS = ['gather', 'town', 'forge', 'workers', 'dungeon', 'skills', 'character', 'achievements', 'journal', 'settings'] as const;
type Tab = (typeof TABS)[number];

function readTab(): Tab {
  const h = location.hash.slice(1);
  return (TABS as readonly string[]).includes(h) ? (h as Tab) : 'gather';
}

export function App() {
  const s = useGame();
  const [tab, setTab] = useState<Tab>(readTab);
  const [creating, setCreating] = useState(false);
  const c = activeChar(s);

  useEffect(() => {
    document.title = c ? `${c.name} · ${t('app.title')}` : t('app.title');
  });

  const go = (next: Tab) => {
    setTab(next);
    history.replaceState(null, '', `#${next}`);
  };

  if (!c || creating) {
    return (
      <main class="shell">
        <Create onCancel={c ? () => setCreating(false) : undefined} onCreated={() => setCreating(false)} />
      </main>
    );
  }

  return (
    <main class="shell">
      <Header c={c} />
      <AchievementToast />
      <nav class="tabs" aria-label="Main">
        {TABS.map((id) => (
          <button key={id} class={`tab ${tab === id ? 'on' : ''}`} aria-current={tab === id ? 'page' : undefined} onClick={() => go(id)}>
            {t(`nav.${id}`)}
          </button>
        ))}
      </nav>
      {c.location === 'dungeon' && (tab === 'gather' || tab === 'town' || tab === 'forge') ? (
        <Card title={t(`dun.${c.run?.dungeon ?? 'cellar'}`)}>
          <p>{t('dun.youAreIn')}</p>
          <button class="btn btn-primary" onClick={() => go('dungeon')}>
            {t('nav.dungeon')}
          </button>
        </Card>
      ) : (
        <>
          {tab === 'gather' && <GatherPanel s={s} c={c} />}
          {tab === 'town' && <TownPanel s={s} c={c} />}
          {tab === 'forge' && <ForgePanel c={c} />}
        </>
      )}
      {tab === 'dungeon' && <DungeonPanel s={s} c={c} />}
      {tab === 'workers' && <WorkersPanel s={s} c={c} />}
      {tab === 'skills' && <SkillsPanel c={c} />}
      {tab === 'character' && <CharacterPanel c={c} />}
      {tab === 'journal' && (
        <Card title={t('journal.title')}>
          <JournalLines entries={s.journal} />
        </Card>
      )}
      {tab === 'achievements' && <AchievementsPanel s={s} />}
      {tab === 'settings' && <SettingsPanel s={s} onNewChar={() => setCreating(true)} />}
    </main>
  );
}

