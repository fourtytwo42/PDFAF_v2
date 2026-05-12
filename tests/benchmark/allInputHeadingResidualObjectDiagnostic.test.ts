import { describe, expect, it } from 'vitest';
import {
  baselineRowsFromJson,
  buildHeadingResidualObjectDiagnostic,
} from '../../scripts/all-input-heading-residual-object-diagnostic.js';

describe('all-input heading residual object diagnostic', () => {
  it('classifies hard timeouts separately from repair candidates', () => {
    const report = buildHeadingResidualObjectDiagnostic({
      baselineRows: [
        {
          file: '0114-timeout.pdf',
          afterScore: 0,
          afterGrade: '?',
          error: 'per_pdf_timeout_300000ms',
          durationMs: 300000,
          appliedTools: [],
        },
      ],
      selectionRows: [
        { file: '0114-timeout.pdf', classification: 'heading_reading_recovery_target' },
      ],
      generatedAt: 'test',
    });

    expect(report.rows[0]?.classification).toBe('parked_hard_timeout');
    expect(report.summary.selectedNextClass).toBe('parked_hard_timeout');
  });

  it('selects content-tagging object candidates over font-only diagnostic rows', () => {
    const report = buildHeadingResidualObjectDiagnostic({
      baselineRows: [
        {
          file: '0346-content.pdf',
          afterScore: 59,
          afterGrade: 'F',
          durationMs: 25000,
          categoryGap: { after: [{ key: 'heading_structure', score: 0 }, { key: 'reading_order', score: 79 }, { key: 'pdf_ua_compliance', score: 80 }] },
          appliedTools: [{ toolName: 'create_heading_from_candidate', outcome: 'rejected', scoreBefore: 59, scoreAfter: 59 }],
        },
        {
          file: '4139-font.pdf',
          afterScore: 59,
          afterGrade: 'F',
          durationMs: 17000,
          categoryGap: { after: [{ key: 'heading_structure', score: 0 }, { key: 'reading_order', score: 96 }, { key: 'pdf_ua_compliance', score: 80 }] },
          appliedTools: [{ toolName: 'repair_structure_conformance', outcome: 'rejected', scoreBefore: 38, scoreAfter: 38 }],
        },
      ],
      selectionRows: [
        { file: '0346-content.pdf', classification: 'heading_reading_recovery_target' },
        { file: '4139-font.pdf', classification: 'heading_reading_recovery_target' },
      ],
      pocMatrix: {
        files: [
          { file: '0346-content.pdf', rules: [{ ruleId: 'pdfua.content.image_tagged_or_artifacted', status: 'fail' }] },
          { file: '4139-font.pdf', rules: [{ ruleId: 'pdfua.font.to_unicode_cmap_valid', status: 'fail' }] },
        ],
      },
      generatedAt: 'test',
    });

    expect(report.rows.find(row => row.file === '0346-content.pdf')?.classification).toBe('content_tagging_object_candidate');
    expect(report.rows.find(row => row.file === '4139-font.pdf')?.classification).toBe('font_cmap_only_diagnostic');
    expect(report.summary.selectedNextClass).toBe('content_tagging_object_candidate');
  });

  it('classifies runtime-heavy and near-pass rows deterministically', () => {
    const report = buildHeadingResidualObjectDiagnostic({
      baselineRows: [
        { file: '4215-runtime.pdf', afterScore: 59, afterGrade: 'F', durationMs: 256000, appliedTools: [] },
        { file: '4082-near.pdf', afterScore: 89, afterGrade: 'B', durationMs: 17000, appliedTools: [] },
      ],
      selectionRows: [
        { file: '4215-runtime.pdf', classification: 'heading_reading_recovery_target' },
        { file: '4082-near.pdf', classification: 'heading_reading_recovery_target' },
      ],
      generatedAt: 'test',
    });

    expect(report.rows.find(row => row.file === '4215-runtime.pdf')?.classification).toBe('runtime_route_heavy');
    expect(report.rows.find(row => row.file === '4082-near.pdf')?.classification).toBe('near_pass_heading_cap');
  });

  it('loads merged all-input row arrays as baseline rows', () => {
    expect(baselineRowsFromJson([
      { file: '0236.pdf', afterScore: 59 },
    ])).toEqual([
      { file: '0236.pdf', afterScore: 59 },
    ]);

    expect(baselineRowsFromJson({
      rows: [{ file: '0114.pdf', afterScore: 59 }],
    })).toEqual([
      { file: '0114.pdf', afterScore: 59 },
    ]);
  });
});
