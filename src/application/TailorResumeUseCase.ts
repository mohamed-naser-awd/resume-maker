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
import { RESUME_TAILOR_PROMPT } from './prompts';
import { parseOutput, tailoredResumeSchema, toJsonSchema } from './schemas';
import { candidateContext } from './context';

export interface TailorResumeDeps {
  llm: LLMProvider;
  profiles: ProfileRepository;
  accomplishments: AccomplishmentService;
  renderer: ResumeRenderer;
  clock: Clock;
}

export interface TailorResult {
  resume: TailoredResume;
  ats: AtsReport;
  document: RenderedDocument;
}

const tailoredResumeJsonSchema = toJsonSchema(tailoredResumeSchema);
const MAX_JOB_CHARS = 20_000;

/** Profile + accomplishments + job posting -> tailored ATS resume (data + PDF + checks). */
export class TailorResumeUseCase {
  constructor(private readonly deps: TailorResumeDeps) {}

  async execute(job: JobPosting): Promise<TailorResult> {
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
    return { resume, ats: assessAts(resume), document };
  }
}
