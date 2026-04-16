import 'dotenv/config';

// Single source of truth for all constants.
// No inline magic numbers anywhere else in the codebase.

import { existsSync } from 'node:fs';
import { join } from 'node:path';

export const SCORING_WEIGHTS = {
  text_extractability: 0.175,
  title_language:      0.130,
  heading_structure:   0.130,
  alt_text:            0.130,
  pdf_ua_compliance:   0.095,
  bookmarks:           0.085,
  table_markup:        0.085,
  color_contrast:      0.045,
  link_quality:        0.045,
  reading_order:       0.040,
  form_accessibility:  0.040,
} as const;

// Enforced by test: must sum to exactly 1.0
export const WEIGHT_SUM_CHECK = Object.values(SCORING_WEIGHTS).reduce((a, b) => a + b, 0);

export const GRADE_THRESHOLDS = {
  A: 90,
  B: 80,
  C: 70,
  D: 60,
} as const;

// Bookmarks are N/A for documents shorter than this
export const BOOKMARKS_PAGE_THRESHOLD = 10;

/** Max pages when synthesizing flat "Page N" outline entries (add_page_outline_bookmarks). */
export const BOOKMARKS_PAGE_OUTLINE_MAX_PAGES = 240;

// Scanned page detection: fraction of pages that are image-only
export const SCANNED_PAGE_RATIO_THRESHOLD = 0.85;
export const MIXED_PAGE_RATIO_THRESHOLD   = 0.40;

/**
 * Tagged + /MarkInfo/Marked but pdf.js text length 0 (OCR/bootstrap exports, broken ToUnicode,
 * or text only outside sampled operators). Capped below 100 — recommend AT smoke test.
 */
export const SCORE_TAGGED_MARKED_NO_EXTRACTABLE_TEXT = 96;

/** Acrobat / PAC-style "Character encoding" proxy: max deduction from text_extractability (native_tagged). */
export const TEXT_EXTRACTABILITY_ENCODING_MAX_PENALTY = 38;
/** Per font with encodingRisk=true (see Python extract_fonts). */
export const TEXT_EXTRACTABILITY_ENCODING_PER_RISK_FONT = 6;
/** Floor for text_extractability after encoding penalty (keeps category from collapsing to 0). */
export const TEXT_EXTRACTABILITY_ENCODING_SCORE_FLOOR = 52;

/**
 * When `native_tagged` and pdf.js extracted a dense text layer, `fonts[].encodingRisk` is treated as
 * advisory (subset / partially embedded fonts often still copy-paste and read correctly). Below these
 * thresholds the full Acrobat-style penalty applies.
 */
export const TEXT_EXTRACTABILITY_ENCODING_RELAX_MIN_CHARS = 3500;
export const TEXT_EXTRACTABILITY_ENCODING_RELAX_CHARS_PER_PAGE = 200;
/** Capped total deduction from 100 under relax rules (per-font uses RELAX_PER_FONT). */
export const TEXT_EXTRACTABILITY_ENCODING_RELAX_MAX_PENALTY = 4;
export const TEXT_EXTRACTABILITY_ENCODING_RELAX_PER_FONT = 1;

/** Long documents without /Outlines but tagged Marked — partial credit vs bare scans. */
export const SCORE_TAGGED_MARKED_NO_OUTLINES_BOOKMARKS = 94;

/**
 * pdf_ua_compliance / Acrobat "Tagged content" proxy: fail when this many (or more) marked-content
 * MCIDs are not referenced from the structure tree. `1` matches Acrobat’s strict stance on any orphan.
 */
export const PDF_UA_ORPHAN_MCID_FAIL_THRESHOLD = 1;

/**
 * Acrobat-style list structure violations (misplaced LI / Lbl+LBody / L without LI). Fail when count
 * is at or above this threshold (default `1` = any violation fails the checklist item).
 */
const _pdfUaListFail = parseInt(process.env['PDF_UA_LIST_VIOLATION_FAIL_THRESHOLD'] ?? '1', 10);
export const PDF_UA_LIST_VIOLATION_FAIL_THRESHOLD =
  Number.isFinite(_pdfUaListFail) && _pdfUaListFail >= 1 ? _pdfUaListFail : 1;

/** Max `LI` re-parent wraps per `repair_list_li_wrong_parent` Python call (env mirrors Python). */
const _listLiRepairCap = parseInt(process.env['PDFAF_MAX_LIST_LI_REPAIR_PER_CALL'] ?? '32', 10);
export const PDFAF_MAX_LIST_LI_REPAIR_PER_CALL =
  Number.isFinite(_listLiRepairCap) && _listLiRepairCap >= 1 ? Math.min(_listLiRepairCap, 256) : 32;

