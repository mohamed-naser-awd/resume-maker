import type { Accomplishment } from '@/domain/accomplishment';
import type { ApplicationRecord } from '@/domain/application';
import type { ChatMessage } from '@/domain/chat';
import type { JobPosting } from '@/domain/job';
import type { Profile } from '@/domain/profile';
import type { Settings } from '@/domain/settings';

export type Unsubscribe = () => void;

export interface ProfileRepository {
  get(): Promise<Profile>;
  save(profile: Profile): Promise<void>;
  onChange(listener: (profile: Profile) => void): Unsubscribe;
}

export interface AccomplishmentRepository {
  list(): Promise<Accomplishment[]>;
  saveAll(items: Accomplishment[]): Promise<void>;
}

export interface ApplicationRepository {
  list(): Promise<ApplicationRecord[]>;
  saveAll(records: ApplicationRecord[]): Promise<void>;
  onChange(listener: (records: ApplicationRecord[]) => void): Unsubscribe;
}

/** Job postings seen while browsing, keyed by job identity (see domain/jobIdentity). */
export interface JobMemoryRepository {
  get(identity: string): Promise<JobPosting | null>;
  put(identity: string, job: JobPosting): Promise<void>;
}

export interface ChatRepository {
  list(): Promise<ChatMessage[]>;
  saveAll(messages: ChatMessage[]): Promise<void>;
}

export interface SettingsRepository {
  get(): Promise<Settings>;
  save(settings: Settings): Promise<void>;
  onChange(listener: (settings: Settings) => void): Unsubscribe;
}
