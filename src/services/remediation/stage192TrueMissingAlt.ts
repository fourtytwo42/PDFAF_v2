import type { AnalysisResult, AppliedRemediationTool, CategoryKey, DocumentSnapshot } from '../../types.js';
import { collectStage186TargetRefs } from './stage186Hard2TableAlt.js';

export type Stage192MissingAltTargetClass =
  | 'safe_decorative_artifact_candidate'
  | 'repeated_template_artifact_candidate'
  | 'deterministic_placeholder_safe'
  | 'meaningful_needs_semantic_alt'
  | 'rolemap_retag_then_alt_candidate'
  | 'table_or_heading_blocked_not_alt_first'
  | 'analyzer_or_route_volatility'
  | 'no_safe_alt_action';

export interface Stage192MissingAltTarget {
  structRef: string;
  page: number;
  rawRole: string | null;
  resolvedRole: string | null;
  source: 'checker_visible_raw_figure' | 'rolemap_figure_like';
  hasAlt: boolean;
  reachable: boolean;
  directContent: boolean;
  subtreeMcidCount: number;
  subtreeMcids: number[];
  parentPath: string[];
  bbox: [number, number, number, number] | null;
  signature: string;
  repeatedSignatureCount: number;
  surroundingText: string;
  attemptedBefore: boolean;
  classification: Stage192MissingAltTargetClass;
  reason: string;
}

export interface Stage192TrueMissingAltDecision {
  rowClassification: Stage192MissingAltTargetClass;
  behaviorCandidate: boolean;
  reason: string;
  categoryScores: Partial<Record<CategoryKey, number | null>>;
  projectedAltAfterDeterministicCleanup: number | null;
  missingAltTargets: Stage192MissingAltTarget[];
  targetClassCounts: Record<Stage192MissingAltTargetClass, number>;
  attemptedAltRefs: string[];
}

const CORE_MIN = 80;
const ALT_TOOL_NAMES = new Set([
  'set_figure_alt_text',
  'retag_as_figure',
  'canonicalize_figure_alt_ownership',
  'repair_alt_text_structure',
  'normalize_nested_figure_containers',
]);

function categoryScore(analysis: AnalysisResult, key: CategoryKey): number | null {
  const category = analysis.categories.find(row => row.key === key);
  return category?.applicable === false ? null : category?.score ?? null;
}

