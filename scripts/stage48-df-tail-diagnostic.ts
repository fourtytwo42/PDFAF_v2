#!/usr/bin/env tsx
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

type CategoryScores = Record<string, number>;
type BlockerFamily = 'zero_heading_tail' | 'figure_alt_tail' | 'table_tail' | 'reading_order_tail' | 'mixed_tail';

interface ToolRow {
  toolName?: string;
  name?: string;
  outcome?: string;
  stage?: number;
  round?: number;
  source?: string;
  scoreBefore?: number;
  scoreAfter?: number;
  delta?: number;
  details?: unknown;
  durationMs?: number;
}

export interface DfTailBenchmarkRow {
  id: string;
  file?: string;
  afterScore?: number | null;
  afterGrade?: string | null;
  afterCategories?: Array<{ key: string; score: number }>;
  afterScoreCapsApplied?: unknown[];
  afterDetectionProfile?: {
    headingSignals?: Record<string, unknown>;
    figureSignals?: Record<string, unknown>;
    tableSignals?: Record<string, unknown>;
    readingOrderSignals?: Record<string, unknown>;
    pdfUaSignals?: Record<string, unknown>;
    annotationSignals?: Record<string, unknown>;
  } | null;
  appliedTools?: ToolRow[];
  wallRemediateMs?: number;
}

interface RunData {
  runDir: string;
  rows: DfTailBenchmarkRow[];
}

const LOW_CATEGORY_THRESHOLD = 70;
const D_F_GRADES = new Set(['D', 'F']);
const DEFAULT_OUT = 'Output/experiment-corpus-baseline/stage48-df-tail-diagnostic';

function usage(): string {
  return 'Usage: pnpm exec tsx scripts/stage48-df-tail-diagnostic.ts <benchmark-run-dir> [out-dir]';
}

async function loadRun(runDir: string): Promise<RunData> {
  const raw = JSON.parse(await readFile(join(runDir, 'remediate.results.json'), 'utf8'));
  const rows: DfTailBenchmarkRow[] = Array.isArray(raw) ? raw : raw.rows;
  if (!Array.isArray(rows)) throw new Error(`No remediate rows found in ${runDir}`);
  return { runDir, rows };
}

function categories(row: DfTailBenchmarkRow): CategoryScores {
  const out: CategoryScores = {};
  for (const category of row.afterCategories ?? []) out[category.key] = category.score;
  return out;
}

