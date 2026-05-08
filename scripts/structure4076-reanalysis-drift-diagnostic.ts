#!/usr/bin/env tsx
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { loadBenchmarkRowsFromRunDir } from '../src/services/benchmark/stage1Acceptance.js';
import type { CategoryKey } from '../src/types.js';
import type { RemediateBenchmarkRow } from '../src/services/benchmark/experimentCorpus.js';

const DEFAULT_RUN = 'Output/experiment-corpus-baseline/run-orphan-mcid-recovery-target-2026-05-07-r1';
const DEFAULT_OUT = 'Output/experiment-corpus-baseline/structure4076-reanalysis-drift-diagnostic';
const DEFAULT_ROW_ID = 'structure-4076';
const STRUCTURE_4076_FLOOR = 70;

export type Structure4076DriftClassification =
  | 'analyzer_reanalysis_drift'
  | 'real_pdf_regression'
  | 'checkpoint_restore_candidate'
  | 'no_safe_checkpoint';

export interface CategoryDelta {
  key: string;
  afterScore: number | null;
  reanalyzedScore: number | null;
  delta: number | null;
  afterApplicable: boolean | null;
  reanalyzedApplicable: boolean | null;
}

export interface Structure4076EvidenceComparison {
  pageEvidencePreserved: boolean | null;
  textEvidencePreserved: boolean | null;
  tagEvidencePreserved: boolean | null;
  tableApplicabilityChanged: boolean;
  tableSignalIncreased: boolean;
  categoryDeltas: CategoryDelta[];
}

export interface Structure4076DriftReport {
  generatedAt: string;
  runDir: string;
  rowId: string;
  classification: Structure4076DriftClassification;
  scoreFloor: number;
  afterScore: number | null;
  afterGrade: string | null;
  reanalyzedScore: number | null;
  reanalyzedGrade: string | null;
  checkpointEligible: boolean;
  reason: string;
  evidence: Structure4076EvidenceComparison;
  acceptedTimeline: Array<{
    toolName: string;
    outcome: string;
    scoreBefore: number | null;
    scoreAfter: number | null;
    replayStateBefore: string | null;
    replayStateAfter: string | null;
  }>;
}

function usage(): string {
  return [
    'Usage: pnpm exec tsx scripts/structure4076-reanalysis-drift-diagnostic.ts [--run <run-dir>] [--row <row-id>] [--out <dir>]',
  ].join('\n');
}

function categoryMap(categories: RemediateBenchmarkRow['afterCategories']): Map<string, NonNullable<RemediateBenchmarkRow['afterCategories']>[number]> {
  return new Map((categories ?? []).map(category => [category.key, category]));
}

function categoryScore(categories: RemediateBenchmarkRow['afterCategories'], key: CategoryKey): number | null {
  return categories?.find(category => category.key === key)?.score ?? null;
}

function categoryApplicable(categories: RemediateBenchmarkRow['afterCategories'], key: CategoryKey): boolean | null {
  return categories?.find(category => category.key === key)?.applicable ?? null;
}

function parityTextLength(row: RemediateBenchmarkRow, phase: 'after' | 'reanalyzed'): number | null {
  const parity = phase === 'after' ? row.afterIcjiaParity : row.reanalyzedIcjiaParity;
  return typeof parity?.signals?.textLength === 'number' ? parity.signals.textLength : null;
}

function parityHasStructTree(row: RemediateBenchmarkRow, phase: 'after' | 'reanalyzed'): boolean | null {
  const parity = phase === 'after' ? row.afterIcjiaParity : row.reanalyzedIcjiaParity;
  return typeof parity?.signals?.hasStructTree === 'boolean' ? parity.signals.hasStructTree : null;
}

function tableSignals(row: RemediateBenchmarkRow, phase: 'after' | 'reanalyzed'): {
  irregular: number;
  stronglyIrregular: number;
  missing: boolean;
} {
  const profile = phase === 'after' ? row.afterDetectionProfile : row.reanalyzedDetectionProfile;
  const signals = profile?.tableSignals;
  if (!signals) return { irregular: 0, stronglyIrregular: 0, missing: true };
  return {
    irregular: signals.irregularTableCount ?? 0,
    stronglyIrregular: signals.stronglyIrregularTableCount ?? 0,
    missing: false,
  };
}

function parseDetails(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'string') return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function replayState(value: unknown): Record<string, unknown> | null {
  const details = parseDetails(value);
  const debug = details?.['debug'];
  if (!debug || typeof debug !== 'object' || Array.isArray(debug)) return null;
  const replay = (debug as Record<string, unknown>)['replayState'];
  return replay && typeof replay === 'object' && !Array.isArray(replay)
    ? replay as Record<string, unknown>
    : null;
}

