#!/usr/bin/env tsx
import 'dotenv/config';

import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { analyzePdf } from '../src/services/pdfAnalyzer.js';
import type { AnalysisResult, AppliedRemediationTool, DocumentSnapshot } from '../src/types.js';
import { loadEdgeMixManifest, type EdgeMixManifestRow } from './stage49-edge-mix-baseline.js';

const DEFAULT_MANIFEST = 'Input/stage145-active-low-grade-tail/manifest.json';
const DEFAULT_REFERENCE_RUN = 'Output/stage145-low-grade-tail/run-stage147-active-tail-2026-04-28-r1';
const DEFAULT_OUT = 'Output/stage145-low-grade-tail/stage148-native-reading-order-diagnostic-2026-04-28-r1';

const DEFAULT_TARGET_IDS = new Set([
  'v1-v1-4171',
  'v1-v1-legacy-4078-4078-community-reentry-challenges-daunt-exoff',
  'v1-v1-legacy-4184-4184-child-sex-exploitation-study-probes-exte',
  'orig-structure-4076',
  'v1-v1-4519',
  'v1-v1-4139',
  'v1-v1-4164',
  'v1-v1-4641',
  'v1-v1-4635',
]);

const PARKED_VOLATILITY_IDS = new Set([
  'orig-structure-4076',
  'v1-v1-4139',
  'v1-v1-4171',
]);

export type Stage148ReadingOrderClass =
  | 'native_reading_order_repair_candidate'
  | 'structure_bootstrap_candidate'
  | 'table_or_form_blocked_reading_order'
  | 'figure_alt_mixed_not_reading_order_first'
  | 'analyzer_volatility'
  | 'no_safe_candidate';

interface Args {
  manifest: string;
  referenceRun: string;
  outDir: string;
  ids: string[];
  all: boolean;
}

interface BenchmarkRow {
  id: string;
  publicationId: string;
  title?: string;
  file?: string;
  localFile?: string;
  afterScore?: number | null;
  afterGrade?: string | null;
  afterPdfClass?: AnalysisResult['pdfClass'] | null;
  afterCategories?: AnalysisResult['categories'];
  afterDetectionProfile?: Record<string, unknown> | null;
  appliedTools?: AppliedRemediationTool[];
  falsePositiveAppliedCount?: number;
}

export interface Stage148ReadingOrderEvidence {
  publicationId: string;
  afterScore: number | null;
  afterGrade: string | null;
  pdfClass: string;
  readingOrderScore: number | null;
  headingScore: number | null;
  altTextScore: number | null;
  tableScore: number | null;
  formScore: number | null;
  pdfUaScore: number | null;
  structureTreeDepth: number | null;
  suspiciousPageCount: number;
  sampledStructurePageOrderDriftCount: number;
  multiColumnOrderRiskPages: number;
  paragraphStructElemCount: number;
  mcidTextSpanCount: number;
  orphanMcidCount: number;
  treeHeadingCount: number;
  extractedHeadingsMissingFromTree: boolean;
  degenerateStructureTree: boolean;
  tableBlocked: boolean;
  formBlocked: boolean;
  figureAltBlocked: boolean;
  hasContentBackedStructure: boolean;
  hasNativeStructureToolAttempt: boolean;
  hasNativeStructureToolSuccess: boolean;
  hasReadingOrderToolAttempt: boolean;
  acceptedTools: string[];
}

export interface Stage148Classification {
  candidateClass: Stage148ReadingOrderClass;
  implementable: boolean;
  reason: string;
}

interface DiagnosticRow extends Stage148ReadingOrderEvidence {
  id: string;
  title: string;
  file: string;
  sourcePath: string;
  hasWrittenPdf: boolean;
  lowCategories: Record<string, number>;
  firstParagraphSamples: string[];
  firstMcidSamples: Array<{ page: number; mcid: number; text: string }>;
  candidateClass: Stage148ReadingOrderClass;
  implementable: boolean;
  reason: string;
}

function usage(): string {
  return `Usage: pnpm exec tsx scripts/stage148-native-reading-order-diagnostic.ts [options]

Options:
  --manifest <path>       Active low-grade tail manifest (default: ${DEFAULT_MANIFEST})
  --reference-run <dir>   Reference run with remediate.results.json (default: ${DEFAULT_REFERENCE_RUN})
  --out <dir>             Output diagnostic directory (default: ${DEFAULT_OUT})
  --file <id>             Limit to publication id or manifest id; repeatable
  --all                   Analyze every manifest row
  --help                  Show this help`;
}

