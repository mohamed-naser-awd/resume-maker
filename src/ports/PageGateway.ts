import type { FieldAnswer, FillReport, FormField } from '@/domain/form';
import type { JobPageScan, JobPosting } from '@/domain/job';
import type { RenderedDocument } from './ResumeRenderer';

export interface FieldRef {
  fieldId: string;
  frameId: number;
}

export interface FillRequest {
  answers: FieldAnswer[];
  /** File to put into resume-upload inputs (answers with source "resume-file"). */
  attachment: RenderedDocument | null;
  /** Required fields we couldn't answer – highlighted so the user notices them. */
  needsReview: FieldRef[];
}

/** Access to the job page the user is looking at (the active browser tab). */
export interface PageGateway {
  /** URL of the active tab ("" if unknown). */
  pageUrl(): Promise<string>;
  /** Reads the job on the active tab, plus hints (referrer, "view job" links) for finding the posting page. */
  readJobPosting(): Promise<JobPageScan>;
  /**
   * Reads the job posting at another URL without disturbing the user (hidden background tab).
   * Returns null if no reliable description was found there.
   */
  readJobPostingAt(url: string): Promise<JobPosting | null>;
  scanForm(): Promise<FormField[]>;
  fillForm(request: FillRequest): Promise<FillReport>;
}
