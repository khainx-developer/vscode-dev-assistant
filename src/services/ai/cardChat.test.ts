import * as assert from 'assert';
import {
  MAX_OPEN_THREADS,
  cloneThreadsRecord,
  emptyThread,
  pruneThreadMap,
  toPromptHistory,
  trimStoredMessages,
} from './cardChat';
import { MAX_CHAT_TURNS } from './prompts';
import type { AiCardThread } from '../../shared/messages';

suite('cardChat helpers', () => {
  test('trimStoredMessages_keepsLastTurns_andDropsLeadingAssistant', () => {
    const messages = [];
    for (let i = 0; i < MAX_CHAT_TURNS + 3; i++) {
      messages.push({ role: 'user' as const, text: `u${i}` });
      messages.push({ role: 'assistant' as const, text: `a${i}` });
    }
    const trimmed = trimStoredMessages(messages);
    assert.strictEqual(trimmed.length, MAX_CHAT_TURNS * 2);
    assert.strictEqual(trimmed[0].role, 'user');
    assert.strictEqual(trimmed[0].text, `u${3}`);
  });

  test('toPromptHistory_skipsEmptyAssistantPlaceholders', () => {
    const history = toPromptHistory([
      { role: 'user', text: 'Why?' },
      { role: 'assistant', text: '' },
      { role: 'user', text: 'And then?' },
      { role: 'assistant', text: 'Because checks failed.' },
    ]);
    assert.deepStrictEqual(history, [
      { role: 'user', content: 'Why?' },
      { role: 'user', content: 'And then?' },
      { role: 'assistant', content: 'Because checks failed.' },
    ]);
  });

  test('pruneThreadMap_dropsIdleBeforeBusy_andProtectsKeepKey', () => {
    const threads = new Map<string, AiCardThread>();
    for (let i = 0; i < MAX_OPEN_THREADS; i++) {
      threads.set(`idle-${i}`, emptyThread(`idle-${i}`));
    }
    const keep = emptyThread('keep');
    keep.messages = [{ role: 'user', text: 'hi' }];
    threads.set('keep', keep);
    assert.strictEqual(threads.size, MAX_OPEN_THREADS + 1);

    pruneThreadMap(threads, 'keep');
    assert.ok(threads.has('keep'));
    assert.ok(threads.size <= MAX_OPEN_THREADS);
  });

  test('pruneThreadMap_neverRemovesRunningThread', () => {
    const threads = new Map<string, AiCardThread>();
    const running = emptyThread('running');
    running.status = 'running';
    threads.set('running', running);
    for (let i = 0; i < MAX_OPEN_THREADS; i++) {
      threads.set(`idle-${i}`, emptyThread(`idle-${i}`));
    }
    pruneThreadMap(threads, 'new-key');
    assert.ok(threads.has('running'));
  });

  test('cloneThreadsRecord_deepCopiesMessages', () => {
    const threads = new Map<string, AiCardThread>();
    const thread = emptyThread('k');
    thread.messages = [{ role: 'user', text: 'hi' }];
    threads.set('k', thread);
    const clone = cloneThreadsRecord(threads);
    clone.k.messages[0].text = 'changed';
    assert.strictEqual(threads.get('k')!.messages[0].text, 'hi');
  });
});
