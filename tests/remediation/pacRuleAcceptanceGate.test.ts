import { describe, expect, it } from 'vitest';
import {
  pacAcceptanceGateAppliesToTools,
  pacRuleAcceptanceGate,
  pacRuleStructureAnnotationSequenceRecovery,
  pacRuleUsefulRepairRecovery,
} from '../../src/services/remediation/pacRuleAcceptanceGate.js';
import type { DocumentSnapshot } from '../../src/types.js';

function baseSnapshot(overrides: Partial<DocumentSnapshot> = {}): DocumentSnapshot {
  return {
    pageCount: 1,
    textByPage: ['Readable text'],
    textCharCount: 120,
    imageOnlyPageCount: 0,
    metadata: { title: 'Accessible Report', language: 'en-US' },
    links: [],
    formFieldsFromPdfjs: [],
    isTagged: true,
    markInfo: { Marked: true },
    lang: 'en-US',
    pdfUaVersion: '1',
    headings: [{ level: 1, text: 'Accessible Report', page: 0 }],
    figures: [],
    tables: [],
    fonts: [{ name: 'Arial', isEmbedded: true, hasUnicode: true }],
    bookmarks: [],
    formFields: [],
    structureTree: { type: 'Document', children: [{ type: 'Sect', children: [] }] },
    pdfClass: 'native_tagged',
    imageToTextRatio: 0,
    detectionProfile: {
      readingOrderSignals: {
        missingStructureTree: false,
        structureTreeDepth: 2,
        degenerateStructureTree: false,
        annotationOrderRiskCount: 0,
        annotationStructParentRiskCount: 0,
        headerFooterPollutionRisk: false,
        sampledStructurePageOrderDriftCount: 0,
        multiColumnOrderRiskPages: 0,
        suspiciousPageCount: 0,
      },
      headingSignals: {
        extractedHeadingCount: 1,
        treeHeadingCount: 1,
        headingTreeDepth: 2,
        extractedHeadingsMissingFromTree: false,
      },
      figureSignals: {
        extractedFigureCount: 0,
        treeFigureCount: 0,
        nonFigureRoleCount: 0,
        treeFigureMissingForExtractedFigures: false,
      },
      pdfUaSignals: {
        orphanMcidCount: 0,
        suspectedPathPaintOutsideMc: 0,
        taggedAnnotationRiskCount: 0,
      },
      annotationSignals: {
        pagesMissingTabsS: 0,
        pagesAnnotationOrderDiffers: 0,
        linkAnnotationsMissingStructure: 0,
        nonLinkAnnotationsMissingStructure: 0,
        linkAnnotationsMissingStructParent: 0,
        nonLinkAnnotationsMissingStructParent: 0,
      },
      listSignals: {
        listItemMisplacedCount: 0,
        lblBodyMisplacedCount: 0,
        listsWithoutItems: 0,
      },
      tableSignals: {
        tablesWithMisplacedCells: 0,
        misplacedCellCount: 0,
        irregularTableCount: 0,
        stronglyIrregularTableCount: 0,
        directCellUnderTableCount: 0,
      },
      sampledPages: [0],
      confidence: 'high',
    },
    ...overrides,
  };
}

function missingFigureSnapshot(count: number): DocumentSnapshot {
  return baseSnapshot({
    figures: Array.from({ length: count }, (_, index) => ({
      hasAlt: false,
      isArtifact: false,
      page: 0,
      role: 'Figure',
      structRef: `${index + 1}_0`,
      reachable: true,
      directContent: true,
    })),
  });
}

function tableHeaderDebtSnapshot(count: number): DocumentSnapshot {
  return baseSnapshot({
    tableHeaderAudit: {
      tablesChecked: 1,
      headerAssociationMissingCount: 0,
      orphanHeaderCellCount: 0,
      dataCellsWithoutHeaderCount: count,
    },
  });
}

function tableHeaderPassSnapshot(): DocumentSnapshot {
  return baseSnapshot({
    tableHeaderAudit: {
      tablesChecked: 1,
      headerAssociationMissingCount: 0,
      orphanHeaderCellCount: 0,
      dataCellsWithoutHeaderCount: 0,
    },
  });
}

