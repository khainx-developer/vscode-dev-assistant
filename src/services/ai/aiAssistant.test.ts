import * as assert from 'assert';
import {
  AI_CLI_MISSING_MESSAGE,
  AI_CLI_UNAUTHENTICATED_MESSAGE,
  AI_DISABLED_MESSAGE,
  AI_NO_MODELS_MESSAGE,
  AiAssistant,
  AiUnavailableError,
  type CursorCliPort,
  type LanguageModelPort,
} from './aiAssistant';
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

function fakeCli(
  status: { available: boolean; authenticated: boolean },
  models: ChatModelInfo[],
  reply = 'CLI plan',
): CursorCliPort & { calls: Array<{ modelId: string; messages: PromptMessage[] }>; listed: boolean } {
  const port = fakePort(models, reply);
  let listed = false;
  return {
    calls: port.calls,
    get listed() { return listed; },
    getStatus: async () => status,
    listModels: async () => {
      listed = true;
      return port.listModels();
    },
    sendRequest: port.sendRequest,
  };
}

const copilot: ChatModelInfo = { id: 'copilot-x', name: 'X', vendor: 'copilot', family: 'x' };
const cliModel: ChatModelInfo = { id: 'auto', name: 'Auto', vendor: 'cursor-cli', family: 'auto' };

