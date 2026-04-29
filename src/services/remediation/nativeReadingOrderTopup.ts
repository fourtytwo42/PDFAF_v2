import type { AnalysisResult, DocumentSnapshot } from '../../types.js';
import { isOcrPageShell } from './visibleHeadingAnchor.js';

export type Stage152NativeReadingOrderClass =
  | 'native_tagged_reading_order_topup_candidate'
  | 'ocr_shell_defer'
  | 'no_tree_native_shell_defer'
  | 'annotation_risk_blocked'
  | 'table_or_form_blocked'
  | 'already_good_control'
  | 'no_safe_candidate';

export interface Stage152NativeReadingOrderDisposition {
  classification: Stage152NativeReadingOrderClass;
  reasons: string[];
}

function categoryScore(analysis: AnalysisResult, key: string): number | null {
  const category = analysis.categories.find(row => row.key === key);
  return category?.applicable ? category.score : null;
}

export function classifyStage152NativeReadingOrderTopup(
  analysis: AnalysisResult,
  snapshot: DocumentSnapshot,
): Stage152NativeReadingOrderDisposition {
  const reading = categoryScore(analysis, 'reading_order') ?? 100;
  if (reading > 45) return { classification: 'already_good_control', reasons: [`reading_order:${reading}`] };
  if (analysis.pdfClass === 'scanned' || isOcrPageShell(snapshot, analysis)) {
    return { classification: 'ocr_shell_defer', reasons: ['ocr_or_scanned_shell'] };
  }
  if (analysis.pdfClass !== 'native_tagged' || !snapshot.isTagged || snapshot.structureTree === null) {
    return { classification: 'no_tree_native_shell_defer', reasons: ['not_native_tagged_with_tree'] };
  }
  if (snapshot.textCharCount <= 0 || (categoryScore(analysis, 'text_extractability') ?? 0) < 60) {
    return { classification: 'no_safe_candidate', reasons: ['not_extractable_text'] };
  }

  const readingSignals = snapshot.detectionProfile?.readingOrderSignals;
  const depth = readingSignals?.structureTreeDepth ?? 0;
  const degenerate = readingSignals?.degenerateStructureTree === true;
  if (!degenerate || depth > 2) {
    return { classification: 'no_safe_candidate', reasons: [`depth:${depth}`, `degenerate:${degenerate}`] };
  }
  const annotationSignals = snapshot.detectionProfile?.annotationSignals;
  const annotationRisk =
    (readingSignals?.annotationOrderRiskCount ?? 0) +
    (readingSignals?.annotationStructParentRiskCount ?? 0) +
    (annotationSignals?.pagesAnnotationOrderDiffers ?? 0) +
    (annotationSignals?.linkAnnotationsMissingStructParent ?? 0) +
    (annotationSignals?.nonLinkAnnotationsMissingStructParent ?? 0);
  if (annotationRisk > 0) {
    return { classification: 'annotation_risk_blocked', reasons: [`annotation_risk:${annotationRisk}`] };
  }
  if ((categoryScore(analysis, 'table_markup') ?? 100) < 40 || (categoryScore(analysis, 'form_accessibility') ?? 100) < 60) {
    return { classification: 'table_or_form_blocked', reasons: ['severe_table_or_form_blocker'] };
  }
  const hasContentEvidence =
    snapshot.headings.length > 0 ||
    (snapshot.paragraphStructElems?.length ?? 0) > 0 ||
    snapshot.figures.length > 0 ||
    snapshot.tables.length > 0 ||
    (snapshot.mcidTextSpans?.length ?? 0) > 0;
  if (!hasContentEvidence) {
    return { classification: 'no_safe_candidate', reasons: ['no_root_content_evidence'] };
  }
  return {
    classification: 'native_tagged_reading_order_topup_candidate',
    reasons: [`reading_order:${reading}`, `structure_depth:${depth}`, 'degenerate_structure_tree'],
  };
}

export function shouldTryNativeReadingOrderTopup(
  analysis: AnalysisResult,
  snapshot: DocumentSnapshot,
): boolean {
  return classifyStage152NativeReadingOrderTopup(analysis, snapshot).classification ===
    'native_tagged_reading_order_topup_candidate';
}
