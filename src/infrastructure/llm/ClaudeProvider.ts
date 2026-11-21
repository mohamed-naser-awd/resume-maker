import Anthropic from '@anthropic-ai/sdk';
import { LLMError } from '@/domain/errors';
import type { LLMEffort, LLMJsonRequest, LLMProvider, LLMRequest } from '@/ports/LLMProvider';

export interface ClaudeProviderConfig {
  apiKey: string;
  model: string;
}

const DEFAULT_MAX_TOKENS = 32_000;
const FALLBACK_BETA = 'server-side-fallback-2026-07-01';

/** Models that accept the server-side refusal fallback (`fallbacks: "default"`). */
const supportsServerFallback = (model: string) =>
  /^claude-(fable-5-[12]|opus-5(-5)?|sonnet-5-5)$/.test(model);

/** Older models reject output_config.effort. */
const supportsEffort = (model: string) => !/claude-(haiku-4|sonnet-4-5|3)/.test(model);

/** LLMProvider adapter for the Anthropic Messages API. */
export class ClaudeProvider implements LLMProvider {
  readonly id = 'claude';
  private readonly client: Anthropic;

  constructor(private readonly config: ClaudeProviderConfig) {
    this.client = new Anthropic({
      apiKey: config.apiKey,
      // The key is the user's own, stored locally in the extension – not shipped in code.
      dangerouslyAllowBrowser: true,
      maxRetries: 2,
    });
  }

  async complete(request: LLMRequest): Promise<string> {
    const message = await this.send(request);
    return textOf(message);
  }

  async completeJson(request: LLMJsonRequest): Promise<unknown> {
    const message = await this.send(request, { type: 'json_schema', schema: request.schema });
    const text = textOf(message);
    try {
      return JSON.parse(text);
    } catch (e) {
      throw new LLMError('invalid-output', 'The AI returned malformed JSON. Please try again.', e);
    }
  }

  async testConnection(): Promise<void> {
    try {
      // Validates both the key and the model name without spending tokens.
      await this.client.models.retrieve(this.config.model);
    } catch (e) {
      throw toLLMError(e);
    }
  }

  private async send(
    request: LLMRequest,
    format?: Anthropic.Beta.Messages.BetaJSONOutputFormat,
  ): Promise<Anthropic.Beta.Messages.BetaMessage> {
    const { model } = this.config;
    const useFallback = supportsServerFallback(model);
    const effort = mapEffort(request.effort);
    const outputConfig: Anthropic.Beta.Messages.BetaOutputConfig = {
      ...(format ? { format } : {}),
      ...(effort && supportsEffort(model) ? { effort } : {}),
    };

    let message: Anthropic.Beta.Messages.BetaMessage;
    try {
      // Streaming avoids HTTP timeouts on long resume generations.
      const stream = this.client.beta.messages.stream({
        model,
        max_tokens: request.maxTokens ?? DEFAULT_MAX_TOKENS,
        system: request.system,
        messages: request.messages.map((m) => ({ role: m.role, content: m.content })),
        ...(Object.keys(outputConfig).length ? { output_config: outputConfig } : {}),
        // On a safety decline the API retries on a fallback model inside the same call.
        ...(useFallback ? { betas: [FALLBACK_BETA], fallbacks: 'default' as const } : {}),
      });
      message = await stream.finalMessage();
    } catch (e) {
      throw toLLMError(e);
    }

    if (message.stop_reason === 'refusal') {
      throw new LLMError('refusal', 'The AI declined this request. Try rephrasing or removing unusual content.');
    }
    if (message.stop_reason === 'max_tokens') {
      throw new LLMError('truncated', 'The AI response was cut off (too long). Try again with less input.');
    }
    return message;
  }
}

function mapEffort(effort: LLMEffort | undefined): Anthropic.Beta.Messages.BetaOutputConfig['effort'] {
  return effort ?? undefined;
}

function textOf(message: Anthropic.Beta.Messages.BetaMessage): string {
  return message.content
    .flatMap((block) => (block.type === 'text' ? [block.text] : []))
    .join('')
    .trim();
}

function toLLMError(e: unknown): LLMError {
  if (e instanceof LLMError) return e;
  if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) {
    return new LLMError('auth', 'Claude rejected the API key. Check it in Settings.', e);
  }
  if (e instanceof Anthropic.NotFoundError) {
    return new LLMError('bad-request', 'Model not found. Check the model name in Settings.', e);
  }
  if (e instanceof Anthropic.RateLimitError) {
    return new LLMError('rate-limit', 'Claude rate limit reached. Wait a minute and try again.', e);
  }
  if (e instanceof Anthropic.BadRequestError) {
    return new LLMError('bad-request', `Claude rejected the request: ${e.message}`, e);
  }
  if (e instanceof Anthropic.APIConnectionError) {
    return new LLMError('network', 'Could not reach the Claude API. Check your internet connection.', e);
  }
  if (e instanceof Anthropic.APIError) {
    return new LLMError('unknown', `Claude API error${e.status ? ` (${e.status})` : ''}: ${e.message}`, e);
  }
  return new LLMError('unknown', e instanceof Error ? e.message : String(e), e);
}
