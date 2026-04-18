import type { SCORING_WEIGHTS } from './config.js';

// ─── Core domain types ────────────────────────────────────────────────────────

export type PdfClass  = 'native_tagged' | 'native_untagged' | 'scanned' | 'mixed';
export type CategoryKey = keyof typeof SCORING_WEIGHTS;
export type Severity  = 'critical' | 'moderate' | 'minor' | 'pass';
export type Grade     = 'A' | 'B' | 'C' | 'D' | 'F';
export type EvidenceLevel = 'verified' | 'heuristic' | 'inferred_after_fix' | 'manual_review_required';
export type VerificationLevel = 'verified' | 'mixed' | 'heuristic' | 'manual_review_required';

// ─── Structure tree node (minimal, for reading order check) ──────────────────

export interface StructNode {
  type: string;
  page?: number;
  children: StructNode[];
}

// ─── DocumentSnapshot: merged output of pdfjs + pikepdf analysis ─────────────

export interface DocumentSnapshot {
  // --- from pdfjs ---
  pageCount: number;
  textByPage: string[];             // one string per page (joined text content)
  textCharCount: number;            // total characters across all pages
  imageOnlyPageCount: number;       // pages where images dominate (>80% ops)
  metadata: {
    title?: string;
    language?: string;
    author?: string;
    subject?: string;
    /** PDF /Info Producer when present (from pdf.js). Used to detect OCR engines in scoring. */
    producer?: string;
    /** PDF /Info Creator when present (from pdf.js). */
    creator?: string;
  };
  links: Array<{
    text: string;
    url: string;
    page: number;
  }>;
  formFieldsFromPdfjs: Array<{
    name: string;
    page: number;
    /** Present when pdf.js exposes a field label / description */
    tooltip?: string | null;
  }>;

