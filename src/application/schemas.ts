import { z } from 'zod';
import type { JsonSchema } from '@/ports/LLMProvider';
import { LLMError } from '@/domain/errors';

/*
 * Zod schemas describe what we expect back from the model. They are converted to
 * plain JSON Schema for the provider (structured output) and used again to
 * validate the response – the provider is never trusted blindly.
 * Unknown values are empty strings / empty arrays rather than optional fields,
 * which keeps the schema strict and portable across providers.
 */

const contactSchema = z.object({
  fullName: z.string(),
  email: z.string(),
  phone: z.string(),
  location: z.string(),
  linkedin: z.string(),
  github: z.string(),
  website: z.string(),
});

const experienceSchema = z.object({
  company: z.string(),
  title: z.string(),
  location: z.string(),
  startDate: z.string(),
  endDate: z.string(),
  bullets: z.array(z.string()),
});

const educationSchema = z.object({
  institution: z.string(),
  degree: z.string(),
  field: z.string(),
  startDate: z.string(),
  endDate: z.string(),
  details: z.string(),
});

export const parsedResumeSchema = z.object({
  contact: contactSchema,
  headline: z.string(),
  summary: z.string(),
  experience: z.array(experienceSchema),
  education: z.array(educationSchema),
  skills: z.array(z.string()),
  certifications: z.array(z.string()),
  projects: z.array(
    z.object({
      name: z.string(),
      description: z.string(),
      technologies: z.array(z.string()),
    }),
  ),
});
export type ParsedResume = z.infer<typeof parsedResumeSchema>;

export const chatTurnSchema = z.object({
  reply: z.string(),
  newAccomplishments: z.array(
    z.object({
      text: z.string(),
      impact: z.string(),
      skills: z.array(z.string()),
      context: z.string(),
    }),
  ),
});
export type ChatTurn = z.infer<typeof chatTurnSchema>;

export const tailoredResumeSchema = z.object({
  jobTitle: z.string(),
  company: z.string(),
  headline: z.string(),
  summary: z.string(),
  skills: z.array(z.object({ category: z.string(), items: z.array(z.string()) })),
  experience: z.array(experienceSchema),
  education: z.array(educationSchema.omit({ startDate: true })),
  certifications: z.array(z.string()),
  targetKeywords: z.array(z.string()),
});
export type TailoredResumeOutput = z.infer<typeof tailoredResumeSchema>;

export const fieldAnswersSchema = z.object({
  answers: z.array(z.object({ fieldId: z.string(), value: z.string() })),
});
export type FieldAnswersOutput = z.infer<typeof fieldAnswersSchema>;

export const followUpSchema = z.object({ subject: z.string(), body: z.string() });
export type FollowUpDraft = z.infer<typeof followUpSchema>;

/** Converts a Zod schema to a strict JSON Schema (every object closed, every key required). */
export function toJsonSchema(schema: z.ZodType): JsonSchema {
  const json = z.toJSONSchema(schema, { target: 'draft-2020-12' }) as JsonSchema;
  delete json.$schema;
  return makeStrict(json) as JsonSchema;
}

function makeStrict(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(makeStrict);
  if (!node || typeof node !== 'object') return node;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(node)) out[k] = makeStrict(v);
  if (out.type === 'object' && out.properties && typeof out.properties === 'object') {
    out.additionalProperties = false;
    out.required = Object.keys(out.properties as object);
  }
  return out;
}

/** Validates model output; throws a provider-neutral error with a readable message. */
export function parseOutput<T>(schema: z.ZodType<T>, raw: unknown, what: string): T {
  const result = schema.safeParse(raw);
  if (!result.success) {
    throw new LLMError('invalid-output', `The AI returned an unexpected ${what} format. Please try again.`, result.error);
  }
  return result.data;
}
