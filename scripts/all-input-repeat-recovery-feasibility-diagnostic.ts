#!/usr/bin/env tsx
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';

const DEFAULT_BASELINE = 'Output/goal-all-input-mean-2026-05-09-r1/r5-complete-baseline-report-2026-05-11-r1/baseline_report.json';
const DEFAULT_SEARCH_ROOT = 'Output/goal-all-input-mean-2026-05-09-r1';
const DEFAULT_OUT = 'Output/goal-all-input-mean-2026-05-09-r1/repeat-recovery-feasibility-r5-complete-2026-05-11-r1';
const TARGET_MEAN = 93;

export type RepeatRecoveryClass =
  | 'bounded_retry_candidate'
  | 'semantic_planning_candidate'
  | 'runtime_expensive_candidate'
  | 'already_above_target_polish'
  | 'parked_or_unsafe_candidate';

interface BaselineReport {
  rows?: BaselineRow[];
}

interface BaselineRow {
  file?: string;
  afterScore?: number;
  afterGrade?: string;
  durationMs?: number;
  falsePositiveApplied?: number;
}

export interface RepeatRecoveryCandidate {
  file: string;
  baselineScore: number;
  baselineGrade: string;
  candidateScore: number;
  candidateGrade: string;
  delta: number;
  candidateDurationMs: number | null;
  sourceRun: string;
  falsePositiveApplied: number;
  classification: RepeatRecoveryClass;
  rationale: string;
}

export interface RepeatRecoveryFeasibilityReport {
  generatedAt: string;
  baselineReport: string;
  searchRoot: string;
  summary: {
    fileCount: number;
    baselineMean: number;
    pointsNeededForMean93: number;
    candidateCount: number;
    boundedRetryCandidateCount: number;
    boundedRetryGain: number;
    projectedMeanWithBoundedRetry: number;
    allCandidateGain: number;
    projectedMeanWithAllSafeCandidates: number;
  };
  candidates: RepeatRecoveryCandidate[];
}

function parseArgs(argv: string[]): { baseline: string; searchRoot: string; out: string } {
  let baseline = DEFAULT_BASELINE;
  let searchRoot = DEFAULT_SEARCH_ROOT;
  let out = DEFAULT_OUT;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === '--baseline' && next) {
      baseline = next;
      i += 1;
    } else if (arg === '--search-root' && next) {
      searchRoot = next;
      i += 1;
    } else if (arg === '--out' && next) {
      out = next;
      i += 1;
    } else if (arg === '--help' || arg === '-h') {
      console.log([
        'Usage: pnpm exec tsx scripts/all-input-repeat-recovery-feasibility-diagnostic.ts [--baseline <baseline_report.json>] [--search-root <dir>] [--out <dir>]',
        '',
        `Defaults: --baseline ${DEFAULT_BASELINE} --search-root ${DEFAULT_SEARCH_ROOT} --out ${DEFAULT_OUT}`,
      ].join('\n'));
      process.exit(0);
    }
  }
  return { baseline, searchRoot, out };
}

function round(value: number, digits = 4): number {
  const m = 10 ** digits;
  return Math.round(value * m) / m;
}

function score(row: BaselineRow): number {
  return typeof row.afterScore === 'number' && Number.isFinite(row.afterScore) ? row.afterScore : 0;
}

function grade(row: BaselineRow): string {
  return typeof row.afterGrade === 'string' && row.afterGrade.length > 0 ? row.afterGrade : '?';
}

function isParkedFile(file: string): boolean {
  return file.includes('structure-4438') ||
    file.includes('structure-4076') ||
    file.includes('long-4683') ||
    file.includes('long-4516');
}

