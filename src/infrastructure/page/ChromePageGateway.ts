import { PageAccessError } from '@/domain/errors';
import type { FillReport, FormField } from '@/domain/form';
import { isReliableJob, type JobPageScan, type JobPosting } from '@/domain/job';
import type { FillRequest, PageGateway } from '@/ports/PageGateway';
import { fillFormInPage, type InPageAnswer } from '@/extension/content/fillForm';
import { scanFormInPage } from '@/extension/content/scanForm';
import { scrapeJobInPage } from '@/extension/content/scrapeJob';

/**
 * PageGateway backed by chrome.scripting. Scripts are injected on demand into the
 * active tab (all frames – many ATS forms live in iframes).
 */
export class ChromePageGateway implements PageGateway {
  async pageUrl(): Promise<string> {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    // tab.url is only visible with host permission / activeTab; fall back to asking the page.
    if (tab?.url) return tab.url;
    try {
      const [res] = await this.run(() => location.href, []);
      return res?.result ?? '';
    } catch {
      return '';
    }
  }

  async readJobPosting(): Promise<JobPageScan> {
    const best = pickBestScan((await this.run(scrapeJobInPage, [])).map((r) => r.result));
    if (!best) throw new PageAccessError('Could not read this page.', false);
    return best;
  }

  /** Opens the URL in a hidden tab, waits for the posting to render, scrapes it, closes the tab. */
  async readJobPostingAt(url: string): Promise<JobPosting | null> {
    if (!/^https?:\/\//i.test(url)) return null;
    const origin = new URL(url).origin + '/*';
    if (!(await chrome.permissions.contains({ origins: [origin] }))) {
      throw new PageAccessError('Resume Maker needs permission to read the job posting page.', true);
    }
    const tab = await chrome.tabs.create({ url, active: false });
    const tabId = tab.id;
    if (tabId === undefined) return null;
    try {
      await waitForTabLoad(tabId, 15_000);
      // Many boards render the description client-side: retry for a few seconds.
      const deadline = Date.now() + 6_000;
      let last: JobPosting | null = null;
      while (Date.now() < deadline) {
        const results = await this.exec(tabId, { allFrames: true }, scrapeJobInPage, []).catch(() => []);
        last = pickBestScan(results.map((r) => r.result))?.job ?? null;
        if (isReliableJob(last)) return last;
        await delay(750);
      }
      return isReliableJob(last) ? last : null;
    } finally {
      chrome.tabs.remove(tabId).catch(() => undefined);
    }
  }

  async scanForm(): Promise<FormField[]> {
    const results = await this.run(scanFormInPage, []);
    return results.flatMap((r) => (r.result ?? []).map((f) => ({ ...f, frameId: r.frameId })));
  }

  async fillForm(request: FillRequest): Promise<FillReport> {
    const tabId = await this.activeTabId();
    const frames = new Set([...request.answers.map((a) => a.frameId), ...request.needsReview.map((r) => r.frameId)]);
    const attachment = request.attachment
      ? { fileName: request.attachment.fileName, mimeType: request.attachment.mimeType, base64: toBase64(request.attachment.bytes) }
      : null;

    const total: FillReport = { filled: 0, failed: [] };
    for (const frameId of frames) {
      const answers: InPageAnswer[] = request.answers
        .filter((a) => a.frameId === frameId)
        .map(({ fieldId, value, source }) => ({ fieldId, value, source }));
      const review = request.needsReview.filter((r) => r.frameId === frameId).map((r) => r.fieldId);
      const needsFile = request.answers.some((a) => a.frameId === frameId && a.source === 'resume-file');
      const [res] = await this.exec(tabId, { frameIds: [frameId] }, fillFormInPage, [answers, needsFile ? attachment : null, review]);
      if (res?.result) {
        total.filled += res.result.filled;
        total.failed.push(...res.result.failed);
      }
    }
    return total;
  }

  private async run<R>(func: () => R, args: []): Promise<chrome.scripting.InjectionResult<Awaited<R>>[]> {
    const tabId = await this.activeTabId();
    return this.exec(tabId, { allFrames: true }, func, args);
  }

  private async exec<Args extends unknown[], R>(
    tabId: number,
    frames: { allFrames: true } | { frameIds: number[] },
    func: (...args: Args) => R,
    args: Args,
  ): Promise<chrome.scripting.InjectionResult<Awaited<R>>[]> {
    try {
      return await chrome.scripting.executeScript({ target: { tabId, ...frames }, func, args });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/chrome:\/\/|chrome-extension:\/\/|webstore|edge:\/\//i.test(msg)) {
        throw new PageAccessError('Browser pages can’t be read. Open a job posting or application page.', false);
      }
      if (/permission|Cannot access/i.test(msg)) {
        throw new PageAccessError('Resume Maker needs permission to read this page.', true);
      }
      throw new PageAccessError(msg, false);
    }
  }

  private async activeTabId(): Promise<number> {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (tab?.id === undefined) throw new PageAccessError('No active tab found.', false);
    return tab.id;
  }
}

/** Pick the frame with the richest description (job may be in an embedded iframe). */
function pickBestScan(scans: (JobPageScan | undefined | null)[]): JobPageScan | null {
  const valid = scans.filter((s): s is JobPageScan => !!s?.job);
  if (!valid.length) return null;
  const rank = (s: JobPageScan) => (isReliableJob(s.job) ? 1e9 : 0) + s.job.description.length;
  const best = [...valid].sort((a, b) => rank(b) - rank(a))[0]!;
  // Merge hints from every frame (the top frame usually has the referrer).
  return {
    job: best.job,
    referrer: valid.map((s) => s.referrer).find(Boolean) ?? '',
    relatedLinks: [...new Set(valid.flatMap((s) => s.relatedLinks))],
  };
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

function waitForTabLoad(tabId: number, timeoutMs: number): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    };
    const listener = (id: number, info: { status?: string }) => {
      if (id === tabId && info.status === 'complete') done();
    };
    const timer = setTimeout(done, timeoutMs);
    chrome.tabs.onUpdated.addListener(listener);
    chrome.tabs.get(tabId).then((t) => t.status === 'complete' && done()).catch(done);
  });
}

function toBase64(bytes: Uint8Array): string {
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}
