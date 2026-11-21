import * as assert from 'assert';
import {
  DEFAULT_WORKING_HOURS_DAYS,
  DEFAULT_WORKING_HOURS_END,
  DEFAULT_WORKING_HOURS_START,
  isWithinWorkingHours,
  msUntilNextWorkingHoursBoundary,
  normalizeWorkingHoursConfig,
  type WorkingHoursConfig,
} from './workingHours';

/** Local Date for a known weekday (2026-11-16 = Monday). */
function localAt(dayOffset: number, hours: number, minutes: number, seconds = 0, ms = 0): Date {
  // 2026-11-16 is a Monday in local time constructors that use local components.
  return new Date(2026, 10, 16 + dayOffset, hours, minutes, seconds, ms);
}

const enabledMonFri: WorkingHoursConfig = {
  enabled: true,
  days: [...DEFAULT_WORKING_HOURS_DAYS],
  start: DEFAULT_WORKING_HOURS_START,
  end: DEFAULT_WORKING_HOURS_END,
};

suite('workingHours', () => {
  test('disabled_isAlwaysWithin', () => {
    const config = { ...enabledMonFri, enabled: false };
    assert.strictEqual(isWithinWorkingHours(localAt(0, 3, 0), config), true);
    assert.strictEqual(isWithinWorkingHours(localAt(5, 12, 0), config), true);
  });

  test('weekday_boundaries_halfOpenStartInclusiveEndExclusive', () => {
    assert.strictEqual(isWithinWorkingHours(localAt(0, 8, 59), enabledMonFri), false);
    assert.strictEqual(isWithinWorkingHours(localAt(0, 9, 0), enabledMonFri), true);
    assert.strictEqual(isWithinWorkingHours(localAt(0, 12, 30), enabledMonFri), true);
    assert.strictEqual(isWithinWorkingHours(localAt(0, 17, 59), enabledMonFri), true);
    assert.strictEqual(isWithinWorkingHours(localAt(0, 18, 0), enabledMonFri), false);
    assert.strictEqual(isWithinWorkingHours(localAt(0, 22, 0), enabledMonFri), false);
  });

  test('weekend_isOutside', () => {
    assert.strictEqual(isWithinWorkingHours(localAt(5, 12, 0), enabledMonFri), false); // Saturday
    assert.strictEqual(isWithinWorkingHours(localAt(6, 12, 0), enabledMonFri), false); // Sunday
  });

  test('endLessOrEqualStart_treatedAsInvalid_alwaysOn', () => {
    assert.strictEqual(
      isWithinWorkingHours(localAt(5, 3, 0), { ...enabledMonFri, start: '18:00', end: '09:00' }),
      true,
    );
    assert.strictEqual(
      isWithinWorkingHours(localAt(0, 3, 0), { ...enabledMonFri, start: '09:00', end: '09:00' }),
      true,
    );
  });

  test('normalize_fallsBackInvalidTimesAndDays', () => {
    const config = normalizeWorkingHoursConfig({
      enabled: true,
      days: ['mon', 'nope', 3],
      start: '25:99',
      end: 'bogus',
    });
    assert.deepStrictEqual(config.days, ['mon']);
    assert.strictEqual(config.start, DEFAULT_WORKING_HOURS_START);
    assert.strictEqual(config.end, DEFAULT_WORKING_HOURS_END);
  });

  test('msUntilNextBoundary_fromInsideToEnd', () => {
    const now = localAt(0, 17, 0, 0, 0); // Monday 17:00 → 18:00
    const ms = msUntilNextWorkingHoursBoundary(now, enabledMonFri);
    assert.strictEqual(ms, 60 * 60 * 1000);
  });

  test('msUntilNextBoundary_weekendToMondayStart', () => {
    const now = localAt(5, 12, 0, 0, 0); // Saturday noon → Monday 09:00
    const ms = msUntilNextWorkingHoursBoundary(now, enabledMonFri);
    // Sat 12:00 → Mon 09:00 = 1 day 21 hours
    assert.strictEqual(ms, (24 + 21) * 60 * 60 * 1000);
  });

  test('msUntilNextBoundary_nullWhenDisabledOrInvalid', () => {
    assert.strictEqual(msUntilNextWorkingHoursBoundary(localAt(0, 12, 0), { ...enabledMonFri, enabled: false }), null);
    assert.strictEqual(
      msUntilNextWorkingHoursBoundary(localAt(0, 12, 0), { ...enabledMonFri, start: '18:00', end: '09:00' }),
      null,
    );
  });
});
