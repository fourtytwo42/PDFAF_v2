#!/usr/bin/env tsx
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { loadBenchmarkRowsFromRunDir } from '../src/services/benchmark/stage1Acceptance.js';
import type { RemediateBenchmarkRow } from '../src/services/benchmark/experimentCorpus.js';

const DEFAULT_REFERENCE = 'Output/experiment-corpus-baseline/run-stage187-full-2026-05-03-r1';
const DEFAULT_STRICT = 'Output/experiment-corpus-baseline/run-pac-gate-narrowing-stage1-2026-05-06-r1';
const DEFAULT_OUT = 'Output/experiment-corpus-baseline/pac-gate-recovery-diagnostic';
const PAC_GATE_REASON_RE = /pac_rule_regressed\(([^)]+)\)/;

type PacStatus = 'pass' | 'warn' | 'fail' | 'not_applicable' | string;

export interface ParsedPacGateDetails {
  ruleId: string;
  reason: string;
  category: string | null;
  beforeStatus: PacStatus | null;
  afterStatus: PacStatus | null;
  beforeCount: number | null;
  afterCount: number | null;
  scoreBefore: number | null;
  scoreAfter: number | null;
  categoryScoreBefore: number | null;
  categoryScoreAfter: number | null;
}

export interface PacGateRecoveryRow {
  fileId: string;
  file: string;
  toolName: string;
  stage: number;
  round: number;
  ruleId: string;
  reason: string;
  classification: 'newly_evaluable_debt' | 'true_regression' | 'same_or_lower_failure' | 'unknown';
  blockedUsefulRepair: boolean;
  category: string | null;
  beforeStatus: PacStatus | null;
  afterStatus: PacStatus | null;
  beforeCount: number | null;
  afterCount: number | null;
  rejectedScoreBefore: number | null;
  rejectedScoreAfter: number | null;
  rejectedCategoryScoreBefore: number | null;
  rejectedCategoryScoreAfter: number | null;
  strictFinalScore: number | null;
  referenceFinalScore: number | null;
  strictToReferenceGap: number | null;
  estimatedRecovery: number | null;
}

export interface PacGateRecoveryFrequencyRow {
  key: string;
  count: number;
  fileCount: number;
  blockedUsefulRepairCount: number;
  estimatedRecovery: number;
}

export interface PacGateRecoveryReport {
  generatedAt: string;
  referenceRunDir: string;
  strictRunDir: string;
  summary: {
    referenceFileCount: number;
    strictFileCount: number;
    pacGateRejectionCount: number;
    newlyEvaluableDebtCount: number;
    trueRegressionCount: number;
    blockedUsefulRepairCount: number;
    estimatedRecoverableFiles: number;
    estimatedRecoveryScoreSum: number;
  };
  byRule: PacGateRecoveryFrequencyRow[];
  byTool: PacGateRecoveryFrequencyRow[];
  rows: PacGateRecoveryRow[];
}

function usage(): string {
  return [
    'Usage: pnpm exec tsx scripts/pac-gate-recovery-diagnostic.ts [--reference <run-dir>] [--strict <run-dir>] [--out <dir>]',
  ].join('\n');
}

function scoreFor(row?: RemediateBenchmarkRow): number | null {
  if (!row) return null;
  return row.reanalyzedScore ?? row.afterScore ?? null;
}

function mapRows(rows: RemediateBenchmarkRow[]): Map<string, RemediateBenchmarkRow> {
  return new Map(rows.map(row => [row.id, row]));
}

function sortedUnique(values: Iterable<string>): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function parseDetailsObject(value: unknown): Record<string, unknown> | null {
  if (typeof value === 'string') {
    try {
      return asRecord(JSON.parse(value));
    } catch {
      return null;
    }
  }
  return asRecord(value);
}

