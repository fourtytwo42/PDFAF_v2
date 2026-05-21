#!/usr/bin/env tsx
import 'dotenv/config';

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { analyzePdf } from '../src/services/pdfAnalyzer.js';
import { buildPacRuleEvidence } from '../src/services/compliance/pacRuleEvidence.js';
import { pacRuleScoringCap } from '../src/services/scorer/finalizeEvidence.js';
import type { AnalysisResult, CategoryKey, DocumentSnapshot, ScoreCapApplied } from '../src/types.js';

const DEFAULT_OUT_ROOT = '/mnt/pdf-review/pdfaf-content-tagging-diagnostics';
const DEFAULT_OUT = join(DEFAULT_OUT_ROOT, `content-event-tagging-fidelity-${timestampSlug()}`);
const CONTENT_CAP_RULES = new Set([
  'pdfua.content.orphan_mcids_absent',
  'pdfua.content.path_paint_tagged_or_artifacted',
  'pdfua.content.text_tagged_or_artifacted',
  'pdfua.content.image_tagged_or_artifacted',
  'pdfua.content.artifact_tag_boundary_valid',
  'pdfua.content.no_artifact_in_tagged_content',
  'pdfua.content.no_tagged_content_in_artifact',
  'pdfua.content.marked_content_stack_valid',
]);
const DIRECT_EVENT_RULES = new Set([
  'pdfua.content.path_paint_tagged_or_artifacted',
  'pdfua.content.text_tagged_or_artifacted',
  'pdfua.content.image_tagged_or_artifacted',
  'pdfua.content.artifact_tag_boundary_valid',
  'pdfua.content.no_artifact_in_tagged_content',
  'pdfua.content.no_tagged_content_in_artifact',
  'pdfua.content.marked_content_stack_valid',
]);
const CONTROL_RE = /(?:fixture|teams|adam2|accessible|control)/i;

export type ContentEventClassification =
  | 'verified_content_debt_score_active'
  | 'verified_content_debt_missing_score_cap'
  | 'heuristic_content_debt_keep_diagnostic'
  | 'orphan_mcid_only_score_active'
  | 'manual_review_or_no_audit'
  | 'no_content_event_debt'
  | 'analysis_error';

export type ContentEventSuggestedAction =
  | 'already_score_active'
  | 'score_cap_validation_needed'
  | 'harden_native_audit_coverage'
  | 'keep_diagnostic'
  | 'no_action';

export interface ContentEventSourceRow {
  id: string;
  pdfPath: string;
  title: string;
  role: 'focus' | 'control';
}

export interface ContentEventFeatures {
  score: number;
  grade: string;
  pdfClass: string;
  pageCount: number;
  hasStructure: boolean;
  pageStreamsChecked: number;
  totalPageStreams: number;
  formXObjectsChecked: number;
  totalFormXObjects: number;
  formXObjectParseErrorCount: number;
  formXObjectSampleLimitHitCount: number;
  auditConfidence: 'verified' | 'heuristic' | 'manual_review_required';
  textOutside: number;
  imageOutside: number;
  pathOutside: number;
  artifactInsideTaggedContent: number;
  taggedContentInsideArtifact: number;
  malformedMarkedContentStack: number;
  contentOutsidePageBounds: number;
  orphanMcidCount: number;
  directEventDebt: number;
  boundaryDebt: number;
  contentScoreCapRules: string[];
  directEventScoreCapRules: string[];
  directEventFailRules: string[];
  directEventFailCategories: CategoryKey[];
  directEventCategoriesAtOrBelowStrictCap: CategoryKey[];
  directEventMissingScoreCapRules: string[];
}

export interface ContentEventDiagnosticRow extends ContentEventSourceRow {
  classification: ContentEventClassification;
  suggestedAction: ContentEventSuggestedAction;
  reasons: string[];
  features: ContentEventFeatures | null;
  error?: string;
}

