import type { AiCancellation } from '../ai/aiAssistant';
import { redactSecrets, type PromptMessage } from '../ai/prompts';
import type { EvidenceBundle } from './evidence';
import { evidenceIds } from './evidence';
import { analysisEvidenceText, buildAnalysisPrompt } from './prompt';
import type { Analysis } from './types';
import { validateAnalysis } from './validator';

export type AnalysisOutcome =
  | { status: 'cached'; analysis: Analysis }
  | { status: 'ok'; analysis: Analysis; firstTryValid: boolean }
  | { status: 'unavailable'; error: string; firstTryValid: boolean }
  | { status: 'cancelled' };

export interface AnalysisAiPort {
  complete(
    messages: PromptMessage[],
    token?: AiCancellation,
  ): Promise<string>;
}

export interface AnalysisCachePort {
  get(itemKey: string, stateHash: string): Analysis | undefined;
  set(itemKey: string, analysis: Analysis): void | Promise<void>;
}

export interface AnalysisMetricsPort {
  log(line: string): void;
}

export interface AnalysisServicePorts {
  ai: AnalysisAiPort;
  cache: AnalysisCachePort;
  metrics: AnalysisMetricsPort;
}

export interface RunAnalysisInput {
  itemKey: string;
  stateHash: string;
  evidence: EvidenceBundle;
  force?: boolean;
  token?: AiCancellation;
}

function redactEvidenceBundle(bundle: EvidenceBundle): EvidenceBundle {
  return {
    links: { ...bundle.links },
    items: bundle.items.map((item) => ({
      ...item,
      label: redactSecrets(item.label),
      text: redactSecrets(item.text),
    })),
  };
}

function isCancelled(token: AiCancellation | undefined): boolean {
  return !!token?.isCancellationRequested;
}

const FAILED_CHECK_CONCLUSION = /\bconclusion\s+(failure|timed_out|cancelled)\b/i;

/** Failed checks without a log excerpt must store confidence low, regardless of the model. */
export function hasFailedCheckWithoutLogExcerpt(evidence: EvidenceBundle): boolean {
  return evidence.items.some(
    (item) => item.kind === 'check' && FAILED_CHECK_CONCLUSION.test(item.text),
  );
}

function applyConfidenceCap(analysis: Analysis, evidence: EvidenceBundle): Analysis {
  if (!hasFailedCheckWithoutLogExcerpt(evidence)) {
    return analysis;
  }
  if (analysis.confidence === 'low') {
    return analysis;
  }
  return { ...analysis, confidence: 'low' };
}

/**
 * Evidence → AI → validate → retry once → cache.
 * Pure orchestration over ports (no vscode). One analysis at a time.
 */
export class AnalysisService {
  private chain: Promise<unknown> = Promise.resolve();
  private analysesRun = 0;
  private cacheHits = 0;
  private firstTryAttempts = 0;
  private firstTryPasses = 0;

  constructor(private readonly ports: AnalysisServicePorts) {}

  run(input: RunAnalysisInput): Promise<AnalysisOutcome> {
    const work = this.chain.then(() => this.runExclusive(input));
    this.chain = work.then(
      () => undefined,
      () => undefined,
    );
    return work;
  }

  private async runExclusive(input: RunAnalysisInput): Promise<AnalysisOutcome> {
    if (isCancelled(input.token)) {
      return { status: 'cancelled' };
    }

    if (!input.force) {
      const cached = this.ports.cache.get(input.itemKey, input.stateHash);
      if (cached) {
        this.cacheHits += 1;
        this.logSessionMetrics('cache hit');
        return { status: 'cached', analysis: cached };
      }
    }

    const evidence = redactEvidenceBundle(input.evidence);
    const allowedEvidenceIds = evidenceIds(evidence);
    const evidenceText = analysisEvidenceText(evidence);

    this.analysesRun += 1;
    this.firstTryAttempts += 1;

    const firstMessages = buildAnalysisPrompt({
      itemKey: input.itemKey,
      stateHash: input.stateHash,
      evidence,
    });
    const firstReply = await this.complete(firstMessages, input.token);
    if (firstReply === null) {
      return { status: 'cancelled' };
    }

    const firstValidation = validateAnalysis(firstReply, {
      allowedEvidenceIds,
      evidenceText,
    });
    if (firstValidation.ok) {
      this.firstTryPasses += 1;
      const analysis = applyConfidenceCap(
        withExpectedIdentity(firstValidation.analysis, input),
        evidence,
      );
      await this.ports.cache.set(input.itemKey, analysis);
      this.logSessionMetrics('first-try ok');
      return { status: 'ok', analysis, firstTryValid: true };
    }

    this.logSessionMetrics(`first-try fail: ${firstValidation.error}`);

    if (isCancelled(input.token)) {
      return { status: 'cancelled' };
    }

    const retryMessages = buildAnalysisPrompt({
      itemKey: input.itemKey,
      stateHash: input.stateHash,
      evidence,
      validationError: firstValidation.error,
    });
    const retryReply = await this.complete(retryMessages, input.token);
    if (retryReply === null) {
      return { status: 'cancelled' };
    }

    const retryValidation = validateAnalysis(retryReply, {
      allowedEvidenceIds,
      evidenceText,
    });
    if (retryValidation.ok) {
      const analysis = applyConfidenceCap(
        withExpectedIdentity(retryValidation.analysis, input),
        evidence,
      );
      await this.ports.cache.set(input.itemKey, analysis);
      this.logSessionMetrics('retry ok');
      return { status: 'ok', analysis, firstTryValid: false };
    }

    this.logSessionMetrics(`unavailable: ${retryValidation.error}`);
    return {
      status: 'unavailable',
      error: retryValidation.error,
      firstTryValid: false,
    };
  }

  private async complete(
    messages: PromptMessage[],
    token: AiCancellation | undefined,
  ): Promise<string | null> {
    if (isCancelled(token)) {
      return null;
    }
    try {
      return await this.ports.ai.complete(messages, token);
    } catch (error) {
      if (isCancelled(token)) {
        return null;
      }
      throw error;
    }
  }

  private logSessionMetrics(event: string): void {
    const rate = this.firstTryAttempts === 0
      ? 'n/a'
      : `${this.firstTryPasses}/${this.firstTryAttempts} (${Math.round((100 * this.firstTryPasses) / this.firstTryAttempts)}%)`;
    this.ports.metrics.log(
      `[analysis] ${event}; analysesRun=${this.analysesRun} cacheHits=${this.cacheHits} firstTryPass=${rate}`,
    );
  }
}

function withExpectedIdentity(analysis: Analysis, input: RunAnalysisInput): Analysis {
  return {
    ...analysis,
    itemKey: input.itemKey,
    stateHash: input.stateHash,
  };
}
