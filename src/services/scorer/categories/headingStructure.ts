import type { DocumentSnapshot, ScoredCategory, Finding } from '../../../types.js';
import { CATEGORY_BASE_WEIGHTS, HEADING_COVERAGE_PAGES_PER_HEADING } from '../../../config.js';

export function scoreHeadingStructure(snap: DocumentSnapshot): ScoredCategory {
  const findings: Finding[] = [];
  const headings = snap.headings;
  const headingSignals = snap.detectionProfile?.headingSignals;
  const exportedHeadingsReachable =
    headings.length > 0 &&
    headingSignals?.extractedHeadingsMissingFromTree !== true &&
    (headingSignals?.treeHeadingCount ?? headings.length) > 0;

  // Single-page docs: headings optional
  if (snap.pageCount <= 1) {
    const taggedSinglePageBody =
      snap.isTagged &&
      (
        (snap.paragraphStructElems?.length ?? 0) > 0 ||
        (snap.pdfClass === 'native_tagged' && (snap.textCharCount ?? 0) >= 300)
      );
    return {
      key: 'heading_structure',
      score: exportedHeadingsReachable ? 100 : 80,
      weight: CATEGORY_BASE_WEIGHTS.heading_structure,
      applicable: true,
      severity: exportedHeadingsReachable ? 'pass' : 'minor',
      findings: exportedHeadingsReachable || !taggedSinglePageBody
        ? []
        : [
            {
              category: 'heading_structure',
              severity: 'minor',
              wcag: '2.4.6',
              message:
                'Single-page tagged PDF has structured body text but no checker-visible H1-H6 role. Do not treat this as heading-passing; add a real heading role if section navigation matters.',
            },
          ],
    };
  }

  // No headings at all on a multi-page document is a critical failure
  if (headings.length === 0) {
    return {
      key: 'heading_structure',
      score: 0,
      weight: CATEGORY_BASE_WEIGHTS.heading_structure,
      applicable: true,
      severity: 'critical',
      findings: [
        {
          category: 'heading_structure',
          severity: 'critical',
          wcag: '1.3.1',
          message: `No heading tags (H1–H6) found in ${snap.pageCount}-page document. Screen reader users cannot navigate by headings.`,
        },
      ],
    };
  }

  let score = 100;

  // 1. H1 presence and uniqueness
  const h1Count = headings.filter(h => h.level === 1).length;
  const hasH1 = h1Count >= 1;
  if (!hasH1) {
    score -= 20;
    findings.push({
      category: 'heading_structure',
      severity: 'moderate',
      wcag: '1.3.1',
      message: 'No H1 (top-level heading) found. Documents should have at least one H1.',
    });
  } else if (h1Count > 1) {
    score -= Math.min(40, 8 + (h1Count - 1) * 6);
    findings.push({
      category: 'heading_structure',
      severity: h1Count >= 4 ? 'moderate' : 'minor',
      wcag: '1.3.1',
      message: `${h1Count} H1 headings found — only one H1 (document title) is allowed. Extras should be demoted to H2.`,
      count: h1Count,
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

  if (headingSignals?.extractedHeadingsMissingFromTree) {
    score = Math.min(score, 45);
    findings.push({
      category: 'heading_structure',
      severity: 'critical',
      wcag: '1.3.1',
      message: `Detected ${headings.length} heading candidate${headings.length !== 1 ? 's' : ''}, but none are reachable as H1–H6 nodes in the exported structure tree.`,
      count: headings.length,
    });
  } else if (
    snap.pageCount > 1 &&
    snap.structureTree !== null &&
    (snap.detectionProfile?.readingOrderSignals.degenerateStructureTree ?? false) &&
    (headingSignals?.treeHeadingCount ?? 0) === 0
  ) {
    score = Math.min(score, 55);
    findings.push({
      category: 'heading_structure',
      severity: 'moderate',
      wcag: '1.3.1',
      message: 'The structure tree is too shallow or degenerate to trust current heading navigation.',
    });
  }

  score = Math.max(0, Math.min(100, score));
  return {
    key: 'heading_structure',
    score,
    weight: CATEGORY_BASE_WEIGHTS.heading_structure,
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
