import * as assert from 'assert';
import { buildEvidence, evidenceIds, evidenceText } from './evidence';

const REVIEW_THREAD_FIXTURE = {
  review_threads: [
    {
      id: 'PRRT_resolved',
      is_resolved: true,
      is_outdated: false,
      comments: [{
        author: 'alice',
        body: 'Resolved nit about naming',
        html_url: 'https://github.com/acme/web/pull/42#discussion_r1',
        path: 'src/upload.ts',
      }],
    },
    {
      id: 'PRRT_outdated',
      is_resolved: false,
      is_outdated: true,
      comments: [{
        author: 'bob',
        body: 'Outdated suggestion on deleted code',
        html_url: 'https://github.com/acme/web/pull/42#discussion_r2',
        path: 'src/old.ts',
      }],
    },
    {
      id: 'PRRT_open',
      is_resolved: false,
      is_outdated: false,
      comments: [{
        author: 'carol',
        body: 'Why was the retry dropped?',
        html_url: 'https://github.com/acme/web/pull/42#discussion_r3',
        path: 'src/upload.ts',
        created_at: '2026-11-28T10:00:00Z',
      }],
    },
  ],
};

suite('buildEvidence', () => {
  test('assignsIds_andLinkTable_forPrTicketChecksAndAcceptance', () => {
    const bundle = buildEvidence({
      pr: {
        repoKey: 'acme/web',
        number: 42,
        title: 'Add retry to uploader',
        url: 'https://github.com/acme/web/pull/42',
        author: 'dev',
        reviewState: 'changes_requested',
        checkStatus: 'FAILURE',
      },
      ticket: {
        key: 'WEB-123',
        summary: 'Retry uploads',
        url: 'https://acme.atlassian.net/browse/WEB-123',
        status: 'In Progress',
        acceptanceCriteria: 'Retries on 5xx up to 3 times',
        comments: [{
          author: 'jane',
          body: 'Please keep the backlog link',
          url: 'https://acme.atlassian.net/browse/WEB-123?focusedCommentId=9',
        }],
      },
      checks: [{
        name: 'test',
        conclusion: 'failure',
        summary: '2 tests failed',
        detailsUrl: 'https://github.com/acme/web/actions/runs/99/job/1',
        logExcerpt: 'Failed CancelBooking_NotOwner_Throws',
        failedTests: ['CancelBooking_NotOwner_Throws'],
      }],
    });

    assert.deepStrictEqual(evidenceIds(bundle), ['pr', 'ac', 't1', 'check:test']);
    assert.strictEqual(bundle.links.pr, 'https://github.com/acme/web/pull/42');
    assert.strictEqual(bundle.links.ac, 'https://acme.atlassian.net/browse/WEB-123');
    assert.strictEqual(
      bundle.links.t1,
      'https://acme.atlassian.net/browse/WEB-123?focusedCommentId=9',
    );
    assert.strictEqual(
      bundle.links['check:test'],
      'https://github.com/acme/web/actions/runs/99/job/1',
    );
    assert.ok(evidenceText(bundle).includes('Retries on 5xx up to 3 times'));
    assert.ok(evidenceText(bundle).includes('Failed CancelBooking_NotOwner_Throws'));
  });

  test('reviewThreadFixture_keepsOnlyUnresolvedAndNonOutdated', () => {
    const threads = REVIEW_THREAD_FIXTURE.review_threads.map((thread) => ({
      id: thread.id,
      is_resolved: thread.is_resolved,
      is_outdated: thread.is_outdated,
      path: thread.comments[0]?.path,
      url: thread.comments[0]?.html_url,
      comments: thread.comments.map((comment) => ({
        author: comment.author,
        body: comment.body,
        url: comment.html_url,
        createdAt: (comment as { created_at?: string }).created_at,
      })),
    }));

    const bundle = buildEvidence({
      pr: {
        repoKey: 'acme/web',
        number: 42,
        title: 'Add retry to uploader',
        url: 'https://github.com/acme/web/pull/42',
      },
      threads,
    });

    assert.deepStrictEqual(evidenceIds(bundle), ['pr', 'c1']);
    assert.strictEqual(bundle.items[1].id, 'c1');
    assert.strictEqual(bundle.items[1].kind, 'thread');
    assert.ok(bundle.items[1].text.includes('Why was the retry dropped?'));
    assert.ok(!bundle.items.some((item) => item.text.includes('Resolved nit')));
    assert.ok(!bundle.items.some((item) => item.text.includes('Outdated suggestion')));
    assert.strictEqual(
      bundle.links.c1,
      'https://github.com/acme/web/pull/42#discussion_r3',
    );
  });

  test('skipsThreads_whenBothResolvedAndOutdatedFlagsTrue', () => {
    const bundle = buildEvidence({
      threads: [{
        is_resolved: true,
        is_outdated: true,
        comments: [{ author: 'x', body: 'Both flags set' }],
      }],
    });

    assert.deepStrictEqual(evidenceIds(bundle), []);
  });
});
