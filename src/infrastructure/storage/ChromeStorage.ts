import type { Accomplishment } from '@/domain/accomplishment';
import type { ChatMessage } from '@/domain/chat';
import { emptyProfile, type Profile } from '@/domain/profile';
import { defaultSettings, type Settings } from '@/domain/settings';
import type {
  AccomplishmentRepository,
  ChatRepository,
  ProfileRepository,
  SettingsRepository,
  Unsubscribe,
} from '@/ports/repositories';

/** Minimal key/value abstraction so repositories work with chrome.storage or an in-memory map. */
export interface KeyValueStore {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T): Promise<void>;
  onChange(key: string, listener: (value: unknown) => void): Unsubscribe;
}

/** chrome.storage.local – data never leaves the browser (not synced to the Google account). */
export class ChromeLocalStore implements KeyValueStore {
  async get<T>(key: string): Promise<T | undefined> {
    const result = await chrome.storage.local.get(key);
    return result[key] as T | undefined;
  }

  async set<T>(key: string, value: T): Promise<void> {
    await chrome.storage.local.set({ [key]: value });
  }

  onChange(key: string, listener: (value: unknown) => void): Unsubscribe {
    const handler = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === 'local' && key in changes) listener(changes[key]!.newValue);
    };
    chrome.storage.onChanged.addListener(handler);
    return () => chrome.storage.onChanged.removeListener(handler);
  }
}

export class InMemoryStore implements KeyValueStore {
  private data = new Map<string, unknown>();
  private listeners = new Map<string, Set<(v: unknown) => void>>();

  async get<T>(key: string): Promise<T | undefined> {
    const v = this.data.get(key);
    return v === undefined ? undefined : (structuredClone(v) as T);
  }

  async set<T>(key: string, value: T): Promise<void> {
    this.data.set(key, structuredClone(value));
    this.listeners.get(key)?.forEach((l) => l(structuredClone(value)));
  }

  onChange(key: string, listener: (value: unknown) => void): Unsubscribe {
    const set = this.listeners.get(key) ?? new Set();
    set.add(listener);
    this.listeners.set(key, set);
    return () => set.delete(listener);
  }
}

const KEYS = {
  profile: 'profile',
  accomplishments: 'accomplishments',
  chat: 'chatHistory',
  settings: 'settings',
} as const;

export class StoreProfileRepository implements ProfileRepository {
  constructor(private readonly store: KeyValueStore) {}
  async get(): Promise<Profile> {
    // Merge with defaults so profiles saved by older versions gain new fields.
    const saved = await this.store.get<Partial<Profile>>(KEYS.profile);
    const base = emptyProfile();
    return saved ? { ...base, ...saved, contact: { ...base.contact, ...saved.contact } } : base;
  }
  save(profile: Profile): Promise<void> {
    return this.store.set(KEYS.profile, profile);
  }
}

export class StoreAccomplishmentRepository implements AccomplishmentRepository {
  constructor(private readonly store: KeyValueStore) {}
  async list(): Promise<Accomplishment[]> {
    return (await this.store.get<Accomplishment[]>(KEYS.accomplishments)) ?? [];
  }
  saveAll(items: Accomplishment[]): Promise<void> {
    return this.store.set(KEYS.accomplishments, items);
  }
}

export class StoreChatRepository implements ChatRepository {
  constructor(private readonly store: KeyValueStore) {}
  async list(): Promise<ChatMessage[]> {
    return (await this.store.get<ChatMessage[]>(KEYS.chat)) ?? [];
  }
  saveAll(messages: ChatMessage[]): Promise<void> {
    return this.store.set(KEYS.chat, messages);
  }
}

export class StoreSettingsRepository implements SettingsRepository {
  constructor(private readonly store: KeyValueStore) {}

  async get(): Promise<Settings> {
    return mergeSettings(await this.store.get<Partial<Settings>>(KEYS.settings));
  }

  save(settings: Settings): Promise<void> {
    return this.store.set(KEYS.settings, settings);
  }

  onChange(listener: (settings: Settings) => void): Unsubscribe {
    return this.store.onChange(KEYS.settings, (v) => listener(mergeSettings(v as Partial<Settings> | undefined)));
  }
}

function mergeSettings(saved: Partial<Settings> | undefined): Settings {
  const d = defaultSettings();
  if (!saved) return d;
  return {
    ...d,
    ...saved,
    providers: {
      claude: { ...d.providers.claude, ...saved.providers?.claude },
      openai: { ...d.providers.openai, ...saved.providers?.openai },
    },
  };
}
