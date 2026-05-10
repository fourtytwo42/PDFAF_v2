#!/usr/bin/env tsx
import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { basename, join } from 'node:path';
import type { TargetSelectionRow } from './all-input-target-selection-diagnostic.js';

const DEFAULT_TARGET_SELECTION = 'Output/goal-all-input-mean-2026-05-09-r1/target-selection-after-proposal-buffer-batch-2026-05-10-r1/target-selection-diagnostic.json';
const DEFAULT_ALL_INPUT_ROWS = 'Output/goal-all-input-mean-2026-05-09-r1/progress-overlay-proposal-buffer-batch-2026-05-10-r1/all-input-rows.merged.json';
const DEFAULT_RUN_ROOT = 'Output/goal-all-input-mean-2026-05-09-r1';
const DEFAULT_OUT = 'Output/goal-all-input-mean-2026-05-09-r1/pac-object-evidence-gap-2026-05-10-r1';

export type ObjectEvidenceClassification =
  | 'font_only_no_safe_action'
  | 'runtime_checkpoint_candidate'
  | 'semantic_source_candidate'
  | 'proposal_buffer_candidate'
  | 'table_or_parenttree_object_candidate'
  | 'parked_needs_poc_leaf';

export interface CategorySnapshot {
  key: string;
  score: number;
  applicable: boolean;
}

export interface BaselineObservation {
  runDir: string;
  score: number | null;
  grade: string | null;
  durationMs: number | null;
  categoryAfter: CategorySnapshot[];
}

export interface PacObjectEvidenceRow {
  file: string;
  score: number;
  grade: string;
  deficitTo93: number;
  family: string;
  durationMs: number | null;
  classification: ObjectEvidenceClassification;
  priority: number;
  pocFailRules: string[];
  pocFamilies: string[];
  weakCategories: string[];
  bestObservedScore: number | null;
  bestObservedRun: string | null;
  observationCount: number;
  pocReferenceFamilies: string[];
  recommendedNextAction: string;
  rationale: string;
}

export interface PacObjectEvidenceDiagnostic {
  generatedAt: string;
  targetSelectionSource: string;
  allInputRowsSource: string;
  runRoot: string | null;
  summary: {
    rowCount: number;
    selectedClassification: ObjectEvidenceClassification | null;
    selectedTargets: string[];
    classCounts: Array<{ classification: ObjectEvidenceClassification; count: number; deficitTo93: number }>;
  };
  pocReferenceMap: Array<{ family: string; pacChecks: string[]; decompiledReference: string; internalRules: string[] }>;
  rows: PacObjectEvidenceRow[];
}

interface TargetSelectionReport {
  rows?: TargetSelectionRow[];
}

interface AllInputMergedRow {
  file: string;
  afterScore: number;
  afterGrade: string;
  durationMs?: number | null;
  categoryGap?: {
    after?: CategorySnapshot[];
  };
}

interface BaselineReportRow {
  file: string;
  afterScore?: number | null;
  afterGrade?: string | null;
  durationMs?: number | null;
  categoryGap?: {
    after?: CategorySnapshot[];
  };
}

function parseArgs(argv: string[]): { targetSelection: string; allInputRows: string; runRoot: string | null; out: string } {
  let targetSelection = DEFAULT_TARGET_SELECTION;
  let allInputRows = DEFAULT_ALL_INPUT_ROWS;
  let runRoot: string | null = DEFAULT_RUN_ROOT;
  let out = DEFAULT_OUT;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === '--target-selection' && next) {
      targetSelection = next;
      i++;
    } else if (arg === '--all-input-rows' && next) {
      allInputRows = next;
      i++;
    } else if (arg === '--run-root' && next) {
      runRoot = next;
      i++;
    } else if (arg === '--no-run-root') {
      runRoot = null;
    } else if (arg === '--out' && next) {
      out = next;
      i++;
    } else if (arg === '--help' || arg === '-h') {
      console.log([
        'Usage: pnpm exec tsx scripts/all-input-pac-object-evidence-diagnostic.ts [options]',
        `  --target-selection <json>  default ${DEFAULT_TARGET_SELECTION}`,
        `  --all-input-rows <json>    default ${DEFAULT_ALL_INPUT_ROWS}`,
        `  --run-root <dir>           default ${DEFAULT_RUN_ROOT}`,
        '  --no-run-root              skip baseline_report scan',
        `  --out <dir>                default ${DEFAULT_OUT}`,
      ].join('\n'));
      process.exit(0);
    }
  }
  return { targetSelection, allInputRows, runRoot, out };
}

