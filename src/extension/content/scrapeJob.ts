import type { JobPosting } from '@/domain/job';

/**
 * Injected into the page with chrome.scripting.executeScript({ func }).
 * MUST be fully self-contained: no imports or outer-scope references at runtime
 * (the type import above is erased at compile time).
 */
export function scrapeJobInPage(): JobPosting {
  const clean = (s: string | null | undefined) =>
    (s ?? '')
      .replace(/ /g, ' ')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n\s*\n\s*\n+/g, '\n\n')
      .trim();

  const htmlToText = (html: string) => {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    doc.querySelectorAll('br').forEach((br) => br.replaceWith('\n'));
    doc.querySelectorAll('p, li, div, h1, h2, h3, h4, tr').forEach((el) => el.append('\n'));
    doc.querySelectorAll('li').forEach((li) => li.prepend('- '));
    return clean(doc.body.textContent);
  };

  const textOf = (selector: string) => {
    const el = document.querySelector<HTMLElement>(selector);
    return el ? clean(el.innerText) : '';
  };
  const meta = (name: string) =>
    document.querySelector<HTMLMetaElement>(`meta[property="${name}"], meta[name="${name}"]`)?.content ?? '';

  const result: JobPosting = { title: '', company: '', location: '', description: '', url: location.href };

  // 1) Structured data (schema.org JobPosting) – used by most ATS boards and job sites.
  type Json = Record<string, unknown>;
  const findJob = (node: unknown): Json | null => {
    if (!node || typeof node !== 'object') return null;
    if (Array.isArray(node)) {
      for (const n of node) {
        const found = findJob(n);
        if (found) return found;
      }
      return null;
    }
    const obj = node as Json;
    const type = obj['@type'];
    if (type === 'JobPosting' || (Array.isArray(type) && type.includes('JobPosting'))) return obj;
    return findJob(obj['@graph']);
  };
  for (const script of Array.from(document.querySelectorAll('script[type="application/ld+json"]'))) {
    try {
      const job = findJob(JSON.parse(script.textContent ?? ''));
      if (!job) continue;
      const org = job.hiringOrganization as Json | undefined;
      const loc = (Array.isArray(job.jobLocation) ? job.jobLocation[0] : job.jobLocation) as Json | undefined;
      const addr = loc?.address as Json | undefined;
      result.title = clean(String(job.title ?? ''));
      result.company = clean(String(org?.name ?? ''));
      result.location = clean(
        [addr?.addressLocality, addr?.addressRegion, addr?.addressCountry].filter((x) => typeof x === 'string').join(', '),
      );
      result.description = htmlToText(String(job.description ?? ''));
      break;
    } catch {
      /* ignore malformed JSON-LD */
    }
  }

  // 2) Known job boards / ATS layouts.
  const boards: { title: string[]; company: string[]; description: string[] }[] = [
    { title: ['.posting-headline h2'], company: ['.main-header-logo img[alt]'], description: ['.posting-page .content', '.section-wrapper.page-full-width'] }, // Lever
    { title: ['.job__title h1', '.app-title', 'h1.section-header'], company: ['.company-name'], description: ['.job__description', '#content .job-post', '#content'] }, // Greenhouse
    { title: ['[data-automation-id="jobPostingHeader"]'], company: [], description: ['[data-automation-id="jobPostingDescription"]'] }, // Workday
    { title: ['.ashby-job-posting-heading', 'h1[class*="title"]'], company: [], description: ['.ashby-job-posting-right-pane', '[class*="_descriptionText"]'] }, // Ashby
    { title: ['.job-details-jobs-unified-top-card__job-title', '.jobs-unified-top-card__job-title'], company: ['.job-details-jobs-unified-top-card__company-name'], description: ['.jobs-description__content', '#job-details'] }, // LinkedIn
    { title: ['[data-testid="jobsearch-JobInfoHeader-title"]', '.jobsearch-JobInfoHeader-title'], company: ['[data-testid="inlineHeader-companyName"]'], description: ['#jobDescriptionText'] }, // Indeed
    { title: ['h1[class*="job-title"]', '.job-title'], company: [], description: ['[class*="job-description"]', '[id*="job-description"]', '[class*="jobDescription"]'] }, // generic
  ];
  for (const b of boards) {
    const description = b.description.map(textOf).find((t) => t.length > 200) ?? '';
    if (!description) continue;
    if (description.length > result.description.length) result.description = description;
    result.title ||= b.title.map(textOf).find(Boolean) ?? '';
    if (!result.company) {
      for (const sel of b.company) {
        const el = document.querySelector<HTMLElement>(sel);
        const v = el instanceof HTMLImageElement ? el.alt : clean(el?.innerText);
        if (v) {
          result.company = v;
          break;
        }
      }
    }
    break;
  }

  // 3) Fallbacks.
  result.title ||= textOf('h1') || clean(document.title);
  result.company ||= clean(meta('og:site_name'));
  if (result.description.length < 200) {
    const main = document.querySelector<HTMLElement>('main, [role="main"], article') ?? document.body;
    const text = clean(main?.innerText);
    if (text.length > result.description.length) result.description = text;
  }
  result.description = result.description.slice(0, 30_000);
  return result;
}
