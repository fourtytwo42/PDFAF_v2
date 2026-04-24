#!/usr/bin/env tsx
import 'dotenv/config';

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

type JsonRecord = Record<string, unknown>;

export type Stage63ResidualClass =
  | 'figure_alt_residual'
  | 'table_followup_possible'
  | 'heading_no_candidate'
  | 'manual_scanned_debt'
  | 'analyzer_volatility'
  | 'mixed_no_safe_target'
  | 'resolved_or_not_low'
  | 'inconclusive_missing_artifact';

export type Stage64Direction =
  | 'Figure/Alt Recovery v5'
  | 'Table Tail Follow-up v3'
  | 'Manual/Scanned Debt Diagnostic'
  | 'No Fixer - Resolve Evidence Gap';

export interface Stage63RunPair {
  corpus: 'edge_mix_1' | 'edge_mix_2';
  stage59RunDir: string;
  stage62RunDir: string;
}

export interface Stage63RowReport {
  id: string;
  corpus: 'edge_mix_1' | 'edge_mix_2';
  localFile: string;
  stage59: { score: number | null; grade: string | null; categories: Record<string, number> };
  stage62: { score: number | null; grade: string | null; categories: Record<string, number> };
  scoreDelta: number | null;
  categoryDeltas: Record<string, number>;
  class: Stage63ResidualClass;
  stableForFixer: boolean;
  stage62ToolFamilies: string[];
  finalBlockerCategories: string[];
  scoreCaps: unknown[];
  falsePositiveAppliedCount: number;
  reasons: string[];
}

export interface Stage63Report {
  generatedAt: string;
  runPairs: Stage63RunPair[];
  rows: Stage63RowReport[];
  classDistribution: Record<string, number>;
  selectedStage64Direction: Stage64Direction;
  decisionReasons: string[];
}

const DEFAULT_OUT = 'Output/from_sibling_pdfaf_v1_edge_mix_2/stage63-residual-decision-2026-04-24-r1';
const DEFAULT_RUN_PAIRS: Stage63RunPair[] = [
  {
    corpus: 'edge_mix_1',
    stage59RunDir: 'Output/from_sibling_pdfaf_v1_edge_mix/run-stage59-edge-mix-2026-04-24-r1',
    stage62RunDir: 'Output/from_sibling_pdfaf_v1_edge_mix/run-stage62-edge-mix-2026-04-24-r1',
  },
  {
    corpus: 'edge_mix_2',
    stage59RunDir: 'Output/from_sibling_pdfaf_v1_edge_mix_2/run-stage59-edge-mix2-2026-04-24-r2',
    stage62RunDir: 'Output/from_sibling_pdfaf_v1_edge_mix_2/run-stage62-edge-mix2-2026-04-24-r1',
  },
];

const PARKED_ANALYZER_ROWS = new Set(['v1-4683', 'v1-4171', 'v1-4487']);
const LOW_SCORE_THRESHOLD = 80;
const LOW_CATEGORY_THRESHOLD = 70;
const CORE_STRUCTURAL_CATEGORIES = ['heading_structure', 'alt_text', 'table_markup', 'reading_order'] as const;

