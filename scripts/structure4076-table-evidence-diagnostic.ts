#!/usr/bin/env tsx
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { loadBenchmarkRowsFromRunDir } from '../src/services/benchmark/stage1Acceptance.js';
import { analyzePdf } from '../src/services/pdfAnalyzer.js';
import { runPythonMutationBatch } from '../src/python/bridge.js';
import { buildPacRuleEvidence } from '../src/services/compliance/pacRuleEvidence.js';
import type { AnalysisResult, DocumentSnapshot, ScoredCategory } from '../src/types.js';
import type { RemediateBenchmarkRow } from '../src/services/benchmark/experimentCorpus.js';

const DEFAULT_RUN = 'Output/experiment-corpus-baseline/run-orphan-mcid-recovery-target-2026-05-07-r1';
const DEFAULT_OUT = 'Output/experiment-corpus-baseline/structure4076-table-evidence-diagnostic';
const DEFAULT_ROW_ID = 'structure-4076';
const DEFAULT_REPEAT = 3;
const STRUCTURE_4076_FLOOR = 70;

export type Structure4076TableClassification =
  | 'safe_existing_table_repair_candidate'
  | 'real_table_debt_no_safe_repair'
  | 'analyzer_table_applicability_volatility'
  | 'insufficient_table_identity_evidence';

export interface TableObservation {
  pass: number;
  score: number | null;
  grade: string | null;
  tableScore: number | null;
  tableApplicable: boolean | null;
  signals: {
    irregularTableCount: number;
    stronglyIrregularTableCount: number;
    directCellUnderTableCount: number;
    misplacedCellCount: number;
  };
  tables: Array<{
    structRef: string | null;
    page: number;
    hasHeaders: boolean;
    headerCount: number;
    totalCells: number;
    rowCount: number | null;
    irregularRows: number | null;
    dominantColumnCount: number | null;
    cellsMisplacedCount: number | null;
    reachable: boolean | null;
    parentPath: string[];
  }>;
  pacTableFailures: string[];
}

export interface Structure4076TableReport {
  generatedAt: string;
  runDir: string;
  rowId: string;
  pdfPath: string;
  classification: Structure4076TableClassification;
  reason: string;
  candidateTarget: TableObservation['tables'][number] | null;
  rowEvidence: {
    afterScore: number | null;
    afterGrade: string | null;
    reanalyzedScore: number | null;
    reanalyzedGrade: string | null;
    afterTableScore: number | null;
    afterTableApplicable: boolean | null;
    reanalyzedTableScore: number | null;
    reanalyzedTableApplicable: boolean | null;
    afterSignals: TableObservation['signals'];
    reanalyzedSignals: TableObservation['signals'];
  };
  observations: TableObservation[];
  mutationProbe: {
    attempted: boolean;
    applied: boolean;
    targetRef: string | null;
    invariants: Record<string, unknown> | null;
    observations: TableObservation[];
  };
}

function usage(): string {
  return 'Usage: pnpm exec tsx scripts/structure4076-table-evidence-diagnostic.ts [--run <run-dir>] [--row <row-id>] [--pdf <pdf>] [--out <dir>] [--repeat <n>] [--no-probe]';
}

function tableCategory(categories?: ScoredCategory[]): ScoredCategory | null {
  return categories?.find(category => category.key === 'table_markup') ?? null;
}

function rowSignals(profile: RemediateBenchmarkRow['afterDetectionProfile']): TableObservation['signals'] {
  const table = profile?.tableSignals;
  return {
    irregularTableCount: table?.irregularTableCount ?? 0,
    stronglyIrregularTableCount: table?.stronglyIrregularTableCount ?? 0,
    directCellUnderTableCount: table?.directCellUnderTableCount ?? 0,
    misplacedCellCount: table?.misplacedCellCount ?? 0,
  };
}

function snapshotSignals(snapshot: DocumentSnapshot): TableObservation['signals'] {
  const table = snapshot.detectionProfile?.tableSignals;
  return {
    irregularTableCount: table?.irregularTableCount ?? 0,
    stronglyIrregularTableCount: table?.stronglyIrregularTableCount ?? 0,
    directCellUnderTableCount: table?.directCellUnderTableCount ?? 0,
    misplacedCellCount: table?.misplacedCellCount ?? 0,
  };
}

