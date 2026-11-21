import { useEffect, useRef, useState } from 'react';
import { TOKENS } from '@/di/tokens';
import type { Education, Experience, Profile } from '@/domain/profile';
import { ErrorBanner } from '../shared/ErrorBanner';
import { useService } from '../shared/services';
import { useAction } from '../shared/useAction';

const lines = (s: string) => s.split('\n').map((l) => l.trim()).filter(Boolean);
const csv = (s: string) => s.split(',').map((l) => l.trim()).filter(Boolean);

const emptyExperience = (): Experience => ({ company: '', title: '', location: '', startDate: '', endDate: '', bullets: [] });
const emptyEducation = (): Education => ({ institution: '', degree: '', field: '', startDate: '', endDate: '', details: '' });

export function ProfileTab() {
  const profiles = useService(TOKENS.profileService);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [dirty, setDirty] = useState(false);
  const [notice, setNotice] = useState('');
  const [pasted, setPasted] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void profiles.get().then(setProfile);
  }, [profiles]);

  const importFile = useAction(async (file: File) => {
    const p = await profiles.importResume({ name: file.name, mimeType: file.type, data: await file.arrayBuffer() });
    setProfile(p);
    setDirty(false);
    setNotice(`Imported "${file.name}". Review the details below and fix anything that looks off.`);
  });
  const importText = useAction(async () => {
    const p = await profiles.importResumeText(pasted);
    setProfile(p);
    setPasted('');
    setDirty(false);
    setNotice('Imported pasted resume text.');
  });
  const save = useAction(async () => {
    if (!profile) return;
    setProfile(await profiles.save(profile));
    setDirty(false);
    setNotice('Profile saved.');
  });

  if (!profile) return null;
  const set = (patch: Partial<Profile>) => {
    setProfile({ ...profile, ...patch });
    setDirty(true);
    setNotice('');
  };
  const setContact = (key: keyof Profile['contact'], value: string) => set({ contact: { ...profile.contact, [key]: value } });
  const setExp = (i: number, patch: Partial<Experience>) =>
    set({ experience: profile.experience.map((e, j) => (j === i ? { ...e, ...patch } : e)) });
  const setEdu = (i: number, patch: Partial<Education>) =>
    set({ education: profile.education.map((e, j) => (j === i ? { ...e, ...patch } : e)) });
  const busy = importFile.busy || importText.busy;

  return (
    <>
      <section className="card">
        <h2>Your resume</h2>
        <p className="muted small">Upload your current resume (PDF, DOCX or TXT). It's parsed once and saved locally.</p>
        <input
          ref={fileInput}
          type="file"
          accept=".pdf,.docx,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void importFile.run(file);
            e.target.value = '';
          }}
        />
        <button className="btn primary" disabled={busy} onClick={() => fileInput.current?.click()}>
          {busy ? <><span className="spinner" /> Reading resume…</> : profile.sourceResumeText ? 'Replace resume' : 'Upload resume'}
        </button>
        <details>
          <summary className="small">…or paste resume text</summary>
          <div className="stack" style={{ marginTop: 6 }}>
            <textarea rows={6} value={pasted} onChange={(e) => setPasted(e.target.value)} placeholder="Paste the full text of your resume" />
            <button className="btn" disabled={busy || pasted.trim().length < 50} onClick={() => importText.run()}>
              Import text
            </button>
          </div>
        </details>
        {notice && <div className="banner success">{notice}</div>}
        <ErrorBanner error={importFile.error ?? importText.error ?? save.error} onDismiss={() => (importFile.clearError(), importText.clearError(), save.clearError())} />
      </section>

      <section className="card">
        <h2>Contact</h2>
        <div className="grid2">
          {(
            [
              ['fullName', 'Full name'],
              ['email', 'Email'],
              ['phone', 'Phone'],
              ['location', 'Location'],
              ['linkedin', 'LinkedIn URL'],
              ['github', 'GitHub URL'],
              ['website', 'Website / portfolio'],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="field">
              {label}
              <input type="text" value={profile.contact[key]} onChange={(e) => setContact(key, e.target.value)} />
            </label>
          ))}
        </div>
        <label className="field">
          Headline
          <input type="text" value={profile.headline} onChange={(e) => set({ headline: e.target.value })} placeholder="e.g. Senior Software Engineer" />
        </label>
        <label className="field">
          Summary
          <textarea rows={3} value={profile.summary} onChange={(e) => set({ summary: e.target.value })} />
        </label>
      </section>

      <section className="card">
        <div className="row between">
          <h2>Experience</h2>
          <button className="btn small" onClick={() => set({ experience: [emptyExperience(), ...profile.experience] })}>
            + Add role
          </button>
        </div>
        {profile.experience.length === 0 && <p className="muted small">No roles yet – upload your resume or add one.</p>}
        {profile.experience.map((e, i) => (
          <div key={i} className="sub-card">
            <div className="grid2">
              <label className="field">Title<input type="text" value={e.title} onChange={(ev) => setExp(i, { title: ev.target.value })} /></label>
              <label className="field">Company<input type="text" value={e.company} onChange={(ev) => setExp(i, { company: ev.target.value })} /></label>
              <label className="field">Start<input type="text" value={e.startDate} onChange={(ev) => setExp(i, { startDate: ev.target.value })} /></label>
              <label className="field">End<input type="text" value={e.endDate} placeholder="Present" onChange={(ev) => setExp(i, { endDate: ev.target.value })} /></label>
            </div>
            <label className="field">Location<input type="text" value={e.location} onChange={(ev) => setExp(i, { location: ev.target.value })} /></label>
            <label className="field">
              Bullets (one per line)
              <textarea rows={4} value={e.bullets.join('\n')} onChange={(ev) => setExp(i, { bullets: ev.target.value.split('\n') })} onBlur={() => setExp(i, { bullets: lines(e.bullets.join('\n')) })} />
            </label>
            <button className="btn small danger" onClick={() => set({ experience: profile.experience.filter((_, j) => j !== i) })}>
              Remove role
            </button>
          </div>
        ))}
      </section>

      <section className="card">
        <div className="row between">
          <h2>Education</h2>
          <button className="btn small" onClick={() => set({ education: [...profile.education, emptyEducation()] })}>
            + Add
          </button>
        </div>
        {profile.education.map((ed, i) => (
          <div key={i} className="sub-card">
            <div className="grid2">
              <label className="field">Degree<input type="text" value={ed.degree} onChange={(ev) => setEdu(i, { degree: ev.target.value })} /></label>
              <label className="field">Field<input type="text" value={ed.field} onChange={(ev) => setEdu(i, { field: ev.target.value })} /></label>
              <label className="field">Institution<input type="text" value={ed.institution} onChange={(ev) => setEdu(i, { institution: ev.target.value })} /></label>
              <label className="field">End<input type="text" value={ed.endDate} onChange={(ev) => setEdu(i, { endDate: ev.target.value })} /></label>
            </div>
            <button className="btn small danger" onClick={() => set({ education: profile.education.filter((_, j) => j !== i) })}>
              Remove
            </button>
          </div>
        ))}
      </section>

      <section className="card">
        <h2>Skills & certifications</h2>
        <label className="field">
          Skills (comma separated)
          <textarea rows={3} defaultValue={profile.skills.join(', ')} key={`skills-${profile.updatedAt}`} onChange={(e) => set({ skills: csv(e.target.value) })} />
        </label>
        <label className="field">
          Certifications (one per line)
          <textarea rows={2} defaultValue={profile.certifications.join('\n')} key={`certs-${profile.updatedAt}`} onChange={(e) => set({ certifications: lines(e.target.value) })} />
        </label>
      </section>

      <section className="card">
        <h2>Application facts</h2>
        <p className="muted small">
          Answers to common form questions that aren't on a resume. Used only for autofill. Leave anything you'd rather answer
          yourself.
        </p>
        <textarea
          rows={5}
          value={profile.applicationFacts}
          onChange={(e) => set({ applicationFacts: e.target.value })}
          placeholder={'Authorized to work in: …\nNeed visa sponsorship: No\nNotice period: 4 weeks\nOpen to relocation: Yes\nHow did you hear about us: LinkedIn'}
        />
      </section>

      <div className="composer">
        <button className="btn primary block" disabled={!dirty || save.busy} onClick={() => save.run()}>
          {dirty ? 'Save profile' : 'Saved'}
        </button>
      </div>
    </>
  );
}
