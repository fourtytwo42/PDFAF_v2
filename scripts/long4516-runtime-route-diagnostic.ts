#!/usr/bin/env tsx
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { RemediateBenchmarkRow } from '../src/services/benchmark/experimentCorpus.js';
import { loadBenchmarkRowsFromRunDir } from '../src/services/benchmark/stage1Acceptance.js';
import type { AppliedRemediationTool } from '../src/types.js';

const DEFAULT_GOOD_RUN = 'Output/experiment-corpus-baseline/run-long4516-postpass-guard-target-2026-05-09-r1';
const DEFAULT_LOW_RUN = 'Output/experiment-corpus-baseline/run-goal-blocker-repeat-2026-05-09-r1';
const DEFAULT_TIMEOUT_RUN = 'Output/experiment-corpus-baseline/run-goal-runtime-hardtimeout-repeat-2026-05-09-r1';
const DEFAULT_TIMEOUT_TRACE = join(DEFAULT_TIMEOUT_RUN, 'runtime-timeouts', 'long-4516.json');
const DEFAULT_OUT = 'Output/experiment-corpus-baseline/long4516-runtime-route-diagnostic-2026-05-09-r1';
const ROW_ID = 'long-4516';
const METADATA_TOOLS = new Set(['set_document_title', 'set_document_language']);

export type Long4516RouteClassification =
  | 'metadata_acceptance_volatility'
  | 'below_floor_timeout_no_safe_return'
  | 'safe_checkpoint_return_candidate'
  | 'insufficient_route_evidence';

export interface Long4516MetadataStageSummary {
  outcomes: Array<{
    toolName: string;
    outcome: string;
    scoreBefore: number | null;
    scoreAfter: number | null;
    stateSignatureBefore: string | null;
    stateSignatureAfter: string | null;
    categoryScoresAfter: Record<string, number> | null;
    rawReason: string | null;
  }>;
  allMetadataApplied: boolean;
  anyMetadataRejected: boolean;
  firstStateSignature: string | null;
  finalTitleLanguageScore: number | null;
}

export interface Long4516RunSummary {
  runDir: string;
  present: boolean;
  score: number | null;
  grade: string | null;
  hardTimeout: boolean;
  wallMs: number | null;
  attemptCount: number;
  metadataStage: Long4516MetadataStageSummary;
}

export interface Long4516TimeoutTraceSummary {
  path: string;
  present: boolean;
  elapsedMs: number | null;
  lastPhase: string | null;
  lastStageNumber: number | null;
  lastToolName: string | null;
  lastToolOutcome: string | null;
  lastVerifiedCheckpointScore: number | null;
  lastVerifiedCheckpointGrade: string | null;
  lastVerifiedCheckpointEligible: boolean | null;
  lastVerifiedCheckpointEligibilityReason: string | null;
  completedStageReanalysisMs: number | null;
  checkpointHistory: Array<{
    reason: string;
    score: number | null;
    grade: string | null;
    eligible: boolean | null;
    eligibilityReason: string | null;
    elapsedMs: number | null;
  }>;
}

export interface Long4516RuntimeRouteDiagnostic {
  generatedAt: string;
  rowId: string;
  classification: Long4516RouteClassification;
  recommendation: string;
  goodRun: Long4516RunSummary;
  lowRun: Long4516RunSummary;
  timeoutRun: Long4516RunSummary;
  timeoutTrace: Long4516TimeoutTraceSummary;
  evidence: {
    sameInitialMetadataState: boolean;
    goodMetadataApplied: boolean;
    lowMetadataRejected: boolean;
    timeoutCheckpointBelowFloor: boolean;
    timeoutReachedEligibleCheckpoint: boolean;
  };
}

