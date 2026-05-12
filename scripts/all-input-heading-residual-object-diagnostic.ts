#!/usr/bin/env tsx
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';

const DEFAULT_BASELINE =
  'Output/goal-all-input-mean-2026-05-09-r1/r5-merged-baseline-report-2026-05-11-r1/baseline_report.json';
const DEFAULT_SELECTION =
  'Output/goal-all-input-mean-2026-05-09-r1/target-selection-diagnostic-r5-2026-05-11-r1/target-selection-diagnostic.json';
const DEFAULT_POC =
  'Output/goal-all-input-mean-2026-05-09-r1/poc-strong-lowest-40/poc-strong-rule-matrix.json';
const DEFAULT_OUT =
  'Output/goal-all-input-mean-2026-05-09-r1/heading-residual-object-diagnostic-r5-2026-05-11-r1';

type HeadingResidualClassification =
  | 'parked_hard_timeout'
  | 'runtime_route_heavy'
  | 'content_tagging_object_candidate'
  | 'font_cmap_only_diagnostic'
  | 'heading_route_plateau'
  | 'near_pass_heading_cap'
  | 'needs_fresh_object_evidence';

interface CategoryScore {
  key: string;
  score: number;
  applicable?: boolean;
}

interface ToolRow {
  toolName?: string;
  outcome?: string;
  scoreBefore?: number;
  scoreAfter?: number;
  delta?: number;
  details?: unknown;
}

interface BaselineRow {
  file: string;
  beforeScore?: number;
  afterScore?: number;
  afterGrade?: string;
  durationMs?: number;
  error?: string;
  categoryGap?: { after?: CategoryScore[] };
  afterCategories?: CategoryScore[];
  appliedTools?: ToolRow[];
  falsePositiveApplied?: number | boolean;
}

interface SelectionRow {
  file: string;
  classification: string;
  deficitTo93?: number;
}

interface PocRule {
  ruleId: string;
  status: string;
  category?: string;
  confidence?: string;
}

interface PocFile {
  file: string;
  rules?: PocRule[];
}

export interface HeadingResidualDiagnosticRow {
  file: string;
  score: number;
  grade: string;
  deficitTo93: number;
  durationMs: number;
  headingScore: number | null;
  readingScore: number | null;
  pdfuaScore: number | null;
  pocFailRules: string[];
  structureToolAttempts: number;
  scoreMovingStructureAttempts: number;
  cleanupAttempts: number;
  rejectedPacRules: string[];
  classification: HeadingResidualClassification;
  recommendation: string;
}

export interface HeadingResidualObjectDiagnostic {
  generatedAt: string;
  baselineSource: string;
  selectionSource: string;
  pocSource: string;
  summary: {
    rowCount: number;
    classificationCounts: Array<{ classification: HeadingResidualClassification; count: number; deficitTo93: number }>;
    selectedNextClass: HeadingResidualClassification | null;
    selectedRows: string[];
  };
  rows: HeadingResidualDiagnosticRow[];
}

const STRUCTURE_TOOLS = new Set([
  'bridge_native_title_text_owner',
  'create_heading_from_candidate',
  'create_heading_from_tagged_visible_anchor',
  'normalize_heading_hierarchy',
  'repair_structure_conformance',
  'synthesize_basic_structure_from_layout',
  'tag_native_text_blocks',
]);

const CLEANUP_TOOLS = new Set([
  'normalize_annotation_tab_order',
  'repair_native_link_structure',
  'set_link_annotation_contents',
  'tag_unowned_annotations',
  'remap_orphan_mcids_as_artifacts',
]);

