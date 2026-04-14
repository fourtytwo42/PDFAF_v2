// Single source of truth for all constants.
// No inline magic numbers anywhere else in the codebase.

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

// Scanned page detection: fraction of pages that are image-only
export const SCANNED_PAGE_RATIO_THRESHOLD = 0.85;
export const MIXED_PAGE_RATIO_THRESHOLD   = 0.40;

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

// Link quality: these label strings are considered non-descriptive
export const BAD_LINK_LABELS = new Set([
  'click here', 'here', 'read more', 'more', 'link', 'this link',
  'this page', 'learn more', 'details', 'info', 'more info',
  'go', 'visit', 'open', 'view', 'see more', 'click',
]);

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

// Paths
export const PYTHON_SCRIPT_PATH = new URL('../python/pdf_analysis_helper.py', import.meta.url).pathname;
export const DB_PATH = process.env['DB_PATH'] ?? './data/pdfaf.db';
export const PORT    = parseInt(process.env['PORT'] ?? '6200', 10);

// ─── Phase 2 — deterministic remediation ─────────────────────────────────────

/** Max planner/orchestrator rounds (each round may run multiple stages). */
export const REMEDIATION_MAX_ROUNDS = parseInt(process.env['REMEDIATION_MAX_ROUNDS'] ?? '3', 10);

/** Stop when weighted score reaches this (inclusive). */
export const REMEDIATION_TARGET_SCORE = parseInt(process.env['REMEDIATION_TARGET_SCORE'] ?? '90', 10);

/** Category is “failing” for remediation planning when score < this (0–100). */
export const REMEDIATION_CATEGORY_THRESHOLD = parseInt(
  process.env['REMEDIATION_CATEGORY_THRESHOLD'] ?? '90',
  10,
);

/** JSON response base64 limit for remediated PDF (MB); larger PDFs require future multipart. */
export const REMEDIATION_MAX_BASE64_MB = parseInt(process.env['REMEDIATION_MAX_BASE64_MB'] ?? '10', 10);

/** Python mutation subprocess timeout (ms). */
export const PYTHON_MUTATION_TIMEOUT_MS = parseInt(
  process.env['PYTHON_MUTATION_TIMEOUT_MS'] ?? '120000',
  10,
);

/** After this many `no_effect` outcomes for the same tool name, skip further attempts this run. */
export const REMEDIATION_MAX_NO_EFFECT_PER_TOOL = parseInt(
  process.env['REMEDIATION_MAX_NO_EFFECT_PER_TOOL'] ?? '2',
  10,
);

/** Minimum score improvement (points) in a round to count as “progress” for loop continuation. */
export const REMEDIATION_MIN_ROUND_IMPROVEMENT = parseFloat(
  process.env['REMEDIATION_MIN_ROUND_IMPROVEMENT'] ?? '1',
);

/** Tool names for deterministic remediation (Phase 2). */
export const REMEDIATION_TOOL_STAGE_ORDER: Record<string, number> = {
  set_pdfua_identification:       1,
  set_document_title:             1,
  set_document_language:          1,
  bootstrap_struct_tree:          2,
  repair_structure_conformance:   2,
  repair_native_link_structure:  3,
  repair_native_table_headers:   4,
  repair_native_reading_order:     4,
  normalize_heading_hierarchy:   5,
  replace_bookmarks_from_headings: 5,
  set_link_annotation_contents:   5,
  set_figure_alt_text:             6,
  mark_figure_decorative:          6,
  retag_as_figure:                 6,
  set_table_header_cells:          6,
  ocr_scanned_pdf:                 7,
};

/** Failing category (key) → ordered tool names (see generalization rules in PRD). */
export const REMEDIATION_CRITERION_TOOL_MAP: Record<string, readonly string[]> = {
  title_language:       ['set_document_title', 'set_document_language'],
  pdf_ua_compliance:    ['set_pdfua_identification', 'repair_structure_conformance'],
  alt_text:             ['set_figure_alt_text', 'mark_figure_decorative', 'retag_as_figure'],
  heading_structure:    ['normalize_heading_hierarchy'],
  table_markup:         ['set_table_header_cells', 'repair_native_table_headers'],
  link_quality:         ['set_link_annotation_contents', 'repair_native_link_structure'],
  bookmarks:            ['replace_bookmarks_from_headings'],
  text_extractability:  ['bootstrap_struct_tree', 'ocr_scanned_pdf'],
  reading_order:        ['repair_native_reading_order'],
  form_accessibility:   [],
  color_contrast:       [],
} as const satisfies Record<keyof typeof SCORING_WEIGHTS, readonly string[]>;

/** Tools with working implementations in Phase 2 MVP (expand over time). */
export const REMEDIATION_IMPLEMENTED_TOOLS: readonly string[] = [
  'set_document_title',
  'set_document_language',
  'set_pdfua_identification',
  'bootstrap_struct_tree',
  'repair_structure_conformance',
  'set_figure_alt_text',
  'mark_figure_decorative',
] as const;