/**
 * Heuristic count of path-paint operators outside marked-content on sampled pages; above this, fail the
 * pdf_ua checklist (Acrobat TaggedCont proxy). Default 40 reduces false positives vs legacy 28.
 */
export const PDF_UA_PATH_PAINT_OUTSIDE_MC_FAIL_THRESHOLD = 40;

// Large docs: sample this many pages max for expensive per-page checks
export const MAX_SAMPLE_PAGES = 50;

// Heading coverage: one heading per this many pages is considered adequate
export const HEADING_COVERAGE_PAGES_PER_HEADING = 3;

// Alt text scoring thresholds (ratio of figures with alt text)
export const ALT_TEXT_THRESHOLDS = {
  FULL:     1.00,  // → 100
  HIGH:     0.80,  // → 85
  MODERATE: 0.50,  // → 60
  LOW:      0.01,  // → 20
  NONE:     0.00,  // → 0
} as const;

/** Tier A: penalty for generic / boilerplate / unreadable token-soup alt text (per figure, capped). */
export const ALT_TEXT_WEAK_ALT_PER_FIGURE = 4;
export const ALT_TEXT_WEAK_ALT_MAX_DEDUCTION = 18;

// Link quality: these label strings are considered non-descriptive
export const BAD_LINK_LABELS = new Set([
  'click here', 'here', 'read more', 'more', 'link', 'this link',
  'this page', 'learn more', 'details', 'info', 'more info',
  'go', 'visit', 'open', 'view', 'see more', 'click',
]);

/** pdfaf-style extra generic link phrases (Tier A); merged at runtime with BAD_LINK_LABELS in link scorer. */
export const GENERIC_LINK_PHRASES_EXTRA = [
  'find out more',
  'continue',
  'go here',
  'download',
] as const;

/**
 * Reading order: visible annotations missing `/StructParent` (pdfaf tabOrder parity).
 * Deduction = min(MAX, link*LINK_WEIGHT + nonLink*NONLINK_WEIGHT), subtracted from a 100 baseline.
 */
export const READING_ORDER_UNOWNED_LINK_WEIGHT = 4;
export const READING_ORDER_UNOWNED_NONLINK_WEIGHT = 2;
export const READING_ORDER_UNOWNED_MAX_DEDUCTION = 45;

/** Link quality: /Link annots with StructParent missing (distinct from ParentTree role mismatch). */
export const LINK_QUALITY_MISSING_STRUCT_PARENT_WEIGHT = 2;
export const LINK_QUALITY_MISSING_STRUCT_PARENT_MAX_DEDUCTION = 12;

// Concurrency / resource limits
export const MAX_CONCURRENT_ANALYSES = parseInt(process.env['MAX_CONCURRENT_ANALYSES'] ?? '5', 10);
export const PDFJS_TIMEOUT_MS        = 60_000;
export const PYTHON_TIMEOUT_MS       = 45_000;
export const QPDF_TIMEOUT_MS         = parseInt(process.env['QPDF_TIMEOUT_MS'] ?? '60000', 10);
export const MAX_FILE_SIZE_MB        = parseInt(process.env['MAX_FILE_SIZE_MB'] ?? '100', 10);

// Hash cache: keep results for identical PDFs for this long (ms)
export const ANALYSIS_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

// Python structure analysis: cap items to prevent runaway on malformed trees
export const MAX_STRUCTURE_ITEMS = 2000;

// Paths — prefer project-root `python/` (Docker + `node dist/`) over relative-to-compiled-file URL.
function resolvePythonScriptPath(): string {
  const env = process.env['PDFAF_PYTHON_SCRIPT']?.trim();
  if (env && existsSync(env)) return env;
  const fromCwd = join(process.cwd(), 'python', 'pdf_analysis_helper.py');
  if (existsSync(fromCwd)) return fromCwd;
  return new URL('../python/pdf_analysis_helper.py', import.meta.url).pathname;
}

export const PYTHON_SCRIPT_PATH = resolvePythonScriptPath();
export const DB_PATH = process.env['DB_PATH'] ?? './data/pdfaf.db';
export const PORT    = parseInt(process.env['PORT'] ?? '6200', 10);

// ─── Phase 2 — deterministic remediation ─────────────────────────────────────

