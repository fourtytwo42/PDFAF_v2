// ─── Core domain types ────────────────────────────────────────────────────────

export type PdfClass  = 'native_tagged' | 'native_untagged' | 'scanned' | 'mixed';
export type CategoryKey =
  | 'text_extractability'
  | 'title_language'
  | 'heading_structure'
  | 'alt_text'
  | 'pdf_ua_compliance'
  | 'bookmarks'
  | 'table_markup'
  | 'color_contrast'
  | 'link_quality'
  | 'reading_order'
  | 'form_accessibility';
export type Severity  = 'critical' | 'moderate' | 'minor' | 'pass';
export type Grade     = 'A' | 'B' | 'C' | 'D' | 'F';
export type EvidenceLevel = 'verified' | 'heuristic' | 'inferred_after_fix' | 'manual_review_required';
export type VerificationLevel = 'verified' | 'mixed' | 'heuristic' | 'manual_review_required';
export type MeasurementStatus = 'measured' | 'heuristic' | 'not_measured';
export type ScoreProfileId = 'legal_pdf_strict' | 'legal_pdf_strict_v2';
export type StructureClass = 'scanned' | 'untagged_digital' | 'partially_tagged' | 'native_tagged' | 'well_tagged';
export type ClassificationConfidence = 'high' | 'medium' | 'low';
export type FailureFamily =
  | 'font_extractability_heavy'
  | 'structure_reading_order_heavy'
  | 'figure_alt_ownership_heavy'
  | 'metadata_language_heavy'
  | 'mixed_structural'
  | 'near_pass_residual';
export type FailureRoutingHint =
  | 'prefer_structure_bootstrap'
  | 'prefer_annotation_normalization'
  | 'prefer_font_repair'
  | 'semantic_not_primary'
  | 'manual_review_likely_after_fix';
export type RemediationRoute =
  | 'metadata_first_commit'
  | 'metadata_foundation'
  | 'untagged_structure_recovery'
  | 'structure_bootstrap_and_conformance'
  | 'post_bootstrap_heading_convergence'
  | 'structure_bootstrap'
  | 'annotation_link_normalization'
  | 'native_structure_repair'
  | 'font_ocr_repair'
  | 'font_unicode_tail_recovery'
  | 'figure_semantics'
  | 'near_pass_figure_recovery'
  | 'document_navigation_forms'
  | 'safe_cleanup';
export type PlanningSkipReason =
  | 'route_not_active'
  | 'missing_precondition'
  | 'not_applicable'
  | 'already_succeeded'
  | 'reliability_filtered'
  | 'semantic_deferred'
  | 'category_not_failing'
  | 'bootstrap_below_commit_floor'
  | 'ocr_skipped_native_text_present';
export type DetectionConfidence = 'high' | 'medium' | 'low';

export interface ReadingOrderSignals {
  missingStructureTree: boolean;
  structureTreeDepth: number;
  degenerateStructureTree: boolean;
  annotationOrderRiskCount: number;
  annotationStructParentRiskCount: number;
  headerFooterPollutionRisk: boolean;
  sampledStructurePageOrderDriftCount: number;
  multiColumnOrderRiskPages: number;
  suspiciousPageCount: number;
}

export interface HeadingSignals {
  extractedHeadingCount: number;
  treeHeadingCount: number;
  headingTreeDepth: number;
  extractedHeadingsMissingFromTree: boolean;
}

export interface FigureSignals {
  extractedFigureCount: number;
  treeFigureCount: number;
  nonFigureRoleCount: number;
  treeFigureMissingForExtractedFigures: boolean;
}

export interface PdfUaSignals {
  orphanMcidCount: number;
  suspectedPathPaintOutsideMc: number;
  taggedAnnotationRiskCount: number;
}

