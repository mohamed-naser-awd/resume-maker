import { LLMError } from '@/domain/errors';
import type { LLMJsonRequest, LLMProvider, LLMRequest } from '@/ports/LLMProvider';

export interface OpenAIProviderConfig {
  apiKey: string;
  model: string;
}

/**
 * Placeholder showing where an OpenAI implementation plugs in.
 *
 * To implement: `npm install openai`, create the client with
 * `dangerouslyAllowBrowser: true`, map LLMRequest to the Responses / Chat Completions API,
 * and map `completeJson` to its JSON-schema response format. Translate SDK errors to LLMError.
 * Then add "https://api.openai.com/*" to host_permissions in public/manifest.json.
 * Nothing in src/application needs to change.
 */
export class OpenAIProvider implements LLMProvider {
  readonly id = 'openai';

  constructor(private readonly _config: OpenAIProviderConfig) {}

  complete(_request: LLMRequest): Promise<string> {
    return Promise.reject(this.notImplemented());
  }

  completeJson(_request: LLMJsonRequest): Promise<unknown> {
    return Promise.reject(this.notImplemented());
  }

  testConnection(): Promise<void> {
    return Promise.reject(this.notImplemented());
  }

  private notImplemented() {
    return new LLMError('not-configured', 'The OpenAI provider is not implemented yet. Choose Claude in Settings.');
  }
}
