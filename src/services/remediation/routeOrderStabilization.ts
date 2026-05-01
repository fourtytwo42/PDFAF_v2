import type { AnalysisResult, CategoryKey } from '../../types.js';
import {
  acceptedToolHarmDecisionForAnalysis,
  categoryScoresFromAnalysis,
  type AcceptedToolHarmDecision,
} from './acceptedToolHarm.js';

export const STAGE160_TRANSACTION_CLEANUP_TOOLS = new Set([
  'repair_alt_text_structure',
  'repair_native_link_structure',
  'remap_orphan_mcids_as_artifacts',
]);

export const STAGE160_TRANSACTION_CORE_CATEGORIES = [
  'heading_structure',
  'reading_order',
  'alt_text',
  'table_markup',
  'link_quality',
] as const satisfies readonly CategoryKey[];

export const STAGE160_RECOVERY_TOOLS_BY_CATEGORY: Partial<Record<CategoryKey, readonly string[]>> = {
  alt_text: ['repair_alt_text_structure', 'canonicalize_figure_alt_ownership', 'set_figure_alt_text', 'retag_as_figure'],
  table_markup: ['normalize_table_structure', 'set_table_header_cells', 'repair_native_table_headers', 'remap_orphan_mcids_as_artifacts'],
  reading_order: [
    'normalize_annotation_tab_order',
    'repair_native_link_structure',
    'remap_orphan_mcids_as_artifacts',
    'mark_untagged_content_as_artifact',
    'artifact_repeating_page_furniture',
  ],
  link_quality: ['repair_native_link_structure', 'normalize_annotation_tab_order', 'set_link_annotation_contents', 'tag_unowned_annotations'],
  heading_structure: ['create_heading_from_candidate', 'create_heading_from_tagged_visible_anchor', 'bridge_native_title_text_owner', 'normalize_heading_hierarchy'],
};

export interface Stage160CleanupTransactionPlan {
  shouldAttempt: boolean;
  toolName: string;
  droppedCategory: CategoryKey | null;
  droppedDelta: number | null;
  recoveryTools: string[];
  harmDecision: AcceptedToolHarmDecision;
}

export function stage160CleanupTransactionPlan(input: {
  toolName: string;
  before: AnalysisResult;
  afterCleanup: AnalysisResult;
}): Stage160CleanupTransactionPlan {
  const harmDecision = acceptedToolHarmDecisionForAnalysis({
    toolName: input.toolName,
    before: input.before,
    after: input.afterCleanup,
  });
  const droppedCategory = harmDecision.droppedCategory;
  const recoveryTools = droppedCategory
    ? [...(STAGE160_RECOVERY_TOOLS_BY_CATEGORY[droppedCategory] ?? [])]
        .filter(tool => tool !== input.toolName)
    : [];
  return {
    shouldAttempt:
      harmDecision.reject &&
      STAGE160_TRANSACTION_CLEANUP_TOOLS.has(input.toolName) &&
      recoveryTools.length > 0,
    toolName: input.toolName,
    droppedCategory,
    droppedDelta: harmDecision.droppedDelta,
    recoveryTools,
    harmDecision,
  };
}

function categoryDelta(
  before: Partial<Record<CategoryKey, number>>,
  after: Partial<Record<CategoryKey, number>>,
  key: CategoryKey,
): number | null {
  const beforeScore = before[key];
  const afterScore = after[key];
  return beforeScore == null || afterScore == null ? null : afterScore - beforeScore;
}

export function stage160CleanupTransactionFinalDecision(input: {
  toolName: string;
  before: AnalysisResult;
  final: AnalysisResult;
  plan: Stage160CleanupTransactionPlan;
}): { accept: boolean; reason: string; details: Record<string, unknown> } {
  const beforeScores = categoryScoresFromAnalysis(input.before);
  const finalScores = categoryScoresFromAnalysis(input.final);
  const categoryDeltas: Partial<Record<CategoryKey, number>> = {};
  for (const category of STAGE160_TRANSACTION_CORE_CATEGORIES) {
    const delta = categoryDelta(beforeScores, finalScores, category);
    if (delta != null) categoryDeltas[category] = delta;
  }
  const coreRegressions = Object.entries(categoryDeltas)
    .filter(([, delta]) => typeof delta === 'number' && delta < 0)
    .map(([category, delta]) => `${category}:${delta}`);
  const targetImproved = input.plan.harmDecision.targetCategories.some(category => {
    const delta = categoryDelta(beforeScores, finalScores, category);
    return typeof delta === 'number' && delta > 0;
  });
  const scoreImproved = input.final.score > input.before.score;
  const scoreSafe = input.final.score >= input.before.score;
  const droppedCategoryRestored = input.plan.droppedCategory
    ? (categoryDelta(beforeScores, finalScores, input.plan.droppedCategory) ?? -Infinity) >= 0
    : true;
  const accept = scoreSafe && coreRegressions.length === 0 && droppedCategoryRestored && (targetImproved || scoreImproved);
  const reason = accept
    ? 'stage160_cleanup_transaction_committed'
    : `stage160_cleanup_transaction_rollback(score:${input.before.score}->${input.final.score},core:${coreRegressions.join(',') || 'none'},restored:${droppedCategoryRestored},targetImproved:${targetImproved},scoreImproved:${scoreImproved})`;
  return {
    accept,
    reason,
    details: {
      outcome: accept ? 'applied' : 'rejected',
      note: reason,
      toolName: input.toolName,
      droppedCategory: input.plan.droppedCategory,
      droppedDelta: input.plan.droppedDelta,
      targetCategories: input.plan.harmDecision.targetCategories,
      targetDeltas: input.plan.harmDecision.targetDeltas,
      categoryDeltas,
      scoreBefore: input.before.score,
      scoreAfter: input.final.score,
    },
  };
}
