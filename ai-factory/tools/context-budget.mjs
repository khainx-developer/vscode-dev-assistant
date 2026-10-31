#!/usr/bin/env node
// Pre-code context budget per stage (approx tokens = chars / 4). See learning-loop.md §4:
// a change that grows a bundle must remove something. Run from the repo root:
//   node ai-factory/tools/context-budget.mjs           print sizes
//   node ai-factory/tools/context-budget.mjs --check   exit 1 if any bundle is over budget
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// { file, sections? } — sections: only those headings are counted (what the prompt tells the agent to read).
// This is a scaffold, not framework content: a project fills BUNDLES in with its own per-stage
// pre-code file lists (agent files, coding-standard.md sections that stage actually reads,
// docs/ai-learning/recurring.md, etc.) and a token budget for each. The one entry below is
// illustrative only — replace it with your own stage bundles.
export const BUNDLES = {
  'stage 05 developer (per code task, excl. the task package itself ~2-4K)': {
    budget: 15000,
    files: [
      { file: 'agent.md' },
      { file: 'ai-factory/gates/cis-standard.md' },
      { file: 'ai-factory/gates/coding-standard.md' },
    ],
  },
};

export const tokens = (text) => Math.ceil(text.length / 4);

/** Text under the given `## heading` (up to the next heading of the same or higher level). */
export function sectionText(markdown, heading) {
  const lines = markdown.split(/\r?\n/);
  const start = lines.findIndex((l) => /^#{1,6}\s/.test(l) && l.replace(/^#{1,6}\s+/, '').trim() === heading);
  if (start === -1) {
    throw new Error(`section not found: "${heading}"`);
  }
  const level = lines[start].match(/^#+/)[0].length;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    const m = lines[i].match(/^(#{1,6})\s/);
    if (m && m[1].length <= level) {
      end = i;
      break;
    }
  }
  return lines.slice(start, end).join('\n');
}

export function measure(root, bundle) {
  const rows = bundle.files.map(({ file, sections }) => {
    const path = resolve(root, file);
    if (!existsSync(path)) {
      return { file, tokens: 0, missing: true };
    }
    const text = readFileSync(path, 'utf8');
    const counted = sections ? sections.map((s) => sectionText(text, s)).join('\n') : text;
    return { file, tokens: tokens(counted), partial: Boolean(sections) };
  });
  return { rows, total: rows.reduce((n, r) => n + r.tokens, 0) };
}

function main() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
  let over = 0;
  for (const [name, bundle] of Object.entries(BUNDLES)) {
    const { rows, total } = measure(root, bundle);
    console.log(`\n${name}`);
    rows.forEach((r) => console.log(`  ${String(r.tokens).padStart(6)}  ${r.file}${r.partial ? '  (sections only)' : ''}${r.missing ? '  (MISSING)' : ''}`));
    const flag = total > bundle.budget ? `  OVER BUDGET by ${total - bundle.budget}` : '';
    console.log(`  ${String(total).padStart(6)}  TOTAL (budget ${bundle.budget})${flag}`);
    if (total > bundle.budget) {
      over++;
    }
  }
  if (process.argv.includes('--check') && over > 0) {
    console.error(`\n${over} bundle(s) over budget — remove text before adding text.`);
    process.exit(1);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
