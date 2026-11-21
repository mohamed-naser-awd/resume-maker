// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { scanFormInPage } from '@/extension/content/scanForm';
import { fillFormInPage } from '@/extension/content/fillForm';
import { scrapeJobInPage } from '@/extension/content/scrapeJob';

// jsdom has no layout: give every element a size so the visibility check passes.
beforeEach(() => {
  Element.prototype.getBoundingClientRect = () => ({ width: 100, height: 20, top: 0, left: 0, right: 100, bottom: 20, x: 0, y: 0, toJSON: () => ({}) });
  if (!('innerText' in HTMLElement.prototype)) {
    Object.defineProperty(HTMLElement.prototype, 'innerText', { get() { return this.textContent; } });
  }
  (globalThis as any).CSS ??= { escape: (s: string) => s.replace(/"/g, '\\"') };
});

const FORM = `
  <form>
    <label for="fn">First name *</label><input id="fn" name="first_name" required>
    <label>Email <input type="email" name="email"></label>
    <div class="field"><div class="label">Phone</div><input type="tel" name="phone"></div>
    <label for="exp">Experience</label>
    <select id="exp"><option value="">Select…</option><option value="a">0-2</option><option value="b">3-5</option></select>
    <fieldset><legend>Willing to relocate?</legend>
      <label><input type="radio" name="reloc" value="y"> Yes</label>
      <label><input type="radio" name="reloc" value="n"> No</label>
    </fieldset>
    <label for="why">Why us?</label><textarea id="why"></textarea>
    <label for="cv">Resume</label><input type="file" id="cv">
    <input type="hidden" name="csrf" value="x">
    <input type="password" name="pw">
    <button type="submit">Submit</button>
  </form>`;

describe('scanFormInPage', () => {
  it('finds fields with labels, options and required flags', () => {
    document.body.innerHTML = FORM;
    const fields = scanFormInPage();
    const byLabel = Object.fromEntries(fields.map((f) => [f.label, f]));
    expect(Object.keys(byLabel)).toEqual(
      expect.arrayContaining(['First name *', 'Email', 'Phone', 'Experience', 'Willing to relocate?', 'Why us?', 'Resume']),
    );
    expect(byLabel['First name *']!.required).toBe(true);
    expect(byLabel['Experience']!.options).toEqual(['0-2', '3-5']);
    expect(byLabel['Willing to relocate?']).toMatchObject({ type: 'radio', options: ['Yes', 'No'] });
    expect(byLabel['Resume']!.type).toBe('file');
    expect(fields.some((f) => f.name === 'csrf' || f.name === 'pw')).toBe(false);
  });
});

describe('fillFormInPage', () => {
  it('fills text, select, radio and textarea and fires events', () => {
    document.body.innerHTML = FORM;
    const fields = scanFormInPage();
    const id = (label: string) => fields.find((f) => f.label === label)!.id;
    let changes = 0;
    document.body.addEventListener('change', () => changes++);

    const report = fillFormInPage(
      [
        { fieldId: id('First name *'), value: 'Jane', source: 'profile' },
        { fieldId: id('Experience'), value: '3-5', source: 'ai' },
        { fieldId: id('Willing to relocate?'), value: 'No', source: 'ai' },
        { fieldId: id('Why us?'), value: 'Great mission.', source: 'ai' },
      ],
      null,
      [id('Phone')],
    );

    expect(report).toEqual({ filled: 4, failed: [] });
    expect((document.getElementById('fn') as HTMLInputElement).value).toBe('Jane');
    expect((document.getElementById('exp') as HTMLSelectElement).value).toBe('b');
    expect((document.querySelector('input[value="n"]') as HTMLInputElement).checked).toBe(true);
    expect((document.getElementById('why') as HTMLTextAreaElement).value).toBe('Great mission.');
    expect(changes).toBeGreaterThanOrEqual(3);
    expect((document.getElementById('fn') as HTMLElement).style.outline).toContain('solid');
    expect((document.querySelector('input[name="phone"]') as HTMLElement).title).toMatch(/required/);
  });

  it('reports options it cannot match instead of guessing', () => {
    document.body.innerHTML = FORM;
    const fields = scanFormInPage();
    const exp = fields.find((f) => f.label === 'Experience')!.id;
    const report = fillFormInPage([{ fieldId: exp, value: '20+ years', source: 'ai' }], null, []);
    expect(report.failed).toEqual([exp]);
  });
});

describe('scrapeJobInPage', () => {
  it('prefers schema.org JobPosting data', () => {
    const description = '<p>We are hiring.</p><ul><li>5+ years TypeScript</li><li>React</li></ul>' + '<p>More details.</p>'.repeat(20);
    document.head.innerHTML = `<script type="application/ld+json">${JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'JobPosting',
      title: 'Staff Engineer',
      hiringOrganization: { '@type': 'Organization', name: 'Acme' },
      jobLocation: { address: { addressLocality: 'Austin', addressRegion: 'TX' } },
      description,
    })}</script>`;
    document.body.innerHTML = '<h1>Something else</h1>';
    const job = scrapeJobInPage();
    expect(job).toMatchObject({ title: 'Staff Engineer', company: 'Acme', location: 'Austin, TX' });
    expect(job.description).toContain('- 5+ years TypeScript');
    document.head.innerHTML = '';
  });
});