function classifyCandidate(input: {
  baseline: BaselineRow;
  candidate: BaselineRow;
  sourceRun: string;
  delta: number;
}): { classification: RepeatRecoveryClass; rationale: string } {
  const file = String(input.baseline.file ?? input.candidate.file ?? '');
  const candidateScore = score(input.candidate);
  const duration = input.candidate.durationMs ?? 0;
  if ((input.candidate.falsePositiveApplied ?? 0) > 0) {
    return {
      classification: 'parked_or_unsafe_candidate',
      rationale: 'Candidate has false-positive-applied evidence and cannot be used for honest recovery.',
    };
  }
  if (isParkedFile(file)) {
    return {
      classification: 'parked_or_unsafe_candidate',
      rationale: 'Known parked runtime/protected-drift row; do not use repeat recovery to hide unresolved debt.',
    };
  }
  if (/api-semantic|semantic/i.test(input.sourceRun)) {
    return {
      classification: 'semantic_planning_candidate',
      rationale: 'Useful source-reanalyzed semantic evidence, but not proof for deterministic bounded retry behavior.',
    };
  }
  if (score(input.baseline) >= TARGET_MEAN) {
    return {
      classification: 'already_above_target_polish',
      rationale: 'Candidate improves an already above-target row; useful for quality but not a mean-goal blocker.',
    };
  }
  if (duration >= 180_000) {
    return {
      classification: 'runtime_expensive_candidate',
      rationale: 'Candidate improves score but consumes at least 180s; needs a runtime policy before promotion.',
    };
  }
  if (candidateScore >= TARGET_MEAN && input.delta > 0) {
    return {
      classification: 'bounded_retry_candidate',
      rationale: 'Below-target baseline recovered to target with false_positive_applied=0 and bounded runtime in an existing current-engine run.',
    };
  }
  return {
    classification: 'parked_or_unsafe_candidate',
    rationale: 'Candidate does not reach the target score or lacks enough safe movement for a retry policy.',
  };
}

async function findReports(root: string): Promise<string[]> {
  const out: string[] = [];
  async function visit(dir: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        await visit(path);
      } else if (entry.isFile() && entry.name === 'baseline_report.json') {
        out.push(path);
      }
    }
  }
  await visit(root);
  return out.sort((a, b) => a.localeCompare(b));
}

async function readRows(reportPath: string): Promise<BaselineRow[]> {
  const parsed = JSON.parse(await readFile(reportPath, 'utf8')) as BaselineReport | BaselineRow[];
  return Array.isArray(parsed) ? parsed : parsed.rows ?? [];
}

export async function buildRepeatRecoveryFeasibilityReport(input: {
  baselineReport: string;
  searchRoot: string;
  generatedAt?: string;
}): Promise<RepeatRecoveryFeasibilityReport> {
  const baselineRows = await readRows(input.baselineReport);
  const byFile = new Map<string, BaselineRow>();
  for (const row of baselineRows) {
    if (row.file) byFile.set(basename(row.file), row);
  }

  const bestByFile = new Map<string, RepeatRecoveryCandidate>();
  for (const reportPath of await findReports(input.searchRoot)) {
    if (reportPath === input.baselineReport) continue;
    const sourceRun = reportPath.replace(/\/baseline_report\.json$/, '');
    for (const row of await readRows(reportPath)) {
      if (!row.file) continue;
      const key = basename(row.file);
      const baseline = byFile.get(key);
      if (!baseline) continue;
      const delta = score(row) - score(baseline);
      if (delta <= 0) continue;
      const decision = classifyCandidate({ baseline, candidate: row, sourceRun, delta });
      const candidate: RepeatRecoveryCandidate = {
        file: String(baseline.file ?? row.file),
        baselineScore: score(baseline),
        baselineGrade: grade(baseline),
        candidateScore: score(row),
        candidateGrade: grade(row),
        delta,
        candidateDurationMs: typeof row.durationMs === 'number' ? row.durationMs : null,
        sourceRun,
        falsePositiveApplied: row.falsePositiveApplied ?? 0,
        classification: decision.classification,
        rationale: decision.rationale,
      };
      const old = bestByFile.get(key);
      if (!old ||
        candidate.candidateScore > old.candidateScore ||
        (candidate.candidateScore === old.candidateScore && (candidate.candidateDurationMs ?? Infinity) < (old.candidateDurationMs ?? Infinity))) {
        bestByFile.set(key, candidate);
      }
    }
  }

  const candidates = [...bestByFile.values()].sort((a, b) =>
    b.delta - a.delta ||
    a.classification.localeCompare(b.classification) ||
    a.file.localeCompare(b.file));
  const baselineTotal = baselineRows.reduce((sum, row) => sum + score(row), 0);
  const boundedRetryGain = candidates
    .filter(row => row.classification === 'bounded_retry_candidate')
    .reduce((sum, row) => sum + row.delta, 0);
  const allCandidateGain = candidates
    .filter(row => row.falsePositiveApplied === 0 && row.classification !== 'parked_or_unsafe_candidate')
    .reduce((sum, row) => sum + row.delta, 0);
  return {
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    baselineReport: input.baselineReport,
    searchRoot: input.searchRoot,
    summary: {
      fileCount: baselineRows.length,
      baselineMean: round(baselineRows.length ? baselineTotal / baselineRows.length : 0),
      pointsNeededForMean93: round((TARGET_MEAN * baselineRows.length) - baselineTotal, 2),
      candidateCount: candidates.length,
      boundedRetryCandidateCount: candidates.filter(row => row.classification === 'bounded_retry_candidate').length,
      boundedRetryGain,
      projectedMeanWithBoundedRetry: round(baselineRows.length ? (baselineTotal + boundedRetryGain) / baselineRows.length : 0),
      allCandidateGain,
      projectedMeanWithAllSafeCandidates: round(baselineRows.length ? (baselineTotal + allCandidateGain) / baselineRows.length : 0),
    },
    candidates,
  };
}

