import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { extractCiFailure } from './ciLog';

const DOTNET_FIXTURE = fs.readFileSync(
  path.join(__dirname, '..', '..', '..', 'src', 'services', 'analysis', 'fixtures', 'dotnet-xunit-failure.log'),
  'utf8',
);

const JEST_SAMPLE = [
  'PASS src/auth.test.ts',
  'FAIL src/upload.test.ts',
  '  ● upload › retries on 500',
  '',
  '    expect(received).toBe(expected)',
  '',
  '    Expected: true',
  '    Received: false',
  '',
  '      at Object.<anonymous> (src/upload.test.ts:12:20)',
  '',
  'Test Suites: 1 failed, 1 passed, 2 total',
  'Tests:       1 failed, 3 passed, 4 total',
].join('\n');

const PYTEST_SAMPLE = [
  '============================= test session starts ==============================',
  'collected 3 items',
  '',
  'test_booking.py::test_list_owner PASSED',
  'test_booking.py::test_cancel_not_owner FAILED',
  '',
  '____________________ test_cancel_not_owner _____________________',
  '',
  '    def test_cancel_not_owner():',
  '>       assert status == 403',
  'E       AssertionError: assert 404 == 403',
  '',
  'test_booking.py:100: AssertionError',
  '=========================== short test summary info ============================',
  'FAILED test_booking.py::test_cancel_not_owner - AssertionError: assert 404 == 403',
  '======================== 1 failed, 2 passed in 0.12s ==========================',
].join('\n');

suite('extractCiFailure', () => {
  test('dotnetFixture_usesStrongTier_extractsGroupedFailedTests_andSummaryByMarker', () => {
    const result = extractCiFailure(DOTNET_FIXTURE);

    assert.strictEqual(result.matchTier, 'strong');
    assert.ok(result.excerpt.length > 0);
    assert.ok(result.excerpt.length <= 8000);
    assert.ok(!/^\s*Passed\b/m.test(result.excerpt));
    assert.ok(!/InvoicePaymentTests\.InitTransaction_ReturnTransaction/.test(result.excerpt));
    assert.ok(!/Post job cleanup/.test(result.excerpt));
    assert.ok(!/orphan processes/.test(result.excerpt));
    assert.ok(result.summaryLine);
    assert.ok(/Failed!\s+-/.test(result.summaryLine ?? ''));
    assert.ok(!/Post job cleanup/.test(result.summaryLine ?? ''));

    const role = result.failedTests.find((group) => group.name === 'Get_Role_CanRead');
    assert.ok(role);
    assert.deepStrictEqual(role?.variants, [
      'Get_Role_CanRead(role: "Advisor")',
      'Get_Role_CanRead(role: "Admin")',
    ]);

    const labels = result.failedTests.map((group) => group.name);
    assert.ok(labels.includes('CancelBooking_NotOwner_Throws'));
    assert.ok(labels.includes('CancelBooking_Postponed_Throws'));
  });

  test('jestSample_strongMarkers_includeFailureNotPassing', () => {
    const result = extractCiFailure(JEST_SAMPLE);

    assert.strictEqual(result.matchTier, 'strong');
    assert.ok(result.excerpt.includes('● upload › retries on 500'));
    assert.ok(!result.excerpt.includes('PASS src/auth.test.ts'));
  });

  test('pytestSample_strongMarkers_keepAssertionError', () => {
    const result = extractCiFailure(PYTEST_SAMPLE);

    assert.strictEqual(result.matchTier, 'strong');
    assert.ok(result.excerpt.includes('AssertionError'));
    assert.ok(!/\bPASSED\b/.test(result.excerpt));
  });

  test('looseFallback_onlyWhenNoStrongHits', () => {
    const log = [
      'running suite',
      'unexpected Exception while probing health',
      'job finished',
    ].join('\n');

    const result = extractCiFailure(log);
    assert.strictEqual(result.matchTier, 'loose');
    assert.ok(result.excerpt.includes('Exception'));
  });

  test('lineClip_truncatesLongLinesTo300', () => {
    const long = `  Failed VeryLong_${'x'.repeat(400)} [1 ms]`;
    const result = extractCiFailure(long);
    const lines = result.excerpt.split('\n');
    assert.ok(lines.every((line) => line.length <= 300));
  });
});