/** Max planner/orchestrator rounds (each round may run multiple stages). */
/** Extra rounds let late-stage tools (e.g. mark_untagged_content_as_artifact) run after structure passes. */
export const REMEDIATION_MAX_ROUNDS = parseInt(process.env['REMEDIATION_MAX_ROUNDS'] ?? '5', 10);

/** Stop when weighted score reaches this (inclusive). */
export const REMEDIATION_TARGET_SCORE = parseInt(process.env['REMEDIATION_TARGET_SCORE'] ?? '95', 10);

/** Category is “failing” for remediation planning when score < this (0–100). */
export const REMEDIATION_CATEGORY_THRESHOLD = parseInt(
  process.env['REMEDIATION_CATEGORY_THRESHOLD'] ?? '95',
  10,
);

/** JSON response base64 limit for remediated PDF (MB); larger PDFs require future multipart. */
export const REMEDIATION_MAX_BASE64_MB = parseInt(process.env['REMEDIATION_MAX_BASE64_MB'] ?? '10', 10);

/** Python mutation subprocess timeout (ms). */
export const PYTHON_MUTATION_TIMEOUT_MS = parseInt(
  process.env['PYTHON_MUTATION_TIMEOUT_MS'] ?? '120000',
  10,
);

/** `ocr_scanned_pdf` uses ocrmypdf + Tesseract; large scans need a much higher ceiling than normal mutations. */
export const OCR_MUTATION_TIMEOUT_MS = parseInt(
  process.env['PDFAF_OCR_MUTATION_TIMEOUT_MS'] ?? String(45 * 60 * 1000),
  10,
);

/**
 * Allow `ocr_scanned_pdf` on `native_untagged` / `native_tagged` when pdf.js extracted at most this many
 * characters (image-only or flattened raster pages). Default `0` means only when there is no text at all.
 */
const _ocrNativeMax = parseInt(process.env['PDFAF_OCR_NATIVE_ELIGIBLE_MAX_TEXT_CHARS'] ?? '0', 10);
export const OCR_NATIVE_ELIGIBLE_MAX_TEXT_CHARS =
  Number.isFinite(_ocrNativeMax) && _ocrNativeMax >= 0 ? _ocrNativeMax : 0;

/**
 * When PDF Producer/Creator metadata suggests OCR (OCRmyPDF, Tesseract, etc.), cap
 * `text_extractability` for `native_tagged` docs with extractable text so the API score does not
 * imply perfect OCR. Default `100` = finding only, no numeric penalty; set e.g. `88` for stricter grading.
 */
const _ocrMetaTexCap = parseInt(process.env['PDFAF_OCR_METADATA_TEXT_EXTRACTABILITY_CAP'] ?? '100', 10);
export const OCR_METADATA_TEXT_EXTRACTABILITY_CAP =
  Number.isFinite(_ocrMetaTexCap) && _ocrMetaTexCap >= 0 && _ocrMetaTexCap <= 100 ? _ocrMetaTexCap : 100;

/** After this many `no_effect` outcomes for the same tool name, skip further attempts this run. */
export const REMEDIATION_MAX_NO_EFFECT_PER_TOOL = parseInt(
  process.env['REMEDIATION_MAX_NO_EFFECT_PER_TOOL'] ?? '2',
  10,
);

/**
 * Max successful applications per run for `set_figure_alt_text` and separately for
 * `mark_figure_decorative` (planner repeats until no targets or cap). Override via env on huge docs.
 */
export const REMEDIATION_MAX_FIGURE_ALT_MUTATIONS_PER_RUN = parseInt(
  process.env['PDFAF_MAX_FIGURE_ALT_MUTATIONS_PER_RUN'] ?? '500',
  10,
);

/** Minimum score improvement (points) in a round to count as “progress” for loop continuation. */
export const REMEDIATION_MIN_ROUND_IMPROVEMENT = parseFloat(
  process.env['REMEDIATION_MIN_ROUND_IMPROVEMENT'] ?? '1',
);

// ─── Phase 4 — learning / playbooks ───────────────────────────────────────────

/** Minimum total score gain (before → after) to persist a learned playbook from a full loop. */
export const PLAYBOOK_LEARN_MIN_SCORE_DELTA = parseFloat(
  process.env['PLAYBOOK_LEARN_MIN_SCORE_DELTA'] ?? '5',
);

/** Rolling window of tool_outcomes rows for reliability (per tool + pdfClass). */
export const TOOL_OUTCOME_ROLLING_WINDOW = parseInt(
  process.env['TOOL_OUTCOME_ROLLING_WINDOW'] ?? '20',
  10,
);

