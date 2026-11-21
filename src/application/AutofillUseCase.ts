import {
  isResumeUploadField,
  isSensitiveField,
  matchOption,
  type AutofillResult,
  type FieldAnswer,
  type FormField,
  type SkippedField,
} from '@/domain/form';
import type { JobPosting } from '@/domain/job';
import { isProfileEmpty } from '@/domain/profile';
import { LLMError } from '@/domain/errors';
import type { LLMProvider } from '@/ports/LLMProvider';
import type { PageGateway } from '@/ports/PageGateway';
import type { ProfileRepository, SettingsRepository } from '@/ports/repositories';
import type { RenderedDocument } from '@/ports/ResumeRenderer';
import type { AccomplishmentService } from './AccomplishmentService';
import { candidateContext } from './context';
import { profileValueForField } from './fieldMapping';
import { FORM_ANSWER_PROMPT } from './prompts';
import { fieldAnswersSchema, parseOutput, toJsonSchema } from './schemas';

export interface AutofillDeps {
  page: PageGateway;
  llm: LLMProvider;
  profiles: ProfileRepository;
  accomplishments: AccomplishmentService;
  settings: SettingsRepository;
}

export interface AutofillInput {
  job: JobPosting | null;
  /** Generated resume to attach to resume-upload inputs (optional). */
  resumeDocument: RenderedDocument | null;
}

const fieldAnswersJsonSchema = toJsonSchema(fieldAnswersSchema);
const MAX_AI_FIELDS = 60;

/**
 * Scans the form, answers what it can from the profile, asks the LLM for the rest,
 * then fills the page. Never submits – the user reviews and clicks Submit.
 */
export class AutofillUseCase {
  constructor(private readonly deps: AutofillDeps) {}

  async execute(input: AutofillInput): Promise<AutofillResult> {
    const [fields, profile, accomplishments, settings] = await Promise.all([
      this.deps.page.scanForm(),
      this.deps.profiles.get(),
      this.deps.accomplishments.list(),
      this.deps.settings.get(),
    ]);
    if (isProfileEmpty(profile)) throw new LLMError('bad-request', 'Upload your resume in the Profile tab first.');
    if (fields.length === 0) {
      throw new LLMError('bad-request', 'No form fields found on this page. Open the application form and try again.');
    }

    const answers: FieldAnswer[] = [];
    const skipped: SkippedField[] = [];
    const forAi: FormField[] = [];
    let attachment: RenderedDocument | null = null;

    for (const field of fields) {
      if (settings.skipSensitiveFields && isSensitiveField(field)) {
        skipped.push({ field, reason: 'sensitive' });
        continue;
      }
      if (field.type === 'file') {
        if (isResumeUploadField(field) && settings.attachResumeOnFill && input.resumeDocument && !field.currentValue) {
          answers.push({ fieldId: field.id, frameId: field.frameId, value: input.resumeDocument.fileName, source: 'resume-file' });
          attachment = input.resumeDocument;
        } else {
          skipped.push({ field, reason: 'unsupported' });
        }
        continue;
      }
      if (field.currentValue.trim() && field.type !== 'checkbox') {
        skipped.push({ field, reason: 'already-filled' });
        continue;
      }
      const direct = profileValueForField(field, profile);
      if (direct) {
        answers.push({ fieldId: field.id, frameId: field.frameId, value: direct, source: 'profile' });
      } else {
        forAi.push(field);
      }
    }

    if (forAi.length) {
      const aiAnswers = await this.askLlm(forAi.slice(0, MAX_AI_FIELDS), candidateContext(profile, accomplishments), input.job);
      for (const field of forAi) {
        const value = aiAnswers.get(field.id);
        if (value) answers.push({ fieldId: field.id, frameId: field.frameId, value, source: 'ai' });
        else skipped.push({ field, reason: 'no-answer' });
      }
    }

    const needsReview = skipped
      .filter((s) => s.field.required && s.reason !== 'already-filled')
      .map((s) => ({ fieldId: s.field.id, frameId: s.field.frameId }));
    const report = await this.deps.page.fillForm({ answers, attachment, needsReview });
    return { answers, skipped, report };
  }

  /** Returns fieldId -> validated value (invalid option choices are dropped). */
  private async askLlm(fields: FormField[], candidate: string, job: JobPosting | null): Promise<Map<string, string>> {
    const fieldList = fields.map((f) => ({
      fieldId: f.id,
      type: f.type,
      label: f.label || f.placeholder || f.name,
      required: f.required,
      ...(f.options.length ? { options: f.options } : {}),
    }));
    const raw = await this.deps.llm.completeJson({
      system: FORM_ANSWER_PROMPT,
      messages: [
        {
          role: 'user',
          content: [
            candidate,
            '<job_posting>',
            job ? `${job.title} at ${job.company}\n${job.description.slice(0, 8000)}` : '(not available)',
            '</job_posting>',
            '<fields>',
            JSON.stringify(fieldList, null, 1),
            '</fields>',
          ].join('\n'),
        },
      ],
      schema: fieldAnswersJsonSchema,
      schemaName: 'field_answers',
      effort: 'medium',
    });
    const out = parseOutput(fieldAnswersSchema, raw, 'form answers');
    const byId = new Map(fields.map((f) => [f.id, f]));
    const result = new Map<string, string>();
    for (const { fieldId, value } of out.answers) {
      const field = byId.get(fieldId);
      const v = value.trim();
      if (!field || !v) continue;
      if (field.type === 'select' || field.type === 'radio') {
        const option = matchOption(v, field.options);
        if (option) result.set(fieldId, option);
      } else if (field.type === 'checkbox') {
        if (v === 'true' || v === 'false') result.set(fieldId, v);
      } else {
        result.set(fieldId, v);
      }
    }
    return result;
  }
}
