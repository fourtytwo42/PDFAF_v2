import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { initSchema } from '../../src/db/schema.js';
import { createPlaybookStore } from '../../src/services/learning/playbookStore.js';
import { buildFailureSignature } from '../../src/services/learning/failureSignature.js';
import type { AnalysisResult, AppliedRemediationTool, DocumentSnapshot } from '../../src/types.js';

const META = { id: 'p', filename: 'bare.pdf', timestamp: new Date().toISOString(), analysisDurationMs: 1 };

function minimalAnalysis(): AnalysisResult {
  return {
    ...META,
    pageCount: 2,
    pdfClass: 'native_untagged',
    score: 40,
    grade: 'F',
    findings: [],
    categories: [
      { key: 'title_language', applicable: true, score: 50, severity: 'moderate', rationale: '' },
    ],
  } as AnalysisResult;
}

function minimalSnapshot(): DocumentSnapshot {
  return {
    pageCount: 2,
    textByPage: ['x'],
    textCharCount: 1,
    imageOnlyPageCount: 0,
    metadata: {},
    links: [],
    formFieldsFromPdfjs: [],
    isTagged: false,
    markInfo: null,
    lang: null,
    pdfUaVersion: null,
    headings: [],
    figures: [],
    tables: [],
    fonts: [],
    bookmarks: [],
    formFields: [],
    structureTree: null,
    pdfClass: 'native_untagged',
    imageToTextRatio: 0,
  } as DocumentSnapshot;
}

function appliedTitle(): AppliedRemediationTool[] {
  return [
    {
      toolName: 'set_document_title',
      stage: 1,
      round: 1,
      scoreBefore: 40,
      scoreAfter: 45,
      delta: 5,
      outcome: 'applied',
    },
  ];
}

function appliedNativeReadingOrder(): AppliedRemediationTool[] {
  return [
    {
      toolName: 'repair_native_reading_order',
      stage: 3,
      round: 1,
      scoreBefore: 40,
      scoreAfter: 52,
      delta: 12,
      outcome: 'applied',
    },
  ];
}


function appliedStructureFollowup(): AppliedRemediationTool[] {
  return [
    {
      toolName: 'create_heading_from_candidate',
      stage: 2,
      round: 1,
      scoreBefore: 40,
      scoreAfter: 55,
      delta: 15,
      outcome: 'applied',
    },
    {
      toolName: 'mark_untagged_content_as_artifact',
      stage: 4,
      round: 1,
      scoreBefore: 55,
      scoreAfter: 84,
      delta: 29,
      outcome: 'applied',
    },
    {
      toolName: 'repair_top_level_parent_links',
      stage: 5,
      round: 1,
      scoreBefore: 84,
      scoreAfter: 96,
      delta: 12,
      outcome: 'applied',
    },
  ];
}


function appliedAccessibilityTagging(): AppliedRemediationTool[] {
  return [
    {
      toolName: 'set_pdfua_identification',
      stage: 1,
      round: 1,
      scoreBefore: 39,
      scoreAfter: 44,
      delta: 5,
      outcome: 'applied',
    },
    {
      toolName: 'ensure_accessibility_tagging',
      stage: 2,
      round: 1,
      scoreBefore: 44,
      scoreAfter: 45,
      delta: 1,
      outcome: 'applied',
    },
    {
      toolName: 'set_document_title',
      stage: 1,
      round: 1,
      scoreBefore: 45,
      scoreAfter: 52,
      delta: 7,
      outcome: 'applied',
    },
  ];
}


function appliedLinkAnnotationContents(): AppliedRemediationTool[] {
  return [
    {
      toolName: 'set_document_language',
      stage: 1,
      round: 1,
      scoreBefore: 37,
      scoreAfter: 48,
      delta: 11,
      outcome: 'applied',
    },
    {
      toolName: 'set_document_title',
      stage: 1,
      round: 1,
      scoreBefore: 48,
      scoreAfter: 48,
      delta: 0,
      outcome: 'applied',
    },
    {
      toolName: 'set_link_annotation_contents',
      stage: 2,
      round: 1,
      scoreBefore: 48,
      scoreAfter: 48,
      delta: 0,
      outcome: 'applied',
    },
    {
      toolName: 'set_pdfua_identification',
      stage: 1,
      round: 1,
      scoreBefore: 48,
      scoreAfter: 48,
      delta: 0,
      outcome: 'applied',
    },
  ];
}


function appliedAnnotationTabOrder(): AppliedRemediationTool[] {
  return [
    {
      toolName: 'set_document_language',
      stage: 1,
      round: 1,
      scoreBefore: 43,
      scoreAfter: 51,
      delta: 8,
      outcome: 'applied',
    },
    {
      toolName: 'set_document_title',
      stage: 1,
      round: 1,
      scoreBefore: 51,
      scoreAfter: 51,
      delta: 0,
      outcome: 'applied',
    },
    {
      toolName: 'create_heading_from_candidate',
      stage: 4,
      round: 1,
      scoreBefore: 51,
      scoreAfter: 92,
      delta: 41,
      outcome: 'applied',
    },
    {
      toolName: 'normalize_annotation_tab_order',
      stage: 5,
      round: 1,
      scoreBefore: 92,
      scoreAfter: 92,
      delta: 0,
      outcome: 'applied',
    },
    {
      toolName: 'repair_native_reading_order',
      stage: 5,
      round: 1,
      scoreBefore: 92,
      scoreAfter: 92,
      delta: 0,
      outcome: 'applied',
    },
    {
      toolName: 'mark_untagged_content_as_artifact',
      stage: 4,
      round: 1,
      scoreBefore: 92,
      scoreAfter: 92,
      delta: 0,
      outcome: 'applied',
    },
    {
      toolName: 'repair_top_level_parent_links',
      stage: 5,
      round: 1,
      scoreBefore: 92,
      scoreAfter: 96,
      delta: 4,
      outcome: 'applied',
    },
  ];
}


function appliedPdfuaCatalogNormalization(): AppliedRemediationTool[] {
  return [
    {
      toolName: 'normalize_pdfua_catalog_settings',
      stage: 1,
      round: 1,
      scoreBefore: 62,
      scoreAfter: 67,
      delta: 5,
      outcome: 'applied',
    },
    {
      toolName: 'set_document_language',
      stage: 1,
      round: 1,
      scoreBefore: 67,
      scoreAfter: 67,
      delta: 0,
      outcome: 'applied',
    },
    {
      toolName: 'set_document_title',
      stage: 1,
      round: 1,
      scoreBefore: 67,
      scoreAfter: 67,
      delta: 0,
      outcome: 'applied',
    },
    {
      toolName: 'bootstrap_struct_tree',
      stage: 2,
      round: 1,
      scoreBefore: 67,
      scoreAfter: 69,
      delta: 2,
      outcome: 'applied',
    },
    {
      toolName: 'synthesize_basic_structure_from_layout',
      stage: 2,
      round: 1,
      scoreBefore: 69,
      scoreAfter: 69,
      delta: 0,
      outcome: 'applied',
    },
    {
      toolName: 'normalize_annotation_tab_order',
      stage: 5,
      round: 1,
      scoreBefore: 69,
      scoreAfter: 79,
      delta: 10,
      outcome: 'applied',
    },
    {
      toolName: 'repair_native_reading_order',
      stage: 5,
      round: 1,
      scoreBefore: 79,
      scoreAfter: 79,
      delta: 0,
      outcome: 'applied',
    },
    {
      toolName: 'set_pdfua_identification',
      stage: 1,
      round: 1,
      scoreBefore: 79,
      scoreAfter: 79,
      delta: 0,
      outcome: 'applied',
    },
  ];
}


