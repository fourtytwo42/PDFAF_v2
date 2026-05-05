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
  'pdfua.structure.child_roles_valid',
  'pdfua.parent_tree.mcid_entries_valid',
  'pdfua.structure.rolemap_valid',
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

export function pacAcceptanceGateAppliesToTools(toolNames: readonly string[]): boolean {
  return toolNames.some(toolName => PAC_STRUCTURAL_TOOL_NAMES.has(toolName));
}

export function pacRuleAcceptanceGate(input: {
  beforeSnapshot: DocumentSnapshot;
  afterSnapshot: DocumentSnapshot;
  toolNames?: readonly string[];
}): PacRuleAcceptanceDecision {
  if (input.toolNames && !pacAcceptanceGateAppliesToTools(input.toolNames)) {
    return { reject: false, reason: null };
  }

  const beforeRules = mapSelectedRules(input.beforeSnapshot);
  const afterRules = mapSelectedRules(input.afterSnapshot);
  for (const ruleId of PAC_ACCEPTANCE_RULE_IDS) {
    const after = afterRules.get(ruleId);
    if (!after) continue;
    const before = beforeRules.get(ruleId);
    const beforeFailed = before?.status === 'fail';
    const beforeCount = failedCount(before);
    const afterCount = failedCount(after);
    if (after.status === 'fail' && (!beforeFailed || afterCount > beforeCount)) {
      const reason = `pac_rule_regressed(${ruleId})`;
      return {
        reject: true,
        reason,
        details: JSON.stringify({
          outcome: 'rejected',
          note: reason,
          pacRuleRegression: regressionDetails(before, after),
        }),
      };
    }
  }

  return { reject: false, reason: null };
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
