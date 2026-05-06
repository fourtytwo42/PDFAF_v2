#!/usr/bin/env tsx
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { loadBenchmarkRowsFromRunDir } from '../src/services/benchmark/stage1Acceptance.js';
import type { RemediateBenchmarkRow } from '../src/services/benchmark/experimentCorpus.js';
import type { CategoryKey, ScoreCapApplied } from '../src/types.js';

const DEFAULT_OUT = 'Output/experiment-corpus-baseline/pac-promotion-stage1-validation';
const PAC_CAP_REASON_PREFIX = 'PAC rule failure: ';
const PAC_GATE_REASON_RE = /pac_rule_regressed\(([^)]+)\)/;
const STAGE1_PROMOTED_SCORING_RULES = new Set([
  'pdfua.font.to_unicode_cmap_valid',
  'pdfua.font.to_unicode_cmap_present',
  'pdfua.table.header_association_present',
]);
const STAGE1_PROMOTED_GATE_RULES = new Set([
  'pdfua.table.header_association_present',
  'pdfua.structure.child_roles_valid',
  'pdfua.parent_tree.mcid_entries_valid',
  'pdfua.structure.rolemap_valid',
]);

export interface PacPromotionValidationInput {
  beforeRunDir: string;
  afterRunDir: string;
  beforeRows: RemediateBenchmarkRow[];
  afterRows: RemediateBenchmarkRow[];
  gateAudit?: Stage41GateAuditLike | null;
  generatedAt?: string;
}

export interface Stage41GateAuditLike {
  passed?: boolean;
  gates?: Array<{
    key: string;
    passed: boolean;
    severity?: string;
    baselineValue?: number | string | null;
    candidateValue?: number | string | null;
    threshold?: number | string;
    detail?: string;
  }>;
  summary?: {
    baselineP95WallMs?: number | null;
    candidateP95WallMs?: number | null;
    baselineAttemptCount?: number;
    candidateAttemptCount?: number;
    falsePositiveAppliedCount?: number;
  };
}

export interface NewPacScoreCapRow {
  fileId: string;
  file: string;
  category: CategoryKey;
  ruleId: string;
  cap: number;
  rawScore: number;
  finalScore: number;
  phase: 'after' | 'reanalyzed';
  beforeHadCap: boolean;
  stage1Promoted: boolean;
}

export interface PacCapFrequencyRow {
  ruleId: string;
  category: CategoryKey;
  count: number;
  files: string[];
}

export interface PacGateRejectionRow {
  fileId: string;
  file: string;
  ruleId: string;
  reason: string;
  toolName: string;
  stage: number;
  round: number;
  outcome: string;
  scoreBefore: number;
  scoreAfter: number;
  details?: string;
  stage1Promoted: boolean;
}

export interface ScoreDropRow {
  fileId: string;
  file: string;
  beforeScore: number | null;
  afterScore: number | null;
  beforeGrade: string | null;
  afterGrade: string | null;
  delta: number;
  classification: 'cap_attributable' | 'pac_gate_path' | 'remediation_or_analyzer_path';
  newPacRules: string[];
}

export interface PacGateStableRow {
  fileId: string;
  file: string;
  beforeScore: number | null;
  afterScore: number | null;
  delta: number | null;
  rejectedRules: string[];
}

export interface PacPromotionStage1ValidationSummary {
  beforeFileCount: number;
  afterFileCount: number;
  newPacScoreCapCount: number;
  promotedPacScoreCapCount: number;
  pacGateRejectionCount: number;
  promotedPacGateRejectionCount: number;
  scoreDropCount: number;
  capAttributableScoreDropCount: number;
  pacGateStableOrImprovedCount: number;
  missingInBeforeCount: number;
  missingInAfterCount: number;
  gatePassed: boolean | null;
  failedGateKeys: string[];
  candidateP95WallMs: number | null;
  candidateAttemptCount: number | null;
  falsePositiveAppliedCount: number | null;
  recommendation: 'keep_as_is' | 'keep_with_caution' | 'narrow_or_revert';
}

export interface PacPromotionStage1ValidationReport {
  generatedAt: string;
  beforeRunDir: string;
  afterRunDir: string;
  summary: PacPromotionStage1ValidationSummary;
  newPacScoreCaps: NewPacScoreCapRow[];
  capFrequency: PacCapFrequencyRow[];
  pacGateRejections: PacGateRejectionRow[];
  pacGateStableOrImprovedRows: PacGateStableRow[];
  scoreDrops: ScoreDropRow[];
  missingInBefore: string[];
  missingInAfter: string[];
  failedGates: NonNullable<Stage41GateAuditLike['gates']>;
}