function num(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
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

function toolName(tool: ToolRow): string {
  return tool.toolName ?? tool.name ?? 'unknown';
}

function lowCategories(row: DfTailBenchmarkRow): Array<{ key: string; score: number }> {
  return Object.entries(categories(row))
    .filter(([, score]) => typeof score === 'number' && score < LOW_CATEGORY_THRESHOLD)
    .map(([key, score]) => ({ key, score }))
    .sort((a, b) => a.score - b.score || a.key.localeCompare(b.key));
}

function toolOutcomeSummary(row: DfTailBenchmarkRow): Array<Record<string, unknown>> {
  return (row.appliedTools ?? []).map((tool, index) => {
    const details = parseDetails(tool.details);
    return {
      index,
      toolName: toolName(tool),
      outcome: tool.outcome ?? 'unknown',
      stage: tool.stage ?? null,
      round: tool.round ?? null,
      source: tool.source ?? null,
      scoreBefore: tool.scoreBefore ?? null,
      scoreAfter: tool.scoreAfter ?? null,
      delta: tool.delta ?? null,
      note: details['note'] ?? details['raw'] ?? details['protectedFloorReason'] ?? null,
    };
  });
}

function terminalOutcomesByFamily(row: DfTailBenchmarkRow): Record<string, Array<Record<string, unknown>>> {
  const families: Record<string, string[]> = {
    heading: ['create_heading_from_candidate', 'normalize_heading_hierarchy', 'repair_structure_conformance', 'synthesize_basic_structure_from_layout'],
    figureAlt: ['normalize_nested_figure_containers', 'canonicalize_figure_alt_ownership', 'set_figure_alt_text', 'repair_alt_text_structure', 'mark_figure_decorative'],
    table: ['normalize_table_structure', 'repair_native_table_headers', 'set_table_header_cells'],
    readingOrder: ['normalize_annotation_tab_order', 'remap_orphan_mcids_as_artifacts', 'mark_untagged_content_as_artifact', 'artifact_repeating_page_furniture'],
    annotation: ['repair_native_link_structure', 'tag_unowned_annotations', 'set_link_annotation_contents'],
  };
  const tools = toolOutcomeSummary(row);
  return Object.fromEntries(Object.entries(families).map(([family, names]) => [
    family,
    tools.filter(tool => names.includes(String(tool['toolName']))),
  ]));
}

export function classifyDfTailRow(row: DfTailBenchmarkRow): {
  recommendedFamily: BlockerFamily;
  blockerFamilies: BlockerFamily[];
  reasons: string[];
} {
  const cats = categories(row);
  const detection = row.afterDetectionProfile ?? {};
  const heading = detection.headingSignals ?? {};
  const figure = detection.figureSignals ?? {};
  const table = detection.tableSignals ?? {};
  const reading = detection.readingOrderSignals ?? {};
  const pdfUa = detection.pdfUaSignals ?? {};
  const families = new Set<BlockerFamily>();
  const reasons: string[] = [];

  const headingScore = cats['heading_structure'] ?? 100;
  const treeHeadingCount = num(heading['treeHeadingCount']);
  const extractedHeadingCount = num(heading['extractedHeadingCount']);
  const missingExtractedHeadings = heading['extractedHeadingsMissingFromTree'] === true;
  if (headingScore < LOW_CATEGORY_THRESHOLD || missingExtractedHeadings || (extractedHeadingCount > 0 && treeHeadingCount === 0)) {
    families.add('zero_heading_tail');
    reasons.push(`heading_structure=${headingScore}, extractedHeadingCount=${extractedHeadingCount}, treeHeadingCount=${treeHeadingCount}, extractedHeadingsMissingFromTree=${missingExtractedHeadings}`);
  }

  const altScore = cats['alt_text'] ?? 100;
  const extractedFigures = num(figure['extractedFigureCount']);
  const treeFigures = num(figure['treeFigureCount']);
  const missingTreeFigures = figure['treeFigureMissingForExtractedFigures'] === true;
  if (altScore < LOW_CATEGORY_THRESHOLD || (extractedFigures > 0 && (treeFigures === 0 || missingTreeFigures))) {
    families.add('figure_alt_tail');
    reasons.push(`alt_text=${altScore}, extractedFigureCount=${extractedFigures}, treeFigureCount=${treeFigures}, treeFigureMissingForExtractedFigures=${missingTreeFigures}`);
  }

  const tableScore = cats['table_markup'] ?? 100;
  const directCells = num(table['directCellUnderTableCount']);
  const stronglyIrregular = num(table['stronglyIrregularTableCount']);
  const misplacedCells = num(table['misplacedCellCount']);
  if (tableScore < LOW_CATEGORY_THRESHOLD || directCells > 0 || stronglyIrregular > 0 || misplacedCells > 0) {
    families.add('table_tail');
    reasons.push(`table_markup=${tableScore}, directCellUnderTableCount=${directCells}, stronglyIrregularTableCount=${stronglyIrregular}, misplacedCellCount=${misplacedCells}`);
  }

  const readingScore = cats['reading_order'] ?? 100;
  const structureDepth = num(reading['structureTreeDepth']);
  const orphanMcid = num(pdfUa['orphanMcidCount']);
  const pathPaint = num(pdfUa['suspectedPathPaintOutsideMc']);
  const annotationOrderRisk = num(reading['annotationOrderRiskCount']);
  if (readingScore < LOW_CATEGORY_THRESHOLD || structureDepth <= 1 || orphanMcid > 0 || pathPaint > 0 || annotationOrderRisk > 0) {
    families.add('reading_order_tail');
    reasons.push(`reading_order=${readingScore}, structureTreeDepth=${structureDepth}, orphanMcidCount=${orphanMcid}, suspectedPathPaintOutsideMc=${pathPaint}, annotationOrderRiskCount=${annotationOrderRisk}`);
  }

  const blockerFamilies = [...families];
  let recommendedFamily: BlockerFamily;
  if (blockerFamilies.length > 1) {
    if (altScore <= 20 && extractedFigures > 0) recommendedFamily = 'figure_alt_tail';
    else if (headingScore === 0) recommendedFamily = 'zero_heading_tail';
    else if (tableScore === 0) recommendedFamily = 'table_tail';
    else recommendedFamily = 'mixed_tail';
  } else {
    recommendedFamily = blockerFamilies[0] ?? 'mixed_tail';
  }

  return { recommendedFamily, blockerFamilies, reasons };
}

export function buildDfTailReport(rows: DfTailBenchmarkRow[]): Record<string, unknown> {
  const tailRows = rows
    .filter(row => D_F_GRADES.has(String(row.afterGrade ?? '')))
    .sort((a, b) => (a.afterScore ?? 0) - (b.afterScore ?? 0) || a.id.localeCompare(b.id));
  const rowReports = tailRows.map(row => {
    const classification = classifyDfTailRow(row);
    return {
      id: row.id,
      file: row.file ?? null,
      score: row.afterScore ?? null,
      grade: row.afterGrade ?? null,
      wallRemediateMs: row.wallRemediateMs ?? null,
      lowCategories: lowCategories(row),
      scoreCaps: row.afterScoreCapsApplied ?? [],
      detectionSignals: {
        heading: row.afterDetectionProfile?.headingSignals ?? null,
        figure: row.afterDetectionProfile?.figureSignals ?? null,
        table: row.afterDetectionProfile?.tableSignals ?? null,
        readingOrder: row.afterDetectionProfile?.readingOrderSignals ?? null,
        pdfUa: row.afterDetectionProfile?.pdfUaSignals ?? null,
        annotation: row.afterDetectionProfile?.annotationSignals ?? null,
      },
      attemptedTools: toolOutcomeSummary(row),
      terminalOutcomesByFamily: terminalOutcomesByFamily(row),
      ...classification,
    };
  });
  const distribution: Record<string, number> = {};
  for (const row of rowReports) {
    const family = String(row['recommendedFamily']);
    distribution[family] = (distribution[family] ?? 0) + 1;
  }
  const firstFixerTarget = Object.entries(distribution).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? 'mixed_tail';
  return {
    generatedAt: new Date().toISOString(),
    tailCount: rowReports.length,
    recommendedFamilyDistribution: distribution,
    firstFixerTarget,
    rows: rowReports,
  };
}

function markdown(report: Record<string, unknown>): string {
  const lines = ['# Stage 48 D/F Tail Diagnostic', ''];
  lines.push(`Tail count: ${report['tailCount']}`);
  lines.push(`Recommended family distribution: \`${JSON.stringify(report['recommendedFamilyDistribution'])}\``);
  lines.push(`First fixer target: **${report['firstFixerTarget']}**`, '');
  for (const row of report['rows'] as Array<Record<string, unknown>>) {
    lines.push(`## ${row['id']} (${row['score']} ${row['grade']})`);
    lines.push(`File: ${row['file']}`);
    lines.push(`Recommended family: **${row['recommendedFamily']}**`);
    lines.push(`Blocker families: ${(row['blockerFamilies'] as string[]).join(', ') || 'none'}`);
    lines.push(`Low categories: \`${JSON.stringify(row['lowCategories'])}\``);
    const reasons = row['reasons'] as string[];
    if (reasons.length) {
      lines.push('Reasons:');
      for (const reason of reasons) lines.push(`- ${reason}`);
    }
    const terminal = row['terminalOutcomesByFamily'] as Record<string, unknown[]>;
    const terminalSummary = Object.fromEntries(Object.entries(terminal).map(([family, tools]) => [
      family,
      tools.map(tool => `${tool['toolName']}:${tool['outcome']}`).join(', '),
    ]));
    lines.push(`Terminal tool summary: \`${JSON.stringify(terminalSummary)}\``, '');
  }
  return lines.join('\n');
}

async function main(): Promise<void> {
  const args = process.argv.slice(2).filter((arg, index) => !(index === 0 && arg === '--'));
  if (args.length < 1 || args.length > 2) throw new Error(usage());
  const runDir = resolve(args[0]!);
  const outDir = resolve(args[1] ?? DEFAULT_OUT);
  const run = await loadRun(runDir);
  const report = {
    runDir: run.runDir,
    ...buildDfTailReport(run.rows),
  };
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, 'stage48-df-tail-diagnostic.json'), JSON.stringify(report, null, 2));
  await writeFile(join(outDir, 'stage48-df-tail-diagnostic.md'), markdown(report));
  console.log(`Wrote Stage 48 D/F tail diagnostic to ${outDir}`);
  console.log(`Tail count: ${report.tailCount}`);
  console.log(`First fixer target: ${report.firstFixerTarget}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
