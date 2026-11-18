import * as assert from 'assert';
import { currentUnixTimestamp, describeTimestamp, unixTimestampToIso } from './timestamp';

const LOCAL = 'Asia/Ho_Chi_Minh';
const NOW = Date.UTC(2026, 10, 17, 10, 0, 0); // 2026-11-17T10:00:00.000Z

suite('unixTimestampToIso', () => {
  test('seconds_convertsToIso', () => {
    assert.strictEqual(unixTimestampToIso('1700000000'), '2023-11-14T22:13:20.000Z');
  });

  test('milliseconds_whenMoreThan10Digits', () => {
    assert.strictEqual(unixTimestampToIso('1700000000123'), '2023-11-14T22:13:20.123Z');
  });

  test('invalid_throwsFriendlyError', () => {
    assert.throws(() => unixTimestampToIso('not-a-number'), /Not a valid Unix timestamp/);
  });

  test('outOfRange_throwsFriendlyErrorNotRangeError', () => {
    assert.throws(() => unixTimestampToIso('999999999999999999'), (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.ok(!(err instanceof RangeError));
      assert.match(err.message, /out of range/i);
      return true;
    });
  });
});

suite('currentUnixTimestamp', () => {
  test('returnsDigitString', () => {
    const value = currentUnixTimestamp();
    assert.match(value, /^\d+$/);
  });
});

