#!/usr/bin/env node
// Learning-loop helper — see ai-factory/gates/learning-loop.md.
//   node ai-factory/tools/findings-report.mjs            print recurring patterns
//   node ai-factory/tools/findings-report.mjs --check    validate the log (exit 1 on errors)
//   node ai-factory/tools/findings-report.mjs --next-id  print the next finding ID
//   node ai-factory/tools/findings-report.mjs --write    regenerate docs/ai-learning/recurring.md
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const CATEGORIES = [
  'unindexed-filter', 'text-join', 'n-plus-1', 'full-entity-load', 'in-memory-join',
  'query-complexity', 'non-sargable', 'wrong-cardinality', 'unbounded-result',
  'duplication', 'long-method', 'list-scan-in-loop', 'multiple-enumeration',
  'business-in-query', 'layering', 'reuse-missed',
  'spec-missing', 'spec-wrong-ref', 'spec-contradiction', 'spec-unconfirmed-fact',
  'schema-not-migrated', 'test-blind-spot', 'untestable-code', 'scope-creep',
  'other',
];
export const ROOT_CAUSES = ['spec-gap', 'skill-gap', 'rule-ignored', 'domain-fact', 'process'];
export const SEVERITIES = ['High', 'Med', 'Low'];
export const STAGES = ['05', '06', '07', '08', 'retro'];
export const STATUSES = ['open', 'proposed', 'applied', 'wontfix'];
export const COLUMNS = ['id', 'date', 'story', 'stage', 'task', 'severity', 'category', 'rootCause', 'summary', 'evidence', 'status'];

/** Parse every data row of every findings table (rows whose first cell looks like `F-123`). */
export function parseFindings(markdown) {
  const rows = [];
  for (const [index, line] of markdown.split(/\r?\n/).entries()) {
    if (!/^\|\s*F-\d+/.test(line)) {
      continue;
    }
    const cells = line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
    const row = { line: index + 1 };
    COLUMNS.forEach((name, i) => { row[name] = cells[i] ?? ''; });
    row.cellCount = cells.length;
    rows.push(row);
  }
  return rows;
}

export function validate(rows) {
  const errors = [];
  const seen = new Set();
  const oneOf = (row, field, allowed) => {
    if (!allowed.includes(row[field])) {
      errors.push(`line ${row.line} (${row.id}): ${field} "${row[field]}" not in [${allowed.join(', ')}]`);
    }
  };
  for (const row of rows) {
    if (row.cellCount !== COLUMNS.length) {
      errors.push(`line ${row.line} (${row.id}): expected ${COLUMNS.length} columns, found ${row.cellCount}`);
      continue;
    }
    if (seen.has(row.id)) {
      errors.push(`line ${row.line}: duplicate ID ${row.id}`);
    }
    seen.add(row.id);
    oneOf(row, 'severity', SEVERITIES);
    oneOf(row, 'category', CATEGORIES);
    oneOf(row, 'rootCause', ROOT_CAUSES);
    oneOf(row, 'stage', STAGES);
    oneOf(row, 'status', STATUSES);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(row.date)) {
      errors.push(`line ${row.line} (${row.id}): date "${row.date}" is not YYYY-MM-DD`);
    }
    if (!row.evidence || /^(n\/a|-|tbd)$/i.test(row.evidence)) {
      errors.push(`line ${row.line} (${row.id}): evidence must be a verifiable path[:line]`);
    }
    if (row.summary.length > 120) {
      errors.push(`line ${row.line} (${row.id}): summary is ${row.summary.length} chars (max 120)`);
    }
    if (row.category === 'other' && row.summary.length < 20) {
      errors.push(`line ${row.line} (${row.id}): category "other" needs a descriptive summary`);
    }
  }
  return errors;
}

export function nextId(rows) {
  const max = rows.reduce((m, r) => Math.max(m, Number(r.id.replace('F-', '')) || 0), 0);
  return `F-${String(max + 1).padStart(3, '0')}`;
}

