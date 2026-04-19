import type { DocumentSnapshot } from '../../types.js';
import type { DetectionProfile } from '../../types.js';

type TableRow = DocumentSnapshot['tables'][number];
type TableSignals = DetectionProfile['tableSignals'];

function simpleExplicitHeaderedTable(table: TableRow): boolean {
  return (
    table.hasHeaders &&
    (table.cellsMisplacedCount ?? 0) === 0 &&
    (table.maxRowSpan ?? 1) <= 1 &&
    (table.maxColSpan ?? 1) <= 1
  );
}

function normalizedRowCellCounts(table: TableRow): number[] {
  return (table.rowCellCounts ?? []).filter(c => Number.isFinite(c) && c > 0);
}

/**
 * pdfaf `isAdvisoryTableRegularity` (Tier A): mild row-count irregularity at table boundaries,
 * not a severe structural break. Requires `rowCellCounts` from Python `_audit_table_structure`.
 */
export function isAdvisoryTableRegularity(table: TableRow): boolean {
  const rowCellCounts = normalizedRowCellCounts(table);
  const dominantColumnCount = table.dominantColumnCount ?? 0;
  if (!simpleExplicitHeaderedTable(table) || (table.irregularRows ?? 0) === 0) return false;
  if (rowCellCounts.length < 3 || dominantColumnCount <= 0) return false;

  const mismatchIndexes = rowCellCounts
    .map((count, index) => ({ count, index }))
    .filter(entry => entry.count !== dominantColumnCount);

  if (mismatchIndexes.length === 0) return false;

  const maxMismatchCount = rowCellCounts.length <= 4 ? 1 : 2;
  if (mismatchIndexes.length > maxMismatchCount) return false;

  const regularRatio = (rowCellCounts.length - mismatchIndexes.length) / rowCellCounts.length;
  if (regularRatio < (rowCellCounts.length <= 4 ? 0.66 : 0.8)) return false;

  const halfWidth = Math.max(1, Math.ceil(dominantColumnCount / 2));
  const hasBoundaryMismatch = mismatchIndexes.some(
    entry => entry.index === 0 || entry.index === rowCellCounts.length - 1,
  );

  return mismatchIndexes.every(
    entry =>
      entry.count < dominantColumnCount &&
      (hasBoundaryMismatch || entry.count <= halfWidth),
  );
}

function isBoundedSingleColumnVarianceTable(table: TableRow): boolean {
  const rowCellCounts = normalizedRowCellCounts(table);
  const dominantColumnCount = table.dominantColumnCount ?? 0;
  if (!simpleExplicitHeaderedTable(table) || rowCellCounts.length < 6 || dominantColumnCount <= 0) return false;

  const mismatchCounts = rowCellCounts.filter(count => count !== dominantColumnCount);
  if (mismatchCounts.length === 0) return false;
  if (mismatchCounts.length / rowCellCounts.length > 0.35) return false;

  return mismatchCounts.every(count => count === dominantColumnCount + 1);
}

function isShortProgressiveHeaderTable(table: TableRow): boolean {
  const rowCellCounts = normalizedRowCellCounts(table);
  if (!simpleExplicitHeaderedTable(table) || rowCellCounts.length !== 3) return false;
  if ((table.headerCount ?? 0) < Math.ceil((table.totalCells ?? 0) / 2)) return false;
  const [first, second, third] = rowCellCounts;
  if (first === undefined || second === undefined || third === undefined) return false;

  return first <= second && second <= third && first < third;
}

export function isNormalizedAdvisoryTableRegularity(table: TableRow): boolean {
  return (
    isAdvisoryTableRegularity(table) ||
    isBoundedSingleColumnVarianceTable(table) ||
    isShortProgressiveHeaderTable(table)
  );
}

export function normalizedTableSignals(
  snapshot: DocumentSnapshot,
  rawSignals?: TableSignals | null,
): TableSignals & { advisoryRegularityCount: number } {
  const advisoryRegularityCount = snapshot.tables.filter(table => isNormalizedAdvisoryTableRegularity(table)).length;
  const fallbackIrregularCount = snapshot.tables.filter(
    table => (table.irregularRows ?? 0) > 0 && !isNormalizedAdvisoryTableRegularity(table),
  ).length;
  const fallbackStronglyIrregularCount = snapshot.tables.filter(
    table =>
      (table.irregularRows ?? 0) >= 2 &&
      !isNormalizedAdvisoryTableRegularity(table),
  ).length;

  return {
    tablesWithMisplacedCells:
      rawSignals?.tablesWithMisplacedCells ??
      snapshot.tables.filter(table => (table.cellsMisplacedCount ?? 0) > 0).length,
    misplacedCellCount:
      rawSignals?.misplacedCellCount ??
      snapshot.tables.reduce((sum, table) => sum + (table.cellsMisplacedCount ?? 0), 0),
    irregularTableCount: Math.max(
      fallbackIrregularCount,
      (rawSignals?.irregularTableCount ?? fallbackIrregularCount) - advisoryRegularityCount,
    ),
    stronglyIrregularTableCount: Math.max(
      fallbackStronglyIrregularCount,
      (rawSignals?.stronglyIrregularTableCount ?? fallbackStronglyIrregularCount) - advisoryRegularityCount,
    ),
    directCellUnderTableCount:
      rawSignals?.directCellUnderTableCount ?? rawSignals?.misplacedCellCount ?? 0,
    advisoryRegularityCount,
  };
}
