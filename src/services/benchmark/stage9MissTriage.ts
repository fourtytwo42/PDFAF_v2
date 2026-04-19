import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type {
  AnalyzeBenchmarkRow,
  ExperimentCorpusCohort,
  FrequencyRow,
  RemediateBenchmarkRow,
} from './experimentCorpus.js';
import { EXPERIMENT_CORPUS_COHORTS } from './experimentCorpus.js';
import type { Stage8FileDisposition, Stage8FinalGateAudit } from './stage8FinalGate.js';

// ─── Triage bucket types ─────────────────────────────────────────────────────

export type Stage9MissBucket =
  | 'fix_not_attempted'
  | 'fix_attempted_not_credited'
  | 'genuinely_unsafe_or_out_of_scope';

export type Stage9RepairabilityEstimate = 'cheap' | 'bounded' | 'unsafe';

// ─── Residual category snapshot ──────────────────────────────────────────────

export interface ResidualCategoryRow {
  key: string;
  score: number;
  severity: string | null;
  verificationLevel: string | null;
  manualReviewRequired: boolean;
}

// ─── Per-file triage record ───────────────────────────────────────────────────

export interface Stage9FileTriageRecord {
  id: string;
  file: string;
  cohort: ExperimentCorpusCohort;
  stage8Disposition: string;
  finalOutcomeStatus: string | null;
  finalScore: number;
  finalGrade: string | null;
  scoreGap: number;
  primaryMissBucket: Stage9MissBucket;
  secondaryMissBucket?: Stage9MissBucket;
  residualCategories: ResidualCategoryRow[];
  primaryResidualFailureFamily: string | null;
  toolsSkippedWithResidual: string[];
  toolsRunWithNoScoreEffect: string[];
  repairabilityEstimate: Stage9RepairabilityEstimate;
}

// ─── A-not-100 ranking row ────────────────────────────────────────────────────

export interface Stage9ANot100Row {
  id: string;
  file: string;
  cohort: ExperimentCorpusCohort;
  finalScore: number;
  scoreGap: number;
  primaryMissBucket: Stage9MissBucket;
  repairabilityEstimate: Stage9RepairabilityEstimate;
  topResidualCategory: string | null;
}

// ─── Full audit artifact ──────────────────────────────────────────────────────

export interface Stage9MissTriageAudit {
  generatedAt: string;
  stage8GateDir: string;
  runDir: string;
  summary: {
    totalFiles: number;
    non100Count: number;
    fixNotAttemptedCount: number;
    fixAttemptedNotCreditedCount: number;
    genuinelyUnsafeCount: number;
    aNot100Count: number;
    aNot100ConvertibleCount: number;
  };
  files: Stage9FileTriageRecord[];
  failureFamilyRanking: FrequencyRow[];
  aNot100Ranking: Stage9ANot100Row[];
  unsafeReasonsByCohort: Record<string, FrequencyRow[]>;
  residualFailuresByCohort: Record<string, FrequencyRow[]>;
  nextStageTargets: {
    stage10Candidates: string[];
    stage11Candidates: string[];
    stage12Candidates: string[];
  };
}

// ─── Input type ──────────────────────────────────────────────────────────────

