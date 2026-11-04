import * as assert from 'assert';
import * as vscode from 'vscode';
import { AtlassianMcpAdapter } from './atlassianMcpAdapter';
import { JiraConfigStore } from './configStore';
import type { JiraConnectionStore } from './connectionStore';
import type { McpConnectionService } from '../mcp/connectionService';
import type { JiraConnection, JiraSavedQuery } from './types';

const connection: JiraConnection = {
  siteUrl: 'https://example.atlassian.net',
  siteId: 'cloud-1',
};

function stubConfiguration(
  initialQueries: JiraSavedQuery[] = [],
  initialTeamMembers?: string[],
  initialCurrentUser?: string,
) {
  const settings: Record<string, unknown> = { savedQueries: initialQueries };
  if (initialTeamMembers !== undefined) {
    settings.teamMembers = initialTeamMembers;
  }
  if (initialCurrentUser !== undefined) {
    settings.currentUser = initialCurrentUser;
  }
  const original = vscode.workspace.getConfiguration;
  const workspace = vscode.workspace as unknown as {
    getConfiguration: typeof vscode.workspace.getConfiguration;
  };
  workspace.getConfiguration = ((section?: string) => {
    if (section !== 'devMateKit.jira') {
      return original.call(vscode.workspace, section);
    }
    return {
      get: (key: string, defaultValue: unknown) => settings[key] ?? defaultValue,
      update: async (key: string, value: unknown) => {
        settings[key] = value;
      },
    } as unknown as vscode.WorkspaceConfiguration;
  }) as typeof vscode.workspace.getConfiguration;

  return {
    settings,
    restore: () => {
      workspace.getConfiguration = original;
    },
  };
}

function fakeConnectionStore(savedConnection: JiraConnection | undefined): JiraConnectionStore {
  return { getConnection: async () => savedConnection } as unknown as JiraConnectionStore;
}

const fakeConnectionService = {} as unknown as McpConnectionService;