function appliedAltTextStructureRepair(): AppliedRemediationTool[] {
  return [
    {
      toolName: 'set_document_language',
      stage: 1,
      round: 1,
      scoreBefore: 28,
      scoreAfter: 41,
      delta: 13,
      outcome: 'applied',
    },
    {
      toolName: 'set_document_title',
      stage: 1,
      round: 1,
      scoreBefore: 41,
      scoreAfter: 41,
      delta: 0,
      outcome: 'applied',
    },
    {
      toolName: 'bootstrap_struct_tree',
      stage: 2,
      round: 1,
      scoreBefore: 41,
      scoreAfter: 83,
      delta: 42,
      outcome: 'applied',
    },
    {
      toolName: 'synthesize_basic_structure_from_layout',
      stage: 2,
      round: 1,
      scoreBefore: 83,
      scoreAfter: 83,
      delta: 0,
      outcome: 'applied',
    },
    {
      toolName: 'repair_alt_text_structure',
      stage: 3,
      round: 1,
      scoreBefore: 83,
      scoreAfter: 93,
      delta: 10,
      outcome: 'applied',
    },
    {
      toolName: 'set_pdfua_identification',
      stage: 1,
      round: 1,
      scoreBefore: 93,
      scoreAfter: 93,
      delta: 0,
      outcome: 'applied',
    },
    {
      toolName: 'post_pass_bookmarks',
      stage: 6,
      round: 1,
      scoreBefore: 93,
      scoreAfter: 93,
      delta: 0,
      outcome: 'applied',
    },
  ];
}


function appliedFormTooltipPath(): AppliedRemediationTool[] {
  return [
    {
      toolName: 'set_document_language',
      stage: 1,
      round: 1,
      scoreBefore: 41,
      scoreAfter: 45,
      delta: 4,
      outcome: 'applied',
    },
    {
      toolName: 'set_document_title',
      stage: 1,
      round: 1,
      scoreBefore: 45,
      scoreAfter: 45,
      delta: 0,
      outcome: 'applied',
    },
    {
      toolName: 'normalize_annotation_tab_order',
      stage: 5,
      round: 1,
      scoreBefore: 45,
      scoreAfter: 49,
      delta: 4,
      outcome: 'applied',
    },
    {
      toolName: 'fill_form_field_tooltips',
      stage: 6,
      round: 1,
      scoreBefore: 49,
      scoreAfter: 53,
      delta: 4,
      outcome: 'applied',
    },
    {
      toolName: 'set_pdfua_identification',
      stage: 1,
      round: 1,
      scoreBefore: 53,
      scoreAfter: 59,
      delta: 6,
      outcome: 'applied',
    },
  ];
}


function appliedListStructureRepair(): AppliedRemediationTool[] {
  return [
    {
      toolName: 'set_document_language',
      stage: 1,
      round: 1,
      scoreBefore: 58,
      scoreAfter: 59,
      delta: 1,
      outcome: 'applied',
    },
    {
      toolName: 'set_document_title',
      stage: 1,
      round: 1,
      scoreBefore: 59,
      scoreAfter: 59,
      delta: 0,
      outcome: 'applied',
    },
    {
      toolName: 'normalize_annotation_tab_order',
      stage: 5,
      round: 1,
      scoreBefore: 59,
      scoreAfter: 59,
      delta: 0,
      outcome: 'applied',
    },
    {
      toolName: 'repair_list_li_wrong_parent',
      stage: 4,
      round: 1,
      scoreBefore: 59,
      scoreAfter: 59,
      delta: 0,
      outcome: 'applied',
    },
    {
      toolName: 'repair_alt_text_structure',
      stage: 3,
      round: 1,
      scoreBefore: 59,
      scoreAfter: 92,
      delta: 33,
      outcome: 'applied',
    },
    {
      toolName: 'set_pdfua_identification',
      stage: 1,
      round: 1,
      scoreBefore: 92,
      scoreAfter: 92,
      delta: 0,
      outcome: 'applied',
    },
  ];
}


function appliedFigureAltPath(): AppliedRemediationTool[] {
  return [
    {
      toolName: 'set_document_language',
      stage: 1,
      round: 1,
      scoreBefore: 59,
      scoreAfter: 59,
      delta: 0,
      outcome: 'applied',
    },
    {
      toolName: 'set_document_title',
      stage: 1,
      round: 1,
      scoreBefore: 59,
      scoreAfter: 59,
      delta: 0,
      outcome: 'applied',
    },
    {
      toolName: 'normalize_annotation_tab_order',
      stage: 5,
      round: 1,
      scoreBefore: 59,
      scoreAfter: 59,
      delta: 0,
      outcome: 'applied',
    },
    {
      toolName: 'normalize_heading_hierarchy',
      stage: 4,
      round: 1,
      scoreBefore: 59,
      scoreAfter: 59,
      delta: 0,
      outcome: 'applied',
    },
    {
      toolName: 'set_figure_alt_text',
      stage: 6,
      round: 1,
      scoreBefore: 59,
      scoreAfter: 59,
      delta: 0,
      outcome: 'applied',
    },
    {
      toolName: 'set_pdfua_identification',
      stage: 1,
      round: 1,
      scoreBefore: 59,
      scoreAfter: 59,
      delta: 0,
      outcome: 'applied',
    },
  ];
}


function appliedDegenerateNativeAnchorStructurePath(): AppliedRemediationTool[] {
  return [
    {
      toolName: 'set_document_language',
      stage: 1,
      round: 1,
      scoreBefore: 47,
      scoreAfter: 79,
      delta: 32,
      outcome: 'applied',
    },
    {
      toolName: 'bootstrap_struct_tree',
      stage: 2,
      round: 1,
      scoreBefore: 47,
      scoreAfter: 79,
      delta: 32,
      outcome: 'applied',
    },
    {
      toolName: 'create_structure_from_degenerate_native_anchor',
      stage: 2,
      round: 1,
      scoreBefore: 47,
      scoreAfter: 79,
      delta: 32,
      outcome: 'applied',
    },
    {
      toolName: 'remap_orphan_mcids_as_artifacts',
      stage: 2,
      round: 1,
      scoreBefore: 47,
      scoreAfter: 79,
      delta: 32,
      outcome: 'applied',
    },
    {
      toolName: 'repair_native_reading_order',
      stage: 4,
      round: 1,
      scoreBefore: 47,
      scoreAfter: 79,
      delta: 0,
      outcome: 'applied',
    },
    {
      toolName: 'mark_untagged_content_as_artifact',
      stage: 9,
      round: 1,
      scoreBefore: 47,
      scoreAfter: 79,
      delta: 0,
      outcome: 'applied',
    },
    {
      toolName: 'set_pdfua_identification',
      stage: 10,
      round: 1,
      scoreBefore: 47,
      scoreAfter: 79,
      delta: 0,
      outcome: 'applied',
    },
    {
      toolName: 'post_pass_bookmarks',
      stage: 11,
      round: 1,
      scoreBefore: 47,
      scoreAfter: 79,
      delta: 0,
      outcome: 'applied',
    },
  ];
}

