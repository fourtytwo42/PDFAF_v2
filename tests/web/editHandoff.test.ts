import { describe, expect, it } from 'vitest';
import {
  chooseEditorHandoffAnalysis,
  chooseEditorHandoffSource,
} from '../../apps/pdf-af-web/lib/editor/editHandoff';
import type { AnalyzeSummary } from '../../apps/pdf-af-web/types/analyze';

function analysis(score: number): AnalyzeSummary {
  return {
    score,
    grade: score >= 90 ? 'A' : 'F',
    pageCount: 1,
    pdfClass: 'native_tagged',
    analysisDurationMs: 1,
    categories: [],
    findings: [],
    topFindings: [],
  };
}

describe('edit handoff source selection', () => {
  it('prefers fixed output when it is available', () => {
    expect(
      chooseEditorHandoffSource({
        fileStatus: 'available',
        hasServerSource: true,
        remediationResult: { before: analysis(20), after: analysis(95) },
      }),
    ).toBe('fixed');
  });

  it('does not open saved source before automatic remediation exists', () => {
    expect(chooseEditorHandoffSource({ fileStatus: 'none', hasServerSource: true })).toBe(
      'unavailable',
    );
  });

  it('does not open an available source unless it has remediation output', () => {
    expect(chooseEditorHandoffSource({ fileStatus: 'available', hasServerSource: true })).toBe(
      'unavailable',
    );
  });

  it('reports unavailable when no saved PDF can be opened', () => {
    expect(chooseEditorHandoffSource({ fileStatus: 'expired', hasServerSource: false })).toBe(
      'unavailable',
    );
  });

  it('uses fixed analysis for fixed-output handoff', () => {
    expect(
      chooseEditorHandoffAnalysis({
        fileStatus: 'available',
        hasServerSource: true,
        analyzeResult: analysis(20),
        remediationResult: { before: analysis(20), after: analysis(95) },
      })?.score,
    ).toBe(95);
  });

  it('does not provide original analysis for source-only handoff', () => {
    expect(
      chooseEditorHandoffAnalysis({
        fileStatus: 'none',
        hasServerSource: true,
        analyzeResult: analysis(20),
        remediationResult: { before: analysis(20), after: analysis(95) },
      }),
    ).toBeNull();
  });
});
