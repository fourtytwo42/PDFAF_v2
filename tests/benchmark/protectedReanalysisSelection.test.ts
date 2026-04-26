import { describe, expect, it } from 'vitest';
import {
  cachedProtectedReanalysis,
  protectedReanalysisCacheKey,
  protectedReanalysisRepeatCount,
  selectProtectedReanalysis,
  sha256Buffer,
} from '../../src/services/benchmark/protectedReanalysisSelection.js';
import type { AnalysisResult, ScoredCategory } from '../../src/types.js';

function category(key: ScoredCategory['key'], score: number): ScoredCategory {
  return {
    key,
    score,
    weight: 1,
    applicable: true,
    severity: score === 100 ? 'pass' : 'moderate',
    findings: [],
  };
}

function analysis(score: number, categories: ScoredCategory[] = [category('reading_order', score)]): AnalysisResult {
  return {
    id: `analysis-${score}`,
    timestamp: '2026-04-25T00:00:00.000Z',
    filename: 'sample.pdf',
    pageCount: 1,
    pdfClass: 'native_tagged',
    score,
    grade: score >= 90 ? 'A' : score >= 80 ? 'B' : 'F',
    categories,
    findings: [],
    analysisDurationMs: 10,
  };
}

describe('protected reanalysis selection', () => {
  it('selects a protected floor-safe repeat over unsafe repeats for the same buffer', () => {
    const hash = sha256Buffer(Buffer.from('stable bytes'));
    const selected = selectProtectedReanalysis({
      enabled: true,
      repeatCount: 3,
      baseline: {
        score: 95,
        categories: { reading_order: 95 },
        scoreCapsApplied: [],
      },
      candidates: [
        { index: 1, bufferSha256: hash, result: analysis(80, [category('reading_order', 80)]) },
        { index: 2, bufferSha256: hash, result: analysis(94, [category('reading_order', 95)]) },
        { index: 3, bufferSha256: hash, result: analysis(93, [category('reading_order', 95)]) },
      ],
    });

    expect(selected.candidate.index).toBe(2);
    expect(selected.summary.selectedReason).toBe('best_floor_safe');
    expect(selected.summary.floorSafeIndexes).toEqual([2, 3]);
    expect(selected.summary.repeatScores).toEqual([80, 94, 93]);
  });

  it('does not select best-of-N when protected baseline selection is disabled', () => {
    const hash = sha256Buffer(Buffer.from('unprotected'));
    const selected = selectProtectedReanalysis({
      enabled: false,
      repeatCount: 3,
      baseline: { score: 95, categories: { reading_order: 95 }, scoreCapsApplied: [] },
      candidates: [
        { index: 1, bufferSha256: hash, result: analysis(70) },
        { index: 2, bufferSha256: hash, result: analysis(99) },
      ],
    });

    expect(selected.candidate.index).toBe(1);
    expect(selected.summary.selectedReason).toBe('not_enabled');
  });

  it('refuses best-of-N selection if buffer hashes differ', () => {
    const selected = selectProtectedReanalysis({
      enabled: true,
      repeatCount: 3,
      baseline: { score: 95, categories: { reading_order: 95 }, scoreCapsApplied: [] },
      candidates: [
        { index: 1, bufferSha256: 'hash-a', result: analysis(70) },
        { index: 2, bufferSha256: 'hash-b', result: analysis(99) },
      ],
    });

    expect(selected.candidate.index).toBe(1);
    expect(selected.summary.sameBuffer).toBe(false);
    expect(selected.summary.selectedReason).toBe('single_analysis');
  });

  it('parses repeat count with default and cap', () => {
    expect(protectedReanalysisRepeatCount({} as NodeJS.ProcessEnv)).toBe(5);
    expect(protectedReanalysisRepeatCount({ PDFAF_PROTECTED_REANALYSIS_REPEATS: '9' } as NodeJS.ProcessEnv)).toBe(5);
    expect(protectedReanalysisRepeatCount({ PDFAF_PROTECTED_REANALYSIS_REPEATS: '0' } as NodeJS.ProcessEnv)).toBe(1);
    expect(protectedReanalysisRepeatCount({ PDFAF_PROTECTED_REANALYSIS_REPEATS: 'abc' } as NodeJS.ProcessEnv)).toBe(5);
  });

  it('uses a process-local cache for identical reanalysis keys', async () => {
    const cache = new Map<string, Promise<{ score: number }>>();
    const key = protectedReanalysisCacheKey({
      bufferSha256: 'hash',
      filename: 'sample.pdf',
      protectedBaselineEnabled: true,
      repeatCount: 3,
    });
    let calls = 0;
    const first = cachedProtectedReanalysis(cache, key, async () => {
      calls += 1;
      return { score: 95 };
    });
    const second = cachedProtectedReanalysis(cache, key, async () => {
      calls += 1;
      return { score: 70 };
    });

    await expect(first).resolves.toEqual({ score: 95 });
    await expect(second).resolves.toEqual({ score: 95 });
    expect(calls).toBe(1);
  });
});
