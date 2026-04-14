import { SCORING_WEIGHTS, GRADE_THRESHOLDS } from '../../config.js';
import type { DocumentSnapshot, AnalysisResult, ScoredCategory, Finding, Grade } from '../../types.js';
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

// Pure function. Zero I/O. Zero async.
export function score(
  snap: DocumentSnapshot,
  meta: { id: string; filename: string; timestamp: string; analysisDurationMs: number },
): AnalysisResult {
  // 1. Score each category with its base weight
  const rawCategories: ScoredCategory[] = [
    scoreTextExtractability(snap),
    scoreTitleLanguage(snap),
    scoreHeadingStructure(snap),
    scoreAltText(snap),
    scorePdfUaCompliance(snap),
    scoreBookmarks(snap),
    scoreTableMarkup(snap),
    scoreColorContrast(snap),
    scoreLinkQuality(snap),
    scoreReadingOrder(snap),
    scoreFormAccessibility(snap),
  ];

  // 2. Redistribute weight of N/A categories proportionally to applicable ones
  const applicable   = rawCategories.filter(c => c.applicable);
  const naWeight     = rawCategories.filter(c => !c.applicable).reduce((s, c) => s + c.weight, 0);
  const applicableBaseWeight = applicable.reduce((s, c) => s + c.weight, 0);

  const categories = rawCategories.map(cat => {
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

  // 4. Flatten & sort all findings (critical first)
  const allFindings: Finding[] = categories
    .flatMap(c => c.findings)
    .sort(findingSortOrder);

  return {
    id: meta.id,
    timestamp: meta.timestamp,
    filename: meta.filename,
    pageCount: snap.pageCount,
    pdfClass: snap.pdfClass,
    score: finalScore,
    grade,
    categories,
    findings: allFindings,
    analysisDurationMs: meta.analysisDurationMs,
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

const SEVERITY_ORDER: Record<string, number> = {
  critical: 0,
  moderate: 1,
  minor:    2,
  pass:     3,
};

function findingSortOrder(a: Finding, b: Finding): number {
  return (SEVERITY_ORDER[a.severity] ?? 4) - (SEVERITY_ORDER[b.severity] ?? 4);
}

function roundTo4(n: number): number {
  return Math.round(n * 10_000) / 10_000;
}

// Re-export base weights for tests
export { SCORING_WEIGHTS };
