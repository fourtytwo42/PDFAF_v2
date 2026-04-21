import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type {
  BenchmarkRunSummary,
  RemediateBenchmarkRow,
} from './experimentCorpus.js';

export type Stage41GateSeverity = 'hard' | 'advisory';

export interface Stage41GateRow {
  key: string;
  passed: boolean;
  severity: Stage41GateSeverity;
  baselineValue: number | string | null;
  candidateValue: number | string | null;
  threshold: number | string;
  detail: string;
}

export interface Stage41ToolOutcomeDelta {
  key: string;
  baseline: number;
  candidate: number;
  delta: number;
}

export interface Stage41FalsePositiveAppliedRow {
  id: string;
  file: string;
  toolName: string;
  stage: number;
  round: number;
  reason: string;
}

export interface Stage41RegressionRow {
  id: string;
  file: string;
  baselineScore: number;
  candidateScore: number;
  delta: number;
  explainedByNewCap: boolean;
}

export interface Stage41BenchmarkGateAudit {
  generatedAt: string;
  baselineRunDir: string;
  candidateRunDir: string;
  passed: boolean;
  gates: Stage41GateRow[];
  summary: {
    baselineMean: number | null;
    candidateMean: number | null;
    baselineMedian: number | null;
    candidateMedian: number | null;
    baselineP95WallMs: number | null;
    candidateP95WallMs: number | null;
    baselineMedianWallMs: number | null;
    candidateMedianWallMs: number | null;
    baselineAttemptCount: number;
    candidateAttemptCount: number;
    baselineHeadingNoEffectCount: number;
    candidateHeadingNoEffectCount: number;
    baselineFCount: number;
    candidateFCount: number;
    routeSummaryCoverage: number;
    unknownDetailsCount: number;
    falsePositiveAppliedCount: number;
  };
  gradeDistributions: {
    baseline: Record<string, number>;
    candidate: Record<string, number>;
  };
  topScoreRegressions: Stage41RegressionRow[];
  topRuntimeRegressions: Array<{
    id: string;
    file: string;
    baselineMs: number;
    candidateMs: number;
    deltaMs: number;
  }>;
  toolOutcomeDeltas: Stage41ToolOutcomeDelta[];
  falsePositiveAppliedRows: Stage41FalsePositiveAppliedRow[];
  unknownDetailsRows: Array<{
    id: string;
    file: string;
    toolName: string;
    stage: number;
    round: number;
  }>;
}

const EXPECTED_FULL_CORPUS_COUNT = 50;
const SCORE_MEAN_TOLERANCE = 0.5;
const SCORE_MEDIAN_TOLERANCE = 1;
const RUNTIME_P95_TOLERANCE_MS = 10_000;
const RUNTIME_MEDIAN_TOLERANCE_MS = 5_000;
const TOOL_ATTEMPT_TOLERANCE_RATIO = 1.05;
const HEADING_NO_EFFECT_TOLERANCE = 5;
const PROTECTED_FILE_REGRESSION_TOLERANCE = 2;

interface Stage41GateInput {
  baselineRunDir: string;
  candidateRunDir: string;
  baselineSummary: BenchmarkRunSummary;
  candidateSummary: BenchmarkRunSummary;
  baselineRemediateResults: RemediateBenchmarkRow[];
  candidateRemediateResults: RemediateBenchmarkRow[];
  generatedAt?: string;
}

type ParsedToolDetails =
  | { kind: 'json'; value: Record<string, unknown> }
  | { kind: 'legacy_string' }
  | { kind: 'missing' };

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function scoreFor(row: RemediateBenchmarkRow): number | null {
  return row.reanalyzedScore ?? row.afterScore ?? null;
}

function gradeFor(row: RemediateBenchmarkRow): string | null {
  return row.reanalyzedGrade ?? row.afterGrade ?? null;
}

function gradeDistribution(rows: RemediateBenchmarkRow[]): Record<string, number> {
  const out: Record<string, number> = { A: 0, B: 0, C: 0, D: 0, F: 0 };
  for (const row of rows) {
    const grade = gradeFor(row);
    if (grade && Object.prototype.hasOwnProperty.call(out, grade)) out[grade] = (out[grade] ?? 0) + 1;
  }
  return out;
}

