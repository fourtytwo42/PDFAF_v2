import { describe, expect, it } from 'vitest';
import {
  buildLong4680ProtectedDriftReport,
} from '../../scripts/long4680-protected-drift-diagnostic.js';
import type { RemediateBenchmarkRow } from '../../src/services/benchmark/experimentCorpus.js';

function category(key: string, score: number, applicable = true) {
  return {
    key,
    score,
    weight: 1,
    applicable,
    severity: score >= 90 ? 'pass' : 'critical',
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

function tool(input: {
  toolName: string;
  outcome?: string;
  scoreBefore?: number;
  scoreAfter?: number;
  stateBefore?: string;
  stateAfter?: string;
  note?: string;
}) {
  return {
    toolName: input.toolName,
    stage: 1,
    round: 1,
    scoreBefore: input.scoreBefore ?? 80,
    scoreAfter: input.scoreAfter ?? 80,
    delta: (input.scoreAfter ?? 80) - (input.scoreBefore ?? 80),
    outcome: input.outcome ?? 'rejected',
    source: 'planner',
    details: JSON.stringify({
      raw: input.note,
      debug: {
        replayState: {
          stateSignatureBefore: input.stateBefore ?? 'before',
          stateSignatureAfter: input.stateAfter ?? 'after',
          scoreBefore: input.scoreBefore ?? 80,
          scoreAfter: input.scoreAfter ?? 80,
          categoryScoresBefore: { alt_text: 100, title_language: 0 },
          categoryScoresAfter: { alt_text: 0, title_language: 100 },
        },
      },
    }),
  } as RemediateBenchmarkRow['appliedTools'][number];
}

function row(input: Partial<RemediateBenchmarkRow> & { id?: string } = {}): RemediateBenchmarkRow {
  return {
    id: input.id ?? 'long-4680',
    file: `${input.id ?? 'long-4680'}.pdf`,
    cohort: 'test',
    sourceType: 'fixture',
    intent: 'test',
    beforeScore: 59,
    beforeGrade: 'F',
    beforePdfClass: 'native_tagged',
    afterScore: input.afterScore ?? 80,
    afterGrade: input.afterGrade ?? 'B',
    afterPdfClass: 'native_tagged',
    afterCategories: input.afterCategories ?? [
      category('title_language', 0),
      category('heading_structure', 78),
      category('alt_text', 100, false),
      category('reading_order', 96),
      category('pdf_ua_compliance', 50),
    ],
    afterIcjiaParity: input.afterIcjiaParity ?? {
      signals: { textLength: 1000, hasStructTree: true },
    } as RemediateBenchmarkRow['afterIcjiaParity'],
    afterDetectionProfile: input.afterDetectionProfile ?? {
      pageCount: 10,
    } as RemediateBenchmarkRow['afterDetectionProfile'],
    reanalyzedScore: input.reanalyzedScore ?? 59,
    reanalyzedGrade: input.reanalyzedGrade ?? 'F',
    reanalyzedPdfClass: 'native_tagged',
    reanalyzedCategories: input.reanalyzedCategories ?? [
      category('title_language', 0),
      category('heading_structure', 60),
      category('alt_text', 0),
      category('reading_order', 100),
      category('pdf_ua_compliance', 50),
    ],
    reanalyzedIcjiaParity: input.reanalyzedIcjiaParity ?? {
      signals: { textLength: 1000, hasStructTree: true },
    } as RemediateBenchmarkRow['reanalyzedIcjiaParity'],
    reanalyzedDetectionProfile: input.reanalyzedDetectionProfile ?? {
      pageCount: 10,
    } as RemediateBenchmarkRow['reanalyzedDetectionProfile'],
    protectedReanalysisSelection: input.protectedReanalysisSelection ?? {
      enabled: true,
      repeatCount: 5,
      repeatScores: [59, 59, 59, 59, 59],
      repeatGrades: ['F', 'F', 'F', 'F', 'F'],
      floorScore: 63,
      floorSafeIndexes: [],
      sameBuffer: true,
      selectedIndex: 0,
      selectedReason: 'best_score',
    },
    delta: null,
    appliedTools: input.appliedTools ?? [
      tool({ toolName: 'set_document_language', note: 'stage_regressed_score(59)', stateBefore: 'state-80', stateAfter: 'state-59' }),
    ],
    rounds: [],
    analysisBeforeMs: 1,
    remediationDurationMs: 1,
    wallRemediateMs: 1,
    analysisAfterMs: 1,
    totalPipelineMs: 1,
    error: input.error,
  } as RemediateBenchmarkRow;
}

function report(input: {
  current: RemediateBenchmarkRow;
  stage42?: RemediateBenchmarkRow;
  strict?: RemediateBenchmarkRow;
}) {
  return buildLong4680ProtectedDriftReport({
    generatedAt: '2026-05-08T00:00:00.000Z',
    stage42Run: 'stage42',
    strictRun: 'strict',
    currentRun: 'current',
    stage42Rows: [input.stage42 ?? row({ afterScore: 87, reanalyzedScore: 87, reanalyzedCategories: [category('alt_text', 12), category('title_language', 100)] })],
    strictRows: [input.strict ?? row({ afterScore: 92, reanalyzedScore: 92, reanalyzedCategories: [category('alt_text', 60), category('title_language', 100)] })],
    currentRows: [input.current],
  });
}

describe('long-4680 protected drift diagnostic', () => {
  it('classifies long-4680 shape as real PDF regression when protected reanalysis exposes alt/title loss', () => {
    const diagnostic = report({ current: row() });

    expect(diagnostic).toMatchObject({
      rowId: 'long-4680',
      classification: 'real_pdf_regression',
      currentAfterScore: 80,
      currentReanalyzedScore: 59,
      finalReanalysisDrop: 21,
      checkpointEligibleByScore: true,
      checkpointSafe: false,
    });
    expect(diagnostic.safety).toMatchObject({
      altApplicabilityRegressed: true,
      altEvidenceRegressed: true,
      titleEvidenceRegressed: false,
    });
    expect(diagnostic.reason).toContain('title/alt evidence regression');
  });

  it('classifies preserved evidence with below-floor repeats as analyzer drift but not safe to preserve', () => {
    const diagnostic = report({
      current: row({
        reanalyzedCategories: [
          category('title_language', 0),
          category('heading_structure', 78),
          category('alt_text', 100, false),
          category('reading_order', 96),
          category('pdf_ua_compliance', 50),
        ],
      }),
    });

    expect(diagnostic.classification).toBe('analyzer_reanalysis_drift');
    expect(diagnostic.checkpointSafe).toBe(false);
    expect(diagnostic.reason).toContain('All protected repeats are below floor');
  });

  it('classifies a floor-safe row as safe checkpoint candidate when evidence is preserved', () => {
    const diagnostic = report({
      current: row({
        reanalyzedScore: 79,
        reanalyzedCategories: [
          category('title_language', 0),
          category('heading_structure', 78),
          category('alt_text', 100, false),
          category('reading_order', 96),
          category('pdf_ua_compliance', 50),
        ],
        protectedReanalysisSelection: {
          enabled: true,
          repeatCount: 5,
          repeatScores: [80, 80, 79, 80, 80],
          repeatGrades: ['B', 'B', 'C', 'B', 'B'],
          floorScore: 80,
          floorSafeIndexes: [0, 1, 3, 4],
          sameBuffer: true,
          selectedIndex: 0,
          selectedReason: 'floor_safe',
        },
      }),
    });

    expect(diagnostic.classification).toBe('safe_checkpoint_candidate');
    expect(diagnostic.checkpointSafe).toBe(true);
  });

  it('treats page/text/tag or harmful PAC regression as unsafe', () => {
    expect(report({
      current: row({
        reanalyzedIcjiaParity: { signals: { textLength: 900, hasStructTree: true } } as RemediateBenchmarkRow['reanalyzedIcjiaParity'],
      }),
    }).classification).toBe('real_pdf_regression');

    expect(report({
      current: row({
        reanalyzedCategories: [
          category('title_language', 0),
          category('heading_structure', 78),
          category('alt_text', 100, false),
          category('reading_order', 96),
          category('pdf_ua_compliance', 50),
        ],
        appliedTools: [
          tool({ toolName: 'repair_structure_conformance', note: 'pac_rule_regressed(pdfua.structure.parent_links_valid)' }),
        ],
      }),
    }).classification).toBe('real_pdf_regression');
  });

  it('handles missing row evidence deterministically', () => {
    const diagnostic = buildLong4680ProtectedDriftReport({
      generatedAt: '2026-05-08T00:00:00.000Z',
      stage42Run: 'stage42',
      strictRun: 'strict',
      currentRun: 'current',
      stage42Rows: [],
      strictRows: [],
      currentRows: [],
    });

    expect(diagnostic).toMatchObject({
      classification: 'missing_evidence',
      checkpointSafe: false,
      currentAfterScore: null,
    });
  });
});