function normRole(value: unknown): string {
  return String(value ?? '').replace(/^\//, '').trim().toLowerCase();
}

function isFigure(value: unknown): boolean {
  return normRole(value) === 'figure';
}

function mcids(value: unknown): number[] {
  return Array.isArray(value)
    ? value.filter((item): item is number => Number.isInteger(item) && item >= 0)
    : [];
}

function parentRoleSignature(parentPath: readonly string[] | undefined): string {
  return (parentPath ?? [])
    .slice(0, 4)
    .map(item => item.split('@')[0]?.replace(/^\//, '').toLowerCase() ?? '')
    .filter(Boolean)
    .join('>');
}

function bboxSignature(bbox: [number, number, number, number] | null): string {
  if (!bbox) return 'no-bbox';
  const [x0, y0, x1, y1] = bbox;
  const width = Math.max(0, x1 - x0);
  const height = Math.max(0, y1 - y0);
  return `${Math.round(width / 10) * 10}x${Math.round(height / 10) * 10}`;
}

function bboxArea(bbox: [number, number, number, number] | null): number | null {
  if (!bbox) return null;
  return Math.max(0, bbox[2] - bbox[0]) * Math.max(0, bbox[3] - bbox[1]);
}

function targetSignature(input: {
  rawRole: string | null;
  resolvedRole: string | null;
  parentPath: readonly string[];
  subtreeMcidCount: number;
  bbox: [number, number, number, number] | null;
}): string {
  return [
    normRole(input.rawRole),
    normRole(input.resolvedRole),
    parentRoleSignature(input.parentPath),
    input.subtreeMcidCount,
    bboxSignature(input.bbox),
  ].join('|');
}

function snippetForPage(snapshot: DocumentSnapshot, page: number): string {
  return (snapshot.textByPage[page] ?? '')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .slice(0, 8)
    .join(' ')
    .slice(0, 500);
}

function attemptedAltRefs(tools: readonly AppliedRemediationTool[]): string[] {
  const refs = new Set<string>();
  for (const tool of tools) {
    if (!ALT_TOOL_NAMES.has(tool.toolName)) continue;
    for (const ref of collectStage186TargetRefs(tool.details)) refs.add(ref);
  }
  return [...refs].sort();
}

function figureScoreForRatio(withAlt: number, total: number): number {
  if (total <= 0) return 100;
  const ratio = withAlt / total;
  if (ratio >= 1) return 100;
  if (ratio >= 0.8) return 85;
  if (ratio >= 0.5) return 60;
  if (ratio >= 0.01) return 20;
  return 0;
}

function informativeFigureCounts(snapshot: DocumentSnapshot): { total: number; withAlt: number } {
  const informative = snapshot.figures.filter(figure => !figure.isArtifact && figure.reachable !== false);
  return {
    total: informative.length,
    withAlt: informative.filter(figure => figure.hasAlt && Boolean(figure.altText?.trim())).length,
  };
}

function matchingFigure(snapshot: DocumentSnapshot, structRef: string | undefined): DocumentSnapshot['figures'][number] | undefined {
  return structRef ? snapshot.figures.find(figure => figure.structRef === structRef) : undefined;
}

function candidateTargets(snapshot: DocumentSnapshot): Omit<Stage192MissingAltTarget, 'repeatedSignatureCount' | 'classification' | 'reason' | 'attemptedBefore'>[] {
  const out: Omit<Stage192MissingAltTarget, 'repeatedSignatureCount' | 'classification' | 'reason' | 'attemptedBefore'>[] = [];
  for (const target of snapshot.checkerFigureTargets ?? []) {
    if (!target.structRef || target.hasAlt || target.isArtifact || target.reachable !== true) continue;
    if (!isFigure(target.resolvedRole ?? target.role)) continue;
    const figure = matchingFigure(snapshot, target.structRef);
    const bbox = figure?.bbox ?? null;
    const row = {
      structRef: target.structRef,
      page: target.page,
      rawRole: target.role ?? figure?.rawRole ?? null,
      resolvedRole: target.resolvedRole ?? target.role ?? figure?.role ?? null,
      source: 'checker_visible_raw_figure' as const,
      hasAlt: false,
      reachable: target.reachable,
      directContent: target.directContent === true || figure?.directContent === true,
      subtreeMcidCount: figure?.subtreeMcidCount ?? mcids(target.subtreeMcids).length,
      subtreeMcids: figure ? mcids(figure.subtreeMcids) : mcids(target.subtreeMcids),
      parentPath: target.parentPath ?? figure?.parentPath ?? [],
      bbox,
      signature: '',
      surroundingText: snippetForPage(snapshot, target.page),
    };
    out.push({ ...row, signature: targetSignature(row) });
  }
  for (const figure of snapshot.figures) {
    if (!figure.structRef || figure.hasAlt || figure.isArtifact || figure.reachable !== true) continue;
    if (isFigure(figure.rawRole) || !isFigure(figure.role)) continue;
    if (figure.directContent !== true && (figure.subtreeMcidCount ?? 0) <= 0) continue;
    const row = {
      structRef: figure.structRef,
      page: figure.page,
      rawRole: figure.rawRole ?? null,
      resolvedRole: figure.role ?? null,
      source: 'rolemap_figure_like' as const,
      hasAlt: false,
      reachable: figure.reachable === true,
      directContent: figure.directContent === true,
      subtreeMcidCount: figure.subtreeMcidCount ?? 0,
      subtreeMcids: mcids(figure.subtreeMcids),
      parentPath: figure.parentPath ?? [],
      bbox: figure.bbox ?? null,
      signature: '',
      surroundingText: snippetForPage(snapshot, figure.page),
    };
    out.push({ ...row, signature: targetSignature(row) });
  }
  return out.sort((a, b) => a.page - b.page || a.structRef.localeCompare(b.structRef));
}

function classifyTarget(input: {
  target: Omit<Stage192MissingAltTarget, 'repeatedSignatureCount' | 'classification' | 'reason' | 'attemptedBefore'>;
  repeatedSignatureCount: number;
  attemptedBefore: boolean;
  rowBlocked: boolean;
}): Pick<Stage192MissingAltTarget, 'classification' | 'reason'> {
  const { target, repeatedSignatureCount, attemptedBefore, rowBlocked } = input;
  if (rowBlocked) {
    return {
      classification: 'table_or_heading_blocked_not_alt_first',
      reason: 'row has heading/reading/table blockers, so target is diagnostic-only',
    };
  }
  if (attemptedBefore) {
    return {
      classification: 'no_safe_alt_action',
      reason: 'target ref was already attempted by an alt-related tool',
    };
  }
  if (target.source === 'rolemap_figure_like') {
    return {
      classification: 'rolemap_retag_then_alt_candidate',
      reason: 'reachable role-mapped figure-like content lacks checker-visible Figure ownership',
    };
  }
  if (!target.directContent && target.subtreeMcidCount <= 0) {
    return {
      classification: 'no_safe_alt_action',
      reason: 'target lacks direct or subtree content ownership',
    };
  }
  const area = bboxArea(target.bbox);
  if (area !== null && area > 0 && area <= 400 && repeatedSignatureCount >= 3) {
    return {
      classification: 'safe_decorative_artifact_candidate',
      reason: 'small repeated figure-like target may be decorative, pending visual confirmation',
    };
  }
  if (repeatedSignatureCount >= 6 && target.subtreeMcidCount <= 3) {
    return {
      classification: 'repeated_template_artifact_candidate',
      reason: 'same bounded figure signature repeats many times with small content ownership',
    };
  }
  if (target.directContent || target.subtreeMcidCount > 0) {
    return {
      classification: 'meaningful_needs_semantic_alt',
      reason: 'content-backed raw Figure lacks Alt and is not safely decorative/template by deterministic evidence',
    };
  }
  return {
    classification: 'no_safe_alt_action',
    reason: 'no safe deterministic missing-alt action',
  };
}

export function classifyStage192TrueMissingAlt(input: {
  analysis: AnalysisResult;
  snapshot: DocumentSnapshot;
  appliedTools?: readonly AppliedRemediationTool[];
  parked?: boolean;
  falsePositiveApplied?: number;
}): Stage192TrueMissingAltDecision {
  const categories: Partial<Record<CategoryKey, number | null>> = {
    heading_structure: categoryScore(input.analysis, 'heading_structure'),
    reading_order: categoryScore(input.analysis, 'reading_order'),
    alt_text: categoryScore(input.analysis, 'alt_text'),
    table_markup: categoryScore(input.analysis, 'table_markup'),
    pdf_ua_compliance: categoryScore(input.analysis, 'pdf_ua_compliance'),
    link_quality: categoryScore(input.analysis, 'link_quality'),
  };
  const attempted = attemptedAltRefs(input.appliedTools ?? []);
  const attemptedSet = new Set(attempted);
  const baseCandidates = candidateTargets(input.snapshot);
  const signatureCounts = new Map<string, number>();
  for (const target of baseCandidates) {
    signatureCounts.set(target.signature, (signatureCounts.get(target.signature) ?? 0) + 1);
  }

  const rowBlocked =
    (categories.heading_structure ?? 0) < CORE_MIN ||
    (categories.reading_order ?? 0) < CORE_MIN ||
    (categories.table_markup ?? 100) < CORE_MIN;

  const missingAltTargets = baseCandidates.map(target => {
    const repeatedSignatureCount = signatureCounts.get(target.signature) ?? 1;
    const attemptedBefore = attemptedSet.has(target.structRef);
    const classification = input.parked
      ? { classification: 'analyzer_or_route_volatility' as const, reason: 'parked protected/analyzer-volatility control' }
      : (input.falsePositiveApplied ?? 0) > 0
        ? { classification: 'no_safe_alt_action' as const, reason: 'false-positive-applied evidence present' }
        : classifyTarget({ target, repeatedSignatureCount, attemptedBefore, rowBlocked });
    return {
      ...target,
      repeatedSignatureCount,
      attemptedBefore,
      ...classification,
    };
  });

  const targetClassCounts = Object.fromEntries([
    'safe_decorative_artifact_candidate',
    'repeated_template_artifact_candidate',
    'deterministic_placeholder_safe',
    'meaningful_needs_semantic_alt',
    'rolemap_retag_then_alt_candidate',
    'table_or_heading_blocked_not_alt_first',
    'analyzer_or_route_volatility',
    'no_safe_alt_action',
  ].map(key => [key, 0])) as Record<Stage192MissingAltTargetClass, number>;
  for (const target of missingAltTargets) {
    targetClassCounts[target.classification] = (targetClassCounts[target.classification] ?? 0) + 1;
  }

  const ordered: Stage192MissingAltTargetClass[] = [
    'safe_decorative_artifact_candidate',
    'repeated_template_artifact_candidate',
    'rolemap_retag_then_alt_candidate',
    'meaningful_needs_semantic_alt',
    'table_or_heading_blocked_not_alt_first',
    'analyzer_or_route_volatility',
    'no_safe_alt_action',
  ];
  const rowClassification = input.parked
    ? 'analyzer_or_route_volatility'
    : ordered.find(key => targetClassCounts[key] > 0) ?? 'no_safe_alt_action';
  const deterministicTargetCount =
    targetClassCounts.safe_decorative_artifact_candidate +
    targetClassCounts.repeated_template_artifact_candidate;
  const informative = informativeFigureCounts(input.snapshot);
  const projectedAltAfterDeterministicCleanup = deterministicTargetCount > 0
    ? figureScoreForRatio(informative.withAlt, Math.max(0, informative.total - deterministicTargetCount))
    : null;
  const currentAlt = categories.alt_text ?? 100;
  const behaviorCandidate = deterministicTargetCount > 0 &&
    !rowBlocked &&
    !input.parked &&
    projectedAltAfterDeterministicCleanup !== null &&
    projectedAltAfterDeterministicCleanup > currentAlt;
  const reason = missingAltTargets.length === 0
    ? 'no missing-alt targets found'
    : behaviorCandidate
      ? `${deterministicTargetCount} deterministic cleanup candidate(s) need focused validation`
      : `${targetClassCounts.meaningful_needs_semantic_alt} meaningful target(s), ${targetClassCounts.rolemap_retag_then_alt_candidate} role-map target(s), ${targetClassCounts.table_or_heading_blocked_not_alt_first} blocked target(s); deterministic cleanup projection ${projectedAltAfterDeterministicCleanup ?? 'n/a'} vs current alt ${currentAlt}`;

  return {
    rowClassification,
    behaviorCandidate,
    reason,
    categoryScores: categories,
    projectedAltAfterDeterministicCleanup,
    missingAltTargets,
    targetClassCounts,
    attemptedAltRefs: attempted,
  };
}
