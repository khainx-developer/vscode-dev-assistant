import * as assert from 'assert';
import type { AttentionInboxItem } from '../attention/attentionInboxBuilder';
import type { AnalysisSnapshotEntry, AnalysisView } from '../../shared/messages';
import {
  NEXT_ACTIONS_DEFAULT_LIMIT,
  buildNextActions,
  limitNextActions,
  type NextActionRow,
} from './nextActions';

function item(overrides: Partial<AttentionInboxItem> & { key: string }): AttentionInboxItem {
  return {
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
    ...overrides,
  };
}

function view(actions: AnalysisView['actions']): AnalysisView {
  return {
    itemKey: 'x',
    stateHash: 'h',
    situation: 's',
    confidence: 'medium',
    analyzedAt: '2026-11-28T00:00:00.000Z',
    actions,
  };
}

function ready(
  actions: AnalysisView['actions'],
  actionStatus: Record<string, 'open' | 'progress' | 'done' | 'dropped'> = {},
): AnalysisSnapshotEntry {
  return { status: 'ready', analysis: view(actions), actionStatus };
}

suite('buildNextActions', () => {
  test('skipsStaleDoneDroppedNoneAndMissing', () => {
    const items = [
      item({
        key: 'ready',
        priority: 1,
        pr: {
          repoKey: 'acme/web',
          number: 1,
          title: 'Ready PR',
          url: 'u',
          author: 'a',
          state: 'OPEN',
          mergedAt: null,
          createdAt: '2026-11-01T00:00:00Z',
          updatedAt: '2026-11-28T00:00:00Z',
          labels: [],
          checkStatus: 'FAILURE',
          checkConclusions: {},
          headSha: 'a',
          mergeable: 'MERGEABLE',
          reviews: [],
          comments: [],
          requestedReviewers: [],
        },
      }),
      item({ key: 'stale', priority: 1 }),
      item({ key: 'missing', priority: 1 }),
    ];
    const analysisByKey: Record<string, AnalysisSnapshotEntry | undefined> = {
      ready: ready(
        [
          { kind: 'fix-ci', actionKey: 'fix-ci:check:test', title: 'Fix CI' },
          { kind: 'decide', actionKey: 'decide:', title: 'Done decide' },
          { kind: 'reply', actionKey: 'reply:c1', title: 'Dropped reply' },
          { kind: 'none', actionKey: 'none:', title: 'Nothing' },
        ],
        {
          'decide:': 'done',
          'reply:c1': 'dropped',
        },
      ),
      stale: {
        status: 'stale',
        analysis: view([{ kind: 'fix-ci', actionKey: 'fix-ci:check:x', title: 'Stale CI' }]),
        actionStatus: {},
      },
    };

    const rows = buildNextActions({ items, analysisByKey });
    assert.deepStrictEqual(rows.map((row) => row.actionKey), ['fix-ci:check:test']);
    assert.strictEqual(rows[0]?.itemDisplayKey, 'acme/web#1');
    assert.strictEqual(rows[0]?.itemTitle, 'Ready PR');
  });

  test('sortsByPriorityThenKindThenRecency', () => {
    const items = [
      item({
        key: 'p2',
        priority: 2,
        latestRelevantAt: '2026-11-28T12:00:00Z',
        jiraTask: {
          key: 'WEB-2',
          summary: 'P2 ticket',
          url: 'u',
          status: 'In Progress',
          assignee: null,
          dueDate: null,
          updatedAt: '2026-11-28T12:00:00Z',
          prLink: { kind: 'not-available' },
        },
      }),
      item({
        key: 'p1-old',
        priority: 1,
        latestRelevantAt: '2026-11-20T00:00:00Z',
        pr: {
          repoKey: 'acme/web',
          number: 10,
          title: 'Old urgent',
          url: 'u',
          author: 'a',
          state: 'OPEN',
          mergedAt: null,
          createdAt: '2026-11-01T00:00:00Z',
          updatedAt: '2026-11-20T00:00:00Z',
          labels: [],
          checkStatus: null,
          checkConclusions: {},
          headSha: 'a',
          mergeable: 'MERGEABLE',
          reviews: [],
          comments: [],
          requestedReviewers: [],
        },
      }),
      item({
        key: 'p1-new',
        priority: 1,
        latestRelevantAt: '2026-11-28T18:00:00Z',
        pr: {
          repoKey: 'acme/web',
          number: 11,
          title: 'New urgent',
          url: 'u',
          author: 'a',
          state: 'OPEN',
          mergedAt: null,
          createdAt: '2026-11-01T00:00:00Z',
          updatedAt: '2026-11-28T18:00:00Z',
          labels: [],
          checkStatus: null,
          checkConclusions: {},
          headSha: 'b',
          mergeable: 'MERGEABLE',
          reviews: [],
          comments: [],
          requestedReviewers: [],
        },
      }),
    ];

    const analysisByKey: Record<string, AnalysisSnapshotEntry> = {
      'p2': ready([{ kind: 'fix-ci', actionKey: 'fix-ci:check:a', title: 'P2 CI' }]),
      'p1-old': ready([
        { kind: 'reply', actionKey: 'reply:c1', title: 'Old reply' },
        { kind: 'fix-ci', actionKey: 'fix-ci:check:b', title: 'Old CI' },
      ]),
      'p1-new': ready([
        { kind: 'code-change', actionKey: 'code-change:t1', title: 'New code' },
        { kind: 'fix-ci', actionKey: 'fix-ci:check:c', title: 'New CI' },
      ]),
    };

    const rows = buildNextActions({ items, analysisByKey });
    assert.deepStrictEqual(rows.map((row) => `${row.itemKey}:${row.kind}`), [
      'p1-new:fix-ci',
      'p1-old:fix-ci',
      'p1-new:code-change',
      'p1-old:reply',
      'p2:fix-ci',
    ]);
  });

  test('keepsProgressAsOpenForList', () => {
    const items = [item({
      key: 'k',
      pr: {
        repoKey: 'acme/web',
        number: 3,
        title: 'PR',
        url: 'u',
        author: 'a',
        state: 'OPEN',
        mergedAt: null,
        createdAt: '2026-11-01T00:00:00Z',
        updatedAt: '2026-11-28T00:00:00Z',
        labels: [],
        checkStatus: 'FAILURE',
        checkConclusions: {},
        headSha: 'a',
        mergeable: 'MERGEABLE',
        reviews: [],
        comments: [],
        requestedReviewers: [],
      },
    })];
    const rows = buildNextActions({
      items,
      analysisByKey: {
        k: ready(
          [{ kind: 'fix-ci', actionKey: 'fix-ci:check:test', title: 'Fix' }],
          { 'fix-ci:check:test': 'progress' },
        ),
      },
    });
    assert.strictEqual(rows.length, 1);
    assert.strictEqual(rows[0]?.status, 'progress');
  });
});

suite('limitNextActions', () => {
  test('capsAtDefaultEightWithShowAllFlag', () => {
    const rows = Array.from({ length: 10 }, (_, index) => ({
      itemKey: `k${index}`,
      itemDisplayKey: `K-${index}`,
      itemTitle: `T${index}`,
      itemPriority: 1,
      latestRelevantAt: null,
      actionIndex: 0,
      actionKey: `fix-ci:${index}`,
      kind: 'fix-ci' as const,
      title: `A${index}`,
      status: 'open' as const,
    })) satisfies NextActionRow[];

    const limited = limitNextActions(rows);
    assert.strictEqual(limited.total, 10);
    assert.strictEqual(limited.truncated, true);
    assert.strictEqual(limited.visible.length, NEXT_ACTIONS_DEFAULT_LIMIT);
    assert.strictEqual(limitNextActions(rows.slice(0, 3)).truncated, false);
  });
});
