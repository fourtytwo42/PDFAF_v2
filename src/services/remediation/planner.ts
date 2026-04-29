import type { CategoryKey, PdfClass, PlanningSkipReason, RemediationRoute } from '../../types.js';
import type {
  AnalysisResult,
  DocumentSnapshot,
  AppliedRemediationTool,
  RemediationPlan,
  RemediationStagePlan,
  PlannedRemediationTool,
  PythonMutationDetailPayload,
} from '../../types.js';
import {
  BOOKMARKS_PAGE_OUTLINE_MAX_PAGES,
  BOOKMARKS_PAGE_THRESHOLD,
  FORCE_SYNTHESIS_QPDF_DEPTH_THRESHOLD,
  HEADING_BOOTSTRAP_MIN_SCORE,
  OCR_NATIVE_ELIGIBLE_MAX_TEXT_CHARS,
  OCR_NATIVE_SKIP_TEXT_CHARS,
  REMEDIATION_CATEGORY_THRESHOLD,
  REMEDIATION_MAX_FIGURE_ALT_MUTATIONS_PER_RUN,
  REMEDIATION_MAX_HEADING_CREATES,
  REMEDIATION_MAX_NO_EFFECT_PER_TOOL,
  REMEDIATION_TARGET_SCORE,
  REMEDIATION_TOOL_STAGE_ORDER,
  TOOL_RELIABILITY_FILTER_MAX_SUCCESS_RATE,
  TOOL_RELIABILITY_FILTER_MIN_ATTEMPTS,
  stage24ZeroHeadingBootstrapEnabled,
} from '../../config.js';
import type { ToolOutcomeStore } from '../learning/toolOutcomes.js';
import { buildPlanningSummary, deriveRoutingDecision, type RoutingFailureDisposition } from './routingDecision.js';
import { hasExternalReadinessDebt } from './externalReadiness.js';
import { isFilenameLikeTitle } from '../compliance/icjiaParity.js';
import {
  buildEligibleHeadingBootstrapCandidates,
  selectHeadingBootstrapCandidate,
  selectHeadingBootstrapCandidateForAttempt,
} from '../headingBootstrapCandidates.js';
import { isGenericLinkText, isRawUrlLinkText } from '../scorer/linkTextHeuristics.js';
import { classifyZeroHeadingRecovery } from './headingRecovery.js';
import {
  selectPartialHeadingReachabilityCandidate,
  selectTaggedVisibleHeadingAnchorCandidate,
  selectVisibleHeadingAnchorCandidate,
  shouldTryPartialHeadingReachabilityRecovery,
  shouldTryTaggedVisibleHeadingAnchorRecovery,
  shouldTryVisibleHeadingAnchorRecovery,
} from './visibleHeadingAnchor.js';
import {
  selectOcrPageShellHeadingCandidate,
  shouldTryOcrPageShellHeadingRecovery,
  shouldTryOcrPageShellReadingOrderRecovery,
} from './ocrPageShellHeading.js';
import {
  classifyStage131DegenerateNative,
  selectDegenerateNativeAnchorCandidate,
  shouldTryDegenerateNativeStructureRecovery,
} from './degenerateNativeStructure.js';

/** Tesseract language id for ocrmypdf (`PDFAF_OCR_LANGUAGES` overrides, e.g. `eng+deu`). */
function ocrmypdfLanguagesForSnapshot(snapshot: DocumentSnapshot): string {
  const env = process.env['PDFAF_OCR_LANGUAGES']?.trim();
  if (env) return env.slice(0, 64);
  const raw = (snapshot.metadata.language || snapshot.lang || 'en').trim();
  const primary = (raw.split(/[-_]/)[0] ?? 'en').toLowerCase();
  const map: Record<string, string> = {
    en: 'eng',
    fr: 'fra',
    de: 'deu',
    es: 'spa',
    it: 'ita',
    pt: 'por',
    nl: 'nld',
    pl: 'pol',
    sv: 'swe',
    da: 'dan',
    no: 'nor',
    fi: 'fin',
    cs: 'ces',
    sk: 'slk',
    hu: 'hun',
    ro: 'ron',
    bg: 'bul',
    el: 'ell',
    ru: 'rus',
    uk: 'ukr',
    ar: 'ara',
    he: 'heb',
    zh: 'chi_sim',
    ja: 'jpn',
    ko: 'kor',
    hi: 'hin',
  };
  return map[primary] ?? 'eng';
}

function failingCategories(analysis: AnalysisResult): CategoryKey[] {
  const out: CategoryKey[] = [];
  for (const c of analysis.categories) {
    if (!c.applicable) continue;
    if (c.score < REMEDIATION_CATEGORY_THRESHOLD) {
      out.push(c.key);
    }
  }
  return out;
}

const ROUTE_TOOL_MAP: Record<RemediationRoute, readonly string[]> = {
  metadata_first_commit: [
    'set_pdfua_identification',
    'set_document_title',
    'set_document_language',
  ],
  metadata_foundation: [
    'set_pdfua_identification',
    'set_document_title',
    'set_document_language',
  ],
  structure_bootstrap_and_conformance: [
    'synthesize_basic_structure_from_layout',
    'repair_structure_conformance',
    'artifact_repeating_page_furniture',
  ],
  post_bootstrap_heading_convergence: [
    'artifact_repeating_page_furniture',
    'create_structure_from_degenerate_native_anchor',
    'create_heading_from_visible_text_anchor',
    'create_heading_from_tagged_visible_anchor',
    'create_heading_from_candidate',
    'normalize_heading_hierarchy',
    'normalize_nested_figure_containers',
    'canonicalize_figure_alt_ownership',
    'repair_native_reading_order',
    'repair_structure_conformance',
  ],
  untagged_structure_recovery: [
    'synthesize_basic_structure_from_layout',
    'create_structure_from_degenerate_native_anchor',
    'repair_structure_conformance',
    'artifact_repeating_page_furniture',
  ],
  structure_bootstrap: [
    'bootstrap_struct_tree',
    'repair_structure_conformance',
    'wrap_singleton_orphan_mcid',
    'remap_orphan_mcids_as_artifacts',
    'tag_native_text_blocks',
    'tag_ocr_text_blocks',
  ],
  annotation_link_normalization: [
    'repair_native_link_structure',
    'tag_unowned_annotations',
    'set_link_annotation_contents',
    'normalize_annotation_tab_order',
    'repair_annotation_alt_text',
  ],
  native_structure_repair: [
    'repair_native_reading_order',
    'normalize_heading_hierarchy',
    'repair_list_li_wrong_parent',
    'normalize_table_structure',
    'repair_native_table_headers',
    'set_table_header_cells',
  ],
  font_ocr_repair: [
    'ocr_scanned_pdf',
    'tag_ocr_text_blocks',
    'synthesize_ocr_page_shell_reading_order_structure',
    'create_heading_from_ocr_page_shell_anchor',
    'tag_native_text_blocks',
    'mark_untagged_content_as_artifact',
  ],
  font_unicode_tail_recovery: [
    'substitute_legacy_fonts_in_place',
    'finalize_substituted_font_conformance',
  ],
  figure_semantics: [
    'normalize_nested_figure_containers',
    'canonicalize_figure_alt_ownership',
    'set_figure_alt_text',
    'mark_figure_decorative',
    'repair_alt_text_structure',
    'repair_annotation_alt_text',
    'retag_as_figure',
  ],
  near_pass_figure_recovery: [
    'normalize_nested_figure_containers',
    'canonicalize_figure_alt_ownership',
    'repair_annotation_alt_text',
  ],
  document_navigation_forms: [
    'replace_bookmarks_from_headings',
    'add_page_outline_bookmarks',
    'fill_form_field_tooltips',
  ],
  safe_cleanup: [
    'mark_untagged_content_as_artifact',
    'repair_annotation_alt_text',
  ],
};

export interface RouteContract {
  allowedTools: readonly string[];
  prohibitedTools?: readonly string[];
  failureTools?: readonly string[];
  requiredFailureTools?: readonly string[];
}

const ROUTE_CONTRACTS: Record<RemediationRoute, RouteContract> = {
  metadata_first_commit: {
    allowedTools: ROUTE_TOOL_MAP.metadata_first_commit,
    failureTools: ['set_document_title', 'set_document_language'],
    requiredFailureTools: ['set_document_title', 'set_document_language'],
  },
  metadata_foundation: {
    allowedTools: ROUTE_TOOL_MAP.metadata_foundation,
    failureTools: ['set_document_title', 'set_document_language'],
    requiredFailureTools: ['set_document_title', 'set_document_language'],
  },
  structure_bootstrap_and_conformance: {
    allowedTools: ROUTE_TOOL_MAP.structure_bootstrap_and_conformance,
    failureTools: ['synthesize_basic_structure_from_layout', 'repair_structure_conformance'],
    requiredFailureTools: ['synthesize_basic_structure_from_layout', 'repair_structure_conformance'],
  },
  post_bootstrap_heading_convergence: {
    allowedTools: ROUTE_TOOL_MAP.post_bootstrap_heading_convergence,
    prohibitedTools: ['set_figure_alt_text', 'mark_figure_decorative'],
    failureTools: [
      'create_structure_from_degenerate_native_anchor',
      'create_heading_from_visible_text_anchor',
      'create_heading_from_tagged_visible_anchor',
      'create_heading_from_candidate',
      'normalize_heading_hierarchy',
      'repair_structure_conformance',
    ],
    requiredFailureTools: [
      'create_structure_from_degenerate_native_anchor',
      'create_heading_from_visible_text_anchor',
      'create_heading_from_tagged_visible_anchor',
      'create_heading_from_candidate',
    ],
  },
  figure_semantics: {
    allowedTools: ROUTE_TOOL_MAP.figure_semantics,
    failureTools: ['normalize_nested_figure_containers', 'canonicalize_figure_alt_ownership', 'retag_as_figure', 'set_figure_alt_text'],
    requiredFailureTools: ['normalize_nested_figure_containers', 'canonicalize_figure_alt_ownership', 'set_figure_alt_text'],
  },
  near_pass_figure_recovery: {
    allowedTools: ROUTE_TOOL_MAP.near_pass_figure_recovery,
    prohibitedTools: ['set_figure_alt_text', 'mark_figure_decorative', 'retag_as_figure'],
    failureTools: ['normalize_nested_figure_containers', 'canonicalize_figure_alt_ownership'],
    requiredFailureTools: ['normalize_nested_figure_containers', 'canonicalize_figure_alt_ownership'],
  },
  untagged_structure_recovery: {
    allowedTools: ROUTE_TOOL_MAP.untagged_structure_recovery,
    failureTools: ['synthesize_basic_structure_from_layout', 'repair_structure_conformance'],
    requiredFailureTools: ['synthesize_basic_structure_from_layout', 'repair_structure_conformance'],
  },
  structure_bootstrap: {
    allowedTools: ROUTE_TOOL_MAP.structure_bootstrap,
    failureTools: [
      'bootstrap_struct_tree',
      'repair_structure_conformance',
      'wrap_singleton_orphan_mcid',
      'remap_orphan_mcids_as_artifacts',
      'tag_native_text_blocks',
      'tag_ocr_text_blocks',
    ],
    requiredFailureTools: ['bootstrap_struct_tree', 'repair_structure_conformance'],
  },
  annotation_link_normalization: {
    allowedTools: ROUTE_TOOL_MAP.annotation_link_normalization,
    failureTools: ['repair_native_link_structure', 'tag_unowned_annotations', 'set_link_annotation_contents'],
    requiredFailureTools: ['repair_native_link_structure', 'tag_unowned_annotations', 'set_link_annotation_contents'],
  },
  native_structure_repair: {
    allowedTools: ROUTE_TOOL_MAP.native_structure_repair,
    failureTools: ['normalize_table_structure', 'repair_native_table_headers', 'set_table_header_cells'],
    requiredFailureTools: ['normalize_table_structure', 'repair_native_table_headers', 'set_table_header_cells'],
  },
  font_ocr_repair: {
    allowedTools: ROUTE_TOOL_MAP.font_ocr_repair,
    failureTools: ['ocr_scanned_pdf', 'tag_ocr_text_blocks', 'tag_native_text_blocks'],
    requiredFailureTools: ['ocr_scanned_pdf'],
  },
  font_unicode_tail_recovery: {
    allowedTools: ROUTE_TOOL_MAP.font_unicode_tail_recovery,
    failureTools: ['substitute_legacy_fonts_in_place', 'finalize_substituted_font_conformance'],
    requiredFailureTools: ['substitute_legacy_fonts_in_place', 'finalize_substituted_font_conformance'],
  },
  document_navigation_forms: {
    allowedTools: ROUTE_TOOL_MAP.document_navigation_forms,
    failureTools: ['replace_bookmarks_from_headings', 'add_page_outline_bookmarks', 'fill_form_field_tooltips'],
    requiredFailureTools: ['replace_bookmarks_from_headings', 'add_page_outline_bookmarks', 'fill_form_field_tooltips'],
  },
  safe_cleanup: {
    allowedTools: ROUTE_TOOL_MAP.safe_cleanup,
    failureTools: ['mark_untagged_content_as_artifact', 'repair_annotation_alt_text'],
    requiredFailureTools: ['mark_untagged_content_as_artifact', 'repair_annotation_alt_text'],
  },
};

