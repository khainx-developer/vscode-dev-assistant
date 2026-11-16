import { MAX_CHAT_TURNS, type PromptMessage } from './prompts';
import type { AiCardThread, AiChatMessage } from '../../shared/messages';

/** Soft cap on in-memory card threads (oldest idle threads drop first). */
export const MAX_OPEN_THREADS = 8;

export function toPromptHistory(messages: AiChatMessage[]): PromptMessage[] {
  return messages
    .filter((message) => message.role === 'user' || message.text.length > 0)
    .map((message) => ({ role: message.role, content: message.text }));
}

/** Keep the last N complete-ish turns in stored thread messages (user + assistant pairs). */
export function trimStoredMessages(messages: AiChatMessage[], maxTurns = MAX_CHAT_TURNS): AiChatMessage[] {
  const maxMessages = Math.max(1, maxTurns) * 2;
  const trimmed = messages.length > maxMessages ? messages.slice(-maxMessages) : messages.slice();
  while (trimmed.length > 0 && trimmed[0].role === 'assistant') trimmed.shift();
  return trimmed;
}

export function emptyThread(key: string): AiCardThread {
  return { key, messages: [], status: 'idle' };
}

/**
 * Ensure capacity for `keepKey`: drop oldest idle threads first, then oldest non-running
 * threads, never removing a running thread or `keepKey`.
 */
export function pruneThreadMap(
  threads: Map<string, AiCardThread>,
  keepKey: string,
  maxOpen = MAX_OPEN_THREADS,
): void {
  if (threads.size < maxOpen) return;
  if (threads.has(keepKey) && threads.size <= maxOpen) return;

  const removable = [...threads.entries()]
    .filter(([key, thread]) => key !== keepKey && thread.status !== 'running')
    .sort((a, b) => {
      const idleRank = (thread: AiCardThread): number => (thread.status === 'idle' && thread.messages.length === 0 ? 0 : 1);
      return idleRank(a[1]) - idleRank(b[1]);
    });

  for (const [key] of removable) {
    if (threads.size < maxOpen) break;
    if (threads.has(keepKey) && threads.size <= maxOpen) break;
    threads.delete(key);
  }
}

export function cloneThreadsRecord(threads: Map<string, AiCardThread>): Record<string, AiCardThread> {
  const out: Record<string, AiCardThread> = {};
  for (const [key, thread] of threads) {
    out[key] = {
      ...thread,
      messages: thread.messages.map((message) => ({ ...message })),
    };
  }
  return out;
}
