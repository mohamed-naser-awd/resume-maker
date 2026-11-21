import { useEffect, useMemo, useRef, useState } from 'react';
import type { TailorResult } from '@/application/TailorResumeUseCase';
import { TOKENS } from '@/di/tokens';
import type { AutofillResult, FillPlan, FormDetection } from '@/domain/form';
import type { FillMode } from '@/domain/settings';
import { FillReview } from './FillReview';
import type { JobPosting } from '@/domain/job';
import { resumeToPlainText } from '@/domain/resume';
import { ErrorBanner } from '../shared/ErrorBanner';
import { downloadBytes } from '../shared/chromeUi';
import { useService } from '../shared/services';
import { useAction } from '../shared/useAction';

const emptyJob = (): JobPosting => ({ title: '', company: '', location: '', description: '', url: '' });

export function ApplyTab({ onGoToProfile }: { onGoToProfile: () => void }) {
  const jobs = useService(TOKENS.jobs);
  const tailor = useService(TOKENS.tailor);
  const autofill = useService(TOKENS.autofill);
  const profiles = useService(TOKENS.profileService);
  const settingsRepo = useService(TOKENS.settingsRepo);
  const pageEvents = useService(TOKENS.pageEvents);

  const [job, setJob] = useState<JobPosting | null>(null);
  const [result, setResult] = useState<TailorResult | null>(null);
  const [fill, setFill] = useState<AutofillResult | null>(null);
  const [hasProfile, setHasProfile] = useState(true);
  const [copied, setCopied] = useState(false);
  const [plan, setPlan] = useState<FillPlan | null>(null);
  const [detected, setDetected] = useState<FormDetection | null>(null);
  const [fillMode, setFillMode] = useState<FillMode>('confirm');

  useEffect(() => {
    void profiles.get().then((p) => setHasProfile(!!p.sourceResumeText || p.experience.length > 0));
  }, [profiles]);

  useEffect(() => {
    void settingsRepo.get().then((s) => setFillMode(s.fillMode));
    return settingsRepo.onChange((s) => setFillMode(s.fillMode));
  }, [settingsRepo]);

  const detect = useAction(async () => {
    setResult(null);
    setFill(null);
    setJob(await jobs.detectFromPage());
  });
  const generate = useAction(async () => {
    if (!job) return;
    setFill(null);
    setResult(await tailor.execute(job));
  });
  /** Job context helps the AI answer open questions; try the page silently if none is set. */
  const jobContext = async () => {
    if (job) return job;
    const found = await jobs.detectFromPage().catch(() => null);
    if (found) setJob(found);
    return found;
  };

  // Fill button: "review first" prepares a plan; "automatic" fills straight away.
  const runFill = useAction(async (mode: FillMode) => {
    setFill(null);
    setPlan(null);
    const input = { job: await jobContext(), resumeDocument: result?.document ?? null };
    if (mode === 'auto') setFill(await autofill.execute(input));
    else setPlan(await autofill.prepare(input));
  });
  const applyPlan = useAction(async (edited: FillPlan) => {
    setFill(await autofill.apply(edited, result?.document ?? null));
    setPlan(null);
  });

  // Watch the active tab: detect application forms (no AI) and auto-fill in automatic mode.
  const latest = useRef({ fillMode, hasProfile, busy: false, run: runFill.run });
  latest.current = { fillMode, hasProfile, busy: runFill.busy || applyPlan.busy, run: runFill.run };
  useEffect(() => {
    let timers: ReturnType<typeof setTimeout>[] = [];
    const autoFilled = new Set<string>();
    const unsubscribe = pageEvents.onActivePageReady(() => {
      timers.forEach(clearTimeout);
      setDetected(null);
      // Forms on single-page apps render late, so check a few times.
      timers = [800, 2500, 5000].map((delay) =>
        setTimeout(async () => {
          const d = await autofill.detectForm().catch(() => null);
          if (!d?.likely) return;
          timers.forEach(clearTimeout);
          setDetected(d);
          const s = latest.current;
          if (s.fillMode === 'auto' && s.hasProfile && !s.busy && !autoFilled.has(d.url)) {
            autoFilled.add(d.url);
            void s.run('auto');
          }
        }, delay),
      );
    });
    return () => {
      unsubscribe();
      timers.forEach(clearTimeout);
    };
  }, [pageEvents, autofill]);

  const pdfUrl = useMemo(
    () => (result ? URL.createObjectURL(new Blob([result.document.bytes as BlobPart], { type: result.document.mimeType })) : null),
    [result],
  );
  useEffect(() => () => void (pdfUrl && URL.revokeObjectURL(pdfUrl)), [pdfUrl]);

  const anyBusy = detect.busy || generate.busy || runFill.busy || applyPlan.busy;

  return (
    <>
      {!hasProfile && (
        <div className="banner info">
          <span>Start by uploading your resume.</span>
          <button className="btn small" onClick={onGoToProfile}>
            Go to Profile
          </button>
        </div>
      )}

      <section className="card">
        <h2>1. Job posting</h2>
        <p className="muted small">Open the job posting or application page, then detect it. You can edit or paste the description.</p>
        <div className="row">
          <button className="btn primary" disabled={anyBusy} onClick={() => detect.run()}>
            {detect.busy ? <><span className="spinner" /> Reading page…</> : 'Detect job from this page'}
          </button>
          {!job && (
            <button className="btn" onClick={() => setJob(emptyJob())}>
              Paste manually
            </button>
          )}
        </div>
        <ErrorBanner error={detect.error} onDismiss={detect.clearError} onPermissionGranted={() => detect.run()} />
        {job && (
          <div className="stack">
            <div className="grid2">
              <label className="field">Job title<input type="text" value={job.title} onChange={(e) => setJob({ ...job, title: e.target.value })} /></label>
              <label className="field">Company<input type="text" value={job.company} onChange={(e) => setJob({ ...job, company: e.target.value })} /></label>
            </div>
            <label className="field">
              Description ({job.description.length.toLocaleString()} chars)
              <textarea rows={6} value={job.description} onChange={(e) => setJob({ ...job, description: e.target.value })} />
            </label>
          </div>
        )}
      </section>

      <section className="card">
        <h2>2. Tailored resume</h2>
        <button className="btn primary" disabled={anyBusy || !job || job.description.trim().length < 50} onClick={() => generate.run()}>
          {generate.busy ? <><span className="spinner" /> Tailoring resume… (up to a minute)</> : result ? 'Regenerate resume' : 'Generate ATS resume'}
        </button>
        <ErrorBanner error={generate.error} onDismiss={generate.clearError} />
        {result && pdfUrl && (
          <>
            <AtsSummary result={result} />
            <div className="row">
              <button className="btn" onClick={() => downloadBytes(result.document.bytes, result.document.fileName, result.document.mimeType)}>
                ⬇ Download PDF
              </button>
              <button className="btn" onClick={() => window.open(pdfUrl, '_blank')}>
                Open in tab
              </button>
              <button
                className="btn"
                onClick={async () => {
                  await navigator.clipboard.writeText(resumeToPlainText(result.resume));
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }}
              >
                {copied ? 'Copied ✓' : 'Copy as text'}
              </button>
            </div>
            <iframe className="pdf-frame" src={pdfUrl} title="Resume preview" />
          </>
        )}
      </section>

      <section className="card">
        <div className="row between">
          <h2>3. Fill the application</h2>
          <button className="btn small ghost" onClick={() => chrome.runtime.openOptionsPage()} title="Change in Settings">
            Mode: {fillMode === 'auto' ? 'Automatic' : 'Review first'}
          </button>
        </div>
        <p className="muted small">
          {fillMode === 'auto'
            ? 'Application forms are filled automatically when detected while this panel is open. You can also fill any page with the button.'
            : 'You review every value before anything is written to the page.'}{' '}
          Filled fields get a green outline, required ones left for you an orange one. Nothing is ever submitted.
          {result ? ' The generated PDF is attached to the resume upload field.' : ' Generate a resume first to also attach it.'}
        </p>
        {detected && !plan && !fill && !runFill.busy && (
          <div className="banner info">
            <span>Application form detected on this page ({detected.fieldCount} fields).</span>
          </div>
        )}
        <button className="btn primary" disabled={anyBusy || !hasProfile} onClick={() => runFill.run(fillMode)}>
          {runFill.busy ? (
            <><span className="spinner" /> {fillMode === 'auto' ? 'Filling form…' : 'Preparing answers…'}</>
          ) : fillMode === 'auto' ? (
            'Fill this page'
          ) : (
            'Review & fill this page'
          )}
        </button>
        <ErrorBanner error={runFill.error ?? applyPlan.error} onDismiss={() => (runFill.clearError(), applyPlan.clearError())} onPermissionGranted={() => runFill.run(fillMode)} />
        {plan && <FillReview key={plan.items.map((i) => i.field.id).join()} plan={plan} busy={applyPlan.busy} onConfirm={(p) => applyPlan.run(p)} onCancel={() => setPlan(null)} />}
        {fill && <FillSummary fill={fill} />}
      </section>
    </>
  );
}

