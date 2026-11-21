/**
 * Job identity from a URL. The posting page and its application pages
 * (".../j/ID/" and ".../j/ID/apply/", step 2, step 3, …) map to the same key,
 * so a job description seen on one page can be used on the others.
 */

const APPLY_SEGMENTS = /^(apply|application|apply-now|applynow|applymanually|autofillwithresume|form|submit|step-?\d+)$/i;

interface AtsRule {
  host: RegExp;
  /** Returns the job id part of the key, or null if this URL isn't a job page. */
  id: (u: URL) => string | null;
}

const seg = (u: URL) => u.pathname.split('/').filter(Boolean);

const ATS_RULES: { name: string; rule: AtsRule }[] = [
  // apply.workable.com/<company>/j/<ID>/(apply/)  or  <company>.workable.com/j/<ID>
  { name: 'workable', rule: { host: /(^|\.)workable\.com$/i, id: (u) => {
    const s = seg(u);
    const i = s.findIndex((x) => x.toLowerCase() === 'j');
    return i >= 0 && s[i + 1] ? s[i + 1]!.toUpperCase() : null;
  } } },
  // jobs.lever.co/<company>/<uuid>(/apply)
  { name: 'lever', rule: { host: /(^|\.)lever\.co$/i, id: (u) => seg(u).find((x) => /^[0-9a-f-]{36}$/i.test(x))?.toLowerCase() ?? null } },
  // jobs.ashbyhq.com/<company>/<uuid>(/application)
  { name: 'ashby', rule: { host: /(^|\.)ashbyhq\.com$/i, id: (u) => seg(u).find((x) => /^[0-9a-f-]{36}$/i.test(x))?.toLowerCase() ?? null } },
  // boards.greenhouse.io/<co>/jobs/<id>, job-boards.greenhouse.io/..., or any site with ?gh_jid=<id>
  { name: 'greenhouse', rule: { host: /./, id: (u) => {
    const gh = u.searchParams.get('gh_jid');
    if (gh) return gh;
    if (!/greenhouse\.io$/i.test(u.hostname)) return null;
    const s = seg(u);
    const i = s.indexOf('jobs');
    return i >= 0 && /^\d+$/.test(s[i + 1] ?? '') ? s[i + 1]! : null;
  } } },
  // *.myworkdayjobs.com/.../job/<Location>/<Title>_R12345(/apply/applyManually)
  { name: 'workday', rule: { host: /myworkday(jobs|site)\.com$/i, id: (u) => {
    const m = u.pathname.match(/_((?:J?R)?-?[A-Z0-9]*\d[A-Z0-9-]*)(?=\/|$)/i);
    return m ? `${u.hostname.split('.')[0]}:${m[1]!.toUpperCase()}` : null;
  } } },
  // jobs.smartrecruiters.com/<Company>/<digits>-title
  { name: 'smartrecruiters', rule: { host: /smartrecruiters\.com$/i, id: (u) => seg(u).map((x) => x.match(/^(\d{6,})/)?.[1]).find(Boolean) ?? null } },
  // linkedin.com/jobs/view/<id>  or  ?currentJobId=<id>
  { name: 'linkedin', rule: { host: /(^|\.)linkedin\.com$/i, id: (u) => u.searchParams.get('currentJobId') ?? u.pathname.match(/\/jobs\/view\/(?:[^/]*?-)?(\d+)/)?.[1] ?? null } },
  // indeed.com/viewjob?jk=<id>
  { name: 'indeed', rule: { host: /(^|\.)indeed\.[a-z.]+$/i, id: (u) => u.searchParams.get('jk') ?? u.searchParams.get('vjk') } },
];

/** Removes trailing application-step segments: /jobs/123/apply/step-2 -> /jobs/123 */
function stripApplySegments(pathname: string): string {
  const parts = pathname.split('/').filter(Boolean);
  const cut = parts.findIndex((p, i) => i > 0 && APPLY_SEGMENTS.test(p));
  return '/' + (cut >= 0 ? parts.slice(0, cut) : parts).join('/');
}

export function jobIdentity(url: string): string {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return url.trim().toLowerCase();
  }
  for (const { name, rule } of ATS_RULES) {
    if (!rule.host.test(u.hostname)) continue;
    const id = rule.id(u);
    if (id) return `${name}:${id}`;
  }
  return `${u.hostname.replace(/^www\./, '')}${stripApplySegments(u.pathname)}`.replace(/\/$/, '').toLowerCase();
}

/** Likely URLs of the posting (description) page for an application-form URL. */
export function postingUrlCandidates(url: string): string[] {
  try {
    const u = new URL(url);
    const stripped = stripApplySegments(u.pathname);
    if (stripped.replace(/\/$/, '') === u.pathname.replace(/\/$/, '')) return [];
    return [`${u.origin}${stripped}${u.pathname.endsWith('/') ? '/' : ''}`];
  } catch {
    return [];
  }
}

export function sameJobUrl(a: string, b: string): boolean {
  return !!a && !!b && jobIdentity(a) === jobIdentity(b);
}
