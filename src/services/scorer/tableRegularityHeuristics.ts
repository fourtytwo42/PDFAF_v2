import type { DocumentSnapshot } from '../../types.js';

type TableRow = DocumentSnapshot['tables'][number];

/**
 * pdfaf `isAdvisoryTableRegularity` (Tier A): mild row-count irregularity at table boundaries,
 * not a severe structural break. Requires `rowCellCounts` from Python `_audit_table_structure`.
 */
export function isAdvisoryTableRegularity(table: TableRow): boolean {
  const rowCellCounts = (table.rowCellCounts ?? []).filter(c => Number.isFinite(c) && c > 0);
  const dominantColumnCount = table.dominantColumnCount ?? 0;
  if (!table.hasHeaders || (table.irregularRows ?? 0) === 0) return false;
  if (rowCellCounts.length < 3 || dominantColumnCount <= 0) return false;
  if ((table.maxRowSpan ?? 1) > 1 || (table.maxColSpan ?? 1) > 1) return false;

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
