import * as assert from 'assert';
import type { AttentionInboxItem } from '../attention/attentionInboxBuilder';
import type { PullRequestSummary } from '../../shared/githubTypes';
import type { FailedJobLog, PullRequestCheckRun } from '../../shared/githubTypes';
import {
  buildEvidenceForAnalysis,
  buildEvidenceFromInboxItem,
  computeInboxItemStateHash,
  type CiLogEvidencePorts,
} from './inboxEvidence';

function makePr(overrides: Partial<PullRequestSummary> = {}): PullRequestSummary {
  return {
    repoKey: 'acme/web',
    number: 42,
    title: 'Add retry',
    url: 'https://github.com/acme/web/pull/42',
    author: 'dev',
    state: 'OPEN',
    mergedAt: null,
    createdAt: '2026-11-01T00:00:00Z',
    updatedAt: '2026-11-28T00:00:00Z',
    labels: [],
    checkStatus: 'FAILURE',
    mergeable: 'MERGEABLE',
    reviews: [],
    comments: [],
    requestedReviewers: [],
    ...overrides,
  };
}

function makeItem(pr?: PullRequestSummary): AttentionInboxItem {
  return {
    key: pr ? `${pr.repoKey}#${pr.number}` : 'WEB-1',
    pr,
    relatedPRs: [],
    reasons: pr?.checkStatus === 'FAILURE' ? ['pr-checks-failing'] : [],
    priority: 1,
    latestRelevantAt: null,
    jiraUnreadCount: 0,
    jiraLatestUnreadComment: null,
    jiraLatestAwaitingComment: null,
    prUnreadCount: 0,
    prLatestUnreadComment: null,
    prLatestAwaitingComment: null,
  };
}

const FAILING_CHECK: PullRequestCheckRun = {
  name: 'test',
  status: 'completed',
  conclusion: 'failure',
  detailsUrl: 'https://github.com/acme/web/actions/runs/123456/job/7',
  summary: '2 tests failed',
};

function ports(overrides: Partial<CiLogEvidencePorts> = {}): CiLogEvidencePorts & {
  logFetchCalls: string[];
  lines: string[];
} {
  const logFetchCalls: string[] = [];
  const lines: string[] = [];
  return {
    includeCiLogs: true,
    ciLogsAvailable: true,
    logFetchCalls,
    lines,
    log(line) {
      lines.push(line);
    },
    async getCheckRuns() {
      return [FAILING_CHECK];
    },
    async getFailedJobLogs(_owner, _repo, runId) {
      logFetchCalls.push(runId);
      const logs: FailedJobLog[] = [{
        jobId: 7,
        jobName: 'test',
        content: [
          'Failed CancelBooking_NotOwner_Throws [4 ms]',
          'Failed!  - Failed: 1, Passed: 10',
        ].join('\n'),
      }];
      return { ok: true as const, logs };
    },
    ...overrides,
  };
}

suite('buildEvidenceFromInboxItem', () => {
  test('keepsSnapshotOnly_andNotesMissingLogs_forFailedChecks', () => {
    const bundle = buildEvidenceFromInboxItem(makeItem(makePr()));
    const check = bundle.items.find((item) => item.id.startsWith('check:'));
    assert.ok(check);
    assert.ok(check!.text.includes('Detailed job logs were not loaded'));
    assert.ok(!check!.text.includes('Log excerpt:'));
  });

  test('reviewComments_carryPathAndLineIntoEvidence', () => {
    const bundle = buildEvidenceFromInboxItem(makeItem(makePr({
      checkStatus: 'SUCCESS',
      comments: [{
        id: 'r1',
        author: 'carol',
        body: 'Why was the retry dropped?',
        createdAt: '2026-11-28T10:00:00Z',
        url: 'https://github.com/acme/web/pull/42#discussion_r3',
        path: 'src/upload.ts',
        line: 88,
      }],
    })));
    const thread = bundle.items.find((item) => item.id === 'c1');
    assert.ok(thread);
    assert.ok(thread!.text.includes('file src/upload.ts'));
    assert.ok(thread!.text.includes('line 88'));
    assert.ok(thread!.text.includes('Why was the retry dropped?'));
  });
});

