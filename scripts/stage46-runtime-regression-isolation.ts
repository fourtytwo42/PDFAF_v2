#!/usr/bin/env tsx
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

type CategoryScores = Record<string, number>;

interface ToolRow {
  toolName?: string;
  name?: string;
  outcome?: string;
  stage?: number;
  round?: number;
  source?: string;
  scoreBefore?: number;
  scoreAfter?: number;
  details?: unknown;
}

interface BenchmarkRow {
  id: string;
  file?: string;
  afterScore?: number;
  afterGrade?: string;
  afterCategories?: Array<{ key: string; score: number }>;
  appliedTools?: ToolRow[];
  wallRemediateMs?: number;
}

interface RunData {
  runDir: string;
  rows: Map<string, BenchmarkRow>;
}

interface DivergenceSummary {
  rowId: string;
  file: string | null;
  baseline: {
    score: number;
    grade: string | null;
    wallMs: number;
    categories: CategoryScores;
  };
  candidate: {
    score: number;
    grade: string | null;
    wallMs: number;
    categories: CategoryScores;
  };
  scoreDelta: number;
  wallDeltaMs: number;
  firstDivergentAcceptedTool: DivergentTool | null;
  firstDivergentRejectedTool: DivergentTool | null;
  firstStructuralCategoryDelta: CategoryDelta | null;
  likelyGuardSources: string[];
}

interface DivergentTool {
  index: number;
  baseline: ToolFingerprint | null;
  candidate: ToolFingerprint | null;
}

interface ToolFingerprint {
  toolName: string;
  outcome: string;
  stage: number | null;
  round: number | null;
  source: string | null;
  scoreBefore: number | null;
  scoreAfter: number | null;
  note: string | null;
  guardSignals: string[];
}

interface CategoryDelta {
  key: string;
  baseline: number;
  candidate: number;
  delta: number;
}

const DEFAULT_IDS = [
  'figure-4188',
  'structure-4076',
  'fixture-teams-targeted-wave1',
  'long-4683',
  'structure-4438',
  'long-4516',
];

function usage(): string {
  return [
    'Usage: pnpm exec tsx scripts/stage46-runtime-regression-isolation.ts [--id row-id ...] <baseline-run-dir> <candidate-run-dir> [out-dir]',
    'If out-dir is provided, writes stage46-runtime-regression-isolation.{json,md}.',
  ].join('\n');
}

function parseArgs(argv: string[]): { ids: string[]; paths: string[] } {
  const ids: string[] = [];
  const paths: string[] = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    if (arg === '--id') {
      const value = argv[i + 1];
      if (!value) throw new Error('Missing value after --id');
      ids.push(value);
      i += 1;
      continue;
    }
    paths.push(arg);
  }
  return { ids, paths };
}

async function loadRun(runDir: string): Promise<RunData> {
  const path = join(resolve(runDir), 'remediate.results.json');
  const raw = JSON.parse(await readFile(path, 'utf8')) as BenchmarkRow[] | { rows?: BenchmarkRow[] };
  const rows = Array.isArray(raw) ? raw : raw.rows;
  if (!Array.isArray(rows)) {
    throw new Error(`No remediation rows found in ${path}`);
  }
  return {
    runDir: resolve(runDir),
    rows: new Map(rows.map(row => [row.id, row])),
  };
}

function categories(row?: BenchmarkRow): CategoryScores {
  return Object.fromEntries((row?.afterCategories ?? []).map(category => [category.key, category.score]));
}

function parseDetails(details: unknown): Record<string, unknown> {
  if (!details) return {};
  if (typeof details === 'object') return details as Record<string, unknown>;
  if (typeof details !== 'string') return {};
  try {
    const parsed = JSON.parse(details);
    return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : {};
  } catch {
    return { raw: details };
  }
}

function noteFromDetails(details: Record<string, unknown>): string | null {
  const note = details['note'];
  if (typeof note === 'string') return note;
  const raw = details['raw'];
  return typeof raw === 'string' ? raw : null;
}

function classifyGuardSignals(tool: ToolRow | undefined): string[] {
  const details = parseDetails(tool?.details);
  const note = noteFromDetails(details);
  const signals: string[] = [];
  if (details?.debug && typeof details.debug === 'object' && typeof (details.debug as Record<string, unknown>)['runtimeTailStateSignature'] === 'string') {
    signals.push('runtime_tail_signature');
  }
  if (note?.includes('post_pass_regressed_score(')) {
    signals.push('post_pass_rejected');
  }
  if (note?.includes('protected_')) {
    signals.push('protected_flow');
  }
  const invariants = details['invariants'];
  if (invariants && typeof invariants === 'object') {
    const inv = invariants as Record<string, unknown>;
    if (
      inv['visibleAnnotationsMissingStructParentBefore'] === 0 &&
      inv['visibleAnnotationsMissingStructParentAfter'] === 0 &&
      inv['visibleAnnotationsMissingStructureBefore'] === 0 &&
      inv['visibleAnnotationsMissingStructureAfter'] === 0
    ) {
      signals.push('annotation_zero_debt');
    }
  }
  if (tool?.toolName === 'repair_native_link_structure' || tool?.toolName === 'tag_unowned_annotations') {
    signals.push('annotation_family_tool');
  }
  if (tool?.toolName === 'set_pdfua_identification') {
    signals.push('post_pass_pdfua_tool');
  }
  return signals;
}

