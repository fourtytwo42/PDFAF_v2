import { describe, expect, it } from 'vitest';
import type { AnalysisResult, AppliedRemediationTool, CategoryKey, DocumentSnapshot } from '../../src/types.js';
import {
  stage174BuildMixedTransactionTargets,
  stage174MixedTransactionCandidate,
  stage174MixedTransactionFinalDecision,
} from '../../src/services/remediation/mixedResidualTransaction.js';

function analysis(score = 59, overrides: Partial<Record<CategoryKey, number>> = {}): AnalysisResult {
  const categories: Partial<Record<CategoryKey, number>> = {
    heading_structure: 94,
    reading_order: 100,
    alt_text: 0,
    table_markup: 72,
    pdf_ua_compliance: 71,
    link_quality: 100,
    ...overrides,
  };
  return {
    score,
    grade: score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 70 ? 'C' : score >= 60 ? 'D' : 'F',
    pdfClass: 'native_tagged',
    categories: Object.entries(categories).map(([key, value]) => ({
      key: key as CategoryKey,
      score: value ?? 0,
      applicable: true,
    })),
    issues: [],
    suggestions: [],
    scoreCapsApplied: [],
  } as unknown as AnalysisResult;
}

function snapshot(overrides: Partial<DocumentSnapshot> = {}): DocumentSnapshot {
  return {
    pdfClass: 'native_tagged',
    pageCount: 66,
    textByPage: ['title'],
    textCharCount: 9000,
    imageOnlyPageCount: 0,
    metadata: {},
    links: [],
    formFieldsFromPdfjs: [],
    isTagged: true,
    markInfo: { Marked: true },
    lang: 'en-US',
    pdfUaVersion: '1',
    headings: [{ level: 1, text: 'Heading', page: 1, structRef: '10_0' }],
    figures: [
      { structRef: '2076_0', page: 63, hasAlt: false, isArtifact: false, role: 'Figure', reachable: true, directContent: true, subtreeMcidCount: 1 },
      { structRef: '2084_0', page: 64, hasAlt: false, isArtifact: false, role: 'Figure', reachable: true, directContent: true, subtreeMcidCount: 1 },
      { structRef: '2089_0', page: 65, hasAlt: false, isArtifact: false, role: 'Figure', reachable: true, directContent: true, subtreeMcidCount: 1 },
    ],
    checkerFigureTargets: [
      { structRef: '2076_0', page: 63, hasAlt: false, isArtifact: false, role: 'Figure', resolvedRole: 'Figure', reachable: true, directContent: true, parentPath: ['Document'] },
      { structRef: '2084_0', page: 64, hasAlt: false, isArtifact: false, role: 'Figure', resolvedRole: 'Figure', reachable: true, directContent: true, parentPath: ['Document'] },
      { structRef: '2089_0', page: 65, hasAlt: false, isArtifact: false, role: 'Figure', resolvedRole: 'Figure', reachable: true, directContent: true, parentPath: ['Document'] },
    ],
    tables: [
      {
        structRef: '2519_0',
        page: 70,
        hasHeaders: true,
        headerCount: 2,
        totalCells: 20,
        rowCount: 5,
        cellsMisplacedCount: 0,
        irregularRows: 4,
        dominantColumnCount: 4,
        reachable: true,
        directContent: true,
        subtreeMcidCount: 8,
      },
      {
        structRef: '2607_0',
        page: 72,
        hasHeaders: true,
        headerCount: 2,
        totalCells: 16,
        rowCount: 4,
        cellsMisplacedCount: 0,
        irregularRows: 3,
        dominantColumnCount: 4,
        reachable: true,
        directContent: true,
        subtreeMcidCount: 6,
      },
    ],
    paragraphStructElems: [],
    orphanMcids: [],
    taggedContentAudit: {
      orphanMcidCount: 64,
      mcidTextSpanCount: 100,
      suspectedPathPaintOutsideMc: 2,
    },
    fonts: [],
    bookmarks: [],
    formFields: [],
    structureTree: { type: 'Document', children: [] },
    imageToTextRatio: 0,
    ...overrides,
  } as unknown as DocumentSnapshot;
}

