import type { AnalysisResult, CategoryKey, DocumentSnapshot } from '../../types.js';
import {
  classifyStage192TrueMissingAlt,
  type Stage192MissingAltTarget,
} from './stage192TrueMissingAlt.js';

export type Stage193SemanticAltClass =
  | 'semantic_alt_candidate'
  | 'rolemap_semantic_alt_candidate'
  | 'semantic_alt_blocked_by_structure'
  | 'semantic_alt_no_context'
  | 'semantic_alt_not_needed'
  | 'protected_or_analyzer_volatility'
  | 'no_semantic_alt_candidate';

export interface Stage193SemanticAltContext {
  id: string;
  structRef: string;
  page: number;
  rawRole: string | null;
  resolvedRole: string | null;
  source: Stage192MissingAltTarget['source'];
  bbox: [number, number, number, number] | null;
  parentPath: string[];
  subtreeMcidCount: number;
  subtreeMcids: number[];
  surroundingText: string;
  documentTitle: string;
  ownershipSummary: string;
  classification: Stage193SemanticAltClass;
  reason: string;
}

export interface Stage193SemanticAltDecision {
  rowClassification: Stage193SemanticAltClass;
  behaviorCandidate: boolean;
  reason: string;
  categoryScores: Partial<Record<CategoryKey, number | null>>;
  contexts: Stage193SemanticAltContext[];
  contextClassCounts: Record<Stage193SemanticAltClass, number>;
}

const CORE_MIN = 80;
const MAX_CONTEXTS = 48;

const ALL_CLASSES: Stage193SemanticAltClass[] = [
  'semantic_alt_candidate',
  'rolemap_semantic_alt_candidate',
  'semantic_alt_blocked_by_structure',
  'semantic_alt_no_context',
  'semantic_alt_not_needed',
  'protected_or_analyzer_volatility',
  'no_semantic_alt_candidate',
];

function categoryScore(analysis: AnalysisResult, key: CategoryKey): number | null {
  const category = analysis.categories.find(row => row.key === key);
  return category?.applicable === false ? null : category?.score ?? null;
}

function documentTitle(snapshot: DocumentSnapshot, fallback = ''): string {
  return (snapshot.metadata.title ?? snapshot.structTitle ?? fallback).trim();
}

function hasContext(target: Stage192MissingAltTarget): boolean {
  return target.page >= 0 &&
    Boolean(target.structRef) &&
    (target.directContent || target.subtreeMcidCount > 0) &&
    (target.surroundingText.trim().length > 0 || target.bbox !== null || target.subtreeMcidCount > 0);
}

function ownershipSummary(target: Stage192MissingAltTarget): string {
  const bits = [
    target.directContent ? 'direct-content' : 'subtree-content',
    `${target.subtreeMcidCount} subtree MCID(s)`,
  ];
  if (target.bbox) bits.push(`bbox ${target.bbox.map(n => Number(n.toFixed(2))).join(',')}`);
  if (target.parentPath.length > 0) bits.push(`parent ${target.parentPath.slice(-3).join(' > ')}`);
  return bits.join('; ');
}

function contextFromTarget(
  target: Stage192MissingAltTarget,
  classification: Stage193SemanticAltClass,
  reason: string,
  title: string,
): Stage193SemanticAltContext {
  return {
    id: target.structRef,
    structRef: target.structRef,
    page: target.page,
    rawRole: target.rawRole,
    resolvedRole: target.resolvedRole,
    source: target.source,
    bbox: target.bbox,
    parentPath: target.parentPath,
    subtreeMcidCount: target.subtreeMcidCount,
    subtreeMcids: target.subtreeMcids,
    surroundingText: target.surroundingText,
    documentTitle: title,
    ownershipSummary: ownershipSummary(target),
    classification,
    reason,
  };
}

