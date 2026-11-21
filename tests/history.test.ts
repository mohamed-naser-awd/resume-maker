import { describe, expect, it } from 'vitest';
import { TOKENS as T } from '@/di/tokens';
import { isSameJob, needsFollowUp, type ApplicationRecord } from '@/domain/application';
import type { JobPosting } from '@/domain/job';
import type { TailoredResume } from '@/domain/resume';
import { FakeLLM, createTestContainer, sampleProfile } from './fakes';

const job = (over: Partial<JobPosting> = {}): JobPosting => ({
  title: 'Senior Engineer',
  company: 'Acme',
  location: 'Remote',
  description: 'Build things. '.repeat(30),
  url: 'https://boards.greenhouse.io/acme/jobs/123',
  ...over,
});

const resume = (): TailoredResume => ({
  contact: sampleProfile().contact,
  headline: 'Senior Engineer',
  summary: 'Builds things.',
  skills: [],
  experience: [{ company: 'Acme', title: 'Engineer', location: '', startDate: '2020', endDate: 'Present', bullets: ['Built things'] }],
  education: [],
  certifications: [],
  targetKeywords: [],
  jobTitle: 'Senior Engineer',
  company: 'Acme',
  generatedAt: '2026-01-01T00:00:00.000Z',
});

describe('ApplicationHistoryService', () => {
  it('records a resume once per job and updates it on regenerate', async () => {
    const h = createTestContainer().resolve(T.history);
    const a = await h.recordResume(job(), resume());
    const b = await h.recordResume(job({ url: 'https://boards.greenhouse.io/acme/jobs/123/apply?src=li' }), { ...resume(), summary: 'v2' });
    expect(b.id).toBe(a.id);
    const all = await h.list();
    expect(all).toHaveLength(1);
    expect(all[0]!.resume!.summary).toBe('v2');
    expect(all[0]!.status).toBe('draft');
  });

  it('marks applied, logs follow-ups and re-renders the stored resume', async () => {
    const c = createTestContainer();
    const h = c.resolve(T.history);
    const rec = await h.markApplied(job(), resume());
    expect(rec.status).toBe('applied');
    expect(rec.appliedAt).toBe('2026-01-01T00:00:00.000Z');

    await h.logFollowUp(rec.id, 'Subject: hi');
    const [after] = await h.list();
    expect(after!.status).toBe('followed-up');
    expect(after!.followUps).toHaveLength(1);

    const doc = await h.renderResume(rec.id);
    expect(doc.mimeType).toBe('application/pdf');
  });

  it('drafts a follow-up email grounded in the stored resume', async () => {
    const llm = new FakeLLM([{ subject: 'Following up – Senior Engineer', body: 'Hi team…' }]);
    const h = createTestContainer({ llm }).resolve(T.history);
    const rec = await h.markApplied(job(), resume());
    const draft = await h.draftFollowUp(rec.id);
    expect(draft.subject).toContain('Senior Engineer');
    const sent = llm.requests[0]!.messages[0]!.content;
    expect(sent).toContain('Company: Acme');
    expect(sent).toContain('Built things');
  });

  it('tailoring a resume saves it to history automatically', async () => {
    const llm = new FakeLLM([
      {
        jobTitle: '', company: '', headline: 'Eng', summary: 'S',
        skills: [], experience: [], education: [], certifications: [], targetKeywords: [],
      },
    ]);
    const c = createTestContainer({ llm });
    await c.resolve(T.profileRepo).save(sampleProfile());
    const out = await c.resolve(T.tailor).execute(job());
    expect((await c.resolve(T.history).list()).map((r) => r.id)).toEqual([out.application.id]);
  });
});

describe('application rules', () => {
  const rec = (over: Partial<ApplicationRecord>): ApplicationRecord => ({
    id: '1', job: job(), resume: null, status: 'applied', createdAt: '', updatedAt: '',
    appliedAt: '2026-01-01T00:00:00Z', followUps: [], notes: '', ...over,
  });

  it('suggests a follow-up 7 days after applying or the last follow-up', () => {
    expect(needsFollowUp(rec({}), new Date('2026-01-05'))).toBe(false);
    expect(needsFollowUp(rec({}), new Date('2026-01-09'))).toBe(true);
    expect(needsFollowUp(rec({ followUps: [{ date: '2026-01-08T00:00:00Z', message: '' }] }), new Date('2026-01-10'))).toBe(false);
    expect(needsFollowUp(rec({ status: 'rejected' }), new Date('2026-03-01'))).toBe(false);
    expect(needsFollowUp(rec({ status: 'draft', appliedAt: null }), new Date('2026-03-01'))).toBe(false);
  });

  it('matches the same job by URL or company + title', () => {
    expect(isSameJob(job(), job({ url: 'https://boards.greenhouse.io/acme/jobs/123/apply' }))).toBe(true);
    expect(isSameJob(job({ url: '' }), job({ url: 'https://x.com/other' }))).toBe(true);
    expect(isSameJob(job(), job({ url: 'https://boards.greenhouse.io/acme/jobs/999', title: 'Designer' }))).toBe(false);
  });
});

describe('TailorResumeUseCase idempotency', () => {
  const tailored = (summary: string) => ({
    jobTitle: '', company: '', headline: 'Eng', summary,
    skills: [], experience: [], education: [], certifications: [], targetKeywords: [],
  });

  it('reuses the resume for the same link instead of calling the AI again', async () => {
    const llm = new FakeLLM([tailored('first'), tailored('second')]);
    const c = createTestContainer({ llm });
    await c.resolve(T.profileRepo).save(sampleProfile());
    const tailor = c.resolve(T.tailor);

    const a = await tailor.execute(job());
    const b = await tailor.execute(job({ url: 'https://boards.greenhouse.io/acme/jobs/123/apply?utm=x#top' }));
    expect(a.reused).toBe(false);
    expect(b.reused).toBe(true);
    expect(b.resume.summary).toBe('first');
    expect(llm.requests).toHaveLength(1);
  });

  it('shares one in-flight request when generate is triggered twice at once', async () => {
    const llm = new FakeLLM([tailored('only')]);
    const c = createTestContainer({ llm });
    await c.resolve(T.profileRepo).save(sampleProfile());
    const tailor = c.resolve(T.tailor);
    const [a, b] = await Promise.all([tailor.execute(job()), tailor.execute(job())]);
    expect(a).toBe(b);
    expect(llm.requests).toHaveLength(1);
  });

  it('force regenerates and replaces the saved version; other links are separate', async () => {
    const llm = new FakeLLM([tailored('v1'), tailored('v2'), tailored('other')]);
    const c = createTestContainer({ llm });
    await c.resolve(T.profileRepo).save(sampleProfile());
    const tailor = c.resolve(T.tailor);
    await tailor.execute(job());
    const forced = await tailor.execute(job(), { force: true });
    expect(forced.reused).toBe(false);
    expect((await tailor.loadSaved(job()))!.resume.summary).toBe('v2');

    // Same company + title but a different posting link -> its own resume and record.
    const other = await tailor.execute(job({ url: 'https://boards.greenhouse.io/acme/jobs/456' }));
    expect(other.reused).toBe(false);
    expect(await c.resolve(T.history).list()).toHaveLength(2);
    expect(llm.requests).toHaveLength(3);
  });
});
