import type { SCORING_WEIGHTS } from './config.js';

// ─── Core domain types ────────────────────────────────────────────────────────

export type PdfClass  = 'native_tagged' | 'native_untagged' | 'scanned' | 'mixed';
export type CategoryKey = keyof typeof SCORING_WEIGHTS;
export type Severity  = 'critical' | 'moderate' | 'minor' | 'pass';
export type Grade     = 'A' | 'B' | 'C' | 'D' | 'F';

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
  };
  links: Array<{
    text: string;
    url: string;
    page: number;
  }>;
  formFieldsFromPdfjs: Array<{
    name: string;
    page: number;
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
  }>;
  tables: Array<{
    hasHeaders: boolean;
    headerCount: number;
    totalCells: number;
    page: number;
    structRef?: string;
  }>;
  fonts: Array<{
    name: string;
    isEmbedded: boolean;
    hasUnicode: boolean;
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
}

// ─── Per-category scored result ───────────────────────────────────────────────

export interface ScoredCategory {
  key: CategoryKey;
  score: number;                    // 0–100
  weight: number;                   // effective weight (after N/A redistribution)
  applicable: boolean;
  severity: Severity;
  findings: Finding[];
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
}
