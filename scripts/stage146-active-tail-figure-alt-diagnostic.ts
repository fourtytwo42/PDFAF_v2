#!/usr/bin/env tsx
import 'dotenv/config';

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { analyzePdf } from '../src/services/pdfAnalyzer.js';
import type { AnalysisResult, DocumentSnapshot } from '../src/types.js';
import { loadEdgeMixManifest, type EdgeMixManifestRow } from './stage49-edge-mix-baseline.js';
import {
  buildFigureCandidateDiagnostics,
  summarizeFigureCandidates,
  type FigureCandidateDiagnostic,
} from './stage50-figure-residual-diagnostic.js';

const DEFAULT_MANIFEST = 'Input/stage145-active-low-grade-tail/manifest.json';
const DEFAULT_BASELINE_RUN = 'Output/stage145-low-grade-tail/run-stage145-tail-baseline-2026-04-28-r1';
const DEFAULT_OUT = 'Output/stage145-low-grade-tail/stage146-active-tail-figure-alt-diagnostic-2026-04-28-r1';
const PARKED_ANALYZER_VOLATILITY_IDS = new Set(['v1-v1-4683', 'v1-v1-4171', 'orig-structure-4076']);

type FigureToolRow = {
  toolName?: unknown;
  outcome?: unknown;
  details?: unknown;
};

export type Stage146FigureAltClass =
  | 'cap_bound_remaining_safe_targets'
  | 'role_map_retag_candidate'
  | 'rejected_no_safe_target'
  | 'mixed_table_or_heading_blocker'
  | 'analyzer_volatility'
  | 'not_figure_alt_target';

export interface Stage146FigureAltRow {
  id: string;
  publicationId: string;
  title: string;
  file: string;
  afterScore: number | null;
  afterGrade: string | null;
  altTextScore: number | null;
  headingScore: number | null;
  readingOrderScore: number | null;
  tableScore: number | null;
  pdfUaScore: number | null;
  falsePositiveApplied: number;
  extractedFigureCount: number | null;
  treeFigureCount: number | null;
  checkerVisibleFigureCount: number;
  checkerVisibleFigureWithAltCount: number;
  checkerVisibleMissingAltCount: number;
  remainingSafeCheckerTargetCount: number;
  remainingSafeCheckerTargets: string[];
  remainingSafeRoleMapTargetCount: number;
  remainingSafeRoleMapTargets: string[];
  attemptedTargetRefs: string[];
  setAltAppliedCount: number;
  retagAppliedCount: number;
  terminalFigureToolCount: number;
  scoreShapeFigureRejectionCount: number;
  invariantFigureFailureCount: number;
  candidateClass: Stage146FigureAltClass;
  implementable: boolean;
  reason: string;
  candidates: FigureCandidateDiagnostic[];
}

export interface Stage146FigureAltReport {
  manifest: string;
  baselineRun: string;
  rows: Stage146FigureAltRow[];
  decision: {
    selectedRows: string[];
    classDistribution: Record<Stage146FigureAltClass, number>;
    recommendedDirection: 'implement_bounded_figure_alt_continuation' | 'diagnostic_only_no_safe_path';
  };
}

