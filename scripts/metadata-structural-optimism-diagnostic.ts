#!/usr/bin/env tsx
import 'dotenv/config';

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const DEFAULT_REFERENCE =
  '/mnt/pdf-review/pdfaf-validation/original50-form-xobject-content-confidence-2026-05-21-r1/baseline_report.json';
const DEFAULT_CURRENT =
  '/mnt/pdf-review/pdfaf-validation/original50-figure-alt-tree-cap-calibration-2026-05-21-r1/baseline_report.json';
const DEFAULT_REPEAT =
  '/mnt/pdf-review/pdfaf-validation/figure-alt-tree-cap-regression-repeat-2026-05-21-r1/run-r1/baseline_report.json';
const DEFAULT_OUT =
  '/mnt/pdf-review/pdfaf-validation/metadata-structural-optimism-2026-05-21-r1';

const METADATA_TOOLS = new Set(['set_document_title', 'set_document_language']);
const STRUCTURAL_KEYS = ['alt_text', 'table_markup', 'heading_structure', 'reading_order', 'pdf_ua_compliance'] as const;

type RowClassification =
  | 'reference_metadata_structural_optimism'
  | 'current_metadata_structural_drop_volatility'
  | 'metadata_stage_stable_or_absent'
  | 'insufficient_comparison_evidence';

interface CategoryScore {
  key?: string;
  score?: number;
  applicable?: boolean;
}

interface AppliedTool {
  toolName?: string;
  outcome?: string;
  stage?: number | null;
  scoreBefore?: number | null;
  scoreAfter?: number | null;
  details?: unknown;
}

interface BaselineReportRow {
  id?: string;
  file?: string;
  filename?: string;
  beforeScore?: number | null;
  beforeGrade?: string | null;
  afterScore?: number | null;
  afterGrade?: string | null;
  reanalyzedScore?: number | null;
  reanalyzedGrade?: string | null;
  categoryGap?: {
    before?: CategoryScore[];
    after?: CategoryScore[];
  };
  categoriesAfter?: CategoryScore[];
  appliedTools?: AppliedTool[];
  falsePositiveApplied?: number | null;
  durationMs?: number | null;
  error?: string | null;
}

interface BaselineReport {
  inputDir?: string;
  rows?: BaselineReportRow[];
  remediateResults?: BaselineReportRow[];
}

interface MetadataStageSummary {
  present: boolean;
  metadataOnly: boolean;
  appliedCount: number;
  scoreBefore: number | null;
  scoreAfter: number | null;
  titleBefore: number | null;
  titleAfter: number | null;
  largestStructuralGain: number;
  largestStructuralDrop: number;
  gainKeys: string[];
  dropKeys: string[];
  suspiciousStructuralOptimism: boolean;
  suspiciousStructuralDrop: boolean;
  toolNames: string[];
}

interface RunRowSummary {
  label: string;
  path: string;
  present: boolean;
  file: string | null;
  score: number | null;
  grade: string | null;
  falsePositiveApplied: number;
  durationMs: number | null;
  metadataStage: MetadataStageSummary;
}

interface ComparisonRow {
  key: string;
  classification: RowClassification;
  reasons: string[];
  reference: RunRowSummary;
  current: RunRowSummary;
  repeat: RunRowSummary | null;
}

export interface MetadataStructuralOptimismReport {
  generatedAt: string;
  decision: {
    status:
      | 'document_stricter_score_candidate'
      | 'metadata_volatility_behavior_candidate'
      | 'keep_diagnostic_only';
    recommendation: string;
    reasons: string[];
  };
  summary: {
    comparedRows: number;
    referenceOptimismRows: number;
    currentDropVolatilityRows: number;
    falsePositiveApplied: number;
  };
  paths: {
    reference: string;
    current: string;
    repeat: string | null;
  };
  rows: ComparisonRow[];
}