export function parsePacGateDetails(details: unknown): ParsedPacGateDetails | null {
  const raw = typeof details === 'string' ? details : JSON.stringify(details ?? '');
  const match = raw.match(PAC_GATE_REASON_RE);
  if (!match?.[1]) return null;

  const parsed = parseDetailsObject(details);
  const regression = asRecord(parsed?.['pacRuleRegression']);
  const debug = asRecord(parsed?.['debug']);
  const replay = asRecord(debug?.['replayState']);
  const category = stringOrNull(regression?.['category']);
  const beforeCategoryScores = asRecord(replay?.['categoryScoresBefore']);
  const afterCategoryScores = asRecord(replay?.['categoryScoresAfter']);

  return {
    ruleId: match[1],
    reason: `pac_rule_regressed(${match[1]})`,
    category,
    beforeStatus: stringOrNull(regression?.['beforeStatus']),
    afterStatus: stringOrNull(regression?.['afterStatus']),
    beforeCount: numberOrNull(regression?.['beforeCount']),
    afterCount: numberOrNull(regression?.['afterCount']),
    scoreBefore: numberOrNull(replay?.['scoreBefore']),
    scoreAfter: numberOrNull(replay?.['scoreAfter']),
    categoryScoreBefore: category ? numberOrNull(beforeCategoryScores?.[category]) : null,
    categoryScoreAfter: category ? numberOrNull(afterCategoryScores?.[category]) : null,
  };
}

function classify(details: ParsedPacGateDetails): PacGateRecoveryRow['classification'] {
  if (details.beforeStatus === 'not_applicable') return 'newly_evaluable_debt';
  if (
    details.afterStatus === 'fail' &&
    (details.beforeStatus === 'pass' || details.beforeStatus === 'warn')
  ) {
    return 'true_regression';
  }
  if (
    details.beforeStatus === 'fail' &&
    details.afterStatus === 'fail' &&
    details.beforeCount != null &&
    details.afterCount != null
  ) {
    if (details.afterCount > details.beforeCount) return 'true_regression';
    return 'same_or_lower_failure';
  }
  return 'unknown';
}

function blockedUsefulRepair(details: ParsedPacGateDetails): boolean {
  if (details.scoreBefore != null && details.scoreAfter != null && details.scoreAfter > details.scoreBefore) {
    return true;
  }
  return (
    details.categoryScoreBefore != null &&
    details.categoryScoreAfter != null &&
    details.categoryScoreAfter > details.categoryScoreBefore
  );
}

function rowSort(a: PacGateRecoveryRow, b: PacGateRecoveryRow): number {
  return (
    a.classification.localeCompare(b.classification) ||
    Number(b.blockedUsefulRepair) - Number(a.blockedUsefulRepair) ||
    (b.estimatedRecovery ?? 0) - (a.estimatedRecovery ?? 0) ||
    a.ruleId.localeCompare(b.ruleId) ||
    a.fileId.localeCompare(b.fileId) ||
    a.toolName.localeCompare(b.toolName) ||
    a.stage - b.stage ||
    a.round - b.round
  );
}

function buildFrequency(
  rows: PacGateRecoveryRow[],
  keyFor: (row: PacGateRecoveryRow) => string,
): PacGateRecoveryFrequencyRow[] {
  const grouped = new Map<string, {
    key: string;
    count: number;
    files: string[];
    blockedUsefulRepairCount: number;
    estimatedRecovery: number;
  }>();
  for (const row of rows) {
    const key = keyFor(row);
    const current = grouped.get(key) ?? {
      key,
      count: 0,
      files: [],
      blockedUsefulRepairCount: 0,
      estimatedRecovery: 0,
    };
    current.count += 1;
    current.files.push(row.fileId);
    if (row.blockedUsefulRepair) current.blockedUsefulRepairCount += 1;
    current.estimatedRecovery += row.estimatedRecovery ?? 0;
    grouped.set(key, current);
  }
  return [...grouped.values()]
    .map(row => ({
      key: row.key,
      count: row.count,
      fileCount: sortedUnique(row.files).length,
      blockedUsefulRepairCount: row.blockedUsefulRepairCount,
      estimatedRecovery: Math.round(row.estimatedRecovery * 100) / 100,
    }))
    .sort((a, b) =>
      b.blockedUsefulRepairCount - a.blockedUsefulRepairCount ||
      b.count - a.count ||
      b.estimatedRecovery - a.estimatedRecovery ||
      a.key.localeCompare(b.key),
    );
}

