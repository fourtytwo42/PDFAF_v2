import { performance } from 'node:perf_hooks';
import { SCORING_WEIGHTS, GRADE_THRESHOLDS } from '../../config.js';
import type { DocumentSnapshot, AnalysisResult, ScoredCategory, Grade } from '../../types.js';
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
  const applicable   = finalized.categories.filter(c => c.applicable);
  const naWeight     = rawCategories.filter(c => !c.applicable).reduce((s, c) => s + c.weight, 0);
  const applicableBaseWeight = applicable.reduce((s, c) => s + c.weight, 0);

  const categories = finalized.categories.map(cat => {
    if (!cat.applicable) return cat;
    const scaleFactor = applicableBaseWeight > 0
      ? (cat.weight + naWeight * (cat.weight / applicableBaseWeight))
      : cat.weight;
    return { ...cat, weight: roundTo4(scaleFactor) };
  });

  // 3. Compute weighted score
  const rawScore = categories
    .filter(c => c.applicable)
    .reduce((s, c) => s + c.score * c.weight, 0);

  const finalScore = Math.round(Math.min(100, Math.max(0, rawScore)));
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
    categories,
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

// Re-export base weights for tests
export { SCORING_WEIGHTS };