export function routeContractFor(route: RemediationRoute): RouteContract {
  return ROUTE_CONTRACTS[route];
}

export function isToolAllowedByRouteContract(route: RemediationRoute | undefined, toolName: string): boolean {
  if (!route) return true;
  const contract = ROUTE_CONTRACTS[route];
  if (contract.prohibitedTools?.includes(toolName)) return false;
  return contract.allowedTools.includes(toolName);
}

function parseMutationDetails(details: string | undefined): PythonMutationDetailPayload | null {
  if (!details?.startsWith('{')) return null;
  try {
    return JSON.parse(details) as PythonMutationDetailPayload;
  } catch {
    return null;
  }
}

function isTerminalRouteOutcome(row: AppliedRemediationTool): boolean {
  return row.outcome === 'no_effect' || row.outcome === 'failed' || row.outcome === 'rejected';
}

function hasTypedStructuralBenefit(row: AppliedRemediationTool): boolean {
  const details = parseMutationDetails(row.details);
  return Boolean(details?.structuralBenefits && Object.values(details.structuralBenefits).some(Boolean));
}

export interface FailureDisposition extends RoutingFailureDisposition {
  headingCandidateBlocked: boolean;
  headingMalformedExistingTree: boolean;
  figureOwnershipTargetBlocked: boolean;
  checkerVisibleFigureMissingAlt: boolean;
  tableHeaderOnlyBlocked: boolean;
  annotationOwnershipBlocked: boolean;
}

export type Stage44FigureFailure =
  | 'missing_alt_on_reachable_figures'
  | 'broken_figure_ownership'
  | 'alt_cleanup_risk'
  | 'no_checker_visible_figures'
  | 'not_stage44_target';

function headingInvariantImproved(detail: PythonMutationDetailPayload): boolean {
  const inv = detail.invariants;
  if (!inv) return false;
  const headingBefore = inv.rootReachableHeadingCountBefore ?? 0;
  const headingAfter = inv.rootReachableHeadingCountAfter ?? headingBefore;
  const depthBefore = inv.rootReachableDepthBefore ?? 0;
  const depthAfter = inv.rootReachableDepthAfter ?? depthBefore;
  return headingAfter > headingBefore || (depthBefore > 0 && depthAfter > depthBefore);
}

