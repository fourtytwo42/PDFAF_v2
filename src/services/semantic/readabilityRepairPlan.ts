import type {
  AnalysisResult,
  CategoryKey,
  DocumentSnapshot,
  ReadabilityRepairPlanSummary,
  ReadabilityRepairSemanticLane,
  ReadabilityReviewArea,
  ReadabilityReviewFinding,
  ReadabilityReviewSummary,
  RemediationRoute,
} from '../../types.js';

const AREA_TOOL_MAP: Partial<Record<ReadabilityReviewArea, readonly string[]>> = {
  reading_order: [
    'repair_degenerate_native_reading_order_shell',
    'repair_native_reading_order',
    'synthesize_basic_structure_from_layout',
    'repair_structure_conformance',
    'artifact_repeating_page_furniture',
    'normalize_annotation_tab_order',
  ],
  heading_structure: [
    'create_heading_from_candidate',
    'create_heading_from_visible_text_anchor',
    'create_heading_from_tagged_visible_anchor',
    'bridge_native_title_text_owner',
    'create_structure_from_degenerate_native_anchor',
    'create_heading_from_ocr_page_shell_anchor',
    'create_heading_from_ocr_collection_title_anchor',
    'recover_ocr_text_ownership',
    'synthesize_basic_structure_from_layout',
    'normalize_heading_hierarchy',
    'repair_structure_conformance',
  ],
  alt_text: [
    'normalize_nested_figure_containers',
    'canonicalize_figure_alt_ownership',
    'repair_alt_text_structure',
    'repair_annotation_alt_text',
    'set_figure_alt_text',
    'retag_as_figure',
    'mark_figure_decorative',
  ],
  table_markup: [
    'normalize_table_structure',
    'repair_native_table_headers',
    'set_table_header_cells',
  ],
  link_quality: [
    'repair_native_link_structure',
    'tag_unowned_annotations',
    'set_link_annotation_contents',
    'normalize_annotation_tab_order',
  ],
  form_accessibility: [
    'fill_form_field_tooltips',
  ],
  text_extractability: [
    'substitute_legacy_fonts_in_place',
    'finalize_substituted_font_conformance',
    'ocr_scanned_pdf',
    'tag_ocr_text_blocks',
    'recover_ocr_text_ownership',
    'tag_native_text_blocks',
  ],
  pdf_ua_compliance: [
    'repair_structure_conformance',
    'repair_parent_tree_mcid_references',
    'repair_top_level_parent_links',
    'remap_orphan_mcids_as_artifacts',
  ],
  title_language: [
    'set_document_title',
    'set_document_language',
  ],
  bookmarks: [
    'replace_bookmarks_from_headings',
    'add_page_outline_bookmarks',
  ],
};

const AREA_ROUTE_MAP: Partial<Record<ReadabilityReviewArea, readonly RemediationRoute[]>> = {
  reading_order: ['native_structure_repair', 'structure_bootstrap_and_conformance', 'annotation_link_normalization'],
  heading_structure: ['post_bootstrap_heading_convergence', 'native_structure_repair', 'structure_bootstrap_and_conformance', 'font_ocr_repair'],
  alt_text: ['figure_semantics', 'near_pass_figure_recovery', 'annotation_link_normalization'],
  table_markup: ['native_structure_repair'],
  link_quality: ['annotation_link_normalization'],
  form_accessibility: ['document_navigation_forms'],
  text_extractability: ['font_ocr_repair', 'font_unicode_tail_recovery'],
  pdf_ua_compliance: ['structure_bootstrap', 'safe_cleanup'],
  title_language: ['metadata_first_commit', 'metadata_foundation'],
  bookmarks: ['document_navigation_forms'],
};

const AREA_SEMANTIC_LANE_MAP: Partial<Record<ReadabilityReviewArea, readonly ReadabilityRepairSemanticLane[]>> = {
  alt_text: ['figures'],
  heading_structure: ['promote_headings', 'headings', 'untagged_headings'],
};

function unique<T>(items: readonly T[]): T[] {
  return [...new Set(items)];
}

function categoryScore(analysis: AnalysisResult, key: CategoryKey): number | null {
  const category = analysis.categories.find(row => row.key === key);
  return category?.applicable === false ? null : category?.score ?? null;
}