suite('JiraConfigStore', () => {
  let restoreConfiguration: (() => void) | undefined;
  let originalValidateQuery: typeof AtlassianMcpAdapter.validateQuery;

  setup(() => {
    originalValidateQuery = AtlassianMcpAdapter.validateQuery;
  });

  teardown(() => {
    restoreConfiguration?.();
    restoreConfiguration = undefined;
    AtlassianMcpAdapter.validateQuery = originalValidateQuery;
  });

  test('addQuery_emptyLabel_returnsFailure', async () => {
    const configuration = stubConfiguration();
    restoreConfiguration = configuration.restore;
    AtlassianMcpAdapter.validateQuery = async () => ({ ok: true });
    const store = new JiraConfigStore(fakeConnectionStore(connection), fakeConnectionService);

    assert.deepStrictEqual(await store.addQuery('  ', 'project = DEMO'), {
      ok: false,
      reason: 'Label is required.',
    });
  });

  test('addQuery_appendsToExistingQueries', async () => {
    const configuration = stubConfiguration([{ label: 'Backlog', jql: 'project = DEMO' }]);
    restoreConfiguration = configuration.restore;
    AtlassianMcpAdapter.validateQuery = async () => ({ ok: true });
    const store = new JiraConfigStore(fakeConnectionStore(connection), fakeConnectionService);

    assert.deepStrictEqual(await store.addQuery('In Progress', 'status = "In Progress"'), { ok: true });
    assert.deepStrictEqual(configuration.settings.savedQueries, [
      { label: 'Backlog', jql: 'project = DEMO' },
      { label: 'In Progress', jql: 'status = "In Progress"' },
    ]);
  });

  test('addQuery_rejectsDuplicateLabel_caseInsensitive', async () => {
    const configuration = stubConfiguration([{ label: 'Backlog', jql: 'project = DEMO' }]);
    restoreConfiguration = configuration.restore;
    AtlassianMcpAdapter.validateQuery = async () => ({ ok: true });
    const store = new JiraConfigStore(fakeConnectionStore(connection), fakeConnectionService);

    assert.deepStrictEqual(await store.addQuery('backlog', 'project = OTHER'), {
      ok: false,
      reason: 'A saved query with this label already exists.',
    });
    assert.deepStrictEqual(configuration.settings.savedQueries, [
      { label: 'Backlog', jql: 'project = DEMO' },
    ]);
  });

  test('addQuery_validQuery_callsAdapterWithSiteId', async () => {
    const configuration = stubConfiguration();
    restoreConfiguration = configuration.restore;
    const calls: Array<{ connectionService: McpConnectionService; siteId: string; jql: string }> = [];
    AtlassianMcpAdapter.validateQuery = async (connectionService, siteId, jql) => {
      calls.push({ connectionService, siteId, jql });
      return { ok: true };
    };
    const store = new JiraConfigStore(fakeConnectionStore(connection), fakeConnectionService);

    await store.addQuery('Backlog', 'project = DEMO');

    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].connectionService, fakeConnectionService);
    assert.strictEqual(calls[0].siteId, 'cloud-1');
    assert.strictEqual(calls[0].jql, 'project = DEMO');
  });

  test('addQuery_adapterRejectsQuery_returnsFailureReason', async () => {
    const configuration = stubConfiguration();
    restoreConfiguration = configuration.restore;
    AtlassianMcpAdapter.validateQuery = async () => ({ ok: false, reason: 'Invalid JQL' });
    const store = new JiraConfigStore(fakeConnectionStore(connection), fakeConnectionService);

    assert.deepStrictEqual(await store.addQuery('Backlog', 'invalid'), {
      ok: false,
      reason: 'Invalid JQL',
    });
    assert.deepStrictEqual(configuration.settings.savedQueries, []);
  });

  test('removeQuery_removesOnlyTheMatchingSavedQuery', async () => {
    const configuration = stubConfiguration([
      { label: 'Backlog', jql: 'project = DEMO' },
      { label: 'In Progress', jql: 'status = "In Progress"' },
    ]);
    restoreConfiguration = configuration.restore;
    const store = new JiraConfigStore(fakeConnectionStore(connection), fakeConnectionService);

    await store.removeQuery('backlog');

    assert.deepStrictEqual(configuration.settings.savedQueries, [
      { label: 'In Progress', jql: 'status = "In Progress"' },
    ]);
  });

  test('updateQuery_renamesAndChangesJql', async () => {
    const configuration = stubConfiguration([
      { label: 'Backlog', jql: 'project = DEMO' },
      { label: 'In Progress', jql: 'status = "In Progress"' },
    ]);
    restoreConfiguration = configuration.restore;
    AtlassianMcpAdapter.validateQuery = async () => ({ ok: true });
    const store = new JiraConfigStore(fakeConnectionStore(connection), fakeConnectionService);

    assert.deepStrictEqual(await store.updateQuery('Backlog', 'Open Backlog', 'project = DEMO2'), { ok: true });
    assert.deepStrictEqual(configuration.settings.savedQueries, [
      { label: 'Open Backlog', jql: 'project = DEMO2' },
      { label: 'In Progress', jql: 'status = "In Progress"' },
    ]);
  });

  test('updateQuery_rejectsWhenOriginalLabelMissing', async () => {
    const configuration = stubConfiguration([{ label: 'Backlog', jql: 'project = DEMO' }]);
    restoreConfiguration = configuration.restore;
    AtlassianMcpAdapter.validateQuery = async () => ({ ok: true });
    const store = new JiraConfigStore(fakeConnectionStore(connection), fakeConnectionService);

    assert.deepStrictEqual(await store.updateQuery('Missing', 'Renamed', 'project = DEMO'), {
      ok: false,
      reason: 'This saved query no longer exists.',
    });
  });

  test('updateQuery_rejectsRenameCollidingWithAnotherQuery', async () => {
    const configuration = stubConfiguration([
      { label: 'Backlog', jql: 'project = DEMO' },
      { label: 'In Progress', jql: 'status = "In Progress"' },
    ]);
    restoreConfiguration = configuration.restore;
    AtlassianMcpAdapter.validateQuery = async () => ({ ok: true });
    const store = new JiraConfigStore(fakeConnectionStore(connection), fakeConnectionService);

    assert.deepStrictEqual(await store.updateQuery('Backlog', 'in progress', 'project = DEMO'), {
      ok: false,
      reason: 'A saved query with this label already exists.',
    });
    assert.deepStrictEqual(configuration.settings.savedQueries, [
      { label: 'Backlog', jql: 'project = DEMO' },
      { label: 'In Progress', jql: 'status = "In Progress"' },
    ]);
  });

  test('JiraConfigStore_addQuery_rejectsEmptyJql', async () => {
    const configuration = stubConfiguration();
    restoreConfiguration = configuration.restore;
    AtlassianMcpAdapter.validateQuery = async () => ({ ok: true });
    const store = new JiraConfigStore(fakeConnectionStore(connection), fakeConnectionService);

    assert.deepStrictEqual(await store.addQuery('Backlog', '  '), {
      ok: false,
      reason: 'JQL is required.',
    });
  });

  test('JiraConfigStore_addQuery_rejectsWhenNoConnectionSaved', async () => {
    const configuration = stubConfiguration();
    restoreConfiguration = configuration.restore;
    AtlassianMcpAdapter.validateQuery = async () => ({ ok: true });
    const store = new JiraConfigStore(fakeConnectionStore(undefined), fakeConnectionService);

    assert.deepStrictEqual(await store.addQuery('Backlog', 'project = DEMO'), {
      ok: false,
      reason: 'Save a Jira connection first.',
    });
  });

  test('JiraConfigStore_addQuery_persistsOnSuccess', async () => {
    const configuration = stubConfiguration();
    restoreConfiguration = configuration.restore;
    AtlassianMcpAdapter.validateQuery = async () => ({ ok: true });
    const store = new JiraConfigStore(fakeConnectionStore(connection), fakeConnectionService);

    assert.deepStrictEqual(await store.addQuery('  Backlog  ', 'project = DEMO'), { ok: true });
    assert.deepStrictEqual(configuration.settings.savedQueries, [
      { label: 'Backlog', jql: 'project = DEMO' },
    ]);
  });

  test('JiraConfigStore_getSavedQueries_returnsEmptyArray_whenNothingSaved', () => {
    const configuration = stubConfiguration();
    restoreConfiguration = configuration.restore;
    const store = new JiraConfigStore(fakeConnectionStore(connection), fakeConnectionService);

    assert.deepStrictEqual(store.getSavedQueries(), []);
  });

  test('JiraConfigStore_getSavedQueries_returnsAllSavedQueries', () => {
    const configuration = stubConfiguration([
      { label: 'Backlog', jql: 'project = DEMO' },
      { label: 'In Progress', jql: 'status = "In Progress"' },
    ]);
    restoreConfiguration = configuration.restore;
    const store = new JiraConfigStore(fakeConnectionStore(connection), fakeConnectionService);

    assert.deepStrictEqual(store.getSavedQueries(), [
      { label: 'Backlog', jql: 'project = DEMO' },
      { label: 'In Progress', jql: 'status = "In Progress"' },
    ]);
  });

  test('getTeamMembers_returnsEmptyWhenUnset', () => {
    const configuration = stubConfiguration();
    restoreConfiguration = configuration.restore;
    const store = new JiraConfigStore(fakeConnectionStore(connection), fakeConnectionService);

    assert.deepStrictEqual(store.getTeamMembers(), []);
  });

  test('addTeamMember_trimsAndPersists', async () => {
    const configuration = stubConfiguration();
    restoreConfiguration = configuration.restore;
    const store = new JiraConfigStore(fakeConnectionStore(connection), fakeConnectionService);

    assert.deepStrictEqual(await store.addTeamMember('  Alex Smith  '), { ok: true });
    assert.deepStrictEqual(configuration.settings.teamMembers, ['Alex Smith']);
  });

  test('addTeamMember_rejectsBlank', async () => {
    const configuration = stubConfiguration();
    restoreConfiguration = configuration.restore;
    const store = new JiraConfigStore(fakeConnectionStore(connection), fakeConnectionService);

    assert.deepStrictEqual(await store.addTeamMember('  '), {
      ok: false,
      reason: 'Display name is required.',
    });
    assert.strictEqual(configuration.settings.teamMembers, undefined);
  });

  test('addTeamMember_rejectsCaseInsensitiveDuplicate', async () => {
    const configuration = stubConfiguration([], ['Alex Smith']);
    restoreConfiguration = configuration.restore;
    const store = new JiraConfigStore(fakeConnectionStore(connection), fakeConnectionService);

    assert.deepStrictEqual(await store.addTeamMember('alex smith'), {
      ok: false,
      reason: 'This team member already exists.',
    });
    assert.deepStrictEqual(configuration.settings.teamMembers, ['Alex Smith']);
  });

  test('addTeamMember_rejectsCurrentUser', async () => {
    const configuration = stubConfiguration([], [], 'Alex Smith');
    restoreConfiguration = configuration.restore;
    const store = new JiraConfigStore(fakeConnectionStore(connection), fakeConnectionService);

    assert.deepStrictEqual(await store.addTeamMember(' alex smith '), {
      ok: false,
      reason: 'The current user cannot be added as a team member.',
    });
    assert.deepStrictEqual(configuration.settings.teamMembers, []);
  });

  test('setCurrentUser_rejectsExistingTeammate_withoutMutation', async () => {
    const configuration = stubConfiguration([], ['Alex Smith'], 'Taylor');
    restoreConfiguration = configuration.restore;
    const store = new JiraConfigStore(fakeConnectionStore(connection), fakeConnectionService);

    assert.deepStrictEqual(await store.setCurrentUser(' alex smith '), {
      ok: false,
      reason: 'The current user cannot also be a team member.',
    });
    assert.strictEqual(configuration.settings.currentUser, 'Taylor');
    assert.deepStrictEqual(configuration.settings.teamMembers, ['Alex Smith']);
  });

  test('setCurrentUser_emptyClears', async () => {
    const configuration = stubConfiguration([], [], 'Taylor');
    restoreConfiguration = configuration.restore;
    const store = new JiraConfigStore(fakeConnectionStore(connection), fakeConnectionService);

    assert.deepStrictEqual(await store.setCurrentUser('  '), { ok: true });
    assert.strictEqual(configuration.settings.currentUser, '');
  });

  test('removeTeamMember_matchesCaseInsensitively', async () => {
    const configuration = stubConfiguration([], ['Alex Smith', 'Taylor']);
    restoreConfiguration = configuration.restore;
    const store = new JiraConfigStore(fakeConnectionStore(connection), fakeConnectionService);

    await store.removeTeamMember(' alex smith ');

    assert.deepStrictEqual(configuration.settings.teamMembers, ['Taylor']);
  });
});
