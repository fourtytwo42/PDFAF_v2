import { describe, expect, it } from 'vitest';
import {
  buildPacPromotionReadinessRollup,
  type PacPromotionRollupSource,
} from '../../scripts/pac-promotion-readiness-rollup.js';
import type { PacPromotionReadinessSummary, PacPromotionRuleRow } from '../../scripts/pac-promotion-readiness.js';

function rule(overrides: Partial<PacPromotionRuleRow>): PacPromotionRuleRow {
  return {
    fileId: 'file-a',
    file: '/tmp/file-a.pdf',
    ruleId: 'pdfua.structure.parent_links_valid',
    family: 'structure_syntax_rolemap',
    category: 'pdf_ua_compliance',
    categoryScore: 95,
    categoryApplicable: true,
    status: 'fail',
    confidence: 'verified',
    message: 'parent links invalid',
    categoryPassGap: true,
    noisy: false,
    optionalDiagnostic: false,
    scoringEligible: true,
    gateEligible: true,
    readiness: 'ready_for_scoring_candidate',
    ...overrides,
  };
}

function source(corpusId: string, rows: PacPromotionRuleRow[]): PacPromotionRollupSource {
  return {
    corpusId,
    path: `/tmp/${corpusId}/readiness/pac-promotion-readiness.json`,
    summary: {
      generatedAt: '2026-05-05T00:00:00.000Z',
      fileCount: new Set(rows.map(row => row.fileId)).size,
      ruleRows: rows,
      scoringCandidates: [],
      gateCandidates: [],
      noisyRules: [],
      blockedRules: [],
      diagnosticOnlyRules: [],
    } satisfies PacPromotionReadinessSummary,
  };
}

describe('PAC promotion readiness rollup helpers', () => {
  it('groups deterministic scoring candidates across corpus families', () => {
    const rollup = buildPacPromotionReadinessRollup([
      source('from_sibling_pdfaf_v1_edge_mix', [rule({ fileId: 'b-file' })]),
      source('from_sibling_pdfaf_v1_hard_1', [rule({ fileId: 'a-file' })]),
    ]);

    expect(rollup.scoringCandidates.map(row => `${row.ruleId}:${row.files.join(',')}:${row.corpusFamilies.join(',')}`)).toEqual([
      'pdfua.structure.parent_links_valid:from_sibling_pdfaf_v1_edge_mix:b-file,from_sibling_pdfaf_v1_hard_1:a-file:edge_mix,hard',
    ]);
    expect(rollup.gateCandidates.map(row => `${row.ruleId}:${row.gateCandidateCount}`)).toEqual([
      'pdfua.structure.parent_links_valid:2',
    ]);
  });

  it('allows an original-corpus structural category-pass gap as a severe scoring candidate', () => {
    const rollup = buildPacPromotionReadinessRollup([
      source('experiment-corpus', [rule({ fileId: 'original-row' })]),
    ]);

    expect(rollup.scoringCandidates.map(row => `${row.ruleId}:${row.originalExperimentGapCount}`)).toEqual([
      'pdfua.structure.parent_links_valid:1',
    ]);
  });

  it('requires repeated gate candidates for structural rules below passing threshold', () => {
    const gateOnly = rule({
      categoryScore: 60,
      categoryPassGap: false,
      scoringEligible: false,
      readiness: 'ready_for_gate_candidate',
    });
    const rollup = buildPacPromotionReadinessRollup([
      source('from_sibling_pdfaf_v1_edge_mix', [gateOnly]),
      source('from_sibling_pdfaf_v1_edge_mix_2', [rule({ ...gateOnly, fileId: 'file-b' })]),
    ]);

    expect(rollup.scoringCandidates).toEqual([]);
    expect(rollup.gateCandidates.map(row => `${row.ruleId}:${row.gateCandidateCount}:${row.files.length}`)).toEqual([
      'pdfua.structure.parent_links_valid:2:2',
    ]);
  });

  it('excludes noisy and manual-review rows from promotion', () => {
    const rollup = buildPacPromotionReadinessRollup([
      source('from_sibling_pdfaf_v1_hard_1', [
        rule({
          ruleId: 'pdfua.content.image_tagged_or_artifacted',
          family: 'content_tagging',
          category: 'reading_order',
          status: 'warn',
          confidence: 'heuristic',
          categoryPassGap: false,
          scoringEligible: false,
          gateEligible: false,
          noisy: true,
          readiness: 'needs_more_evidence',
        }),
        rule({
          ruleId: 'pdfua.structure.mcr_objr_valid',
          confidence: 'manual_review_required',
          scoringEligible: false,
          gateEligible: false,
          noisy: true,
          readiness: 'needs_more_evidence',
        }),
      ]),
    ]);

    expect(rollup.scoringCandidates).toEqual([]);
    expect(rollup.gateCandidates).toEqual([]);
    expect(rollup.noisyRules.map(row => row.ruleId)).toEqual([
      'pdfua.content.image_tagged_or_artifacted',
      'pdfua.structure.mcr_objr_valid',
    ]);
  });

  it('keeps optional contrast, link, and AI rows diagnostic-only', () => {
    const rollup = buildPacPromotionReadinessRollup([
      source('from_sibling_pdfaf_v1_holdout_5', [
        rule({
          ruleId: 'wcag.contrast.text_contrast_measured',
          family: 'contrast_link_ai_placeholders',
          category: 'color_contrast',
          status: 'not_applicable',
          categoryPassGap: false,
          scoringEligible: false,
          gateEligible: false,
          readiness: 'diagnostic_only_optional',
        }),
        rule({
          ruleId: 'pdfua.link.uri_reachability_checked',
          family: 'contrast_link_ai_placeholders',
          category: 'link_quality',
          status: 'not_applicable',
          categoryPassGap: false,
          scoringEligible: false,
          gateEligible: false,
          readiness: 'diagnostic_only_optional',
        }),
        rule({
          ruleId: 'pdfua.ai.visual_tag_mismatch_checked',
          family: 'contrast_link_ai_placeholders',
          category: 'pdf_ua_compliance',
          status: 'not_applicable',
          categoryPassGap: false,
          scoringEligible: false,
          gateEligible: false,
          readiness: 'diagnostic_only_optional',
        }),
      ]),
    ]);

    expect(rollup.scoringCandidates).toEqual([]);
    expect(rollup.gateCandidates).toEqual([]);
    expect(rollup.diagnosticOnlyRules.map(row => row.ruleId)).toEqual([
      'wcag.contrast.text_contrast_measured',
      'pdfua.link.uri_reachability_checked',
      'pdfua.ai.visual_tag_mismatch_checked',
    ]);
  });

  it('requires repeated category-pass gaps before font scoring promotion', () => {
    const fontRow = rule({
      ruleId: 'pdfua.font.to_unicode_cmap_present',
      family: 'fonts_cmap',
      category: 'text_extractability',
      scoringEligible: false,
      gateEligible: false,
    });
    const single = buildPacPromotionReadinessRollup([
      source('experiment-corpus', [fontRow]),
    ]);
    const repeated = buildPacPromotionReadinessRollup([
      source('from_sibling_pdfaf_v1_edge_mix', [fontRow]),
      source('from_sibling_pdfaf_v1_hard_1', [rule({ ...fontRow, fileId: 'file-b' })]),
    ]);

    expect(single.scoringCandidates).toEqual([]);
    expect(single.blockedRules.map(row => row.ruleId)).toEqual([]);
    expect(repeated.scoringCandidates.map(row => `${row.ruleId}:${row.scoringCandidateCount}`)).toEqual([
      'pdfua.font.to_unicode_cmap_present:2',
    ]);
  });
});