function hasStrongHeadingSignals(snapshot: DocumentSnapshot): boolean {
  return (
    (snapshot.paragraphStructElems?.length ?? 0) > 0
    || (snapshot.ocrTitleMcidCandidates?.length ?? 0) > 0
    || (snapshot.nativeTitleBtCandidates?.length ?? 0) > 0
    || (snapshot.detectionProfile?.headingSignals?.layoutHeadingCandidateCount ?? 0) > 0
    || (snapshot.detectionProfile?.headingSignals?.extractedHeadingCount ?? 0) > 0
    || (snapshot.detectionProfile?.headingSignals?.treeHeadingCount ?? 0) > 0
  );
}

function needsHeadingDebtRecovery(snapshot: DocumentSnapshot): boolean {
  return (
    (snapshot.detectionProfile?.headingSignals?.headingTreeDepth ?? 0) <= 1
    || (snapshot.detectionProfile?.headingSignals?.extractedHeadingsMissingFromTree === true)
    || (snapshot.detectionProfile?.headingSignals?.treeHeadingCount ?? 0) === 0
    || snapshot.headings.length === 0
    || ((snapshot.textByPage[0]?.trim().length ?? 0) > 0 && snapshot.headings.length === 0)
  );
}

function isLikelyListOrTableTag(tag: string | undefined): boolean {
  const normalized = (tag ?? '').toUpperCase().trim();
  return ['LI', 'L', 'L2', 'LBODY', 'LBL', 'TABLE', 'TR', 'TH', 'TD'].includes(normalized);
}

function firstPageSafeParagraphCandidate(snapshot: DocumentSnapshot): boolean {
  const firstPage = 0;
  const paragraphs = snapshot.paragraphStructElems ?? [];
  if (paragraphs.length === 0) return false;
  for (const paragraph of paragraphs) {
    if (paragraph.page !== firstPage) continue;
    const text = (paragraph.text ?? '').trim();
    if (!text || text.length < 4) continue;
    if (isLikelyListOrTableTag(paragraph.tag)) continue;
    if (paragraph.structRef && paragraph.structRef.toLowerCase().startsWith('none')) continue;
    return true;
  }
  return false;
}

function paragraphLikeTextFromSnapshot(snapshot: DocumentSnapshot): boolean {
  return (snapshot.paragraphStructElems?.length ?? 0) >= 1;
}

function weakReadableHeadingTextExists(snapshot: DocumentSnapshot): boolean {
  const firstPageText = (snapshot.textByPage[0]?.trim().length ?? 0) > 0;
  return firstPageText && ((snapshot.paragraphStructElems?.length ?? 0) > 0 || (snapshot.ocrTitleMcidCandidates?.length ?? 0) > 0);
}

function hasReusableHeadingFallbackSeed(snapshot: DocumentSnapshot): boolean {
  return firstPageSafeParagraphCandidate(snapshot)
    || (snapshot.ocrTitleMcidCandidates?.length ?? 0) > 0
    || (snapshot.nativeTitleBtCandidates?.length ?? 0) > 0
    || firstPageSafeTextLine(snapshot.textByPage[0] ?? '');
}

