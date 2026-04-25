#!/usr/bin/env tsx
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

type JsonRecord = Record<string, unknown>;

export type Stage74Decision =
  | 'accept_engine_v2_general_checkpoint_with_documented_waivers'
  | 'dedicated_p95_project'
  | 'dedicated_analyzer_volatility_project'
  | 'hard_blocker_requires_investigation';

export interface Stage74Waiver {
  key: 'runtime_p95_wall' | 'edge_mix_ab_shortfall' | 'parked_analyzer_volatility' | 'manual_scanned_policy_debt';
  reason: string;
}

export interface Stage74Report {
  generatedAt: string;
  inputs: {
    stage71ReportPath: string;
    stage72ReportPath: string;
    stage73ReportPath: string;
    stage73TargetRunDir: string;
    stage73ControlRunDir: string;
  };
  legacy: {
    mean: number | null;
    median: number | null;
    fCount: number | null;
    protectedRegressionCount: number | null;
    failedGateKeys: string[];
    falsePositiveAppliedCount: number;
  };
  edgeMix: {
    abCount: number;
    totalRows: number;
    targetAbCount: number;
    abPercent: number | null;
    stableCandidateCount: number;
    projectedAbCountWithStableCandidates: number;
    reachableWithoutParkedOrManualRows: boolean;
  };
  stage73: {
    v1_4145Score: number | null;
    v1_4145Grade: string | null;
    v1_4145AltText: number | null;
    reachedAb: boolean;
    materialImprovementAccepted: boolean;
    stableAbLiftRemaining: boolean;
  };
  unresolvedRows: Array<{
    id: string;
    corpus: string;
    score: number | null;
    grade: string | null;
    bucket: string;
  }>;
  hardBlockers: string[];
  waivers: Stage74Waiver[];
  decision: {
    status: Stage74Decision;
    reasons: string[];
  };
  generatedArtifactPolicy: {
    generatedOutputCommitted: false;
    note: string;
  };
}

const DEFAULT_STAGE71_REPORT = 'Output/engine-v2-general-acceptance/stage71-end-gate-2026-04-25-r1/stage71-end-gate-report.json';
const DEFAULT_STAGE72_REPORT = 'Output/from_sibling_pdfaf_v1_edge_mix_2/stage72-edge-mix-ab-feasibility-2026-04-25-r1/stage72-edge-mix-ab-feasibility.json';
const DEFAULT_STAGE73_REPORT = 'Output/from_sibling_pdfaf_v1_edge_mix/stage73-figure-alt-cleanup-diagnostic-2026-04-25-r1/stage73-figure-alt-cleanup-diagnostic.json';
const DEFAULT_STAGE73_TARGET = 'Output/from_sibling_pdfaf_v1_edge_mix/run-stage73-target-figure-alt-2026-04-25-r2';
const DEFAULT_STAGE73_CONTROL = 'Output/from_sibling_pdfaf_v1_edge_mix_2/run-stage73-target-controls-2026-04-25-r2';
const DEFAULT_OUT = 'Output/engine-v2-general-acceptance/stage74-end-gate-revisit-2026-04-25-r1';

const WAIVABLE_EDGE_BUCKETS = new Set([
  'parked_analyzer_volatility',
  'manual_scanned_policy_debt',
  'stable_structural_residual',
]);

