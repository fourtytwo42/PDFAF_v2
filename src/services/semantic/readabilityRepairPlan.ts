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
    'normalize_heading_hierarchy',
    'repair_structure_conformance',
  ],
  alt_text: [
    'normalize_nested_figure_containers',
    'canonicalize_figure_alt_ownership',
    'retag_as_figure',
    'set_figure_alt_text',
    'repair_alt_text_structure',
    'repair_annotation_alt_text',
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
    'normalize_pdfua_catalog_settings',
    'wrap_singleton_orphan_mcid',
    'remap_orphan_mcids_as_artifacts',
    'repair_top_level_parent_links',
    'repair_parent_tree_mcid_references',
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
  heading_structure: ['post_bootstrap_heading_convergence', 'native_structure_repair', 'structure_bootstrap_and_conformance'],
  alt_text: ['figure_semantics', 'near_pass_figure_recovery', 'annotation_link_normalization'],
  table_markup: ['native_structure_repair'],
  link_quality: ['annotation_link_normalization'],
  form_accessibility: ['document_navigation_forms'],
  text_extractability: ['font_ocr_repair', 'font_unicode_tail_recovery'],
  pdf_ua_compliance: ['structure_bootstrap', 'structure_bootstrap_and_conformance', 'safe_cleanup'],
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

function weakestCategoryAreas(analysis: AnalysisResult): ReadabilityReviewArea[] {
  return analysis.categories
    .filter(category => category.applicable && category.countsTowardGrade !== false && (category.score ?? 100) < 90)
    .sort((a, b) => (a.score ?? 100) - (b.score ?? 100))
    .map(category => category.key as ReadabilityReviewArea)
    .filter(area => area in AREA_TOOL_MAP)
    .slice(0, 3);
}

function hasConcreteEvidenceForArea(area: ReadabilityReviewArea, analysis: AnalysisResult, snapshot: DocumentSnapshot): boolean {
  switch (area) {
    case 'alt_text':
      return snapshot.figures.length > 0 || (categoryScore(analysis, 'alt_text') ?? 100) < 95;
    case 'heading_structure':
      return snapshot.headings.length > 0 || (snapshot.paragraphStructElems?.length ?? 0) > 0 || (categoryScore(analysis, 'heading_structure') ?? 100) < 95;
    case 'reading_order':
      return snapshot.structureTree !== null || (categoryScore(analysis, 'reading_order') ?? 100) < 95;
    case 'table_markup':
      return snapshot.tables.length > 0 || (categoryScore(analysis, 'table_markup') ?? 100) < 95;
    case 'link_quality':
      return snapshot.links.length > 0 || (categoryScore(analysis, 'link_quality') ?? 100) < 95;
    case 'form_accessibility':
      return snapshot.formFields.length + snapshot.formFieldsFromPdfjs.length > 0 || (categoryScore(analysis, 'form_accessibility') ?? 100) < 95;
    case 'text_extractability':
      return snapshot.textCharCount > 0 || (categoryScore(analysis, 'text_extractability') ?? 100) < 95;
    case 'pdf_ua_compliance':
      return snapshot.structureTree !== null || snapshot.isTagged || (categoryScore(analysis, 'pdf_ua_compliance') ?? 100) < 95;
    case 'title_language':
      return true;
    case 'bookmarks':
      return snapshot.pageCount >= 2;
    default:
      return false;
  }
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
  const mappedAreas: ReadabilityReviewArea[] = [];
  let findingsMapped = 0;
  let findingsUnmapped = 0;

  for (const finding of input.review.findings) {
    const area = areaFromFinding(finding);
    if (!area || !(area in AREA_TOOL_MAP)) {
      findingsUnmapped += 1;
      continue;
    }
    if (!hasConcreteEvidenceForArea(area, input.analysis, input.snapshot)) {
      findingsUnmapped += 1;
      continue;
    }
    mappedAreas.push(area);
    findingsMapped += 1;
  }

  const areas = unique(mappedAreas.length > 0 ? mappedAreas : weakestCategoryAreas(input.analysis));
  const deterministicToolNames = unique(areas.flatMap(area => [...(AREA_TOOL_MAP[area] ?? [])]));
  const preferredRoutes = unique(areas.flatMap(area => [...(AREA_ROUTE_MAP[area] ?? [])]));
  const semanticLanes = unique(areas.flatMap(area => [...(AREA_SEMANTIC_LANE_MAP[area] ?? [])]));
  const reasons = areas.map(area => `readability_${area}`);
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
