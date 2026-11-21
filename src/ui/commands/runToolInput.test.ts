import * as assert from 'assert';
import { resolveToolInput } from './runToolInput';

suite('resolveToolInput', () => {
  test('needsInputFalse_returnsEmpty', () => {
    assert.strictEqual(resolveToolInput(false, false, 'sel', 'doc'), '');
    assert.strictEqual(resolveToolInput(false, true, '', 'doc'), '');
  });

  test('needsInputTrue_usesSelectionWhenNonEmpty', () => {
    assert.strictEqual(resolveToolInput(true, false, 'selected', 'whole doc'), 'selected');
  });

  test('needsInputTrue_usesDocumentWhenSelectionEmpty', () => {
    assert.strictEqual(resolveToolInput(true, true, '', 'whole doc'), 'whole doc');
  });

  test('needsInputTrue_emptyDocumentAndSelection_returnsEmpty', () => {
    assert.strictEqual(resolveToolInput(true, true, '', ''), '');
  });
});
