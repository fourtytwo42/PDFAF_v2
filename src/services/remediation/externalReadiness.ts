import type { AnalysisResult, DocumentSnapshot } from '../../types.js';

export function hasExternalReadinessDebt(
  analysis: AnalysisResult,
  snapshot: DocumentSnapshot,
): boolean {
  const reading = snapshot.detectionProfile?.readingOrderSignals;
  const heading = snapshot.detectionProfile?.headingSignals;
  const figure = snapshot.detectionProfile?.figureSignals;
  const table = snapshot.detectionProfile?.tableSignals;
  return (
    heading?.extractedHeadingsMissingFromTree === true ||
    reading?.degenerateStructureTree === true ||
    ((reading?.structureTreeDepth ?? 0) === 0 && snapshot.pageCount > 1 && snapshot.isTagged) ||
    figure?.treeFigureMissingForExtractedFigures === true ||
    (figure?.nonFigureRoleCount ?? 0) > 0 ||
    (table?.irregularTableCount ?? 0) > 0 ||
    (table?.stronglyIrregularTableCount ?? 0) > 0 ||
    (table?.directCellUnderTableCount ?? 0) > 0 ||
    analysis.categories.some(category =>
      category.applicable &&
      ['heading_structure', 'reading_order', 'alt_text', 'table_markup'].includes(category.key) &&
      category.score < 95,
    )
  );
}
