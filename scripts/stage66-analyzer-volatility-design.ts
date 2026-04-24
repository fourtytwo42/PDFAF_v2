#!/usr/bin/env tsx
import 'dotenv/config';

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

type JsonRecord = Record<string, unknown>;

export type Stage66RootCauseClass =
  | 'python_structural_drop_or_count_variance'
  | 'python_structural_order_only_variance'
  | 'typescript_merge_or_detection_variance'
  | 'remediation_path_variance_after_stable_analysis'
  | 'manual_scanned_or_policy_debt'
  | 'inconclusive_missing_repeat_detail';

export type Stage66Decision = 'canonicalizable' | 'non_canonicalizable_analyzer_debt' | 'remediation_path_debt' | 'policy_debt' | 'inconclusive';

export interface Stage66ReportInput {
  stage65ReportPath: string;
  analysisReportPaths: string[];
  boundaryReportPaths: string[];
}

export interface Stage66EvidenceSummary {
  source: string;
  kind: 'analysis_repeat' | 'structural_boundary';
  classification?: string;
  decisionStatus?: string;
  scoreRange: { min: number | null; max: number | null; delta: number | null };
  changedFields: string[];
  nonCanonicalFields: string[];
  canonicalizableFields: string[];
}

export interface Stage66RowReport {
  id: string;
  corpus: string;
  stage65Class: string;
  stage65Family: string;
  stage65ScoreRange: { min: number | null; max: number | null; delta: number | null };
  stage65Scores: Array<{ label: string; score: number | null; grade: string | null; categories: Record<string, number> }>;
  evidence: Stage66EvidenceSummary[];
  rootCause: Stage66RootCauseClass;
  decision: Stage66Decision;
  reasons: string[];
}

export interface Stage66Report {
  generatedAt: string;
  inputs: Stage66ReportInput;
  rows: Stage66RowReport[];
  distribution: Record<string, number>;
  decision: {
    status: 'diagnostic_only' | 'canonicalization_candidate' | 'inconclusive';
    recommendedNext: string;
    reasons: string[];
  };
}

const DEFAULT_OUT = 'Output/from_sibling_pdfaf_v1_edge_mix_2/stage66-analyzer-volatility-design-2026-04-24-r1';
const DEFAULT_STAGE65_REPORT = 'Output/from_sibling_pdfaf_v1_edge_mix_2/stage65-repeatability-decision-2026-04-24-r1/stage65-repeatability-decision.json';
const DEFAULT_ANALYSIS_REPORTS = [
  'Output/from_sibling_pdfaf_v1_edge_mix/stage56b-analysis-repeat-2026-04-24-r1/stage56b-analysis-repeat.json',
  'Output/from_sibling_pdfaf_v1_edge_mix_2/stage57-analysis-repeat-2026-04-24-r1/stage56b-analysis-repeat.json',
  'Output/from_sibling_pdfaf_v1_edge_mix_2/stage60-4487-analysis-repeat-2026-04-24-r1/stage56b-analysis-repeat.json',
];
const DEFAULT_BOUNDARY_REPORTS = [
  'Output/from_sibling_pdfaf_v1_edge_mix/stage58-structural-boundary-diagnostic-2026-04-24-r1/stage58-structural-boundary-diagnostic.json',
  'Output/from_sibling_pdfaf_v1_edge_mix_2/stage58-structural-boundary-diagnostic-2026-04-24-r1/stage58-structural-boundary-diagnostic.json',
  'Output/from_sibling_pdfaf_v1_edge_mix_2/stage66-4487-structural-boundary-2026-04-24-r1/stage58-structural-boundary-diagnostic.json',
];

function usage(): string {
  return [
    'Usage: pnpm exec tsx scripts/stage66-analyzer-volatility-design.ts [options]',
    `  --out <dir>             Default: ${DEFAULT_OUT}`,
    `  --stage65 <path>        Default: ${DEFAULT_STAGE65_REPORT}`,
    '  --analysis <path>       Add analysis-repeat JSON; repeatable',
    '  --boundary <path>       Add structural-boundary JSON; repeatable',
  ].join('\n');
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function rowId(row: JsonRecord): string {
  return str(row['id']) || str(row['rowId']);
}

function scoreRange(value: unknown): { min: number | null; max: number | null; delta: number | null } {
  const object = value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
  return { min: num(object['min']), max: num(object['max']), delta: num(object['delta']) };
}

function categoriesByScoreEntry(score: JsonRecord): Record<string, number> {
  const categories = score['categories'];
  if (!categories || typeof categories !== 'object' || Array.isArray(categories)) return {};
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(categories as JsonRecord)) {
    const scoreValue = num(value);
    if (scoreValue != null) out[key] = scoreValue;
  }
  return out;
}

