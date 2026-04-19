import type { DocumentSnapshot, ScoredCategory, Finding } from '../../../types.js';
import {
  BOOKMARKS_PAGE_THRESHOLD,
  ENGINE_HEADING_BOOKMARK_FALLBACK_SCORE,
  ENGINE_PAGE_OUTLINE_BOOKMARK_SCORE,
  SCORE_TAGGED_MARKED_NO_OUTLINES_BOOKMARKS,
} from '../../../config.js';
import {
  engineBookmarkStrategy,
  enginePageOutlineCoverageSufficient,
} from '../remediationProvenance.js';

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
  const paragraphCount  = snap.paragraphStructElems?.length ?? 0;
  const informativeFigures = snap.figures.filter(f => !f.isArtifact).length;
  const totalFigures       = snap.figures.length;

  if (bookmarkCount === 0) {
    // Many tagged exports have no /Outlines but do expose headings in the tag tree; partial credit.
    if (headingCount >= 4) {
      findings.push({
        category: 'bookmarks',
        severity: 'minor',
        wcag: '2.4.1',
        message: `${snap.pageCount}-page document has no PDF outlines, but tagged heading structure (${headingCount} headings) still supports navigation.`,
      });
      return {
        key: 'bookmarks',
        score: 92,
        weight: 0.085,
        applicable: true,
        severity: 'minor',
        findings,
      };
    }
    if (headingCount >= 3) {
      findings.push({
        category: 'bookmarks',
        severity: 'minor',
        wcag: '2.4.1',
        message: `${snap.pageCount}-page document has no PDF outlines; limited heading structure (${headingCount}) partially offsets missing bookmarks.`,
      });
      return {
        key: 'bookmarks',
        score: 90,
        weight: 0.085,
        applicable: true,
        severity: 'minor',
        findings,
      };
    }
    if (headingCount >= 2) {
      findings.push({
        category: 'bookmarks',
        severity: 'minor',
        wcag: '2.4.1',
        message: `${snap.pageCount}-page document has no PDF outlines; a few headings (${headingCount}) provide partial in-document navigation.`,
      });
      return {
        key: 'bookmarks',
        score: 88,
        weight: 0.085,
        applicable: true,
        severity: 'minor',
        findings,
      };
    }
    if (
      paragraphCount >= 5 ||
      informativeFigures >= 8 ||
      totalFigures >= 10 ||
      (snap.imageToTextRatio >= 0.08 && snap.pageCount >= BOOKMARKS_PAGE_THRESHOLD)
    ) {
      findings.push({
        category: 'bookmarks',
        severity: 'minor',
        wcag: '2.4.1',
        message: `${snap.pageCount}-page document has no PDF outlines; tagged structure (${paragraphCount} paragraph elements, ${informativeFigures} informative / ${totalFigures} total figures) partially substitutes for bookmarks.`,
      });
      return {
        key: 'bookmarks',
        score: 90,
        weight: 0.085,
        applicable: true,
        severity: 'minor',
        findings,
      };
    }
    if (snap.isTagged && snap.markInfo?.Marked === true) {
      findings.push({
        category: 'bookmarks',
        severity: 'minor',
        wcag: '2.4.1',
        message: `${snap.pageCount}-page document has no PDF outlines; tagged Marked structure still enables reader navigation modes that use the tag tree.`,
      });
      return {
        key: 'bookmarks',
        score: SCORE_TAGGED_MARKED_NO_OUTLINES_BOOKMARKS,
        weight: 0.085,
        applicable: true,
        severity: 'minor',
        findings,
      };
    }
    findings.push({
      category: 'bookmarks',
      severity: 'moderate',
      wcag: '2.4.1',
      message: `${snap.pageCount}-page document has no bookmarks/outlines. Screen reader users cannot navigate by document sections.`,
    });
    return {
      key: 'bookmarks',
      score: 88,
      weight: 0.085,
      applicable: true,
      severity: 'moderate',
      findings,
    };
  }

  // Compare bookmark coverage against heading structure
  let score = 70; // baseline: bookmarks exist but may be incomplete
  const bookmarkStrategy = engineBookmarkStrategy(snap);

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
  } else {
    // No heading structure detected, but document has bookmarks — navigation exists.
    // Strong paragraph-level tagging still supports in-document navigation; score between legacy 90 and full pass.
    if (bookmarkStrategy === 'heading_outlines' && (paragraphCount >= 8 || (snap.textCharCount ?? 0) >= 5_000)) {
      score = ENGINE_HEADING_BOOKMARK_FALLBACK_SCORE;
      findings.push({
        category: 'bookmarks',
        severity: 'minor',
        wcag: '2.4.1',
        message: `PDFAF synthesized heading-derived bookmarks for this ${snap.pageCount}-page document. The heading tree is sparse in analysis, but bookmark navigation is present and should be validated manually.`,
      });
    } else if (bookmarkStrategy === 'page_outlines' && enginePageOutlineCoverageSufficient(snap) && snap.isTagged) {
      score = ENGINE_PAGE_OUTLINE_BOOKMARK_SCORE;
      findings.push({
        category: 'bookmarks',
        severity: 'minor',
        wcag: '2.4.1',
        message: `PDFAF synthesized ${bookmarkCount} page-outline bookmark(s), providing bounded section navigation even though heading coverage remains sparse.`,
      });
    } else if (paragraphCount >= 20 || (snap.textCharCount ?? 0) >= 12_000) {
      score = 97;
      findings.push({
        category: 'bookmarks',
        severity: 'minor',
        wcag: '2.4.1',
        message: `Document has ${bookmarkCount} bookmark(s) and no detected heading structure, but rich tagged body structure (${paragraphCount} paragraph elements) supports navigation — verify bookmark coverage manually if required.`,
      });
    } else {
      score = 90;
      findings.push({
        category: 'bookmarks',
        severity: 'minor',
        wcag: '2.4.1',
        message: `Document has ${bookmarkCount} bookmark(s) but no detected heading structure to verify coverage against.`,
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
