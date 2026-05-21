import { describe, expect, it } from 'vitest';
import {
  buildListTocNoteReport,
  classifyListTocNoteEvidence,
  type ListTocNoteDiagnosticRow,
  type ListTocNoteFeatures,
} from '../../scripts/list-toc-note-parity-diagnostic.js';

function features(overrides: Partial<ListTocNoteFeatures> = {}): ListTocNoteFeatures {
  return {
    score: 96,
    grade: 'A',
    pdfClass: 'native_tagged',
    pageCount: 8,
    readingOrder: 100,
    bookmarks: 100,
    pdfUaCompliance: 96,
    hasStructure: true,
    listCount: 2,
    listItemCount: 6,
    listItemMisplacedCount: 0,
    lblBodyMisplacedCount: 0,
    listsWithoutItems: 0,
    repairableListDebt: 0,
    tocItemsChecked: 0,
    notesChecked: 0,
    tocItemMissingLinkCount: 0,
    tocDestinationMissingCount: 0,
    noteMissingIdCount: 0,
    duplicateNoteIdCount: 0,
    noteMissingLabelOrReferenceCount: 0,
    tocDebt: 0,
    noteDebt: 0,
    pacFailures: [],
    pacWarnings: [],
    scoreCapRules: [],
    failRulesWithScoringCap: [],
    failRulesMissingScoreCap: [],
    ...overrides,
  };
}

function row(
  classification: ListTocNoteDiagnosticRow['classification'],
  role: ListTocNoteDiagnosticRow['role'] = 'focus',
): ListTocNoteDiagnosticRow {
  return {
    id: `${role}-${classification}`,
    pdfPath: `/tmp/${role}-${classification}.pdf`,
    title: classification,
    role,
    classification,
    suggestedAction: classification === 'list_repair_behavior_candidate'
      ? 'list_behavior_validation_needed'
      : classification === 'list_lbl_lbody_repair_gap'
        ? 'list_repair_design_needed'
        : classification === 'toc_note_diagnostic_gap'
          ? 'toc_note_evidence_hardening_needed'
          : 'keep_diagnostic',
    reasons: [],
    features: features(),
  };
}

describe('list/TOC/Note parity diagnostic classifier', () => {
  it('classifies repairable list parentage debt as a behavior candidate when reading order is low', () => {
    const result = classifyListTocNoteEvidence(features({
      readingOrder: 79,
      listItemMisplacedCount: 2,
      repairableListDebt: 2,
      pacFailures: ['pdfua.list.li_parent_valid'],
      failRulesWithScoringCap: ['pdfua.list.li_parent_valid'],
    }));

    expect(result.classification).toBe('list_repair_behavior_candidate');
    expect(result.suggestedAction).toBe('list_behavior_validation_needed');
    expect(result.reasons).toContain('repairable_list_debt:2');
  });

  it('separates Lbl/LBody-only debt because the existing list repair does not cover it', () => {
    const result = classifyListTocNoteEvidence(features({
      readingOrder: 79,
      lblBodyMisplacedCount: 3,
      pacFailures: ['pdfua.list.lbl_lbody_parent_valid'],
      failRulesWithScoringCap: ['pdfua.list.lbl_lbody_parent_valid'],
    }));

    expect(result.classification).toBe('list_lbl_lbody_repair_gap');
    expect(result.suggestedAction).toBe('list_repair_design_needed');
  });

  it('keeps high-grade score-active list residue out of behavior promotion', () => {
    const result = classifyListTocNoteEvidence(features({
      readingOrder: 96,
      listItemMisplacedCount: 1,
      repairableListDebt: 1,
      scoreCapRules: ['pdfua.list.li_parent_valid'],
      failRulesWithScoringCap: ['pdfua.list.li_parent_valid'],
    }));

    expect(result.classification).toBe('list_score_active_only');
    expect(result.suggestedAction).toBe('already_score_active');
  });

  it('classifies TOC/Note evidence as diagnostic hardening, not behavior', () => {
    const result = classifyListTocNoteEvidence(features({
      tocItemsChecked: 4,
      notesChecked: 2,
      tocItemMissingLinkCount: 1,
      noteMissingIdCount: 1,
      tocDebt: 1,
      noteDebt: 1,
      pacFailures: ['pdfua.toc.toci_links_valid', 'pdfua.note.ids_unique'],
    }));

    expect(result.classification).toBe('toc_note_diagnostic_gap');
    expect(result.suggestedAction).toBe('toc_note_evidence_hardening_needed');
  });

  it('does not promote clean list evidence', () => {
    const result = classifyListTocNoteEvidence(features({ listCount: 4, listItemCount: 12 }));

    expect(result.classification).toBe('list_toc_note_noise_or_control');
    expect(result.suggestedAction).toBe('keep_diagnostic');
  });

  it('plans list behavior only with focus candidates and clean controls', () => {
    expect(buildListTocNoteReport('/tmp/out', [
      row('list_repair_behavior_candidate'),
      row('list_repair_behavior_candidate'),
    ]).decision.status).toBe('plan_list_behavior_validation');

    expect(buildListTocNoteReport('/tmp/out', [
      row('list_repair_behavior_candidate'),
      row('list_repair_behavior_candidate'),
      row('list_repair_behavior_candidate', 'control'),
    ]).decision.status).toBe('keep_list_toc_note_diagnostic_only');
  });

  it('plans design or hardening when repeated focus-only gaps appear', () => {
    expect(buildListTocNoteReport('/tmp/out', [
      row('list_lbl_lbody_repair_gap'),
      row('list_lbl_lbody_repair_gap'),
    ]).decision.status).toBe('plan_list_repair_design');

    expect(buildListTocNoteReport('/tmp/out', [
      row('toc_note_diagnostic_gap'),
      row('toc_note_diagnostic_gap'),
    ]).decision.status).toBe('plan_toc_note_evidence_hardening');
  });
});
