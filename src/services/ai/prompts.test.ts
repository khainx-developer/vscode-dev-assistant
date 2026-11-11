import * as assert from 'assert';
import {
  MAX_CONTEXT_ITEMS,
  buildExplainItemPrompt,
  buildInboxContext,
  buildNextStepsPrompt,
  buildStandupPrompt,
  clip,
  redactSecrets,
} from './prompts';
import { buildStandupSnapshot } from './standupSnapshot';
import type { AttentionInboxItem } from '../attention/attentionInboxBuilder';
import type { GitHubViewState, PullRequestSummary } from '../../shared/githubTypes';
import type { JiraTask, JiraViewState } from '../../shared/jiraTypes';

const NOW = Date.parse('2026-11-11T09:00:00.000Z');

function pr(overrides: Partial<PullRequestSummary> = {}): PullRequestSummary {
  return {
    repoKey: 'acme/web',
    number: 42,
    title: 'Add login page',
    url: 'https://github.com/acme/web/pull/42?token=SHOULD_NOT_LEAK',
    author: 'alice',
    state: 'OPEN',
    mergedAt: null,
    createdAt: '2026-11-09T00:00:00.000Z',
    updatedAt: '2026-11-10T09:00:00.000Z',
    labels: [],
    checkStatus: 'FAILURE',
    mergeable: 'CONFLICTING',
    reviews: [],
    comments: [],
    requestedReviewers: ['me'],
    ...overrides,
  };
}

function task(overrides: Partial<JiraTask> = {}): JiraTask {
  return {
    key: 'WEB-7',
    summary: 'Login flow',
    status: 'In Progress',
    assignee: 'Jane Doe',
    dueDate: '2026-11-10',
    updatedAt: '2026-11-11T07:00:00.000Z',
    url: 'https://acme.atlassian.net/browse/WEB-7',
    prLink: { kind: 'no-match' },
    ...overrides,
  };
}

function item(index: number, overrides: Partial<AttentionInboxItem> = {}): AttentionInboxItem {
  return {
    key: `github:acme/web#${index}`,
    pr: pr({ number: index, title: `PR ${index}` }),
    relatedPRs: [],
    reasons: ['pr-checks-failing'],
    priority: 1,
    latestRelevantAt: null,
    jiraUnreadCount: 0,
    jiraLatestUnreadComment: null,
    prUnreadCount: 0,
    prLatestUnreadComment: null,
    ...overrides,
  };
}

suite('AI prompts', () => {
  test('inboxContext_usesReasonLabels_andKeys', () => {
    const context = buildInboxContext([item(42)], NOW);
    assert.match(context, /acme\/web#42 "PR 42"/);
    assert.match(context, /Checks failing/);
    assert.match(context, /has merge conflicts/);
  });

  test('inboxContext_capsItemCount', () => {
    const items = Array.from({ length: MAX_CONTEXT_ITEMS + 5 }, (_, index) => item(index + 1));
    const context = buildInboxContext(items, NOW);
    assert.match(context, new RegExp(`^${MAX_CONTEXT_ITEMS}\\. `, 'm'));
    assert.doesNotMatch(context, new RegExp(`^${MAX_CONTEXT_ITEMS + 1}\\. `, 'm'));
    assert.match(context, /5 lower-priority items omitted/);
  });

  test('prompts_neverIncludeUrlsOrTokens', () => {
    const withComment = item(1, {
      prLatestUnreadComment: {
        id: 'c1',
        sourceKey: 'github:acme/web#1',
        authorIdentity: 'bob',
        bodyText: 'Use ghp_abcdefghijklmnopqrstuvwxyz0123456789 and Bearer abcdefghijklmnopqrstuvwxyz',
        createdAt: '2026-11-11T08:00:00.000Z',
        url: 'https://github.com/acme/web/pull/1#comment',
        isCurrentUser: false,
      },
    });
    const prompt = buildNextStepsPrompt([withComment], NOW, { github: 'me', jira: null })[0].content;
    assert.doesNotMatch(prompt, /https?:\/\//);
    assert.doesNotMatch(prompt, /SHOULD_NOT_LEAK/);
    assert.doesNotMatch(prompt, /ghp_abcdef/);
    assert.doesNotMatch(prompt, /Bearer abcdef/);
    assert.match(prompt, /\[redacted\]/);
  });

  test('commentExcerpts_areTruncated', () => {
    const long = 'x'.repeat(1000);
    assert.ok(clip(long, 200).length <= 200);
    assert.ok(clip(long, 200).endsWith('…'));
  });

  test('redactSecrets_leavesNormalTextAlone', () => {
    assert.strictEqual(redactSecrets('Please rebase on main'), 'Please rebase on main');
  });

  test('nextStepsPrompt_asksForStartHereAndPlan', () => {
    const prompt = buildNextStepsPrompt([item(1)], NOW, { github: 'me', jira: 'Jane Doe' })[0].content;
    assert.match(prompt, /\*\*Start here:\*\*/);
    assert.match(prompt, /3 to 7 numbered bullets/);
    assert.match(prompt, /GitHub user "me" and Jira user "Jane Doe"/);
  });

  test('explainPrompt_includesFlagExplanations', () => {
    const prompt = buildExplainItemPrompt(item(9, { reasons: ['pr-merge-conflict'] }), NOW)[0].content;
    assert.match(prompt, /Merge conflict: The branch conflicts with its base branch\./);
    assert.match(prompt, /Suggested next step/);
  });

  test('standup_snapshotAndPrompt_haveYesterdayTodayBlockers', () => {
    const github = {
      authenticated: true,
      me: 'me',
      attention: {
        myPRs: [{ pr: pr({ author: 'me' }), reviewState: 'pending_review', reasons: [] }],
        teamPRs: [
          { pr: pr({ number: 5, requestedReviewers: ['me'] }), reviewState: 'pending_review', reasons: [] },
          { pr: pr({ number: 6, requestedReviewers: [] }), reviewState: 'pending_review', reasons: [] },
        ],
        attentionInbox: [],
      },
    } as unknown as GitHubViewState;
    const jira = {
      connected: true,
      currentUser: 'Jane Doe',
      tasksByQuery: { mine: [task(), task({ key: 'WEB-8', assignee: 'Someone Else' })] },
    } as unknown as JiraViewState;

    const snapshot = buildStandupSnapshot(github, jira, [item(1)]);
    assert.deepStrictEqual(snapshot.reviewingPullRequests.map((entry) => entry.pr.number), [5]);
    assert.deepStrictEqual(snapshot.myTasks.map((entry) => entry.key), ['WEB-7']);

    const prompt = buildStandupPrompt(snapshot, NOW)[0].content;
    assert.match(prompt, /## Yesterday/);
    assert.match(prompt, /## Today/);
    assert.match(prompt, /## Blockers/);
    assert.match(prompt, /WEB-7 "Login flow"/);
    assert.doesNotMatch(prompt, /WEB-8/);
  });
});
