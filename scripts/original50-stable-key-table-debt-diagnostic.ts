#!/usr/bin/env tsx
import 'dotenv/config';

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const DEFAULT_RUN_DIR = '/mnt/pdf-review/original50-stable-key-candidate-focus-2026-05-29-r1/run-2026-05-29T19-53-13-513Z';
const DEFAULT_BOUNDARY_JSON = '/mnt/pdf-review/pdfaf-validation/original50-extraction-boundary-attribution-stable-key-candidate-2026-05-29-r1/original50-extraction-boundary-attribution.json';
const DEFAULT_OUT_ROOT = '/mnt/pdf-review/pdfaf-validation';
const DEFAULT_TARGET_SCORE = 93;

type CategoryList = Array<{ key?: string; score?: number | null; applicable?: boolean }>;

type ToolTiming = {
  toolName?: string;
  outcome?: string;
  stage?: number;
  round?: number;
  durationMs?: number;
};

type DetectionProfile = {
  tableSignals?: Record<string, number | boolean | string | null | undefined>;
  headingSignals?: Record<string, number | boolean | string | null | undefined>;
  figureSignals?: Record<string, number | boolean | string | null | undefined>;
  readingOrderSignals?: Record<string, number | boolean | string | null | undefined>;
};

type RemediationRow = {
  id?: string;
  file?: string;
  beforeScore?: number;
  afterScore?: number;
  reanalyzedScore?: number;
  beforeGrade?: string;
  afterGrade?: string;
  reanalyzedGrade?: string;
  beforeCategories?: CategoryList;
  afterCategories?: CategoryList;
  reanalyzedCategories?: CategoryList;
  beforeDetectionProfile?: DetectionProfile;
  afterDetectionProfile?: DetectionProfile;
  reanalyzedDetectionProfile?: DetectionProfile;
  runtimeSummary?: {
    toolTimings?: ToolTiming[];
    boundedWork?: {
      deterministicEarlyExitReasons?: Array<{ key?: string; count?: number }>;
    };
  };
  remediationOutcomeSummary?: {
    familySummaries?: Array<{
      family?: string;
      targeted?: boolean;
      status?: string;
      beforeSignalCount?: number;
      afterSignalCount?: number;
      appliedTools?: string[];
      residualSignals?: string[];
    }>;
  };
};

type BoundaryRepeat = {
  index?: number;
  analyze?: {
    ok?: boolean;
    score?: number;
    grade?: string;
    categories?: Record<string, number>;
    detectionSignals?: Record<string, number | boolean | string | null>;
    snapshotSignals?: Record<string, number | boolean | string | null>;
  };
  structure?: {
    ok?: boolean;
    signals?: Record<string, number | boolean | string | null>;
  };
};

type BoundaryRow = {
  key?: string;
  filename?: string;
  pdfPath?: string;
  classification?: string;
  repeats?: BoundaryRepeat[];
};

type BoundaryReport = {
  rows?: BoundaryRow[];
};

export type StableKeyTableDebtClassification =
  | 'stable_key_table_header_debt_blocker'
  | 'stable_key_control_table_debt'
  | 'table_tool_no_effect_blocker'
  | 'table_tool_applied_without_table_gain'
  | 'non_table_primary_blocker'
  | 'stable_key_not_low'
  | 'missing_artifact_evidence';

interface Args {
  runDir: string;
  boundaryJson: string;
  outDir: string;
  controls: Set<string>;
  targetScore: number;
}

interface BoundarySummary {
  key: string | null;
  repeatCount: number;
  scores: number[];
  stableScore: boolean;
  stableStructureCounts: boolean;
  tableCounts: number[];
  headingCounts: number[];
  figureCounts: number[];
  paragraphCounts: number[];
  tableHeaderDebtCounts: number[];
  classification: string | null;
}

interface DiagnosticRow {
  id: string;
  artifactKey: string;
  file: string;
  role: 'focus' | 'control';
  beforeScore: number | null;
  afterScore: number | null;
  reanalyzedScore: number | null;
  beforeGrade: string | null;
  afterGrade: string | null;
  reanalyzedGrade: string | null;
  categories: {
    before: Record<string, number | null>;
    after: Record<string, number | null>;
    reanalyzed: Record<string, number | null>;
  };
  tableSignalSummary: Record<string, number>;
  nonTableRecovery: {
    headingRecovered: boolean;
    altRecovered: boolean;
    readingRecovered: boolean;
  };
  tableTools: ToolTiming[];
  tableFamily: {
    status: string | null;
    beforeSignalCount: number | null;
    afterSignalCount: number | null;
    residualSignals: string[];
  };
  earlyExitReasons: string[];
  boundary: BoundarySummary | null;
  classification: StableKeyTableDebtClassification;
  reasons: string[];
}

