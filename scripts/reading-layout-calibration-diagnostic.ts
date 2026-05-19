#!/usr/bin/env tsx
import 'dotenv/config';

import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';
import { analyzePdf } from '../src/services/pdfAnalyzer.js';
import { buildEligibleHeadingBootstrapCandidates } from '../src/services/headingBootstrapCandidates.js';
import {
  selectTaggedVisibleHeadingAnchorCandidate,
  selectVisibleHeadingAnchorCandidate,
} from '../src/services/remediation/visibleHeadingAnchor.js';
import type { AnalysisResult, DocumentSnapshot, NativeLayoutAudit } from '../src/types.js';

const DEFAULT_OUT_ROOT = '/mnt/pdf-review/pdfaf-odl-diagnostics';
const MAX_CANDIDATE_SAMPLES = 12;
const CONTROL_PATH_RE = /(?:^|\/)Input\/experiment-corpus\//;
const CONTROL_ID_RE = /(?:fixture|teams|adam2|accessible)/i;
const CAPTION_RE = /^(figure|fig\.|chart|graph|table)\s*[\dA-ZIVX]+[\s:.\-]/i;

export type ReadingLayoutClassification =
  | 'behavior_ready_existing_target'
  | 'scoring_only_order_risk'
  | 'heading_candidate_too_broad'
  | 'header_footer_or_table_noise'
  | 'control_not_safe'
  | 'no_native_support';

type CandidateDecision =
  | 'matched_existing_target'
  | 'visible_text_anchor_only'
  | 'unmatched_layout_heading'
  | 'excluded';

type CandidateSource =
  | 'layout_heading_candidate'
  | 'caption_candidate'
  | 'header_footer_band'
  | 'table_row_band';

export interface ReadingLayoutArgs {
  sidecar?: string;
  outDir: string;
  limit?: number;
  includeControls: boolean;
}

export interface SidecarCalibrationRow {
  id: string;
  pdfPath: string;
  title?: string;
  comparison?: {
    supportedLane?: string;
    reason?: string;
    headingDelta?: number | null;
    tableDelta?: number | null;
    textOrderSimilarity?: number | null;
  };
  scoringCalibration?: {
    suggestedScoringAction?: string;
    reason?: string;
  };
}

export interface SidecarReport {
  createdAt?: string;
  args?: Record<string, unknown>;
  rows: SidecarCalibrationRow[];
}

export interface LayoutCandidateEvaluation {
  source: CandidateSource;
  text: string;
  page: number | null;
  bbox?: [number, number, number, number];
  decision: CandidateDecision;
  matchedTargetType?: 'paragraph_struct_elem' | 'mcid_text_span' | 'native_title_bt' | 'visible_heading_anchor';
  matchedTargetId?: string;
  exclusionReason?: 'caption_like_line' | 'header_footer_band' | 'table_row_band' | 'table_like_text';
  reasons: string[];
}

export interface ReadingLayoutDiagnosticRow {
  id: string;
  pdfPath: string;
  title: string;
  role: 'focus' | 'control';
  analysisStatus: 'ok' | 'failed';
  analysisRuntimeMs: number;
  classification: ReadingLayoutClassification;
  promotionSupported: boolean;
  reasons: string[];
  sourceSidecar: {
    supportedLane: string | null;
    suggestedScoringAction: string | null;
    reason: string | null;
  };
  scores: {
    overall: number | null;
    grade: string | null;
    readingOrder: number | null;
    headingStructure: number | null;
  };
  structure: {
    pdfClass: string | null;
    structureTreeDepth: number | null;
    treeHeadingCount: number | null;
    exportedHeadingCount: number | null;
    paragraphStructElemCount: number;
    mcidTextSpanCount: number;
    nativeTitleBtCandidateCount: number;
  };
  layout: {
    sampledPageCount: number;
    geometryOrderRiskPages: number;
    multiColumnPageCount: number;
    repeatedHeaderFooterPageCount: number;
    layoutHeadingCandidateCount: number;
    captionCandidateCount: number;
    layoutTableCandidateCount: number;
  };
  candidates: LayoutCandidateEvaluation[];
  error?: string;
}

export interface ReadingLayoutCalibrationReport {
  createdAt: string;
  sidecarPath: string;
  outDir: string;
  selectedRowCount: number;
  classificationDistribution: Record<ReadingLayoutClassification, number>;
  decision: {
    status:
      | 'promote_reading_heading_candidate'
      | 'plan_scoring_calibration'
      | 'reject_reading_heading_lane_controls_trigger'
      | 'diagnostic_only_insufficient_evidence';
    reasons: string[];
  };
  rows: ReadingLayoutDiagnosticRow[];
}