function round(value: number, digits = 2): number {
  const m = 10 ** digits;
  return Math.round(value * m) / m;
}

function categoryScore(categories: CategorySnapshot[], key: string): number | null {
  const match = categories.find(category => category.key === key && category.applicable !== false);
  return typeof match?.score === 'number' ? match.score : null;
}

function weakCategories(categories: CategorySnapshot[]): string[] {
  return categories
    .filter(category => category.applicable !== false && category.score < 80)
    .sort((a, b) => a.score - b.score || a.key.localeCompare(b.key))
    .map(category => `${category.key}:${category.score}`);
}

function pocReferenceMap(): PacObjectEvidenceDiagnostic['pocReferenceMap'] {
  return [
    {
      family: 'font_cmap',
      pacChecks: ['ToUnicode CMap present', 'ToUnicode CMap valid', 'characters Unicode mappable'],
      decompiledReference: 'Research/POC-decompiled/PAC/uYA4QGz9SaCwTwr6epj/ookUf4zil6Xd8K6fN9c.cs',
      internalRules: ['pdfua.font.to_unicode_cmap_present', 'pdfua.font.to_unicode_cmap_valid'],
    },
    {
      family: 'parent_tree',
      pacChecks: ['Structural ParentTree present', 'page /StructParents', 'MCID entries', 'annotation /StructParent references'],
      decompiledReference: 'Research/POC-decompiled/PAC/m3WxRVHvVB4W9AHLYmTs/pBAK6sHvuDONAUJryKfn.cs',
      internalRules: ['pdfua.parent_tree.mcid_entries_valid', 'pdfua.parent_tree.annotation_object_refs_consistent', 'pdfua.structure.parent_links_valid'],
    },
    {
      family: 'heading_structure',
      pacChecks: ['first heading is H1', 'heading levels not skipped', 'H and Hn not mixed', 'only one H per node'],
      decompiledReference: 'Research/POC-decompiled/PAC/A4.Matterhorn.Properties/Resources.cs',
      internalRules: ['pdfua.heading.first_heading_h1', 'pdfua.heading.levels_not_skipped', 'pdfua.heading.h_and_hn_not_mixed'],
    },
    {
      family: 'table_headers',
      pacChecks: ['tables are regular', 'table header cell assignments', 'TH Scope/ID/Headers association'],
      decompiledReference: 'Research/POC-decompiled/PAC/j9k8YZHvkuLNDyh1q0uG/FCsgaIHvwBTo53Qv0MsN.cs',
      internalRules: ['pdfua.table.header_association_present', 'pdfua.table.header_cells_associated'],
    },
    {
      family: 'annotation_link_structure',
      pacChecks: ['annotations in Annot tag', 'link annotations in Link tag', 'widget annotations in Form tag'],
      decompiledReference: 'Research/POC-decompiled/PAC/A4.Matterhorn.Properties/Resources.cs',
      internalRules: ['pdfua.annotations.tagged_annotations_present', 'pdfua.annotations.link_in_link_tag', 'pdfua.annotations.widget_in_form_tag'],
    },
  ];
}

function hasOnlyFontRules(row: TargetSelectionRow): boolean {
  return row.pocFailRules.length > 0 && row.pocFailRules.every(rule => rule.ruleId.startsWith('pdfua.font.'));
}

function hasPocFamily(row: TargetSelectionRow, family: string): boolean {
  return row.pocFamilies.includes(family);
}