export function buildPacGateRecoveryDiagnostic(input: {
  referenceRunDir: string;
  strictRunDir: string;
  referenceRows: RemediateBenchmarkRow[];
  strictRows: RemediateBenchmarkRow[];
  generatedAt?: string;
}): PacGateRecoveryReport {
  const referenceById = mapRows(input.referenceRows);
  const rows: PacGateRecoveryRow[] = [];
  for (const strict of input.strictRows) {
    const strictFinalScore = scoreFor(strict);
    const referenceFinalScore = scoreFor(referenceById.get(strict.id));
    for (const tool of strict.appliedTools ?? []) {
      const parsed = parsePacGateDetails(tool.details);
      if (!parsed) continue;
      const classification = classify(parsed);
      const useful = blockedUsefulRepair(parsed);
      const rejectedScoreAfter = parsed.scoreAfter;
      const estimatedRecovery =
        useful && strictFinalScore != null && rejectedScoreAfter != null
          ? Math.max(0, rejectedScoreAfter - strictFinalScore)
          : null;
      rows.push({
        fileId: strict.id,
        file: strict.file,
        toolName: tool.toolName,
        stage: tool.stage,
        round: tool.round,
        ruleId: parsed.ruleId,
        reason: parsed.reason,
        classification,
        blockedUsefulRepair: useful,
        category: parsed.category,
        beforeStatus: parsed.beforeStatus,
        afterStatus: parsed.afterStatus,
        beforeCount: parsed.beforeCount,
        afterCount: parsed.afterCount,
        rejectedScoreBefore: parsed.scoreBefore,
        rejectedScoreAfter,
        rejectedCategoryScoreBefore: parsed.categoryScoreBefore,
        rejectedCategoryScoreAfter: parsed.categoryScoreAfter,
        strictFinalScore,
        referenceFinalScore,
        strictToReferenceGap:
          strictFinalScore != null && referenceFinalScore != null
            ? referenceFinalScore - strictFinalScore
            : null,
        estimatedRecovery,
      });
    }
  }

  rows.sort(rowSort);
  const recoverableByFile = new Map<string, number>();
  for (const row of rows) {
    if (!row.blockedUsefulRepair || row.estimatedRecovery == null) continue;
    recoverableByFile.set(row.fileId, Math.max(recoverableByFile.get(row.fileId) ?? 0, row.estimatedRecovery));
  }
  const estimatedRecoveryScoreSum = [...recoverableByFile.values()].reduce((sum, value) => sum + value, 0);

  return {
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    referenceRunDir: input.referenceRunDir,
    strictRunDir: input.strictRunDir,
    summary: {
      referenceFileCount: input.referenceRows.length,
      strictFileCount: input.strictRows.length,
      pacGateRejectionCount: rows.length,
      newlyEvaluableDebtCount: rows.filter(row => row.classification === 'newly_evaluable_debt').length,
      trueRegressionCount: rows.filter(row => row.classification === 'true_regression').length,
      blockedUsefulRepairCount: rows.filter(row => row.blockedUsefulRepair).length,
      estimatedRecoverableFiles: recoverableByFile.size,
      estimatedRecoveryScoreSum: Math.round(estimatedRecoveryScoreSum * 100) / 100,
    },
    byRule: buildFrequency(rows, row => row.ruleId),
    byTool: buildFrequency(rows, row => row.toolName),
    rows,
  };
}

function mdTable(headers: string[], rows: string[][]): string[] {
  if (rows.length === 0) return ['None.'];
  return [
    `| ${headers.join(' |')} |`,
    `| ${headers.map(() => '---').join(' |')} |`,
    ...rows.map(row => `| ${row.map(cell => String(cell).replace(/\|/g, '\\|')).join(' |')} |`),
  ];
}

