import * as assert from 'assert';
import { buildActionKey } from './actionKey';

suite('buildActionKey', () => {
  test('kindPlusSortedEvidenceIds', () => {
    assert.strictEqual(
      buildActionKey('fix-ci', ['check:test', 'c1']),
      'fix-ci:c1,check:test',
    );
    assert.strictEqual(
      buildActionKey('fix-ci', ['c1', 'check:test']),
      'fix-ci:c1,check:test',
    );
  });

  test('sameInputs_sameKey_regardlessOfEvidenceOrder', () => {
    const left = buildActionKey('reply', ['c2', 'c1', 'pr']);
    const right = buildActionKey('reply', ['pr', 'c1', 'c2']);
    assert.strictEqual(left, right);
    assert.strictEqual(left, 'reply:c1,c2,pr');
  });

  test('differentKindOrEvidence_differentKey', () => {
    const base = buildActionKey('code-change', ['t1', 'pr']);
    assert.notStrictEqual(buildActionKey('fix-ci', ['t1', 'pr']), base);
    assert.notStrictEqual(buildActionKey('code-change', ['t2', 'pr']), base);
    assert.notStrictEqual(buildActionKey('code-change', ['t1']), base);
  });

  test('emptyEvidence_isKindWithTrailingColon', () => {
    assert.strictEqual(buildActionKey('decide', []), 'decide:');
    assert.strictEqual(buildActionKey('none', ['', '  ']), 'none:');
  });
});