function parseArgs(argv = process.argv.slice(2)): Args {
  let manifest = DEFAULT_MANIFEST;
  let referenceRun = DEFAULT_REFERENCE_RUN;
  let outDir = DEFAULT_OUT;
  const ids: string[] = [];
  let all = false;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!;
    if (arg === '--help' || arg === '-h') {
      console.log(usage());
      process.exit(0);
    } else if (arg === '--manifest') {
      manifest = argv[++index] ?? manifest;
    } else if (arg === '--reference-run') {
      referenceRun = argv[++index] ?? referenceRun;
    } else if (arg === '--out') {
      outDir = argv[++index] ?? outDir;
    } else if (arg === '--file') {
      ids.push(argv[++index] ?? '');
    } else if (arg === '--all') {
      all = true;
    } else {
      throw new Error(`Unknown argument ${arg}\n${usage()}`);
    }
  }
  return {
    manifest: resolve(manifest),
    referenceRun: resolve(referenceRun),
    outDir: resolve(outDir),
    ids: ids.filter(Boolean),
    all,
  };
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function scoreFor(categories: AnalysisResult['categories'] | undefined, key: string): number | null {
  const found = categories?.find(category => category.key === key);
  return typeof found?.score === 'number' && found.applicable !== false ? found.score : null;
}

function lowCategories(categories: AnalysisResult['categories'] | undefined): Record<string, number> {
  return Object.fromEntries((categories ?? [])
    .filter(category => category.applicable !== false && typeof category.score === 'number' && category.score < 80)
    .map(category => [category.key, category.score]));
}

function nestedNumber(value: unknown, path: string[]): number | null {
  let current = value;
  for (const part of path) {
    if (!current || typeof current !== 'object' || Array.isArray(current)) return null;
    current = (current as Record<string, unknown>)[part];
  }
  return num(current);
}

function acceptedTools(row: BenchmarkRow): string[] {
  return (row.appliedTools ?? [])
    .filter(tool => tool.outcome === 'applied')
    .map(tool => tool.toolName);
}

function hasToolAttempt(row: BenchmarkRow, names: string[]): boolean {
  return (row.appliedTools ?? []).some(tool => names.includes(tool.toolName));
}

function hasToolSuccess(row: BenchmarkRow, names: string[]): boolean {
  return (row.appliedTools ?? []).some(tool => names.includes(tool.toolName) && tool.outcome === 'applied');
}

function rowKey(row: BenchmarkRow): string {
  return [row.id, row.publicationId, row.file, row.localFile].filter(Boolean).join(' ');
}

async function readRows(runDir: string): Promise<Map<string, BenchmarkRow>> {
  const parsed = JSON.parse(await readFile(join(runDir, 'remediate.results.json'), 'utf8')) as unknown;
  const rows = Array.isArray(parsed) ? parsed.filter(item => item && typeof item === 'object' && !Array.isArray(item)) as BenchmarkRow[] : [];
  const map = new Map<string, BenchmarkRow>();
  for (const row of rows) {
    if (typeof row.publicationId === 'string') map.set(row.publicationId, row);
    if (typeof row.id === 'string') map.set(row.id, row);
  }
  return map;
}

async function findRemediatedPdf(runDir: string, row: BenchmarkRow): Promise<string | null> {
  const names = await readdir(runDir).catch(() => []);
  const ids = [row.publicationId, row.id].filter((value): value is string => typeof value === 'string' && value.length > 0);
  const found = names
    .filter(name => name.endsWith('.remediated.pdf'))
    .find(name => ids.some(id => name.startsWith(`${id}-`) || name.includes(id)));
  return found ? join(runDir, found) : null;
}

