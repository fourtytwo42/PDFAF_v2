#!/usr/bin/env tsx
import 'dotenv/config';

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { analyzePdf } from '../src/services/pdfAnalyzer.js';
import type { DocumentSnapshot } from '../src/types.js';
import { loadEdgeMixManifest, type EdgeMixManifestRow } from './stage49-edge-mix-baseline.js';

const DEFAULT_MANIFEST = 'Input/from_sibling_pdfaf_v1_edge_mix/manifest.json';
const DEFAULT_BASELINE_RUN = 'Output/from_sibling_pdfaf_v1_edge_mix/run-stage49-baseline-2026-04-24-r1';
const DEFAULT_OUT_ROOT = 'Output/from_sibling_pdfaf_v1_edge_mix';
const DEFAULT_TARGETS = new Set(['4145', '4139', '3921', '4683', '4567']);

export interface FigureCandidateDiagnostic {
  structRef: string;
  page: number;
  rawRole: string | null;
  resolvedRole: string | null;
  reachable: boolean;
  directContent: boolean;
  subtreeMcidCount: number;
  hasAlt: boolean;
  altText?: string;
  checkerVisible: boolean;
  safeRoleMapRetagTarget: boolean;
  blocker: 'none' | 'role_map_mismatch' | 'unreachable' | 'no_content' | 'missing_alt' | 'not_figure_resolved';
}

export interface Stage50FigureDiagnosticRow {
  id: string;
  publicationId: string;
  title: string;
  file: string;
  afterScore?: number | null;
  afterGrade?: string | null;
  altTextScore?: number | null;
  candidates: FigureCandidateDiagnostic[];
  summary: {
    roleMapMismatchCount: number;
    safeRoleMapRetagTargetCount: number;
    reachableRawFigureMissingAltCount: number;
    unreachableFigureLikeCount: number;
    noContentFigureLikeCount: number;
    checkerVisibleFigureCount: number;
    checkerVisibleFigureWithAltCount: number;
    terminalFigureToolCount: number;
    scoreShapeFigureRejectionCount: number;
    invariantFigureFailureCount: number;
    attemptedTargetRefs: string[];
  };
}

function todayOutDir(): string {
  return join(DEFAULT_OUT_ROOT, `stage50-figure-diagnostic-${new Date().toISOString().slice(0, 10)}-r1`);
}

