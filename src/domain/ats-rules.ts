import { resumeToPlainText, type TailoredResume } from './resume';

export type AtsSeverity = 'error' | 'warning';

export interface AtsIssue {
  severity: AtsSeverity;
  message: string;
}

export interface AtsReport {
  /** 0–100. */
  keywordCoverage: number;
  matchedKeywords: string[];
  missingKeywords: string[];
  issues: AtsIssue[];
}

const normalize = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9+#.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export function keywordCoverage(text: string, keywords: string[]) {
  const hay = ` ${normalize(text)} `;
  const unique = [...new Set(keywords.map((k) => k.trim()).filter(Boolean))];
  const matched: string[] = [];
  const missing: string[] = [];
  for (const k of unique) {
    (hay.includes(` ${normalize(k)} `) ? matched : missing).push(k);
  }
  const coverage = unique.length === 0 ? 100 : Math.round((matched.length / unique.length) * 100);
  return { coverage, matched, missing };
}

/**
 * Rule-based ATS checks run locally on the generated resume (no LLM).
 * The renderer already guarantees single column, standard fonts and no tables/images.
 */
export function assessAts(resume: TailoredResume): AtsReport {
  const issues: AtsIssue[] = [];
  const c = resume.contact;
  if (!c.fullName) issues.push({ severity: 'error', message: 'Name is missing.' });
  if (!c.email) issues.push({ severity: 'error', message: 'Email is missing.' });
  if (!c.phone) issues.push({ severity: 'warning', message: 'Phone number is missing.' });
  if (resume.experience.length === 0) issues.push({ severity: 'error', message: 'No work experience listed.' });
  if (resume.skills.length === 0) issues.push({ severity: 'warning', message: 'No skills section.' });
  if (!resume.summary) issues.push({ severity: 'warning', message: 'No professional summary.' });

  for (const e of resume.experience) {
    if (!e.startDate) issues.push({ severity: 'warning', message: `Missing start date for ${e.title} at ${e.company}.` });
    if (e.bullets.length === 0) issues.push({ severity: 'warning', message: `No bullet points for ${e.title} at ${e.company}.` });
    for (const b of e.bullets) {
      if (b.length > 260) {
        issues.push({ severity: 'warning', message: `A bullet under ${e.company} is very long (${b.length} chars); aim for 1–2 lines.` });
      }
    }
  }

  const text = resumeToPlainText(resume);
  const words = text.split(/\s+/).length;
  if (words > 1100) issues.push({ severity: 'warning', message: `Resume is long (${words} words); 1–2 pages is ideal.` });

  const { coverage, matched, missing } = keywordCoverage(text, resume.targetKeywords);
  if (resume.targetKeywords.length > 0 && coverage < 60) {
    issues.push({ severity: 'warning', message: `Only ${coverage}% of the job's key terms appear in the resume.` });
  }
  return { keywordCoverage: coverage, matchedKeywords: matched, missingKeywords: missing, issues };
}