export function compareStructure4076Evidence(row: RemediateBenchmarkRow): Structure4076EvidenceComparison {
  const afterCategories = categoryMap(row.afterCategories);
  const reanalyzedCategories = categoryMap(row.reanalyzedCategories);
  const keys = [...new Set([...afterCategories.keys(), ...reanalyzedCategories.keys()])].sort((a, b) => a.localeCompare(b));
  const categoryDeltas = keys.map(key => {
    const after = afterCategories.get(key);
    const reanalyzed = reanalyzedCategories.get(key);
    const afterScore = after?.score ?? null;
    const reanalyzedScore = reanalyzed?.score ?? null;
    return {
      key,
      afterScore,
      reanalyzedScore,
      delta: afterScore != null && reanalyzedScore != null ? reanalyzedScore - afterScore : null,
      afterApplicable: after?.applicable ?? null,
      reanalyzedApplicable: reanalyzed?.applicable ?? null,
    };
  });

  const afterTextLength = parityTextLength(row, 'after');
  const reanalyzedTextLength = parityTextLength(row, 'reanalyzed');
  const afterTagged = parityHasStructTree(row, 'after');
  const reanalyzedTagged = parityHasStructTree(row, 'reanalyzed');
  const afterTable = tableSignals(row, 'after');
  const reanalyzedTable = tableSignals(row, 'reanalyzed');
  const afterTableApplicable = categoryApplicable(row.afterCategories, 'table_markup');
  const reanalyzedTableApplicable = categoryApplicable(row.reanalyzedCategories, 'table_markup');
  const afterTableScore = categoryScore(row.afterCategories, 'table_markup');
  const reanalyzedTableScore = categoryScore(row.reanalyzedCategories, 'table_markup');

  return {
    pageEvidencePreserved: null,
    textEvidencePreserved: afterTextLength == null || reanalyzedTextLength == null
      ? null
      : reanalyzedTextLength >= afterTextLength,
    tagEvidencePreserved: afterTagged == null || reanalyzedTagged == null
      ? null
      : !afterTagged || reanalyzedTagged,
    tableApplicabilityChanged: (
      afterTableApplicable === false &&
      reanalyzedTableApplicable === true &&
      (reanalyzedTableScore ?? 100) < (afterTableScore ?? 100)
    ),
    tableSignalIncreased: (
      reanalyzedTable.irregular > afterTable.irregular ||
      reanalyzedTable.stronglyIrregular > afterTable.stronglyIrregular
    ),
    categoryDeltas,
  };
}

export function classifyStructure4076ReanalysisDrift(
  row: RemediateBenchmarkRow | undefined,
  floor = STRUCTURE_4076_FLOOR,
): Structure4076DriftReport {
  if (!row) {
    return emptyReport('missing-row', floor, 'no_safe_checkpoint', 'Benchmark row was not found.');
  }
  const evidence = compareStructure4076Evidence(row);
  const afterScore = row.afterScore;
  const reanalyzedScore = row.reanalyzedScore;
  const afterMeetsFloor = afterScore != null && afterScore >= floor;
  const reanalysisBelowFloor = reanalyzedScore == null || reanalyzedScore < floor;
  const coreEvidencePreserved = (
    evidence.textEvidencePreserved !== false &&
    evidence.tagEvidencePreserved !== false
  );
  const checkpointEligible = Boolean(afterMeetsFloor && reanalysisBelowFloor && coreEvidencePreserved);

  let classification: Structure4076DriftClassification = 'no_safe_checkpoint';
  let reason = 'No eligible in-run checkpoint was available.';
  if (!afterMeetsFloor) {
    classification = 'no_safe_checkpoint';
    reason = `In-run score is below floor (${afterScore ?? 'n/a'}<${floor}).`;
  } else if (!reanalysisBelowFloor) {
    classification = 'analyzer_reanalysis_drift';
    reason = 'Protected reanalysis remained at or above the row floor.';
  } else if (!coreEvidencePreserved) {
    classification = 'real_pdf_regression';
    reason = 'Protected reanalysis shows page/text/tag evidence regression.';
  } else if (evidence.tableApplicabilityChanged || evidence.tableSignalIncreased) {
    classification = 'real_pdf_regression';
    reason = 'Protected reanalysis introduces checker-facing table evidence that lowers the score.';
  } else {
    classification = 'analyzer_reanalysis_drift';
    reason = 'Protected reanalysis drops below the floor while core page/text/tag evidence is preserved.';
  }

  return {
    generatedAt: new Date(0).toISOString(),
    runDir: '',
    rowId: row.id,
    classification,
    scoreFloor: floor,
    afterScore,
    afterGrade: row.afterGrade,
    reanalyzedScore,
    reanalyzedGrade: row.reanalyzedGrade,
    checkpointEligible,
    reason,
    evidence,
    acceptedTimeline: (row.appliedTools ?? [])
      .filter(tool => tool.outcome === 'applied' || tool.outcome === 'no_effect')
      .map(tool => {
        const replay = replayState(tool.details);
        return {
          toolName: tool.toolName,
          outcome: tool.outcome,
          scoreBefore: tool.scoreBefore ?? null,
          scoreAfter: tool.scoreAfter ?? null,
          replayStateBefore: typeof replay?.['stateSignatureBefore'] === 'string' ? replay['stateSignatureBefore'] : null,
          replayStateAfter: typeof replay?.['stateSignatureAfter'] === 'string' ? replay['stateSignatureAfter'] : null,
        };
      }),
  };
}

