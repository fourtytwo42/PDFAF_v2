#!/usr/bin/env tsx
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

interface CategoryRow { key: string; score: number; applicable?: boolean }
interface ToolRow { toolName: string; outcome: string; details?: unknown; scoreBefore?: number; scoreAfter?: number; delta?: number }
interface ResultRow {
  id: string;
  title?: string;
  file?: string;
  beforeScore?: number;
  beforeGrade?: string;
  afterScore?: number;
  afterGrade?: string;
  beforePdfClass?: string;
  afterPdfClass?: string;
  beforeCategories?: CategoryRow[];
  afterCategories?: CategoryRow[];
  afterDetectionProfile?: {
    readingOrderSignals?: Record<string, unknown>;
    headingSignals?: Record<string, unknown>;
    tableSignals?: Record<string, unknown>;
    annotationSignals?: Record<string, unknown>;
    pdfUaSignals?: Record<string, unknown>;
  };
  appliedTools?: ToolRow[];
}

const DEFAULT_RUN = 'Output/from_sibling_pdfaf_v1_holdout_4/run-stage150-holdout4-baseline-2026-04-29-r1';
const DEFAULT_OUT = 'Output/from_sibling_pdfaf_v1_holdout_4/stage151-native-shell-diagnostic-2026-04-29-r1';
const DEFAULT_IDS = [
  'v1-holdout4-03-2c974ae2',
  'v1-holdout4-10-f6bd9022',
  'v1-holdout4-14-05d1f4f3',
  'v1-v1-4635',
  'v1-v1-4675',
  'v1-v1-3451',
  'v1-v1-3459',
  'v1-v1-3602',
  'v1-v1-legacy-4078',
  'v1-v1-legacy-4184',
  'font-4156',
  'font-4172',
  'font-4699',
];

function argValue(flag: string): string | null {
  const idx = process.argv.indexOf(flag);
  return idx >= 0 ? process.argv[idx + 1] ?? null : null;
}

function csvArg(flag: string): string[] {
  const raw = argValue(flag);
  return raw ? raw.split(',').map(value => value.trim()).filter(Boolean) : [];
}

function score(categories: CategoryRow[] | undefined, key: string): number | null {
  const row = categories?.find(category => category.key === key);
  return row?.applicable === false ? null : row?.score ?? null;
}

function deficits(row: ResultRow): string[] {
  return (row.afterCategories ?? [])
    .filter(category => category.applicable !== false && category.score < 80)
    .map(category => `${category.key}=${category.score}`);
}

function detailText(details: unknown): string {
  if (!details) return '';
  return typeof details === 'string' ? details : JSON.stringify(details);
}

function compactTools(row: ResultRow): string[] {
  return (row.appliedTools ?? [])
    .filter(tool =>
      /create_structure_from_degenerate_native_anchor|synthesize_basic_structure_from_layout|tag_native_text_blocks|bootstrap_struct_tree|repair_structure_conformance|create_heading|repair_native_reading_order|artifact_repeating_page_furniture/i.test(tool.toolName),
    )
    .map(tool => {
      const noteMatch = /"note":"([^"]+)"/.exec(detailText(tool.details));
      return `${tool.toolName}:${tool.outcome}${noteMatch ? `:${noteMatch[1]}` : ''}`;
    });
}

function classify(row: ResultRow): string {
  const heading = score(row.afterCategories, 'heading_structure') ?? 100;
  const reading = score(row.afterCategories, 'reading_order') ?? 100;
  const depth = Number(row.afterDetectionProfile?.readingOrderSignals?.['structureTreeDepth'] ?? 0);
  const degenerate = row.afterDetectionProfile?.readingOrderSignals?.['degenerateStructureTree'] === true;
  const treeHeadingCount = Number(row.afterDetectionProfile?.headingSignals?.['treeHeadingCount'] ?? 0);
  const applied = row.appliedTools ?? [];
  const hasExistingMcidNoEffect = applied.some(tool =>
    /synthesize_basic_structure_from_layout|tag_native_text_blocks/.test(tool.toolName) &&
    /existing_marked_content_blocks_without_promotable/.test(detailText(tool.details)),
  );
  const ocr = applied.some(tool => tool.toolName === 'ocr_scanned_pdf') || /ocr/i.test(String(row.afterPdfClass ?? ''));
  const table = score(row.afterCategories, 'table_markup');
  const form = score(row.afterCategories, 'form_accessibility');
  if (ocr) return 'ocr_shell_defer';
  if (heading >= 80 && reading < 80) return 'reading_order_only_shell';
  if ((table ?? 100) < 40 || (form ?? 100) < 40) return 'table_or_form_blocked';
  if (heading === 0 && reading <= 35 && depth <= 1 && hasExistingMcidNoEffect) return 'native_marked_content_shell_candidate';
  if (heading === 0 && reading <= 35 && depth <= 1) return 'native_zero_heading_reading_order_candidate';
  if (heading < 80 || reading < 80) return degenerate || treeHeadingCount === 0 ? 'native_shell_review' : 'partial_structure_review';
  return 'already_good_control';
}