suite('describeTimestamp', () => {
  test('convert_seconds_assumesSeconds', () => {
    const out = describeTimestamp('1700000000', 'convert', NOW, LOCAL);
    assert.ok(out.includes('1700000000 (seconds)'));
    assert.ok(out.includes('1700000000000 (milliseconds)'));
    assert.ok(out.includes('Assumed unit: seconds'));
    assert.ok(out.includes('2023-11-14T22:13:20.000Z'));
    assert.ok(out.includes('+07:00  Asia/Ho_Chi_Minh'));
  });

  test('convert_milliseconds_whenMoreThan10Digits', () => {
    const out = describeTimestamp('1700000000123', 'convert', NOW, LOCAL);
    assert.ok(out.includes('Assumed unit: milliseconds'));
    assert.ok(out.includes('1700000000123 (milliseconds)'));
    assert.ok(out.includes('2023-11-14T22:13:20.123Z'));
  });

  test('convert_negativeSeconds', () => {
    const out = describeTimestamp('-86400', 'convert', NOW, LOCAL);
    assert.ok(out.includes('Assumed unit: seconds'));
    assert.ok(out.includes('-86400 (seconds)'));
    assert.ok(out.includes('1969-12-31T00:00:00.000Z'));
  });

  test('convert_fractionalSeconds', () => {
    const out = describeTimestamp('1700000000.5', 'convert', NOW, LOCAL);
    assert.ok(out.includes('Assumed unit: seconds'));
    assert.ok(out.includes('1700000000.5 (seconds)'));
    assert.ok(out.includes('1700000000500 (milliseconds)'));
    assert.ok(out.includes('2023-11-14T22:13:20.500Z'));
  });

  test('convert_outOfRange_throws', () => {
    assert.throws(
      () => describeTimestamp('9999999999999999', 'convert', NOW, LOCAL),
      /out of range/i,
    );
  });

  test('convert_dst_americaNewYork_januaryIsMinus5', () => {
    // 2026-01-15T12:00:00Z → America/New_York is EST (UTC-5)
    const jan = String(Math.floor(Date.UTC(2026, 0, 15, 12, 0, 0) / 1000));
    const out = describeTimestamp(`${jan} in America/New_York`, 'convert', NOW, LOCAL);
    assert.ok(out.includes('-05:00  America/New_York'));
  });

  test('convert_dst_americaNewYork_julyIsMinus4', () => {
    // 2026-07-15T12:00:00Z → America/New_York is EDT (UTC-4)
    const jul = String(Math.floor(Date.UTC(2026, 6, 15, 12, 0, 0) / 1000));
    const out = describeTimestamp(`${jul} in America/New_York`, 'convert', NOW, LOCAL);
    assert.ok(out.includes('-04:00  America/New_York'));
  });

  test('convert_invalidZone_namesOffendingZone', () => {
    assert.throws(
      () => describeTimestamp('1700000000 in Not/AZone', 'convert', NOW, LOCAL),
      /Unknown time zone: Not\/AZone.*IANA names such as America\/Los_Angeles/,
    );
  });

  test('convert_duplicateZones_listedOnce', () => {
    const out = describeTimestamp(
      '1700000000 in Asia/Tokyo, Asia/Ho_Chi_Minh, Asia/Tokyo',
      'convert',
      NOW,
      LOCAL,
    );
    const tokyoLines = out.split('\n').filter((l) => l.includes('Asia/Tokyo'));
    assert.strictEqual(tokyoLines.length, 1);
    const localLines = out.split('\n').filter((l) => l.includes('Asia/Ho_Chi_Minh'));
    assert.strictEqual(localLines.length, 1);
  });

  test('convert_dateWithZ', () => {
    const out = describeTimestamp('2026-11-17T10:00:00Z', 'convert', NOW, LOCAL);
    assert.ok(!out.includes('Interpreted as UTC'));
    assert.ok(out.includes('2026-11-17T10:00:00.000Z'));
    assert.ok(out.includes('1794909600 (seconds)'));
  });

  test('convert_dateWithOffset', () => {
    const out = describeTimestamp(
      '2026-11-17T10:00:00+07:00 in America/New_York',
      'convert',
      NOW,
      LOCAL,
    );
    assert.ok(!out.includes('Interpreted as UTC'));
    assert.ok(out.includes('2026-11-17T03:00:00.000Z'));
    assert.ok(out.includes('America/New_York'));
  });

  test('convert_dateWithoutOffset_treatedAsUtcWithNotice', () => {
    const out = describeTimestamp('2026-11-17T10:00:00', 'convert', NOW, LOCAL);
    assert.ok(out.includes('Interpreted as UTC (no offset in input).'));
    assert.ok(out.includes('2026-11-17T10:00:00.000Z'));
  });

  test('convert_spaceSeparatedDate_treatedAsUtc', () => {
    const out = describeTimestamp('2026-11-17 10:00:00', 'convert', NOW, LOCAL);
    assert.ok(out.includes('Interpreted as UTC (no offset in input).'));
    assert.ok(out.includes('2026-11-17T10:00:00.000Z'));
    assert.ok(out.includes('1794909600 (seconds)'));
  });

  test('convert_spaceSeparatedDateWithOffset', () => {
    const out = describeTimestamp('2026-11-17 10:00:00 +07:00', 'convert', NOW, LOCAL);
    assert.ok(!out.includes('Interpreted as UTC'));
    assert.ok(out.includes('2026-11-17T03:00:00.000Z'));
  });

  test('convert_spaceSeparatedDateWithZ', () => {
    const out = describeTimestamp('2026-11-17 10:00:00Z', 'convert', NOW, LOCAL);
    assert.ok(!out.includes('Interpreted as UTC'));
    assert.ok(out.includes('2026-11-17T10:00:00.000Z'));
    assert.ok(out.includes('1794909600 (seconds)'));
  });

  test('convert_nonIsoDateString_rejected', () => {
    const msg = /Use a Unix timestamp or an ISO 8601 date, e\.g\. 2026-11-17T10:00:00Z\./;
    assert.throws(() => describeTimestamp('Nov 17 2026 10:00', 'convert', NOW, LOCAL), msg);
    assert.throws(() => describeTimestamp('tomorrow', 'convert', NOW, LOCAL), msg);
    assert.throws(() => describeTimestamp('17/11/2026', 'convert', NOW, LOCAL), msg);
  });

  test('convert_invalidValue_throws', () => {
    assert.throws(
      () => describeTimestamp('not-a-timestamp', 'convert', NOW, LOCAL),
      /Use a Unix timestamp or an ISO 8601 date/,
    );
  });

  test('now_emptyInput_usesInjectedNowAndLocal', () => {
    const out = describeTimestamp('', 'now', NOW, LOCAL);
    assert.ok(out.includes('1794909600 (seconds)'));
    assert.ok(out.includes('1794909600000 (milliseconds)'));
    assert.ok(!out.includes('Assumed unit:'));
    assert.ok(out.includes('2026-11-17T10:00:00.000Z'));
    assert.ok(out.includes('+07:00  Asia/Ho_Chi_Minh'));
  });

  test('now_includesExtraZonesFromInput', () => {
    const out = describeTimestamp('in Asia/Tokyo, Europe/London', 'now', NOW, LOCAL);
    assert.ok(out.includes('Asia/Tokyo'));
    assert.ok(out.includes('Europe/London'));
    assert.ok(out.includes('2026-11-17T10:00:00.000Z'));
  });

  test('now_bareIanaZone_accepted', () => {
    const out = describeTimestamp('Asia/Tokyo', 'now', NOW, LOCAL);
    assert.ok(out.includes('Asia/Tokyo'));
    assert.ok(out.includes('2026-11-17T10:00:00.000Z'));
    assert.ok(out.includes('+09:00  Asia/Tokyo'));
  });

  test('now_bareCommaSeparatedZones_accepted', () => {
    const out = describeTimestamp('Asia/Tokyo, Europe/London', 'now', NOW, LOCAL);
    assert.ok(out.includes('Asia/Tokyo'));
    assert.ok(out.includes('Europe/London'));
    assert.ok(out.includes('2026-11-17T10:00:00.000Z'));
    assert.ok(out.includes('+09:00  Asia/Tokyo'));
  });

  test('convert_bareCommaSeparatedZones_notTreatedAsZones', () => {
    assert.throws(
      () => describeTimestamp('Asia/Tokyo, Europe/London', 'convert', NOW, LOCAL),
      /Use a Unix timestamp or an ISO 8601 date/,
    );
  });

  test('zoneOrder_utcThenLocalThenRequested', () => {
    const out = describeTimestamp('1700000000 in Europe/London, Asia/Tokyo', 'convert', NOW, LOCAL);
    const lines = out.split('\n');
    const utcIdx = lines.findIndex((l) => l.endsWith('Z') && l.includes('T'));
    const localIdx = lines.findIndex((l) => l.includes('Asia/Ho_Chi_Minh'));
    const londonIdx = lines.findIndex((l) => l.includes('Europe/London'));
    const tokyoIdx = lines.findIndex((l) => l.includes('Asia/Tokyo'));
    assert.ok(utcIdx >= 0 && localIdx > utcIdx && londonIdx > localIdx && tokyoIdx > londonIdx);
  });
});