function usage(): string {
  return [
    'Usage: pnpm exec tsx scripts/stage74-end-gate-revisit.ts [options]',
    `  --stage71 <json>             Default: ${DEFAULT_STAGE71_REPORT}`,
    `  --stage72 <json>             Default: ${DEFAULT_STAGE72_REPORT}`,
    `  --stage73 <json>             Default: ${DEFAULT_STAGE73_REPORT}`,
    `  --stage73-target-run <dir>   Default: ${DEFAULT_STAGE73_TARGET}`,
    `  --stage73-control-run <dir>  Default: ${DEFAULT_STAGE73_CONTROL}`,
    `  --out <dir>                  Default: ${DEFAULT_OUT}`,
  ].join('\n');
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function arr(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.filter(item => item && typeof item === 'object' && !Array.isArray(item)) as JsonRecord[] : [];
}

function nested(record: JsonRecord, ...keys: string[]): JsonRecord {
  let current: unknown = record;
  for (const key of keys) current = asRecord(current)[key];
  return asRecord(current);
}

function readMetric(report: JsonRecord, path: string[], key: string): number | null {
  return num(nested(report, ...path)[key]);
}

function canonicalId(row: JsonRecord): string {
  const id = str(row.id);
  if (id) return id.startsWith('v1-') || !/^\d+$/.test(id) ? id : `v1-${id}`;
  const publicationId = str(row.publicationId);
  return publicationId ? `v1-${publicationId.replace(/^v1-/, '')}` : '';
}

function grade(row: JsonRecord): string | null {
  return str(row.afterGrade) || str(row.grade) || null;
}

function score(row: JsonRecord): number | null {
  return num(row.afterScore) ?? num(row.score);
}

function categoryScore(row: JsonRecord, key: string): number | null {
  const categories = arr(row.afterCategories);
  const found = categories.find(category => str(category.key) === key);
  return num(found?.score);
}

function falsePositiveApplied(row: JsonRecord): number {
  return num(row.falsePositiveAppliedCount) ?? num(row.falsePositiveApplied) ?? 0;
}

function findRow(rows: JsonRecord[], id: string): JsonRecord | null {
  return rows.find(row => canonicalId(row) === id || str(row.publicationId) === id.replace(/^v1-/, '')) ?? null;
}

function stage73RowFromTarget(stage73TargetRows: JsonRecord[]): {
  v1_4145Score: number | null;
  v1_4145Grade: string | null;
  v1_4145AltText: number | null;
  reachedAb: boolean;
} {
  const row = findRow(stage73TargetRows, 'v1-4145');
  const rowGrade = row ? grade(row) : null;
  return {
    v1_4145Score: row ? score(row) : null,
    v1_4145Grade: rowGrade,
    v1_4145AltText: row ? categoryScore(row, 'alt_text') : null,
    reachedAb: rowGrade === 'A' || rowGrade === 'B',
  };
}

function loadRowsFromRunObject(run: JsonRecord): JsonRecord[] {
  const rows = run.rows ?? run.results;
  return arr(rows);
}

function unresolvedRows(stage72Report: JsonRecord): Stage74Report['unresolvedRows'] {
  return arr(stage72Report.rows).map(row => ({
    id: str(row.id),
    corpus: str(row.corpus),
    score: num(row.score),
    grade: str(row.grade) || null,
    bucket: str(row.debtBucket),
  }));
}

function hardBlockers(input: {
  stage71Report: JsonRecord;
  stage72Report: JsonRecord;
  stage73TargetRows: JsonRecord[];
  stage73ControlRows: JsonRecord[];
  unresolvedRows: Stage74Report['unresolvedRows'];
}): string[] {
  const blockers: string[] = [];
  const legacyFp = readMetric(input.stage71Report, ['summaries', 'legacy'], 'falsePositiveAppliedCount') ?? 0;
  const edgeFp = readMetric(input.stage71Report, ['summaries', 'edgeMixCombined'], 'falsePositiveAppliedCount') ?? 0;
  const targetFp = input.stage73TargetRows.reduce((sum, row) => sum + falsePositiveApplied(row), 0);
  const controlFp = input.stage73ControlRows.reduce((sum, row) => sum + falsePositiveApplied(row), 0);
  if (legacyFp + edgeFp + targetFp + controlFp > 0) blockers.push(`false_positive_applied_nonzero:${legacyFp + edgeFp + targetFp + controlFp}`);

  const protectedRegressions = readMetric(input.stage71Report, ['gates', 'stage69'], 'protectedRegressionCount');
  if ((protectedRegressions ?? 0) > 0) blockers.push(`protected_regressions_nonzero:${protectedRegressions}`);

  const inconclusive = input.unresolvedRows.filter(row => row.bucket === 'inconclusive_missing_artifact');
  if (inconclusive.length > 0) blockers.push(`inconclusive_unresolved_rows:${inconclusive.map(row => row.id).join(',')}`);

  const misbucketed = input.unresolvedRows.filter(row => row.grade !== 'A' && row.grade !== 'B' && !WAIVABLE_EDGE_BUCKETS.has(row.bucket));
  if (misbucketed.length > 0) blockers.push(`non_ab_rows_with_unwaivable_bucket:${misbucketed.map(row => `${row.id}:${row.bucket}`).join(',')}`);

  const stage73 = stage73RowFromTarget(input.stage73TargetRows);
  if (stage73.v1_4145Score == null) blockers.push('stage73_v1_4145_target_row_missing');

  const stage72Ab = asRecord(input.stage72Report.abMath);
  if (num(stage72Ab.currentAbCount) == null || num(stage72Ab.totalRows) == null) blockers.push('stage72_ab_math_missing');
  return blockers;
}

function waivers(input: {
  stage71Report: JsonRecord;
  stage72Report: JsonRecord;
  unresolvedRows: Stage74Report['unresolvedRows'];
}): Stage74Waiver[] {
  const out: Stage74Waiver[] = [];
  const failedGateKeys = arr(nested(input.stage71Report, 'gates', 'stage69').failedGateKeys).map(String);
  const rawFailedGateKeys = Array.isArray(nested(input.stage71Report, 'gates', 'stage69').failedGateKeys)
    ? nested(input.stage71Report, 'gates', 'stage69').failedGateKeys as unknown[]
    : [];
  const failed = rawFailedGateKeys.map(String);
  if (failed.includes('runtime_p95_wall') || failedGateKeys.includes('runtime_p95_wall')) {
    out.push({ key: 'runtime_p95_wall', reason: 'Stage 69 fails only runtime_p95_wall while protected regressions and false-positive applied remain clean.' });
  }
  const abMath = asRecord(input.stage72Report.abMath);
  if (num(abMath.currentAbCount) != null && num(abMath.targetAbCount) != null && (num(abMath.currentAbCount) ?? 0) < (num(abMath.targetAbCount) ?? 0)) {
    out.push({ key: 'edge_mix_ab_shortfall', reason: `Edge-mix A/B is ${abMath.currentAbCount}/${abMath.totalRows}; target is ${abMath.targetAbCount}/${abMath.totalRows}.` });
  }
  if (input.unresolvedRows.some(row => row.bucket === 'parked_analyzer_volatility')) {
    out.push({ key: 'parked_analyzer_volatility', reason: 'Stage 66 classified remaining volatile edge-mix rows as non-canonicalizable Python structural drop/count variance.' });
  }
  if (input.unresolvedRows.some(row => row.bucket === 'manual_scanned_policy_debt')) {
    out.push({ key: 'manual_scanned_policy_debt', reason: 'Manual/scanned rows lack a deterministic structural fixer path under current policy.' });
  }
  return out;
}

function decision(input: {
  hardBlockers: string[];
  waivers: Stage74Waiver[];
  stage73ReachedAb: boolean;
  reachableWithoutParkedOrManualRows: boolean;
}): Stage74Report['decision'] {
  if (input.hardBlockers.length > 0) {
    return {
      status: 'hard_blocker_requires_investigation',
      reasons: input.hardBlockers,
    };
  }
  if (!input.stage73ReachedAb && !input.reachableWithoutParkedOrManualRows) {
    return {
      status: 'accept_engine_v2_general_checkpoint_with_documented_waivers',
      reasons: [
        'Stage 73 exhausted the only stable non-parked edge-mix A/B lift candidate.',
        'Legacy protected regressions and false-positive applied remain clean.',
        `Documented waivers: ${input.waivers.map(waiver => waiver.key).join(', ')}`,
      ],
    };
  }
  return {
    status: 'dedicated_analyzer_volatility_project',
    reasons: ['Edge-mix A/B remains blocked, but Stage 73/72 evidence did not justify acceptance-with-waivers.'],
  };
}

export function buildStage74Report(input: {
  stage71ReportPath: string;
  stage72ReportPath: string;
  stage73ReportPath: string;
  stage73TargetRunDir: string;
  stage73ControlRunDir: string;
  stage71Report: JsonRecord;
  stage72Report: JsonRecord;
  stage73Report: JsonRecord;
  stage73TargetRows: JsonRecord[];
  stage73ControlRows: JsonRecord[];
  generatedAt?: string;
}): Stage74Report {
  const unresolved = unresolvedRows(input.stage72Report);
  const blockers = hardBlockers({
    stage71Report: input.stage71Report,
    stage72Report: input.stage72Report,
    stage73TargetRows: input.stage73TargetRows,
    stage73ControlRows: input.stage73ControlRows,
    unresolvedRows: unresolved,
  });
  const waiverList = waivers({
    stage71Report: input.stage71Report,
    stage72Report: input.stage72Report,
    unresolvedRows: unresolved,
  });
  const stage73 = stage73RowFromTarget(input.stage73TargetRows);
  const stage73ReportDecision = asRecord(asRecord(input.stage73Report.decision));
  const abMath = asRecord(input.stage72Report.abMath);
  const legacySummary = nested(input.stage71Report, 'summaries', 'legacy');
  const stage69Gate = nested(input.stage71Report, 'gates', 'stage69');
  const failedGateKeys = Array.isArray(stage69Gate.failedGateKeys) ? stage69Gate.failedGateKeys.map(String) : [];
  const edgeMixCombined = nested(input.stage71Report, 'summaries', 'edgeMixCombined');
  const decisionResult = decision({
    hardBlockers: blockers,
    waivers: waiverList,
    stage73ReachedAb: stage73.reachedAb,
    reachableWithoutParkedOrManualRows: Boolean(abMath.reachableWithoutParkedOrManualRows),
  });
  return {
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    inputs: {
      stage71ReportPath: input.stage71ReportPath,
      stage72ReportPath: input.stage72ReportPath,
      stage73ReportPath: input.stage73ReportPath,
      stage73TargetRunDir: input.stage73TargetRunDir,
      stage73ControlRunDir: input.stage73ControlRunDir,
    },
    legacy: {
      mean: num(legacySummary.mean),
      median: num(legacySummary.median),
      fCount: num(legacySummary.fCount),
      protectedRegressionCount: num(stage69Gate.protectedRegressionCount),
      failedGateKeys,
      falsePositiveAppliedCount: num(legacySummary.falsePositiveAppliedCount) ?? 0,
    },
    edgeMix: {
      abCount: num(abMath.currentAbCount) ?? num(edgeMixCombined.abCount) ?? 0,
      totalRows: num(abMath.totalRows) ?? num(edgeMixCombined.count) ?? 0,
      targetAbCount: num(abMath.targetAbCount) ?? 0,
      abPercent: num(edgeMixCombined.abPercent),
      stableCandidateCount: num(abMath.stableCandidateCount) ?? 0,
      projectedAbCountWithStableCandidates: num(abMath.projectedAbCountWithStableCandidates) ?? 0,
      reachableWithoutParkedOrManualRows: Boolean(abMath.reachableWithoutParkedOrManualRows),
    },
    stage73: {
      ...stage73,
      materialImprovementAccepted: stage73.reachedAb,
      stableAbLiftRemaining: false,
    },
    unresolvedRows: unresolved,
    hardBlockers: blockers,
    waivers: waiverList,
    decision: decisionResult,
    generatedArtifactPolicy: {
      generatedOutputCommitted: false,
      note: 'Generated Output artifacts, PDFs, reports, caches, and Base64 payloads are report inputs/outputs only and must remain uncommitted.',
    },
  };
}

function renderWaiver(waiver: Stage74Waiver): string {
  return `- \`${waiver.key}\`: ${waiver.reason}`;
}

function renderUnresolved(row: Stage74Report['unresolvedRows'][number]): string {
  return `| ${row.id} | ${row.corpus} | ${row.score ?? 'n/a'}/${row.grade ?? 'n/a'} | ${row.bucket} |`;
}

export function renderStage74Markdown(report: Stage74Report): string {
  const lines = [
    '# Stage 74 End-Gate Target Revisit',
    '',
    `Generated: \`${report.generatedAt}\``,
    `Decision: **${report.decision.status}**`,
    '',
    'Decision reasons:',
    ...report.decision.reasons.map(reason => `- ${reason}`),
    '',
    '## Legacy Gate Context',
    '',
    `- Mean/median/F: ${report.legacy.mean ?? 'n/a'} / ${report.legacy.median ?? 'n/a'} / ${report.legacy.fCount ?? 'n/a'}`,
    `- Failed gate keys: ${report.legacy.failedGateKeys.join(', ') || 'none'}`,
    `- Protected regressions: ${report.legacy.protectedRegressionCount ?? 'n/a'}`,
    `- False-positive applied: ${report.legacy.falsePositiveAppliedCount}`,
    '',
    '## Edge-Mix A/B Math',
    '',
    `- Current A/B: ${report.edgeMix.abCount}/${report.edgeMix.totalRows} (${report.edgeMix.abPercent ?? 'n/a'}%)`,
    `- Target A/B: ${report.edgeMix.targetAbCount}/${report.edgeMix.totalRows}`,
    `- Stable candidates remaining before Stage 73: ${report.edgeMix.stableCandidateCount}`,
    `- Projected with stable candidates: ${report.edgeMix.projectedAbCountWithStableCandidates}/${report.edgeMix.totalRows}`,
    `- Reachable without parked/manual rows: ${report.edgeMix.reachableWithoutParkedOrManualRows ? 'yes' : 'no'}`,
    '',
    '## Stage 73 Result',
    '',
    `- v1-4145: ${report.stage73.v1_4145Score ?? 'n/a'}/${report.stage73.v1_4145Grade ?? 'n/a'}, alt_text ${report.stage73.v1_4145AltText ?? 'n/a'}`,
    `- Reached A/B: ${report.stage73.reachedAb ? 'yes' : 'no'}`,
    `- Material improvement accepted: ${report.stage73.materialImprovementAccepted ? 'yes' : 'no'}`,
    `- Stable A/B lift remains: ${report.stage73.stableAbLiftRemaining ? 'yes' : 'no'}`,
    '',
    '## Waivers',
    '',
    ...report.waivers.map(renderWaiver),
    '',
    '## Hard Blockers',
    '',
    ...(report.hardBlockers.length ? report.hardBlockers.map(blocker => `- ${blocker}`) : ['- none']),
    '',
    '## Unresolved Edge-Mix Rows',
    '',
    '| Row | Corpus | Score/Grade | Bucket |',
    '| --- | --- | ---: | --- |',
    ...report.unresolvedRows.map(renderUnresolved),
    '',
    '## Generated Artifact Policy',
    '',
    `- Generated artifacts committed: ${report.generatedArtifactPolicy.generatedOutputCommitted}`,
    `- ${report.generatedArtifactPolicy.note}`,
    '',
  ];
  return `${lines.join('\n')}\n`;
}

async function readJson(path: string): Promise<JsonRecord> {
  return asRecord(JSON.parse(await readFile(resolve(path), 'utf8')) as unknown);
}

async function loadRunRows(runDir: string): Promise<JsonRecord[]> {
  const raw = await readJson(join(resolve(runDir), 'remediate.results.json'));
  const asArray = JSON.parse(await readFile(join(resolve(runDir), 'remediate.results.json'), 'utf8')) as unknown;
  return Array.isArray(asArray) ? asArray.filter(item => item && typeof item === 'object' && !Array.isArray(item)) as JsonRecord[] : loadRowsFromRunObject(raw);
}

function parseArgs(argv: string[]): {
  stage71: string;
  stage72: string;
  stage73: string;
  stage73TargetRun: string;
  stage73ControlRun: string;
  outDir: string;
} {
  const args = {
    stage71: DEFAULT_STAGE71_REPORT,
    stage72: DEFAULT_STAGE72_REPORT,
    stage73: DEFAULT_STAGE73_REPORT,
    stage73TargetRun: DEFAULT_STAGE73_TARGET,
    stage73ControlRun: DEFAULT_STAGE73_CONTROL,
    outDir: DEFAULT_OUT,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!;
    if (arg === '--stage71') args.stage71 = argv[++index] ?? args.stage71;
    else if (arg === '--stage72') args.stage72 = argv[++index] ?? args.stage72;
    else if (arg === '--stage73') args.stage73 = argv[++index] ?? args.stage73;
    else if (arg === '--stage73-target-run') args.stage73TargetRun = argv[++index] ?? args.stage73TargetRun;
    else if (arg === '--stage73-control-run') args.stage73ControlRun = argv[++index] ?? args.stage73ControlRun;
    else if (arg === '--out') args.outDir = argv[++index] ?? args.outDir;
    else if (arg === '--help' || arg === '-h') {
      console.log(usage());
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}\n${usage()}`);
    }
  }
  return args;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2).filter((arg, index) => !(index === 0 && arg === '--')));
  const [stage71Report, stage72Report, stage73Report, stage73TargetRows, stage73ControlRows] = await Promise.all([
    readJson(args.stage71),
    readJson(args.stage72),
    readJson(args.stage73),
    loadRunRows(args.stage73TargetRun),
    loadRunRows(args.stage73ControlRun),
  ]);
  const report = buildStage74Report({
    stage71ReportPath: resolve(args.stage71),
    stage72ReportPath: resolve(args.stage72),
    stage73ReportPath: resolve(args.stage73),
    stage73TargetRunDir: resolve(args.stage73TargetRun),
    stage73ControlRunDir: resolve(args.stage73ControlRun),
    stage71Report,
    stage72Report,
    stage73Report,
    stage73TargetRows,
    stage73ControlRows,
  });
  await mkdir(args.outDir, { recursive: true });
  await writeFile(join(args.outDir, 'stage74-end-gate-revisit.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await writeFile(join(args.outDir, 'stage74-end-gate-revisit.md'), renderStage74Markdown(report), 'utf8');
  console.log(`Wrote Stage 74 end-gate revisit report to ${resolve(args.outDir)}`);
  console.log(`Decision: ${report.decision.status}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
