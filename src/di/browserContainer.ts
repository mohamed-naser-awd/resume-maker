import { CompositeTextExtractor, DocxTextExtractor, PdfTextExtractor, PlainTextExtractor } from '@/infrastructure/extract/extractors';
import { SettingsBackedLLMProvider } from '@/infrastructure/llm/LLMProviderFactory';
import { ChromePageGateway } from '@/infrastructure/page/ChromePageGateway';
import { ChromePageEvents } from '@/infrastructure/page/ChromePageEvents';
import { PdfLibResumeRenderer } from '@/infrastructure/render/PdfLibResumeRenderer';
import {
  ChromeLocalStore,
  StoreAccomplishmentRepository,
  StoreApplicationRepository,
  StoreChatRepository,
  StoreProfileRepository,
  StoreSettingsRepository,
} from '@/infrastructure/storage/ChromeStorage';
import { Container } from './container';
import { registerApplication } from './registerApplication';
import { TOKENS as T } from './tokens';

/**
 * Composition root for the extension pages. This is the ONLY place that knows
 * which concrete adapters are used. To switch LLM vendor permanently you could
 * register a different T.llm here; the Settings-backed provider already lets the
 * user switch at runtime.
 */
export function createBrowserContainer(): Container {
  const c = new Container()
    .register(T.store, () => new ChromeLocalStore())
    .register(T.settingsRepo, (c) => new StoreSettingsRepository(c.resolve(T.store)))
    .register(T.profileRepo, (c) => new StoreProfileRepository(c.resolve(T.store)))
    .register(T.accomplishmentRepo, (c) => new StoreAccomplishmentRepository(c.resolve(T.store)))
    .register(T.chatRepo, (c) => new StoreChatRepository(c.resolve(T.store)))
    .register(T.applicationRepo, (c) => new StoreApplicationRepository(c.resolve(T.store)))
    .register(T.llm, (c) => new SettingsBackedLLMProvider(c.resolve(T.settingsRepo)))
    .register(T.extractor, () => new CompositeTextExtractor([new PdfTextExtractor(), new DocxTextExtractor(), new PlainTextExtractor()]))
    .register(T.renderer, () => new PdfLibResumeRenderer())
    .register(T.page, () => new ChromePageGateway())
    .register(T.pageEvents, () => new ChromePageEvents())
    .register(T.idGen, () => () => crypto.randomUUID())
    .register(T.clock, () => () => new Date());
  return registerApplication(c);
}