function usage(): string {
  return `Usage: pnpm exec tsx scripts/stage146-active-tail-figure-alt-diagnostic.ts [options]

Options:
  --manifest <path>      Active low-grade tail manifest (default: ${DEFAULT_MANIFEST})
  --baseline-run <dir>   Reference run with remediate.results.json (default: ${DEFAULT_BASELINE_RUN})
  --out <dir>            Output diagnostic directory (default: ${DEFAULT_OUT})
  --file <id>            Limit to publication id or manifest id; repeatable
  --all                  Analyze every manifest row
  --help                 Show this help`;
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function scoreFor(row: unknown, key: string): number | null {
  const categories = (row as { afterCategories?: unknown }).afterCategories;
  if (!Array.isArray(categories)) return null;
  const found = categories.find(category => (category as { key?: unknown }).key === key) as { score?: unknown } | undefined;
  return num(found?.score);
}

function detectionNumber(row: unknown, path: string[]): number | null {
  let current: unknown = row;
  for (const part of path) {
    if (!current || typeof current !== 'object' || Array.isArray(current)) return null;
    current = (current as Record<string, unknown>)[part];
  }
  return num(current);
}

function parseDetails(details: unknown): Record<string, unknown> | null {
  if (!details) return null;
  if (typeof details === 'object' && !Array.isArray(details)) return details as Record<string, unknown>;
  if (typeof details !== 'string') return null;
  const trimmed = details.trim();
  if (!trimmed.startsWith('{')) return null;
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function targetRefFromDetails(details: unknown): string | null {
  const parsed = parseDetails(details);
  const invariants = parsed?.['invariants'];
  if (invariants && typeof invariants === 'object' && !Array.isArray(invariants)) {
    const targetRef = (invariants as Record<string, unknown>)['targetRef'];
    if (typeof targetRef === 'string' && targetRef.length > 0) return targetRef;
  }
  const replayDebug = parsed?.['debug'];
  if (replayDebug && typeof replayDebug === 'object' && !Array.isArray(replayDebug)) {
    const replayState = (replayDebug as Record<string, unknown>)['replayState'];
    if (replayState && typeof replayState === 'object' && !Array.isArray(replayState)) {
      const targetRef = (replayState as Record<string, unknown>)['targetRef'];
      if (typeof targetRef === 'string' && targetRef.length > 0) return targetRef;
    }
    const targetRef = (replayDebug as Record<string, unknown>)['targetRef'];
    if (typeof targetRef === 'string' && targetRef.length > 0) return targetRef;
  }
  return null;
}

function detailNote(details: unknown): string {
  const parsed = parseDetails(details);
  if (typeof parsed?.['note'] === 'string') return parsed['note'];
  if (typeof parsed?.['raw'] === 'string') return parsed['raw'];
  return typeof details === 'string' ? details : '';
}

function invariantFailed(details: unknown): boolean {
  const parsed = parseDetails(details);
  const inv = parsed?.['invariants'];
  if (!inv || typeof inv !== 'object' || Array.isArray(inv)) return false;
  const invariants = inv as Record<string, unknown>;
  return invariants['targetReachable'] === false ||
    invariants['targetIsFigureAfter'] === false ||
    invariants['targetHasAltAfter'] === false ||
    invariants['ownershipPreserved'] === false;
}

function isFigureRole(role: string | null | undefined): boolean {
  return (role ?? '').replace(/^\//, '').toLowerCase() === 'figure';
}

function figureTools(row: unknown): FigureToolRow[] {
  if (!row || typeof row !== 'object') return [];
  const tools = (row as { appliedTools?: unknown }).appliedTools;
  if (!Array.isArray(tools)) return [];
  return tools
    .map(tool => tool as FigureToolRow)
    .filter(tool => typeof tool.toolName === 'string' && [
      'normalize_nested_figure_containers',
      'canonicalize_figure_alt_ownership',
      'set_figure_alt_text',
      'retag_as_figure',
      'repair_alt_text_structure',
      'mark_figure_decorative',
    ].includes(tool.toolName));
}

function safeCheckerTargets(snapshot: DocumentSnapshot, attemptedRefs: Set<string>): string[] {
  return (snapshot.checkerFigureTargets ?? [])
    .filter(target =>
      target.reachable &&
      target.directContent &&
      !target.isArtifact &&
      !target.hasAlt &&
      typeof target.structRef === 'string' &&
      target.structRef.length > 0 &&
      !attemptedRefs.has(target.structRef) &&
      isFigureRole(target.resolvedRole ?? target.role)
    )
    .map(target => target.structRef!)
    .sort();
}

function safeRoleMapTargets(candidates: FigureCandidateDiagnostic[], attemptedRefs: Set<string>): string[] {
  return candidates
    .filter(candidate => candidate.safeRoleMapRetagTarget && !candidate.hasAlt && !attemptedRefs.has(candidate.structRef))
    .map(candidate => candidate.structRef)
    .sort();
}

async function loadRunRows(runDir: string): Promise<Map<string, unknown>> {
  const parsed = JSON.parse(await readFile(join(runDir, 'remediate.results.json'), 'utf8')) as unknown;
  const rows = Array.isArray(parsed) ? parsed : [];
  const out = new Map<string, unknown>();
  for (const row of rows) {
    const obj = row as { id?: unknown; publicationId?: unknown };
    if (typeof obj.publicationId === 'string') out.set(obj.publicationId, row);
    if (typeof obj.id === 'string') out.set(obj.id, row);
  }
  return out;
}

export function classifyStage146FigureAlt(input: {
  publicationId: string;
  afterScore: number | null;
  afterGrade: string | null;
  altTextScore: number | null;
  headingScore: number | null;
  readingOrderScore: number | null;
  tableScore: number | null;
  falsePositiveApplied: number;
  setAltAppliedCount: number;
  retagAppliedCount: number;
  terminalFigureToolCount: number;
  remainingSafeCheckerTargetCount: number;
  remainingSafeRoleMapTargetCount: number;
  scoreShapeFigureRejectionCount: number;
  invariantFigureFailureCount: number;
}): Pick<Stage146FigureAltRow, 'candidateClass' | 'implementable' | 'reason'> {
  const grade = input.afterGrade ?? '';
  const alt = input.altTextScore ?? 100;
  const score = input.afterScore ?? 100;
  if (PARKED_ANALYZER_VOLATILITY_IDS.has(input.publicationId)) {
    return { candidateClass: 'analyzer_volatility', implementable: false, reason: 'parked analyzer-volatility row from prior repeat evidence' };
  }
  if (input.falsePositiveApplied > 0) {
    return { candidateClass: 'rejected_no_safe_target', implementable: false, reason: 'false-positive applied is already nonzero in reference run' };
  }
  if (grade === 'A' || grade === 'B' || alt >= 80) {
    return { candidateClass: 'not_figure_alt_target', implementable: false, reason: 'row is already A/B or alt_text is not failing' };
  }
  if (score < 90 && input.setAltAppliedCount >= 3 && input.remainingSafeCheckerTargetCount > 0) {
    return { candidateClass: 'cap_bound_remaining_safe_targets', implementable: true, reason: 'three figure-alt targets already applied and safe checker-visible missing-alt targets remain' };
  }
  if (score < 90 && input.retagAppliedCount >= 2 && input.remainingSafeRoleMapTargetCount > 0) {
    return { candidateClass: 'role_map_retag_candidate', implementable: true, reason: 'two retags already applied and safe role-map figure targets remain' };
  }
  const structuralBlocker = (input.headingScore ?? 100) < 80 || (input.readingOrderScore ?? 100) < 80 || (input.tableScore ?? 100) < 80;
  if (structuralBlocker) {
    return { candidateClass: 'mixed_table_or_heading_blocker', implementable: false, reason: 'alt_text is mixed with heading, reading-order, or table debt and lacks a safe Stage 146 continuation target' };
  }
  if (
    input.terminalFigureToolCount > 0 ||
    input.scoreShapeFigureRejectionCount > 0 ||
    input.invariantFigureFailureCount > 0 ||
    input.remainingSafeCheckerTargetCount === 0 ||
    input.remainingSafeRoleMapTargetCount === 0
  ) {
    return { candidateClass: 'rejected_no_safe_target', implementable: false, reason: 'figure tools reached terminal outcomes or no safe unattempted target remains' };
  }
  return { candidateClass: 'not_figure_alt_target', implementable: false, reason: 'no Stage 146 figure-alt condition matched' };
}

export function buildStage146Row(
  row: Pick<EdgeMixManifestRow, 'id' | 'publicationId' | 'title' | 'localFile'>,
  snapshot: DocumentSnapshot,
  baseline: unknown,
): Stage146FigureAltRow {
  const candidates = buildFigureCandidateDiagnostics(snapshot);
  const summary = summarizeFigureCandidates(candidates, baseline);
  const tools = figureTools(baseline);
  const attemptedTargetRefs = summary.attemptedTargetRefs;
  const attempted = new Set(attemptedTargetRefs);
  const setAltAppliedCount = tools.filter(tool => tool.toolName === 'set_figure_alt_text' && tool.outcome === 'applied').length;
  const retagAppliedCount = tools.filter(tool => tool.toolName === 'retag_as_figure' && tool.outcome === 'applied').length;
  const terminal = tools.filter(tool => ['rejected', 'no_effect', 'failed'].includes(String(tool.outcome)));
  const scoreShapeFigureRejectionCount = terminal.filter(tool => /figure_stage_regressed_without_alt_improvement/.test(detailNote(tool.details))).length;
  const invariantFigureFailureCount = terminal.filter(tool => invariantFailed(tool.details)).length;
  const remainingSafeCheckerTargets = safeCheckerTargets(snapshot, attempted);
  const remainingSafeRoleMapTargets = safeRoleMapTargets(candidates, attempted);
  const checkerVisibleFigureCount = (snapshot.checkerFigureTargets ?? [])
    .filter(target => target.reachable && !target.isArtifact && isFigureRole(target.resolvedRole ?? target.role)).length;
  const checkerVisibleFigureWithAltCount = (snapshot.checkerFigureTargets ?? [])
    .filter(target => target.reachable && !target.isArtifact && target.hasAlt && isFigureRole(target.resolvedRole ?? target.role)).length;
  const rowCore = {
    afterScore: num((baseline as { afterScore?: unknown } | undefined)?.afterScore),
    afterGrade: str((baseline as { afterGrade?: unknown } | undefined)?.afterGrade) || null,
    altTextScore: scoreFor(baseline, 'alt_text'),
    headingScore: scoreFor(baseline, 'heading_structure'),
    readingOrderScore: scoreFor(baseline, 'reading_order'),
    tableScore: scoreFor(baseline, 'table_markup'),
    falsePositiveApplied: Number((baseline as { falsePositiveAppliedCount?: unknown; falsePositiveApplied?: unknown } | undefined)?.falsePositiveAppliedCount
      ?? (baseline as { falsePositiveApplied?: unknown } | undefined)?.falsePositiveApplied
      ?? 0),
    setAltAppliedCount,
    retagAppliedCount,
    terminalFigureToolCount: terminal.length,
    remainingSafeCheckerTargetCount: remainingSafeCheckerTargets.length,
    remainingSafeRoleMapTargetCount: remainingSafeRoleMapTargets.length,
    scoreShapeFigureRejectionCount,
    invariantFigureFailureCount,
  };
  const classified = classifyStage146FigureAlt({
    publicationId: row.publicationId,
    ...rowCore,
  });
  return {
    id: row.id,
    publicationId: row.publicationId,
    title: row.title,
    file: row.localFile,
    ...rowCore,
    pdfUaScore: scoreFor(baseline, 'pdf_ua_compliance'),
    extractedFigureCount: detectionNumber(baseline, ['afterDetectionProfile', 'figureSignals', 'extractedFigureCount']),
    treeFigureCount: detectionNumber(baseline, ['afterDetectionProfile', 'figureSignals', 'treeFigureCount']),
    checkerVisibleFigureCount,
    checkerVisibleFigureWithAltCount,
    checkerVisibleMissingAltCount: Math.max(0, checkerVisibleFigureCount - checkerVisibleFigureWithAltCount),
    remainingSafeCheckerTargets,
    remainingSafeRoleMapTargets,
    attemptedTargetRefs,
    ...classified,
    candidates,
  };
}

export function buildStage146Report(manifest: string, baselineRun: string, rows: Stage146FigureAltRow[]): Stage146FigureAltReport {
  const classDistribution = rows.reduce<Record<Stage146FigureAltClass, number>>((acc, row) => {
    acc[row.candidateClass] = (acc[row.candidateClass] ?? 0) + 1;
    return acc;
  }, {
    cap_bound_remaining_safe_targets: 0,
    role_map_retag_candidate: 0,
    rejected_no_safe_target: 0,
    mixed_table_or_heading_blocker: 0,
    analyzer_volatility: 0,
    not_figure_alt_target: 0,
  });
  const selectedRows = rows.filter(row => row.implementable).map(row => row.publicationId).sort();
  return {
    manifest,
    baselineRun,
    rows,
    decision: {
      selectedRows,
      classDistribution,
      recommendedDirection: selectedRows.length > 0
        ? 'implement_bounded_figure_alt_continuation'
        : 'diagnostic_only_no_safe_path',
    },
  };
}

function renderMarkdown(report: Stage146FigureAltReport): string {
  const lines = [
    '# Stage 146 Active-Tail Figure/Alt Diagnostic',
    '',
    `Manifest: \`${report.manifest}\``,
    `Baseline run: \`${report.baselineRun}\``,
    '',
    `Decision: \`${report.decision.recommendedDirection}\``,
    `Selected rows: ${report.decision.selectedRows.length ? report.decision.selectedRows.map(id => `\`${id}\``).join(', ') : 'none'}`,
    '',
    '| Class | Count |',
    '| --- | ---: |',
    ...Object.entries(report.decision.classDistribution).map(([key, count]) => `| ${key} | ${count} |`),
    '',
    '| Row | Score | Alt | Head | Read | Table | Class | Set-alt applied | Retag applied | Remaining checker | Remaining role-map | Terminal | Reason |',
    '| --- | ---: | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: | ---: | ---: | --- |',
  ];
  for (const row of report.rows) {
    lines.push(`| ${row.publicationId} | ${row.afterScore ?? 'n/a'} ${row.afterGrade ?? ''} | ${row.altTextScore ?? 'n/a'} | ${row.headingScore ?? 'n/a'} | ${row.readingOrderScore ?? 'n/a'} | ${row.tableScore ?? 'n/a'} | ${row.candidateClass} | ${row.setAltAppliedCount} | ${row.retagAppliedCount} | ${row.remainingSafeCheckerTargetCount} | ${row.remainingSafeRoleMapTargetCount} | ${row.terminalFigureToolCount} | ${row.reason} |`);
  }
  lines.push('');
  lines.push('Stage 146 permits behavior only for rows with existing invariant-backed figure-alt/retag progress and safe unattempted targets.');
  return `${lines.join('\n')}\n`;
}

async function analyzeRow(row: EdgeMixManifestRow, runRows: Map<string, unknown>): Promise<Stage146FigureAltRow> {
  const baseline = runRows.get(row.publicationId) ?? runRows.get(row.id);
  const { snapshot } = await analyzePdf(row.absolutePath, basename(row.localFile), { bypassCache: true });
  return buildStage146Row(row, snapshot, baseline);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  let manifestPath = DEFAULT_MANIFEST;
  let baselineRun = DEFAULT_BASELINE_RUN;
  let outDir = DEFAULT_OUT;
  const targets = new Set<string>();
  let analyzeAll = true;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--manifest') manifestPath = args[++i] ?? manifestPath;
    else if (arg === '--baseline-run') baselineRun = args[++i] ?? baselineRun;
    else if (arg === '--out') outDir = args[++i] ?? outDir;
    else if (arg === '--file') {
      analyzeAll = false;
      targets.add(args[++i] ?? '');
    } else if (arg === '--all') {
      analyzeAll = true;
      targets.clear();
    } else if (arg === '--help') {
      console.log(usage());
      return;
    } else {
      throw new Error(`Unknown argument ${arg}\n${usage()}`);
    }
  }

  const manifestRows = await loadEdgeMixManifest(manifestPath);
  const selectedRows = analyzeAll
    ? manifestRows
    : manifestRows.filter(row => targets.has(row.publicationId) || targets.has(row.id));
  const runRows = await loadRunRows(baselineRun);
  const rows: Stage146FigureAltRow[] = [];
  for (const row of selectedRows) rows.push(await analyzeRow(row, runRows));
  const report = buildStage146Report(manifestPath, baselineRun, rows);
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, 'stage146-active-tail-figure-alt-diagnostic.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await writeFile(join(outDir, 'stage146-active-tail-figure-alt-diagnostic.md'), renderMarkdown(report), 'utf8');
  console.log(`Wrote Stage 146 active-tail figure/alt diagnostic for ${rows.length} row(s): ${outDir}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}