function evidenceFromAnalysisReport(path: string, parsed: JsonRecord): Map<string, Stage66EvidenceSummary> {
  const out = new Map<string, Stage66EvidenceSummary>();
  const rows = Array.isArray(parsed['rows']) ? parsed['rows'] as JsonRecord[] : [];
  for (const row of rows) {
    const id = rowId(row);
    if (!id) continue;
    out.set(id, {
      source: path,
      kind: 'analysis_repeat',
      classification: str(row['classification']),
      scoreRange: scoreRange(row['scoreRange']),
      changedFields: Array.isArray(row['changedFields']) ? (row['changedFields'] as unknown[]).map(String).sort() : [],
      nonCanonicalFields: [],
      canonicalizableFields: [],
    });
  }
  return out;
}

function evidenceFromBoundaryReport(path: string, parsed: JsonRecord): Map<string, Stage66EvidenceSummary> {
  const out = new Map<string, Stage66EvidenceSummary>();
  const rows = Array.isArray(parsed['rows']) ? parsed['rows'] as JsonRecord[] : [];
  for (const row of rows) {
    const id = rowId(row);
    if (!id) continue;
    const comparisons = Array.isArray(row['comparisons']) ? row['comparisons'] as JsonRecord[] : [];
    const differing = comparisons.filter(comparison => str(comparison['kind']) !== 'stable');
    const nonCanonical = differing.filter(comparison => comparison['canonicalizable'] === false);
    const canonicalizable = differing.filter(comparison => comparison['canonicalizable'] === true);
    const decision = row['decision'] && typeof row['decision'] === 'object' && !Array.isArray(row['decision'])
      ? row['decision'] as JsonRecord
      : {};
    out.set(id, {
      source: path,
      kind: 'structural_boundary',
      decisionStatus: str(decision['status']),
      scoreRange: scoreRange(row['scoreRange']),
      changedFields: differing.map(comparison => `${str(comparison['field'])}:${str(comparison['kind'])}`).sort(),
      nonCanonicalFields: nonCanonical.map(comparison => str(comparison['field'])).filter(Boolean).sort(),
      canonicalizableFields: canonicalizable.map(comparison => str(comparison['field'])).filter(Boolean).sort(),
    });
  }
  return out;
}

async function readJson(path: string): Promise<JsonRecord | null> {
  try {
    const parsed = JSON.parse(await readFile(path, 'utf8')) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as JsonRecord : null;
  } catch {
    return null;
  }
}

async function loadEvidence(paths: string[], loader: (path: string, parsed: JsonRecord) => Map<string, Stage66EvidenceSummary>): Promise<Map<string, Stage66EvidenceSummary[]>> {
  const out = new Map<string, Stage66EvidenceSummary[]>();
  for (const path of paths) {
    const parsed = await readJson(path);
    if (!parsed) continue;
    for (const [id, evidence] of loader(path, parsed)) out.set(id, [...(out.get(id) ?? []), evidence]);
  }
  return out;
}

function classifyStage66Row(input: {
  stage65Row: JsonRecord;
  evidence: Stage66EvidenceSummary[];
}): Pick<Stage66RowReport, 'rootCause' | 'decision' | 'reasons'> {
  const id = str(input.stage65Row['id']);
  const stage65Class = str(input.stage65Row['class']);
  const stage65Family = str(input.stage65Row['residualFamily']);
  const reasons: string[] = [];
  const boundary = input.evidence.filter(item => item.kind === 'structural_boundary');
  const analysis = input.evidence.filter(item => item.kind === 'analysis_repeat');
  const hasStableAnalysis = analysis.some(item => item.classification === 'stable_analysis');
  const hasMergeDetection = analysis.some(item => item.classification === 'merge_or_detection_variance');
  const hasPythonVariance = analysis.some(item => item.classification === 'python_structure_variance');
  const nonCanonicalBoundary = boundary.filter(item => item.decisionStatus === 'non_canonicalizable_variance' || item.nonCanonicalFields.length > 0);
  const canonicalBoundary = boundary.filter(item => item.decisionStatus === 'canonicalization_candidate' || (item.canonicalizableFields.length > 0 && item.nonCanonicalFields.length === 0));

  if (stage65Class === 'manual_scanned_debt' || stage65Family === 'manual_scanned') {
    return {
      rootCause: 'manual_scanned_or_policy_debt',
      decision: 'policy_debt',
      reasons: ['manual_scanned_or_policy_debt'],
    };
  }
  if (nonCanonicalBoundary.length > 0) {
    reasons.push(`non_canonical_boundary_fields=${[...new Set(nonCanonicalBoundary.flatMap(item => item.nonCanonicalFields))].join(',') || 'unknown'}`);
    if (hasPythonVariance) reasons.push('analysis_repeat_reports_python_structure_variance');
    return {
      rootCause: 'python_structural_drop_or_count_variance',
      decision: 'non_canonicalizable_analyzer_debt',
      reasons,
    };
  }
  if (canonicalBoundary.length > 0) {
    reasons.push(`canonicalizable_boundary_fields=${[...new Set(canonicalBoundary.flatMap(item => item.canonicalizableFields))].join(',') || 'unknown'}`);
    return {
      rootCause: 'python_structural_order_only_variance',
      decision: 'canonicalizable',
      reasons,
    };
  }
  if (hasMergeDetection) {
    return {
      rootCause: 'typescript_merge_or_detection_variance',
      decision: 'canonicalizable',
      reasons: ['analysis_repeat_reports_merge_or_detection_variance'],
    };
  }
  if (hasStableAnalysis && ((scoreRange(input.stage65Row['scoreRange']).delta ?? 0) > 2 || stage65Class === 'parked_analyzer_volatility')) {
    return {
      rootCause: 'remediation_path_variance_after_stable_analysis',
      decision: 'remediation_path_debt',
      reasons: ['analysis_repeats_stable_but_benchmark_repeats_swing'],
    };
  }
  if (hasPythonVariance) {
    return {
      rootCause: 'inconclusive_missing_repeat_detail',
      decision: 'inconclusive',
      reasons: ['python_structure_variance_without_structural_boundary_detail'],
    };
  }
  if (id) reasons.push(`no_repeat_detail_for=${id}`);
  return {
    rootCause: 'inconclusive_missing_repeat_detail',
    decision: 'inconclusive',
    reasons: reasons.length ? reasons : ['missing_analysis_and_boundary_detail'],
  };
}

