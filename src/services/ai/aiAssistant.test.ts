import * as assert from 'assert';
import { AI_DISABLED_MESSAGE, AI_NO_MODELS_MESSAGE, AiAssistant, AiUnavailableError, type LanguageModelPort } from './aiAssistant';
import type { ChatModelInfo } from './aiSettings';
import type { PromptMessage } from './prompts';

function fakePort(models: ChatModelInfo[], reply = 'Start here: review #1'): LanguageModelPort & { calls: Array<{ modelId: string; messages: PromptMessage[] }> } {
  const calls: Array<{ modelId: string; messages: PromptMessage[] }> = [];
  return {
    calls,
    listModels: async () => models,
    sendRequest: async (modelId, messages, onText) => {
      calls.push({ modelId, messages });
      for (const chunk of reply.match(/.{1,5}/g) ?? []) onText(chunk);
      return reply;
    },
  };
}

const copilot: ChatModelInfo = { id: 'copilot-x', name: 'X', vendor: 'copilot', family: 'x' };

suite('AiAssistant', () => {
  test('disabledProvider_failsWithSetupMessage_withoutListingModels', async () => {
    let listed = false;
    const port: LanguageModelPort = {
      listModels: async () => {
        listed = true;
        return [copilot];
      },
      sendRequest: async () => '',
    };
    const assistant = new AiAssistant(port, () => ({ provider: 'none', model: undefined }));
    await assert.rejects(() => assistant.whatShouldIDoNext([], { github: null, jira: null }, 0), (error: unknown) =>
      error instanceof AiUnavailableError && error.reason === 'disabled' && error.message === AI_DISABLED_MESSAGE);
    assert.strictEqual(listed, false);
  });

  test('noModels_failsGracefully', async () => {
    const assistant = new AiAssistant(fakePort([]), () => ({ provider: 'vscodeLm', model: undefined }));
    await assert.rejects(() => assistant.whatShouldIDoNext([], { github: null, jira: null }, 0), (error: unknown) =>
      error instanceof AiUnavailableError && error.reason === 'noModels' && error.message === AI_NO_MODELS_MESSAGE);
  });

  test('legacyProviderSetting_stillWorks_andStreamsText', async () => {
    const port = fakePort([copilot]);
    const assistant = new AiAssistant(port, () => ({ provider: 'githubCopilot', model: undefined }));
    const chunks: string[] = [];
    const result = await assistant.whatShouldIDoNext([], { github: 'me', jira: null }, 0, { onText: (chunk) => chunks.push(chunk) });
    assert.strictEqual(result.text, 'Start here: review #1');
    assert.strictEqual(result.model.id, 'copilot-x');
    assert.strictEqual(chunks.join(''), 'Start here: review #1');
    assert.strictEqual(port.calls[0].modelId, 'copilot-x');
    assert.match(port.calls[0].messages[0].content, /attention inbox is empty/);
  });

  test('usesSavedModelId_whenTheHostStillOffersIt', async () => {
    const other: ChatModelInfo = { id: 'byok-claude', name: 'Claude', vendor: 'acme', family: 'claude' };
    const port = fakePort([copilot, other]);
    const assistant = new AiAssistant(port, () => ({ provider: 'vscodeLm', model: 'byok-claude' }));
    await assistant.standupSummary({ me: { github: null, jira: null }, myPullRequests: [], reviewingPullRequests: [], myTasks: [], attention: [] }, 0);
    assert.strictEqual(port.calls[0].modelId, 'byok-claude');
  });
});
