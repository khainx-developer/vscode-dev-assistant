import * as assert from 'assert';
import { toAnalysisView } from './analysisCardView';
import type { EvidenceBundle } from '../services/analysis/evidence';
import type { Analysis, ProposedAction } from '../services/analysis/types';

const JIRA_URL = 'https://acme.atlassian.net/browse/PM-33882';
const PR_URL = 'https://github.com/acme/web/pull/42';

function makeEvidence(links: Record<string, string>): EvidenceBundle {
  return { items: [], links };
}

function makeAnalysis(actions: ProposedAction[]): Analysis {
  return {
    itemKey: 'PM-33882',
    stateHash: 'hash',
    situation: 'Needs review',
    confidence: 'high',
    actions,
  };
}

suite('toAnalysisView openLabel', () => {
  test('reviewContext_withJiraEvidenceLink_labelsOpenInJira', () => {
    const view = toAnalysisView(
      makeAnalysis([{
        kind: 'review-context',
        title: 'Clarify the email attachment issue',
        evidence: ['ac'],
      }]),
      makeEvidence({ ac: JIRA_URL, pr: PR_URL }),
    );

    assert.strictEqual(view.actions[0].link, JIRA_URL);
    assert.strictEqual(view.actions[0].openLabel, 'Open in Jira');
  });

  test('reviewContext_withPrLink_labelsOpenPr', () => {
    const view = toAnalysisView(
      makeAnalysis([{
        kind: 'review-context',
        title: 'Review the uploader changes',
        evidence: ['pr'],
      }]),
      makeEvidence({ pr: PR_URL }),
    );

    assert.strictEqual(view.actions[0].link, PR_URL);
    assert.strictEqual(view.actions[0].openLabel, 'Open PR');
  });

  test('decide_withJiraUrl_labelsOpenInJira', () => {
    const view = toAnalysisView(
      makeAnalysis([{
        kind: 'decide',
        title: 'Pick an approach',
        evidence: [],
      }]),
      makeEvidence({}),
      { ticketUrl: JIRA_URL },
    );

    assert.strictEqual(view.actions[0].link, JIRA_URL);
    assert.strictEqual(view.actions[0].openLabel, 'Open in Jira');
  });

  test('decide_withPrUrl_labelsOpenPr', () => {
    const view = toAnalysisView(
      makeAnalysis([{
        kind: 'decide',
        title: 'Pick an approach',
        evidence: [],
      }]),
      makeEvidence({}),
      { prUrl: PR_URL },
    );

    assert.strictEqual(view.actions[0].link, PR_URL);
    assert.strictEqual(view.actions[0].openLabel, 'Open PR');
  });

  test('browsePathWithoutAtlassianHost_stillLabelsOpenInJira', () => {
    const browseUrl = 'https://jira.example.com/browse/WEB-99';
    const view = toAnalysisView(
      makeAnalysis([{
        kind: 'review-context',
        title: 'Review context',
        evidence: ['ac'],
      }]),
      makeEvidence({ ac: browseUrl }),
    );

    assert.strictEqual(view.actions[0].link, browseUrl);
    assert.strictEqual(view.actions[0].openLabel, 'Open in Jira');
  });
});