export function renderPacGateRecoveryMarkdown(report: PacGateRecoveryReport): string {
  const lines: string[] = [];
  lines.push('# PAC Gate Recovery Diagnostic');
  lines.push('');
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push(`Reference run: \`${report.referenceRunDir}\``);
  lines.push(`Strict run: \`${report.strictRunDir}\``);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(`- PAC gate rejections: ${report.summary.pacGateRejectionCount}`);
  lines.push(`- Newly evaluable debt: ${report.summary.newlyEvaluableDebtCount}`);
  lines.push(`- True regressions: ${report.summary.trueRegressionCount}`);
  lines.push(`- Blocked useful repairs: ${report.summary.blockedUsefulRepairCount}`);
  lines.push(`- Estimated recoverable files: ${report.summary.estimatedRecoverableFiles}`);
  lines.push(`- Estimated score recovery sum: ${report.summary.estimatedRecoveryScoreSum}`);
  lines.push('');
  lines.push('## By Rule');
  lines.push('');
  lines.push(...mdTable(
    ['Rule', 'Count', 'Files', 'Blocked useful', 'Estimated recovery'],
    report.byRule.map(row => [
      row.key,
      String(row.count),
      String(row.fileCount),
      String(row.blockedUsefulRepairCount),
      String(row.estimatedRecovery),
    ]),
  ));
  lines.push('');
  lines.push('## By Tool');
  lines.push('');
  lines.push(...mdTable(
    ['Tool', 'Count', 'Files', 'Blocked useful', 'Estimated recovery'],
    report.byTool.map(row => [
      row.key,
      String(row.count),
      String(row.fileCount),
      String(row.blockedUsefulRepairCount),
      String(row.estimatedRecovery),
    ]),
  ));
  lines.push('');
  lines.push('## Top Rows');
  lines.push('');
  lines.push(...mdTable(
    ['File', 'Rule', 'Tool', 'Class', 'Useful', 'Rejected score', 'Strict', 'Reference', 'Recovery'],
    report.rows
      .filter(row => row.blockedUsefulRepair || row.classification === 'newly_evaluable_debt')
      .slice(0, 80)
      .map(row => [
        row.fileId,
        row.ruleId,
        row.toolName,
        row.classification,
        row.blockedUsefulRepair ? 'yes' : 'no',
        `${row.rejectedScoreBefore ?? 'n/a'} -> ${row.rejectedScoreAfter ?? 'n/a'}`,
        String(row.strictFinalScore ?? 'n/a'),
        String(row.referenceFinalScore ?? 'n/a'),
        String(row.estimatedRecovery ?? 'n/a'),
      ]),
  ));
  lines.push('');
  return lines.join('\n');
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  let reference = DEFAULT_REFERENCE;
  let strict = DEFAULT_STRICT;
  let out = DEFAULT_OUT;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--reference') reference = args[++index] ?? '';
    else if (arg === '--strict') strict = args[++index] ?? '';
    else if (arg === '--out') out = args[++index] ?? '';
    else throw new Error(`Unknown argument: ${arg}\n${usage()}`);
  }
  if (!reference || !strict || !out) throw new Error(usage());

  const [referenceRows, strictRows] = await Promise.all([
    loadBenchmarkRowsFromRunDir(reference),
    loadBenchmarkRowsFromRunDir(strict),
  ]);
  const report = buildPacGateRecoveryDiagnostic({
    referenceRunDir: reference,
    strictRunDir: strict,
    referenceRows: referenceRows.remediateResults,
    strictRows: strictRows.remediateResults,
  });
  const outDir = resolve(out);
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, 'pac-gate-recovery-diagnostic.json'), JSON.stringify(report, null, 2), 'utf8');
  await writeFile(join(outDir, 'pac-gate-recovery-diagnostic.md'), renderPacGateRecoveryMarkdown(report), 'utf8');
  console.log(`Wrote PAC gate recovery diagnostic to ${outDir}`);
  console.log(`PAC gate rejections: ${report.summary.pacGateRejectionCount}`);
  console.log(`Newly evaluable debt: ${report.summary.newlyEvaluableDebtCount}`);
  console.log(`Blocked useful repairs: ${report.summary.blockedUsefulRepairCount}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
