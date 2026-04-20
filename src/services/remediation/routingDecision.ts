import { REMEDIATION_CATEGORY_THRESHOLD } from '../../config.js';
import type {
  AnalysisResult,
  DetectionProfile,
  DocumentSnapshot,
  FailureProfile,
  PlanningSkipReason,
  PlannedRemediationTool,
  PlanningSummary,
  RemediationRoute,
  ScoredCategory,
} from '../../types.js';

export interface RoutingDecision {
  primaryRoute: RemediationRoute | null;
  secondaryRoutes: RemediationRoute[];
  triggeringSignals: string[];
  residualFamilies: string[];
  deferredRoutes: RemediationRoute[];
  semanticDeferred: boolean;
}

function categoryScore(
  analysis: AnalysisResult,
  key: ScoredCategory['key'],
): number {
  return analysis.categories.find(category => category.key === key)?.score ?? 100;
}

function categoryFailing(
  analysis: AnalysisResult,
  key: ScoredCategory['key'],
): boolean {
  const category = analysis.categories.find(item => item.key === key);
  return Boolean(category?.applicable && category.score < REMEDIATION_CATEGORY_THRESHOLD);
}

function pushRoute(routes: RemediationRoute[], route: RemediationRoute): void {
  if (!routes.includes(route)) routes.push(route);
}

function pushSignal(signals: string[], signal: string, active: boolean): void {
  if (active && !signals.includes(signal)) signals.push(signal);
}

function hasStrongTaggedContentDebt(profile?: DetectionProfile | null): boolean {
  if (!profile) return false;
  return (
    (profile.pdfUaSignals.orphanMcidCount ?? 0) > 0 ||
    (profile.pdfUaSignals.suspectedPathPaintOutsideMc ?? 0) >= 10 ||
    (profile.listSignals.listItemMisplacedCount ?? 0) > 0 ||
    (profile.listSignals.lblBodyMisplacedCount ?? 0) > 0 ||
    (profile.listSignals.listsWithoutItems ?? 0) > 0
  );
}

function hasAnnotationDebt(profile?: DetectionProfile | null): boolean {
  if (!profile) return false;
  return (
    (profile.annotationSignals.pagesMissingTabsS ?? 0) > 0 ||
    (profile.annotationSignals.pagesAnnotationOrderDiffers ?? 0) > 0 ||
    (profile.annotationSignals.linkAnnotationsMissingStructure ?? 0) > 0 ||
    (profile.annotationSignals.nonLinkAnnotationsMissingStructure ?? 0) > 0 ||
    (profile.annotationSignals.linkAnnotationsMissingStructParent ?? 0) > 0 ||
    (profile.annotationSignals.nonLinkAnnotationsMissingStructParent ?? 0) > 0
  );
}

function hasReadingOrderDebt(profile?: DetectionProfile | null): boolean {
  if (!profile) return false;
  return (
    profile.readingOrderSignals.missingStructureTree ||
    profile.readingOrderSignals.degenerateStructureTree ||
    profile.readingOrderSignals.annotationOrderRiskCount > 0 ||
    profile.readingOrderSignals.annotationStructParentRiskCount > 0 ||
    profile.readingOrderSignals.sampledStructurePageOrderDriftCount > 0 ||
    profile.readingOrderSignals.multiColumnOrderRiskPages > 0 ||
    profile.readingOrderSignals.headerFooterPollutionRisk
  );
}

function hasTableDebt(snapshot: DocumentSnapshot, profile?: DetectionProfile | null): boolean {
  if (snapshot.tables.length === 0) return false;
  if (!profile) return snapshot.tables.some(table => !table.hasHeaders);
  return (
    (profile.tableSignals.irregularTableCount ?? 0) > 0 ||
    (profile.tableSignals.stronglyIrregularTableCount ?? 0) > 0 ||
    (profile.tableSignals.directCellUnderTableCount ?? 0) > 0 ||
    snapshot.tables.some(table => !table.hasHeaders)
  );
}