function parseArgs(argv: string[]): { baseline: string; selection: string; poc: string; out: string } {
  let baseline = DEFAULT_BASELINE;
  let selection = DEFAULT_SELECTION;
  let poc = DEFAULT_POC;
  let out = DEFAULT_OUT;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const value = argv[i + 1];
    if (arg === '--baseline' && value) {
      baseline = value;
      i += 1;
    } else if (arg === '--selection' && value) {
      selection = value;
      i += 1;
    } else if (arg === '--poc' && value) {
      poc = value;
      i += 1;
    } else if (arg === '--out' && value) {
      out = value;
      i += 1;
    } else if (arg === '--help' || arg === '-h') {
      console.log([
        'Usage: pnpm exec tsx scripts/all-input-heading-residual-object-diagnostic.ts [--baseline <baseline_report.json>] [--selection <target-selection.json>] [--poc <poc-rule-matrix.json>] [--out <dir>]',
      ].join('\n'));
      process.exit(0);
    }
  }
  return { baseline, selection, poc, out };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function parseDetails(value: unknown): Record<string, unknown> | null {
  if (!value) return null;
  if (typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value !== 'string' || !value.trim().startsWith('{')) return null;
  try {
    return asRecord(JSON.parse(value) as unknown);
  } catch {
    return null;
  }
}

function numberOrZero(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function category(row: BaselineRow, key: string): number | null {
  const categories = row.categoryGap?.after ?? row.afterCategories ?? [];
  return categories.find(item => item.key === key)?.score ?? null;
}

function pocByBasename(pocMatrix: unknown): Map<string, string[]> {
  const files = (asRecord(pocMatrix)?.files ?? []) as PocFile[];
  const out = new Map<string, string[]>();
  for (const file of files) {
    out.set(
      basename(file.file),
      (file.rules ?? [])
        .filter(rule => rule.status === 'fail')
        .map(rule => rule.ruleId)
        .sort((a, b) => a.localeCompare(b)),
    );
  }
  return out;
}

function pacRuleIdsFromTool(tool: ToolRow): string[] {
  const details = parseDetails(tool.details);
  const ids = new Set<string>();
  const note = typeof details?.note === 'string' ? details.note : typeof details?.raw === 'string' ? details.raw : '';
  const match = note.match(/pac_rule_regressed\(([^)]+)\)/);
  if (match?.[1]) ids.add(match[1]);
  const single = asRecord(details?.pacRuleRegression);
  if (typeof single?.ruleId === 'string') ids.add(single.ruleId);
  const many = Array.isArray(details?.pacRuleRegressions) ? details.pacRuleRegressions : [];
  for (const item of many) {
    const id = asRecord(item)?.ruleId;
    if (typeof id === 'string') ids.add(id);
  }
  return [...ids].sort((a, b) => a.localeCompare(b));
}

function classify(input: {
  row: BaselineRow;
  pocRules: string[];
  structureToolAttempts: number;
  scoreMovingStructureAttempts: number;
  cleanupAttempts: number;
  rejectedPacRules: string[];
}): { classification: HeadingResidualClassification; recommendation: string } {
  const score = numberOrZero(input.row.afterScore);
  const durationMs = numberOrZero(input.row.durationMs);
  if (score <= 0 || /timeout/i.test(String(input.row.error ?? ''))) {
    return {
      classification: 'parked_hard_timeout',
      recommendation: 'Do not change behavior from this row; first capture or inspect timeout traces and checkpoint history.',
    };
  }
  if (durationMs >= 240_000) {
    return {
      classification: 'runtime_route_heavy',
      recommendation: 'Runtime dominates this row; inspect stage/runtime trace before adding a quality repair.',
    };
  }
  const hasContent = input.pocRules.some(rule => rule.startsWith('pdfua.content.'));
  const onlyFont = input.pocRules.length > 0 && input.pocRules.every(rule => rule.startsWith('pdfua.font.'));
  if (hasContent) {
    return {
      classification: 'content_tagging_object_candidate',
      recommendation: 'Direct PAC content-tagging evidence exists; inspect text/image/path object ownership before any heading route change.',
    };
  }
  if (onlyFont) {
    return {
      classification: 'font_cmap_only_diagnostic',
      recommendation: 'POC evidence is font/CMap-only; keep diagnostic for now because font caps/remediation were previously noisy.',
    };
  }
  if (score >= 85) {
    return {
      classification: 'near_pass_heading_cap',
      recommendation: 'Near-pass row; prioritize after higher-deficit object candidates unless a direct heading object is proven.',
    };
  }
  if (input.structureToolAttempts > 0 || input.cleanupAttempts > 0) {
    return {
      classification: 'heading_route_plateau',
      recommendation: 'Tools ran but did not expose score-moving PAC-safe heading movement; compare route repeats or add object evidence.',
    };
  }
  return {
    classification: 'needs_fresh_object_evidence',
    recommendation: 'No direct PAC/object evidence in current artifacts; run a focused analyzer/object diagnostic before behavior.',
  };
}