function usage(): string {
  return [
    'Usage: pnpm exec tsx scripts/stage63-residual-decision.ts [options]',
    `  --out <dir>             Default: ${DEFAULT_OUT}`,
    '  --pair <corpus,stage59,stage62>  Add/override run pair; corpus=edge_mix_1|edge_mix_2',
  ].join('\n');
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function categories(row: JsonRecord | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  const list = Array.isArray(row?.['afterCategories']) ? row!['afterCategories'] as JsonRecord[] : [];
  for (const item of list) {
    const key = str(item['key']);
    const score = num(item['score']);
    if (key && score != null) out[key] = score;
  }
  return out;
}

function rowSummary(row: JsonRecord | undefined): { score: number | null; grade: string | null; categories: Record<string, number> } {
  return {
    score: num(row?.['afterScore']),
    grade: str(row?.['afterGrade']) || null,
    categories: categories(row),
  };
}

function lowCategoryKeys(cats: Record<string, number>): string[] {
  return Object.entries(cats)
    .filter(([, score]) => score < LOW_CATEGORY_THRESHOLD)
    .map(([key]) => key)
    .sort();
}

function toolFamilies(row: JsonRecord | undefined): string[] {
  const tools = Array.isArray(row?.['appliedTools']) ? row!['appliedTools'] as JsonRecord[] : [];
  const families = new Set<string>();
  for (const tool of tools) {
    const name = str(tool['toolName']);
    if (/figure|alt/i.test(name)) families.add('figure_alt');
    if (/table/i.test(name)) families.add('table');
    if (/heading|structure_conformance|synthesize/i.test(name)) families.add('heading_structure');
    if (/ocr/i.test(name)) families.add('ocr');
    if (/orphan|artifact/i.test(name)) families.add('cleanup');
  }
  return [...families].sort();
}

function hasFigureToolEvidence(row: JsonRecord | undefined): boolean {
  return toolFamilies(row).includes('figure_alt');
}

function hasTableToolEvidence(row: JsonRecord | undefined): boolean {
  return toolFamilies(row).includes('table');
}

function isManualScanned(row: JsonRecord | undefined): boolean {
  const localFile = str(row?.['localFile']);
  const beforeClass = str(row?.['beforePdfClass']);
  const afterClass = str(row?.['afterPdfClass']);
  return localFile.includes('manual_scanned') || beforeClass.includes('scanned') || afterClass.includes('scanned');
}

function falsePositiveCount(row: JsonRecord | undefined): number {
  return num(row?.['falsePositiveAppliedCount']) ?? 0;
}

function scoreCaps(row: JsonRecord | undefined): unknown[] {
  return Array.isArray(row?.['afterScoreCapsApplied']) ? row!['afterScoreCapsApplied'] as unknown[] : [];
}

export function classifyStage63Residual(input: {
  id: string;
  corpus: 'edge_mix_1' | 'edge_mix_2';
  stage59?: JsonRecord;
  stage62?: JsonRecord;
}): Stage63RowReport {
  const s59 = rowSummary(input.stage59);
  const s62 = rowSummary(input.stage62);
  const stage62Cats = s62.categories;
  const reasons: string[] = [];
  const categoryKeys = [...new Set([...Object.keys(s59.categories), ...Object.keys(s62.categories)])].sort();
  const categoryDeltas = Object.fromEntries(categoryKeys.map(key => [key, (stage62Cats[key] ?? 0) - (s59.categories[key] ?? 0)]));
  const finalBlockers = lowCategoryKeys(stage62Cats);
  const lowCoreStructuralCategories = CORE_STRUCTURAL_CATEGORIES.filter(key => (stage62Cats[key] ?? 100) < LOW_CATEGORY_THRESHOLD);
  const scoreDelta = s59.score != null && s62.score != null ? s62.score - s59.score : null;
  let klass: Stage63ResidualClass = 'resolved_or_not_low';
  let stableForFixer = true;

  if (!input.stage59 || !input.stage62) {
    klass = 'inconclusive_missing_artifact';
    stableForFixer = false;
    reasons.push('missing_stage59_or_stage62_row');
  } else if (PARKED_ANALYZER_ROWS.has(input.id)) {
    klass = 'analyzer_volatility';
    stableForFixer = false;
    reasons.push('row_is_parked_analyzer_volatility_debt');
  } else if (isManualScanned(input.stage62)) {
    klass = 'manual_scanned_debt';
    stableForFixer = false;
    reasons.push('manual_or_scanned_input');
  } else if ((s62.score ?? 100) >= LOW_SCORE_THRESHOLD && finalBlockers.length === 0) {
    klass = 'resolved_or_not_low';
    reasons.push('row_is_not_low_after_stage62');
  } else if (lowCoreStructuralCategories.length > 1) {
    klass = 'mixed_no_safe_target';
    reasons.push(`multiple_low_structural_categories=${lowCoreStructuralCategories.join(',')}`);
  } else if ((stage62Cats['alt_text'] ?? 100) < LOW_CATEGORY_THRESHOLD && hasFigureToolEvidence(input.stage62)) {
    klass = 'figure_alt_residual';
    reasons.push(`alt_text=${stage62Cats['alt_text']}`);
    reasons.push('figure_alt_tool_evidence_present');
  } else if ((stage62Cats['table_markup'] ?? 100) < LOW_CATEGORY_THRESHOLD && hasTableToolEvidence(input.stage62)) {
    klass = 'table_followup_possible';
    reasons.push(`table_markup=${stage62Cats['table_markup']}`);
    reasons.push('table_tool_evidence_present');
  } else if ((stage62Cats['heading_structure'] ?? 100) < LOW_CATEGORY_THRESHOLD) {
    klass = 'heading_no_candidate';
    reasons.push(`heading_structure=${stage62Cats['heading_structure']}`);
  } else {
    klass = 'mixed_no_safe_target';
    reasons.push(`low_categories=${finalBlockers.join(',') || 'none'}`);
  }

  return {
    id: input.id,
    corpus: input.corpus,
    localFile: str(input.stage62?.['localFile']) || str(input.stage59?.['localFile']),
    stage59: s59,
    stage62: s62,
    scoreDelta,
    categoryDeltas,
    class: klass,
    stableForFixer,
    stage62ToolFamilies: toolFamilies(input.stage62),
    finalBlockerCategories: finalBlockers,
    scoreCaps: scoreCaps(input.stage62),
    falsePositiveAppliedCount: falsePositiveCount(input.stage62),
    reasons,
  };
}

export function buildStage63Report(runPairs: Stage63RunPair[], rows: Stage63RowReport[], generatedAt = new Date().toISOString()): Stage63Report {
  const classDistribution: Record<string, number> = {};
  for (const row of rows) classDistribution[row.class] = (classDistribution[row.class] ?? 0) + 1;
  const stableLowRows = rows.filter(row => row.stableForFixer && row.class !== 'resolved_or_not_low');
  const figureRows = stableLowRows.filter(row => row.class === 'figure_alt_residual');
  const tableRows = stableLowRows.filter(row => row.class === 'table_followup_possible');
  const manualRows = rows.filter(row => row.class === 'manual_scanned_debt');
  let selectedStage64Direction: Stage64Direction = 'No Fixer - Resolve Evidence Gap';
  const decisionReasons: string[] = [];

  if (figureRows.length >= 2) {
    selectedStage64Direction = 'Figure/Alt Recovery v5';
    decisionReasons.push(`${figureRows.length} stable rows retain figure/alt residuals.`);
  } else if (tableRows.length >= 1) {
    selectedStage64Direction = 'Table Tail Follow-up v3';
    decisionReasons.push(`${tableRows.length} stable rows retain table residuals with table-tool evidence.`);
  } else if (manualRows.length >= 2 && stableLowRows.length === 0) {
    selectedStage64Direction = 'Manual/Scanned Debt Diagnostic';
    decisionReasons.push('Remaining low rows are primarily manual/scanned debt.');
  } else {
    decisionReasons.push('No stable structural fixer family met selection thresholds.');
  }
  if ((classDistribution['analyzer_volatility'] ?? 0) > 0) {
    decisionReasons.push(`${classDistribution['analyzer_volatility']} parked analyzer-volatility row(s) excluded from fixer selection.`);
  }

  return {
    generatedAt,
    runPairs,
    rows,
    classDistribution,
    selectedStage64Direction,
    decisionReasons,
  };
}

async function readJson(path: string): Promise<unknown | null> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as unknown;
  } catch {
    return null;
  }
}