  // --- from pikepdf (pdf_analysis_helper.py) ---
  isTagged: boolean;
  markInfo: { Marked: boolean } | null;
  lang: string | null;              // /Root/Lang
  pdfUaVersion: string | null;      // XMP pdfuaid:part value (e.g. "1")
  structTitle?: string;             // /Info /Title from PDF dict
  headings: Array<{
    level: number;                  // 1–6 (H1–H6; H maps to 1)
    text: string;
    page: number;
    /** Indirect object `num_gen` for pikepdf mutations; absent for inline/unregistered nodes */
    structRef?: string;
  }>;
  figures: Array<{
    hasAlt: boolean;
    altText?: string;
    isArtifact: boolean;
    page: number;
    structRef?: string;
    bbox?: [number, number, number, number];
  }>;
  tables: Array<{
    hasHeaders: boolean;
    headerCount: number;
    totalCells: number;
    page: number;
    structRef?: string;
    /** Number of TR elements directly under this Table. */
    rowCount?: number;
    /** TH/TD elements found directly under Table (not under TR) — structural violation. */
    cellsMisplacedCount?: number;
    /** Number of TR rows with a different cell count than the first row (regularity check). */
    irregularRows?: number;
    /** Per-TR TH+TD counts (bounded) for advisory regularity (pdfaf Tier A). */
    rowCellCounts?: number[];
    dominantColumnCount?: number;
    maxRowSpan?: number;
    maxColSpan?: number;
  }>;
  /** Tagged paragraph-like structure elements (Phase 3c analysis). */
  paragraphStructElems?: Array<{
    tag: string;
    text: string;
    page: number;
    structRef: string;
    /** Page-space quad when derivable from structure attributes (optional). */
    bbox?: [number, number, number, number];
  }>;
  /** True when Python detected pdfaf-3cc-golden-v1 producer (Phase 3c-c CI fixture). */
  threeCcGoldenV1?: boolean;
  /** True when Python detected pdfaf-3cc-orphan-v1 producer (orphan MCID CI fixture). */
  threeCcGoldenOrphanV1?: boolean;
  /** MCIDs present in content streams but not referenced by structure /K (bounded). */
  orphanMcids?: Array<{ page: number; mcid: number }>;
  /** Marked-content MCID operators found in page streams (bounded list). */
  mcidTextSpans?: Array<{ page: number; mcid: number; snippet: string; resolvedText?: string }>;
  /** Acrobat-oriented tagged-content signals (bounded heuristics; not full TaggedCont parity). */
  taggedContentAudit?: {
    orphanMcidCount: number;
    mcidTextSpanCount: number;
    suspectedPathPaintOutsideMc: number;
  };
  /**
   * Structure-tree patterns Acrobat flags (OtherAltText / NestedAltText / AltTextNoContent families).
   * From pikepdf walk aligned with PDFAF v1 `acrobat_alt_risk_nodes`.
   */
  acrobatStyleAltRisks?: {
    nonFigureWithAltCount: number;
    nestedFigureAltCount: number;
    orphanedAltEmptyElementCount: number;
    sampleOwnershipModes?: string[];
  };
  /**
   * List structure analysis from pikepdf (Acrobat ListItems / LblLBody checks).
   * Counts L, LI, Lbl, LBody elements and detects parentage violations.
   */
  listStructureAudit?: {
    listCount: number;
    listItemCount: number;
    /** LI elements not directly under an L element. */
    listItemMisplacedCount: number;
    /** Lbl or LBody elements not directly under an LI element. */
    lblBodyMisplacedCount: number;
    /** L elements with no direct LI children. */
    listsWithoutItems: number;
  };
  /**
   * Acrobat-oriented accessibility signals from pikepdf (annotations, /Tabs).
   * Omitted counts are treated as zero by the scorer.
   */
  annotationAccessibility?: {
    pagesMissingTabsS: number;
    pagesAnnotationOrderDiffers: number;
    linkAnnotationsMissingStructure: number;
    nonLinkAnnotationsMissingStructure: number;
    nonLinkAnnotationsMissingContents: number;
    /** Visible /Link annotations with no /StructParent (pdfaf tabOrder parity). */
    linkAnnotationsMissingStructParent: number;
    /** Visible non-link annots with no /StructParent. */
    nonLinkAnnotationsMissingStructParent: number;
  };
  fonts: Array<{
    name: string;
    isEmbedded: boolean;
    hasUnicode: boolean;
    /** PDF font subtype when present (e.g. Type1, TrueType). */
    subtype?: string | null;
    /** Named /Encoding or Custom when dictionary encoding. */
    encodingName?: string | null;
    /** Heuristic: non-embedded font without ToUnicode — may trigger Acrobat CharEnc warnings. */
    encodingRisk?: boolean;
  }>;
  bookmarks: Array<{
    title: string;
    level: number;
  }>;
  formFields: Array<{
    name: string;
    tooltip?: string;
    page: number;
  }>;
  structureTree: StructNode | null;

  // --- computed during merge in pdfAnalyzer ---
  pdfClass: PdfClass;
  imageToTextRatio: number;         // imageOnlyPageCount / pageCount
}

// ─── Per-finding detail ───────────────────────────────────────────────────────

export interface Finding {
  category: CategoryKey;
  severity: Severity;
  wcag: string;                     // e.g. "1.1.1", "1.3.1", "2.4.2"
  message: string;
  count?: number;
  page?: number;
  evidence?: EvidenceLevel;
  manualReviewRequired?: boolean;
  manualReviewReason?: string;
}

export interface ScoreCapApplied {
  category: CategoryKey;
  cap: number;
  rawScore: number;
  finalScore: number;
  reason: string;
}

// ─── Per-category scored result ───────────────────────────────────────────────

export interface ScoredCategory {
  key: CategoryKey;
  score: number;                    // 0–100
  weight: number;                   // effective weight (after N/A redistribution)
  applicable: boolean;
  severity: Severity;
  findings: Finding[];
  evidence?: EvidenceLevel;
  verificationLevel?: VerificationLevel;
  manualReviewRequired?: boolean;
  manualReviewReasons?: string[];
  scoreCapsApplied?: ScoreCapApplied[];
}

// ─── Final analysis result (API response shape) ───────────────────────────────

