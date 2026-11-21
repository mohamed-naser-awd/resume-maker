import { useEffect, useMemo, useState } from 'react';
import { TOKENS } from '@/di/tokens';
import {
  daysSince,
  FOLLOW_UP_AFTER_DAYS,
  lastContactAt,
  needsFollowUp,
  STATUS_LABELS,
  type ApplicationRecord,
  type ApplicationStatus,
} from '@/domain/application';
import { ErrorBanner } from '../shared/ErrorBanner';
import { downloadBytes } from '../shared/chromeUi';
import { useService } from '../shared/services';
import { useAction } from '../shared/useAction';

type Filter = 'all' | 'follow-up' | ApplicationStatus;

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—');

/** Application history: shared by the side panel tab (compact) and the full history page. */
export function HistoryView({ compact = false }: { compact?: boolean }) {
  const history = useService(TOKENS.history);
  const [records, setRecords] = useState<ApplicationRecord[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const now = new Date();

  useEffect(() => {
    void history.list().then(setRecords);
    return history.subscribe(setRecords);
  }, [history]);

  const dueCount = records.filter((r) => needsFollowUp(r, now)).length;
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return records.filter((r) => {
      if (filter === 'follow-up' && !needsFollowUp(r, new Date())) return false;
      if (filter !== 'all' && filter !== 'follow-up' && r.status !== filter) return false;
      return !q || `${r.job.title} ${r.job.company} ${r.notes}`.toLowerCase().includes(q);
    });
  }, [records, filter, query]);

  const counts = {
    total: records.length,
    applied: records.filter((r) => r.status !== 'draft').length,
    interviewing: records.filter((r) => r.status === 'interviewing' || r.status === 'offer').length,
  };

  return (
    <>
      <section className="card">
        <div className="row between">
          <h2>Application history</h2>
          {compact && (
            <button className="btn small" onClick={() => chrome.tabs.create({ url: chrome.runtime.getURL('history.html') })}>
              Open full page ↗
            </button>
          )}
        </div>
        <div className="stats">
          <div><span className="stat">{counts.total}</span><span className="muted small">jobs</span></div>
          <div><span className="stat">{counts.applied}</span><span className="muted small">applied</span></div>
          <div><span className="stat">{counts.interviewing}</span><span className="muted small">interviewing</span></div>
          <div><span className={`stat ${dueCount ? 'due' : ''}`}>{dueCount}</span><span className="muted small">follow-ups due</span></div>
        </div>
        <div className="row" style={{ flexWrap: 'nowrap' }}>
          <input type="text" placeholder="Search company, role, notes…" value={query} onChange={(e) => setQuery(e.target.value)} />
          <select value={filter} onChange={(e) => setFilter(e.target.value as Filter)} style={{ width: 'auto' }}>
            <option value="all">All</option>
            <option value="follow-up">Follow-up due</option>
            {Object.entries(STATUS_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>
        {records.length === 0 && (
          <p className="muted small">
            Nothing yet. Every resume you generate in the Apply tab is saved here automatically. Press “Mark as applied” after you
            submit, and you'll get a reminder to follow up after {FOLLOW_UP_AFTER_DAYS} days.
          </p>
        )}
      </section>

      <div className={compact ? 'stack' : 'history-grid'} style={{ gap: 12 }}>
        {visible.map((r) => (
          <ApplicationCard key={r.id} record={r} />
        ))}
      </div>
    </>
  );
}

function ApplicationCard({ record: r }: { record: ApplicationRecord }) {
  const history = useService(TOKENS.history);
  const [notes, setNotes] = useState(r.notes);
  const [draft, setDraft] = useState<{ subject: string; body: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);
  const now = new Date();
  const due = needsFollowUp(r, now);
  const last = lastContactAt(r);

  useEffect(() => setNotes(r.notes), [r.notes]);

  const download = useAction(async () => {
    const doc = await history.renderResume(r.id);
    downloadBytes(doc.bytes, doc.fileName, doc.mimeType);
  });
  const drafting = useAction(async () => setDraft(await history.draftFollowUp(r.id)));

  const copyDraft = async () => {
    if (!draft) return;
    await navigator.clipboard.writeText(`Subject: ${draft.subject}\n\n${draft.body}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <section className={`card ${due ? 'card-due' : ''}`}>
      <div className="row between" style={{ alignItems: 'flex-start', flexWrap: 'nowrap' }}>
        <div className="grow">
          <h3>{r.job.title || r.resume?.jobTitle || 'Untitled role'}</h3>
          <div className="muted small">
            {r.job.company || r.resume?.company || 'Unknown company'}
            {r.job.location ? ` · ${r.job.location}` : ''}
          </div>
        </div>
        <select
          value={r.status}
          onChange={(e) => history.setStatus(r.id, e.target.value as ApplicationStatus)}
          style={{ width: 'auto' }}
          aria-label="Status"
        >
          {Object.entries(STATUS_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      </div>

      <div className="muted small">
        Resume {fmt(r.resume?.generatedAt ?? r.createdAt)} · Applied {fmt(r.appliedAt)}
        {r.followUps.length > 0 && ` · ${r.followUps.length} follow-up${r.followUps.length > 1 ? 's' : ''} (last ${fmt(r.followUps.at(-1)!.date)})`}
      </div>
      {due && last && (
        <div className="banner warn">
          <span>No reply for {daysSince(last, now)} days – time to follow up.</span>
        </div>
      )}

      <div className="row">
        {r.status === 'draft' && (
          <button className="btn small primary" onClick={() => history.setStatus(r.id, 'applied')}>
            Mark as applied
          </button>
        )}
        <button className="btn small" disabled={!r.resume || download.busy} onClick={() => download.run()}>
          ⬇ Resume PDF
        </button>
        {r.job.url && (
          <a className="btn small" href={r.job.url} target="_blank" rel="noreferrer">
            Open job ↗
          </a>
        )}
        <button className="btn small" disabled={drafting.busy} onClick={() => drafting.run()}>
          {drafting.busy ? <><span className="spinner" /> Drafting…</> : '✉ Draft follow-up'}
        </button>
      </div>
      <ErrorBanner error={download.error ?? drafting.error} onDismiss={() => (download.clearError(), drafting.clearError())} />

      {draft && (
        <div className="sub-card">
          <label className="field">
            Subject
            <input type="text" value={draft.subject} onChange={(e) => setDraft({ ...draft, subject: e.target.value })} />
          </label>
          <label className="field">
            Message
            <textarea rows={8} value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} />
          </label>
          <div className="row">
            <button className="btn small" onClick={copyDraft}>{copied ? 'Copied ✓' : 'Copy'}</button>
            <button
              className="btn small primary"
              onClick={async () => {
                await history.logFollowUp(r.id, `Subject: ${draft.subject}\n\n${draft.body}`);
                setDraft(null);
              }}
            >
              I sent it – log follow-up
            </button>
            <button className="btn small ghost" onClick={() => setDraft(null)}>Discard</button>
          </div>
        </div>
      )}

      <details open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
        <summary className="small">Notes & details</summary>
        <div className="stack" style={{ marginTop: 6 }}>
          <label className="field">
            Notes (recruiter name, contact email, interview dates…)
            <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={() => notes !== r.notes && history.setNotes(r.id, notes)} />
          </label>
          {r.followUps.length > 0 && (
            <div className="stack">
              <span className="small muted">Follow-ups sent</span>
              {r.followUps.map((f, i) => (
                <details key={i} className="small">
                  <summary>{fmt(f.date)}</summary>
                  <pre className="pre">{f.message || '(no message saved)'}</pre>
                </details>
              ))}
            </div>
          )}
          {r.job.description && (
            <details className="small">
              <summary>Job description</summary>
              <pre className="pre">{r.job.description}</pre>
            </details>
          )}
          <div>
            <button
              className="btn small danger"
              onClick={() => {
                if (confirm(`Delete ${r.job.title || 'this application'} from history?`)) void history.remove(r.id);
              }}
            >
              Delete
            </button>
          </div>
        </div>
      </details>
    </section>
  );
}