const SEVERITY_RANK = { High: 3, Med: 2, Low: 1 };

/** Recurring: >=2 distinct stories, or >=3 rows of severity >= Med, or any High with root cause rule-ignored.
 *  Only findings still open/proposed count — `applied`/`wontfix` are history. */
export function recurring(rows) {
  const live = rows.filter((r) => r.status === 'open' || r.status === 'proposed');
  const byCategory = new Map();
  for (const row of live) {
    if (!byCategory.has(row.category)) {
      byCategory.set(row.category, []);
    }
    byCategory.get(row.category).push(row);
  }
  const result = [];
  for (const [category, list] of byCategory) {
    const stories = new Set(list.map((r) => r.story));
    const medPlus = list.filter((r) => SEVERITY_RANK[r.severity] >= 2).length;
    const highIgnored = list.some((r) => r.severity === 'High' && r.rootCause === 'rule-ignored');
    if (stories.size >= 2 || medPlus >= 3 || highIgnored) {
      const causes = {};
      list.forEach((r) => { causes[r.rootCause] = (causes[r.rootCause] ?? 0) + 1; });
      const latest = [...list].sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))[0];
      result.push({ category, count: list.length, stories: [...stories], causes, latest,
        maxSeverity: list.reduce((m, r) => (SEVERITY_RANK[r.severity] > SEVERITY_RANK[m] ? r.severity : m), 'Low') });
    }
  }
  return result.sort((a, b) => SEVERITY_RANK[b.maxSeverity] - SEVERITY_RANK[a.maxSeverity] || b.count - a.count);
}

export function renderRecurring(rows) {
  const items = recurring(rows);
  const lines = [
    '# Recurring findings (generated — do not edit)',
    '',
    'Source: `docs/ai-learning/findings.md` via `node ai-factory/tools/findings-report.mjs --write`.',
    'Read this before planning or implementing code; copy relevant categories into the Task Package',
    'forbidden shapes / Common Mistakes section. Standard: `ai-factory/gates/learning-loop.md`.',
    '',
  ];
  if (items.length === 0) {
    lines.push('_No recurring categories yet._');
  }
  for (const item of items) {
    const causes = Object.entries(item.causes).map(([c, n]) => `${c}×${n}`).join(', ');
    lines.push(`- **${item.category}** — ${item.maxSeverity}, ${item.count} open, ${item.stories.length} stor${item.stories.length === 1 ? 'y' : 'ies'} (${causes}). Latest ${item.latest.id}: ${item.latest.summary} (\`${item.latest.evidence}\`)`);
  }
  lines.push('');
  return lines.join('\n');
}

function main() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
  const logPath = resolve(root, 'docs', 'ai-learning', 'findings.md');
  if (!existsSync(logPath)) {
    console.error(`findings log not found: ${logPath}`);
    process.exit(1);
  }
  const rows = parseFindings(readFileSync(logPath, 'utf8'));
  const args = process.argv.slice(2);
  if (args.includes('--next-id')) {
    console.log(nextId(rows));
    return;
  }
  const errors = validate(rows);
  if (args.includes('--check')) {
    errors.forEach((e) => console.error(e));
    console.log(errors.length === 0 ? `OK — ${rows.length} findings valid` : `${errors.length} error(s)`);
    process.exit(errors.length === 0 ? 0 : 1);
  }
  if (errors.length > 0) {
    errors.forEach((e) => console.error(e));
    console.error('Fix the findings log before regenerating (run with --check).');
    process.exit(1);
  }
  const out = renderRecurring(rows);
  if (args.includes('--write')) {
    writeFileSync(resolve(root, 'docs', 'ai-learning', 'recurring.md'), out);
    console.log(`wrote docs/ai-learning/recurring.md (${recurring(rows).length} recurring categories)`);
  } else {
    console.log(out);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
