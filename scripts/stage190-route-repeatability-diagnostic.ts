#!/usr/bin/env tsx
import 'dotenv/config';

import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import {
  classifyStage190RouteRepeatability,
  stage190ToolEventFromAppliedTool,
  type Stage190RouteRepeatabilityClass,
  type Stage190RunEvidence,
} from '../src/services/remediation/stage190RouteRepeatability.js';
import type { AppliedRemediationTool, CategoryKey } from '../src/types.js';

type RowRole = 'primary' | 'control' | 'prior_win';

interface RunInput {
  label: string;
  dir: string;
}

interface RunCategory {
  key?: string;
  score?: number;
  applicable?: boolean;
}

interface RunRow {
  id?: string;
  file?: string;
  beforeScore?: number;
  beforeGrade?: string;
  afterScore?: number;
  afterGrade?: string;
  afterCategories?: RunCategory[];
  reanalyzedScore?: number;
  reanalyzedGrade?: string;
  reanalyzedCategories?: RunCategory[];
  appliedTools?: AppliedRemediationTool[];
  falsePositiveApplied?: number;
  falsePositiveAppliedCount?: number;
  protectedDebugStateCaptures?: Array<{
    score?: number;
    protectedRunSafe?: boolean;
    floorReached?: boolean;
  }>;
}

const DEFAULT_OUT = 'Output/stage190-route-repeatability-diagnostic-2026-05-03-r1';

const PRIMARY_IDS = ['holdout4-11', '4690', '4694'];
const CONTROL_IDS = ['4213', '4105', '4147', '4453', '4735', '4145', '4748', '4767'];
const PRIOR_WIN_IDS = ['3510', '4705', '3423', '3429', '3433', '3443', '3476', 'figure-4754', 'font-4057', 'font-4172'];

function usage(): string {
  return `Usage: pnpm exec tsx scripts/stage190-route-repeatability-diagnostic.ts [options]

Options:
  --run <label=dir>  Add a repeat run directory; repeatable
  --out <dir>        Output directory (default: ${DEFAULT_OUT})
  --help             Show this help`;
}

function repeatedArg(flag: string): string[] {
  const out: string[] = [];
  for (let index = 0; index < process.argv.length; index += 1) {
    if (process.argv[index] === flag && process.argv[index + 1]) out.push(process.argv[index + 1]!);
  }
  return out;
}

function argValue(flag: string): string | null {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] ?? null : null;
}

