import { describe, expect, it } from 'vitest';
import {
  buildPacPromotionReadinessSummary,
  classifyPacPromotionRule,
  type PacPromotionRuleRow,
} from '../../scripts/pac-promotion-readiness.js';
import type { PacRuleEvidence } from '../../src/services/compliance/pacRuleEvidence.js';
import type { PocStrongAreaFileRow } from '../../scripts/poc-strong-areas-diagnostic.js';

function rule(overrides: Partial<PacRuleEvidence>): PacRuleEvidence {
  return {
    ruleId: 'pdfua.structure.parent_links_valid',
    status: 'pass',
    severity: 'pass',
    category: 'pdf_ua_compliance',
    message: 'ok',
    confidence: 'verified',
    ...overrides,
  };
}

function row(id: string, rules: PacRuleEvidence[], score = 95): PocStrongAreaFileRow {
  return {
    id,
    file: `/tmp/${id}.pdf`,
    score,
    grade: score >= 90 ? 'A' : 'B',
    categories: [
      { key: 'pdf_ua_compliance', score, applicable: true },
      { key: 'reading_order', score, applicable: true },
      { key: 'table_markup', score, applicable: true },
      { key: 'text_extractability', score, applicable: true },
      { key: 'color_contrast', score, applicable: true },
    ],
    rules,
  };
}

function findRow(rows: PacPromotionRuleRow[], ruleId: string, fileId = 'file-a'): PacPromotionRuleRow {
  const found = rows.find(item => item.ruleId === ruleId && item.fileId === fileId);
  if (!found) throw new Error(`Missing ${ruleId} for ${fileId}`);
  return found;
}

