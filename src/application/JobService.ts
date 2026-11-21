import { LLMError } from '@/domain/errors';
import { hasUsableDescription, type JobPosting } from '@/domain/job';
import type { PageGateway } from '@/ports/PageGateway';

/** Reads the job posting from the active tab. */
export class JobService {
  constructor(private readonly page: PageGateway) {}

  async detectFromPage(): Promise<JobPosting> {
    const job = await this.page.readJobPosting();
    if (!hasUsableDescription(job)) {
      throw new LLMError(
        'bad-request',
        "Couldn't find a job description on this page. Open the job posting (or paste the description manually).",
      );
    }
    return job;
  }
}