export function buildHeadingResidualObjectDiagnostic(input: {
  baselineRows: BaselineRow[];
  selectionRows: SelectionRow[];
  pocMatrix?: unknown;
  baselineSource?: string;
  selectionSource?: string;
  pocSource?: string;
  generatedAt?: string;
}): HeadingResidualObjectDiagnostic {
  const baselineByBase = new Map(input.baselineRows.map(row => [basename(row.file), row]));
  const pocMap = pocByBasename(input.pocMatrix ?? {});
  const selected = input.selectionRows.filter(row => row.classification === 'heading_reading_recovery_target');
  const rows = selected.map(selectedRow => {
    const row = baselineByBase.get(basename(selectedRow.file)) ?? {
      file: selectedRow.file,
      afterScore: 0,
      afterGrade: '?',
      durationMs: 0,
      appliedTools: [],
    };
    const tools = row.appliedTools ?? [];
    const structureTools = tools.filter(tool => STRUCTURE_TOOLS.has(String(tool.toolName ?? '')));
    const cleanupTools = tools.filter(tool => CLEANUP_TOOLS.has(String(tool.toolName ?? '')));
    const rejectedPacRules = [...new Set(tools.flatMap(pacRuleIdsFromTool))].sort((a, b) => a.localeCompare(b));
    const pocFailRules = pocMap.get(basename(row.file)) ?? [];
    const scoreMovingStructureAttempts = structureTools.filter(tool =>
      numberOrZero(tool.scoreAfter) > numberOrZero(tool.scoreBefore) && tool.outcome === 'applied'
    ).length;
    const decision = classify({
      row,
      pocRules: pocFailRules,
      structureToolAttempts: structureTools.length,
      scoreMovingStructureAttempts,
      cleanupAttempts: cleanupTools.length,
      rejectedPacRules,
    });
    return {
      file: row.file,
      score: numberOrZero(row.afterScore),
      grade: row.afterGrade ?? '?',
      deficitTo93: Math.max(0, 93 - numberOrZero(row.afterScore)),
      durationMs: numberOrZero(row.durationMs),
      headingScore: category(row, 'heading_structure'),
      readingScore: category(row, 'reading_order'),
      pdfuaScore: category(row, 'pdf_ua_compliance'),
      pocFailRules,
      structureToolAttempts: structureTools.length,
      scoreMovingStructureAttempts,
      cleanupAttempts: cleanupTools.length,
      rejectedPacRules,
      classification: decision.classification,
      recommendation: decision.recommendation,
    };
  }).sort((a, b) =>
    b.deficitTo93 - a.deficitTo93 ||
    b.durationMs - a.durationMs ||
    a.file.localeCompare(b.file),
  );

  const classKeys = [...new Set(rows.map(row => row.classification))].sort((a, b) => a.localeCompare(b));
  const classificationCounts = classKeys.map(classification => {
    const matching = rows.filter(row => row.classification === classification);
    return {
      classification,
      count: matching.length,
      deficitTo93: matching.reduce((sum, row) => sum + row.deficitTo93, 0),
    };
  }).sort((a, b) => b.deficitTo93 - a.deficitTo93 || b.count - a.count || a.classification.localeCompare(b.classification));
  const selectedNextClass = classificationCounts.find(item =>
    item.classification !== 'parked_hard_timeout' &&
    item.classification !== 'font_cmap_only_diagnostic'
  )?.classification ?? classificationCounts[0]?.classification ?? null;
  return {
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    baselineSource: input.baselineSource ?? '',
    selectionSource: input.selectionSource ?? '',
    pocSource: input.pocSource ?? '',
    summary: {
      rowCount: rows.length,
      classificationCounts,
      selectedNextClass,
      selectedRows: selectedNextClass ? rows.filter(row => row.classification === selectedNextClass).map(row => row.file) : [],
    },
    rows,
  };
}

