export type ChatRole = 'user' | 'assistant';

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: string;
  /** Ids of accomplishments the assistant extracted from this exchange. */
  addedAccomplishmentIds?: string[];
}
