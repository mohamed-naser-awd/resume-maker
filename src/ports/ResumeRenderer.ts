import type { TailoredResume } from '@/domain/resume';

export interface RenderedDocument {
  fileName: string;
  mimeType: string;
  bytes: Uint8Array;
}

/** Turns a TailoredResume into a downloadable file (PDF today; DOCX could be another adapter). */
export interface ResumeRenderer {
  render(resume: TailoredResume): Promise<RenderedDocument>;
}
