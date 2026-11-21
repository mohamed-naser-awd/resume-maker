import { AccomplishmentChatUseCase } from '@/application/AccomplishmentChatUseCase';
import { AccomplishmentService } from '@/application/AccomplishmentService';
import { AutofillUseCase } from '@/application/AutofillUseCase';
import { JobService } from '@/application/JobService';
import { ProfileService } from '@/application/ProfileService';
import { TailorResumeUseCase } from '@/application/TailorResumeUseCase';
import type { Container } from './container';
import { TOKENS as T } from './tokens';

/** Wires use cases to whatever port implementations are registered. Environment-agnostic. */
export function registerApplication(c: Container): Container {
  return c
    .register(T.accomplishmentService, (c) =>
      new AccomplishmentService({ accomplishments: c.resolve(T.accomplishmentRepo), idGen: c.resolve(T.idGen), clock: c.resolve(T.clock) }),
    )
    .register(T.profileService, (c) =>
      new ProfileService({ profiles: c.resolve(T.profileRepo), extractor: c.resolve(T.extractor), llm: c.resolve(T.llm), clock: c.resolve(T.clock) }),
    )
    .register(T.chat, (c) =>
      new AccomplishmentChatUseCase({
        llm: c.resolve(T.llm),
        chat: c.resolve(T.chatRepo),
        profiles: c.resolve(T.profileRepo),
        accomplishments: c.resolve(T.accomplishmentService),
        idGen: c.resolve(T.idGen),
        clock: c.resolve(T.clock),
      }),
    )
    .register(T.tailor, (c) =>
      new TailorResumeUseCase({
        llm: c.resolve(T.llm),
        profiles: c.resolve(T.profileRepo),
        accomplishments: c.resolve(T.accomplishmentService),
        renderer: c.resolve(T.renderer),
        clock: c.resolve(T.clock),
      }),
    )
    .register(T.autofill, (c) =>
      new AutofillUseCase({
        page: c.resolve(T.page),
        llm: c.resolve(T.llm),
        profiles: c.resolve(T.profileRepo),
        accomplishments: c.resolve(T.accomplishmentService),
        settings: c.resolve(T.settingsRepo),
      }),
    )
    .register(T.jobs, (c) => new JobService(c.resolve(T.page)));
}
