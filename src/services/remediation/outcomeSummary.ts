import { REMEDIATION_CATEGORY_THRESHOLD } from '../../config.js';
import type {
  AnalysisResult,
  AppliedRemediationTool,
  CategoryKey,
  PlanningSkipReason,
  PlanningSummary,
  RemediationOutcomeFamilySummary,
  RemediationOutcomeStatus,
  RemediationOutcomeSummary,
  StructuralRepairFamily,
} from '../../types.js';

const STAGE5_FAMILY_ORDER: StructuralRepairFamily[] = [
  'lists',
  'tables',
  'annotations',
  'tagged_content',
  'headings',
];

const FAMILY_TOOLS: Record<StructuralRepairFamily, readonly string[]> = {
  lists: ['repair_list_li_wrong_parent'],
  tables: ['normalize_table_structure', 'repair_native_table_headers', 'set_table_header_cells'],
  annotations: ['tag_unowned_annotations', 'normalize_annotation_tab_order', 'repair_native_link_structure'],
  tagged_content: ['synthesize_basic_structure_from_layout', 'artifact_repeating_page_furniture', 'repair_structure_conformance', 'wrap_singleton_orphan_mcid', 'remap_orphan_mcids_as_artifacts'],
  headings: ['synthesize_basic_structure_from_layout', 'create_structure_from_degenerate_native_anchor', 'artifact_repeating_page_furniture', 'create_heading_from_visible_text_anchor', 'create_heading_from_ocr_page_shell_anchor', 'create_heading_from_candidate', 'normalize_heading_hierarchy', 'repair_structure_conformance'],
};

const FAMILY_CATEGORIES: Record<StructuralRepairFamily, readonly CategoryKey[]> = {
  lists: ['pdf_ua_compliance'],
  tables: ['table_markup'],
  annotations: ['link_quality', 'reading_order'],
  tagged_content: ['pdf_ua_compliance', 'reading_order'],
  headings: ['heading_structure'],
};

function categoryScore(analysis: AnalysisResult, key: CategoryKey): number | null {
  return analysis.categories.find(category => category.key === key)?.score ?? null;
}

function categoryNeedsManualReview(analysis: AnalysisResult, keys: readonly CategoryKey[]): boolean {
  return analysis.categories.some(category =>
    keys.includes(category.key)
    && (
      category.manualReviewRequired === true
      || category.verificationLevel === 'manual_review_required'
    ));
}

function categoryIsFailing(analysis: AnalysisResult, keys: readonly CategoryKey[]): boolean {
  return keys.some(key => (categoryScore(analysis, key) ?? 100) < REMEDIATION_CATEGORY_THRESHOLD);
}

function familySignalCounts(analysis: AnalysisResult): Record<StructuralRepairFamily, number> {
  const detection = analysis.detectionProfile;
  const annotation = detection?.annotationSignals;
  const reading = detection?.readingOrderSignals;
  const pdfUa = detection?.pdfUaSignals;
  const list = detection?.listSignals;
  const table = detection?.tableSignals;
  const headingDebt =
    (categoryScore(analysis, 'heading_structure') ?? 100) < REMEDIATION_CATEGORY_THRESHOLD
    || analysis.failureProfile?.deterministicIssues.includes('heading_structure') === true
    || analysis.failureProfile?.manualOnlyIssues.includes('heading_structure') === true;

  return {
    lists:
      (list?.listItemMisplacedCount ?? 0)
      + (list?.lblBodyMisplacedCount ?? 0)
      + (list?.listsWithoutItems ?? 0),
    tables:
      (table?.tablesWithMisplacedCells ?? 0)
      + (table?.misplacedCellCount ?? 0)
      + (table?.irregularTableCount ?? 0)
      + (table?.stronglyIrregularTableCount ?? 0)
      + (table?.directCellUnderTableCount ?? 0)
      + (categoryIsFailing(analysis, FAMILY_CATEGORIES.tables) ? 1 : 0),
    annotations:
      (annotation?.pagesMissingTabsS ?? 0)
      + (annotation?.pagesAnnotationOrderDiffers ?? 0)
      + (annotation?.linkAnnotationsMissingStructure ?? 0)
      + (annotation?.nonLinkAnnotationsMissingStructure ?? 0)
      + (annotation?.linkAnnotationsMissingStructParent ?? 0)
      + (annotation?.nonLinkAnnotationsMissingStructParent ?? 0)
      + (reading?.annotationOrderRiskCount ?? 0)
      + (reading?.annotationStructParentRiskCount ?? 0),
    tagged_content:
      (pdfUa?.orphanMcidCount ?? 0)
      + (pdfUa?.suspectedPathPaintOutsideMc ?? 0)
      + (pdfUa?.taggedAnnotationRiskCount ?? 0),
    headings: headingDebt ? 1 : 0,
  };
}