function normalize(value: unknown): string {
  return String(value ?? '')
    .toLowerCase()
    .replace(/^stage190-/, '')
    .replace(/^v1[-_]/, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function aliasForRow(row: RunRow): string {
  const rawId = String(row.id ?? '').toLowerCase();
  const id = normalize(row.id);
  const notes = normalize(row.file);
  for (const alias of [...PRIMARY_IDS, ...CONTROL_IDS, ...PRIOR_WIN_IDS]) {
    if (rawId.startsWith(`stage190-${alias.toLowerCase()}-`)) return alias;
    const normalizedAlias = normalize(alias);
    if (id === normalizedAlias || id.startsWith(`${normalizedAlias}-`) || notes.includes(normalizedAlias)) {
      return alias;
    }
  }
  return id || basename(row.file ?? 'unknown').replace(/\.pdf$/i, '');
}

function roleForAlias(alias: string): RowRole {
  if (PRIMARY_IDS.includes(alias)) return 'primary';
  if (PRIOR_WIN_IDS.includes(alias)) return 'prior_win';
  return 'control';
}

async function resolveRunDir(inputDir: string): Promise<string> {
  const absolute = resolve(inputDir);
  try {
    await readFile(join(absolute, 'remediate.results.json'), 'utf8');
    return absolute;
  } catch {
    const children = await readdir(absolute, { withFileTypes: true });
    const candidates = children
      .filter(child => child.isDirectory())
      .map(child => join(absolute, child.name))
      .sort();
    for (const candidate of candidates.reverse()) {
      try {
        await readFile(join(candidate, 'remediate.results.json'), 'utf8');
        return candidate;
      } catch {
        // continue
      }
    }
  }
  throw new Error(`Could not find remediate.results.json under ${inputDir}`);
}

function categoryMap(categories: RunCategory[] | undefined): Partial<Record<CategoryKey, number>> {
  const out: Partial<Record<CategoryKey, number>> = {};
  for (const category of categories ?? []) {
    if (typeof category.key === 'string' && typeof category.score === 'number' && category.applicable !== false) {
      out[category.key as CategoryKey] = category.score;
    }
  }
  return out;
}

function checkpointSafeScore(row: RunRow): number | null {
  const scores = (row.protectedDebugStateCaptures ?? [])
    .filter(checkpoint => checkpoint.protectedRunSafe === true || checkpoint.floorReached === true)
    .map(checkpoint => checkpoint.score)
    .filter((score): score is number => typeof score === 'number' && Number.isFinite(score));
  return scores.length > 0 ? Math.max(...scores) : null;
}

function evidenceFromRow(label: string, row: RunRow): Stage190RunEvidence {
  const reanalyzedCategories = categoryMap(row.reanalyzedCategories);
  return {
    label,
    score: typeof row.afterScore === 'number' ? row.afterScore : null,
    grade: row.afterGrade ?? null,
    reanalyzedScore: typeof row.reanalyzedScore === 'number' ? row.reanalyzedScore : null,
    reanalyzedGrade: row.reanalyzedGrade ?? null,
    categories: categoryMap(row.afterCategories),
    reanalyzedCategories,
    falsePositiveApplied: Number(row.falsePositiveAppliedCount ?? row.falsePositiveApplied ?? 0),
    finalPdfReanalyzed: row.reanalyzedScore !== undefined,
    checkpointSafeScore: checkpointSafeScore(row),
    tools: (row.appliedTools ?? []).map(stage190ToolEventFromAppliedTool),
  };
}

async function loadRun(input: RunInput): Promise<Map<string, { row: RunRow; evidence: Stage190RunEvidence }>> {
  const runDir = await resolveRunDir(input.dir);
  const rows = JSON.parse(await readFile(join(runDir, 'remediate.results.json'), 'utf8')) as RunRow[];
  const out = new Map<string, { row: RunRow; evidence: Stage190RunEvidence }>();
  for (const row of rows) {
    out.set(aliasForRow(row), { row, evidence: evidenceFromRow(input.label, row) });
  }
  return out;
}

function parseRuns(): RunInput[] {
  const args = repeatedArg('--run');
  if (args.length === 0) {
    return [
      { label: 'r1', dir: '/tmp/pdfaf-stage190-repeat-r1' },
      { label: 'r2', dir: '/tmp/pdfaf-stage190-repeat-r2' },
      { label: 'r3', dir: '/tmp/pdfaf-stage190-repeat-r3' },
      { label: 'write', dir: '/tmp/pdfaf-stage190-write-r1' },
    ];
  }
  return args.map(value => {
    const split = value.indexOf('=');
    if (split < 1) throw new Error(`Invalid --run "${value}", expected label=dir.`);
    return { label: value.slice(0, split), dir: value.slice(split + 1) };
  });
}

function mdCell(value: unknown): string {
  return String(value ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

async function main(): Promise<void> {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log(usage());
    return;
  }
  const outDir = argValue('--out') ?? DEFAULT_OUT;
  const runs = parseRuns();
  const loaded = await Promise.all(runs.map(loadRun));
  const aliases = [...PRIMARY_IDS, ...CONTROL_IDS, ...PRIOR_WIN_IDS];
  const rows = aliases.map(alias => {
    const rowRuns = loaded
      .map(run => run.get(alias)?.evidence)
      .filter((run): run is Stage190RunEvidence => Boolean(run));
    const decision = classifyStage190RouteRepeatability({ runs: rowRuns, role: roleForAlias(alias) });
    return {
      alias,
      role: roleForAlias(alias),
      decision,
      runs: rowRuns,
    };
  });
  const classDistribution = rows.reduce<Record<Stage190RouteRepeatabilityClass, number>>((acc, row) => {
    acc[row.decision.classification] = (acc[row.decision.classification] ?? 0) + 1;
    return acc;
  }, {} as Record<Stage190RouteRepeatabilityClass, number>);
  const behaviorCandidateRows = rows
    .filter(row => row.decision.behaviorCandidate)
    .map(row => row.alias);
  const report = {
    generatedAt: new Date().toISOString(),
    runs,
    classDistribution,
    behaviorCandidateRows,
    rows,
    decision: behaviorCandidateRows.length > 0
      ? 'investigate_one_stage190_route_fix'
      : 'diagnostic_only_no_safe_route_rule',
  };

  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, 'stage190-route-repeatability-diagnostic.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  const lines = ['# Stage 190 Mixed-Residual Route Repeatability', ''];
  lines.push('| Class | Count |');
  lines.push('|---|---:|');
  for (const [key, count] of Object.entries(classDistribution).sort()) {
    lines.push(`| ${key} | ${count} |`);
  }
  lines.push('');
  lines.push(`Decision: **${report.decision}**`);
  lines.push(`Behavior candidates: ${behaviorCandidateRows.length ? behaviorCandidateRows.map(row => `\`${row}\``).join(', ') : 'none'}`);
  lines.push('');
  lines.push('| Row | Role | Class | Scores | Good external runs | In-run-only good | First divergence | Reason |');
  lines.push('|---|---|---|---|---|---|---|---|');
  for (const row of rows) {
    const scores = row.runs.map(run => `${run.label}:${run.score ?? 'n/a'}/${run.reanalyzedScore ?? 'n/a'}`).join(', ');
    const divergence = row.decision.firstDivergence
      ? `${row.decision.firstDivergence.goodRun}/${row.decision.firstDivergence.badRun}@${row.decision.firstDivergence.index}: ${row.decision.firstDivergence.good ?? 'none'} vs ${row.decision.firstDivergence.bad ?? 'none'}`
      : 'none';
    lines.push(`| ${[
      `\`${row.alias}\``,
      row.role,
      row.decision.classification,
      scores,
      row.decision.externallyGoodRuns.join(', ') || 'none',
      row.decision.inRunGoodButExternalBadRuns.join(', ') || 'none',
      divergence,
      row.decision.reason,
    ].map(mdCell).join(' | ')} |`);
  }
  await writeFile(join(outDir, 'stage190-route-repeatability-diagnostic.md'), `${lines.join('\n')}\n`, 'utf8');

  console.log(`Wrote Stage 190 route repeatability diagnostic to ${outDir}`);
  console.log(JSON.stringify({
    classDistribution,
    behaviorCandidateRows,
    decision: report.decision,
  }, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}
