import { matchOption, type FormField } from '@/domain/form';
import { splitName, type Profile } from '@/domain/profile';

type Resolver = (p: Profile) => string;

interface Rule {
  autocomplete?: string[];
  pattern?: RegExp;
  value: Resolver;
}

const currentRole = (p: Profile) => p.experience.find((e) => /present|current|now/i.test(e.endDate)) ?? p.experience[0];

/** Ordered: the first matching rule wins. Patterns run against "label name placeholder". */
const RULES: Rule[] = [
  { autocomplete: ['given-name'], pattern: /first.?name|given.?name|\bfname\b|forename/i, value: (p) => splitName(p.contact.fullName).first },
  { autocomplete: ['family-name'], pattern: /last.?name|family.?name|surname|\blname\b/i, value: (p) => splitName(p.contact.fullName).last },
  { pattern: /preferred.?name/i, value: (p) => splitName(p.contact.fullName).first },
  { autocomplete: ['email'], pattern: /e-?mail/i, value: (p) => p.contact.email },
  { autocomplete: ['tel', 'tel-national'], pattern: /phone|mobile|\btel\b|cell/i, value: (p) => p.contact.phone },
  { pattern: /linked.?in/i, value: (p) => p.contact.linkedin },
  { pattern: /git.?hub/i, value: (p) => p.contact.github },
  { autocomplete: ['url'], pattern: /website|portfolio|personal (site|url|page)|blog/i, value: (p) => p.contact.website || p.contact.github },
  { pattern: /current (company|employer)|(company|employer) name|most recent (company|employer)/i, value: (p) => currentRole(p)?.company ?? '' },
  { autocomplete: ['organization-title'], pattern: /current (job )?(title|role|position)|^job title$/i, value: (p) => currentRole(p)?.title ?? '' },
  { autocomplete: ['address-level2'], pattern: /\bcity\b|location|where .*(based|located|live)/i, value: (p) => p.contact.location },
  { autocomplete: ['name'], pattern: /^(full |legal |your )?name\b|full.?name|legal.?name|candidate name/i, value: (p) => p.contact.fullName },
];

/**
 * Answers a field straight from the profile without an LLM call, or null if no rule applies.
 * Deterministic answers are fast, free and can't hallucinate.
 */
export function profileValueForField(field: FormField, profile: Profile): string | null {
  if (field.type === 'file' || field.type === 'checkbox') return null;
  const hay = `${field.label} ${field.name} ${field.placeholder}`.trim();
  for (const rule of RULES) {
    const byAutocomplete = rule.autocomplete?.includes(field.autocomplete) ?? false;
    const byPattern = rule.pattern?.test(field.label) || rule.pattern?.test(hay);
    if (!byAutocomplete && !byPattern) continue;
    const value = rule.value(profile).trim();
    if (!value) return null;
    if (field.type === 'select' || field.type === 'radio') return matchOption(value, field.options);
    return value;
  }
  return null;
}