async function loadRows(runDir: string): Promise<Map<string, JsonRecord>> {
  const parsed = await readJson(join(runDir, 'remediate.results.json'));
  const rows = Array.isArray(parsed) ? parsed as JsonRecord[] : [];
  const out = new Map<string, JsonRecord>();
  for (const row of rows) {
    const id = str(row['id']);
    const publicationId = str(row['publicationId']);
    if (id) out.set(id, row);
    if (publicationId) out.set(`v1-${publicationId.replace(/^v1-/, '')}`, row);
  }
  return out;
}

function parseArgs(argv: string[]): { outDir: string; runPairs: Stage63RunPair[] } {
  const args = { outDir: DEFAULT_OUT, runPairs: [] as Stage63RunPair[] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--') continue;
    if (arg === '--help' || arg === '-h') {
      console.log(usage());
      process.exit(0);
    }
    if (arg === '--out') args.outDir = argv[++i] ?? args.outDir;
    else if (arg === '--pair') {
      const raw = argv[++i] ?? '';
      const [corpus, stage59RunDir, stage62RunDir] = raw.split(',');
      if ((corpus !== 'edge_mix_1' && corpus !== 'edge_mix_2') || !stage59RunDir || !stage62RunDir) {
        throw new Error(`Invalid --pair value: ${raw}`);
      }
      args.runPairs.push({ corpus, stage59RunDir, stage62RunDir });
    } else {
      throw new Error(`Unknown argument: ${arg}\n${usage()}`);
    }
  }
  if (args.runPairs.length === 0) args.runPairs = DEFAULT_RUN_PAIRS;
  return args;
}

