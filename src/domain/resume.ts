import type { ContactInfo } from './profile';

export interface SkillGroup {
  category: string;
  items: string[];
}

export interface ResumeExperience {
  company: string;
  title: string;
  location: string;
  startDate: string;
  endDate: string;
  bullets: string[];
}

export interface ResumeEducation {
  institution: string;
  degree: string;
  field: string;
  endDate: string;
  details: string;
}

/** A resume tailored to one job posting, laid out in ATS-standard sections. */
export interface TailoredResume {
  contact: ContactInfo;
  headline: string;
  summary: string;
  skills: SkillGroup[];
  experience: ResumeExperience[];
  education: ResumeEducation[];
  certifications: string[];
  /** Important keywords from the job description (for the coverage check). */
  targetKeywords: string[];
  jobTitle: string;
  company: string;
  generatedAt: string;
}

/** Standard headings ATS parsers recognise. Used by both renderer and checks. */
export const ATS_HEADINGS = {
  summary: 'Professional Summary',
  skills: 'Skills',
  experience: 'Professional Experience',
  education: 'Education',
  certifications: 'Certifications',
} as const;

/** Flattens the resume to plain text, e.g. for keyword checks or copy/paste fields. */
export function resumeToPlainText(r: TailoredResume): string {
  const lines: string[] = [];
  const c = r.contact;
  lines.push(c.fullName);
  if (r.headline) lines.push(r.headline);
  lines.push([c.email, c.phone, c.location, c.linkedin, c.github, c.website].filter(Boolean).join(' | '));
  if (r.summary) lines.push('', ATS_HEADINGS.summary.toUpperCase(), r.summary);
  if (r.skills.length) {
    lines.push('', ATS_HEADINGS.skills.toUpperCase());
    for (const g of r.skills) lines.push(`${g.category}: ${g.items.join(', ')}`);
  }
  if (r.experience.length) {
    lines.push('', ATS_HEADINGS.experience.toUpperCase());
    for (const e of r.experience) {
      lines.push(`${e.title} – ${e.company}${e.location ? `, ${e.location}` : ''}`);
      lines.push(`${e.startDate} – ${e.endDate}`);
      for (const b of e.bullets) lines.push(`- ${b}`);
      lines.push('');
    }
  }
  if (r.education.length) {
    lines.push(ATS_HEADINGS.education.toUpperCase());
    for (const ed of r.education) {
      lines.push(`${ed.degree}${ed.field ? `, ${ed.field}` : ''} – ${ed.institution}${ed.endDate ? ` (${ed.endDate})` : ''}`);
      if (ed.details) lines.push(ed.details);
    }
  }
  if (r.certifications.length) {
    lines.push('', ATS_HEADINGS.certifications.toUpperCase());
    for (const cert of r.certifications) lines.push(`- ${cert}`);
  }
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

export function resumeFileName(r: Pick<TailoredResume, 'contact' | 'company'>): string {
  const safe = (s: string) => s.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '');
  const name = safe(r.contact.fullName) || 'Resume';
  const company = safe(r.company);
  return company ? `${name}_Resume_${company}.pdf` : `${name}_Resume.pdf`;
}