function childRoleDebtSnapshot(count: number): DocumentSnapshot {
  return baseSnapshot({
    structureSyntaxAudit: {
      missingStructureTypeCount: 0,
      missingRoleCount: 0,
      missingParentCount: 0,
      wrongParentCount: 0,
      invalidChildRoleCount: count,
      invalidMcrObjrCount: 0,
      circularRoleMapCount: 0,
      standardRoleRemappedCount: 0,
      unmappedNonstandardRoleCount: 0,
    },
  });
}

function parentTreeMcidDebtSnapshot(count: number): DocumentSnapshot {
  return baseSnapshot({
    parentTreeAudit: {
      missingParentTree: false,
      pagesMissingStructParents: 0,
      missingMcidParentTreeEntries: count,
      invalidParentTreeEntries: 0,
      annotationReferenceMismatchCount: 0,
      objectReferenceMismatchCount: 0,
    },
  });
}

function roleMapDebtSnapshot(count: number): DocumentSnapshot {
  return baseSnapshot({
    structureSyntaxAudit: {
      missingStructureTypeCount: 0,
      missingRoleCount: 0,
      missingParentCount: 0,
      wrongParentCount: 0,
      invalidChildRoleCount: 0,
      invalidMcrObjrCount: 0,
      circularRoleMapCount: count,
      standardRoleRemappedCount: 0,
      unmappedNonstandardRoleCount: 0,
    },
  });
}

function orphanMcidDebtSnapshot(count: number, overrides: Partial<DocumentSnapshot> = {}): DocumentSnapshot {
  return baseSnapshot({
    orphanMcids: Array.from({ length: count }, (_, index) => ({ page: 0, mcid: index })),
    detectionProfile: {
      ...baseSnapshot().detectionProfile!,
      pdfUaSignals: {
        orphanMcidCount: count,
        suspectedPathPaintOutsideMc: 0,
        taggedAnnotationRiskCount: 0,
      },
    },
    ...overrides,
  });
}

function annotationDebtSnapshot(count: number, orphanCount = 0, overrides: Partial<DocumentSnapshot> = {}): DocumentSnapshot {
  const base = baseSnapshot();
  return baseSnapshot({
    orphanMcids: Array.from({ length: orphanCount }, (_, index) => ({ page: 0, mcid: index })),
    detectionProfile: {
      ...base.detectionProfile!,
      pdfUaSignals: {
        orphanMcidCount: orphanCount,
        suspectedPathPaintOutsideMc: 0,
        taggedAnnotationRiskCount: count,
      },
      annotationSignals: {
        ...base.detectionProfile!.annotationSignals,
        linkAnnotationsMissingStructure: count,
        linkAnnotationsMissingStructParent: 0,
      },
    },
    ...overrides,
  });
}