function firstPageSafeTextLine(value: string): boolean {
  const text = (value ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return false;
  if (/^\s*page\s+\d+\s*$/i.test(text)) return false;
  if (/^[^a-zA-Z0-9]{2,}$/.test(text)) return false;
  return text.length >= 4;
}

function figureNeedsOwnershipRepair(snapshot: DocumentSnapshot): boolean {
  const figureSignals = snapshot.detectionProfile?.figureSignals;
  if (!figureSignals) {
    return snapshot.figures.some(figure => !figure.isArtifact);
  }
  return (
    (figureSignals?.treeFigureMissingForExtractedFigures ?? false)
    || (figureSignals?.nonFigureRoleCount ?? 0) > 0
    || (figureSignals.extractedFigureCount > 0 && figureSignals.treeFigureCount < figureSignals.extractedFigureCount)
  );
}

function officeRoleFigureOwnershipCandidates(snapshot: DocumentSnapshot): boolean {
  const officeRoles = new Set(['inlineshape', 'shape']);
  return snapshot.figures.some(figure => {
    const rawRole = (figure.rawRole ?? '').replace(/^\//, '').toLowerCase();
    const resolvedRole = (figure.role ?? '').replace(/^\//, '').toLowerCase();
    return (
      officeRoles.has(rawRole)
      && resolvedRole !== 'figure'
      && !figure.isArtifact
      && figure.reachable === true
      && typeof figure.structRef === 'string'
      && figure.structRef.length > 0
      && (figure.directContent === true || (figure.subtreeMcidCount ?? 0) > 0)
    );
  });
}

function hasCheckerFigureMissingAlt(snapshot: DocumentSnapshot): boolean {
  return (snapshot.checkerFigureTargets ?? []).some(target =>
    target.reachable === true && !target.isArtifact && !target.hasAlt,
  );
}

function hasCheckerFigureTargets(snapshot: DocumentSnapshot): boolean {
  return (snapshot.checkerFigureTargets ?? []).some(target =>
    target.reachable === true && !target.isArtifact,
  );
}

function hasMissingFigureAltCandidates(snapshot: DocumentSnapshot): boolean {
  return snapshot.figures.some(figure => !figure.isArtifact && !figure.hasAlt) || hasCheckerFigureMissingAlt(snapshot);
}

function hasDecorativeFigureEvidence(snapshot: DocumentSnapshot): boolean {
  const pathPaint = Math.max(
    snapshot.taggedContentAudit?.suspectedPathPaintOutsideMc ?? 0,
    snapshot.detectionProfile?.pdfUaSignals?.suspectedPathPaintOutsideMc ?? 0,
    snapshot.contentTaggingAudit?.pathOutsideMarkedContentOrArtifact ?? 0,
  );
  const hasRoleCandidates = snapshot.figures.some((figure) => {
    const role = (figure.role ?? '').toLowerCase().replace(/^\//, '');
    return figure.isArtifact && (role === 'artifact' || role === 'path' || role === 'figure');
  });
  if (!hasRoleCandidates) return false;
  return pathPaint > 0;
}

function checkerFigureTargetsAreDecorative(snapshot: DocumentSnapshot): boolean {
  return (snapshot.checkerFigureTargets ?? []).some(target =>
    !target.isArtifact
    && target.reachable === true
    && !target.hasAlt
    && (target.subtreeMcids?.length ?? 0) === 0,
  );
}

function linkQualityFixCandidate(snapshot: DocumentSnapshot): boolean {
  const hasAnnotationSignals =
    (snapshot.detectionProfile?.annotationSignals.pagesMissingTabsS ?? 0) > 0
    || (snapshot.detectionProfile?.annotationSignals.pagesAnnotationOrderDiffers ?? 0) > 0
    || (snapshot.detectionProfile?.annotationSignals.linkAnnotationsMissingStructure ?? 0) > 0
    || (snapshot.detectionProfile?.annotationSignals.nonLinkAnnotationsMissingStructure ?? 0) > 0
    || (snapshot.detectionProfile?.annotationSignals.linkAnnotationsMissingStructParent ?? 0) > 0
    || (snapshot.detectionProfile?.annotationSignals.nonLinkAnnotationsMissingStructParent ?? 0) > 0
    || (snapshot.annotationAccessibility?.nonLinkAnnotationsMissingContents ?? 0) > 0;
  if (hasAnnotationSignals) return true;

  return (snapshot.links.length > 0)
    && snapshot.links.some(link => !link.text || link.text.trim().length < 5 || /^(click|learn more|more|here|read more|click here)$/i.test(link.text.trim()));
}

function pdfUaRepairEvidence(snapshot: DocumentSnapshot): boolean {
  const orphanMcids = snapshot.parentTreeAudit?.missingMcidParentTreeEntries ?? 0;
  const invalidParentRefs = snapshot.parentTreeAudit?.invalidParentTreeEntries ?? 0;
  const missingTaggedMcids = snapshot.taggedContentAudit?.orphanMcidCount ?? 0;
  const parentTreeRefMismatch = snapshot.parentTreeAudit?.annotationReferenceMismatchCount ?? 0;
  const topLevelParentDebt = snapshot.parentTreeAudit?.missingParentTree ?? false;

  return (
    orphanMcids > 0
    || invalidParentRefs > 0
    || missingTaggedMcids > 0
    || parentTreeRefMismatch > 0
    || topLevelParentDebt
  );
}

function hasConcreteEvidenceForArea(area: ReadabilityReviewArea, analysis: AnalysisResult, snapshot: DocumentSnapshot): boolean {
  switch (area) {
    case 'alt_text':
      return altOwnershipCandidateExists(snapshot)
        || (categoryScore(analysis, 'alt_text') ?? 100) < 95
        || hasMissingFigureAltCandidates(snapshot)
        || hasCheckerFigureTargets(snapshot);
    case 'heading_structure':
      return needsHeadingDebtRecovery(snapshot)
        || weakReadableHeadingTextExists(snapshot)
        || (categoryScore(analysis, 'heading_structure') ?? 100) < 90
        || hasStrongHeadingSignals(snapshot);
    case 'reading_order':
      return snapshot.structureTree !== null
        || (categoryScore(analysis, 'reading_order') ?? 100) < 95
        || (snapshot.detectionProfile?.readingOrderSignals?.missingStructureTree === true);
    case 'table_markup':
      return snapshot.tables.length > 0
        || (categoryScore(analysis, 'table_markup') ?? 100) < 95
        || (snapshot.detectionProfile?.tableSignals?.irregularTableCount ?? 0) > 0
        || (snapshot.detectionProfile?.tableSignals?.stronglyIrregularTableCount ?? 0) > 0;
    case 'link_quality':
      return linkQualityFixCandidate(snapshot)
        || (categoryScore(analysis, 'link_quality') ?? 100) < 95
        || (snapshot.annotationAccessibility?.nonLinkAnnotationsMissingContents ?? 0) > 0;
    case 'form_accessibility':
      return snapshot.formFields.length + snapshot.formFieldsFromPdfjs.length > 0 || (categoryScore(analysis, 'form_accessibility') ?? 100) < 95;
    case 'text_extractability':
      return snapshot.textCharCount > 0 || (categoryScore(analysis, 'text_extractability') ?? 100) < 95;
    case 'pdf_ua_compliance':
      return pdfUaRepairEvidence(snapshot) && (categoryScore(analysis, 'pdf_ua_compliance') ?? 100) < 95;
    case 'title_language':
      return true;
    case 'bookmarks':
      return snapshot.pageCount >= 2;
    default:
      return false;
  }
}

function altOwnershipCandidateExists(snapshot: DocumentSnapshot): boolean {
  return (
    figureNeedsOwnershipRepair(snapshot)
    || officeRoleFigureOwnershipCandidates(snapshot)
    || (snapshot.checkerFigureTargets?.length ?? 0) > 0
    || (snapshot.acrobatStyleAltRisks?.nonFigureWithAltCount ?? 0) > 0
  );
}

function filterToolsForHeadingArea(analysis: AnalysisResult, snapshot: DocumentSnapshot): string[] {
  const score = categoryScore(analysis, 'heading_structure') ?? 100;
  const needsEvidence = needsHeadingDebtRecovery(snapshot)
    || hasStrongHeadingSignals(snapshot)
    || weakReadableHeadingTextExists(snapshot)
    || hasReusableHeadingFallbackSeed(snapshot);

  if (!needsEvidence) return [];

  const hasExistingHeadingTree = (snapshot.detectionProfile?.headingSignals?.treeHeadingCount ?? snapshot.headings.length) > 0;
  const hasH1 = snapshot.headings.some(heading => heading.level === 1);
  const noH1HeadingPromotion = hasExistingHeadingTree && !hasH1;

  if (noH1HeadingPromotion) {
    return unique([
      ...(hasReusableHeadingFallbackSeed(snapshot) ? ['create_heading_from_candidate'] : []),
      'normalize_heading_hierarchy',
      'repair_structure_conformance',
    ]);
  }

  const tools = [...(AREA_TOOL_MAP.heading_structure ?? [])];
  const needsH1Recovery = score < 70 && hasReusableHeadingFallbackSeed(snapshot);

  if (needsH1Recovery) {
    return unique(tools.concat([
      'synthesize_basic_structure_from_layout',
      'create_heading_from_candidate',
      'create_heading_from_ocr_page_shell_anchor',
      'create_heading_from_ocr_collection_title_anchor',
      'create_heading_from_visible_text_anchor',
      'create_heading_from_tagged_visible_anchor',
      'bridge_native_title_text_owner',
      'recover_ocr_text_ownership',
      'normalize_heading_hierarchy',
      'repair_structure_conformance',
    ]));
  }

  return tools;
}

function filterToolsForAltArea(snapshot: DocumentSnapshot): string[] {
  const needsOwnershipRepair = altOwnershipCandidateExists(snapshot) || officeRoleFigureOwnershipCandidates(snapshot);
  const needsMissingAlt = hasMissingFigureAltCandidates(snapshot);
  const needsCheckerAlt = hasCheckerFigureTargets(snapshot);

  if (!needsOwnershipRepair && !needsMissingAlt && !needsCheckerAlt) return [];

  const tools: string[] = [];

  if (needsOwnershipRepair || needsCheckerAlt) {
    tools.push('normalize_nested_figure_containers');
    tools.push('canonicalize_figure_alt_ownership');
    tools.push('retag_as_figure');
    if (hasCheckerFigureMissingAlt(snapshot) || hasCheckerFigureTargets(snapshot) || needsOwnershipRepair) {
      tools.push('repair_alt_text_structure');
    }
    if (checkerFigureTargetsAreDecorative(snapshot)) {
      tools.push('repair_annotation_alt_text');
    }
  }

  if (needsMissingAlt) {
    tools.push('set_figure_alt_text');
    tools.push('repair_annotation_alt_text');
  }

  if (hasDecorativeFigureEvidence(snapshot)) {
    tools.push('mark_figure_decorative');
  }

  if (needsMissingAlt && !needsOwnershipRepair && !needsCheckerAlt) {
    tools.push('repair_alt_text_structure');
  }

  return unique(tools);
}

function filterToolsForLinkQualityArea(snapshot: DocumentSnapshot): string[] {
  const tools = [...(AREA_TOOL_MAP.link_quality ?? [])];
  if (!linkQualityFixCandidate(snapshot)) return [];
  if (snapshot.links.length === 0) {
    const hasAnnotationDebt =
      (snapshot.annotationAccessibility?.pagesMissingTabsS ?? 0) > 0
      || (snapshot.annotationAccessibility?.pagesAnnotationOrderDiffers ?? 0) > 0
      || (snapshot.annotationAccessibility?.linkAnnotationsMissingStructure ?? 0) > 0
      || (snapshot.annotationAccessibility?.nonLinkAnnotationsMissingStructure ?? 0) > 0
      || (snapshot.annotationAccessibility?.linkAnnotationsMissingStructParent ?? 0) > 0
      || (snapshot.annotationAccessibility?.nonLinkAnnotationsMissingStructParent ?? 0) > 0
      || (snapshot.annotationAccessibility?.nonLinkAnnotationsMissingContents ?? 0) > 0;
    if (hasAnnotationDebt) return tools;
    return ['repair_native_link_structure'];
  }
  return tools;
}

function filterToolsForPdfUaArea(snapshot: DocumentSnapshot): string[] {
  if (!pdfUaRepairEvidence(snapshot)) return [];
  return [...(AREA_TOOL_MAP.pdf_ua_compliance ?? [])];
}

function filterToolsForArea(area: ReadabilityReviewArea, analysis: AnalysisResult, snapshot: DocumentSnapshot): string[] {
  if (!hasConcreteEvidenceForArea(area, analysis, snapshot)) {
    return [];
  }
  switch (area) {
    case 'heading_structure':
      return filterToolsForHeadingArea(analysis, snapshot);
    case 'alt_text':
      return filterToolsForAltArea(snapshot);
    case 'link_quality':
      return filterToolsForLinkQualityArea(snapshot);
    case 'pdf_ua_compliance':
      return filterToolsForPdfUaArea(snapshot);
    default:
      return [...(AREA_TOOL_MAP[area] ?? [])];
  }
}

function deterministicToolsForAreas(areas: ReadabilityReviewArea[], analysis: AnalysisResult, snapshot: DocumentSnapshot): string[] {
  const mappedTools = areas.flatMap(area => filterToolsForArea(area, analysis, snapshot));
  const filtered = mappedTools.filter((tool, index) => mappedTools.indexOf(tool) === index);

  const removeUnusedRouteTool = (toolName: string): boolean => {
    if (toolName === 'repair_parent_tree_mcid_references' || toolName === 'repair_top_level_parent_links') {
      return !pdfUaRepairEvidence(snapshot);
    }
    return false;
  };

  return filtered.filter(toolName => !removeUnusedRouteTool(toolName));
}

function preferredRoutesForAreas(areas: ReadabilityReviewArea[], analysis: AnalysisResult, snapshot: DocumentSnapshot): RemediationRoute[] {
  const directRoutes = unique(areas.flatMap(area => [...(AREA_ROUTE_MAP[area] ?? [])]));

  if (!directRoutes.includes('native_structure_repair') && directRoutes.includes('post_bootstrap_heading_convergence')) {
    const withoutNativeStructure = directRoutes.filter(route => route !== 'native_structure_repair');
    directRoutes.length = 0;
    withoutNativeStructure.forEach(route => directRoutes.push(route));
  }

  if (areas.includes('heading_structure') && paragraphLikeTextFromSnapshot(snapshot) && !directRoutes.includes('font_ocr_repair') && needsHeadingDebtRecovery(snapshot)) {
    directRoutes.push('font_ocr_repair');
  }

  if (areas.includes('text_extractability') && !directRoutes.includes('font_ocr_repair')) {
    directRoutes.push('font_ocr_repair');
  }

  if (areas.includes('alt_text') && categoryScore(analysis, 'alt_text') !== null && categoryScore(analysis, 'alt_text')! < 95) {
    if (!directRoutes.includes('figure_semantics')) directRoutes.push('figure_semantics');
    if (!directRoutes.includes('annotation_link_normalization')) directRoutes.push('near_pass_figure_recovery');
  }

  return directRoutes.filter((route, index, all) => all.indexOf(route) === index);
}

function weakestCategoryAreas(analysis: AnalysisResult): ReadabilityReviewArea[] {
  return analysis.categories
    .filter(category => category.applicable && category.countsTowardGrade !== false && (category.score ?? 100) < 90)
    .sort((a, b) => (a.score ?? 100) - (b.score ?? 100))
    .map(category => category.key as ReadabilityReviewArea)
    .filter(area => (AREA_TOOL_MAP[area]?.length ?? 0) > 0)
    .slice(0, 3);
}

function areaReasonFor(area: ReadabilityReviewArea): string {
  return 'readability_plan:' + area;
}

function areaFromFinding(finding: ReadabilityReviewFinding): ReadabilityReviewArea | null {
  if (finding.area === 'overall' || finding.area === 'assistive_technology') return null;
  return finding.area;
}

export function buildReadabilityRepairPlan(input: {
  review: ReadabilityReviewSummary;
  analysis: AnalysisResult;
  snapshot: DocumentSnapshot;
}): ReadabilityRepairPlanSummary {
  if (input.review.status === 'passed' && input.review.findings.length === 0) {
    return {
      areas: [],
      deterministicToolNames: [],
      preferredRoutes: [],
      semanticLanes: [],
      reasons: [],
      findingsMapped: 0,
      findingsUnmapped: 0,
      manualReviewOnly: true,
    };
  }

  const mappedAreas: ReadabilityReviewArea[] = [];
  let findingsMapped = 0;
  let findingsUnmapped = 0;

  for (const finding of input.review.findings) {
    const area = areaFromFinding(finding);
    if (!area || !(area in AREA_TOOL_MAP)) {
      findingsUnmapped += 1;
      continue;
    }
    if (!hasConcreteEvidenceForArea(area, input.analysis, input.snapshot) || filterToolsForArea(area, input.analysis, input.snapshot).length === 0) {
      findingsUnmapped += 1;
      continue;
    }
    mappedAreas.push(area);
    findingsMapped += 1;
  }

  const areas = unique(mappedAreas.length > 0 ? mappedAreas : weakestCategoryAreas(input.analysis));
  const linkQualityScore = categoryScore(input.analysis, 'link_quality');
  if (areas.includes('alt_text') && linkQualityScore !== null && linkQualityScore < 95 && !areas.includes('link_quality')) {
    areas.push('link_quality');
  }
  const deterministicToolNames = deterministicToolsForAreas(areas, input.analysis, input.snapshot);
  const preferredRoutes = preferredRoutesForAreas(areas, input.analysis, input.snapshot);
  const semanticLanes = unique(areas.flatMap(area => [...(AREA_SEMANTIC_LANE_MAP[area] ?? [])]));
  const reasons = areas.map(area => areaReasonFor(area));
  const manualReviewOnly = deterministicToolNames.length === 0 && semanticLanes.length === 0;

  return {
    areas,
    deterministicToolNames,
    preferredRoutes,
    semanticLanes,
    reasons,
    findingsMapped,
    findingsUnmapped,
    manualReviewOnly,
  };
}