export function buildStage66Report(input: {
  stage65: JsonRecord;
  analysisEvidence: Map<string, Stage66EvidenceSummary[]>;
  boundaryEvidence: Map<string, Stage66EvidenceSummary[]>;
  inputs: Stage66ReportInput;
  generatedAt?: string;
}): Stage66Report {
  const stage65Rows = Array.isArray(input.stage65['rows']) ? input.stage65['rows'] as JsonRecord[] : [];
  const volatileRows = stage65Rows.filter(row => str(row['class']) === 'parked_analyzer_volatility' || str(row['class']) === 'manual_scanned_debt');
  const rows: Stage66RowReport[] = volatileRows.map(row => {
    const id = str(row['id']);
    const evidence = [...(input.analysisEvidence.get(id) ?? []), ...(input.boundaryEvidence.get(id) ?? [])];
    const classified = classifyStage66Row({ stage65Row: row, evidence });
    const scoreEntries = Array.isArray(row['scores']) ? row['scores'] as JsonRecord[] : [];
    return {
      id,
      corpus: str(row['corpus']),
      stage65Class: str(row['class']),
      stage65Family: str(row['residualFamily']),
      stage65ScoreRange: scoreRange(row['scoreRange']),
      stage65Scores: scoreEntries.map(score => ({
        label: str(score['label']),
        score: num(score['score']),
        grade: str(score['grade']) || null,
        categories: categoriesByScoreEntry(score),
      })),
      evidence,
      ...classified,
    };
  });
  const distribution: Record<string, number> = {};
  for (const row of rows) distribution[row.rootCause] = (distribution[row.rootCause] ?? 0) + 1;
  const inconclusive = rows.filter(row => row.decision === 'inconclusive');
  const canonicalizable = rows.filter(row => row.decision === 'canonicalizable');
  const status = inconclusive.length > 0
    ? 'inconclusive'
    : canonicalizable.length > 0
      ? 'canonicalization_candidate'
      : 'diagnostic_only';
  const recommendedNext = status === 'canonicalization_candidate'
    ? 'Design Stage 66B quality-preserving canonicalization only for rows/fields marked canonicalizable.'
    : status === 'inconclusive'
      ? 'Run focused analysis-repeat or structural-boundary diagnostics for inconclusive rows before choosing a fixer.'
      : 'Keep non-canonicalizable analyzer volatility parked and return to stable residual fixer selection.';
  return {
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    inputs: input.inputs,
    rows,
    distribution,
    decision: {
      status,
      recommendedNext,
      reasons: [
        `${rows.length} volatile/manual row(s) classified`,
        `${canonicalizable.length} canonicalizable row(s)`,
        `${rows.filter(row => row.decision === 'non_canonicalizable_analyzer_debt').length} non-canonicalizable analyzer-debt row(s)`,
        `${rows.filter(row => row.decision === 'remediation_path_debt').length} remediation-path-debt row(s)`,
        `${inconclusive.length} inconclusive row(s)`,
      ],
    },
  };
}

