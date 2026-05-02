import type {
  AnalysisResult,
  AppliedRemediationTool,
  CategoryKey,
  DocumentSnapshot,
} from '../../types.js';

export type Stage181HiddenAltClass =
  | 'hidden_checker_visible_alt_target'
  | 'orphan_figure_alt_ownership_candidate'
  | 'decorative_artifact_candidate'
  | 'alt_score_analyzer_debt'
  | 'mixed_heading_or_protected_volatility'
  | 'no_safe_target';

export interface Stage181HiddenAltTarget {
  toolName: 'set_figure_alt_text' | 'retag_as_figure';
  structRef: string;
  page: number;
  source: 'checker_visible_missing_alt' | 'rolemap_retag_with_alt';
  rawRole?: string | null;
  resolvedRole?: string | null;
  directContent: boolean;
  subtreeMcidCount: number;
}

export interface Stage181HiddenAltDecision {
  classification: Stage181HiddenAltClass;
  shouldAttempt: boolean;
  reason: string;
  targets: Stage181HiddenAltTarget[];
}

const STAGE181_MAX_DIRECT_ALT_TARGETS = 8;
const STAGE181_MAX_ROLEMAP_TARGETS = 4;
const STAGE181_MIN_STABLE_CORE_SCORE = 80;

function categoryScore(analysis: AnalysisResult, key: CategoryKey): number | null {
  return analysis.categories.find(category => category.key === key)?.score ?? null;
}

