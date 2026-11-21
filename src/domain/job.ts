/**
 * Where a description came from:
 * - structured: schema.org JobPosting data on the page
 * - board:      a known job-board / ATS layout
 * - fallback:   the page's main text (may be a form, not a description)
 * - manual:     pasted/edited by the user
 */
export type JobSource = 'structured' | 'board' | 'fallback' | 'manual';

export interface JobPosting {
  title: string;
  company: string;
  location: string;
  description: string;
  url: string;
  source?: JobSource;
}

/** What the page scanner returns: the job plus hints for finding the posting page. */
export interface JobPageScan {
  job: JobPosting;
  /** document.referrer – often the posting page you came from. */
  referrer: string;
  /** Links on the page that look like "View job" / "Job description". */
  relatedLinks: string[];
}

export const MIN_JOB_DESCRIPTION_LENGTH = 200;

export function hasUsableDescription(job: JobPosting | null | undefined): job is JobPosting {
  return !!job && job.description.trim().length >= MIN_JOB_DESCRIPTION_LENGTH;
}

/** A description we trust for tailoring without further checks. */
export function isReliableJob(job: JobPosting | null | undefined): job is JobPosting {
  return hasUsableDescription(job) && (job.source === 'structured' || job.source === 'board' || job.source === 'manual');
}

/**
 * Merges a newer scan into a stored job. Non-empty fields win, except that an
 * unreliable description (e.g. text of an application form) never replaces a stored one.
 */
export function mergeJob(stored: JobPosting, incoming: JobPosting): JobPosting {
  const keepDescription = !!stored.description && !isReliableJob(incoming);
  const merged: JobPosting = { ...stored };
  for (const key of ['title', 'company', 'location', 'url'] as const) {
    if (incoming[key]?.trim()) merged[key] = incoming[key];
  }
  if (!keepDescription && incoming.description.trim()) {
    merged.description = incoming.description;
    merged.source = incoming.source;
  }
  return merged;
}