type Analyzer = typeof analyzePdf;

function timestampSlug(date = new Date()): string {
  return date.toISOString().replace(/[:.]/g, '-');
}

function defaultOutDir(): string {
  return join(DEFAULT_OUT_ROOT, `reading-layout-calibration-${timestampSlug()}`);
}

function usage(): string {
  return `Usage: pnpm exec tsx scripts/reading-layout-calibration-diagnostic.ts [options]

Options:
  --sidecar <path>      ODL sidecar comparison-report.json (default: latest under ${DEFAULT_OUT_ROOT})
  --out <dir>           Output directory (default: ${DEFAULT_OUT_ROOT}/reading-layout-calibration-<timestamp>)
  --limit <n>           Limit selected rows after focus/control selection
  --include-controls    Include original-corpus controls (default)
  --no-controls         Exclude original-corpus controls
  --help                Show this help

This script is diagnostic-only. It re-runs native PDFAF analysis and never calls OpenDataLoader.`;
}

export function parseArgs(argv = process.argv.slice(2)): ReadingLayoutArgs {
  let sidecar: string | undefined;
  let outDir = defaultOutDir();
  let limit: number | undefined;
  let includeControls = true;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!;
    if (arg === '--help' || arg === '-h') {
      console.log(usage());
      process.exit(0);
    } else if (arg === '--sidecar') {
      const value = argv[++index];
      if (!value) throw new Error(`Missing value for --sidecar\n${usage()}`);
      sidecar = resolve(value);
    } else if (arg === '--out') {
      const value = argv[++index];
      if (!value) throw new Error(`Missing value for --out\n${usage()}`);
      outDir = resolve(value);
    } else if (arg === '--limit') {
      const value = Number(argv[++index]);
      if (!Number.isFinite(value) || value < 1) throw new Error('--limit must be a positive number');
      limit = Math.floor(value);
    } else if (arg === '--include-controls') {
      includeControls = true;
    } else if (arg === '--no-controls') {
      includeControls = false;
    } else {
      throw new Error(`Unknown argument ${arg}\n${usage()}`);
    }
  }

  return { sidecar, outDir, limit, includeControls };
}

async function collectComparisonReports(root: string, depth = 3): Promise<string[]> {
  let entries: Awaited<ReturnType<typeof readdir>>;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return [];
  }
  const reports: string[] = [];
  for (const entry of entries) {
    const fullPath = join(root, entry.name);
    if (entry.isFile() && entry.name === 'comparison-report.json') {
      reports.push(fullPath);
    } else if (entry.isDirectory() && depth > 0) {
      reports.push(...await collectComparisonReports(fullPath, depth - 1));
    }
  }
  return reports;
}

export async function findLatestSidecarReport(root = DEFAULT_OUT_ROOT): Promise<string> {
  const reports = await collectComparisonReports(root);
  if (reports.length === 0) {
    throw new Error(`No comparison-report.json files found under ${root}. Provide --sidecar.`);
  }
  const withMtime = await Promise.all(reports.map(async reportPath => ({
    reportPath,
    mtimeMs: (await stat(reportPath)).mtimeMs,
  })));
  return withMtime.sort((a, b) => b.mtimeMs - a.mtimeMs)[0]!.reportPath;
}

export async function loadSidecarReport(sidecarPath: string): Promise<SidecarReport> {
  let raw: string;
  try {
    raw = await readFile(sidecarPath, 'utf8');
  } catch (err) {
    throw new Error(`Sidecar report not found or unreadable: ${sidecarPath}; ${(err as Error).message}`);
  }
  const parsed = JSON.parse(raw) as Partial<SidecarReport>;
  if (!Array.isArray(parsed.rows)) {
    throw new Error(`Sidecar report has no rows array: ${sidecarPath}`);
  }
  return { ...parsed, rows: parsed.rows as SidecarCalibrationRow[] };
}

export function isOriginalControlRow(row: SidecarCalibrationRow): boolean {
  return CONTROL_PATH_RE.test(row.pdfPath) || CONTROL_ID_RE.test(row.id) || CONTROL_ID_RE.test(row.title ?? '');
}