describe('PAC promotion readiness helpers', () => {
  it('requires verified fail, applicable category, and passing category score for scoring candidates', () => {
    const categories = [{ key: 'pdf_ua_compliance' as const, score: 95, applicable: true }];

    expect(classifyPacPromotionRule(rule({ status: 'fail' }), categories)).toBe('ready_for_scoring_candidate');
    expect(classifyPacPromotionRule(rule({ status: 'fail', confidence: 'heuristic' }), categories)).toBe('needs_more_evidence');
    expect(classifyPacPromotionRule(rule({ status: 'warn', severity: 'warning' }), categories)).toBe('needs_more_evidence');
    expect(classifyPacPromotionRule(rule({ status: 'fail' }), [{ key: 'pdf_ua_compliance' as const, score: 60, applicable: true }])).toBe('ready_for_gate_candidate');
    expect(classifyPacPromotionRule(rule({ status: 'fail' }), [{ key: 'pdf_ua_compliance' as const, score: 95, applicable: false }])).toBe('ready_for_gate_candidate');
  });

  it('requires a structural or checker-facing rule family for gate candidates', () => {
    const lowCategory = [{ key: 'text_extractability' as const, score: 60, applicable: true }];

    expect(classifyPacPromotionRule(rule({
      ruleId: 'pdfua.content.image_tagged_or_artifacted',
      status: 'fail',
      category: 'reading_order',
    }), [{ key: 'reading_order' as const, score: 50, applicable: true }])).toBe('ready_for_gate_candidate');
    expect(classifyPacPromotionRule(rule({
      ruleId: 'pdfua.font.to_unicode_cmap_present',
      status: 'fail',
      category: 'text_extractability',
    }), lowCategory)).toBe('needs_more_evidence');
  });

  it('groups repeated category-pass PAC-fail gaps deterministically', () => {
    const summary = buildPacPromotionReadinessSummary([
      row('file-b', [rule({ ruleId: 'pdfua.table.header_association_present', status: 'fail', category: 'table_markup', message: 'headers missing' })]),
      row('file-a', [rule({ ruleId: 'pdfua.table.header_association_present', status: 'fail', category: 'table_markup', message: 'headers missing' })]),
      row('file-c', [rule({ ruleId: 'pdfua.content.text_tagged_or_artifacted', status: 'fail', category: 'reading_order', message: 'text outside tags' })]),
    ]);

    expect(summary.ruleRows.map(item => `${item.family}:${item.ruleId}:${item.fileId}`)).toEqual([
      'content_tagging:pdfua.content.text_tagged_or_artifacted:file-c',
      'table_headers:pdfua.table.header_association_present:file-a',
      'table_headers:pdfua.table.header_association_present:file-b',
    ]);
    expect(summary.scoringCandidates.map(item => `${item.ruleId}:${item.categoryPassGapCount}:${item.files.join(',')}`)).toEqual([
      'pdfua.table.header_association_present:2:file-a,file-b',
      'pdfua.content.text_tagged_or_artifacted:1:file-c',
    ]);
  });

  it('keeps noisy and manual-review evidence out of promotion', () => {
    const summary = buildPacPromotionReadinessSummary([
      row('file-a', [
        rule({
          ruleId: 'pdfua.content.image_tagged_or_artifacted',
          status: 'warn',
          severity: 'warning',
          category: 'reading_order',
          confidence: 'heuristic',
          message: 'sampled image evidence',
        }),
        rule({
          ruleId: 'pdfua.structure.mcr_objr_valid',
          status: 'fail',
          category: 'pdf_ua_compliance',
          confidence: 'manual_review_required',
          message: 'manual review needed',
        }),
      ]),
    ]);

    expect(summary.scoringCandidates).toEqual([]);
    expect(summary.gateCandidates).toEqual([]);
    expect(summary.noisyRules.map(item => item.ruleId)).toEqual([
      'pdfua.content.image_tagged_or_artifacted',
      'pdfua.structure.mcr_objr_valid',
    ]);
    expect(summary.blockedRules.map(item => item.ruleId)).toEqual(['pdfua.structure.mcr_objr_valid']);
  });

  it('classifies optional disabled contrast, link, and AI rows as diagnostic-only', () => {
    const summary = buildPacPromotionReadinessSummary([
      row('file-a', [
        rule({
          ruleId: 'wcag.contrast.text_contrast_measured',
          status: 'warn',
          severity: 'warning',
          category: 'color_contrast',
          confidence: 'manual_review_required',
          message: 'rendered contrast not run',
        }),
        rule({
          ruleId: 'pdfua.link.uri_reachability_checked',
          status: 'not_applicable',
          severity: 'pass',
          category: 'link_quality',
          message: 'network checks disabled',
        }),
        rule({
          ruleId: 'pdfua.ai.visual_tag_mismatch_checked',
          status: 'not_applicable',
          severity: 'pass',
          category: 'pdf_ua_compliance',
          message: 'AI mismatch checks disabled',
        }),
      ]),
    ]);

    expect(summary.scoringCandidates).toEqual([]);
    expect(summary.gateCandidates).toEqual([]);
    expect(summary.diagnosticOnlyRules.map(item => item.ruleId)).toEqual([
      'wcag.contrast.text_contrast_measured',
      'pdfua.link.uri_reachability_checked',
      'pdfua.ai.visual_tag_mismatch_checked',
    ]);
    expect(findRow(summary.ruleRows, 'wcag.contrast.text_contrast_measured').readiness).toBe('diagnostic_only_optional');
  });

  it('tracks blocked rules that need better evidence before promotion', () => {
    const summary = buildPacPromotionReadinessSummary([
      row('file-a', [
        rule({
          ruleId: 'pdfua.language.alt_text_lang_valid',
          status: 'fail',
          category: 'alt_text',
          confidence: 'heuristic',
          message: 'inherited language context only',
        }),
        rule({
          ruleId: 'pdfua.font.to_unicode_cmap_present',
          status: 'fail',
          category: 'text_extractability',
          message: 'font CMap missing',
        }),
      ], 60),
    ]);

    expect(summary.blockedRules.map(item => `${item.ruleId}:${item.blockedCount}`)).toEqual([
      'pdfua.font.to_unicode_cmap_present:1',
      'pdfua.language.alt_text_lang_valid:1',
    ]);
    expect(summary.scoringCandidates).toEqual([]);
  });

  it('requires repeated category-pass gaps before listing verified font failures as scoring candidates', () => {
    const single = buildPacPromotionReadinessSummary([
      row('file-a', [rule({
        ruleId: 'pdfua.font.to_unicode_cmap_present',
        status: 'fail',
        category: 'text_extractability',
        message: 'font CMap missing',
      })]),
    ]);
    const repeated = buildPacPromotionReadinessSummary([
      row('file-a', [rule({
        ruleId: 'pdfua.font.to_unicode_cmap_present',
        status: 'fail',
        category: 'text_extractability',
        message: 'font CMap missing',
      })]),
      row('file-b', [rule({
        ruleId: 'pdfua.font.to_unicode_cmap_present',
        status: 'fail',
        category: 'text_extractability',
        message: 'font CMap missing',
      })]),
    ]);

    expect(single.scoringCandidates).toEqual([]);
    expect(repeated.scoringCandidates.map(item => `${item.ruleId}:${item.scoringCandidateCount}`)).toEqual([
      'pdfua.font.to_unicode_cmap_present:2',
    ]);
  });
});