function usage(): string {
  return [
    'Usage: pnpm exec tsx scripts/pac-promotion-stage1-validation.ts --before <run-dir> --after <run-dir> [--gate <gate-json-or-dir>] [--out <dir>]',
  ].join('\n');
}

function scoreFor(row?: RemediateBenchmarkRow): number | null {
  if (!row) return null;
  return row.reanalyzedScore ?? row.afterScore ?? null;
}

function gradeFor(row?: RemediateBenchmarkRow): string | null {
  if (!row) return null;
  return row.reanalyzedGrade ?? row.afterGrade ?? null;
}

function effectiveCaps(row: RemediateBenchmarkRow): { phase: 'after' | 'reanalyzed'; caps: ScoreCapApplied[] } {
  if (row.reanalyzedScoreCapsApplied?.length) {
    return { phase: 'reanalyzed', caps: row.reanalyzedScoreCapsApplied };
  }
  return { phase: 'after', caps: row.afterScoreCapsApplied ?? [] };
}

function pacRuleIdFromCap(cap: ScoreCapApplied): string | null {
  return cap.reason.startsWith(PAC_CAP_REASON_PREFIX)
    ? cap.reason.slice(PAC_CAP_REASON_PREFIX.length).trim()
    : null;
}

function capKey(cap: ScoreCapApplied): string {
  return `${cap.category}:${cap.cap}:${cap.reason}`;
}

function mapRows(rows: RemediateBenchmarkRow[]): Map<string, RemediateBenchmarkRow> {
  return new Map(rows.map(row => [row.id, row]));
}

function sortedUnique(values: Iterable<string>): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

function extractPacGateReason(value: unknown): { ruleId: string; reason: string } | null {
  if (typeof value !== 'string') return null;
  const match = value.match(PAC_GATE_REASON_RE);
  if (!match) return null;
  const ruleId = match[1] ?? '';
  return ruleId ? { ruleId, reason: `pac_rule_regressed(${ruleId})` } : null;
}

function stringifyToolDetails(details: unknown): string | undefined {
  if (typeof details === 'string') return details;
  if (details == null) return undefined;
  try {
    return JSON.stringify(details);
  } catch {
    return String(details);
  }
}

function pacGateReasonFromTool(tool: RemediateBenchmarkRow['appliedTools'][number]): { ruleId: string; reason: string } | null {
  const direct = extractPacGateReason(tool.details);
  if (direct) return direct;
  if (typeof tool.details === 'string') {
    try {
      const parsed = JSON.parse(tool.details) as Record<string, unknown>;
      for (const value of Object.values(parsed)) {
        const nested = extractPacGateReason(value);
        if (nested) return nested;
      }
    } catch {
      // Legacy free-form details are handled by the regex above.
    }
  } else if (tool.details && typeof tool.details === 'object') {
    for (const value of Object.values(tool.details as Record<string, unknown>)) {
      const nested = extractPacGateReason(value);
      if (nested) return nested;
    }
  }
  const outcome = extractPacGateReason(tool.outcome);
  if (outcome) return outcome;
  return null;
}

function pacGateRowsFor(row: RemediateBenchmarkRow): PacGateRejectionRow[] {
  return (row.appliedTools ?? []).flatMap(tool => {
    const reason = pacGateReasonFromTool(tool);
    if (!reason) return [];
    return [{
      fileId: row.id,
      file: row.file,
      ruleId: reason.ruleId,
      reason: reason.reason,
      toolName: tool.toolName,
      stage: tool.stage,
      round: tool.round,
      outcome: tool.outcome,
      scoreBefore: tool.scoreBefore,
      scoreAfter: tool.scoreAfter,
      ...(stringifyToolDetails(tool.details) ? { details: stringifyToolDetails(tool.details) } : {}),
      stage1Promoted: STAGE1_PROMOTED_GATE_RULES.has(reason.ruleId),
    }];
  });
}

function gateKey(row: PacGateRejectionRow): string {
  return `${row.ruleId}:${row.toolName}`;
}

