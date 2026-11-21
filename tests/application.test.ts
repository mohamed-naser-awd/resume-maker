import { describe, expect, it } from 'vitest';
import { TOKENS as T } from '@/di/tokens';
import { LLMError } from '@/domain/errors';
import { FakeLLM, FakePage, createTestContainer, field, sampleProfile } from './fakes';

const parsedResume = {
  contact: { fullName: 'Jane Q Doe', email: 'jane@example.com', phone: '', location: '', linkedin: '', github: '', website: '' },
  headline: 'Engineer',
  summary: '',
  experience: [{ company: 'Acme', title: 'Engineer', location: '', startDate: '2020', endDate: 'Present', bullets: ['Did things'] }],
  education: [],
  skills: ['TypeScript'],
  certifications: [],
  projects: [],
};

describe('ProfileService.importResume', () => {
  it('extracts text, structures it via the LLM port, and saves it', async () => {
    const llm = new FakeLLM([parsedResume]);
    const c = createTestContainer({ llm });
    const text = 'Jane Q Doe\nEngineer at Acme 2020 - Present\nDid things with TypeScript and more text here';
    const profile = await c.resolve(T.profileService).importResume({
      name: 'cv.txt',
      mimeType: 'text/plain',
      data: new TextEncoder().encode(text).buffer as ArrayBuffer,
    });
    expect(profile.contact.fullName).toBe('Jane Q Doe');
    expect(profile.sourceResumeText).toBe(text);
    expect((await c.resolve(T.profileRepo).get()).experience).toHaveLength(1);
    expect(llm.requests[0]!.messages[0]!.content).toContain('Engineer at Acme');
    expect('schema' in llm.requests[0]! && llm.requests[0].schemaName).toBe('parsed_resume');
  });

  it('rejects malformed model output with a readable error', async () => {
    const c = createTestContainer({ llm: new FakeLLM([{ nope: true }]) });
    await expect(c.resolve(T.profileService).importResumeText('x'.repeat(100))).rejects.toMatchObject({ kind: 'invalid-output' });
  });
});

describe('AccomplishmentChatUseCase', () => {
  it('saves extracted accomplishments and skips duplicates', async () => {
    const turn = {
      reply: 'Saved! How long was the sprint?',
      newAccomplishments: [
        { text: 'Led sprint planning for a team of 6 developers', impact: '', skills: ['Scrum'], context: 'Acme' },
        { text: 'Led sprint planning for a team of 6 developers.', impact: '', skills: [], context: '' },
      ],
    };
    const llm = new FakeLLM([turn]);
    const c = createTestContainer({ llm });
    const res = await c.resolve(T.chat).send('I led sprint planning for 6 devs');
    expect(res.added).toHaveLength(1);
    expect(res.added[0]!.source).toBe('chat');
    expect(res.messages.map((m) => m.role)).toEqual(['user', 'assistant']);
    expect(res.messages[1]!.addedAccomplishmentIds).toEqual([res.added[0]!.id]);
    expect(await c.resolve(T.accomplishmentService).list()).toHaveLength(1);
  });

  it('does not persist the turn when the LLM fails', async () => {
    const llm = new FakeLLM([() => { throw new LLMError('rate-limit', 'slow down'); }]);
    const c = createTestContainer({ llm });
    await expect(c.resolve(T.chat).send('hello')).rejects.toBeInstanceOf(LLMError);
    expect(await c.resolve(T.chat).history()).toEqual([]);
  });
});