function fingerprint(tool: ToolRow | undefined): ToolFingerprint | null {
  if (!tool) return null;
  const details = parseDetails(tool.details);
  return {
    toolName: tool.toolName ?? tool.name ?? 'unknown',
    outcome: tool.outcome ?? 'unknown',
    stage: typeof tool.stage === 'number' ? tool.stage : null,
    round: typeof tool.round === 'number' ? tool.round : null,
    source: typeof tool.source === 'string' ? tool.source : null,
    scoreBefore: typeof tool.scoreBefore === 'number' ? tool.scoreBefore : null,
    scoreAfter: typeof tool.scoreAfter === 'number' ? tool.scoreAfter : null,
    note: noteFromDetails(details),
    guardSignals: classifyGuardSignals(tool),
  };
}

function isAccepted(tool: ToolRow | undefined): boolean {
  return tool?.outcome === 'applied';
}

function isRejected(tool: ToolRow | undefined): boolean {
  return tool?.outcome === 'rejected' || tool?.outcome === 'no_effect' || tool?.outcome === 'failed';
}

function comparableKey(tool: ToolRow | undefined): string {
  if (!tool) return 'missing';
  const fp = fingerprint(tool);
  return JSON.stringify({
    toolName: fp?.toolName ?? null,
    outcome: fp?.outcome ?? null,
    stage: fp?.stage ?? null,
    round: fp?.round ?? null,
    source: fp?.source ?? null,
    note: fp?.note ?? null,
  });
}

function firstDivergentTool(
  baselineTools: ToolRow[],
  candidateTools: ToolRow[],
  predicate: (tool: ToolRow | undefined) => boolean,
): DivergentTool | null {
  const max = Math.max(baselineTools.length, candidateTools.length);
  for (let index = 0; index < max; index += 1) {
    const baseline = baselineTools[index];
    const candidate = candidateTools[index];
    if (!predicate(baseline) && !predicate(candidate)) continue;
    if (comparableKey(baseline) !== comparableKey(candidate)) {
      return {
        index,
        baseline: predicate(baseline) ? fingerprint(baseline) : null,
        candidate: predicate(candidate) ? fingerprint(candidate) : null,
      };
    }
  }
  return null;
}

function firstCategoryDelta(baseline: CategoryScores, candidate: CategoryScores): CategoryDelta | null {
  const keys = [
    'heading_structure',
    'reading_order',
    'alt_text',
    'table_markup',
    'title_language',
    'pdf_ua_compliance',
    'link_quality',
  ];
  for (const key of keys) {
    const before = baseline[key];
    const after = candidate[key];
    if (typeof before === 'number' && typeof after === 'number' && before !== after) {
      return { key, baseline: before, candidate: after, delta: after - before };
    }
  }
  return null;
}

function likelySources(summary: {
  accepted: DivergentTool | null;
  rejected: DivergentTool | null;
  categoryDelta: CategoryDelta | null;
}): string[] {
  const sources = new Set<string>();
  const allFingerprints = [summary.accepted?.baseline, summary.accepted?.candidate, summary.rejected?.baseline, summary.rejected?.candidate]
    .filter((value): value is ToolFingerprint => Boolean(value));
  for (const fp of allFingerprints) {
    for (const signal of fp.guardSignals) {
      if (signal === 'annotation_zero_debt' || signal === 'annotation_family_tool') {
        sources.add('annotation_ownership_family_blocking');
      }
      if (signal === 'post_pass_pdfua_tool' || signal === 'runtime_tail_signature') {
        sources.add('tagged_cleanup_post_pass_suppression');
      }
    }
  }
  if (sources.size === 0 && allFingerprints.some(fp => fp.source === 'planner')) {
    sources.add('planner_loop_same_state_suppression');
  }
  if (sources.size === 0 && summary.categoryDelta) {
    sources.add('unclassified_runtime_guard_interaction');
  }
  return [...sources];
}