/** When fewer than this many outcomes exist in the window, planner treats success rate optimistically. */
export const TOOL_OUTCOME_MIN_ATTEMPTS_FOR_ACTUAL = parseInt(
  process.env['TOOL_OUTCOME_MIN_ATTEMPTS_FOR_ACTUAL'] ?? '3',
  10,
);

export const TOOL_OUTCOME_OPTIMISTIC_SUCCESS_RATE = parseFloat(
  process.env['TOOL_OUTCOME_OPTIMISTIC_SUCCESS_RATE'] ?? '0.85',
);

/** Drop tools from the plan when we have enough data and success rate is this low or worse. */
export const TOOL_RELIABILITY_FILTER_MIN_ATTEMPTS = parseInt(
  process.env['TOOL_RELIABILITY_FILTER_MIN_ATTEMPTS'] ?? '10',
  10,
);

export const TOOL_RELIABILITY_FILTER_MAX_SUCCESS_RATE = parseFloat(
  process.env['TOOL_RELIABILITY_FILTER_MAX_SUCCESS_RATE'] ?? '0.2',
);

export const PLAYBOOK_PROMOTE_MIN_SUCCESSES = parseInt(
  process.env['PLAYBOOK_PROMOTE_MIN_SUCCESSES'] ?? '3',
  10,
);

export const PLAYBOOK_PROMOTE_MIN_SUCCESS_RATE = parseFloat(
  process.env['PLAYBOOK_PROMOTE_MIN_SUCCESS_RATE'] ?? '0.6',
);

export const PLAYBOOK_RETIRE_MIN_ATTEMPTS = parseInt(
  process.env['PLAYBOOK_RETIRE_MIN_ATTEMPTS'] ?? '10',
  10,
);

export const PLAYBOOK_RETIRE_MAX_SUCCESS_RATE = parseFloat(
  process.env['PLAYBOOK_RETIRE_MAX_SUCCESS_RATE'] ?? '0.4',
);

/** Tool names for deterministic remediation (Phase 2). */
export const REMEDIATION_TOOL_STAGE_ORDER: Record<string, number> = {
  set_pdfua_identification:            1,
  set_document_title:                  1,
  set_document_language:               1,
  bootstrap_struct_tree:               2,
  repair_structure_conformance:        2,
  wrap_singleton_orphan_mcid:          2,
  remap_orphan_mcids_as_artifacts:     2,
  mark_untagged_content_as_artifact:   9,
  set_link_annotation_contents:        3,
  repair_native_link_structure:        3,
  tag_unowned_annotations:             3,
  normalize_annotation_tab_order:      4,
  repair_native_table_headers:         4,
  repair_list_li_wrong_parent:         4,
  repair_native_reading_order:         4,
  normalize_heading_hierarchy:         4,
  replace_bookmarks_from_headings:     4,
  add_page_outline_bookmarks:          5,
  set_figure_alt_text:                 6,
  mark_figure_decorative:              6,
  repair_alt_text_structure:           6,
  repair_annotation_alt_text:          6,
  retag_as_figure:                     6,
  set_table_header_cells:              6,
  ocr_scanned_pdf:                     7,
  tag_ocr_text_blocks:                 8,
  tag_native_text_blocks:              8,
  fill_form_field_tooltips:            5,
};

/** Failing category (key) → ordered tool names (see generalization rules in PRD). */
export const REMEDIATION_CRITERION_TOOL_MAP: Record<string, readonly string[]> = {
  title_language:       ['set_document_title', 'set_document_language'],
  pdf_ua_compliance:    ['set_pdfua_identification', 'bootstrap_struct_tree', 'repair_structure_conformance', 'repair_list_li_wrong_parent', 'wrap_singleton_orphan_mcid', 'remap_orphan_mcids_as_artifacts', 'tag_unowned_annotations', 'repair_annotation_alt_text', 'tag_native_text_blocks', 'tag_ocr_text_blocks', 'mark_untagged_content_as_artifact'],
  alt_text:             ['set_figure_alt_text', 'mark_figure_decorative', 'repair_alt_text_structure', 'repair_annotation_alt_text', 'retag_as_figure'],
  heading_structure:    ['normalize_heading_hierarchy'],
  table_markup:         ['set_table_header_cells', 'repair_native_table_headers'],
  link_quality:         ['set_link_annotation_contents', 'repair_native_link_structure', 'tag_unowned_annotations'],
  bookmarks:            ['replace_bookmarks_from_headings', 'add_page_outline_bookmarks'],
  text_extractability:  ['bootstrap_struct_tree', 'ocr_scanned_pdf', 'tag_native_text_blocks', 'tag_ocr_text_blocks', 'mark_untagged_content_as_artifact'],
  reading_order:        ['normalize_annotation_tab_order', 'repair_native_reading_order', 'repair_annotation_alt_text'],
  form_accessibility:   ['fill_form_field_tooltips'],
  color_contrast:       [],
} as const satisfies Record<keyof typeof SCORING_WEIGHTS, readonly string[]>;