export interface AnnotationSignals {
  pagesMissingTabsS: number;
  pagesAnnotationOrderDiffers: number;
  linkAnnotationsMissingStructure: number;
  nonLinkAnnotationsMissingStructure: number;
  linkAnnotationsMissingStructParent: number;
  nonLinkAnnotationsMissingStructParent: number;
}

export interface ListSignals {
  listItemMisplacedCount: number;
  lblBodyMisplacedCount: number;
  listsWithoutItems: number;
}

export interface TableSignals {
  tablesWithMisplacedCells: number;
  misplacedCellCount: number;
  irregularTableCount: number;
  stronglyIrregularTableCount: number;
  directCellUnderTableCount: number;
}

export interface DetectionProfile {
  readingOrderSignals: ReadingOrderSignals;
  headingSignals: HeadingSignals;
  figureSignals: FigureSignals;
  pdfUaSignals: PdfUaSignals;
  annotationSignals: AnnotationSignals;
  listSignals: ListSignals;
  tableSignals: TableSignals;
  sampledPages: number[];
  confidence: DetectionConfidence;
}

export interface StructuralClassification {
  structureClass: StructureClass;
  contentProfile: {
    pageBucket: '1-5' | '6-20' | '21-50' | '50+';
    dominantContent: 'text' | 'mixed' | 'image_heavy';
    hasStructureTree: boolean;
    hasBookmarks: boolean;
    hasFigures: boolean;
    hasTables: boolean;
    hasForms: boolean;
    annotationRisk: boolean;
    taggedContentRisk: boolean;
    listStructureRisk: boolean;
  };
  fontRiskProfile: {
    riskLevel: 'low' | 'medium' | 'high';
    riskyFontCount: number;
    missingUnicodeFontCount: number;
    unembeddedFontCount: number;
    ocrTextLayerSuspected: boolean;
  };
  confidence: ClassificationConfidence;
}