function summarizeRow(id: string, baseline: BenchmarkRow | undefined, candidate: BenchmarkRow | undefined): DivergenceSummary {
  const baselineTools = baseline?.appliedTools ?? [];
  const candidateTools = candidate?.appliedTools ?? [];
  const baselineCats = categories(baseline);
  const candidateCats = categories(candidate);
  const accepted = firstDivergentTool(baselineTools, candidateTools, isAccepted);
  const rejected = firstDivergentTool(baselineTools, candidateTools, isRejected);
  const categoryDelta = firstCategoryDelta(baselineCats, candidateCats);
  return {
    rowId: id,
    file: baseline?.file ?? candidate?.file ?? null,
    baseline: {
      score: baseline?.afterScore ?? 0,
      grade: baseline?.afterGrade ?? null,
      wallMs: baseline?.wallRemediateMs ?? 0,
      categories: baselineCats,
    },
    candidate: {
      score: candidate?.afterScore ?? 0,
      grade: candidate?.afterGrade ?? null,
      wallMs: candidate?.wallRemediateMs ?? 0,
      categories: candidateCats,
    },
    scoreDelta: (candidate?.afterScore ?? 0) - (baseline?.afterScore ?? 0),
    wallDeltaMs: (candidate?.wallRemediateMs ?? 0) - (baseline?.wallRemediateMs ?? 0),
    firstDivergentAcceptedTool: accepted,
    firstDivergentRejectedTool: rejected,
    firstStructuralCategoryDelta: categoryDelta,
    likelyGuardSources: likelySources({ accepted, rejected, categoryDelta }),
  };
}

function markdown(report: DivergenceSummary[], baselineRunDir: string, candidateRunDir: string): string {
  const lines = [
    '# Stage 46 Runtime Regression Isolation',
    '',
    `- Baseline: \`${baselineRunDir}\``,
    `- Candidate: \`${candidateRunDir}\``,
    '',
  ];
  for (const row of report) {
    lines.push(`## ${row.rowId}`, '');
    lines.push(`- Score: ${row.baseline.score}/${row.baseline.grade ?? '-'} -> ${row.candidate.score}/${row.candidate.grade ?? '-'} (${row.scoreDelta >= 0 ? '+' : ''}${row.scoreDelta})`);
    lines.push(`- Wall time: ${(row.baseline.wallMs / 1000).toFixed(2)}s -> ${(row.candidate.wallMs / 1000).toFixed(2)}s (${row.wallDeltaMs >= 0 ? '+' : ''}${(row.wallDeltaMs / 1000).toFixed(2)}s)`);
    lines.push(`- Likely guard source(s): ${row.likelyGuardSources.join(', ') || 'none'}`);
    if (row.firstStructuralCategoryDelta) {
      lines.push(`- First structural category delta: ${row.firstStructuralCategoryDelta.key} ${row.firstStructuralCategoryDelta.baseline} -> ${row.firstStructuralCategoryDelta.candidate}`);
    }
    if (row.firstDivergentAcceptedTool) {
      const fp = row.firstDivergentAcceptedTool;
      lines.push(`- First divergent accepted tool @${fp.index}: baseline=${fp.baseline?.toolName ?? 'missing'}:${fp.baseline?.outcome ?? 'missing'} candidate=${fp.candidate?.toolName ?? 'missing'}:${fp.candidate?.outcome ?? 'missing'}`);
    }
    if (row.firstDivergentRejectedTool) {
      const fp = row.firstDivergentRejectedTool;
      lines.push(`- First divergent rejected/no-effect tool @${fp.index}: baseline=${fp.baseline?.toolName ?? 'missing'}:${fp.baseline?.outcome ?? 'missing'} candidate=${fp.candidate?.toolName ?? 'missing'}:${fp.candidate?.outcome ?? 'missing'}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2).filter((arg, index) => !(index === 0 && arg === '--'));
  const parsed = parseArgs(argv);
  const paths = parsed.paths.map(arg => resolve(arg));
  if (paths.length < 2 || paths.length > 3) {
    throw new Error(usage());
  }
  const [baselineRunDir, candidateRunDir, outDir] = paths;
  const ids = parsed.ids.length > 0 ? parsed.ids : DEFAULT_IDS;
  const [baselineRun, candidateRun] = await Promise.all([
    loadRun(baselineRunDir!),
    loadRun(candidateRunDir!),
  ]);
  const report = ids.map(id => summarizeRow(id, baselineRun.rows.get(id), candidateRun.rows.get(id)));
  if (outDir) {
    await mkdir(outDir, { recursive: true });
    await writeFile(join(outDir, 'stage46-runtime-regression-isolation.json'), JSON.stringify(report, null, 2), 'utf8');
    await writeFile(join(outDir, 'stage46-runtime-regression-isolation.md'), markdown(report, baselineRun.runDir, candidateRun.runDir), 'utf8');
    console.log(`Wrote Stage 46 regression isolation report to ${resolve(outDir)}`);
  } else {
    console.log(JSON.stringify(report, null, 2));
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
