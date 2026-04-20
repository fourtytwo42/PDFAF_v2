import type { DocumentSnapshot, ScoredCategory, Finding } from '../../../types.js';
import {
  ENGINE_OCR_READING_ORDER_FLOOR,
  READING_ORDER_UNOWNED_LINK_WEIGHT,
  READING_ORDER_UNOWNED_MAX_DEDUCTION,
  READING_ORDER_UNOWNED_NONLINK_WEIGHT,
} from '../../../config.js';
import { qualifiesForEngineOwnedOcrReadingOrderCredit } from '../remediationProvenance.js';

function unownedAnnotationReadingOrderScore(snap: DocumentSnapshot): { score: number; total: number } {
  const aa = snap.annotationAccessibility;
  const linkN = aa?.linkAnnotationsMissingStructParent ?? 0;
  const nonN = aa?.nonLinkAnnotationsMissingStructParent ?? 0;
  const total = linkN + nonN;
  if (total === 0) return { score: 100, total: 0 };
  const ded = Math.min(
    READING_ORDER_UNOWNED_MAX_DEDUCTION,
    linkN * READING_ORDER_UNOWNED_LINK_WEIGHT + nonN * READING_ORDER_UNOWNED_NONLINK_WEIGHT,
  );
  return { score: Math.max(0, 100 - ded), total };
}