function appliedTaggedVisibleHeadingAnchorPath(): AppliedRemediationTool[] {
  return [
    {
      toolName: 'set_document_language',
      stage: 1,
      round: 1,
      scoreBefore: 49,
      scoreAfter: 93,
      delta: 4,
      outcome: 'applied',
    },
    {
      toolName: 'create_heading_from_tagged_visible_anchor',
      stage: 2,
      round: 1,
      scoreBefore: 49,
      scoreAfter: 93,
      delta: 16,
      outcome: 'applied',
    },
    {
      toolName: 'remap_orphan_mcids_as_artifacts',
      stage: 2,
      round: 1,
      scoreBefore: 49,
      scoreAfter: 93,
      delta: 16,
      outcome: 'applied',
    },
    {
      toolName: 'repair_native_link_structure',
      stage: 3,
      round: 1,
      scoreBefore: 49,
      scoreAfter: 93,
      delta: 18,
      outcome: 'applied',
    },
    {
      toolName: 'set_link_annotation_contents',
      stage: 3,
      round: 1,
      scoreBefore: 49,
      scoreAfter: 93,
      delta: 18,
      outcome: 'applied',
    },
    {
      toolName: 'normalize_annotation_tab_order',
      stage: 4,
      round: 1,
      scoreBefore: 49,
      scoreAfter: 93,
      delta: 0,
      outcome: 'applied',
    },
    {
      toolName: 'repair_native_reading_order',
      stage: 4,
      round: 1,
      scoreBefore: 49,
      scoreAfter: 93,
      delta: 0,
      outcome: 'applied',
    },
    {
      toolName: 'mark_untagged_content_as_artifact',
      stage: 9,
      round: 1,
      scoreBefore: 49,
      scoreAfter: 93,
      delta: 0,
      outcome: 'applied',
    },
    {
      toolName: 'set_pdfua_identification',
      stage: 10,
      round: 1,
      scoreBefore: 49,
      scoreAfter: 93,
      delta: 0,
      outcome: 'applied',
    },
    {
      toolName: 'set_document_title',
      stage: 11,
      round: 1,
      scoreBefore: 49,
      scoreAfter: 93,
      delta: 6,
      outcome: 'applied',
    },
  ];
}

function appliedNativeLinkRepairPath(): AppliedRemediationTool[] {
  return [
    {
      toolName: 'normalize_pdfua_catalog_settings',
      stage: 1,
      round: 1,
      scoreBefore: 64,
      scoreAfter: 69,
      delta: 5,
      outcome: 'applied',
    },
    {
      toolName: 'set_document_language',
      stage: 1,
      round: 1,
      scoreBefore: 64,
      scoreAfter: 69,
      delta: 5,
      outcome: 'applied',
    },
    {
      toolName: 'set_document_title',
      stage: 1,
      round: 1,
      scoreBefore: 64,
      scoreAfter: 69,
      delta: 5,
      outcome: 'applied',
    },
    {
      toolName: 'bootstrap_struct_tree',
      stage: 2,
      round: 1,
      scoreBefore: 69,
      scoreAfter: 69,
      delta: 0,
      outcome: 'applied',
    },
    {
      toolName: 'synthesize_basic_structure_from_layout',
      stage: 2,
      round: 1,
      scoreBefore: 69,
      scoreAfter: 69,
      delta: 0,
      outcome: 'applied',
    },
    {
      toolName: 'set_link_annotation_contents',
      stage: 3,
      round: 1,
      scoreBefore: 69,
      scoreAfter: 69,
      delta: 0,
      outcome: 'applied',
    },
    {
      toolName: 'normalize_annotation_tab_order',
      stage: 4,
      round: 1,
      scoreBefore: 69,
      scoreAfter: 78,
      delta: 9,
      outcome: 'applied',
    },
    {
      toolName: 'repair_native_reading_order',
      stage: 4,
      round: 1,
      scoreBefore: 78,
      scoreAfter: 89,
      delta: 11,
      outcome: 'applied',
    },
    {
      toolName: 'repair_native_link_structure',
      stage: 3,
      round: 2,
      scoreBefore: 89,
      scoreAfter: 95,
      delta: 6,
      outcome: 'applied',
    },
    {
      toolName: 'repair_alt_text_structure',
      stage: 9,
      round: 2,
      scoreBefore: 89,
      scoreAfter: 95,
      delta: 6,
      outcome: 'applied',
    },
    {
      toolName: 'remap_orphan_mcids_as_artifacts',
      stage: 10,
      round: 2,
      scoreBefore: 95,
      scoreAfter: 95,
      delta: 0,
      outcome: 'applied',
    },
  ];
}

function appliedPageOutlineBookmarksPath(): AppliedRemediationTool[] {
  return [
    {
      toolName: 'set_document_language',
      stage: 1,
      round: 1,
      scoreBefore: 41,
      scoreAfter: 59,
      delta: 18,
      outcome: 'applied',
    },
    {
      toolName: 'set_document_title',
      stage: 1,
      round: 1,
      scoreBefore: 41,
      scoreAfter: 59,
      delta: 18,
      outcome: 'applied',
    },
    {
      toolName: 'set_pdfua_identification',
      stage: 1,
      round: 1,
      scoreBefore: 41,
      scoreAfter: 59,
      delta: 18,
      outcome: 'applied',
    },
    {
      toolName: 'bootstrap_struct_tree',
      stage: 2,
      round: 1,
      scoreBefore: 59,
      scoreAfter: 90,
      delta: 31,
      outcome: 'applied',
    },
    {
      toolName: 'repair_structure_conformance',
      stage: 2,
      round: 1,
      scoreBefore: 59,
      scoreAfter: 90,
      delta: 31,
      outcome: 'applied',
    },
    {
      toolName: 'add_page_outline_bookmarks',
      stage: 5,
      round: 1,
      scoreBefore: 90,
      scoreAfter: 90,
      delta: 0,
      outcome: 'applied',
    },
    {
      toolName: 'mark_untagged_content_as_artifact',
      stage: 9,
      round: 1,
      scoreBefore: 90,
      scoreAfter: 92,
      delta: 2,
      outcome: 'applied',
    },
    {
      toolName: 'normalize_annotation_tab_order',
      stage: 4,
      round: 1,
      scoreBefore: 92,
      scoreAfter: 98,
      delta: 6,
      outcome: 'applied',
    },
    {
      toolName: 'repair_alt_text_structure',
      stage: 9,
      round: 1,
      scoreBefore: 98,
      scoreAfter: 98,
      delta: 0,
      outcome: 'applied',
    },
  ];
}


