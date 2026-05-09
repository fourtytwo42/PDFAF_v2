#!/usr/bin/env tsx
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { RemediateBenchmarkRow } from '../src/services/benchmark/experimentCorpus.js';
import { loadBenchmarkRowsFromRunDir } from '../src/services/benchmark/stage1Acceptance.js';
import type { CategoryKey } from '../src/types.js';

const DEFAULT_RUN = 'Output/experiment-corpus-baseline/run-goal-blocker-repeat-2026-05-09-r1';
const DEFAULT_OUT = 'Output/experiment-corpus-baseline/font4057-structure-annotation-diagnostic-2026-05-09-r1';
const DEFAULT_ROW = 'font-4057';

const STRUCTURE_TOOLS = new Set([
  'create_heading_from_candidate',
  'normalize_heading_hierarchy',
  'normalize_table_structure',
  'repair_native_table_headers',
  'repair_structure_conformance',
  'synthesize_basic_structure_from_layout',
]);

export type Font4057Classification =
  | 'mixed_table_alt_annotation_debt'
  | 'structure_annotation_sequence_candidate'
  | 'no_score_moving_structure_candidate'
  | 'missing_row';

export interface Font4057RejectedProposal {
  toolName: string;
  outcome: string;
  scoreBefore: number | null;
  scoreAfter: number | null;
  stateSignatureBefore: string | null;
  pacRuleIds: string[];
  headingBefore: number | null;
  headingAfter: number | null;
  tableBefore: number | null;
  tableAfter: number | null;
  readingBefore: number | null;
  readingAfter: number | null;
}

export interface Font4057StructureAnnotationDiagnostic {
  generatedAt: string;
  runDir: string;
  rowId: string;
  classification: Font4057Classification;
  recommendation: string;
  score: number | null;
  grade: string | null;
  reanalyzedScore: number | null;
  reanalyzedGrade: string | null;
  categories: Partial<Record<CategoryKey, number>>;
  rejectedStructureProposalCount: number;
  annotationBlockedProposalCount: number;
  bestBlockedScoreAfter: number | null;
  bestBlockedHeadingAfter: number | null;
  rejectedProposals: Font4057RejectedProposal[];
}

