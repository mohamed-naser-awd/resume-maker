/** Core candidate data. Pure types – no browser, UI or SDK imports in this folder. */

export interface ContactInfo {
  fullName: string;
  email: string;
  phone: string;
  location: string;
  linkedin: string;
  github: string;
  website: string;
}

export interface Experience {
  company: string;
  title: string;
  location: string;
  startDate: string;
  /** "Present" for a current role. */
  endDate: string;
  bullets: string[];
}

export interface Education {
  institution: string;
  degree: string;
  field: string;
  startDate: string;
  endDate: string;
  details: string;
}

export interface Project {
  name: string;
  description: string;
  technologies: string[];
}

export interface Profile {
  contact: ContactInfo;
  headline: string;
  summary: string;
  experience: Experience[];
  education: Education[];
  skills: string[];
  certifications: string[];
  projects: Project[];
  /**
   * Free-text answers to common application questions the resume doesn't cover:
   * work authorization, sponsorship, notice period, salary expectations, relocation…
   */
  applicationFacts: string;
  /** Text extracted from the uploaded resume, kept for re-parsing and grounding. */
  sourceResumeText: string;
  updatedAt: string;
}

export const emptyContact = (): ContactInfo => ({
  fullName: '',
  email: '',
  phone: '',
  location: '',
  linkedin: '',
  github: '',
  website: '',
});

export const emptyProfile = (): Profile => ({
  contact: emptyContact(),
  headline: '',
  summary: '',
  experience: [],
  education: [],
  skills: [],
  certifications: [],
  projects: [],
  applicationFacts: '',
  sourceResumeText: '',
  updatedAt: new Date(0).toISOString(),
});

export function isProfileEmpty(p: Profile): boolean {
  return !p.contact.fullName && p.experience.length === 0 && !p.sourceResumeText;
}

export function splitName(fullName: string): { first: string; last: string } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: '', last: '' };
  if (parts.length === 1) return { first: parts[0]!, last: '' };
  return { first: parts[0]!, last: parts.slice(1).join(' ') };
}