function isFigureRole(role: string | null | undefined): boolean {
  return (role ?? '').replace(/^\//, '').toLowerCase() === 'figure';
}

function scoreFor(row: unknown, key: string): number | null {
  const categories = (row as { afterCategories?: unknown }).afterCategories;
  if (!Array.isArray(categories)) return null;
  const found = categories.find(category => (category as { key?: unknown }).key === key) as { score?: unknown } | undefined;
  return typeof found?.score === 'number' ? found.score : null;
}

async function loadBaselineRows(runDir: string): Promise<Map<string, unknown>> {
  try {
    const parsed = JSON.parse(await readFile(join(runDir, 'remediate.results.json'), 'utf8')) as unknown;
    const rows = Array.isArray(parsed) ? parsed : [];
    return new Map(rows.map(row => [String((row as { publicationId?: unknown }).publicationId ?? ''), row]));
  } catch {
    return new Map();
  }
}

export function buildFigureCandidateDiagnostics(snapshot: DocumentSnapshot): FigureCandidateDiagnostic[] {
  const checkerVisibleRefs = new Set(
    (snapshot.checkerFigureTargets ?? [])
      .filter(target => target.reachable && !target.isArtifact && isFigureRole(target.resolvedRole ?? target.role))
      .map(target => target.structRef)
      .filter((value): value is string => typeof value === 'string' && value.length > 0),
  );
  return snapshot.figures
    .filter(figure => figure.structRef && !figure.isArtifact)
    .map(figure => {
      const rawRole = figure.rawRole ?? figure.role ?? null;
      const resolvedRole = figure.role ?? null;
      const reachable = figure.reachable === true;
      const directContent = figure.directContent === true;
      const subtreeMcidCount = figure.subtreeMcidCount ?? 0;
      const checkerVisible = checkerVisibleRefs.has(figure.structRef);
      const safeRoleMapRetagTarget =
        reachable &&
        isFigureRole(resolvedRole) &&
        !isFigureRole(rawRole) &&
        (directContent || subtreeMcidCount > 0);
      let blocker: FigureCandidateDiagnostic['blocker'] = 'none';
      if (!isFigureRole(resolvedRole)) blocker = 'not_figure_resolved';
      else if (!reachable) blocker = 'unreachable';
      else if (!directContent && subtreeMcidCount <= 0) blocker = 'no_content';
      else if (!isFigureRole(rawRole)) blocker = 'role_map_mismatch';
      else if (!figure.hasAlt) blocker = 'missing_alt';
      return {
        structRef: figure.structRef!,
        page: figure.page,
        rawRole,
        resolvedRole,
        reachable,
        directContent,
        subtreeMcidCount,
        hasAlt: figure.hasAlt,
        ...(figure.altText ? { altText: figure.altText } : {}),
        checkerVisible,
        safeRoleMapRetagTarget,
        blocker,
      };
    })
    .sort((a, b) => a.page - b.page || a.structRef.localeCompare(b.structRef));
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

function targetRefFromDetails(details: unknown): string | null {
  const parsed = parseDetails(details);
  const inv = parsed?.['invariants'];
  if (inv && typeof inv === 'object' && !Array.isArray(inv) && typeof (inv as Record<string, unknown>)['targetRef'] === 'string') {
    return (inv as Record<string, unknown>)['targetRef'] as string;
  }
  const replay = parsed?.['debug'];
  if (replay && typeof replay === 'object' && !Array.isArray(replay)) {
    const state = (replay as Record<string, unknown>)['replayState'];
    if (state && typeof state === 'object' && !Array.isArray(state) && typeof (state as Record<string, unknown>)['targetRef'] === 'string') {
      return (state as Record<string, unknown>)['targetRef'] as string;
    }
  }
  return null;
}

function figureTools(row: unknown): Array<{ toolName?: unknown; outcome?: unknown; details?: unknown }> {
  if (!row || typeof row !== 'object') return [];
  const tools = (row as { appliedTools?: unknown }).appliedTools;
  if (!Array.isArray(tools)) return [];
  return tools
    .map(tool => tool as { toolName?: unknown; outcome?: unknown; details?: unknown })
    .filter(tool => typeof tool.toolName === 'string' && [
      'normalize_nested_figure_containers',
      'canonicalize_figure_alt_ownership',
      'set_figure_alt_text',
      'retag_as_figure',
      'repair_alt_text_structure',
      'mark_figure_decorative',
    ].includes(tool.toolName));
}

export function summarizeFigureCandidates(
  candidates: FigureCandidateDiagnostic[],
  baselineRow?: unknown,
): Stage50FigureDiagnosticRow['summary'] {
  const terminal = figureTools(baselineRow).filter(tool => ['rejected', 'no_effect', 'failed'].includes(String(tool.outcome)));
  const attemptedTargetRefs = [...new Set(figureTools(baselineRow).map(tool => targetRefFromDetails(tool.details)).filter((value): value is string => Boolean(value)))].sort();
  return {
    roleMapMismatchCount: candidates.filter(candidate => candidate.blocker === 'role_map_mismatch').length,
    safeRoleMapRetagTargetCount: candidates.filter(candidate => candidate.safeRoleMapRetagTarget).length,
    reachableRawFigureMissingAltCount: candidates.filter(candidate => candidate.blocker === 'missing_alt').length,
    unreachableFigureLikeCount: candidates.filter(candidate => candidate.blocker === 'unreachable').length,
    noContentFigureLikeCount: candidates.filter(candidate => candidate.blocker === 'no_content').length,
    checkerVisibleFigureCount: candidates.filter(candidate => candidate.checkerVisible).length,
    checkerVisibleFigureWithAltCount: candidates.filter(candidate => candidate.checkerVisible && candidate.hasAlt).length,
    terminalFigureToolCount: terminal.length,
    scoreShapeFigureRejectionCount: terminal.filter(tool => /figure_stage_regressed_without_alt_improvement/.test(detailNote(tool.details))).length,
    invariantFigureFailureCount: terminal.filter(tool => invariantFailed(tool.details)).length,
    attemptedTargetRefs,
  };
}

async function analyzeRow(row: EdgeMixManifestRow, baselineRows: Map<string, unknown>): Promise<Stage50FigureDiagnosticRow> {
  const baseline = baselineRows.get(row.publicationId) as { afterScore?: number; afterGrade?: string } | undefined;
  const { snapshot } = await analyzePdf(row.absolutePath, basename(row.localFile), { bypassCache: true });
  const candidates = buildFigureCandidateDiagnostics(snapshot);
  return {
    id: row.id,
    publicationId: row.publicationId,
    title: row.title,
    file: row.localFile,
    afterScore: typeof baseline?.afterScore === 'number' ? baseline.afterScore : null,
    afterGrade: typeof baseline?.afterGrade === 'string' ? baseline.afterGrade : null,
    altTextScore: baseline ? scoreFor(baseline, 'alt_text') : null,
    candidates,
    summary: summarizeFigureCandidates(candidates, baseline),
  };
}

function renderMarkdown(rows: Stage50FigureDiagnosticRow[]): string {
  const lines = [
    '# Stage 50 Figure Residual Diagnostic',
    '',
    '| file | score | alt | checker-visible alt | missing-alt targets | terminal tools | score-shape rejects | invariant failures | main blockers |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |',
  ];
  for (const row of rows) {
    const blockers = Object.entries(
      row.candidates.reduce<Record<string, number>>((acc, candidate) => {
        acc[candidate.blocker] = (acc[candidate.blocker] ?? 0) + 1;
        return acc;
      }, {}),
    ).map(([key, value]) => `${key}:${value}`).join(', ');
    lines.push(`| ${row.publicationId} | ${row.afterScore ?? 'n/a'} ${row.afterGrade ?? ''} | ${row.altTextScore ?? 'n/a'} | ${row.summary.checkerVisibleFigureWithAltCount}/${row.summary.checkerVisibleFigureCount} | ${row.summary.reachableRawFigureMissingAltCount} | ${row.summary.terminalFigureToolCount} | ${row.summary.scoreShapeFigureRejectionCount} | ${row.summary.invariantFigureFailureCount} | ${blockers || 'none'} |`);
  }
  lines.push('');
  lines.push('Rows with low checker-visible alt coverage and score-shape rejects are Stage 59 bounded multi-target alt candidates.');
  return `${lines.join('\n')}\n`;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  let manifestPath = DEFAULT_MANIFEST;
  let baselineRun = DEFAULT_BASELINE_RUN;
  let outDir = todayOutDir();
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
    }
    else if (arg === '--help') {
      console.log('Usage: pnpm run benchmark:figure-diagnostic -- [--manifest path] [--baseline-run dir] [--out dir] [--file publicationId] [--all]');
      return;
    }
  }

  const manifestRows = await loadEdgeMixManifest(manifestPath);
  const rows = targets.size > 0
    ? manifestRows.filter(row => targets.has(row.publicationId))
    : manifestRows;
  const baselineRows = await loadBaselineRows(baselineRun);
  const diagnostics = [];
  for (const row of rows) diagnostics.push(await analyzeRow(row, baselineRows));
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, 'stage50-figure-diagnostic.json'), JSON.stringify({ rows: diagnostics }, null, 2));
  await writeFile(join(outDir, 'stage50-figure-diagnostic.md'), renderMarkdown(diagnostics));
  console.log(`Wrote Stage 50 figure diagnostic for ${diagnostics.length} row(s): ${outDir}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}