function parseArgs(argv: string[]): { outDir: string; stage65ReportPath: string; analysisReportPaths: string[]; boundaryReportPaths: string[] } {
  let outDir = DEFAULT_OUT;
  let stage65ReportPath = DEFAULT_STAGE65_REPORT;
  const analysisReportPaths: string[] = [];
  const boundaryReportPaths: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!;
    if (arg === '--out') outDir = argv[++index] ?? outDir;
    else if (arg === '--stage65') stage65ReportPath = argv[++index] ?? stage65ReportPath;
    else if (arg === '--analysis') analysisReportPaths.push(argv[++index] ?? '');
    else if (arg === '--boundary') boundaryReportPaths.push(argv[++index] ?? '');
    else if (arg === '--help' || arg === '-h') {
      console.log(usage());
      process.exit(0);
    } else {
      throw new Error(`Unknown argument ${arg}\n${usage()}`);
    }
  }
  return {
    outDir,
    stage65ReportPath,
    analysisReportPaths: analysisReportPaths.length ? analysisReportPaths.filter(Boolean) : [...DEFAULT_ANALYSIS_REPORTS],
    boundaryReportPaths: boundaryReportPaths.length ? boundaryReportPaths.filter(Boolean) : [...DEFAULT_BOUNDARY_REPORTS],
  };
}

function markdown(report: Stage66Report): string {
  const lines = ['# Stage 66 Analyzer Volatility Design', ''];
  lines.push(`Decision: **${report.decision.status}**`);
  lines.push(`Recommended next: ${report.decision.recommendedNext}`);
  lines.push(`Reasons: ${report.decision.reasons.join('; ')}`, '');
  lines.push('## Distribution', '');
  for (const [key, count] of Object.entries(report.distribution).sort()) lines.push(`- ${key}: ${count}`);
  lines.push('', '## Rows', '');
  lines.push('| Row | Corpus | Stage65 range | Root cause | Decision | Evidence |');
  lines.push('| --- | --- | --- | --- | --- | --- |');
  for (const row of report.rows) {
    const evidence = row.evidence.map(item => `${item.kind}:${item.classification ?? item.decisionStatus ?? 'unknown'}`).join(', ') || 'none';
    lines.push(`| ${row.id} | ${row.corpus} | ${row.stage65ScoreRange.min ?? 'n/a'}-${row.stage65ScoreRange.max ?? 'n/a'} (${row.stage65ScoreRange.delta ?? 'n/a'}) | ${row.rootCause} | ${row.decision} | ${evidence} |`);
  }
  for (const row of report.rows) {
    lines.push('', `## ${row.id}`);
    lines.push(`- Stage65 class/family: \`${row.stage65Class}\` / \`${row.stage65Family}\``);
    lines.push(`- Root cause: \`${row.rootCause}\``);
    lines.push(`- Decision: \`${row.decision}\``);
    lines.push(`- Reasons: ${row.reasons.join('; ')}`);
    for (const evidence of row.evidence) {
      lines.push(`- Evidence ${evidence.kind}: \`${evidence.classification ?? evidence.decisionStatus ?? 'unknown'}\`, scoreRange=${evidence.scoreRange.min ?? 'n/a'}-${evidence.scoreRange.max ?? 'n/a'} (${evidence.scoreRange.delta ?? 'n/a'}), changed=${evidence.changedFields.join(', ') || 'none'}, nonCanonical=${evidence.nonCanonicalFields.join(', ') || 'none'}`);
    }
  }
  return `${lines.join('\n')}\n`;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2).filter((arg, index) => !(index === 0 && arg === '--')));
  const stage65 = await readJson(args.stage65ReportPath);
  if (!stage65) throw new Error(`Missing or invalid Stage65 report: ${args.stage65ReportPath}`);
  const analysisEvidence = await loadEvidence(args.analysisReportPaths, evidenceFromAnalysisReport);
  const boundaryEvidence = await loadEvidence(args.boundaryReportPaths, evidenceFromBoundaryReport);
  const inputs = {
    stage65ReportPath: args.stage65ReportPath,
    analysisReportPaths: args.analysisReportPaths,
    boundaryReportPaths: args.boundaryReportPaths,
  };
  const report = buildStage66Report({ stage65, analysisEvidence, boundaryEvidence, inputs });
  await mkdir(args.outDir, { recursive: true });
  await writeFile(join(args.outDir, 'stage66-analyzer-volatility-design.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await writeFile(join(args.outDir, 'stage66-analyzer-volatility-design.md'), markdown(report), 'utf8');
  console.log(`Wrote Stage 66 analyzer-volatility design report to ${resolve(args.outDir)}`);
  console.log(`Decision: ${report.decision.status}`);
  console.log(report.decision.recommendedNext);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