interface DiagnosticReport {
  generatedAt: string;
  runDir: string;
  boundaryJson: string;
  outDir: string;
  targetScore: number;
  rows: DiagnosticRow[];
  summary: {
    rowCount: number;
    focusCount: number;
    controlCount: number;
    classificationCounts: Record<string, number>;
    blockers: string[];
    controlsWithTableDebt: string[];
  };
  decision: {
    status: 'park_stable_key_until_table_recovery_proof' | 'diagnostic_only_no_table_blocker';
    reasons: string[];
  };
}

function timestampSlug(date = new Date()): string {
  return date.toISOString().replace(/[:.]/g, '-');
}

function usage(): string {
  return `Usage: pnpm exec tsx scripts/original50-stable-key-table-debt-diagnostic.ts [options]

Options:
  --run <dir>          Candidate benchmark run directory (default: ${DEFAULT_RUN_DIR})
  --boundary <json>    Stable-key extraction-boundary report JSON (default: ${DEFAULT_BOUNDARY_JSON})
  --out <dir>          Output directory (default: ${DEFAULT_OUT_ROOT}/original50-stable-key-table-debt-<timestamp>)
  --control <id>       Mark a row/control id as a control; repeatable
  --target-score <n>   Acceptance target score (default: ${DEFAULT_TARGET_SCORE})
  --help               Show this help.`;
}

export function parseArgs(argv = process.argv.slice(2), now = new Date()): Args {
  let runDir = DEFAULT_RUN_DIR;
  let boundaryJson = DEFAULT_BOUNDARY_JSON;
  let outDir = join(DEFAULT_OUT_ROOT, `original50-stable-key-table-debt-${timestampSlug(now)}`);
  let targetScore = DEFAULT_TARGET_SCORE;
  const controls = new Set<string>();
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!;
    if (arg === '--help' || arg === '-h') {
      console.log(usage());
      process.exit(0);
    } else if (arg === '--run') {
      const value = argv[++index];
      if (!value) throw new Error(`Missing --run value\n${usage()}`);
      runDir = resolve(value);
    } else if (arg === '--boundary') {
      const value = argv[++index];
      if (!value) throw new Error(`Missing --boundary value\n${usage()}`);
      boundaryJson = resolve(value);
    } else if (arg === '--out') {
      const value = argv[++index];
      if (!value) throw new Error(`Missing --out value\n${usage()}`);
      outDir = resolve(value);
    } else if (arg === '--control') {
      const value = argv[++index];
      if (!value) throw new Error(`Missing --control value\n${usage()}`);
      controls.add(normalizeKey(value));
    } else if (arg === '--target-score') {
      const value = Number(argv[++index]);
      if (!Number.isFinite(value)) throw new Error(`Invalid --target-score value\n${usage()}`);
      targetScore = value;
    } else {
      throw new Error(`Unknown argument ${arg}\n${usage()}`);
    }
  }
  return { runDir: resolve(runDir), boundaryJson: resolve(boundaryJson), outDir: resolve(outDir), controls, targetScore };
}