function parseDetails(details: unknown): Record<string, unknown> | null {
  if (!details) return null;
  if (typeof details === 'object' && !Array.isArray(details)) return details as Record<string, unknown>;
  if (typeof details !== 'string' || !details.trim().startsWith('{')) return null;
  try {
    const parsed = JSON.parse(details) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function nestedRecord(record: Record<string, unknown> | null, key: string): Record<string, unknown> | null {
  const value = record?.[key];
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function addRef(out: Set<string>, value: unknown): void {
  if (typeof value === 'string' && value.length > 0) out.add(value);
}

function addRefsFromTarget(out: Set<string>, value: unknown): void {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    addRef(out, (value as Record<string, unknown>).structRef);
    addRef(out, (value as Record<string, unknown>).targetRef);
  }
}

function collectRefsFromDetails(details: unknown): Set<string> {
  const refs = new Set<string>();
  const parsed = parseDetails(details);
  const invariants = nestedRecord(parsed, 'invariants');
  addRef(refs, invariants?.targetRef);
  addRef(refs, invariants?.structRef);
  addRefsFromTarget(refs, parsed?.target);
  const targetRefs = parsed?.targetRefs;
  if (Array.isArray(targetRefs)) {
    for (const ref of targetRefs) addRef(refs, ref);
  }
  const targets = parsed?.targets;
  if (Array.isArray(targets)) {
    for (const target of targets) addRefsFromTarget(refs, target);
  }
  const mutations = parsed?.mutations;
  if (Array.isArray(mutations)) {
    for (const mutation of mutations) {
      if (!mutation || typeof mutation !== 'object' || Array.isArray(mutation)) continue;
      const record = mutation as Record<string, unknown>;
      addRefsFromTarget(refs, record.target);
      const mutationInvariants = record.invariants && typeof record.invariants === 'object' && !Array.isArray(record.invariants)
        ? record.invariants as Record<string, unknown>
        : null;
      addRef(refs, mutationInvariants?.targetRef);
      addRef(refs, mutationInvariants?.structRef);
    }
  }
  const debug = nestedRecord(parsed, 'debug');
  addRef(refs, debug?.targetRef);
  const replayState = nestedRecord(debug, 'replayState');
  addRef(refs, replayState?.targetRef);
  return refs;
}

function attemptedFigureRefs(
  appliedTools: readonly AppliedRemediationTool[],
  toolNames: ReadonlySet<string>,
): Set<string> {
  const refs = new Set<string>();
  for (const row of appliedTools) {
    if (!toolNames.has(row.toolName)) continue;
    for (const ref of collectRefsFromDetails(row.details)) refs.add(ref);
  }
  return refs;
}

function normalizedRole(value: unknown): string {
  return typeof value === 'string' ? value.replace(/^\//, '').toLowerCase() : '';
}

function isFigureRole(value: unknown): boolean {
  return normalizedRole(value) === 'figure';
}

function figureContentBacked(figure: Pick<DocumentSnapshot['figures'][number], 'directContent' | 'subtreeMcidCount'> | undefined): boolean {
  return figure?.directContent === true || (figure?.subtreeMcidCount ?? 0) > 0;
}

function matchingFigure(snapshot: DocumentSnapshot, structRef: string): DocumentSnapshot['figures'][number] | undefined {
  return snapshot.figures.find(figure => figure.structRef === structRef);
}

function targetSortKey(a: Stage181HiddenAltTarget, b: Stage181HiddenAltTarget): number {
  return Number(b.directContent) - Number(a.directContent) ||
    b.subtreeMcidCount - a.subtreeMcidCount ||
    a.page - b.page ||
    a.structRef.localeCompare(b.structRef);
}

export function stage181HiddenAltTargets(
  snapshot: DocumentSnapshot,
  appliedTools: readonly AppliedRemediationTool[] = [],
): Stage181HiddenAltTarget[] {
  const attemptedSetAlt = attemptedFigureRefs(appliedTools, new Set(['set_figure_alt_text']));
  const directTargets = (snapshot.checkerFigureTargets ?? [])
    .filter(target => {
      if (!target.structRef || attemptedSetAlt.has(target.structRef)) return false;
      if (target.reachable !== true || target.isArtifact || target.hasAlt) return false;
      if (!isFigureRole(target.resolvedRole ?? target.role)) return false;
      const figure = matchingFigure(snapshot, target.structRef);
      return target.directContent === true || figureContentBacked(figure);
    })
    .map(target => {
      const figure = matchingFigure(snapshot, target.structRef!);
      return {
        toolName: 'set_figure_alt_text' as const,
        structRef: target.structRef!,
        page: target.page,
        source: 'checker_visible_missing_alt' as const,
        rawRole: figure?.rawRole ?? null,
        resolvedRole: target.resolvedRole ?? target.role ?? figure?.role ?? null,
        directContent: target.directContent === true || figure?.directContent === true,
        subtreeMcidCount: figure?.subtreeMcidCount ?? 0,
      };
    })
    .sort(targetSortKey)
    .slice(0, STAGE181_MAX_DIRECT_ALT_TARGETS);

  if (directTargets.length > 0) return directTargets;

  const attemptedRetag = attemptedFigureRefs(appliedTools, new Set(['retag_as_figure']));
  return snapshot.figures
    .filter(figure => {
      if (!figure.structRef || attemptedRetag.has(figure.structRef)) return false;
      if (figure.reachable !== true || figure.isArtifact || figure.hasAlt) return false;
      if (!isFigureRole(figure.role)) return false;
      if (!figure.rawRole || isFigureRole(figure.rawRole)) return false;
      return figureContentBacked(figure);
    })
    .map(figure => ({
      toolName: 'retag_as_figure' as const,
      structRef: figure.structRef!,
      page: figure.page,
      source: 'rolemap_retag_with_alt' as const,
      rawRole: figure.rawRole ?? null,
      resolvedRole: figure.role ?? null,
      directContent: figure.directContent === true,
      subtreeMcidCount: figure.subtreeMcidCount ?? 0,
    }))
    .sort(targetSortKey)
    .slice(0, STAGE181_MAX_ROLEMAP_TARGETS);
}

export function classifyStage181HiddenAlt(input: {
  analysis: AnalysisResult;
  snapshot: DocumentSnapshot;
  appliedTools?: readonly AppliedRemediationTool[];
  parked?: boolean;
  falsePositiveApplied?: number;
}): Stage181HiddenAltDecision {
  const targets = stage181HiddenAltTargets(input.snapshot, input.appliedTools ?? []);
  if (input.parked) {
    return {
      classification: 'mixed_heading_or_protected_volatility',
      shouldAttempt: false,
      reason: 'parked protected/analyzer-volatility row',
      targets,
    };
  }
  if ((input.falsePositiveApplied ?? 0) > 0) {
    return {
      classification: 'no_safe_target',
      shouldAttempt: false,
      reason: 'false-positive-applied evidence present',
      targets,
    };
  }
  if (input.analysis.pdfClass === 'scanned' || input.snapshot.pdfClass === 'scanned') {
    return {
      classification: 'no_safe_target',
      shouldAttempt: false,
      reason: 'scanned/OCR rows are not Stage 181 hidden-alt targets',
      targets,
    };
  }
  if (!input.snapshot.isTagged && input.snapshot.structureTree === null) {
    return {
      classification: 'no_safe_target',
      shouldAttempt: false,
      reason: 'no tagged structure tree',
      targets,
    };
  }

  const heading = categoryScore(input.analysis, 'heading_structure') ?? 0;
  const reading = categoryScore(input.analysis, 'reading_order') ?? 0;
  const table = categoryScore(input.analysis, 'table_markup') ?? 100;
  const link = categoryScore(input.analysis, 'link_quality') ?? 100;
  const alt = categoryScore(input.analysis, 'alt_text') ?? 100;
  if (
    heading < STAGE181_MIN_STABLE_CORE_SCORE ||
    reading < STAGE181_MIN_STABLE_CORE_SCORE ||
    table < STAGE181_MIN_STABLE_CORE_SCORE ||
    link < STAGE181_MIN_STABLE_CORE_SCORE
  ) {
    return {
      classification: 'mixed_heading_or_protected_volatility',
      shouldAttempt: false,
      reason: `core categories are not stable enough (${heading}/${reading}/${table}/${link})`,
      targets,
    };
  }
  if (alt >= 90) {
    return {
      classification: 'no_safe_target',
      shouldAttempt: false,
      reason: `alt score already high (${alt})`,
      targets,
    };
  }
  if (input.analysis.score >= 90) {
    return {
      classification: 'no_safe_target',
      shouldAttempt: false,
      reason: `row already A-grade (${input.analysis.score})`,
      targets,
    };
  }
  if (targets.some(target => target.toolName === 'set_figure_alt_text')) {
    return {
      classification: 'hidden_checker_visible_alt_target',
      shouldAttempt: true,
      reason: 'distinct checker-visible reachable figure targets still lack alt text',
      targets,
    };
  }
  if (targets.some(target => target.toolName === 'retag_as_figure')) {
    return {
      classification: 'orphan_figure_alt_ownership_candidate',
      shouldAttempt: true,
      reason: 'reachable role-mapped figure targets can be made checker-visible with alt ownership',
      targets,
    };
  }
  if ((input.snapshot.checkerFigureTargets ?? []).length > 0 && alt < 80) {
    return {
      classification: 'alt_score_analyzer_debt',
      shouldAttempt: false,
      reason: 'checker-visible figures appear covered but alt score remains low',
      targets,
    };
  }
  const pathPaint = input.snapshot.taggedContentAudit?.suspectedPathPaintOutsideMc ??
    input.snapshot.detectionProfile?.pdfUaSignals.suspectedPathPaintOutsideMc ?? 0;
  if (pathPaint > 0) {
    return {
      classification: 'decorative_artifact_candidate',
      shouldAttempt: false,
      reason: 'decorative/path-paint evidence exists but Stage 181 has no proven safe artifact target',
      targets,
    };
  }
  return {
    classification: 'no_safe_target',
    shouldAttempt: false,
    reason: 'no evidence-backed hidden alt target',
    targets,
  };
}

export function stage181AltPlaceholder(target: Stage181HiddenAltTarget): string {
  return `Illustration (page ${Math.max(1, target.page + 1)})`;
}

export function hasAppliedStage181HiddenAlt(appliedTools: readonly AppliedRemediationTool[]): boolean {
  return appliedTools.some(tool =>
    tool.outcome === 'applied' &&
    typeof tool.details === 'string' &&
    tool.details.includes('stage181_')
  );
}