function familyResidualSignals(
  family: StructuralRepairFamily,
  analysis: AnalysisResult,
): string[] {
  const detection = analysis.detectionProfile;
  const annotation = detection?.annotationSignals;
  const reading = detection?.readingOrderSignals;
  const pdfUa = detection?.pdfUaSignals;
  const list = detection?.listSignals;
  const table = detection?.tableSignals;
  const out: string[] = [];

  switch (family) {
    case 'lists':
      if ((list?.listItemMisplacedCount ?? 0) > 0) out.push('list_item_misplaced');
      if ((list?.lblBodyMisplacedCount ?? 0) > 0) out.push('lbl_body_misplaced');
      if ((list?.listsWithoutItems ?? 0) > 0) out.push('lists_without_items');
      return out;
    case 'tables':
      if ((table?.tablesWithMisplacedCells ?? 0) > 0) out.push('tables_with_misplaced_cells');
      if ((table?.misplacedCellCount ?? 0) > 0) out.push('misplaced_cells');
      if ((table?.irregularTableCount ?? 0) > 0) out.push('irregular_tables');
      if ((table?.stronglyIrregularTableCount ?? 0) > 0) out.push('strongly_irregular_tables');
      if ((table?.directCellUnderTableCount ?? 0) > 0) out.push('direct_cell_under_table');
      if (categoryIsFailing(analysis, FAMILY_CATEGORIES.tables)) out.push('table_markup_category');
      return out;
    case 'annotations':
      if ((annotation?.pagesMissingTabsS ?? 0) > 0) out.push('pages_missing_tabs_s');
      if ((annotation?.pagesAnnotationOrderDiffers ?? 0) > 0) out.push('annotation_order_differs');
      if ((annotation?.linkAnnotationsMissingStructure ?? 0) > 0) out.push('link_annotations_missing_structure');
      if ((annotation?.nonLinkAnnotationsMissingStructure ?? 0) > 0) out.push('nonlink_annotations_missing_structure');
      if ((annotation?.linkAnnotationsMissingStructParent ?? 0) > 0) out.push('link_annotations_missing_struct_parent');
      if ((annotation?.nonLinkAnnotationsMissingStructParent ?? 0) > 0) out.push('nonlink_annotations_missing_struct_parent');
      if ((reading?.annotationOrderRiskCount ?? 0) > 0) out.push('annotation_order_risk');
      if ((reading?.annotationStructParentRiskCount ?? 0) > 0) out.push('annotation_struct_parent_risk');
      return out;
    case 'tagged_content':
      if ((pdfUa?.orphanMcidCount ?? 0) > 0) out.push('orphan_mcids');
      if ((pdfUa?.suspectedPathPaintOutsideMc ?? 0) > 0) out.push('path_paint_outside_mc');
      if ((pdfUa?.taggedAnnotationRiskCount ?? 0) > 0) out.push('tagged_annotation_risk');
      return out;
    case 'headings':
      if (categoryIsFailing(analysis, FAMILY_CATEGORIES.headings)) out.push('heading_structure_category');
      if (analysis.failureProfile?.deterministicIssues.includes('heading_structure') === true) {
        out.push('heading_structure_deterministic_issue');
      }
      if (analysis.failureProfile?.manualOnlyIssues.includes('heading_structure') === true) {
        out.push('heading_structure_manual_only');
      }
      return out;
  }
}

