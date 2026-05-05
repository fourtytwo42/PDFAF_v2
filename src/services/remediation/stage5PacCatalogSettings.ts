import { REMEDIATION_CATEGORY_THRESHOLD } from '../../config.js';
import type { AnalysisResult, CategoryKey, DocumentSnapshot } from '../../types.js';
import { buildPacRuleEvidence, type PacRuleEvidence } from '../compliance/pacRuleEvidence.js';

export const STAGE5_PAC_CATALOG_RULE_IDS = [
  'pdfua.settings.suspects_absent_or_false',
  'pdfua.settings.display_doc_title_present_or_unknown',
] as const;

const RULE_ID_SET = new Set<string>(STAGE5_PAC_CATALOG_RULE_IDS);

export interface Stage5PacCatalogGap {
  ruleId: typeof STAGE5_PAC_CATALOG_RULE_IDS[number];
  category: CategoryKey;
  categoryScore: number | null;
  message: string;
  fixable: boolean;
}

function categoryScore(analysis: AnalysisResult, key: CategoryKey): number | null {
  const category = analysis.categories.find(row => row.key === key);
  return category?.applicable === false ? null : category?.score ?? null;
}

function selectedRows(snapshot: DocumentSnapshot): PacRuleEvidence[] {
  return buildPacRuleEvidence(snapshot)
    .filter(row => RULE_ID_SET.has(row.ruleId))
    .sort((a, b) => STAGE5_PAC_CATALOG_RULE_IDS.indexOf(a.ruleId as typeof STAGE5_PAC_CATALOG_RULE_IDS[number]) - STAGE5_PAC_CATALOG_RULE_IDS.indexOf(b.ruleId as typeof STAGE5_PAC_CATALOG_RULE_IDS[number]));
}

export function stage5PacCatalogGaps(
  analysis: AnalysisResult,
  snapshot: DocumentSnapshot,
): Stage5PacCatalogGap[] {
  return selectedRows(snapshot)
    .filter(row => row.status === 'fail' && row.confidence === 'verified')
    .map(row => ({
      ruleId: row.ruleId as typeof STAGE5_PAC_CATALOG_RULE_IDS[number],
      category: row.category,
      categoryScore: categoryScore(analysis, row.category),
      message: row.message,
      fixable: isStage5PacCatalogRuleFixable(row, snapshot),
    }));
}

export function shouldTryStage5PacCatalogSettings(
  analysis: AnalysisResult,
  snapshot: DocumentSnapshot,
): boolean {
  return stage5PacCatalogGaps(analysis, snapshot).some(gap => gap.fixable);
}

export function stage5PacCatalogSettingsImproved(
  beforeSnapshot: DocumentSnapshot,
  afterSnapshot: DocumentSnapshot,
): boolean {
  const beforeFailed = new Set(
    selectedRows(beforeSnapshot)
      .filter(row => row.status === 'fail' && row.confidence === 'verified')
      .map(row => row.ruleId),
  );
  if (beforeFailed.size === 0) return false;
  return selectedRows(afterSnapshot).some(row =>
    beforeFailed.has(row.ruleId) &&
    row.confidence === 'verified' &&
    row.status !== 'fail'
  );
}

export function stage5CategoryPassedPacFailed(
  analysis: AnalysisResult,
  snapshot: DocumentSnapshot,
): Stage5PacCatalogGap[] {
  return stage5PacCatalogGaps(analysis, snapshot)
    .filter(gap => gap.fixable && gap.categoryScore !== null && gap.categoryScore >= REMEDIATION_CATEGORY_THRESHOLD)
    .sort((a, b) => a.category.localeCompare(b.category) || a.ruleId.localeCompare(b.ruleId));
}

function isStage5PacCatalogRuleFixable(row: PacRuleEvidence, snapshot: DocumentSnapshot): boolean {
  if (row.ruleId === 'pdfua.settings.suspects_absent_or_false') {
    return snapshot.markInfo !== null;
  }
  if (row.ruleId === 'pdfua.settings.display_doc_title_present_or_unknown') {
    const title = snapshot.metadata.title?.trim() || snapshot.structTitle?.trim() || '';
    return title.length > 0;
  }
  return false;
}
