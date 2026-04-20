import { performance } from 'node:perf_hooks';
import {
  CATEGORY_BASE_WEIGHTS,
  GRADE_THRESHOLDS,
  LEGAL_PDF_STRICT_GRADED_CATEGORIES,
  LEGAL_PDF_STRICT_NON_GRADED_CATEGORIES,
} from '../../config.js';
import type {
  CategoryKey,
  DocumentSnapshot,
  AnalysisResult,
  ScoredCategory,
  Grade,
  ScoreProfile,
  ScopeChecklist,
} from '../../types.js';
import { scoreTextExtractability } from './categories/textExtractability.js';
import { scoreTitleLanguage }      from './categories/titleLanguage.js';
import { scoreHeadingStructure }   from './categories/headingStructure.js';
import { scoreAltText }            from './categories/altText.js';
import { scorePdfUaCompliance }    from './categories/pdfUaCompliance.js';
import { scoreBookmarks }          from './categories/bookmarks.js';
import { scoreTableMarkup }        from './categories/tableMarkup.js';
import { scoreColorContrast }      from './categories/colorContrast.js';
import { scoreLinkQuality }        from './categories/linkQuality.js';
import { scoreReadingOrder }       from './categories/readingOrder.js';
import { scoreFormAccessibility }  from './categories/formAccessibility.js';
import { finalizeScoringEvidence } from './finalizeEvidence.js';

const GRADED_CATEGORY_SET = new Set<CategoryKey>(LEGAL_PDF_STRICT_GRADED_CATEGORIES);
const NON_GRADED_CATEGORY_SET = new Set<CategoryKey>(LEGAL_PDF_STRICT_NON_GRADED_CATEGORIES);

// Pure function. Zero I/O. Zero async.
export function score(
  snap: DocumentSnapshot,
  meta: { id: string; filename: string; timestamp: string; analysisDurationMs: number },
): AnalysisResult {
  const categoryTimings: Partial<Record<ScoredCategory['key'], number>> = {};
  const scoreCategory = <T extends ScoredCategory['key']>(
    key: T,
    fn: () => ScoredCategory,
  ): ScoredCategory => {
    const started = performance.now();
    const out = fn();
    categoryTimings[key] = performance.now() - started;
    return out;
  };

  // 1. Score each category with its base weight
  const rawCategories: ScoredCategory[] = [
    scoreCategory('text_extractability', () => scoreTextExtractability(snap)),
    scoreCategory('title_language', () => scoreTitleLanguage(snap)),
    scoreCategory('heading_structure', () => scoreHeadingStructure(snap)),
    scoreCategory('alt_text', () => scoreAltText(snap)),
    scoreCategory('pdf_ua_compliance', () => scorePdfUaCompliance(snap)),
    scoreCategory('bookmarks', () => scoreBookmarks(snap)),
    scoreCategory('table_markup', () => scoreTableMarkup(snap)),
    scoreCategory('color_contrast', () => scoreColorContrast(snap)),
    scoreCategory('link_quality', () => scoreLinkQuality(snap)),
    scoreCategory('reading_order', () => scoreReadingOrder(snap)),
    scoreCategory('form_accessibility', () => scoreFormAccessibility(snap)),
  ];

  const finalizeStarted = performance.now();
  const finalized = finalizeScoringEvidence(snap, rawCategories);
  const finalizeEvidenceMs = performance.now() - finalizeStarted;

  // 2. Redistribute weight of N/A categories proportionally to applicable ones
  const applicable   = finalized.categories.filter(c => c.applicable && GRADED_CATEGORY_SET.has(c.key));
  const naWeight     = rawCategories
    .filter(c => GRADED_CATEGORY_SET.has(c.key) && !c.applicable)
    .reduce((s, c) => s + c.weight, 0);
  const applicableBaseWeight = applicable.reduce((s, c) => s + c.weight, 0);

  const categories = finalized.categories.map(cat => {
    const base = {
      ...cat,
      countsTowardGrade: categoryCountsTowardGrade(cat.key),
      diagnosticOnly: categoryDiagnosticOnly(cat.key),
      measurementStatus: categoryMeasurementStatus(cat.key),
    } satisfies ScoredCategory;
    if (!cat.applicable || !GRADED_CATEGORY_SET.has(cat.key)) return base;
    const scaleFactor = applicableBaseWeight > 0
      ? (cat.weight + naWeight * (cat.weight / applicableBaseWeight))
      : cat.weight;
    return { ...base, weight: roundTo4(scaleFactor) };
  });

  // 3. Compute weighted score
  const rawScore = categories
    .filter(c => c.applicable && GRADED_CATEGORY_SET.has(c.key))
    .reduce((s, c) => s + (c.score ?? 0) * c.weight, 0);

  const scoreProfile = buildLegalPdfStrictProfile(snap, categories, rawScore);
  const finalScore = scoreProfile.overallScore;
  const grade      = deriveGrade(finalScore);
  const scoringMs = Object.values(categoryTimings).reduce((sum, value) => sum + (value ?? 0), 0) + finalizeEvidenceMs;

  return {
    id: meta.id,
    timestamp: meta.timestamp,
    filename: meta.filename,
    pageCount: snap.pageCount,
    pdfClass: snap.pdfClass,
    score: finalScore,
    grade,
    scoreProfile,
    categories,
    scopeChecklist: buildScopeChecklist(),
    findings: finalized.findings,
    analysisDurationMs: meta.analysisDurationMs,
    verificationLevel: finalized.verificationLevel,
    manualReviewRequired: finalized.manualReviewRequired,
    manualReviewReasons: finalized.manualReviewReasons,
    scoreCapsApplied: finalized.scoreCapsApplied,
    runtimeSummary: {
      totalMs: meta.analysisDurationMs,
      cacheHit: false,
      pdfjsMs: 0,
      structureMs: 0,
      mergeMs: 0,
      structuralAuditMs: 0,
      scoringMs,
      classificationMs: 0,
      finalizeEvidenceMs,
      scorerCategoryMs: categoryTimings,
    },
  };
}

