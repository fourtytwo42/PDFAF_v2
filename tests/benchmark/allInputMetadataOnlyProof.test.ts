import { describe, expect, it } from 'vitest';
import { classifyMetadataOnlyProof } from '../../scripts/all-input-metadata-only-proof.js';

function summary(input: Partial<{
  pageCount: number;
  textCharCount: number;
  isTagged: boolean;
  pacFailedRules: string[];
}> = {}) {
  return {
    score: 59,
    grade: 'F',
    titleLanguage: 0,
    heading: 94,
    reading: 79,
    alt: 20,
    table: 100,
    pdfua: 50,
    pageCount: input.pageCount ?? 10,
    textCharCount: input.textCharCount ?? 1000,
    isTagged: input.isTagged ?? true,
    pacFailedRules: input.pacFailedRules ?? ['pdfua.content.orphan_mcids_absent'],
  };
}

describe('all-input metadata-only proof classifier', () => {
  it('accepts metadata-only candidates when structure, page/text/tag, and non-metadata PAC evidence stay stable', () => {
    const decision = classifyMetadataOnlyProof({
      titleApplied: true,
      languageApplied: true,
      before: summary(),
      after: summary({ pacFailedRules: [] }),
      structuralSummaryStable: true,
      pacFailuresAdded: [],
    });

    expect(decision.classification).toBe('metadata_only_safe_candidate');
  });

  it('rejects structural instability and new non-metadata PAC failures', () => {
    expect(classifyMetadataOnlyProof({
      titleApplied: true,
      languageApplied: false,
      before: summary(),
      after: summary(),
      structuralSummaryStable: false,
      pacFailuresAdded: [],
    }).classification).toBe('unsafe_structure_or_pac_change');

    expect(classifyMetadataOnlyProof({
      titleApplied: true,
      languageApplied: false,
      before: summary(),
      after: summary({ pacFailedRules: ['pdfua.annotations.tagged_annotations_present'] }),
      structuralSummaryStable: true,
      pacFailuresAdded: ['pdfua.annotations.tagged_annotations_present'],
    }).classification).toBe('unsafe_structure_or_pac_change');
  });

  it('separates no-op metadata mutations', () => {
    const decision = classifyMetadataOnlyProof({
      titleApplied: false,
      languageApplied: false,
      before: summary(),
      after: summary(),
      structuralSummaryStable: true,
      pacFailuresAdded: [],
    });

    expect(decision.classification).toBe('metadata_noop');
  });

  it('classifies score drops with stable identity as reanalysis drift candidates', () => {
    const before = summary();
    const after = { ...summary(), score: 38, grade: 'F' };
    const decision = classifyMetadataOnlyProof({
      titleApplied: true,
      languageApplied: true,
      before,
      after,
      structuralSummaryStable: true,
      pacFailuresAdded: [],
    });

    expect(decision.classification).toBe('metadata_identity_stable_reanalysis_drift');
  });
});
