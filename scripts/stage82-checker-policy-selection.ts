#!/usr/bin/env tsx
import 'dotenv/config';

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

type JsonRecord = Record<string, unknown>;

interface Stage82Report {
  generatedAt: string;
  inputs: Record<string, string>;
  legacy: {
    stage78HardFailures: string[];
    protectedRegressionRows: string[];
    stage81UnsafeRows: string[];
    intermittentTableRows: string[];
    stableControlRows: string[];
  };
  edgeMix: {
    currentAbCount: number | null;
    totalRows: number | null;
    targetAbCount: number | null;
    reachableWithoutParkedOrManualRows: boolean | null;
    parkedAnalyzerRows: string[];
    manualScannedRows: string[];
    stableCandidateRows: string[];
    rejectedStableCandidateRows: string[];
  };
  decision: {
    classification: 'diagnostic_only' | 'safe_to_implement';
    recommendedNextStage: string;
    reasons: string[];
  };
}

const DEFAULT_OUT = 'Output/experiment-corpus-baseline/stage82-checker-policy-selection-2026-04-26-r1';
const DEFAULT_STAGE78_GATE = 'Output/experiment-corpus-baseline/stage78-benchmark-gate-2026-04-25-r1/stage41-benchmark-gate.json';
const DEFAULT_STAGE81 = 'Output/experiment-corpus-baseline/stage81-evidence-diff-diagnostic-2026-04-26-r1/stage81-evidence-diff-diagnostic.json';
const DEFAULT_STAGE72 = 'Output/from_sibling_pdfaf_v1_edge_mix_2/stage72-edge-mix-ab-feasibility-2026-04-25-r1/stage72-edge-mix-ab-feasibility.json';
const DEFAULT_STAGE73 = 'Output/from_sibling_pdfaf_v1_edge_mix/stage73-figure-alt-cleanup-diagnostic-2026-04-25-r1/stage73-figure-alt-cleanup-diagnostic.json';
const DEFAULT_STAGE73_NOTE = 'Output/from_sibling_pdfaf_v1_edge_mix/stage73-figure-alt-cleanup-diagnostic-2026-04-25-r1/stage73-figure-alt-cleanup-diagnostic.md';
const DEFAULT_STAGE73_TARGET = 'Output/from_sibling_pdfaf_v1_edge_mix/run-stage73-target-figure-alt-2026-04-25-r2/remediate.results.json';

function usage(): string {
  return [
    'Usage: pnpm exec tsx scripts/stage82-checker-policy-selection.ts [options]',
    `  --out <dir>            Default: ${DEFAULT_OUT}`,
    `  --stage78-gate <path>  Default: ${DEFAULT_STAGE78_GATE}`,
    `  --stage81 <path>       Default: ${DEFAULT_STAGE81}`,
    `  --stage72 <path>       Default: ${DEFAULT_STAGE72}`,
    `  --stage73 <path>       Default: ${DEFAULT_STAGE73}`,
    `  --stage73-note <path>  Default: ${DEFAULT_STAGE73_NOTE}`,
    `  --stage73-target <path> Default: ${DEFAULT_STAGE73_TARGET}`,
  ].join('\n');
}

function parseArgs(argv: string[]): Record<string, string> {
  const args = {
    out: DEFAULT_OUT,
    stage78Gate: DEFAULT_STAGE78_GATE,
    stage81: DEFAULT_STAGE81,
    stage72: DEFAULT_STAGE72,
    stage73: DEFAULT_STAGE73,
    stage73Note: DEFAULT_STAGE73_NOTE,
    stage73Target: DEFAULT_STAGE73_TARGET,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    if (arg === '--help' || arg === '-h') {
      console.log(usage());
      process.exit(0);
    }
    const next = argv[i + 1];
    if (!next) throw new Error(`Missing value for ${arg}`);
    if (arg === '--out') args.out = next;
    else if (arg === '--stage78-gate') args.stage78Gate = next;
    else if (arg === '--stage81') args.stage81 = next;
    else if (arg === '--stage72') args.stage72 = next;
    else if (arg === '--stage73') args.stage73 = next;
    else if (arg === '--stage73-note') args.stage73Note = next;
    else if (arg === '--stage73-target') args.stage73Target = next;
    else throw new Error(`Unknown argument: ${arg}`);
    i += 1;
  }
  return args;
}

async function readJson(path: string): Promise<JsonRecord> {
  return JSON.parse(await readFile(resolve(path), 'utf8')) as JsonRecord;
}