export interface ContentEventDiagnosticReport {
  createdAt: string;
  outDir: string;
  selectedRowCount: number;
  classificationDistribution: Record<ContentEventClassification, number>;
  suggestedActionDistribution: Record<ContentEventSuggestedAction, number>;
  decision: {
    status:
      | 'content_scoring_already_aligned'
      | 'harden_content_audit_coverage_first'
      | 'plan_content_score_cap_validation'
      | 'keep_content_event_diagnostic_only'
      | 'diagnostic_errors_present';
    reasons: string[];
  };
  rows: ContentEventDiagnosticRow[];
}

interface Args {
  pdfs: string[];
  manifests: string[];
  ids: string[];
  outDir: string;
  limit?: number;
}

function timestampSlug(date = new Date()): string {
  return date.toISOString().replace(/[:.]/g, '-');
}

function usage(): string {
  return `Usage: pnpm exec tsx scripts/content-event-tagging-fidelity-diagnostic.ts [options]

Options:
  --pdf <path>       Add one PDF to analyze; repeatable
  --manifest <path>  Add an experiment-corpus or edge-mix manifest; repeatable
  --id <id>          Limit manifest rows by id/publicationId/basename; repeatable
  --out <dir>        Output directory (default: ${DEFAULT_OUT})
  --limit <n>        Limit rows after selection
  --help             Show this help

Diagnostic-only: runs native PDFAF analysis and writes JSON/Markdown. It does not call PAC/POC/ODL/Java, remediate PDFs, mutate PDFs, or change scoring behavior.`;
}

function parseArgs(argv = process.argv.slice(2)): Args {
  const pdfs: string[] = [];
  const manifests: string[] = [];
  const ids: string[] = [];
  let outDir = DEFAULT_OUT;
  let limit: number | undefined;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!;
    if (arg === '--help' || arg === '-h') {
      console.log(usage());
      process.exit(0);
    } else if (arg === '--pdf') {
      const value = argv[++index];
      if (!value) throw new Error(`Missing value for --pdf\n${usage()}`);
      pdfs.push(resolve(value));
    } else if (arg === '--manifest') {
      const value = argv[++index];
      if (!value) throw new Error(`Missing value for --manifest\n${usage()}`);
      manifests.push(resolve(value));
    } else if (arg === '--id') {
      const value = argv[++index];
      if (!value) throw new Error(`Missing value for --id\n${usage()}`);
      ids.push(value);
    } else if (arg === '--out') {
      const value = argv[++index];
      if (!value) throw new Error(`Missing value for --out\n${usage()}`);
      outDir = resolve(value);
    } else if (arg === '--limit') {
      const value = Number(argv[++index]);
      if (!Number.isFinite(value) || value < 1) throw new Error('--limit must be a positive integer');
      limit = Math.floor(value);
    } else {
      throw new Error(`Unknown argument ${arg}\n${usage()}`);
    }
  }
  return { pdfs, manifests, ids, outDir, limit };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function roleFor(id: string, pdfPath: string, intent?: string): 'focus' | 'control' {
  return CONTROL_RE.test(`${id} ${pdfPath} ${intent ?? ''}`) ? 'control' : 'focus';
}

function titleFromPath(pdfPath: string): string {
  return basename(pdfPath, extname(pdfPath)).replace(/[_-]+/g, ' ');
}

function matchesFilter(row: ContentEventSourceRow, ids: Set<string>): boolean {
  if (ids.size === 0) return true;
  const keys = [row.id, basename(row.pdfPath), basename(row.pdfPath, extname(row.pdfPath)), row.title]
    .map(value => value.toLowerCase());
  return [...ids].some(id => keys.some(key => key.includes(id.toLowerCase())));
}

