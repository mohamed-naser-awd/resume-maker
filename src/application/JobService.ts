import { LLMError, PageAccessError } from '@/domain/errors';
import { detectApplicationForm } from '@/domain/form';
import { hasUsableDescription, isReliableJob, type JobPageScan, type JobPosting } from '@/domain/job';
import { jobIdentity, postingUrlCandidates } from '@/domain/jobIdentity';
import type { PageGateway } from '@/ports/PageGateway';
import type { JobMemoryRepository } from '@/ports/repositories';
import type { ApplicationHistoryService } from './ApplicationHistoryService';

/** Where the description shown for the current page came from. */
export type JobOrigin =
  | 'page' // read from this page
  | 'memory' // seen earlier while browsing the posting
  | 'history' // a resume was already generated for this job
  | 'posting-page'; // fetched from the posting page in a background tab

export interface DetectedJob {
  job: JobPosting;
  origin: JobOrigin;
}

export interface JobServiceDeps {
  page: PageGateway;
  memory: JobMemoryRepository;
  history: ApplicationHistoryService;
}

/** How many other pages we're willing to open in the background to find a description. */
const MAX_BACKGROUND_READS = 3;

/**
 * Finds the job description for the active tab. Handles applications where the
 * description and the form are on different pages (e.g. Workable ".../j/ID/" vs ".../j/ID/apply/"):
 *   1. a reliable description on this page,
 *   2. a posting remembered for this job (seen while browsing) or saved in history,
 *   3. the posting page – found via referrer, "View job" links or the URL without /apply –
 *      from memory, else read in a hidden background tab,
 *   4. this page's main text, but only if it doesn't look like an application form.
 */
export class JobService {
  constructor(private readonly deps: JobServiceDeps) {}

  async detectFromPage(): Promise<DetectedJob> {
    const scan = await this.deps.page.readJobPosting();
    const quick = await this.resolveWithoutBrowsing(scan);
    if (quick) return quick;

    let permissionError: PageAccessError | null = null;
    for (const url of this.candidates(scan).slice(0, MAX_BACKGROUND_READS)) {
      try {
        const posting = await this.deps.page.readJobPostingAt(url);
        if (isReliableJob(posting)) {
          await this.remember(posting, scan.job.url);
          return { job: posting, origin: 'posting-page' };
        }
      } catch (e) {
        if (e instanceof PageAccessError && e.needsPermission) permissionError ??= e;
      }
    }

    if (hasUsableDescription(scan.job) && !(await this.looksLikeForm(scan.job.url))) {
      return { job: scan.job, origin: 'page' };
    }
    if (permissionError) throw permissionError;
    throw new LLMError(
      'bad-request',
      "This looks like an application form and the job description isn't on it. Open the job posting page first (it will be remembered), or paste the description manually.",
    );
  }

  /**
   * Passive version for page loads: remembers a reliable posting and returns the job
   * if it's known without opening other pages. Never throws.
   */
  async rememberFromPage(): Promise<DetectedJob | null> {
    try {
      return await this.resolveWithoutBrowsing(await this.deps.page.readJobPosting());
    } catch {
      return null;
    }
  }

  private async resolveWithoutBrowsing(scan: JobPageScan): Promise<DetectedJob | null> {
    const { job } = scan;
    const url = job.url;
    if (isReliableJob(job)) {
      await this.remember(job);
      return { job, origin: 'page' };
    }
    const known = await this.lookup(url);
    if (known) return known;
    for (const url of this.candidates(scan)) {
      const posting = await this.deps.memory.get(jobIdentity(url));
      if (hasUsableDescription(posting)) {
        await this.remember(posting, url);
        return { job: posting, origin: 'memory' };
      }
    }
    return null;
  }

  private async lookup(url: string): Promise<DetectedJob | null> {
    if (!url) return null;
    const remembered = await this.deps.memory.get(jobIdentity(url));
    if (hasUsableDescription(remembered)) return { job: remembered, origin: 'memory' };
    const record = await this.deps.history.findByLink({ title: '', company: '', location: '', description: '', url });
    if (record && hasUsableDescription(record.job)) return { job: record.job, origin: 'history' };
    return null;
  }

  /** Possible posting pages for this (form) page, most likely first, excluding the page itself. */
  private candidates(scan: JobPageScan): string[] {
    const self = jobIdentity(scan.job.url);
    const seen = new Set<string>();
    const out: string[] = [];
    const isWeb = (u: string) => /^https?:\/\//i.test(u);
    for (const url of [...postingUrlCandidates(scan.job.url), ...scan.relatedLinks, scan.referrer]) {
      if (!url || !isWeb(url)) continue;
      const id = jobIdentity(url);
      // Same identity but a different URL is fine (the posting page of this job); skip exact duplicates.
      const key = url.replace(/[#?].*$/, '').replace(/\/$/, '');
      if (key === scan.job.url.replace(/[#?].*$/, '').replace(/\/$/, '') || seen.has(key)) continue;
      if (id !== self && /google\.|bing\.|duckduckgo\./i.test(url)) continue;
      seen.add(key);
      out.push(url);
    }
    return out;
  }

  /** Stores a posting under its own identity and (if different) the form page's identity. */
  private async remember(job: JobPosting, alsoFor?: string): Promise<void> {
    const ids = new Set([jobIdentity(job.url), ...(alsoFor ? [jobIdentity(alsoFor)] : [])]);
    for (const id of ids) await this.deps.memory.put(id, job);
  }

  private async looksLikeForm(url: string): Promise<boolean> {
    const fields = await this.deps.page.scanForm().catch(() => []);
    return detectApplicationForm(fields, url).likely;
  }
}
