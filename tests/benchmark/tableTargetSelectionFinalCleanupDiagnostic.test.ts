import { describe, expect, it } from 'vitest';
import {
  classifyTargetSelectionRow,
  parseArgs,
} from '../../scripts/table-target-selection-final-cleanup-diagnostic.js';

const base = {
  role: 'focus' as const,
  score: 69,
  tableMarkup: 0,
  tableFailureClass: 'strongly_irregular_rows' as const,
  normalizeParamShape: 'none' as const,
  headerParamShape: 'none' as const,
  tableHeaderDebt: 200,
  hasStrictTablePacCap: true,
  hasUnsafeTableShape: false,
  realTableCount: 4,
  normalizeCandidateCount: 0,
  headerAssociationCandidateCount: 0,
};

describe('table target selection final cleanup diagnostic', () => {
  it('parses repeatable PDFs and controls', () => {
    const args = parseArgs([
      '--pdf', '/tmp/a.pdf',
      '--pdf', '/tmp/b.pdf',
      '--out', '/tmp/out',
      '--control', 'b.pdf',
    ], new Date('2026-05-28T00:00:00Z'));

    expect(args.pdfs).toEqual(['/tmp/a.pdf', '/tmp/b.pdf']);
    expect(args.outDir).toBe('/tmp/out');
    expect(args.controls.has('b')).toBe(true);
  });

  it('classifies a strict normalize/header row as a transaction candidate', () => {
    expect(classifyTargetSelectionRow({
      ...base,
      normalizeParamShape: 'strict_ref',
      headerParamShape: 'strict_ref',
      normalizeCandidateCount: 1,
      headerAssociationCandidateCount: 1,
    }).classification).toBe('strict_ref_transaction_candidate');
  });

  it('separates strict missing-header creation from header-association transactions', () => {
    const classified = classifyTargetSelectionRow({
      ...base,
      normalizeParamShape: 'strict_ref',
      headerParamShape: 'strict_ref',
      normalizeCandidateCount: 1,
      headerAssociationCandidateCount: 0,
    });

    expect(classified.classification).toBe('missing_header_creation_candidate');
    expect(classified.reasons).toContain('no_header_association_candidates_before_normalize');
  });

  it('separates strict normalize rows whose final header cleanup is blocked', () => {
    const classified = classifyTargetSelectionRow({
      ...base,
      normalizeParamShape: 'strict_ref',
      headerParamShape: 'none',
      normalizeCandidateCount: 1,
      hasUnsafeTableShape: true,
    });

    expect(classified.classification).toBe('normalize_ref_final_header_gap');
    expect(classified.reasons).toContain('header_blocked_by_unsafe_shape');
  });

  it('separates broad selector rows from strict object-backed refs', () => {
    expect(classifyTargetSelectionRow({
      ...base,
      normalizeParamShape: 'broad_selector',
      normalizeCandidateCount: 12,
    }).classification).toBe('broad_selector_final_cleanup_gap');
  });

  it('flags controls that would receive table targets', () => {
    const classified = classifyTargetSelectionRow({
      ...base,
      role: 'control',
      normalizeParamShape: 'strict_ref',
      normalizeCandidateCount: 1,
    });

    expect(classified.classification).toBe('control_target_risk');
  });

  it('identifies low table debt with no object-backed targets as a selection gap', () => {
    expect(classifyTargetSelectionRow({
      ...base,
      realTableCount: 0,
    }).classification).toBe('layout_or_no_object_target');

    expect(classifyTargetSelectionRow({
      ...base,
      realTableCount: 3,
      normalizeCandidateCount: 0,
      headerAssociationCandidateCount: 0,
    }).classification).toBe('target_selection_gap');
  });

  it('does not treat non-table primary debt as a table lane', () => {
    expect(classifyTargetSelectionRow({
      ...base,
      score: 88,
      tableMarkup: 95,
      tableHeaderDebt: 0,
    }).classification).toBe('no_material_table_debt');

    expect(classifyTargetSelectionRow({
      ...base,
      score: 88,
      tableMarkup: 95,
      tableHeaderDebt: 2,
      hasStrictTablePacCap: false,
    }).classification).toBe('pac_cap_not_table_header');
  });
});
