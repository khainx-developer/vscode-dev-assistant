const MAX_DATE_MS = 8.64e15;
const NUMERIC_RE = /^-?\d+(\.\d+)?$/;

export function currentUnixTimestamp(): string {
  return String(Math.floor(Date.now() / 1000));
}

export function unixTimestampToIso(text: string): string {
  const trimmed = text.trim();
  const value = Number(trimmed);
  if (!trimmed || Number.isNaN(value)) {
    throw new Error('Not a valid Unix timestamp.');
  }
  const ms = trimmed.length > 10 ? value : value * 1000;
  try {
    return new Date(ms).toISOString();
  } catch {
    throw new Error('Timestamp is out of range.');
  }
}

/**
 * Describe a moment as Unix timestamps plus the same instant in UTC, the machine
 * local zone, and any IANA zones listed after `in`. No dependencies — uses Intl only.
 *
 * Input grammar: `<value> [in <zone>[, <zone>...]]`
 * Actions: `now` (current time; empty input OK) or `convert` (Unix or date string).
 */
export function describeTimestamp(
  input: string,
  action: string,
  nowMs: number = Date.now(),
  localZone: string = Intl.DateTimeFormat().resolvedOptions().timeZone,
): string {
  const { value, zones } = parseInput(input);
  for (const zone of zones) {
    assertValidZone(zone);
  }

  if (action === 'now') {
    return formatDescription(nowMs, zones, localZone, null, false);
  }

  if (action === 'convert') {
    if (!value) {
      throw new Error('Not a valid Unix timestamp or date.');
    }
    const parsed = parseValue(value);
    return formatDescription(parsed.ms, zones, localZone, parsed.assumedUnit, parsed.assumedUtc);
  }

  throw new Error(`Unknown action: ${action}`);
}

function parseInput(input: string): { value: string; zones: string[] } {
  const trimmed = input.trim();
  if (!trimmed) {
    return { value: '', zones: [] };
  }
  if (/^in\s+/i.test(trimmed)) {
    return { value: '', zones: splitZones(trimmed.replace(/^in\s+/i, '')) };
  }
  const inIdx = trimmed.search(/\sin\s/i);
  if (inIdx === -1) {
    return { value: trimmed, zones: [] };
  }
  return {
    value: trimmed.slice(0, inIdx).trim(),
    zones: splitZones(trimmed.slice(inIdx).replace(/^\s*in\s+/i, '')),
  };
}

function splitZones(part: string): string[] {
  return part
    .split(',')
    .map((z) => z.trim())
    .filter(Boolean);
}

function assertValidZone(zone: string): void {
  try {
    new Intl.DateTimeFormat(undefined, { timeZone: zone });
  } catch {
    throw new Error(`Unknown time zone: ${zone}`);
  }
}

function parseValue(value: string): {
  ms: number;
  assumedUnit: 'seconds' | 'milliseconds' | null;
  assumedUtc: boolean;
} {
  if (NUMERIC_RE.test(value)) {
    return parseNumeric(value);
  }
  return parseDateString(value);
}

function parseNumeric(value: string): {
  ms: number;
  assumedUnit: 'seconds' | 'milliseconds';
  assumedUtc: false;
} {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    throw new Error('Not a valid Unix timestamp or date.');
  }
  const digits = value.replace(/^-/, '').split('.')[0].length;
  const assumedUnit = digits > 10 ? 'milliseconds' : 'seconds';
  const ms = assumedUnit === 'milliseconds' ? num : num * 1000;
  assertInRange(ms);
  return { ms, assumedUnit, assumedUtc: false };
}

function parseDateString(value: string): {
  ms: number;
  assumedUnit: null;
  assumedUtc: boolean;
} {
  const assumedUtc = !hasExplicitOffsetOrZ(value);
  let toParse = value;
  if (assumedUtc && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    toParse = /T\d/i.test(value) ? `${value}Z` : `${value}T00:00:00Z`;
  }
  const ms = Date.parse(toParse);
  if (Number.isNaN(ms)) {
    throw new Error('Not a valid Unix timestamp or date.');
  }
  assertInRange(ms);
  return { ms, assumedUnit: null, assumedUtc };
}

function hasExplicitOffsetOrZ(value: string): boolean {
  return /Z$/i.test(value) || /[+-]\d{2}:?\d{2}$/.test(value);
}

function assertInRange(ms: number): void {
  if (!Number.isFinite(ms) || Math.abs(ms) > MAX_DATE_MS) {
    throw new Error('Timestamp is out of range.');
  }
}

function formatDescription(
  ms: number,
  zones: string[],
  localZone: string,
  assumedUnit: 'seconds' | 'milliseconds' | null,
  assumedUtc: boolean,
): string {
  assertInRange(ms);
  const iso = toIsoSafe(ms);
  const lines: string[] = [
    `${formatUnixSeconds(ms)} (seconds)`,
    `${formatUnixMilliseconds(ms)} (milliseconds)`,
  ];
  if (assumedUnit) {
    lines.push(`Assumed unit: ${assumedUnit}`);
  }
  if (assumedUtc) {
    lines.push('Interpreted as UTC (no offset in input).');
  }
  lines.push('');
  lines.push(iso);

  const seen = new Set<string>(['UTC']);
  if (localZone && localZone !== 'UTC') {
    lines.push(formatInZone(ms, localZone));
    seen.add(localZone);
  }
  for (const zone of zones) {
    if (seen.has(zone)) {
      continue;
    }
    seen.add(zone);
    if (zone === 'UTC') {
      continue;
    }
    lines.push(formatInZone(ms, zone));
  }
  return lines.join('\n');
}

function formatUnixSeconds(ms: number): string {
  return String(ms / 1000);
}

function formatUnixMilliseconds(ms: number): string {
  return String(ms);
}

function toIsoSafe(ms: number): string {
  try {
    return new Date(ms).toISOString();
  } catch {
    throw new Error('Timestamp is out of range.');
  }
}

function formatInZone(ms: number, timeZone: string): string {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
    timeZoneName: 'longOffset',
  });
  const parts = dtf.formatToParts(new Date(ms));
  const get = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((p) => p.type === type)?.value ?? '';
  const offset = normalizeOffset(get('timeZoneName'));
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}:${get('second')} ${offset}  ${timeZone}`;
}

function normalizeOffset(raw: string): string {
  if (!raw || raw === 'UTC' || raw === 'GMT') {
    return '+00:00';
  }
  const match = /GMT([+-])(\d{1,2})(?::?(\d{2}))?/.exec(raw);
  if (!match) {
    return '+00:00';
  }
  const sign = match[1];
  const hours = match[2].padStart(2, '0');
  const minutes = (match[3] ?? '00').padStart(2, '0');
  return `${sign}${hours}:${minutes}`;
}
