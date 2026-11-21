import type { Accomplishment } from '@/domain/accomplishment';
import type { ChatMessage } from '@/domain/chat';
import type { Profile } from '@/domain/profile';
import type { LLMMessage, LLMProvider } from '@/ports/LLMProvider';
import type { ChatRepository, ProfileRepository } from '@/ports/repositories';
import type { Clock, IdGenerator } from '@/ports/system';
import type { AccomplishmentService } from './AccomplishmentService';
import { ACCOMPLISHMENT_COACH_PROMPT } from './prompts';
import { chatTurnSchema, parseOutput, toJsonSchema } from './schemas';

export interface AccomplishmentChatDeps {
  llm: LLMProvider;
  chat: ChatRepository;
  profiles: ProfileRepository;
  accomplishments: AccomplishmentService;
  idGen: IdGenerator;
  clock: Clock;
}

export interface ChatTurnResult {
  messages: ChatMessage[];
  added: Accomplishment[];
}

const MAX_HISTORY = 30;
const chatTurnJsonSchema = toJsonSchema(chatTurnSchema);

export const CHAT_GREETING =
  "Hi! Tell me about things you've done at work that might not be on your resume – e.g. leading sprint planning, running retros, mentoring, managing a team, improving a process. I'll turn each one into a resume bullet.";

/** The accomplishments chatbot: converses and extracts resume-ready bullets. */
export class AccomplishmentChatUseCase {
  constructor(private readonly deps: AccomplishmentChatDeps) {}

  history(): Promise<ChatMessage[]> {
    return this.deps.chat.list();
  }

  async clear(): Promise<void> {
    await this.deps.chat.saveAll([]);
  }

  async send(userText: string): Promise<ChatTurnResult> {
    const text = userText.trim();
    if (!text) return { messages: await this.deps.chat.list(), added: [] };

    const [history, profile, saved] = await Promise.all([
      this.deps.chat.list(),
      this.deps.profiles.get(),
      this.deps.accomplishments.list(),
    ]);

    const userMsg = this.message('user', text);
    const transcript: LLMMessage[] = [...history, userMsg]
      .slice(-MAX_HISTORY)
      .map((m) => ({ role: m.role, content: m.content }));
    // Providers require the conversation to start with a user turn.
    while (transcript[0]?.role === 'assistant') transcript.shift();

    const raw = await this.deps.llm.completeJson({
      system: `${ACCOMPLISHMENT_COACH_PROMPT}\n\n${this.context(profile, saved)}`,
      messages: transcript,
      schema: chatTurnJsonSchema,
      schemaName: 'chat_turn',
      effort: 'low',
    });
    const turn = parseOutput(chatTurnSchema, raw, 'chat reply');

    const added = await this.deps.accomplishments.addMany(
      turn.newAccomplishments.map((a) => ({ ...a, source: 'chat' as const })),
    );
    const assistantMsg: ChatMessage = {
      ...this.message('assistant', turn.reply),
      addedAccomplishmentIds: added.map((a) => a.id),
    };
    const messages = [...history, userMsg, assistantMsg];
    await this.deps.chat.saveAll(messages);
    return { messages, added };
  }

  private message(role: ChatMessage['role'], content: string): ChatMessage {
    return { id: this.deps.idGen(), role, content, createdAt: this.deps.clock().toISOString() };
  }

  private context(profile: Profile, saved: Accomplishment[]): string {
    const roles = profile.experience
      .map((e) => `- ${e.title} at ${e.company} (${e.startDate} – ${e.endDate})`)
      .join('\n');
    const items = saved.map((a) => `- ${a.text}`).join('\n');
    return [
      '<candidate_roles>',
      roles || '(no resume uploaded yet)',
      '</candidate_roles>',
      '<saved_accomplishments>',
      items || '(none yet)',
      '</saved_accomplishments>',
    ].join('\n');
  }
}