describe('pacRuleAcceptanceGate', () => {
  it('does not reject selected PAC rules that change from not-applicable to fail', () => {
    const decision = pacRuleAcceptanceGate({
      beforeSnapshot: baseSnapshot(),
      afterSnapshot: missingFigureSnapshot(1),
      toolNames: ['set_figure_alt_text'],
    });

    expect(decision).toEqual({ reject: false, reason: null });
  });

  it('rejects selected PAC rules that change from pass to fail', () => {
    const decision = pacRuleAcceptanceGate({
      beforeSnapshot: tableHeaderPassSnapshot(),
      afterSnapshot: tableHeaderDebtSnapshot(1),
      toolNames: ['normalize_table_structure'],
    });

    expect(decision.reject).toBe(true);
    expect(decision.reason).toBe('pac_rule_regressed(pdfua.table.header_association_present)');
    const details = JSON.parse(decision.details ?? '{}');
    expect(details.pacRuleRegression).toMatchObject({
      ruleId: 'pdfua.table.header_association_present',
      beforeStatus: 'pass',
      afterStatus: 'fail',
      afterCount: 1,
    });
  });

  it('rejects existing selected PAC failures when the failed count increases', () => {
    const decision = pacRuleAcceptanceGate({
      beforeSnapshot: missingFigureSnapshot(1),
      afterSnapshot: missingFigureSnapshot(2),
      toolNames: ['retag_as_figure'],
    });

    expect(decision.reject).toBe(true);
    expect(decision.reason).toBe('pac_rule_regressed(pdfua.figure.alt_present)');
    expect(JSON.parse(decision.details ?? '{}').pacRuleRegression).toMatchObject({
      beforeCount: 1,
      afterCount: 2,
    });
  });

  it('does not reject existing selected PAC failures with the same or lower count', () => {
    expect(pacRuleAcceptanceGate({
      beforeSnapshot: missingFigureSnapshot(2),
      afterSnapshot: missingFigureSnapshot(1),
      toolNames: ['retag_as_figure'],
    })).toEqual({ reject: false, reason: null });
  });

  it('does not reject unselected PAC rule regressions', () => {
    const decision = pacRuleAcceptanceGate({
      beforeSnapshot: baseSnapshot(),
      afterSnapshot: baseSnapshot({ metadata: { title: '', language: 'en-US' } }),
      toolNames: ['bootstrap_struct_tree'],
    });

    expect(decision).toEqual({ reject: false, reason: null });
  });

  it('does not reject warning, heuristic, or not-applicable changes unless a selected rule becomes fail', () => {
    const decision = pacRuleAcceptanceGate({
      beforeSnapshot: baseSnapshot(),
      afterSnapshot: baseSnapshot({
        detectionProfile: {
          ...baseSnapshot().detectionProfile!,
          figureSignals: {
            extractedFigureCount: 0,
            treeFigureCount: 0,
            nonFigureRoleCount: 2,
            treeFigureMissingForExtractedFigures: false,
          },
        },
      }),
      toolNames: ['bootstrap_struct_tree'],
    });

    expect(decision).toEqual({ reject: false, reason: null });
  });

  it('skips pure metadata tools even when PAC evidence changed', () => {
    const decision = pacRuleAcceptanceGate({
      beforeSnapshot: baseSnapshot(),
      afterSnapshot: missingFigureSnapshot(1),
      toolNames: ['set_document_title'],
    });

    expect(decision).toEqual({ reject: false, reason: null });
    expect(pacAcceptanceGateAppliesToTools(['set_document_title'])).toBe(false);
  });

  it('rejects table header association regressions', () => {
    const decision = pacRuleAcceptanceGate({
      beforeSnapshot: tableHeaderPassSnapshot(),
      afterSnapshot: tableHeaderDebtSnapshot(2),
      toolNames: ['normalize_table_structure'],
    });

    expect(decision.reject).toBe(true);
    expect(decision.reason).toBe('pac_rule_regressed(pdfua.table.header_association_present)');
    expect(JSON.parse(decision.details ?? '{}').pacRuleRegression).toMatchObject({
      ruleId: 'pdfua.table.header_association_present',
      beforeCount: 0,
      afterCount: 2,
    });
  });

  it('does not reject structure child-role validity regressions after gate narrowing', () => {
    const decision = pacRuleAcceptanceGate({
      beforeSnapshot: baseSnapshot(),
      afterSnapshot: childRoleDebtSnapshot(3),
      toolNames: ['normalize_heading_hierarchy'],
    });

    expect(decision).toEqual({ reject: false, reason: null });
  });

  it('rejects ParentTree MCID entry regressions', () => {
    const decision = pacRuleAcceptanceGate({
      beforeSnapshot: baseSnapshot(),
      afterSnapshot: parentTreeMcidDebtSnapshot(1),
      toolNames: ['remap_orphan_mcids_as_artifacts'],
    });

    expect(decision.reject).toBe(true);
    expect(decision.reason).toBe('pac_rule_regressed(pdfua.parent_tree.mcid_entries_valid)');
  });

  it('does not reject RoleMap validity regressions after gate narrowing', () => {
    const decision = pacRuleAcceptanceGate({
      beforeSnapshot: baseSnapshot(),
      afterSnapshot: roleMapDebtSnapshot(1),
      toolNames: ['bootstrap_struct_tree'],
    });

    expect(decision).toEqual({ reject: false, reason: null });
  });

  it('does not reject promoted PAC gate failures with same or reduced counts', () => {
    expect(pacRuleAcceptanceGate({
      beforeSnapshot: tableHeaderDebtSnapshot(2),
      afterSnapshot: tableHeaderDebtSnapshot(1),
      toolNames: ['normalize_table_structure'],
    })).toEqual({ reject: false, reason: null });

    expect(pacRuleAcceptanceGate({
      beforeSnapshot: parentTreeMcidDebtSnapshot(2),
      afterSnapshot: parentTreeMcidDebtSnapshot(1),
      toolNames: ['remap_orphan_mcids_as_artifacts'],
    })).toEqual({ reject: false, reason: null });
  });

  it('allows narrow alt-structure recovery for orphan-MCID count increases with score movement', () => {
    expect(pacRuleUsefulRepairRecovery({
      beforeSnapshot: orphanMcidDebtSnapshot(1),
      afterSnapshot: orphanMcidDebtSnapshot(2),
      toolNames: ['repair_alt_text_structure'],
      beforeScore: 86,
      afterScore: 98,
      beforePdfUaScore: 60,
      afterPdfUaScore: 60,
    })).toMatchObject({
      recover: true,
      reason: 'pac_orphan_mcid_recovery(repair_alt_text_structure)',
    });
  });

  it('does not recover orphan-MCID increases without score or PDF/UA category movement', () => {
    expect(pacRuleUsefulRepairRecovery({
      beforeSnapshot: orphanMcidDebtSnapshot(1),
      afterSnapshot: orphanMcidDebtSnapshot(2),
      toolNames: ['repair_alt_text_structure'],
      beforeScore: 86,
      afterScore: 86,
      beforePdfUaScore: 60,
      afterPdfUaScore: 60,
    })).toEqual({ recover: false, reason: null });
  });

  it('allows narrow native-link recovery for orphan-MCID count increases with score movement', () => {
    expect(pacRuleUsefulRepairRecovery({
      beforeSnapshot: orphanMcidDebtSnapshot(1),
      afterSnapshot: orphanMcidDebtSnapshot(4),
      toolNames: ['repair_native_link_structure'],
      beforeScore: 79,
      afterScore: 97,
      beforeLinkQualityScore: 73,
      afterLinkQualityScore: 100,
    })).toMatchObject({
      recover: true,
      reason: 'pac_orphan_mcid_recovery(repair_native_link_structure)',
    });
  });

  it('does not recover native-link orphan-MCID increases without score or link-quality movement', () => {
    expect(pacRuleUsefulRepairRecovery({
      beforeSnapshot: orphanMcidDebtSnapshot(1),
      afterSnapshot: orphanMcidDebtSnapshot(4),
      toolNames: ['repair_native_link_structure'],
      beforeScore: 79,
      afterScore: 79,
      beforeLinkQualityScore: 73,
      afterLinkQualityScore: 73,
    })).toEqual({ recover: false, reason: null });
  });

  it('allows heading candidate recovery only with score and heading-category movement', () => {
    expect(pacRuleUsefulRepairRecovery({
      beforeSnapshot: orphanMcidDebtSnapshot(1),
      afterSnapshot: orphanMcidDebtSnapshot(2),
      toolNames: ['create_heading_from_candidate'],
      beforeScore: 34,
      afterScore: 99,
      beforeHeadingScore: 0,
      afterHeadingScore: 100,
    })).toMatchObject({
      recover: true,
      reason: 'pac_orphan_mcid_recovery(create_heading_from_candidate)',
    });

    expect(pacRuleUsefulRepairRecovery({
      beforeSnapshot: orphanMcidDebtSnapshot(1),
      afterSnapshot: orphanMcidDebtSnapshot(2),
      toolNames: ['create_heading_from_candidate'],
      beforeScore: 34,
      afterScore: 99,
      beforeHeadingScore: 0,
      afterHeadingScore: 0,
    })).toEqual({ recover: false, reason: null });

    expect(pacRuleUsefulRepairRecovery({
      beforeSnapshot: orphanMcidDebtSnapshot(1),
      afterSnapshot: orphanMcidDebtSnapshot(2),
      toolNames: ['create_heading_from_candidate'],
      beforeScore: 99,
      afterScore: 99,
      beforeHeadingScore: 0,
      afterHeadingScore: 100,
    })).toEqual({ recover: false, reason: null });
  });

  it('allows heading hierarchy recovery only with score and heading-category movement', () => {
    expect(pacRuleUsefulRepairRecovery({
      beforeSnapshot: orphanMcidDebtSnapshot(1),
      afterSnapshot: orphanMcidDebtSnapshot(2),
      toolNames: ['normalize_heading_hierarchy'],
      beforeScore: 34,
      afterScore: 99,
      beforeHeadingScore: 86,
      afterHeadingScore: 100,
    })).toMatchObject({
      recover: true,
      reason: 'pac_orphan_mcid_recovery(normalize_heading_hierarchy)',
    });

    expect(pacRuleUsefulRepairRecovery({
      beforeSnapshot: orphanMcidDebtSnapshot(1),
      afterSnapshot: orphanMcidDebtSnapshot(2),
      toolNames: ['normalize_heading_hierarchy'],
      beforeScore: 34,
      afterScore: 99,
      beforeHeadingScore: 86,
      afterHeadingScore: 86,
    })).toEqual({ recover: false, reason: null });
  });

  it('allows annotation tab-order recovery only with score and annotation-adjacent category movement', () => {
    expect(pacRuleUsefulRepairRecovery({
      beforeSnapshot: orphanMcidDebtSnapshot(1),
      afterSnapshot: orphanMcidDebtSnapshot(2),
      toolNames: ['normalize_annotation_tab_order'],
      beforeScore: 69,
      afterScore: 79,
      beforeLinkQualityScore: 58,
      afterLinkQualityScore: 83,
      beforeReadingOrderScore: 80,
      afterReadingOrderScore: 80,
    })).toMatchObject({
      recover: true,
      reason: 'pac_orphan_mcid_recovery(normalize_annotation_tab_order)',
    });

    expect(pacRuleUsefulRepairRecovery({
      beforeSnapshot: orphanMcidDebtSnapshot(1),
      afterSnapshot: orphanMcidDebtSnapshot(2),
      toolNames: ['normalize_annotation_tab_order'],
      beforeScore: 69,
      afterScore: 79,
      beforeLinkQualityScore: 58,
      afterLinkQualityScore: 58,
      beforeReadingOrderScore: 80,
      afterReadingOrderScore: 94,
    })).toMatchObject({
      recover: true,
      reason: 'pac_orphan_mcid_recovery(normalize_annotation_tab_order)',
    });

    expect(pacRuleUsefulRepairRecovery({
      beforeSnapshot: orphanMcidDebtSnapshot(1),
      afterSnapshot: orphanMcidDebtSnapshot(2),
      toolNames: ['normalize_annotation_tab_order'],
      beforeScore: 69,
      afterScore: 79,
      beforeLinkQualityScore: 58,
      afterLinkQualityScore: 58,
      beforeReadingOrderScore: 80,
      afterReadingOrderScore: 80,
    })).toEqual({ recover: false, reason: null });
  });

  it('does not recover orphan-MCID increases when page text or tag evidence regresses', () => {
    expect(pacRuleUsefulRepairRecovery({
      beforeSnapshot: orphanMcidDebtSnapshot(1),
      afterSnapshot: orphanMcidDebtSnapshot(2, { textCharCount: 119 }),
      toolNames: ['create_heading_from_candidate'],
      beforeScore: 34,
      afterScore: 99,
      beforeHeadingScore: 0,
      afterHeadingScore: 100,
    })).toEqual({ recover: false, reason: null });

    expect(pacRuleUsefulRepairRecovery({
      beforeSnapshot: orphanMcidDebtSnapshot(1),
      afterSnapshot: orphanMcidDebtSnapshot(2, { isTagged: false }),
      toolNames: ['normalize_heading_hierarchy'],
      beforeScore: 34,
      afterScore: 99,
      beforeHeadingScore: 0,
      afterHeadingScore: 100,
    })).toEqual({ recover: false, reason: null });
  });

  it('does not recover orphan-MCID increases for unrelated tools', () => {
    expect(pacRuleUsefulRepairRecovery({
      beforeSnapshot: orphanMcidDebtSnapshot(1),
      afterSnapshot: orphanMcidDebtSnapshot(2),
      toolNames: ['remap_orphan_mcids_as_artifacts'],
      beforeScore: 86,
      afterScore: 98,
      beforePdfUaScore: 60,
      afterPdfUaScore: 60,
    })).toEqual({ recover: false, reason: null });
  });

  it('does not recover non-orphan PAC regressions even when score moves', () => {
    expect(pacRuleUsefulRepairRecovery({
      beforeSnapshot: tableHeaderPassSnapshot(),
      afterSnapshot: tableHeaderDebtSnapshot(1),
      toolNames: ['repair_alt_text_structure'],
      beforeScore: 86,
      afterScore: 98,
      beforePdfUaScore: 60,
      afterPdfUaScore: 70,
    })).toEqual({ recover: false, reason: null });
  });

  it('allows structure-annotation sequence only when cleanup reduces annotation PAC debt and score moves', () => {
    expect(pacRuleStructureAnnotationSequenceRecovery({
      beforeSnapshot: annotationDebtSnapshot(0, 0),
      intermediateSnapshot: annotationDebtSnapshot(80, 25),
      finalSnapshot: annotationDebtSnapshot(0, 8),
      toolNames: ['synthesize_basic_structure_from_layout', 'repair_native_link_structure', 'tag_unowned_annotations'],
      beforeScore: 48,
      intermediateScore: 77,
      finalScore: 87,
      beforeHeadingScore: 0,
      intermediateHeadingScore: 94,
      finalHeadingScore: 94,
      targetScore: 80,
    })).toMatchObject({
      recover: true,
      reason: 'structure_annotation_sequence_recovered',
    });
  });

  it('does not recover structure-annotation sequence if annotation debt remains unreduced', () => {
    expect(pacRuleStructureAnnotationSequenceRecovery({
      beforeSnapshot: annotationDebtSnapshot(0, 0),
      intermediateSnapshot: annotationDebtSnapshot(80, 25),
      finalSnapshot: annotationDebtSnapshot(80, 8),
      toolNames: ['synthesize_basic_structure_from_layout', 'repair_native_link_structure'],
      beforeScore: 48,
      intermediateScore: 77,
      finalScore: 87,
      beforeHeadingScore: 0,
      intermediateHeadingScore: 94,
      finalHeadingScore: 94,
      targetScore: 80,
    })).toEqual({ recover: false, reason: null });
  });

  it('does not recover structure-annotation sequence with mixed harmful PAC regressions', () => {
    expect(pacRuleStructureAnnotationSequenceRecovery({
      beforeSnapshot: annotationDebtSnapshot(0, 0, tableHeaderPassSnapshot()),
      intermediateSnapshot: annotationDebtSnapshot(80, 25, tableHeaderPassSnapshot()),
      finalSnapshot: annotationDebtSnapshot(0, 8, {
        tableHeaderAudit: {
          tablesChecked: 1,
          headerAssociationMissingCount: 0,
          orphanHeaderCellCount: 0,
          dataCellsWithoutHeaderCount: 1,
        },
      }),
      toolNames: ['synthesize_basic_structure_from_layout', 'repair_native_link_structure'],
      beforeScore: 48,
      intermediateScore: 77,
      finalScore: 87,
      beforeHeadingScore: 0,
      intermediateHeadingScore: 94,
      finalHeadingScore: 94,
      targetScore: 80,
    })).toEqual({ recover: false, reason: null });
  });

  it('does not recover structure-annotation sequence with page text or tag regressions', () => {
    expect(pacRuleStructureAnnotationSequenceRecovery({
      beforeSnapshot: annotationDebtSnapshot(0, 0),
      intermediateSnapshot: annotationDebtSnapshot(80, 25),
      finalSnapshot: annotationDebtSnapshot(0, 8, { textCharCount: 100 }),
      toolNames: ['synthesize_basic_structure_from_layout', 'repair_native_link_structure'],
      beforeScore: 48,
      intermediateScore: 77,
      finalScore: 87,
      beforeHeadingScore: 0,
      intermediateHeadingScore: 94,
      finalHeadingScore: 94,
      targetScore: 80,
    })).toEqual({ recover: false, reason: null });
  });

  it('does not recover unrelated tools through structure-annotation sequence', () => {
    expect(pacRuleStructureAnnotationSequenceRecovery({
      beforeSnapshot: annotationDebtSnapshot(0, 0),
      intermediateSnapshot: annotationDebtSnapshot(80, 25),
      finalSnapshot: annotationDebtSnapshot(0, 8),
      toolNames: ['set_figure_alt_text', 'repair_native_link_structure'],
      beforeScore: 48,
      intermediateScore: 77,
      finalScore: 87,
      beforeHeadingScore: 0,
      intermediateHeadingScore: 94,
      finalHeadingScore: 94,
      targetScore: 80,
    })).toEqual({ recover: false, reason: null });
  });
});