async function rowsFromManifest(manifestPath: string): Promise<ContentEventSourceRow[]> {
  const raw = JSON.parse(await readFile(manifestPath, 'utf8')) as unknown;
  const root = dirname(manifestPath);
  const rows: ContentEventSourceRow[] = [];
  if (Array.isArray(raw)) {
    for (const item of raw) {
      const record = asRecord(item);
      const id = str(record['id']);
      const file = str(record['file']);
      if (!id || !file) continue;
      const pdfPath = resolve(root, file);
      rows.push({ id, pdfPath, title: titleFromPath(pdfPath), role: roleFor(id, pdfPath, str(record['intent'])) });
    }
    return rows;
  }
  const wrapped = asRecord(raw);
  const edgeRows = Array.isArray(wrapped['rows']) ? wrapped['rows'] : [];
  for (const item of edgeRows) {
    const record = asRecord(item);
    const id = str(record['id']) || str(record['publicationId']);
    const localFile = str(record['localFile']) || str(record['file']);
    if (!id || !localFile) continue;
    const pdfPath = resolve(root, localFile);
    const problemMix = Array.isArray(record['problemMix']) ? record['problemMix'].map(str).join(' ') : '';
    rows.push({ id, pdfPath, title: str(record['title']) || titleFromPath(pdfPath), role: roleFor(id, pdfPath, problemMix) });
  }
  return rows;
}

export async function collectContentEventRows(args: Args): Promise<ContentEventSourceRow[]> {
  const byPath = new Map<string, ContentEventSourceRow>();
  for (const pdf of args.pdfs) {
    const pdfPath = resolve(pdf);
    byPath.set(pdfPath, {
      id: basename(pdfPath, extname(pdfPath)),
      pdfPath,
      title: titleFromPath(pdfPath),
      role: roleFor(basename(pdfPath), pdfPath),
    });
  }
  for (const manifest of args.manifests) {
    for (const row of await rowsFromManifest(manifest)) byPath.set(row.pdfPath, row);
  }
  const ids = new Set(args.ids);
  const rows = [...byPath.values()].filter(row => matchesFilter(row, ids));
  return typeof args.limit === 'number' ? rows.slice(0, args.limit) : rows;
}

function capRules(analysis: AnalysisResult): string[] {
  const caps: ScoreCapApplied[] = [
    ...(analysis.scoreCapsApplied ?? []),
    ...analysis.categories.flatMap(category => category.scoreCapsApplied ?? []),
  ];
  const rules = new Set<string>();
  for (const cap of caps) {
    const match = cap.reason.match(/PAC rule failure: ([^\s]+)/);
    if (match?.[1] && CONTENT_CAP_RULES.has(match[1])) rules.add(match[1]);
  }
  return [...rules].sort();
}