function appliedTableHeaderPath(): AppliedRemediationTool[] {
  return [
    {
      toolName: 'set_document_language',
      stage: 1,
      round: 1,
      scoreBefore: 59,
      scoreAfter: 76,
      delta: 17,
      outcome: 'applied',
    },
    {
      toolName: 'set_document_title',
      stage: 1,
      round: 1,
      scoreBefore: 59,
      scoreAfter: 76,
      delta: 17,
      outcome: 'applied',
    },
    {
      toolName: 'set_pdfua_identification',
      stage: 1,
      round: 1,
      scoreBefore: 59,
      scoreAfter: 76,
      delta: 17,
      outcome: 'applied',
    },
    {
      toolName: 'remap_orphan_mcids_as_artifacts',
      stage: 2,
      round: 1,
      scoreBefore: 76,
      scoreAfter: 77,
      delta: 1,
      outcome: 'applied',
    },
    {
      toolName: 'repair_structure_conformance',
      stage: 2,
      round: 1,
      scoreBefore: 76,
      scoreAfter: 77,
      delta: 1,
      outcome: 'applied',
    },
    {
      toolName: 'artifact_repeating_page_furniture',
      stage: 3,
      round: 1,
      scoreBefore: 77,
      scoreAfter: 77,
      delta: 0,
      outcome: 'no_effect',
    },
    {
      toolName: 'repair_native_link_structure',
      stage: 3,
      round: 1,
      scoreBefore: 77,
      scoreAfter: 77,
      delta: 0,
      outcome: 'no_effect',
    },
    {
      toolName: 'set_link_annotation_contents',
      stage: 3,
      round: 1,
      scoreBefore: 77,
      scoreAfter: 77,
      delta: 0,
      outcome: 'applied',
    },
    {
      toolName: 'tag_unowned_annotations',
      stage: 3,
      round: 1,
      scoreBefore: 77,
      scoreAfter: 77,
      delta: 0,
      outcome: 'no_effect',
    },
    {
      toolName: 'create_heading_from_candidate',
      stage: 4,
      round: 1,
      scoreBefore: 77,
      scoreAfter: 88,
      delta: 11,
      outcome: 'applied',
    },
    {
      toolName: 'normalize_annotation_tab_order',
      stage: 4,
      round: 1,
      scoreBefore: 77,
      scoreAfter: 88,
      delta: 11,
      outcome: 'applied',
    },
    {
      toolName: 'normalize_heading_hierarchy',
      stage: 4,
      round: 1,
      scoreBefore: 77,
      scoreAfter: 88,
      delta: 11,
      outcome: 'no_effect',
    },
    {
      toolName: 'repair_native_table_headers',
      stage: 4,
      round: 1,
      scoreBefore: 77,
      scoreAfter: 88,
      delta: 11,
      outcome: 'applied',
    },
    {
      toolName: 'replace_bookmarks_from_headings',
      stage: 4,
      round: 1,
      scoreBefore: 77,
      scoreAfter: 88,
      delta: 11,
      outcome: 'applied',
    },
    {
      toolName: 'add_page_outline_bookmarks',
      stage: 6,
      round: 1,
      scoreBefore: 88,
      scoreAfter: 88,
      delta: 0,
      outcome: 'no_effect',
    },
    {
      toolName: 'set_table_header_cells',
      stage: 6,
      round: 1,
      scoreBefore: 88,
      scoreAfter: 88,
      delta: 0,
      outcome: 'no_effect',
    },
    {
      toolName: 'mark_untagged_content_as_artifact',
      stage: 9,
      round: 1,
      scoreBefore: 88,
      scoreAfter: 88,
      delta: 0,
      outcome: 'applied',
    },
    {
      toolName: 'remap_orphan_mcids_as_artifacts',
      stage: 2,
      round: 2,
      scoreBefore: 88,
      scoreAfter: 89,
      delta: 1,
      outcome: 'applied',
    },
    {
      toolName: 'artifact_repeating_page_furniture',
      stage: 3,
      round: 2,
      scoreBefore: 89,
      scoreAfter: 89,
      delta: 0,
      outcome: 'no_effect',
    },
    {
      toolName: 'create_heading_from_candidate',
      stage: 4,
      round: 2,
      scoreBefore: 89,
      scoreAfter: 89,
      delta: 0,
      outcome: 'applied',
    },
    {
      toolName: 'normalize_heading_hierarchy',
      stage: 4,
      round: 2,
      scoreBefore: 89,
      scoreAfter: 89,
      delta: 0,
      outcome: 'applied',
    },
    {
      toolName: 'wrap_singleton_orphan_mcid',
      stage: 2,
      round: 2,
      scoreBefore: 89,
      scoreAfter: 89,
      delta: 0,
      outcome: 'no_effect',
    },
    {
      toolName: 'repair_alt_text_structure',
      stage: 9,
      round: 2,
      scoreBefore: 89,
      scoreAfter: 93,
      delta: 4,
      outcome: 'applied',
    },
  ];
}


function appliedArtifactFurniturePath(): AppliedRemediationTool[] {
  return [
    {
      toolName: 'set_document_language',
      stage: 1,
      round: 1,
      scoreBefore: 43,
      scoreAfter: 51,
      delta: 8,
      outcome: 'applied',
    },
    {
      toolName: 'set_document_title',
      stage: 1,
      round: 1,
      scoreBefore: 43,
      scoreAfter: 51,
      delta: 8,
      outcome: 'applied',
    },
    {
      toolName: 'artifact_repeating_page_furniture',
      stage: 3,
      round: 1,
      scoreBefore: 51,
      scoreAfter: 59,
      delta: 8,
      outcome: 'applied',
    },
    {
      toolName: 'repair_native_link_structure',
      stage: 3,
      round: 1,
      scoreBefore: 59,
      scoreAfter: 59,
      delta: 0,
      outcome: 'no_effect',
    },
    {
      toolName: 'set_link_annotation_contents',
      stage: 3,
      round: 1,
      scoreBefore: 59,
      scoreAfter: 59,
      delta: 0,
      outcome: 'applied',
    },
    {
      toolName: 'normalize_annotation_tab_order',
      stage: 4,
      round: 1,
      scoreBefore: 59,
      scoreAfter: 59,
      delta: 0,
      outcome: 'applied',
    },
    {
      toolName: 'repair_list_li_wrong_parent',
      stage: 4,
      round: 1,
      scoreBefore: 59,
      scoreAfter: 59,
      delta: 0,
      outcome: 'applied',
    },
    {
      toolName: 'set_figure_alt_text',
      stage: 6,
      round: 1,
      scoreBefore: 59,
      scoreAfter: 59,
      delta: 0,
      outcome: 'applied',
    },
    {
      toolName: 'repair_alt_text_structure',
      stage: 9,
      round: 2,
      scoreBefore: 59,
      scoreAfter: 92,
      delta: 33,
      outcome: 'applied',
    },
  ];
}