function renderMarkdown(report: RepeatRecoveryFeasibilityReport): string {
  const lines: string[] = [];
  lines.push('# All-Input Repeat Recovery Feasibility');
  lines.push('');
  lines.push(`- Generated: ${report.generatedAt}`);
  lines.push(`- Baseline report: \`${report.baselineReport}\``);
  lines.push(`- Search root: \`${report.searchRoot}\``);
  lines.push(`- Baseline mean: \`${report.summary.baselineMean}\``);
  lines.push(`- Points needed for mean 93: \`${report.summary.pointsNeededForMean93}\``);
  lines.push(`- Bounded retry candidates: \`${report.summary.boundedRetryCandidateCount}\``);
  lines.push(`- Bounded retry gain: \`${report.summary.boundedRetryGain}\``);
  lines.push(`- Projected mean with bounded retry candidates: \`${report.summary.projectedMeanWithBoundedRetry}\``);
  lines.push(`- Projected mean with all non-parked safe candidates: \`${report.summary.projectedMeanWithAllSafeCandidates}\``);
  lines.push('');
  lines.push('## Candidates');
  lines.push('');
  lines.push('| Class | Delta | Baseline | Candidate | Runtime ms | File | Source | Rationale |');
  lines.push('| --- | ---: | --- | --- | ---: | --- | --- | --- |');
  for (const row of report.candidates.slice(0, 80)) {
    lines.push(`| \`${row.classification}\` | ${row.delta} | ${row.baselineScore}/${row.baselineGrade} | ${row.candidateScore}/${row.candidateGrade} | ${row.candidateDurationMs ?? ''} | \`${row.file}\` | \`${row.sourceRun}\` | ${row.rationale} |`);
  }
  return `${lines.join('\n')}\n`;
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  const args = parseArgs(argv);
  const report = await buildRepeatRecoveryFeasibilityReport({
    baselineReport: args.baseline,
    searchRoot: args.searchRoot,
  });
  await mkdir(args.out, { recursive: true });
  await writeFile(join(args.out, 'repeat-recovery-feasibility.json'), JSON.stringify(report, null, 2), 'utf8');
  await writeFile(join(args.out, 'repeat-recovery-feasibility.md'), renderMarkdown(report), 'utf8');
  console.log(JSON.stringify(report.summary, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}
