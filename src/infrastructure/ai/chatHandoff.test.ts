import * as assert from 'assert';
import { ChatHandoff, type ChatHandoffDeps } from './chatHandoff';

function fakeDeps(): ChatHandoffDeps & {
  clipboard: string[];
  messages: string[];
  status: string[];
} {
  const clipboard: string[] = [];
  const messages: string[] = [];
  const status: string[] = [];
  return {
    clipboard,
    messages,
    status,
    writeClipboard: async (text) => { clipboard.push(text); },
    showInformationMessage: async (message) => { messages.push(message); return undefined; },
    setStatusBarMessage: (text) => { status.push(text); },
  };
}

suite('ChatHandoff', () => {
  test('send_copiesPromptToClipboard_withFeedback', async () => {
    const deps = fakeDeps();
    const result = await new ChatHandoff(deps).send('Review PR #1\nUse the GitHub MCP tools.');
    assert.deepStrictEqual(result, { method: 'clipboard' });
    assert.deepStrictEqual(deps.clipboard, ['Review PR #1\nUse the GitHub MCP tools.']);
    assert.match(deps.messages[0] ?? '', /Prompt copied/);
    assert.match(deps.status[0] ?? '', /Prompt copied/);
  });

  test('send_trimsPrompt', async () => {
    const deps = fakeDeps();
    const result = await new ChatHandoff(deps).send('  hello world  \n');
    assert.deepStrictEqual(result, { method: 'clipboard' });
    assert.deepStrictEqual(deps.clipboard, ['hello world']);
  });

  test('emptyPrompt_stillCopiesPlaceholder', async () => {
    const deps = fakeDeps();
    const result = await new ChatHandoff(deps).send('   ');
    assert.deepStrictEqual(result, { method: 'clipboard' });
    assert.deepStrictEqual(deps.clipboard, ['(empty prompt)']);
  });
});