export function classifyStage193SemanticAlt(input: {
  analysis: AnalysisResult;
  snapshot: DocumentSnapshot;
  parked?: boolean;
  filename?: string;
  falsePositiveApplied?: number;
}): Stage193SemanticAltDecision {
  const categories: Partial<Record<CategoryKey, number | null>> = {
    heading_structure: categoryScore(input.analysis, 'heading_structure'),
    reading_order: categoryScore(input.analysis, 'reading_order'),
    alt_text: categoryScore(input.analysis, 'alt_text'),
    table_markup: categoryScore(input.analysis, 'table_markup'),
    pdf_ua_compliance: categoryScore(input.analysis, 'pdf_ua_compliance'),
    link_quality: categoryScore(input.analysis, 'link_quality'),
  };
  const title = documentTitle(input.snapshot, input.filename ?? input.analysis.filename ?? '');
  const counts = Object.fromEntries(ALL_CLASSES.map(key => [key, 0])) as Record<Stage193SemanticAltClass, number>;
  const alt = categories.alt_text ?? 100;
  if (input.parked) {
    counts.protected_or_analyzer_volatility = 1;
    return {
      rowClassification: 'protected_or_analyzer_volatility',
      behaviorCandidate: false,
      reason: 'parked protected/analyzer-volatility row',
      categoryScores: categories,
      contexts: [],
      contextClassCounts: counts,
    };
  }
  if ((input.falsePositiveApplied ?? 0) > 0) {
    counts.no_semantic_alt_candidate = 1;
    return {
      rowClassification: 'no_semantic_alt_candidate',
      behaviorCandidate: false,
      reason: 'false-positive-applied evidence present',
      categoryScores: categories,
      contexts: [],
      contextClassCounts: counts,
    };
  }
  if (alt >= CORE_MIN) {
    counts.semantic_alt_not_needed = 1;
    return {
      rowClassification: 'semantic_alt_not_needed',
      behaviorCandidate: false,
      reason: 'alt_text already meets threshold',
      categoryScores: categories,
      contexts: [],
      contextClassCounts: counts,
    };
  }

  const rowBlocked =
    (categories.heading_structure ?? 0) < CORE_MIN ||
    (categories.reading_order ?? 0) < CORE_MIN ||
    (categories.table_markup ?? 100) < CORE_MIN ||
    (categories.link_quality ?? 100) < CORE_MIN;

  const stage192 = classifyStage192TrueMissingAlt({
    analysis: input.analysis,
    snapshot: input.snapshot,
    parked: input.parked,
    falsePositiveApplied: input.falsePositiveApplied,
  });

  const contexts: Stage193SemanticAltContext[] = [];
  for (const target of stage192.missingAltTargets) {
    let classification: Stage193SemanticAltClass;
    let reason: string;
    if (rowBlocked || target.classification === 'table_or_heading_blocked_not_alt_first') {
      classification = 'semantic_alt_blocked_by_structure';
      reason = 'heading, reading-order, table, or link blocker must move before semantic alt';
    } else if (!hasContext(target)) {
      classification = 'semantic_alt_no_context';
      reason = 'target lacks enough page, ownership, bbox, or nearby text context for semantic alt';
    } else if (target.classification === 'meaningful_needs_semantic_alt') {
      classification = 'semantic_alt_candidate';
      reason = 'content-backed reachable Figure needs real alt text';
    } else if (target.classification === 'rolemap_retag_then_alt_candidate') {
      classification = 'rolemap_semantic_alt_candidate';
      reason = 'content-backed role-map figure-like target may need semantic alt after ownership repair';
    } else {
      classification = 'no_semantic_alt_candidate';
      reason = `Stage192 target class ${target.classification} is not a semantic-alt pilot target`;
    }
    counts[classification] = (counts[classification] ?? 0) + 1;
    contexts.push(contextFromTarget(target, classification, reason, title));
    if (contexts.length >= MAX_CONTEXTS) break;
  }

  const rowClassification =
    contexts.some(row => row.classification === 'semantic_alt_candidate') ? 'semantic_alt_candidate'
      : contexts.some(row => row.classification === 'rolemap_semantic_alt_candidate') ? 'rolemap_semantic_alt_candidate'
        : contexts.some(row => row.classification === 'semantic_alt_blocked_by_structure') ? 'semantic_alt_blocked_by_structure'
          : contexts.some(row => row.classification === 'semantic_alt_no_context') ? 'semantic_alt_no_context'
            : 'no_semantic_alt_candidate';
  const behaviorCandidate =
    rowClassification === 'semantic_alt_candidate' || rowClassification === 'rolemap_semantic_alt_candidate';
  const reason = contexts.length === 0
    ? 'no target-level semantic alt contexts found'
    : behaviorCandidate
      ? `${counts.semantic_alt_candidate} raw Figure semantic candidate(s), ${counts.rolemap_semantic_alt_candidate} role-map semantic candidate(s)`
      : `${counts.semantic_alt_blocked_by_structure} blocked target(s), ${counts.semantic_alt_no_context} no-context target(s), ${counts.no_semantic_alt_candidate} non-semantic target(s)`;

  return {
    rowClassification,
    behaviorCandidate,
    reason,
    categoryScores: categories,
    contexts,
    contextClassCounts: counts,
  };
}

export function stage193SemanticAltCandidateStructRefs(input: {
  analysis: AnalysisResult;
  snapshot: DocumentSnapshot;
  filename?: string;
  falsePositiveApplied?: number;
}): Set<string> {
  const decision = classifyStage193SemanticAlt(input);
  return new Set(
    decision.contexts
      .filter(context =>
        context.classification === 'semantic_alt_candidate' ||
        context.classification === 'rolemap_semantic_alt_candidate',
      )
      .map(context => context.structRef),
  );
}

