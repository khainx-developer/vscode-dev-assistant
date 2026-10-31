// Run: cd ai-factory/tools && node --test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseFindings, validate, nextId, recurring, renderRecurring } from './findings-report.mjs';

const row = (id, over = {}) => {
  const f = { date: '2026-09-21', story: 's1', stage: '07', task: 'TASK-001', severity: 'Med', category: 'n-plus-1',
    rootCause: 'rule-ignored', summary: 'query inside loop', evidence: 'A.cs:10', status: 'open', ...over };
  return `| ${id} | ${f.date} | ${f.story} | ${f.stage} | ${f.task} | ${f.severity} | ${f.category} | ${f.rootCause} | ${f.summary} | ${f.evidence} | ${f.status} |`;
};
const doc = (...rows) => ['| ID | Date |', '|---|---|', ...rows].join('\n');

test('parses only F-NNN data rows, not header/separator', () => {
  const rows = parseFindings(doc(row('F-001'), row('F-002')));
  assert.equal(rows.length, 2);
  assert.equal(rows[0].category, 'n-plus-1');
  assert.equal(rows[1].id, 'F-002');
});

test('valid rows produce no errors', () => {
  assert.deepEqual(validate(parseFindings(doc(row('F-001')))), []);
});

test('rejects unknown category, root cause, bad date, empty evidence, long summary, duplicate ID', () => {
  const rows = parseFindings(doc(
    row('F-001', { category: 'made-up' }),
    row('F-002', { rootCause: 'bad' }),
    row('F-003', { date: '21/09/2026' }),
    row('F-004', { evidence: 'n/a' }),
    row('F-005', { summary: 'x'.repeat(121) }),
    row('F-005'),
  ));
  const errors = validate(rows).join('\n');
  for (const needle of ['category "made-up"', 'rootCause "bad"', 'date "21/09/2026"', 'evidence must', 'max 120', 'duplicate ID F-005']) {
    assert.match(errors, new RegExp(needle.replace(/[()]/g, '\\$&')));
  }
});

test('wrong column count is reported, not silently mis-mapped', () => {
  const errors = validate(parseFindings('| F-001 | 2026-09-21 | s1 |'));
  assert.match(errors[0], /expected 11 columns, found 3/);
});

test('nextId increments the highest ID', () => {
  assert.equal(nextId(parseFindings(doc(row('F-003'), row('F-011')))), 'F-012');
  assert.equal(nextId([]), 'F-001');
});

test('recurring: two distinct stories triggers, one story with two Low rows does not', () => {
  const two = parseFindings(doc(row('F-001', { story: 's1' }), row('F-002', { story: 's2', severity: 'Low' })));
  assert.equal(recurring(two).length, 1);
  const one = parseFindings(doc(row('F-001', { severity: 'Low' }), row('F-002', { severity: 'Low' })));
  assert.equal(recurring(one).length, 0);
});

test('recurring: three Med+ rows in one story triggers; a High rule-ignored triggers alone', () => {
  const three = parseFindings(doc(row('F-001'), row('F-002'), row('F-003')));
  assert.equal(recurring(three).length, 1);
  const high = parseFindings(doc(row('F-001', { severity: 'High', rootCause: 'rule-ignored' })));
  assert.equal(recurring(high).length, 1);
  const highSpec = parseFindings(doc(row('F-001', { severity: 'High', rootCause: 'spec-gap' })));
  assert.equal(recurring(highSpec).length, 0);
});

test('applied and wontfix findings do not count toward recurrence', () => {
  const rows = parseFindings(doc(row('F-001', { story: 's1', status: 'applied' }), row('F-002', { story: 's2' })));
  assert.equal(recurring(rows).length, 0);
});

test('renderRecurring lists categories, or says none', () => {
  assert.match(renderRecurring([]), /No recurring categories yet/);
  const md = renderRecurring(parseFindings(doc(row('F-001', { story: 's1' }), row('F-002', { story: 's2' }))));
  assert.match(md, /\*\*n-plus-1\*\*.*2 stories/);
});