export function selectCalibrationSidecarRows(
  rows: SidecarCalibrationRow[],
  includeControls = true,
  limit?: number,
): Array<SidecarCalibrationRow & { role: 'focus' | 'control' }> {
  const selected: Array<SidecarCalibrationRow & { role: 'focus' | 'control' }> = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const isFocus = row.scoringCalibration?.suggestedScoringAction === 'reading_order_calibration_candidate';
    const isControl = isOriginalControlRow(row);
    if (!isFocus && !(includeControls && isControl)) continue;
    const key = row.pdfPath || row.id;
    if (seen.has(key)) continue;
    seen.add(key);
    selected.push({ ...row, role: isControl ? 'control' : 'focus' });
    if (typeof limit === 'number' && selected.length >= limit) break;
  }
  return selected;
}

function categoryScore(analysis: AnalysisResult, key: string): number | null {
  const category = analysis.categories.find(row => row.key === key);
  return typeof category?.score === 'number' && category.applicable !== false ? category.score : null;
}

function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

function fingerprint(value: string | undefined | null): string {
  return normalizeText(value ?? '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenCount(value: string): number {
  const key = fingerprint(value);
  return key ? key.split(' ').length : 0;
}

function strongTextMatch(a: string, b: string): boolean {
  const left = fingerprint(a);
  const right = fingerprint(b);
  if (!left || !right) return false;
  if (left === right) return true;
  const shorter = left.length <= right.length ? left : right;
  const longer = left.length > right.length ? left : right;
  return shorter.length >= 8 && tokenCount(shorter) >= 2 && longer.includes(shorter);
}

function rectsOverlap(a: [number, number, number, number], b: [number, number, number, number]): boolean {
  return a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];
}

function nearPoint(bbox: [number, number, number, number], x: number | null, y: number | null): boolean {
  if (typeof x !== 'number' || typeof y !== 'number') return false;
  const pad = 40;
  return x >= bbox[0] - pad && x <= bbox[2] + pad && y >= bbox[1] - pad && y <= bbox[3] + pad;
}

function candidateExclusionReason(
  candidate: { text: string; page: number | null; bbox?: [number, number, number, number] },
  layout: NativeLayoutAudit | undefined,
): LayoutCandidateEvaluation['exclusionReason'] | null {
  if (CAPTION_RE.test(candidate.text)) return 'caption_like_line';
  if (/\t|\s{4,}|\|/.test(candidate.text)) return 'table_like_text';
  if (typeof candidate.page === 'number') {
    const headerFooter = layout?.headerFooterBandTexts.some(
      band => band.page === candidate.page && strongTextMatch(band.text, candidate.text),
    );
    if (headerFooter) return 'header_footer_band';
  }
  if (candidate.bbox && typeof candidate.page === 'number') {
    if (layout?.captionCandidates.some(cap => cap.page === candidate.page && rectsOverlap(cap.bbox, candidate.bbox))) {
      return 'caption_like_line';
    }
    if (layout?.tableCandidates.some(table => table.page === candidate.page && rectsOverlap(table.bbox, candidate.bbox))) {
      return 'table_row_band';
    }
  }
  return null;
}

