import { LLMError } from '@/domain/errors';
import { activeProvider, type ProviderId, type ProviderSettings } from '@/domain/settings';
import type { LLMJsonRequest, LLMProvider, LLMRequest } from '@/ports/LLMProvider';
import type { SettingsRepository } from '@/ports/repositories';
import { ClaudeProvider } from './ClaudeProvider';
import { OpenAIProvider } from './OpenAIProvider';

export type ProviderConstructor = (config: ProviderSettings) => LLMProvider;

/** Registry of provider adapters. Adding a provider = one entry here + a Settings option. */
export const providerRegistry: Record<ProviderId, ProviderConstructor> = {
  claude: (c) => new ClaudeProvider(c),
  openai: (c) => new OpenAIProvider(c),
};

/**
 * An LLMProvider that resolves the real adapter from Settings on every call.
 * Use cases hold this one object; changing provider, key or model in Settings
 * takes effect on the next request with no reload.
 */
export class SettingsBackedLLMProvider implements LLMProvider {
  private cache: { key: string; provider: LLMProvider } | null = null;

  constructor(
    private readonly settings: SettingsRepository,
    private readonly registry: Record<ProviderId, ProviderConstructor> = providerRegistry,
  ) {}

  get id(): string {
    return this.cache?.provider.id ?? 'unresolved';
  }

  async complete(request: LLMRequest): Promise<string> {
    return (await this.resolve()).complete(request);
  }

  async completeJson(request: LLMJsonRequest): Promise<unknown> {
    return (await this.resolve()).completeJson(request);
  }

  async testConnection(): Promise<void> {
    return (await this.resolve()).testConnection();
  }

  private async resolve(): Promise<LLMProvider> {
    const settings = await this.settings.get();
    const active = activeProvider(settings);
    if (!active.apiKey.trim()) {
      throw new LLMError('not-configured', 'Add your API key in Settings first.');
    }
    const key = `${active.id}|${active.model}|${active.apiKey}`;
    if (this.cache?.key !== key) {
      this.cache = { key, provider: this.registry[active.id]({ apiKey: active.apiKey.trim(), model: active.model.trim() }) };
    }
    return this.cache.provider;
  }
}
