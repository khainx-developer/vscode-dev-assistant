// Run: cd ai-factory/tools && node --test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sectionText, tokens, BUNDLES } from './context-budget.mjs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { measure } from './context-budget.mjs';

const md = '# T\n\n## A\naaa\n### A1\nnested\n## B\nbbb\n';

test('sectionText returns a section including nested headings, stopping at the next same-level heading', () => {
  assert.equal(sectionText(md, 'A'), '## A\naaa\n### A1\nnested');
  assert.equal(sectionText(md, 'B'), '## B\nbbb\n');
});

test('sectionText throws for a missing section so a renamed heading fails loudly', () => {
  assert.throws(() => sectionText(md, 'Nope'), /section not found/);
});

test('tokens approximates chars/4, rounded up', () => {
  assert.equal(tokens('abcd'), 1);
  assert.equal(tokens('abcde'), 2);
});

test('every configured bundle file exists and each bundle is within its budget', () => {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
  for (const [name, bundle] of Object.entries(BUNDLES)) {
    const { rows, total } = measure(root, bundle);
    assert.deepEqual(rows.filter((r) => r.missing).map((r) => r.file), [], `${name}: missing files`);
    assert.ok(total <= bundle.budget, `${name}: ${total} > budget ${bundle.budget}`);
  }
});