function buildScopeChecklist(): ScopeChecklist {
  return {
    isNonWebDocument: true,
    isWebPostedDocument: null,
    isPublicFacing: null,
    isCurrentUseDocument: null,
    isArchivedContentCandidate: null,
    isPreexistingDocumentCandidate: null,
    legalExceptionReviewRequired: true,
  };
}

function buildLegalPdfStrictProfile(
  snap: DocumentSnapshot,
  categories: ScoredCategory[],
  rawScore: number,
): ScoreProfile {
  let finalScore = Math.round(Math.min(100, Math.max(0, rawScore)));
  const criticalBlockers: string[] = [];
  const majorBlockers: string[] = [];
  const byKey = new Map(categories.map(category => [category.key, category]));
  const applyCap = (cap: number, bucket: 'critical' | 'major', blocker: string): void => {
    finalScore = Math.min(finalScore, cap);
    const list = bucket === 'critical' ? criticalBlockers : majorBlockers;
    if (!list.includes(blocker)) list.push(blocker);
  };

  const textExtractability = byKey.get('text_extractability');
  if ((textExtractability?.applicable ?? false) && (textExtractability?.score ?? 100) < 40) {
    applyCap(59, 'critical', 'text_extractability');
  }

  const headingStructure = byKey.get('heading_structure');
  if (snap.pageCount > 1 && (headingStructure?.applicable ?? false) && (headingStructure?.score ?? 100) === 0) {
    applyCap(59, 'critical', 'no_real_headings');
  }

  const informativeFigureCount = snap.figures.filter(figure => !figure.isArtifact).length;
  const altText = byKey.get('alt_text');
  if (informativeFigureCount > 0 && (altText?.applicable ?? false) && (altText?.score ?? 100) === 0) {
    applyCap(59, 'critical', 'no_alt_on_informative_figures');
  }

  const tableMarkup = byKey.get('table_markup');
  if (snap.tables.length > 0 && (tableMarkup?.applicable ?? false) && (tableMarkup?.score ?? 100) < 40) {
    applyCap(69, 'major', 'poor_table_markup');
  }

  const readingOrder = byKey.get('reading_order');
  if ((readingOrder?.applicable ?? false) && (readingOrder?.score ?? 100) < 40) {
    applyCap(69, 'major', 'weak_reading_order');
  }

  return {
    id: 'legal_pdf_strict',
    overallScore: finalScore,
    grade: deriveGrade(finalScore),
    gradedCategories: [...LEGAL_PDF_STRICT_GRADED_CATEGORIES],
    nonGradedCategories: [...LEGAL_PDF_STRICT_NON_GRADED_CATEGORIES],
    limitations: ['color_contrast_not_measured'],
    criticalBlockers,
    majorBlockers,
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function deriveGrade(score: number): Grade {
  if (score >= GRADE_THRESHOLDS.A) return 'A';
  if (score >= GRADE_THRESHOLDS.B) return 'B';
  if (score >= GRADE_THRESHOLDS.C) return 'C';
  if (score >= GRADE_THRESHOLDS.D) return 'D';
  return 'F';
}

function roundTo4(n: number): number {
  return Math.round(n * 10_000) / 10_000;
}

export function categoryCountsTowardGrade(key: CategoryKey): boolean {
  return GRADED_CATEGORY_SET.has(key);
}

export function categoryDiagnosticOnly(key: CategoryKey): boolean {
  return NON_GRADED_CATEGORY_SET.has(key) && key !== 'color_contrast';
}

export function categoryMeasurementStatus(key: CategoryKey): ScoredCategory['measurementStatus'] {
  if (key === 'color_contrast') return 'not_measured';
  if (key === 'bookmarks' || key === 'pdf_ua_compliance' || key === 'reading_order') return 'heuristic';
  return 'measured';
}

// Re-export base weights for tests
export { CATEGORY_BASE_WEIGHTS };
export const SCORING_WEIGHTS = CATEGORY_BASE_WEIGHTS;
