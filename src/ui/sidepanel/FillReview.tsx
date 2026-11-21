import { useState } from 'react';
import type { FillPlan, FillPlanItem } from '@/domain/form';

interface Props {
  plan: FillPlan;
  busy: boolean;
  onConfirm: (plan: FillPlan) => void;
  onCancel: () => void;
}

interface Row extends FillPlanItem {
  include: boolean;
}

const SOURCE_LABEL: Record<string, string> = { profile: 'profile', ai: 'AI', 'resume-file': 'file' };

/** "Review first" mode: shows every proposed value; the user edits/unticks, then fills. */
export function FillReview({ plan, busy, onConfirm, onCancel }: Props) {
  const [rows, setRows] = useState<Row[]>(() => plan.items.map((i) => ({ ...i, include: !!i.value })));
  const update = (i: number, patch: Partial<Row>) => setRows((r) => r.map((row, j) => (j === i ? { ...row, ...patch } : row)));
  const count = rows.filter((r) => r.include && r.value.trim()).length;
  const sensitive = plan.skipped.filter((s) => s.reason === 'sensitive').length;

  const confirm = () =>
    onConfirm({
      skipped: plan.skipped,
      items: rows.map(({ include, ...item }) => ({ ...item, value: include ? item.value : '' })),
    });

  return (
    <div className="stack">
      <p className="muted small">
        Review what will be filled. Untick or edit anything, or type answers for empty fields. Nothing on the page changes until
        you press Fill.
      </p>
      <ul className="list">
        {rows.map((row, i) => {
          const f = row.field;
          const label = (f.label || f.placeholder || f.name || 'Unnamed field').replace(/\s*\*\s*$/, '');
          return (
            <li key={`${f.frameId}-${f.id}`} className="list-item" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
              <label className="check small">
                <input type="checkbox" checked={row.include} onChange={(e) => update(i, { include: e.target.checked })} />
                <span className="grow">
                  <strong>{label}</strong>
                  {f.required && <span style={{ color: 'var(--danger)' }}> *</span>}
                  {row.source && <span className="chip" style={{ marginLeft: 6 }}>{SOURCE_LABEL[row.source]}</span>}
                </span>
              </label>
              {row.source === 'resume-file' ? (
                <span className="muted small">Attach {row.value}</span>
              ) : f.options.length > 0 ? (
                <select value={row.value} onChange={(e) => update(i, { value: e.target.value, include: !!e.target.value })}>
                  <option value="">—</option>
                  {f.options.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              ) : f.type === 'checkbox' ? (
                <select value={row.value} onChange={(e) => update(i, { value: e.target.value, include: !!e.target.value })}>
                  <option value="">—</option>
                  <option value="true">Checked</option>
                  <option value="false">Unchecked</option>
                </select>
              ) : f.type === 'textarea' ? (
                <textarea rows={4} value={row.value} onChange={(e) => update(i, { value: e.target.value, include: !!e.target.value.trim() })} />
              ) : (
                <input type="text" value={row.value} onChange={(e) => update(i, { value: e.target.value, include: !!e.target.value.trim() })} />
              )}
            </li>
          );
        })}
      </ul>
      {sensitive > 0 && <p className="muted small">{sensitive} sensitive field(s) (demographic/EEO, IDs, payment) are left for you.</p>}
      <div className="row">
        <button className="btn primary" disabled={busy || count === 0} onClick={confirm}>
          {busy ? <><span className="spinner" /> Filling…</> : `Fill ${count} field${count === 1 ? '' : 's'}`}
        </button>
        <button className="btn" disabled={busy} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