function matchExistingTarget(
  candidate: { text: string; page: number | null; bbox?: [number, number, number, number] },
  analysis: AnalysisResult,
  snapshot: DocumentSnapshot,
): Pick<LayoutCandidateEvaluation, 'decision' | 'matchedTargetType' | 'matchedTargetId' | 'reasons'> {
  const reasons: string[] = [];
  const paragraph = buildEligibleHeadingBootstrapCandidates(snapshot).find(row =>
    row.page === candidate.page && strongTextMatch(row.text, candidate.text),
  );
  if (paragraph) {
    return {
      decision: 'matched_existing_target',
      matchedTargetType: 'paragraph_struct_elem',
      matchedTargetId: paragraph.structRef,
      reasons: ['matched_eligible_heading_bootstrap_candidate', `paragraph_score:${paragraph.score}`],
    };
  }

  const mcid = (snapshot.mcidTextSpans ?? []).find(row => {
    if (row.page !== candidate.page) return false;
    const text = row.resolvedText ?? row.snippet;
    return tokenCount(text) >= 2 && strongTextMatch(text, candidate.text);
  });
  if (mcid) {
    return {
      decision: 'matched_existing_target',
      matchedTargetType: 'mcid_text_span',
      matchedTargetId: `page:${mcid.page}:mcid:${mcid.mcid}`,
      reasons: ['matched_mcid_text_span'],
    };
  }

  const nativeTitle = (snapshot.nativeTitleBtCandidates ?? []).find(row =>
    candidate.page === 0 && candidate.bbox && nearPoint(candidate.bbox, row.x, row.y),
  );
  if (nativeTitle) {
    return {
      decision: 'matched_existing_target',
      matchedTargetType: 'native_title_bt',
      matchedTargetId: `page:${nativeTitle.page}:group:${nativeTitle.groupIndexes.join(',')}`,
      reasons: ['matched_native_title_bt_geometry', `native_title_score:${nativeTitle.score}`],
    };
  }

  try {
    const visible =
      selectTaggedVisibleHeadingAnchorCandidate(analysis, snapshot) ??
      selectVisibleHeadingAnchorCandidate(analysis, snapshot);
    if (visible && visible.page === candidate.page && strongTextMatch(visible.text, candidate.text)) {
      return {
        decision: 'matched_existing_target',
        matchedTargetType: 'visible_heading_anchor',
        matchedTargetId: visible.targetRef ?? (typeof visible.mcid === 'number' ? `mcid:${visible.mcid}` : visible.source),
        reasons: ['matched_existing_visible_heading_anchor', `visible_anchor_source:${visible.source}`, `visible_anchor_score:${visible.score}`],
      };
    }
  } catch (err) {
    reasons.push(`visible_anchor_check_failed:${(err as Error).message}`);
  }

  const pageText = typeof candidate.page === 'number' ? snapshot.textByPage[candidate.page] ?? '' : '';
  if (strongTextMatch(candidate.text, pageText)) {
    return {
      decision: 'visible_text_anchor_only',
      reasons: [...reasons, 'visible_text_present_but_no_existing_target'],
    };
  }

  return { decision: 'unmatched_layout_heading', reasons: [...reasons, 'no_existing_mutatable_target_match'] };
}

function evaluateCandidates(
  analysis: AnalysisResult,
  snapshot: DocumentSnapshot,
): LayoutCandidateEvaluation[] {
  const layout = snapshot.layoutAudit;
  const candidates: LayoutCandidateEvaluation[] = [];

  for (const candidate of (layout?.layoutHeadingCandidates ?? []).slice(0, MAX_CANDIDATE_SAMPLES)) {
    const exclusionReason = candidateExclusionReason(candidate, layout);
    if (exclusionReason) {
      candidates.push({
        source: 'layout_heading_candidate',
        text: candidate.text,
        page: candidate.page,
        bbox: candidate.bbox,
        decision: 'excluded',
        exclusionReason,
        reasons: [exclusionReason],
      });
      continue;
    }
    const match = matchExistingTarget(candidate, analysis, snapshot);
    candidates.push({
      source: 'layout_heading_candidate',
      text: candidate.text,
      page: candidate.page,
      bbox: candidate.bbox,
      ...match,
    });
  }

  for (const candidate of (layout?.captionCandidates ?? []).slice(0, 4)) {
    candidates.push({
      source: 'caption_candidate',
      text: candidate.text,
      page: candidate.page,
      bbox: candidate.bbox,
      decision: 'excluded',
      exclusionReason: 'caption_like_line',
      reasons: ['caption_candidate_is_safety_evidence_not_heading'],
    });
  }
  for (const band of (layout?.headerFooterBandTexts ?? []).slice(0, 4)) {
    candidates.push({
      source: 'header_footer_band',
      text: band.text,
      page: band.page,
      decision: 'excluded',
      exclusionReason: 'header_footer_band',
      reasons: [`repeated_${band.kind}_band`],
    });
  }
  for (const table of (layout?.tableCandidates ?? []).slice(0, 4)) {
    candidates.push({
      source: 'table_row_band',
      text: `table-like row band (${table.rowCount}x${table.columnCount})`,
      page: table.page,
      bbox: table.bbox,
      decision: 'excluded',
      exclusionReason: 'table_row_band',
      reasons: ['table_row_band_is_safety_evidence_not_heading'],
    });
  }

  return candidates.slice(0, MAX_CANDIDATE_SAMPLES + 8);
}