function classify(input: {
  target: TargetSelectionRow;
  categories: CategorySnapshot[];
  observations: BaselineObservation[];
}): { classification: ObjectEvidenceClassification; priority: number; action: string; rationale: string; referenceFamilies: string[] } {
  const { target, categories, observations } = input;
  const weak = new Set(weakCategories(categories).map(item => item.split(':')[0]));
  const bestObserved = observations.reduce<number | null>((best, observation) => {
    if (typeof observation.score !== 'number') return best;
    return best === null ? observation.score : Math.max(best, observation.score);
  }, null);
  const duration = target.durationMs ?? 0;
  const runtimeHeavy = duration >= 300_000;

  if (hasOnlyFontRules(target) && weak.has('text_extractability')) {
    return {
      classification: 'font_only_no_safe_action',
      priority: target.deficitTo93 - 20,
      action: 'Keep font/CMap as PAC-visible diagnostic debt until a separate stability stage proves safe font repair or scoring behavior.',
      rationale: 'PAC evidence is direct font/CMap debt, which is currently diagnostic-only because earlier font scoring/repair promotion was noisy.',
      referenceFamilies: ['font_cmap'],
    };
  }

  if (runtimeHeavy && (bestObserved ?? target.score) >= 80) {
    return {
      classification: 'runtime_checkpoint_candidate',
      priority: target.deficitTo93 + 10,
      action: 'Inspect timeout traces and verified checkpoints; prefer terminal checkpoint return or no-gain suppression only if score is preserved.',
      rationale: 'The row is expensive and has reached a useful score in at least one observation, so runtime admission may recover points without a new fixer.',
      referenceFamilies: hasPocFamily(target, 'parent_tree') ? ['parent_tree'] : [],
    };
  }

  if (hasPocFamily(target, 'table_headers') || target.family.includes('table')) {
    return {
      classification: 'table_or_parenttree_object_candidate',
      priority: target.deficitTo93 + (hasPocFamily(target, 'table_headers') ? 12 : 4),
      action: 'Run a table/ParentTree object diagnostic: stable table refs, TH Scope/ID/Headers, irregular/direct-cell signals, and annotation object refs.',
      rationale: hasPocFamily(target, 'table_headers')
        ? 'PAC/POC reports table header association debt on a row that is still below target.'
        : 'Score debt is table-shaped but lacks enough PAC object evidence, so collect stable object identity before changing repairs.',
      referenceFamilies: ['table_headers', 'parent_tree'],
    };
  }

  if (weak.has('heading_structure') || weak.has('reading_order')) {
    if ((bestObserved ?? 0) > target.score && bestObserved !== null) {
      return {
        classification: 'proposal_buffer_candidate',
        priority: target.deficitTo93 + 8,
        action: 'Scan rejected structural proposals for annotation/orphan-MCID blockers and prove cleanup from the proposal buffer before behavior.',
        rationale: 'The row has heading/reading debt and historical observations show a better route than the current overlay score.',
        referenceFamilies: ['heading_structure', 'annotation_link_structure', 'parent_tree'],
      };
    }
    return {
      classification: 'semantic_source_candidate',
      priority: target.deficitTo93 + 2,
      action: 'If deterministic traces lack object targets, try a sequential source-reanalyzed semantic heading/structure sample and count only source scores.',
      rationale: 'The weak categories are structural/reading categories, but current direct PAC object evidence is not enough for a deterministic fixer.',
      referenceFamilies: ['heading_structure', 'annotation_link_structure'],
    };
  }

  return {
    classification: 'parked_needs_poc_leaf',
    priority: target.deficitTo93,
    action: 'Add PAC leaf/object evidence before remediation behavior; do not hide the row through checkpoint or scoring changes.',
    rationale: 'The low score is real, but the current artifact does not expose a stable PAC-like object target.',
    referenceFamilies: [],
  };
}

function bestObservation(observations: BaselineObservation[]): BaselineObservation | null {
  return observations
    .filter(observation => typeof observation.score === 'number')
    .sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || a.runDir.localeCompare(b.runDir))[0] ?? null;
}

function buildBasenameMap(rows: AllInputMergedRow[]): Map<string, AllInputMergedRow> {
  return new Map(rows.map(row => [basename(row.file), row]));
}

async function findBaselineReports(root: string): Promise<string[]> {
  const results: string[] = [];
  async function walk(dir: string, depth: number): Promise<void> {
    if (depth > 4) return;
    let entries: Awaited<ReturnType<typeof readdir>>;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const path = join(dir, entry.name);
      if (entry.isFile() && entry.name === 'baseline_report.json') {
        results.push(path);
      } else if (entry.isDirectory()) {
        await walk(path, depth + 1);
      }
    }
  }
  await walk(root, 0);
  return results.sort((a, b) => a.localeCompare(b));
}

