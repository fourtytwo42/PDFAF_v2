import { describe, expect, it } from 'vitest';
import {
  buildLanguagePartsReport,
  classifyLanguagePartsEvidence,
  type LanguagePartsDiagnosticRow,
  type LanguagePartsFeatures,
} from '../../scripts/language-parts-parity-diagnostic.js';

function features(overrides: Partial<LanguagePartsFeatures> = {}): LanguagePartsFeatures {
  return {
    score: 72,
    grade: 'C',
    pdfClass: 'native_tagged',
    titleLanguage: 100,
    altText: 100,
    linkQuality: 100,
    formAccessibility: 100,
    pdfUaCompliance: 100,
    lang: 'en-US',
    metadataLanguage: 'en-US',
    documentLanguageMissing: false,
    documentLanguageMalformed: false,
    altTextLanguageInvalidCount: 0,
    actualTextLanguageInvalidCount: 0,
    annotationContentsLanguageInvalidCount: 0,
    formTuLanguageInvalidCount: 0,
    outlineLanguageInvalidCount: 0,
    expansionTextLanguageInvalidCount: 0,
    structureLangInvalidCount: 0,
    textObjectLanguageInvalidCount: 0,
    totalPartLanguageInvalidCount: 0,
    verifiedPartLanguageInvalidCount: 0,
    heuristicPartLanguageInvalidCount: 0,
    pacFailures: [],
    pacWarnings: [],
    verifiedFailures: [],
    heuristicFailures: [],
    scoreCapRules: [],
    failRulesWithScoringPolicy: [],
    failRulesWithoutScoringPolicy: [],
    failRulesWithoutAppliedCapRecord: [],
    ...overrides,
  };
}

function row(
  classification: LanguagePartsDiagnosticRow['classification'],
  role: 'focus' | 'control' = 'focus',
): LanguagePartsDiagnosticRow {
  const rowFeatures = classification === 'document_language_syntax_scoring_gap'
    ? features({
        documentLanguageMalformed: true,
        pacFailures: ['pdfua.language.document_lang_syntax_valid'],
        verifiedFailures: ['pdfua.language.document_lang_syntax_valid'],
        failRulesWithoutScoringPolicy: ['pdfua.language.document_lang_syntax_valid'],
      })
    : classification === 'explicit_structure_lang_scoring_candidate'
      ? features({
          structureLangInvalidCount: 2,
          totalPartLanguageInvalidCount: 2,
          verifiedPartLanguageInvalidCount: 2,
          pacFailures: ['pdfua.language.structure_lang_valid'],
          verifiedFailures: ['pdfua.language.structure_lang_valid'],
          failRulesWithoutScoringPolicy: ['pdfua.language.structure_lang_valid'],
        })
      : classification === 'language_parts_heuristic_evidence'
        ? features({
            altTextLanguageInvalidCount: 1,
            heuristicPartLanguageInvalidCount: 1,
            totalPartLanguageInvalidCount: 1,
            pacFailures: ['pdfua.language.alt_text_lang_valid'],
            heuristicFailures: ['pdfua.language.alt_text_lang_valid'],
            failRulesWithoutScoringPolicy: ['pdfua.language.alt_text_lang_valid'],
          })
        : features();
  return {
    id: `${role}-${classification}`,
    pdfPath: `/tmp/${role}-${classification}.pdf`,
    title: classification,
    role,
    classification,
    suggestedAction: classification === 'document_language_syntax_scoring_gap'
      ? 'document_language_syntax_validation_needed'
      : classification === 'explicit_structure_lang_scoring_candidate'
        ? 'structure_lang_score_cap_validation_needed'
        : classification === 'language_parts_heuristic_evidence'
          ? 'native_context_hardening_needed'
          : 'no_action',
    reasons: [],
    features: rowFeatures,
  };
}