export interface AnalysisResult {
  id: string;
  timestamp: string;                // ISO 8601
  filename: string;
  pageCount: number;
  pdfClass: PdfClass;
  score: number;                    // 0–100 weighted
  grade: Grade;
  categories: ScoredCategory[];
  findings: Finding[];              // all findings sorted by severity desc
  analysisDurationMs: number;
  verificationLevel?: VerificationLevel;
  manualReviewRequired?: boolean;
  manualReviewReasons?: string[];
  scoreCapsApplied?: ScoreCapApplied[];
}

// ─── Intermediate types from sub-services ────────────────────────────────────

export interface PdfjsResult {
  pageCount: number;
  textByPage: string[];
  textCharCount: number;
  imageOnlyPageCount: number;
  metadata: DocumentSnapshot['metadata'];
  links: DocumentSnapshot['links'];
  formFields: DocumentSnapshot['formFieldsFromPdfjs'];
}

export interface PythonAnalysisResult {
  isTagged: boolean;
  markInfo: { Marked: boolean } | null;
  lang: string | null;
  pdfUaVersion: string | null;
  title?: string;
  author?: string;
  subject?: string;
  headings: DocumentSnapshot['headings'];
  figures: DocumentSnapshot['figures'];
  tables: DocumentSnapshot['tables'];
  fonts: DocumentSnapshot['fonts'];
  bookmarks: DocumentSnapshot['bookmarks'];
  formFields: DocumentSnapshot['formFields'];
  structureTree: StructNode | null;
  paragraphStructElems?: DocumentSnapshot['paragraphStructElems'];
  threeCcGoldenV1?: boolean;
  threeCcGoldenOrphanV1?: boolean;
  orphanMcids?: DocumentSnapshot['orphanMcids'];
  mcidTextSpans?: DocumentSnapshot['mcidTextSpans'];
  annotationAccessibility?: DocumentSnapshot['annotationAccessibility'];
  /** Pikepdf scan of all pages’ /Link annotations for scorer (pdfjs samples pages). */
  linkScoringRows?: Array<{ page: number; url: string; effectiveText: string }>;
  taggedContentAudit?: DocumentSnapshot['taggedContentAudit'];
  listStructureAudit?: DocumentSnapshot['listStructureAudit'];
  acrobatStyleAltRisks?: DocumentSnapshot['acrobatStyleAltRisks'];
}

// ─── Phase 2 — remediation ────────────────────────────────────────────────────

export type RemediationToolOutcome = 'applied' | 'no_effect' | 'rejected' | 'failed';

export interface PlannedRemediationTool {
  toolName: string;
  params: Record<string, unknown>;
  rationale: string;
}

export interface RemediationStagePlan {
  stageNumber: number;
  tools: PlannedRemediationTool[];
  reanalyzeAfter: boolean;
}

export interface RemediationPlan {
  stages: RemediationStagePlan[];
}

export interface AppliedRemediationTool {
  toolName: string;
  stage: number;
  round: number;
  scoreBefore: number;
  scoreAfter: number;
  delta: number;
  outcome: RemediationToolOutcome;
  details?: string;
}

export interface RemediationRoundSummary {
  round: number;
  scoreAfter: number;
  improved: boolean;
  /** Present when the round was driven by a learned playbook fast path. */
  source?: 'planner' | 'playbook';
}

// ─── Phase 4 — playbooks / learning ───────────────────────────────────────────

export type PlaybookStatus = 'candidate' | 'active' | 'retired';

export interface PlaybookStep {
  stage: number;
  toolName: string;
  params: Record<string, unknown>;
}

export interface Playbook {
  id: string;
  failureSignature: string;
  pdfClass: string;
  toolSequence: PlaybookStep[];
  successCount: number;
  attemptCount: number;
  avgScoreImprovement: number;
  status: PlaybookStatus;
  createdAt: string;
  lastUsedAt: string | null;
}

export interface ToolReliability {
  toolName: string;
  pdfClass: PdfClass;
  attempts: number;
  successRate: number;
  avgScoreDelta: number;
}

