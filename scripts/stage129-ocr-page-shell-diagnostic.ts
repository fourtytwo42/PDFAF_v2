#!/usr/bin/env tsx
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { analyzePdf } from '../src/services/pdfAnalyzer.js';
import {
  classifyStage129OcrPageShell,
  type Stage129OcrPageShellClass,
  type OcrPageShellHeadingCandidate,
} from '../src/services/remediation/ocrPageShellHeading.js';
import type { AnalysisResult, DocumentSnapshot } from '../src/types.js';

interface Args {
  runDir: string;
  manifestPath: string;
  outDir: string;
  ids: string[];
}

interface ManifestRow {
  publicationId: string;
  title: string;
  localFile: string;
  problemMix?: string[];
}

interface BenchmarkRow {
  id: string;
  publicationId: string;
  title: string;
  localFile: string;
  beforeScore?: number;
  beforeGrade?: string;
  beforePdfClass?: string;
  afterScore?: number;
  afterGrade?: string;
  afterPdfClass?: string;
  pageCount?: number;
  problemMix?: string[];
  afterCategories?: AnalysisResult['categories'];
  afterDetectionProfile?: unknown;
  appliedTools?: Array<{ toolName: string; outcome: string; delta?: number; source?: string; details?: string }>;
}

interface Stage129DiagnosticRow {
  id: string;
  publicationId: string;
  title: string;
  localFile: string;
  remediatedPdfPath: string | null;
  beforeScore: number | null;
  afterScore: number | null;
  afterGrade: string | null;
  afterPdfClass: string | null;
  reanalyzedScore: number | null;
  reanalyzedGrade: string | null;
  classification: Stage129OcrPageShellClass;
  candidate: OcrPageShellHeadingCandidate | null;
  reasons: string[];
  ocrProvenance: {
    creator: string | null;
    producer: string | null;
    engineAppliedOcr: boolean;
    engineTaggedOcrText: boolean;
    ocrToolApplied: boolean;
  };
  documentShape: {
    beforePdfClass: string | null;
    afterPdfClass: string | null;
    reanalyzedPdfClass: string | null;
    pageCount: number | null;
    textCharCount: number | null;
    isTagged: boolean | null;
    structureTreeDepth: number | null;
    paragraphStructElemCount: number;
    mcidTextSpanCount: number;
    page0McidSpanCount: number;
    headingScore: number | null;
    readingOrderScore: number | null;
    pdfUaScore: number | null;
  };
  firstPageVisibleCandidates: string[];
  acceptedToolTimeline: Array<{ toolName: string; outcome: string; delta: number | null; source: string | null; note: string | null }>;
  visualRiskMutations: Array<{ toolName: string; outcome: string; source: string | null; note: string | null }>;
}

interface Stage129DiagnosticReport {
  generatedAt: string;
  runDir: string;
  manifestPath: string;
  rows: Stage129DiagnosticRow[];
  classificationDistribution: Record<string, number>;
  recommendation: string;
}

const DEFAULT_IDS = ['3423', '3429', '3433', '4002', '4737'];
const VISUAL_RISK_TOOL_RE = /ocr_scanned_pdf|create_heading_from_ocr_page_shell_anchor|create_heading_from_visible_text_anchor|synthesize_basic_structure_from_layout|bootstrap_struct_tree|mark_untagged_content_as_artifact|artifact_repeating_page_furniture|remap_orphan_mcids_as_artifacts/i;

function usage(): string {
  return `Usage: pnpm exec tsx scripts/stage129-ocr-page-shell-diagnostic.ts --run <run-dir> --manifest <manifest.json> [options]

Options:
  --id <id>       Publication id or v1-<id> row id to include; repeatable
  --ids <csv>     Comma-separated ids to include
  --out <dir>     Output directory (default: <run-dir>/stage129-ocr-page-shell-diagnostic)
  --help          Show this help`;
}

