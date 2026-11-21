import { describe, expect, it } from 'vitest';
import { TOKENS as T } from '@/di/tokens';
import { mergeJob, type JobPosting } from '@/domain/job';
import { jobIdentity, postingUrlCandidates } from '@/domain/jobIdentity';
import { FakePage, createTestContainer, field } from './fakes';

const DESC = 'Lucidya is hiring a senior engineer to build things. '.repeat(10);
const POSTING = 'https://apply.workable.com/lucidya/j/5294DA8CF4/';
const FORM_URL = 'https://apply.workable.com/lucidya/j/5294DA8CF4/apply/';

const posting = (over: Partial<JobPosting> = {}): JobPosting => ({
  title: 'Senior Engineer', company: 'Lucidya', location: 'Riyadh', description: DESC, url: POSTING, source: 'board', ...over,
});
/** What the scraper sees on the form page: no description, just form text. */
const formPage = (): JobPosting => ({
  title: 'Apply', company: '', location: '', description: 'First name Last name Email Phone Resume '.repeat(10), url: FORM_URL, source: 'fallback',
});
const formFields = [
  field({ id: 'f', label: 'First name' }), field({ id: 'l', label: 'Last name' }), field({ id: 'e', label: 'Email' }),
  field({ id: 'p', label: 'Phone' }), field({ id: 'r', label: 'Resume', type: 'file' }),
];

describe('jobIdentity', () => {
  it('maps posting and application pages of one job to one key', () => {
    expect(jobIdentity(POSTING)).toBe(jobIdentity(FORM_URL));
    expect(jobIdentity(POSTING)).toBe('workable:5294DA8CF4');
    expect(jobIdentity('https://jobs.lever.co/acme/0b5c3a0e-1111-2222-3333-444455556666/apply'))
      .toBe(jobIdentity('https://jobs.lever.co/acme/0b5c3a0e-1111-2222-3333-444455556666'));
    expect(jobIdentity('https://acme.com/careers?gh_jid=4012345')).toBe('greenhouse:4012345');
    expect(jobIdentity('https://boards.greenhouse.io/acme/jobs/4012345#app')).toBe('greenhouse:4012345');
    expect(jobIdentity('https://acme.wd5.myworkdayjobs.com/en-US/Careers/job/Austin/Engineer_R12345/apply/applyManually'))
      .toBe(jobIdentity('https://acme.wd5.myworkdayjobs.com/en-US/Careers/job/Austin/Engineer_R12345'));
    expect(jobIdentity('https://acme.com/jobs/123/apply/step-2')).toBe(jobIdentity('https://www.acme.com/jobs/123/'));
    expect(jobIdentity('https://apply.workable.com/lucidya/j/OTHER/')).not.toBe(jobIdentity(POSTING));
  });

  it('suggests the posting URL for a form URL', () => {
    expect(postingUrlCandidates(FORM_URL)).toEqual([POSTING]);
    expect(postingUrlCandidates(POSTING)).toEqual([]);
  });
});

describe('mergeJob', () => {
  it('never replaces a stored description with form text', () => {
    const merged = mergeJob(posting(), formPage());
    expect(merged.description).toBe(DESC);
    expect(merged.url).toBe(FORM_URL);
    expect(mergeJob(posting(), posting({ description: 'New '.repeat(80), source: 'manual' })).description).toContain('New');
  });
});

describe('JobService (description and form on different pages)', () => {
  it('uses the posting remembered while browsing', async () => {
    const page = new FakePage(formFields, posting());
    const c = createTestContainer({ page });
    const jobs = c.resolve(T.jobs);
    expect((await jobs.rememberFromPage())?.origin).toBe('page');

    page.job = formPage(); // user clicks "Apply" -> /apply/
    const found = await jobs.detectFromPage();
    expect(found.origin).toBe('memory');
    expect(found.job.description).toBe(DESC);
    expect(page.opened).toEqual([]);
  });

  it('reads the posting page in the background when the form was opened directly', async () => {
    const page = new FakePage(formFields, formPage());
    page.otherPages.set(POSTING, posting());
    const jobs = createTestContainer({ page }).resolve(T.jobs);
    const found = await jobs.detectFromPage();
    expect(found).toMatchObject({ origin: 'posting-page', job: { description: DESC } });
    expect(page.opened).toEqual([POSTING]);
    // Second time: remembered, no background tab.
    expect((await jobs.detectFromPage()).origin).toBe('memory');
    expect(page.opened).toHaveLength(1);
  });

  it('follows a "View job" link or the referrer when the URL gives no hint', async () => {
    const page = new FakePage(formFields, { ...formPage(), url: 'https://forms.acme.com/a/xyz' });
    page.referrer = 'https://careers.acme.com/jobs/77';
    page.otherPages.set('https://careers.acme.com/jobs/77', posting({ url: 'https://careers.acme.com/jobs/77' }));
    const found = await createTestContainer({ page }).resolve(T.jobs).detectFromPage();
    expect(found.origin).toBe('posting-page');
  });

  it('refuses to use application-form text as the description', async () => {
    const page = new FakePage(formFields, formPage());
    await expect(createTestContainer({ page }).resolve(T.jobs).detectFromPage()).rejects.toThrow(/application form/);
  });

  it('accepts plain page text when the page is not a form', async () => {
    const page = new FakePage([], { ...posting(), source: 'fallback', url: 'https://blog.acme.com/we-are-hiring' });
    expect((await createTestContainer({ page }).resolve(T.jobs).detectFromPage()).origin).toBe('page');
  });

  it('uses the history record when a resume was already made for this job', async () => {
    const page = new FakePage(formFields, formPage());
    const c = createTestContainer({ page });
    const h = c.resolve(T.history);
    await h.markApplied(posting(), null);
    // Re-recording from the form page must not overwrite the stored description.
    await h.markApplied(formPage(), null);
    expect((await h.list())[0]!.job.description).toBe(DESC);
    // Memory is empty, so this comes from history.
    expect((await c.resolve(T.jobs).detectFromPage()).origin).toBe('history');
  });
});