/** Tools with working implementations in Phase 2 MVP (expand over time). */
export const REMEDIATION_IMPLEMENTED_TOOLS: readonly string[] = [
  'set_document_title',
  'set_document_language',
  'set_pdfua_identification',
  'bootstrap_struct_tree',
  'repair_structure_conformance',
  'wrap_singleton_orphan_mcid',
  'remap_orphan_mcids_as_artifacts',
  'mark_untagged_content_as_artifact',
  'set_link_annotation_contents',
  'repair_native_link_structure',
  'tag_unowned_annotations',
  'normalize_annotation_tab_order',
  'normalize_heading_hierarchy',
  'repair_annotation_alt_text',
  'set_figure_alt_text',
  'mark_figure_decorative',
  'repair_alt_text_structure',
  'replace_bookmarks_from_headings',
  'add_page_outline_bookmarks',
  'set_table_header_cells',
  'repair_native_table_headers',
  'repair_list_li_wrong_parent',
  'ocr_scanned_pdf',
  'tag_ocr_text_blocks',
  'tag_native_text_blocks',
  'fill_form_field_tooltips',
] as const;

// ─── Phase 3 — semantic (LLM) remediation ────────────────────────────────────

/**
 * Default `model` for OpenAI-compatible `/v1/chat/completions` (figure vision, headings, etc.).
 * Matches the Gemma 4 E2B Q4 product stack used with PDFAF v1; your server may expose a different
 * id — copy the exact value from `GET …/v1/models` (e.g. llama-server often uses the GGUF basename).
 */
export const DEFAULT_OPENAI_COMPAT_MODEL = 'google/gemma-4-E2B-it';

/** Read on each call so `PDFAF_RUN_LOCAL_LLM` can populate `process.env` after startup. */
export function getOpenAiCompatBaseUrl(): string {
  return process.env['OPENAI_COMPAT_BASE_URL']?.trim() ?? '';
}

export function getOpenAiCompatApiKey(): string {
  return process.env['OPENAI_COMPAT_API_KEY']?.trim() ?? '';
}

export function getOpenAiCompatModel(): string {
  return process.env['OPENAI_COMPAT_MODEL']?.trim() || DEFAULT_OPENAI_COMPAT_MODEL;
}

export function getOpenAiCompatFallbackBaseUrl(): string {
  return process.env['OPENAI_COMPAT_FALLBACK_BASE_URL']?.trim() ?? '';
}

export function getOpenAiCompatFallbackApiKey(): string {
  return process.env['OPENAI_COMPAT_FALLBACK_API_KEY']?.trim() ?? '';
}

export function getOpenAiCompatFallbackModel(): string {
  return process.env['OPENAI_COMPAT_FALLBACK_MODEL']?.trim() || DEFAULT_OPENAI_COMPAT_MODEL;
}

/** When `1`, start llama.cpp `llama-server` in-process before HTTP (unless `OPENAI_COMPAT_BASE_URL` is already set). */
export function runLocalLlmEnabled(): boolean {
  return process.env['PDFAF_RUN_LOCAL_LLM'] === '1';
}

/** Port for embedded `llama-server` (OpenAI base URL becomes `http://127.0.0.1:{port}/v1`). */
export const PDFAF_LLAMA_PORT = parseInt(process.env['PDFAF_LLAMA_PORT'] ?? '1234', 10);

/** GGUF repo for embedded `llama-server -hf` (E2B instruct; Q4_K_M lives on unsloth; google card is Safetensors-only). */
export const GEMMA4_HF_REPO =
  process.env['GEMMA4_HF_REPO']?.trim() || 'unsloth/gemma-4-E2B-it-GGUF';

/** GGUF filename inside that repo (`Q4_K_M` is the default balanced quant). */
export const GEMMA4_GGUF_FILE = process.env['GEMMA4_GGUF_FILE']?.trim() || 'gemma-4-E2B-it-Q4_K_M.gguf';

