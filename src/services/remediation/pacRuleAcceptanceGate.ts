import type { AppliedRemediationTool, DocumentSnapshot } from '../../types.js';
import { buildPacRuleEvidence, type PacRuleEvidence, type PacRuleStatus } from '../compliance/pacRuleEvidence.js';

export const PAC_ACCEPTANCE_RULE_IDS = [
  'pdfua.structure.struct_tree_present',
  'pdfua.figure.alt_present',
  'pdfua.figure.checker_visible_alt_present',
  'pdfua.annotation.alt_or_contents_present',
  'pdfua.parent_tree.annotation_struct_parent_present',
  'pdfua.annotations.tagged_annotations_present',
  'pdfua.annotations.tab_order_structure',
  'pdfua.annotations.nonlink_contents_present',
  'pdfua.table.headers_present',
  'pdfua.table.cells_nested_under_rows',
  'pdfua.table.rows_regular',
  'pdfua.table.strong_regular_structure',
  'pdfua.content.orphan_mcids_absent',
  'pdfua.table.header_association_present',
  'pdfua.parent_tree.mcid_entries_valid',
] as const;

const PAC_ACCEPTANCE_RULE_ID_SET = new Set<string>(PAC_ACCEPTANCE_RULE_IDS);

const PAC_STRUCTURAL_TOOL_NAMES = new Set<string>([
  'artifact_repeating_page_furniture',
  'bootstrap_struct_tree',
  'bridge_native_title_text_owner',
  'canonicalize_figure_alt_ownership',
  'create_heading_from_candidate',
  'create_heading_from_ocr_collection_title_anchor',
  'create_heading_from_ocr_page_shell_anchor',
  'create_heading_from_tagged_visible_anchor',
  'create_structure_from_degenerate_native_anchor',
  'ensure_accessibility_tagging',
  'mark_untagged_content_as_artifact',
  'normalize_annotation_tab_order',
  'normalize_heading_hierarchy',
  'normalize_table_structure',
  'remap_orphan_mcids_as_artifacts',
  'repair_alt_text_structure',
  'repair_degenerate_native_reading_order_shell',
  'repair_native_link_structure',
  'repair_native_reading_order',
  'repair_native_table_headers',
  'retag_as_figure',
  'set_figure_alt_text',
  'set_link_annotation_contents',
  'set_table_header_cells',
  'synthesize_basic_structure_from_layout',
  'synthesize_ocr_page_shell_reading_order_structure',
  'tag_native_text_blocks',
  'tag_ocr_text_blocks',
  'tag_unowned_annotations',
]);

const PAC_TABLE_REPAIR_TOOL_NAMES = new Set<string>([
  'normalize_table_structure',
  'repair_native_table_headers',
  'set_table_header_cells',
]);

const PAC_NON_TABLE_HEADING_ANNOTATION_RECOVERY_TOOLS = new Set<string>([
  'create_heading_from_candidate',
  'create_heading_from_tagged_visible_anchor',
  'normalize_annotation_tab_order',
  'normalize_heading_hierarchy',
]);

export interface PacRuleAcceptanceRegressionDetail {
  ruleId: string;
  category: PacRuleEvidence['category'];
  beforeStatus: PacRuleStatus;
  afterStatus: PacRuleStatus;
  beforeCount: number;
  afterCount: number;
  beforeMessage: string;
  afterMessage: string;
}

export interface PacRuleAcceptanceDecision {
  reject: boolean;
  reason: string | null;
  details?: string;
}

function failedCount(row: PacRuleEvidence | undefined): number {
  if (row?.status !== 'fail') return 0;
  return row.count ?? 1;
}

function mapSelectedRules(snapshot: DocumentSnapshot): Map<string, PacRuleEvidence> {
  const rows = buildPacRuleEvidence(snapshot)
    .filter(row => PAC_ACCEPTANCE_RULE_ID_SET.has(row.ruleId))
    .sort((a, b) => PAC_ACCEPTANCE_RULE_IDS.indexOf(a.ruleId as typeof PAC_ACCEPTANCE_RULE_IDS[number]) - PAC_ACCEPTANCE_RULE_IDS.indexOf(b.ruleId as typeof PAC_ACCEPTANCE_RULE_IDS[number]));
  return new Map(rows.map(row => [row.ruleId, row]));
}

