import { describe, expect, it } from 'vitest';
import {
  buildAnnotationFormReport,
  classifyAnnotationFormEvidence,
  type AnnotationFormDiagnosticRow,
  type AnnotationFormFeatures,
} from '../../scripts/annotation-form-parity-diagnostic.js';

function features(overrides: Partial<AnnotationFormFeatures> = {}): AnnotationFormFeatures {
  return {
    score: 96,
    grade: 'A',
    pdfClass: 'native_tagged',
    pageCount: 5,
    pdfUaCompliance: 96,
    linkQuality: 100,
    readingOrder: 100,
    altText: 100,
    formAccessibility: 100,
    hasStructure: true,
    formFieldCount: 0,
    pdfjsFormFieldCount: 0,
    totalFormFieldEvidenceCount: 0,
    formFieldsMissingTooltipCount: 0,
    pagesMissingTabsS: 0,
    pagesAnnotationOrderDiffers: 0,
    linkAnnotationsMissingStructure: 0,
    nonLinkAnnotationsMissingStructure: 0,
    linkAnnotationsMissingStructParent: 0,
    nonLinkAnnotationsMissingStructParent: 0,
    nonLinkAnnotationsMissingContents: 0,
    parentTreeAnnotationReferenceMismatchCount: 0,
    parentTreeObjectReferenceMismatchCount: 0,
    pacFailures: [],
    pacWarnings: [],
    scoreCapRules: [],
    failRulesWithScoringCap: [],
    failRulesMissingScoreCap: [],
    ...overrides,
  };
}

function row(
  classification: AnnotationFormDiagnosticRow['classification'],
  role: AnnotationFormDiagnosticRow['role'] = 'focus',
): AnnotationFormDiagnosticRow {
  return {
    id: `${role}-${classification}`,
    pdfPath: `/tmp/${role}-${classification}.pdf`,
    title: classification,
    role,
    classification,
    suggestedAction: classification.endsWith('_candidate')
      ? 'behavior_validation_candidate'
      : 'keep_diagnostic',
    reasons: [],
    features: features(),
  };
}

describe('annotation/form parity diagnostic classifier', () => {
  it('classifies missing form alternate names as a repair candidate only when form score is low', () => {
    const result = classifyAnnotationFormEvidence(features({
      formAccessibility: 78,
      formFieldCount: 2,
      totalFormFieldEvidenceCount: 2,
      formFieldsMissingTooltipCount: 2,
      pacFailures: ['pdfua.form.tu_present'],
      failRulesWithScoringCap: ['pdfua.form.tu_present'],
    }));

    expect(result.classification).toBe('form_tooltip_repair_candidate');
    expect(result.suggestedAction).toBe('behavior_validation_candidate');
  });

  it('classifies link annotation ownership debt as object-backed behavior evidence', () => {
    const result = classifyAnnotationFormEvidence(features({
      linkQuality: 79,
      linkAnnotationsMissingStructure: 2,
      linkAnnotationsMissingStructParent: 1,
      pacFailures: [
        'pdfua.annotations.link_in_link_tag',
        'pdfua.parent_tree.annotation_struct_parent_present',
      ],
      failRulesWithScoringCap: [
        'pdfua.annotations.link_in_link_tag',
        'pdfua.parent_tree.annotation_struct_parent_present',
      ],
    }));

    expect(result.classification).toBe('link_annotation_repair_candidate');
    expect(result.reasons).toContain('link_annotation_debt:3');
  });

  it('separates annotation tab-order debt from link ownership debt', () => {
    const result = classifyAnnotationFormEvidence(features({
      readingOrder: 82,
      pagesMissingTabsS: 1,
      pagesAnnotationOrderDiffers: 1,
      pacFailures: ['pdfua.annotations.tab_order_structure'],
      failRulesWithScoringCap: ['pdfua.annotations.tab_order_structure'],
    }));

    expect(result.classification).toBe('annotation_tab_order_candidate');
  });

  it('classifies non-link missing Contents as an alt-text annotation candidate', () => {
    const result = classifyAnnotationFormEvidence(features({
      altText: 70,
      nonLinkAnnotationsMissingContents: 3,
      pacFailures: [
        'pdfua.annotations.nonlink_contents_present',
        'pdfua.annotation.alt_or_contents_present',
      ],
      failRulesWithScoringCap: [
        'pdfua.annotations.nonlink_contents_present',
        'pdfua.annotation.alt_or_contents_present',
      ],
    }));

    expect(result.classification).toBe('nonlink_annotation_contents_candidate');
  });

  it('keeps widget/Form nesting as evidence hardening when there is only a manual-review warning', () => {
    const result = classifyAnnotationFormEvidence(features({
      formFieldCount: 1,
      totalFormFieldEvidenceCount: 1,
      pacWarnings: ['pdfua.annotations.widget_in_form_tag'],
    }));

    expect(result.classification).toBe('widget_nesting_detection_gap');
    expect(result.suggestedAction).toBe('evidence_hardening_candidate');
  });

  it('does not promote high-grade score-active annotation residue to behavior', () => {
    const result = classifyAnnotationFormEvidence(features({
      linkQuality: 96,
      linkAnnotationsMissingStructParent: 1,
      pacFailures: ['pdfua.parent_tree.annotation_struct_parent_present'],
      scoreCapRules: ['pdfua.parent_tree.annotation_struct_parent_present'],
      failRulesWithScoringCap: ['pdfua.parent_tree.annotation_struct_parent_present'],
    }));

    expect(result.classification).toBe('annotation_form_score_active_only');
    expect(result.suggestedAction).toBe('already_score_active');
  });

  it('plans behavior only with multiple focus candidates and clean controls', () => {
    expect(buildAnnotationFormReport('/tmp/out', [
      row('link_annotation_repair_candidate'),
      row('annotation_tab_order_candidate'),
    ]).decision.status).toBe('plan_annotation_form_behavior_stage');

    expect(buildAnnotationFormReport('/tmp/out', [
      row('link_annotation_repair_candidate'),
      row('annotation_tab_order_candidate'),
      row('form_tooltip_repair_candidate', 'control'),
    ]).decision.status).toBe('keep_annotation_form_diagnostic_only');
  });

  it('plans evidence hardening for repeated widget gaps without control hits', () => {
    expect(buildAnnotationFormReport('/tmp/out', [
      row('widget_nesting_detection_gap'),
      row('widget_nesting_detection_gap'),
    ]).decision.status).toBe('plan_annotation_form_evidence_hardening');
  });
});