function countAttempts(rows: RemediateBenchmarkRow[]): number {
  return rows.reduce((sum, row) => sum + (row.appliedTools?.length ?? 0), 0);
}

function countHeadingNoEffect(rows: RemediateBenchmarkRow[]): number {
  return rows.reduce(
    (sum, row) =>
      sum +
      (row.appliedTools ?? []).filter(
        tool => tool.toolName === 'create_heading_from_candidate' && tool.outcome === 'no_effect',
      ).length,
    0,
  );
}

function capKeys(row: RemediateBenchmarkRow): Set<string> {
  return new Set((row.reanalyzedScoreCapsApplied?.length ? row.reanalyzedScoreCapsApplied : row.afterScoreCapsApplied ?? [])
    .map(cap => `${cap.category}:${cap.cap}:${cap.reason}`));
}

function protectedScoreRegressions(
  baselineRows: RemediateBenchmarkRow[],
  candidateRows: RemediateBenchmarkRow[],
): Stage41RegressionRow[] {
  const baselineById = new Map(baselineRows.map(row => [row.id, row]));
  const rows: Stage41RegressionRow[] = [];
  for (const candidate of candidateRows) {
    const baseline = baselineById.get(candidate.id);
    if (!baseline) continue;
    const baselineScore = scoreFor(baseline);
    const candidateScore = scoreFor(candidate);
    if (baselineScore === null || candidateScore === null) continue;
    const delta = candidateScore - baselineScore;
    if (delta >= -PROTECTED_FILE_REGRESSION_TOLERANCE) continue;
    const baselineCaps = capKeys(baseline);
    const newCaps = [...capKeys(candidate)].filter(key => !baselineCaps.has(key));
    rows.push({
      id: candidate.id,
      file: candidate.file,
      baselineScore,
      candidateScore,
      delta,
      explainedByNewCap: newCaps.length > 0,
    });
  }
  return rows.sort((a, b) => a.delta - b.delta || a.id.localeCompare(b.id));
}

function runtimeRegressions(
  baselineRows: RemediateBenchmarkRow[],
  candidateRows: RemediateBenchmarkRow[],
): Stage41BenchmarkGateAudit['topRuntimeRegressions'] {
  const baselineById = new Map(baselineRows.map(row => [row.id, row]));
  return candidateRows.flatMap(candidate => {
    const baseline = baselineById.get(candidate.id);
    const baselineMs = baseline?.wallRemediateMs ?? null;
    const candidateMs = candidate.wallRemediateMs ?? null;
    if (baselineMs === null || candidateMs === null) return [];
    return [{
      id: candidate.id,
      file: candidate.file,
      baselineMs,
      candidateMs,
      deltaMs: candidateMs - baselineMs,
    }];
  }).sort((a, b) => b.deltaMs - a.deltaMs || a.id.localeCompare(b.id)).slice(0, 20);
}

function parseDetails(details: string | undefined): ParsedToolDetails {
  if (!details) return { kind: 'missing' };
  const trimmed = details.trim();
  if (!trimmed.startsWith('{')) return { kind: 'legacy_string' };
  try {
    const value = JSON.parse(trimmed) as unknown;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return { kind: 'json', value: value as Record<string, unknown> };
    }
    return { kind: 'legacy_string' };
  } catch {
    return { kind: 'legacy_string' };
  }
}

function invariantFailureReason(details: Record<string, unknown>): string | null {
  const outcome = details.outcome;
  if (outcome === 'no_effect' || outcome === 'failed') return `details_outcome_${outcome}`;
  const invariants = details.invariants;
  if (!invariants || typeof invariants !== 'object' || Array.isArray(invariants)) return null;
  const inv = invariants as Record<string, unknown>;
  const failingKeys = [
    'targetReachable',
    'targetIsFigureAfter',
    'tableTreeValidAfter',
    'ownershipPreserved',
  ];
  const failed = failingKeys.find(key => inv[key] === false);
  return failed ? `invariant_${failed}_false` : null;
}