function renderMarkdown(report: HeadingResidualObjectDiagnostic): string {
  const lines: string[] = [];
  lines.push('# All-Input Heading Residual Object Diagnostic', '');
  lines.push(`- Generated: ${report.generatedAt}`);
  lines.push(`- Baseline source: \`${report.baselineSource}\``);
  lines.push(`- Target selection source: \`${report.selectionSource}\``);
  lines.push(`- POC/PAC source: \`${report.pocSource}\``);
  lines.push(`- Rows: \`${report.summary.rowCount}\``);
  lines.push(`- Selected next class: \`${report.summary.selectedNextClass ?? 'none'}\``, '');
  lines.push('## Classification Summary', '');
  lines.push('| Class | Count | Deficit |');
  lines.push('| --- | ---: | ---: |');
  for (const item of report.summary.classificationCounts) {
    lines.push(`| \`${item.classification}\` | ${item.count} | ${item.deficitTo93} |`);
  }
  lines.push('', '## Rows', '');
  lines.push('| Score | Deficit | Runtime | Class | File | Heading | Reading | PDF/UA | POC fails | Tool shape | Recommendation |');
  lines.push('| ---: | ---: | ---: | --- | --- | ---: | ---: | ---: | --- | --- | --- |');
  for (const row of report.rows) {
    const toolShape = `structure=${row.structureToolAttempts}, moving=${row.scoreMovingStructureAttempts}, cleanup=${row.cleanupAttempts}`;
    lines.push(`| ${row.score}/${row.grade} | ${row.deficitTo93} | ${row.durationMs} | \`${row.classification}\` | \`${row.file}\` | ${row.headingScore ?? 'n/a'} | ${row.readingScore ?? 'n/a'} | ${row.pdfuaScore ?? 'n/a'} | ${row.pocFailRules.map(rule => `\`${rule}\``).join('<br>') || 'none'} | ${toolShape} | ${row.recommendation} |`);
  }
  lines.push('');
  return `${lines.join('\n')}\n`;
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, 'utf8')) as unknown;
}

export function baselineRowsFromJson(value: unknown): BaselineRow[] {
  if (Array.isArray(value)) return value as BaselineRow[];
  const object = asRecord(value);
  return Array.isArray(object?.rows) ? object.rows as BaselineRow[] : [];
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const baseline = await readJson(args.baseline);
  const selection = asRecord(await readJson(args.selection));
  const report = buildHeadingResidualObjectDiagnostic({
    baselineRows: baselineRowsFromJson(baseline),
    selectionRows: Array.isArray(selection?.rows) ? selection.rows as SelectionRow[] : [],
    pocMatrix: await readJson(args.poc),
    baselineSource: args.baseline,
    selectionSource: args.selection,
    pocSource: args.poc,
  });
  await mkdir(args.out, { recursive: true });
  await writeFile(join(args.out, 'heading-residual-object-diagnostic.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await writeFile(join(args.out, 'heading-residual-object-diagnostic.md'), renderMarkdown(report), 'utf8');
  console.log(`Wrote ${join(args.out, 'heading-residual-object-diagnostic.md')}`);
  console.log(`Selected next class: ${report.summary.selectedNextClass ?? 'none'}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