function summarizeObservation(pass: number, result: AnalysisResult, snapshot: DocumentSnapshot): TableObservation {
  const table = tableCategory(result.categories);
  const pacTableFailures = buildPacRuleEvidence(snapshot)
    .filter(row => row.category === 'table_markup' && row.status === 'fail')
    .map(row => row.ruleId)
    .sort((a, b) => a.localeCompare(b));
  return {
    pass,
    score: result.score,
    grade: result.grade,
    tableScore: table?.score ?? null,
    tableApplicable: table?.applicable ?? null,
    signals: snapshotSignals(snapshot),
    tables: snapshot.tables
      .map(t => ({
        structRef: t.structRef ?? null,
        page: t.page,
        hasHeaders: Boolean(t.hasHeaders),
        headerCount: t.headerCount ?? 0,
        totalCells: t.totalCells ?? 0,
        rowCount: t.rowCount ?? null,
        irregularRows: t.irregularRows ?? null,
        dominantColumnCount: t.dominantColumnCount ?? null,
        cellsMisplacedCount: t.cellsMisplacedCount ?? null,
        reachable: typeof t.reachable === 'boolean' ? t.reachable : null,
        parentPath: t.parentPath ?? [],
      }))
      .sort((a, b) =>
        a.page - b.page ||
        (a.structRef ?? '').localeCompare(b.structRef ?? '') ||
        b.totalCells - a.totalCells
      ),
    pacTableFailures,
  };
}

function tableDebtObserved(observation: TableObservation): boolean {
  return Boolean(
    observation.tableApplicable &&
    (
      (observation.tableScore ?? 100) < 70 ||
      observation.signals.irregularTableCount > 0 ||
      observation.signals.stronglyIrregularTableCount > 0 ||
      observation.signals.directCellUnderTableCount > 0 ||
      observation.signals.misplacedCellCount > 0
    ),
  );
}

export function selectStructure4076StableTableCandidate(observations: TableObservation[]): TableObservation['tables'][number] | null {
  const counts = new Map<string, { count: number; table: TableObservation['tables'][number] }>();
  for (const observation of observations) {
    if (!tableDebtObserved(observation)) continue;
    for (const table of observation.tables) {
      if (!table.structRef) continue;
      if ((table.irregularRows ?? 0) < 2 && !table.hasHeaders && table.totalCells < 4) continue;
      const current = counts.get(table.structRef);
      if (current) current.count += 1;
      else counts.set(table.structRef, { count: 1, table });
    }
  }
  return [...counts.values()]
    .filter(row => row.count >= 2)
    .sort((a, b) =>
      b.count - a.count ||
      (b.table.irregularRows ?? 0) - (a.table.irregularRows ?? 0) ||
      b.table.totalCells - a.table.totalCells ||
      (a.table.structRef ?? '').localeCompare(b.table.structRef ?? '')
    )[0]?.table ?? null;
}

export function classifyStructure4076TableEvidence(input: {
  row: RemediateBenchmarkRow | undefined;
  observations: TableObservation[];
  candidate: TableObservation['tables'][number] | null;
  mutationProbe: Structure4076TableReport['mutationProbe'];
}): { classification: Structure4076TableClassification; reason: string } {
  if (!input.row) {
    return { classification: 'insufficient_table_identity_evidence', reason: 'Benchmark row was not found.' };
  }
  const rowAfterTable = tableCategory(input.row.afterCategories);
  const rowReanalyzedTable = tableCategory(input.row.reanalyzedCategories);
  const rowDebt = rowAfterTable?.applicable === false &&
    rowReanalyzedTable?.applicable === true &&
    (rowReanalyzedTable.score ?? 100) < 70;
  const debtObservations = input.observations.filter(tableDebtObserved);
  if (!rowDebt) {
    return { classification: 'real_table_debt_no_safe_repair', reason: 'Benchmark row does not show the expected protected table-applicability debt shape.' };
  }
  if (debtObservations.length === 0) {
    return { classification: 'analyzer_table_applicability_volatility', reason: 'Fresh repeat analysis did not reproduce protected table applicability.' };
  }
  if (!input.candidate) {
    return { classification: 'insufficient_table_identity_evidence', reason: 'Table debt reproduced, but no stable structRef target appeared in at least two repeat analyses.' };
  }
  if (!input.mutationProbe.attempted) {
    return { classification: 'insufficient_table_identity_evidence', reason: 'Stable table target was found but mutation probe was not run.' };
  }
  if (!input.mutationProbe.applied) {
    return { classification: 'real_table_debt_no_safe_repair', reason: 'Existing normalize_table_structure did not apply to the stable target.' };
  }
  const unsafeProbe = input.mutationProbe.observations.find(observation =>
    (observation.score ?? 0) < STRUCTURE_4076_FLOOR ||
    (observation.tableApplicable === true && (observation.tableScore ?? 0) < STRUCTURE_4076_FLOOR)
  );
  if (unsafeProbe) {
    return { classification: 'real_table_debt_no_safe_repair', reason: 'Mutation probe did not consistently keep score and table markup at the row floor.' };
  }
  return { classification: 'safe_existing_table_repair_candidate', reason: 'Stable table target has a successful existing normalize_table_structure probe at the row floor.' };
}

