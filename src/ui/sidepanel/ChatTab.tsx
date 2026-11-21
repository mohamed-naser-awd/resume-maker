import { useEffect, useRef, useState } from 'react';
import { CHAT_GREETING } from '@/application/AccomplishmentChatUseCase';
import { TOKENS } from '@/di/tokens';
import type { Accomplishment } from '@/domain/accomplishment';
import type { ChatMessage } from '@/domain/chat';
import { ErrorBanner } from '../shared/ErrorBanner';
import { useService } from '../shared/services';
import { useAction } from '../shared/useAction';

export function ChatTab() {
  const chat = useService(TOKENS.chat);
  const accomplishments = useService(TOKENS.accomplishmentService);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [items, setItems] = useState<Accomplishment[]>([]);
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState('');
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void chat.history().then(setMessages);
    void accomplishments.list().then(setItems);
  }, [chat, accomplishments]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, pending]);

  const send = useAction(async (text: string) => {
    setPending(text);
    setDraft('');
    try {
      const result = await chat.send(text);
      setMessages(result.messages);
      if (result.added.length) setItems(await accomplishments.list());
    } catch (e) {
      setDraft(text); // give the text back so nothing is lost
      throw e;
    } finally {
      setPending('');
    }
  });

  const submit = () => {
    if (draft.trim() && !send.busy) void send.run(draft.trim());
  };
  const byId = new Map(items.map((a) => [a.id, a]));

  return (
    <>
      <section className="card">
        <div className="row between">
          <h2>Tell me what you've done</h2>
          {messages.length > 0 && (
            <button className="btn small ghost" onClick={async () => (await chat.clear(), setMessages([]))}>
              Clear chat
            </button>
          )}
        </div>
        <div className="chat">
          <div className="msg assistant">{CHAT_GREETING}</div>
          {messages.map((m) => (
            <div key={m.id} className={`msg ${m.role}`}>
              {m.content}
              {!!m.addedAccomplishmentIds?.length && (
                <div className="added">
                  ✓ Saved {m.addedAccomplishmentIds.length} accomplishment{m.addedAccomplishmentIds.length > 1 ? 's' : ''}:
                  {m.addedAccomplishmentIds.map((id) => byId.get(id)).filter(Boolean).map((a) => (
                    <div key={a!.id}>• {a!.text}</div>
                  ))}
                </div>
              )}
            </div>
          ))}
          {pending && <div className="msg user">{pending}</div>}
          {send.busy && (
            <div className="msg assistant">
              <span className="spinner" />
            </div>
          )}
          <div ref={bottom} />
        </div>
        <ErrorBanner error={send.error} onDismiss={send.clearError} />
        <div className="composer">
          <textarea
            value={draft}
            placeholder="e.g. I led sprint planning and retros for a team of 6 developers at Acme"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
          />
          <button className="btn primary" disabled={!draft.trim() || send.busy} onClick={submit}>
            Send
          </button>
        </div>
      </section>

      <AccomplishmentList items={items} onChange={setItems} />
    </>
  );
}

function AccomplishmentList({ items, onChange }: { items: Accomplishment[]; onChange: (items: Accomplishment[]) => void }) {
  const service = useService(TOKENS.accomplishmentService);
  const [editing, setEditing] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [newText, setNewText] = useState('');

  const add = async () => {
    if (!newText.trim()) return;
    await service.add({ text: newText, impact: '', skills: [], context: '', source: 'manual' });
    setNewText('');
    onChange(await service.list());
  };

  return (
    <section className="card">
      <h2>Saved accomplishments ({items.length})</h2>
      <p className="muted small">These are used, together with your resume, every time a resume is tailored.</p>
      <ul className="list">
        {items.map((a) => (
          <li key={a.id} className="list-item">
            {editing === a.id ? (
              <div className="grow stack">
                <textarea value={editText} onChange={(e) => setEditText(e.target.value)} rows={3} />
                <div className="row">
                  <button
                    className="btn small primary"
                    onClick={async () => {
                      onChange(await service.update(a.id, { text: editText.trim() }));
                      setEditing(null);
                    }}
                  >
                    Save
                  </button>
                  <button className="btn small" onClick={() => setEditing(null)}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="grow">
                  <div>{a.text}</div>
                  {(a.impact || a.context) && <div className="muted small">{[a.impact, a.context].filter(Boolean).join(' · ')}</div>}
                  {a.skills.length > 0 && (
                    <div className="chips" style={{ marginTop: 4 }}>
                      {a.skills.map((s) => <span key={s} className="chip">{s}</span>)}
                    </div>
                  )}
                </div>
                <div className="row" style={{ flexWrap: 'nowrap' }}>
                  <button className="btn small ghost" title="Edit" onClick={() => (setEditing(a.id), setEditText(a.text))}>
                    ✎
                  </button>
                  <button className="btn small ghost danger" title="Delete" onClick={async () => onChange(await service.remove(a.id))}>
                    🗑
                  </button>
                </div>
              </>
            )}
          </li>
        ))}
      </ul>
      <div className="row" style={{ flexWrap: 'nowrap' }}>
        <input type="text" value={newText} placeholder="Add one manually…" onChange={(e) => setNewText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
        <button className="btn" onClick={add} disabled={!newText.trim()}>
          Add
        </button>
      </div>
    </section>
  );
}