async function readOptionalText(path: string): Promise<string> {
  try {
    return await readFile(resolve(path), 'utf8');
  } catch {
    return '';
  }
}

function array(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.filter(item => item && typeof item === 'object') as JsonRecord[] : [];
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function bool(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function rowId(row: JsonRecord): string {
  return str(row['id']) || str(row['publicationId']) || str(row['file']);
}

function renderMarkdown(report: Stage82Report): string {
  return `${[
    '# Stage 82 Checker-Policy Selection',
    '',
    `Generated: \`${report.generatedAt}\``,
    `Decision: \`${report.decision.classification}\``,
    `Recommended next stage: \`${report.decision.recommendedNextStage}\``,
    '',
    '## Decision Reasons',
    '',
    ...report.decision.reasons.map(reason => `- ${reason}`),
    '',
    '## Legacy Evidence',
    '',
    `- Stage 78 hard failures: ${report.legacy.stage78HardFailures.length ? report.legacy.stage78HardFailures.map(item => `\`${item}\``).join(', ') : 'none'}`,
    `- Protected regression rows: ${report.legacy.protectedRegressionRows.length ? report.legacy.protectedRegressionRows.map(item => `\`${item}\``).join(', ') : 'none'}`,
    `- Stage 81 unsafe rows: ${report.legacy.stage81UnsafeRows.length ? report.legacy.stage81UnsafeRows.map(item => `\`${item}\``).join(', ') : 'none'}`,
    `- Intermittent-table rows: ${report.legacy.intermittentTableRows.length ? report.legacy.intermittentTableRows.map(item => `\`${item}\``).join(', ') : 'none'}`,
    `- Stable controls: ${report.legacy.stableControlRows.length ? report.legacy.stableControlRows.map(item => `\`${item}\``).join(', ') : 'none'}`,
    '',
    '## V1 Edge Evidence',
    '',
    `- A/B math: ${report.edgeMix.currentAbCount ?? 'n/a'}/${report.edgeMix.totalRows ?? 'n/a'} current, target ${report.edgeMix.targetAbCount ?? 'n/a'}`,
    `- Reachable without parked/manual rows: ${report.edgeMix.reachableWithoutParkedOrManualRows === null ? 'n/a' : report.edgeMix.reachableWithoutParkedOrManualRows ? 'yes' : 'no'}`,
    `- Parked analyzer rows: ${report.edgeMix.parkedAnalyzerRows.length ? report.edgeMix.parkedAnalyzerRows.map(item => `\`${item}\``).join(', ') : 'none'}`,
    `- Manual/scanned rows: ${report.edgeMix.manualScannedRows.length ? report.edgeMix.manualScannedRows.map(item => `\`${item}\``).join(', ') : 'none'}`,
    `- Stable candidate rows: ${report.edgeMix.stableCandidateRows.length ? report.edgeMix.stableCandidateRows.map(item => `\`${item}\``).join(', ') : 'none'}`,
    `- Rejected stable candidates: ${report.edgeMix.rejectedStableCandidateRows.length ? report.edgeMix.rejectedStableCandidateRows.map(item => `\`${item}\``).join(', ') : 'none'}`,
    '',
  ].join('\n')}\n`;
}