function appliedOcrTextRecoveryPath(): AppliedRemediationTool[] {
  return [
    {
      toolName: 'set_document_language',
      stage: 1,
      round: 1,
      scoreBefore: 16,
      scoreAfter: 44,
      delta: 28,
      outcome: 'applied',
    },
    {
      toolName: 'set_document_title',
      stage: 1,
      round: 1,
      scoreBefore: 44,
      scoreAfter: 44,
      delta: 0,
      outcome: 'applied',
    },
    {
      toolName: 'set_pdfua_identification',
      stage: 1,
      round: 1,
      scoreBefore: 44,
      scoreAfter: 44,
      delta: 0,
      outcome: 'applied',
    },
    {
      toolName: 'bootstrap_struct_tree',
      stage: 2,
      round: 1,
      scoreBefore: 44,
      scoreAfter: 92,
      delta: 48,
      outcome: 'applied',
    },
    {
      toolName: 'repair_structure_conformance',
      stage: 2,
      round: 1,
      scoreBefore: 92,
      scoreAfter: 92,
      delta: 0,
      outcome: 'applied',
    },
    {
      toolName: 'add_page_outline_bookmarks',
      stage: 5,
      round: 1,
      scoreBefore: 92,
      scoreAfter: 92,
      delta: 0,
      outcome: 'applied',
    },
    {
      toolName: 'ocr_scanned_pdf',
      stage: 7,
      round: 1,
      scoreBefore: 92,
      scoreAfter: 55,
      delta: -37,
      outcome: 'applied',
    },
    {
      toolName: 'tag_ocr_text_blocks',
      stage: 8,
      round: 2,
      scoreBefore: 55,
      scoreAfter: 88,
      delta: 33,
      outcome: 'applied',
    },
    {
      toolName: 'normalize_annotation_tab_order',
      stage: 4,
      round: 3,
      scoreBefore: 88,
      scoreAfter: 94,
      delta: 6,
      outcome: 'applied',
    },
    {
      toolName: 'repair_alt_text_structure',
      stage: 9,
      round: 4,
      scoreBefore: 94,
      scoreAfter: 94,
      delta: 0,
      outcome: 'applied',
    },
    {
      toolName: 'set_pdfua_identification',
      stage: 10,
      round: 4,
      scoreBefore: 94,
      scoreAfter: 96,
      delta: 2,
      outcome: 'applied',
    },
  ];
}

function appliedUrwType1SubstitutionPath(): AppliedRemediationTool[] {
  return [
    {
      toolName: 'set_document_language',
      stage: 1,
      round: 1,
      scoreBefore: 31,
      scoreAfter: 59,
      delta: 28,
      outcome: 'applied',
    },
    {
      toolName: 'set_document_title',
      stage: 1,
      round: 1,
      scoreBefore: 31,
      scoreAfter: 59,
      delta: 28,
      outcome: 'applied',
    },
    {
      toolName: 'set_pdfua_identification',
      stage: 1,
      round: 1,
      scoreBefore: 31,
      scoreAfter: 59,
      delta: 28,
      outcome: 'applied',
    },
    {
      toolName: 'bootstrap_struct_tree',
      stage: 2,
      round: 1,
      scoreBefore: 59,
      scoreAfter: 90,
      delta: 31,
      outcome: 'applied',
    },
    {
      toolName: 'repair_structure_conformance',
      stage: 2,
      round: 1,
      scoreBefore: 59,
      scoreAfter: 90,
      delta: 31,
      outcome: 'applied',
    },
    {
      toolName: 'add_page_outline_bookmarks',
      stage: 5,
      round: 1,
      scoreBefore: 90,
      scoreAfter: 90,
      delta: 0,
      outcome: 'applied',
    },
    {
      toolName: 'mark_untagged_content_as_artifact',
      stage: 9,
      round: 1,
      scoreBefore: 90,
      scoreAfter: 92,
      delta: 2,
      outcome: 'applied',
    },
    {
      toolName: 'normalize_annotation_tab_order',
      stage: 4,
      round: 2,
      scoreBefore: 92,
      scoreAfter: 98,
      delta: 6,
      outcome: 'applied',
    },
    {
      toolName: 'repair_alt_text_structure',
      stage: 9,
      round: 2,
      scoreBefore: 98,
      scoreAfter: 98,
      delta: 0,
      outcome: 'applied',
    },
    {
      toolName: 'embed_urw_type1_substitutes',
      stage: 11,
      round: 2,
      scoreBefore: 98,
      scoreAfter: 98,
      delta: 0,
      outcome: 'applied',
    },
  ];
}

function appliedCanonicalizeFigureAltOwnershipPath(): AppliedRemediationTool[] {
  return [
    {
      toolName: 'set_document_language',
      stage: 1,
      round: 1,
      scoreBefore: 85,
      scoreAfter: 87,
      delta: 2,
      outcome: 'applied',
    },
    {
      toolName: 'set_document_title',
      stage: 1,
      round: 1,
      scoreBefore: 85,
      scoreAfter: 87,
      delta: 2,
      outcome: 'no_effect',
    },
    {
      toolName: 'set_pdfua_identification',
      stage: 1,
      round: 1,
      scoreBefore: 85,
      scoreAfter: 87,
      delta: 2,
      outcome: 'applied',
    },
    {
      toolName: 'remap_orphan_mcids_as_artifacts',
      stage: 2,
      round: 1,
      scoreBefore: 87,
      scoreAfter: 89,
      delta: 2,
      outcome: 'applied',
    },
    {
      toolName: 'repair_structure_conformance',
      stage: 2,
      round: 1,
      scoreBefore: 87,
      scoreAfter: 89,
      delta: 2,
      outcome: 'applied',
    },
    {
      toolName: 'normalize_nested_figure_containers',
      stage: 5,
      round: 1,
      scoreBefore: 89,
      scoreAfter: 89,
      delta: 0,
      outcome: 'no_effect',
    },
    {
      toolName: 'canonicalize_figure_alt_ownership',
      stage: 6,
      round: 1,
      scoreBefore: 89,
      scoreAfter: 99,
      delta: 10,
      outcome: 'applied',
    },
    {
      toolName: 'mark_untagged_content_as_artifact',
      stage: 9,
      round: 1,
      scoreBefore: 99,
      scoreAfter: 99,
      delta: 0,
      outcome: 'applied',
    },
    {
      toolName: 'repair_alt_text_structure',
      stage: 9,
      round: 1,
      scoreBefore: 99,
      scoreAfter: 99,
      delta: 0,
      outcome: 'applied',
      details: 'nested_alt_cleanup',
    },
  ];
}