suite('AiAssistant', () => {
  test('disabledProvider_failsWithSetupMessage_withoutListingModels', async () => {
    let listed = false;
    const vscodeLm: LanguageModelPort = {
      listModels: async () => {
        listed = true;
        return [copilot];
      },
      sendRequest: async () => '',
    };
    const assistant = new AiAssistant(
      { vscodeLm, cursorCli: fakeCli({ available: true, authenticated: true }, [cliModel]) },
      () => ({ provider: 'none', model: undefined }),
    );
    await assert.rejects(() => assistant.whatShouldIDoNext([], { github: null, jira: null }, 0), (error: unknown) =>
      error instanceof AiUnavailableError && error.reason === 'disabled' && error.message === AI_DISABLED_MESSAGE);
    assert.strictEqual(listed, false);
  });

  test('noModels_failsGracefully', async () => {
    const assistant = new AiAssistant(
      { vscodeLm: fakePort([]), cursorCli: fakeCli({ available: true, authenticated: true }, [cliModel]) },
      () => ({ provider: 'vscodeLm', model: undefined }),
    );
    await assert.rejects(() => assistant.whatShouldIDoNext([], { github: null, jira: null }, 0), (error: unknown) =>
      error instanceof AiUnavailableError && error.reason === 'noModels' && error.message === AI_NO_MODELS_MESSAGE);
  });

  test('legacyProviderSetting_stillWorks_andStreamsText', async () => {
    const vscodeLm = fakePort([copilot]);
    const cursorCli = fakeCli({ available: true, authenticated: true }, [cliModel]);
    const assistant = new AiAssistant(
      { vscodeLm, cursorCli },
      () => ({ provider: 'githubCopilot', model: undefined }),
    );
    const chunks: string[] = [];
    const result = await assistant.whatShouldIDoNext([], { github: 'me', jira: null }, 0, { onText: (chunk) => chunks.push(chunk) });
    assert.strictEqual(result.text, 'Start here: review #1');
    assert.strictEqual(result.model.id, 'copilot-x');
    assert.strictEqual(chunks.join(''), 'Start here: review #1');
    assert.strictEqual(vscodeLm.calls[0].modelId, 'copilot-x');
    assert.strictEqual(cursorCli.calls.length, 0);
    assert.match(vscodeLm.calls[0].messages[0].content, /attention inbox is empty/);
  });

  test('usesSavedModelId_whenTheHostStillOffersIt', async () => {
    const other: ChatModelInfo = { id: 'byok-claude', name: 'Claude', vendor: 'acme', family: 'claude' };
    const vscodeLm = fakePort([copilot, other]);
    const assistant = new AiAssistant(
      { vscodeLm, cursorCli: fakeCli({ available: true, authenticated: true }, [cliModel]) },
      () => ({ provider: 'vscodeLm', model: 'byok-claude' }),
    );
    await assistant.standupSummary({ me: { github: null, jira: null }, myPullRequests: [], reviewingPullRequests: [], myTasks: [], attention: [] }, 0);
    assert.strictEqual(vscodeLm.calls[0].modelId, 'byok-claude');
  });

  test('cursorCli_routesToCliPort_notVscodeLm', async () => {
    const vscodeLm = fakePort([copilot]);
    const cursorCli = fakeCli({ available: true, authenticated: true }, [cliModel], 'From CLI');
    const assistant = new AiAssistant(
      { vscodeLm, cursorCli },
      () => ({ provider: 'cursorCli', model: undefined }),
    );
    const result = await assistant.whatShouldIDoNext([], { github: null, jira: null }, 0);
    assert.strictEqual(result.text, 'From CLI');
    assert.strictEqual(cursorCli.calls.length, 1);
    assert.strictEqual(vscodeLm.calls.length, 0);
    assert.match(cursorCli.calls[0].messages[0].content, /attention inbox is empty/);
  });

  test('cursorCli_missing_mapsToCliMissing', async () => {
    const assistant = new AiAssistant(
      {
        vscodeLm: fakePort([copilot]),
        cursorCli: fakeCli({ available: false, authenticated: false }, []),
      },
      () => ({ provider: 'cursorCli', model: undefined }),
    );
    await assert.rejects(() => assistant.whatShouldIDoNext([], { github: null, jira: null }, 0), (error: unknown) =>
      error instanceof AiUnavailableError && error.reason === 'cliMissing' && error.message === AI_CLI_MISSING_MESSAGE);
  });

  test('cursorCli_unauthenticated_mapsToCliUnauthenticated', async () => {
    const assistant = new AiAssistant(
      {
        vscodeLm: fakePort([copilot]),
        cursorCli: fakeCli({ available: true, authenticated: false }, [cliModel]),
      },
      () => ({ provider: 'cursorCli', model: undefined }),
    );
    await assert.rejects(() => assistant.whatShouldIDoNext([], { github: null, jira: null }, 0), (error: unknown) =>
      error instanceof AiUnavailableError && error.reason === 'cliUnauthenticated' && error.message === AI_CLI_UNAUTHENTICATED_MESSAGE);
  });

  test('chatAboutItem_sendsContextThenHistory', async () => {
    const vscodeLm = fakePort([copilot], 'Because checks failed.');
    const assistant = new AiAssistant(
      { vscodeLm, cursorCli: fakeCli({ available: true, authenticated: true }, [cliModel]) },
      () => ({ provider: 'vscodeLm', model: undefined }),
    );
    const item = {
      key: 'github:acme/web#1',
      pr: {
        repoKey: 'acme/web',
        number: 1,
        title: 'Fix',
        url: 'https://example.com',
        author: 'a',
        state: 'OPEN',
        mergedAt: null,
        createdAt: '2026-11-09T00:00:00.000Z',
        updatedAt: '2026-11-10T09:00:00.000Z',
        labels: [],
        checkStatus: 'FAILURE',
        mergeable: 'MERGEABLE',
        reviews: [],
        comments: [],
        requestedReviewers: [],
      },
      relatedPRs: [],
      reasons: ['pr-checks-failing'],
      priority: 1,
      latestRelevantAt: null,
      jiraUnreadCount: 0,
      jiraLatestUnreadComment: null,
      jiraLatestAwaitingComment: null,
      prUnreadCount: 0,
      prLatestUnreadComment: null,
      prLatestAwaitingComment: null,
    };
    const result = await assistant.chatAboutItem(
      item as never,
      [{ role: 'user', content: 'Why is this flagged?' }],
      { github: 'me', jira: null },
      Date.parse('2026-11-11T09:00:00.000Z'),
    );
    assert.strictEqual(result.text, 'Because checks failed.');
    assert.strictEqual(vscodeLm.calls[0].messages.length, 2);
    assert.match(vscodeLm.calls[0].messages[0].content, /triage one work item/);
    assert.strictEqual(vscodeLm.calls[0].messages[1].content, 'Why is this flagged?');
  });
});