function hasFigureDebt(snapshot: DocumentSnapshot, failureProfile?: FailureProfile): boolean {
  return (
    snapshot.figures.length > 0 &&
      (failureProfile?.primaryFailureFamily === 'figure_alt_ownership_heavy' ||
      (failureProfile?.semanticIssues.includes('alt_text') ?? false) ||
      (failureProfile?.manualOnlyIssues.includes('alt_text') ?? false) ||
      snapshot.detectionProfile?.figureSignals?.treeFigureMissingForExtractedFigures === true ||
      (snapshot.detectionProfile?.figureSignals?.nonFigureRoleCount ?? 0) > 0)
  );
}

function hasFontDebt(snapshot: DocumentSnapshot, analysis: AnalysisResult, failureProfile?: FailureProfile): boolean {
  const riskyFontCount = snapshot.fonts.filter(
    font => font.encodingRisk || !font.hasUnicode || !font.isEmbedded,
  ).length;
  const dominantRiskyFontDebt =
    riskyFontCount >= 2 && riskyFontCount >= Math.ceil(Math.max(snapshot.fonts.length, 1) / 2);
  return (
    failureProfile?.primaryFailureFamily === 'font_extractability_heavy' ||
    categoryFailing(analysis, 'text_extractability') ||
    snapshot.pdfClass === 'scanned' ||
    snapshot.pdfClass === 'mixed' ||
    dominantRiskyFontDebt
  );
}

function hasUsableStructureTree(snapshot: DocumentSnapshot, detection?: DetectionProfile | null): boolean {
  if (!snapshot.structureTree) return false;
  return detection?.readingOrderSignals.missingStructureTree !== true;
}

function hasExtractableNativeText(snapshot: DocumentSnapshot): boolean {
  return snapshot.pdfClass !== 'scanned' && (snapshot.textCharCount ?? 0) > 0;
}

function failingCategories(analysis: AnalysisResult): ScoredCategory['key'][] {
  return analysis.categories
    .filter(category => category.applicable && category.score < REMEDIATION_CATEGORY_THRESHOLD)
    .map(category => category.key);
}

function fontDebtSignals(snapshot: DocumentSnapshot): {
  fontRiskCount: number;
  legacyType1RiskCount: number;
} {
  const riskyFonts = snapshot.fonts.filter(font =>
    font.encodingRisk || !font.hasUnicode || !font.isEmbedded,
  );
  const legacyType1RiskCount = riskyFonts.filter(font =>
    (font.subtype ?? '').toLowerCase() === 'type1' && !font.isEmbedded,
  ).length;
  return {
    fontRiskCount: riskyFonts.length,
    legacyType1RiskCount,
  };
}

function deriveResidualFamilies(input: {
  analysis: AnalysisResult;
  snapshot: DocumentSnapshot;
  detection?: DetectionProfile | null;
  nearPassFigureRecovery: boolean;
  postBootstrapHeadingConvergence: boolean;
  fontUnicodeTailRecovery: boolean;
  structureBootstrapAndConformance: boolean;
}): string[] {
  const families: string[] = [];
  if (
    input.structureBootstrapAndConformance
    || categoryFailing(input.analysis, 'pdf_ua_compliance')
    || hasStrongTaggedContentDebt(input.detection)
  ) {
    families.push('logical_structure_marked_content');
  }
  if (input.postBootstrapHeadingConvergence) {
    families.push('post_bootstrap_heading_convergence');
  }
  if (input.nearPassFigureRecovery || categoryFailing(input.analysis, 'alt_text')) {
    families.push('native_figure_convergence');
  }
  if (input.fontUnicodeTailRecovery) {
    families.push('font_embedding_and_unicode');
  }
  return families;
}