function inspectToolDetails(rows: RemediateBenchmarkRow[]): {
  falsePositiveAppliedRows: Stage41FalsePositiveAppliedRow[];
  unknownDetailsRows: Stage41BenchmarkGateAudit['unknownDetailsRows'];
} {
  const falsePositiveAppliedRows: Stage41FalsePositiveAppliedRow[] = [];
  const unknownDetailsRows: Stage41BenchmarkGateAudit['unknownDetailsRows'] = [];
  for (const row of rows) {
    for (const tool of row.appliedTools ?? []) {
      const parsed = parseDetails(tool.details);
      if (parsed.kind === 'legacy_string') {
        unknownDetailsRows.push({
          id: row.id,
          file: row.file,
          toolName: tool.toolName,
          stage: tool.stage,
          round: tool.round,
        });
      }
      if (tool.outcome !== 'applied' || parsed.kind !== 'json') continue;
      const reason = invariantFailureReason(parsed.value);
      if (reason) {
        falsePositiveAppliedRows.push({
          id: row.id,
          file: row.file,
          toolName: tool.toolName,
          stage: tool.stage,
          round: tool.round,
          reason,
        });
      }
    }
  }
  return { falsePositiveAppliedRows, unknownDetailsRows };
}

function toolOutcomeFrequency(rows: RemediateBenchmarkRow[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    for (const tool of row.appliedTools ?? []) {
      const key = `${tool.toolName}/${tool.outcome}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return counts;
}

function toolOutcomeDeltas(
  baselineRows: RemediateBenchmarkRow[],
  candidateRows: RemediateBenchmarkRow[],
): Stage41ToolOutcomeDelta[] {
  const baseline = toolOutcomeFrequency(baselineRows);
  const candidate = toolOutcomeFrequency(candidateRows);
  return [...new Set([...baseline.keys(), ...candidate.keys()])]
    .sort()
    .map(key => {
      const before = baseline.get(key) ?? 0;
      const after = candidate.get(key) ?? 0;
      return { key, baseline: before, candidate: after, delta: after - before };
    })
    .filter(row => row.delta !== 0);
}

function routeSummaryCoverage(rows: RemediateBenchmarkRow[]): number {
  return rows.filter(row => (row.planningSummary?.routeSummaries?.length ?? 0) > 0).length;
}

function gate(input: {
  key: string;
  passed: boolean;
  baselineValue: number | string | null;
  candidateValue: number | string | null;
  threshold: number | string;
  detail: string;
  severity?: Stage41GateSeverity;
}): Stage41GateRow {
  return {
    severity: input.severity ?? 'hard',
    ...input,
  };
}

export function buildStage41BenchmarkGateAudit(input: Stage41GateInput): Stage41BenchmarkGateAudit {
  const baselineRemediate = input.baselineSummary.remediate;
  const candidateRemediate = input.candidateSummary.remediate;
  const baselineGrades = gradeDistribution(input.baselineRemediateResults);
  const candidateGrades = gradeDistribution(input.candidateRemediateResults);
  const baselineFCount = baselineGrades.F ?? 0;
  const candidateFCount = candidateGrades.F ?? 0;
  const baselineAttempts = countAttempts(input.baselineRemediateResults);
  const candidateAttempts = countAttempts(input.candidateRemediateResults);
  const baselineHeadingNoEffect = countHeadingNoEffect(input.baselineRemediateResults);
  const candidateHeadingNoEffect = countHeadingNoEffect(input.candidateRemediateResults);
  const regressions = protectedScoreRegressions(input.baselineRemediateResults, input.candidateRemediateResults);
  const unexplainedRegressions = regressions.filter(row => !row.explainedByNewCap);
  const detailInspection = inspectToolDetails(input.candidateRemediateResults);
  const coverage = routeSummaryCoverage(input.candidateRemediateResults);

  const gates: Stage41GateRow[] = [
    gate({
      key: 'selected_file_count',
      passed: input.candidateSummary.counts.selectedEntries === EXPECTED_FULL_CORPUS_COUNT,
      baselineValue: input.baselineSummary.counts.selectedEntries,
      candidateValue: input.candidateSummary.counts.selectedEntries,
      threshold: EXPECTED_FULL_CORPUS_COUNT,
      detail: 'Candidate must be a full 50-file corpus run.',
    }),
    gate({
      key: 'analyze_success',
      passed:
        input.candidateSummary.counts.analyzeSuccess === EXPECTED_FULL_CORPUS_COUNT &&
        input.candidateSummary.counts.analyzeErrors === 0,
      baselineValue: `${input.baselineSummary.counts.analyzeSuccess}/${input.baselineSummary.counts.analyzeErrors}`,
      candidateValue: `${input.candidateSummary.counts.analyzeSuccess}/${input.candidateSummary.counts.analyzeErrors}`,
      threshold: '50/0',
      detail: 'Analyze pass must succeed for all corpus files.',
    }),
    gate({
      key: 'remediate_success',
      passed:
        input.candidateSummary.counts.remediateSuccess === EXPECTED_FULL_CORPUS_COUNT &&
        input.candidateSummary.counts.remediateErrors === 0,
      baselineValue: `${input.baselineSummary.counts.remediateSuccess}/${input.baselineSummary.counts.remediateErrors}`,
      candidateValue: `${input.candidateSummary.counts.remediateSuccess}/${input.candidateSummary.counts.remediateErrors}`,
      threshold: '50/0',
      detail: 'Remediation pass must succeed for all corpus files.',
    }),
    gate({
      key: 'route_summary_coverage',
      passed: coverage === input.candidateRemediateResults.length,
      baselineValue: routeSummaryCoverage(input.baselineRemediateResults),
      candidateValue: coverage,
      threshold: input.candidateRemediateResults.length,
      detail: 'Every remediate row must include planningSummary.routeSummaries.',
    }),
    gate({
      key: 'score_mean_floor',
      passed:
        candidateRemediate !== null &&
        baselineRemediate !== null &&
        candidateRemediate.afterScore.mean >= baselineRemediate.afterScore.mean - SCORE_MEAN_TOLERANCE,
      baselineValue: baselineRemediate?.afterScore.mean ?? null,
      candidateValue: candidateRemediate?.afterScore.mean ?? null,
      threshold: `>= baseline - ${SCORE_MEAN_TOLERANCE}`,
      detail: 'Candidate mean score must stay inside the Stage 40 envelope.',
    }),
    gate({
      key: 'score_median_floor',
      passed:
        candidateRemediate !== null &&
        baselineRemediate !== null &&
        candidateRemediate.afterScore.median >= baselineRemediate.afterScore.median - SCORE_MEDIAN_TOLERANCE,
      baselineValue: baselineRemediate?.afterScore.median ?? null,
      candidateValue: candidateRemediate?.afterScore.median ?? null,
      threshold: `>= baseline - ${SCORE_MEDIAN_TOLERANCE}`,
      detail: 'Candidate median score must stay inside the Stage 40 envelope.',
    }),
    gate({
      key: 'f_grade_count',
      passed: candidateFCount <= baselineFCount,
      baselineValue: baselineFCount,
      candidateValue: candidateFCount,
      threshold: '<= baseline',
      detail: 'Candidate must not introduce additional F-grade corpus files.',
    }),
    gate({
      key: 'protected_file_regressions',
      passed: unexplainedRegressions.length === 0,
      baselineValue: 0,
      candidateValue: unexplainedRegressions.length,
      threshold: `0 unexplained regressions below -${PROTECTED_FILE_REGRESSION_TOLERANCE}`,
      detail: 'File-level regressions require a new stricter score cap to be accepted.',
    }),
    gate({
      key: 'runtime_p95_wall',
      passed:
        candidateRemediate !== null &&
        baselineRemediate !== null &&
        candidateRemediate.wallRemediateMs.p95 <= baselineRemediate.wallRemediateMs.p95 + RUNTIME_P95_TOLERANCE_MS,
      baselineValue: baselineRemediate?.wallRemediateMs.p95 ?? null,
      candidateValue: candidateRemediate?.wallRemediateMs.p95 ?? null,
      threshold: `<= baseline + ${RUNTIME_P95_TOLERANCE_MS}ms`,
      detail: 'Candidate p95 wall remediation must not materially regress.',
    }),
    gate({
      key: 'runtime_median_wall',
      passed:
        candidateRemediate !== null &&
        baselineRemediate !== null &&
        candidateRemediate.wallRemediateMs.median <= baselineRemediate.wallRemediateMs.median + RUNTIME_MEDIAN_TOLERANCE_MS,
      baselineValue: baselineRemediate?.wallRemediateMs.median ?? null,
      candidateValue: candidateRemediate?.wallRemediateMs.median ?? null,
      threshold: `<= baseline + ${RUNTIME_MEDIAN_TOLERANCE_MS}ms`,
      detail: 'Candidate median wall remediation must not materially regress.',
    }),
    gate({
      key: 'runtime_max_wall',
      passed: true,
      baselineValue: baselineRemediate?.wallRemediateMs.max ?? null,
      candidateValue: candidateRemediate?.wallRemediateMs.max ?? null,
      threshold: 'advisory',
      detail: 'Max runtime is reported but not a hard gate because single large PDFs are noisy.',
      severity: 'advisory',
    }),
    gate({
      key: 'total_tool_attempts',
      passed: candidateAttempts <= Math.ceil(baselineAttempts * TOOL_ATTEMPT_TOLERANCE_RATIO),
      baselineValue: baselineAttempts,
      candidateValue: candidateAttempts,
      threshold: `<= baseline * ${TOOL_ATTEMPT_TOLERANCE_RATIO}`,
      detail: 'Candidate must not add broad retry/tool-attempt noise.',
    }),
    gate({
      key: 'heading_no_effect_attempts',
      passed: candidateHeadingNoEffect <= baselineHeadingNoEffect + HEADING_NO_EFFECT_TOLERANCE,
      baselineValue: baselineHeadingNoEffect,
      candidateValue: candidateHeadingNoEffect,
      threshold: `<= baseline + ${HEADING_NO_EFFECT_TOLERANCE}`,
      detail: 'Heading no-effect attempts must remain bounded.',
    }),
    gate({
      key: 'false_positive_applied',
      passed: detailInspection.falsePositiveAppliedRows.length === 0,
      baselineValue: 0,
      candidateValue: detailInspection.falsePositiveAppliedRows.length,
      threshold: 0,
      detail: 'Applied tool rows must not contradict Python mutation truth/invariants.',
    }),
  ];

  return {
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    baselineRunDir: input.baselineRunDir,
    candidateRunDir: input.candidateRunDir,
    passed: gates.filter(row => row.severity === 'hard').every(row => row.passed),
    gates,
    summary: {
      baselineMean: baselineRemediate?.afterScore.mean ?? null,
      candidateMean: candidateRemediate?.afterScore.mean ?? null,
      baselineMedian: baselineRemediate?.afterScore.median ?? null,
      candidateMedian: candidateRemediate?.afterScore.median ?? null,
      baselineP95WallMs: baselineRemediate?.wallRemediateMs.p95 ?? null,
      candidateP95WallMs: candidateRemediate?.wallRemediateMs.p95 ?? null,
      baselineMedianWallMs: baselineRemediate?.wallRemediateMs.median ?? null,
      candidateMedianWallMs: candidateRemediate?.wallRemediateMs.median ?? null,
      baselineAttemptCount: baselineAttempts,
      candidateAttemptCount: candidateAttempts,
      baselineHeadingNoEffectCount: baselineHeadingNoEffect,
      candidateHeadingNoEffectCount: candidateHeadingNoEffect,
      baselineFCount,
      candidateFCount,
      routeSummaryCoverage: coverage,
      unknownDetailsCount: detailInspection.unknownDetailsRows.length,
      falsePositiveAppliedCount: detailInspection.falsePositiveAppliedRows.length,
    },
    gradeDistributions: {
      baseline: baselineGrades,
      candidate: candidateGrades,
    },
    topScoreRegressions: regressions.slice(0, 20),
    topRuntimeRegressions: runtimeRegressions(input.baselineRemediateResults, input.candidateRemediateResults),
    toolOutcomeDeltas: toolOutcomeDeltas(input.baselineRemediateResults, input.candidateRemediateResults),
    falsePositiveAppliedRows: detailInspection.falsePositiveAppliedRows,
    unknownDetailsRows: detailInspection.unknownDetailsRows,
  };
}

function formatValue(value: number | string | null): string {
  if (value === null) return 'n/a';
  if (typeof value === 'number') return Number.isInteger(value) ? String(value) : String(round2(value));
  return value;
}

function renderGradeDistribution(grades: Record<string, number>): string {
  return ['A', 'B', 'C', 'D', 'F'].map(grade => `${grade}:${grades[grade] ?? 0}`).join(', ');
}

export function renderStage41BenchmarkGateMarkdown(audit: Stage41BenchmarkGateAudit): string {
  const lines: string[] = [];
  lines.push('# Stage 41 benchmark gate');
  lines.push('');
  lines.push(`- **Baseline:** \`${audit.baselineRunDir}\``);
  lines.push(`- **Candidate:** \`${audit.candidateRunDir}\``);
  lines.push(`- **Generated:** ${audit.generatedAt}`);
  lines.push(`- **Result:** ${audit.passed ? 'PASS' : 'FAIL'}`);
  lines.push('');
  lines.push('## Gate Rows');
  lines.push('');
  lines.push('| Gate | Severity | Result | Baseline | Candidate | Threshold | Detail |');
  lines.push('| --- | --- | --- | ---: | ---: | --- | --- |');
  for (const row of audit.gates) {
    lines.push(`| ${row.key} | ${row.severity} | ${row.passed ? 'pass' : 'FAIL'} | ${formatValue(row.baselineValue)} | ${formatValue(row.candidateValue)} | ${row.threshold} | ${row.detail} |`);
  }
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(`- **Grades baseline:** ${renderGradeDistribution(audit.gradeDistributions.baseline)}`);
  lines.push(`- **Grades candidate:** ${renderGradeDistribution(audit.gradeDistributions.candidate)}`);
  lines.push(`- **Attempts:** ${audit.summary.baselineAttemptCount} -> ${audit.summary.candidateAttemptCount}`);
  lines.push(`- **Heading no-effect:** ${audit.summary.baselineHeadingNoEffectCount} -> ${audit.summary.candidateHeadingNoEffectCount}`);
  lines.push(`- **Route summary coverage:** ${audit.summary.routeSummaryCoverage}`);
  lines.push(`- **Unknown legacy details:** ${audit.summary.unknownDetailsCount}`);
  lines.push(`- **False-positive applied:** ${audit.summary.falsePositiveAppliedCount}`);
  lines.push('');
  lines.push('## Top Score Regressions');
  lines.push('');
  lines.push('| File | Baseline | Candidate | Delta | Explained by new cap |');
  lines.push('| --- | ---: | ---: | ---: | --- |');
  for (const row of audit.topScoreRegressions.slice(0, 10)) {
    lines.push(`| ${row.id} | ${row.baselineScore} | ${row.candidateScore} | ${row.delta} | ${row.explainedByNewCap ? 'yes' : 'no'} |`);
  }
  lines.push('');
  lines.push('## Top Runtime Regressions');
  lines.push('');
  lines.push('| File | Baseline ms | Candidate ms | Delta ms |');
  lines.push('| --- | ---: | ---: | ---: |');
  for (const row of audit.topRuntimeRegressions.slice(0, 10)) {
    lines.push(`| ${row.id} | ${row.baselineMs.toFixed(0)} | ${row.candidateMs.toFixed(0)} | ${row.deltaMs.toFixed(0)} |`);
  }
  lines.push('');
  lines.push('## Tool Outcome Deltas');
  lines.push('');
  lines.push('| Tool/outcome | Baseline | Candidate | Delta |');
  lines.push('| --- | ---: | ---: | ---: |');
  for (const row of audit.toolOutcomeDeltas.slice(0, 30)) {
    lines.push(`| ${row.key} | ${row.baseline} | ${row.candidate} | ${row.delta >= 0 ? '+' : ''}${row.delta} |`);
  }
  lines.push('');
  if (audit.falsePositiveAppliedRows.length > 0) {
    lines.push('## False-Positive Applied Rows');
    lines.push('');
    lines.push('| File | Tool | Stage | Round | Reason |');
    lines.push('| --- | --- | ---: | ---: | --- |');
    for (const row of audit.falsePositiveAppliedRows) {
      lines.push(`| ${row.id} | ${row.toolName} | ${row.stage} | ${row.round} | ${row.reason} |`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

export async function writeStage41BenchmarkGateArtifacts(
  outDir: string,
  audit: Stage41BenchmarkGateAudit,
): Promise<void> {
  const base = resolve(outDir);
  await mkdir(base, { recursive: true });
  await writeFile(join(base, 'stage41-benchmark-gate.json'), JSON.stringify(audit, null, 2), 'utf8');
  await writeFile(join(base, 'stage41-benchmark-gate.md'), renderStage41BenchmarkGateMarkdown(audit), 'utf8');
}
