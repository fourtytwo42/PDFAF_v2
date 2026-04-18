import type { DocumentSnapshot, ScoredCategory, Finding } from '../../../types.js';
import { isAdvisoryTableRegularity } from '../tableRegularityHeuristics.js';

export function scoreTableMarkup(snap: DocumentSnapshot): ScoredCategory {
  if (snap.tables.length === 0) {
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
  const stage3 = snap.detectionProfile?.tableSignals;
  const tablesWithHeaders = snap.tables.filter(t => t.hasHeaders);
  const ratio = tablesWithHeaders.length / snap.tables.length;
  let score = Math.round(ratio * 100);

  if (tablesWithHeaders.length < snap.tables.length) {
    const missing = snap.tables.length - tablesWithHeaders.length;
    findings.push({
      category: 'table_markup',
      severity: ratio < 0.5 ? 'critical' : ratio < 0.8 ? 'moderate' : 'minor',
      wcag: '1.3.1',
      message: `${missing} of ${snap.tables.length} table${snap.tables.length !== 1 ? 's' : ''} lack header cells (/TH). Screen readers cannot associate data with headers.`,
      count: missing,
    });
  }

  // Acrobat "Table rows / TH and TD / regularity" — align scorer with per-table struct audit (v1-style).
  let misplacedCells = stage3?.misplacedCellCount ?? 0;
  let irregularTables = stage3?.irregularTableCount ?? 0;
  if (!stage3) {
    for (const t of snap.tables) {
      misplacedCells += t.cellsMisplacedCount ?? 0;
      if ((t.irregularRows ?? 0) > 0) irregularTables += 1;
    }
  }
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

  if ((stage3?.stronglyIrregularTableCount ?? 0) > 0) {
    findings.push({
      category: 'table_markup',
      severity: 'moderate',
      wcag: '1.3.1',
      message: `${stage3!.stronglyIrregularTableCount} table(s) have strongly irregular row structure beyond advisory variance.`,
      count: stage3!.stronglyIrregularTableCount,
    });
    score = Math.min(score, Math.max(0, 100 - stage3!.stronglyIrregularTableCount * 18));
  }

  let advisoryCount = 0;
  for (const t of snap.tables) {
    if (isAdvisoryTableRegularity(t)) advisoryCount += 1;
  }
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

function scoreSeverity(score: number) {
  if (score >= 90) return 'pass' as const;
  if (score >= 70) return 'minor' as const;
  if (score >= 40) return 'moderate' as const;
  return 'critical' as const;
}