export function extractContentEventFeatures(analysis: AnalysisResult, snapshot: DocumentSnapshot): ContentEventFeatures {
  const audit = snapshot.contentTaggingAudit;
  const pageStreamsChecked = audit?.pageStreamsChecked ?? 0;
  const totalPageStreams = audit?.totalPageStreams ?? snapshot.pageCount;
  const formXObjectsChecked = audit?.formXObjectsChecked ?? 0;
  const totalFormXObjects = audit?.totalFormXObjects ?? 0;
  const formXObjectParseErrorCount = audit?.formXObjectParseErrorCount ?? 0;
  const formXObjectSampleLimitHitCount = audit?.formXObjectSampleLimitHitCount ?? 0;
  const auditConfidence = audit
    ? pageStreamsChecked >= totalPageStreams && formXObjectsChecked === 0
      ? 'verified'
      : 'heuristic'
    : 'manual_review_required';
  const textOutside = audit?.textOutsideMarkedContentOrArtifact ?? 0;
  const imageOutside = audit?.imageOutsideMarkedContentOrArtifact ?? 0;
  const pathOutside = Math.max(
    audit?.pathOutsideMarkedContentOrArtifact ?? 0,
    snapshot.taggedContentAudit?.suspectedPathPaintOutsideMc ?? 0,
    snapshot.detectionProfile?.pdfUaSignals.suspectedPathPaintOutsideMc ?? 0,
  );
  const artifactInsideTaggedContent = audit?.artifactInsideTaggedContent ?? 0;
  const taggedContentInsideArtifact = audit?.taggedContentInsideArtifact ?? 0;
  const malformedMarkedContentStack = audit?.malformedMarkedContentStack ?? 0;
  const boundaryDebt = artifactInsideTaggedContent + taggedContentInsideArtifact + malformedMarkedContentStack;
  const orphanMcidCount =
    snapshot.taggedContentAudit?.orphanMcidCount ??
    snapshot.detectionProfile?.pdfUaSignals.orphanMcidCount ??
    snapshot.orphanMcids?.length ??
    0;
  const contentScoreCapRules = capRules(analysis);
  const categoryScores = new Map(analysis.categories.map(category => [category.key, category.score] as const));
  const directEventFailures = buildPacRuleEvidence(snapshot).filter(rule =>
    DIRECT_EVENT_RULES.has(rule.ruleId) &&
    rule.status === 'fail' &&
    rule.confidence === 'verified'
  );
  const directEventFailRules = [...new Set(directEventFailures.map(rule => rule.ruleId))].sort();
  const directEventFailCategories = [...new Set(directEventFailures.map(rule => rule.category))].sort();
  const directEventCategoriesAtOrBelowStrictCap = [...new Set(directEventFailures
    .filter(rule => {
      const cap = pacRuleScoringCap(rule.ruleId);
      const score = categoryScores.get(rule.category);
      return cap !== null && typeof score === 'number' && score <= cap;
    })
    .map(rule => rule.category))].sort();
  const directEventMissingScoreCapRules = directEventFailures
    .filter(rule => {
      if (contentScoreCapRules.includes(rule.ruleId)) return false;
      const cap = pacRuleScoringCap(rule.ruleId);
      const score = categoryScores.get(rule.category);
      return cap === null || typeof score !== 'number' || score > cap;
    })
    .map(rule => rule.ruleId)
    .sort();
  return {
    score: analysis.score,
    grade: analysis.grade,
    pdfClass: analysis.pdfClass,
    pageCount: snapshot.pageCount,
    hasStructure: snapshot.structureTree !== null,
    pageStreamsChecked,
    totalPageStreams,
    formXObjectsChecked,
    totalFormXObjects,
    formXObjectParseErrorCount,
    formXObjectSampleLimitHitCount,
    auditConfidence,
    textOutside,
    imageOutside,
    pathOutside,
    artifactInsideTaggedContent,
    taggedContentInsideArtifact,
    malformedMarkedContentStack,
    contentOutsidePageBounds: audit?.contentOutsidePageBounds ?? 0,
    orphanMcidCount,
    directEventDebt: textOutside + imageOutside + pathOutside + boundaryDebt,
    boundaryDebt,
    contentScoreCapRules,
    directEventScoreCapRules: contentScoreCapRules.filter(rule => DIRECT_EVENT_RULES.has(rule)),
    directEventFailRules,
    directEventFailCategories,
    directEventCategoriesAtOrBelowStrictCap,
    directEventMissingScoreCapRules,
  };
}

export function classifyContentEventFidelity(features: ContentEventFeatures): {
  classification: ContentEventClassification;
  suggestedAction: ContentEventSuggestedAction;
  reasons: string[];
} {
  const reasons: string[] = [
    `audit_confidence:${features.auditConfidence}`,
    `direct_event_debt:${features.directEventDebt}`,
    `orphan_mcid_count:${features.orphanMcidCount}`,
  ];
  if (!features.hasStructure) {
    return {
      classification: 'manual_review_or_no_audit',
      suggestedAction: 'keep_diagnostic',
      reasons: [...reasons, 'missing_structure_tree'],
    };
  }
  if (features.directEventDebt === 0 && features.orphanMcidCount === 0) {
    return {
      classification: features.auditConfidence === 'manual_review_required'
        ? 'manual_review_or_no_audit'
        : 'no_content_event_debt',
      suggestedAction: features.auditConfidence === 'manual_review_required' ? 'keep_diagnostic' : 'no_action',
      reasons,
    };
  }
  if (features.directEventDebt === 0 && features.orphanMcidCount > 0) {
    return {
      classification: 'orphan_mcid_only_score_active',
      suggestedAction: 'already_score_active',
      reasons: [...reasons, 'not_content_event_tagging_lane'],
    };
  }
  if (features.auditConfidence !== 'verified') {
    return {
      classification: 'heuristic_content_debt_keep_diagnostic',
      suggestedAction: 'harden_native_audit_coverage',
      reasons,
    };
  }
  if (
    features.directEventScoreCapRules.length > 0 ||
    features.directEventCategoriesAtOrBelowStrictCap.length > 0
  ) {
    return {
      classification: 'verified_content_debt_score_active',
      suggestedAction: 'already_score_active',
      reasons: [
        ...reasons,
        ...(features.directEventScoreCapRules.length
          ? [`score_caps:${features.directEventScoreCapRules.join(',')}`]
          : []),
        ...(features.directEventCategoriesAtOrBelowStrictCap.length
          ? [`category_already_at_or_below_strict_cap:${features.directEventCategoriesAtOrBelowStrictCap.join(',')}`]
          : []),
      ],
    };
  }
  return {
    classification: 'verified_content_debt_missing_score_cap',
    suggestedAction: 'score_cap_validation_needed',
    reasons: [
      ...reasons,
      `missing_score_cap_rules:${features.directEventMissingScoreCapRules.join(',') || 'unknown'}`,
    ],
  };
}

