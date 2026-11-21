import type { FieldType, FormField } from '@/domain/form';

/**
 * Injected into every frame of the page. Finds fillable fields, resolves their labels
 * and tags each one with data-rm-id so fillFormInPage can find it again.
 * MUST be self-contained (no outer-scope references at runtime). frameId is set by the caller.
 */
export function scanFormInPage(): Omit<FormField, 'frameId'>[] {
  const ATTR = 'data-rm-id';
  const clean = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim().slice(0, 300);
  const textOf = (el: Element | null) => clean((el as HTMLElement | null)?.innerText ?? el?.textContent);

  let counter = Number(document.documentElement.getAttribute('data-rm-counter') ?? '0');
  const idFor = (el: Element) => {
    let id = el.getAttribute(ATTR);
    if (!id) {
      id = `rm-${++counter}`;
      el.setAttribute(ATTR, id);
    }
    return id;
  };

  const isShown = (el: HTMLElement) => {
    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    // Custom-styled radios/checkboxes/file inputs are often 0x0 or transparent but still usable.
    const input = el as HTMLInputElement;
    if (['radio', 'checkbox', 'file'].includes(input.type)) return !el.closest('[hidden], [aria-hidden="true"]');
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };

  const labelFor = (el: HTMLElement): string => {
    const id = el.id;
    if (id) {
      const label = document.querySelector(`label[for="${CSS.escape(id)}"]`);
      if (label && textOf(label)) return textOf(label);
    }
    const labelledBy = el.getAttribute('aria-labelledby');
    if (labelledBy) {
      const t = labelledBy
        .split(/\s+/)
        .map((ref) => textOf(document.getElementById(ref)))
        .join(' ')
        .trim();
      if (t) return t;
    }
    const aria = el.getAttribute('aria-label');
    if (aria) return clean(aria);
    const wrapping = el.closest('label');
    if (wrapping) {
      const clone = wrapping.cloneNode(true) as HTMLElement;
      clone.querySelectorAll('select, option, textarea').forEach((n) => n.remove());
      if (textOf(clone)) return textOf(clone);
    }
    // Nearby label-like text in the closest few ancestors.
    let node: HTMLElement | null = el.parentElement;
    for (let depth = 0; node && depth < 4; depth++, node = node.parentElement) {
      const candidate = node.querySelector('label, legend, [class*="label" i], [class*="question" i]');
      if (candidate && !candidate.contains(el) && textOf(candidate)) return textOf(candidate);
    }
    return clean(el.getAttribute('placeholder') ?? el.getAttribute('title') ?? '');
  };

  const groupLabelFor = (radios: HTMLInputElement[]): string => {
    const first = radios[0]!;
    const fieldset = first.closest('fieldset');
    const legend = fieldset?.querySelector('legend');
    if (legend && textOf(legend)) return textOf(legend);
    const group = first.closest('[role="radiogroup"], [role="group"]');
    if (group) {
      const l = group.getAttribute('aria-label') ?? '';
      const by = group.getAttribute('aria-labelledby');
      const t = clean(l) || (by ? textOf(document.getElementById(by)) : '');
      if (t) return t;
    }
    // Smallest ancestor containing all radios: its text minus the option labels.
    let node: HTMLElement | null = first.parentElement;
    while (node && !radios.every((r) => node!.contains(r))) node = node.parentElement;
    for (let depth = 0; node && depth < 3; depth++, node = node.parentElement) {
      const candidate = node.querySelector('label:not(:has(input)), legend, [class*="label" i], [class*="question" i]');
      if (candidate && !radios.some((r) => candidate.contains(r)) && textOf(candidate)) return textOf(candidate);
      const prev = node.previousElementSibling;
      if (prev && textOf(prev)) return textOf(prev);
    }
    return clean(first.name);
  };

  const isRequired = (el: HTMLElement, label: string) =>
    (el as HTMLInputElement).required || el.getAttribute('aria-required') === 'true' || /\*\s*$/.test(label);

  const fields: Omit<FormField, 'frameId'>[] = [];
  const radioGroups = new Map<string, HTMLInputElement[]>();
  const skipTypes = new Set(['hidden', 'submit', 'button', 'reset', 'image', 'password', 'search', 'range', 'color']);
  const typeMap: Record<string, FieldType> = { email: 'email', tel: 'tel', url: 'url', number: 'number', date: 'date', file: 'file', checkbox: 'checkbox' };

  for (const el of Array.from(document.querySelectorAll<HTMLElement>('input, textarea, select'))) {
    const input = el as HTMLInputElement;
    if (input.disabled || (input as HTMLInputElement).readOnly) continue;
    if (el instanceof HTMLInputElement && skipTypes.has(input.type)) continue;
    if (!isShown(el)) continue;

    if (el instanceof HTMLInputElement && input.type === 'radio') {
      const key = input.name || `__${idFor(el)}`;
      const list = radioGroups.get(key) ?? [];
      list.push(input);
      radioGroups.set(key, list);
      continue;
    }

    const label = labelFor(el);
    let type: FieldType = 'text';
    let options: string[] = [];
    let currentValue = '';
    if (el instanceof HTMLTextAreaElement) {
      type = 'textarea';
      currentValue = el.value;
    } else if (el instanceof HTMLSelectElement) {
      type = 'select';
      options = Array.from(el.options)
        .filter((o) => o.value !== '' && !/^(select|choose|please|--)/i.test(o.text.trim()))
        .map((o) => clean(o.text));
      const selected = el.selectedOptions[0];
      currentValue = selected && selected.value !== '' && options.includes(clean(selected.text)) ? clean(selected.text) : '';
    } else {
      type = typeMap[input.type] ?? 'text';
      currentValue = type === 'checkbox' ? (input.checked ? 'true' : '') : type === 'file' ? (input.files?.length ? 'file' : '') : input.value;
    }

    fields.push({
      id: idFor(el),
      type,
      label,
      name: input.name ?? '',
      placeholder: clean(el.getAttribute('placeholder')),
      autocomplete: (el.getAttribute('autocomplete') ?? '').toLowerCase(),
      required: isRequired(el, label),
      options,
      currentValue,
    });
  }

  for (const [, radios] of radioGroups) {
    const groupId = idFor(radios[0]!);
    radios.forEach((r) => r.setAttribute(ATTR, groupId));
    const label = groupLabelFor(radios);
    const optionLabel = (r: HTMLInputElement) => labelFor(r) || clean(r.value);
    const checked = radios.find((r) => r.checked);
    fields.push({
      id: groupId,
      type: 'radio',
      label,
      name: radios[0]!.name,
      placeholder: '',
      autocomplete: '',
      required: radios.some((r) => isRequired(r, label)),
      options: radios.map(optionLabel),
      currentValue: checked ? optionLabel(checked) : '',
    });
  }

  document.documentElement.setAttribute('data-rm-counter', String(counter));
  return fields;
}
