import type { AnalysisResult, DocumentSnapshot } from '../../types.js';

export type ZeroHeadingRecoveryKind =
  | 'not_zero_heading_recovery'
  | 'recoverable_paragraph_tree'
  | 'minimal_or_degenerate_tree'
  | 'hidden_export_mismatch'
  | 'hierarchy_only';

export interface ZeroHeadingRecoveryDisposition {
  kind: ZeroHeadingRecoveryKind;
  reasons: string[];
}

const ZERO_HEADING_RECOVERY_SCORE_THRESHOLD = 70;

function headingScore(analysis: AnalysisResult): number | null {
  const category = analysis.categories.find(row => row.key === 'heading_structure');
  return category?.applicable ? category.score : null;
}

export function classifyZeroHeadingRecovery(
  analysis: AnalysisResult,
  snapshot: DocumentSnapshot,
): ZeroHeadingRecoveryDisposition {
  const reasons: string[] = [];
  const score = headingScore(analysis);
  if (analysis.pdfClass === 'scanned') {
    return { kind: 'not_zero_heading_recovery', reasons: ['scanned_pdf'] };
  }
  if (snapshot.pageCount <= 1) {
    return { kind: 'not_zero_heading_recovery', reasons: ['single_page_heading_optional'] };
  }
  if (score == null || score >= ZERO_HEADING_RECOVERY_SCORE_THRESHOLD) {
    return { kind: 'not_zero_heading_recovery', reasons: ['heading_score_not_zero_recovery'] };
  }

  const headingSignals = snapshot.detectionProfile?.headingSignals;
  const readingSignals = snapshot.detectionProfile?.readingOrderSignals;
  const treeDepth = readingSignals?.structureTreeDepth ?? (snapshot.structureTree ? 2 : 0);
  const treeHeadingCount = headingSignals?.treeHeadingCount ?? snapshot.headings.length;
  const paragraphCount = snapshot.paragraphStructElems?.length ?? 0;
  const hasExportedHeadings = snapshot.headings.length > 0;
  const exportedMissing = headingSignals?.extractedHeadingsMissingFromTree === true;
  const degenerate = readingSignals?.degenerateStructureTree === true || treeDepth <= 2;

  if (hasExportedHeadings) {
    reasons.push('exported_headings_present');
    return { kind: 'hierarchy_only', reasons };
  }

  if (treeHeadingCount > 0 && !exportedMissing) {
    reasons.push('tree_headings_without_exported_heading_text');
    return { kind: 'hidden_export_mismatch', reasons };
  }

  if (snapshot.structureTree !== null && paragraphCount > 0 && treeDepth >= 3 && score === 0) {
    reasons.push('reachable_paragraph_like_tree');
    reasons.push(`paragraph_count:${paragraphCount}`);
    return { kind: 'recoverable_paragraph_tree', reasons };
  }

  if (snapshot.structureTree !== null && score === 0 && degenerate) {
    reasons.push('minimal_or_degenerate_tree');
    reasons.push(`tree_depth:${treeDepth}`);
    return { kind: 'minimal_or_degenerate_tree', reasons };
  }

  return { kind: 'not_zero_heading_recovery', reasons: ['no_matching_zero_heading_bucket'] };
}

