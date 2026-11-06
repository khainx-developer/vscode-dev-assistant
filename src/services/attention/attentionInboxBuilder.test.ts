import * as assert from 'assert';
import { buildAttentionInbox } from './attentionInboxBuilder';
import type { CommentAttentionSummary, ProviderCommentCandidate } from './commentAttention';
import type {
  AttentionItem,
  AttentionReason as GitHubAttentionReason,
  GitHubAttentionResult,
  GitHubViewState,
  PullRequestSummary,
} from '../../shared/githubTypes';
import type { JiraTask, JiraViewState } from '../../shared/jiraTypes';

const NOW = new Date(2026, 9, 2, 12).getTime();
const ACTIVITY_OLDER = '2026-10-01T10:00:00.000Z';
const ACTIVITY_NEWER = '2026-10-02T10:00:00.000Z';
const ACTIVITY_STALE = '2026-09-25T10:00:00.000Z';

function makePreview(sourceKey: string, createdAt = ACTIVITY_NEWER): ProviderCommentCandidate {
  return {
    id: 'comment-1',
    sourceKey,
    authorIdentity: 'reviewer',
    bodyText: 'A new comment',
    createdAt,
    url: 'https://example.test/comment-1',
    isCurrentUser: false,
  };
}

function makeCommentAttention(
  sourceKey: string,
  unreadCount = 0,
  createdAt = ACTIVITY_NEWER,
): CommentAttentionSummary {
  return {
    unreadCount,
    latestUnreadAt: unreadCount === 0 ? null : Date.parse(createdAt),
    latestUnreadComment: unreadCount === 0 ? null : makePreview(sourceKey, createdAt),
  };
}

function makeTask(overrides: Partial<JiraTask> = {}): JiraTask {
  const key = overrides.key ?? 'APP-1';
  return {
    key,
    summary: `Task ${key}`,
    status: 'Open',
    assignee: 'me',
    dueDate: null,
    updatedAt: ACTIVITY_OLDER,
    commentSourceKey: `jira:cloud-1:${key}`,
    comments: [],
    commentAttention: makeCommentAttention(`jira:cloud-1:${key}`),
    commentState: 'available',
    url: `https://example.atlassian.net/browse/${key}`,
    prLink: { kind: 'not-available' },
    ...overrides,
  };
}

function makePR(overrides: Partial<PullRequestSummary> = {}): PullRequestSummary {
  return {
    repoKey: 'owner/repo',
    number: 1,
    title: 'PR',
    url: 'https://github.com/owner/repo/pull/1',
    author: 'me',
    state: 'OPEN',
    mergedAt: null,
    createdAt: ACTIVITY_OLDER,
    updatedAt: ACTIVITY_OLDER,
    labels: [],
    checkStatus: null,
    mergeable: 'MERGEABLE',
    reviews: [],
    comments: [],
    requestedReviewers: [],
    ...overrides,
  };
}

function makeAttentionItem(
  pr: PullRequestSummary,
  reasons: GitHubAttentionReason[],
): AttentionItem {
  return {
    pr,
    reviewState: 'approved',
    reasons,
  };
}

function makeJiraState(tasks: JiraTask[], teamMembers: string[] = []): JiraViewState {
  return {
    connected: true,
    siteUrl: 'https://example.atlassian.net',
    currentUser: 'me',
    teamMembers,
    savedQueries: [],
    tasksByQuery: { Watched: tasks },
    failures: [],
    lastRefreshAt: null,
    isRefreshing: false,
    pendingOperations: {},
  };
}

function makeGitHubState(options: {
  attentionInbox?: AttentionItem[];
  myPRs?: AttentionItem[];
  teamPRs?: AttentionItem[];
  commentAttentionBySource?: Record<string, CommentAttentionSummary>;
} = {}): GitHubViewState {
  const attention: GitHubAttentionResult = {
    myPRs: options.myPRs ?? [],
    teamPRs: options.teamPRs ?? [],
    attentionInbox: options.attentionInbox ?? [],
  };
  return {
    authenticated: true,
    me: 'me',
    monitoredRepos: [],
    monitoredAuthors: [],
    attention,
    commentAttentionBySource: options.commentAttentionBySource ?? {},
    commentStatusBySource: {},
    pendingOperations: {},
    failures: [],
    lastRefreshAt: null,
    isRefreshing: false,
  };
}