export function classifyReadingLayoutRow(input: {
  id: string;
  pdfPath: string;
  title?: string;
  role: 'focus' | 'control';
  sidecar?: SidecarCalibrationRow;
  analysis: AnalysisResult;
  snapshot: DocumentSnapshot;
  analysisRuntimeMs?: number;
}): ReadingLayoutDiagnosticRow {
  const { analysis, snapshot } = input;
  const layout = snapshot.layoutAudit;
  const readingOrder = categoryScore(analysis, 'reading_order');
  const headingStructure = categoryScore(analysis, 'heading_structure');
  const categoryDebt = (readingOrder ?? 100) < 93 || (headingStructure ?? 100) < 93;
  const structureDepth = snapshot.detectionProfile?.readingOrderSignals?.structureTreeDepth ?? (snapshot.structureTree ? 2 : 0);
  const treeHeadingCount = snapshot.detectionProfile?.headingSignals?.treeHeadingCount ?? snapshot.headings.length;
  const geometryRisk = layout?.geometryOrderRiskPages ?? 0;
  const multiColumn = layout?.multiColumnPageCount ?? 0;
  const layoutHeadingCount = layout?.layoutHeadingCandidateCount ?? 0;
  const candidates = evaluateCandidates(analysis, snapshot);
  const behaviorMatches = candidates.filter(candidate => candidate.decision === 'matched_existing_target');
  const excludedNoiseCount = candidates.filter(candidate => candidate.decision === 'excluded').length;
  const reasons: string[] = [];

  if (!layout || (geometryRisk === 0 && multiColumn === 0 && layoutHeadingCount === 0 && excludedNoiseCount === 0)) {
    reasons.push('no_native_layout_order_or_heading_signal');
  }
  if (!categoryDebt) reasons.push('reading_and_heading_scores_have_no_current_debt');
  if (behaviorMatches.length > 0) reasons.push(`matched_existing_targets:${behaviorMatches.length}`);
  if (geometryRisk > 0) reasons.push(`geometry_order_risk_pages:${geometryRisk}`);
  if (multiColumn > 0) reasons.push(`multi_column_pages:${multiColumn}`);
  if (layoutHeadingCount > 0) reasons.push(`layout_heading_candidates:${layoutHeadingCount}`);
  if (excludedNoiseCount > 0) reasons.push(`excluded_noise_samples:${excludedNoiseCount}`);

  let classification: ReadingLayoutClassification;
  if (input.role === 'control' && categoryDebt && (behaviorMatches.length > 0 || geometryRisk > 0 || layoutHeadingCount > 0)) {
    classification = 'control_not_safe';
    reasons.push('original_control_would_trigger_candidate_predicate');
  } else if (!layout || (geometryRisk === 0 && multiColumn === 0 && layoutHeadingCount === 0 && excludedNoiseCount === 0)) {
    classification = 'no_native_support';
  } else if (!categoryDebt) {
    classification = 'no_native_support';
  } else if (behaviorMatches.length > 0) {
    classification = 'behavior_ready_existing_target';
  } else if (geometryRisk > 0 || multiColumn > 0) {
    classification = 'scoring_only_order_risk';
  } else if (layoutHeadingCount > 0) {
    classification = 'heading_candidate_too_broad';
  } else if (excludedNoiseCount > 0) {
    classification = 'header_footer_or_table_noise';
  } else {
    classification = 'no_native_support';
  }

  return {
    id: input.id,
    pdfPath: input.pdfPath,
    title: input.title ?? basename(input.pdfPath),
    role: input.role,
    analysisStatus: 'ok',
    analysisRuntimeMs: input.analysisRuntimeMs ?? 0,
    classification,
    promotionSupported: classification === 'behavior_ready_existing_target',
    reasons,
    sourceSidecar: {
      supportedLane: input.sidecar?.comparison?.supportedLane ?? null,
      suggestedScoringAction: input.sidecar?.scoringCalibration?.suggestedScoringAction ?? null,
      reason: input.sidecar?.scoringCalibration?.reason ?? input.sidecar?.comparison?.reason ?? null,
    },
    scores: {
      overall: analysis.score,
      grade: analysis.grade,
      readingOrder,
      headingStructure,
    },
    structure: {
      pdfClass: analysis.pdfClass ?? null,
      structureTreeDepth: structureDepth,
      treeHeadingCount,
      exportedHeadingCount: snapshot.headings.length,
      paragraphStructElemCount: snapshot.paragraphStructElems?.length ?? 0,
      mcidTextSpanCount: snapshot.mcidTextSpans?.length ?? 0,
      nativeTitleBtCandidateCount: snapshot.nativeTitleBtCandidates?.length ?? 0,
    },
    layout: {
      sampledPageCount: layout?.sampledPageCount ?? 0,
      geometryOrderRiskPages: geometryRisk,
      multiColumnPageCount: multiColumn,
      repeatedHeaderFooterPageCount: layout?.repeatedHeaderFooterPageCount ?? 0,
      layoutHeadingCandidateCount: layoutHeadingCount,
      captionCandidateCount: layout?.captionCandidateCount ?? 0,
      layoutTableCandidateCount: layout?.layoutTableCandidateCount ?? 0,
    },
    candidates,
  };
}

