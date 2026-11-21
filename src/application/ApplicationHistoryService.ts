import {
  isSameJob,
  sortByRecent,
  type ApplicationRecord,
  type ApplicationStatus,
} from '@/domain/application';
import { LLMError } from '@/domain/errors';
import type { JobPosting } from '@/domain/job';
import { resumeToPlainText, type TailoredResume } from '@/domain/resume';
import type { LLMProvider } from '@/ports/LLMProvider';
import type { ApplicationRepository, Unsubscribe } from '@/ports/repositories';
import type { RenderedDocument, ResumeRenderer } from '@/ports/ResumeRenderer';
import type { Clock, IdGenerator } from '@/ports/system';
import { FOLLOW_UP_PROMPT } from './prompts';
import { followUpSchema, parseOutput, toJsonSchema, type FollowUpDraft } from './schemas';

export interface ApplicationHistoryDeps {
  applications: ApplicationRepository;
  renderer: ResumeRenderer;
  llm: LLMProvider;
  idGen: IdGenerator;
  clock: Clock;
}

const followUpJsonSchema = toJsonSchema(followUpSchema);
const MAX_STORED_DESCRIPTION = 20_000;

/** Keeps a history of jobs you prepared resumes for / applied to, and helps you follow up. */
export class ApplicationHistoryService {
  constructor(private readonly deps: ApplicationHistoryDeps) {}

  async list(): Promise<ApplicationRecord[]> {
    return sortByRecent(await this.deps.applications.list());
  }

  subscribe(listener: (records: ApplicationRecord[]) => void): Unsubscribe {
    return this.deps.applications.onChange((r) => listener(sortByRecent(r)));
  }

  /** Called whenever a resume is tailored: creates the record or updates the resume of the same job. */
  async recordResume(job: JobPosting, resume: TailoredResume): Promise<ApplicationRecord> {
    return this.upsert(job, (r) => ({ ...r, resume }));
  }

  /** "Mark as applied" – creates the record if needed and stamps the date. */
  async markApplied(job: JobPosting, resume: TailoredResume | null): Promise<ApplicationRecord> {
    const now = this.now();
    return this.upsert(job, (r) => ({
      ...r,
      resume: resume ?? r.resume,
      status: r.status === 'draft' ? 'applied' : r.status,
      appliedAt: r.appliedAt ?? now,
    }));
  }

  async findForJob(job: JobPosting): Promise<ApplicationRecord | null> {
    return (await this.deps.applications.list()).find((r) => isSameJob(r.job, job)) ?? null;
  }

  async setStatus(id: string, status: ApplicationStatus): Promise<void> {
    const now = this.now();
    await this.patch(id, (r) => ({
      ...r,
      status,
      appliedAt: r.appliedAt ?? (status !== 'draft' && status !== 'withdrawn' ? now : null),
    }));
  }

  async setNotes(id: string, notes: string): Promise<void> {
    await this.patch(id, (r) => ({ ...r, notes }));
  }

  /** Logs that you sent a follow-up (optionally with the message you sent). */
  async logFollowUp(id: string, message: string): Promise<void> {
    const date = this.now();
    await this.patch(id, (r) => ({
      ...r,
      followUps: [...r.followUps, { date, message }],
      status: r.status === 'applied' || r.status === 'draft' ? 'followed-up' : r.status,
      appliedAt: r.appliedAt ?? date,
    }));
  }

  async remove(id: string): Promise<void> {
    const all = await this.deps.applications.list();
    await this.deps.applications.saveAll(all.filter((r) => r.id !== id));
  }

  /** Regenerates the exact PDF that was tailored for this application. */
  async renderResume(id: string): Promise<RenderedDocument> {
    const record = await this.get(id);
    if (!record.resume) throw new LLMError('bad-request', 'No resume was generated for this application.');
    return this.deps.renderer.render(record.resume);
  }

  async draftFollowUp(id: string): Promise<FollowUpDraft> {
    const r = await this.get(id);
    const now = this.deps.clock();
    const raw = await this.deps.llm.completeJson({
      system: FOLLOW_UP_PROMPT,
      messages: [
        {
          role: 'user',
          content: [
            `Today: ${now.toDateString()}`,
            `Role: ${r.job.title || r.resume?.jobTitle || '(unknown)'}`,
            `Company: ${r.job.company || r.resume?.company || '(unknown)'}`,
            `Applied on: ${r.appliedAt ? new Date(r.appliedAt).toDateString() : '(date unknown)'}`,
            `Previous follow-ups: ${r.followUps.length ? r.followUps.map((f) => new Date(f.date).toDateString()).join(', ') : 'none'}`,
            '<resume>',
            r.resume ? resumeToPlainText(r.resume) : '(not available)',
            '</resume>',
            '<job_posting>',
            r.job.description.slice(0, 6000),
            '</job_posting>',
          ].join('\n'),
        },
      ],
      schema: followUpJsonSchema,
      schemaName: 'follow_up_email',
      effort: 'low',
    });
    return parseOutput(followUpSchema, raw, 'follow-up email');
  }

  private now() {
    return this.deps.clock().toISOString();
  }

  private async get(id: string): Promise<ApplicationRecord> {
    const record = (await this.deps.applications.list()).find((r) => r.id === id);
    if (!record) throw new Error('Application not found.');
    return record;
  }

  private async patch(id: string, fn: (r: ApplicationRecord) => ApplicationRecord): Promise<void> {
    const now = this.now();
    const all = await this.deps.applications.list();
    await this.deps.applications.saveAll(all.map((r) => (r.id === id ? { ...fn(r), updatedAt: now } : r)));
  }

  private async upsert(job: JobPosting, fn: (r: ApplicationRecord) => ApplicationRecord): Promise<ApplicationRecord> {
    const now = this.now();
    const storedJob = { ...job, description: job.description.slice(0, MAX_STORED_DESCRIPTION) };
    const all = await this.deps.applications.list();
    const existing = all.find((r) => isSameJob(r.job, job));
    const base: ApplicationRecord = existing ?? {
      id: this.deps.idGen(),
      job: storedJob,
      resume: null,
      status: 'draft',
      createdAt: now,
      updatedAt: now,
      appliedAt: null,
      followUps: [],
      notes: '',
    };
    const updated = { ...fn({ ...base, job: { ...base.job, ...nonEmpty(storedJob) } }), updatedAt: now };
    await this.deps.applications.saveAll(existing ? all.map((r) => (r.id === existing.id ? updated : r)) : [updated, ...all]);
    return updated;
  }
}

/** Only overwrite stored job fields with non-empty new values. */
function nonEmpty(job: JobPosting): Partial<JobPosting> {
  return Object.fromEntries(Object.entries(job).filter(([, v]) => typeof v === 'string' && v.trim())) as Partial<JobPosting>;
}