function evidenceFromRun(row: BenchmarkRow): Stage148ReadingOrderEvidence {
  const detection = row.afterDetectionProfile ?? {};
  return {
    publicationId: row.publicationId,
    afterScore: row.afterScore ?? null,
    afterGrade: row.afterGrade ?? null,
    pdfClass: row.afterPdfClass ?? 'unknown',
    readingOrderScore: scoreFor(row.afterCategories, 'reading_order'),
    headingScore: scoreFor(row.afterCategories, 'heading_structure'),
    altTextScore: scoreFor(row.afterCategories, 'alt_text'),
    tableScore: scoreFor(row.afterCategories, 'table_markup'),
    formScore: scoreFor(row.afterCategories, 'form_accessibility'),
    pdfUaScore: scoreFor(row.afterCategories, 'pdf_ua_compliance'),
    structureTreeDepth: nestedNumber(detection, ['readingOrderSignals', 'structureTreeDepth']),
    suspiciousPageCount: nestedNumber(detection, ['readingOrderSignals', 'suspiciousPageCount']) ?? 0,
    sampledStructurePageOrderDriftCount: nestedNumber(detection, ['readingOrderSignals', 'sampledStructurePageOrderDriftCount']) ?? 0,
    multiColumnOrderRiskPages: nestedNumber(detection, ['readingOrderSignals', 'multiColumnOrderRiskPages']) ?? 0,
    paragraphStructElemCount: 0,
    mcidTextSpanCount: 0,
    orphanMcidCount: nestedNumber(detection, ['pdfUaSignals', 'orphanMcidCount']) ?? 0,
    treeHeadingCount: nestedNumber(detection, ['headingSignals', 'treeHeadingCount']) ?? 0,
    extractedHeadingsMissingFromTree: Boolean((detection['headingSignals'] as Record<string, unknown> | undefined)?.['extractedHeadingsMissingFromTree']),
    degenerateStructureTree: Boolean((detection['readingOrderSignals'] as Record<string, unknown> | undefined)?.['degenerateStructureTree']),
    tableBlocked: (scoreFor(row.afterCategories, 'table_markup') ?? 100) < 50,
    formBlocked: (scoreFor(row.afterCategories, 'form_accessibility') ?? 100) < 80,
    figureAltBlocked: (scoreFor(row.afterCategories, 'alt_text') ?? 100) < 70,
    hasContentBackedStructure: false,
    hasNativeStructureToolAttempt: hasToolAttempt(row, ['synthesize_basic_structure_from_layout', 'tag_native_text_blocks']),
    hasNativeStructureToolSuccess: hasToolSuccess(row, ['synthesize_basic_structure_from_layout', 'tag_native_text_blocks']),
    hasReadingOrderToolAttempt: hasToolAttempt(row, ['repair_native_reading_order', 'normalize_annotation_tab_order']),
    acceptedTools: acceptedTools(row),
  };
}

function enrichFromAnalysis(evidence: Stage148ReadingOrderEvidence, analysis: AnalysisResult, snapshot: DocumentSnapshot): Stage148ReadingOrderEvidence {
  const reading = snapshot.detectionProfile?.readingOrderSignals;
  return {
    ...evidence,
    pdfClass: analysis.pdfClass,
    readingOrderScore: scoreFor(analysis.categories, 'reading_order'),
    headingScore: scoreFor(analysis.categories, 'heading_structure'),
    altTextScore: scoreFor(analysis.categories, 'alt_text'),
    tableScore: scoreFor(analysis.categories, 'table_markup'),
    formScore: scoreFor(analysis.categories, 'form_accessibility'),
    pdfUaScore: scoreFor(analysis.categories, 'pdf_ua_compliance'),
    structureTreeDepth: reading?.structureTreeDepth ?? evidence.structureTreeDepth,
    suspiciousPageCount: reading?.suspiciousPageCount ?? evidence.suspiciousPageCount,
    sampledStructurePageOrderDriftCount: reading?.sampledStructurePageOrderDriftCount ?? evidence.sampledStructurePageOrderDriftCount,
    multiColumnOrderRiskPages: reading?.multiColumnOrderRiskPages ?? evidence.multiColumnOrderRiskPages,
    paragraphStructElemCount: snapshot.paragraphStructElems?.length ?? 0,
    mcidTextSpanCount: snapshot.mcidTextSpans?.length ?? 0,
    orphanMcidCount: snapshot.taggedContentAudit?.orphanMcidCount ?? evidence.orphanMcidCount,
    treeHeadingCount: snapshot.detectionProfile?.headingSignals?.treeHeadingCount ?? evidence.treeHeadingCount,
    extractedHeadingsMissingFromTree: snapshot.detectionProfile?.headingSignals?.extractedHeadingsMissingFromTree === true,
    degenerateStructureTree: reading?.degenerateStructureTree === true,
    hasContentBackedStructure: (snapshot.paragraphStructElems?.length ?? 0) >= 6 || (snapshot.mcidTextSpans?.length ?? 0) >= 20,
  };
}