function buildCapFrequency(rows: NewPacScoreCapRow[]): PacCapFrequencyRow[] {
  const grouped = new Map<string, PacCapFrequencyRow>();
  for (const row of rows) {
    const key = `${row.ruleId}:${row.category}`;
    const current = grouped.get(key) ?? {
      ruleId: row.ruleId,
      category: row.category,
      count: 0,
      files: [],
    };
    current.count += 1;
    current.files.push(row.fileId);
    grouped.set(key, current);
  }
  return [...grouped.values()]
    .map(row => ({ ...row, files: sortedUnique(row.files) }))
    .sort((a, b) => b.count - a.count || a.ruleId.localeCompare(b.ruleId) || a.category.localeCompare(b.category));
}

function classifyScoreDrop(input: {
  newCaps: NewPacScoreCapRow[];
  gateRejections: PacGateRejectionRow[];
}): ScoreDropRow['classification'] {
  if (input.newCaps.length > 0) return 'cap_attributable';
  if (input.gateRejections.length > 0) return 'pac_gate_path';
  return 'remediation_or_analyzer_path';
}

function recommendationFor(summary: Omit<PacPromotionStage1ValidationSummary, 'recommendation'>): PacPromotionStage1ValidationSummary['recommendation'] {
  if (summary.falsePositiveAppliedCount != null && summary.falsePositiveAppliedCount > 0) return 'narrow_or_revert';
  if (
    summary.gatePassed === false &&
    summary.failedGateKeys.some(key =>
      key === 'score_mean_floor' ||
      key === 'score_median_floor' ||
      key === 'f_grade_count' ||
      key === 'protected_file_regressions'
    )
  ) {
    return 'narrow_or_revert';
  }
  if (summary.gatePassed === false && summary.failedGateKeys.some(key => key !== 'runtime_p95_wall')) {
    return 'keep_with_caution';
  }
  if (summary.scoreDropCount > summary.capAttributableScoreDropCount) return 'keep_with_caution';
  return 'keep_as_is';
}