function regressionDetails(
  before: PacRuleEvidence | undefined,
  after: PacRuleEvidence,
): PacRuleAcceptanceRegressionDetail {
  return {
    ruleId: after.ruleId,
    category: after.category,
    beforeStatus: before?.status ?? 'not_applicable',
    afterStatus: after.status,
    beforeCount: failedCount(before),
    afterCount: failedCount(after),
    beforeMessage: before?.message ?? 'PAC rule evidence was not present before remediation.',
    afterMessage: after.message,
  };
}

export function pacRuleAcceptanceRegressions(input: {
  beforeSnapshot: DocumentSnapshot;
  afterSnapshot: DocumentSnapshot;
  toolNames?: readonly string[];
}): PacRuleAcceptanceRegressionDetail[] {
  if (input.toolNames && !pacAcceptanceGateAppliesToTools(input.toolNames)) {
    return [];
  }

  const beforeRules = mapSelectedRules(input.beforeSnapshot);
  const afterRules = mapSelectedRules(input.afterSnapshot);
  const details: PacRuleAcceptanceRegressionDetail[] = [];
  for (const ruleId of PAC_ACCEPTANCE_RULE_IDS) {
    const after = afterRules.get(ruleId);
    if (!after) continue;
    const before = beforeRules.get(ruleId);
    if (!before || before.status === 'not_applicable') {
      continue;
    }
    const beforeFailed = before.status === 'fail';
    const beforeCount = failedCount(before);
    const afterCount = failedCount(after);
    if (after.status === 'fail' && (!beforeFailed || afterCount > beforeCount)) {
      details.push(regressionDetails(before, after));
    }
  }
  return details;
}

export function pacAcceptanceGateAppliesToTools(toolNames: readonly string[]): boolean {
  return toolNames.some(toolName => PAC_STRUCTURAL_TOOL_NAMES.has(toolName));
}