export async function analyzeContentEventRow(row: ContentEventSourceRow): Promise<ContentEventDiagnosticRow> {
  try {
    const analyzed = await analyzePdf(row.pdfPath, basename(row.pdfPath), { bypassCache: true });
    const features = extractContentEventFeatures(analyzed.result, analyzed.snapshot);
    const classified = classifyContentEventFidelity(features);
    return {
      ...row,
      classification: classified.classification,
      suggestedAction: classified.suggestedAction,
      reasons: classified.reasons,
      features,
    };
  } catch (error) {
    return {
      ...row,
      classification: 'analysis_error',
      suggestedAction: 'keep_diagnostic',
      reasons: ['analysis_error'],
      features: null,
      error: (error as Error).message,
    };
  }
}

function countBy<T extends string>(values: T[]): Record<T, number> {
  const out = {} as Record<T, number>;
  for (const value of values) out[value] = (out[value] ?? 0) + 1;
  return out;
}

export function buildContentEventDiagnosticReport(outDir: string, rows: ContentEventDiagnosticRow[]): ContentEventDiagnosticReport {
  const classificationDistribution = countBy(rows.map(row => row.classification));
  const suggestedActionDistribution = countBy(rows.map(row => row.suggestedAction));
  const missingCap = classificationDistribution.verified_content_debt_missing_score_cap ?? 0;
  const missingCapFocus = rows.filter(row => row.role === 'focus' && row.classification === 'verified_content_debt_missing_score_cap').length;
  const missingCapControls = rows.filter(row => row.role === 'control' && row.classification === 'verified_content_debt_missing_score_cap').length;
  const heuristicDebt = classificationDistribution.heuristic_content_debt_keep_diagnostic ?? 0;
  const heuristicDebtFocus = rows.filter(row => row.role === 'focus' && row.classification === 'heuristic_content_debt_keep_diagnostic').length;
  const heuristicDebtControls = rows.filter(row => row.role === 'control' && row.classification === 'heuristic_content_debt_keep_diagnostic').length;
  const verifiedScoreActive = classificationDistribution.verified_content_debt_score_active ?? 0;
  const verifiedScoreActiveControls = rows.filter(row => row.role === 'control' && row.classification === 'verified_content_debt_score_active').length;
  const errors = classificationDistribution.analysis_error ?? 0;
  const status = errors > 0
    ? 'diagnostic_errors_present'
    : missingCapFocus > 0 && missingCapControls === 0
      ? 'plan_content_score_cap_validation'
      : missingCap > 0
        ? 'keep_content_event_diagnostic_only'
      : heuristicDebt > 0
        ? 'harden_content_audit_coverage_first'
        : 'content_scoring_already_aligned';
  return {
    createdAt: new Date().toISOString(),
    outDir,
    selectedRowCount: rows.length,
    classificationDistribution,
    suggestedActionDistribution,
    decision: {
      status,
      reasons: [
        `verified_score_active=${verifiedScoreActive}`,
        `missing_score_cap=${missingCap}`,
        `missing_score_cap_focus=${missingCapFocus}`,
        `missing_score_cap_controls=${missingCapControls}`,
        `heuristic_debt=${heuristicDebt}`,
        `heuristic_debt_focus=${heuristicDebtFocus}`,
        `heuristic_debt_controls=${heuristicDebtControls}`,
        `verified_score_active_controls=${verifiedScoreActiveControls}`,
        `analysis_errors=${errors}`,
      ],
    },
    rows,
  };
}

