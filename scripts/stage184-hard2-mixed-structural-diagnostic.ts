#!/usr/bin/env tsx
import 'dotenv/config';

import { access, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { analyzePdf } from '../src/services/pdfAnalyzer.js';
import {
  stage180RemainingTableTargets,
} from '../src/services/remediation/stage180MixedTablePdfua.js';
import { stage181HiddenAltTargets } from '../src/services/remediation/stage181HiddenAlt.js';
import type { AnalysisResult, AppliedRemediationTool, CategoryKey, DocumentSnapshot, StructNode } from '../src/types.js';
import { loadEdgeMixManifest, type EdgeMixManifestRow } from './stage49-edge-mix-baseline.js';

const DEFAULT_MANIFEST = 'Input/from_sibling_pdfaf_v1_hard_2/manifest.json';
const DEFAULT_RUN = 'Output/from_sibling_pdfaf_v1_hard_2/run-stage183-hard2-smoke-2026-05-03-r1';
const DEFAULT_LEGACY_RUN = 'Output/experiment-corpus-baseline/run-stage183-full-2026-05-03-r1';
const DEFAULT_OUT = 'Output/from_sibling_pdfaf_v1_hard_2/stage184-hard2-mixed-structural-diagnostic-2026-05-03-r1';

const HARD_DEFAULT_IDS = new Set([
  'v1-4105',
  '4105',
  'v1-3510',
  '3510',
  'v1-4705',
  '4705',
  'v1-3508',
  '3508',
]);
const LEGACY_DEFAULT_IDS = new Set([
  'figure-4754',
  'font-4057',
  'font-4172',
  'fixture-inaccessible',
  'font-4156',
  'font-4699',
]);

export type Stage184MixedStructuralClass =
  | 'heading_reachability_first_candidate'
  | 'table_first_candidate'
  | 'alt_first_candidate'
  | 'ordered_heading_table_alt_pdfua_transaction_candidate'
  | 'analyzer_heading_mismatch_debt'
  | 'no_safe_single_path';

export interface Stage184ClassificationInput {
  score: number | null;
  headingStructure: number | null;
  readingOrder: number | null;
  altText: number | null;
  tableMarkup: number | null;
  pdfUaCompliance: number | null;
  linkQuality: number | null;
  falsePositiveApplied: number;
  extractedHeadingCount: number;
  treeHeadingCount: number;
  extractedHeadingsMissingFromTree: boolean;
  customHeadingRoleCount: number;
  standardHeadingRoleCount: number;
  safeTableTargetCount: number;
  safeAltTargetCount: number;
  orphanMcidCount: number;
  annotationRiskCount: number;
  pdfClass: string | null;
}

export interface Stage184Classification {
  classification: Stage184MixedStructuralClass;
  implementable: boolean;
  reason: string;
}

interface RunCategory {
  key?: string;
  score?: number;
  applicable?: boolean;
}

interface RunTool {
  toolName?: string;
  outcome?: string;
  scoreBefore?: number;
  scoreAfter?: number;
  delta?: number;
  stage?: number;
  round?: number;
  source?: string;
  details?: unknown;
}

interface RunRow {
  id?: string;
  publicationId?: string;
  title?: string;
  file?: string;
  localFile?: string | null;
  afterScore?: number;
  afterGrade?: string;
  reanalyzedScore?: number | null;
  reanalyzedGrade?: string | null;
  afterCategories?: RunCategory[];
  reanalyzedCategories?: RunCategory[] | null;
  falsePositiveApplied?: number;
  falsePositiveAppliedCount?: number;
  appliedTools?: RunTool[];
}

interface ToolSummary {
  toolName: string;
  outcome: string;
  scoreBefore: number | null;
  scoreAfter: number | null;
  delta: number | null;
  targetRef: string | null;
  note: string | null;
  source: string | null;
  stage: number | null;
  round: number | null;
}

interface Stage184Signals {
  exportedHeadingCount: number;
  extractedHeadingCount: number;
  treeHeadingCount: number;
  headingTreeDepth: number;
  extractedHeadingsMissingFromTree: boolean;
  customHeadingRoleCounts: Record<string, number>;
  standardHeadingRoleCount: number;
  paragraphStructElemCount: number;
  mcidTextSpanCount: number;
  structureTreeDepth: number;
  rootChildTypes: Array<{ type: string; childCount: number }>;
  tableCount: number;
  safeTableTargets: ReturnType<typeof stage180RemainingTableTargets>;
  stronglyIrregularTableCount: number;
  checkerVisibleFigureCount: number;
  checkerVisibleFigureAltCount: number;
  safeAltTargets: ReturnType<typeof stage181HiddenAltTargets>;
  orphanMcidCount: number;
  suspectedPathPaintOutsideMc: number;
  annotationRiskCount: number;
}

interface Stage184Row {
  id: string;
  publicationId: string;
  title: string;
  sourceKind: 'hard' | 'legacy';
  file: string;
  analyzedPdf: string | null;
  benchmarkScore: number | null;
  benchmarkGrade: string | null;
  reanalyzedScore: number | null;
  reanalyzedGrade: string | null;
  analysisScore: number | null;
  analysisGrade: string | null;
  categories: Partial<Record<CategoryKey, number | null>>;
  signals: Stage184Signals | null;
  classification: Stage184Classification;
  relevantTools: ToolSummary[];
}

interface Stage184Report {
  generatedAt: string;
  manifest: string;
  run: string;
  legacyRun: string;
  rows: Stage184Row[];
  decision: {
    classDistribution: Record<Stage184MixedStructuralClass, number>;
    selectedRows: string[];
    recommendedDirection: 'try_heading_role_standardization' | 'diagnostic_only_no_safe_rule';
  };
}

function usage(): string {
  return `Usage: pnpm exec tsx scripts/stage184-hard2-mixed-structural-diagnostic.ts [options]

Options:
  --manifest <path>     Hard holdout 2 manifest (default: ${DEFAULT_MANIFEST})
  --run <dir>           Hard holdout 2 run (default: ${DEFAULT_RUN})
  --legacy-run <dir>    Original-50 control run (default: ${DEFAULT_LEGACY_RUN})
  --out <dir>           Output directory (default: ${DEFAULT_OUT})
  --file <id>           Limit/add id or publication id; repeatable
  --help                Show this help`;
}

function argValue(flag: string): string | null {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] ?? null : null;
}

