#!/usr/bin/env tsx
import 'dotenv/config';

import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { REMEDIATION_ANALYSIS_TIMEOUT_MS } from '../src/config.js';
import { buildPacRuleEvidence, type PacRuleEvidence } from '../src/services/compliance/pacRuleEvidence.js';
import { analyzePdf } from '../src/services/pdfAnalyzer.js';
import { buildDefaultParams } from '../src/services/remediation/planner.js';
import { runSingleTool } from '../src/services/remediation/orchestrator.js';
import type { AnalysisResult, AppliedRemediationTool, DocumentSnapshot, PlannedRemediationTool } from '../src/types.js';

const DEFAULT_INPUT_DIR = 'Output/goal-all-input-mean-2026-05-09-r1/focused-table-header-targets';
const DEFAULT_REMEDIATED_DIR = 'Output/goal-all-input-mean-2026-05-09-r1/run-focused-table-header-targets-2026-05-09-r1';
const DEFAULT_OUT = 'Output/goal-all-input-mean-2026-05-09-r1/table-structure-sequence-probe-r1';
const DEFAULT_IDS = ['0032', '0057', '4722'];

const STRUCTURE_TOOLS = [
  'repair_structure_conformance',
  'synthesize_basic_structure_from_layout',
  'create_heading_from_candidate',
] as const;
const TABLE_TOOLS = [
  'normalize_table_structure',
  'repair_native_table_headers',
  'set_table_header_cells',
] as const;
const ANNOTATION_CLEANUP_TOOLS = [
  'tag_unowned_annotations',
  'set_link_annotation_contents',
  'repair_native_link_structure',
  'normalize_annotation_tab_order',
] as const;
const TABLE_CLEANUP_TOOLS = [
  'set_table_header_cells',
  'repair_native_table_headers',
] as const;

type ProbeClassification =
  | 'sequence_candidate'
  | 'annotation_cleanup_insufficient'
  | 'table_header_cleanup_insufficient'
  | 'harmful_pac_regression'
  | 'no_score_movement'
  | 'no_structural_or_table_movement'
  | 'missing_input';

interface PacSummary {
  failedRules: Array<{ ruleId: string; category: string; count: number | null }>;
  annotationDebt: number;
  orphanMcidDebt: number;
  tableHeaderDebt: number;
}

interface ScoreSummary {
  score: number;
  grade: string;
  heading: number | null;
  reading: number | null;
  table: number | null;
  pdfua: number | null;
  alt: number | null;
}

interface ProbeStep {
  toolName: string;
  params: Record<string, unknown>;
  outcome: string;
  details: string | null;
  durationMs: number;
  before: ScoreSummary;
  after: ScoreSummary;
  pac: PacSummary;
}

interface SequenceProbe {
  name: string;
  startSource: 'source' | 'remediated';
  tools: string[];
  start: ScoreSummary;
  final: ScoreSummary;
  startPac: PacSummary;
  finalPac: PacSummary;
  steps: ProbeStep[];
  classification: ProbeClassification;
  reason: string;
}

interface RowProbe {
  file: string;
  id: string;
  sourcePdf: string | null;
  remediatedPdf: string | null;
  sequences: SequenceProbe[];
  bestSequence: Pick<SequenceProbe, 'name' | 'startSource' | 'classification' | 'reason' | 'final'> | null;
}

interface Report {
  generatedAt: string;
  inputDir: string;
  remediatedDir: string;
  ids: string[];
  rows: RowProbe[];
  summary: {
    rows: number;
    sequenceCandidates: number;
    annotationCleanupInsufficient: number;
    tableHeaderCleanupInsufficient: number;
    harmfulPacRegression: number;
    noMovement: number;
  };
}

function usage(): string {
  return [
    'Usage: pnpm exec tsx scripts/all-input-table-structure-sequence-probe.ts',
    '  [--input-dir <dir>] [--remediated-dir <dir>] [--out <dir>] [--id <prefix-or-id>]...',
  ].join('\n');
}