function appliedOrphanMcidRemapPath(): AppliedRemediationTool[] {
  return [
    {
      toolName: 'set_document_language',
      stage: 1,
      round: 1,
      scoreBefore: 37,
      scoreAfter: 48,
      delta: 11,
      outcome: 'applied',
    },
    {
      toolName: 'set_document_title',
      stage: 1,
      round: 1,
      scoreBefore: 48,
      scoreAfter: 48,
      delta: 0,
      outcome: 'applied',
    },
    {
      toolName: 'set_link_annotation_contents',
      stage: 2,
      round: 1,
      scoreBefore: 48,
      scoreAfter: 48,
      delta: 0,
      outcome: 'applied',
    },
    {
      toolName: 'mark_untagged_content_as_artifact',
      stage: 4,
      round: 1,
      scoreBefore: 48,
      scoreAfter: 48,
      delta: 0,
      outcome: 'applied',
    },
    {
      toolName: 'set_pdfua_identification',
      stage: 1,
      round: 1,
      scoreBefore: 48,
      scoreAfter: 48,
      delta: 0,
      outcome: 'applied',
    },
    {
      toolName: 'remap_orphan_mcids_as_artifacts',
      stage: 4,
      round: 1,
      scoreBefore: 48,
      scoreAfter: 48,
      delta: 0,
      outcome: 'applied',
    },
  ];
}


function appliedDegenerateNativeShellPath(): AppliedRemediationTool[] {
  return [
    {
      toolName: 'set_document_language',
      stage: 1,
      round: 1,
      scoreBefore: 59,
      scoreAfter: 59,
      delta: 0,
      outcome: 'applied',
    },
    {
      toolName: 'create_heading_from_candidate',
      stage: 4,
      round: 1,
      scoreBefore: 59,
      scoreAfter: 69,
      delta: 10,
      outcome: 'applied',
    },
    {
      toolName: 'mark_untagged_content_as_artifact',
      stage: 4,
      round: 1,
      scoreBefore: 69,
      scoreAfter: 69,
      delta: 0,
      outcome: 'applied',
    },
    {
      toolName: 'set_document_title',
      stage: 1,
      round: 1,
      scoreBefore: 69,
      scoreAfter: 69,
      delta: 0,
      outcome: 'applied',
    },
    {
      toolName: 'repair_degenerate_native_reading_order_shell',
      stage: 3,
      round: 1,
      scoreBefore: 69,
      scoreAfter: 87,
      delta: 18,
      outcome: 'applied',
    },
    {
      toolName: 'repair_top_level_parent_links',
      stage: 5,
      round: 1,
      scoreBefore: 87,
      scoreAfter: 91,
      delta: 4,
      outcome: 'applied',
    },
    {
      toolName: 'set_pdfua_identification',
      stage: 1,
      round: 1,
      scoreBefore: 91,
      scoreAfter: 96,
      delta: 5,
      outcome: 'applied',
    },
  ];
}