/** Multipart `options` JSON for POST /v1/remediate (Phase 3). */
export interface RemediateRequestOptions {
  /** When true, run LLM vision pass for figure alt text after deterministic remediation. */
  semantic?: boolean;
  /** When true, run LLM text pass for heading level retags (requires structRef on headings). */
  semanticHeadings?: boolean;
  /** Override default per-request LLM timeout (ms). */
  semanticTimeoutMs?: number;
  /** Override timeout for heading semantic only (ms); falls back to semanticTimeoutMs. */
  semanticHeadingTimeoutMs?: number;
  /** When true, run LLM to promote /P struct elems to headings (Phase 3c-a; requires structRef). */
  semanticPromoteHeadings?: boolean;
  /** Timeout for promote-heading pass (ms); falls back to semanticTimeoutMs. */
  semanticPromoteHeadingTimeoutMs?: number;
  /** Experimental Phase 3c-c: untagged/insert path (currently golden PDF only). */
  semanticUntaggedHeadings?: boolean;
  semanticUntaggedHeadingTimeoutMs?: number;
  /** Target weighted score (0–100); mirrors orchestrator targetScore. */
  targetScore?: number;
  maxRounds?: number;
  /** When true, response includes `htmlReport` (self-contained HTML). */
  htmlReport?: boolean;
  htmlReportIncludeBeforeAfter?: boolean;
  htmlReportIncludeFindingsDetail?: boolean;
  htmlReportIncludeAppliedTools?: boolean;
}

export type SemanticSkippedReason =
  | 'not_requested'
  | 'no_llm_config'
  | 'alt_text_sufficient'
  | 'heading_structure_sufficient'
  | 'no_candidates'
  | 'scanned_pdf'
  | 'completed'
  | 'completed_no_changes'
  | 'regression_reverted'
  | 'llm_timeout'
  | 'unsupported_pdf'
  | 'error';

export interface SemanticBatchSummary {
  batchIndex: number;
  /** Figure structRefs (figure semantic); empty for heading-only batches. */
  figureIds: string[];
  /** Heading structRefs (heading semantic); omitted or empty for figure-only batches. */
  headingStructRefs?: string[];
  model: string;
  endpoint: 'primary' | 'fallback';
  proposalCount: number;
  error?: string;
}

export interface SemanticRemediationSummary {
  skippedReason: SemanticSkippedReason;
  durationMs: number;
  proposalsAccepted: number;
  proposalsRejected: number;
  scoreBefore: number;
  scoreAfter: number;
  batches: SemanticBatchSummary[];
  errorMessage?: string;
}

/** When `ocr_scanned_pdf` ran (or was attempted), tells API clients not to treat the headline score as PAC/Adobe-equivalent. */
export interface OcrPipelineSummary {
  /** True when OCRmyPDF completed and the PDF was updated. */
  applied: boolean;
  /** True when `ocr_scanned_pdf` was scheduled at least once (applied, failed, or reverted). */
  attempted: boolean;
  /** Always true when `attempted` — OCR output needs human / external checker review. */
  humanReviewRecommended: boolean;
  /** Short guidance for integrators and UI copy. */
  guidance: string;
}

export interface RemediationResult {
  before: AnalysisResult;
  after: AnalysisResult;
  remediatedPdfBase64: string | null;
  remediatedPdfTooLarge: boolean;
  appliedTools: AppliedRemediationTool[];
  rounds: RemediationRoundSummary[];
  remediationDurationMs: number;
  improved: boolean;
  /** Present when OCR was part of this remediation run (best-practice transparency). */
  ocrPipeline?: OcrPipelineSummary;
  /** Present when `semantic: true` was requested (even if skipped). */
  semantic?: SemanticRemediationSummary;
  /** Present when `semanticHeadings: true` was requested (even if skipped). */
  semanticHeadings?: SemanticRemediationSummary;
  /** Present when `semanticPromoteHeadings: true` was requested (even if skipped). */
  semanticPromoteHeadings?: SemanticRemediationSummary;
  /** Present when `semanticUntaggedHeadings: true` was requested (even if skipped). */
  semanticUntaggedHeadings?: SemanticRemediationSummary;
  /** Present when `htmlReport: true` was requested in remediate options. */
  htmlReport?: string | null;
}

/** Deterministic remediation plus raw bytes and snapshot for optional Phase 3 semantic pass. */
export interface RemediatePdfOutcome {
  remediation: RemediationResult;
  buffer: Buffer;
  snapshot: DocumentSnapshot;
}
