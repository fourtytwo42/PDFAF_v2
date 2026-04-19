import type { DocumentSnapshot, ScoredCategory, Finding } from '../../../types.js';
import { normalizedTableSignals } from '../tableRegularityHeuristics.js';

export function scoreTableMarkup(snap: DocumentSnapshot): ScoredCategory {
  const scoredTables = snap.tables.filter(table => !isTinyRowlessTable(table));

  if (scoredTables.length === 0) {
    return {
      key: 'table_markup',
      score: 100,
      weight: 0.085,
      applicable: false,
      severity: 'pass',
      findings: [],
    };
  }

  const findings: Finding[] = [];
  const effectiveSignals = normalizedTableSignals(snap, snap.detectionProfile?.tableSignals);
  const tablesWithHeaders = scoredTables.filter(t => t.hasHeaders);
  const ratio = tablesWithHeaders.length / scoredTables.length;
  let score = Math.round(ratio * 100);

  if (tablesWithHeaders.length < scoredTables.length) {
    const missing = scoredTables.length - tablesWithHeaders.length;
    findings.push({
      category: 'table_markup',
      severity: ratio < 0.5 ? 'critical' : ratio < 0.8 ? 'moderate' : 'minor',
      wcag: '1.3.1',
      message: `${missing} of ${scoredTables.length} table${scoredTables.length !== 1 ? 's' : ''} lack header cells (/TH). Screen readers cannot associate data with headers.`,
      count: missing,
    });
  }

  // Acrobat "Table rows / TH and TD / regularity" — align scorer with per-table struct audit (v1-style).
  const misplacedCells = effectiveSignals.misplacedCellCount;
  const irregularTables = effectiveSignals.irregularTableCount;
  if (misplacedCells > 0 || irregularTables > 0) {
    const parts: string[] = [];
    if (misplacedCells > 0) {
      parts.push(
        `${misplacedCells} table cell(s) sit outside /TR rows (TH/TD must be children of TR for assistive technology).`,
      );
    }
    if (irregularTables > 0) {
      parts.push(
        `${irregularTables} table${irregularTables !== 1 ? 's' : ''} ha${irregularTables === 1 ? 's' : 've'} rows with different column counts (regularity).`,
      );
    }
    findings.push({
      category: 'table_markup',
      severity: misplacedCells > 8 || irregularTables > 2 ? 'moderate' : 'minor',
      wcag: '1.3.1',
      message: parts.join(' '),
      count: misplacedCells + irregularTables,
    });
    const rolePenalty = Math.min(85, misplacedCells * 5 + irregularTables * 10);
    score = Math.min(score, Math.max(0, 100 - rolePenalty));
  }

  const stronglyIrregularTableCount = effectiveSignals.stronglyIrregularTableCount;
  if (stronglyIrregularTableCount > 0) {
    findings.push({
      category: 'table_markup',
      severity: 'moderate',
      wcag: '1.3.1',
      message: `${stronglyIrregularTableCount} table(s) have strongly irregular row structure beyond advisory variance.`,
      count: stronglyIrregularTableCount,
    });
    score = Math.min(score, Math.max(0, 100 - stronglyIrregularTableCount * 18));
  }
  const advisoryCount = effectiveSignals.advisoryRegularityCount;
  if (advisoryCount > 0) {
    findings.push({
      category: 'table_markup',
      severity: 'minor',
      wcag: '1.3.1',
      message: `${advisoryCount} table(s) show mild row-length irregularity at boundaries (advisory regularity — verify in Acrobat).`,
      count: advisoryCount,
    });
    score = Math.min(score, Math.max(0, 100 - advisoryCount * 4));
  }

  return {
    key: 'table_markup',
    score,
    weight: 0.085,
    applicable: true,
    severity: scoreSeverity(score),
    findings,
  };
}

function isTinyRowlessTable(table: DocumentSnapshot['tables'][number]): boolean {
  return (
    (table.rowCount ?? 0) <= 1 &&
    (table.totalCells ?? 0) <= 2 &&
    (table.cellsMisplacedCount ?? 0) === 0
  );
}

function scoreSeverity(score: number) {
  if (score >= 90) return 'pass' as const;
  if (score >= 70) return 'minor' as const;
  if (score >= 40) return 'moderate' as const;
  return 'critical' as const;
}
