/**
 * Maps Adobe Acrobat Accessibility Checker rule anchors (href #fragments)
 * to PDFAF_v2 analysis fields, scorer categories, and remediation hooks.
 *
 * Parity levels:
 * - `full`    — same class of issue is modeled and we have deterministic repair path
 * - `partial` — detected or repaired in some cases; not equivalent to Acrobat’s engine
 * - `gap`     — not yet modeled / needs new analysis + tools
 */

export type AdobeParityLevel = 'full' | 'partial' | 'gap';

export interface AdobeRuleParity {
  anchor: string;
  adobeLabel: string;
  parity: AdobeParityLevel;
  /** Where we surface signal today (if any) */
  snapshotSignals: string[];
  scorerCategories: string[];
  remediationHints: string[];
  notes: string;
}

/** One row per Acrobat XI checker anchor seen in corpus HTML reports */
export const ADOBE_CHECKER_PARITY: AdobeRuleParity[] = [
  {
    anchor: 'TaggedCont',
    adobeLabel: 'Tagged content',
    parity: 'partial',
    snapshotSignals: ['taggedContentAudit.orphanMcidCount', 'taggedContentAudit.suspectedPathPaintOutsideMc', 'orphanMcids'],
    scorerCategories: ['pdf_ua_compliance', 'reading_order'],
    remediationHints: [
      'remap_orphan_mcids_as_artifacts',
      'wrap_singleton_orphan_mcid',
      'mark_untagged_content_as_artifact',
      'repair_structure_conformance',
    ],
    notes:
      'Heuristic proxy: orphan MCIDs outside StructTreeRoot + path paint outside marked-content (sampled). Not bit-for-bit Acrobat’s stream walk.',
  },
  {
    anchor: 'TaggedAnnots',
    adobeLabel: 'Tagged annotations',
    parity: 'partial',
    snapshotSignals: ['annotationAccessibility.linkAnnotationsMissingStructure', 'annotationAccessibility.nonLinkAnnotationsMissingStructure'],
    scorerCategories: ['pdf_ua_compliance', 'link_quality'],
    remediationHints: ['tag_unowned_annotations', 'repair_native_link_structure', 'repair_annotation_alt_text'],
    notes: 'We count structure association for visible annots; Acrobat may flag additional cases (OBJR ordering, etc.).',
  },
  {
    anchor: 'TabOrder',
    adobeLabel: 'Tab order',
    parity: 'partial',
    snapshotSignals: ['annotationAccessibility.pagesMissingTabsS', 'annotationAccessibility.pagesAnnotationOrderDiffers'],
    scorerCategories: ['reading_order'],
    remediationHints: ['normalize_annotation_tab_order'],
    notes: 'Heuristic tab order vs structure; not bit-for-bit Acrobat.',
  },
  {
    anchor: 'CharEnc',
    adobeLabel: 'Character encoding',
    parity: 'partial',
    snapshotSignals: ['fonts[].encodingRisk', 'fonts[].hasUnicode', 'fonts[].isEmbedded'],
    scorerCategories: ['text_extractability'],
    remediationHints: [
      'embed_fonts_ghostscript (Ghostscript: set PDFAF_EMBED_FONTS=1 or PDFAF_AUTO_EMBED_ENCODING=1 with gs on PATH)',
      'Re-export from source with embedded OpenType fonts',
    ],
    notes: 'Python flags encodingRisk (non-embedded and/or Type1/TrueType without ToUnicode). Ghostscript can embed/subset when enabled; some PDFs still need source re-export.',
  },
  {
    anchor: 'FigAltText',
    adobeLabel: 'Figures alternate text',
    parity: 'partial',
    snapshotSignals: ['figures[]', 'annotationAccessibility (figures)'],
    scorerCategories: ['alt_text'],
    remediationHints: ['set_figure_alt_text', 'mark_figure_decorative', 'repair_alt_text_structure', 'semantic figure passes'],
    notes: 'Structure-derived figures; large chart PDFs still need LLM or batch decorative classification.',
  },
  {
    anchor: 'NestedAltText',
    adobeLabel: 'Nested alternate text',
    parity: 'partial',
    snapshotSignals: [],
    scorerCategories: ['alt_text', 'pdf_ua_compliance'],
    remediationHints: ['repair_alt_text_structure', 'applyPostRemediationAltRepair'],
    notes: 'repair_alt_text_structure targets nested / empty-K alt patterns; extend with explicit nested-Figure detector in Python.',
  },
  {
    anchor: 'AltTextNoContent',
    adobeLabel: 'Associated with content',
    parity: 'partial',
    snapshotSignals: [],
    scorerCategories: ['alt_text'],
    remediationHints: ['repair_alt_text_structure', 'mark_figure_decorative'],
    notes: 'Acrobat flags /Alt not tied to painted content; align with Figure /K repair and artifact promotion.',
  },
  {
    anchor: 'AltTextNoContent',
    adobeLabel: 'Associated with content',
    parity: 'partial',
    snapshotSignals: [],
    scorerCategories: ['alt_text'],
    remediationHints: ['repair_alt_text_structure', 'mark_figure_decorative'],
    notes: 'Same repair pass as nested-alt family; needs stronger Figure / K linkage checks.',
  },
  {
    anchor: 'OtherAltText',
    adobeLabel: 'Other elements alternate text',
    parity: 'partial',
    snapshotSignals: ['annotationAccessibility.nonLinkAnnotationsMissingContents'],
    scorerCategories: ['alt_text'],
    remediationHints: ['repair_annotation_alt_text'],
    notes: 'Non-link annotation /Contents; widen subtype coverage if Acrobat still fails.',
  },
  {
    anchor: 'Bookmarks',
    adobeLabel: 'Bookmarks',
    parity: 'full',
    snapshotSignals: ['bookmarks[]', 'pageCount', 'headings[]'],
    scorerCategories: ['bookmarks'],
    remediationHints: ['replace_bookmarks_from_headings', 'add_page_outline_bookmarks'],
    notes: 'Long docs: outlines from tagged headings when present; otherwise flat Page N entries (OCR pipeline).',
  },
  {
    anchor: 'ListItems',
    adobeLabel: 'List items',
    parity: 'partial',
    snapshotSignals: ['listStructureAudit.listItemMisplacedCount'],
    scorerCategories: ['pdf_ua_compliance'],
    remediationHints: ['repair_list_li_wrong_parent'],
    notes:
      'Python counts /LI whose parent is not /L; deterministic wrap repair covers that pattern only.',
  },
  {
    anchor: 'LblLBody',
    adobeLabel: 'Lbl and LBody',
    parity: 'partial',
    snapshotSignals: ['listStructureAudit.lblBodyMisplacedCount'],
    scorerCategories: ['pdf_ua_compliance'],
    remediationHints: ['repair_list_li_wrong_parent'],
    notes:
      'Scoring counts misplaced /Lbl and /LBody; tree repair for those roles is not implemented in this iteration.',
  },
  {
    anchor: 'TableHeaders',
    adobeLabel: 'Tables should have headers',
    parity: 'partial',
    snapshotSignals: ['tables[].hasHeaders'],
    scorerCategories: ['table_markup'],
    remediationHints: ['set_table_header_cells', 'repair_native_table_headers'],
    notes: 'Requires table structure in tag tree; fails if tables are layout-only.',
  },
  {
    anchor: 'PrimeLang',
    adobeLabel: 'Primary language',
    parity: 'full',
    snapshotSignals: ['lang', 'metadata.language'],
    scorerCategories: ['title_language', 'pdf_ua_compliance'],
    remediationHints: ['set_document_language', 'set_pdfua_identification'],
    notes: '',
  },
  {
    anchor: 'DocTitle',
    adobeLabel: 'Title',
    parity: 'full',
    snapshotSignals: ['metadata.title', 'structTitle'],
    scorerCategories: ['title_language'],
    remediationHints: ['set_document_title'],
    notes: '',
  },
];

export function parityForAdobeAnchor(anchor: string): AdobeRuleParity | undefined {
  return ADOBE_CHECKER_PARITY.find(r => r.anchor === anchor);
}