export function classifyStage148ReadingOrder(evidence: Stage148ReadingOrderEvidence): Stage148Classification {
  const reading = evidence.readingOrderScore ?? 100;
  const heading = evidence.headingScore ?? 100;
  const lowReading = reading < 80;
  if (!lowReading) {
    return { candidateClass: 'no_safe_candidate', implementable: false, reason: 'reading_order_not_low' };
  }
  if (PARKED_VOLATILITY_IDS.has(evidence.publicationId)) {
    return { candidateClass: 'analyzer_volatility', implementable: false, reason: 'row_is_previously_parked_for_structural_analyzer_volatility' };
  }
  if (evidence.formBlocked || evidence.tableBlocked) {
    return { candidateClass: 'table_or_form_blocked_reading_order', implementable: false, reason: 'table_or_form_deficit_is_too_severe_for_reading_order_first' };
  }
  if ((evidence.headingScore ?? 100) < 80 && evidence.extractedHeadingsMissingFromTree) {
    return { candidateClass: 'no_safe_candidate', implementable: false, reason: 'reading_order_cap_is_heading_reachability_not_native_order' };
  }
  if (evidence.figureAltBlocked && heading < 80) {
    return { candidateClass: 'figure_alt_mixed_not_reading_order_first', implementable: false, reason: 'figure_alt_and_heading_debt_mixed_with_reading_order' };
  }
  if (evidence.degenerateStructureTree && !evidence.hasContentBackedStructure) {
    return { candidateClass: 'no_safe_candidate', implementable: false, reason: 'degenerate_structure_without_enough_content_backed_evidence' };
  }
  if (!evidence.hasContentBackedStructure && evidence.hasNativeStructureToolSuccess) {
    return { candidateClass: 'structure_bootstrap_candidate', implementable: true, reason: 'native_structure_tools_already_lifted_score_but_final_analysis_lacks_content_evidence' };
  }
  if (!evidence.hasContentBackedStructure) {
    return { candidateClass: 'no_safe_candidate', implementable: false, reason: 'no_content_backed_paragraph_or_mcid_evidence' };
  }
  if (evidence.pdfClass === 'native_tagged' || evidence.pdfClass === 'native_untagged' || evidence.pdfClass === 'mixed') {
    return { candidateClass: 'native_reading_order_repair_candidate', implementable: true, reason: 'low_reading_order_with_content_backed_native_structure_evidence' };
  }
  return { candidateClass: 'no_safe_candidate', implementable: false, reason: `unsupported_pdf_class:${evidence.pdfClass}` };
}

function shouldInclude(manifestRow: EdgeMixManifestRow, row: BenchmarkRow | undefined, args: Args): boolean {
  if (args.all) return true;
  const key = [manifestRow.id, manifestRow.publicationId, row?.id, row?.publicationId].filter(Boolean).join(' ');
  if (args.ids.length > 0) return args.ids.some(id => key.includes(id));
  return DEFAULT_TARGET_IDS.has(manifestRow.publicationId);
}

async function buildDiagnosticRow(manifestRow: EdgeMixManifestRow, row: BenchmarkRow, runDir: string): Promise<DiagnosticRow> {
  let evidence = evidenceFromRun(row);
  const remediatedPdf = await findRemediatedPdf(runDir, row);
  let firstParagraphSamples: string[] = [];
  let firstMcidSamples: Array<{ page: number; mcid: number; text: string }> = [];
  let liveCategories = row.afterCategories;
  if (remediatedPdf) {
    const analyzed = await analyzePdf(remediatedPdf, basename(remediatedPdf), { bypassCache: true });
    evidence = enrichFromAnalysis(evidence, analyzed.result, analyzed.snapshot);
    liveCategories = analyzed.result.categories;
    firstParagraphSamples = (analyzed.snapshot.paragraphStructElems ?? [])
      .slice(0, 8)
      .map(item => `${item.page}:${String(item.tag ?? 'P')}:${String(item.text ?? '').replace(/\s+/g, ' ').trim().slice(0, 120)}`);
    firstMcidSamples = (analyzed.snapshot.mcidTextSpans ?? [])
      .filter(item => Number.isInteger(item.mcid))
      .slice(0, 12)
      .map(item => ({ page: item.page, mcid: item.mcid, text: String(item.resolvedText ?? item.snippet ?? '').replace(/\s+/g, ' ').trim().slice(0, 120) }));
  }
  const classification = classifyStage148ReadingOrder(evidence);
  return {
    ...evidence,
    id: row.id,
    title: manifestRow.title,
    file: row.localFile ?? row.file ?? manifestRow.localFile,
    sourcePath: manifestRow.absolutePath,
    hasWrittenPdf: Boolean(remediatedPdf),
    lowCategories: lowCategories(liveCategories),
    firstParagraphSamples,
    firstMcidSamples,
    candidateClass: classification.candidateClass,
    implementable: classification.implementable,
    reason: classification.reason,
  };
}