describe('language parts parity diagnostic classifier', () => {
  it('treats missing document language as already score-active', () => {
    const result = classifyLanguagePartsEvidence(features({
      documentLanguageMissing: true,
      pacFailures: ['pdfua.language.document_lang_present'],
      verifiedFailures: ['pdfua.language.document_lang_present'],
      failRulesWithScoringPolicy: ['pdfua.language.document_lang_present'],
      scoreCapRules: ['pdfua.language.document_lang_present'],
    }));

    expect(result.classification).toBe('document_language_score_active');
    expect(result.suggestedAction).toBe('already_score_active');
  });

  it('classifies malformed document language syntax as a scoring-validation candidate', () => {
    const result = classifyLanguagePartsEvidence(features({
      documentLanguageMalformed: true,
      pacFailures: ['pdfua.language.document_lang_syntax_valid'],
      verifiedFailures: ['pdfua.language.document_lang_syntax_valid'],
      failRulesWithoutScoringPolicy: ['pdfua.language.document_lang_syntax_valid'],
    }));

    expect(result.classification).toBe('document_language_syntax_scoring_gap');
    expect(result.suggestedAction).toBe('document_language_syntax_validation_needed');
  });

  it('keeps malformed document language syntax diagnostic on high-grade controls', () => {
    const result = classifyLanguagePartsEvidence(features({
      score: 96,
      grade: 'A',
      documentLanguageMalformed: true,
      pacFailures: ['pdfua.language.document_lang_syntax_valid'],
      verifiedFailures: ['pdfua.language.document_lang_syntax_valid'],
      failRulesWithoutScoringPolicy: ['pdfua.language.document_lang_syntax_valid'],
    }), 'control');

    expect(result.classification).toBe('language_parts_control_noise');
    expect(result.suggestedAction).toBe('keep_diagnostic');
  });

  it('classifies explicit structure /Lang failures separately from heuristic part-language failures', () => {
    const result = classifyLanguagePartsEvidence(features({
      structureLangInvalidCount: 2,
      totalPartLanguageInvalidCount: 2,
      verifiedPartLanguageInvalidCount: 2,
      pacFailures: ['pdfua.language.structure_lang_valid'],
      verifiedFailures: ['pdfua.language.structure_lang_valid'],
      failRulesWithoutScoringPolicy: ['pdfua.language.structure_lang_valid'],
    }));

    expect(result.classification).toBe('explicit_structure_lang_scoring_candidate');
    expect(result.suggestedAction).toBe('structure_lang_score_cap_validation_needed');
  });

  it('keeps alt/actual/form/outline language failures in evidence-hardening', () => {
    const result = classifyLanguagePartsEvidence(features({
      altTextLanguageInvalidCount: 1,
      actualTextLanguageInvalidCount: 1,
      heuristicPartLanguageInvalidCount: 2,
      totalPartLanguageInvalidCount: 2,
      pacFailures: ['pdfua.language.alt_text_lang_valid', 'pdfua.language.actual_text_lang_valid'],
      heuristicFailures: ['pdfua.language.alt_text_lang_valid', 'pdfua.language.actual_text_lang_valid'],
    }));

    expect(result.classification).toBe('language_parts_heuristic_evidence');
    expect(result.suggestedAction).toBe('native_context_hardening_needed');
  });

  it('classifies clean language evidence as no action', () => {
    const result = classifyLanguagePartsEvidence(features());

    expect(result.classification).toBe('no_language_parts_debt');
    expect(result.suggestedAction).toBe('no_action');
  });

  it('plans scoring validation only with repeated clean focus evidence', () => {
    expect(buildLanguagePartsReport('/tmp/out', [
      row('document_language_syntax_scoring_gap'),
      row('document_language_syntax_scoring_gap'),
    ]).decision.status).toBe('plan_document_language_syntax_scoring_validation');

    expect(buildLanguagePartsReport('/tmp/out', [
      row('explicit_structure_lang_scoring_candidate'),
      row('explicit_structure_lang_scoring_candidate'),
    ]).decision.status).toBe('plan_structure_lang_scoring_validation');

    expect(buildLanguagePartsReport('/tmp/out', [
      row('language_parts_heuristic_evidence'),
      row('language_parts_heuristic_evidence'),
    ]).decision.status).toBe('plan_language_parts_context_hardening');
  });

  it('does not plan scoring validation when controls trigger', () => {
    const report = buildLanguagePartsReport('/tmp/out', [
      row('document_language_syntax_scoring_gap'),
      row('document_language_syntax_scoring_gap', 'control'),
    ]);

    expect(report.decision.status).toBe('keep_language_parts_diagnostic_only');
  });
});
