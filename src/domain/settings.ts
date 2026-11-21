export type ProviderId = 'claude' | 'openai';

export interface ProviderSettings {
  apiKey: string;
  model: string;
}

export interface Settings {
  provider: ProviderId;
  providers: Record<ProviderId, ProviderSettings>;
  /** Never fill EEO/demographic/secret fields. On by default. */
  skipSensitiveFields: boolean;
  /** Attach the generated resume PDF to resume upload inputs while autofilling. */
  attachResumeOnFill: boolean;
}

export const DEFAULT_MODELS: Record<ProviderId, string> = {
  claude: 'claude-opus-5-5',
  openai: 'gpt-5',
};

export const defaultSettings = (): Settings => ({
  provider: 'claude',
  providers: {
    claude: { apiKey: '', model: DEFAULT_MODELS.claude },
    openai: { apiKey: '', model: DEFAULT_MODELS.openai },
  },
  skipSensitiveFields: true,
  attachResumeOnFill: true,
});

export function activeProvider(s: Settings): ProviderSettings & { id: ProviderId } {
  return { id: s.provider, ...s.providers[s.provider] };
}
