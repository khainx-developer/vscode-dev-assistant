import * as assert from 'assert';
import {
  defaultAiProviderForHost,
  isCursorHost,
  isLegacyProviderValue,
  normalizeAiProvider,
  pickDefaultModel,
  sortModelsForPicker,
  type ChatModelInfo,
} from './aiSettings';

const copilotA: ChatModelInfo = { id: 'copilot-a', name: 'Model A', vendor: 'copilot', family: 'a' };
const copilotB: ChatModelInfo = { id: 'copilot-b', name: 'Claude B', vendor: 'copilot', family: 'claude-b' };
const byok: ChatModelInfo = { id: 'byok-c', name: 'Model C', vendor: 'acme', family: 'c' };

suite('aiSettings', () => {
  test('legacyGithubCopilotValue_isReadAsVscodeLm', () => {
    assert.strictEqual(normalizeAiProvider('githubCopilot'), 'vscodeLm');
    assert.ok(isLegacyProviderValue('githubCopilot'));
    assert.strictEqual(normalizeAiProvider('vscodeLm'), 'vscodeLm');
  });

  test('cursorCli_normalizesDistinctly_fromBareCursor', () => {
    assert.strictEqual(normalizeAiProvider('cursorCli'), 'cursorCli');
    assert.strictEqual(normalizeAiProvider('cursor'), 'none');
    assert.strictEqual(normalizeAiProvider('claude'), 'none');
    assert.strictEqual(normalizeAiProvider(undefined), 'none');
  });

  test('isCursorHost_matchesAppNameCaseInsensitively', () => {
    assert.strictEqual(isCursorHost('Cursor'), true);
    assert.strictEqual(isCursorHost('cursor'), true);
    assert.strictEqual(isCursorHost('Cursor - Insiders'), true);
    assert.strictEqual(isCursorHost('Visual Studio Code'), false);
    assert.strictEqual(isCursorHost('Code'), false);
    assert.strictEqual(isCursorHost(''), false);
    assert.strictEqual(isCursorHost(undefined), false);
    assert.strictEqual(isCursorHost(null), false);
  });

  test('defaultAiProviderForHost_cursorVsVscode', () => {
    assert.strictEqual(defaultAiProviderForHost('Cursor'), 'cursorCli');
    assert.strictEqual(defaultAiProviderForHost('Visual Studio Code'), 'vscodeLm');
    assert.strictEqual(defaultAiProviderForHost(undefined), 'vscodeLm');
  });

  test('pickDefaultModel_prefersSavedId', () => {
    assert.strictEqual(pickDefaultModel([copilotA, copilotB, byok], 'byok-c'), byok);
  });

  test('pickDefaultModel_matchesLegacyNameOrFamily', () => {
    assert.strictEqual(pickDefaultModel([copilotA, copilotB], 'Claude B'), copilotB);
    assert.strictEqual(pickDefaultModel([copilotA, copilotB], 'claude-b'), copilotB);
  });

  test('pickDefaultModel_fallsBackToFirstCopilot_thenFirstAvailable', () => {
    assert.strictEqual(pickDefaultModel([byok, copilotB, copilotA], 'gone'), copilotB);
    assert.strictEqual(pickDefaultModel([byok], undefined), byok);
    assert.strictEqual(pickDefaultModel([], 'anything'), undefined);
  });

  test('sortModelsForPicker_putsCopilotFirst', () => {
    assert.deepStrictEqual(sortModelsForPicker([byok, copilotA, copilotB]).map((model) => model.id), ['copilot-b', 'copilot-a', 'byok-c']);
  });
});
