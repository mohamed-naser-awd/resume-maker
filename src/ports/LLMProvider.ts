/**
 * Provider-neutral LLM port. Use cases depend ONLY on this interface;
 * Claude / OpenAI adapters live in src/infrastructure/llm and are chosen by the DI container.
 */

export interface LLMMessage {
  role: 'user' | 'assistant';
  content: string;
}

/** How much reasoning to spend. Adapters map this to their own knobs (or ignore it). */
export type LLMEffort = 'low' | 'medium' | 'high';

export interface LLMRequest {
  system: string;
  messages: LLMMessage[];
  maxTokens?: number;
  effort?: LLMEffort;
}

/** A plain JSON Schema object (draft 2020-12 subset). */
export type JsonSchema = Record<string, unknown>;

export interface LLMJsonRequest extends LLMRequest {
  /** JSON Schema the response must satisfy. Callers still validate the result. */
  schema: JsonSchema;
  /** Short identifier, used by providers that require a schema name. */
  schemaName: string;
}

export interface LLMProvider {
  readonly id: string;
  /** Free-form text completion. */
  complete(request: LLMRequest): Promise<string>;
  /** Structured completion; returns parsed JSON (unknown – validate before use). */
  completeJson(request: LLMJsonRequest): Promise<unknown>;
  /** Cheap credential/model check for the Settings page. Throws LLMError on failure. */
  testConnection(): Promise<void>;
}