function familySkippedTools(
  family: StructuralRepairFamily,
  planningSummary?: PlanningSummary,
): Array<{ toolName: string; reason: PlanningSkipReason }> {
  const familyTools = new Set(FAMILY_TOOLS[family]);
  return (planningSummary?.skippedTools ?? []).filter(tool => familyTools.has(tool.toolName));
}

function familyAppliedTools(
  family: StructuralRepairFamily,
  appliedTools: AppliedRemediationTool[],
): string[] {
  const familyTools = new Set(FAMILY_TOOLS[family]);
  return appliedTools
    .filter(tool => familyTools.has(tool.toolName) && tool.outcome === 'applied')
    .map(tool => tool.toolName);
}

function familyTargeted(
  family: StructuralRepairFamily,
  before: AnalysisResult,
  after: AnalysisResult,
  appliedTools: AppliedRemediationTool[],
  planningSummary?: PlanningSummary,
): boolean {
  const counts = familySignalCounts(before);
  const afterCounts = familySignalCounts(after);
  return (
    counts[family] > 0
    || afterCounts[family] > 0
    || categoryIsFailing(before, FAMILY_CATEGORIES[family])
    || familyAppliedTools(family, appliedTools).length > 0
    || familySkippedTools(family, planningSummary).length > 0
  );
}

function classifyFamily(input: {
  family: StructuralRepairFamily;
  before: AnalysisResult;
  after: AnalysisResult;
  appliedTools: AppliedRemediationTool[];
  planningSummary?: PlanningSummary;
}): RemediationOutcomeFamilySummary | null {
  const { family, before, after, appliedTools, planningSummary } = input;
  if (!familyTargeted(family, before, after, appliedTools, planningSummary)) {
    return null;
  }

  const beforeCounts = familySignalCounts(before);
  const afterCounts = familySignalCounts(after);
  const beforeSignalCount = beforeCounts[family];
  const afterSignalCount = afterCounts[family];
  const applied = familyAppliedTools(family, appliedTools);
  const skipped = familySkippedTools(family, planningSummary);
  const residualSignals = familyResidualSignals(family, after);
  const manualReview = categoryNeedsManualReview(after, FAMILY_CATEGORIES[family]);
  const unsafeToAutofix =
    afterSignalCount > 0
    && applied.length === 0
    && skipped.some(tool => tool.reason === 'missing_precondition' || tool.reason === 'reliability_filtered');

  let status: RemediationOutcomeStatus;
  if (unsafeToAutofix) {
    status = 'unsafe_to_autofix';
  } else if (afterSignalCount === 0 && !manualReview) {
    status = 'fixed';
  } else if (afterSignalCount < beforeSignalCount) {
    status = 'partially_fixed';
  } else {
    status = 'needs_manual_review';
  }

  return {
    family,
    targeted: true,
    status,
    beforeSignalCount,
    afterSignalCount,
    appliedTools: applied,
    skippedTools: skipped,
    residualSignals,
  };
}

function combineDocumentStatus(statuses: RemediationOutcomeStatus[]): RemediationOutcomeStatus {
  if (statuses.includes('unsafe_to_autofix')) return 'unsafe_to_autofix';
  if (statuses.includes('needs_manual_review')) return 'needs_manual_review';
  if (statuses.includes('partially_fixed')) return 'partially_fixed';
  return 'fixed';
}

export function buildRemediationOutcomeSummary(input: {
  before: AnalysisResult;
  after: AnalysisResult;
  appliedTools: AppliedRemediationTool[];
  planningSummary?: PlanningSummary;
}): RemediationOutcomeSummary | undefined {
  const familySummaries = STAGE5_FAMILY_ORDER
    .map(family => classifyFamily({ ...input, family }))
    .filter((summary): summary is RemediationOutcomeFamilySummary => summary !== null);

  if (familySummaries.length === 0) return undefined;

  return {
    documentStatus: combineDocumentStatus(familySummaries.map(summary => summary.status)),
    targetedFamilies: familySummaries.map(summary => summary.family),
    familySummaries,
  };
}
