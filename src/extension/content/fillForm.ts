import type { FillReport } from '@/domain/form';

export interface InPageAnswer {
  fieldId: string;
  value: string;
  source: string;
}

export interface InPageAttachment {
  fileName: string;
  mimeType: string;
  base64: string;
}

/**
 * Injected into one frame. Sets values the way a user would (native setters + events,
 * so React/Vue/Angular forms register the change) and outlines what was touched.
 * Never submits anything. MUST be self-contained.
 */
export function fillFormInPage(
  answers: InPageAnswer[],
  attachment: InPageAttachment | null,
  needsReview: string[],
): FillReport {
  const ATTR = 'data-rm-id';
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const fire = (el: Element, ...types: string[]) =>
    types.forEach((t) => el.dispatchEvent(new Event(t, { bubbles: true })));

  const mark = (el: HTMLElement, color: string, title: string) => {
    const target = (el as HTMLInputElement).type === 'radio' || (el as HTMLInputElement).type === 'checkbox' || (el as HTMLInputElement).type === 'file'
      ? (el.closest('fieldset, [role="radiogroup"], label, div') as HTMLElement | null) ?? el
      : el;
    target.style.outline = `2px solid ${color}`;
    target.style.outlineOffset = '2px';
    target.title = title;
  };

  const setNativeValue = (el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string) => {
    const proto = Object.getPrototypeOf(el) as object;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    if (setter) setter.call(el, value);
    else el.value = value;
  };

  const optionLabel = (r: HTMLInputElement) => {
    const byFor = r.id ? document.querySelector(`label[for="${CSS.escape(r.id)}"]`) : null;
    const label = byFor ?? r.closest('label');
    return ((label as HTMLElement | null)?.innerText ?? r.getAttribute('aria-label') ?? r.value ?? '').trim();
  };

  const toFile = (a: InPageAttachment) => {
    const bin = atob(a.base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new File([bytes], a.fileName, { type: a.mimeType });
  };

  const report: FillReport = { filled: 0, failed: [] };

  for (const answer of answers) {
    const els = Array.from(document.querySelectorAll<HTMLElement>(`[${ATTR}="${CSS.escape(answer.fieldId)}"]`));
    const el = els[0];
    if (!el) {
      report.failed.push(answer.fieldId);
      continue;
    }
    try {
      if (el instanceof HTMLSelectElement) {
        const want = norm(answer.value);
        const opt =
          Array.from(el.options).find((o) => norm(o.text) === want) ??
          Array.from(el.options).find((o) => o.value !== '' && (norm(o.text).includes(want) || want.includes(norm(o.text))));
        if (!opt) throw new Error('option not found');
        setNativeValue(el, opt.value);
        fire(el, 'input', 'change');
      } else if (el instanceof HTMLInputElement && el.type === 'radio') {
        const want = norm(answer.value);
        const radio = (els as HTMLInputElement[]).find((r) => norm(optionLabel(r)) === want || norm(r.value) === want);
        if (!radio) throw new Error('radio option not found');
        if (!radio.checked) radio.click();
      } else if (el instanceof HTMLInputElement && el.type === 'checkbox') {
        const want = answer.value === 'true';
        if (el.checked !== want) el.click();
      } else if (el instanceof HTMLInputElement && el.type === 'file') {
        if (!attachment) throw new Error('no attachment');
        const dt = new DataTransfer();
        dt.items.add(toFile(attachment));
        el.files = dt.files;
        fire(el, 'input', 'change');
      } else if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
        el.focus();
        setNativeValue(el, answer.value);
        fire(el, 'input', 'change');
        el.blur();
        fire(el, 'blur', 'focusout');
      } else {
        throw new Error('unsupported element');
      }
      const how = answer.source === 'profile' ? 'from your profile' : answer.source === 'resume-file' ? 'generated resume' : 'AI suggestion';
      mark(el, '#16a34a', `Filled by Resume Maker (${how}) – please review`);
      report.filled++;
    } catch {
      report.failed.push(answer.fieldId);
    }
  }

  for (const id of needsReview) {
    const el = document.querySelector<HTMLElement>(`[${ATTR}="${CSS.escape(id)}"]`);
    if (el) mark(el, '#ea580c', 'Resume Maker: required – please fill this in yourself');
  }
  return report;
}