export interface FailureProfile {
  deterministicIssues: string[];
  semanticIssues: string[];
  manualOnlyIssues: string[];
  primaryFailureFamily: FailureFamily;
  secondaryFailureFamilies: FailureFamily[];
  routingHints: FailureRoutingHint[];
}

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
    /** Raw /S role from the structure element before RoleMap resolution. */
    rawRole?: string;
    /** Role after applying /StructTreeRoot /RoleMap. */
    role?: string;
    structRef?: string;
    reachable?: boolean;
    directContent?: boolean;
    subtreeMcidCount?: number;
    parentPath?: string[];
    bbox?: [number, number, number, number];
  }>;
  checkerFigureTargets?: Array<{
    hasAlt: boolean;
    altText?: string;
    isArtifact: boolean;
    page: number;
    role?: string;
    resolvedRole?: string;
    structRef?: string;
    reachable: boolean;
    directContent: boolean;
    parentPath: string[];
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
  /**
   * Stage 15: structural bootstrap commit-floor gate input.
   * `candidateCount` = heading/figure candidates collected from layout; `disorderScore` in [0,1]
   * summarises per-page MCID range disorder; `expectedFloor` is the planner-visible pass/fail
   * against `BOOTSTRAP_COMMIT_FLOOR`. Absent when the python analysis did not populate it
   * (e.g. scanned documents or early failures). Additive; not part of the scoring wire shape.
   */
  structureBootstrapGate?: {
    candidateCount: number;
    headingCandidateCount: number;
    pageCount: number;
    disorderScore: number;
    expectedFloor: number;
    passesFloor: boolean;
  };
  /** Internal-only remediation provenance inferred from the current remediated PDF. */
  remediationProvenance?: {
    /** True when this PDF was OCR-remediated by PDFAF and the marker survived re-analysis. */
    engineAppliedOcr: boolean;
    /** True when PDFAF tagged OCR text blocks after OCR. */
    engineTaggedOcrText: boolean;
    /** Bookmark synthesis strategy PDFAF applied, if any. */
    bookmarkStrategy: 'none' | 'page_outlines' | 'heading_outlines';
    /** Page-outline count synthesized by PDFAF when `bookmarkStrategy=page_outlines`. */
    pageOutlineCount?: number;
  };

  // --- computed during merge in pdfAnalyzer ---
  pdfClass: PdfClass;
  imageToTextRatio: number;         // imageOnlyPageCount / pageCount
  detectionProfile?: DetectionProfile;
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

export interface ScopeChecklist {
  isNonWebDocument: boolean;
  isWebPostedDocument: boolean | null;
  isPublicFacing: boolean | null;
  isCurrentUseDocument: boolean | null;
  isArchivedContentCandidate: boolean | null;
  isPreexistingDocumentCandidate: boolean | null;
  legalExceptionReviewRequired: boolean;
}

export interface ScoreProfile {
  id: ScoreProfileId;
  overallScore: number;
  grade: Grade;
  gradedCategories: CategoryKey[];
  nonGradedCategories: CategoryKey[];
  limitations: string[];
  criticalBlockers: string[];
  majorBlockers: string[];
}

// ─── Per-category scored result ───────────────────────────────────────────────

export interface ScoredCategory {
  key: CategoryKey;
  score: number;                    // 0–100
  weight: number;                   // effective weight (after N/A redistribution)
  applicable: boolean;
  severity: Severity;
  findings: Finding[];
  countsTowardGrade?: boolean;
  diagnosticOnly?: boolean;
  measurementStatus?: MeasurementStatus;
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
  score: number;                    // internal legacy convenience
  grade: Grade;                     // internal legacy convenience
  scoreProfile: ScoreProfile;
  categories: ScoredCategory[];
  scopeChecklist: ScopeChecklist;
  findings: Finding[];              // all findings sorted by severity desc
  analysisDurationMs: number;
  verificationLevel?: VerificationLevel;
  manualReviewRequired?: boolean;
  manualReviewReasons?: string[];
  scoreCapsApplied?: ScoreCapApplied[];
  structuralClassification?: StructuralClassification;
  failureProfile?: FailureProfile;
  detectionProfile?: DetectionProfile;
  runtimeSummary?: AnalysisRuntimeSummary;
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
  checkerFigureTargets?: DocumentSnapshot['checkerFigureTargets'];
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
  structureBootstrapGate?: DocumentSnapshot['structureBootstrapGate'];
  remediationProvenance?: DocumentSnapshot['remediationProvenance'];
}

// ─── Phase 2 — remediation ────────────────────────────────────────────────────

export type RemediationToolOutcome = 'applied' | 'no_effect' | 'rejected' | 'failed';

export interface RuntimeCountRow {
  key: string;
  count: number;
}

export interface AnalysisRuntimeSummary {
  totalMs: number;
  cacheHit: boolean;
  pdfjsMs: number;
  structureMs: number;
  mergeMs: number;
  structuralAuditMs: number;
  scoringMs: number;
  classificationMs: number;
  finalizeEvidenceMs: number;
  scorerCategoryMs: Partial<Record<CategoryKey, number>>;
}

export interface RemediationStageRuntimeSummary {
  key: string;
  stageNumber: number;
  round: number;
  source: 'planner' | 'playbook' | 'post_pass';
  toolCount: number;
  totalMs: number;
  reanalyzeMs: number;
}

export interface RemediationToolRuntimeSummary {
  toolName: string;
  stage: number;
  round: number;
  source: 'planner' | 'playbook' | 'post_pass';
  durationMs: number;
  outcome: RemediationToolOutcome;
}

export interface PlannedRemediationTool {
  toolName: string;
  params: Record<string, unknown>;
  rationale: string;
  route?: RemediationRoute;
}

export interface RemediationStagePlan {
  stageNumber: number;
  tools: PlannedRemediationTool[];
  reanalyzeAfter: boolean;
}

export interface RemediationPlan {
  stages: RemediationStagePlan[];
  planningSummary?: PlanningSummary;
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
  durationMs?: number;
  source?: 'planner' | 'playbook' | 'post_pass';
}

export interface PythonMutationInvariantPayload {
  targetRef?: string | null;
  targetResolved?: boolean;
  targetReachable?: boolean;
  resolvedRole?: string | null;
  ownershipPreserved?: boolean;
  rootReachableHeadingCountBefore?: number;
  rootReachableHeadingCountAfter?: number;
  rootReachableDepthBefore?: number;
  rootReachableDepthAfter?: number;
  globalH1CountAfter?: number;
  headingCandidateReachable?: boolean;
  rootReachableFigureCountBefore?: number;
  rootReachableFigureCountAfter?: number;
  targetHasAltAfter?: boolean;
  targetIsFigureAfter?: boolean;
  directCellsUnderTableBefore?: number;
  directCellsUnderTableAfter?: number;
  headerCellCountBefore?: number;
  headerCellCountAfter?: number;
  tableTreeValidAfter?: boolean;
  visibleAnnotationsMissingStructParentBefore?: number;
  visibleAnnotationsMissingStructParentAfter?: number;
  visibleAnnotationsMissingStructureBefore?: number;
  visibleAnnotationsMissingStructureAfter?: number;
}

export interface PythonStructuralBenefitPayload {
  headingReachabilityImproved?: boolean;
  headingHierarchyImproved?: boolean;
  figureOwnershipImproved?: boolean;
  figureAltAttachedToReachableFigure?: boolean;
  tableValidityImproved?: boolean;
  annotationOwnershipImproved?: boolean;
  readingOrderDepthImproved?: boolean;
}

export interface PythonMutationDetailPayload {
  outcome: RemediationToolOutcome;
  note?: string;
  error?: string;
  invariants?: PythonMutationInvariantPayload;
  structuralBenefits?: PythonStructuralBenefitPayload;
  debug?: {
    hasStructTreeRoot?: boolean;
    parentTreeEntries?: number;
    parentTreeNextKey?: number;
    headingCount?: number;
    structureDepth?: number;
    rootReachableDepth?: number;
    rootReachableHeadingCount?: number;
    rootReachableFigureCount?: number;
    globalHeadingCount?: number;
    globalH1Count?: number;
    rootChildrenCount?: number;
    pageStructParentsCount?: number;
    pageParentTreeArrayCount?: number;
    pageParentTreeNonEmptyCount?: number;
    topLevelNonEmptyCount?: number;
    usesMcrKidsCount?: number;
    usesIntegerKidsCount?: number;
    qpdfVerifiedDepth?: number;
    [key: string]: unknown;
  };
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
  /** When true, planner may include optional bookmark/PDF-UA remediation paths. */
  includeOptionalRemediation?: boolean;
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
  | 'no_target_improvement'
  | 'gate_blocked'
  | 'llm_timeout'
  | 'unsupported_pdf'
  | 'error';

export type SemanticLane =
  | 'figures'
  | 'headings'
  | 'promote_headings'
  | 'untagged_headings';

export interface SemanticGateSummary {
  passed: boolean;
  reason: string;
  details: string[];
  candidateCountBefore: number;
  candidateCountAfter: number;
  targetCategoryKey?: CategoryKey | null;
  targetCategoryScoreBefore?: number | null;
  targetCategoryScoreAfter?: number | null;
}

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
  lane: SemanticLane;
  skippedReason: SemanticSkippedReason;
  durationMs: number;
  proposalsAccepted: number;
  proposalsRejected: number;
  scoreBefore: number;
  scoreAfter: number;
  batches: SemanticBatchSummary[];
  gate: SemanticGateSummary;
  changeStatus: 'skipped' | 'no_change' | 'applied' | 'reverted';
  runtime?: SemanticLaneRuntimeSummary;
  trustDowngraded?: boolean;
  errorMessage?: string;
}

export interface SemanticLaneRuntimeSummary {
  lane: SemanticLane;
  totalMs: number;
  gateMs: number;
  candidateMs: number;
  llmMs: number;
  mutationMs: number;
  verifyMs: number;
  candidateCountBefore: number;
  candidateCountAfter: number;
  candidateCapHit: boolean;
  skippedReason: SemanticSkippedReason;
  changeStatus: SemanticRemediationSummary['changeStatus'];
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

export interface PlanningSummary {
  primaryRoute: RemediationRoute | null;
  secondaryRoutes: RemediationRoute[];
  triggeringSignals: string[];
  residualFamilies?: string[];
  includeOptionalRemediation?: boolean;
  scheduledTools: string[];
  routeSummaries?: Array<{
    route: RemediationRoute;
    status: 'active' | 'stopped';
    reason?: string;
    scheduledTools: string[];
  }>;
  skippedTools: Array<{
    toolName: string;
    reason: PlanningSkipReason;
  }>;
  semanticDeferred: boolean;
}

export interface StructuralConfidenceGuardSummary {
  rollbackCount: number;
  lastRollbackReason?: string | null;
}

export type StructuralRepairFamily =
  | 'lists'
  | 'tables'
  | 'annotations'
  | 'tagged_content'
  | 'headings';

export type RemediationOutcomeStatus =
  | 'fixed'
  | 'partially_fixed'
  | 'needs_manual_review'
  | 'unsafe_to_autofix';

export interface RemediationOutcomeFamilySummary {
  family: StructuralRepairFamily;
  targeted: boolean;
  status: RemediationOutcomeStatus;
  beforeSignalCount: number;
  afterSignalCount: number;
  appliedTools: string[];
  skippedTools: Array<{
    toolName: string;
    reason: PlanningSkipReason;
  }>;
  residualSignals: string[];
}

export interface RemediationOutcomeSummary {
  documentStatus: RemediationOutcomeStatus;
  targetedFamilies: StructuralRepairFamily[];
  familySummaries: RemediationOutcomeFamilySummary[];
}

export interface RemediationBoundedWorkSummary {
  semanticCandidateCapsHit: number;
  deterministicEarlyExitCount: number;
  deterministicEarlyExitReasons: RuntimeCountRow[];
  semanticSkipReasons: RuntimeCountRow[];
  zeroHeadingLaneActivations: number;
  headingConvergenceAttemptCount: number;
  headingConvergenceSuccessCount: number;
  headingConvergenceFailureCount: number;
  headingConvergenceTimeoutCount: number;
  structureConformanceTimeoutCount: number;
}

export interface RemediationRuntimeSummary {
  analysisBefore?: AnalysisRuntimeSummary | null;
  analysisAfter?: AnalysisRuntimeSummary | null;
  deterministicTotalMs: number;
  stageTimings: RemediationStageRuntimeSummary[];
  toolTimings: RemediationToolRuntimeSummary[];
  semanticLaneTimings: SemanticLaneRuntimeSummary[];
  boundedWork: RemediationBoundedWorkSummary;
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
  /** Present when the deterministic planner was used or when playbook replay fell back to the planner. */
  planningSummary?: PlanningSummary;
  /** Present when Stage 4 structural-confidence safeguards observed or reverted confidence regressions. */
  structuralConfidenceGuard?: StructuralConfidenceGuardSummary;
  /** Present when Stage 5 deterministic structural outcome classification metadata is available. */
  remediationOutcomeSummary?: RemediationOutcomeSummary;
  /** Present when Stage 7 runtime instrumentation metadata is available. */
  runtimeSummary?: RemediationRuntimeSummary;
  /** Present when `htmlReport: true` was requested in remediate options. */
  htmlReport?: string | null;
}

/** Deterministic remediation plus raw bytes and snapshot for optional Phase 3 semantic pass. */
export interface RemediatePdfOutcome {
  remediation: RemediationResult;
  buffer: Buffer;
  snapshot: DocumentSnapshot;
}