function parseArgs(argv = process.argv.slice(2)): Args {
  let runDir = '';
  let manifestPath = '';
  let outDir = '';
  const ids: string[] = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    if (arg === '--') continue;
    if (arg === '--help' || arg === '-h') {
      console.log(usage());
      process.exit(0);
    }
    if (arg === '--run') runDir = argv[++i] ?? '';
    else if (arg === '--manifest') manifestPath = argv[++i] ?? '';
    else if (arg === '--out') outDir = argv[++i] ?? '';
    else if (arg === '--id') ids.push((argv[++i] ?? '').replace(/^v1-/, ''));
    else if (arg === '--ids') {
      ids.push(...(argv[++i] ?? '').split(',').map(value => value.trim().replace(/^v1-/, '')).filter(Boolean));
    } else {
      throw new Error(`Unknown argument: ${arg}\n${usage()}`);
    }
  }
  if (!runDir || !manifestPath) throw new Error(usage());
  return {
    runDir: resolve(runDir),
    manifestPath: resolve(manifestPath),
    outDir: outDir ? resolve(outDir) : join(resolve(runDir), 'stage129-ocr-page-shell-diagnostic'),
    ids: ids.length > 0 ? ids : DEFAULT_IDS,
  };
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, 'utf8')) as T;
}

function categoryScore(categories: AnalysisResult['categories'] | undefined, key: string): number | null {
  const category = categories?.find(item => item.key === key);
  return typeof category?.score === 'number' ? category.score : null;
}

function parseToolNote(details: unknown): string | null {
  if (typeof details !== 'string') return null;
  const trimmed = details.trim();
  if (!trimmed.startsWith('{')) return null;
  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    if (typeof parsed['note'] === 'string') return parsed['note'];
    if (typeof parsed['raw'] === 'string') return parsed['raw'];
  } catch {
    return null;
  }
  return null;
}

async function findRemediatedPdf(runDir: string, publicationId: string): Promise<string | null> {
  const names = await readdir(runDir).catch(() => []);
  const match = names
    .filter(name => name.startsWith(`${publicationId}-`) && name.endsWith('.remediated.pdf'))
    .sort()[0];
  return match ? join(runDir, match) : null;
}

