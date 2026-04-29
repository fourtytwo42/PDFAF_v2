#!/usr/bin/env tsx
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

interface CategoryRow { key: string; score: number; applicable?: boolean }
interface ToolRow { toolName: string; outcome?: string; status?: string; details?: unknown }
interface ResultRow {
  id: string;
  title?: string;
  file?: string;
  afterScore?: number;
  afterGrade?: string;
  reanalyzedScore?: number;
  reanalyzedGrade?: string;
  afterPdfClass?: string;
  afterCategories?: CategoryRow[];
  afterDetectionProfile?: {
    readingOrderSignals?: Record<string, unknown>;
    headingSignals?: Record<string, unknown>;
    annotationSignals?: Record<string, unknown>;
    tableSignals?: Record<string, unknown>;
  };
  appliedTools?: ToolRow[];
}

const DEFAULT_RUNS = [
  'Output/from_sibling_pdfaf_v1_holdout_4/run-stage151-holdout4-full-2026-04-29-r1',
  'Output/experiment-corpus-baseline/run-stage151-full-2026-04-29-r1',
];
const DEFAULT_IDS = [
  'holdout4-14',
  'short-4192',
  'structure-4076',
  'fixture-inaccessible',
  'figure-4754',
  'font-4057',
  'holdout4-05',
  'holdout4-11',
  'holdout4-10',
];
const DEFAULT_OUT = 'Output/from_sibling_pdfaf_v1_holdout_4/stage152-native-reading-order-diagnostic-2026-04-29-r1';

function argValue(flag: string): string | null {
  const idx = process.argv.indexOf(flag);
  return idx >= 0 ? process.argv[idx + 1] ?? null : null;
}

function csvArg(flag: string): string[] {
  const raw = argValue(flag);
  return raw ? raw.split(',').map(value => value.trim()).filter(Boolean) : [];
}

function score(row: ResultRow, key: string): number | null {
  const category = row.afterCategories?.find(item => item.key === key);
  return category?.applicable === false ? null : category?.score ?? null;
}

function detailText(value: unknown): string {
  return typeof value === 'string' ? value : value ? JSON.stringify(value) : '';
}

function classify(row: ResultRow): string {
  const reading = score(row, 'reading_order') ?? 100;
  const ro = row.afterDetectionProfile?.readingOrderSignals ?? {};
  const ann = row.afterDetectionProfile?.annotationSignals ?? {};
  const depth = Number(ro['structureTreeDepth'] ?? 0);
  const degenerate = ro['degenerateStructureTree'] === true;
  const annotationRisk =
    Number(ro['annotationOrderRiskCount'] ?? 0) +
    Number(ro['annotationStructParentRiskCount'] ?? 0) +
    Number(ann['pagesAnnotationOrderDiffers'] ?? 0) +
    Number(ann['linkAnnotationsMissingStructParent'] ?? 0) +
    Number(ann['nonLinkAnnotationsMissingStructParent'] ?? 0);
  if (reading <= 45 && row.afterPdfClass === 'native_tagged' && degenerate && depth <= 2 && annotationRisk === 0) {
    return 'native_tagged_reading_order_topup_candidate';
  }
  if (reading <= 45 && annotationRisk > 0) return 'annotation_risk_blocked';
  if (reading < 80) return 'reading_order_review';
  return 'control_or_non_reading_order_tail';
}

async function loadRows(runDirs: string[]): Promise<ResultRow[]> {
  const rows: ResultRow[] = [];
  for (const dir of runDirs) {
    try {
      rows.push(...JSON.parse(await readFile(join(dir, 'remediate.results.json'), 'utf8')) as ResultRow[]);
    } catch {
      // Optional run dirs are allowed.
    }
  }
  return rows;
}

async function main(): Promise<void> {
  const runs = csvArg('--runs');
  if (!runs.length) runs.push(...DEFAULT_RUNS);
  const ids = csvArg('--ids');
  const targetIds = ids.length ? ids : DEFAULT_IDS;
  const outDir = argValue('--out') ?? DEFAULT_OUT;
  const rows = (await loadRows(runs)).filter(row => targetIds.some(id => row.id.includes(id)));
  const records = rows.map(row => ({
    id: row.id,
    title: row.title ?? '',
    score: `${row.afterScore}/${row.afterGrade}`,
    reanalyzed: row.reanalyzedScore == null ? 'n/a' : `${row.reanalyzedScore}/${row.reanalyzedGrade}`,
    classification: classify(row),
    deficits: (row.afterCategories ?? [])
      .filter(category => category.applicable !== false && category.score < 80)
      .map(category => `${category.key}=${category.score}`),
    readingOrderSignals: row.afterDetectionProfile?.readingOrderSignals ?? {},
    headingSignals: row.afterDetectionProfile?.headingSignals ?? {},
    annotationSignals: row.afterDetectionProfile?.annotationSignals ?? {},
    structuralTimeline: (row.appliedTools ?? [])
      .filter(tool => /repair_degenerate_native_reading_order_shell|repair_native_reading_order|synthesize_basic_structure_from_layout|repair_structure_conformance|normalize_annotation_tab_order|normalize_heading_hierarchy|artifact_repeating_page_furniture|mark_untagged_content_as_artifact|remap_orphan_mcids_as_artifacts/.test(tool.toolName))
      .map(tool => {
        const note = /"note":"([^"]+)"/.exec(detailText(tool.details))?.[1];
        return `${tool.toolName}:${tool.outcome ?? tool.status ?? ''}${note ? `:${note}` : ''}`;
      }),
  }));
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, 'stage152-native-reading-order-diagnostic.json'), JSON.stringify({ generatedAt: new Date().toISOString(), runs, records }, null, 2));
  const lines = ['# Stage 152 Native Reading-Order Diagnostic', '', `Runs: ${runs.map(run => `\`${run}\``).join(', ')}`, ''];
  for (const record of records) {
    lines.push(`## ${record.id}`, '');
    lines.push(`- Score: ${record.score}; reanalyzed: ${record.reanalyzed}`);
    lines.push(`- Class: ${record.classification}`);
    lines.push(`- Deficits: ${record.deficits.join('; ') || 'none'}`);
    lines.push(`- Reading signals: ${JSON.stringify(record.readingOrderSignals)}`);
    lines.push(`- Heading signals: ${JSON.stringify(record.headingSignals)}`);
    lines.push(`- Annotation signals: ${JSON.stringify(record.annotationSignals)}`);
    lines.push(`- Structural timeline: ${record.structuralTimeline.join(' | ') || 'none'}`, '');
  }
  await writeFile(join(outDir, 'stage152-native-reading-order-diagnostic.md'), lines.join('\n'));
  console.log(`Wrote Stage 152 native reading-order diagnostic to ${outDir}`);
  console.log(JSON.stringify(records.reduce<Record<string, number>>((acc, row) => {
    acc[row.classification] = (acc[row.classification] ?? 0) + 1;
    return acc;
  }, {}), null, 2));
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