export function buildPacPromotionStage1Validation(
  input: PacPromotionValidationInput,
): PacPromotionStage1ValidationReport {
  const beforeById = mapRows(input.beforeRows);
  const afterById = mapRows(input.afterRows);
  const afterIds = sortedUnique(afterById.keys());
  const beforeIds = sortedUnique(beforeById.keys());
  const missingInBefore = afterIds.filter(id => !beforeById.has(id));
  const missingInAfter = beforeIds.filter(id => !afterById.has(id));

  const newPacScoreCaps: NewPacScoreCapRow[] = [];
  const pacGateRejections: PacGateRejectionRow[] = [];
  const scoreDrops: ScoreDropRow[] = [];
  const pacGateStableOrImprovedRows: PacGateStableRow[] = [];

  for (const id of afterIds) {
    const after = afterById.get(id);
    if (!after) continue;
    const before = beforeById.get(id);
    const beforeCapKeys = new Set(before ? effectiveCaps(before).caps.map(capKey) : []);
    const { phase, caps } = effectiveCaps(after);
    const rowNewCaps = caps.flatMap(cap => {
      const ruleId = pacRuleIdFromCap(cap);
      if (!ruleId) return [];
      const beforeHadCap = beforeCapKeys.has(capKey(cap));
      if (beforeHadCap) return [];
      return [{
        fileId: after.id,
        file: after.file,
        category: cap.category,
        ruleId,
        cap: cap.cap,
        rawScore: cap.rawScore,
        finalScore: cap.finalScore,
        phase,
        beforeHadCap,
        stage1Promoted: STAGE1_PROMOTED_SCORING_RULES.has(ruleId),
      }];
    });
    newPacScoreCaps.push(...rowNewCaps);

    const beforeGateKeys = new Set(before ? pacGateRowsFor(before).map(gateKey) : []);
    const rowGateRejections = pacGateRowsFor(after).filter(row => !beforeGateKeys.has(gateKey(row)));
    pacGateRejections.push(...rowGateRejections);

    const beforeScore = scoreFor(before);
    const afterScore = scoreFor(after);
    if (beforeScore != null && afterScore != null) {
      const delta = afterScore - beforeScore;
      if (delta < 0) {
        scoreDrops.push({
          fileId: after.id,
          file: after.file,
          beforeScore,
          afterScore,
          beforeGrade: gradeFor(before),
          afterGrade: gradeFor(after),
          delta,
          classification: classifyScoreDrop({ newCaps: rowNewCaps, gateRejections: rowGateRejections }),
          newPacRules: sortedUnique(rowNewCaps.map(cap => cap.ruleId)),
        });
      }
      if (rowGateRejections.length > 0 && delta >= 0) {
        pacGateStableOrImprovedRows.push({
          fileId: after.id,
          file: after.file,
          beforeScore,
          afterScore,
          delta,
          rejectedRules: sortedUnique(rowGateRejections.map(row => row.ruleId)),
        });
      }
    } else if (rowGateRejections.length > 0) {
      pacGateStableOrImprovedRows.push({
        fileId: after.id,
        file: after.file,
        beforeScore,
        afterScore,
        delta: null,
        rejectedRules: sortedUnique(rowGateRejections.map(row => row.ruleId)),
      });
    }
  }

  newPacScoreCaps.sort(
    (a, b) =>
      a.ruleId.localeCompare(b.ruleId) ||
      a.category.localeCompare(b.category) ||
      a.fileId.localeCompare(b.fileId),
  );
  pacGateRejections.sort(
    (a, b) =>
      a.ruleId.localeCompare(b.ruleId) ||
      a.fileId.localeCompare(b.fileId) ||
      a.toolName.localeCompare(b.toolName) ||
      a.stage - b.stage ||
      a.round - b.round,
  );
  scoreDrops.sort(
    (a, b) =>
      a.delta - b.delta ||
      a.classification.localeCompare(b.classification) ||
      a.fileId.localeCompare(b.fileId),
  );
  pacGateStableOrImprovedRows.sort((a, b) => a.fileId.localeCompare(b.fileId));

  const failedGates = (input.gateAudit?.gates ?? [])
    .filter(gate => gate.severity === 'hard' && !gate.passed)
    .sort((a, b) => a.key.localeCompare(b.key));
  const summaryWithoutRecommendation = {
    beforeFileCount: input.beforeRows.length,
    afterFileCount: input.afterRows.length,
    newPacScoreCapCount: newPacScoreCaps.length,
    promotedPacScoreCapCount: newPacScoreCaps.filter(row => row.stage1Promoted).length,
    pacGateRejectionCount: pacGateRejections.length,
    promotedPacGateRejectionCount: pacGateRejections.filter(row => row.stage1Promoted).length,
    scoreDropCount: scoreDrops.length,
    capAttributableScoreDropCount: scoreDrops.filter(row => row.classification === 'cap_attributable').length,
    pacGateStableOrImprovedCount: pacGateStableOrImprovedRows.length,
    missingInBeforeCount: missingInBefore.length,
    missingInAfterCount: missingInAfter.length,
    gatePassed: input.gateAudit?.passed ?? null,
    failedGateKeys: failedGates.map(gate => gate.key),
    candidateP95WallMs: input.gateAudit?.summary?.candidateP95WallMs ?? null,
    candidateAttemptCount: input.gateAudit?.summary?.candidateAttemptCount ?? null,
    falsePositiveAppliedCount: input.gateAudit?.summary?.falsePositiveAppliedCount ?? null,
  };

  return {
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    beforeRunDir: input.beforeRunDir,
    afterRunDir: input.afterRunDir,
    summary: {
      ...summaryWithoutRecommendation,
      recommendation: recommendationFor(summaryWithoutRecommendation),
    },
    newPacScoreCaps,
    capFrequency: buildCapFrequency(newPacScoreCaps),
    pacGateRejections,
    pacGateStableOrImprovedRows,
    scoreDrops,
    missingInBefore,
    missingInAfter,
    failedGates,
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

export function renderPacPromotionStage1ValidationMarkdown(report: PacPromotionStage1ValidationReport): string {
  const lines: string[] = [];
  lines.push('# PAC Promotion Stage 1 Validation');
  lines.push('');
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push(`Before run: \`${report.beforeRunDir}\``);
  lines.push(`After run: \`${report.afterRunDir}\``);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(`- Recommendation: \`${report.summary.recommendation}\``);
  lines.push(`- Files compared: ${report.summary.beforeFileCount} before / ${report.summary.afterFileCount} after`);
  lines.push(`- New PAC score caps: ${report.summary.newPacScoreCapCount}`);
  lines.push(`- Stage 1 promoted PAC score caps: ${report.summary.promotedPacScoreCapCount}`);
  lines.push(`- New PAC gate rejections: ${report.summary.pacGateRejectionCount}`);
  lines.push(`- Stage 1 promoted PAC gate rejections: ${report.summary.promotedPacGateRejectionCount}`);
  lines.push(`- Score drops: ${report.summary.scoreDropCount} (${report.summary.capAttributableScoreDropCount} cap-attributable)`);
  lines.push(`- PAC gate blocked but final score stable/improved: ${report.summary.pacGateStableOrImprovedCount}`);
  lines.push(`- Stage 41 gate: ${report.summary.gatePassed == null ? 'not supplied' : report.summary.gatePassed ? 'PASS' : 'FAIL'}`);
  lines.push(`- Candidate p95 wall ms: ${report.summary.candidateP95WallMs ?? 'n/a'}`);
  lines.push(`- Candidate attempts: ${report.summary.candidateAttemptCount ?? 'n/a'}`);
  lines.push(`- False-positive applied: ${report.summary.falsePositiveAppliedCount ?? 'n/a'}`);
  lines.push('');
  lines.push('## New PAC Score Caps');
  lines.push('');
  lines.push(...mdTable(
    ['Rule', 'Category', 'Count', 'Files'],
    report.capFrequency.map(row => [row.ruleId, row.category, String(row.count), row.files.slice(0, 12).join(', ')]),
  ));
  lines.push('');
  lines.push('## PAC Gate Rejections');
  lines.push('');
  lines.push(...mdTable(
    ['Rule', 'File', 'Tool', 'Stage', 'Outcome'],
    report.pacGateRejections.slice(0, 40).map(row => [
      row.ruleId,
      row.fileId,
      row.toolName,
      String(row.stage),
      row.outcome,
    ]),
  ));
  lines.push('');
  lines.push('## Score Drops');
  lines.push('');
  lines.push(...mdTable(
    ['File', 'Before', 'After', 'Delta', 'Classification', 'PAC rules'],
    report.scoreDrops.slice(0, 40).map(row => [
      row.fileId,
      `${row.beforeScore ?? 'n/a'} ${row.beforeGrade ?? ''}`.trim(),
      `${row.afterScore ?? 'n/a'} ${row.afterGrade ?? ''}`.trim(),
      String(row.delta),
      row.classification,
      row.newPacRules.join(', ') || 'none',
    ]),
  ));
  lines.push('');
  lines.push('## Failed Stage 41 Gates');
  lines.push('');
  lines.push(...mdTable(
    ['Gate', 'Baseline', 'Candidate', 'Threshold', 'Detail'],
    report.failedGates.map(gate => [
      gate.key,
      String(gate.baselineValue ?? 'n/a'),
      String(gate.candidateValue ?? 'n/a'),
      String(gate.threshold ?? 'n/a'),
      String(gate.detail ?? ''),
    ]),
  ));
  lines.push('');
  lines.push('## Missing Rows');
  lines.push('');
  lines.push(`- Missing in before: ${report.missingInBefore.join(', ') || 'none'}`);
  lines.push(`- Missing in after: ${report.missingInAfter.join(', ') || 'none'}`);
  lines.push('');
  return lines.join('\n');
}

async function readGateAudit(path: string | undefined): Promise<Stage41GateAuditLike | null> {
  if (!path) return null;
  const resolved = resolve(path);
  const jsonPath = resolved.endsWith('.json') ? resolved : join(resolved, 'stage41-benchmark-gate.json');
  return JSON.parse(await readFile(jsonPath, 'utf8')) as Stage41GateAuditLike;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  let before = '';
  let after = '';
  let gate = '';
  let out = DEFAULT_OUT;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--before') before = args[++index] ?? '';
    else if (arg === '--after') after = args[++index] ?? '';
    else if (arg === '--gate') gate = args[++index] ?? '';
    else if (arg === '--out') out = args[++index] ?? DEFAULT_OUT;
    else throw new Error(`Unknown argument: ${arg}\n${usage()}`);
  }
  if (!before || !after) throw new Error(usage());

  const [beforeRows, afterRows, gateAudit] = await Promise.all([
    loadBenchmarkRowsFromRunDir(before),
    loadBenchmarkRowsFromRunDir(after),
    readGateAudit(gate),
  ]);
  const report = buildPacPromotionStage1Validation({
    beforeRunDir: before,
    afterRunDir: after,
    beforeRows: beforeRows.remediateResults,
    afterRows: afterRows.remediateResults,
    gateAudit,
  });
  const outDir = resolve(out);
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, 'pac-promotion-stage1-validation.json'), JSON.stringify(report, null, 2), 'utf8');
  await writeFile(join(outDir, 'pac-promotion-stage1-validation.md'), renderPacPromotionStage1ValidationMarkdown(report), 'utf8');
  console.log(`Wrote PAC Promotion Stage 1 validation to ${outDir}`);
  console.log(`Recommendation: ${report.summary.recommendation}`);
  console.log(`New PAC score caps: ${report.summary.newPacScoreCapCount}`);
  console.log(`PAC gate rejections: ${report.summary.pacGateRejectionCount}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
