import { describe, expect, it } from 'vitest';
import {
  classifyAltObjectEvidence,
  summarizeAltTools,
  type AltObjectEvidenceInput,
} from '../../scripts/all-input-alt-object-diagnostic.js';
import type { AppliedRemediationTool } from '../../src/types.js';

function evidence(overrides: Partial<AltObjectEvidenceInput> = {}): AltObjectEvidenceInput {
  return {
    file: 'sample.pdf',
    runScore: 59,
    runGrade: 'F',
    score: 59,
    grade: 'F',
    altTextScore: 0,
    pdfUaScore: 79,
    tableMarkupScore: 100,
    checkerFigureCount: 2,
    checkerMissingAltCount: 1,
    rawReachableFigureCount: 2,
    rawReachableMissingAltCount: 1,
    nonFigureWithAltCount: 0,
    nestedFigureAltCount: 0,
    orphanedAltEmptyElementCount: 0,
    figureToolAttempts: [],
    ...overrides,
  };
}

describe('all-input alt object diagnostic helpers', () => {
  it('classifies direct checker-visible missing alt as a repair candidate', () => {
    expect(classifyAltObjectEvidence(evidence()).classification).toBe('direct_checker_alt_candidate');
  });

  it('separates ownership/role-map gaps from direct checker-visible targets', () => {
    expect(classifyAltObjectEvidence(evidence({
      checkerFigureCount: 0,
      checkerMissingAltCount: 0,
      rawReachableFigureCount: 4,
      rawReachableMissingAltCount: 3,
    })).classification).toBe('role_visibility_or_ownership_gap');
  });

  it('does not select rows where alt is not the primary blocker', () => {
    expect(classifyAltObjectEvidence(evidence({
      altTextScore: 100,
      checkerMissingAltCount: 0,
      rawReachableMissingAltCount: 0,
    })).classification).toBe('alt_not_primary_blocker');
  });

  it('tracks recovered rows as controls', () => {
    expect(classifyAltObjectEvidence(evidence({
      score: 98,
      grade: 'A',
      altTextScore: 100,
      checkerMissingAltCount: 0,
    })).classification).toBe('recovered_or_high');
  });

  it('classifies high run scores that fail reanalysis as protected drift', () => {
    expect(classifyAltObjectEvidence(evidence({
      runScore: 98,
      runGrade: 'A',
      score: 59,
      grade: 'F',
      altTextScore: 100,
      checkerMissingAltCount: 0,
      rawReachableMissingAltCount: 0,
    })).classification).toBe('protected_reanalysis_drift');
  });

  it('summarizes figure and alt tool details deterministically', () => {
    const tools: AppliedRemediationTool[] = [{
      toolName: 'retag_as_figure',
      outcome: 'applied',
      scoreBefore: 59,
      scoreAfter: 73,
      delta: 14,
      durationMs: 10,
      round: 1,
      stage: 6,
      source: 'deterministic',
      details: JSON.stringify({
        note: 'rolemap_figure_retagged',
        invariants: { targetRef: '2917_0' },
      }),
    } as AppliedRemediationTool, {
      toolName: 'normalize_table_structure',
      outcome: 'applied',
      scoreBefore: 59,
      scoreAfter: 59,
      delta: 0,
      durationMs: 10,
      round: 1,
      stage: 6,
      source: 'deterministic',
    } as AppliedRemediationTool];

    expect(summarizeAltTools(tools)).toEqual([{
      toolName: 'retag_as_figure',
      outcome: 'applied',
      scoreBefore: 59,
      scoreAfter: 73,
      delta: 14,
      targetRef: '2917_0',
      note: 'rolemap_figure_retagged',
    }]);
  });
});
