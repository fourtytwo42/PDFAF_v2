import { describe, expect, it } from 'vitest';
import {
  buildPdfUaCatalogSyntaxReport,
  classifyPdfUaCatalogSyntaxEvidence,
  type PdfUaCatalogSyntaxDiagnosticRow,
  type PdfUaCatalogSyntaxFeatures,
} from '../../scripts/pdfua-catalog-syntax-diagnostic.js';

function features(overrides: Partial<PdfUaCatalogSyntaxFeatures> = {}): PdfUaCatalogSyntaxFeatures {
  return {
    score: 96,
    grade: 'A',
    pdfClass: 'native_tagged',
    titleLanguage: 96,
    pdfUaCompliance: 96,
    readingOrder: 96,
    hasStructure: true,
    isTagged: true,
    markInfoMarked: true,
    markInfoSuspects: false,
    displayDocTitle: true,
    lang: 'en-US',
    metadataLanguage: 'en-US',
    pdfUaVersion: '1',
    hasTitle: true,
    catalogGapRuleIds: [],
    fixableCatalogGapRuleIds: [],
    structureRoleDebt: 0,
    structureParentDebt: 0,
    invalidChildRoleCount: 0,
    invalidMcrObjrCount: 0,
    roleMapDebt: 0,
    optionalContentDebt: 0,
    embeddedFileSpecDebt: 0,
    dynamicXfaPresent: false,
    pacFailures: [],
    pacWarnings: [],
    scoreCapRules: [],
    failRulesWithScoringPolicy: [],
    failRulesWithoutScoringPolicy: [],
    failRulesWithoutAppliedCapRecord: [],
    ...overrides,
  };
}

function row(
  classification: PdfUaCatalogSyntaxDiagnosticRow['classification'],
  role: PdfUaCatalogSyntaxDiagnosticRow['role'] = 'focus',
): PdfUaCatalogSyntaxDiagnosticRow {
  return {
    id: `${role}-${classification}`,
    pdfPath: `/tmp/${role}-${classification}.pdf`,
    title: classification,
    role,
    classification,
    suggestedAction: classification === 'catalog_settings_behavior_candidate'
      ? 'catalog_behavior_validation_needed'
      : classification === 'structure_rolemap_scoring_gap'
        ? 'rolemap_scoring_validation_needed'
        : classification === 'optional_catalog_diagnostic_gap'
          ? 'optional_catalog_evidence_hardening_needed'
          : 'keep_diagnostic',
    reasons: [],
    features: features(),
  };
}

describe('PDF/UA catalog/syntax diagnostic classifier', () => {
  it('classifies fixable catalog setting failures as behavior candidates', () => {
    const result = classifyPdfUaCatalogSyntaxEvidence(features({
      markInfoSuspects: true,
      displayDocTitle: false,
      catalogGapRuleIds: [
        'pdfua.settings.display_doc_title_present_or_unknown',
        'pdfua.settings.suspects_absent_or_false',
      ],
      fixableCatalogGapRuleIds: [
        'pdfua.settings.display_doc_title_present_or_unknown',
        'pdfua.settings.suspects_absent_or_false',
      ],
      pacFailures: [
        'pdfua.settings.display_doc_title_present_or_unknown',
        'pdfua.settings.suspects_absent_or_false',
      ],
    }));

    expect(result.classification).toBe('catalog_settings_behavior_candidate');
    expect(result.suggestedAction).toBe('catalog_behavior_validation_needed');
    expect(result.reasons).toContain('fixable_catalog_gaps:pdfua.settings.display_doc_title_present_or_unknown+pdfua.settings.suspects_absent_or_false');
  });

  it('separates RoleMap failures because they are not score-active yet', () => {
    const result = classifyPdfUaCatalogSyntaxEvidence(features({
      roleMapDebt: 2,
      pacFailures: ['pdfua.structure.rolemap_valid'],
      failRulesWithoutScoringPolicy: ['pdfua.structure.rolemap_valid'],
    }));

    expect(result.classification).toBe('structure_rolemap_scoring_gap');
    expect(result.suggestedAction).toBe('rolemap_scoring_validation_needed');
  });

  it('keeps optional catalog evidence as hardening-only', () => {
    const result = classifyPdfUaCatalogSyntaxEvidence(features({
      optionalContentDebt: 1,
      embeddedFileSpecDebt: 2,
      dynamicXfaPresent: true,
      pacFailures: [
        'pdfua.optional_content.config_valid',
        'pdfua.filespec.f_and_uf_present',
        'pdfua.xfa.dynamic_absent',
      ],
    }));

    expect(result.classification).toBe('optional_catalog_diagnostic_gap');
    expect(result.suggestedAction).toBe('optional_catalog_evidence_hardening_needed');
  });

  it('recognizes already score-active baseline catalog debt', () => {
    const result = classifyPdfUaCatalogSyntaxEvidence(features({
      markInfoMarked: false,
      pdfUaVersion: null,
      pacFailures: ['pdfua.settings.marked_true', 'pdfua.metadata.pdfua_identifier_present'],
      scoreCapRules: ['pdfua.settings.marked_true', 'pdfua.metadata.pdfua_identifier_present'],
      failRulesWithScoringPolicy: ['pdfua.settings.marked_true', 'pdfua.metadata.pdfua_identifier_present'],
    }));

    expect(result.classification).toBe('catalog_baseline_score_active');
    expect(result.suggestedAction).toBe('already_score_active');
  });

  it('recognizes already score-active structure syntax debt', () => {
    const result = classifyPdfUaCatalogSyntaxEvidence(features({
      structureParentDebt: 3,
      pacFailures: ['pdfua.structure.parent_links_valid'],
      scoreCapRules: ['pdfua.structure.parent_links_valid'],
      failRulesWithScoringPolicy: ['pdfua.structure.parent_links_valid'],
    }));

    expect(result.classification).toBe('structure_syntax_score_active');
    expect(result.suggestedAction).toBe('already_score_active');
  });

  it('does not promote clean catalog/syntax evidence', () => {
    const result = classifyPdfUaCatalogSyntaxEvidence(features());

    expect(result.classification).toBe('catalog_syntax_noise_or_control');
    expect(result.suggestedAction).toBe('keep_diagnostic');
  });

  it('plans behavior, rolemap, or optional stages only with focus candidates and clean controls', () => {
    expect(buildPdfUaCatalogSyntaxReport('/tmp/out', [
      row('catalog_settings_behavior_candidate'),
      row('catalog_settings_behavior_candidate'),
    ]).decision.status).toBe('plan_catalog_settings_behavior_validation');

    expect(buildPdfUaCatalogSyntaxReport('/tmp/out', [
      row('catalog_settings_behavior_candidate'),
      row('catalog_settings_behavior_candidate', 'control'),
    ]).decision.status).toBe('keep_pdfua_catalog_syntax_diagnostic_only');

    expect(buildPdfUaCatalogSyntaxReport('/tmp/out', [
      row('structure_rolemap_scoring_gap'),
      row('structure_rolemap_scoring_gap'),
    ]).decision.status).toBe('plan_rolemap_scoring_validation');

    expect(buildPdfUaCatalogSyntaxReport('/tmp/out', [
      row('optional_catalog_diagnostic_gap'),
      row('optional_catalog_diagnostic_gap'),
    ]).decision.status).toBe('plan_optional_catalog_evidence_hardening');
  });
});