function failedRow(
  row: SidecarCalibrationRow & { role: 'focus' | 'control' },
  runtimeMs: number,
  err: Error,
): ReadingLayoutDiagnosticRow {
  return {
    id: row.id,
    pdfPath: row.pdfPath,
    title: row.title ?? basename(row.pdfPath),
    role: row.role,
    analysisStatus: 'failed',
    analysisRuntimeMs: runtimeMs,
    classification: 'no_native_support',
    promotionSupported: false,
    reasons: ['native_analysis_failed'],
    sourceSidecar: {
      supportedLane: row.comparison?.supportedLane ?? null,
      suggestedScoringAction: row.scoringCalibration?.suggestedScoringAction ?? null,
      reason: row.scoringCalibration?.reason ?? row.comparison?.reason ?? null,
    },
    scores: { overall: null, grade: null, readingOrder: null, headingStructure: null },
    structure: {
      pdfClass: null,
      structureTreeDepth: null,
      treeHeadingCount: null,
      exportedHeadingCount: null,
      paragraphStructElemCount: 0,
      mcidTextSpanCount: 0,
      nativeTitleBtCandidateCount: 0,
    },
    layout: {
      sampledPageCount: 0,
      geometryOrderRiskPages: 0,
      multiColumnPageCount: 0,
      repeatedHeaderFooterPageCount: 0,
      layoutHeadingCandidateCount: 0,
      captionCandidateCount: 0,
      layoutTableCandidateCount: 0,
    },
    candidates: [],
    error: err.message,
  };
}

export function buildReadingLayoutCalibrationReport(
  rows: ReadingLayoutDiagnosticRow[],
  sidecarPath: string,
  outDir: string,
): ReadingLayoutCalibrationReport {
  const classificationDistribution = rows.reduce<Record<ReadingLayoutClassification, number>>((acc, row) => {
    acc[row.classification] = (acc[row.classification] ?? 0) + 1;
    return acc;
  }, {} as Record<ReadingLayoutClassification, number>);
  const behaviorReady = classificationDistribution.behavior_ready_existing_target ?? 0;
  const controlsUnsafe = classificationDistribution.control_not_safe ?? 0;
  const scoringOnly = classificationDistribution.scoring_only_order_risk ?? 0;
  const reasons: string[] = [
    `behavior_ready_existing_target=${behaviorReady}`,
    `control_not_safe=${controlsUnsafe}`,
    `scoring_only_order_risk=${scoringOnly}`,
  ];
  let status: ReadingLayoutCalibrationReport['decision']['status'];
  if (controlsUnsafe > 0) {
    status = 'reject_reading_heading_lane_controls_trigger';
    reasons.push('at_least_one_original_control_triggers_candidate_predicate');
  } else if (behaviorReady >= 3) {
    status = 'promote_reading_heading_candidate';
    reasons.push('at_least_three_focus_rows_have_existing_target_matches_and_controls_are_clean');
  } else if (scoringOnly >= 3) {
    status = 'plan_scoring_calibration';
    reasons.push('geometry_risk_repeats_without_safe_repair_targets');
  } else {
    status = 'diagnostic_only_insufficient_evidence';
    reasons.push('not_enough_control-clean_behavior_or_scoring_evidence');
  }

  return {
    createdAt: new Date().toISOString(),
    sidecarPath,
    outDir,
    selectedRowCount: rows.length,
    classificationDistribution,
    decision: { status, reasons },
    rows,
  };
}

function mdEscape(value: string | number | null | undefined): string {
  return String(value ?? 'n/a').replace(/\|/g, '/').replace(/\n/g, ' ');
}

function fmt(value: number | null | undefined, digits = 0): string {
  return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(digits) : 'n/a';
}

