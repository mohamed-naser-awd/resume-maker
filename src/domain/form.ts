export type FieldType =
  | 'text'
  | 'email'
  | 'tel'
  | 'url'
  | 'number'
  | 'date'
  | 'textarea'
  | 'select'
  | 'radio'
  | 'checkbox'
  | 'file';

export interface FormField {
  /** Stable id assigned by the page scanner (data attribute on the element). */
  id: string;
  /** Frame the field lives in (application forms are often iframes). */
  frameId: number;
  type: FieldType;
  label: string;
  name: string;
  placeholder: string;
  autocomplete: string;
  required: boolean;
  /** Visible option labels for select / radio groups. */
  options: string[];
  /** Value already present on the page (we don't overwrite non-empty fields). */
  currentValue: string;
}

export type AnswerSource = 'profile' | 'ai' | 'resume-file';

export interface FieldAnswer {
  fieldId: string;
  frameId: number;
  /** For select/radio: one of the field's options. For checkbox: "true"/"false". */
  value: string;
  source: AnswerSource;
}

export type SkipReason = 'sensitive' | 'already-filled' | 'no-answer' | 'unsupported';

export interface SkippedField {
  field: FormField;
  reason: SkipReason;
}

export interface FillReport {
  filled: number;
  failed: string[];
}

export interface AutofillResult {
  answers: FieldAnswer[];
  skipped: SkippedField[];
  report: FillReport;
}

const SENSITIVE_PATTERNS: RegExp[] = [
  /password|passcode/i,
  /\b(ssn|social security|national id|passport)\b/i,
  /credit card|card number|cvv|cvc|iban|routing|bank account/i,
  /\bgender\b|\bsex\b|pronoun/i,
  /\brace\b|ethnic|hispanic|latino/i,
  /veteran|military status/i,
  /disabilit/i,
  /sexual orientation|lgbt/i,
  /date of birth|birth ?date|\bdob\b|\bage\b/i,
  /religio/i,
];

/** EEO / demographic / secret fields are never filled automatically. */
export function isSensitiveField(field: Pick<FormField, 'label' | 'name' | 'placeholder' | 'autocomplete'>): boolean {
  if (/^cc-|new-password|current-password/.test(field.autocomplete)) return true;
  const haystack = `${field.label} ${field.name} ${field.placeholder}`;
  return SENSITIVE_PATTERNS.some((re) => re.test(haystack));
}

export function isResumeUploadField(field: FormField): boolean {
  if (field.type !== 'file') return false;
  const text = `${field.label} ${field.name}`.toLowerCase();
  if (/cover/.test(text)) return false;
  return /resume|résumé|\bcv\b|curriculum/.test(text) || text.trim() === '';
}

/** Picks the option that best matches a free-text value (case/punctuation-insensitive). */
export function matchOption(value: string, options: string[]): string | null {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const v = norm(value);
  if (!v) return null;
  const exact = options.find((o) => norm(o) === v);
  if (exact) return exact;
  const contains = options.find((o) => norm(o).includes(v) || v.includes(norm(o)));
  return contains ?? null;
}
