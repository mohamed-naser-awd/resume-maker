import { useEffect, useMemo, useState } from 'react';
import type { TailorResult } from '@/application/TailorResumeUseCase';
import { TOKENS } from '@/di/tokens';
import type { AutofillResult } from '@/domain/form';
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

  const [job, setJob] = useState<JobPosting | null>(null);
  const [result, setResult] = useState<TailorResult | null>(null);
  const [fill, setFill] = useState<AutofillResult | null>(null);
  const [hasProfile, setHasProfile] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    void profiles.get().then((p) => setHasProfile(!!p.sourceResumeText || p.experience.length > 0));
  }, [profiles]);

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
  const runFill = useAction(async () => {
    setFill(await autofill.execute({ job, resumeDocument: result?.document ?? null }));
  });

  const pdfUrl = useMemo(
    () => (result ? URL.createObjectURL(new Blob([result.document.bytes as BlobPart], { type: result.document.mimeType })) : null),
    [result],
  );
  useEffect(() => () => void (pdfUrl && URL.revokeObjectURL(pdfUrl)), [pdfUrl]);

  const anyBusy = detect.busy || generate.busy || runFill.busy;

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
        <h2>3. Fill the application</h2>
        <p className="muted small">
          Open the application form, then fill it. Filled fields get a green outline, required ones left for you get an orange
          outline. Nothing is submitted – review and submit yourself.
          {result ? ' The generated PDF is attached to the resume upload field.' : ' Generate a resume first to also attach it.'}
        </p>
        <button className="btn primary" disabled={anyBusy || !hasProfile} onClick={() => runFill.run()}>
          {runFill.busy ? <><span className="spinner" /> Filling form…</> : 'Fill this page'}
        </button>
        <ErrorBanner error={runFill.error} onDismiss={runFill.clearError} onPermissionGranted={() => runFill.run()} />
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
