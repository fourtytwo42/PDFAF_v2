#!/usr/bin/env tsx
import 'dotenv/config';

import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { analyzePdf } from '../src/services/pdfAnalyzer.js';
import type { AnalysisResult, DocumentSnapshot } from '../src/types.js';
import { loadEdgeMixManifest, type EdgeMixManifestRow } from './stage49-edge-mix-baseline.js';

const DEFAULT_MANIFEST = 'Input/stage145-active-low-grade-tail/manifest.json';
const DEFAULT_REFERENCE_RUN = 'Output/stage145-low-grade-tail/run-stage156-active-tail-baseline-2026-04-29-r1';
const DEFAULT_OUT = 'Output/stage145-low-grade-tail/stage162-near-pass-pdfua-diagnostic-2026-04-30-r1';

const PRIMARY_IDS = new Set([
  'v1-v1-3468',
  'v1-v1-4766',
  'v1-v1-4761',
  'orig-fixture-inaccessible',
  'v1-v1-legacy-004-pdfaf-fixture-inaccessible',
]);

const PARKED_IDS = new Set([
  'v1-v1-3451',
  'v1-v1-3459',
  'v1-v1-3602',
  'v1-v1-4485',
  'v1-v1-4171',
  'v1-v1-4683',
  'v1-v1-4694',
  'orig-long-4680',
  'orig-structure-4076',
]);

const LARGE_ANNOTATION_OWNERSHIP_DEBT = 50;

const CLEANUP_TOOLS = new Set([
  'mark_untagged_content_as_artifact',
  'remap_orphan_mcids_as_artifacts',
  'repair_annotation_alt_text',
  'repair_structure_conformance',
  'repair_native_link_structure',
  'set_link_annotation_contents',
  'tag_unowned_annotations',
  'normalize_annotation_tab_order',
]);

export type Stage162NearPassClass =
  | 'near_pass_pdfua_artifact_candidate'
  | 'near_pass_annotation_link_candidate'
  | 'post_pass_orphan_no_score_gain'
  | 'alt_or_heading_primary_not_pdfua'
  | 'analyzer_or_route_volatility'
  | 'no_safe_candidate';

interface RunRow {
  id?: string;
  publicationId?: string;
  afterScore?: number;
  afterGrade?: string;
  afterCategories?: Array<{ key?: string; score?: number }>;
  falsePositiveAppliedCount?: number;
  falsePositiveApplied?: number;
  appliedTools?: Array<{
    toolName?: string;
    outcome?: string;
    details?: unknown;
    scoreBefore?: number;
    scoreAfter?: number;
    delta?: number;
    stage?: number;
    round?: number;
    source?: string;
  }>;
}

interface CleanupToolSummary {
  toolName: string;
  outcome: string;
  scoreBefore: number | null;
  scoreAfter: number | null;
  delta: number | null;
  stage: number | null;
  round: number | null;
  source: string | null;
  note: string | null;
}

export interface Stage162Signals {
  pdfUaCompliance: number | null;
  linkQuality: number | null;
  headingStructure: number | null;
  readingOrder: number | null;
  altText: number | null;
  tableMarkup: number | null;
  orphanMcidCount: number;
  suspectedPathPaintOutsideMc: number;
  taggedAnnotationRiskCount: number;
  linkAnnotationsMissingStructure: number;
  nonLinkAnnotationsMissingStructure: number;
  linkAnnotationsMissingStructParent: number;
  nonLinkAnnotationsMissingStructParent: number;
  pagesMissingTabsS: number;
  pagesAnnotationOrderDiffers: number;
}

export interface Stage162DiagnosticRow {
  id: string;
  publicationId: string;
  title: string;
  referenceScore: number | null;
  referenceGrade: string | null;
  benchmarkScore: number | null;
  benchmarkGrade: string | null;
  analyzedScore: number;
  analyzedGrade: string;
  falsePositiveApplied: number;
  analyzedPdf: string;
  analyzedFromArtifact: boolean;
  signals: Stage162Signals;
  pdfUaFindings: string[];
  linkFindings: string[];
  cleanupTools: CleanupToolSummary[];
  cleanupAppliedCount: number;
  cleanupTerminalCount: number;
  firstNoEffectReason: string | null;
  firstRejectedReason: string | null;
  nearPassClass: Stage162NearPassClass;
  implementable: boolean;
  reason: string;
}