function usage(): string {
  return [
    'Usage: pnpm exec tsx scripts/long4516-runtime-route-diagnostic.ts [options]',
    '  --good <run-dir>',
    '  --low <run-dir>',
    '  --timeout <run-dir>',
    '  --trace <runtime-timeout-json>',
    '  --out <dir>',
  ].join('\n');
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function booleanOrNull(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function parseDetails(details: unknown): Record<string, unknown> | null {
  if (typeof details !== 'string' || details.trim().length === 0) return null;
  try {
    return asRecord(JSON.parse(details));
  } catch {
    return null;
  }
}

function replay(details: unknown): Record<string, unknown> | null {
  const parsed = parseDetails(details);
  return asRecord(asRecord(parsed?.debug)?.replayState);
}

function rawReason(details: unknown): string | null {
  const parsed = parseDetails(details);
  const raw = stringOrNull(parsed?.raw);
  if (raw) return raw;
  return typeof details === 'string' && details.length > 0 ? details : null;
}

function scoreFor(row?: RemediateBenchmarkRow): number | null {
  return row?.reanalyzedScore ?? row?.afterScore ?? null;
}

function gradeFor(row?: RemediateBenchmarkRow): string | null {
  return row?.reanalyzedGrade ?? row?.afterGrade ?? null;
}

function hardTimeout(row?: RemediateBenchmarkRow): boolean {
  return Boolean(row && /aborted due to timeout|timeout/i.test(row.error ?? '') && scoreFor(row) == null);
}

function summarizeMetadataStage(row?: RemediateBenchmarkRow): Long4516MetadataStageSummary {
  const outcomes = (row?.appliedTools ?? [])
    .filter(tool => METADATA_TOOLS.has(tool.toolName))
    .map(tool => {
      const state = replay(tool.details);
      return {
        toolName: tool.toolName,
        outcome: tool.outcome,
        scoreBefore: numberOrNull(tool.scoreBefore),
        scoreAfter: numberOrNull(tool.scoreAfter),
        stateSignatureBefore: stringOrNull(state?.stateSignatureBefore),
        stateSignatureAfter: stringOrNull(state?.stateSignatureAfter),
        categoryScoresAfter: asRecord(state?.categoryScoresAfter) as Record<string, number> | null,
        rawReason: rawReason(tool.details),
      };
    });
  const finalTitleLanguageScore = outcomes
    .map(item => item.categoryScoresAfter?.title_language)
    .filter((value): value is number => typeof value === 'number')
    .at(-1) ?? null;
  return {
    outcomes,
    allMetadataApplied: outcomes.length > 0 && outcomes.every(item => item.outcome === 'applied'),
    anyMetadataRejected: outcomes.some(item => item.outcome === 'rejected'),
    firstStateSignature: outcomes[0]?.stateSignatureBefore ?? null,
    finalTitleLanguageScore,
  };
}

function summarizeRun(runDir: string, row?: RemediateBenchmarkRow): Long4516RunSummary {
  return {
    runDir,
    present: Boolean(row),
    score: scoreFor(row),
    grade: gradeFor(row),
    hardTimeout: hardTimeout(row),
    wallMs: typeof row?.wallRemediateMs === 'number' ? row.wallRemediateMs : null,
    attemptCount: row?.appliedTools?.length ?? 0,
    metadataStage: summarizeMetadataStage(row),
  };
}

async function loadRow(runDir: string): Promise<RemediateBenchmarkRow | undefined> {
  const rows = await loadBenchmarkRowsFromRunDir(runDir);
  return rows.remediateResults.find(row => row.id === ROW_ID);
}

async function loadTimeoutTrace(path: string): Promise<Long4516TimeoutTraceSummary> {
  try {
    const parsed = JSON.parse(await readFile(resolve(path), 'utf8')) as Record<string, unknown>;
    const history = Array.isArray(parsed.verifiedCheckpointHistory) ? parsed.verifiedCheckpointHistory : [];
    return {
      path,
      present: true,
      elapsedMs: numberOrNull(parsed.elapsedMs),
      lastPhase: stringOrNull(parsed.lastPhase),
      lastStageNumber: numberOrNull(parsed.lastStageNumber),
      lastToolName: stringOrNull(parsed.lastToolName),
      lastToolOutcome: stringOrNull(parsed.lastToolOutcome),
      lastVerifiedCheckpointScore: numberOrNull(parsed.lastVerifiedCheckpointScore),
      lastVerifiedCheckpointGrade: stringOrNull(parsed.lastVerifiedCheckpointGrade),
      lastVerifiedCheckpointEligible: booleanOrNull(parsed.lastVerifiedCheckpointEligible),
      lastVerifiedCheckpointEligibilityReason: stringOrNull(parsed.lastVerifiedCheckpointEligibilityReason),
      completedStageReanalysisMs: numberOrNull(parsed.completedStageReanalysisMs),
      checkpointHistory: history.map(item => {
        const record = asRecord(item) ?? {};
        return {
          reason: stringOrNull(record.reason) ?? 'unknown',
          score: numberOrNull(record.score),
          grade: stringOrNull(record.grade),
          eligible: booleanOrNull(record.eligible),
          eligibilityReason: stringOrNull(record.eligibilityReason),
          elapsedMs: numberOrNull(record.elapsedMs),
        };
      }),
    };
  } catch {
    return {
      path,
      present: false,
      elapsedMs: null,
      lastPhase: null,
      lastStageNumber: null,
      lastToolName: null,
      lastToolOutcome: null,
      lastVerifiedCheckpointScore: null,
      lastVerifiedCheckpointGrade: null,
      lastVerifiedCheckpointEligible: null,
      lastVerifiedCheckpointEligibilityReason: null,
      completedStageReanalysisMs: null,
      checkpointHistory: [],
    };
  }
}

export function buildLong4516RuntimeRouteDiagnostic(input: {
  goodRun: Long4516RunSummary;
  lowRun: Long4516RunSummary;
  timeoutRun: Long4516RunSummary;
  timeoutTrace: Long4516TimeoutTraceSummary;
  generatedAt?: string;
}): Long4516RuntimeRouteDiagnostic {
  const sameInitialMetadataState = Boolean(
    input.goodRun.metadataStage.firstStateSignature &&
    input.goodRun.metadataStage.firstStateSignature === input.lowRun.metadataStage.firstStateSignature,
  );
  const timeoutCheckpointBelowFloor = Boolean(
    input.timeoutTrace.lastVerifiedCheckpointEligible === false &&
    /checkpoint_below_floor/i.test(input.timeoutTrace.lastVerifiedCheckpointEligibilityReason ?? ''),
  );
  const timeoutReachedEligibleCheckpoint = input.timeoutTrace.checkpointHistory.some(item => item.eligible === true);
  const evidence = {
    sameInitialMetadataState,
    goodMetadataApplied: input.goodRun.metadataStage.allMetadataApplied,
    lowMetadataRejected: input.lowRun.metadataStage.anyMetadataRejected,
    timeoutCheckpointBelowFloor,
    timeoutReachedEligibleCheckpoint,
  };

  let classification: Long4516RouteClassification = 'insufficient_route_evidence';
  let recommendation = 'Collect another targeted repeat with timeout traces before changing behavior.';
  if (evidence.timeoutCheckpointBelowFloor && !evidence.timeoutReachedEligibleCheckpoint) {
    classification = 'below_floor_timeout_no_safe_return';
    recommendation = 'Do not lower the checkpoint floor or return the timeout checkpoint; find the upstream route split that prevents floor-safe progress.';
  }
  if (evidence.sameInitialMetadataState && evidence.goodMetadataApplied && evidence.lowMetadataRejected) {
    classification = 'metadata_acceptance_volatility';
    recommendation = 'A future behavior stage may test a narrow metadata-only acceptance preservation path, but only with targeted controls because the bad analyzer result also changes structure/alt/table evidence.';
  }
  if (input.timeoutTrace.lastVerifiedCheckpointEligible === true) {
    classification = 'safe_checkpoint_return_candidate';
    recommendation = 'Investigate why an eligible checkpoint was not returned terminally before adding new suppression.';
  }

  return {
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    rowId: ROW_ID,
    classification,
    recommendation,
    goodRun: input.goodRun,
    lowRun: input.lowRun,
    timeoutRun: input.timeoutRun,
    timeoutTrace: input.timeoutTrace,
    evidence,
  };
}

function markdown(report: Long4516RuntimeRouteDiagnostic): string {
  const lines: string[] = [];
  lines.push('# Long-4516 Runtime Route Diagnostic', '');
  lines.push(`- Classification: \`${report.classification}\``);
  lines.push(`- Recommendation: ${report.recommendation}`);
  lines.push(`- Same initial metadata state: \`${report.evidence.sameInitialMetadataState}\``);
  lines.push(`- Good metadata applied: \`${report.evidence.goodMetadataApplied}\``);
  lines.push(`- Low-route metadata rejected: \`${report.evidence.lowMetadataRejected}\``);
  lines.push(`- Timeout checkpoint below floor: \`${report.evidence.timeoutCheckpointBelowFloor}\``);
  lines.push(`- Timeout reached eligible checkpoint: \`${report.evidence.timeoutReachedEligibleCheckpoint}\``, '');
  lines.push('| Run | Score | Grade | Hard Timeout | Attempts | Metadata Outcomes |');
  lines.push('| --- | ---: | --- | --- | ---: | --- |');
  for (const [label, run] of [['good', report.goodRun], ['low', report.lowRun], ['timeout', report.timeoutRun]] as const) {
    const outcomes = run.metadataStage.outcomes.map(item => `${item.toolName}:${item.outcome}:${item.scoreBefore}->${item.scoreAfter}`).join('<br>') || 'n/a';
    lines.push(`| ${label} | ${run.score ?? 'n/a'} | ${run.grade ?? 'n/a'} | ${run.hardTimeout} | ${run.attemptCount} | ${outcomes} |`);
  }
  lines.push('', '## Timeout Trace', '');
  lines.push(`- Last phase: \`${report.timeoutTrace.lastPhase ?? 'n/a'}\``);
  lines.push(`- Last tool: \`${report.timeoutTrace.lastToolName ?? 'n/a'}:${report.timeoutTrace.lastToolOutcome ?? 'n/a'}\``);
  lines.push(`- Last checkpoint: \`${report.timeoutTrace.lastVerifiedCheckpointScore ?? 'n/a'}/${report.timeoutTrace.lastVerifiedCheckpointGrade ?? 'n/a'}\``);
  lines.push(`- Eligibility: \`${report.timeoutTrace.lastVerifiedCheckpointEligible}\` (${report.timeoutTrace.lastVerifiedCheckpointEligibilityReason ?? 'n/a'})`);
  lines.push(`- Completed stage reanalysis: \`${report.timeoutTrace.completedStageReanalysisMs ?? 'n/a'}ms\``);
  return `${lines.join('\n')}\n`;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  let goodRun = DEFAULT_GOOD_RUN;
  let lowRun = DEFAULT_LOW_RUN;
  let timeoutRun = DEFAULT_TIMEOUT_RUN;
  let tracePath = DEFAULT_TIMEOUT_TRACE;
  let outDir = DEFAULT_OUT;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const value = args[index + 1];
    if (arg === '--good' && value) {
      goodRun = value;
      index += 1;
    } else if (arg === '--low' && value) {
      lowRun = value;
      index += 1;
    } else if (arg === '--timeout' && value) {
      timeoutRun = value;
      tracePath = join(value, 'runtime-timeouts', 'long-4516.json');
      index += 1;
    } else if (arg === '--trace' && value) {
      tracePath = value;
      index += 1;
    } else if (arg === '--out' && value) {
      outDir = value;
      index += 1;
    } else {
      throw new Error(`Unknown or incomplete argument: ${arg}\n${usage()}`);
    }
  }

  const [goodRow, lowRow, timeoutRow, timeoutTrace] = await Promise.all([
    loadRow(goodRun),
    loadRow(lowRun),
    loadRow(timeoutRun),
    loadTimeoutTrace(tracePath),
  ]);
  const report = buildLong4516RuntimeRouteDiagnostic({
    goodRun: summarizeRun(goodRun, goodRow),
    lowRun: summarizeRun(lowRun, lowRow),
    timeoutRun: summarizeRun(timeoutRun, timeoutRow),
    timeoutTrace,
  });
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, 'long4516-runtime-route-diagnostic.json'), `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(join(outDir, 'long4516-runtime-route-diagnostic.md'), markdown(report));
  console.log(`Wrote long-4516 runtime route diagnostic to ${outDir}`);
  console.log(`Classification: ${report.classification}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
