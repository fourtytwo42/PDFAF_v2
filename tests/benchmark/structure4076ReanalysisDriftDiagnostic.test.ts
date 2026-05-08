import { describe, expect, it } from 'vitest';
import {
  classifyStructure4076ReanalysisDrift,
  compareStructure4076Evidence,
} from '../../scripts/structure4076-reanalysis-drift-diagnostic.js';
import type { RemediateBenchmarkRow } from '../../src/services/benchmark/experimentCorpus.js';

function category(key: string, score: number, applicable = true) {
  return {
    key,
    score,
    weight: 1,
    applicable,
    severity: score >= 90 ? 'pass' : 'moderate',
    findings: [],
    evidence: 'verified',
    verificationLevel: 'verified',
    manualReviewRequired: false,
    manualReviewReasons: [],
    countsTowardGrade: true,
    diagnosticOnly: false,
    measurementStatus: 'measured',
  } as RemediateBenchmarkRow['afterCategories'][number];
}

function row(input: Partial<RemediateBenchmarkRow> = {}): RemediateBenchmarkRow {
  return {
    id: input.id ?? 'structure-4076',
    file: input.file ?? 'structure-4076.pdf',
    cohort: input.cohort ?? 'test',
    sourceType: input.sourceType ?? 'original',
    intent: input.intent ?? 'test',
    beforeScore: input.beforeScore ?? 53,
    beforeGrade: input.beforeGrade ?? 'F',
    beforePdfClass: input.beforePdfClass ?? 'native_tagged',
    afterScore: input.afterScore ?? 70,
    afterGrade: input.afterGrade ?? 'C',
    afterPdfClass: input.afterPdfClass ?? 'native_tagged',
    afterCategories: input.afterCategories ?? [
      category('heading_structure', 45),
      category('reading_order', 45),
      category('table_markup', 100, false),
    ],
    afterDetectionProfile: input.afterDetectionProfile ?? {
      tableSignals: {
        tablesWithMisplacedCells: 0,
        misplacedCellCount: 0,
        irregularTableCount: 0,
        stronglyIrregularTableCount: 0,
        directCellUnderTableCount: 0,
      },
    } as RemediateBenchmarkRow['afterDetectionProfile'],
    afterIcjiaParity: input.afterIcjiaParity ?? {
      signals: { textLength: 1000, hasStructTree: true },
    } as RemediateBenchmarkRow['afterIcjiaParity'],
    reanalyzedScore: input.reanalyzedScore ?? 56,
    reanalyzedGrade: input.reanalyzedGrade ?? 'F',
    reanalyzedPdfClass: input.reanalyzedPdfClass ?? 'native_tagged',
    reanalyzedCategories: input.reanalyzedCategories ?? [
      category('heading_structure', 45),
      category('reading_order', 45),
      category('table_markup', 100, false),
    ],
    reanalyzedDetectionProfile: input.reanalyzedDetectionProfile ?? {
      tableSignals: {
        tablesWithMisplacedCells: 0,
        misplacedCellCount: 0,
        irregularTableCount: 0,
        stronglyIrregularTableCount: 0,
        directCellUnderTableCount: 0,
      },
    } as RemediateBenchmarkRow['reanalyzedDetectionProfile'],
    reanalyzedIcjiaParity: input.reanalyzedIcjiaParity ?? {
      signals: { textLength: 1000, hasStructTree: true },
    } as RemediateBenchmarkRow['reanalyzedIcjiaParity'],
    delta: input.delta ?? 17,
    appliedTools: input.appliedTools ?? [{
      toolName: 'embed_local_font_substitutes',
      stage: 11,
      round: 2,
      scoreBefore: 69,
      scoreAfter: 70,
      delta: 1,
      outcome: 'applied',
      details: JSON.stringify({
        debug: {
          replayState: {
            stateSignatureBefore: 'before',
            stateSignatureAfter: 'after',
          },
        },
      }),
      source: 'post_pass',
    }],
    rounds: input.rounds ?? [],
    analysisBeforeMs: input.analysisBeforeMs ?? 1000,
    remediationDurationMs: input.remediationDurationMs ?? 1000,
    wallRemediateMs: input.wallRemediateMs ?? 1000,
    analysisAfterMs: input.analysisAfterMs ?? 1000,
    totalPipelineMs: input.totalPipelineMs ?? 1000,
    error: input.error,
  } as RemediateBenchmarkRow;
}

describe('structure 4076 reanalysis drift diagnostic', () => {
  it('classifies below-floor protected reanalysis as analyzer drift when core evidence is preserved', () => {
    const report = classifyStructure4076ReanalysisDrift(row());
    expect(report.classification).toBe('analyzer_reanalysis_drift');
    expect(report.checkpointEligible).toBe(true);
    expect(report.evidence.textEvidencePreserved).toBe(true);
    expect(report.acceptedTimeline).toEqual([expect.objectContaining({
      toolName: 'embed_local_font_substitutes',
      replayStateBefore: 'before',
      replayStateAfter: 'after',
    })]);
  });

  it('classifies table evidence appearing during reanalysis as real PDF regression', () => {
    const report = classifyStructure4076ReanalysisDrift(row({
      reanalyzedCategories: [
        category('heading_structure', 45),
        category('reading_order', 45),
        category('table_markup', 0, true),
      ],
      reanalyzedDetectionProfile: {
        tableSignals: {
          tablesWithMisplacedCells: 0,
          misplacedCellCount: 0,
          irregularTableCount: 1,
          stronglyIrregularTableCount: 1,
          directCellUnderTableCount: 0,
        },
      } as RemediateBenchmarkRow['reanalyzedDetectionProfile'],
    }));
    expect(report.classification).toBe('real_pdf_regression');
    expect(report.reason).toContain('table evidence');
    expect(report.evidence.tableApplicabilityChanged).toBe(true);
    expect(report.evidence.tableSignalIncreased).toBe(true);
  });

  it('classifies text or tag loss as real PDF regression', () => {
    expect(classifyStructure4076ReanalysisDrift(row({
      reanalyzedIcjiaParity: { signals: { textLength: 900, hasStructTree: true } } as RemediateBenchmarkRow['reanalyzedIcjiaParity'],
    })).classification).toBe('real_pdf_regression');

    expect(classifyStructure4076ReanalysisDrift(row({
      reanalyzedIcjiaParity: { signals: { textLength: 1000, hasStructTree: false } } as RemediateBenchmarkRow['reanalyzedIcjiaParity'],
    })).classification).toBe('real_pdf_regression');
  });

  it('handles missing rows and below-floor checkpoints without crashing', () => {
    expect(classifyStructure4076ReanalysisDrift(undefined).classification).toBe('no_safe_checkpoint');
    expect(classifyStructure4076ReanalysisDrift(row({ afterScore: 69 })).classification).toBe('no_safe_checkpoint');
  });

  it('reports deterministic category deltas', () => {
    const evidence = compareStructure4076Evidence(row({
      afterCategories: [category('reading_order', 45), category('heading_structure', 45)],
      reanalyzedCategories: [category('reading_order', 40), category('heading_structure', 45)],
    }));
    expect(evidence.categoryDeltas.map(delta => delta.key)).toEqual(['heading_structure', 'reading_order']);
    expect(evidence.categoryDeltas.find(delta => delta.key === 'reading_order')).toMatchObject({
      afterScore: 45,
      reanalyzedScore: 40,
      delta: -5,
    });
  });
});
