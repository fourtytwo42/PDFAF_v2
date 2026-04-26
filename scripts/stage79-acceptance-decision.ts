#!/usr/bin/env tsx
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

type JsonRecord = Record<string, unknown>;

interface GateRow {
  key: string;
  passed: boolean;
  severity: 'hard' | 'advisory';
  baselineValue?: unknown;
  candidateValue?: unknown;
}

interface DiagnosticReport {
  rows?: Array<{
    id: string;
    classification: string;
    reason: string;
    scoreRange?: { min: number | null; max: number | null; delta: number | null };
    changedFields?: string[];
  }>;
}

const DEFAULT_STAGE78_GATE = 'Output/experiment-corpus-baseline/stage78-benchmark-gate-2026-04-25-r1';
const DEFAULT_STAGE78B_GATE = 'Output/experiment-corpus-baseline/stage78b-benchmark-gate-2026-04-25-r1';
const DEFAULT_OUT = 'Output/experiment-corpus-baseline/stage79-acceptance-decision-2026-04-26-r1';

async function readJson(path: string): Promise<JsonRecord> {
  return JSON.parse(await readFile(path, 'utf8')) as JsonRecord;
}

function asGateRows(value: JsonRecord): GateRow[] {
  const rows = value['gates'];
  return Array.isArray(rows) ? rows as GateRow[] : [];
}

function failedHardGates(gate: JsonRecord): string[] {
  return asGateRows(gate)
    .filter(row => row.severity === 'hard' && !row.passed)
    .map(row => row.key);
}

function gateValue(gate: JsonRecord, key: string): unknown {
  return asGateRows(gate).find(row => row.key === key)?.candidateValue ?? null;
}

export function buildStage79AcceptanceDecision(input: { stage78Gate: JsonRecord; stage78bGate: JsonRecord; diagnostic?: DiagnosticReport }): {
  status: 'recommend_stage78_checkpoint' | 'continue_analyzer_determinism';
  reasons: string[];
} {
  const stage78Failed = failedHardGates(input.stage78Gate);
  const stage78bFailed = failedHardGates(input.stage78bGate);
  const diagnosticRows = input.diagnostic?.rows ?? [];
  const hasAnalyzerDebt = diagnosticRows.some(row =>
    row.classification === 'same_buffer_python_structural_variance' ||
    row.classification === 'same_buffer_scoring_variance' ||
    row.classification === 'stable_below_floor' ||
    row.classification === 'route_debt_no_safe_buffer'
  );
  if (
    stage78Failed.length === 1 &&
    stage78Failed[0] === 'protected_file_regressions' &&
    (stage78bFailed.length > stage78Failed.length || stage78bFailed.includes('runtime_p95_wall'))
  ) {
    return {
      status: 'recommend_stage78_checkpoint',
      reasons: [
        `Stage78 failed hard gates: ${stage78Failed.join(', ')}`,
        `Stage78B failed hard gates: ${stage78bFailed.join(', ')}`,
        'Stage78B guard work worsened protected/runtime gates and should not be kept.',
        hasAnalyzerDebt
          ? 'Stage79 diagnostic classifies residual rows as analyzer/path debt rather than safe mutator guard work.'
          : 'No diagnostic evidence supports a safe behavior change.',
      ],
    };
  }
  return {
    status: 'continue_analyzer_determinism',
    reasons: [
      `Stage78 failed hard gates: ${stage78Failed.join(', ') || 'none'}`,
      `Stage78B failed hard gates: ${stage78bFailed.join(', ') || 'none'}`,
      'Acceptance is not decision-clean from available gate evidence.',
    ],
  };
}

