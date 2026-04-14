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