function repeatedArg(flag: string): string[] {
  const values: string[] = [];
  for (let index = 0; index < process.argv.length; index += 1) {
    if (process.argv[index] === flag && process.argv[index + 1]) values.push(process.argv[index + 1]!);
  }
  return values;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function categoryScore(categories: RunCategory[] | null | undefined, key: CategoryKey): number | null {
  const row = categories?.find(category => category.key === key);
  if (!row || row.applicable === false) return null;
  return numberOrNull(row.score);
}

function analysisCategoryScore(analysis: AnalysisResult | null, key: CategoryKey): number | null {
  const row = analysis?.categories.find(category => category.key === key);
  if (!row || row.applicable === false) return null;
  return numberOrNull(row.score);
}

function normalizeRole(value: string | undefined): string {
  return (value ?? '').replace(/^\//, '').replace(/#20/g, ' ').replace(/[_-]/g, ' ').replace(/\s+/g, ' ').trim();
}

function isStandardHeadingRole(value: string | undefined): boolean {
  return /^H([1-6])?$/i.test(normalizeRole(value));
}

function isCustomNumberedHeadingRole(value: string | undefined): boolean {
  return /^Heading [1-6]$/i.test(normalizeRole(value));
}

function walkTree(node: StructNode | null | undefined, out: string[] = []): string[] {
  if (!node) return out;
  out.push(normalizeRole(node.type));
  for (const child of node.children ?? []) walkTree(child, out);
  return out;
}

function parseRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value === 'string' && value.trim().startsWith('{')) {
    try {
      const parsed = JSON.parse(value) as unknown;
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
    } catch {
      return null;
    }
  }
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function nested(record: Record<string, unknown> | null, key: string): Record<string, unknown> | null {
  const value = record?.[key];
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function targetRefFromDetails(details: unknown): string | null {
  const parsed = parseRecord(details);
  const invariants = nested(parsed, 'invariants');
  if (typeof invariants?.targetRef === 'string') return invariants.targetRef;
  const debug = nested(parsed, 'debug');
  if (typeof debug?.targetRef === 'string') return debug.targetRef;
  const replayState = nested(debug, 'replayState');
  if (typeof replayState?.targetRef === 'string') return replayState.targetRef;
  return null;
}

function noteFromDetails(details: unknown): string | null {
  const parsed = parseRecord(details);
  const note = parsed?.note ?? parsed?.raw;
  return typeof note === 'string' ? note : null;
}

function relevantTools(row: RunRow | undefined): ToolSummary[] {
  const toolNames = new Set([
    'normalize_heading_hierarchy',
    'synthesize_basic_structure_from_layout',
    'create_heading_from_candidate',
    'normalize_table_structure',
    'set_table_header_cells',
    'repair_native_table_headers',
    'set_figure_alt_text',
    'retag_as_figure',
    'canonicalize_figure_alt_ownership',
    'repair_alt_text_structure',
    'mark_untagged_content_as_artifact',
    'remap_orphan_mcids_as_artifacts',
    'repair_structure_conformance',
    'repair_native_link_structure',
  ]);
  return (row?.appliedTools ?? [])
    .filter(tool => tool.toolName && toolNames.has(tool.toolName))
    .map(tool => ({
      toolName: tool.toolName!,
      outcome: typeof tool.outcome === 'string' ? tool.outcome : 'unknown',
      scoreBefore: numberOrNull(tool.scoreBefore),
      scoreAfter: numberOrNull(tool.scoreAfter),
      delta: numberOrNull(tool.delta),
      targetRef: targetRefFromDetails(tool.details),
      note: noteFromDetails(tool.details),
      source: typeof tool.source === 'string' ? tool.source : null,
      stage: numberOrNull(tool.stage),
      round: numberOrNull(tool.round),
    }));
}

function annotationRiskCount(snapshot: DocumentSnapshot): number {
  const annotation = snapshot.annotationAccessibility;
  const detection = snapshot.detectionProfile?.annotationSignals;
  return (
    (annotation?.pagesAnnotationOrderDiffers ?? detection?.pagesAnnotationOrderDiffers ?? 0) +
    (annotation?.linkAnnotationsMissingStructure ?? detection?.linkAnnotationsMissingStructure ?? 0) +
    (annotation?.linkAnnotationsMissingStructParent ?? detection?.linkAnnotationsMissingStructParent ?? 0) +
    (annotation?.nonLinkAnnotationsMissingStructure ?? detection?.nonLinkAnnotationsMissingStructure ?? 0) +
    (annotation?.nonLinkAnnotationsMissingStructParent ?? detection?.nonLinkAnnotationsMissingStructParent ?? 0)
  );
}

function buildSignals(snapshot: DocumentSnapshot, appliedTools: readonly AppliedRemediationTool[]): Stage184Signals {
  const roles = walkTree(snapshot.structureTree);
  const customHeadingRoleCounts: Record<string, number> = {};
  for (const role of roles) {
    if (isCustomNumberedHeadingRole(role)) customHeadingRoleCounts[role] = (customHeadingRoleCounts[role] ?? 0) + 1;
  }
  const headingSignals = snapshot.detectionProfile?.headingSignals;
  const readingSignals = snapshot.detectionProfile?.readingOrderSignals;
  const checkerVisibleFigureCount = snapshot.checkerFigureTargets?.length ?? 0;
  const checkerVisibleFigureAltCount = (snapshot.checkerFigureTargets ?? []).filter(target => target.hasAlt).length;
  return {
    exportedHeadingCount: snapshot.headings.length,
    extractedHeadingCount: headingSignals?.extractedHeadingCount ?? snapshot.headings.length,
    treeHeadingCount: headingSignals?.treeHeadingCount ?? roles.filter(isStandardHeadingRole).length,
    headingTreeDepth: headingSignals?.headingTreeDepth ?? 0,
    extractedHeadingsMissingFromTree: headingSignals?.extractedHeadingsMissingFromTree === true,
    customHeadingRoleCounts,
    standardHeadingRoleCount: roles.filter(isStandardHeadingRole).length,
    paragraphStructElemCount: snapshot.paragraphStructElems?.length ?? 0,
    mcidTextSpanCount: snapshot.taggedContentAudit?.mcidTextSpanCount ?? snapshot.mcidTextSpans?.length ?? 0,
    structureTreeDepth: readingSignals?.structureTreeDepth ?? 0,
    rootChildTypes: (snapshot.structureTree?.children ?? []).slice(0, 10).map(child => ({
      type: normalizeRole(child.type),
      childCount: child.children?.length ?? 0,
    })),
    tableCount: snapshot.tables.length,
    safeTableTargets: stage180RemainingTableTargets(snapshot, appliedTools),
    stronglyIrregularTableCount: snapshot.detectionProfile?.tableSignals.stronglyIrregularTableCount ?? 0,
    checkerVisibleFigureCount,
    checkerVisibleFigureAltCount,
    safeAltTargets: stage181HiddenAltTargets(snapshot, appliedTools),
    orphanMcidCount:
      snapshot.taggedContentAudit?.orphanMcidCount ??
      snapshot.detectionProfile?.pdfUaSignals.orphanMcidCount ??
      snapshot.orphanMcids?.length ??
      0,
    suspectedPathPaintOutsideMc:
      snapshot.taggedContentAudit?.suspectedPathPaintOutsideMc ??
      snapshot.detectionProfile?.pdfUaSignals.suspectedPathPaintOutsideMc ??
      0,
    annotationRiskCount: annotationRiskCount(snapshot),
  };
}

export function classifyStage184MixedStructural(input: Stage184ClassificationInput): Stage184Classification {
  const heading = input.headingStructure ?? 100;
  const reading = input.readingOrder ?? 100;
  const alt = input.altText ?? 100;
  const table = input.tableMarkup ?? 100;
  const pdfua = input.pdfUaCompliance ?? 100;
  const link = input.linkQuality ?? 100;
  if (input.falsePositiveApplied > 0) {
    return { classification: 'no_safe_single_path', implementable: false, reason: 'false-positive-applied evidence present' };
  }
  if (input.pdfClass === 'scanned') {
    return { classification: 'no_safe_single_path', implementable: false, reason: 'scanned row not a native mixed structural target' };
  }
  if (
    heading < 80 &&
    input.extractedHeadingsMissingFromTree &&
    input.customHeadingRoleCount > 0 &&
    input.standardHeadingRoleCount === 0 &&
    input.extractedHeadingCount > 0
  ) {
    return {
      classification: 'heading_reachability_first_candidate',
      implementable: true,
      reason: 'custom Heading N roles are content-backed but not checker-visible H1-H6 roles',
    };
  }
  if (heading < 80 && input.extractedHeadingsMissingFromTree && input.extractedHeadingCount > 0) {
    return {
      classification: 'analyzer_heading_mismatch_debt',
      implementable: false,
      reason: 'extracted headings exist but no standard/custom reachable heading role path was proven',
    };
  }
  if (heading >= 80 && reading >= 80 && table < 80 && input.safeTableTargetCount > 0) {
    return {
      classification: 'table_first_candidate',
      implementable: true,
      reason: 'core heading/reading evidence is stable and explicit table targets remain',
    };
  }
  if (heading >= 80 && reading >= 80 && table >= 80 && alt < 80 && input.safeAltTargetCount > 0) {
    return {
      classification: 'alt_first_candidate',
      implementable: true,
      reason: 'core structure/table evidence is stable and explicit alt targets remain',
    };
  }
  if (
    (heading < 80 || reading < 80 || alt < 80 || table < 80 || pdfua < 80) &&
    link >= 80 &&
    input.annotationRiskCount === 0 &&
    (
      input.customHeadingRoleCount > 0 ||
      input.safeTableTargetCount > 0 ||
      input.safeAltTargetCount > 0 ||
      input.orphanMcidCount > 0
    )
  ) {
    return {
      classification: 'ordered_heading_table_alt_pdfua_transaction_candidate',
      implementable: false,
      reason: 'multiple low categories have evidence, but no single category can be accepted safely yet',
    };
  }
  return { classification: 'no_safe_single_path', implementable: false, reason: 'no content-backed single safe path was proven' };
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function loadRunRows(runDir: string): Promise<Map<string, RunRow>> {
  const parsed = JSON.parse(await readFile(join(runDir, 'remediate.results.json'), 'utf8')) as unknown;
  const rows = Array.isArray(parsed) ? parsed as RunRow[] : Object.values(parsed as Record<string, RunRow>);
  const map = new Map<string, RunRow>();
  for (const row of rows) {
    if (row.id) map.set(row.id, row);
    if (row.publicationId) map.set(row.publicationId, row);
  }
  return map;
}

async function findRemediatedPdf(runDir: string, id: string, publicationId: string): Promise<string | null> {
  const files = await readdir(runDir).catch(() => []);
  const found = files.find(name =>
    name.endsWith('.remediated.pdf') &&
    (name.startsWith(`${publicationId}-`) || name.startsWith(`${id}-`) || name.includes(id))
  );
  return found ? join(runDir, found) : null;
}

function categoriesFor(row: RunRow | undefined, analysis: AnalysisResult | null): Partial<Record<CategoryKey, number | null>> {
  const source = row?.reanalyzedCategories ?? row?.afterCategories;
  const out: Partial<Record<CategoryKey, number | null>> = {};
  for (const key of ['heading_structure', 'reading_order', 'alt_text', 'table_markup', 'pdf_ua_compliance', 'link_quality'] as const) {
    out[key] = categoryScore(source, key) ?? analysisCategoryScore(analysis, key);
  }
  return out;
}

async function analyzeStage184Row(input: {
  id: string;
  publicationId: string;
  title: string;
  file: string;
  sourceKind: 'hard' | 'legacy';
  runDir: string;
  runRow?: RunRow;
}): Promise<Stage184Row> {
  const artifact = await findRemediatedPdf(input.runDir, input.id, input.publicationId);
  const analyzed = artifact && await exists(artifact)
    ? await analyzePdf(artifact, basename(artifact), { bypassCache: true })
    : null;
  const appliedTools = (input.runRow?.appliedTools ?? []) as unknown as AppliedRemediationTool[];
  const signals = analyzed ? buildSignals(analyzed.snapshot, appliedTools) : null;
  const categories = categoriesFor(input.runRow, analyzed?.result ?? null);
  const customHeadingRoleCount = signals
    ? Object.values(signals.customHeadingRoleCounts).reduce((sum, count) => sum + count, 0)
    : 0;
  const classification = classifyStage184MixedStructural({
    score: numberOrNull(input.runRow?.reanalyzedScore) ?? numberOrNull(input.runRow?.afterScore) ?? analyzed?.result.score ?? null,
    headingStructure: categories.heading_structure ?? null,
    readingOrder: categories.reading_order ?? null,
    altText: categories.alt_text ?? null,
    tableMarkup: categories.table_markup ?? null,
    pdfUaCompliance: categories.pdf_ua_compliance ?? null,
    linkQuality: categories.link_quality ?? null,
    falsePositiveApplied: Number(input.runRow?.falsePositiveAppliedCount ?? input.runRow?.falsePositiveApplied ?? 0),
    extractedHeadingCount: signals?.extractedHeadingCount ?? 0,
    treeHeadingCount: signals?.treeHeadingCount ?? 0,
    extractedHeadingsMissingFromTree: signals?.extractedHeadingsMissingFromTree ?? false,
    customHeadingRoleCount,
    standardHeadingRoleCount: signals?.standardHeadingRoleCount ?? 0,
    safeTableTargetCount: signals?.safeTableTargets.length ?? 0,
    safeAltTargetCount: signals?.safeAltTargets.length ?? 0,
    orphanMcidCount: signals?.orphanMcidCount ?? 0,
    annotationRiskCount: signals?.annotationRiskCount ?? 0,
    pdfClass: analyzed?.result.pdfClass ?? null,
  });
  return {
    id: input.id,
    publicationId: input.publicationId,
    title: input.title,
    sourceKind: input.sourceKind,
    file: input.file,
    analyzedPdf: artifact,
    benchmarkScore: numberOrNull(input.runRow?.afterScore),
    benchmarkGrade: typeof input.runRow?.afterGrade === 'string' ? input.runRow.afterGrade : null,
    reanalyzedScore: numberOrNull(input.runRow?.reanalyzedScore),
    reanalyzedGrade: typeof input.runRow?.reanalyzedGrade === 'string' ? input.runRow.reanalyzedGrade : null,
    analysisScore: analyzed?.result.score ?? null,
    analysisGrade: analyzed?.result.grade ?? null,
    categories,
    signals,
    classification,
    relevantTools: relevantTools(input.runRow),
  };
}

function buildReport(input: {
  manifest: string;
  run: string;
  legacyRun: string;
  rows: Stage184Row[];
}): Stage184Report {
  const classDistribution = input.rows.reduce<Record<Stage184MixedStructuralClass, number>>((acc, row) => {
    acc[row.classification.classification] += 1;
    return acc;
  }, {
    heading_reachability_first_candidate: 0,
    table_first_candidate: 0,
    alt_first_candidate: 0,
    ordered_heading_table_alt_pdfua_transaction_candidate: 0,
    analyzer_heading_mismatch_debt: 0,
    no_safe_single_path: 0,
  });
  const selectedRows = input.rows
    .filter(row => row.classification.implementable)
    .map(row => row.id);
  return {
    generatedAt: new Date().toISOString(),
    manifest: resolve(input.manifest),
    run: resolve(input.run),
    legacyRun: resolve(input.legacyRun),
    rows: input.rows,
    decision: {
      classDistribution,
      selectedRows,
      recommendedDirection: selectedRows.some(id => id === 'v1-4105' || id === '4105')
        ? 'try_heading_role_standardization'
        : 'diagnostic_only_no_safe_rule',
    },
  };
}

function renderMarkdown(report: Stage184Report): string {
  const lines = [
    '# Stage 184 Hard-Holdout-2 Mixed Structural Diagnostic',
    '',
    `Generated: ${report.generatedAt}`,
    `Run: \`${report.run}\``,
    `Legacy run: \`${report.legacyRun}\``,
    `Decision: \`${report.decision.recommendedDirection}\``,
    '',
    '## Class Distribution',
    '',
    ...Object.entries(report.decision.classDistribution).map(([key, value]) => `- \`${key}\`: ${value}`),
    '',
    '## Rows',
    '',
  ];
  for (const row of report.rows) {
    const s = row.signals;
    const customRoles = s
      ? Object.entries(s.customHeadingRoleCounts).map(([role, count]) => `${role}:${count}`).join(', ') || 'none'
      : 'n/a';
    const tableTargets = s?.safeTableTargets.map(target => `${target.structRef}@p${target.page + 1}`).join(', ') || 'none';
    const altTargets = s?.safeAltTargets.map(target => `${target.toolName}:${target.structRef}@p${target.page + 1}`).join(', ') || 'none';
    lines.push(
      `### ${row.id} (${row.publicationId})`,
      '',
      `- Score: benchmark ${row.benchmarkScore ?? 'n/a'}/${row.benchmarkGrade ?? 'n/a'}, reanalyzed ${row.reanalyzedScore ?? 'n/a'}/${row.reanalyzedGrade ?? 'n/a'}, analysis ${row.analysisScore ?? 'n/a'}/${row.analysisGrade ?? 'n/a'}`,
      `- Categories: heading=${row.categories.heading_structure ?? 'n/a'}, reading=${row.categories.reading_order ?? 'n/a'}, alt=${row.categories.alt_text ?? 'n/a'}, table=${row.categories.table_markup ?? 'n/a'}, pdfua=${row.categories.pdf_ua_compliance ?? 'n/a'}, link=${row.categories.link_quality ?? 'n/a'}`,
      `- Classification: \`${row.classification.classification}\` - ${row.classification.reason}`,
      `- Heading evidence: exported=${s?.exportedHeadingCount ?? 'n/a'}, extracted=${s?.extractedHeadingCount ?? 'n/a'}, tree=${s?.treeHeadingCount ?? 'n/a'}, standardRoles=${s?.standardHeadingRoleCount ?? 'n/a'}, customRoles=${customRoles}`,
      `- Structure: depth=${s?.structureTreeDepth ?? 'n/a'}, rootChildren=${s?.rootChildTypes.map(child => `${child.type || '(blank)'}:${child.childCount}`).join(', ') ?? 'n/a'}, paragraphs=${s?.paragraphStructElemCount ?? 'n/a'}, mcidSpans=${s?.mcidTextSpanCount ?? 'n/a'}`,
      `- Table/alt/PDF-UA: tables=${s?.tableCount ?? 'n/a'}, stronglyIrregular=${s?.stronglyIrregularTableCount ?? 'n/a'}, tableTargets=${tableTargets}, checkerFigures=${s?.checkerVisibleFigureAltCount ?? 'n/a'}/${s?.checkerVisibleFigureCount ?? 'n/a'}, altTargets=${altTargets}, orphanMcids=${s?.orphanMcidCount ?? 'n/a'}, pathPaint=${s?.suspectedPathPaintOutsideMc ?? 'n/a'}, annotationRisk=${s?.annotationRiskCount ?? 'n/a'}`,
      `- Relevant tools: ${row.relevantTools.map(tool => `${tool.toolName}:${tool.outcome}${tool.targetRef ? `@${tool.targetRef}` : ''}:${tool.scoreBefore ?? 'n/a'}->${tool.scoreAfter ?? 'n/a'}${tool.note ? `(${tool.note})` : ''}`).join('; ') || 'none'}`,
      '',
    );
  }
  return `${lines.join('\n')}\n`;
}

async function main(): Promise<void> {
  if (process.argv.includes('--help')) {
    console.log(usage());
    return;
  }
  const manifest = argValue('--manifest') ?? DEFAULT_MANIFEST;
  const run = argValue('--run') ?? DEFAULT_RUN;
  const legacyRun = argValue('--legacy-run') ?? DEFAULT_LEGACY_RUN;
  const out = argValue('--out') ?? DEFAULT_OUT;
  const requested = new Set(repeatedArg('--file'));
  const selected = requested.size > 0 ? requested : new Set([...HARD_DEFAULT_IDS, ...LEGACY_DEFAULT_IDS]);

  const hardRows = (await loadEdgeMixManifest(manifest))
    .filter(row => selected.has(row.id) || selected.has(row.publicationId));
  const hardRunRows = await loadRunRows(run);
  const legacyRunRows = await loadRunRows(legacyRun);
  const seenLegacy = new Set<string>();
  const legacyRows = [...legacyRunRows.values()]
    .filter(row => {
      if (!row.id || !selected.has(row.id) || seenLegacy.has(row.id)) return false;
      seenLegacy.add(row.id);
      return true;
    })
    .map(row => ({
      id: row.id!,
      publicationId: row.publicationId ?? row.id!,
      title: row.title ?? row.id!,
      localFile: row.file ?? '',
      absolutePath: '',
      v1Score: null,
      v1Grade: null,
      pageCount: null,
      problemMix: [],
    } satisfies EdgeMixManifestRow));

  const rows = [
    ...(await Promise.all(hardRows.map(row => analyzeStage184Row({
      id: row.id,
      publicationId: row.publicationId,
      title: row.title,
      file: row.localFile,
      sourceKind: 'hard',
      runDir: run,
      runRow: hardRunRows.get(row.id) ?? hardRunRows.get(row.publicationId),
    })))),
    ...(await Promise.all(legacyRows.map(row => analyzeStage184Row({
      id: row.id,
      publicationId: row.publicationId,
      title: row.title,
      file: row.localFile,
      sourceKind: 'legacy',
      runDir: legacyRun,
      runRow: legacyRunRows.get(row.id) ?? legacyRunRows.get(row.publicationId),
    })))),
  ];
  const report = buildReport({ manifest, run, legacyRun, rows });
  await mkdir(out, { recursive: true });
  await writeFile(join(out, 'stage184-hard2-mixed-structural-diagnostic.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await writeFile(join(out, 'stage184-hard2-mixed-structural-diagnostic.md'), renderMarkdown(report), 'utf8');
  console.log(`Wrote Stage 184 diagnostic to ${out}`);
  console.log(`Decision: ${report.decision.recommendedDirection}`);
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}