export function deriveRoutingDecision(
  analysis: AnalysisResult,
  snapshot: DocumentSnapshot,
): RoutingDecision {
  const routes: RemediationRoute[] = [];
  const deferredRoutes: RemediationRoute[] = [];
  const signals: string[] = [];
  const failureProfile = analysis.failureProfile;
  const structural = analysis.structuralClassification;
  const detection = analysis.detectionProfile;
  const semanticDeferred = failureProfile?.routingHints.includes('semantic_not_primary') ?? false;
  const failing = failingCategories(analysis);
  const fontSignals = fontDebtSignals(snapshot);

  const metadataDebt =
    categoryFailing(analysis, 'title_language') || !snapshot.pdfUaVersion;
  const structureBootstrapAndConformance =
    (snapshot.pdfClass === 'native_untagged' || snapshot.pdfClass === 'mixed')
    && hasExtractableNativeText(snapshot)
    && !hasUsableStructureTree(snapshot, detection)
    && categoryFailing(analysis, 'pdf_ua_compliance');
  const postBootstrapHeadingConvergence =
    hasExtractableNativeText(snapshot)
    && hasUsableStructureTree(snapshot, detection)
    && !categoryFailing(analysis, 'text_extractability')
    && (categoryFailing(analysis, 'heading_structure') || categoryFailing(analysis, 'reading_order'));
  const bootstrapDebt =
    snapshot.pdfClass !== 'scanned' &&
    (structural?.structureClass === 'untagged_digital' ||
      structural?.structureClass === 'partially_tagged' ||
      snapshot.structureTree === null ||
      hasStrongTaggedContentDebt(detection) ||
      (categoryFailing(analysis, 'pdf_ua_compliance') &&
        hasStrongTaggedContentDebt(detection)));
  const annotationDebt =
    hasAnnotationDebt(detection) || categoryFailing(analysis, 'link_quality');
  const fontDebt = hasFontDebt(snapshot, analysis, failureProfile);
  const fontUnicodeTailRecovery =
    hasExtractableNativeText(snapshot)
    && categoryFailing(analysis, 'text_extractability')
    && snapshot.pdfClass !== 'scanned'
    && fontSignals.fontRiskCount > 0
    && fontSignals.legacyType1RiskCount > 0
    && (analysis.failureProfile?.primaryFailureFamily === 'font_extractability_heavy'
      || fontSignals.fontRiskCount >= Math.ceil(Math.max(snapshot.fonts.length, 1) / 2));
  const figureDebt =
    hasFigureDebt(snapshot, failureProfile) || categoryFailing(analysis, 'alt_text');
  const nearPassFigureRecovery =
    analysis.score >= 85
    && categoryFailing(analysis, 'alt_text')
    && (snapshot.isTagged || snapshot.structureTree !== null)
    && analysis.structuralClassification?.confidence !== 'low'
    && failing.every(key => key === 'alt_text' || key === 'pdf_ua_compliance' || key === 'color_contrast')
    && categoryScore(analysis, 'alt_text') <= categoryScore(analysis, 'pdf_ua_compliance');
  const nativeStructureDebt =
    categoryFailing(analysis, 'reading_order') ||
    categoryFailing(analysis, 'heading_structure') ||
    categoryFailing(analysis, 'table_markup') ||
    (categoryFailing(analysis, 'pdf_ua_compliance') && !nearPassFigureRecovery) ||
    hasReadingOrderDebt(detection) ||
    hasTableDebt(snapshot, detection);
  const navigationDebt =
    categoryFailing(analysis, 'bookmarks') || categoryFailing(analysis, 'form_accessibility');
  const structureDominant =
    structureBootstrapAndConformance ||
    postBootstrapHeadingConvergence ||
    bootstrapDebt ||
    annotationDebt ||
    nativeStructureDebt ||
    failureProfile?.primaryFailureFamily === 'structure_reading_order_heavy' ||
    failureProfile?.primaryFailureFamily === 'mixed_structural';
  const fontDominant =
    fontDebt && failureProfile?.primaryFailureFamily === 'font_extractability_heavy';

  pushSignal(signals, 'title_language_debt', metadataDebt);
  pushSignal(signals, 'missing_pdfua_identification', !snapshot.pdfUaVersion);
  pushSignal(signals, 'structure_bootstrap_and_conformance', structureBootstrapAndConformance);
  pushSignal(signals, 'post_bootstrap_heading_convergence', postBootstrapHeadingConvergence);
  pushSignal(signals, 'structure_class_untagged_or_partial', structural?.structureClass === 'untagged_digital' || structural?.structureClass === 'partially_tagged');
  pushSignal(signals, 'missing_structure_tree', snapshot.structureTree === null);
  pushSignal(signals, 'tagged_content_debt', hasStrongTaggedContentDebt(detection));
  pushSignal(signals, 'annotation_debt', annotationDebt);
  pushSignal(signals, 'reading_order_debt', hasReadingOrderDebt(detection) || categoryFailing(analysis, 'reading_order'));
  pushSignal(signals, 'table_debt', hasTableDebt(snapshot, detection) || categoryFailing(analysis, 'table_markup'));
  pushSignal(signals, 'font_or_ocr_debt', fontDebt);
  pushSignal(signals, 'font_unicode_tail_recovery', fontUnicodeTailRecovery);
  pushSignal(signals, 'figure_semantic_debt', figureDebt);
  pushSignal(signals, 'near_pass_figure_recovery', nearPassFigureRecovery);
  pushSignal(signals, 'navigation_or_forms_debt', navigationDebt);

  if (fontUnicodeTailRecovery) pushRoute(routes, 'font_unicode_tail_recovery');
  if (fontDominant && !fontUnicodeTailRecovery) pushRoute(routes, 'font_ocr_repair');
  if (structureDominant) {
    if (structureBootstrapAndConformance) pushRoute(routes, 'structure_bootstrap_and_conformance');
    if (postBootstrapHeadingConvergence) pushRoute(routes, 'post_bootstrap_heading_convergence');
    if (bootstrapDebt) pushRoute(routes, 'structure_bootstrap');
    if (annotationDebt) pushRoute(routes, 'annotation_link_normalization');
    if (nativeStructureDebt) pushRoute(routes, 'native_structure_repair');
  }
  if (metadataDebt && !structureDominant && !fontDominant) pushRoute(routes, 'metadata_foundation');
  if (fontDebt && !routes.includes('font_ocr_repair')) pushRoute(routes, 'font_ocr_repair');
  if (metadataDebt && !routes.includes('metadata_foundation')) pushRoute(routes, 'metadata_foundation');
  if (!structureDominant) {
    if (bootstrapDebt) pushRoute(routes, 'structure_bootstrap');
    if (annotationDebt) pushRoute(routes, 'annotation_link_normalization');
    if (nativeStructureDebt) pushRoute(routes, 'native_structure_repair');
    if (postBootstrapHeadingConvergence) pushRoute(routes, 'post_bootstrap_heading_convergence');
  }
  if (navigationDebt) pushRoute(routes, 'document_navigation_forms');
  if (nearPassFigureRecovery) pushRoute(routes, 'near_pass_figure_recovery');
  if (figureDebt) {
    if (nearPassFigureRecovery) {
      pushRoute(deferredRoutes, 'figure_semantics');
    } else if (semanticDeferred || bootstrapDebt || nativeStructureDebt || structureBootstrapAndConformance || postBootstrapHeadingConvergence) {
      pushRoute(deferredRoutes, 'figure_semantics');
    } else {
      pushRoute(routes, 'figure_semantics');
    }
  }
  if (bootstrapDebt || nativeStructureDebt || annotationDebt) {
    pushRoute(routes, 'safe_cleanup');
  }

  if (routes.length === 0 && analysis.score < 95) {
    pushRoute(routes, 'safe_cleanup');
    pushSignal(signals, 'residual_score_below_target', true);
  }

  return {
    primaryRoute: routes[0] ?? null,
    secondaryRoutes: routes.slice(1),
    triggeringSignals: signals,
    residualFamilies: deriveResidualFamilies({
      analysis,
      snapshot,
      detection,
      nearPassFigureRecovery,
      postBootstrapHeadingConvergence,
      fontUnicodeTailRecovery,
      structureBootstrapAndConformance,
    }),
    deferredRoutes,
    semanticDeferred,
  };
}

export interface PlannerToolDecision {
  toolName: string;
  allowed: boolean;
  reason: PlanningSkipReason;
}

export function buildPlanningSummary(input: {
  routing: RoutingDecision;
  scheduledTools: PlannedRemediationTool[];
  skippedTools: Array<{ toolName: string; reason: PlanningSkipReason }>;
}): PlanningSummary {
  return {
    primaryRoute: input.routing.primaryRoute,
    secondaryRoutes: input.routing.secondaryRoutes,
    triggeringSignals: input.routing.triggeringSignals,
    residualFamilies: input.routing.residualFamilies,
    scheduledTools: input.scheduledTools.map(tool => tool.toolName),
    skippedTools: input.skippedTools,
    semanticDeferred: input.routing.semanticDeferred,
  };
}
