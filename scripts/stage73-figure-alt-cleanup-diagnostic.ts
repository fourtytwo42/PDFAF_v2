#!/usr/bin/env tsx
import 'dotenv/config';

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { analyzePdf } from '../src/services/pdfAnalyzer.js';
import type { DocumentSnapshot } from '../src/types.js';
import { loadEdgeMixManifest, type EdgeMixManifestRow } from './stage49-edge-mix-baseline.js';
import {
  buildFigureCandidateDiagnostics,
  summarizeFigureCandidates,
  type FigureCandidateDiagnostic,
} from './stage50-figure-residual-diagnostic.js';

const DEFAULT_MANIFEST = 'Input/from_sibling_pdfaf_v1_edge_mix/manifest.json';
const DEFAULT_BASELINE_RUN = 'Output/from_sibling_pdfaf_v1_edge_mix/run-stage68-edge-mix-2026-04-25-r1';
const DEFAULT_OUT = 'Output/from_sibling_pdfaf_v1_edge_mix/stage73-figure-alt-cleanup-diagnostic-2026-04-25-r1';
const DEFAULT_TARGETS = new Set(['4145', '3921', '4139', '4567', '4683']);
const EXCLUDED_OBSERVATION_IDS = new Set(['4139', '4567', '4683']);

type FigureToolRow = {
  toolName?: unknown;
  outcome?: unknown;
  details?: unknown;
};

export type Stage73CandidateClass =
  | 'stable_rolemap_retag_progression_candidate'
  | 'control_or_high'
  | 'excluded_observation'
  | 'no_safe_path';

export interface Stage73FigureCleanupRow {
  id: string;
  publicationId: string;
  title: string;
  file: string;
  afterScore: number | null;
  afterGrade: string | null;
  altTextScore: number | null;
  falsePositiveApplied: number;
  retagAppliedCount: number;
  terminalSetAltNoEffectCount: number;
  terminalCanonicalizeNoEffectCount: number;
  attemptedTargetRefs: string[];
  remainingSafeRoleMapTargetCount: number;
  remainingSafeRoleMapTargets: string[];
  candidateClass: Stage73CandidateClass;
  implementable: boolean;
  reason: string;
  candidates: FigureCandidateDiagnostic[];
}

export interface Stage73FigureCleanupReport {
  baselineRun: string;
  rows: Stage73FigureCleanupRow[];
  decision: {
    selectedRows: string[];
    implementableCount: number;
    recommendedDirection: 'implement_bounded_rolemap_retag_progression' | 'diagnostic_only_no_safe_path';
  };
}