export interface Stage162DiagnosticReport {
  manifest: string;
  referenceRun: string;
  artifactRun: string;
  rows: Stage162DiagnosticRow[];
  decision: {
    classDistribution: Record<Stage162NearPassClass, number>;
    selectedRows: string[];
    recommendedDirection:
      | 'investigate_annotation_link_repair'
      | 'investigate_pdfua_artifact_cleanup'
      | 'diagnostic_only_no_safe_near_pass_rule';
  };
}

function usage(): string {
  return `Usage: pnpm exec tsx scripts/stage162-near-pass-pdfua-diagnostic.ts [options]

Options:
  --manifest <path>        Active low-grade tail manifest (default: ${DEFAULT_MANIFEST})
  --reference-run <dir>    Reference run with remediate.results.json (default: ${DEFAULT_REFERENCE_RUN})
  --artifact-run <dir>     Run directory with written remediated PDFs (default: reference run)
  --out <dir>              Output diagnostic directory (default: ${DEFAULT_OUT})
  --file <id>              Limit to manifest id or publication id; repeatable
  --all                    Analyze every manifest row
  --help                   Show this help`;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function categoryFromRun(row: RunRow | undefined, key: string): number | null {
  return numberOrNull(row?.afterCategories?.find(category => category.key === key)?.score);
}

function categoryFromResult(result: AnalysisResult, key: string): number | null {
  return numberOrNull(result.categories.find(category => category.key === key)?.score);
}

function parseDetails(details: unknown): Record<string, unknown> | null {
  if (!details) return null;
  if (typeof details === 'object' && !Array.isArray(details)) return details as Record<string, unknown>;
  if (typeof details !== 'string' || !details.trim().startsWith('{')) return null;
  try {
    const parsed = JSON.parse(details) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function detailsNote(details: unknown): string | null {
  const parsed = parseDetails(details);
  if (typeof parsed?.['note'] === 'string') return parsed['note'];
  if (typeof parsed?.['raw'] === 'string') return parsed['raw'];
  if (typeof details === 'string') return details.slice(0, 200);
  return null;
}

function signalSummary(result: AnalysisResult, snapshot: DocumentSnapshot): Stage162Signals {
  const detection = snapshot.detectionProfile ?? result.detectionProfile;
  const pdfUa = detection?.pdfUaSignals ?? snapshot.taggedContentAudit;
  const annotation = detection?.annotationSignals ?? snapshot.annotationAccessibility;
  return {
    pdfUaCompliance: categoryFromResult(result, 'pdf_ua_compliance'),
    linkQuality: categoryFromResult(result, 'link_quality'),
    headingStructure: categoryFromResult(result, 'heading_structure'),
    readingOrder: categoryFromResult(result, 'reading_order'),
    altText: categoryFromResult(result, 'alt_text'),
    tableMarkup: categoryFromResult(result, 'table_markup'),
    orphanMcidCount: pdfUa?.orphanMcidCount ?? snapshot.orphanMcids?.length ?? 0,
    suspectedPathPaintOutsideMc: pdfUa?.suspectedPathPaintOutsideMc ?? snapshot.taggedContentAudit?.suspectedPathPaintOutsideMc ?? 0,
    taggedAnnotationRiskCount: pdfUa?.taggedAnnotationRiskCount ?? 0,
    linkAnnotationsMissingStructure: annotation?.linkAnnotationsMissingStructure ?? 0,
    nonLinkAnnotationsMissingStructure: annotation?.nonLinkAnnotationsMissingStructure ?? 0,
    linkAnnotationsMissingStructParent: annotation?.linkAnnotationsMissingStructParent ?? 0,
    nonLinkAnnotationsMissingStructParent: annotation?.nonLinkAnnotationsMissingStructParent ?? 0,
    pagesMissingTabsS: annotation?.pagesMissingTabsS ?? 0,
    pagesAnnotationOrderDiffers: annotation?.pagesAnnotationOrderDiffers ?? 0,
  };
}

function cleanupSummary(row: RunRow | undefined): CleanupToolSummary[] {
  return (row?.appliedTools ?? [])
    .filter(tool => tool.toolName && CLEANUP_TOOLS.has(tool.toolName))
    .map(tool => ({
      toolName: tool.toolName ?? '',
      outcome: tool.outcome ?? 'unknown',
      scoreBefore: numberOrNull(tool.scoreBefore),
      scoreAfter: numberOrNull(tool.scoreAfter),
      delta: numberOrNull(tool.delta),
      stage: numberOrNull(tool.stage),
      round: numberOrNull(tool.round),
      source: typeof tool.source === 'string' ? tool.source : null,
      note: detailsNote(tool.details),
    }));
}

function isNearPassCoreHealthy(signals: Stage162Signals): boolean {
  return (
    (signals.headingStructure ?? 0) >= 75 &&
    (signals.readingOrder ?? 0) >= 80 &&
    (signals.altText ?? 0) >= 80 &&
    (signals.tableMarkup ?? 0) >= 80
  );
}

export function classifyStage162NearPass(input: {
  publicationId: string;
  analyzedGrade: string;
  falsePositiveApplied: number;
  signals: Stage162Signals;
  cleanupTools?: CleanupToolSummary[];
}): Pick<Stage162DiagnosticRow, 'nearPassClass' | 'implementable' | 'reason'> {
  if (PARKED_IDS.has(input.publicationId)) {
    return { nearPassClass: 'analyzer_or_route_volatility', implementable: false, reason: 'parked OCR/analyzer/route-volatility row' };
  }
  if (input.falsePositiveApplied > 0) {
    return { nearPassClass: 'no_safe_candidate', implementable: false, reason: 'reference run already has false-positive-applied evidence' };
  }

  const signals = input.signals;
  const coreHealthy = isNearPassCoreHealthy(signals);
  const pdfUaLow = (signals.pdfUaCompliance ?? 100) < 80;
  const linkLow = (signals.linkQuality ?? 100) < 80;
  const annotationMissing =
    signals.linkAnnotationsMissingStructure + signals.nonLinkAnnotationsMissingStructure;
  const structParentMissing =
    signals.linkAnnotationsMissingStructParent + signals.nonLinkAnnotationsMissingStructParent;
  const artifactDebt = signals.orphanMcidCount + signals.suspectedPathPaintOutsideMc;
  const orphanCleanupApplied = (input.cleanupTools ?? []).some(tool =>
    tool.toolName === 'remap_orphan_mcids_as_artifacts' &&
    tool.outcome === 'applied'
  );

  if (!coreHealthy) {
    return { nearPassClass: 'alt_or_heading_primary_not_pdfua', implementable: false, reason: 'one or more core structural categories are below near-pass threshold' };
  }
  if (!pdfUaLow && !linkLow) {
    return { nearPassClass: 'no_safe_candidate', implementable: false, reason: 'PDF/UA and link/annotation evidence are not the active limiter' };
  }
  if (annotationMissing >= LARGE_ANNOTATION_OWNERSHIP_DEBT) {
    return {
      nearPassClass: 'near_pass_annotation_link_candidate',
      implementable: PRIMARY_IDS.has(input.publicationId),
      reason: structParentMissing > 0
        ? `near-pass row has ${annotationMissing} annotation ownership issue(s), including ${structParentMissing} missing /StructParent`
        : `near-pass row has ${annotationMissing} annotation ParentTree/role issue(s) with /StructParent present`,
    };
  }
  if (artifactDebt > 0 && orphanCleanupApplied) {
    return {
      nearPassClass: 'post_pass_orphan_no_score_gain',
      implementable: false,
      reason: `orphan/artifact debt remains after an accepted orphan cleanup (${artifactDebt} signal(s))`,
    };
  }
  if (artifactDebt > 0) {
    return {
      nearPassClass: 'near_pass_pdfua_artifact_candidate',
      implementable: PRIMARY_IDS.has(input.publicationId),
      reason: `near-pass row has concrete tagged-content artifact/orphan debt (${artifactDebt} signal(s))`,
    };
  }
  return { nearPassClass: 'no_safe_candidate', implementable: false, reason: 'no concrete safe PDF/UA cleanup evidence remains' };
}

async function loadRunRows(runDir: string): Promise<Map<string, RunRow>> {
  const parsed = JSON.parse(await readFile(join(runDir, 'remediate.results.json'), 'utf8')) as unknown;
  const rows = Array.isArray(parsed) ? parsed as RunRow[] : [];
  const map = new Map<string, RunRow>();
  for (const row of rows) {
    if (row.publicationId) map.set(row.publicationId, row);
    if (row.id) map.set(row.id, row);
  }
  return map;
}

async function artifactPdfFor(runDir: string, row: EdgeMixManifestRow): Promise<string | null> {
  try {
    const files = await readdir(runDir);
    const found = files.find(file =>
      file.endsWith('.remediated.pdf') &&
      (file.startsWith(`${row.publicationId}-`) || file.startsWith(`${row.id}-`))
    );
    return found ? join(runDir, found) : null;
  } catch {
    return null;
  }
}

async function analyzeRow(
  row: EdgeMixManifestRow,
  referenceRows: Map<string, RunRow>,
  artifactRows: Map<string, RunRow>,
  artifactRun: string,
): Promise<Stage162DiagnosticRow> {
  const referenceRow = referenceRows.get(row.publicationId) ?? referenceRows.get(row.id);
  const benchmarkRow = artifactRows.get(row.publicationId) ?? artifactRows.get(row.id) ?? referenceRow;
  const artifactPdf = await artifactPdfFor(artifactRun, row);
  const pdfPath = artifactPdf ?? row.absolutePath;
  const { result, snapshot } = await analyzePdf(pdfPath, basename(pdfPath), { bypassCache: true });
  const signals = signalSummary(result, snapshot);
  const cleanupTools = cleanupSummary(benchmarkRow);
  const pdfUaFindings = result.findings
    .filter(finding => finding.category === 'pdf_ua_compliance')
    .map(finding => finding.message);
  const linkFindings = result.findings
    .filter(finding => finding.category === 'link_quality')
    .map(finding => finding.message);
  const falsePositiveApplied = Number(benchmarkRow?.falsePositiveAppliedCount ?? benchmarkRow?.falsePositiveApplied ?? 0);
  const classified = classifyStage162NearPass({
    publicationId: row.publicationId,
    analyzedGrade: result.grade,
    falsePositiveApplied,
    signals,
    cleanupTools,
  });

  return {
    id: row.id,
    publicationId: row.publicationId,
    title: row.title,
    referenceScore: numberOrNull(referenceRow?.afterScore),
    referenceGrade: typeof referenceRow?.afterGrade === 'string' ? referenceRow.afterGrade : null,
    benchmarkScore: numberOrNull(benchmarkRow?.afterScore),
    benchmarkGrade: typeof benchmarkRow?.afterGrade === 'string' ? benchmarkRow.afterGrade : null,
    analyzedScore: result.score,
    analyzedGrade: result.grade,
    falsePositiveApplied,
    analyzedPdf: pdfPath,
    analyzedFromArtifact: Boolean(artifactPdf),
    signals,
    pdfUaFindings,
    linkFindings,
    cleanupTools,
    cleanupAppliedCount: cleanupTools.filter(tool => tool.outcome === 'applied').length,
    cleanupTerminalCount: cleanupTools.filter(tool => tool.outcome !== 'applied').length,
    firstNoEffectReason: cleanupTools.find(tool => tool.outcome === 'no_effect')?.note ?? null,
    firstRejectedReason: cleanupTools.find(tool => tool.outcome === 'rejected')?.note ?? null,
    ...classified,
  };
}

function buildReport(
  manifest: string,
  referenceRun: string,
  artifactRun: string,
  rows: Stage162DiagnosticRow[],
): Stage162DiagnosticReport {
  const classDistribution = rows.reduce<Record<Stage162NearPassClass, number>>((acc, row) => {
    acc[row.nearPassClass] += 1;
    return acc;
  }, {
    near_pass_pdfua_artifact_candidate: 0,
    near_pass_annotation_link_candidate: 0,
    post_pass_orphan_no_score_gain: 0,
    alt_or_heading_primary_not_pdfua: 0,
    analyzer_or_route_volatility: 0,
    no_safe_candidate: 0,
  });
  const selectedRows = rows.filter(row => row.implementable).map(row => row.publicationId).sort();
  const annotationSelected = rows.some(row => row.implementable && row.nearPassClass === 'near_pass_annotation_link_candidate');
  const artifactSelected = rows.some(row => row.implementable && row.nearPassClass === 'near_pass_pdfua_artifact_candidate');
  return {
    manifest,
    referenceRun,
    artifactRun,
    rows,
    decision: {
      classDistribution,
      selectedRows,
      recommendedDirection: annotationSelected
        ? 'investigate_annotation_link_repair'
        : artifactSelected
          ? 'investigate_pdfua_artifact_cleanup'
          : 'diagnostic_only_no_safe_near_pass_rule',
    },
  };
}

function renderMarkdown(report: Stage162DiagnosticReport): string {
  const lines = [
    '# Stage 162 Near-Pass PDF/UA Diagnostic',
    '',
    `Manifest: \`${report.manifest}\``,
    `Reference run: \`${report.referenceRun}\``,
    `Artifact run: \`${report.artifactRun}\``,
    '',
    `Decision: \`${report.decision.recommendedDirection}\``,
    `Selected rows: ${report.decision.selectedRows.map(id => `\`${id}\``).join(', ') || 'none'}`,
    '',
    '| Class | Count |',
    '| --- | ---: |',
    ...Object.entries(report.decision.classDistribution).map(([key, count]) => `| ${key} | ${count} |`),
    '',
    '| Row | Score | PDF/UA | Link | H | RO | Alt | Table | Ann missing | Missing SP | Orphans | Path paint | Cleanup applied/terminal | Class | Reason |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |',
  ];
  for (const row of report.rows) {
    const signals = row.signals;
    const annMissing = signals.linkAnnotationsMissingStructure + signals.nonLinkAnnotationsMissingStructure;
    const missingSp = signals.linkAnnotationsMissingStructParent + signals.nonLinkAnnotationsMissingStructParent;
    lines.push(`| ${row.publicationId} | ${row.analyzedScore} ${row.analyzedGrade} | ${signals.pdfUaCompliance ?? 'n/a'} | ${signals.linkQuality ?? 'n/a'} | ${signals.headingStructure ?? 'n/a'} | ${signals.readingOrder ?? 'n/a'} | ${signals.altText ?? 'n/a'} | ${signals.tableMarkup ?? 'n/a'} | ${annMissing} | ${missingSp} | ${signals.orphanMcidCount} | ${signals.suspectedPathPaintOutsideMc} | ${row.cleanupAppliedCount}/${row.cleanupTerminalCount} | ${row.nearPassClass} | ${row.reason} |`);
  }

  lines.push('', '## Primary Evidence', '');
  for (const row of report.rows.filter(r => PRIMARY_IDS.has(r.publicationId))) {
    lines.push(`### ${row.publicationId}`);
    lines.push(`- Analyzed PDF: \`${row.analyzedPdf}\`${row.analyzedFromArtifact ? '' : ' (source PDF; no artifact was found)'}`);
    lines.push(`- First no-effect: ${row.firstNoEffectReason ?? 'none'}`);
    lines.push(`- First rejected: ${row.firstRejectedReason ?? 'none'}`);
    if (row.pdfUaFindings.length > 0) {
      lines.push(`- PDF/UA findings: ${row.pdfUaFindings.map(finding => `\`${finding}\``).join('; ')}`);
    }
    if (row.linkFindings.length > 0) {
      lines.push(`- Link findings: ${row.linkFindings.map(finding => `\`${finding}\``).join('; ')}`);
    }
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  let manifestPath = DEFAULT_MANIFEST;
  let referenceRun = DEFAULT_REFERENCE_RUN;
  let artifactRun: string | null = null;
  let outDir = DEFAULT_OUT;
  const requested = new Set<string>();
  let analyzeAll = true;
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--manifest') manifestPath = args[++i] ?? manifestPath;
    else if (arg === '--reference-run') referenceRun = args[++i] ?? referenceRun;
    else if (arg === '--artifact-run') artifactRun = args[++i] ?? artifactRun;
    else if (arg === '--out') outDir = args[++i] ?? outDir;
    else if (arg === '--file') {
      analyzeAll = false;
      requested.add(args[++i] ?? '');
    } else if (arg === '--all') {
      analyzeAll = true;
      requested.clear();
    } else if (arg === '--help') {
      console.log(usage());
      return;
    } else {
      throw new Error(`Unknown argument ${arg}\n${usage()}`);
    }
  }

  const effectiveArtifactRun = artifactRun ?? referenceRun;
  const manifestRows = await loadEdgeMixManifest(manifestPath);
  const selected = analyzeAll
    ? manifestRows
    : manifestRows.filter(row => requested.has(row.publicationId) || requested.has(row.id));
  const referenceRows = await loadRunRows(referenceRun);
  const artifactRows = effectiveArtifactRun === referenceRun ? referenceRows : await loadRunRows(effectiveArtifactRun);
  const rows: Stage162DiagnosticRow[] = [];
  for (const row of selected) rows.push(await analyzeRow(row, referenceRows, artifactRows, effectiveArtifactRun));
  const report = buildReport(manifestPath, referenceRun, effectiveArtifactRun, rows);
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, 'stage162-near-pass-pdfua-diagnostic.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await writeFile(join(outDir, 'stage162-near-pass-pdfua-diagnostic.md'), renderMarkdown(report), 'utf8');
  console.log(renderMarkdown(report));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}
