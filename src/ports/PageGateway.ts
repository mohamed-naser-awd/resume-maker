import type { FieldAnswer, FillReport, FormField } from '@/domain/form';
import type { JobPosting } from '@/domain/job';
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
  readJobPosting(): Promise<JobPosting>;
  scanForm(): Promise<FormField[]>;
  fillForm(request: FillRequest): Promise<FillReport>;
}
