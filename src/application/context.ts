import type { Accomplishment } from '@/domain/accomplishment';
import type { Profile } from '@/domain/profile';

/** Serialises the candidate for prompts (JSON is compact and unambiguous for any model). */
export function candidateContext(profile: Profile, accomplishments: Accomplishment[]): string {
  const { sourceResumeText: _raw, updatedAt: _u, applicationFacts, ...structured } = profile;
  const extras = accomplishments.map(({ text, impact, skills, context }) => ({ text, impact, skills, context }));
  return [
    '<candidate_profile>',
    JSON.stringify(structured, null, 1),
    '</candidate_profile>',
    '<extra_accomplishments>',
    extras.length ? JSON.stringify(extras, null, 1) : '[]',
    '</extra_accomplishments>',
    '<application_facts>',
    applicationFacts.trim() || '(none provided)',
    '</application_facts>',
  ].join('\n');
}