function renderMarkdown(report: JsonRecord): string {
  const lines = [
    '# Stage 79 Acceptance Decision',
    '',
    `Decision: **${(report.decision as JsonRecord).status}**`,
    '',
    '## Reasons',
    '',
    ...((report.decision as JsonRecord).reasons as string[]).map(reason => `- ${reason}`),
    '',
    '## Gate Comparison',
    '',
    `- Stage78 failed hard gates: ${((report.stage78 as JsonRecord).failedHardGates as string[]).join(', ') || 'none'}`,
    `- Stage78B failed hard gates: ${((report.stage78b as JsonRecord).failedHardGates as string[]).join(', ') || 'none'}`,
    `- Stage78 protected regressions: ${(report.stage78 as JsonRecord).protectedFileRegressions}`,
    `- Stage78B protected regressions: ${(report.stage78b as JsonRecord).protectedFileRegressions}`,
    `- Stage78 p95 wall: ${(report.stage78 as JsonRecord).runtimeP95Wall}`,
    `- Stage78B p95 wall: ${(report.stage78b as JsonRecord).runtimeP95Wall}`,
  ];
  const diagnosticRows = (report.diagnosticRows as JsonRecord[] | undefined) ?? [];
  if (diagnosticRows.length > 0) {
    lines.push('', '## Diagnostic Rows', '', '| Row | Classification | Score range | Changed fields |', '| --- | --- | --- | --- |');
    for (const row of diagnosticRows) {
      const range = row.scoreRange as JsonRecord | undefined;
      lines.push(`| ${row.id} | ${row.classification} | ${range?.min ?? 'n/a'}-${range?.max ?? 'n/a'} (${range?.delta ?? 'n/a'}) | ${(row.changedFields as string[] | undefined)?.join(', ') || 'none'} |`);
    }
  }
  return `${lines.join('\n')}\n`;
}

function parseArgs(argv: string[]): {
  stage78Gate: string;
  stage78bGate: string;
  diagnostic?: string;
  outDir: string;
} {
  let stage78Gate = DEFAULT_STAGE78_GATE;
  let stage78bGate = DEFAULT_STAGE78B_GATE;
  let diagnostic: string | undefined;
  let outDir = DEFAULT_OUT;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    if (arg === '--help' || arg === '-h') {
      console.log([
        'Usage: pnpm exec tsx scripts/stage79-acceptance-decision.ts [options]',
        `  --stage78-gate <dir>   Default: ${DEFAULT_STAGE78_GATE}`,
        `  --stage78b-gate <dir>  Default: ${DEFAULT_STAGE78B_GATE}`,
        '  --diagnostic <dir>     Optional Stage79 diagnostic dir',
        `  --out <dir>            Default: ${DEFAULT_OUT}`,
      ].join('\n'));
      process.exit(0);
    }
    const next = argv[i + 1];
    if (!next) throw new Error(`Missing value for ${arg}`);
    if (arg === '--stage78-gate') stage78Gate = next;
    else if (arg === '--stage78b-gate') stage78bGate = next;
    else if (arg === '--diagnostic') diagnostic = next;
    else if (arg === '--out') outDir = next;
    else throw new Error(`Unknown argument: ${arg}`);
    i += 1;
  }
  return { stage78Gate, stage78bGate, diagnostic, outDir };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const [stage78Gate, stage78bGate, diagnostic] = await Promise.all([
    readJson(join(resolve(args.stage78Gate), 'stage41-benchmark-gate.json')),
    readJson(join(resolve(args.stage78bGate), 'stage41-benchmark-gate.json')),
    args.diagnostic
      ? readJson(join(resolve(args.diagnostic), 'stage79-protected-analyzer-diagnostic.json')) as Promise<DiagnosticReport>
      : Promise.resolve(undefined),
  ]);
  const report = {
    generatedAt: new Date().toISOString(),
    stage78: {
      gateDir: args.stage78Gate,
      failedHardGates: failedHardGates(stage78Gate),
      protectedFileRegressions: gateValue(stage78Gate, 'protected_file_regressions'),
      runtimeP95Wall: gateValue(stage78Gate, 'runtime_p95_wall'),
      falsePositiveApplied: gateValue(stage78Gate, 'false_positive_applied'),
    },
    stage78b: {
      gateDir: args.stage78bGate,
      failedHardGates: failedHardGates(stage78bGate),
      protectedFileRegressions: gateValue(stage78bGate, 'protected_file_regressions'),
      runtimeP95Wall: gateValue(stage78bGate, 'runtime_p95_wall'),
      falsePositiveApplied: gateValue(stage78bGate, 'false_positive_applied'),
    },
    diagnosticRows: diagnostic?.rows ?? [],
    decision: buildStage79AcceptanceDecision({ stage78Gate, stage78bGate, diagnostic }),
  };
  const out = resolve(args.outDir);
  await mkdir(out, { recursive: true });
  await writeFile(join(out, 'stage79-acceptance-decision.json'), JSON.stringify(report, null, 2), 'utf8');
  await writeFile(join(out, 'stage79-acceptance-decision.md'), renderMarkdown(report), 'utf8');
  console.log(`Wrote ${out}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
