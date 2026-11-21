import { emptyProfile, type Profile } from '@/domain/profile';
import { LLMError } from '@/domain/errors';
import type { DocumentTextExtractor, UploadedDocument } from '@/ports/DocumentTextExtractor';
import type { LLMProvider } from '@/ports/LLMProvider';
import type { ProfileRepository } from '@/ports/repositories';
import type { Clock } from '@/ports/system';
import { RESUME_PARSER_PROMPT } from './prompts';
import { parseOutput, parsedResumeSchema, toJsonSchema } from './schemas';

export interface ProfileServiceDeps {
  profiles: ProfileRepository;
  extractor: DocumentTextExtractor;
  llm: LLMProvider;
  clock: Clock;
}

const parsedResumeJsonSchema = toJsonSchema(parsedResumeSchema);

/** Uploading/parsing the base resume and editing the stored profile. */
export class ProfileService {
  constructor(private readonly deps: ProfileServiceDeps) {}

  get(): Promise<Profile> {
    return this.deps.profiles.get();
  }

  /** Notifies whenever the stored profile changes (upload, edit, other extension page). */
  subscribe(listener: (profile: Profile) => void): () => void {
    return this.deps.profiles.onChange(listener);
  }

  async save(profile: Profile): Promise<Profile> {
    const updated = { ...profile, updatedAt: this.deps.clock().toISOString() };
    await this.deps.profiles.save(updated);
    return updated;
  }

  supportsFile(file: Pick<UploadedDocument, 'name' | 'mimeType'>): boolean {
    return this.deps.extractor.supports(file);
  }

  /** Extracts text from the file, has the LLM structure it, and stores the result. */
  async importResume(doc: UploadedDocument): Promise<Profile> {
    const text = (await this.deps.extractor.extract(doc)).trim();
    if (text.length < 50) {
      throw new LLMError(
        'bad-request',
        'Could not read text from this file. If it is a scanned PDF, export it as a text-based PDF or DOCX.',
      );
    }
    return this.importResumeText(text);
  }

  async importResumeText(text: string): Promise<Profile> {
    const raw = await this.deps.llm.completeJson({
      system: RESUME_PARSER_PROMPT,
      messages: [{ role: 'user', content: `<resume>\n${text}\n</resume>` }],
      schema: parsedResumeJsonSchema,
      schemaName: 'parsed_resume',
      effort: 'low',
    });
    const parsed = parseOutput(parsedResumeSchema, raw, 'resume');
    const existing = await this.deps.profiles.get();
    const profile: Profile = {
      ...emptyProfile(),
      ...parsed,
      // Keep things the user typed that a resume never contains.
      applicationFacts: existing.applicationFacts,
      sourceResumeText: text,
      updatedAt: this.deps.clock().toISOString(),
    };
    await this.deps.profiles.save(profile);
    return profile;
  }
}
