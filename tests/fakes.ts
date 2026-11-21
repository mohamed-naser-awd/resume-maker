import { Container } from '@/di/container';
import { registerApplication } from '@/di/registerApplication';
import { TOKENS as T } from '@/di/tokens';
import type { FieldAnswer, FillReport, FormField } from '@/domain/form';
import type { JobPageScan, JobPosting } from '@/domain/job';
import { emptyProfile, type Profile } from '@/domain/profile';
import type { LLMJsonRequest, LLMProvider, LLMRequest } from '@/ports/LLMProvider';
import type { FillRequest, PageGateway } from '@/ports/PageGateway';
import type { RenderedDocument, ResumeRenderer } from '@/ports/ResumeRenderer';
import {
  InMemoryStore,
  StoreAccomplishmentRepository,
  StoreApplicationRepository,
  StoreChatRepository,
  StoreJobMemoryRepository,
  StoreProfileRepository,
  StoreSettingsRepository,
} from '@/infrastructure/storage/ChromeStorage';
import { PlainTextExtractor } from '@/infrastructure/extract/extractors';

/** Scripted LLM: each call pops the next response (or calls a responder). Records requests. */
export class FakeLLM implements LLMProvider {
  readonly id = 'fake';
  readonly requests: (LLMRequest | LLMJsonRequest)[] = [];
  constructor(private responses: unknown[] = []) {}
  queue(...r: unknown[]) {
    this.responses.push(...r);
  }
  async complete(req: LLMRequest): Promise<string> {
    this.requests.push(req);
    return String(this.responses.shift() ?? '');
  }
  async completeJson(req: LLMJsonRequest): Promise<unknown> {
    this.requests.push(req);
    const next = this.responses.shift();
    return typeof next === 'function' ? (next as (r: LLMJsonRequest) => unknown)(req) : next;
  }
  async testConnection(): Promise<void> {}
}

export class FakePage implements PageGateway {
  fills: FillRequest[] = [];
  /** Pages that readJobPostingAt can "open", by URL. */
  otherPages = new Map<string, JobPosting>();
  opened: string[] = [];
  referrer = '';
  relatedLinks: string[] = [];
  constructor(
    public fields: FormField[] = [],
    public job: JobPosting = { title: 'Engineer', company: 'Acme', location: '', description: 'x'.repeat(300), url: 'https://acme.test/job', source: 'board' },
  ) {}
  async pageUrl() {
    return this.job.url;
  }
  async readJobPosting(): Promise<JobPageScan> {
    return { job: this.job, referrer: this.referrer, relatedLinks: this.relatedLinks };
  }
  async readJobPostingAt(url: string) {
    this.opened.push(url);
    return this.otherPages.get(url) ?? null;
  }
  async scanForm() {
    return this.fields;
  }
  async fillForm(req: FillRequest): Promise<FillReport> {
    this.fills.push(req);
    return { filled: req.answers.length, failed: [] };
  }
}

export class FakeRenderer implements ResumeRenderer {
  async render(): Promise<RenderedDocument> {
    return { fileName: 'resume.pdf', mimeType: 'application/pdf', bytes: new Uint8Array([1, 2, 3]) };
  }
}

export function field(partial: Partial<FormField> & Pick<FormField, 'id' | 'label'>): FormField {
  return { frameId: 0, type: 'text', name: '', placeholder: '', autocomplete: '', required: false, options: [], currentValue: '', ...partial };
}

export function sampleProfile(): Profile {
  return {
    ...emptyProfile(),
    contact: {
      fullName: 'Jane Q Doe',
      email: 'jane@example.com',
      phone: '+1 555 0100',
      location: 'Austin, TX',
      linkedin: 'https://linkedin.com/in/janedoe',
      github: 'https://github.com/janedoe',
      website: '',
    },
    headline: 'Senior Software Engineer',
    experience: [
      { company: 'Acme', title: 'Senior Engineer', location: 'Remote', startDate: '2021', endDate: 'Present', bullets: ['Built APIs'] },
    ],
    skills: ['TypeScript', 'React'],
    sourceResumeText: 'Jane Q Doe resume text',
  };
}

/** The same composition as the extension, but every port is an in-memory fake. */
export function createTestContainer(opts: { llm?: FakeLLM; page?: FakePage } = {}) {
  let n = 0;
  const c = new Container()
    .register(T.store, () => new InMemoryStore())
    .register(T.settingsRepo, (c) => new StoreSettingsRepository(c.resolve(T.store)))
    .register(T.profileRepo, (c) => new StoreProfileRepository(c.resolve(T.store)))
    .register(T.accomplishmentRepo, (c) => new StoreAccomplishmentRepository(c.resolve(T.store)))
    .register(T.chatRepo, (c) => new StoreChatRepository(c.resolve(T.store)))
    .register(T.applicationRepo, (c) => new StoreApplicationRepository(c.resolve(T.store)))
    .register(T.jobMemoryRepo, (c) => new StoreJobMemoryRepository(c.resolve(T.store)))
    .register(T.llm, () => opts.llm ?? new FakeLLM())
    .register(T.extractor, () => new PlainTextExtractor())
    .register(T.renderer, () => new FakeRenderer())
    .register(T.page, () => opts.page ?? new FakePage())
    .register(T.idGen, () => () => `id-${++n}`)
    .register(T.clock, () => () => new Date('2026-01-01T00:00:00Z'));
  return registerApplication(c);
}

export type { FieldAnswer };