function finiteScore(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function tableSignal(snapshot: DocumentSnapshot, key: 'directCellUnderTableCount' | 'misplacedCellCount' | 'irregularTableCount' | 'stronglyIrregularTableCount'): number {
  const value = snapshot.detectionProfile?.tableSignals?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : 0;
}

function nonHeaderTableShapePreserved(before: DocumentSnapshot, after: DocumentSnapshot): boolean {
  const keys: Array<'directCellUnderTableCount' | 'misplacedCellCount' | 'irregularTableCount' | 'stronglyIrregularTableCount'> = [
    'directCellUnderTableCount',
    'misplacedCellCount',
    'irregularTableCount',
    'stronglyIrregularTableCount',
  ];
  return keys.every(key => tableSignal(after, key) <= tableSignal(before, key));
}

function nonTableHeadingAnnotationRepairOnly(toolNames: readonly string[]): boolean {
  if (toolNames.length === 0) return false;
  if (toolNames.some(toolName => PAC_TABLE_REPAIR_TOOL_NAMES.has(toolName))) return false;
  return toolNames.every(toolName => PAC_NON_TABLE_HEADING_ANNOTATION_RECOVERY_TOOLS.has(toolName));
}

export function pacRuleAcceptanceGate(input: {
  beforeSnapshot: DocumentSnapshot;
  afterSnapshot: DocumentSnapshot;
  toolNames?: readonly string[];
}): PacRuleAcceptanceDecision {
  const regressions = pacRuleAcceptanceRegressions(input);
  const firstRegression = regressions[0];
  if (firstRegression) {
    const reason = `pac_rule_regressed(${firstRegression.ruleId})`;
    return {
      reject: true,
      reason,
      details: JSON.stringify({
        outcome: 'rejected',
        note: reason,
        pacRuleRegression: firstRegression,
        pacRuleRegressions: regressions,
      }),
    };
  }

  return { reject: false, reason: null };
}

export function pacRuleUsefulRepairRecovery(input: {
  beforeSnapshot: DocumentSnapshot;
  afterSnapshot: DocumentSnapshot;
  toolNames: readonly string[];
  beforeScore: number;
  afterScore: number;
  beforeHeadingScore?: number | null;
  afterHeadingScore?: number | null;
  beforeLinkQualityScore?: number | null;
  afterLinkQualityScore?: number | null;
  beforeReadingOrderScore?: number | null;
  afterReadingOrderScore?: number | null;
  beforePdfUaScore?: number | null;
  afterPdfUaScore?: number | null;
  beforeTableMarkupScore?: number | null;
  afterTableMarkupScore?: number | null;
}): { recover: boolean; reason: string | null; details?: string } {
  const isHeadingCandidateRepair = input.toolNames.includes('create_heading_from_candidate');
  const isHeadingHierarchyRepair = input.toolNames.includes('normalize_heading_hierarchy');
  const isAnnotationTabOrderRepair = input.toolNames.includes('normalize_annotation_tab_order');
  const isAltStructureRepair = input.toolNames.includes('repair_alt_text_structure');
  const isNativeLinkRepair = input.toolNames.includes('repair_native_link_structure');
  const isNativeTextTaggingRepair = input.toolNames.includes('tag_native_text_blocks');
  const isDegenerateNativeReadingOrderRepair = input.toolNames.includes('repair_degenerate_native_reading_order_shell');
  if (
    !isHeadingCandidateRepair &&
    !isHeadingHierarchyRepair &&
    !isAnnotationTabOrderRepair &&
    !isAltStructureRepair &&
    !isNativeLinkRepair &&
    !isNativeTextTaggingRepair &&
    !isDegenerateNativeReadingOrderRepair
  ) {
    return { recover: false, reason: null };
  }
  const regressions = pacRuleAcceptanceRegressions({
    beforeSnapshot: input.beforeSnapshot,
    afterSnapshot: input.afterSnapshot,
    toolNames: input.toolNames,
  });
  if (regressions.length === 0) {
    return { recover: false, reason: null };
  }
  const scoreImproved = input.afterScore > input.beforeScore;
  const headingImproved = (
    input.beforeHeadingScore != null &&
    input.afterHeadingScore != null &&
    input.afterHeadingScore > input.beforeHeadingScore
  );
  const linkQualityImproved = (
    input.beforeLinkQualityScore != null &&
    input.afterLinkQualityScore != null &&
    input.afterLinkQualityScore > input.beforeLinkQualityScore
  );
  const readingOrderImproved = (
    input.beforeReadingOrderScore != null &&
    input.afterReadingOrderScore != null &&
    input.afterReadingOrderScore > input.beforeReadingOrderScore
  );
  const beforeTableScore = finiteScore(input.beforeTableMarkupScore);
  const afterTableScore = finiteScore(input.afterTableMarkupScore);
  const tableMarkupPreserved = beforeTableScore != null && afterTableScore != null && afterTableScore >= beforeTableScore;

  if (regressions.every(row => row.ruleId === 'pdfua.table.header_association_present')) {
    if (
      nonTableHeadingAnnotationRepairOnly(input.toolNames) &&
      scoreImproved &&
      (headingImproved || readingOrderImproved) &&
      tableMarkupPreserved &&
      pageTextTagEvidencePreserved(input.beforeSnapshot, input.afterSnapshot) &&
      nonHeaderTableShapePreserved(input.beforeSnapshot, input.afterSnapshot)
    ) {
      const reason = 'pac_table_header_side_effect_recovery(non_table_heading_annotation_repair)';
      return {
        recover: true,
        reason,
        details: JSON.stringify({
          outcome: 'accepted',
          note: reason,
          pacRuleRegressions: regressions,
          beforeScore: input.beforeScore,
          afterScore: input.afterScore,
          beforeHeadingScore: input.beforeHeadingScore ?? null,
          afterHeadingScore: input.afterHeadingScore ?? null,
          beforeReadingOrderScore: input.beforeReadingOrderScore ?? null,
          afterReadingOrderScore: input.afterReadingOrderScore ?? null,
          beforeTableMarkupScore: input.beforeTableMarkupScore ?? null,
          afterTableMarkupScore: input.afterTableMarkupScore ?? null,
        }),
      };
    }
    return { recover: false, reason: null };
  }

  if (regressions.some(row => row.ruleId !== 'pdfua.content.orphan_mcids_absent')) {
    return { recover: false, reason: null };
  }
  if (!pageTextTagEvidencePreserved(input.beforeSnapshot, input.afterSnapshot)) {
    return { recover: false, reason: null };
  }
  if ((isHeadingCandidateRepair || isHeadingHierarchyRepair) && scoreImproved && headingImproved) {
    const toolName = isHeadingCandidateRepair ? 'create_heading_from_candidate' : 'normalize_heading_hierarchy';
    const reason = `pac_orphan_mcid_recovery(${toolName})`;
    return {
      recover: true,
      reason,
      details: JSON.stringify({
        outcome: 'accepted',
        note: reason,
        pacRuleRegressions: regressions,
        beforeScore: input.beforeScore,
        afterScore: input.afterScore,
        beforeHeadingScore: input.beforeHeadingScore ?? null,
        afterHeadingScore: input.afterHeadingScore ?? null,
      }),
    };
  }
  if (isNativeTextTaggingRepair) {
    if (!scoreImproved || !headingImproved || !readingOrderImproved) {
      return { recover: false, reason: null };
    }
    return {
      recover: true,
      reason: 'pac_orphan_mcid_recovery(tag_native_text_blocks)',
      details: JSON.stringify({
        outcome: 'accepted',
        note: 'pac_orphan_mcid_recovery(tag_native_text_blocks)',
        pacRuleRegressions: regressions,
        beforeScore: input.beforeScore,
        afterScore: input.afterScore,
        beforeHeadingScore: input.beforeHeadingScore ?? null,
        afterHeadingScore: input.afterHeadingScore ?? null,
        beforeReadingOrderScore: input.beforeReadingOrderScore ?? null,
        afterReadingOrderScore: input.afterReadingOrderScore ?? null,
      }),
    };
  }
  if (isAnnotationTabOrderRepair) {
    if (!scoreImproved || (!linkQualityImproved && !readingOrderImproved)) {
      return { recover: false, reason: null };
    }
    return {
      recover: true,
      reason: 'pac_orphan_mcid_recovery(normalize_annotation_tab_order)',
      details: JSON.stringify({
        outcome: 'accepted',
        note: 'pac_orphan_mcid_recovery(normalize_annotation_tab_order)',
        pacRuleRegressions: regressions,
        beforeScore: input.beforeScore,
        afterScore: input.afterScore,
        beforeLinkQualityScore: input.beforeLinkQualityScore ?? null,
        afterLinkQualityScore: input.afterLinkQualityScore ?? null,
        beforeReadingOrderScore: input.beforeReadingOrderScore ?? null,
        afterReadingOrderScore: input.afterReadingOrderScore ?? null,
      }),
    };
  }
  if (isDegenerateNativeReadingOrderRepair) {
    const headingRegressed = (
      input.beforeHeadingScore != null &&
      input.afterHeadingScore != null &&
      input.afterHeadingScore < input.beforeHeadingScore
    );
    if (!scoreImproved || !readingOrderImproved || headingRegressed) {
      return { recover: false, reason: null };
    }
    return {
      recover: true,
      reason: 'pac_orphan_mcid_recovery(repair_degenerate_native_reading_order_shell)',
      details: JSON.stringify({
        outcome: 'accepted',
        note: 'pac_orphan_mcid_recovery(repair_degenerate_native_reading_order_shell)',
        pacRuleRegressions: regressions,
        beforeScore: input.beforeScore,
        afterScore: input.afterScore,
        beforeHeadingScore: input.beforeHeadingScore ?? null,
        afterHeadingScore: input.afterHeadingScore ?? null,
        beforeReadingOrderScore: input.beforeReadingOrderScore ?? null,
        afterReadingOrderScore: input.afterReadingOrderScore ?? null,
      }),
    };
  }
  const pdfUaImproved = (
    input.beforePdfUaScore != null &&
    input.afterPdfUaScore != null &&
    input.afterPdfUaScore > input.beforePdfUaScore
  );
  if (isNativeLinkRepair) {
    if (!scoreImproved && !linkQualityImproved) {
      return { recover: false, reason: null };
    }
    return {
      recover: true,
      reason: 'pac_orphan_mcid_recovery(repair_native_link_structure)',
      details: JSON.stringify({
        outcome: 'accepted',
        note: 'pac_orphan_mcid_recovery(repair_native_link_structure)',
        pacRuleRegressions: regressions,
        beforeScore: input.beforeScore,
        afterScore: input.afterScore,
        beforeLinkQualityScore: input.beforeLinkQualityScore ?? null,
        afterLinkQualityScore: input.afterLinkQualityScore ?? null,
      }),
    };
  }
  if (isAltStructureRepair) {
    if (!scoreImproved && !pdfUaImproved) {
      return { recover: false, reason: null };
    }
    return {
      recover: true,
      reason: 'pac_orphan_mcid_recovery(repair_alt_text_structure)',
      details: JSON.stringify({
        outcome: 'accepted',
        note: 'pac_orphan_mcid_recovery(repair_alt_text_structure)',
        pacRuleRegressions: regressions,
        beforeScore: input.beforeScore,
        afterScore: input.afterScore,
        beforePdfUaScore: input.beforePdfUaScore ?? null,
        afterPdfUaScore: input.afterPdfUaScore ?? null,
      }),
    };
  }
  return { recover: false, reason: null };
}

const STRUCTURE_ANNOTATION_SEQUENCE_STRUCTURAL_TOOLS = new Set([
  'create_heading_from_candidate',
  'normalize_heading_hierarchy',
  'synthesize_basic_structure_from_layout',
  'repair_structure_conformance',
  'remap_orphan_mcids_as_artifacts',
]);

const STRUCTURE_ANNOTATION_SEQUENCE_CLEANUP_TOOLS = new Set([
  'repair_native_link_structure',
  'tag_unowned_annotations',
  'set_link_annotation_contents',
  'normalize_annotation_tab_order',
]);

const STRUCTURE_ANNOTATION_SEQUENCE_ALLOWED_RULES = new Set([
  'pdfua.annotations.tagged_annotations_present',
  'pdfua.content.orphan_mcids_absent',
]);

const STRUCTURE_ANNOTATION_SEQUENCE_INTERMEDIATE_ONLY_RULES = new Set([
  'pdfua.structure.parent_links_valid',
]);

function evidenceRow(snapshot: DocumentSnapshot, ruleId: string): PacRuleEvidence | undefined {
  return buildPacRuleEvidence(snapshot).find(row => row.ruleId === ruleId);
}

export function pacRuleStructureAnnotationSequenceRecovery(input: {
  beforeSnapshot: DocumentSnapshot;
  intermediateSnapshot: DocumentSnapshot;
  finalSnapshot: DocumentSnapshot;
  toolNames: readonly string[];
  beforeScore: number;
  intermediateScore: number;
  finalScore: number;
  beforeHeadingScore?: number | null;
  intermediateHeadingScore?: number | null;
  finalHeadingScore?: number | null;
  targetScore?: number;
}): { recover: boolean; reason: string | null; details?: string } {
  if (!input.toolNames.some(toolName => STRUCTURE_ANNOTATION_SEQUENCE_STRUCTURAL_TOOLS.has(toolName))) {
    return { recover: false, reason: null };
  }
  if (!input.toolNames.some(toolName => STRUCTURE_ANNOTATION_SEQUENCE_CLEANUP_TOOLS.has(toolName))) {
    return { recover: false, reason: null };
  }
  const intermediateRegressions = pacRuleAcceptanceRegressions({
    beforeSnapshot: input.beforeSnapshot,
    afterSnapshot: input.intermediateSnapshot,
    toolNames: input.toolNames,
  });
  if (intermediateRegressions.length === 0) return { recover: false, reason: null };
  if (!intermediateRegressions.some(row => row.ruleId === 'pdfua.annotations.tagged_annotations_present')) {
    return { recover: false, reason: null };
  }
  if (intermediateRegressions.some(row =>
    !STRUCTURE_ANNOTATION_SEQUENCE_ALLOWED_RULES.has(row.ruleId) &&
    !STRUCTURE_ANNOTATION_SEQUENCE_INTERMEDIATE_ONLY_RULES.has(row.ruleId)
  )) {
    return { recover: false, reason: null };
  }
  const intermediateHeadingImproved = (
    input.beforeHeadingScore != null &&
    input.intermediateHeadingScore != null &&
    input.intermediateHeadingScore > input.beforeHeadingScore
  );
  if (input.intermediateScore <= input.beforeScore || !intermediateHeadingImproved) {
    return { recover: false, reason: null };
  }
  if (input.finalScore <= input.beforeScore || input.finalScore < (input.targetScore ?? 80)) {
    return { recover: false, reason: null };
  }
  if (!pageTextTagEvidencePreserved(input.beforeSnapshot, input.finalSnapshot)) {
    return { recover: false, reason: null };
  }
  const finalRegressions = pacRuleAcceptanceRegressions({
    beforeSnapshot: input.beforeSnapshot,
    afterSnapshot: input.finalSnapshot,
    toolNames: input.toolNames,
  });
  if (finalRegressions.some(row => !STRUCTURE_ANNOTATION_SEQUENCE_ALLOWED_RULES.has(row.ruleId))) {
    return { recover: false, reason: null };
  }
  const intermediateAnnotationCount = failedCount(evidenceRow(input.intermediateSnapshot, 'pdfua.annotations.tagged_annotations_present'));
  const finalAnnotationCount = failedCount(evidenceRow(input.finalSnapshot, 'pdfua.annotations.tagged_annotations_present'));
  if (finalAnnotationCount >= intermediateAnnotationCount) {
    return { recover: false, reason: null };
  }
  const finalHeadingPreserved = (
    input.finalHeadingScore == null ||
    input.intermediateHeadingScore == null ||
    input.finalHeadingScore >= input.intermediateHeadingScore
  );
  if (!finalHeadingPreserved) return { recover: false, reason: null };
  const reason = 'structure_annotation_sequence_recovered';
  return {
    recover: true,
    reason,
    details: JSON.stringify({
      outcome: 'accepted',
      note: reason,
      intermediateRegressions,
      finalRegressions,
      beforeScore: input.beforeScore,
      intermediateScore: input.intermediateScore,
      finalScore: input.finalScore,
      beforeHeadingScore: input.beforeHeadingScore ?? null,
      intermediateHeadingScore: input.intermediateHeadingScore ?? null,
      finalHeadingScore: input.finalHeadingScore ?? null,
      intermediateAnnotationCount,
      finalAnnotationCount,
    }),
  };
}

function pageTextTagEvidencePreserved(before: DocumentSnapshot, after: DocumentSnapshot): boolean {
  if (after.pageCount !== before.pageCount) return false;
  if (after.textCharCount < before.textCharCount) return false;
  if (before.isTagged && !after.isTagged) return false;
  return true;
}

export function pacRuleAcceptanceGateForAppliedTools(input: {
  beforeSnapshot: DocumentSnapshot;
  afterSnapshot: DocumentSnapshot;
  appliedTools: readonly AppliedRemediationTool[];
}): PacRuleAcceptanceDecision {
  return pacRuleAcceptanceGate({
    beforeSnapshot: input.beforeSnapshot,
    afterSnapshot: input.afterSnapshot,
    toolNames: input.appliedTools.map(row => row.toolName),
  });
}
