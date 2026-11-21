import type { JobPosting } from './job';
import type { TailoredResume } from './resume';

export type ApplicationStatus =
  | 'draft' // resume generated, not applied yet
  | 'applied'
  | 'followed-up'
  | 'interviewing'
  | 'offer'
  | 'rejected'
  | 'withdrawn';

export const STATUS_LABELS: Record<ApplicationStatus, string> = {
  draft: 'Resume ready',
  applied: 'Applied',
  'followed-up': 'Followed up',
  interviewing: 'Interviewing',
  offer: 'Offer',
  rejected: 'Rejected',
  withdrawn: 'Withdrawn',
};

export interface FollowUp {
  date: string;
  message: string;
}

/** One job you prepared or sent a resume for. */
export interface ApplicationRecord {
  id: string;
  job: JobPosting;
  /** The exact tailored resume content, so the same PDF can be regenerated later. */
  resume: TailoredResume | null;
  status: ApplicationStatus;
  createdAt: string;
  updatedAt: string;
  appliedAt: string | null;
  followUps: FollowUp[];
  notes: string;
}

/** Days to wait after applying (or the last follow-up) before suggesting a follow-up. */
export const FOLLOW_UP_AFTER_DAYS = 7;
const DAY = 24 * 60 * 60 * 1000;

export function lastContactAt(r: ApplicationRecord): string | null {
  return r.followUps.at(-1)?.date ?? r.appliedAt;
}

export function daysSince(iso: string, now: Date): number {
  return Math.floor((now.getTime() - new Date(iso).getTime()) / DAY);
}

export function needsFollowUp(r: ApplicationRecord, now: Date, afterDays = FOLLOW_UP_AFTER_DAYS): boolean {
  if (r.status !== 'applied' && r.status !== 'followed-up') return false;
  const last = lastContactAt(r);
  return !!last && daysSince(last, now) >= afterDays;
}

/** Canonical form of a job link: host + path, without query, hash, trailing slash or /apply. */
export const normalizeUrl = (url: string) => {
  try {
    const u = new URL(url);
    return `${u.host}${u.pathname}`.replace(/\/(apply|application)\/?$/i, '').replace(/\/$/, '').toLowerCase();
  } catch {
    return url.trim().toLowerCase();
  }
};
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** Same job = same posting URL (ignoring query and /apply suffix) or same company + title. */
export function isSameJob(a: JobPosting, b: JobPosting): boolean {
  if (a.url && b.url && normalizeUrl(a.url) === normalizeUrl(b.url)) return true;
  return !!a.company && !!a.title && norm(a.company) === norm(b.company) && norm(a.title) === norm(b.title);
}

/**
 * Strict match used for idempotent generation: the same job link.
 * Only when a posting has no URL (pasted manually) does it fall back to company + title.
 */
export function isSameLink(a: JobPosting, b: JobPosting): boolean {
  if (a.url && b.url) return normalizeUrl(a.url) === normalizeUrl(b.url);
  return isSameJob(a, b);
}

/** Key for de-duplicating concurrent requests for one job. */
export function jobKey(job: JobPosting): string {
  return job.url ? normalizeUrl(job.url) : `${norm(job.company)}|${norm(job.title)}`;
}

export function sortByRecent(records: ApplicationRecord[]): ApplicationRecord[] {
  return [...records].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
