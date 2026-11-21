export interface JobPosting {
  title: string;
  company: string;
  location: string;
  description: string;
  url: string;
}

export const MIN_JOB_DESCRIPTION_LENGTH = 200;

export function hasUsableDescription(job: JobPosting | null | undefined): job is JobPosting {
  return !!job && job.description.trim().length >= MIN_JOB_DESCRIPTION_LENGTH;
}