function usage(): string {
  return [
    'Usage: pnpm exec tsx scripts/metadata-structural-optimism-diagnostic.ts [options]',
    '  --reference <baseline_report.json>',
    '  --current <baseline_report.json>',
    '  --repeat <baseline_report.json>',
    '  --out <dir>',
  ].join('\n');
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function recordOrNull(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function parseDetails(details: unknown): Record<string, unknown> | null {
  if (!details) return null;
  if (typeof details === 'object' && !Array.isArray(details)) return details as Record<string, unknown>;
  if (typeof details !== 'string' || !details.trim().startsWith('{')) return null;
  try {
    return recordOrNull(JSON.parse(details) as unknown);
  } catch {
    return null;
  }
}

function nested(record: Record<string, unknown> | null, key: string): Record<string, unknown> | null {
  return recordOrNull(record?.[key]);
}

function categoryRecord(value: unknown): Record<string, number> {
  const record = recordOrNull(value);
  if (!record) return {};
  return Object.fromEntries(
    Object.entries(record).filter((entry): entry is [string, number] => typeof entry[1] === 'number'),
  );
}

function rowName(row: BaselineReportRow): string {
  return row.file ?? row.filename ?? row.id ?? '';
}

function rowKey(row: BaselineReportRow): string {
  const name = rowName(row);
  const numeric = name.match(/\b(\d{4})\b/)?.[1];
  if (numeric) return numeric;
  return basename(name).toLowerCase().replace(/\.pdf$/i, '');
}

function rowsFrom(report: BaselineReport): BaselineReportRow[] {
  if (Array.isArray(report.rows)) return report.rows;
  if (Array.isArray(report.remediateResults)) return report.remediateResults;
  return [];
}

function scoreFor(row?: BaselineReportRow): number | null {
  return numberOrNull(row?.reanalyzedScore) ?? numberOrNull(row?.afterScore);
}

function gradeFor(row?: BaselineReportRow): string | null {
  return stringOrNull(row?.reanalyzedGrade) ?? stringOrNull(row?.afterGrade);
}

function replayScores(details: unknown, suffix: 'Before' | 'After'): Record<string, number> {
  return categoryRecord(nested(nested(parseDetails(details), 'debug'), 'replayState')?.[`categoryScores${suffix}`]);
}

function replayScore(details: unknown, suffix: 'Before' | 'After'): number | null {
  return numberOrNull(nested(nested(parseDetails(details), 'debug'), 'replayState')?.[`score${suffix}`]);
}

function emptyMetadataStage(): MetadataStageSummary {
  return {
    present: false,
    metadataOnly: false,
    appliedCount: 0,
    scoreBefore: null,
    scoreAfter: null,
    titleBefore: null,
    titleAfter: null,
    largestStructuralGain: 0,
    largestStructuralDrop: 0,
    gainKeys: [],
    dropKeys: [],
    suspiciousStructuralOptimism: false,
    suspiciousStructuralDrop: false,
    toolNames: [],
  };
}

function metadataStageSummary(row?: BaselineReportRow): MetadataStageSummary {
  const tools = row?.appliedTools ?? [];
  if (tools.length === 0) return emptyMetadataStage();
  const groups = new Map<string, AppliedTool[]>();
  for (const tool of tools) {
    const stage = tool.stage ?? 0;
    groups.set(String(stage), [...(groups.get(String(stage)) ?? []), tool]);
  }
  const metadataGroup = [...groups.values()].find(group =>
    group.length > 0 &&
    group.every(tool => tool.toolName && METADATA_TOOLS.has(tool.toolName)) &&
    group.some(tool => tool.outcome === 'applied')
  );
  if (!metadataGroup) return emptyMetadataStage();

  const applied = metadataGroup.filter(tool => tool.outcome === 'applied');
  const beforeScores = applied.map(tool => replayScores(tool.details, 'Before'));
  const afterScores = applied.map(tool => replayScores(tool.details, 'After'));
  const scoreBeforeValues = applied.map(tool => replayScore(tool.details, 'Before') ?? numberOrNull(tool.scoreBefore)).filter((value): value is number => value !== null);
  const scoreAfterValues = applied.map(tool => replayScore(tool.details, 'After') ?? numberOrNull(tool.scoreAfter)).filter((value): value is number => value !== null);
  const before = beforeScores[0] ?? {};
  const after = afterScores.at(-1) ?? {};
  const gains = new Map<string, number>();
  const drops = new Map<string, number>();
  for (const key of STRUCTURAL_KEYS) {
    const beforeValue = before[key];
    const afterValue = after[key];
    if (beforeValue === undefined || afterValue === undefined) continue;
    const delta = afterValue - beforeValue;
    if (delta >= 20) gains.set(key, delta);
    if (delta <= -20) drops.set(key, Math.abs(delta));
  }
  const largestStructuralGain = gains.size ? Math.max(...gains.values()) : 0;
  const largestStructuralDrop = drops.size ? Math.max(...drops.values()) : 0;
  const titleBefore = before.title_language ?? null;
  const titleAfter = after.title_language ?? null;
  const scoreBefore = scoreBeforeValues.length ? Math.min(...scoreBeforeValues) : null;
  const scoreAfter = scoreAfterValues.length ? Math.max(...scoreAfterValues) : null;
  const titleImproved = titleBefore !== null && titleAfter !== null && titleAfter > titleBefore;
  const scoreGain = scoreBefore !== null && scoreAfter !== null ? scoreAfter - scoreBefore : 0;
  return {
    present: true,
    metadataOnly: true,
    appliedCount: applied.length,
    scoreBefore,
    scoreAfter,
    titleBefore,
    titleAfter,
    largestStructuralGain,
    largestStructuralDrop,
    gainKeys: [...gains.keys()],
    dropKeys: [...drops.keys()],
    suspiciousStructuralOptimism: titleImproved && scoreGain >= 20 && largestStructuralGain >= 20,
    suspiciousStructuralDrop: titleImproved && scoreGain < 0 && largestStructuralDrop >= 20,
    toolNames: [...new Set(metadataGroup.map(tool => tool.toolName ?? 'unknown'))].sort(),
  };
}

function summarizeRun(label: string, path: string, row?: BaselineReportRow): RunRowSummary {
  return {
    label,
    path,
    present: Boolean(row),
    file: row ? rowName(row) : null,
    score: scoreFor(row),
    grade: gradeFor(row),
    falsePositiveApplied: numberOrNull(row?.falsePositiveApplied) ?? 0,
    durationMs: numberOrNull(row?.durationMs),
    metadataStage: metadataStageSummary(row),
  };
}

function placeholderRun(label: string, path: string): RunRowSummary {
  return summarizeRun(label, path, undefined);
}

function classify(reference: RunRowSummary, current: RunRowSummary, repeat: RunRowSummary | null): {
  classification: RowClassification;
  reasons: string[];
} {
  const reasons: string[] = [];
  const comparisonScores = [current, repeat].filter((run): run is RunRowSummary => Boolean(run?.present && run.score !== null));
  const lowComparison = comparisonScores.some(run =>
    reference.score !== null &&
    run.score !== null &&
    reference.score - run.score >= 20 &&
    run.score <= 65
  );
  if (current.metadataStage.suspiciousStructuralDrop || repeat?.metadataStage.suspiciousStructuralDrop) {
    reasons.push('A current/repeat metadata-only stage improved title/language while unrelated structural categories dropped.');
    return { classification: 'current_metadata_structural_drop_volatility', reasons };
  }
  if (reference.metadataStage.suspiciousStructuralOptimism && lowComparison) {
    reasons.push('Reference metadata-only stage showed unrelated structural gains of at least 20 points.');
    reasons.push('A current/repeat artifact stayed at least 20 points lower and at or below 65.');
    return { classification: 'reference_metadata_structural_optimism', reasons };
  }
  if (!reference.present || !current.present) {
    reasons.push('Reference/current row pair is missing.');
    return { classification: 'insufficient_comparison_evidence', reasons };
  }
  reasons.push('No suspicious metadata-only structural optimism or drop is visible.');
  return { classification: 'metadata_stage_stable_or_absent', reasons };
}

export function buildMetadataStructuralOptimismReport(input: {
  referencePath: string;
  currentPath: string;
  repeatPath?: string | null;
  referenceReport: BaselineReport;
  currentReport: BaselineReport;
  repeatReport?: BaselineReport | null;
  generatedAt?: string;
}): MetadataStructuralOptimismReport {
  const referenceRows = new Map(rowsFrom(input.referenceReport).map(row => [rowKey(row), row]));
  const currentRows = new Map(rowsFrom(input.currentReport).map(row => [rowKey(row), row]));
  const repeatRows = new Map(rowsFrom(input.repeatReport ?? {}).map(row => [rowKey(row), row]));
  const keys = [...new Set([...referenceRows.keys(), ...currentRows.keys(), ...repeatRows.keys()])].sort();
  const rows: ComparisonRow[] = keys.map(key => {
    const reference = summarizeRun('reference', input.referencePath, referenceRows.get(key));
    const current = summarizeRun('current', input.currentPath, currentRows.get(key));
    const repeat = input.repeatPath ? summarizeRun('repeat', input.repeatPath, repeatRows.get(key)) : null;
    const classified = classify(reference, current, repeat);
    return {
      key,
      classification: classified.classification,
      reasons: classified.reasons,
      reference,
      current,
      repeat,
    };
  });

  const referenceOptimismRows = rows.filter(row => row.classification === 'reference_metadata_structural_optimism');
  const currentDropRows = rows.filter(row => row.classification === 'current_metadata_structural_drop_volatility');
  const falsePositiveApplied = rows.reduce(
    (sum, row) => sum + row.reference.falsePositiveApplied + row.current.falsePositiveApplied + (row.repeat?.falsePositiveApplied ?? 0),
    0,
  );
  const reasons: string[] = [];
  let status: MetadataStructuralOptimismReport['decision']['status'] = 'keep_diagnostic_only';
  let recommendation =
    'Keep this diagnostic-only; do not change scoring, remediation, checkpoint floors, or PAC gates from metadata-stage comparisons alone.';
  if (referenceOptimismRows.length > 0 && currentDropRows.length === 0) {
    status = 'document_stricter_score_candidate';
    reasons.push(`${referenceOptimismRows.length} row(s) have reference metadata-only structural optimism that does not reproduce.`);
    recommendation =
      'Treat lower current scores on these rows as stricter/correct candidates only after the relevant acceptance gate explicitly accepts the documented analyzer optimism.';
  } else if (currentDropRows.length > 0) {
    status = 'metadata_volatility_behavior_candidate';
    reasons.push(`${currentDropRows.length} row(s) show current metadata-only structural drop volatility.`);
    recommendation =
      'Use targeted controls before considering generalized confirmation behavior; do not add row-specific exceptions.';
  } else {
    reasons.push('No high-impact metadata-only structural optimism/drop candidate is visible.');
  }

  return {
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    decision: { status, recommendation, reasons },
    summary: {
      comparedRows: rows.length,
      referenceOptimismRows: referenceOptimismRows.length,
      currentDropVolatilityRows: currentDropRows.length,
      falsePositiveApplied,
    },
    paths: {
      reference: input.referencePath,
      current: input.currentPath,
      repeat: input.repeatPath ?? null,
    },
    rows,
  };
}

function scoreText(run: RunRowSummary): string {
  return run.score === null ? 'n/a' : `${run.score}/${run.grade ?? 'n/a'}`;
}

function metadataText(stage: MetadataStageSummary): string {
  if (!stage.present) return 'absent';
  const gains = stage.gainKeys.length ? ` gains:${stage.gainKeys.join(',')}` : '';
  const drops = stage.dropKeys.length ? ` drops:${stage.dropKeys.join(',')}` : '';
  return `${stage.scoreBefore ?? 'n/a'}->${stage.scoreAfter ?? 'n/a'} title:${stage.titleBefore ?? 'n/a'}->${stage.titleAfter ?? 'n/a'}${gains}${drops}`;
}

export function renderMetadataStructuralOptimismMarkdown(report: MetadataStructuralOptimismReport): string {
  const lines: string[] = [];
  lines.push('# Metadata Structural Optimism Diagnostic', '');
  lines.push('Read-only diagnostic over existing benchmark JSON. It does not analyze PDFs, remediate PDFs, call PAC/POC/ODL/Java/semantic AI, write PDFs, or change production behavior.', '');
  lines.push(`- Decision: \`${report.decision.status}\``);
  lines.push(`- Recommendation: ${report.decision.recommendation}`);
  lines.push(`- Compared rows: \`${report.summary.comparedRows}\``);
  lines.push(`- Reference optimism rows: \`${report.summary.referenceOptimismRows}\``);
  lines.push(`- Current drop volatility rows: \`${report.summary.currentDropVolatilityRows}\``);
  lines.push(`- false_positive_applied total: \`${report.summary.falsePositiveApplied}\``, '');
  lines.push('## Reasons', '');
  for (const reason of report.decision.reasons) {
    lines.push(`- ${reason}`);
  }
  const focusRows = report.rows.filter(row => row.classification !== 'metadata_stage_stable_or_absent');
  lines.push('', '## Focus Rows', '');
  if (focusRows.length === 0) {
    lines.push('No focus rows.');
  } else {
    lines.push('| Key | Classification | Reference | Current | Repeat | Reference Metadata Stage | Current Metadata Stage | Repeat Metadata Stage |');
    lines.push('| --- | --- | ---: | ---: | ---: | --- | --- | --- |');
    for (const row of focusRows) {
      lines.push(`| ${row.key} | \`${row.classification}\` | ${scoreText(row.reference)} | ${scoreText(row.current)} | ${row.repeat ? scoreText(row.repeat) : 'n/a'} | ${metadataText(row.reference.metadataStage)} | ${metadataText(row.current.metadataStage)} | ${row.repeat ? metadataText(row.repeat.metadataStage) : 'n/a'} |`);
    }
  }
  return `${lines.join('\n')}\n`;
}

async function loadReport(path: string): Promise<BaselineReport> {
  return JSON.parse(await readFile(resolve(path), 'utf8')) as BaselineReport;
}

export async function writeMetadataStructuralOptimismReport(input: {
  referencePath?: string;
  currentPath?: string;
  repeatPath?: string | null;
  outDir?: string;
}): Promise<MetadataStructuralOptimismReport> {
  const referencePath = input.referencePath ?? DEFAULT_REFERENCE;
  const currentPath = input.currentPath ?? DEFAULT_CURRENT;
  const repeatPath = input.repeatPath === undefined ? DEFAULT_REPEAT : input.repeatPath;
  const outDir = input.outDir ?? DEFAULT_OUT;
  const [referenceReport, currentReport, repeatReport] = await Promise.all([
    loadReport(referencePath),
    loadReport(currentPath),
    repeatPath ? loadReport(repeatPath) : Promise.resolve(null),
  ]);
  const report = buildMetadataStructuralOptimismReport({
    referencePath,
    currentPath,
    repeatPath,
    referenceReport,
    currentReport,
    repeatReport,
  });
  await mkdir(outDir, { recursive: true });
  await writeFile(
    join(outDir, 'metadata-structural-optimism-diagnostic.json'),
    `${JSON.stringify(report, null, 2)}\n`,
    'utf8',
  );
  await writeFile(
    join(outDir, 'metadata-structural-optimism-diagnostic.md'),
    renderMetadataStructuralOptimismMarkdown(report),
    'utf8',
  );
  return report;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  let referencePath = DEFAULT_REFERENCE;
  let currentPath = DEFAULT_CURRENT;
  let repeatPath: string | null = DEFAULT_REPEAT;
  let outDir = DEFAULT_OUT;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const value = args[index + 1];
    if (arg === '--reference' && value) {
      referencePath = value;
      index += 1;
    } else if (arg === '--current' && value) {
      currentPath = value;
      index += 1;
    } else if (arg === '--repeat' && value) {
      repeatPath = value === 'none' ? null : value;
      index += 1;
    } else if (arg === '--out' && value) {
      outDir = value;
      index += 1;
    } else {
      throw new Error(`Unknown or incomplete argument: ${arg}\n${usage()}`);
    }
  }

  const report = await writeMetadataStructuralOptimismReport({
    referencePath,
    currentPath,
    repeatPath,
    outDir,
  });
  console.log(`Wrote metadata structural optimism diagnostic to ${outDir}`);
  console.log(`Decision: ${report.decision.status}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
