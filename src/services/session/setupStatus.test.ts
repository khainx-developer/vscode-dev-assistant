import * as assert from 'assert';
import { deriveSetupStatus } from './setupStatus';
import type { GitHubViewState } from '../../shared/githubTypes';
import type { JiraViewState } from '../../shared/jiraTypes';

function github(overrides: Partial<GitHubViewState> = {}): GitHubViewState {
  return {
    authenticated: true,
    me: 'octocat',
    monitoredRepos: [{ owner: 'acme', repo: 'web', status: 'valid' }],
    monitoredAuthors: [],
    attention: { myPRs: [], teamPRs: [], attentionInbox: [] },
    commentAttentionBySource: {},
    commentStatusBySource: {},
    pendingOperations: {},
    failures: [],
    lastRefreshAt: '2026-11-01T00:00:00.000Z',
    isRefreshing: false,
    ...overrides,
  };
}

function jira(overrides: Partial<JiraViewState> = {}): JiraViewState {
  return {
    connected: true,
    siteUrl: 'https://acme.atlassian.net',
    currentUser: 'Jane Doe',
    teamMembers: [],
    savedQueries: [{ label: 'Mine', jql: 'assignee = currentUser()' }],
    tasksByQuery: {},
    failures: [],
    lastRefreshAt: '2026-11-01T00:00:00.000Z',
    isRefreshing: false,
    pendingOperations: {},
    ...overrides,
  };
}

const AI_OFF = { provider: 'none' as const, modelName: null };

function stateOf(status: ReturnType<typeof deriveSetupStatus>, id: string): string | undefined {
  return status.steps.find((step) => step.id === id)?.state;
}

suite('setupStatus', () => {
  test('freshInstall_everythingToDo_aiOptional', () => {
    const status = deriveSetupStatus(
      github({ authenticated: false, me: null, monitoredRepos: [] }),
      jira({ connected: false, siteUrl: null, currentUser: null, savedQueries: [] }),
      AI_OFF,
    );
    assert.strictEqual(status.completed, 0);
    assert.strictEqual(stateOf(status, 'github'), 'todo');
    assert.strictEqual(stateOf(status, 'monitoring'), 'todo');
    assert.strictEqual(stateOf(status, 'jira'), 'todo');
    assert.strictEqual(stateOf(status, 'ai'), 'optional');
  });

  test('allConfigured_isComplete', () => {
    const status = deriveSetupStatus(github(), jira(), { provider: 'vscodeLm', modelName: 'X · GitHub Copilot' });
    assert.strictEqual(status.completed, status.required);
    assert.strictEqual(stateOf(status, 'ai'), 'done');
  });

  test('invalidRepo_needsAttention_withPlainLanguage', () => {
    const status = deriveSetupStatus(github({ monitoredRepos: [{ owner: 'a', repo: 'gone', status: 'invalid' }] }), jira(), AI_OFF);
    const step = status.steps.find((entry) => entry.id === 'monitoring');
    assert.strictEqual(step?.state, 'attention');
    assert.match(step?.detail ?? '', /could not be found/);
  });

  test('jiraConnected_withoutDisplayName_needsAttention', () => {
    const status = deriveSetupStatus(github(), jira({ currentUser: null }), AI_OFF);
    const step = status.steps.find((entry) => entry.id === 'jira');
    assert.strictEqual(step?.state, 'attention');
    assert.match(step?.detail ?? '', /display name/);
  });

  test('beforeFirstState_stepsShowChecking', () => {
    const status = deriveSetupStatus(null, null, AI_OFF);
    assert.strictEqual(stateOf(status, 'github'), 'checking');
    assert.strictEqual(stateOf(status, 'jira'), 'checking');
  });
});