async function analyzeRepeated(pdfPath: string, filename: string, repeat: number): Promise<TableObservation[]> {
  const out: TableObservation[] = [];
  for (let pass = 1; pass <= repeat; pass++) {
    const analyzed = await analyzePdf(pdfPath, filename, { bypassCache: true, timeoutMs: 45000 });
    out.push(summarizeObservation(pass, analyzed.result, analyzed.snapshot));
  }
  return out;
}

async function analyzeBufferRepeated(buffer: Buffer, filename: string, repeat: number): Promise<TableObservation[]> {
  const dir = await mkdtemp(join(tmpdir(), 'pdfaf-structure4076-table-'));
  try {
    const pdfPath = join(dir, 'probe.pdf');
    await writeFile(pdfPath, buffer);
    return await analyzeRepeated(pdfPath, filename, repeat);
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

function mutationInvariants(result: Awaited<ReturnType<typeof runPythonMutationBatch>>['result']): Record<string, unknown> | null {
  const op = result.opResults?.find(row => row.op === 'normalize_table_structure');
  return op?.invariants && typeof op.invariants === 'object' ? op.invariants : null;
}

export async function buildStructure4076TableReport(input: {
  runDir: string;
  rowId?: string;
  pdfPath?: string;
  repeat?: number;
  probe?: boolean;
}): Promise<Structure4076TableReport> {
  const rowId = input.rowId ?? DEFAULT_ROW_ID;
  const repeat = Math.max(1, input.repeat ?? DEFAULT_REPEAT);
  const resolvedRun = resolve(input.runDir);
  const rows = await loadBenchmarkRowsFromRunDir(resolvedRun);
  const row = rows.remediateResults.find(r => r.id === rowId);
  const pdfPath = input.pdfPath ?? join(input.runDir, 'pdfs', `${rowId}.pdf`);
  const observations = existsSync(pdfPath)
    ? await analyzeRepeated(pdfPath, `${rowId}.pdf`, repeat)
    : [];
  const candidate = selectStructure4076StableTableCandidate(observations);
  const mutationProbe: Structure4076TableReport['mutationProbe'] = {
    attempted: false,
    applied: false,
    targetRef: candidate?.structRef ?? null,
    invariants: null,
    observations: [],
  };
  if (input.probe !== false && candidate?.structRef && existsSync(pdfPath)) {
    const inputBuffer = await import('node:fs/promises').then(fs => fs.readFile(pdfPath));
    const mutation = await runPythonMutationBatch(inputBuffer, [{
      op: 'normalize_table_structure',
      params: {
        structRef: candidate.structRef,
        targetStructRef: candidate.structRef,
        tableFailureClass: 'strongly_irregular_rows',
        dominantColumnCount: candidate.dominantColumnCount ?? 0,
        maxTablesPerRun: 1,
        maxSyntheticCells: 160,
        stage: 'structure4076_table_probe',
      },
    }]);
    mutationProbe.attempted = true;
    mutationProbe.applied = mutation.result.applied.includes('normalize_table_structure');
    mutationProbe.invariants = mutationInvariants(mutation.result);
    if (mutationProbe.applied) {
      mutationProbe.observations = await analyzeBufferRepeated(mutation.buffer, `${rowId}-probe.pdf`, repeat);
    }
  }
  const classified = classifyStructure4076TableEvidence({ row, observations, candidate, mutationProbe });
  const afterTable = tableCategory(row?.afterCategories);
  const reanalyzedTable = tableCategory(row?.reanalyzedCategories);
  return {
    generatedAt: new Date().toISOString(),
    runDir: input.runDir,
    rowId,
    pdfPath,
    classification: classified.classification,
    reason: classified.reason,
    candidateTarget: candidate,
    rowEvidence: {
      afterScore: row?.afterScore ?? null,
      afterGrade: row?.afterGrade ?? null,
      reanalyzedScore: row?.reanalyzedScore ?? null,
      reanalyzedGrade: row?.reanalyzedGrade ?? null,
      afterTableScore: afterTable?.score ?? null,
      afterTableApplicable: afterTable?.applicable ?? null,
      reanalyzedTableScore: reanalyzedTable?.score ?? null,
      reanalyzedTableApplicable: reanalyzedTable?.applicable ?? null,
      afterSignals: rowSignals(row?.afterDetectionProfile),
      reanalyzedSignals: rowSignals(row?.reanalyzedDetectionProfile),
    },
    observations,
    mutationProbe,
  };
}

function renderMarkdown(report: Structure4076TableReport): string {
  const lines: string[] = [];
  lines.push('# Structure 4076 Table Evidence Diagnostic');
  lines.push('');
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push(`Run: \`${report.runDir}\``);
  lines.push(`PDF: \`${report.pdfPath}\``);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(`- Classification: \`${report.classification}\``);
  lines.push(`- Reason: ${report.reason}`);
  lines.push(`- Row scores: in-run \`${report.rowEvidence.afterScore ?? 'n/a'}/${report.rowEvidence.afterGrade ?? 'n/a'}\`, protected reanalysis \`${report.rowEvidence.reanalyzedScore ?? 'n/a'}/${report.rowEvidence.reanalyzedGrade ?? 'n/a'}\``);
  lines.push(`- Row table markup: \`${report.rowEvidence.afterTableScore ?? 'n/a'}\` applicable \`${String(report.rowEvidence.afterTableApplicable)}\` -> \`${report.rowEvidence.reanalyzedTableScore ?? 'n/a'}\` applicable \`${String(report.rowEvidence.reanalyzedTableApplicable)}\``);
  lines.push(`- Candidate target: \`${report.candidateTarget?.structRef ?? 'none'}\``);
  lines.push(`- Mutation probe: attempted \`${report.mutationProbe.attempted}\`, applied \`${report.mutationProbe.applied}\``);
  lines.push('');
  lines.push('## Repeat Observations');
  lines.push('');
  lines.push('| Pass | Score | Table | Signals | Tables | PAC table failures |');
  lines.push('| ---: | --- | --- | --- | --- | --- |');
  for (const observation of report.observations) {
    lines.push(`| ${observation.pass} | ${observation.score ?? 'n/a'}/${observation.grade ?? 'n/a'} | ${observation.tableScore ?? 'n/a'} applicable ${String(observation.tableApplicable)} | irregular ${observation.signals.irregularTableCount}, strong ${observation.signals.stronglyIrregularTableCount}, direct ${observation.signals.directCellUnderTableCount}, misplaced ${observation.signals.misplacedCellCount} | ${observation.tables.map(t => `${t.structRef ?? 'no-ref'} cells=${t.totalCells} rows=${t.rowCount ?? 'n/a'} irregular=${t.irregularRows ?? 'n/a'} headers=${t.headerCount}`).join('<br>') || 'none'} | ${observation.pacTableFailures.join(', ') || 'none'} |`);
  }
  lines.push('');
  if (report.mutationProbe.observations.length > 0) {
    lines.push('## Mutation Probe Observations');
    lines.push('');
    lines.push('| Pass | Score | Table | Signals |');
    lines.push('| ---: | --- | --- | --- |');
    for (const observation of report.mutationProbe.observations) {
      lines.push(`| ${observation.pass} | ${observation.score ?? 'n/a'}/${observation.grade ?? 'n/a'} | ${observation.tableScore ?? 'n/a'} applicable ${String(observation.tableApplicable)} | irregular ${observation.signals.irregularTableCount}, strong ${observation.signals.stronglyIrregularTableCount}, direct ${observation.signals.directCellUnderTableCount}, misplaced ${observation.signals.misplacedCellCount} |`);
    }
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
}

async function main(): Promise<void> {
  let runDir = DEFAULT_RUN;
  let outDir = DEFAULT_OUT;
  let rowId = DEFAULT_ROW_ID;
  let pdfPath: string | undefined;
  let repeat = DEFAULT_REPEAT;
  let probe = true;
  const args = process.argv.slice(2);
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const next = args[index + 1];
    if (arg === '--help' || arg === '-h') {
      console.log(usage());
      return;
    }
    if (arg === '--run' && next) {
      runDir = next;
      index += 1;
      continue;
    }
    if (arg === '--out' && next) {
      outDir = next;
      index += 1;
      continue;
    }
    if (arg === '--row' && next) {
      rowId = next;
      index += 1;
      continue;
    }
    if (arg === '--pdf' && next) {
      pdfPath = next;
      index += 1;
      continue;
    }
    if (arg === '--repeat' && next) {
      repeat = Number.parseInt(next, 10);
      index += 1;
      continue;
    }
    if (arg === '--no-probe') {
      probe = false;
      continue;
    }
    throw new Error(`Unknown or incomplete argument: ${arg ?? ''}\n${usage()}`);
  }

  const report = await buildStructure4076TableReport({ runDir, rowId, pdfPath, repeat, probe });
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, 'structure4076-table-evidence.json'), `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(join(outDir, 'structure4076-table-evidence.md'), renderMarkdown(report));
  console.log(`Wrote structure-4076 table evidence diagnostic to ${resolve(outDir)}`);
  console.log(`Classification: ${report.classification}; reason: ${report.reason}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
