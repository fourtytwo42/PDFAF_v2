import type { AnalyzeSummary } from './analyze';

export interface BeforeAfterScore {
  score: number;
  grade: string;
  pdfClass: string;
}

export interface AppliedToolSummary {
  toolName: string;
  stage: number;
  round: number;
  scoreBefore: number;
  scoreAfter: number;
  delta: number;
  outcome: 'applied' | 'no_effect' | 'rejected' | 'failed';
  details?: string;
}

export interface SemanticBatchSummary {
  batchIndex: number;
  figureIds: string[];
  headingStructRefs?: string[];
  model: string;
  endpoint: 'primary' | 'fallback';
  proposalCount: number;
  error?: string;
}

export interface SemanticSummary {
  skippedReason:
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
  durationMs: number;
  proposalsAccepted: number;
  proposalsRejected: number;
  scoreBefore: number;
  scoreAfter: number;
  batches: SemanticBatchSummary[];
  errorMessage?: string;
}

export interface OcrPipelineSummary {
  applied: boolean;
  attempted: boolean;
  humanReviewRecommended: boolean;
  guidance: string;
}

export interface ReadabilityReviewFinding {
  area: string;
  severity: 'critical' | 'moderate' | 'minor';
  message: string;
  evidence?: string;
  page?: number;
  recommendation?: string;
}

export interface ReadabilityReviewSummary {
  status: 'passed' | 'warn' | 'failed' | 'skipped' | 'error';
  score: number | null;
  grade: string | null;
  confidence: 'high' | 'medium' | 'low' | 'unknown';
  durationMs: number;
  model?: string;
  endpoint?: 'primary' | 'fallback';
  skippedReason?: 'disabled' | 'no_llm_config' | 'error';
  summary: string;
  strengths: string[];
  findings: ReadabilityReviewFinding[];
  manualReviewRecommended: boolean;
  manualReviewReasons: string[];
  proxy?: {
    pageCount: number;
    sampledPages: number[];
    textCharCount: number;
    headingCount: number;
    figureCount: number;
    tableCount: number;
    linkCount: number;
    formFieldCount: number;
  };
}

export interface ReadabilityAutoRepairSummary {
  attempted: boolean;
  applied: boolean;
  reason: string;
  durationMs: number;
  beforeStatus?: ReadabilityReviewSummary['status'];
  afterStatus?: ReadabilityReviewSummary['status'];
  beforeReadabilityScore?: number | null;
  afterReadabilityScore?: number | null;
  beforeEngineScore?: number;
  afterEngineScore?: number;
  targetScore?: number;
  roundsAdded?: number;
  toolsAdded?: number;
  manualReviewRecommended?: boolean;
  errorMessage?: string;
}

export interface RemediationRoundSummary {
  round: number;
  scoreAfter: number;
  improved: boolean;
  source?: 'planner' | 'playbook';
}

export interface RemediationSummary {
  before: AnalyzeSummary;
  after: AnalyzeSummary;
  improved: boolean;
  appliedTools: AppliedToolSummary[];
  rounds: RemediationRoundSummary[];
  remediationDurationMs: number;
  remediatedPdfTooLarge: boolean;
  semantic?: SemanticSummary;
  semanticHeadings?: SemanticSummary;
  semanticPromoteHeadings?: SemanticSummary;
  semanticUntaggedHeadings?: SemanticSummary;
  readabilityReview?: ReadabilityReviewSummary;
  readabilityReviewAttempts?: ReadabilityReviewSummary[];
  readabilityAutoRepair?: ReadabilityAutoRepairSummary;
  ocrPipeline?: OcrPipelineSummary;
}

export interface RawRemediationResponse {
  before: unknown;
  after: unknown;
  remediatedPdfBase64: string | null;
  remediatedPdfTooLarge: boolean;
  appliedTools: AppliedToolSummary[];
  rounds: RemediationRoundSummary[];
  remediationDurationMs: number;
  improved: boolean;
  semantic?: SemanticSummary;
  semanticHeadings?: SemanticSummary;
  semanticPromoteHeadings?: SemanticSummary;
  semanticUntaggedHeadings?: SemanticSummary;
  readabilityReview?: ReadabilityReviewSummary;
  readabilityReviewAttempts?: ReadabilityReviewSummary[];
  readabilityAutoRepair?: ReadabilityAutoRepairSummary;
  ocrPipeline?: OcrPipelineSummary;
}
