import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { Container, token } from '@/di/container';
import { LLMError } from '@/domain/errors';
import { defaultSettings } from '@/domain/settings';
import { assessAts } from '@/domain/ats-rules';
import { isSensitiveField, matchOption } from '@/domain/form';
import type { TailoredResume } from '@/domain/resume';
import { toJsonSchema, tailoredResumeSchema } from '@/application/schemas';
import { SettingsBackedLLMProvider } from '@/infrastructure/llm/LLMProviderFactory';
import { PdfLibResumeRenderer } from '@/infrastructure/render/PdfLibResumeRenderer';
import { InMemoryStore, StoreSettingsRepository } from '@/infrastructure/storage/ChromeStorage';
import { FakeLLM, sampleProfile } from './fakes';

describe('Container', () => {
  it('resolves lazy singletons and supports overrides', () => {
    const t = token<{ n: number }>('thing');
    let made = 0;
    const c = new Container().register(t, () => ({ n: ++made }));
    expect(c.resolve(t)).toBe(c.resolve(t));
    c.override(t, () => ({ n: 99 }));
    expect(c.resolve(t).n).toBe(99);
  });
});

describe('SettingsBackedLLMProvider', () => {
  it('picks the adapter from settings at call time and requires a key', async () => {
    const repo = new StoreSettingsRepository(new InMemoryStore());
    const fakeClaude = new FakeLLM(['from claude']);
    const fakeOpenAI = new FakeLLM(['from openai']);
    const created: string[] = [];
    const llm = new SettingsBackedLLMProvider(repo, {
      claude: (cfg) => (created.push(`claude:${cfg.apiKey}`), fakeClaude),
      openai: (cfg) => (created.push(`openai:${cfg.apiKey}`), fakeOpenAI),
    });
    const req = { system: '', messages: [{ role: 'user' as const, content: 'hi' }] };

    await expect(llm.complete(req)).rejects.toMatchObject({ kind: 'not-configured' });

    const s = defaultSettings();
    s.providers.claude.apiKey = 'k1';
    await repo.save(s);
    expect(await llm.complete(req)).toBe('from claude');

    s.provider = 'openai';
    s.providers.openai.apiKey = 'k2';
    await repo.save(s);
    expect(await llm.complete(req)).toBe('from openai');
    expect(created).toEqual(['claude:k1', 'openai:k2']);
  });
});

describe('toJsonSchema', () => {
  it('produces closed objects with every property required', () => {
    const schema = toJsonSchema(tailoredResumeSchema) as Record<string, any>;
    expect(schema.additionalProperties).toBe(false);
    expect(schema.required).toContain('targetKeywords');
    const exp = schema.properties.experience.items;
    expect(exp.additionalProperties).toBe(false);
    expect(exp.required).toEqual(Object.keys(exp.properties));
    expect(schema.$schema).toBeUndefined();
  });
});

const resume = (): TailoredResume => ({
  contact: sampleProfile().contact,
  headline: 'Senior Software Engineer',
  summary: 'Engineer who ships “quality” software → fast. Ünïcödé ✓ 🚀',
  skills: [{ category: 'Languages', items: ['TypeScript', 'Go'] }],
  experience: Array.from({ length: 6 }, (_, i) => ({
    company: `Company ${i}`,
    title: 'Senior Engineer',
    location: 'Remote',
    startDate: '2020',
    endDate: 'Present',
    bullets: Array.from({ length: 6 }, () => 'Led sprint planning and retrospectives for a cross-functional team of 6 developers, improving delivery predictability across quarters.'),
  })),
  education: [{ institution: 'State University', degree: 'BSc', field: 'Computer Science', endDate: '2015', details: '' }],
  certifications: ['AWS Certified Developer'],
  targetKeywords: ['TypeScript', 'Kubernetes'],
  jobTitle: 'Staff Engineer',
  company: 'Acme Corp',
  generatedAt: '2026-01-01T00:00:00Z',
});

describe('PdfLibResumeRenderer', () => {
  it('renders a multi-page text PDF and survives non-WinAnsi characters', async () => {
    const out = await new PdfLibResumeRenderer().render(resume());
    expect(out.fileName).toBe('Jane_Q_Doe_Resume_Acme_Corp.pdf');
    const pdf = await PDFDocument.load(out.bytes);
    expect(pdf.getPageCount()).toBeGreaterThan(1);
    expect(pdf.getTitle()).toContain('Jane Q Doe');
  });
});

describe('domain rules', () => {
  it('flags sensitive fields', () => {
    const f = (label: string) => ({ label, name: '', placeholder: '', autocomplete: '' });
    expect(isSensitiveField(f('Gender identity'))).toBe(true);
    expect(isSensitiveField(f('Are you a protected veteran?'))).toBe(true);
    expect(isSensitiveField(f('First name'))).toBe(false);
    expect(isSensitiveField({ ...f('Card'), autocomplete: 'cc-number' })).toBe(true);
  });

  it('matches options loosely', () => {
    expect(matchOption('yes', ['Yes', 'No'])).toBe('Yes');
    expect(matchOption('Austin', ['Austin, TX', 'Remote'])).toBe('Austin, TX');
    expect(matchOption('Paris', ['Yes', 'No'])).toBeNull();
  });

  it('reports ATS issues', () => {
    const r = resume();
    r.contact = { ...r.contact, email: '' };
    const report = assessAts(r);
    expect(report.issues.some((i) => i.severity === 'error' && /Email/.test(i.message))).toBe(true);
    expect(report.missingKeywords).toEqual(['Kubernetes']);
  });

  it('LLMError carries its kind', () => {
    expect(new LLMError('auth', 'x').kind).toBe('auth');
  });
});
