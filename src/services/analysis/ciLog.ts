export type CiLogMatchTier = 'strong' | 'loose' | 'none';

export interface FailedTestGroup {
  name: string;
  variants: string[];
}

export interface CiLogExtraction {
  excerpt: string;
  failedTests: FailedTestGroup[];
  matchTier: CiLogMatchTier;
  summaryLine: string | null;
}

const STRONG =
  /##\[error\]|^\s*Failed\s+\S|^\s*Failed!|Test Run Failed|Error Message:|Stack Trace:|Process completed with exit code|^\s*FAIL\b|^\s*●.*›|\bAssertionError\b|^\s*E\s{3}|npm ERR!|\bBUILD FAILED\b|error (CS|TS|MSB)\d+/;
const LOOSE = /\bFailed\b|\bFAIL\b|\berror\b|Error:|Exception|Assert|exit code|\bfatal\b/i;
const NOISE = /^\s*(Passed|Skipped|PASS|PASSED|SKIPPED)\b/;
const CLEANUP_NOISE =
  /^Post job cleanup\.?$|Cleaning up orphan processes|^\s*\[command\].*\bgit\b|##\[section\]Finishing:/i;
const FAILED_TEST = /^\s*Failed\s+(.+?)(?:\s+\[[\d.]+\s*m?s\])?\s*$/;
const SUMMARY_PREFERRED = /^\s*Failed!\s+-/;
const SUMMARY_FALLBACK =
  /^Failed tests:|Test Run Failed|Tests:\s+\d+\s+failed|=\s*\d+\s+failed/i;

const CONTEXT_BEFORE = 2;
const CONTEXT_AFTER = 8;
const LINE_CLIP = 300;
const MAX_LINES = 120;
const MAX_CHARS = 8000;

const ANSI_RE = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g');
const LEADING_TIMESTAMP_RE =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?\s+/;

function stripLine(raw: string): string {
  return raw.replace(ANSI_RE, '').replace(LEADING_TIMESTAMP_RE, '');
}

function clipLine(line: string): string {
  if (line.length <= LINE_CLIP) {
    return line;
  }
  return `${line.slice(0, LINE_CLIP - 1)}…`;
}

function collectHitIndexes(lines: string[], pattern: RegExp): number[] {
  const hits: number[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (NOISE.test(line)) {
      continue;
    }
    if (pattern.test(line)) {
      hits.push(i);
    }
  }
  return hits;
}

function isDroppedLine(line: string): boolean {
  return NOISE.test(line) || CLEANUP_NOISE.test(line);
}

function buildKeepIndexes(lines: string[], hits: number[]): number[] {
  const keep = new Set<number>();
  for (const hit of hits) {
    const from = Math.max(0, hit - CONTEXT_BEFORE);
    const to = Math.min(lines.length - 1, hit + CONTEXT_AFTER);
    for (let i = from; i <= to; i += 1) {
      if (isDroppedLine(lines[i])) {
        continue;
      }
      keep.add(i);
    }
  }
  return [...keep].sort((a, b) => a - b);
}

function findSummaryLine(lines: string[]): string | null {
  for (const line of lines) {
    if (SUMMARY_PREFERRED.test(line) && !NOISE.test(line)) {
      return clipLine(line);
    }
  }
  for (const line of lines) {
    if (SUMMARY_FALLBACK.test(line) && !NOISE.test(line)) {
      return clipLine(line);
    }
  }
  return null;
}

function extractFailedTests(lines: string[]): FailedTestGroup[] {
  const fullNames: string[] = [];
  const seen = new Set<string>();

  for (const line of lines) {
    const match = line.match(FAILED_TEST);
    if (!match) {
      continue;
    }
    const name = match[1].trim();
    if (!name || seen.has(name)) {
      continue;
    }
    seen.add(name);
    fullNames.push(name);
  }

  const groups = new Map<string, FailedTestGroup>();
  for (const fullName of fullNames) {
    const paren = fullName.indexOf('(');
    const baseName = paren >= 0 ? fullName.slice(0, paren) : fullName;
    const existing = groups.get(baseName);
    if (!existing) {
      groups.set(baseName, {
        name: baseName,
        variants: paren >= 0 ? [fullName] : [],
      });
      continue;
    }
    if (paren >= 0 && !existing.variants.includes(fullName)) {
      existing.variants.push(fullName);
    }
  }

  return [...groups.values()];
}

function capExcerpt(selectedLines: string[]): string {
  if (selectedLines.length === 0) {
    return '';
  }

  let lines = selectedLines.map(clipLine);
  if (lines.length > MAX_LINES) {
    const head = Math.floor(MAX_LINES / 2);
    const tail = MAX_LINES - head;
    lines = [
      ...lines.slice(0, head),
      '…',
      ...lines.slice(lines.length - tail),
    ];
  }

  const text = lines.join('\n');
  if (text.length <= MAX_CHARS) {
    return text;
  }

  const half = Math.floor(MAX_CHARS / 2);
  const marker = '\n…\n';
  return `${text.slice(0, half)}${marker}${text.slice(text.length - (MAX_CHARS - half - marker.length))}`;
}

export function extractCiFailure(logText: string): CiLogExtraction {
  const lines = logText.split(/\r?\n/).map(stripLine);

  const strongHits = collectHitIndexes(lines, STRONG);
  let matchTier: CiLogMatchTier = 'none';
  let hits: number[] = [];

  if (strongHits.length > 0) {
    matchTier = 'strong';
    hits = strongHits;
  } else {
    const looseHits = collectHitIndexes(lines, LOOSE);
    if (looseHits.length > 0) {
      matchTier = 'loose';
      hits = looseHits;
    }
  }

  const keepIndexes = buildKeepIndexes(lines, hits);
  const selected = keepIndexes.map((index) => lines[index]);
  const summaryLine = findSummaryLine(lines);

  if (summaryLine) {
    const alreadyIncluded = selected.some((line) => clipLine(line) === summaryLine);
    if (!alreadyIncluded) {
      selected.push(summaryLine);
    }
  }

  return {
    excerpt: capExcerpt(selected),
    failedTests: extractFailedTests(lines),
    matchTier,
    summaryLine,
  };
}