async function buildReport(args: Record<string, string>): Promise<Stage82Report> {
  const [stage78Gate, stage81, stage72, stage73, stage73Note] = await Promise.all([
    readJson(args.stage78Gate!),
    readJson(args.stage81!),
    readJson(args.stage72!),
    readJson(args.stage73!),
    readOptionalText(args.stage73Note!),
  ]);
  const stage73TargetRows = array(await readJson(args.stage73Target!).catch(() => ({ rows: [] })));

  const stage78HardFailures = array(stage78Gate['gates'])
    .filter(gate => gate['severity'] === 'hard' && gate['passed'] === false)
    .map(gate => str(gate['key']))
    .filter(Boolean);
  const protectedRegressionRows = array(stage78Gate['topScoreRegressions'])
    .filter(row => num(row['delta']) != null && (num(row['delta']) ?? 0) < -2)
    .map(row => str(row['file']))
    .filter(Boolean);

  const stage81Rows = array(stage81['rows']);
  const stage81UnsafeRows = stage81Rows.filter(row => row['safeToImplement'] !== true).map(rowId).filter(Boolean);
  const intermittentTableRows = stage81Rows
    .filter(row => str(row['decisionReason']).includes('intermittent_table'))
    .map(rowId)
    .filter(Boolean);
  const stableControlRows = stage81Rows
    .filter(row => num(row['unstableGroupCount']) === 0)
    .map(rowId)
    .filter(Boolean);

  const abMath = stage72['abMath'] && typeof stage72['abMath'] === 'object' ? stage72['abMath'] as JsonRecord : {};
  const stage72Rows = array(stage72['rows']);
  const parkedAnalyzerRows = stage72Rows.filter(row => str(row['debtBucket']) === 'parked_analyzer_volatility').map(rowId).filter(Boolean);
  const manualScannedRows = stage72Rows.filter(row => str(row['debtBucket']) === 'manual_scanned_policy_debt').map(rowId).filter(Boolean);
  const stableCandidateRows = stage72Rows.filter(row => row['repeatStable'] === true && (row['fixerPathExists'] === true || row['fixerPath'] === true)).map(rowId).filter(Boolean);

  const stage73Selected = stage73['decision'] && typeof stage73['decision'] === 'object'
    ? Array.isArray((stage73['decision'] as JsonRecord)['selectedRows'])
      ? (stage73['decision'] as JsonRecord)['selectedRows'] as unknown[]
      : []
    : [];
  const stage73TargetScores = new Map(stage73TargetRows.map(row => [rowId(row), num(row['reanalyzedScore']) ?? num(row['afterScore'])]));
  const stage73Rejected = /rejected|does not satisfy material-improvement acceptance|left `v1-4145` at `78\/C`/i.test(stage73Note)
    ? stage73Selected.map(value => str(value)).filter(Boolean)
    : stage73Selected
        .map(value => str(value))
        .filter(id => id && (stage73TargetScores.get(id) ?? 0) < 80);

  const reasons: string[] = [];
  if (stage78HardFailures.includes('protected_file_regressions')) {
    reasons.push('Stage 78 still fails only protected-file regressions while preserving p95 and false-positive applied 0.');
  }
  if (intermittentTableRows.length) {
    reasons.push(`Stage 81 found intermittent table evidence on ${intermittentTableRows.join(', ')}, so deterministic evidence aggregation lacks a checker-aligned safe policy.`);
  }
  if (stableControlRows.length) {
    reasons.push(`Stage 81 controls without unstable evidence (${stableControlRows.join(', ')}) should remain unchanged by any analyzer policy.`);
  }
  if (bool(abMath['reachableWithoutParkedOrManualRows']) === false) {
    reasons.push('V1 edge A/B target is not reachable using only stable non-parked rows.');
  }
  if (stage73Rejected.length) {
    reasons.push(`The last stable v1-edge candidate (${stage73Rejected.join(', ')}) was already tested and rejected for insufficient material improvement.`);
  }

  const safeToImplement = false;
  reasons.push('No Stage 82 source behavior change is justified without a table/paragraph evidence policy that distinguishes real checker-visible structure from wrapper/path artifacts.');

  return {
    generatedAt: new Date().toISOString(),
    inputs: {
      stage78Gate: args.stage78Gate!,
      stage81: args.stage81!,
      stage72: args.stage72!,
      stage73: args.stage73!,
      stage73Note: args.stage73Note!,
      stage73Target: args.stage73Target!,
    },
    legacy: {
      stage78HardFailures,
      protectedRegressionRows,
      stage81UnsafeRows,
      intermittentTableRows,
      stableControlRows,
    },
    edgeMix: {
      currentAbCount: num(abMath['currentAbCount']),
      totalRows: num(abMath['totalRows']),
      targetAbCount: num(abMath['targetAbCount']),
      reachableWithoutParkedOrManualRows: bool(abMath['reachableWithoutParkedOrManualRows']),
      parkedAnalyzerRows,
      manualScannedRows,
      stableCandidateRows,
      rejectedStableCandidateRows: stage73Rejected,
    },
    decision: {
      classification: safeToImplement ? 'safe_to_implement' : 'diagnostic_only',
      recommendedNextStage: 'Stage 83 checker-aligned table/paragraph evidence policy design',
      reasons,
    },
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const report = await buildReport(args);
  const out = resolve(args.out!);
  await mkdir(out, { recursive: true });
  await writeFile(join(out, 'stage82-checker-policy-selection.json'), JSON.stringify(report, null, 2), 'utf8');
  await writeFile(join(out, 'stage82-checker-policy-selection.md'), renderMarkdown(report), 'utf8');
  console.log(`Wrote ${out}`);
  console.log(`Decision: ${report.decision.classification}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