function isFigureRole(role: string | undefined): boolean {
  return (role ?? '').replace(/^\//, '').toLowerCase() === 'figure';
}

function deterministicFigureAltPlaceholder(target: { page?: number | null }): string {
  const page = typeof target.page === 'number' && Number.isFinite(target.page)
    ? Math.max(1, Math.floor(target.page) + 1)
    : 1;
  return `Illustration (page ${page})`;
}

function checkerVisibleFigureMissingAlt(snapshot: DocumentSnapshot): boolean {
  if (snapshot.checkerFigureTargets && snapshot.checkerFigureTargets.length > 0) {
    return snapshot.checkerFigureTargets.some(target =>
      target.reachable &&
      !target.isArtifact &&
      isFigureRole(target.resolvedRole ?? target.role) &&
      !target.hasAlt
    );
  }
  return snapshot.figures.some(figure => !figure.isArtifact && !figure.hasAlt);
}

function checkerVisibleFigureCount(snapshot: DocumentSnapshot): number {
  return (snapshot.checkerFigureTargets ?? []).filter(target =>
    target.reachable &&
    !target.isArtifact &&
    isFigureRole(target.resolvedRole ?? target.role)
  ).length;
}

export function classifyStage44FigureFailure(snapshot: DocumentSnapshot, analysis: AnalysisResult): Stage44FigureFailure {
  const altScore = analysis.categories.find(cat => cat.key === 'alt_text')?.score ?? 100;
  if (altScore >= REMEDIATION_CATEGORY_THRESHOLD) return 'not_stage44_target';
  if (
    (snapshot.checkerFigureTargets?.length ?? 0) > 0 &&
    checkerVisibleFigureMissingAlt(snapshot)
  ) return 'missing_alt_on_reachable_figures';
  if (hasRoleMappedFigureCandidate(snapshot)) return 'broken_figure_ownership';
  if (
    (snapshot.checkerFigureTargets?.length ?? 0) === 0 &&
    snapshot.figures.some(figure =>
      !figure.isArtifact &&
      !figure.hasAlt &&
      isFigureRole(figure.role) &&
      isFigureRole(figure.rawRole ?? figure.role) &&
      figure.structRef
    )
  ) return 'missing_alt_on_reachable_figures';
  if (hasAcrobatAltOwnershipRisk(snapshot)) return 'alt_cleanup_risk';
  if (figureNeedsOwnershipRepair(snapshot)) return 'broken_figure_ownership';
  const extractedCount = snapshot.detectionProfile?.figureSignals?.extractedFigureCount ?? snapshot.figures.length;
  if (extractedCount > 0 && checkerVisibleFigureCount(snapshot) === 0) return 'no_checker_visible_figures';
  return 'not_stage44_target';
}

function noEffectDetails(row: AppliedRemediationTool): PythonMutationDetailPayload | null {
  if (row.outcome !== 'no_effect') return null;
  return parseMutationDetails(row.details);
}

function noEffectRowsFor(applied: AppliedRemediationTool[], toolNames: ReadonlySet<string>): PythonMutationDetailPayload[] {
  return applied
    .filter(row => toolNames.has(row.toolName))
    .map(noEffectDetails)
    .filter((detail): detail is PythonMutationDetailPayload => detail !== null);
}

function mutationTargetRef(details: PythonMutationDetailPayload | null | undefined): string | null {
  const invariantRef = details?.invariants?.targetRef;
  if (typeof invariantRef === 'string' && invariantRef.length > 0) return invariantRef;
  const debugRef = details?.debug?.['targetRef'];
  if (typeof debugRef === 'string' && debugRef.length > 0) return debugRef;
  return null;
}

function attemptedMutationRefs(applied: AppliedRemediationTool[], toolName: string): Set<string> {
  return new Set(
    applied
      .filter(row => row.toolName === toolName)
      .map(row => mutationTargetRef(parseMutationDetails(row.details)))
      .filter((value): value is string => typeof value === 'string' && value.length > 0),
  );
}

function safeCheckerVisibleMissingAltTargets(
  snapshot: DocumentSnapshot,
  attemptedRefs = new Set<string>(),
): NonNullable<DocumentSnapshot['checkerFigureTargets']> {
  return sortFigureTargets(
    (snapshot.checkerFigureTargets ?? []).filter(target =>
      target.reachable &&
      target.directContent &&
      !target.isArtifact &&
      !target.hasAlt &&
      typeof target.structRef === 'string' &&
      target.structRef.length > 0 &&
      !attemptedRefs.has(target.structRef) &&
      isFigureRole(target.resolvedRole ?? target.role)
    ),
  );
}

function safeRoleMapRetagTargets(
  snapshot: DocumentSnapshot,
  attemptedRefs = new Set<string>(),
): DocumentSnapshot['figures'] {
  return sortFigureTargets(
    snapshot.figures.filter(figure =>
      !figure.isArtifact &&
      !figure.hasAlt &&
      typeof figure.structRef === 'string' &&
      figure.structRef.length > 0 &&
      !attemptedRefs.has(figure.structRef) &&
      figure.reachable === true &&
      isFigureRole(figure.role) &&
      typeof figure.rawRole === 'string' &&
      figure.rawRole.length > 0 &&
      !isFigureRole(figure.rawRole) &&
      (figure.directContent === true || (figure.subtreeMcidCount ?? 0) > 0)
    ),
  );
}

export function shouldAllowStage146FigureAltContinuation(
  analysis: AnalysisResult,
  snapshot: DocumentSnapshot,
  alreadyApplied: AppliedRemediationTool[] = [],
): boolean {
  if (analysis.score >= 90) return false;
  if ((analysis.categories.find(cat => cat.key === 'alt_text')?.score ?? 100) >= REMEDIATION_CATEGORY_THRESHOLD) return false;
  if (analysis.pdfClass === 'scanned' || snapshot.textCharCount <= 0) return false;
  if (successfulApplyCount(alreadyApplied, 'set_figure_alt_text') < DEFAULT_FIGURE_ALT_TARGETS_PER_RUN) return false;
  const attemptedRefs = attemptedMutationRefs(alreadyApplied, 'set_figure_alt_text');
  return safeCheckerVisibleMissingAltTargets(snapshot, attemptedRefs).length > 0;
}

export function maxFigureAltTargetsForRun(
  analysis?: AnalysisResult,
  snapshot?: DocumentSnapshot,
  alreadyApplied: AppliedRemediationTool[] = [],
  options: { protectedBaselineActive?: boolean } = {},
): number {
  if (options.protectedBaselineActive) return DEFAULT_FIGURE_ALT_TARGETS_PER_RUN;
  if (analysis && snapshot && shouldAllowStage146FigureAltContinuation(analysis, snapshot, alreadyApplied)) {
    return STAGE146_FIGURE_ALT_TARGETS_PER_RUN;
  }
  return DEFAULT_FIGURE_ALT_TARGETS_PER_RUN;
}

export function shouldAllowStage146RoleMapRetagContinuation(
  analysis: AnalysisResult,
  snapshot: DocumentSnapshot,
  alreadyApplied: AppliedRemediationTool[] = [],
): boolean {
  if (analysis.score >= 90) return false;
  if ((analysis.categories.find(cat => cat.key === 'alt_text')?.score ?? 100) >= REMEDIATION_CATEGORY_THRESHOLD) return false;
  if (analysis.pdfClass === 'scanned' || snapshot.textCharCount <= 0) return false;
  if (successfulApplyCount(alreadyApplied, 'retag_as_figure') < DEFAULT_RETAG_AS_FIGURE_TARGETS_PER_RUN) return false;
  const attemptedRefs = attemptedMutationRefs(alreadyApplied, 'retag_as_figure');
  return safeRoleMapRetagTargets(snapshot, attemptedRefs).length > 0;
}

function maxRetagAsFigureTargetsForRun(
  analysis?: AnalysisResult,
  snapshot?: DocumentSnapshot,
  alreadyApplied: AppliedRemediationTool[] = [],
): number {
  if (analysis && snapshot && shouldAllowStage146RoleMapRetagContinuation(analysis, snapshot, alreadyApplied)) {
    return STAGE146_RETAG_AS_FIGURE_TARGETS_PER_RUN;
  }
  return DEFAULT_RETAG_AS_FIGURE_TARGETS_PER_RUN;
}

function isBlockedHeadingNoEffect(details: PythonMutationDetailPayload | null | undefined): boolean {
  if (!details) return false;
  if (headingInvariantImproved(details)) return false;
  return (
    details.note === 'role_invalid_after_mutation' ||
    details.note === 'heading_not_root_reachable' ||
    details.note === 'target_unreachable' ||
    details.invariants?.targetReachable === false ||
    details.invariants?.headingCandidateReachable === false
  );
}

export function deriveFailureDisposition(
  analysis: AnalysisResult,
  snapshot: DocumentSnapshot,
  alreadyApplied: AppliedRemediationTool[],
): FailureDisposition {
  const signals: string[] = [];
  const families: string[] = [];
  const headingDetails = noEffectRowsFor(alreadyApplied, new Set(['create_heading_from_candidate']));
  const figureOwnershipDetails = noEffectRowsFor(alreadyApplied, new Set([
    'normalize_nested_figure_containers',
    'canonicalize_figure_alt_ownership',
  ]));
  const tableDetails = noEffectRowsFor(alreadyApplied, new Set(['normalize_table_structure', 'repair_native_table_headers', 'set_table_header_cells']));
  const annotationDetails = noEffectRowsFor(alreadyApplied, new Set([
    'repair_native_link_structure',
    'tag_unowned_annotations',
    'normalize_annotation_tab_order',
  ]));

  const headingCandidateBlocked = headingDetails.some(isBlockedHeadingNoEffect);
  const headingMalformedExistingTree =
    snapshot.headings.length >= 2 &&
    analysis.categories.some(category => category.key === 'heading_structure' && category.applicable && category.score < REMEDIATION_CATEGORY_THRESHOLD);
  const figureOwnershipTargetBlocked = figureOwnershipDetails.filter(detail =>
    detail.invariants?.targetReachable === false ||
    detail.invariants?.targetIsFigureAfter === false ||
    detail.note === 'target_not_checker_visible_figure' ||
    detail.note === 'figure_ownership_not_preserved'
  ).length >= 2;
  const hasCheckerVisibleFigureMissingAlt = checkerVisibleFigureMissingAlt(snapshot);
  const tableHeaderOnlyBlocked = tableDetails.some(detail =>
    detail.invariants?.tableTreeValidAfter === false ||
    detail.note === 'table_tree_still_invalid' ||
    detail.note === 'direct_cells_under_table_remain'
  );
  const annotationOwnershipBlocked = annotationDetails.some(detail => {
    const inv = detail.invariants;
    const structParentFlat =
      typeof inv?.visibleAnnotationsMissingStructParentBefore === 'number' &&
      inv.visibleAnnotationsMissingStructParentBefore === inv.visibleAnnotationsMissingStructParentAfter;
    const structureFlat =
      typeof inv?.visibleAnnotationsMissingStructureBefore === 'number' &&
      inv.visibleAnnotationsMissingStructureBefore === inv.visibleAnnotationsMissingStructureAfter;
    return detail.note === 'annotation_ownership_not_preserved' || (structParentFlat && structureFlat);
  });

  if (headingCandidateBlocked) {
    signals.push('failure_disposition_heading_target_blocked');
    families.push('heading_target_blocked');
  } else if (headingMalformedExistingTree) {
    signals.push('failure_disposition_heading_malformed_tree');
    families.push('heading_malformed_existing_tree');
  }
  if (figureOwnershipTargetBlocked) {
    signals.push('failure_disposition_figure_ownership_blocked');
    families.push('figure_ownership_blocked');
  } else if (hasCheckerVisibleFigureMissingAlt) {
    signals.push('failure_disposition_figure_alt_assignable');
    families.push('figure_alt_missing_on_reachable_figure');
  }
  if (tableHeaderOnlyBlocked) {
    signals.push('failure_disposition_table_tree_invalid');
    families.push('table_tree_invalid_before_headers');
  }
  if (annotationOwnershipBlocked) {
    signals.push('failure_disposition_annotation_ownership_blocked');
    families.push('annotation_ownership_blocked');
  }

  return {
    headingCandidateBlocked,
    headingMalformedExistingTree,
    figureOwnershipTargetBlocked,
    checkerVisibleFigureMissingAlt: hasCheckerVisibleFigureMissingAlt,
    tableHeaderOnlyBlocked,
    annotationOwnershipBlocked,
    triggeringSignals: signals,
    residualFamilies: families,
  };
}

export type Stage43TableFailureClass =
  | 'rowless_dense_table'
  | 'direct_cells_under_table'
  | 'strongly_irregular_rows'
  | 'missing_headers_only'
  | 'layout_table_candidate'
  | 'not_stage43_table_target';

export function classifyStage43TableFailure(snapshot: DocumentSnapshot, analysis?: AnalysisResult): Stage43TableFailureClass {
  const tableCategory = analysis?.categories.find(category => category.key === 'table_markup');
  const tableFailing = Boolean(tableCategory?.applicable && tableCategory.score < 70);
  const directSignal = snapshot.detectionProfile?.tableSignals.directCellUnderTableCount ?? 0;
  const misplacedSignal = snapshot.detectionProfile?.tableSignals.misplacedCellCount ?? 0;
  const scoredTables = snapshot.tables.filter(table =>
    !((table.rowCount ?? 0) <= 1 && (table.totalCells ?? 0) <= 2 && (table.cellsMisplacedCount ?? 0) === 0),
  );
  if (scoredTables.length === 0) return 'not_stage43_table_target';
  if (scoredTables.some(table => (table.cellsMisplacedCount ?? 0) > 0) || directSignal > 0 || misplacedSignal > 0) {
    return 'direct_cells_under_table';
  }
  if (scoredTables.some(table => (table.rowCount ?? 0) <= 1 && (table.totalCells ?? 0) >= 4)) {
    return 'rowless_dense_table';
  }
  if (
    tableFailing &&
    scoredTables.some(table =>
      table.hasHeaders &&
      (table.cellsMisplacedCount ?? 0) === 0 &&
      (table.rowCount ?? 0) > 1 &&
      (table.irregularRows ?? 0) >= 2 &&
      (table.dominantColumnCount ?? 0) >= 2,
    )
  ) {
    return 'strongly_irregular_rows';
  }
  if (scoredTables.some(table => !table.hasHeaders && table.totalCells >= 4)) {
    return 'missing_headers_only';
  }
  if (tableFailing && scoredTables.every(table => table.totalCells <= 2 && !table.hasHeaders)) {
    return 'layout_table_candidate';
  }
  return 'not_stage43_table_target';
}

function noEffectSignature(row: AppliedRemediationTool): string | null {
  if (row.outcome !== 'no_effect') return null;
  const details = parseMutationDetails(row.details);
  if (!details?.invariants && !details?.note) return null;
  const inv = details.invariants;
  const flags = [
    inv?.targetReachable === false ? 'targetReachable=false' : null,
    inv?.targetIsFigureAfter === false ? 'targetIsFigureAfter=false' : null,
    inv?.tableTreeValidAfter === false ? 'tableTreeValidAfter=false' : null,
    inv?.ownershipPreserved === false ? 'ownershipPreserved=false' : null,
  ].filter((flag): flag is string => flag !== null);
  return [
    row.toolName,
    details.note ?? 'no_note',
    row.toolName === 'create_heading_from_candidate' ? 'no_target' : (mutationTargetRef(details) ?? 'no_target'),
    ...flags,
  ].join('|');
}

function hasPriorNoEffectSignature(
  applied: AppliedRemediationTool[],
  toolName: string,
  params: Record<string, unknown>,
): boolean {
  const targetRef = typeof params['targetRef'] === 'string'
    ? params['targetRef']
    : typeof params['structRef'] === 'string'
      ? params['structRef']
      : undefined;
  return applied.some(row => {
    if (row.toolName !== toolName || row.outcome !== 'no_effect') return false;
    const details = parseMutationDetails(row.details);
    if (!details?.invariants && !details?.note) return false;
    if (toolName === 'create_heading_from_candidate') {
      return false;
    }
    const detailsTargetRef = mutationTargetRef(details);
    if (targetRef && detailsTargetRef && detailsTargetRef !== targetRef) return false;
    const inv = details?.invariants;
    return (
      inv?.targetReachable === false ||
      inv?.targetIsFigureAfter === false ||
      inv?.tableTreeValidAfter === false ||
      inv?.ownershipPreserved === false ||
      details?.note === 'table_tree_still_invalid' ||
      details?.note === 'headers_not_created' ||
      details?.note === 'annotation_ownership_not_preserved' ||
      details?.note === 'no_structural_change'
    );
  });
}

function routeFailureProof(
  route: RemediationRoute,
  alreadyApplied: AppliedRemediationTool[],
): string | null {
  const contract = ROUTE_CONTRACTS[route];
  if (!contract?.failureTools?.length) return null;

  const routeRows = alreadyApplied.filter(row => contract.failureTools!.includes(row.toolName));
  const signatures = new Map<string, number>();
  for (const row of routeRows) {
    const signature = noEffectSignature(row);
    if (signature) signatures.set(signature, (signatures.get(signature) ?? 0) + 1);
  }
  for (const [signature, count] of signatures) {
    if (count >= 2) {
      return `route_failure_repeated_signature(${route}:${signature})`;
    }
  }

  const required = contract.requiredFailureTools ?? contract.failureTools;
  const exhausted = required.filter(toolName => {
    const attempts = alreadyApplied.filter(row => row.toolName === toolName);
    if (attempts.length === 0) return false;
    return attempts.every(isTerminalRouteOutcome);
  });
  if (exhausted.length >= required.length) {
    return `route_failure_proof(${route}:${exhausted.join(',')})`;
  }

  const maxRound = Math.max(0, ...routeRows.map(row => row.round ?? 0));
  if (maxRound > 0) {
    const priorRoundRows = routeRows.filter(row => row.round === maxRound);
    const hadTerminal = priorRoundRows.some(isTerminalRouteOutcome);
    const hadBenefit = priorRoundRows.some(row => row.outcome === 'applied' && hasTypedStructuralBenefit(row));
    if (hadTerminal && !hadBenefit) {
      return `route_failure_no_benefit_prior_round(${route}:round${maxRound})`;
    }
  }

  return null;
}

const DETERMINISTIC_FIGURE_TOOLS = new Set([
  'normalize_nested_figure_containers',
  'canonicalize_figure_alt_ownership',
  'retag_as_figure',
  'set_figure_alt_text',
  'mark_figure_decorative',
]);

function noEffectCountForTool(applied: AppliedRemediationTool[], toolName: string): number {
  return applied.filter(a => a.toolName === toolName && a.outcome === 'no_effect').length;
}

function wasSuccessfullyApplied(applied: AppliedRemediationTool[], toolName: string): boolean {
  return applied.some(a => a.toolName === toolName && a.outcome === 'applied');
}

function successfulApplyCount(applied: AppliedRemediationTool[], toolName: string): number {
  return applied.filter(a => a.toolName === toolName && a.outcome === 'applied').length;
}

function attemptCount(applied: AppliedRemediationTool[], toolName: string): number {
  return applied.filter(a => a.toolName === toolName).length;
}

function tooltipNeedsRepair(tooltip: string | null | undefined): boolean {
  const t = (tooltip ?? '').trim().toLowerCase();
  if (!t) return true;
  return [
    'form field',
    'field',
    'text field',
    'checkbox',
    'check box',
    'radio button',
    'button',
    'choice field',
    'list field',
    'signature',
  ].includes(t);
}

function figureNeedsOwnershipRepair(snapshot: DocumentSnapshot): boolean {
  const figureSignals = snapshot.detectionProfile?.figureSignals;
  if (!figureSignals) return snapshot.figures.length > 0;
  return (
    (figureSignals?.treeFigureMissingForExtractedFigures ?? false) ||
    (figureSignals?.nonFigureRoleCount ?? 0) > 0 ||
    (figureSignals.extractedFigureCount > 0 && figureSignals.treeFigureCount < figureSignals.extractedFigureCount)
  );
}

function hasRoleMappedFigureCandidate(snapshot: DocumentSnapshot): boolean {
  return snapshot.figures.some(figure =>
    !figure.isArtifact &&
    !!figure.structRef &&
    figure.reachable === true &&
    isFigureRole(figure.role) &&
    typeof figure.rawRole === 'string' &&
    figure.rawRole.length > 0 &&
    !isFigureRole(figure.rawRole) &&
    (figure.directContent === true || (figure.subtreeMcidCount ?? 0) > 0)
  );
}

function hasWeakVisibleLinkTexts(snapshot: DocumentSnapshot): boolean {
  return snapshot.links.some(link => {
    const raw = link.text.trim();
    return !raw || isGenericLinkText(raw) || isRawUrlLinkText(raw);
  });
}

function hasAcrobatAltOwnershipRisk(snapshot: DocumentSnapshot): boolean {
  const risks = snapshot.acrobatStyleAltRisks;
  return ((risks?.nonFigureWithAltCount ?? 0)
    + (risks?.nestedFigureAltCount ?? 0)
    + (risks?.orphanedAltEmptyElementCount ?? 0)) > 0;
}

function sortFigureTargets<T extends { page: number; structRef?: string }>(targets: T[]): T[] {
  return [...targets].sort((a, b) => a.page - b.page || (a.structRef ?? '').localeCompare(b.structRef ?? ''));
}

const DEFAULT_FIGURE_ALT_TARGETS_PER_RUN = Math.min(REMEDIATION_MAX_FIGURE_ALT_MUTATIONS_PER_RUN, 3);
export const STAGE146_FIGURE_ALT_TARGETS_PER_RUN = Math.min(REMEDIATION_MAX_FIGURE_ALT_MUTATIONS_PER_RUN, 5);
const DEFAULT_RETAG_AS_FIGURE_TARGETS_PER_RUN = 2;
const STAGE146_RETAG_AS_FIGURE_TARGETS_PER_RUN = 3;

export function deriveFallbackDocumentTitle(snapshot: DocumentSnapshot, filename: string): string {
  const metaTitle = snapshot.metadata.title?.trim();
  if (metaTitle && !isFilenameLikeTitle(metaTitle)) return metaTitle;
  const headingTitle = snapshot.headings[0]?.text?.trim();
  if (headingTitle) return headingTitle.slice(0, 500);
  for (const pageText of snapshot.textByPage) {
    const line = (pageText ?? '')
      .split('\n')
      .map(part => part.trim())
      .find(part => part.length >= 4 && /[A-Za-z]/.test(part));
    if (line && !isFilenameLikeTitle(line)) return line.slice(0, 500);
    const sentence = (pageText ?? '')
      .replace(/\s+/g, ' ')
      .split(/(?<=[.!?])\s+/)[0]
      ?.trim();
    if (sentence && /[A-Za-z]/.test(sentence) && !isFilenameLikeTitle(sentence)) {
      return sentence.split(/\s+/).slice(0, 12).join(' ').slice(0, 500);
    }
  }
  return filename.replace(/\.pdf$/i, '').replace(/[_-]+/g, ' ').slice(0, 500);
}

/** One-shot tools: skip after first success. Figure alt/decorative + table headers: repeat until cap or no targets. */
function shouldSkipAfterSuccessfulApply(
  toolName: string,
  applied: AppliedRemediationTool[],
  analysis?: AnalysisResult,
  snapshot?: DocumentSnapshot,
): boolean {
  if (toolName === 'set_figure_alt_text' || toolName === 'mark_figure_decorative') {
    const cap = toolName === 'set_figure_alt_text'
      ? maxFigureAltTargetsForRun(analysis, snapshot, applied)
      : DEFAULT_FIGURE_ALT_TARGETS_PER_RUN;
    return successfulApplyCount(applied, toolName) >= cap;
  }
  if (toolName === 'normalize_nested_figure_containers' || toolName === 'canonicalize_figure_alt_ownership' || toolName === 'retag_as_figure') {
    const cap = toolName === 'retag_as_figure'
      ? maxRetagAsFigureTargetsForRun(analysis, snapshot, applied)
      : DEFAULT_RETAG_AS_FIGURE_TARGETS_PER_RUN;
    return successfulApplyCount(applied, toolName) >= cap;
  }
  // Stage 43 table tools target one table per call and stay bounded to two table targets.
  if (toolName === 'normalize_table_structure' || toolName === 'set_table_header_cells') {
    return successfulApplyCount(applied, toolName) >= 2;
  }
  // Python fixes up to 64 orphans per pass; repeat until converged (matches pikepdf mutator rounds).
  if (toolName === 'remap_orphan_mcids_as_artifacts') {
    return successfulApplyCount(applied, toolName) >= 8;
  }
  // Each call promotes one P/Span/Div to a heading; allow up to N headings per remediation run.
  if (toolName === 'create_heading_from_candidate') {
    return successfulApplyCount(applied, toolName) >= REMEDIATION_MAX_HEADING_CREATES;
  }
  return wasSuccessfullyApplied(applied, toolName);
}

function toolApplicableToPdfClass(
  toolName: string,
  pdfClass: AnalysisResult['pdfClass'],
  snapshot: DocumentSnapshot,
): boolean {
  if (toolName === 'bootstrap_struct_tree') {
    if (pdfClass === 'scanned') return false;
    return pdfClass === 'native_untagged' || pdfClass === 'mixed';
  }
  if (toolName === 'synthesize_basic_structure_from_layout') {
    if (pdfClass === 'scanned') return false;
    return (pdfClass === 'native_untagged' || pdfClass === 'mixed' || pdfClass === 'native_tagged') && snapshot.textCharCount > 0;
  }
  if (toolName === 'artifact_repeating_page_furniture') {
    if (pdfClass === 'scanned') return false;
    return snapshot.textCharCount > 0;
  }
  if (toolName === 'create_heading_from_candidate') {
    if (pdfClass === 'scanned') return false;
    return snapshot.structureTree !== null && (snapshot.paragraphStructElems?.length ?? 0) > 0;
  }
  if (toolName === 'create_heading_from_visible_text_anchor') {
    if (pdfClass === 'scanned') return false;
    return snapshot.textCharCount > 0 && (snapshot.mcidTextSpans?.length ?? 0) > 0;
  }
  if (toolName === 'create_heading_from_tagged_visible_anchor') {
    if (pdfClass !== 'native_tagged') return false;
    return snapshot.textCharCount > 0 && snapshot.structureTree !== null;
  }
  if (toolName === 'create_heading_from_ocr_page_shell_anchor') {
    if (pdfClass === 'scanned') return false;
    return snapshot.textCharCount > 0 && snapshot.structureTree !== null && (snapshot.mcidTextSpans?.length ?? 0) > 0;
  }
  if (toolName === 'synthesize_ocr_page_shell_reading_order_structure') {
    if (pdfClass === 'scanned') return false;
    return snapshot.textCharCount > 0
      && snapshot.structureTree !== null
      && (snapshot.paragraphStructElems?.length ?? 0) > 0
      && (snapshot.mcidTextSpans?.length ?? 0) > 0;
  }
  if (toolName === 'create_structure_from_degenerate_native_anchor') {
    if (pdfClass === 'scanned') return false;
    const depth = snapshot.detectionProfile?.readingOrderSignals?.structureTreeDepth ?? (snapshot.structureTree ? 2 : 0);
    const treeHeadingCount = snapshot.detectionProfile?.headingSignals?.treeHeadingCount ?? snapshot.headings.length;
    return snapshot.textCharCount > 0
      && depth <= 1
      && treeHeadingCount === 0
      && snapshot.headings.length === 0;
  }
  if (toolName === 'normalize_nested_figure_containers') {
    return pdfClass !== 'scanned' && snapshot.structureTree !== null && snapshot.figures.length > 0;
  }
  if (toolName === 'substitute_legacy_fonts_in_place' || toolName === 'finalize_substituted_font_conformance') {
    if (pdfClass === 'scanned') return false;
    return snapshot.textCharCount > 0 && snapshot.fonts.some(font =>
      (font.subtype ?? '').toLowerCase() === 'type1' && (!font.isEmbedded || !font.hasUnicode || font.encodingRisk),
    );
  }
  if (toolName === 'ocr_scanned_pdf') {
    if (pdfClass === 'scanned' || pdfClass === 'mixed') return true;
    if (
      (pdfClass === 'native_untagged' || pdfClass === 'native_tagged') &&
      snapshot.textCharCount <= OCR_NATIVE_ELIGIBLE_MAX_TEXT_CHARS &&
      snapshot.textCharCount < OCR_NATIVE_SKIP_TEXT_CHARS
    ) {
      return true;
    }
    return false;
  }
  if (toolName === 'remap_orphan_mcids_as_artifacts') {
    if (pdfClass === 'scanned') return false;
    return (snapshot.taggedContentAudit?.orphanMcidCount ?? 0) > 0;
  }
  if (toolName === 'fill_form_field_tooltips') {
    if (pdfClass === 'scanned') return false;
    const byName = new Map<string, { tooltip?: string | null }>();
    for (const f of snapshot.formFields) {
      byName.set(f.name, { tooltip: f.tooltip });
    }
    for (const f of snapshot.formFieldsFromPdfjs) {
      if (!byName.has(f.name)) {
        byName.set(f.name, { tooltip: f.tooltip });
      }
    }
    for (const v of byName.values()) {
      if (tooltipNeedsRepair(v.tooltip)) return true;
    }
    return false;
  }
  if (toolName === 'mark_untagged_content_as_artifact') {
    if (pdfClass === 'scanned') return false;
    // Real tags: always eligible for residual untagged paint / text outside Span BDC.
    if (snapshot.isTagged || snapshot.structureTree !== null) return true;
    // Acrobat "Tagged PDF" can pass on /MarkInfo alone while /StructTreeRoot is missing
    // (Tags panel empty, Tagged content fails). Our taggedContentAudit still flags path/text
    // outside marked-content — run the wrap pass for that shell and for strong paint-outside signal.
    const paint = snapshot.taggedContentAudit?.suspectedPathPaintOutsideMc ?? 0;
    const markedShell =
      snapshot.markInfo?.Marked === true && !snapshot.isTagged && snapshot.structureTree == null;
    if (markedShell && paint > 0) return true;
    if (paint >= 5) return true;
    return false;
  }
  if (
    toolName === 'set_figure_alt_text'
    || toolName === 'mark_figure_decorative'
    || toolName === 'retag_as_figure'
    || toolName === 'canonicalize_figure_alt_ownership'
  ) {
    return pdfClass !== 'scanned';
  }
  if (toolName === 'tag_unowned_annotations' || toolName === 'repair_native_link_structure') {
    if (pdfClass === 'scanned') return false;
    return snapshot.structureTree !== null;
  }
  if (toolName === 'set_link_annotation_contents') {
    return pdfClass !== 'scanned';
  }
  if (
    toolName === 'normalize_annotation_tab_order' ||
    toolName === 'repair_annotation_alt_text'
  ) {
    return pdfClass !== 'scanned';
  }
  if (toolName === 'repair_native_reading_order') {
    return pdfClass === 'native_tagged' || pdfClass === 'native_untagged' || pdfClass === 'mixed';
  }
  if (toolName === 'normalize_heading_hierarchy') {
    // Zero-heading convergence can create a new heading earlier in the same stage.
    return snapshot.structureTree !== null && (
      snapshot.headings.length >= 2 || (snapshot.paragraphStructElems?.length ?? 0) > 0
    );
  }
  if (toolName === 'tag_ocr_text_blocks') {
    // Only for OCRmyPDF-produced PDFs that haven't been tagged yet
    const creator = (snapshot.metadata.creator ?? '').toLowerCase();
    return creator.includes('ocrmypdf');
  }
  if (toolName === 'tag_native_text_blocks') {
    if (pdfClass === 'scanned') return false;
    const creator = (snapshot.metadata.creator ?? '').toLowerCase();
    if (creator.includes('ocrmypdf')) return false;
    return pdfClass === 'native_untagged' || pdfClass === 'mixed';
  }
  if (toolName === 'replace_bookmarks_from_headings') {
    if (pdfClass === 'scanned') return false;
    if (snapshot.pageCount < BOOKMARKS_PAGE_THRESHOLD) return false;
    if (!snapshot.structureTree && snapshot.headings.length === 0) return false;
    return snapshot.structureTree !== null && snapshot.headings.length > 0;
  }
  if (toolName === 'add_page_outline_bookmarks') {
    if (pdfClass === 'scanned') return false;
    if (snapshot.pageCount < BOOKMARKS_PAGE_THRESHOLD) return false;
    return snapshot.bookmarks.length === 0;
  }
  if (toolName === 'normalize_table_structure' || toolName === 'set_table_header_cells') {
    if (pdfClass === 'scanned') return false;
    return snapshot.structureTree !== null && snapshot.tables.some(t => t.structRef);
  }
  if (toolName === 'repair_native_table_headers') {
    if (pdfClass === 'scanned') return false;
    return snapshot.structureTree !== null && snapshot.tables.length > 0;
  }
  if (toolName === 'wrap_singleton_orphan_mcid') {
    if (pdfClass === 'scanned') return false;
    const o = snapshot.orphanMcids ?? [];
    return snapshot.structureTree !== null && o.length === 1;
  }
  if (toolName === 'repair_list_li_wrong_parent') {
    if (pdfClass === 'scanned') return false;
    const l = snapshot.listStructureAudit;
    return snapshot.structureTree !== null && (
      (l?.listItemMisplacedCount ?? 0) > 0 ||
      (l?.listsWithoutItems ?? 0) > 0
    );
  }
  return true;
}

/** Drop tools that empirically fail too often for this PDF class (Phase 4). */
export function filterPlannedToolsByReliability(
  tools: PlannedRemediationTool[],
  pdfClass: PdfClass,
  toolOutcomeStore: ToolOutcomeStore | undefined,
  exemptToolNames: ReadonlySet<string> = new Set(),
): PlannedRemediationTool[] {
  if (!toolOutcomeStore) return tools;
  return tools.filter(tool => {
    if (exemptToolNames.has(tool.toolName)) return true;
    const r = toolOutcomeStore.getReliability(tool.toolName, pdfClass);
    if (
      r.attempts >= TOOL_RELIABILITY_FILTER_MIN_ATTEMPTS &&
      r.successRate < TOOL_RELIABILITY_FILTER_MAX_SUCCESS_RATE
    ) {
      return false;
    }
    return true;
  });
}

export function isProtectedZeroHeadingConvergence(
  analysis: AnalysisResult,
  snapshot: DocumentSnapshot,
): boolean {
  const recovery = classifyZeroHeadingRecovery(analysis, snapshot);
  return recovery.kind === 'recoverable_paragraph_tree'
    || recovery.kind === 'minimal_or_degenerate_tree';
}

/**
 * Pure planner: failing categories + snapshot/pdfClass → staged tools.
 * No corpus ids, filenames, or customer-specific rules.
 */
export function planForRemediation(
  analysis: AnalysisResult,
  snapshot: DocumentSnapshot,
  alreadyApplied: AppliedRemediationTool[] = [],
  toolOutcomeStore?: ToolOutcomeStore,
  includeOptionalRemediation = false,
): RemediationPlan {
  if (analysis.score >= REMEDIATION_TARGET_SCORE && !hasExternalReadinessDebt(analysis, snapshot)) {
    return {
      stages: [],
      planningSummary: buildPlanningSummary({
        routing: deriveRoutingDecision(analysis, snapshot),
        includeOptionalRemediation,
        scheduledTools: [],
        skippedTools: [],
      }),
    };
  }

  const failCats = failingCategories(analysis);
  const failureDisposition = deriveFailureDisposition(analysis, snapshot, alreadyApplied);
  const routing = deriveRoutingDecision(analysis, snapshot, failureDisposition);
  const routedRoutes = [routing.primaryRoute, ...routing.secondaryRoutes].filter(
    (route): route is RemediationRoute => route !== null,
  );
  const stoppedRoutes = routedRoutes
    .map(route => ({ route, reason: routeFailureProof(route, alreadyApplied) }))
    .filter((row): row is { route: RemediationRoute; reason: string } => row.reason !== null);
  const stoppedRouteSet = new Set(stoppedRoutes.map(row => row.route));
  const activeRoutes = routedRoutes.filter(route => !stoppedRouteSet.has(route));
  const toolSet = new Map<string, PlannedRemediationTool>();
  const skippedTools = new Map<string, PlanningSkipReason>();
  const addSkipped = (toolName: string, reason: PlanningSkipReason) => {
    if (!skippedTools.has(toolName)) skippedTools.set(toolName, reason);
  };
  const activeRouteSet = new Set(activeRoutes);
  const optionalToolNames = new Set([
    'replace_bookmarks_from_headings',
    'add_page_outline_bookmarks',
    'set_pdfua_identification',
  ]);
  const minExtractableCharsForNativeOcr = Math.max(120, snapshot.pageCount * 40);

  const categoryFailing = (key: CategoryKey) => failCats.includes(key);
  const hasAnnotationSignals =
    (snapshot.detectionProfile?.annotationSignals.pagesMissingTabsS ?? 0) > 0 ||
    (snapshot.detectionProfile?.annotationSignals.pagesAnnotationOrderDiffers ?? 0) > 0 ||
    (snapshot.detectionProfile?.annotationSignals.linkAnnotationsMissingStructure ?? 0) > 0 ||
    (snapshot.detectionProfile?.annotationSignals.nonLinkAnnotationsMissingStructure ?? 0) > 0 ||
    (snapshot.annotationAccessibility?.nonLinkAnnotationsMissingContents ?? 0) > 0 ||
    (snapshot.detectionProfile?.annotationSignals.linkAnnotationsMissingStructParent ?? 0) > 0 ||
    (snapshot.detectionProfile?.annotationSignals.nonLinkAnnotationsMissingStructParent ?? 0) > 0;
  const hasReadingOrderSignals =
    snapshot.detectionProfile?.readingOrderSignals.missingStructureTree === true ||
    (snapshot.detectionProfile?.readingOrderSignals.annotationOrderRiskCount ?? 0) > 0 ||
    (snapshot.detectionProfile?.readingOrderSignals.annotationStructParentRiskCount ?? 0) > 0 ||
    (snapshot.detectionProfile?.readingOrderSignals.sampledStructurePageOrderDriftCount ?? 0) > 0 ||
    (snapshot.detectionProfile?.readingOrderSignals.multiColumnOrderRiskPages ?? 0) > 0 ||
    snapshot.detectionProfile?.readingOrderSignals.headerFooterPollutionRisk === true;
  const hasTableSignals =
    (snapshot.detectionProfile?.tableSignals.irregularTableCount ?? 0) > 0 ||
    (snapshot.detectionProfile?.tableSignals.stronglyIrregularTableCount ?? 0) > 0 ||
    (snapshot.detectionProfile?.tableSignals.directCellUnderTableCount ?? 0) > 0;
  const hasListSignals =
    (snapshot.detectionProfile?.listSignals.listItemMisplacedCount ?? 0) > 0 ||
    (snapshot.detectionProfile?.listSignals.lblBodyMisplacedCount ?? 0) > 0 ||
    (snapshot.detectionProfile?.listSignals.listsWithoutItems ?? 0) > 0;
  const hasTaggedContentSignals =
    (snapshot.detectionProfile?.pdfUaSignals.orphanMcidCount ?? 0) > 0 ||
    (snapshot.detectionProfile?.pdfUaSignals.suspectedPathPaintOutsideMc ?? 0) > 0 ||
    (snapshot.detectionProfile?.pdfUaSignals.taggedAnnotationRiskCount ?? 0) > 0;
  const headingNeedsRepair =
    categoryFailing('heading_structure') ||
    analysis.failureProfile?.deterministicIssues.includes('heading_structure') === true ||
    analysis.failureProfile?.manualOnlyIssues.includes('heading_structure') === true;
  const structureConfidenceHigh = analysis.structuralClassification?.confidence === 'high';
  const structurePrimary =
    analysis.failureProfile?.primaryFailureFamily === 'structure_reading_order_heavy' ||
    analysis.failureProfile?.primaryFailureFamily === 'mixed_structural';
  const fontTailCandidate =
    categoryFailing('text_extractability')
    && snapshot.textCharCount > 0
    && analysis.pdfClass !== 'scanned'
    && snapshot.fonts.some(font =>
      (font.subtype ?? '').toLowerCase() === 'type1' && (!font.isEmbedded || !font.hasUnicode || font.encodingRisk),
    );
  const headingAttemptTotal = attemptCount(alreadyApplied, 'create_heading_from_candidate');
  const eligibleHeadingCandidates = stage24ZeroHeadingBootstrapEnabled()
    ? buildEligibleHeadingBootstrapCandidates(snapshot)
    : [];
  const zeroHeadingRecovery = classifyZeroHeadingRecovery(analysis, snapshot);
  const visibleHeadingAnchorRecoveryActive = shouldTryVisibleHeadingAnchorRecovery(analysis, snapshot);
  const ocrPageShellHeadingRecoveryActive = shouldTryOcrPageShellHeadingRecovery(analysis, snapshot);
  const ocrPageShellReadingOrderRecoveryActive = shouldTryOcrPageShellReadingOrderRecovery(analysis, snapshot);
  const headingCreateRecoveryActive =
    zeroHeadingRecovery.kind === 'recoverable_paragraph_tree' ||
    zeroHeadingRecovery.kind === 'minimal_or_degenerate_tree';
  const protectedZeroHeadingConvergence = isProtectedZeroHeadingConvergence(analysis, snapshot);
  const protectedZeroHeadingTimedOut = alreadyApplied.some(
    tool => tool.toolName === 'repair_structure_conformance' && /timeout\s+\d+ms/i.test(tool.details ?? ''),
  );
  const nativeTaggedNoHeadingSynthesisCandidate =
    analysis.pdfClass === 'native_tagged' &&
    headingNeedsRepair &&
    snapshot.headings.length === 0 &&
    snapshot.structureTree !== null &&
    snapshot.textCharCount > 0 &&
    (
      zeroHeadingRecovery.kind === 'minimal_or_degenerate_tree' ||
      (
        zeroHeadingRecovery.kind === 'recoverable_paragraph_tree' &&
        (categoryFailing('pdf_ua_compliance') || categoryFailing('reading_order'))
      )
    ) &&
    (snapshot.paragraphStructElems?.length ?? 0) >= Math.max(3, Math.min(8, snapshot.pageCount));

  const toolIsRouteRelevant = (toolName: string): { allowed: boolean; reason?: PlanningSkipReason } => {
    if (
      routing.deferredRoutes.includes('figure_semantics')
      && ROUTE_TOOL_MAP.figure_semantics.includes(toolName)
      && !DETERMINISTIC_FIGURE_TOOLS.has(toolName)
      && toolName !== 'repair_annotation_alt_text'
    ) {
      return { allowed: false, reason: 'semantic_deferred' };
    }
    if (toolName === 'repair_annotation_alt_text' && !hasAnnotationSignals) {
      return { allowed: false, reason: 'missing_precondition' };
    }
    if (
      (toolName === 'tag_unowned_annotations'
      || toolName === 'normalize_annotation_tab_order'
      || toolName === 'repair_native_link_structure')
      && !hasAnnotationSignals
      && !categoryFailing('link_quality')
    ) {
      // Allow annotation/link repair when link_quality is failing even without detection
      // profile annotation signals. Partially-tagged and untagged files can have link
      // quality failures that aren't surfaced in detectionProfile but are real and fixable.
      return { allowed: false, reason: 'missing_precondition' };
    }
    if (
      toolName === 'set_link_annotation_contents'
      && !hasAnnotationSignals
      && !categoryFailing('link_quality')
    ) {
      return { allowed: false, reason: 'missing_precondition' };
    }
    if (toolName === 'repair_native_reading_order' && !(categoryFailing('reading_order') || hasReadingOrderSignals)) {
      return { allowed: false, reason: 'missing_precondition' };
    }
    if (toolName === 'synthesize_basic_structure_from_layout') {
      const structDepth = snapshot.detectionProfile?.readingOrderSignals.structureTreeDepth ?? 2;
      const isShallowNativeTagged =
        analysis.pdfClass === 'native_tagged' &&
        structDepth <= FORCE_SYNTHESIS_QPDF_DEPTH_THRESHOLD &&
        categoryFailing('reading_order');
      const isNormalUntaggedOrMixed =
        (analysis.pdfClass === 'native_untagged' || analysis.pdfClass === 'mixed') &&
        categoryFailing('pdf_ua_compliance') &&
        (categoryFailing('heading_structure') || categoryFailing('reading_order'));
      if (!(snapshot.textCharCount > 0 && (isNormalUntaggedOrMixed || isShallowNativeTagged))) {
        return { allowed: false, reason: 'missing_precondition' };
      }
    }
    if (
      toolName === 'artifact_repeating_page_furniture'
      && !(categoryFailing('reading_order') || hasReadingOrderSignals || categoryFailing('pdf_ua_compliance') || categoryFailing('heading_structure'))
    ) {
      return { allowed: false, reason: 'missing_precondition' };
    }
    if (
      toolName === 'create_heading_from_candidate'
      && !(
        !protectedZeroHeadingTimedOut &&
        headingCreateRecoveryActive &&
        headingNeedsRepair
        && snapshot.structureTree !== null
        && (snapshot.paragraphStructElems?.length ?? 0) > 0
        && (
          !stage24ZeroHeadingBootstrapEnabled()
          || (
            eligibleHeadingCandidates.length > 0
            && headingAttemptTotal < eligibleHeadingCandidates.length
            && (selectHeadingBootstrapCandidate(snapshot)?.score ?? -1) >= HEADING_BOOTSTRAP_MIN_SCORE
          )
        )
      )
    ) {
      return { allowed: false, reason: 'missing_precondition' };
    }
    if (
      toolName === 'create_heading_from_visible_text_anchor' &&
      !(visibleHeadingAnchorRecoveryActive && headingNeedsRepair)
    ) {
      return { allowed: false, reason: 'missing_precondition' };
    }
    if (
      toolName === 'create_heading_from_tagged_visible_anchor' &&
      !(shouldTryTaggedVisibleHeadingAnchorRecovery(analysis, snapshot) && headingNeedsRepair)
    ) {
      return { allowed: false, reason: 'missing_precondition' };
    }
    if (
      toolName === 'create_heading_from_ocr_page_shell_anchor' &&
      !(ocrPageShellHeadingRecoveryActive && headingNeedsRepair)
    ) {
      return { allowed: false, reason: 'missing_precondition' };
    }
    if (
      toolName === 'synthesize_ocr_page_shell_reading_order_structure' &&
      !ocrPageShellReadingOrderRecoveryActive
    ) {
      return { allowed: false, reason: 'missing_precondition' };
    }
    if (
      toolName === 'create_structure_from_degenerate_native_anchor' &&
      !(shouldTryDegenerateNativeStructureRecovery(analysis, snapshot) && headingNeedsRepair)
    ) {
      return { allowed: false, reason: 'missing_precondition' };
    }
    if (
      protectedZeroHeadingTimedOut
      && (toolName === 'normalize_heading_hierarchy' || toolName === 'repair_structure_conformance')
    ) {
      return { allowed: false, reason: 'missing_precondition' };
    }
    if (toolName === 'repair_list_li_wrong_parent' && !hasListSignals) {
      return { allowed: false, reason: 'missing_precondition' };
    }
    if (toolName === 'wrap_singleton_orphan_mcid' || toolName === 'remap_orphan_mcids_as_artifacts') {
      // Only attempt orphan MCID repair when pdf_ua_compliance is actually failing.
      // Without this gate, the repair runs on near-passing files where orphan MCIDs
      // are present in snapshot data but aren't the real score bottleneck, causing
      // structural mutations that regress scores rather than improve them.
      if (!categoryFailing('pdf_ua_compliance')) {
        return { allowed: false, reason: 'category_not_failing' };
      }
      // Consolidate all three orphan-MCID data sources: detectionProfile (Stage 3),
      // taggedContentAudit (Python/QPDF), and raw snapshot orphanMcids array. These
      // can disagree when detectionProfile is absent or stale, causing the tool to be
      // incorrectly blocked even though the applicability checks would pass.
      const hasOrphanMcidEvidence =
        (snapshot.detectionProfile?.pdfUaSignals.orphanMcidCount ?? 0) > 0 ||
        (snapshot.taggedContentAudit?.orphanMcidCount ?? 0) > 0 ||
        (snapshot.orphanMcids?.length ?? 0) > 0;
      const hasOtherTaggedContentSignals =
        (snapshot.detectionProfile?.pdfUaSignals.suspectedPathPaintOutsideMc ?? 0) > 0 ||
        (snapshot.detectionProfile?.pdfUaSignals.taggedAnnotationRiskCount ?? 0) > 0;
      if (!hasOrphanMcidEvidence && !hasOtherTaggedContentSignals) {
        return { allowed: false, reason: 'missing_precondition' };
      }
    }
    if (
      toolName === 'normalize_heading_hierarchy'
      && !headingNeedsRepair
    ) {
      return { allowed: false, reason: 'missing_precondition' };
    }
    if (
      toolName === 'normalize_nested_figure_containers'
      && !(
        categoryFailing('alt_text')
        && snapshot.structureTree !== null
        && snapshot.figures.length > 0
        && (
          structurePrimary ||
          classifyStage44FigureFailure(snapshot, analysis) === 'broken_figure_ownership' ||
          classifyStage44FigureFailure(snapshot, analysis) === 'alt_cleanup_risk' ||
          classifyStage44FigureFailure(snapshot, analysis) === 'no_checker_visible_figures'
        )
      )
    ) {
      return { allowed: false, reason: 'missing_precondition' };
    }
    if (
      (toolName === 'normalize_table_structure' || toolName === 'repair_native_table_headers' || toolName === 'set_table_header_cells')
      && !(snapshot.tables.length > 0 && categoryFailing('table_markup') && (structureConfidenceHigh || categoryFailing('table_markup')))
    ) {
      // Stage 43 is intentionally narrow: table tools run only when table_markup is
      // already failing, avoiding protected-file spillover from advisory table signals.
      return { allowed: false, reason: 'missing_precondition' };
    }
    if (toolName === 'normalize_table_structure' && classifyStage43TableFailure(snapshot, analysis) === 'not_stage43_table_target') {
      return { allowed: false, reason: 'missing_precondition' };
    }
    if ((toolName === 'replace_bookmarks_from_headings' || toolName === 'add_page_outline_bookmarks') && !categoryFailing('bookmarks')) {
      return { allowed: false, reason: 'category_not_failing' };
    }
    if (toolName === 'fill_form_field_tooltips' && !categoryFailing('form_accessibility')) {
      return { allowed: false, reason: 'category_not_failing' };
    }
    if (ROUTE_TOOL_MAP.figure_semantics.includes(toolName) && structurePrimary) {
      if (toolName === 'retag_as_figure' && !hasRoleMappedFigureCandidate(snapshot)) {
        return { allowed: false, reason: 'missing_precondition' };
      }
      if (toolName === 'repair_annotation_alt_text' || DETERMINISTIC_FIGURE_TOOLS.has(toolName)) {
        return { allowed: true };
      }
      return { allowed: false, reason: 'semantic_deferred' };
    }
    if (
      toolName === 'canonicalize_figure_alt_ownership'
      && !(
        categoryFailing('alt_text')
        && snapshot.figures.length > 0
        && (
          structurePrimary ||
          classifyStage44FigureFailure(snapshot, analysis) === 'broken_figure_ownership' ||
          classifyStage44FigureFailure(snapshot, analysis) === 'alt_cleanup_risk' ||
          classifyStage44FigureFailure(snapshot, analysis) === 'no_checker_visible_figures'
        )
      )
    ) {
      return { allowed: false, reason: 'missing_precondition' };
    }
    if (
      toolName === 'retag_as_figure'
      && !(
        categoryFailing('alt_text')
        && snapshot.figures.length > 0
        && hasRoleMappedFigureCandidate(snapshot)
      )
    ) {
      return { allowed: false, reason: 'missing_precondition' };
    }
    if (
      toolName === 'set_figure_alt_text'
      && classifyStage44FigureFailure(snapshot, analysis) !== 'missing_alt_on_reachable_figures'
    ) {
      return { allowed: false, reason: 'missing_precondition' };
    }
    if (
      toolName === 'repair_alt_text_structure'
      && !(
        categoryFailing('alt_text')
        && classifyStage44FigureFailure(snapshot, analysis) === 'alt_cleanup_risk'
      )
    ) {
      return { allowed: false, reason: 'missing_precondition' };
    }
    if (
      (toolName === 'set_link_annotation_contents' || toolName === 'repair_native_link_structure')
      && !hasAnnotationSignals
      && !(categoryFailing('link_quality') && hasWeakVisibleLinkTexts(snapshot))
    ) {
      return { allowed: false, reason: 'missing_precondition' };
    }
    if (
      (toolName === 'substitute_legacy_fonts_in_place' || toolName === 'finalize_substituted_font_conformance')
      && !fontTailCandidate
    ) {
      return { allowed: false, reason: 'missing_precondition' };
    }
    if (
      toolName === 'ocr_scanned_pdf'
      && !(
        analysis.pdfClass === 'scanned'
        || analysis.pdfClass === 'mixed'
        || (
          categoryFailing('text_extractability')
          && snapshot.textCharCount < minExtractableCharsForNativeOcr
        )
      )
    ) {
      return { allowed: false, reason: 'missing_precondition' };
    }
    return { allowed: true };
  };

  for (const route of activeRoutes) {
    const tools = ROUTE_TOOL_MAP[route] ?? [];
    for (const toolName of tools) {
      if (!isToolAllowedByRouteContract(route, toolName)) {
        addSkipped(toolName, 'route_not_active');
        continue;
      }
      const routeOwning = Object.entries(ROUTE_TOOL_MAP)
        .filter(([, routeTools]) => routeTools.includes(toolName))
        .map(([routeName]) => routeName as RemediationRoute);
      if (!routeOwning.some(routeName => activeRouteSet.has(routeName))) {
        addSkipped(toolName, 'route_not_active');
        continue;
      }
      const routeGate = toolIsRouteRelevant(toolName);
      if (!routeGate.allowed) {
        addSkipped(toolName, routeGate.reason ?? 'missing_precondition');
        continue;
      }
      if (!toolApplicableToPdfClass(toolName, analysis.pdfClass, snapshot)) {
        // 'not_applicable' = the tool genuinely cannot run on this PDF (no structure tree,
        // too few headings, no misplaced list items, etc.) — distinct from 'missing_precondition'
        // which signals a gate that *might* be too strict. 'not_applicable' does not trigger
        // unsafe_to_autofix in outcomeSummary.ts.
        addSkipped(toolName, 'not_applicable');
        continue;
      }
      if (shouldSkipAfterSuccessfulApply(toolName, alreadyApplied, analysis, snapshot)) {
        addSkipped(toolName, 'already_succeeded');
        continue;
      }
      const noEffectLimit = toolName === 'create_heading_from_candidate'
        ? Math.max(REMEDIATION_MAX_NO_EFFECT_PER_TOOL, eligibleHeadingCandidates.length)
        : REMEDIATION_MAX_NO_EFFECT_PER_TOOL;
      if (noEffectCountForTool(alreadyApplied, toolName) >= noEffectLimit) {
        addSkipped(toolName, 'missing_precondition');
        continue;
      }
      if (toolSet.has(toolName)) continue;
      const params = buildDefaultParams(toolName, analysis, snapshot, alreadyApplied);
      if (hasPriorNoEffectSignature(alreadyApplied, toolName, params)) {
        addSkipped(toolName, 'missing_precondition');
        continue;
      }
      toolSet.set(toolName, {
        toolName,
        params,
        rationale: `Run deterministic route "${route}" for ${routing.triggeringSignals.join(', ') || 'residual debt'}.`,
        route,
      });
    }
  }

  if (
    isProtectedZeroHeadingConvergence(analysis, snapshot)
    && !toolSet.has('create_heading_from_candidate')
    && (
      snapshot.headings.length === 0
      || snapshot.detectionProfile?.headingSignals.extractedHeadingsMissingFromTree === true
    )
    && !shouldSkipAfterSuccessfulApply('create_heading_from_candidate', alreadyApplied)
    && noEffectCountForTool(alreadyApplied, 'create_heading_from_candidate') < REMEDIATION_MAX_NO_EFFECT_PER_TOOL
  ) {
    const fallbackParams = buildDefaultParams('create_heading_from_candidate', analysis, snapshot, alreadyApplied);
    if (
      typeof fallbackParams['targetRef'] === 'string'
      && fallbackParams['targetRef'].length > 0
      && !hasPriorNoEffectSignature(alreadyApplied, 'create_heading_from_candidate', fallbackParams)
      && toolApplicableToPdfClass('create_heading_from_candidate', analysis.pdfClass, snapshot)
    ) {
      toolSet.set('create_heading_from_candidate', {
        toolName: 'create_heading_from_candidate',
        params: fallbackParams,
        rationale: 'Protected zero-heading convergence fallback when heading bootstrap candidate selection remains eligible.',
        route: 'post_bootstrap_heading_convergence',
      });
    }
  }

  {
    const toolName = 'create_structure_from_degenerate_native_anchor';
    if (
      headingNeedsRepair &&
      !toolSet.has(toolName) &&
      shouldTryDegenerateNativeStructureRecovery(analysis, snapshot) &&
      !shouldSkipAfterSuccessfulApply(toolName, alreadyApplied) &&
      noEffectCountForTool(alreadyApplied, toolName) < REMEDIATION_MAX_NO_EFFECT_PER_TOOL
    ) {
      const params = buildDefaultParams(toolName, analysis, snapshot, alreadyApplied);
      if (
        typeof params['text'] === 'string' &&
        params['text'].length > 0 &&
        !hasPriorNoEffectSignature(alreadyApplied, toolName, params) &&
        toolApplicableToPdfClass(toolName, analysis.pdfClass, snapshot)
      ) {
        toolSet.set(toolName, {
          toolName,
          params,
          rationale: 'Stage 131 degenerate native structure recovery from a proven first-page text anchor.',
          route: 'post_bootstrap_heading_convergence',
        });
      }
    }
  }

  {
    const toolName = 'create_heading_from_visible_text_anchor';
    if (
      visibleHeadingAnchorRecoveryActive &&
      headingNeedsRepair &&
      !toolSet.has(toolName) &&
      !shouldSkipAfterSuccessfulApply(toolName, alreadyApplied) &&
      noEffectCountForTool(alreadyApplied, toolName) < REMEDIATION_MAX_NO_EFFECT_PER_TOOL
    ) {
      const params = buildDefaultParams(toolName, analysis, snapshot, alreadyApplied);
      if (
        typeof params['text'] === 'string' &&
        params['text'].length > 0 &&
        !hasPriorNoEffectSignature(alreadyApplied, toolName, params) &&
        toolApplicableToPdfClass(toolName, analysis.pdfClass, snapshot)
      ) {
        toolSet.set(toolName, {
          toolName,
          params,
          rationale: 'Stage 127 visible-anchor zero-heading recovery from a proven first-page content anchor.',
          route: 'post_bootstrap_heading_convergence',
        });
      }
    }
  }

  {
    const toolName = 'create_heading_from_tagged_visible_anchor';
    if (
      headingNeedsRepair &&
      !toolSet.has(toolName) &&
      (
        shouldTryTaggedVisibleHeadingAnchorRecovery(analysis, snapshot) ||
        shouldTryPartialHeadingReachabilityRecovery(analysis, snapshot)
      ) &&
      !shouldSkipAfterSuccessfulApply(toolName, alreadyApplied) &&
      noEffectCountForTool(alreadyApplied, toolName) < REMEDIATION_MAX_NO_EFFECT_PER_TOOL
    ) {
      const params = buildDefaultParams(toolName, analysis, snapshot, alreadyApplied);
      if (
        typeof params['text'] === 'string' &&
        params['text'].length > 0 &&
        !hasPriorNoEffectSignature(alreadyApplied, toolName, params) &&
        toolApplicableToPdfClass(toolName, analysis.pdfClass, snapshot)
      ) {
        toolSet.set(toolName, {
          toolName,
          params,
          rationale: shouldTryPartialHeadingReachabilityRecovery(analysis, snapshot)
            ? 'Stage 149 partial-heading reachability recovery from a proven first-page content anchor.'
            : 'Stage 143 tagged zero-heading recovery from a proven visible content anchor.',
          route: 'post_bootstrap_heading_convergence',
        });
      }
    }
  }

  {
    const toolName = 'synthesize_ocr_page_shell_reading_order_structure';
    if (
      ocrPageShellReadingOrderRecoveryActive &&
      !toolSet.has(toolName) &&
      !shouldSkipAfterSuccessfulApply(toolName, alreadyApplied) &&
      noEffectCountForTool(alreadyApplied, toolName) < REMEDIATION_MAX_NO_EFFECT_PER_TOOL
    ) {
      const params = buildDefaultParams(toolName, analysis, snapshot, alreadyApplied);
      if (
        !hasPriorNoEffectSignature(alreadyApplied, toolName, params) &&
        toolApplicableToPdfClass(toolName, analysis.pdfClass, snapshot)
      ) {
        toolSet.set(toolName, {
          toolName,
          params,
          rationale: 'Stage 144 OCR page-shell reading-order recovery from existing OCR text structure.',
          route: 'font_ocr_repair',
        });
      }
    }
  }

  {
    const toolName = 'create_heading_from_ocr_page_shell_anchor';
    if (
      ocrPageShellHeadingRecoveryActive &&
      headingNeedsRepair &&
      !toolSet.has(toolName) &&
      !shouldSkipAfterSuccessfulApply(toolName, alreadyApplied) &&
      noEffectCountForTool(alreadyApplied, toolName) < REMEDIATION_MAX_NO_EFFECT_PER_TOOL
    ) {
      const params = buildDefaultParams(toolName, analysis, snapshot, alreadyApplied);
      if (
        typeof params['text'] === 'string' &&
        params['text'].length > 0 &&
        typeof params['mcid'] === 'number' &&
        !hasPriorNoEffectSignature(alreadyApplied, toolName, params) &&
        toolApplicableToPdfClass(toolName, analysis.pdfClass, snapshot)
      ) {
        toolSet.set(toolName, {
          toolName,
          params,
          rationale: 'Stage 129 OCR page-shell heading recovery from a proven first-page OCR content anchor.',
          route: 'font_ocr_repair',
        });
      }
    }
  }

  // For native_tagged PDFs with pathologically shallow structure trees (depth <= threshold),
  // the route loop above never selects synthesize_basic_structure_from_layout because
  // structure_bootstrap_and_conformance is gated to native_untagged/mixed. Inject it directly
  // so we can rebuild the root-reachable tree that qpdf/ICJIA requires for reading_order > 30.
  {
    const structDepth = snapshot.detectionProfile?.readingOrderSignals.structureTreeDepth ?? 2;
    const synToolName = 'synthesize_basic_structure_from_layout';
    if (
      analysis.pdfClass === 'native_tagged' &&
      structDepth <= FORCE_SYNTHESIS_QPDF_DEPTH_THRESHOLD &&
      categoryFailing('reading_order') &&
      snapshot.textCharCount > 0 &&
      !toolSet.has(synToolName) &&
      !shouldSkipAfterSuccessfulApply(synToolName, alreadyApplied) &&
      noEffectCountForTool(alreadyApplied, synToolName) < REMEDIATION_MAX_NO_EFFECT_PER_TOOL
    ) {
      const params = buildDefaultParams(synToolName, analysis, snapshot, alreadyApplied);
      if (hasPriorNoEffectSignature(alreadyApplied, synToolName, params)) {
        addSkipped(synToolName, 'missing_precondition');
      } else {
      toolSet.set(synToolName, {
        toolName: synToolName,
        params,
        rationale: 'shallow-native-tagged structure depth forces synthesis to rebuild root-reachable tree',
        route: 'structure_bootstrap_and_conformance',
      });
      }
    }
    if (
      nativeTaggedNoHeadingSynthesisCandidate &&
      !toolSet.has(synToolName) &&
      !shouldSkipAfterSuccessfulApply(synToolName, alreadyApplied) &&
      noEffectCountForTool(alreadyApplied, synToolName) < REMEDIATION_MAX_NO_EFFECT_PER_TOOL
    ) {
      const params = buildDefaultParams(synToolName, analysis, snapshot, alreadyApplied);
      if (hasPriorNoEffectSignature(alreadyApplied, synToolName, params)) {
        addSkipped(synToolName, 'missing_precondition');
      } else {
      toolSet.set(synToolName, {
        toolName: synToolName,
        params,
        rationale: 'native-tagged P-only tree with zero headings triggers bounded heading synthesis',
        route: 'structure_bootstrap_and_conformance',
      });
      }
    }
  }

  if (
    categoryFailing('alt_text')
    && (structurePrimary || routing.triggeringSignals.includes('zero_heading_figure_recovery'))
    && snapshot.figures.length > 0
    && routeFailureProof('figure_semantics', alreadyApplied) === null
  ) {
    for (const toolName of ['normalize_nested_figure_containers', 'canonicalize_figure_alt_ownership', 'retag_as_figure', 'set_figure_alt_text']) {
      if (toolSet.has(toolName)) continue;
      const routeGate = toolIsRouteRelevant(toolName);
      if (!routeGate.allowed) {
        addSkipped(toolName, routeGate.reason ?? 'missing_precondition');
        continue;
      }
      if (!toolApplicableToPdfClass(toolName, analysis.pdfClass, snapshot)) {
        addSkipped(toolName, 'not_applicable');
        continue;
      }
      if (shouldSkipAfterSuccessfulApply(toolName, alreadyApplied, analysis, snapshot)) {
        addSkipped(toolName, 'already_succeeded');
        continue;
      }
      if (noEffectCountForTool(alreadyApplied, toolName) >= REMEDIATION_MAX_NO_EFFECT_PER_TOOL) {
        addSkipped(toolName, 'missing_precondition');
        continue;
      }
      const params = buildDefaultParams(toolName, analysis, snapshot, alreadyApplied);
      if (hasPriorNoEffectSignature(alreadyApplied, toolName, params)) {
        addSkipped(toolName, 'missing_precondition');
        continue;
      }
      toolSet.set(toolName, {
        toolName,
        params,
        rationale: 'Run deterministic figure ownership/alt lane alongside structure-primary remediation.',
        route: 'figure_semantics',
      });
    }
  }

  if (
    categoryFailing('alt_text')
    && routing.triggeringSignals.includes('zero_heading_figure_recovery')
    && snapshot.figures.length > 0
    && routeFailureProof('figure_semantics', alreadyApplied) === null
  ) {
    for (const toolName of ['normalize_nested_figure_containers', 'canonicalize_figure_alt_ownership', 'retag_as_figure']) {
      if (toolSet.has(toolName)) continue;
      if (!toolApplicableToPdfClass(toolName, analysis.pdfClass, snapshot)) continue;
      if (shouldSkipAfterSuccessfulApply(toolName, alreadyApplied, analysis, snapshot)) continue;
      const params = buildDefaultParams(toolName, analysis, snapshot, alreadyApplied);
      if (hasPriorNoEffectSignature(alreadyApplied, toolName, params)) continue;
      toolSet.set(toolName, {
        toolName,
        params,
        rationale: 'Run deterministic figure ownership lane for zero-heading figure recovery.',
        route: 'figure_semantics',
      });
    }
  }

  for (const route of routing.deferredRoutes) {
    for (const toolName of ROUTE_TOOL_MAP[route] ?? []) {
      if (route === 'figure_semantics' && DETERMINISTIC_FIGURE_TOOLS.has(toolName)) continue;
      if (!toolSet.has(toolName)) {
        addSkipped(toolName, route === 'figure_semantics' ? 'semantic_deferred' : 'route_not_active');
      }
    }
  }

  const plannedRaw = Array.from(toolSet.values()).sort((a, b) => {
    const sa = REMEDIATION_TOOL_STAGE_ORDER[a.toolName] ?? 99;
    const sb = REMEDIATION_TOOL_STAGE_ORDER[b.toolName] ?? 99;
    if (sa !== sb) return sa - sb;
    return a.toolName.localeCompare(b.toolName);
  });

  const plannedMandatoryRaw = includeOptionalRemediation
    ? plannedRaw
    : plannedRaw.filter(tool => !optionalToolNames.has(tool.toolName));
  if (!includeOptionalRemediation) {
    for (const tool of plannedRaw) {
      if (optionalToolNames.has(tool.toolName)) addSkipped(tool.toolName, 'route_not_active');
    }
  }

  const reliabilityExemptTools = protectedZeroHeadingConvergence
    ? new Set(['create_heading_from_candidate', 'normalize_heading_hierarchy', 'repair_structure_conformance'])
    : new Set<string>();
  const planned = filterPlannedToolsByReliability(
    plannedMandatoryRaw,
    analysis.pdfClass,
    toolOutcomeStore,
    reliabilityExemptTools,
  );
  for (const tool of plannedMandatoryRaw) {
    if (!planned.some(candidate => candidate.toolName === tool.toolName)) {
      addSkipped(tool.toolName, 'reliability_filtered');
    }
  }

  if (planned.length === 0) {
    return {
      stages: [],
      planningSummary: buildPlanningSummary({
        routing,
        includeOptionalRemediation,
        scheduledTools: [],
        stoppedRoutes,
        skippedTools: [...skippedTools.entries()].map(([toolName, reason]) => ({ toolName, reason })),
      }),
    };
  }

  // One stage per distinct stage number; reanalyze after each stage (authoritative score).
  const stageNumbers = [...new Set(planned.map(t => REMEDIATION_TOOL_STAGE_ORDER[t.toolName] ?? 99))].sort((a, b) => a - b);
  const stages: RemediationStagePlan[] = stageNumbers.map(sn => ({
    stageNumber: sn,
    tools: planned.filter(t => (REMEDIATION_TOOL_STAGE_ORDER[t.toolName] ?? 99) === sn),
    reanalyzeAfter: true,
  })).filter(s => s.tools.length > 0);

  return {
    stages,
    planningSummary: buildPlanningSummary({
      routing,
      includeOptionalRemediation,
      scheduledTools: planned,
      stoppedRoutes,
      skippedTools: [...skippedTools.entries()].map(([toolName, reason]) => ({ toolName, reason })),
    }),
  };
}

export function buildDefaultParams(
  toolName: string,
  analysis: AnalysisResult,
  snapshot: DocumentSnapshot,
  alreadyApplied: AppliedRemediationTool[] = [],
): Record<string, unknown> {
  const meta = snapshot.metadata;
  switch (toolName) {
    case 'set_document_title':
      return {
        title: deriveFallbackDocumentTitle(snapshot, analysis.filename),
      };
    case 'set_document_language':
      return { language: (meta.language?.trim() || snapshot.lang?.trim() || 'en-US').slice(0, 32) };
    case 'set_pdfua_identification':
      return {
        part: 1,
        language: (meta.language?.trim() || snapshot.lang?.trim() || 'en-US').slice(0, 32),
      };
    case 'ocr_scanned_pdf':
      return {
        languages: ocrmypdfLanguagesForSnapshot(snapshot),
        skipExistingText: analysis.pdfClass === 'mixed',
        deskew: true,
        rotatePages: true,
        /** Passed to ocrmypdf as `--force-ocr` so OCR still runs after an earlier tagging stage. */
        forceOcr: true,
      };
    case 'set_figure_alt_text': {
      const attemptedRefs = new Set(
        alreadyApplied
          .filter(row => row.toolName === 'set_figure_alt_text')
          .map(row => mutationTargetRef(parseMutationDetails(row.details)))
          .filter((value): value is string => typeof value === 'string' && value.length > 0),
      );
      const checkerCandidates = sortFigureTargets(
        (snapshot.checkerFigureTargets ?? []).filter(f =>
          !f.isArtifact
          && !f.hasAlt
          && f.structRef
          && !attemptedRefs.has(f.structRef)
          && isFigureRole(f.resolvedRole ?? f.role)
          && f.reachable,
        ),
      ).sort((a, b) => Number(b.directContent) - Number(a.directContent) || a.page - b.page || (a.structRef ?? '').localeCompare(b.structRef ?? ''));
      const fallbackCandidates = (snapshot.checkerFigureTargets?.length ?? 0) > 0
        ? []
        : sortFigureTargets(
          snapshot.figures.filter(f => !f.isArtifact && !f.hasAlt && f.structRef && !attemptedRefs.has(f.structRef) && isFigureRole(f.role)),
        );
      const target = checkerCandidates[0] ?? fallbackCandidates[0];
      return target?.structRef ? { structRef: target.structRef, altText: deterministicFigureAltPlaceholder(target) } : {};
    }
    case 'create_heading_from_candidate': {
      const candidate = stage24ZeroHeadingBootstrapEnabled()
        ? selectHeadingBootstrapCandidateForAttempt(
          snapshot,
          attemptCount(alreadyApplied, 'create_heading_from_candidate'),
        )
        : null;
      if (!candidate) {
        const elems = (snapshot.paragraphStructElems ?? []).filter(
          item => item.structRef && item.text.trim().length >= 4,
        );
        const page0 = elems
          .filter(e => e.page === 0)
          .sort((a, b) => b.text.length - a.text.length)[0];
        const legacyCandidate = page0
          ?? elems.sort((a, b) => a.page - b.page || b.text.length - a.text.length)[0];
        if (!legacyCandidate) return {};
        const hasExistingH1 = snapshot.headings.some(heading => heading.level === 1);
        const zeroExportedHeadings = snapshot.headings.length === 0;
        return {
          targetRef: legacyCandidate.structRef,
          level: !hasExistingH1 && zeroExportedHeadings ? 1 : 2,
          text: legacyCandidate.text.slice(0, 200),
        };
      }
      const hasExistingH1 = snapshot.headings.some(heading => heading.level === 1);
      const zeroExportedHeadings = snapshot.headings.length === 0;
      return {
        targetRef: candidate.structRef,
        level: !hasExistingH1 && zeroExportedHeadings ? 1 : 2,
        text: candidate.text.slice(0, 200),
      };
    }
    case 'create_heading_from_visible_text_anchor': {
      const candidate = selectVisibleHeadingAnchorCandidate(analysis, snapshot);
      if (!candidate) return {};
      return {
        page: candidate.page,
        ...(typeof candidate.mcid === 'number' ? { mcid: candidate.mcid } : {}),
        ...(candidate.targetRef ? { targetRef: candidate.targetRef } : {}),
        level: 1,
        text: candidate.text.slice(0, 200),
        source: candidate.source,
        confidenceScore: candidate.score,
      };
    }
    case 'create_heading_from_tagged_visible_anchor': {
      const partialReachability = shouldTryPartialHeadingReachabilityRecovery(analysis, snapshot);
      const candidate = partialReachability
        ? selectPartialHeadingReachabilityCandidate(analysis, snapshot)
        : shouldTryTaggedVisibleHeadingAnchorRecovery(analysis, snapshot)
          ? selectTaggedVisibleHeadingAnchorCandidate(analysis, snapshot)
          : null;
      if (!candidate) return {};
      return {
        page: candidate.page,
        ...(typeof candidate.mcid === 'number' ? { mcid: candidate.mcid } : {}),
        ...(Array.isArray(candidate.mcids) && candidate.mcids.length > 0 ? { mcids: candidate.mcids } : {}),
        ...(candidate.targetRef ? { targetRef: candidate.targetRef } : {}),
        level: 1,
        text: candidate.text.slice(0, 200),
        source: candidate.source,
        confidenceScore: candidate.score,
        ...(partialReachability ? { allowExistingHeadingRolesForPartialReachability: true } : {}),
      };
    }
    case 'create_structure_from_degenerate_native_anchor': {
      if (!shouldTryDegenerateNativeStructureRecovery(analysis, snapshot)) return {};
      const disposition = classifyStage131DegenerateNative(analysis, snapshot);
      const candidate = selectDegenerateNativeAnchorCandidate(analysis, snapshot);
      const activeCandidate = candidate ?? disposition.candidate;
      if (!activeCandidate) return {};
      return {
        page: activeCandidate.page,
        level: 1,
        text: activeCandidate.text.slice(0, 200),
        source: activeCandidate.source,
        confidenceScore: activeCandidate.score,
        ...(disposition.classification === 'native_marked_content_shell_candidate'
          ? { allowExistingMarkedContentShell: true }
          : {}),
      };
    }
    case 'create_heading_from_ocr_page_shell_anchor': {
      const candidate = selectOcrPageShellHeadingCandidate(analysis, snapshot);
      if (!candidate) return {};
      return {
        page: candidate.page,
        mcid: candidate.mcid,
        mcids: candidate.mcids,
        level: 1,
        text: candidate.text.slice(0, 200),
        source: candidate.source,
        confidenceScore: candidate.score,
      };
    }
    case 'synthesize_ocr_page_shell_reading_order_structure':
      if (!shouldTryOcrPageShellReadingOrderRecovery(analysis, snapshot)) return {};
      return {
        maxParagraphsPerPage: 1,
        maxPages: Math.min(Math.max(snapshot.pageCount, 1), 240),
      };
    case 'substitute_legacy_fonts_in_place':
      return { maxWidthDrift: 0.12 };
    case 'finalize_substituted_font_conformance':
      return { maxWidthDrift: 0.35 };
    case 'mark_figure_decorative': {
      const checkerCandidates = sortFigureTargets(
        (snapshot.checkerFigureTargets ?? []).filter(f =>
          !f.isArtifact
          && !f.hasAlt
          && f.structRef
          && isFigureRole(f.resolvedRole ?? f.role)
          && f.reachable,
        ),
      ).sort((a, b) => Number(b.directContent) - Number(a.directContent) || a.page - b.page || (a.structRef ?? '').localeCompare(b.structRef ?? ''));
      const fallbackCandidates = sortFigureTargets(
        snapshot.figures.filter(f => !f.isArtifact && !f.hasAlt && f.structRef && (f.role ?? '').toLowerCase() === 'figure'),
      );
      const target = checkerCandidates[0] ?? fallbackCandidates[0];
      return target?.structRef ? { structRef: target.structRef } : {};
    }
    case 'retag_as_figure': {
      const attemptedRefs = new Set(
        alreadyApplied
          .filter(row => row.toolName === 'retag_as_figure')
          .map(row => mutationTargetRef(parseMutationDetails(row.details)))
          .filter((value): value is string => typeof value === 'string' && value.length > 0),
      );
      const candidates = sortFigureTargets(
        snapshot.figures.filter(f =>
          !f.isArtifact
          && !f.hasAlt
          && f.structRef
          && !attemptedRefs.has(f.structRef)
          && f.reachable === true
          && isFigureRole(f.role)
          && typeof f.rawRole === 'string'
          && f.rawRole.length > 0
          && !isFigureRole(f.rawRole)
          && (f.directContent === true || (f.subtreeMcidCount ?? 0) > 0)
        ),
      ).sort((a, b) =>
        Number(b.directContent) - Number(a.directContent)
        || (b.subtreeMcidCount ?? 0) - (a.subtreeMcidCount ?? 0)
        || a.page - b.page
        || (a.structRef ?? '').localeCompare(b.structRef ?? '')
      );
      const target = candidates[0];
      return target?.structRef ? { structRef: target.structRef, altText: deterministicFigureAltPlaceholder(target) } : {};
    }
    case 'canonicalize_figure_alt_ownership':
    case 'normalize_nested_figure_containers': {
      const checkerCandidates = sortFigureTargets(
        (snapshot.checkerFigureTargets ?? []).filter(f =>
          !f.isArtifact
          && !f.hasAlt
          && f.structRef
          && (
            !f.reachable ||
            !isFigureRole(f.resolvedRole ?? f.role) ||
            hasAcrobatAltOwnershipRisk(snapshot)
          ),
        ),
      ).sort((a, b) =>
        Number(a.reachable) - Number(b.reachable)
        || Number(b.directContent) - Number(a.directContent)
        || a.page - b.page
        || (a.structRef ?? '').localeCompare(b.structRef ?? '')
      );
      const target = checkerCandidates[0];
      return target?.structRef
        ? { structRef: target.structRef, maxRepairsPerRun: 1 }
        : { maxRepairsPerRun: 1 };
    }
    case 'replace_bookmarks_from_headings':
      // force:true ensures we replace even when the PDF already has bookmarks (they may be inadequate).
      return { force: true };
    case 'add_page_outline_bookmarks':
      return { maxPages: BOOKMARKS_PAGE_OUTLINE_MAX_PAGES };
    case 'normalize_table_structure': {
      const tableClass = classifyStage43TableFailure(snapshot, analysis);
      if (tableClass === 'not_stage43_table_target') return {};
      const attemptedRefs = new Set(
        alreadyApplied
          .filter(row => row.toolName === 'normalize_table_structure')
          .map(row => mutationTargetRef(parseMutationDetails(row.details)))
          .filter((ref): ref is string => Boolean(ref)),
      );
      const target = snapshot.tables
        .filter(table => table.structRef && !attemptedRefs.has(table.structRef))
        .filter(table => {
          if (tableClass === 'direct_cells_under_table') return (table.cellsMisplacedCount ?? 0) > 0 || table.hasHeaders || table.totalCells >= 4;
          if (tableClass === 'rowless_dense_table') return (table.rowCount ?? 0) <= 1 && table.totalCells >= 4;
          if (tableClass === 'strongly_irregular_rows') {
            return table.hasHeaders
              && (table.cellsMisplacedCount ?? 0) === 0
              && (table.rowCount ?? 0) > 1
              && (table.irregularRows ?? 0) >= 2
              && (table.dominantColumnCount ?? 0) >= 2;
          }
          if (tableClass === 'missing_headers_only') return !table.hasHeaders && table.totalCells >= 4;
          if (tableClass === 'layout_table_candidate') return table.totalCells <= 2 && !table.hasHeaders;
          return false;
        })
        .sort((a, b) =>
          Number((b.cellsMisplacedCount ?? 0) > 0) - Number((a.cellsMisplacedCount ?? 0) > 0)
          || Number((b.rowCount ?? 0) <= 1 && b.totalCells >= 4) - Number((a.rowCount ?? 0) <= 1 && a.totalCells >= 4)
          || (b.irregularRows ?? 0) - (a.irregularRows ?? 0)
          || a.page - b.page
          || (a.structRef ?? '').localeCompare(b.structRef ?? '')
        )[0];
      if (tableClass === 'strongly_irregular_rows') {
        return {
          dominantColumnCount: 0,
          maxTablesPerRun: 4,
          maxSyntheticCells: 160,
          tableFailureClass: tableClass,
        };
      }
      return target?.structRef
        ? {
          structRef: target.structRef,
          dominantColumnCount: target.dominantColumnCount ?? 0,
          totalCells: target.totalCells,
          maxTablesPerRun: 1,
          tableFailureClass: tableClass,
        }
        : {};
    }
    case 'set_table_header_cells': {
      const t = snapshot.tables
        .filter(row => !row.hasHeaders && (row.cellsMisplacedCount ?? 0) === 0 && (row.rowCount ?? 0) > 1 && row.structRef)
        .sort((a, b) => a.page - b.page || (a.structRef ?? '').localeCompare(b.structRef ?? ''))[0];
      return t?.structRef ? { structRef: t.structRef } : {};
    }
    case 'wrap_singleton_orphan_mcid': {
      const o = snapshot.orphanMcids ?? [];
      if (o.length !== 1) return {};
      return { page: o[0]!.page, mcid: o[0]!.mcid };
    }
    default:
      return {};
  }
}