/** Multimodal projector filename inside that repo (required for image-based semantic passes). */
export const GEMMA4_MMPROJ_FILE = process.env['GEMMA4_MMPROJ_FILE']?.trim() || 'mmproj-F16.gguf';

/** Path or name of `llama-server` binary. */
export const LLAMA_SERVER_BIN = process.env['LLAMA_SERVER_BIN']?.trim() || 'llama-server';

/** CWD for embedded `llama-server` (downloads land here; keeps repo root clean). */
export const PDFAF_LLAMA_WORKDIR =
  process.env['PDFAF_LLAMA_WORKDIR']?.trim() || join(process.cwd(), 'data', 'llama-work');

/** Max wait for embedded server to answer `/v1/models` (first run may download weights). */
export const PDFAF_LLAMA_READY_TIMEOUT_MS = parseInt(
  process.env['PDFAF_LLAMA_READY_TIMEOUT_MS'] ?? '600000',
  10,
);

/** Per chat/completions request (ms). */
export const SEMANTIC_REQUEST_TIMEOUT_MS = parseInt(
  process.env['SEMANTIC_REQUEST_TIMEOUT_MS'] ?? '120000',
  10,
);

/** Max parallel LLM requests for figure batches. */
export const SEMANTIC_REQUEST_CONCURRENCY = parseInt(process.env['SEMANTIC_REQUEST_CONCURRENCY'] ?? '2', 10);

/** Accept LLM figure proposal when confidence >= this. */
export const SEMANTIC_MIN_FIGURE_CONFIDENCE = parseFloat(
  process.env['SEMANTIC_MIN_FIGURE_CONFIDENCE'] ?? '0.6',
);

/** Max figure candidates sent to LLM per remediation pass (cap cost per pass). */
export const SEMANTIC_MAX_FIGURE_CANDIDATES = parseInt(process.env['SEMANTIC_MAX_FIGURE_CANDIDATES'] ?? '96', 10);

/** Figures per chat request (each may include one page image shared in batch). */
export const SEMANTIC_FIGURE_BATCH_SIZE = parseInt(process.env['SEMANTIC_FIGURE_BATCH_SIZE'] ?? '6', 10);

/** When `semantic: true`, run up to this many figure passes in a row (re-analyze between passes) until no proposals. */
export const SEMANTIC_REMEDIATE_FIGURE_PASSES = parseInt(
  process.env['SEMANTIC_REMEDIATE_FIGURE_PASSES'] ?? '10',
  10,
);

/** When `semanticPromoteHeadings: true`, run up to this many promote passes (remaining /P candidates). */
export const SEMANTIC_REMEDIATE_PROMOTE_PASSES = parseInt(
  process.env['SEMANTIC_REMEDIATE_PROMOTE_PASSES'] ?? '4',
  10,
);

/** Longest edge of rendered page image for vision (px). */
export const SEMANTIC_PAGE_RENDER_MAX_PX = parseInt(process.env['SEMANTIC_PAGE_RENDER_MAX_PX'] ?? '768', 10);

/** JPEG quality 1–100 for page renders. */
export const SEMANTIC_PAGE_JPEG_QUALITY = parseInt(process.env['SEMANTIC_PAGE_JPEG_QUALITY'] ?? '82', 10);

/** Max encoded image size per page render (bytes); lower quality if exceeded. */
export const SEMANTIC_MAX_IMAGE_BYTES = parseInt(process.env['SEMANTIC_MAX_IMAGE_BYTES'] ?? '92160', 10); // ~90KB

/** Pages to scan for layout heuristics (subset of document). */
export const SEMANTIC_LAYOUT_MAX_PAGES = parseInt(process.env['SEMANTIC_LAYOUT_MAX_PAGES'] ?? '20', 10);

/** Min distinct sampled pages with same repeated line (header/footer heuristic). */
export const SEMANTIC_LAYOUT_REPEAT_MIN_PAGES = parseInt(
  process.env['SEMANTIC_LAYOUT_REPEAT_MIN_PAGES'] ?? '2',
  10,
);

/** Min normalized text length to consider for repeat detection. */
export const SEMANTIC_LAYOUT_REPEAT_MIN_TEXT_LEN = parseInt(
  process.env['SEMANTIC_LAYOUT_REPEAT_MIN_TEXT_LEN'] ?? '4',
  10,
);

