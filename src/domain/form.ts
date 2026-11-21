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

/** One proposed value for a field. `source: null` = no answer found (user may type one). */
export interface FillPlanItem {
  field: FormField;
  value: string;
  source: AnswerSource | null;
}

/** Everything we intend to fill, computed before touching the page (used for "review first"). */
export interface FillPlan {
  items: FillPlanItem[];
  /** Fields deliberately left alone (sensitive, already filled, unsupported). */
  skipped: SkippedField[];
}

export interface FormDetection {
  likely: boolean;
  score: number;
  fieldCount: number;
  url: string;
}

/** Hosts of applicant-tracking systems and job boards with apply flows. */
const ATS_HOSTS =
  /(greenhouse\.io|lever\.co|myworkdayjobs\.com|myworkdaysite\.com|workday\.com|ashbyhq\.com|smartrecruiters\.com|icims\.com|jobvite\.com|workable\.com|bamboohr\.com|recruitee\.com|teamtailor\.com|breezy\.hr|applytojob\.com|jazzhr\.com|successfactors\.(com|eu)|taleo\.net|personio\.(de|com)|pinpointhq\.com|rippling\.com|linkedin\.com\/jobs|indeed\.com)/i;

/**
 * Heuristic, no AI: does this page look like a job application form (vs. a login,
 * newsletter or search form)? Based on the scanned fields and the URL.
 */
export function detectApplicationForm(fields: FormField[], url: string): FormDetection {
  const text = (f: FormField) => `${f.label} ${f.name} ${f.placeholder} ${f.autocomplete}`.toLowerCase();
  const has = (re: RegExp) => fields.some((f) => re.test(text(f)));
  let score = 0;
  if (fields.some((f) => f.type === 'file' && /resume|résumé|\bcv\b|curriculum/.test(text(f)))) score += 3;
  else if (fields.some((f) => f.type === 'file')) score += 1;
  if (has(/first.?name|given-name|full.?name|last.?name|family-name|\bname\b/)) score += 1;
  if (has(/e-?mail/)) score += 1;
  if (has(/phone|mobile|\btel\b/)) score += 1;
  if (has(/linkedin|portfolio|github|website/)) score += 1;
  if (has(/cover letter|work authori|sponsor|salary|notice period|start date|years of experience|why .*(join|work|interested)|relocat/)) score += 2;
  if (ATS_HOSTS.test(url)) score += 2;
  if (/\/(apply|application|careers?|jobs?)\b/i.test(url)) score += 1;
  return { likely: fields.length >= 3 && score >= 5, score, fieldCount: fields.length, url };
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