function renderMarkdown(report: ContentEventDiagnosticReport): string {
  const lines = [
    '# Content-Event Tagging Fidelity Diagnostic',
    '',
    `- Generated: ${report.createdAt}`,
    `- Rows: ${report.selectedRowCount}`,
    `- Decision: \`${report.decision.status}\``,
    `- Decision reasons: ${report.decision.reasons.join('; ')}`,
    '',
    'Diagnostic-only native PDFAF analysis. No PAC/POC/ODL/Java call, remediation, PDF mutation, score change, or planner change.',
    '',
    '## Rows',
    '',
    '| Row | Role | Score | Confidence | Direct Debt | Orphans | Class | Action | Score Caps |',
    '| --- | --- | ---: | --- | ---: | ---: | --- | --- | --- |',
  ];
  for (const row of report.rows) {
    const f = row.features;
    lines.push([
      `\`${row.id}\``,
      row.role,
      f ? `${f.score}/${f.grade}` : 'ERR',
      f?.auditConfidence ?? 'ERR',
      f?.directEventDebt ?? 'ERR',
      f?.orphanMcidCount ?? 'ERR',
      `\`${row.classification}\``,
      `\`${row.suggestedAction}\``,
      f?.contentScoreCapRules.length ? f.contentScoreCapRules.map(rule => `\`${rule}\``).join(', ') : 'none',
    ].map(value => String(value).replace(/\|/g, '/')).join(' | ').replace(/^/, '| ').replace(/$/, ' |'));
  }
  lines.push('', '## Interpretation', '');
  if (report.decision.status === 'content_scoring_already_aligned') {
    lines.push('Verified direct content-event debt is already score-active where present, and no extra score/gate promotion is justified from this sample.');
  } else if (report.decision.status === 'harden_content_audit_coverage_first') {
    lines.push('Some content-event debt is still heuristic. Harden native content-stream audit coverage before promoting any new scoring or gate behavior.');
  } else if (report.decision.status === 'plan_content_score_cap_validation') {
    lines.push('At least one verified content-event failure lacks a matching strict score cap. Plan a separate scoring validation before promotion.');
  } else if (report.decision.status === 'keep_content_event_diagnostic_only') {
    lines.push('A verified missing-cap pattern is not cleanly separated from controls, so content-event scoring should remain diagnostic-only until a safer native predicate exists.');
  } else {
    lines.push('Diagnostic errors must be resolved before making a content-event decision.');
  }
  return `${lines.join('\n')}\n`;
}

export async function writeContentEventDiagnostic(outDir: string, rows: ContentEventDiagnosticRow[]): Promise<ContentEventDiagnosticReport> {
  const report = buildContentEventDiagnosticReport(outDir, rows);
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, 'content-event-tagging-fidelity.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await writeFile(join(outDir, 'content-event-tagging-fidelity.md'), renderMarkdown(report), 'utf8');
  return report;
}

async function main(): Promise<void> {
  const args = parseArgs();
  if (args.pdfs.length === 0 && args.manifests.length === 0) {
    throw new Error(`At least one --pdf or --manifest is required.\n${usage()}`);
  }
  const rows = await collectContentEventRows(args);
  if (rows.length === 0) throw new Error('No rows matched the requested inputs.');
  const analyzed: ContentEventDiagnosticRow[] = [];
  for (const row of rows) {
    const result = await analyzeContentEventRow(row);
    analyzed.push(result);
    const score = result.features ? `${result.features.score}/${result.features.grade}` : 'ERR';
    console.log(`[content-event] ${result.id} ${score} ${result.classification}`);
  }
  const report = await writeContentEventDiagnostic(args.outDir, analyzed);
  console.log(`[content-event] wrote ${join(args.outDir, 'content-event-tagging-fidelity.md')}`);
  console.log(`[content-event] decision ${report.decision.status}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(err => {
    console.error((err as Error).message);
    process.exit(1);
  });
}