/** Normalized Y bucket size (0–1 scale) for clustering repeated lines. */
export const SEMANTIC_LAYOUT_Y_NORM_BUCKET = parseFloat(
  process.env['SEMANTIC_LAYOUT_Y_NORM_BUCKET'] ?? '0.04',
);

/** Mean normalized Y above this → treat band as header (pdf y increases upward). */
export const SEMANTIC_LAYOUT_HEADER_YNORM_MIN = parseFloat(
  process.env['SEMANTIC_LAYOUT_HEADER_YNORM_MIN'] ?? '0.72',
);

/** Mean normalized Y below this → treat band as footer. */
export const SEMANTIC_LAYOUT_FOOTER_YNORM_MAX = parseFloat(
  process.env['SEMANTIC_LAYOUT_FOOTER_YNORM_MAX'] ?? '0.28',
);

/** Pad header/footer band bbox vertically (pt). */
export const SEMANTIC_LAYOUT_BAND_PAD_PT = parseFloat(process.env['SEMANTIC_LAYOUT_BAND_PAD_PT'] ?? '4');

/** Promote: min matched text length when excluding header/footer via layout text overlap. */
export const SEMANTIC_PROMOTE_LAYOUT_TEXT_MIN_LEN = parseInt(
  process.env['SEMANTIC_PROMOTE_LAYOUT_TEXT_MIN_LEN'] ?? '8',
  10,
);

/** Max caption lines injected per page into figure semantic prompts. */
export const SEMANTIC_FIGURE_PROMPT_MAX_CAPTIONS_PER_PAGE = parseInt(
  process.env['SEMANTIC_FIGURE_PROMPT_MAX_CAPTIONS_PER_PAGE'] ?? '6',
  10,
);

/** Max header/footer band lines listed per page in figure prompts. */
export const SEMANTIC_FIGURE_PROMPT_MAX_BAND_LINES_PER_PAGE = parseInt(
  process.env['SEMANTIC_FIGURE_PROMPT_MAX_BAND_LINES_PER_PAGE'] ?? '4',
  10,
);

/** Weighted score drop allowed after semantic apply before full revert. */
export const SEMANTIC_REGRESSION_TOLERANCE = parseFloat(process.env['SEMANTIC_REGRESSION_TOLERANCE'] ?? '1');

/** Accept LLM heading level proposal when confidence >= this. */
export const SEMANTIC_MIN_HEADING_CONFIDENCE = parseFloat(
  process.env['SEMANTIC_MIN_HEADING_CONFIDENCE'] ?? '0.65',
);

/** Max heading structure elements sent to LLM per remediation. */
export const SEMANTIC_MAX_HEADING_CANDIDATES = parseInt(
  process.env['SEMANTIC_MAX_HEADING_CANDIDATES'] ?? '48',
  10,
);

/** Headings per chat request (text-only). */
export const SEMANTIC_HEADING_BATCH_SIZE = parseInt(process.env['SEMANTIC_HEADING_BATCH_SIZE'] ?? '8', 10);

/** Max parallel LLM requests for heading batches (defaults to figure concurrency). */
export const SEMANTIC_HEADING_REQUEST_CONCURRENCY = parseInt(
  process.env['SEMANTIC_HEADING_REQUEST_CONCURRENCY'] ?? `${SEMANTIC_REQUEST_CONCURRENCY}`,
  10,
);

/** Accept LLM promote-to-heading proposal when confidence >= this (Phase 3c-a). */
export const SEMANTIC_MIN_PROMOTE_CONFIDENCE = parseFloat(
  process.env['SEMANTIC_MIN_PROMOTE_CONFIDENCE'] ?? '0.60',
);

/** Max paragraph-like struct elems considered for promotion per remediation pass. */
export const SEMANTIC_MAX_PROMOTE_CANDIDATES = parseInt(
  process.env['SEMANTIC_MAX_PROMOTE_CANDIDATES'] ?? '80',
  10,
);

/** Paragraph-like elems per promote-heading chat request. */
export const SEMANTIC_PROMOTE_BATCH_SIZE = parseInt(process.env['SEMANTIC_PROMOTE_BATCH_SIZE'] ?? '8', 10);

/** Max parallel LLM requests for promote batches. */
export const SEMANTIC_PROMOTE_REQUEST_CONCURRENCY = parseInt(
  process.env['SEMANTIC_PROMOTE_REQUEST_CONCURRENCY'] ?? `${SEMANTIC_HEADING_REQUEST_CONCURRENCY}`,
  10,
);