export interface Stage9MissTriageInput {
  stage8GateDir: string;
  runDir: string;
  gate: Stage8FinalGateAudit;
  analyzeResults: AnalyzeBenchmarkRow[];
  remediateResults: RemediateBenchmarkRow[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function frequencyRows(values: string[]): Array<FrequencyRow> {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

function buildResidualCategories(row: RemediateBenchmarkRow): ResidualCategoryRow[] {
  const categories = row.reanalyzedCategories ?? row.afterCategories ?? [];
  return categories
    .filter(cat => cat.applicable && cat.score < 100)
    .map(cat => ({
      key: cat.key,
      score: cat.score,
      severity: (cat as { severity?: string }).severity ?? null,
      verificationLevel: (cat as { verificationLevel?: string }).verificationLevel ?? null,
      manualReviewRequired: (cat as { manualReviewRequired?: boolean }).manualReviewRequired ?? false,
    }))
    .sort((a, b) => a.score - b.score);
}

function toolsSkippedWithResidual(row: RemediateBenchmarkRow): string[] {
  const outcome = row.remediationOutcomeSummary;
  if (!outcome) return [];
  const result: string[] = [];
  for (const family of outcome.familySummaries) {
    if (family.residualSignals.length > 0 && family.skippedTools.length > 0) {
      for (const skipped of family.skippedTools) {
        result.push(skipped.toolName);
      }
    }
  }
  return [...new Set(result)];
}

function toolsRunWithNoScoreEffect(row: RemediateBenchmarkRow): string[] {
  const applied = row.appliedTools ?? [];
  return applied
    .filter(tool => tool.outcome === 'applied' && (tool.delta ?? 0) === 0)
    .map(tool => tool.toolName);
}

function classifyMissBucket(
  row: RemediateBenchmarkRow,
  gateDisposition: Stage8FileDisposition | undefined,
): Stage9MissBucket {
  const docStatus = row.remediationOutcomeSummary?.documentStatus;

  // Explicitly unsafe at the document level
  if (docStatus === 'unsafe_to_autofix') {
    return 'genuinely_unsafe_or_out_of_scope';
  }

  // Stage 8 gate also flagged as unsafe
  if (gateDisposition?.finalOutcomeStatus === 'unsafe_to_autofix') {
    return 'genuinely_unsafe_or_out_of_scope';
  }

  // Any family has skipped tools with residual signals still present →
  // a fix exists (or partially exists) but was gated by a precondition
  const skippedWithResidual = toolsSkippedWithResidual(row);
  if (skippedWithResidual.length > 0) {
    return 'fix_not_attempted';
  }

  // Engine ran but didn't produce score movement (verification gap)
  return 'fix_attempted_not_credited';
}

function estimateRepairability(
  bucket: Stage9MissBucket,
  scoreGap: number,
): Stage9RepairabilityEstimate {
  if (bucket === 'genuinely_unsafe_or_out_of_scope') return 'unsafe';
  if (scoreGap <= 15) return 'cheap';
  return 'bounded';
}

function primaryResidualFailureFamily(row: RemediateBenchmarkRow): string | null {
  const profile = row.reanalyzedFailureProfile ?? row.afterFailureProfile;
  return profile?.primaryFailureFamily ?? null;
}

function unsafeResidualSignalsForRow(row: RemediateBenchmarkRow): string[] {
  const outcome = row.remediationOutcomeSummary;
  if (!outcome) return [];
  const signals: string[] = [];
  for (const family of outcome.familySummaries) {
    if (family.status === 'unsafe_to_autofix') {
      signals.push(...family.residualSignals);
    }
  }
  return signals;
}

// ─── Build audit ─────────────────────────────────────────────────────────────

export function buildStage9MissTriageAudit(input: Stage9MissTriageInput): Stage9MissTriageAudit {
  const gateFilesByID = new Map(input.gate.files.map(f => [f.id, f]));
  const analyzeByID = new Map(input.analyzeResults.map(row => [row.id, row]));

  // Build per-file triage records for all non-100 files
  const non100Rows = input.remediateResults.filter(row => {
    if (row.error) return false;
    const finalScore = row.reanalyzedScore ?? row.afterScore ?? 0;
    return finalScore < 100;
  });

  const files: Stage9FileTriageRecord[] = non100Rows.map(row => {
    const finalScore = row.reanalyzedScore ?? row.afterScore ?? 0;
    const finalGrade = row.reanalyzedGrade ?? row.afterGrade;
    const scoreGap = 100 - finalScore;
    const gateDisposition = gateFilesByID.get(row.id);
    const bucket = classifyMissBucket(row, gateDisposition);
    const repairability = estimateRepairability(bucket, scoreGap);
    const residualCategories = buildResidualCategories(row);
    const skippedWithResidual = toolsSkippedWithResidual(row);
    const runWithNoEffect = toolsRunWithNoScoreEffect(row);

    return {
      id: row.id,
      file: row.file,
      cohort: row.cohort,
      stage8Disposition: gateDisposition?.disposition ?? 'unknown',
      finalOutcomeStatus: row.remediationOutcomeSummary?.documentStatus ?? null,
      finalScore,
      finalGrade,
      scoreGap,
      primaryMissBucket: bucket,
      residualCategories,
      primaryResidualFailureFamily: primaryResidualFailureFamily(row),
      toolsSkippedWithResidual: skippedWithResidual,
      toolsRunWithNoScoreEffect: runWithNoEffect,
      repairabilityEstimate: repairability,
    };
  });

  // Failure family ranking across all non-100 files
  const allFailureFamilies = files
    .map(f => f.primaryResidualFailureFamily)
    .filter((v): v is string => v !== null);
  const failureFamilyRanking = frequencyRows(allFailureFamilies);

  // A-not-100 ranking (grade A files, sorted by score gap ascending)
  const aNot100Files = files.filter(f => f.finalGrade === 'A');
  const aNot100Ranking: Stage9ANot100Row[] = aNot100Files
    .sort((a, b) => a.scoreGap - b.scoreGap || a.file.localeCompare(b.file))
    .map(f => ({
      id: f.id,
      file: f.file,
      cohort: f.cohort,
      finalScore: f.finalScore,
      scoreGap: f.scoreGap,
      primaryMissBucket: f.primaryMissBucket,
      repairabilityEstimate: f.repairabilityEstimate,
      topResidualCategory: f.residualCategories[0]?.key ?? null,
    }));

  // unsafe reasons by cohort
  const unsafeReasonsByCohort: Record<string, FrequencyRow[]> = {};
  for (const cohort of EXPERIMENT_CORPUS_COHORTS) {
    const cohortUnsafeFiles = files.filter(
      f => f.cohort === cohort && f.primaryMissBucket === 'genuinely_unsafe_or_out_of_scope',
    );
    if (cohortUnsafeFiles.length === 0) continue;
    const reasons: string[] = [];
    for (const f of cohortUnsafeFiles) {
      const row = input.remediateResults.find(r => r.id === f.id);
      if (row) reasons.push(...unsafeResidualSignalsForRow(row));
    }
    // Fall back to failure family if no residual signals
    if (reasons.length === 0) {
      for (const f of cohortUnsafeFiles) {
        if (f.primaryResidualFailureFamily) reasons.push(f.primaryResidualFailureFamily);
      }
    }
    unsafeReasonsByCohort[cohort] = frequencyRows(reasons);
  }

  // Residual failures by cohort (category key counts for non-100 files)
  const residualFailuresByCohort: Record<string, FrequencyRow[]> = {};
  for (const cohort of EXPERIMENT_CORPUS_COHORTS) {
    const cohortFiles = files.filter(f => f.cohort === cohort);
    if (cohortFiles.length === 0) continue;
    const categoryKeys = cohortFiles.flatMap(f => f.residualCategories.map(c => c.key));
    residualFailuresByCohort[cohort] = frequencyRows(categoryKeys);
  }

  // Summary counts
  const fixNotAttemptedCount = files.filter(f => f.primaryMissBucket === 'fix_not_attempted').length;
  const fixAttemptedNotCreditedCount = files.filter(f => f.primaryMissBucket === 'fix_attempted_not_credited').length;
  const genuinelyUnsafeCount = files.filter(f => f.primaryMissBucket === 'genuinely_unsafe_or_out_of_scope').length;
  const aNot100ConvertibleCount = files.filter(f => f.repairabilityEstimate === 'cheap').length;

  // Next stage target file IDs
  const stage10Candidates = files
    .filter(f => f.repairabilityEstimate === 'cheap' && f.primaryMissBucket !== 'genuinely_unsafe_or_out_of_scope')
    .map(f => f.id);

  const stage11Candidates = files
    .filter(f => f.primaryMissBucket === 'genuinely_unsafe_or_out_of_scope' && f.cohort === '30-structure-reading-order')
    .map(f => f.id);

  const stage12Candidates = files
    .filter(f => f.primaryMissBucket === 'genuinely_unsafe_or_out_of_scope' && f.cohort === '40-font-extractability')
    .map(f => f.id);

  void analyzeByID; // available for future use by callers

  return {
    generatedAt: new Date().toISOString(),
    stage8GateDir: input.stage8GateDir,
    runDir: input.runDir,
    summary: {
      totalFiles: input.remediateResults.filter(r => !r.error).length,
      non100Count: files.length,
      fixNotAttemptedCount,
      fixAttemptedNotCreditedCount,
      genuinelyUnsafeCount,
      aNot100Count: aNot100Files.length,
      aNot100ConvertibleCount,
    },
    files,
    failureFamilyRanking,
    aNot100Ranking,
    unsafeReasonsByCohort,
    residualFailuresByCohort,
    nextStageTargets: {
      stage10Candidates,
      stage11Candidates,
      stage12Candidates,
    },
  };
}

// ─── Markdown renderer ────────────────────────────────────────────────────────

function markdownFrequency(rows: Array<FrequencyRow>): string {
  return rows.length ? rows.map(row => `${row.key} (${row.count})`).join('; ') : 'n/a';
}

export function renderStage9MissTriageMarkdown(audit: Stage9MissTriageAudit): string {
  const lines: string[] = [];

  lines.push('# Stage 9 miss triage');
  lines.push('');
  lines.push(`- Generated: ${audit.generatedAt}`);
  lines.push(`- Stage 8 gate: \`${audit.stage8GateDir}\``);
  lines.push(`- Run: \`${audit.runDir}\``);
  lines.push('');

  lines.push('## Summary');
  lines.push('');
  lines.push(`- Total files: ${audit.summary.totalFiles} | Non-100: ${audit.summary.non100Count}`);
  lines.push(`- fix_not_attempted: ${audit.summary.fixNotAttemptedCount} | fix_attempted_not_credited: ${audit.summary.fixAttemptedNotCreditedCount} | genuinely_unsafe: ${audit.summary.genuinelyUnsafeCount}`);
  lines.push(`- A-not-100 count: ${audit.summary.aNot100Count} | Convertible (cheap, score gap ≤ 15): ${audit.summary.aNot100ConvertibleCount}`);
  lines.push('');

  lines.push('## Failure Family Ranking (all non-100 files)');
  lines.push('');
  if (audit.failureFamilyRanking.length === 0) {
    lines.push('- n/a');
  } else {
    lines.push('| Rank | Family | Count |');
    lines.push('| ---: | --- | ---: |');
    audit.failureFamilyRanking.forEach((row, i) => {
      lines.push(`| ${i + 1} | ${row.key} | ${row.count} |`);
    });
  }
  lines.push('');

  lines.push('## A-not-100 Files (by score gap ascending)');
  lines.push('');
  if (audit.aNot100Ranking.length === 0) {
    lines.push('- none');
  } else {
    lines.push('| File | Cohort | Score | Gap | Bucket | Top Residual | Repairability |');
    lines.push('| --- | --- | ---: | ---: | --- | --- | --- |');
    for (const row of audit.aNot100Ranking) {
      const shortFile = row.file.split('/').pop() ?? row.file;
      lines.push(`| \`${shortFile}\` | ${row.cohort} | ${row.finalScore} | ${row.scoreGap} | ${row.primaryMissBucket} | ${row.topResidualCategory ?? 'n/a'} | ${row.repairabilityEstimate} |`);
    }
  }
  lines.push('');

  lines.push('## Residual Failures by Cohort (after Stage 8 remediation)');
  lines.push('');
  for (const cohort of EXPERIMENT_CORPUS_COHORTS) {
    const rows = audit.residualFailuresByCohort[cohort] ?? [];
    if (rows.length === 0) continue;
    lines.push(`### ${cohort}`);
    lines.push('');
    lines.push(markdownFrequency(rows));
    lines.push('');
  }

  lines.push('## Unsafe-to-Autofix Reasons by Cohort');
  lines.push('');
  const unsafeCohorts = EXPERIMENT_CORPUS_COHORTS.filter(c => (audit.unsafeReasonsByCohort[c] ?? []).length > 0);
  if (unsafeCohorts.length === 0) {
    lines.push('- none');
    lines.push('');
  } else {
    for (const cohort of unsafeCohorts) {
      const rows = audit.unsafeReasonsByCohort[cohort] ?? [];
      lines.push(`### ${cohort}`);
      lines.push('');
      lines.push(markdownFrequency(rows));
      lines.push('');
    }
  }

  lines.push('## Next Stage Targets');
  lines.push('');
  lines.push(`### Stage 10 candidates — A-not-100, cheap (${audit.nextStageTargets.stage10Candidates.length} files)`);
  lines.push('');
  if (audit.nextStageTargets.stage10Candidates.length === 0) {
    lines.push('- none');
  } else {
    for (const id of audit.nextStageTargets.stage10Candidates) {
      const f = audit.files.find(file => file.id === id);
      lines.push(`- \`${id}\` (${f?.cohort ?? '?'}) — score ${f?.finalScore ?? '?'}, gap ${f?.scoreGap ?? '?'}, top residual: ${f?.residualCategories[0]?.key ?? 'n/a'}`);
    }
  }
  lines.push('');

  lines.push(`### Stage 11 candidates — structure hard cases (${audit.nextStageTargets.stage11Candidates.length} files)`);
  lines.push('');
  if (audit.nextStageTargets.stage11Candidates.length === 0) {
    lines.push('- none');
  } else {
    for (const id of audit.nextStageTargets.stage11Candidates) {
      const f = audit.files.find(file => file.id === id);
      lines.push(`- \`${id}\` (${f?.cohort ?? '?'}) — score ${f?.finalScore ?? '?'}, primary family: ${f?.primaryResidualFailureFamily ?? 'n/a'}`);
    }
  }
  lines.push('');

  lines.push(`### Stage 12 candidates — font/extractability hard cases (${audit.nextStageTargets.stage12Candidates.length} files)`);
  lines.push('');
  if (audit.nextStageTargets.stage12Candidates.length === 0) {
    lines.push('- none');
  } else {
    for (const id of audit.nextStageTargets.stage12Candidates) {
      const f = audit.files.find(file => file.id === id);
      lines.push(`- \`${id}\` (${f?.cohort ?? '?'}) — score ${f?.finalScore ?? '?'}, primary family: ${f?.primaryResidualFailureFamily ?? 'n/a'}`);
    }
  }
  lines.push('');

  lines.push('## Per-File Triage Detail');
  lines.push('');
  lines.push('| File | Cohort | Score | Gap | Bucket | Outcome | Repairability | Tools skipped w/residual | Top residual category |');
  lines.push('| --- | --- | ---: | ---: | --- | --- | --- | --- | --- |');
  for (const f of audit.files.sort((a, b) => a.scoreGap - b.scoreGap || a.file.localeCompare(b.file))) {
    const shortFile = f.file.split('/').pop() ?? f.file;
    lines.push(
      `| \`${shortFile}\` | ${f.cohort} | ${f.finalScore} | ${f.scoreGap} | ${f.primaryMissBucket} | ${f.finalOutcomeStatus ?? 'n/a'} | ${f.repairabilityEstimate} | ${f.toolsSkippedWithResidual.join(', ') || 'none'} | ${f.residualCategories[0]?.key ?? 'n/a'} |`,
    );
  }

  return lines.join('\n');
}

// ─── Write artifacts ──────────────────────────────────────────────────────────

export async function writeStage9MissTriageArtifacts(outDir: string, audit: Stage9MissTriageAudit): Promise<void> {
  const base = resolve(outDir);
  await mkdir(base, { recursive: true });
  await writeFile(join(base, 'stage9-miss-triage.json'), JSON.stringify(audit, null, 2), 'utf8');
  await writeFile(join(base, 'stage9-miss-triage.md'), renderStage9MissTriageMarkdown(audit), 'utf8');
}
