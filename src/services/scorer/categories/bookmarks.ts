import type { DocumentSnapshot, ScoredCategory, Finding } from '../../../types.js';
import { BOOKMARKS_PAGE_THRESHOLD } from '../../../config.js';

export function scoreBookmarks(snap: DocumentSnapshot): ScoredCategory {
  if (snap.pageCount < BOOKMARKS_PAGE_THRESHOLD) {
    return {
      key: 'bookmarks',
      score: 100,
      weight: 0.085,
      applicable: false,
      severity: 'pass',
      findings: [],
    };
  }

  const findings: Finding[] = [];
  const bookmarkCount = snap.bookmarks.length;
  const headingCount  = snap.headings.length;

  if (bookmarkCount === 0) {
    findings.push({
      category: 'bookmarks',
      severity: 'moderate',
      wcag: '2.4.1',
      message: `${snap.pageCount}-page document has no bookmarks/outlines. Screen reader users cannot navigate by document sections.`,
    });
    return {
      key: 'bookmarks',
      score: 0,
      weight: 0.085,
      applicable: true,
      severity: 'moderate',
      findings,
    };
  }

  // Compare bookmark coverage against heading structure
  let score = 70; // baseline: bookmarks exist but may be incomplete

  if (headingCount > 0) {
    const coverage = Math.min(1, bookmarkCount / headingCount);
    score = Math.round(60 + coverage * 40); // 60–100 based on heading coverage
    if (coverage < 0.5) {
      findings.push({
        category: 'bookmarks',
        severity: 'minor',
        wcag: '2.4.1',
        message: `Bookmarks cover only ${Math.round(coverage * 100)}% of the document's heading structure.`,
      });
    }
  }

  return {
    key: 'bookmarks',
    score: Math.min(100, score),
    weight: 0.085,
    applicable: true,
    severity: score >= 90 ? 'pass' : score >= 70 ? 'minor' : 'moderate',
    findings,
  };
}
