import * as assert from 'assert';
import { validateAnalysis } from './validator';

const EVIDENCE_IDS = ['check:test', 'c1', 'pr'] as const;
const EVIDENCE_TEXT = [
  'Failed CancelBooking_NotOwner_Throws',
  'Failed CancelBooking_Postponed_Throws',
  'Alice asks why the retry was dropped',
  'PR #42 Add retry to uploader',
].join('\n');

function validPayload(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    itemKey: 'WEB-123',
    stateHash: 'abc',
    situation: 'CI failed with two booking tests',
    confidence: 'high',
    actions: [
      {
        kind: 'fix-ci',
        title: 'CI test failed: 2 tests to fix',
        evidence: ['check:test'],
        findings: [
          {
            label: 'CancelBooking_NotOwner_Throws',
            where: 'BookingTests.cs:100',
            why: 'expected 403, got 404',
          },
        ],
      },
    ],
    ...overrides,
  });
}

suite('validateAnalysis', () => {
  test('valid_plainJson_keepsActionsAndFindings', () => {
    const result = validateAnalysis(validPayload(), {
      allowedEvidenceIds: EVIDENCE_IDS,
      evidenceText: EVIDENCE_TEXT,
    });

    assert.strictEqual(result.ok, true);
    if (!result.ok) {
      return;
    }
    assert.strictEqual(result.analysis.itemKey, 'WEB-123');
    assert.strictEqual(result.analysis.actions.length, 1);
    assert.strictEqual(result.analysis.actions[0].kind, 'fix-ci');
    assert.strictEqual(result.analysis.actions[0].findings?.length, 1);
    assert.strictEqual(
      result.analysis.actions[0].findings?.[0].label,
      'CancelBooking_NotOwner_Throws',
    );
  });

  test('fenced_jsonCodeFence_isExtracted', () => {
    const reply = [
      'Here you go:',
      '```json',
      validPayload(),
      '```',
    ].join('\n');

    const result = validateAnalysis(reply, {
      allowedEvidenceIds: EVIDENCE_IDS,
      evidenceText: EVIDENCE_TEXT,
    });

    assert.strictEqual(result.ok, true);
    if (!result.ok) {
      return;
    }
    assert.strictEqual(result.analysis.actions[0].title, 'CI test failed: 2 tests to fix');
  });

  test('proseWrapped_findsFirstJsonObject', () => {
    const reply = `Sure. ${validPayload()} Hope that helps.`;

    const result = validateAnalysis(reply, {
      allowedEvidenceIds: EVIDENCE_IDS,
      evidenceText: EVIDENCE_TEXT,
    });

    assert.strictEqual(result.ok, true);
    if (!result.ok) {
      return;
    }
    assert.strictEqual(result.analysis.confidence, 'high');
  });

  test('wrongKind_dropsAction_andReturnsUnavailableWhenAllDropped', () => {
    const payload = validPayload({
      actions: [
        {
          kind: 'teleport',
          title: 'Invented kind',
          evidence: ['check:test'],
        },
      ],
    });

    const result = validateAnalysis(payload, {
      allowedEvidenceIds: EVIDENCE_IDS,
      evidenceText: EVIDENCE_TEXT,
    });

    assert.strictEqual(result.ok, false);
    if (result.ok) {
      return;
    }
    assert.strictEqual(result.reason, 'unavailable');
  });

  test('inventedEvidenceId_dropsAction', () => {
    const payload = validPayload({
      actions: [
        {
          kind: 'fix-ci',
          title: 'Uses a fake evidence id',
          evidence: ['check:test', 'invented'],
        },
      ],
    });

    const result = validateAnalysis(payload, {
      allowedEvidenceIds: EVIDENCE_IDS,
      evidenceText: EVIDENCE_TEXT,
    });

    assert.strictEqual(result.ok, false);
    if (result.ok) {
      return;
    }
    assert.strictEqual(result.reason, 'unavailable');
  });

  test('inventedFinding_isDropped_actionKept', () => {
    const payload = validPayload({
      actions: [
        {
          kind: 'fix-ci',
          title: 'CI test failed',
          evidence: ['check:test'],
          findings: [
            {
              label: 'CancelBooking_NotOwner_Throws',
              where: 'BookingTests.cs:100',
            },
            {
              label: 'TotallyMadeUp_Test',
              where: 'Nowhere.cs:1',
            },
          ],
        },
      ],
    });

    const result = validateAnalysis(payload, {
      allowedEvidenceIds: EVIDENCE_IDS,
      evidenceText: EVIDENCE_TEXT,
    });

    assert.strictEqual(result.ok, true);
    if (!result.ok) {
      return;
    }
    assert.strictEqual(result.analysis.actions.length, 1);
    assert.deepStrictEqual(
      result.analysis.actions[0].findings?.map((finding) => finding.label),
      ['CancelBooking_NotOwner_Throws'],
    );
  });
});