function parseArgs(argv: string[]): { inputDir: string; remediatedDir: string; out: string; ids: string[] } {
  const args = {
    inputDir: DEFAULT_INPUT_DIR,
    remediatedDir: DEFAULT_REMEDIATED_DIR,
    out: DEFAULT_OUT,
    ids: [] as string[],
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--input-dir') args.inputDir = argv[++index] ?? '';
    else if (arg === '--remediated-dir') args.remediatedDir = argv[++index] ?? '';
    else if (arg === '--out') args.out = argv[++index] ?? '';
    else if (arg === '--id') args.ids.push(argv[++index] ?? '');
    else if (arg === '--help' || arg === '-h') {
      console.log(usage());
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}\n${usage()}`);
    }
  }
  return {
    inputDir: resolve(args.inputDir),
    remediatedDir: resolve(args.remediatedDir),
    out: resolve(args.out),
    ids: args.ids.length > 0 ? args.ids.filter(Boolean) : DEFAULT_IDS,
  };
}

function categoryScore(result: AnalysisResult, key: string): number | null {
  return result.categories.find(category => category.key === key)?.score ?? null;
}

function scoreSummary(result: AnalysisResult): ScoreSummary {
  return {
    score: result.score,
    grade: result.grade,
    heading: categoryScore(result, 'heading_structure'),
    reading: categoryScore(result, 'reading_order'),
    table: categoryScore(result, 'table_markup'),
    pdfua: categoryScore(result, 'pdf_ua_compliance'),
    alt: categoryScore(result, 'alt_text'),
  };
}

function ruleCount(rule: PacRuleEvidence | undefined): number {
  return rule?.status === 'fail' ? Math.max(1, rule.count ?? 1) : 0;
}

function pacSummary(snapshot: DocumentSnapshot): PacSummary {
  const failed = buildPacRuleEvidence(snapshot).filter(row => row.status === 'fail');
  const byRule = new Map<string, { ruleId: string; category: string; count: number | null }>();
  for (const row of failed) {
    const existing = byRule.get(row.ruleId);
    const count = row.count ?? null;
    if (!existing) {
      byRule.set(row.ruleId, { ruleId: row.ruleId, category: row.category, count });
    } else if (count !== null) {
      existing.count = Math.max(existing.count ?? 0, count);
    }
  }
  return {
    failedRules: [...byRule.values()].sort((a, b) => a.ruleId.localeCompare(b.ruleId)),
    annotationDebt: ruleCount(failed.find(row => row.ruleId === 'pdfua.annotations.tagged_annotations_present')),
    orphanMcidDebt: ruleCount(failed.find(row => row.ruleId === 'pdfua.content.orphan_mcids_absent')),
    tableHeaderDebt: failed
      .filter(row => row.ruleId === 'pdfua.table.header_association_present' || row.ruleId === 'pdfua.table.header_cells_associated')
      .reduce((sum, row) => sum + Math.max(1, row.count ?? 1), 0),
  };
}

async function analyzeBuffer(buffer: Buffer, filename: string): Promise<{ result: AnalysisResult; snapshot: DocumentSnapshot }> {
  const dir = await mkdtemp(join(tmpdir(), 'pdfaf-sequence-probe-'));
  const pdfPath = join(dir, filename);
  try {
    await writeFile(pdfPath, buffer);
    return await analyzePdf(pdfPath, filename, { bypassCache: true, timeoutMs: REMEDIATION_ANALYSIS_TIMEOUT_MS });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function toolParams(toolName: string, analysis: AnalysisResult, snapshot: DocumentSnapshot, applied: AppliedRemediationTool[]): Record<string, unknown> {
  const params = buildDefaultParams(toolName, analysis, snapshot, applied);
  if (toolName === 'set_table_header_cells' && Object.keys(params).length === 0) {
    return diagnosticTableHeaderAssociationParams(snapshot, applied);
  }
  if (toolName === 'repair_structure_conformance') return params;
  if (toolName === 'synthesize_basic_structure_from_layout') return params;
  if (toolName === 'repair_native_table_headers') return params;
  if (toolName === 'tag_unowned_annotations') return params;
  if (toolName === 'set_link_annotation_contents') return params;
  if (toolName === 'repair_native_link_structure') return params;
  if (toolName === 'normalize_annotation_tab_order') return params;
  return params;
}

function diagnosticTableHeaderAssociationParams(
  snapshot: DocumentSnapshot,
  applied: AppliedRemediationTool[],
): Record<string, unknown> {
  const audit = snapshot.tableHeaderAudit;
  const signals = snapshot.detectionProfile?.tableSignals;
  const hasAssociationDebt = Boolean(audit && audit.tablesChecked > 0 && (
    audit.headerAssociationMissingCount > 0 ||
    audit.dataCellsWithoutHeaderCount > 0 ||
    audit.orphanHeaderCellCount > 0
  ));
  const hasUnsafeTableShape = Boolean(signals && (
    (signals.directCellUnderTableCount ?? 0) > 0 ||
    (signals.misplacedCellCount ?? 0) > 0 ||
    (signals.irregularTableCount ?? 0) > 0 ||
    (signals.stronglyIrregularTableCount ?? 0) > 0
  ));
  if (!hasAssociationDebt || hasUnsafeTableShape) return {};
  const attemptedRefs = new Set(
    applied
      .filter(row => row.toolName === 'set_table_header_cells')
      .flatMap(row => {
        if (!row.details?.startsWith('{')) return [];
        try {
          const parsed = JSON.parse(row.details) as { mutation?: { targetRef?: unknown; targetRefs?: unknown } };
          const refs = Array.isArray(parsed.mutation?.targetRefs) ? parsed.mutation.targetRefs : [parsed.mutation?.targetRef];
          return refs.filter((ref): ref is string => typeof ref === 'string' && ref.length > 0);
        } catch {
          return [];
        }
      }),
  );
  const targets = snapshot.tables
    .filter(row =>
      row.structRef &&
      !attemptedRefs.has(row.structRef) &&
      row.hasHeaders &&
      (row.headerCount ?? 0) > 0 &&
      (row.cellsMisplacedCount ?? 0) === 0 &&
      (row.irregularRows ?? 0) === 0 &&
      (row.rowCount ?? 0) > 1 &&
      (row.totalCells ?? 0) > (row.headerCount ?? 0)
    )
    .sort((a, b) =>
      ((b.totalCells ?? 0) - (b.headerCount ?? 0)) - ((a.totalCells ?? 0) - (a.headerCount ?? 0))
      || (b.totalCells ?? 0) - (a.totalCells ?? 0)
      || (b.headerCount ?? 0) - (a.headerCount ?? 0)
      || a.page - b.page
      || (a.structRef ?? '').localeCompare(b.structRef ?? '')
    );
  const refs: string[] = [];
  let estimatedTdDebt = 0;
  for (const target of targets) {
    if (!target.structRef) continue;
    const targetDebt = Math.max(1, (target.totalCells ?? 0) - (target.headerCount ?? 0));
    if (refs.length > 0 && estimatedTdDebt + targetDebt > 120) continue;
    refs.push(target.structRef);
    estimatedTdDebt += targetDebt;
    if (refs.length >= 4) break;
  }
  if (refs.length > 1) {
    return { structRefs: refs, tableHeaderAssociation: true, maxTableHeaderAssociationTargets: 4 };
  }
  return refs[0] ? { structRef: refs[0], tableHeaderAssociation: true } : {};
}

async function runSequence(
  name: string,
  startSource: 'source' | 'remediated',
  filename: string,
  startBuffer: Buffer,
  tools: string[],
): Promise<SequenceProbe> {
  let currentBuffer = startBuffer;
  let current = await analyzeBuffer(currentBuffer, filename);
  const start = scoreSummary(current.result);
  const startPac = pacSummary(current.snapshot);
  const applied: AppliedRemediationTool[] = [];
  const steps: ProbeStep[] = [];

  for (const toolName of tools) {
    const params = toolParams(toolName, current.result, current.snapshot, applied);
    const planned: PlannedRemediationTool = {
      toolName,
      params,
      rationale: `diagnostic_sequence_probe(${name})`,
    };
    const before = scoreSummary(current.result);
    const result = await runSingleTool(currentBuffer, planned, current.snapshot, { timeoutMs: REMEDIATION_ANALYSIS_TIMEOUT_MS });
    currentBuffer = result.buffer;
    current = await analyzeBuffer(currentBuffer, filename);
    const after = scoreSummary(current.result);
    const details = typeof result.details === 'string' ? result.details : null;
    steps.push({
      toolName,
      params,
      outcome: result.outcome,
      details: details && details.length > 500 ? `${details.slice(0, 500)}...` : details,
      durationMs: Math.round(result.durationMs),
      before,
      after,
      pac: pacSummary(current.snapshot),
    });
    applied.push({
      toolName,
      stage: 0,
      round: 0,
      scoreBefore: before.score,
      scoreAfter: after.score,
      outcome: result.outcome,
      details: result.details,
      durationMs: result.durationMs,
    });
  }

  const final = scoreSummary(current.result);
  const finalPac = pacSummary(current.snapshot);
  const { classification, reason } = classifySequence(start, final, startPac, finalPac, steps);
  return {
    name,
    startSource,
    tools,
    start,
    final,
    startPac,
    finalPac,
    steps,
    classification,
    reason,
  };
}

function classifySequence(
  start: ScoreSummary,
  final: ScoreSummary,
  startPac: PacSummary,
  finalPac: PacSummary,
  steps: ProbeStep[],
): { classification: ProbeClassification; reason: string } {
  const scoreGain = final.score - start.score;
  const headingGain = (final.heading ?? 0) - (start.heading ?? 0);
  const tableGain = (final.table ?? 0) - (start.table ?? 0);
  const annotationReduced = finalPac.annotationDebt < startPac.annotationDebt;
  const tableHeaderReduced = finalPac.tableHeaderDebt < startPac.tableHeaderDebt;
  const harmfulNonTargetIncrease = finalPac.failedRules.some(rule => {
    if (
      rule.ruleId === 'pdfua.annotations.tagged_annotations_present' ||
      rule.ruleId === 'pdfua.content.orphan_mcids_absent' ||
      rule.ruleId === 'pdfua.table.header_association_present' ||
      rule.ruleId === 'pdfua.table.header_cells_associated'
    ) {
      return false;
    }
    const before = startPac.failedRules.find(item => item.ruleId === rule.ruleId)?.count ?? 0;
    const after = rule.count ?? 1;
    return after > before;
  });
  const anyApplied = steps.some(step => step.outcome === 'applied');
  if (!anyApplied || scoreGain <= 0) {
    return { classification: 'no_score_movement', reason: `score_delta=${scoreGain}, applied=${anyApplied}` };
  }
  if (harmfulNonTargetIncrease) {
    return { classification: 'harmful_pac_regression', reason: 'non-target PAC failure count increased' };
  }
  if (headingGain <= 0 && tableGain <= 0) {
    return { classification: 'no_structural_or_table_movement', reason: `heading_delta=${headingGain}, table_delta=${tableGain}` };
  }
  if (finalPac.annotationDebt > 0 && finalPac.annotationDebt >= startPac.annotationDebt) {
    return { classification: 'annotation_cleanup_insufficient', reason: `annotation_debt ${startPac.annotationDebt}->${finalPac.annotationDebt}` };
  }
  if (finalPac.tableHeaderDebt > 0 && finalPac.tableHeaderDebt >= startPac.tableHeaderDebt) {
    return { classification: 'table_header_cleanup_insufficient', reason: `table_header_debt ${startPac.tableHeaderDebt}->${finalPac.tableHeaderDebt}` };
  }
  if (scoreGain > 0 && (headingGain > 0 || tableGain > 0 || annotationReduced || tableHeaderReduced)) {
    return {
      classification: 'sequence_candidate',
      reason: `score_delta=${scoreGain}, heading_delta=${headingGain}, table_delta=${tableGain}, annotation_debt=${startPac.annotationDebt}->${finalPac.annotationDebt}, table_header_debt=${startPac.tableHeaderDebt}->${finalPac.tableHeaderDebt}`,
    };
  }
  return { classification: 'no_score_movement', reason: `score_delta=${scoreGain}` };
}

async function findPdfById(dir: string, id: string, suffix = '.pdf'): Promise<string | null> {
  const entries = await import('node:fs/promises').then(fs => fs.readdir(dir));
  const match = entries
    .filter(name => name.endsWith(suffix))
    .find(name => name.startsWith(id) || name.includes(`-${id}-`) || name.includes(`_${id}_`));
  return match ? join(dir, match) : null;
}

function remediatedNameFor(sourcePath: string): string {
  return `${basename(sourcePath, '.pdf')}_remediated.pdf`;
}

function sequenceDefinitions(): Array<{ name: string; tools: string[] }> {
  const sequences: Array<{ name: string; tools: string[] }> = [];
  for (const tool of STRUCTURE_TOOLS) {
    sequences.push({
      name: `${tool}_then_annotation_cleanup`,
      tools: [tool, ...ANNOTATION_CLEANUP_TOOLS],
    });
  }
  for (const tool of TABLE_TOOLS) {
    sequences.push({
      name: `${tool}_then_header_cleanup`,
      tools: [tool, ...TABLE_CLEANUP_TOOLS, ...ANNOTATION_CLEANUP_TOOLS],
    });
  }
  sequences.push({
    name: 'normalize_table_structure_twice_then_header_cleanup',
    tools: ['normalize_table_structure', 'normalize_table_structure', ...TABLE_CLEANUP_TOOLS, ...ANNOTATION_CLEANUP_TOOLS],
  });
  return sequences;
}

async function probeRow(inputDir: string, remediatedDir: string, id: string): Promise<RowProbe> {
  const sourcePdf = await findPdfById(inputDir, id);
  const remediatedPdf = sourcePdf
    ? join(remediatedDir, remediatedNameFor(sourcePdf))
    : await findPdfById(remediatedDir, id, '_remediated.pdf');
  const file = sourcePdf ? basename(sourcePdf) : (remediatedPdf ? basename(remediatedPdf).replace(/_remediated\.pdf$/, '.pdf') : id);
  const starts: Array<{ source: 'source' | 'remediated'; path: string }> = [];
  if (sourcePdf && existsSync(sourcePdf)) starts.push({ source: 'source', path: sourcePdf });
  if (remediatedPdf && existsSync(remediatedPdf)) starts.push({ source: 'remediated', path: remediatedPdf });
  if (starts.length === 0) {
    return {
      file,
      id,
      sourcePdf,
      remediatedPdf,
      sequences: [],
      bestSequence: null,
    };
  }

  const sequences: SequenceProbe[] = [];
  for (const start of starts) {
    const buffer = await readFile(start.path);
    for (const definition of sequenceDefinitions()) {
      sequences.push(await runSequence(definition.name, start.source, file, buffer, definition.tools));
    }
  }
  const best = [...sequences].sort((a, b) =>
    Number(b.classification === 'sequence_candidate') - Number(a.classification === 'sequence_candidate') ||
    b.final.score - a.final.score ||
    ((b.final.heading ?? 0) + (b.final.table ?? 0)) - ((a.final.heading ?? 0) + (a.final.table ?? 0)) ||
    a.name.localeCompare(b.name)
  )[0] ?? null;
  return {
    file,
    id,
    sourcePdf,
    remediatedPdf: remediatedPdf && existsSync(remediatedPdf) ? remediatedPdf : null,
    sequences,
    bestSequence: best
      ? {
        name: best.name,
        startSource: best.startSource,
        classification: best.classification,
        reason: best.reason,
        final: best.final,
      }
      : null,
  };
}

function renderMarkdown(report: Report): string {
  const lines: string[] = [];
  lines.push('# All-Input Table/Structure Sequence Probe');
  lines.push('');
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push(`Input dir: \`${report.inputDir}\``);
  lines.push(`Remediated dir: \`${report.remediatedDir}\``);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(`- Rows: ${report.summary.rows}`);
  lines.push(`- Sequence candidates: ${report.summary.sequenceCandidates}`);
  lines.push(`- Annotation cleanup insufficient: ${report.summary.annotationCleanupInsufficient}`);
  lines.push(`- Table-header cleanup insufficient: ${report.summary.tableHeaderCleanupInsufficient}`);
  lines.push(`- Harmful PAC regression: ${report.summary.harmfulPacRegression}`);
  lines.push(`- No useful movement: ${report.summary.noMovement}`);
  lines.push('');
  lines.push('## Best Row Outcomes');
  lines.push('');
  lines.push('| row | best sequence | start | final | classification | reason |');
  lines.push('| --- | --- | --- | --- | --- | --- |');
  for (const row of report.rows) {
    const best = row.bestSequence;
    lines.push([
      row.id,
      best ? `${best.startSource}:${best.name}` : 'none',
      row.file,
      best ? `${best.final.score}/${best.final.grade}` : 'n/a',
      best?.classification ?? 'missing_input',
      (best?.reason ?? '').replace(/\|/g, '/'),
    ].join(' | ').replace(/^/, '| ').replace(/$/, ' |'));
  }
  lines.push('');
  lines.push('## Candidate Details');
  lines.push('');
  for (const row of report.rows) {
    lines.push(`### ${row.id} ${row.file}`);
    lines.push('');
    for (const sequence of row.sequences.filter(item => item.classification === 'sequence_candidate')) {
      lines.push(`- ${sequence.startSource}:${sequence.name}: ${sequence.start.score}/${sequence.start.grade} -> ${sequence.final.score}/${sequence.final.grade}; ${sequence.reason}`);
    }
    if (!row.sequences.some(item => item.classification === 'sequence_candidate')) {
      const top = row.bestSequence;
      lines.push(`- No safe sequence candidate found. Best observed: ${top ? `${top.startSource}:${top.name} ${top.final.score}/${top.final.grade} (${top.classification}: ${top.reason})` : 'none'}.`);
    }
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const rows: RowProbe[] = [];
  for (const id of args.ids) {
    console.error(`[probe] ${id}`);
    rows.push(await probeRow(args.inputDir, args.remediatedDir, id));
  }
  const allSequences = rows.flatMap(row => row.sequences);
  const report: Report = {
    generatedAt: new Date().toISOString(),
    inputDir: args.inputDir,
    remediatedDir: args.remediatedDir,
    ids: args.ids,
    rows,
    summary: {
      rows: rows.length,
      sequenceCandidates: allSequences.filter(row => row.classification === 'sequence_candidate').length,
      annotationCleanupInsufficient: allSequences.filter(row => row.classification === 'annotation_cleanup_insufficient').length,
      tableHeaderCleanupInsufficient: allSequences.filter(row => row.classification === 'table_header_cleanup_insufficient').length,
      harmfulPacRegression: allSequences.filter(row => row.classification === 'harmful_pac_regression').length,
      noMovement: allSequences.filter(row => row.classification === 'no_score_movement' || row.classification === 'no_structural_or_table_movement').length,
    },
  };
  await mkdir(args.out, { recursive: true });
  await writeFile(join(args.out, 'table-structure-sequence-probe.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await writeFile(join(args.out, 'table-structure-sequence-probe.md'), renderMarkdown(report), 'utf8');
  console.log(`Wrote ${join(args.out, 'table-structure-sequence-probe.md')}`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