function usage(): string {
  return `Usage: pnpm exec tsx scripts/stage73-figure-alt-cleanup-diagnostic.ts [options]

Options:
  --manifest <path>      Edge-mix manifest path (default: ${DEFAULT_MANIFEST})
  --baseline-run <dir>   Benchmark run with remediate.results.json (default: ${DEFAULT_BASELINE_RUN})
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
  }
  return null;
}

function figureTools(row: unknown): FigureToolRow[] {
  if (!row || typeof row !== 'object') return [];
  const tools = (row as { appliedTools?: unknown }).appliedTools;
  if (!Array.isArray(tools)) return [];
  return tools
    .map(tool => tool as FigureToolRow)
    .filter(tool => typeof tool.toolName === 'string' && [
      'set_figure_alt_text',
      'retag_as_figure',
      'canonicalize_figure_alt_ownership',
      'normalize_nested_figure_containers',
    ].includes(tool.toolName));
}

function loadRunRows(runDir: string): Promise<Map<string, unknown>> {
  return readFile(join(runDir, 'remediate.results.json'), 'utf8')
    .then(raw => {
      const parsed = JSON.parse(raw) as unknown;
      const rows = Array.isArray(parsed) ? parsed : [];
      return new Map(rows.map(row => [String((row as { publicationId?: unknown }).publicationId ?? (row as { id?: unknown }).id ?? ''), row]));
    });
}

export function classifyStage73FigureCleanup(input: {
  publicationId: string;
  afterScore: number | null;
  afterGrade: string | null;
  altTextScore: number | null;
  falsePositiveApplied: number;
  candidates: FigureCandidateDiagnostic[];
  attemptedTargetRefs: string[];
  retagAppliedCount: number;
}): Pick<Stage73FigureCleanupRow, 'remainingSafeRoleMapTargetCount' | 'remainingSafeRoleMapTargets' | 'candidateClass' | 'implementable' | 'reason'> {
  const attempted = new Set(input.attemptedTargetRefs);
  const remainingSafeRoleMapTargets = input.candidates
    .filter(candidate => candidate.safeRoleMapRetagTarget && !candidate.hasAlt && !attempted.has(candidate.structRef))
    .map(candidate => candidate.structRef)
    .sort();
  if (EXCLUDED_OBSERVATION_IDS.has(input.publicationId)) {
    return {
      remainingSafeRoleMapTargetCount: remainingSafeRoleMapTargets.length,
      remainingSafeRoleMapTargets,
      candidateClass: 'excluded_observation',
      implementable: false,
      reason: 'excluded analyzer-volatility observation row',
    };
  }
  const grade = input.afterGrade ?? '';
  const lowAlt = (input.altTextScore ?? 100) < 70;
  const belowAB = !['A', 'B'].includes(grade);
  const hasSafeProgression = remainingSafeRoleMapTargets.length > 0 && input.retagAppliedCount >= 1;
  if (belowAB && lowAlt && hasSafeProgression && input.falsePositiveApplied === 0) {
    return {
      remainingSafeRoleMapTargetCount: remainingSafeRoleMapTargets.length,
      remainingSafeRoleMapTargets,
      candidateClass: 'stable_rolemap_retag_progression_candidate',
      implementable: true,
      reason: 'below A/B with low alt and remaining safe role-map retag targets after prior retag success',
    };
  }
  if (['A', 'B'].includes(grade) || (input.afterScore ?? 0) >= 80) {
    return {
      remainingSafeRoleMapTargetCount: remainingSafeRoleMapTargets.length,
      remainingSafeRoleMapTargets,
      candidateClass: 'control_or_high',
      implementable: false,
      reason: 'control row already A/B or score >= 80',
    };
  }
  return {
    remainingSafeRoleMapTargetCount: remainingSafeRoleMapTargets.length,
    remainingSafeRoleMapTargets,
    candidateClass: 'no_safe_path',
    implementable: false,
    reason: remainingSafeRoleMapTargets.length === 0 ? 'no remaining safe role-map retag target' : 'row does not meet conservative Stage 73 cleanup criteria',
  };
}

async function analyzeRow(row: EdgeMixManifestRow, runRows: Map<string, unknown>): Promise<Stage73FigureCleanupRow> {
  const baseline = runRows.get(row.publicationId) ?? runRows.get(row.id);
  const { snapshot } = await analyzePdf(row.absolutePath, basename(row.localFile), { bypassCache: true });
  return buildStage73Row(row, snapshot, baseline);
}

export function buildStage73Row(row: Pick<EdgeMixManifestRow, 'id' | 'publicationId' | 'title' | 'localFile'>, snapshot: DocumentSnapshot, baseline: unknown): Stage73FigureCleanupRow {
  const candidates = buildFigureCandidateDiagnostics(snapshot);
  const summary = summarizeFigureCandidates(candidates, baseline);
  const tools = figureTools(baseline);
  const retagAppliedCount = tools.filter(tool => tool.toolName === 'retag_as_figure' && tool.outcome === 'applied').length;
  const terminalSetAltNoEffectCount = tools.filter(tool => tool.toolName === 'set_figure_alt_text' && tool.outcome === 'no_effect').length;
  const terminalCanonicalizeNoEffectCount = tools.filter(tool => tool.toolName === 'canonicalize_figure_alt_ownership' && tool.outcome === 'no_effect').length;
  const falsePositiveApplied = Number((baseline as { falsePositiveApplied?: unknown } | undefined)?.falsePositiveApplied ?? 0);
  const classified = classifyStage73FigureCleanup({
    publicationId: row.publicationId,
    afterScore: num((baseline as { afterScore?: unknown } | undefined)?.afterScore),
    afterGrade: str((baseline as { afterGrade?: unknown } | undefined)?.afterGrade) || null,
    altTextScore: scoreFor(baseline, 'alt_text'),
    falsePositiveApplied,
    candidates,
    attemptedTargetRefs: summary.attemptedTargetRefs,
    retagAppliedCount,
  });
  return {
    id: row.id,
    publicationId: row.publicationId,
    title: row.title,
    file: row.localFile,
    afterScore: num((baseline as { afterScore?: unknown } | undefined)?.afterScore),
    afterGrade: str((baseline as { afterGrade?: unknown } | undefined)?.afterGrade) || null,
    altTextScore: scoreFor(baseline, 'alt_text'),
    falsePositiveApplied,
    retagAppliedCount,
    terminalSetAltNoEffectCount,
    terminalCanonicalizeNoEffectCount,
    attemptedTargetRefs: summary.attemptedTargetRefs,
    ...classified,
    candidates,
  };
}

export function buildStage73Report(baselineRun: string, rows: Stage73FigureCleanupRow[]): Stage73FigureCleanupReport {
  const selectedRows = rows.filter(row => row.implementable).map(row => `v1-${row.publicationId}`);
  return {
    baselineRun,
    rows,
    decision: {
      selectedRows,
      implementableCount: selectedRows.length,
      recommendedDirection: selectedRows.length > 0
        ? 'implement_bounded_rolemap_retag_progression'
        : 'diagnostic_only_no_safe_path',
    },
  };
}

function renderMarkdown(report: Stage73FigureCleanupReport): string {
  const lines = [
    '# Stage 73 Figure/Alt Cleanup Diagnostic',
    '',
    `Baseline run: \`${report.baselineRun}\``,
    '',
    `Decision: \`${report.decision.recommendedDirection}\``,
    `Implementable rows: ${report.decision.selectedRows.length ? report.decision.selectedRows.map(id => `\`${id}\``).join(', ') : 'none'}`,
    '',
    '| row | score | alt | class | retag applied | set-alt no-effect | canonicalize no-effect | remaining safe role-map targets | reason |',
    '| --- | ---: | ---: | --- | ---: | ---: | ---: | ---: | --- |',
  ];
  for (const row of report.rows) {
    lines.push(`| v1-${row.publicationId} | ${row.afterScore ?? 'n/a'} ${row.afterGrade ?? ''} | ${row.altTextScore ?? 'n/a'} | ${row.candidateClass} | ${row.retagAppliedCount} | ${row.terminalSetAltNoEffectCount} | ${row.terminalCanonicalizeNoEffectCount} | ${row.remainingSafeRoleMapTargetCount} | ${row.reason} |`);
  }
  lines.push('');
  lines.push('Stage 73 permits implementation only for stable rows with low alt, prior invariant-backed retag success, and remaining safe reachable role-mapped figure targets.');
  return `${lines.join('\n')}\n`;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  let manifestPath = DEFAULT_MANIFEST;
  let baselineRun = DEFAULT_BASELINE_RUN;
  let outDir = DEFAULT_OUT;
  const targets = new Set(DEFAULT_TARGETS);
  let explicitTargets = false;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--manifest') manifestPath = args[++i] ?? manifestPath;
    else if (arg === '--baseline-run') baselineRun = args[++i] ?? baselineRun;
    else if (arg === '--out') outDir = args[++i] ?? outDir;
    else if (arg === '--file') {
      if (!explicitTargets) {
        targets.clear();
        explicitTargets = true;
      }
      targets.add(args[++i] ?? '');
    } else if (arg === '--all') {
      targets.clear();
      explicitTargets = true;
    } else if (arg === '--help') {
      console.log(usage());
      return;
    }
  }

  const manifestRows = await loadEdgeMixManifest(manifestPath);
  const selectedRows = targets.size > 0
    ? manifestRows.filter(row => targets.has(row.publicationId) || targets.has(row.id))
    : manifestRows;
  const runRows = await loadRunRows(baselineRun);
  const rows: Stage73FigureCleanupRow[] = [];
  for (const row of selectedRows) rows.push(await analyzeRow(row, runRows));
  const report = buildStage73Report(baselineRun, rows);
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, 'stage73-figure-alt-cleanup-diagnostic.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await writeFile(join(outDir, 'stage73-figure-alt-cleanup-diagnostic.md'), renderMarkdown(report), 'utf8');
  console.log(`Wrote Stage 73 figure/alt cleanup diagnostic for ${rows.length} row(s): ${outDir}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}