function markdown(report: Stage63Report): string {
  const lines = ['# Stage 63 Residual Decision', ''];
  lines.push(`Generated: \`${report.generatedAt}\``);
  lines.push(`Selected Stage 64 direction: \`${report.selectedStage64Direction}\``, '');
  lines.push('Decision reasons:');
  for (const reason of report.decisionReasons) lines.push(`- ${reason}`);
  lines.push('', '## Distribution', '');
  for (const [key, count] of Object.entries(report.classDistribution).sort()) lines.push(`- ${key}: ${count}`);
  lines.push('', '## Rows', '');
  lines.push('| ID | Corpus | Stage59 | Stage62 | Class | Stable | Low Categories | Tool Families |');
  lines.push('| --- | --- | ---: | ---: | --- | --- | --- | --- |');
  for (const row of report.rows) {
    lines.push(`| ${row.id} | ${row.corpus} | ${row.stage59.score ?? 'missing'} ${row.stage59.grade ?? ''} | ${row.stage62.score ?? 'missing'} ${row.stage62.grade ?? ''} | ${row.class} | ${row.stableForFixer ? 'yes' : 'no'} | ${row.finalBlockerCategories.join(', ') || 'none'} | ${row.stage62ToolFamilies.join(', ') || 'none'} |`);
  }
  lines.push('');
  return lines.join('\n');
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const reports: Stage63RowReport[] = [];
  for (const pair of args.runPairs) {
    const stage59 = await loadRows(pair.stage59RunDir);
    const stage62 = await loadRows(pair.stage62RunDir);
    const ids = [...new Set([...stage59.keys(), ...stage62.keys()])].sort();
    for (const id of ids) {
      reports.push(classifyStage63Residual({
        id,
        corpus: pair.corpus,
        stage59: stage59.get(id),
        stage62: stage62.get(id),
      }));
    }
  }
  const report = buildStage63Report(args.runPairs, reports);
  await mkdir(args.outDir, { recursive: true });
  await writeFile(join(args.outDir, 'stage63-residual-decision.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await writeFile(join(args.outDir, 'stage63-residual-decision.md'), markdown(report), 'utf8');
  console.log(`Wrote ${join(args.outDir, 'stage63-residual-decision.md')}`);
  console.log(`Selected Stage 64 direction: ${report.selectedStage64Direction}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}