function normalizeKey(value: string | null | undefined): string {
  const text = String(value ?? '').toLowerCase();
  const firstDigits = text.match(/\d{4}/)?.[0];
  if (firstDigits) return firstDigits;
  return basename(text).replace(/\.pdf$/i, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function rowKey(row: Pick<RemediationRow, 'id' | 'file'>): string {
  return normalizeKey(`${row.id ?? ''} ${row.file ?? ''}`);
}

function categoryScore(categories: CategoryList | undefined, key: string): number | null {
  const row = categories?.find(category => category.key === key);
  if (!row || row.applicable === false || typeof row.score !== 'number') return null;
  return row.score;
}

function categoriesFor(row: RemediationRow, field: 'beforeCategories' | 'afterCategories' | 'reanalyzedCategories'): Record<string, number | null> {
  return {
    heading_structure: categoryScore(row[field], 'heading_structure'),
    alt_text: categoryScore(row[field], 'alt_text'),
    reading_order: categoryScore(row[field], 'reading_order'),
    table_markup: categoryScore(row[field], 'table_markup'),
    pdf_ua_compliance: categoryScore(row[field], 'pdf_ua_compliance'),
    link_quality: categoryScore(row[field], 'link_quality'),
  };
}

function numericSignal(profile: DetectionProfile | undefined, family: keyof DetectionProfile, key: string): number {
  const value = profile?.[family]?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function tableSignalSummary(row: RemediationRow): Record<string, number> {
  const profile = row.reanalyzedDetectionProfile ?? row.afterDetectionProfile ?? row.beforeDetectionProfile;
  return {
    irregularTableCount: numericSignal(profile, 'tableSignals', 'irregularTableCount'),
    stronglyIrregularTableCount: numericSignal(profile, 'tableSignals', 'stronglyIrregularTableCount'),
    directCellUnderTableCount: numericSignal(profile, 'tableSignals', 'directCellUnderTableCount'),
    layoutTableCandidateCount: numericSignal(profile, 'tableSignals', 'layoutTableCandidateCount'),
    denseRowBandTableCandidateCount: numericSignal(profile, 'tableSignals', 'denseRowBandTableCandidateCount'),
  };
}

function tableTools(row: RemediationRow): ToolTiming[] {
  return (row.runtimeSummary?.toolTimings ?? [])
    .filter(tool => /table|header/i.test(tool.toolName ?? ''))
    .map(tool => ({
      toolName: tool.toolName,
      outcome: tool.outcome,
      stage: tool.stage,
      round: tool.round,
      durationMs: tool.durationMs,
    }));
}

function tableFamily(row: RemediationRow): DiagnosticRow['tableFamily'] {
  const family = row.remediationOutcomeSummary?.familySummaries?.find(item => item.family === 'tables');
  return {
    status: family?.status ?? null,
    beforeSignalCount: typeof family?.beforeSignalCount === 'number' ? family.beforeSignalCount : null,
    afterSignalCount: typeof family?.afterSignalCount === 'number' ? family.afterSignalCount : null,
    residualSignals: family?.residualSignals ?? [],
  };
}

function boundarySummary(row: BoundaryRow | undefined): BoundarySummary | null {
  if (!row) return null;
  const repeats = row.repeats ?? [];
  const scores = repeats
    .map(repeat => repeat.analyze?.score)
    .filter((score): score is number => typeof score === 'number' && Number.isFinite(score));
  const getCounts = (key: string): number[] => repeats
    .map(repeat => repeat.structure?.signals?.[key])
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  const tableCounts = getCounts('tableCount');
  const headingCounts = getCounts('headingCount');
  const figureCounts = getCounts('figureCount');
  const paragraphCounts = getCounts('paragraphStructElemCount');
  const tableHeaderDebtCounts = repeats
    .map(repeat =>
      Number(repeat.structure?.signals?.tableHeaderAssociationMissingCount ?? 0) +
      Number(repeat.structure?.signals?.tableDataCellsWithoutHeaderCount ?? 0) +
      Number(repeat.structure?.signals?.tableOrphanHeaderCellCount ?? 0),
    )
    .filter(value => Number.isFinite(value));
  const stable = (values: number[]) => values.length > 0 && new Set(values).size === 1;
  return {
    key: row.key ?? null,
    repeatCount: repeats.length,
    scores,
    stableScore: stable(scores),
    stableStructureCounts: [tableCounts, headingCounts, figureCounts, paragraphCounts].every(stable),
    tableCounts,
    headingCounts,
    figureCounts,
    paragraphCounts,
    tableHeaderDebtCounts,
    classification: row.classification ?? null,
  };
}

function classifyRow(input: {
  role: 'focus' | 'control';
  targetScore: number;
  beforeScore: number | null;
  afterScore: number | null;
  reanalyzedScore: number | null;
  beforeTable: number | null;
  afterTable: number | null;
  reanalyzedTable: number | null;
  afterHeading: number | null;
  afterAlt: number | null;
  afterReading: number | null;
  tableTools: ToolTiming[];
  tableSignals: Record<string, number>;
  boundary: BoundarySummary | null;
}): { classification: StableKeyTableDebtClassification; reasons: string[] } {
  const reasons: string[] = [];
  if (!input.boundary || input.beforeScore === null || input.reanalyzedScore === null) {
    reasons.push('missing_candidate_or_boundary_artifact');
    return { classification: 'missing_artifact_evidence', reasons };
  }
  const tableStillLow = (input.reanalyzedTable ?? input.afterTable ?? 100) < 80;
  const tableUnchanged = input.beforeTable !== null &&
    input.afterTable !== null &&
    input.reanalyzedTable !== null &&
    input.beforeTable === input.afterTable &&
    input.afterTable === input.reanalyzedTable;
  const tableNoEffect = input.tableTools.some(tool => tool.outcome === 'no_effect');
  const tableApplied = input.tableTools.some(tool => tool.outcome === 'applied');
  const stableLowBoundary = input.boundary.stableScore &&
    input.boundary.scores.length > 0 &&
    Math.max(...input.boundary.scores) < input.targetScore;
  const tableShapeEvidence = Object.values(input.tableSignals).some(value => value > 0);
  const nonTableRecovered = (input.afterHeading ?? 0) >= 90 &&
    (input.afterReading ?? 0) >= 90 &&
    (input.afterAlt ?? 0) >= 80;

  if (input.reanalyzedScore >= input.targetScore && !tableStillLow) {
    reasons.push('candidate_run_already_reaches_target_without_table_blocker');
    return { classification: 'stable_key_not_low', reasons };
  }
  if (input.role === 'control' && tableStillLow) {
    reasons.push('control_retains_low_table_markup');
    if (tableApplied) reasons.push('table_tool_applied_to_control_without_table_score_clearance');
    if (tableShapeEvidence) reasons.push('control_has_real_table_shape_evidence');
    return { classification: 'stable_key_control_table_debt', reasons };
  }
  if (stableLowBoundary) reasons.push('stable_key_boundary_repeats_low_and_stable');
  if (tableStillLow) reasons.push('table_markup_remains_below_acceptance_band');
  if (tableUnchanged) reasons.push('table_markup_unchanged_after_remediation');
  if (tableShapeEvidence) reasons.push('native_table_shape_evidence_remains');
  if (nonTableRecovered) reasons.push('heading_reading_alt_recovered_enough_to_expose_table_wall');
  if (tableNoEffect) reasons.push('table_tool_returned_no_effect');
  if (tableApplied && tableUnchanged) reasons.push('table_tool_applied_without_table_score_gain');

  if (tableStillLow && nonTableRecovered && (tableNoEffect || tableUnchanged)) {
    return { classification: 'stable_key_table_header_debt_blocker', reasons };
  }
  if (tableStillLow && tableNoEffect) {
    return { classification: 'table_tool_no_effect_blocker', reasons };
  }
  if (tableStillLow && tableApplied && tableUnchanged) {
    return { classification: 'table_tool_applied_without_table_gain', reasons };
  }
  if ((input.reanalyzedScore ?? 0) < input.targetScore) {
    reasons.push('low_score_not_explained_by_table_wall_alone');
    return { classification: 'non_table_primary_blocker', reasons };
  }
  reasons.push('no_low_table_blocker_detected');
  return { classification: 'stable_key_not_low', reasons };
}

function buildRow(row: RemediationRow, boundary: BoundarySummary | null, args: Args): DiagnosticRow {
  const artifactKey = rowKey(row);
  const role = args.controls.has(artifactKey) || args.controls.has(normalizeKey(row.id)) ? 'control' : 'focus';
  const before = categoriesFor(row, 'beforeCategories');
  const after = categoriesFor(row, 'afterCategories');
  const reanalyzed = categoriesFor(row, 'reanalyzedCategories');
  const tools = tableTools(row);
  const signals = tableSignalSummary(row);
  const classified = classifyRow({
    role,
    targetScore: args.targetScore,
    beforeScore: typeof row.beforeScore === 'number' ? row.beforeScore : null,
    afterScore: typeof row.afterScore === 'number' ? row.afterScore : null,
    reanalyzedScore: typeof row.reanalyzedScore === 'number' ? row.reanalyzedScore : null,
    beforeTable: before.table_markup,
    afterTable: after.table_markup,
    reanalyzedTable: reanalyzed.table_markup,
    afterHeading: after.heading_structure,
    afterAlt: after.alt_text,
    afterReading: after.reading_order,
    tableTools: tools,
    tableSignals: signals,
    boundary,
  });
  return {
    id: row.id ?? artifactKey,
    artifactKey,
    file: row.file ?? '',
    role,
    beforeScore: typeof row.beforeScore === 'number' ? row.beforeScore : null,
    afterScore: typeof row.afterScore === 'number' ? row.afterScore : null,
    reanalyzedScore: typeof row.reanalyzedScore === 'number' ? row.reanalyzedScore : null,
    beforeGrade: row.beforeGrade ?? null,
    afterGrade: row.afterGrade ?? null,
    reanalyzedGrade: row.reanalyzedGrade ?? null,
    categories: { before, after, reanalyzed },
    tableSignalSummary: signals,
    nonTableRecovery: {
      headingRecovered: (after.heading_structure ?? 0) >= 90,
      altRecovered: (after.alt_text ?? 0) >= 80,
      readingRecovered: (after.reading_order ?? 0) >= 90,
    },
    tableTools: tools,
    tableFamily: tableFamily(row),
    earlyExitReasons: (row.runtimeSummary?.boundedWork?.deterministicEarlyExitReasons ?? [])
      .map(reason => `${reason.key ?? 'unknown'}:${reason.count ?? 0}`),
    boundary,
    ...classified,
  };
}

export function buildStableKeyTableDebtDiagnostic(input: {
  runDir: string;
  boundaryJson: string;
  outDir: string;
  targetScore?: number;
  controls?: Iterable<string>;
  remediationRows: RemediationRow[];
  boundaryReport: BoundaryReport;
  generatedAt?: string;
}): DiagnosticReport {
  const controls = new Set(Array.from(input.controls ?? [], normalizeKey));
  const args: Args = {
    runDir: input.runDir,
    boundaryJson: input.boundaryJson,
    outDir: input.outDir,
    controls,
    targetScore: input.targetScore ?? DEFAULT_TARGET_SCORE,
  };
  const boundaryByKey = new Map<string, BoundarySummary>();
  for (const row of input.boundaryReport.rows ?? []) {
    const summary = boundarySummary(row);
    if (summary) {
      boundaryByKey.set(normalizeKey(row.key ?? row.filename ?? row.pdfPath), summary);
    }
  }
  const rows = input.remediationRows.map(row => buildRow(row, boundaryByKey.get(rowKey(row)) ?? null, args));
  const classificationCounts: Record<string, number> = {};
  for (const row of rows) {
    classificationCounts[row.classification] = (classificationCounts[row.classification] ?? 0) + 1;
  }
  const blockers = rows
    .filter(row => row.role === 'focus' && row.classification !== 'stable_key_not_low')
    .map(row => row.id);
  const controlsWithTableDebt = rows
    .filter(row => row.role === 'control' && row.classification === 'stable_key_control_table_debt')
    .map(row => row.id);
  const reasons: string[] = [];
  if (blockers.length > 0) reasons.push('stable_key_focus_rows_still_blocked_by_table_or_related_debt');
  if (rows.some(row => row.classification === 'stable_key_table_header_debt_blocker')) {
    reasons.push('table_header_debt_is_remaining_score_wall_after_non_table_recovery');
  }
  if (rows.some(row => row.classification === 'table_tool_no_effect_blocker')) {
    reasons.push('current_table_tools_return_no_effect_on_stable_table_debt');
  }
  if (rows.some(row => row.classification === 'table_tool_applied_without_table_gain')) {
    reasons.push('current_table_tools_can_apply_without_final_table_score_gain');
  }
  if (controlsWithTableDebt.length > 0) reasons.push('controls_with_table_debt_require_guarding_before_behavior');
  return {
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    runDir: input.runDir,
    boundaryJson: input.boundaryJson,
    outDir: input.outDir,
    targetScore: args.targetScore,
    rows,
    summary: {
      rowCount: rows.length,
      focusCount: rows.filter(row => row.role === 'focus').length,
      controlCount: rows.filter(row => row.role === 'control').length,
      classificationCounts,
      blockers,
      controlsWithTableDebt,
    },
    decision: {
      status: reasons.length > 0 ? 'park_stable_key_until_table_recovery_proof' : 'diagnostic_only_no_table_blocker',
      reasons: reasons.length > 0 ? reasons : ['no_stable_key_table_debt_blocker_detected'],
    },
  };
}

function renderMarkdown(report: DiagnosticReport): string {
  const lines = [
    '# Original-50 Stable-Key Table Debt Diagnostic',
    '',
    `Generated: ${report.generatedAt}`,
    `Decision: \`${report.decision.status}\``,
    `Reasons: ${report.decision.reasons.map(reason => `\`${reason}\``).join(', ')}`,
    '',
    '## Summary',
    '',
    `- Rows: ${report.summary.rowCount} (${report.summary.focusCount} focus / ${report.summary.controlCount} control)`,
    `- Blockers: ${report.summary.blockers.map(id => `\`${id}\``).join(', ') || 'none'}`,
    `- Controls with table debt: ${report.summary.controlsWithTableDebt.map(id => `\`${id}\``).join(', ') || 'none'}`,
    '',
    '## Rows',
    '',
    '| Row | Role | Scores | Table Before/After/Reanalyzed | Non-Table Recovery | Table Tools | Boundary | Classification | Reasons |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- |',
  ];
  for (const row of report.rows) {
    const toolSummary = row.tableTools.map(tool => `${tool.toolName ?? 'unknown'}:${tool.outcome ?? 'unknown'}`).join(', ') || 'none';
    const boundary = row.boundary
      ? `scores ${row.boundary.scores.join('/')} tables ${row.boundary.tableCounts.join('/')}`
      : 'missing';
    lines.push([
      `| \`${row.id}\``,
      row.role,
      `${row.beforeScore ?? 'n/a'} -> ${row.afterScore ?? 'n/a'} -> ${row.reanalyzedScore ?? 'n/a'}`,
      `${row.categories.before.table_markup ?? 'n/a'} / ${row.categories.after.table_markup ?? 'n/a'} / ${row.categories.reanalyzed.table_markup ?? 'n/a'}`,
      `H:${row.nonTableRecovery.headingRecovered ? 'yes' : 'no'} A:${row.nonTableRecovery.altRecovered ? 'yes' : 'no'} R:${row.nonTableRecovery.readingRecovered ? 'yes' : 'no'}`,
      toolSummary,
      boundary,
      `\`${row.classification}\``,
      `${row.reasons.map(reason => `\`${reason}\``).join(', ')} |`,
    ].join(' | '));
  }
  lines.push('', '## Table Signal Details', '');
  for (const row of report.rows) {
    lines.push(`### ${row.id}`, '');
    lines.push(`Table family: \`${row.tableFamily.status ?? 'unknown'}\` (${row.tableFamily.beforeSignalCount ?? 'n/a'} -> ${row.tableFamily.afterSignalCount ?? 'n/a'}), residuals: ${row.tableFamily.residualSignals.map(signal => `\`${signal}\``).join(', ') || 'none'}`);
    lines.push(`Signals: \`${JSON.stringify(row.tableSignalSummary)}\``);
    lines.push(`Early exits: ${row.earlyExitReasons.map(reason => `\`${reason}\``).join(', ') || 'none'}`);
    if (row.boundary) {
      lines.push(`Boundary stable score: \`${row.boundary.stableScore}\`; stable structure counts: \`${row.boundary.stableStructureCounts}\`; header debt counts: \`${row.boundary.tableHeaderDebtCounts.join('/') || 'none'}\``);
    }
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
}

export async function writeStableKeyTableDebtDiagnostic(args: Args): Promise<DiagnosticReport> {
  const remediationRows = JSON.parse(await readFile(join(args.runDir, 'remediate.results.json'), 'utf8')) as RemediationRow[];
  const boundaryReport = JSON.parse(await readFile(args.boundaryJson, 'utf8')) as BoundaryReport;
  const report = buildStableKeyTableDebtDiagnostic({
    runDir: args.runDir,
    boundaryJson: args.boundaryJson,
    outDir: args.outDir,
    targetScore: args.targetScore,
    controls: args.controls,
    remediationRows,
    boundaryReport,
  });
  await mkdir(args.outDir, { recursive: true });
  await writeFile(join(args.outDir, 'original50-stable-key-table-debt-diagnostic.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await writeFile(join(args.outDir, 'original50-stable-key-table-debt-diagnostic.md'), renderMarkdown(report), 'utf8');
  return report;
}

async function main(): Promise<void> {
  const args = parseArgs();
  const report = await writeStableKeyTableDebtDiagnostic(args);
  console.log(`Wrote ${join(args.outDir, 'original50-stable-key-table-debt-diagnostic.md')}`);
  console.log(`Decision: ${report.decision.status}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}