async function collectObservations(runRoot: string | null, targetFiles: string[]): Promise<Map<string, BaselineObservation[]>> {
  const map = new Map<string, BaselineObservation[]>();
  for (const file of targetFiles) map.set(basename(file), []);
  if (!runRoot) return map;
  const reports = await findBaselineReports(runRoot);
  const wanted = new Set([...map.keys()]);
  for (const reportPath of reports) {
    let parsed: { rows?: BaselineReportRow[] };
    try {
      parsed = JSON.parse(await readFile(reportPath, 'utf8')) as { rows?: BaselineReportRow[] };
    } catch {
      continue;
    }
    for (const row of parsed.rows ?? []) {
      const key = basename(row.file);
      if (!wanted.has(key)) continue;
      map.get(key)?.push({
        runDir: reportPath.replace(/\/baseline_report\.json$/, ''),
        score: typeof row.afterScore === 'number' ? row.afterScore : null,
        grade: typeof row.afterGrade === 'string' ? row.afterGrade : null,
        durationMs: typeof row.durationMs === 'number' ? row.durationMs : null,
        categoryAfter: row.categoryGap?.after ?? [],
      });
    }
  }
  return map;
}

function classCounts(rows: PacObjectEvidenceRow[]): PacObjectEvidenceDiagnostic['summary']['classCounts'] {
  const counts = new Map<ObjectEvidenceClassification, { classification: ObjectEvidenceClassification; count: number; deficitTo93: number }>();
  for (const row of rows) {
    const current = counts.get(row.classification) ?? { classification: row.classification, count: 0, deficitTo93: 0 };
    current.count += 1;
    current.deficitTo93 = round(current.deficitTo93 + row.deficitTo93, 2);
    counts.set(row.classification, current);
  }
  return [...counts.values()].sort((a, b) => b.deficitTo93 - a.deficitTo93 || b.count - a.count || a.classification.localeCompare(b.classification));
}

export async function buildPacObjectEvidenceDiagnostic(input: {
  targetSelection: TargetSelectionReport;
  allInputRows: AllInputMergedRow[];
  runRoot?: string | null;
  targetSelectionSource?: string;
  allInputRowsSource?: string;
  generatedAt?: string;
}): Promise<PacObjectEvidenceDiagnostic> {
  const targetRows = (input.targetSelection.rows ?? [])
    .filter(row => row.classification === 'needs_more_pac_object_evidence');
  const allInputByBase = buildBasenameMap(input.allInputRows);
  const observationsByBase = await collectObservations(input.runRoot ?? null, targetRows.map(row => row.file));
  const rows = targetRows.map(target => {
    const base = basename(target.file);
    const merged = allInputByBase.get(base);
    const observations = observationsByBase.get(base) ?? [];
    const categories = merged?.categoryGap?.after ?? bestObservation(observations)?.categoryAfter ?? [];
    const decision = classify({ target, categories, observations });
    const best = bestObservation(observations);
    return {
      file: target.file,
      score: target.score,
      grade: target.grade,
      deficitTo93: target.deficitTo93,
      family: target.family,
      durationMs: target.durationMs,
      classification: decision.classification,
      priority: round(decision.priority, 2),
      pocFailRules: target.pocFailRules.map(rule => rule.ruleId),
      pocFamilies: target.pocFamilies,
      weakCategories: weakCategories(categories),
      bestObservedScore: best?.score ?? null,
      bestObservedRun: best?.runDir ?? null,
      observationCount: observations.length,
      pocReferenceFamilies: decision.referenceFamilies,
      recommendedNextAction: decision.action,
      rationale: decision.rationale,
    };
  }).sort((a, b) => b.priority - a.priority || b.deficitTo93 - a.deficitTo93 || a.file.localeCompare(b.file));

  const counts = classCounts(rows);
  const selectedClassification = counts.find(item => item.classification !== 'font_only_no_safe_action')?.classification ?? counts[0]?.classification ?? null;
  return {
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    targetSelectionSource: input.targetSelectionSource ?? '',
    allInputRowsSource: input.allInputRowsSource ?? '',
    runRoot: input.runRoot ?? null,
    summary: {
      rowCount: rows.length,
      selectedClassification,
      selectedTargets: selectedClassification ? rows.filter(row => row.classification === selectedClassification).slice(0, 8).map(row => row.file) : [],
      classCounts: counts,
    },
    pocReferenceMap: pocReferenceMap(),
    rows,
  };
}