/** Must match `MAX_MCID_SPANS` in `python/pdf_analysis_helper.py` (Phase 3c-c analysis cap). */
export const MAX_MCID_TEXT_SPANS = 500;

/** Max pages scanned for MCID operators in Python (`PDFAF_SEMANTIC_MCID_MAX_PAGES`). */
export const SEMANTIC_MCID_MAX_PAGES = parseInt(process.env['SEMANTIC_MCID_MAX_PAGES'] ?? '50', 10);

/** Opt-in: allow `semanticUntaggedHeadings` on any Marked native_tagged PDF with /P candidates (uses `retag_struct_as_heading`). */
export function semanticUntaggedTier2Enabled(): boolean {
  return process.env['PDFAF_SEMANTIC_UNTAGGED_TIER2'] === '1';
}

/** When `PDFAF_SEMANTIC_DEBUG_LOG=1`, `/v1/remediate` logs semantic pass `skippedReason` values (low volume). */
export function semanticDebugLogEnabled(): boolean {
  return process.env['PDFAF_SEMANTIC_DEBUG_LOG'] === '1';
}

/**
 * When `PDFAF_REMEDIATE_DEFAULT_SEMANTIC=1` (e.g. Docker compose), merge these into `/v1/remediate`
 * before per-request `options` so figure + heading LLM passes run unless the client overrides with
 * explicit `false`. Tests set `PDFAF_REMEDIATE_DEFAULT_SEMANTIC=0` (see vitest.config).
 */
export function getDefaultRemediateSemanticOptions(): {
  semantic?: boolean;
  semanticHeadings?: boolean;
  semanticPromoteHeadings?: boolean;
  semanticUntaggedHeadings?: boolean;
} {
  if (process.env['PDFAF_REMEDIATE_DEFAULT_SEMANTIC'] !== '1') {
    return {};
  }
  return {
    semantic: true,
    semanticHeadings: process.env['PDFAF_REMEDIATE_DEFAULT_SEMANTIC_HEADINGS'] !== '0',
    semanticPromoteHeadings: process.env['PDFAF_REMEDIATE_DEFAULT_SEMANTIC_PROMOTE'] === '1',
    semanticUntaggedHeadings: process.env['PDFAF_REMEDIATE_DEFAULT_SEMANTIC_UNTAGGED'] === '1',
  };
}

// ─── Phase 5 — polish / production ───────────────────────────────────────────

export const NODE_ENV = process.env['NODE_ENV'] ?? 'development';

export function isProductionNodeEnv(): boolean {
  return NODE_ENV === 'production';
}

/** Max requests per IP per window for `POST /v1/analyze`. */
export const RATE_LIMIT_ANALYZE_MAX = parseInt(process.env['RATE_LIMIT_ANALYZE_MAX'] ?? '30', 10);

/** Window (ms) for analyze rate limit. */
export const RATE_LIMIT_ANALYZE_WINDOW_MS = parseInt(
  process.env['RATE_LIMIT_ANALYZE_WINDOW_MS'] ?? `${60 * 1000}`,
  10,
);

/** Max requests per IP per window for `POST /v1/remediate`. */
export const RATE_LIMIT_REMEDIATE_MAX = parseInt(process.env['RATE_LIMIT_REMEDIATE_MAX'] ?? '10', 10);

export const RATE_LIMIT_REMEDIATE_WINDOW_MS = parseInt(
  process.env['RATE_LIMIT_REMEDIATE_WINDOW_MS'] ?? `${60 * 1000}`,
  10,
);

/** Wall-clock guard for analyze handler (ms); 0 disables. */
export const REQUEST_TIMEOUT_ANALYZE_MS = parseInt(
  process.env['REQUEST_TIMEOUT_ANALYZE_MS'] ?? '120000',
  10,
);

/** Wall-clock guard for remediate handler (ms); 0 disables. */
export const REQUEST_TIMEOUT_REMEDIATE_MS = parseInt(
  process.env['REQUEST_TIMEOUT_REMEDIATE_MS'] ?? '300000',
  10,
);

/** Health check: probe LLM base URL reachability (ms). */
export const HEALTH_LLM_PROBE_TIMEOUT_MS = parseInt(process.env['HEALTH_LLM_PROBE_TIMEOUT_MS'] ?? '3000', 10);

/** Set `PDFAF_DISABLE_RATE_LIMIT=1` in tests to avoid flaky integration suites. */
export const RATE_LIMIT_ENABLED = process.env['PDFAF_DISABLE_RATE_LIMIT'] !== '1';