async function loadRows(runDirs: string[]): Promise<ResultRow[]> {
  const rows: ResultRow[] = [];
  for (const dir of runDirs) {
    try {
      const parsed = JSON.parse(await readFile(join(dir, 'remediate.results.json'), 'utf8')) as ResultRow[];
      rows.push(...parsed);
    } catch {
      // Keep the script useful when optional control runs are absent.
    }
  }
  return rows;
}

async function main(): Promise<void> {
  const runDirs = csvArg('--runs');
  const holdoutRun = argValue('--holdout-run');
  const activeRun = argValue('--active-run');
  const referenceRun = argValue('--reference-run');
  for (const dir of [holdoutRun, activeRun, referenceRun]) {
    if (dir) runDirs.push(dir);
  }
  if (!runDirs.length) runDirs.push(DEFAULT_RUN, 'Output/v1-all-current-2026-04-29/run-stage150-all-v1-no-semantic-r1');
  const outDir = argValue('--out') ?? DEFAULT_OUT;
  const ids = csvArg('--ids');
  const targetIds = ids.length ? ids : DEFAULT_IDS;
  const rows = await loadRows(runDirs);
  const selected = rows.filter(row => targetIds.includes(row.id) || targetIds.some(id => row.id.includes(id)));
  const records = selected.map(row => ({
    id: row.id,
    title: row.title ?? '',
    file: row.file ?? '',
    before: `${row.beforeScore}/${row.beforeGrade}`,
    after: `${row.afterScore}/${row.afterGrade}`,
    pdfClass: `${row.beforePdfClass ?? '?'} -> ${row.afterPdfClass ?? '?'}`,
    classification: classify(row),
    deficits: deficits(row),
    readingOrderSignals: row.afterDetectionProfile?.readingOrderSignals ?? {},
    headingSignals: row.afterDetectionProfile?.headingSignals ?? {},
    toolTimeline: compactTools(row),
  }));
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, 'stage151-native-shell-diagnostic.json'), JSON.stringify({ generatedAt: new Date().toISOString(), runDirs, records }, null, 2));
  const lines = ['# Stage 151 Native Shell Diagnostic', '', `Runs: ${runDirs.map(dir => `\`${dir}\``).join(', ')}`, ''];
  for (const record of records) {
    lines.push(`## ${record.id}`);
    lines.push('');
    lines.push(`- Title: ${record.title}`);
    lines.push(`- Score: ${record.before} -> ${record.after}`);
    lines.push(`- Class: ${record.classification}`);
    lines.push(`- Deficits: ${record.deficits.join('; ') || 'none'}`);
    lines.push(`- Reading signals: ${JSON.stringify(record.readingOrderSignals)}`);
    lines.push(`- Heading signals: ${JSON.stringify(record.headingSignals)}`);
    lines.push(`- Structural tools: ${record.toolTimeline.join(' | ') || 'none'}`);
    lines.push('');
  }
  await writeFile(join(outDir, 'stage151-native-shell-diagnostic.md'), lines.join('\n'));
  console.log(`Wrote Stage 151 native shell diagnostic to ${outDir}`);
  console.log(JSON.stringify(records.reduce<Record<string, number>>((acc, record) => {
    acc[record.classification] = (acc[record.classification] ?? 0) + 1;
    return acc;
  }, {}), null, 2));
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