function renderMarkdown(report: PacObjectEvidenceDiagnostic): string {
  const lines: string[] = [];
  lines.push('# All-Input PAC Object Evidence Gap Diagnostic');
  lines.push('');
  lines.push(`- Generated: ${report.generatedAt}`);
  lines.push(`- Target selection: \`${report.targetSelectionSource}\``);
  lines.push(`- All-input rows: \`${report.allInputRowsSource}\``);
  lines.push(`- Run root scanned: ${report.runRoot ? `\`${report.runRoot}\`` : '`none`'}`);
  lines.push(`- Rows inspected: ${report.summary.rowCount}`);
  lines.push(`- Selected next class: \`${report.summary.selectedClassification ?? 'none'}\``);
  lines.push('');
  lines.push('## POC/PAC Reference Families');
  lines.push('');
  lines.push('| Family | PAC checks | Decompiled reference | Internal rules |');
  lines.push('| --- | --- | --- | --- |');
  for (const item of report.pocReferenceMap) {
    lines.push(`| ${item.family} | ${item.pacChecks.join('<br>')} | \`${item.decompiledReference}\` | ${item.internalRules.map(rule => `\`${rule}\``).join('<br>')} |`);
  }
  lines.push('');
  lines.push('## Classification Summary');
  lines.push('');
  lines.push('| Classification | Count | Deficit to 93 |');
  lines.push('| --- | ---: | ---: |');
  for (const item of report.summary.classCounts) {
    lines.push(`| ${item.classification} | ${item.count} | ${item.deficitTo93} |`);
  }
  lines.push('');
  lines.push('## Ranked Rows');
  lines.push('');
  lines.push('| Priority | Score | Deficit | Class | File | Weak categories | POC fails | Observations | Next action |');
  lines.push('| ---: | ---: | ---: | --- | --- | --- | --- | --- | --- |');
  for (const row of report.rows) {
    lines.push([
      `| ${row.priority}`,
      row.score,
      row.deficitTo93,
      row.classification,
      `\`${row.file}\``,
      row.weakCategories.map(item => `\`${item}\``).join('<br>') || '-',
      row.pocFailRules.slice(0, 5).map(rule => `\`${rule}\``).join('<br>') || '-',
      row.bestObservedScore === null ? `${row.observationCount} obs` : `${row.observationCount} obs; best ${row.bestObservedScore}`,
      `${row.recommendedNextAction} |`,
    ].join(' | '));
  }
  lines.push('');
  lines.push('## Decision');
  lines.push('');
  lines.push('This diagnostic is selection-only. It uses PAC/POC decompiled check families to decide whether the next work should collect object identity, inspect runtime checkpoints, run a semantic source-reanalyzed sample, or park noisy diagnostic-only debt. It does not change scoring, gates, planner routing, mutation behavior, or timeout policy.');
  lines.push('');
  return `${lines.join('\n')}\n`;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const targetSelection = JSON.parse(await readFile(args.targetSelection, 'utf8')) as TargetSelectionReport;
  const allInputRows = JSON.parse(await readFile(args.allInputRows, 'utf8')) as AllInputMergedRow[];
  const report = await buildPacObjectEvidenceDiagnostic({
    targetSelection,
    allInputRows,
    runRoot: args.runRoot,
    targetSelectionSource: args.targetSelection,
    allInputRowsSource: args.allInputRows,
  });
  await mkdir(args.out, { recursive: true });
  await writeFile(join(args.out, 'pac-object-evidence-gap.json'), `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(join(args.out, 'pac-object-evidence-gap.md'), renderMarkdown(report));
  console.log(`Wrote ${join(args.out, 'pac-object-evidence-gap.md')}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}