function AtsSummary({ result }: { result: TailorResult }) {
  const { ats } = result;
  const cls = ats.keywordCoverage >= 75 ? 'good' : ats.keywordCoverage >= 50 ? 'ok' : 'bad';
  return (
    <div className="stack">
      <div className="row">
        <span className={`score ${cls}`}>{ats.keywordCoverage}%</span>
        <span className="muted small">of the job's key terms appear in your tailored resume</span>
      </div>
      {ats.matchedKeywords.length > 0 && (
        <div className="chips">{ats.matchedKeywords.map((k) => <span key={k} className="chip">{k}</span>)}</div>
      )}
      {ats.missingKeywords.length > 0 && (
        <details>
          <summary className="small">Missing terms ({ats.missingKeywords.length}) – add them via Accomplishments if you truly have them</summary>
          <div className="chips" style={{ marginTop: 6 }}>
            {ats.missingKeywords.map((k) => <span key={k} className="chip missing">{k}</span>)}
          </div>
        </details>
      )}
      {ats.issues.map((issue, i) => (
        <div key={i} className={`banner ${issue.severity === 'error' ? 'error' : 'warn'}`}>{issue.message}</div>
      ))}
    </div>
  );
}

function FillSummary({ fill }: { fill: AutofillResult }) {
  const fromProfile = fill.answers.filter((a) => a.source === 'profile').length;
  const fromAi = fill.answers.filter((a) => a.source === 'ai').length;
  const attached = fill.answers.some((a) => a.source === 'resume-file');
  const requiredLeft = fill.skipped.filter((s) => s.field.required && s.reason !== 'already-filled');
  const sensitive = fill.skipped.filter((s) => s.reason === 'sensitive');

  return (
    <div className="stack">
      <div className="banner success">
        Filled {fill.report.filled} field{fill.report.filled === 1 ? '' : 's'} ({fromProfile} from profile, {fromAi} AI-written
        {attached ? ', resume attached' : ''}). Please review before submitting.
      </div>
      {fill.report.failed.length > 0 && (
        <div className="banner warn">{fill.report.failed.length} field(s) couldn't be set automatically (custom widgets) – fill them by hand.</div>
      )}
      {requiredLeft.length > 0 && (
        <div className="banner warn">
          <div>
            Required fields left for you:
            <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
              {requiredLeft.map((s) => <li key={`${s.field.frameId}-${s.field.id}`}>{s.field.label || s.field.name || 'Unnamed field'}</li>)}
            </ul>
          </div>
        </div>
      )}
      {sensitive.length > 0 && (
        <p className="muted small">Skipped {sensitive.length} sensitive field(s) (demographic/EEO, IDs, payment) on purpose.</p>
      )}
    </div>
  );
}