function firstPageCandidates(snapshot: DocumentSnapshot): string[] {
  const page0Spans = (snapshot.mcidTextSpans ?? [])
    .filter(span => span.page === 0)
    .slice(0, 80)
    .map(span => (span.resolvedText ?? span.snippet ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim())
    .filter(Boolean);
  const lines = snapshot.textByPage[0]?.split(/\r?\n/).map(line => line.replace(/\s+/g, ' ').trim()).filter(Boolean) ?? [];
  return [...new Set([...lines.slice(0, 12), ...page0Spans.slice(0, 20)])].slice(0, 24);
}

function toolTimeline(row: BenchmarkRow): Stage129DiagnosticRow['acceptedToolTimeline'] {
  return (row.appliedTools ?? []).map(tool => ({
    toolName: tool.toolName,
    outcome: tool.outcome,
    delta: typeof tool.delta === 'number' ? tool.delta : null,
    source: tool.source ?? null,
    note: parseToolNote(tool.details),
  }));
}

function visualRiskTools(row: BenchmarkRow): Stage129DiagnosticRow['visualRiskMutations'] {
  return toolTimeline(row)
    .filter(tool => tool.outcome === 'applied' && VISUAL_RISK_TOOL_RE.test(tool.toolName))
    .map(tool => ({
      toolName: tool.toolName,
      outcome: tool.outcome,
      source: tool.source,
      note: tool.note,
    }));
}

function recommendationFor(rows: Stage129DiagnosticRow[]): string {
  const validated = rows.filter(row =>
    row.acceptedToolTimeline.some(tool => tool.toolName === 'create_heading_from_ocr_page_shell_anchor' && tool.outcome === 'applied') &&
    (row.documentShape.headingScore ?? 0) > 0
  );
  if (validated.length > 0) {
    const readingDebt = validated.filter(row => (row.documentShape.readingOrderScore ?? 100) < 70);
    return readingDebt.length > 0
      ? `ocr_page_shell_heading_recovery_validated_reading_order_debt_remaining(${validated.map(row => row.publicationId).join(',')})`
      : `ocr_page_shell_heading_recovery_validated(${validated.map(row => row.publicationId).join(',')})`;
  }
  const ocrCandidates = rows.filter(row => row.classification === 'ocr_page_shell_heading_candidate');
  const ocrBelow = rows.filter(row => row.classification === 'ocr_text_without_safe_anchor' || row.classification === 'ocr_reading_order_shell_debt');
  if (ocrCandidates.length > 0) {
    return `implement_or_validate_ocr_page_shell_heading_recovery(${ocrCandidates.map(row => row.publicationId).join(',')})`;
  }
  if (ocrBelow.length > 0) return 'diagnostic_only_no_safe_ocr_heading_anchor';
  return 'no_ocr_page_shell_targets';
}

function renderMarkdown(report: Stage129DiagnosticReport): string {
  const lines: string[] = [
    '# Stage 129 OCR Page-Shell Diagnostic',
    '',
    `Run: \`${report.runDir}\``,
    `Manifest: \`${report.manifestPath}\``,
    '',
    '## Summary',
    '',
    `Recommendation: \`${report.recommendation}\``,
    '',
    '| Class | Count |',
    '| --- | ---: |',
  ];
  for (const [key, count] of Object.entries(report.classificationDistribution).sort((a, b) => a[0].localeCompare(b[0]))) {
    lines.push(`| ${key} | ${count} |`);
  }
  lines.push('', '## Rows', '', '| ID | Score | Class | Candidate | OCR | Shape | Visual-Risk Tools |', '| --- | ---: | --- | --- | --- | --- | --- |');
  for (const row of report.rows) {
    const candidate = row.candidate
      ? `${row.candidate.source} page=${row.candidate.page} mcids=${row.candidate.mcids.join(',')} score=${row.candidate.score}`
      : 'none';
    const ocr = row.ocrProvenance.ocrToolApplied || row.ocrProvenance.engineAppliedOcr
      ? `yes creator=${row.ocrProvenance.creator ?? 'n/a'}`
      : 'no';
    const shape = `text=${row.documentShape.textCharCount ?? 'n/a'} depth=${row.documentShape.structureTreeDepth ?? 'n/a'} H=${row.documentShape.headingScore ?? 'n/a'} RO=${row.documentShape.readingOrderScore ?? 'n/a'}`;
    const visual = row.visualRiskMutations.map(tool => `${tool.toolName}:${tool.outcome}`).join(', ') || 'none';
    lines.push(`| ${row.publicationId} | ${row.afterScore ?? 'n/a'} ${row.afterGrade ?? ''} | ${row.classification} | ${candidate} | ${ocr} | ${shape} | ${visual} |`);
  }
  return `${lines.join('\n')}\n`;
}

export async function buildStage129DiagnosticReport(args: Args): Promise<Stage129DiagnosticReport> {
  const rows = await readJson<BenchmarkRow[]>(join(args.runDir, 'remediate.results.json'));
  const manifest = await readJson<{ rows: ManifestRow[] }>(args.manifestPath);
  const manifestById = new Map(manifest.rows.map(row => [row.publicationId, row]));
  const requested = new Set(args.ids.map(id => id.replace(/^v1-/, '')));
  const outRows: Stage129DiagnosticRow[] = [];
  const manifestRoot = dirname(args.manifestPath);

  for (const row of rows) {
    const id = row.publicationId || row.id.replace(/^v1-/, '');
    if (!requested.has(id) && !requested.has(row.id.replace(/^v1-/, ''))) continue;
    const manifestRow = manifestById.get(id);
    const localFile = manifestRow?.localFile ?? row.localFile;
    const remediatedPdfPath = await findRemediatedPdf(args.runDir, id);
    const analysisPath = remediatedPdfPath ?? join(manifestRoot, localFile);
    const analyzed = await analyzePdf(analysisPath, basename(analysisPath), { bypassCache: true });
    const disposition = classifyStage129OcrPageShell(analyzed.result, analyzed.snapshot);
    const categories = analyzed.result.categories;
    const detection = analyzed.snapshot.detectionProfile;
    const timeline = toolTimeline(row);
    outRows.push({
      id: row.id,
      publicationId: id,
      title: manifestRow?.title ?? row.title,
      localFile,
      remediatedPdfPath,
      beforeScore: typeof row.beforeScore === 'number' ? row.beforeScore : null,
      afterScore: typeof row.afterScore === 'number' ? row.afterScore : null,
      afterGrade: row.afterGrade ?? null,
      afterPdfClass: row.afterPdfClass ?? null,
      reanalyzedScore: analyzed.result.score,
      reanalyzedGrade: analyzed.result.grade,
      classification: disposition.classification,
      candidate: disposition.candidate,
      reasons: disposition.reasons,
      ocrProvenance: {
        creator: analyzed.snapshot.metadata.creator ?? null,
        producer: analyzed.snapshot.metadata.producer ?? null,
        engineAppliedOcr: analyzed.snapshot.remediationProvenance?.engineAppliedOcr === true,
        engineTaggedOcrText: analyzed.snapshot.remediationProvenance?.engineTaggedOcrText === true,
        ocrToolApplied: timeline.some(tool => tool.toolName === 'ocr_scanned_pdf' && tool.outcome === 'applied'),
      },
      documentShape: {
        beforePdfClass: row.beforePdfClass ?? null,
        afterPdfClass: row.afterPdfClass ?? null,
        reanalyzedPdfClass: analyzed.result.pdfClass,
        pageCount: analyzed.snapshot.pageCount ?? row.pageCount ?? null,
        textCharCount: analyzed.snapshot.textCharCount ?? null,
        isTagged: analyzed.snapshot.isTagged,
        structureTreeDepth: detection?.readingOrderSignals.structureTreeDepth ?? null,
        paragraphStructElemCount: analyzed.snapshot.paragraphStructElems?.length ?? 0,
        mcidTextSpanCount: analyzed.snapshot.mcidTextSpans?.length ?? 0,
        page0McidSpanCount: (analyzed.snapshot.mcidTextSpans ?? []).filter(span => span.page === 0).length,
        headingScore: categoryScore(categories, 'heading_structure'),
        readingOrderScore: categoryScore(categories, 'reading_order'),
        pdfUaScore: categoryScore(categories, 'pdf_ua_compliance'),
      },
      firstPageVisibleCandidates: firstPageCandidates(analyzed.snapshot),
      acceptedToolTimeline: timeline,
      visualRiskMutations: visualRiskTools(row),
    });
  }

  const classificationDistribution: Record<string, number> = {};
  for (const row of outRows) {
    classificationDistribution[row.classification] = (classificationDistribution[row.classification] ?? 0) + 1;
  }
  return {
    generatedAt: new Date().toISOString(),
    runDir: args.runDir,
    manifestPath: args.manifestPath,
    rows: outRows.sort((a, b) => a.publicationId.localeCompare(b.publicationId)),
    classificationDistribution,
    recommendation: recommendationFor(outRows),
  };
}

async function main(): Promise<void> {
  const args = parseArgs();
  const report = await buildStage129DiagnosticReport(args);
  await mkdir(args.outDir, { recursive: true });
  await writeFile(join(args.outDir, 'stage129-ocr-page-shell-diagnostic.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await writeFile(join(args.outDir, 'stage129-ocr-page-shell-diagnostic.md'), renderMarkdown(report), 'utf8');
  console.log(`Wrote Stage 129 OCR page-shell diagnostic to ${args.outDir}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}
