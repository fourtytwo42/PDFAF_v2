import type { DocumentSnapshot, ScoredCategory, Finding } from '../../../types.js';
import { HEADING_COVERAGE_PAGES_PER_HEADING } from '../../../config.js';

export function scoreHeadingStructure(snap: DocumentSnapshot): ScoredCategory {
  const findings: Finding[] = [];
  const headings = snap.headings;

  // Single-page docs: headings optional
  if (snap.pageCount <= 1) {
    return {
      key: 'heading_structure',
      score: headings.length > 0 ? 100 : 80,
      weight: 0.130,
      applicable: true,
      severity: 'pass',
      findings: [],
    };
  }

  // No headings at all on a multi-page document is a critical failure
  if (headings.length === 0) {
    return {
      key: 'heading_structure',
      score: 0,
      weight: 0.130,
      applicable: true,
      severity: 'critical',
      findings: [{
        category: 'heading_structure',
        severity: 'critical',
        wcag: '1.3.1',
        message: `No heading tags (H1–H6) found in ${snap.pageCount}-page document. Screen reader users cannot navigate by headings.`,
      }],
    };
  }

  let score = 100;

  // 1. H1 presence
  const hasH1 = headings.some(h => h.level === 1);
  if (!hasH1) {
    score -= 20;
    findings.push({
      category: 'heading_structure',
      severity: 'moderate',
      wcag: '1.3.1',
      message: 'No H1 (top-level heading) found. Documents should have at least one H1.',
    });
  }

  // 2. Skipped levels (e.g. H1 → H3 without H2)
  const skips = countSkippedLevels(headings.map(h => h.level));
  if (skips > 0) {
    const deduction = Math.min(25, skips * 8);
    score -= deduction;
    findings.push({
      category: 'heading_structure',
      severity: skips > 3 ? 'moderate' : 'minor',
      wcag: '1.3.1',
      message: `${skips} skipped heading level${skips > 1 ? 's' : ''} detected (e.g. H1 → H3). This breaks logical document outline.`,
      count: skips,
    });
  }

  // 3. Coverage: expect roughly 1 heading per N pages
  const expectedMinHeadings = Math.max(1, Math.floor(snap.pageCount / HEADING_COVERAGE_PAGES_PER_HEADING));
  if (headings.length < expectedMinHeadings) {
    const deduction = Math.round((1 - headings.length / expectedMinHeadings) * 15);
    score -= deduction;
    findings.push({
      category: 'heading_structure',
      severity: 'minor',
      wcag: '2.4.6',
      message: `Low heading density: ${headings.length} heading${headings.length !== 1 ? 's' : ''} for ${snap.pageCount} pages. Consider adding more section headings.`,
      count: headings.length,
    });
  }

  score = Math.max(0, Math.min(100, score));

  return {
    key: 'heading_structure',
    score,
    weight: 0.130,
    applicable: true,
    severity: scoreSeverity(score),
    findings,
  };
}

function countSkippedLevels(levels: number[]): number {
  let skips = 0;
  let prev = 0;
  for (const level of levels) {
    if (prev > 0 && level > prev + 1) {
      skips += level - prev - 1;
    }
    prev = level;
  }
  return skips;
}

function scoreSeverity(score: number) {
  if (score >= 90) return 'pass' as const;
  if (score >= 70) return 'minor' as const;
  if (score >= 40) return 'moderate' as const;
  return 'critical' as const;
}