suite('buildAttentionInbox', () => {
  test('buildAttentionInbox_includesJiraReviewReason', () => {
    const inbox = buildAttentionInbox(
      makeJiraState([makeTask({ status: 'Review' })]),
      makeGitHubState(),
      NOW,
    );

    assert.deepStrictEqual(inbox.map((item) => item.reasons), [['jira-review']]);
    assert.strictEqual(inbox[0].priority, 3);
  });

  test('buildAttentionInbox_jiraReviewPastStaleThreshold_escalatesToStaleAndPriority1', () => {
    const inbox = buildAttentionInbox(
      makeJiraState([makeTask({ status: 'Review', updatedAt: ACTIVITY_STALE })]),
      makeGitHubState(),
      NOW,
    );

    assert.deepStrictEqual(inbox.map((item) => item.reasons), [['jira-review', 'jira-stale']]);
    assert.strictEqual(inbox[0].priority, 1);
  });

  test('buildAttentionInbox_excludesUnmonitoredJiraTickets', () => {
    const task = makeTask({ assignee: 'Unmonitored', status: 'Review' });
    const jiraState = {
      ...makeJiraState([task], ['Alex Smith']),
    };

    const inbox = buildAttentionInbox(jiraState, makeGitHubState(), NOW);

    assert.deepStrictEqual(inbox, []);
  });

  test('buildAttentionInbox_includesJiraTicketAcrossAnySavedQuery_whenAssigneeIsMonitored', () => {
    const task = makeTask({ assignee: 'Alex Smith', status: 'Review' });
    const jiraState = {
      ...makeJiraState([]),
      teamMembers: ['Alex Smith'],
      tasksByQuery: { 'Team backlog': [task] },
    };

    const inbox = buildAttentionInbox(jiraState, makeGitHubState(), NOW);

    assert.deepStrictEqual(inbox.map((item) => item.reasons), [['jira-review']]);
  });

  test('buildAttentionInbox_excludesJiraTasksWhenNotConnected', () => {
    const task = makeTask({ status: 'Review' });
    const jiraState = { ...makeJiraState([task]), connected: false };

    const inbox = buildAttentionInbox(jiraState, makeGitHubState(), NOW);

    assert.deepStrictEqual(inbox, []);
  });

  test('buildAttentionInbox_classifiesDueDateReasonsByCalendarDay', () => {
    const inbox = buildAttentionInbox(
      makeJiraState([
        makeTask({ key: 'APP-OVERDUE', dueDate: '2026-10-01' }),
        makeTask({ key: 'APP-TODAY', dueDate: '2026-10-02' }),
        makeTask({ key: 'APP-TOMORROW', dueDate: '2026-10-03' }),
        makeTask({ key: 'APP-INVALID', dueDate: 'not-a-date' }),
      ]),
      makeGitHubState(),
      NOW,
    );

    assert.deepStrictEqual(inbox.map((item) => item.reasons), [
      ['jira-overdue'],
      ['jira-due-today'],
      ['jira-due-tomorrow'],
    ]);
    assert.deepStrictEqual(inbox.map((item) => item.priority), [1, 4, 4]);
  });

  test('buildAttentionInbox_includesJiraUnreadCommentPreview', () => {
    const task = makeTask({
      commentAttention: makeCommentAttention('jira:cloud-1:APP-1', 1),
    });

    const inbox = buildAttentionInbox(makeJiraState([task]), makeGitHubState(), NOW);

    assert.strictEqual(inbox[0].reasons.includes('jira-unread-comment'), true);
    assert.strictEqual(inbox[0].jiraUnreadCount, 1);
    assert.strictEqual(inbox[0].jiraLatestUnreadComment?.id, 'comment-1');
  });

  test('buildAttentionInbox_excludesReadJiraComments', () => {
    const task = makeTask({
      comments: [{
        id: 'jira-comment-1',
        author: 'Alex Smith',
        body: 'Please review this change.',
        createdAt: ACTIVITY_NEWER,
        visibility: null,
        url: 'https://example.atlassian.net/browse/APP-1?focusedCommentId=1',
      }],
    });

    const inbox = buildAttentionInbox(makeJiraState([task]), makeGitHubState(), NOW);

    assert.deepStrictEqual(inbox, []);
  });

  test('buildAttentionInbox_includesMyReadyAndDraftPRsAndOnlyReadyTeamPRs', () => {
    const myReadyPR = makePR({ number: 20, title: 'APP-20 Ready PR', draft: false });
    const myDraftPR = makePR({ number: 21, title: 'APP-21 Draft PR', draft: true });
    const teamReadyPR = makePR({
      number: 22,
      author: 'teammate',
      title: 'APP-22 Team ready PR',
      draft: false,
    });
    const teamDraftPR = makePR({
      number: 23,
      author: 'teammate',
      title: 'APP-23 Team draft PR',
      draft: true,
    });
    const tasks = [20, 21, 22, 23].map((number) =>
      makeTask({ key: `APP-${number}` }),
    );

    const inbox = buildAttentionInbox(
      makeJiraState(tasks),
      makeGitHubState({
        myPRs: [makeAttentionItem(myReadyPR, []), makeAttentionItem(myDraftPR, [])],
        teamPRs: [makeAttentionItem(teamReadyPR, []), makeAttentionItem(teamDraftPR, [])],
      }),
      NOW,
    );

    assert.deepStrictEqual(
      inbox.map((item) => item.jiraTask?.key).sort(),
      ['APP-20', 'APP-21', 'APP-22'],
    );
    assert.deepStrictEqual(inbox.map((item) => item.reasons), [
      ['pr-linked'],
      ['pr-linked'],
      ['pr-linked'],
    ]);
  });

  test('buildAttentionInbox_excludesReadStandalonePRComments', () => {
    const pr = makePR({
      number: 18,
      comments: [{
        id: 'pr-comment-1',
        author: 'teammate',
        body: 'Please review this change.',
        createdAt: ACTIVITY_NEWER,
        url: 'https://github.com/owner/repo/pull/18#issuecomment-1',
      }],
    });

    const inbox = buildAttentionInbox(
      makeJiraState([]),
      makeGitHubState({ myPRs: [makeAttentionItem(pr, [])] }),
      NOW,
    );

    assert.deepStrictEqual(inbox, []);
  });

  test('buildAttentionInbox_combinesMonitoredLinkedJiraAndPR', () => {
    const pr = makePR({ repoKey: 'owner/repo', number: 12 });
    const task = makeTask({
      key: 'APP-12',
      status: 'Review',
      prLink: { kind: 'linked', pr },
    });
    const githubSourceKey = `github:${pr.repoKey}#${pr.number}`;

    const inbox = buildAttentionInbox(
      makeJiraState([task]),
      makeGitHubState({
        myPRs: [makeAttentionItem(pr, ['pr-changes-requested'])],
        attentionInbox: [makeAttentionItem(pr, ['pr-changes-requested'])],
        commentAttentionBySource: {
          [githubSourceKey]: makeCommentAttention(githubSourceKey, 1),
        },
      }),
      NOW,
    );

    assert.strictEqual(inbox.length, 1);
    assert.strictEqual(inbox[0].jiraTask?.key, 'APP-12');
    assert.deepStrictEqual(inbox[0].relatedPRs.map((item) => item.pr.number), [12]);
    assert.deepStrictEqual(inbox[0].reasons, [
      'jira-review',
      'pr-changes-requested',
      'pr-unread-comment',
    ]);
    assert.strictEqual(inbox[0].key, `jira:cloud-1:APP-12|${githubSourceKey}`);
  });

  test('buildAttentionInbox_combinesTeamJiraTicketAndLinkedPRComments', () => {
    const pr = makePR({ author: 'teammate', repoKey: 'owner/repo', number: 16 });
    const jiraSourceKey = 'jira:cloud-1:APP-16';
    const githubSourceKey = `github:${pr.repoKey}#${pr.number}`;
    const task = makeTask({
      key: 'APP-16',
      assignee: 'Alex Smith',
      commentAttention: makeCommentAttention(jiraSourceKey, 1),
      prLink: { kind: 'linked', pr },
    });

    const inbox = buildAttentionInbox(
      makeJiraState([task], ['Alex Smith']),
      makeGitHubState({
        teamPRs: [makeAttentionItem(pr, ['pr-unread-comment'])],
        attentionInbox: [makeAttentionItem(pr, ['pr-unread-comment'])],
        commentAttentionBySource: {
          [githubSourceKey]: makeCommentAttention(githubSourceKey, 1),
        },
      }),
      NOW,
    );

    assert.strictEqual(inbox.length, 1);
    assert.strictEqual(inbox[0].jiraTask?.assignee, 'Alex Smith');
    assert.deepStrictEqual(inbox[0].relatedPRs.map((item) => item.pr.number), [16]);
    assert.deepStrictEqual(inbox[0].reasons, ['jira-unread-comment', 'pr-unread-comment']);
  });

  test('buildAttentionInbox_groupsAttentionPRByJiraKeyWhenAnotherPRIsTheCachedLink', () => {
    const cachedPR = makePR({
      number: 1748,
      title: 'PM-33692 Update attachment rules',
      updatedAt: ACTIVITY_OLDER,
    });
    const attentionPR = makePR({
      number: 1738,
      author: 'teammate',
      title: 'PM-33692 Update attachment rules',
      updatedAt: ACTIVITY_NEWER,
    });
    const task = makeTask({
      key: 'PM-33692',
      prLink: { kind: 'linked', pr: cachedPR },
    });

    const inbox = buildAttentionInbox(
      makeJiraState([task]),
      makeGitHubState({
        myPRs: [makeAttentionItem(cachedPR, [])],
        teamPRs: [makeAttentionItem(attentionPR, ['pr-needs-my-review'])],
        attentionInbox: [makeAttentionItem(attentionPR, ['pr-needs-my-review'])],
      }),
      NOW,
    );

    assert.strictEqual(inbox.length, 1);
    assert.strictEqual(inbox[0].jiraTask?.key, 'PM-33692');
    assert.deepStrictEqual(inbox[0].relatedPRs.map((item) => item.pr.number), [1738, 1748]);
    assert.deepStrictEqual(inbox[0].relatedPRs.map((item) => item.pr.author), ['teammate', 'me']);
    assert.deepStrictEqual(inbox[0].reasons, ['pr-needs-my-review']);
  });

  test('buildAttentionInbox_doesNotShowUnmonitoredLinkedPR', () => {
    const pr = makePR({ author: 'unmonitored', number: 19 });
    const task = makeTask({
      assignee: 'Alex Smith',
      status: 'Review',
      prLink: { kind: 'linked', pr },
    });

    const inbox = buildAttentionInbox(
      makeJiraState([task], ['Alex Smith']),
      makeGitHubState(),
      NOW,
    );

    assert.strictEqual(inbox.length, 1);
    assert.strictEqual(inbox[0].jiraTask?.key, 'APP-1');
    assert.strictEqual(inbox[0].pr, undefined);
  });

  test('buildAttentionInbox_deduplicatesIssueAcrossSavedQueries', () => {
    const task = makeTask({ key: 'APP-15', status: 'Review' });
    const jiraState = {
      ...makeJiraState([]),
      tasksByQuery: { First: [task], Second: [{ ...task }] },
    };

    const inbox = buildAttentionInbox(jiraState, makeGitHubState(), NOW);

    assert.strictEqual(inbox.length, 1);
    assert.strictEqual(inbox[0].jiraTask?.key, 'APP-15');
  });

  test('buildAttentionInbox_unmonitoredLinkedPRRemainsStandalone', () => {
    const pr = makePR({ repoKey: 'owner/repo', number: 13 });

    const inbox = buildAttentionInbox(
      makeJiraState([]),
      makeGitHubState({ attentionInbox: [makeAttentionItem(pr, ['pr-needs-my-review'])] }),
      NOW,
    );

    assert.strictEqual(inbox.length, 1);
    assert.strictEqual(inbox[0].jiraTask, undefined);
    assert.strictEqual(inbox[0].pr?.number, 13);
    assert.deepStrictEqual(inbox[0].reasons, ['pr-needs-my-review']);
  });

  test('buildAttentionInbox_keepsStandaloneActionablePR', () => {
    const pr = makePR({ repoKey: 'owner/repo', number: 14 });

    const inbox = buildAttentionInbox(
      makeJiraState([makeTask({ key: 'APP-14' })]),
      makeGitHubState({ attentionInbox: [makeAttentionItem(pr, ['pr-checks-failing'])] }),
      NOW,
    );

    assert.strictEqual(inbox.length, 1);
    assert.strictEqual(inbox[0].pr?.number, 14);
    assert.strictEqual(inbox[0].jiraTask, undefined);
  });

  test('buildAttentionInbox_keepsItemWhileAnyReasonRemains', () => {
    const pr = makePR();
    const before = buildAttentionInbox(
      makeJiraState([]),
      makeGitHubState({ attentionInbox: [makeAttentionItem(pr, ['pr-changes-requested', 'pr-unread-comment'])] }),
      NOW,
    );
    const after = buildAttentionInbox(
      makeJiraState([]),
      makeGitHubState({ attentionInbox: [makeAttentionItem(pr, ['pr-changes-requested'])] }),
      NOW,
    );

    assert.strictEqual(before.length, 1);
    assert.deepStrictEqual(after[0].reasons, ['pr-changes-requested']);
  });

  test('buildAttentionInbox_ordersActivityByNewestRelevantTimestamp', () => {
    const olderPR = makePR({ repoKey: 'a/repo', number: 1, updatedAt: ACTIVITY_OLDER });
    const newerPR = makePR({ repoKey: 'z/repo', number: 2, updatedAt: ACTIVITY_NEWER });

    const inbox = buildAttentionInbox(
      makeJiraState([]),
      makeGitHubState({
        attentionInbox: [
          makeAttentionItem(olderPR, ['pr-unread-comment']),
          makeAttentionItem(newerPR, ['pr-unread-comment']),
        ],
      }),
      NOW,
    );

    assert.deepStrictEqual(inbox.map((item) => item.pr?.number), [2, 1]);
  });

  test('buildAttentionInbox_ordersDueItemsByNearestDate', () => {
    const inbox = buildAttentionInbox(
      makeJiraState([
        makeTask({ key: 'APP-LATER', dueDate: '2026-10-03' }),
        makeTask({ key: 'APP-SOONER', dueDate: '2026-10-02' }),
      ]),
      makeGitHubState(),
      NOW,
    );

    assert.deepStrictEqual(inbox.map((item) => item.jiraTask?.key), ['APP-SOONER', 'APP-LATER']);
  });

  test('buildAttentionInbox_keepsMyPRsIndependentFromInbox', () => {
    const pr = makePR({ author: 'me', state: 'OPEN' });

    const inbox = buildAttentionInbox(
      makeJiraState([]),
      makeGitHubState({ myPRs: [makeAttentionItem(pr, [])], attentionInbox: [] }),
      NOW,
    );

    assert.deepStrictEqual(inbox, []);
  });

  test('buildAttentionInbox_passesThroughMergeConflictAndStaleReasons_andEscalatesPriority', () => {
    const pr = makePR({ repoKey: 'owner/repo', number: 20 });

    const inbox = buildAttentionInbox(
      makeJiraState([]),
      makeGitHubState({ attentionInbox: [makeAttentionItem(pr, ['pr-merge-conflict', 'pr-stale'])] }),
      NOW,
    );

    assert.strictEqual(inbox.length, 1);
    assert.deepStrictEqual(inbox[0].reasons, ['pr-merge-conflict', 'pr-stale']);
    assert.strictEqual(inbox[0].priority, 1);
  });
});
