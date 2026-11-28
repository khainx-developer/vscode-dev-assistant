import {
  ACTION_KINDS,
  ANALYSIS_CONFIDENCES,
  type ActionKind,
  type Analysis,
  type AnalysisConfidence,
  type Finding,
  type ProposedAction,
} from './types';

export type ValidateAnalysisFailureReason = 'unparseable' | 'invalid' | 'unavailable';

export type ValidateAnalysisResult =
  | { ok: true; analysis: Analysis }
  | { ok: false; reason: ValidateAnalysisFailureReason; error: string };

export interface ValidateAnalysisOptions {
  allowedEvidenceIds: ReadonlySet<string> | readonly string[];
  evidenceText: string;
}

interface AnalysisShell {
  itemKey: string;
  stateHash: string;
  situation: string;
  confidence: AnalysisConfidence;
  actions: unknown[];
}

function isActionKind(value: unknown): value is ActionKind {
  return typeof value === 'string' && (ACTION_KINDS as readonly string[]).includes(value);
}

function isConfidence(value: unknown): value is AnalysisConfidence {
  return typeof value === 'string'
    && (ANALYSIS_CONFIDENCES as readonly string[]).includes(value);
}

function toEvidenceIdSet(
  allowed: ReadonlySet<string> | readonly string[],
): ReadonlySet<string> {
  return allowed instanceof Set ? allowed : new Set(allowed);
}

function extractBalancedObject(source: string, start: number): string | null {
  if (source[start] !== '{') {
    return null;
  }

  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = start; i < source.length; i += 1) {
    const ch = source[i];

    if (inString) {
      if (escape) {
        escape = false;
        continue;
      }
      if (ch === '\\') {
        escape = true;
        continue;
      }
      if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === '{') {
      depth += 1;
      continue;
    }
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        return source.slice(start, i + 1);
      }
    }
  }

  return null;
}

export function extractFirstJsonObject(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }

  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenceMatch ? fenceMatch[1].trim() : trimmed;

  if (candidate.startsWith('{')) {
    try {
      JSON.parse(candidate);
      return candidate;
    } catch {
      const balanced = extractBalancedObject(candidate, 0);
      if (balanced) {
        return balanced;
      }
    }
  }

  const start = candidate.indexOf('{');
  if (start < 0) {
    return null;
  }

  return extractBalancedObject(candidate, start);
}

function asOptionalString(value: unknown): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== 'string') {
    return undefined;
  }
  return value;
}

function sanitizeFindings(
  rawFindings: unknown,
  evidenceText: string,
): Finding[] | undefined {
  if (rawFindings === undefined || rawFindings === null) {
    return undefined;
  }
  if (!Array.isArray(rawFindings)) {
    return undefined;
  }

  const findings: Finding[] = [];
  for (const entry of rawFindings) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      continue;
    }
    const record = entry as Record<string, unknown>;
    const label = typeof record.label === 'string' ? record.label.trim() : '';
    if (!label) {
      continue;
    }
    if (!evidenceText.includes(label)) {
      continue;
    }

    const finding: Finding = { label };
    const where = asOptionalString(record.where);
    if (where !== undefined && where.trim()) {
      finding.where = where;
    }
    const why = asOptionalString(record.why);
    if (why !== undefined && why.trim()) {
      finding.why = why;
    }
    findings.push(finding);
  }

  return findings.length > 0 ? findings : undefined;
}

function sanitizeAction(
  raw: unknown,
  allowedEvidenceIds: ReadonlySet<string>,
  evidenceText: string,
): ProposedAction | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }

  const record = raw as Record<string, unknown>;
  if (!isActionKind(record.kind)) {
    return null;
  }

  const title = typeof record.title === 'string' ? record.title.trim() : '';
  if (!title) {
    return null;
  }

  if (!Array.isArray(record.evidence)) {
    return null;
  }

  const evidence: string[] = [];
  for (const id of record.evidence) {
    if (typeof id !== 'string' || !id.trim()) {
      return null;
    }
    if (!allowedEvidenceIds.has(id)) {
      return null;
    }
    evidence.push(id);
  }

  const action: ProposedAction = {
    kind: record.kind,
    title,
    evidence,
  };

  const detail = asOptionalString(record.detail);
  if (detail !== undefined && detail.trim()) {
    action.detail = detail;
  }

  const draft = asOptionalString(record.draft);
  if (draft !== undefined) {
    action.draft = draft;
  }

  if (Array.isArray(record.checklist)) {
    const checklist = record.checklist
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter(Boolean);
    if (checklist.length > 0) {
      action.checklist = checklist;
    }
  }

  const findings = sanitizeFindings(record.findings, evidenceText);
  if (findings) {
    action.findings = findings;
  }

  return action;
}

function parseAnalysisShell(value: unknown): AnalysisShell | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const itemKey = typeof record.itemKey === 'string' ? record.itemKey.trim() : '';
  if (!itemKey) {
    return null;
  }
  if (typeof record.stateHash !== 'string') {
    return null;
  }
  if (typeof record.situation !== 'string') {
    return null;
  }
  if (!isConfidence(record.confidence)) {
    return null;
  }
  if (!Array.isArray(record.actions)) {
    return null;
  }

  return {
    itemKey,
    stateHash: record.stateHash,
    situation: record.situation,
    confidence: record.confidence,
    actions: record.actions,
  };
}

export function validateAnalysis(
  rawReply: string,
  options: ValidateAnalysisOptions,
): ValidateAnalysisResult {
  const jsonText = extractFirstJsonObject(rawReply);
  if (!jsonText) {
    return { ok: false, reason: 'unparseable', error: 'No JSON object found in reply' };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'JSON parse failed';
    return { ok: false, reason: 'unparseable', error: message };
  }

  const shell = parseAnalysisShell(parsed);
  if (!shell) {
    return { ok: false, reason: 'invalid', error: 'Analysis JSON does not match the schema' };
  }

  const allowedEvidenceIds = toEvidenceIdSet(options.allowedEvidenceIds);
  const hadActions = shell.actions.length > 0;
  const actions: ProposedAction[] = [];

  for (const rawAction of shell.actions) {
    const action = sanitizeAction(rawAction, allowedEvidenceIds, options.evidenceText);
    if (action) {
      actions.push(action);
    }
  }

  if (hadActions && actions.length === 0) {
    return {
      ok: false,
      reason: 'unavailable',
      error: 'Every action was dropped by validation',
    };
  }

  return {
    ok: true,
    analysis: {
      itemKey: shell.itemKey,
      stateHash: shell.stateHash,
      situation: shell.situation,
      confidence: shell.confidence,
      actions,
    },
  };
}