export function scoreReadingOrder(snap: DocumentSnapshot): ScoredCategory {
  const findings: Finding[] = [];
  const unowned = unownedAnnotationReadingOrderScore(snap);
  const stage3 = snap.detectionProfile?.readingOrderSignals;
  const headingSignals = snap.detectionProfile?.headingSignals;
  const sampledPages = snap.detectionProfile?.sampledPages ?? [];
  const readingOrderRiskPresent =
    (snap.annotationAccessibility?.pagesMissingTabsS ?? 0) > 0 ||
    (snap.annotationAccessibility?.pagesAnnotationOrderDiffers ?? 0) > 0 ||
    (stage3?.sampledStructurePageOrderDriftCount ?? 0) > 0 ||
    (stage3?.multiColumnOrderRiskPages ?? 0) > 0 ||
    stage3?.headerFooterPollutionRisk === true;

  if (!snap.structureTree || snap.pdfClass === 'scanned') {
    // No tree in snapshot: still use headings / paragraph tags as a weak proxy (common after exports).
    let score = snap.pdfClass === 'scanned' ? 0 : 30;
    if (snap.pdfClass !== 'scanned') {
      const pe = snap.paragraphStructElems?.length ?? 0;
      if (snap.headings.length >= 2) {
        score = 94;
      } else if (snap.headings.length === 1) {
        score = 90;
      } else if (pe >= 6) {
        score = 92;
      } else if (pe >= 3) {
        score = 88;
      }
      // Tagged PDFs still have an implicit content order even when the tree JSON is absent.
      if (snap.isTagged && unowned.total === 0) {
        // Dense extract + tagged: implicit order is usually usable even when the structure JSON is absent,
        // but keep the score below a full-confidence pass until a real tree is present.
        const floor = (snap.textCharCount ?? 0) >= 3500 ? 86 : 82;
        score = Math.max(score, floor);
      }
      findings.push({
        category: 'reading_order',
        severity: score >= 80 ? 'minor' : 'moderate',
        wcag: '1.3.2',
        message:
          score >= 80
            ? 'Full structure-tree reading order was not available; score uses heading/paragraph heuristics only.'
            : 'Reading order cannot be verified without a document structure tree.',
      });
      if (stage3?.headerFooterPollutionRisk) {
        score = Math.min(score, 82);
        findings.push({
          category: 'reading_order',
          severity: 'minor',
          wcag: '1.3.2',
          message: 'Repeated header/footer boundary text appears across pages, which can pollute fallback reading order heuristics.',
        });
      }
      if ((stage3?.multiColumnOrderRiskPages ?? 0) > 0) {
        score = Math.min(score, 78);
        findings.push({
          category: 'reading_order',
          severity: 'moderate',
          wcag: '1.3.2',
          message: `${stage3!.multiColumnOrderRiskPages} sampled page(s) look multi-column from paragraph bounds, so fallback reading order is risky without verified structure.`,
          count: stage3!.multiColumnOrderRiskPages,
        });
      }
    }
    let scoreOut = Math.min(score, unowned.score);
    if (unowned.total > 0) {
      const aa = snap.annotationAccessibility;
      const ln = aa?.linkAnnotationsMissingStructParent ?? 0;
      const nn = aa?.nonLinkAnnotationsMissingStructParent ?? 0;
      findings.push({
        category: 'reading_order',
        severity: unowned.score < 50 ? 'moderate' : 'minor',
        wcag: '1.3.2',
        message: `${unowned.total} visible annotation(s) lack /StructParent (${ln} link, ${nn} non-link) — tab order vs structure may not match assistive technology.`,
        count: unowned.total,
      });
    }
    return {
      key: 'reading_order',
      score: scoreOut,
      weight: 0.040,
      applicable: snap.pdfClass !== 'scanned',
      severity: snap.pdfClass === 'scanned' ? 'critical' : 'moderate',
      findings,
    };
  }

  // Heuristic: check that headings appear in page-ascending order
  // (a proxy for logical reading flow without full content stream analysis)
  const headings = snap.headings;
  let headingScore = 80;
  if (headings.length >= 2) {
    let outOfOrder = 0;
    for (let i = 1; i < headings.length; i++) {
      const prev = headings[i - 1]!;
      const curr = headings[i]!;
      if (prev.page > curr.page + 1) {
        outOfOrder++;
      }
    }
    const ratio = outOfOrder / (headings.length - 1);
    headingScore = Math.round((1 - ratio) * 100);
    headingScore = Math.max(0, Math.min(100, headingScore));
    if (outOfOrder > 0) {
      findings.push({
        category: 'reading_order',
        severity: ratio > 0.3 ? 'moderate' : 'minor',
        wcag: '1.3.2',
        message: `${outOfOrder} heading${outOfOrder !== 1 ? 's' : ''} appear out of page order, suggesting reading order issues.`,
        count: outOfOrder,
      });
    }
  }

  const aa = snap.annotationAccessibility;
  const missingTabs = aa?.pagesMissingTabsS ?? 0;
  const orderDiff = aa?.pagesAnnotationOrderDiffers ?? 0;
  let tabScore = 100;
  if (snap.pageCount > 0 && missingTabs > 0) {
    tabScore = Math.max(0, Math.round((1 - missingTabs / snap.pageCount) * 100));
    findings.push({
      category: 'reading_order',
      severity: missingTabs > snap.pageCount * 0.5 ? 'moderate' : 'minor',
      wcag: '1.3.2',
      message: `${missingTabs} page(s) lack /Tabs /S (tab order vs structure; PDF/UA-1 clause 7.20).`,
      count: missingTabs,
    });
  }
  let annotOrderScore = 100;
  if (snap.pageCount > 0 && orderDiff > 0) {
    annotOrderScore = Math.max(0, Math.round((1 - orderDiff / snap.pageCount) * 100));
    findings.push({
      category: 'reading_order',
      severity: orderDiff > snap.pageCount * 0.4 ? 'moderate' : 'minor',
      wcag: '1.3.2',
      message: `${orderDiff} page(s) have annotations ordered differently from top-to-bottom reading order.`,
      count: orderDiff,
    });
  }

  if (snap.isTagged && unowned.total === 0 && !readingOrderRiskPresent) {
    const roFloor = (snap.textCharCount ?? 0) >= 3500 ? 98 : 96;
    tabScore = Math.max(roFloor, tabScore);
    annotOrderScore = Math.max(roFloor, annotOrderScore);
    headingScore = Math.max(roFloor === 98 ? 96 : 94, headingScore);
  }

  let score = Math.min(headingScore, tabScore, annotOrderScore, unowned.score);
  if ((stage3?.structureTreeDepth ?? 0) <= 1 && snap.pageCount > 1) {
    score = Math.min(score, 30);
    findings.push({
      category: 'reading_order',
      severity: 'critical',
      wcag: '1.3.2',
      message:
        'Reading-order score is capped for external parity risk: the exported structure tree is too shallow to satisfy qpdf-style traversal from StructTreeRoot/K.',
    });
  }
  if (stage3?.degenerateStructureTree) {
    score = Math.min(score, 35);
    findings.push({
      category: 'reading_order',
      severity: 'critical',
      wcag: '1.3.2',
      message: `Structure tree depth is only ${stage3.structureTreeDepth}, which is too shallow for reliable multi-page reading order.`,
    });
  }
  if (headingSignals?.extractedHeadingsMissingFromTree) {
    score = Math.min(score, 45);
    findings.push({
      category: 'reading_order',
      severity: 'moderate',
      wcag: '1.3.2',
      message: 'Heading nodes detected during analysis are not reachable from the exported structure tree, which weakens reading-order confidence.',
    });
  }
  if (qualifiesForEngineOwnedOcrReadingOrderCredit(snap) && !stage3?.headerFooterPollutionRisk) {
    score = Math.max(score, Math.min(ENGINE_OCR_READING_ORDER_FLOOR, unowned.score));
  }
  if ((stage3?.sampledStructurePageOrderDriftCount ?? 0) > 0) {
    score = Math.min(score, Math.max(0, 96 - stage3!.sampledStructurePageOrderDriftCount * 12));
    findings.push({
      category: 'reading_order',
      severity: stage3!.sampledStructurePageOrderDriftCount > 2 ? 'moderate' : 'minor',
      wcag: '1.3.2',
      message: `${stage3!.sampledStructurePageOrderDriftCount} sampled structure-order drift event(s) were found across suspicious pages (${sampledPages.length} sampled).`,
      count: stage3!.sampledStructurePageOrderDriftCount,
    });
  }
  if (stage3?.headerFooterPollutionRisk) {
    score = Math.min(score, 92);
    findings.push({
      category: 'reading_order',
      severity: 'minor',
      wcag: '1.3.2',
      message: 'Repeated header/footer boundary text appears across pages and may contaminate apparent reading order.',
    });
  }
  if ((stage3?.multiColumnOrderRiskPages ?? 0) > 0) {
    score = Math.min(score, Math.max(0, 94 - stage3!.multiColumnOrderRiskPages * 10));
    findings.push({
      category: 'reading_order',
      severity: stage3!.multiColumnOrderRiskPages > 1 ? 'moderate' : 'minor',
      wcag: '1.3.2',
      message: `${stage3!.multiColumnOrderRiskPages} sampled page(s) show paragraph x-position spread consistent with multi-column order risk.`,
      count: stage3!.multiColumnOrderRiskPages,
    });
  }
  if (unowned.total > 0) {
    const aa = snap.annotationAccessibility;
    const ln = aa?.linkAnnotationsMissingStructParent ?? 0;
    const nn = aa?.nonLinkAnnotationsMissingStructParent ?? 0;
    findings.push({
      category: 'reading_order',
      severity: unowned.score < 50 ? 'moderate' : 'minor',
      wcag: '1.3.2',
      message: `${unowned.total} visible annotation(s) lack /StructParent (${ln} link, ${nn} non-link) — tab order vs structure may not match assistive technology.`,
      count: unowned.total,
    });
  }

  return {
    key: 'reading_order',
    score,
    weight: 0.040,
    applicable: true,
    severity: scoreSeverity(score),
    findings,
  };
}

function scoreSeverity(score: number) {
  if (score >= 90) return 'pass' as const;
  if (score >= 70) return 'minor' as const;
  if (score >= 40) return 'moderate' as const;
  return 'critical' as const;
}
