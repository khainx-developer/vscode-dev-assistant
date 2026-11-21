/** Local-time working-hours window for auto-pausing monitoring. */

export type Weekday = 'sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat';

export interface WorkingHoursConfig {
  enabled: boolean;
  /** Days of the week when monitoring may run (local time). */
  days: readonly Weekday[];
  /** Inclusive start, `HH:MM` local. */
  start: string;
  /** Exclusive end, `HH:MM` local. */
  end: string;
}

export const DEFAULT_WORKING_HOURS_DAYS: readonly Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri'];
export const DEFAULT_WORKING_HOURS_START = '09:00';
export const DEFAULT_WORKING_HOURS_END = '18:00';

const WEEKDAYS: readonly Weekday[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const DAY_INDEX: Record<Weekday, number> = {
  sun: 0,
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
};

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Minutes since local midnight, or null if `HH:MM` is invalid. */
export function parseHhMm(value: string): number | null {
  const match = TIME_RE.exec(value.trim());
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function isWeekday(value: unknown): value is Weekday {
  return typeof value === 'string' && (WEEKDAYS as readonly string[]).includes(value);
}

/**
 * Normalize raw settings into a config. Invalid `start`/`end` fall back to defaults.
 * Unknown day entries are dropped; an empty days list keeps the Mon–Fri default.
 */
export function normalizeWorkingHoursConfig(raw: {
  enabled?: unknown;
  days?: unknown;
  start?: unknown;
  end?: unknown;
}): WorkingHoursConfig {
  const days = Array.isArray(raw.days)
    ? raw.days.filter(isWeekday)
    : [...DEFAULT_WORKING_HOURS_DAYS];
  const start = typeof raw.start === 'string' && parseHhMm(raw.start) !== null
    ? raw.start.trim()
    : DEFAULT_WORKING_HOURS_START;
  const end = typeof raw.end === 'string' && parseHhMm(raw.end) !== null
    ? raw.end.trim()
    : DEFAULT_WORKING_HOURS_END;
  return {
    enabled: raw.enabled === true,
    days: days.length > 0 ? days : [...DEFAULT_WORKING_HOURS_DAYS],
    start,
    end,
  };
}

/**
 * True when monitoring should run under this schedule.
 * Disabled, or an invalid window (`end <= start`), means always on.
 * Active window is half-open: `[start, end)` on a configured weekday (local time).
 */
export function isWithinWorkingHours(now: Date, config: WorkingHoursConfig): boolean {
  if (!config.enabled) return true;

  const startMinutes = parseHhMm(config.start);
  const endMinutes = parseHhMm(config.end);
  if (startMinutes === null || endMinutes === null || endMinutes <= startMinutes) {
    return true;
  }

  const day = WEEKDAYS[now.getDay()];
  if (!config.days.includes(day)) return false;

  const minutes = now.getHours() * 60 + now.getMinutes();
  return minutes >= startMinutes && minutes < endMinutes;
}

/**
 * Milliseconds until the next local transition into or out of the working window.
 * Returns null when the schedule is inactive (disabled / invalid → always on).
 */
export function msUntilNextWorkingHoursBoundary(now: Date, config: WorkingHoursConfig): number | null {
  if (!config.enabled) return null;

  const startMinutes = parseHhMm(config.start);
  const endMinutes = parseHhMm(config.end);
  if (startMinutes === null || endMinutes === null || endMinutes <= startMinutes) {
    return null;
  }

  const daySet = new Set(config.days.map((day) => DAY_INDEX[day]));
  if (daySet.size === 0) return null;

  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const remainderMs = now.getSeconds() * 1000 + now.getMilliseconds();
  const today = now.getDay();
  const within = daySet.has(today) && nowMinutes >= startMinutes && nowMinutes < endMinutes;

  if (within) {
    return Math.max(0, (endMinutes - nowMinutes) * 60 * 1000 - remainderMs);
  }

  for (let offset = 0; offset <= 7; offset++) {
    const dayIndex = (today + offset) % 7;
    if (!daySet.has(dayIndex)) continue;
    if (offset === 0 && nowMinutes >= startMinutes) continue;
    const minutesAhead = offset * 24 * 60 + startMinutes - nowMinutes;
    return Math.max(0, minutesAhead * 60 * 1000 - remainderMs);
  }

  return null;
}