suite('computeInboxItemStateHash', () => {
  test('newCommit_changesHash', () => {
    const before = computeInboxItemStateHash(makeItem(makePr({
      headSha: 'aaa111',
      checkConclusions: { test: 'failure' },
      unresolvedThreadCount: 1,
    })));
    const after = computeInboxItemStateHash(makeItem(makePr({
      headSha: 'bbb222',
      checkConclusions: { test: 'failure' },
      unresolvedThreadCount: 1,
    })));
    assert.notStrictEqual(before, after);
  });

  test('sameState_sameHash', () => {
    const left = computeInboxItemStateHash(makeItem(makePr({
      headSha: 'aaa111',
      checkConclusions: { test: 'failure', lint: 'success' },
      unresolvedThreadCount: 2,
      comments: [{
        id: 'c1',
        author: 'alice',
        body: 'nit',
        createdAt: '2026-11-28T00:00:00Z',
        url: 'https://github.com/acme/web/pull/42#discussion_r1',
      }],
    })));
    const right = computeInboxItemStateHash(makeItem(makePr({
      headSha: 'aaa111',
      checkConclusions: { lint: 'success', test: 'failure' },
      unresolvedThreadCount: 2,
      comments: [{
        id: 'c1',
        author: 'alice',
        body: 'nit',
        createdAt: '2026-11-28T00:00:00Z',
        url: 'https://github.com/acme/web/pull/42#discussion_r1',
      }],
    })));
    assert.strictEqual(left, right);
  });

  test('perCheckConclusionChange_changesHash', () => {
    const before = computeInboxItemStateHash(makeItem(makePr({
      headSha: 'aaa111',
      checkConclusions: { test: 'failure' },
    })));
    const after = computeInboxItemStateHash(makeItem(makePr({
      headSha: 'aaa111',
      checkConclusions: { test: 'success' },
    })));
    assert.notStrictEqual(before, after);
  });
});

suite('buildEvidenceForAnalysis', () => {
  test('withLogs_attachesExcerptAndFailedTests', async () => {
    const bundle = await buildEvidenceForAnalysis(makeItem(makePr()), ports());
    const check = bundle.items.find((item) => item.id === 'check:test');
    assert.ok(check);
    assert.strictEqual(check!.kind, 'log');
    assert.ok(check!.text.includes('CancelBooking_NotOwner_Throws'));
    assert.ok(check!.text.includes('Log excerpt:'));
    assert.ok(check!.text.includes('Failed tests:'));
    assert.strictEqual(
      bundle.links['check:test'],
      'https://github.com/acme/web/actions/runs/123456/job/7',
    );
  });

  test('withoutLogs_degradesToNameSummaryAndLink', async () => {
    const bundle = await buildEvidenceForAnalysis(
      makeItem(makePr()),
      ports({ includeCiLogs: false }),
    );
    const check = bundle.items.find((item) => item.id === 'check:test');
    assert.ok(check);
    assert.strictEqual(check!.kind, 'check');
    assert.ok(check!.text.includes('2 tests failed'));
    assert.ok(check!.text.includes('Job logs: not loaded (CI log inclusion is off).'));
    assert.ok(!check!.text.includes('Confidence must be low'));
    assert.ok(!check!.text.includes('Log excerpt:'));
    assert.strictEqual(
      bundle.links['check:test'],
      'https://github.com/acme/web/actions/runs/123456/job/7',
    );
  });

  test('whenLogCallFails_degradesAndKeepsNotLoadedFact', async () => {
    const bundle = await buildEvidenceForAnalysis(
      makeItem(makePr()),
      ports({
        getFailedJobLogs: async () => ({ ok: false, reason: 'error', detail: 'boom' }),
      }),
    );
    const check = bundle.items.find((item) => item.id === 'check:test');
    assert.ok(check);
    assert.strictEqual(check!.kind, 'check');
    assert.ok(check!.text.includes('Job logs: not loaded.'));
    assert.ok(!check!.text.includes('Confidence must be low'));
    assert.ok(!check!.text.includes('Log excerpt:'));
  });

  test('whenToolsetUnavailable_skipsLogFetch', async () => {
    const p = ports({ ciLogsAvailable: false });
    const bundle = await buildEvidenceForAnalysis(makeItem(makePr()), p);
    assert.deepStrictEqual(p.logFetchCalls, []);
    const check = bundle.items.find((item) => item.id === 'check:test');
    assert.ok(check!.text.includes('actions toolset unavailable'));
  });

  test('whenGetCheckRunsFails_logsAndFallsBackToSnapshot', async () => {
    const p = ports({
      getCheckRuns: async () => {
        throw new Error('MCP timeout');
      },
    });
    const bundle = await buildEvidenceForAnalysis(makeItem(makePr()), p);
    assert.ok(p.lines.some((line) => line.includes('getCheckRuns failed')));
    assert.ok(p.lines.some((line) => line.includes('acme/web#42')));
    assert.ok(p.lines.some((line) => line.includes('MCP timeout')));
    assert.deepStrictEqual(p.logFetchCalls, []);
    const check = bundle.items.find((item) => item.id.startsWith('check:'));
    assert.ok(check);
    assert.ok(check!.text.includes('Detailed job logs were not loaded'));
  });
});