function usage(): string {
  return 'Usage: pnpm exec tsx scripts/font4057-structure-annotation-diagnostic.ts [--run <run-dir>] [--row <id>] [--out <dir>]';
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function parseDetails(details: string | undefined): Record<string, unknown> | null {
  if (!details?.trim().startsWith('{')) return null;
  try {
    return JSON.parse(details) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function categoryScores(value: unknown): Partial<Record<CategoryKey, number>> {
  const record = asRecord(value);
  const out: Partial<Record<CategoryKey, number>> = {};
  if (!record) return out;
  for (const [key, score] of Object.entries(record)) {
    if (typeof score === 'number') out[key as CategoryKey] = score;
  }
  return out;
}

function categoryFromRows(categories: RemediateBenchmarkRow['reanalyzedCategories']): Partial<Record<CategoryKey, number>> {
  const out: Partial<Record<CategoryKey, number>> = {};
  for (const category of categories ?? []) {
    out[category.key] = category.score;
  }
  return out;
}

function pacRuleIds(details: Record<string, unknown> | null): string[] {
  const ids = new Set<string>();
  const regression = asRecord(details?.pacRuleRegression);
  const single = stringOrNull(regression?.ruleId);
  if (single) ids.add(single);
  const regressions = Array.isArray(details?.pacRuleRegressions) ? details?.pacRuleRegressions : [];
  for (const item of regressions) {
    const id = stringOrNull(asRecord(item)?.ruleId);
    if (id) ids.add(id);
  }
  const note = stringOrNull(details?.note) ?? stringOrNull(details?.raw);
  const match = note?.match(/pac_rule_regressed\(([^)]+)\)/);
  if (match?.[1]) ids.add(match[1]);
  return [...ids].sort((a, b) => a.localeCompare(b));
}

function proposal(row: RemediateBenchmarkRow, index: number): Font4057RejectedProposal | null {
  const tool = row.appliedTools[index];
  if (!tool || !STRUCTURE_TOOLS.has(tool.toolName) || tool.outcome !== 'rejected') return null;
  const details = parseDetails(tool.details);
  const debug = asRecord(details?.debug);
  const replay = asRecord(debug?.replayState);
  const before = categoryScores(replay?.categoryScoresBefore);
  const after = categoryScores(replay?.categoryScoresAfter);
  return {
    toolName: tool.toolName,
    outcome: tool.outcome,
    scoreBefore: numberOrNull(replay?.scoreBefore) ?? tool.scoreBefore,
    scoreAfter: numberOrNull(replay?.scoreAfter) ?? tool.scoreAfter,
    stateSignatureBefore: stringOrNull(replay?.stateSignatureBefore),
    pacRuleIds: pacRuleIds(details),
    headingBefore: before.heading_structure ?? null,
    headingAfter: after.heading_structure ?? null,
    tableBefore: before.table_markup ?? null,
    tableAfter: after.table_markup ?? null,
    readingBefore: before.reading_order ?? null,
    readingAfter: after.reading_order ?? null,
  };
}

function classify(input: {
  row: RemediateBenchmarkRow | null;
  proposals: Font4057RejectedProposal[];
  categories: Partial<Record<CategoryKey, number>>;
}): { classification: Font4057Classification; recommendation: string } {
  if (!input.row) {
    return {
      classification: 'missing_row',
      recommendation: 'Regenerate the targeted run with font-4057 before behavior work.',
    };
  }
  const annotationBlocked = input.proposals.filter(item => item.pacRuleIds.includes('pdfua.annotations.tagged_annotations_present'));
  const best = annotationBlocked.reduce<Font4057RejectedProposal | null>((selected, item) => {
    if (!selected) return item;
    return (item.scoreAfter ?? -1) > (selected.scoreAfter ?? -1) ? item : selected;
  }, null);
  if (!best || (best.scoreAfter ?? 0) <= (best.scoreBefore ?? 0)) {
    return {
      classification: 'no_score_moving_structure_candidate',
      recommendation: 'Do not add behavior; no rejected structure proposal shows score movement.',
    };
  }
  const finalAlt = input.categories.alt_text ?? 100;
  const finalTable = input.categories.table_markup ?? 100;
  if (finalAlt < 70 || finalTable < 70) {
    return {
      classification: 'mixed_table_alt_annotation_debt',
      recommendation: 'Do not clone the figure-4702 sequence yet; first prove a final sequence that fixes annotation debt without leaving heavy table/alt debt.',
    };
  }
  return {
    classification: 'structure_annotation_sequence_candidate',
    recommendation: 'A bounded structure-then-annotation sequence may be safe if targeted validation proves final PAC annotation debt is reduced and score reaches B/A.',
  };
}

export function buildFont4057StructureAnnotationDiagnostic(input: {
  runDir: string;
  row: RemediateBenchmarkRow | null;
  rowId?: string;
  generatedAt?: string;
}): Font4057StructureAnnotationDiagnostic {
  const row = input.row;
  const proposals = row?.appliedTools
    .map((_, index) => proposal(row, index))
    .filter((item): item is Font4057RejectedProposal => Boolean(item)) ?? [];
  const categories = categoryFromRows(row?.reanalyzedCategories);
  const annotationBlocked = proposals.filter(item => item.pacRuleIds.includes('pdfua.annotations.tagged_annotations_present'));
  const best = annotationBlocked.reduce<Font4057RejectedProposal | null>((selected, item) => {
    if (!selected) return item;
    return (item.scoreAfter ?? -1) > (selected.scoreAfter ?? -1) ? item : selected;
  }, null);
  const decision = classify({ row, proposals, categories });
  return {
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    runDir: input.runDir,
    rowId: input.rowId ?? DEFAULT_ROW,
    classification: decision.classification,
    recommendation: decision.recommendation,
    score: row?.afterScore ?? null,
    grade: row?.afterGrade ?? null,
    reanalyzedScore: row?.reanalyzedScore ?? null,
    reanalyzedGrade: row?.reanalyzedGrade ?? null,
    categories,
    rejectedStructureProposalCount: proposals.length,
    annotationBlockedProposalCount: annotationBlocked.length,
    bestBlockedScoreAfter: best?.scoreAfter ?? null,
    bestBlockedHeadingAfter: best?.headingAfter ?? null,
    rejectedProposals: proposals.sort((a, b) => (b.scoreAfter ?? -1) - (a.scoreAfter ?? -1) || a.toolName.localeCompare(b.toolName)),
  };
}

function markdown(report: Font4057StructureAnnotationDiagnostic): string {
  const lines = [
    '# Font-4057 Structure/Annotation Diagnostic',
    '',
    `- Run: \`${report.runDir}\``,
    `- Row: \`${report.rowId}\``,
    `- Classification: \`${report.classification}\``,
    `- Score: \`${report.reanalyzedScore ?? report.score}\` / grade \`${report.reanalyzedGrade ?? report.grade}\``,
    `- Rejected structure proposals: \`${report.rejectedStructureProposalCount}\``,
    `- Annotation-blocked proposals: \`${report.annotationBlockedProposalCount}\``,
    `- Best blocked score after: \`${report.bestBlockedScoreAfter}\``,
    `- Best blocked heading after: \`${report.bestBlockedHeadingAfter}\``,
    '',
    report.recommendation,
    '',
    '| Tool | Score | Heading | Table | Reading | PAC rules | State |',
    '| --- | --- | --- | --- | --- | --- | --- |',
  ];
  for (const item of report.rejectedProposals) {
    lines.push(`| \`${item.toolName}\` | ${item.scoreBefore ?? 'n/a'} -> ${item.scoreAfter ?? 'n/a'} | ${item.headingBefore ?? 'n/a'} -> ${item.headingAfter ?? 'n/a'} | ${item.tableBefore ?? 'n/a'} -> ${item.tableAfter ?? 'n/a'} | ${item.readingBefore ?? 'n/a'} -> ${item.readingAfter ?? 'n/a'} | ${item.pacRuleIds.map(id => `\`${id}\``).join(', ') || 'none'} | \`${item.stateSignatureBefore ?? 'n/a'}\` |`);
  }
  return `${lines.join('\n')}\n`;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  let runDir = DEFAULT_RUN;
  let outDir = DEFAULT_OUT;
  let rowId = DEFAULT_ROW;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const value = args[index + 1];
    if (arg === '--run' && value) {
      runDir = value;
      index += 1;
    } else if (arg === '--out' && value) {
      outDir = value;
      index += 1;
    } else if (arg === '--row' && value) {
      rowId = value;
      index += 1;
    } else {
      throw new Error(`Unknown or incomplete argument: ${arg}\n${usage()}`);
    }
  }
  const rows = await loadBenchmarkRowsFromRunDir(runDir);
  const row = rows.remediateResults.find(item => item.id === rowId) ?? null;
  const report = buildFont4057StructureAnnotationDiagnostic({ runDir, row, rowId });
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, 'font4057-structure-annotation-diagnostic.json'), `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(join(outDir, 'font4057-structure-annotation-diagnostic.md'), markdown(report));
  console.log(`Wrote font-4057 diagnostic to ${outDir}`);
  console.log(`Classification: ${report.classification}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
