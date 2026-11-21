# Resume Maker (Chrome / Edge extension)

Helps you apply to jobs:

- **Profile**: upload your resume (PDF / DOCX / TXT). It is parsed into structured data you can edit.
- **Accomplishments chat**: tell the bot what you've done that isn't on your resume ("I led retros and sprint planning for a team of 6"). It turns each item into a resume bullet and saves it.
- **Apply**: on a job page, detect the posting → generate an **ATS-friendly PDF resume** tailored to that job (with a keyword-coverage check) → **fill the application form**. Filled fields get a green outline, required fields left for you get an orange one. It **never submits**.

Everything is stored locally in `chrome.storage.local`. Your API key is entered on the Settings page and never lives in the code.

## Setup

```powershell
npm install
npm run build
```

1. Open `chrome://extensions` (or `edge://extensions`), turn on **Developer mode**.
2. **Load unpacked** → choose the `dist` folder.
3. The Settings page opens: paste your Claude API key, press **Test connection**, then **Save**.
4. Optional: **Allow on all sites** so it can read pages and forms inside iframes (otherwise it only works on the tab where you clicked the toolbar icon).
5. Click the toolbar icon to open the side panel.

During development, `npm run dev` rebuilds on change; press the reload icon on the extension card afterwards. `npm test` runs the unit tests.

## Architecture

Ports & adapters, wired by a small DI container. Business logic doesn't know about Chrome, React or any LLM vendor.

```
src/
  domain/          Pure types and rules (profile, job, form, resume, ATS checks, settings, errors)
  ports/           Interfaces: LLMProvider, repositories, DocumentTextExtractor, ResumeRenderer, PageGateway
  application/     Use cases: ProfileService, AccomplishmentChatUseCase, TailorResumeUseCase,
                   AutofillUseCase, JobService; prompts and output schemas
  infrastructure/  Adapters: ClaudeProvider, OpenAIProvider (stub), chrome.storage repos,
                   pdf.js / mammoth extractors, pdf-lib renderer, chrome.scripting page gateway
  di/              Container, tokens, composition roots (browserContainer.ts)
  extension/       Service worker + self-contained functions injected into pages
  ui/              React side panel and Settings page (resolve services via useService(TOKEN))
tests/             Use cases tested against fakes; DOM tests for the injected scripts
```

### Switching to OpenAI (or any other provider)

1. Implement `src/infrastructure/llm/OpenAIProvider.ts` against the `LLMProvider` interface (`complete`, `completeJson`, `testConnection`), translating errors to `LLMError`.
2. Add `"https://api.openai.com/*"` to `host_permissions` in `public/manifest.json`.
3. Choose **OpenAI** in Settings. No use case changes are needed: `SettingsBackedLLMProvider` picks the adapter from Settings on every call, and `providerRegistry` in `LLMProviderFactory.ts` maps provider ids to adapters.

### Claude specifics

- Default model `claude-opus-5-5` (editable in Settings). Requests stream, use structured JSON output (`output_config.format`), and map `effort` from each use case.
- Server-side refusal fallback (`fallbacks: "default"`, beta `server-side-fallback-2026-07-01`) is on for models that support it. If Claude declines a request on safety grounds, the API retries it on a fallback model within the same call. Remove it in `ClaudeProvider.ts` if you don't want it.
- The SDK runs in the browser with `dangerouslyAllowBrowser: true`. This is fine here: the key is your own and stays on your machine, but anyone with access to your browser profile could read it.

## Limits

- Custom JavaScript widgets (React-Select style dropdowns, some Workday controls) may not accept programmatic values; they are reported as "couldn't be set" so you can fill them by hand.
- Scanned (image-only) PDFs have no extractable text: use a text-based PDF, DOCX, or paste the text.
- The tailoring prompt is told never to invent facts, but always read the generated resume before sending it.
