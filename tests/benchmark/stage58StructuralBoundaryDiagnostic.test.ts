import { describe, expect, it } from 'vitest';
import {
  buildStage58Report,
  buildStage58RowReport,
  compareStructuralField,
  type Stage58Repeat,
} from '../../scripts/stage58-structural-boundary-diagnostic.js';

function repeat(input: Partial<Stage58Repeat> = {}): Stage58Repeat {
  const defaultFields = {
    headings: [],
    figures: [],
    checkerFigureTargets: [],
    tables: [],
    paragraphStructElems: [],
    orphanMcids: [],
    mcidTextSpans: [],
    structureTree: null,
    taggedContentAudit: null,
    detectionSignals: {},
  };
  return {
    repeat: input.repeat ?? 1,
    score: input.score ?? 90,
    grade: input.grade ?? 'A',
    categoryScores: input.categoryScores ?? { heading_structure: 100, alt_text: 100 },
    detectionSignals: input.detectionSignals ?? {},
    fields: input.fields ? { ...defaultFields, ...input.fields } : defaultFields,
    runtimeMs: input.runtimeMs ?? 10,
    ...(input.error ? { error: input.error } : {}),
  };
}

describe('Stage 58 structural boundary diagnostic', () => {
  it('classifies pure array ordering variance as canonicalizable', () => {
    const result = compareStructuralField('headings', [
      [
        { page: 2, level: 1, structRef: '20_0', text: 'Second' },
        { page: 1, level: 1, structRef: '10_0', text: 'First' },
      ],
      [
        { page: 1, level: 1, structRef: '10_0', text: 'First' },
        { page: 2, level: 1, structRef: '20_0', text: 'Second' },
      ],
    ]);
    expect(result.kind).toBe('pure_ordering');
    expect(result.canonicalizable).toBe(true);
  });

  it('classifies exact duplicate ordering as canonicalizable', () => {
    const result = compareStructuralField('orphanMcids', [
      [{ page: 0, mcid: 1 }, { page: 0, mcid: 1 }, { page: 0, mcid: 2 }],
      [{ page: 0, mcid: 2 }, { page: 0, mcid: 1 }, { page: 0, mcid: 1 }],
    ]);
    expect(result.kind).toBe('pure_ordering');
    expect(result.canonicalizable).toBe(true);
  });

  it('classifies differing counts as non-canonicalizable duplicate/drop variance', () => {
    const result = compareStructuralField('paragraphStructElems', [
      [{ page: 0, structRef: '1_0', tag: 'P', text: 'A' }],
      [
        { page: 0, structRef: '1_0', tag: 'P', text: 'A' },
        { page: 0, structRef: '2_0', tag: 'P', text: 'B' },
      ],
    ]);
    expect(result.kind).toBe('duplicate_drop_variation');
    expect(result.canonicalizable).toBe(false);
  });

  it('classifies same-count page/ref/text mismatch as non-canonicalizable', () => {
    const result = compareStructuralField('figures', [
      [{ page: 0, structRef: '1_0', rawRole: 'Figure', role: 'Figure', hasAlt: false }],
      [{ page: 0, structRef: '2_0', rawRole: 'Figure', role: 'Figure', hasAlt: false }],
    ]);
    expect(result.kind).toBe('page_ref_text_mismatch');
    expect(result.canonicalizable).toBe(false);
  });

  it('fails closed when snapshot detail is missing', () => {
    const result = compareStructuralField('tables', [[{ page: 0, structRef: '1_0' }], undefined]);
    expect(result.kind).toBe('missing_snapshot_detail');
    expect(result.canonicalizable).toBe(false);
  });

  it('recommends diagnostic-only when harmful focus variance is non-canonicalizable', () => {
    const row = buildStage58RowReport({
      row: { id: 'v1-4722', publicationId: '4722', localFile: '4722.pdf' },
      role: 'focus',
      repeats: [
        repeat({ repeat: 1, score: 42, fields: { headings: [{ page: 0, level: 1, structRef: '1_0', text: 'A' }] } }),
        repeat({ repeat: 2, score: 59, fields: { headings: [{ page: 0, level: 1, structRef: '1_0', text: 'A' }, { page: 1, level: 2, structRef: '2_0', text: 'B' }] } }),
      ],
    });
    const report = buildStage58Report({ manifestPath: 'manifest.json', repeatCount: 2, rows: [row], generatedAt: '2026-04-24T00:00:00.000Z' });
    expect(row.decision.status).toBe('non_canonicalizable_variance');
    expect(report.decision.status).toBe('diagnostic_only');
  });

  it('recommends canonicalization only when harmful focus variance is ordering-only', () => {
    const row = buildStage58RowReport({
      row: { id: 'v1-4722', publicationId: '4722', localFile: '4722.pdf' },
      role: 'focus',
      repeats: [
        repeat({ repeat: 1, score: 42, fields: { headings: [{ page: 1, level: 1, structRef: '2_0', text: 'B' }, { page: 0, level: 1, structRef: '1_0', text: 'A' }] } }),
        repeat({ repeat: 2, score: 59, fields: { headings: [{ page: 0, level: 1, structRef: '1_0', text: 'A' }, { page: 1, level: 1, structRef: '2_0', text: 'B' }] } }),
      ],
    });
    const report = buildStage58Report({ manifestPath: 'manifest.json', repeatCount: 2, rows: [row], generatedAt: '2026-04-24T00:00:00.000Z' });
    expect(row.decision.status).toBe('canonicalization_candidate');
    expect(report.decision.status).toBe('canonicalization_candidate');
  });
});