describe('TailorResumeUseCase', () => {
  it('keeps contact details from the profile and reports keyword coverage', async () => {
    const llm = new FakeLLM([
      {
        jobTitle: 'Staff Engineer',
        company: 'Acme',
        headline: 'Senior Software Engineer',
        summary: 'Engineer with TypeScript experience.',
        skills: [{ category: 'Languages', items: ['TypeScript'] }],
        experience: [{ company: 'Acme', title: 'Senior Engineer', location: '', startDate: '2021', endDate: 'Present', bullets: ['Built React apps'] }],
        education: [],
        certifications: [],
        targetKeywords: ['TypeScript', 'React', 'Kubernetes'],
      },
    ]);
    const c = createTestContainer({ llm });
    await c.resolve(T.profileRepo).save(sampleProfile());
    const page = c.resolve(T.page) as FakePage;
    const out = await c.resolve(T.tailor).execute(page.job);
    expect(out.resume.contact.email).toBe('jane@example.com');
    expect(out.ats.matchedKeywords).toEqual(['TypeScript', 'React']);
    expect(out.ats.missingKeywords).toEqual(['Kubernetes']);
    expect(out.document.fileName).toBe('resume.pdf');
  });

  it('asks for a resume first when the profile is empty', async () => {
    const c = createTestContainer();
    await expect(c.resolve(T.tailor).execute((c.resolve(T.page) as FakePage).job)).rejects.toThrow(/Upload your resume/);
  });
});

describe('AutofillUseCase', () => {
  it('fills contact fields deterministically, asks the LLM for the rest, skips sensitive fields', async () => {
    const page = new FakePage([
      field({ id: 'f1', label: 'First Name', required: true }),
      field({ id: 'f2', label: 'Last Name' }),
      field({ id: 'f3', label: 'Email', type: 'email' }),
      field({ id: 'f4', label: 'Gender', type: 'select', options: ['Male', 'Female', 'Decline'] }),
      field({ id: 'f5', label: 'Why do you want to work here?', type: 'textarea', required: true }),
      field({ id: 'f6', label: 'Years of experience', type: 'select', options: ['0-2', '3-5', '6+'] }),
      field({ id: 'f7', label: 'Resume/CV', type: 'file' }),
      field({ id: 'f8', label: 'Salary expectations', required: true }),
    ]);
    const llm = new FakeLLM([
      {
        answers: [
          { fieldId: 'f5', value: 'Because I love building products.' },
          { fieldId: 'f6', value: '6+' },
          { fieldId: 'f8', value: '' },
          { fieldId: 'f4', value: 'Male' }, // must be ignored: not sent / sensitive
        ],
      },
    ]);
    const c = createTestContainer({ llm, page });
    await c.resolve(T.profileRepo).save(sampleProfile());
    const doc = { fileName: 'Jane_Resume.pdf', mimeType: 'application/pdf', bytes: new Uint8Array([1]) };
    const res = await c.resolve(T.autofill).execute({ job: page.job, resumeDocument: doc });

    const byId = Object.fromEntries(res.answers.map((a) => [a.fieldId, a]));
    expect(byId.f1).toMatchObject({ value: 'Jane', source: 'profile' });
    expect(byId.f2).toMatchObject({ value: 'Q Doe', source: 'profile' });
    expect(byId.f3).toMatchObject({ value: 'jane@example.com', source: 'profile' });
    expect(byId.f4).toBeUndefined();
    expect(byId.f5).toMatchObject({ source: 'ai' });
    expect(byId.f6).toMatchObject({ value: '6+', source: 'ai' });
    expect(byId.f7).toMatchObject({ source: 'resume-file' });
    expect(byId.f8).toBeUndefined();

    // Only non-deterministic, non-sensitive fields go to the LLM.
    const sent = llm.requests[0]!.messages[0]!.content;
    expect(sent).toContain('f5');
    expect(sent).not.toContain('"f4"');
    expect(sent).not.toContain('"f1"');

    expect(page.fills[0]!.attachment?.fileName).toBe('Jane_Resume.pdf');
    expect(page.fills[0]!.needsReview).toEqual([{ fieldId: 'f8', frameId: 0 }]);
    expect(res.skipped.find((s) => s.field.id === 'f4')?.reason).toBe('sensitive');
  });

  it('does not overwrite fields that already have a value', async () => {
    const page = new FakePage([field({ id: 'e', label: 'Email', currentValue: 'other@x.com' })]);
    const c = createTestContainer({ page });
    await c.resolve(T.profileRepo).save(sampleProfile());
    const res = await c.resolve(T.autofill).execute({ job: null, resumeDocument: null });
    expect(res.answers).toEqual([]);
    expect(res.skipped[0]!.reason).toBe('already-filled');
  });
});