function renderMarkdown(rows: DiagnosticRow[]): string {
  const distribution = rows.reduce<Record<string, number>>((acc, row) => {
    acc[row.candidateClass] = (acc[row.candidateClass] ?? 0) + 1;
    return acc;
  }, {});
  const selected = rows.filter(row => row.implementable).map(row => row.publicationId);
  const lines = [
    '# Stage 148 Native Reading-Order Diagnostic',
    '',
    '| Class | Count |',
    '| --- | ---: |',
    ...Object.entries(distribution).sort((a, b) => a[0].localeCompare(b[0])).map(([key, count]) => `| ${key} | ${count} |`),
    '',
    `Recommended direction: ${selected.length > 0 ? 'inspect_or_implement_native_reading_order_repair' : 'diagnostic_only_no_safe_path'}`,
    `Selected rows: ${selected.join(', ') || 'none'}`,
    '',
    '| Row | After | Class | Low categories | Evidence | Tools | Reason |',
    '| --- | ---: | --- | --- | --- | --- | --- |',
  ];
  for (const row of rows) {
    const evidence = [
      `pdf=${row.pdfClass}`,
      `depth=${row.structureTreeDepth ?? 'n/a'}`,
      `P=${row.paragraphStructElemCount}`,
      `MCID=${row.mcidTextSpanCount}`,
      `treeH=${row.treeHeadingCount}`,
      `missingH=${row.extractedHeadingsMissingFromTree}`,
      `degenerate=${row.degenerateStructureTree}`,
      `susp=${row.suspiciousPageCount}`,
      `drift=${row.sampledStructurePageOrderDriftCount}`,
      `orphans=${row.orphanMcidCount}`,
      row.hasWrittenPdf ? 'pdf=yes' : 'pdf=no',
    ].join(' ');
    lines.push(`| ${row.publicationId} | ${row.afterScore ?? 'n/a'}/${row.afterGrade ?? 'n/a'} | ${row.candidateClass} | ${Object.entries(row.lowCategories).map(([key, value]) => `${key}:${value}`).join(', ') || 'none'} | ${evidence} | ${row.acceptedTools.join('<br>') || 'none'} | ${row.reason} |`);
  }
  return `${lines.join('\n')}\n`;
}

async function main(): Promise<void> {
  const args = parseArgs();
  const manifestRows = await loadEdgeMixManifest(args.manifest);
  const runRows = await readRows(args.referenceRun);
  const rows: DiagnosticRow[] = [];
  for (const manifestRow of manifestRows) {
    const row = runRows.get(manifestRow.publicationId) ?? runRows.get(manifestRow.id);
    if (!row || !shouldInclude(manifestRow, row, args)) continue;
    rows.push(await buildDiagnosticRow(manifestRow, row, args.referenceRun));
  }
  const report = {
    generatedAt: new Date().toISOString(),
    manifest: args.manifest,
    referenceRun: args.referenceRun,
    rows,
    decision: {
      selectedRows: rows.filter(row => row.implementable).map(row => row.publicationId),
      classDistribution: rows.reduce<Record<string, number>>((acc, row) => {
        acc[row.candidateClass] = (acc[row.candidateClass] ?? 0) + 1;
        return acc;
      }, {}),
    },
  };
  await mkdir(args.outDir, { recursive: true });
  await writeFile(join(args.outDir, 'stage148-native-reading-order-diagnostic.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await writeFile(join(args.outDir, 'stage148-native-reading-order-diagnostic.md'), renderMarkdown(rows), 'utf8');
  console.log(`Wrote Stage 148 native reading-order diagnostic for ${rows.length} row(s): ${args.outDir}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
