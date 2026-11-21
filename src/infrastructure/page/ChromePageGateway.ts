import { PageAccessError } from '@/domain/errors';
import type { FillReport, FormField } from '@/domain/form';
import type { JobPosting } from '@/domain/job';
import type { FillRequest, PageGateway } from '@/ports/PageGateway';
import { fillFormInPage, type InPageAnswer } from '@/extension/content/fillForm';
import { scanFormInPage } from '@/extension/content/scanForm';
import { scrapeJobInPage } from '@/extension/content/scrapeJob';

/**
 * PageGateway backed by chrome.scripting. Scripts are injected on demand into the
 * active tab (all frames – many ATS forms live in iframes).
 */
export class ChromePageGateway implements PageGateway {
  async readJobPosting(): Promise<JobPosting> {
    const results = await this.run(scrapeJobInPage, []);
    // Pick the frame with the richest description (job may be in an embedded iframe).
    const best = results
      .map((r) => r.result)
      .filter((j): j is JobPosting => !!j)
      .sort((a, b) => b.description.length - a.description.length)[0];
    if (!best) throw new PageAccessError('Could not read this page.', false);
    return best;
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

function toBase64(bytes: Uint8Array): string {
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}