describe('playbookStore', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    initSchema(db);
  });

  it('findActive returns null for unknown signature', () => {
    const store = createPlaybookStore(db);
    expect(store.findActive('deadbeefdeadbe')).toBeNull();
  });

  it('learnFromSuccess creates a candidate playbook', () => {
    const store = createPlaybookStore(db);
    const analysis = minimalAnalysis();
    const snap = minimalSnapshot();
    store.learnFromSuccess(analysis, snap, appliedTitle(), 6);
    const sig = buildFailureSignature(analysis, snap);
    const row = store.listAll().find(p => p.failureSignature === sig);
    expect(row).toBeDefined();
    expect(row!.status).toBe('candidate');
    expect(store.findActive(sig)).toBeNull();
  });

  it('learnFromSuccess persists repair_native_reading_order sequences', () => {
    const store = createPlaybookStore(db);
    const analysis = minimalAnalysis();
    const snap = minimalSnapshot();
    store.learnFromSuccess(analysis, snap, appliedNativeReadingOrder(), 12);
    const sig = buildFailureSignature(analysis, snap);
    const row = store.listAll().find(p => p.failureSignature === sig);
    expect(row).toBeDefined();
    expect(row!.toolSequence.map(step => step.toolName)).toEqual(['repair_native_reading_order']);
  });

  it('learnFromSuccess persists repeatable heading and parent-link follow-up tools', () => {
    const store = createPlaybookStore(db);
    const analysis = minimalAnalysis();
    const snap = minimalSnapshot();
    store.learnFromSuccess(analysis, snap, appliedStructureFollowup(), 56);
    const sig = buildFailureSignature(analysis, snap);
    const row = store.listAll().find(p => p.failureSignature === sig);
    expect(row).toBeDefined();
    expect(row!.toolSequence.map(step => step.toolName)).toEqual([
      'create_heading_from_candidate',
      'mark_untagged_content_as_artifact',
      'repair_top_level_parent_links',
    ]);
  });

  it('learnFromSuccess persists ensure_accessibility_tagging sequences from a real public trace pattern', () => {
    const store = createPlaybookStore(db);
    const analysis = minimalAnalysis();
    const snap = minimalSnapshot();
    store.learnFromSuccess(analysis, snap, appliedAccessibilityTagging(), 13);
    const sig = buildFailureSignature(analysis, snap);
    const row = store.listAll().find(p => p.failureSignature === sig);
    expect(row).toBeDefined();
    expect(row!.toolSequence.map(step => step.toolName)).toEqual([
      'set_pdfua_identification',
      'ensure_accessibility_tagging',
      'set_document_title',
    ]);
  });

  it('learnFromSuccess persists the degenerate-native shell public success path', () => {
    const store = createPlaybookStore(db);
    const analysis = minimalAnalysis();
    const snap = minimalSnapshot();
    store.learnFromSuccess(analysis, snap, appliedDegenerateNativeShellPath(), 37);
    const sig = buildFailureSignature(analysis, snap);
    const row = store.listAll().find(p => p.failureSignature === sig);
    expect(row).toBeDefined();
    expect(row!.toolSequence.map(step => step.toolName)).toEqual([
      'set_document_language',
      'create_heading_from_candidate',
      'mark_untagged_content_as_artifact',
      'set_document_title',
      'repair_degenerate_native_reading_order_shell',
      'repair_top_level_parent_links',
      'set_pdfua_identification',
    ]);
  });

  it('learnFromSuccess persists set_link_annotation_contents sequences from public traces', () => {
    const store = createPlaybookStore(db);
    const analysis = minimalAnalysis();
    const snap = minimalSnapshot();
    store.learnFromSuccess(analysis, snap, appliedLinkAnnotationContents(), 11);
    const sig = buildFailureSignature(analysis, snap);
    const row = store.listAll().find(p => p.failureSignature === sig);
    expect(row).toBeDefined();
    expect(row!.toolSequence.map(step => step.toolName)).toEqual([
      'set_document_language',
      'set_document_title',
      'set_link_annotation_contents',
      'set_pdfua_identification',
    ]);
  });

  it('learnFromSuccess persists normalize_annotation_tab_order from a public heading and tab-order path', () => {
    const store = createPlaybookStore(db);
    const analysis = minimalAnalysis();
    const snap = minimalSnapshot();
    store.learnFromSuccess(analysis, snap, appliedAnnotationTabOrder(), 53);
    const sig = buildFailureSignature(analysis, snap);
    const row = store.listAll().find(p => p.failureSignature === sig);
    expect(row).toBeDefined();
    expect(row!.toolSequence.map(step => step.toolName)).toEqual([
      'set_document_language',
      'set_document_title',
      'create_heading_from_candidate',
      'normalize_annotation_tab_order',
      'repair_native_reading_order',
      'mark_untagged_content_as_artifact',
      'repair_top_level_parent_links',
    ]);
  });

  it('learnFromSuccess persists normalize_pdfua_catalog_settings from the repeated public near-pass path', () => {
    const store = createPlaybookStore(db);
    const analysis = minimalAnalysis();
    const snap = minimalSnapshot();
    store.learnFromSuccess(analysis, snap, appliedPdfuaCatalogNormalization(), 62);
    const sig = buildFailureSignature(analysis, snap);
    const row = store.listAll().find(p => p.failureSignature === sig);
    expect(row).toBeDefined();
    expect(row!.toolSequence.map(step => step.toolName)).toEqual([
      'normalize_pdfua_catalog_settings',
      'set_document_language',
      'set_document_title',
      'bootstrap_struct_tree',
      'synthesize_basic_structure_from_layout',
      'normalize_annotation_tab_order',
      'repair_native_reading_order',
      'set_pdfua_identification',
    ]);
  });

  it('learnFromSuccess persists embed_urw_type1_substitutes from the public 4194 font route', () => {
    const store = createPlaybookStore(db);
    const analysis = minimalAnalysis();
    const snap = minimalSnapshot();
    store.learnFromSuccess(analysis, snap, appliedUrwType1SubstitutionPath(), 67);
    const sig = buildFailureSignature(analysis, snap);
    const row = store.listAll().find(p => p.failureSignature === sig);
    expect(row).toBeDefined();
    expect(row!.toolSequence.map(step => step.toolName)).toEqual([
      'set_document_language',
      'set_document_title',
      'set_pdfua_identification',
      'bootstrap_struct_tree',
      'repair_structure_conformance',
      'add_page_outline_bookmarks',
      'mark_untagged_content_as_artifact',
      'normalize_annotation_tab_order',
      'repair_alt_text_structure',
      'embed_urw_type1_substitutes',
    ]);
  });

  it('learnFromSuccess persists repair_alt_text_structure from the public 4194 success path', () => {
    const store = createPlaybookStore(db);
    const analysis = minimalAnalysis();
    const snap = minimalSnapshot();
    store.learnFromSuccess(analysis, snap, appliedAltTextStructureRepair(), 28);
    const sig = buildFailureSignature(analysis, snap);
    const row = store.listAll().find(p => p.failureSignature === sig);
    expect(row).toBeDefined();
    expect(row!.toolSequence.map(step => step.toolName)).toEqual([
      'set_document_language',
      'set_document_title',
      'bootstrap_struct_tree',
      'synthesize_basic_structure_from_layout',
      'repair_alt_text_structure',
      'set_pdfua_identification',
      'post_pass_bookmarks',
    ]);
  });

  it('learnFromSuccess persists fill_form_field_tooltips from the active public 4660 path', () => {
    const store = createPlaybookStore(db);
    const analysis = minimalAnalysis();
    const snap = minimalSnapshot();
    store.learnFromSuccess(analysis, snap, appliedFormTooltipPath(), 41);
    const sig = buildFailureSignature(analysis, snap);
    const row = store.listAll().find(p => p.failureSignature === sig);
    expect(row).toBeDefined();
    expect(row!.toolSequence.map(step => step.toolName)).toEqual([
      'set_document_language',
      'set_document_title',
      'normalize_annotation_tab_order',
      'fill_form_field_tooltips',
      'set_pdfua_identification',
    ]);
  });

  it('learnFromSuccess persists repair_list_li_wrong_parent from the active public 4516 path', () => {
    const store = createPlaybookStore(db);
    const analysis = minimalAnalysis();
    const snap = minimalSnapshot();
    store.learnFromSuccess(analysis, snap, appliedListStructureRepair(), 58);
    const sig = buildFailureSignature(analysis, snap);
    const row = store.listAll().find(p => p.failureSignature === sig);
    expect(row).toBeDefined();
    expect(row!.toolSequence.map(step => step.toolName)).toEqual([
      'set_document_language',
      'set_document_title',
      'normalize_annotation_tab_order',
      'repair_list_li_wrong_parent',
      'repair_alt_text_structure',
      'set_pdfua_identification',
    ]);
  });

  it('learnFromSuccess persists set_figure_alt_text from the active public 4754 path', () => {
    const store = createPlaybookStore(db);
    const analysis = minimalAnalysis();
    const snap = minimalSnapshot();
    store.learnFromSuccess(analysis, snap, appliedFigureAltPath(), 59);
    const sig = buildFailureSignature(analysis, snap);
    const row = store.listAll().find(p => p.failureSignature === sig);
    expect(row).toBeDefined();
    expect(row!.toolSequence.map(step => step.toolName)).toEqual([
      'set_document_language',
      'set_document_title',
      'normalize_annotation_tab_order',
      'normalize_heading_hierarchy',
      'set_figure_alt_text',
      'set_pdfua_identification',
    ]);
  });

  it('learnFromSuccess persists canonicalize_figure_alt_ownership from the Microsoft Teams fixture path', () => {
    const store = createPlaybookStore(db);
    const analysis = minimalAnalysis();
    const snap = minimalSnapshot();
    store.learnFromSuccess(analysis, snap, appliedCanonicalizeFigureAltOwnershipPath(), 14);
    const sig = buildFailureSignature(analysis, snap);
    const row = store.listAll().find(p => p.failureSignature === sig);
    expect(row).toBeDefined();
    expect(row!.toolSequence.map(step => step.toolName)).toEqual([
      'set_document_language',
      'set_pdfua_identification',
      'remap_orphan_mcids_as_artifacts',
      'repair_structure_conformance',
      'canonicalize_figure_alt_ownership',
      'mark_untagged_content_as_artifact',
      'repair_alt_text_structure',
    ]);
  });

  it('learnFromSuccess persists artifact_repeating_page_furniture from the active public 4516 path', () => {
    const store = createPlaybookStore(db);
    const analysis = minimalAnalysis();
    const snap = minimalSnapshot();
    store.learnFromSuccess(analysis, snap, appliedArtifactFurniturePath(), 26);
    const sig = buildFailureSignature(analysis, snap);
    const row = store.listAll().find(p => p.failureSignature === sig);
    expect(row).toBeDefined();
    expect(row!.toolSequence.map(step => step.toolName)).toEqual([
      'set_document_language',
      'set_document_title',
      'artifact_repeating_page_furniture',
      'set_link_annotation_contents',
      'normalize_annotation_tab_order',
      'repair_list_li_wrong_parent',
      'set_figure_alt_text',
      'repair_alt_text_structure',
    ]);
  });

  it('learnFromSuccess persists repair_native_table_headers from the active public 4438 path', () => {
    const store = createPlaybookStore(db);
    const analysis = minimalAnalysis();
    const snap = minimalSnapshot();
    store.learnFromSuccess(analysis, snap, appliedTableHeaderPath(), 30);
    const sig = buildFailureSignature(analysis, snap);
    const row = store.listAll().find(p => p.failureSignature === sig);
    expect(row).toBeDefined();
    expect(row!.toolSequence.map(step => step.toolName)).toEqual([
      'set_document_language',
      'set_document_title',
      'set_pdfua_identification',
      'remap_orphan_mcids_as_artifacts',
      'repair_structure_conformance',
      'set_link_annotation_contents',
      'create_heading_from_candidate',
      'normalize_annotation_tab_order',
      'repair_native_table_headers',
      'replace_bookmarks_from_headings',
      'mark_untagged_content_as_artifact',
      'normalize_heading_hierarchy',
      'repair_alt_text_structure',
    ]);
  });

  it('learnFromSuccess persists create_structure_from_degenerate_native_anchor from the active public 4609 path', () => {
    const store = createPlaybookStore(db);
    const analysis = minimalAnalysis();
    const snap = minimalSnapshot();
    store.learnFromSuccess(analysis, snap, appliedDegenerateNativeAnchorStructurePath(), 32);
    const sig = buildFailureSignature(analysis, snap);
    const row = store.listAll().find(p => p.failureSignature === sig);
    expect(row).toBeDefined();
    expect(row!.toolSequence.map(step => step.toolName)).toEqual([
      'set_document_language',
      'bootstrap_struct_tree',
      'create_structure_from_degenerate_native_anchor',
      'remap_orphan_mcids_as_artifacts',
      'repair_native_reading_order',
      'mark_untagged_content_as_artifact',
      'set_pdfua_identification',
      'post_pass_bookmarks',
    ]);
  });

  it('learnFromSuccess persists create_heading_from_tagged_visible_anchor from the active public 4470 path', () => {
    const store = createPlaybookStore(db);
    const analysis = minimalAnalysis();
    const snap = minimalSnapshot();
    store.learnFromSuccess(analysis, snap, appliedTaggedVisibleHeadingAnchorPath(), 44);
    const sig = buildFailureSignature(analysis, snap);
    const row = store.listAll().find(p => p.failureSignature === sig);
    expect(row).toBeDefined();
    expect(row!.toolSequence.map(step => step.toolName)).toEqual([
      'set_document_language',
      'create_heading_from_tagged_visible_anchor',
      'remap_orphan_mcids_as_artifacts',
      'repair_native_link_structure',
      'set_link_annotation_contents',
      'normalize_annotation_tab_order',
      'repair_native_reading_order',
      'mark_untagged_content_as_artifact',
      'set_pdfua_identification',
      'set_document_title',
    ]);
  });

  it('learnFromSuccess persists repair_native_link_structure from the active public 4214 path', () => {
    const store = createPlaybookStore(db);
    const analysis = minimalAnalysis();
    const snap = minimalSnapshot();
    store.learnFromSuccess(analysis, snap, appliedNativeLinkRepairPath(), 31);
    const sig = buildFailureSignature(analysis, snap);
    const row = store.listAll().find(p => p.failureSignature === sig);
    expect(row).toBeDefined();
    expect(row!.toolSequence.map(step => step.toolName)).toEqual([
      'normalize_pdfua_catalog_settings',
      'set_document_language',
      'set_document_title',
      'bootstrap_struct_tree',
      'synthesize_basic_structure_from_layout',
      'set_link_annotation_contents',
      'normalize_annotation_tab_order',
      'repair_native_reading_order',
      'repair_native_link_structure',
      'repair_alt_text_structure',
      'remap_orphan_mcids_as_artifacts',
    ]);
  });

  it('learnFromSuccess persists add_page_outline_bookmarks from the active public 4101 path', () => {
    const store = createPlaybookStore(db);
    const analysis = minimalAnalysis();
    const snap = minimalSnapshot();
    store.learnFromSuccess(analysis, snap, appliedPageOutlineBookmarksPath(), 22);
    const sig = buildFailureSignature(analysis, snap);
    const row = store.listAll().find(p => p.failureSignature === sig);
    expect(row).toBeDefined();
    expect(row!.toolSequence.map(step => step.toolName)).toEqual([
      'set_document_language',
      'set_document_title',
      'set_pdfua_identification',
      'bootstrap_struct_tree',
      'repair_structure_conformance',
      'add_page_outline_bookmarks',
      'mark_untagged_content_as_artifact',
      'normalize_annotation_tab_order',
      'repair_alt_text_structure',
    ]);
  });

  it('learnFromSuccess persists remap_orphan_mcids_as_artifacts from the active public 4702 path', () => {
    const store = createPlaybookStore(db);
    const analysis = minimalAnalysis();
    const snap = minimalSnapshot();
    store.learnFromSuccess(analysis, snap, appliedOrphanMcidRemapPath(), 37);
    const sig = buildFailureSignature(analysis, snap);
    const row = store.listAll().find(p => p.failureSignature === sig);
    expect(row).toBeDefined();
    expect(row!.toolSequence.map(step => step.toolName)).toEqual([
      'set_document_language',
      'set_document_title',
      'set_link_annotation_contents',
      'mark_untagged_content_as_artifact',
      'set_pdfua_identification',
      'remap_orphan_mcids_as_artifacts',
    ]);
  });

  it('learnFromSuccess persists the scanned-PDF OCR recovery path', () => {
    const store = createPlaybookStore(db);
    const analysis = minimalAnalysis();
    const snap = minimalSnapshot();
    store.learnFromSuccess(analysis, snap, appliedOcrTextRecoveryPath(), 80);
    const sig = buildFailureSignature(analysis, snap);
    const row = store.listAll().find(p => p.failureSignature === sig);
    expect(row).toBeDefined();
    expect(row!.toolSequence.map(step => step.toolName)).toEqual([
      'set_document_language',
      'set_document_title',
      'set_pdfua_identification',
      'bootstrap_struct_tree',
      'repair_structure_conformance',
      'add_page_outline_bookmarks',
      'ocr_scanned_pdf',
      'tag_ocr_text_blocks',
      'normalize_annotation_tab_order',
      'repair_alt_text_structure',
      'set_pdfua_identification',
    ]);
  });

  it('promotes to active after 3 successes', () => {
    const store = createPlaybookStore(db);
    const analysis = minimalAnalysis();
    const snap = minimalSnapshot();
    store.learnFromSuccess(analysis, snap, appliedTitle(), 6);
    store.learnFromSuccess(analysis, snap, appliedTitle(), 6);
    store.learnFromSuccess(analysis, snap, appliedTitle(), 6);
    const sig = buildFailureSignature(analysis, snap);
    const pb = store.findActive(sig);
    expect(pb).not.toBeNull();
    expect(pb!.status).toBe('active');
  });

  it('retires after many failed playbook attempts', () => {
    const store = createPlaybookStore(db);
    const analysis = minimalAnalysis();
    const snap = minimalSnapshot();
    store.learnFromSuccess(analysis, snap, appliedTitle(), 6);
    store.learnFromSuccess(analysis, snap, appliedTitle(), 6);
    store.learnFromSuccess(analysis, snap, appliedTitle(), 6);
    const sig = buildFailureSignature(analysis, snap);
    const pb = store.findActive(sig)!;
    for (let i = 0; i < 10; i++) {
      store.recordResult(pb.id, false, 0);
    }
    expect(store.findActive(sig)).toBeNull();
    const listed = store.listAll().find(p => p.id === pb.id);
    expect(listed?.status).toBe('retired');
  });
});