function emptyReport(
  rowId: string,
  floor: number,
  classification: Structure4076DriftClassification,
  reason: string,
): Structure4076DriftReport {
  return {
    generatedAt: new Date(0).toISOString(),
    runDir: '',
    rowId,
    classification,
    scoreFloor: floor,
    afterScore: null,
    afterGrade: null,
    reanalyzedScore: null,
    reanalyzedGrade: null,
    checkpointEligible: false,
    reason,
    evidence: {
      pageEvidencePreserved: null,
      textEvidencePreserved: null,
      tagEvidencePreserved: null,
      tableApplicabilityChanged: false,
      tableSignalIncreased: false,
      categoryDeltas: [],
    },
    acceptedTimeline: [],
  };
}

function renderMarkdown(report: Structure4076DriftReport): string {
  const lines: string[] = [];
  lines.push('# Structure 4076 Reanalysis Drift Diagnostic');
  lines.push('');
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push(`Run: \`${report.runDir}\``);
  lines.push(`Row: \`${report.rowId}\``);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(`- Classification: \`${report.classification}\``);
  lines.push(`- Reason: ${report.reason}`);
  lines.push(`- Scores: in-run \`${report.afterScore ?? 'n/a'}/${report.afterGrade ?? 'n/a'}\`, reanalyzed \`${report.reanalyzedScore ?? 'n/a'}/${report.reanalyzedGrade ?? 'n/a'}\``);
  lines.push(`- Floor: \`${report.scoreFloor}\``);
  lines.push(`- Checkpoint eligible: \`${report.checkpointEligible ? 'yes' : 'no'}\``);
  lines.push(`- Text evidence preserved: \`${String(report.evidence.textEvidencePreserved)}\``);
  lines.push(`- Tag evidence preserved: \`${String(report.evidence.tagEvidencePreserved)}\``);
  lines.push(`- Table applicability changed: \`${String(report.evidence.tableApplicabilityChanged)}\``);
  lines.push(`- Table signal increased: \`${String(report.evidence.tableSignalIncreased)}\``);
  lines.push('');
  lines.push('## Category Deltas');
  lines.push('');
  lines.push('| Category | In-run | Reanalyzed | Delta | Applicability |');
  lines.push('| --- | ---: | ---: | ---: | --- |');
  for (const row of report.evidence.categoryDeltas) {
    if (row.delta === 0 && row.afterApplicable === row.reanalyzedApplicable) continue;
    lines.push(`| ${row.key} | ${row.afterScore ?? 'n/a'} | ${row.reanalyzedScore ?? 'n/a'} | ${row.delta ?? 'n/a'} | ${String(row.afterApplicable)} -> ${String(row.reanalyzedApplicable)} |`);
  }
  lines.push('');
  lines.push('## Accepted Timeline');
  lines.push('');
  lines.push('| Tool | Outcome | Before | After | Replay state |');
  lines.push('| --- | --- | ---: | ---: | --- |');
  for (const event of report.acceptedTimeline) {
    lines.push(`| ${event.toolName} | ${event.outcome} | ${event.scoreBefore ?? 'n/a'} | ${event.scoreAfter ?? 'n/a'} | ${event.replayStateBefore ?? 'n/a'} -> ${event.replayStateAfter ?? 'n/a'} |`);
  }
  lines.push('');
  return lines.join('\n');
}

async function main(): Promise<void> {
  let runDir = DEFAULT_RUN;
  let outDir = DEFAULT_OUT;
  let rowId = DEFAULT_ROW_ID;
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
    throw new Error(`Unknown or incomplete argument: ${arg ?? ''}\n${usage()}`);
  }

  const resolvedRun = resolve(runDir);
  const rows = await loadBenchmarkRowsFromRunDir(resolvedRun);
  const report = classifyStructure4076ReanalysisDrift(rows.remediateResults.find(row => row.id === rowId));
  report.generatedAt = new Date().toISOString();
  report.runDir = runDir;
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, 'structure4076-reanalysis-drift.json'), `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(join(outDir, 'structure4076-reanalysis-drift.md'), renderMarkdown(report));
  console.log(`Wrote structure-4076 reanalysis drift diagnostic to ${resolve(outDir)}`);
  console.log(`Classification: ${report.classification}; reason: ${report.reason}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
