export type AccomplishmentSource = 'resume' | 'chat' | 'manual';

export interface Accomplishment {
  id: string;
  /** Resume-ready statement, e.g. "Led sprint planning and retrospectives for a team of 6 developers". */
  text: string;
  /** Measurable result if known, e.g. "cut release cycle from 4 to 2 weeks". */
  impact: string;
  skills: string[];
  /** Company / role it belongs to, if the user mentioned it. */
  context: string;
  source: AccomplishmentSource;
  createdAt: string;
}

export type NewAccomplishment = Omit<Accomplishment, 'id' | 'createdAt'>;

export function createAccomplishment(
  input: NewAccomplishment,
  idGen: () => string,
  now: () => Date = () => new Date(),
): Accomplishment {
  return { ...input, text: input.text.trim(), id: idGen(), createdAt: now().toISOString() };
}

const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** Cheap duplicate guard so the chatbot doesn't re-add the same item twice. */
export function isDuplicate(candidate: string, existing: Accomplishment[]): boolean {
  const c = normalize(candidate);
  return existing.some((a) => normalize(a.text) === c);
}
