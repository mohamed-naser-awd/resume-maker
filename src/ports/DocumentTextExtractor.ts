export interface UploadedDocument {
  name: string;
  mimeType: string;
  data: ArrayBuffer;
}

/** Turns an uploaded resume file into plain text. */
export interface DocumentTextExtractor {
  supports(doc: Pick<UploadedDocument, 'name' | 'mimeType'>): boolean;
  extract(doc: UploadedDocument): Promise<string>;
}
