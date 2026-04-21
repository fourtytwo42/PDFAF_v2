import { describe, expect, it } from 'vitest';
import { classifyBatchEquivalence, type BatchEquivalenceInput, type BatchEquivalencePathResult } from '../../src/services/remediation/batchEquivalenceDiagnostics.js';
import type { PlannedRemediationTool } from '../../src/types.js';

const tools: PlannedRemediationTool[] = [
  { toolName: 'repair_native_link_structure', params: {}, rationale: 'test', route: 'annotation_link_normalization' },
  { toolName: 'set_link_annotation_contents', params: {}, rationale: 'test', route: 'annotation_link_normalization' },
];

function path(overrides: Partial<BatchEquivalencePathResult> = {}): BatchEquivalencePathResult {
  return {
    score: 88,
    categories: { link_quality: 90, reading_order: 90 },
    manualReviewReasons: [],
    scoreCaps: [],
    structuralConfidence: 'medium',
    opRows: [
      { toolName: 'repair_native_link_structure', outcome: 'no_effect', details: JSON.stringify({ outcome: 'no_effect' }) },
      { toolName: 'set_link_annotation_contents', outcome: 'applied', details: JSON.stringify({
        outcome: 'applied',
        invariants: { ownershipPreserved: true },
        structuralBenefits: { annotationOwnershipImproved: true },
      }) },
    ],
    snapshotSignals: {
      headingCount: 1,
      headingDepth: 2,
      readingOrderDepth: 2,
      checkerVisibleFigureCount: 1,
      checkerVisibleFigureMissingAlt: 0,
      tableHeaderCount: 2,
      malformedTableCount: 0,
      annotationMissingStructure: 0,
      annotationMissingStructParent: 0,
    },
    nextScheduledTools: ['normalize_annotation_tab_order'],
    ...overrides,
  };
}

function input(batchOverrides: Partial<BatchEquivalencePathResult> = {}, seqOverrides: Partial<BatchEquivalencePathResult> = {}): BatchEquivalenceInput {
  return {
    fileId: 'doc',
    bundleRole: 'annotation_link_ownership',
    tools,
    sequential: path(seqOverrides),
    batch: path(batchOverrides),
  };
}

describe('batch equivalence diagnostics', () => {
  it('marks identical sequential and batch results as safe', () => {
    const result = classifyBatchEquivalence(input());
    expect(result.classification).toBe('safe');
    expect(result.reasons).toEqual([]);
  });

  it('marks total score regression as unsafe', () => {
    const result = classifyBatchEquivalence(input({ score: 87 }));
    expect(result.classification).toBe('unsafe');
    expect(result.reasons).toContain('score_regression');
  });

  it('marks category regression as unsafe even when total score is flat', () => {
    const result = classifyBatchEquivalence(input({ categories: { link_quality: 89, reading_order: 91 } }));
    expect(result.classification).toBe('unsafe');
    expect(result.reasons).toContain('category_regression');
  });

  it('marks missing structural benefit as unsafe when sequential had it', () => {
    const result = classifyBatchEquivalence(input({
      opRows: [
        { toolName: 'repair_native_link_structure', outcome: 'no_effect', details: JSON.stringify({ outcome: 'no_effect' }) },
        { toolName: 'set_link_annotation_contents', outcome: 'applied', details: JSON.stringify({
          outcome: 'applied',
          invariants: { ownershipPreserved: true },
        }) },
      ],
    }));
    expect(result.classification).toBe('unsafe');
    expect(result.reasons).toContain('benefit_missing');
  });

  it('marks snapshot signal regression as unsafe', () => {
    const result = classifyBatchEquivalence(input({
      snapshotSignals: {
        ...path().snapshotSignals!,
        annotationMissingStructure: 1,
      },
    }));
    expect(result.classification).toBe('unsafe');
    expect(result.reasons).toContain('snapshot_signal_regression');
  });

  it('marks downstream route divergence as unsafe', () => {
    const result = classifyBatchEquivalence(input({ nextScheduledTools: ['repair_alt_text_structure'] }));
    expect(result.classification).toBe('unsafe');
    expect(result.reasons).toContain('downstream_route_divergence');
  });

  it('fails closed as inconclusive when required diagnostic fields are missing', () => {
    const result = classifyBatchEquivalence(input({ snapshotSignals: undefined }));
    expect(result.classification).toBe('inconclusive');
    expect(result.reasons).toContain('missing_diagnostic_field');
  });

  it('marks invariant regression as unsafe', () => {
    const result = classifyBatchEquivalence(input({
      opRows: [
        { toolName: 'repair_native_link_structure', outcome: 'no_effect', details: JSON.stringify({ outcome: 'no_effect' }) },
        { toolName: 'set_link_annotation_contents', outcome: 'applied', details: JSON.stringify({
          outcome: 'applied',
          invariants: { ownershipPreserved: false },
          structuralBenefits: { annotationOwnershipImproved: true },
        }) },
      ],
    }));
    expect(result.classification).toBe('unsafe');
    expect(result.reasons).toContain('invariant_regression');
  });
});
