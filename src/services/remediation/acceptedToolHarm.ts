import type { AnalysisResult, CategoryKey } from '../../types.js';

const DEFAULT_MATERIAL_DROP_THRESHOLD = 20;

export const ACCEPTED_TOOL_HARM_CORE_CATEGORIES = [
  'heading_structure',
  'reading_order',
  'alt_text',
  'table_markup',
  'link_quality',
] as const satisfies readonly CategoryKey[];

const GUARDED_TOOL_TARGETS: Record<string, readonly CategoryKey[]> = {
  repair_alt_text_structure: ['alt_text'],
  repair_native_link_structure: ['link_quality', 'reading_order'],
  tag_unowned_annotations: ['link_quality', 'reading_order'],
  normalize_annotation_tab_order: ['link_quality', 'reading_order'],
  remap_orphan_mcids_as_artifacts: ['reading_order', 'pdf_ua_compliance'],
  mark_untagged_content_as_artifact: ['reading_order', 'pdf_ua_compliance'],
  artifact_repeating_page_furniture: ['reading_order', 'pdf_ua_compliance'],
};

export interface AcceptedToolHarmDecision {
  reject: boolean;
  reason: string | null;
  details?: string;
  toolName: string;
  targetCategories: CategoryKey[];
  targetDeltas: Partial<Record<CategoryKey, number>>;
  droppedCategory: CategoryKey | null;
  droppedDelta: number | null;
}

export function acceptedToolHarmTargetsForTool(toolName: string): CategoryKey[] {
  return [...(GUARDED_TOOL_TARGETS[toolName] ?? [])];
}

export function categoryScoresFromAnalysis(analysis: AnalysisResult): Partial<Record<CategoryKey, number>> {
  const out: Partial<Record<CategoryKey, number>> = {};
  for (const category of analysis.categories) {
    if (typeof category.score === 'number') {
      out[category.key] = category.score;
    }
  }
  return out;
}

function categoryDeltas(
  before: Partial<Record<CategoryKey, number>>,
  after: Partial<Record<CategoryKey, number>>,
): Partial<Record<CategoryKey, { before: number; after: number; delta: number }>> {
  const keys = new Set<CategoryKey>([
    ...Object.keys(before) as CategoryKey[],
    ...Object.keys(after) as CategoryKey[],
  ]);
  const out: Partial<Record<CategoryKey, { before: number; after: number; delta: number }>> = {};
  for (const key of keys) {
    const beforeScore = before[key];
    const afterScore = after[key];
    if (beforeScore == null || afterScore == null) continue;
    out[key] = { before: beforeScore, after: afterScore, delta: afterScore - beforeScore };
  }
  return out;
}

export function acceptedToolHarmDecisionFromScores(input: {
  toolName: string;
  before: Partial<Record<CategoryKey, number>>;
  after: Partial<Record<CategoryKey, number>>;
  materialDropThreshold?: number;
}): AcceptedToolHarmDecision {
  const targetCategories = acceptedToolHarmTargetsForTool(input.toolName);
  const targetDeltas: Partial<Record<CategoryKey, number>> = {};
  if (targetCategories.length === 0) {
    return {
      reject: false,
      reason: null,
      toolName: input.toolName,
      targetCategories,
      targetDeltas,
      droppedCategory: null,
      droppedDelta: null,
    };
  }

  for (const category of targetCategories) {
    const beforeScore = input.before[category];
    const afterScore = input.after[category];
    if (beforeScore != null && afterScore != null) {
      targetDeltas[category] = afterScore - beforeScore;
    }
  }
  if (Object.values(targetDeltas).some(delta => typeof delta === 'number' && delta > 0)) {
    return {
      reject: false,
      reason: null,
      toolName: input.toolName,
      targetCategories,
      targetDeltas,
      droppedCategory: null,
      droppedDelta: null,
    };
  }

  const targets = new Set<CategoryKey>(targetCategories);
  const threshold = input.materialDropThreshold ?? DEFAULT_MATERIAL_DROP_THRESHOLD;
  let strongestDrop: { category: CategoryKey; delta: number; before: number; after: number } | null = null;
  for (const category of ACCEPTED_TOOL_HARM_CORE_CATEGORIES) {
    if (targets.has(category)) continue;
    const beforeScore = input.before[category];
    const afterScore = input.after[category];
    if (beforeScore == null || afterScore == null) continue;
    const delta = afterScore - beforeScore;
    if (delta <= -threshold && (!strongestDrop || delta < strongestDrop.delta)) {
      strongestDrop = { category, delta, before: beforeScore, after: afterScore };
    }
  }

  if (!strongestDrop) {
    return {
      reject: false,
      reason: null,
      toolName: input.toolName,
      targetCategories,
      targetDeltas,
      droppedCategory: null,
      droppedDelta: null,
    };
  }

  const reason = `stage159_targetless_core_category_regression(${input.toolName}:${strongestDrop.category}:${strongestDrop.before}->${strongestDrop.after})`;
  return {
    reject: true,
    reason,
    details: JSON.stringify({
      outcome: 'rejected',
      note: reason,
      toolName: input.toolName,
      targetCategories,
      targetDeltas,
      droppedCategory: strongestDrop.category,
      droppedDelta: strongestDrop.delta,
      materialDropThreshold: threshold,
      categoryDeltas: categoryDeltas(input.before, input.after),
    }),
    toolName: input.toolName,
    targetCategories,
    targetDeltas,
    droppedCategory: strongestDrop.category,
    droppedDelta: strongestDrop.delta,
  };
}

export function acceptedToolHarmDecisionForAnalysis(input: {
  toolName: string;
  before: AnalysisResult;
  after: AnalysisResult;
  materialDropThreshold?: number;
}): AcceptedToolHarmDecision {
  return acceptedToolHarmDecisionFromScores({
    toolName: input.toolName,
    before: categoryScoresFromAnalysis(input.before),
    after: categoryScoresFromAnalysis(input.after),
    materialDropThreshold: input.materialDropThreshold,
  });
}