export function markdownReport(report: ReadingLayoutCalibrationReport): string {
  const lines = [
    '# Reading Layout Calibration Diagnostic',
    '',
    `- Created: ${report.createdAt}`,
    `- Sidecar: \`${report.sidecarPath}\``,
    `- Rows analyzed: ${report.selectedRowCount}`,
    `- Classification distribution: ${JSON.stringify(report.classificationDistribution)}`,
    `- Decision: \`${report.decision.status}\``,
    `- Decision reasons: ${report.decision.reasons.join('; ')}`,
    '',
    'This report is diagnostic-only. It re-runs native PDFAF analysis and does not call OpenDataLoader, change scores, route remediation, or mutate PDFs.',
    '',
    '| Row | Role | Score | R/H | Class | Layout Signals | Existing Target Matches | Top Candidate Evidence | Reasons |',
    '| --- | --- | ---: | ---: | --- | --- | ---: | --- | --- |',
  ];
  for (const row of report.rows) {
    const matches = row.candidates.filter(candidate => candidate.decision === 'matched_existing_target');
    const topCandidates = row.candidates.slice(0, 4).map(candidate => {
      const suffix = candidate.decision === 'matched_existing_target'
        ? ` -> ${candidate.matchedTargetType}:${candidate.matchedTargetId}`
        : candidate.exclusionReason
          ? ` (${candidate.exclusionReason})`
          : ` (${candidate.decision})`;
      return `${candidate.source} p${candidate.page ?? 'n/a'} "${candidate.text.slice(0, 80)}"${suffix}`;
    }).join('; ');
    const layout = [
      `geom=${row.layout.geometryOrderRiskPages}`,
      `multi=${row.layout.multiColumnPageCount}`,
      `heads=${row.layout.layoutHeadingCandidateCount}`,
      `hf=${row.layout.repeatedHeaderFooterPageCount}`,
      `captions=${row.layout.captionCandidateCount}`,
      `tables=${row.layout.layoutTableCandidateCount}`,
    ].join(', ');
    lines.push([
      row.id,
      row.role,
      `${fmt(row.scores.overall, 0)}/${row.scores.grade ?? 'n/a'}`,
      `${fmt(row.scores.readingOrder, 0)}/${fmt(row.scores.headingStructure, 0)}`,
      row.classification,
      layout,
      matches.length,
      topCandidates || 'n/a',
      row.reasons.join('; '),
    ].map(mdEscape).join(' | ').replace(/^/, '| ').replace(/$/, ' |'));
  }
  lines.push('');
  return `${lines.join('\n')}\n`;
}

export async function runReadingLayoutCalibration(
  args: ReadingLayoutArgs,
  analyzer: Analyzer = analyzePdf,
): Promise<ReadingLayoutCalibrationReport> {
  const sidecarPath = args.sidecar ?? await findLatestSidecarReport();
  const sidecar = await loadSidecarReport(sidecarPath);
  const selected = selectCalibrationSidecarRows(sidecar.rows, args.includeControls, args.limit);
  if (selected.length === 0) {
    throw new Error('No rows selected from sidecar report. Expected reading_order_calibration_candidate rows or original controls.');
  }

  await mkdir(args.outDir, { recursive: true });
  const rows: ReadingLayoutDiagnosticRow[] = [];
  for (const row of selected) {
    console.log(`[reading-layout] ${row.id}: ${row.pdfPath}`);
    const started = performance.now();
    try {
      const { result, snapshot } = await analyzer(row.pdfPath, basename(row.pdfPath), { bypassCache: true });
      rows.push(classifyReadingLayoutRow({
        id: row.id,
        pdfPath: row.pdfPath,
        title: row.title,
        role: row.role,
        sidecar: row,
        analysis: result,
        snapshot,
        analysisRuntimeMs: performance.now() - started,
      }));
    } catch (err) {
      rows.push(failedRow(row, performance.now() - started, err as Error));
    }
  }

  const report = buildReadingLayoutCalibrationReport(rows, sidecarPath, args.outDir);
  await writeFile(join(args.outDir, 'reading-layout-calibration.json'), `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(join(args.outDir, 'reading-layout-calibration.md'), markdownReport(report));
  return report;
}

async function main(): Promise<void> {
  const args = parseArgs();
  const report = await runReadingLayoutCalibration(args);
  console.log(`[reading-layout] wrote ${join(args.outDir, 'reading-layout-calibration.md')}`);
  console.log(`[reading-layout] decision ${report.decision.status}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(err => {
    console.error((err as Error).message);
    process.exit(1);
  });
}
