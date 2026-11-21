import { useEffect, useState } from 'react';
import { TOKENS } from '@/di/tokens';
import { activeProvider } from '@/domain/settings';
import { useService } from '../shared/services';
import { ApplyTab } from './ApplyTab';
import { ChatTab } from './ChatTab';
import { ProfileTab } from './ProfileTab';
import { HistoryView } from '../history/HistoryView';

type TabId = 'apply' | 'chat' | 'profile' | 'history';
const TABS: { id: TabId; label: string }[] = [
  { id: 'apply', label: 'Apply' },
  { id: 'chat', label: 'Accomplishments' },
  { id: 'profile', label: 'Profile' },
  { id: 'history', label: 'History' },
];

export function App() {
  const settingsRepo = useService(TOKENS.settingsRepo);
  const [tab, setTab] = useState<TabId>('apply');
  const [hasKey, setHasKey] = useState(true);

  useEffect(() => {
    const check = () => settingsRepo.get().then((s) => setHasKey(!!activeProvider(s).apiKey));
    void check();
    return settingsRepo.onChange((s) => setHasKey(!!activeProvider(s).apiKey));
  }, [settingsRepo]);

  return (
    <div className="app">
      <header className="app-header">
        <h1>Resume Maker</h1>
        <button className="btn small ghost" onClick={() => chrome.runtime.openOptionsPage()} title="Settings">
          ⚙ Settings
        </button>
      </header>
      <nav className="tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t.id} role="tab" className="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </nav>
      <div className="tab-body">
        {!hasKey && (
          <div className="banner warn">
            <span>Add your API key to get started.</span>
            <button className="btn small" onClick={() => chrome.runtime.openOptionsPage()}>
              Open Settings
            </button>
          </div>
        )}
        {/* Tabs stay mounted so in-progress work survives switching. */}
        <div hidden={tab !== 'apply'} className="stack" style={{ gap: 12 }}>
          <ApplyTab onGoToProfile={() => setTab('profile')} />
        </div>
        <div hidden={tab !== 'chat'} className="stack" style={{ gap: 12 }}>
          <ChatTab />
        </div>
        <div hidden={tab !== 'profile'} className="stack" style={{ gap: 12 }}>
          <ProfileTab />
        </div>
        <div hidden={tab !== 'history'} className="stack" style={{ gap: 12 }}>
          <HistoryView compact />
        </div>
      </div>
    </div>
  );
}