function applied(toolName: string, targetRef: string): AppliedRemediationTool {
  return {
    toolName,
    stage: 1,
    round: 1,
    scoreBefore: 59,
    scoreAfter: 59,
    delta: 0,
    outcome: 'applied',
    details: JSON.stringify({ outcome: 'applied', invariants: { targetRef } }),
  };
}

describe('Stage 174 mixed residual transaction helpers', () => {
  it('selects a 4213-style mixed alt/table/PDF-UA transaction candidate', () => {
    const decision = stage174MixedTransactionCandidate({
      analysis: analysis(),
      snapshot: snapshot(),
      isOcr: false,
    });

    expect(decision).toMatchObject({
      shouldAttempt: true,
      reason: 'stage174_mixed_transaction_candidate',
    });
    expect(decision.targets.altTargets.map(target => target.structRef)).toEqual(['2076_0', '2084_0', '2089_0']);
    expect(decision.targets.tableTargets.map(target => target.structRef)).toEqual(['2519_0', '2607_0']);
  });

  it('skips refs already attempted by the regular route', () => {
    const targets = stage174BuildMixedTransactionTargets(snapshot(), [
      applied('set_figure_alt_text', '2076_0'),
      applied('normalize_table_structure', '2519_0'),
    ]);

    expect(targets.altTargets.map(target => target.structRef)).toEqual(['2084_0', '2089_0']);
    expect(targets.tableTargets.map(target => target.structRef)).toEqual(['2607_0']);
  });

  it('rejects 4767-style alt/PDF-UA-only rows without a table target', () => {
    const decision = stage174MixedTransactionCandidate({
      analysis: analysis(82, { table_markup: 100 }),
      snapshot: snapshot({ tables: [] }),
      isOcr: false,
    });

    expect(decision.shouldAttempt).toBe(false);
    expect(decision.reason).toContain('not_mixed_alt_table_pdfua');
  });

  it('rejects OCR/manual rows and rows without safe alt/table targets', () => {
    expect(stage174MixedTransactionCandidate({
      analysis: analysis(),
      snapshot: snapshot(),
      isOcr: true,
    }).reason).toBe('ocr_or_scanned_row_not_stage174_target');

    expect(stage174MixedTransactionCandidate({
      analysis: analysis(),
      snapshot: snapshot({ checkerFigureTargets: [], figures: [] }),
      isOcr: false,
    }).reason).toBe('no_safe_unattempted_alt_targets');
  });

  it('commits only when final reanalysis improves score and a target category without regressions', () => {
    const decision = stage174MixedTransactionFinalDecision({
      before: analysis(59),
      final: analysis(84, { alt_text: 80, table_markup: 100, pdf_ua_compliance: 71 }),
      beforeSnapshot: snapshot(),
      finalSnapshot: snapshot(),
      pdfUaAttempted: true,
      altTargetCount: 3,
      tableTargetCount: 2,
    });

    expect(decision.accept).toBe(true);
    expect(decision.details.categoryDeltas.alt_text).toBe(80);
    expect(decision.details.categoryDeltas.table_markup).toBe(28);
  });

  it('rolls back on core category regression or no score gain', () => {
    const regressed = stage174MixedTransactionFinalDecision({
      before: analysis(59),
      final: analysis(84, { alt_text: 80, table_markup: 100, reading_order: 65 }),
      beforeSnapshot: snapshot(),
      finalSnapshot: snapshot(),
      pdfUaAttempted: false,
      altTargetCount: 3,
      tableTargetCount: 2,
    });
    expect(regressed.accept).toBe(false);
    expect(regressed.details.regressionReasons).toContain('reading_order:100->65');

    const unchanged = stage174MixedTransactionFinalDecision({
      before: analysis(59),
      final: analysis(59, { alt_text: 80, table_markup: 100 }),
      beforeSnapshot: snapshot(),
      finalSnapshot: snapshot(),
      pdfUaAttempted: false,
      altTargetCount: 3,
      tableTargetCount: 2,
    });
    expect(unchanged.accept).toBe(false);
  });
});
