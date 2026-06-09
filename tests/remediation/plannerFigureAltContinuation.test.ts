import { describe, expect, it } from 'vitest';
import {
  maxFigureAltTargetsForRun,
  shouldAllowStage146FigureAltContinuation,
  STAGE146_FIGURE_ALT_TARGETS_PER_RUN,
} from '../../src/services/remediation/planner.js';
import type { AnalysisResult, AppliedRemediationTool, CategoryKey, DocumentSnapshot } from '../../src/types.js';

function analysis(input: {
  score?: number;
  categories?: Partial<Record<CategoryKey, number>>;
} = {}): AnalysisResult {
  return {
    id: 'analysis',
    timestamp: '2026-05-14T00:00:00.000Z',
    filename: 'fixture.pdf',
    pageCount: 1,
    pdfClass: 'native_tagged',
    score: input.score ?? 72,
    grade: 'D',
    categories: Object.entries(input.categories ?? {}).map(([key, score]) => ({
      key: key as CategoryKey,
      score: score ?? 100,
      weight: 1,
      applicable: true,
      severity: 'warning' as const,
      findings: [],
    })),
    findings: [],
    analysisDurationMs: 1,
  } as AnalysisResult;
}

function snapshot(): DocumentSnapshot {
  return {
    textCharCount: 1000,
    figures: [],
    checkerFigureTargets: [
      {
        structRef: '10_0',
        role: 'Figure',
        resolvedRole: 'Figure',
        reachable: true,
        hasAlt: false,
        isArtifact: false,
        directContent: true,
      },
    ],
  } as DocumentSnapshot;
}

function appliedAlt(ref: string): AppliedRemediationTool {
  return {
    toolName: 'set_figure_alt_text',
    stage: 6,
    round: 1,
    scoreBefore: 72,
    scoreAfter: 72,
    delta: 0,
    outcome: 'applied',
    details: JSON.stringify({ invariants: { targetRef: ref } }),
    durationMs: 100,
    source: 'planner',
  };
}

describe('stage146 figure-alt continuation', () => {
  it('keeps enough continuation budget for annual-report scale missing-alt debt', () => {
    expect(STAGE146_FIGURE_ALT_TARGETS_PER_RUN).toBeGreaterThanOrEqual(36);
  });

  it('keeps the extended alt target cap when non-alt structure is stable', () => {
    const current = analysis({
      categories: {
        alt_text: 20,
        heading_structure: 79,
        reading_order: 95,
        table_markup: 95,
      },
    });
    const alreadyApplied = [appliedAlt('1_0'), appliedAlt('2_0'), appliedAlt('3_0')];

    expect(shouldAllowStage146FigureAltContinuation(current, snapshot(), alreadyApplied)).toBe(true);
    expect(maxFigureAltTargetsForRun(current, snapshot(), alreadyApplied)).toBe(STAGE146_FIGURE_ALT_TARGETS_PER_RUN);
  });

  it('uses the default alt target cap when mixed table debt remains', () => {
    const current = analysis({
      categories: {
        alt_text: 20,
        heading_structure: 79,
        reading_order: 95,
        table_markup: 3,
      },
    });
    const alreadyApplied = [appliedAlt('1_0'), appliedAlt('2_0'), appliedAlt('3_0')];

    expect(shouldAllowStage146FigureAltContinuation(current, snapshot(), alreadyApplied)).toBe(false);
    expect(maxFigureAltTargetsForRun(current, snapshot(), alreadyApplied)).toBe(alreadyApplied.length);
  });

  it('uses the default alt target cap when reading-order debt remains', () => {
    const current = analysis({
      categories: {
        alt_text: 20,
        heading_structure: 79,
        reading_order: 79,
        table_markup: 95,
      },
    });
    const alreadyApplied = [appliedAlt('1_0'), appliedAlt('2_0'), appliedAlt('3_0')];

    expect(shouldAllowStage146FigureAltContinuation(current, snapshot(), alreadyApplied)).toBe(false);
    expect(maxFigureAltTargetsForRun(current, snapshot(), alreadyApplied)).toBe(alreadyApplied.length);
  });
});
