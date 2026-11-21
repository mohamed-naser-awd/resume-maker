import type { AccomplishmentChatUseCase } from '@/application/AccomplishmentChatUseCase';
import type { AccomplishmentService } from '@/application/AccomplishmentService';
import type { ApplicationHistoryService } from '@/application/ApplicationHistoryService';
import type { AutofillUseCase } from '@/application/AutofillUseCase';
import type { JobService } from '@/application/JobService';
import type { ProfileService } from '@/application/ProfileService';
import type { TailorResumeUseCase } from '@/application/TailorResumeUseCase';
import type { DocumentTextExtractor } from '@/ports/DocumentTextExtractor';
import type { LLMProvider } from '@/ports/LLMProvider';
import type { PageGateway } from '@/ports/PageGateway';
import type { PageEvents } from '@/ports/PageEvents';
import type {
  AccomplishmentRepository,
  ApplicationRepository,
  ChatRepository,
  JobMemoryRepository,
  ProfileRepository,
  SettingsRepository,
} from '@/ports/repositories';
import type { ResumeRenderer } from '@/ports/ResumeRenderer';
import type { Clock, IdGenerator } from '@/ports/system';
import type { KeyValueStore } from '@/infrastructure/storage/ChromeStorage';
import { token } from './container';

export const TOKENS = {
  // infrastructure / ports
  store: token<KeyValueStore>('KeyValueStore'),
  settingsRepo: token<SettingsRepository>('SettingsRepository'),
  profileRepo: token<ProfileRepository>('ProfileRepository'),
  accomplishmentRepo: token<AccomplishmentRepository>('AccomplishmentRepository'),
  chatRepo: token<ChatRepository>('ChatRepository'),
  applicationRepo: token<ApplicationRepository>('ApplicationRepository'),
  jobMemoryRepo: token<JobMemoryRepository>('JobMemoryRepository'),
  llm: token<LLMProvider>('LLMProvider'),
  extractor: token<DocumentTextExtractor>('DocumentTextExtractor'),
  renderer: token<ResumeRenderer>('ResumeRenderer'),
  page: token<PageGateway>('PageGateway'),
  pageEvents: token<PageEvents>('PageEvents'),
  idGen: token<IdGenerator>('IdGenerator'),
  clock: token<Clock>('Clock'),
  // application
  profileService: token<ProfileService>('ProfileService'),
  accomplishmentService: token<AccomplishmentService>('AccomplishmentService'),
  chat: token<AccomplishmentChatUseCase>('AccomplishmentChatUseCase'),
  tailor: token<TailorResumeUseCase>('TailorResumeUseCase'),
  autofill: token<AutofillUseCase>('AutofillUseCase'),
  jobs: token<JobService>('JobService'),
  history: token<ApplicationHistoryService>('ApplicationHistoryService'),
} as const;
