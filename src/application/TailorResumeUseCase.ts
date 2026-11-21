import { assessAts, type AtsReport } from '@/domain/ats-rules';
import { LLMError } from '@/domain/errors';
import type { JobPosting } from '@/domain/job';
import { isProfileEmpty } from '@/domain/profile';
import type { TailoredResume } from '@/domain/resume';
import type { LLMProvider } from '@/ports/LLMProvider';
import type { ProfileRepository } from '@/ports/repositories';
import type { RenderedDocument, ResumeRenderer } from '@/ports/ResumeRenderer';
import type { Clock } from '@/ports/system';
import type { AccomplishmentService } from './AccomplishmentService';
import type { ApplicationHistoryService } from './ApplicationHistoryService';
import { jobKey, type ApplicationRecord } from '@/domain/application';
import { RESUME_TAILOR_PROMPT } from './prompts';
import { parseOutput, tailoredResumeSchema, toJsonSchema } from './schemas';
import { candidateContext } from './context';

export interface TailorResumeDeps {
  llm: LLMProvider;
  profiles: ProfileRepository;
  accomplishments: AccomplishmentService;
  renderer: ResumeRenderer;
  history: ApplicationHistoryService;
  clock: Clock;
}

export interface TailorResult {
  resume: TailoredResume;
  ats: AtsReport;
  document: RenderedDocument;
  /** History entry this resume was saved to. */
  application: ApplicationRecord;
  /** true = the resume saved earlier for this link was returned; no AI call was made. */
  reused: boolean;
}

export interface TailorOptions {
  /** Generate a fresh version even if one exists for this link. */
  force?: boolean;
}

const tailoredResumeJsonSchema = toJsonSchema(tailoredResumeSchema);
const MAX_JOB_CHARS = 20_000;

/**
 * Profile + accomplishments + job posting -> tailored ATS resume (data + PDF + checks).
 *
 * Idempotent per job link: if a resume was already generated for the same link it is
 * returned from history (no AI call) unless `force` is set, and concurrent calls for the
 * same link share one in-flight request.
 */
export class TailorResumeUseCase {
  private readonly inFlight = new Map<string, Promise<TailorResult>>();

  constructor(private readonly deps: TailorResumeDeps) {}

  /** The resume previously generated for this exact link, or null. Never calls the AI. */
  async loadSaved(job: JobPosting): Promise<TailorResult | null> {
    const record = await this.deps.history.findByLink(job);
    if (!record?.resume) return null;
    const document = await this.deps.renderer.render(record.resume);
    return { resume: record.resume, ats: assessAts(record.resume), document, application: record, reused: true };
  }

  execute(job: JobPosting, options: TailorOptions = {}): Promise<TailorResult> {
    const key = `${jobKey(job)}|${options.force ? 'force' : 'reuse'}`;
    const pending = this.inFlight.get(key);
    if (pending) return pending;
    const run = this.run(job, options).finally(() => this.inFlight.delete(key));
    this.inFlight.set(key, run);
    return run;
  }

  private async run(job: JobPosting, options: TailorOptions): Promise<TailorResult> {
    if (!options.force) {
      const saved = await this.loadSaved(job);
      if (saved) return saved;
    }

    const [profile, accomplishments] = await Promise.all([
      this.deps.profiles.get(),
      this.deps.accomplishments.list(),
    ]);
    if (isProfileEmpty(profile)) {
      throw new LLMError('bad-request', 'Upload your resume in the Profile tab first.');
    }

    const raw = await this.deps.llm.completeJson({
      system: RESUME_TAILOR_PROMPT,
      messages: [
        {
          role: 'user',
          content: [
            candidateContext(profile, accomplishments),
            '<job_posting>',
            `Title: ${job.title}`,
            `Company: ${job.company}`,
            `Location: ${job.location}`,
            `URL: ${job.url}`,
            '',
            job.description.slice(0, MAX_JOB_CHARS),
            '</job_posting>',
          ].join('\n'),
        },
      ],
      schema: tailoredResumeJsonSchema,
      schemaName: 'tailored_resume',
      effort: 'high',
    });
    const out = parseOutput(tailoredResumeSchema, raw, 'resume');

    const resume: TailoredResume = {
      // Contact details always come from the stored profile, never from the model.
      contact: profile.contact,
      headline: out.headline,
      summary: out.summary,
      skills: out.skills.filter((g) => g.items.length > 0),
      experience: out.experience,
      education: out.education,
      certifications: out.certifications,
      targetKeywords: out.targetKeywords,
      jobTitle: job.title || out.jobTitle,
      company: job.company || out.company,
      generatedAt: this.deps.clock().toISOString(),
    };
    const document = await this.deps.renderer.render(resume);
    // Every tailored resume is kept in the application history.
    const application = await this.deps.history.recordResume(job, resume);
    return { resume, ats: assessAts(resume), document, application, reused: false };
  }
}
