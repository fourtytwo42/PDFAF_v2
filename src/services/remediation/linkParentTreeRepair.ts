import type { AnalysisResult, CategoryKey, DocumentSnapshot } from '../../types.js';

const STAGE165_MAX_SMALL_LINK_OWNERSHIP_DEBT = 24;

function categoryScore(analysis: AnalysisResult, key: CategoryKey): number | null {
  return analysis.categories.find(category => category.key === key)?.score ?? null;
}

export function linkAnnotationOwnershipDebt(snapshot: DocumentSnapshot): {
  missingStructure: number;
  missingStructParent: number;
  total: number;
} {
  const signals = snapshot.detectionProfile?.annotationSignals ?? snapshot.annotationAccessibility;
  const missingStructure = signals?.linkAnnotationsMissingStructure ?? 0;
  const missingStructParent = signals?.linkAnnotationsMissingStructParent ?? 0;
  return {
    missingStructure,
    missingStructParent,
    total: missingStructure + missingStructParent,
  };
}

export function shouldTryStage165LinkParentTreeRepair(input: {
  analysis: AnalysisResult;
  snapshot: DocumentSnapshot;
  protectedFloorScore?: number | null;
}): boolean {
  const { analysis, snapshot } = input;
  if (analysis.pdfClass === 'scanned' || snapshot.pdfClass === 'scanned') return false;
  if ((snapshot.textCharCount ?? 0) <= 0) return false;
  if (!snapshot.isTagged && snapshot.structureTree === null) return false;

  const debt = linkAnnotationOwnershipDebt(snapshot);
  if (debt.total <= 0) return false;
  if (debt.total > STAGE165_MAX_SMALL_LINK_OWNERSHIP_DEBT) return false;

  const link = categoryScore(analysis, 'link_quality') ?? 100;
  const pdfUa = categoryScore(analysis, 'pdf_ua_compliance') ?? 100;
  if (link >= 100 && pdfUa >= 90) return false;

  const coreStable =
    (categoryScore(analysis, 'heading_structure') ?? 0) >= 75 &&
    (categoryScore(analysis, 'reading_order') ?? 0) >= 70 &&
    (categoryScore(analysis, 'alt_text') ?? 0) >= 70 &&
    (categoryScore(analysis, 'table_markup') ?? 100) >= 80;
  if (!coreStable) return false;

  if (
    typeof input.protectedFloorScore === 'number' &&
    Number.isFinite(input.protectedFloorScore) &&
    analysis.score < input.protectedFloorScore
  ) {
    return false;
  }

  const linkCount = Array.isArray(snapshot.links) ? snapshot.links.length : 0;
  return linkCount > 0 || debt.missingStructure > 0 || debt.missingStructParent > 0;
}

export function stage165LinkParentTreeBenefit(input: {
  beforeAnalysis: AnalysisResult;
  afterAnalysis: AnalysisResult;
  beforeSnapshot: DocumentSnapshot;
  afterSnapshot: DocumentSnapshot;
}): {
  safe: boolean;
  reason: string;
  beforeDebt: number;
  afterDebt: number;
} {
  const beforeDebt = linkAnnotationOwnershipDebt(input.beforeSnapshot).total;
  const afterDebt = linkAnnotationOwnershipDebt(input.afterSnapshot).total;
  const beforeLink = categoryScore(input.beforeAnalysis, 'link_quality') ?? 100;
  const afterLink = categoryScore(input.afterAnalysis, 'link_quality') ?? 100;
  const beforePdfUa = categoryScore(input.beforeAnalysis, 'pdf_ua_compliance') ?? 100;
  const afterPdfUa = categoryScore(input.afterAnalysis, 'pdf_ua_compliance') ?? 100;

  const pageStable = input.afterSnapshot.pageCount === input.beforeSnapshot.pageCount;
  const textStable = input.afterSnapshot.textCharCount === input.beforeSnapshot.textCharCount;
  const taggedStable = input.beforeSnapshot.isTagged !== true || input.afterSnapshot.isTagged === true;
  const structureStable = input.beforeSnapshot.structureTree === null || input.afterSnapshot.structureTree !== null;
  const linksStable = input.afterSnapshot.links.length === input.beforeSnapshot.links.length;
  const coreStable = ([
    'heading_structure',
    'reading_order',
    'alt_text',
    'table_markup',
  ] as CategoryKey[]).every(key => {
    const before = categoryScore(input.beforeAnalysis, key);
    const after = categoryScore(input.afterAnalysis, key);
    return before == null || after == null || after >= before;
  });
  const targetBenefit = afterDebt < beforeDebt || afterLink > beforeLink || afterPdfUa > beforePdfUa;
  const scoreStable = input.afterAnalysis.score >= input.beforeAnalysis.score;

  if (!pageStable) return { safe: false, reason: 'page_count_changed', beforeDebt, afterDebt };
  if (!textStable) return { safe: false, reason: 'text_count_changed', beforeDebt, afterDebt };
  if (!taggedStable) return { safe: false, reason: 'tagged_state_lost', beforeDebt, afterDebt };
  if (!structureStable) return { safe: false, reason: 'structure_tree_lost', beforeDebt, afterDebt };
  if (!linksStable) return { safe: false, reason: 'link_count_changed', beforeDebt, afterDebt };
  if (!coreStable) return { safe: false, reason: 'core_category_regressed', beforeDebt, afterDebt };
  if (!targetBenefit) return { safe: false, reason: 'no_link_parenttree_benefit', beforeDebt, afterDebt };
  if (!scoreStable) return { safe: false, reason: 'score_regressed', beforeDebt, afterDebt };
  return { safe: true, reason: 'link_parenttree_benefit', beforeDebt, afterDebt };
}
