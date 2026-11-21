import * as assert from 'assert';
import { extractIssueKey } from './issueKey';

suite('extractIssueKey', () => {
  test('extractIssueKey_returnsUppercasedKey_fromFeatureBranch', () => {
    assert.strictEqual(extractIssueKey('feature/PROJ-123-fix'), 'PROJ-123');
  });

  test('extractIssueKey_returnsUndefined_whenNoKey', () => {
    assert.strictEqual(extractIssueKey('feature/no-ticket-here'), undefined);
    assert.strictEqual(extractIssueKey('main'), undefined);
  });

  test('extractIssueKey_isCaseInsensitive', () => {
    assert.strictEqual(extractIssueKey('bugfix/proj-55-login'), 'PROJ-55');
  });

  test('extractIssueKey_isBoundarySafe_doesNotMatchPartialKeys', () => {
    assert.strictEqual(extractIssueKey('feature/APROJ-123-fix'), 'APROJ-123');
    assert.strictEqual(extractIssueKey('feature/PROJ-1234-fix'), 'PROJ-1234');
    assert.notStrictEqual(extractIssueKey('feature/APROJ-123-fix'), 'PROJ-123');
  });

  test('extractIssueKey_returnsFirstMatch', () => {
    assert.strictEqual(extractIssueKey('chore/PROJ-1-and-PROJ-2'), 'PROJ-1');
  });
});
