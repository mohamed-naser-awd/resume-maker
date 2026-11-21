import { useEffect, useState } from 'react';
import { TOKENS } from '@/di/tokens';
import { DEFAULT_MODELS, type ProviderId, type Settings } from '@/domain/settings';
import { ErrorBanner } from '../shared/ErrorBanner';
import { hasAllSitesAccess, requestAllSitesAccess } from '../shared/chromeUi';
import { useService } from '../shared/services';
import { useAction } from '../shared/useAction';

const PROVIDERS: { id: ProviderId; label: string; keyHint: string; keyUrl: string; ready: boolean }[] = [
  { id: 'claude', label: 'Anthropic Claude', keyHint: 'sk-ant-…', keyUrl: 'https://console.anthropic.com/settings/keys', ready: true },
  { id: 'openai', label: 'OpenAI (not implemented yet)', keyHint: 'sk-…', keyUrl: 'https://platform.openai.com/api-keys', ready: false },
];

export function OptionsApp() {
  const settingsRepo = useService(TOKENS.settingsRepo);
  const llm = useService(TOKENS.llm);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [showKey, setShowKey] = useState(false);
  const [saved, setSaved] = useState(false);
  const [tested, setTested] = useState(false);
  const [siteAccess, setSiteAccess] = useState(false);

  useEffect(() => {
    void settingsRepo.get().then(setSettings);
    void hasAllSitesAccess().then(setSiteAccess);
  }, [settingsRepo]);

  const save = useAction(async (next: Settings) => {
    await settingsRepo.save(next);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  });

  const test = useAction(async () => {
    setTested(false);
    if (settings) await settingsRepo.save(settings);
    await llm.testConnection();
    setTested(true);
  });

  if (!settings) return null;
  const provider = settings.provider;
  const current = settings.providers[provider];
  const meta = PROVIDERS.find((p) => p.id === provider)!;

  const update = (patch: Partial<Settings>) => setSettings({ ...settings, ...patch });
  const updateProvider = (patch: Partial<Settings['providers'][ProviderId]>) =>
    update({ providers: { ...settings.providers, [provider]: { ...current, ...patch } } });

  return (
    <main className="options">
      <h1>Resume Maker – Settings</h1>

      <section className="card">
        <h2>AI provider</h2>
        <label className="field">
          Provider
          <select value={provider} onChange={(e) => update({ provider: e.target.value as ProviderId })}>
            {PROVIDERS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          API key
          <div className="row" style={{ flexWrap: 'nowrap' }}>
            <input
              type={showKey ? 'text' : 'password'}
              value={current.apiKey}
              placeholder={meta.keyHint}
              autoComplete="off"
              spellCheck={false}
              onChange={(e) => updateProvider({ apiKey: e.target.value })}
            />
            <button className="btn small" type="button" onClick={() => setShowKey((s) => !s)}>
              {showKey ? 'Hide' : 'Show'}
            </button>
          </div>
        </label>
        <p className="muted small">
          Stored only in this browser (chrome.storage.local), never in the extension code. Get a key at{' '}
          <a href={meta.keyUrl} target="_blank" rel="noreferrer">
            {new URL(meta.keyUrl).host}
          </a>
          .
        </p>

        <label className="field">
          Model
          <input type="text" value={current.model} spellCheck={false} onChange={(e) => updateProvider({ model: e.target.value })} />
        </label>
        <p className="muted small">
          Default: <code>{DEFAULT_MODELS[provider]}</code>.{' '}
          {current.model !== DEFAULT_MODELS[provider] && (
            <button className="btn small ghost" type="button" onClick={() => updateProvider({ model: DEFAULT_MODELS[provider] })}>
              Reset
            </button>
          )}
        </p>

        <div className="row">
          <button className="btn primary" onClick={() => save.run(settings)} disabled={save.busy}>
            Save
          </button>
          <button className="btn" onClick={() => test.run()} disabled={test.busy || !current.apiKey || !meta.ready}>
            {test.busy && <span className="spinner" />} Test connection
          </button>
          {saved && <span className="muted small">Saved ✓</span>}
        </div>
        {tested && <div className="banner success">Connected – the key and model work.</div>}
        <ErrorBanner error={test.error ?? save.error} onDismiss={() => (test.clearError(), save.clearError())} />
      </section>

      <section className="card">
        <h2>Autofill</h2>
        <label className="check">
          <input
            type="checkbox"
            checked={settings.skipSensitiveFields}
            onChange={(e) => update({ skipSensitiveFields: e.target.checked })}
          />
          Never fill demographic / EEO, password, ID or payment fields (recommended)
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={settings.attachResumeOnFill}
            onChange={(e) => update({ attachResumeOnFill: e.target.checked })}
          />
          Attach the generated resume PDF to resume upload fields
        </label>
        <div className="row">
          <button className="btn primary" onClick={() => save.run(settings)} disabled={save.busy}>
            Save
          </button>
        </div>
      </section>

      <section className="card">
        <h2>Page access</h2>
        <p className="muted small">
          To read job postings and fill forms (including forms embedded in iframes), Resume Maker needs access to the pages you
          use it on. It only runs when you press a button in the side panel and never submits forms.
        </p>
        {siteAccess ? (
          <div className="banner success">Access granted for all sites.</div>
        ) : (
          <div className="row">
            <button className="btn" onClick={async () => setSiteAccess(await requestAllSitesAccess())}>
              Allow on all sites
            </button>
            <span className="muted small">Without this, it works only on the tab where you clicked the toolbar icon.</span>
          </div>
        )}
      </section>
    </main>
  );
}
