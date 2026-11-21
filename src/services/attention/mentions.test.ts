import * as assert from 'assert';
import { mentionsUser } from './mentions';

suite('mentionsUser', () => {
  test('github_matchesAtLogin_caseInsensitive_onWordBoundary', () => {
    assert.ok(mentionsUser('hey @Alice check this', { githubLogin: 'alice' }));
    assert.ok(mentionsUser('@Alice', { githubLogin: 'Alice' }));
    assert.ok(mentionsUser('ping (@alice)!', { githubLogin: 'alice' }));
  });

  test('github_doesNotMatch_loginPrefixOrEmail', () => {
    assert.ok(!mentionsUser('hey @alicex', { githubLogin: 'alice' }));
    assert.ok(!mentionsUser('mail a@alice.com please', { githubLogin: 'alice' }));
    assert.ok(!mentionsUser('no mention here', { githubLogin: 'alice' }));
  });

  test('jira_matchesAccountId_whenPresentInText', () => {
    assert.ok(
      mentionsUser('ping [~accountid:abc-123] thanks', {
        jiraAccountId: 'abc-123',
        jiraDisplayName: 'Jane Doe',
      }),
    );
  });

  test('jira_fallsBackToAtDisplayName_whenAccountIdAbsent', () => {
    assert.ok(
      mentionsUser('hey @Jane Doe can you look?', {
        jiraAccountId: null,
        jiraDisplayName: 'Jane Doe',
      }),
    );
    assert.ok(
      mentionsUser('hey @jane doe?', {
        jiraDisplayName: 'Jane Doe',
      }),
    );
  });

  test('jira_prefersAccountId_andStillAllowsDisplayNameFallbackWhenIdMissingFromText', () => {
    assert.ok(
      !mentionsUser('hey @Someone Else', {
        jiraAccountId: 'abc-123',
        jiraDisplayName: 'Jane Doe',
      }),
    );
    assert.ok(
      mentionsUser('hey @Jane Doe', {
        jiraAccountId: 'abc-123',
        jiraDisplayName: 'Jane Doe',
      }),
    );
  });

  test('emptyIdentities_neverMatch', () => {
    assert.ok(!mentionsUser('@alice @Jane Doe [~accountid:x]', {}));
    assert.ok(!mentionsUser('@alice', { githubLogin: '  ', jiraDisplayName: '' }));
  });
});
