export type ActionKind =
  | 'answer-question'
  | 'reply'
  | 'code-change'
  | 'fix-ci'
  | 'decide'
  | 'follow-up'
  | 'review-context'
  | 'none';

export type AnalysisConfidence = 'high' | 'medium' | 'low';

export interface Finding {
  label: string;
  where?: string;
  why?: string;
}

export interface ProposedAction {
  kind: ActionKind;
  title: string;
  detail?: string;
  evidence: string[];
  findings?: Finding[];
  draft?: string;
  checklist?: string[];
}

export interface Analysis {
  itemKey: string;
  stateHash: string;
  situation: string;
  confidence: AnalysisConfidence;
  actions: ProposedAction[];
}

export type EvidenceKind =
  | 'pr'
  | 'ticket'
  | 'comment'
  | 'thread'
  | 'check'
  | 'acceptance'
  | 'log';

export interface EvidenceItem {
  id: string;
  kind: EvidenceKind;
  label: string;
  text: string;
  url?: string;
}

export const ACTION_KINDS: readonly ActionKind[] = [
  'answer-question',
  'reply',
  'code-change',
  'fix-ci',
  'decide',
  'follow-up',
  'review-context',
  'none',
] as const;

export const ANALYSIS_CONFIDENCES: readonly AnalysisConfidence[] = [
  'high',
  'medium',
  'low',
] as const;
