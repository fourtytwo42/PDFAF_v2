#!/usr/bin/env tsx
import 'dotenv/config';

import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { promisify } from 'node:util';
import { REMEDIATION_ANALYSIS_TIMEOUT_MS } from '../src/config.js';
import { buildPacRuleEvidence } from '../src/services/compliance/pacRuleEvidence.js';
import { analyzePdf } from '../src/services/pdfAnalyzer.js';
import { deriveFallbackDocumentTitle } from '../src/services/remediation/planner.js';
import { setDocumentLanguage, setDocumentTitle } from '../src/services/remediation/tools/metadata.js';
import type { AnalysisResult, DocumentSnapshot } from '../src/types.js';

const execFileAsync = promisify(execFile);

const DEFAULT_PDF_ROOTS = [
  'Output/goal-all-input-mean-2026-05-09-r1',
  'Input',
];
const DEFAULT_BASELINE = 'Output/goal-all-input-mean-2026-05-09-r1/r5-complete-baseline-report-2026-05-11-r1/baseline_report.json';
const DEFAULT_OUT = 'Output/goal-all-input-mean-2026-05-09-r1/metadata-only-proof-r5-complete-2026-05-11-r1';
const DEFAULT_IDS = ['4139', '0097', '0181', '0108', '0325'];

type MetadataProofClass =
  | 'metadata_only_safe_candidate'
  | 'metadata_identity_stable_reanalysis_drift'
  | 'metadata_noop'
  | 'unsafe_structure_or_pac_change'
  | 'analysis_error'
  | 'missing_source_pdf';

interface Options {
  pdfRoots: string[];
  baseline: string;
  out: string;
  ids: string[];
}

interface PdfStructuralSummary {
  pageCount: number;
  structTreeRoot: string | null;
  parentTree: string | null;
  pageStructParents: Array<string | number | null>;
  annotationCount: number;
  annotationStructParents: Array<string | number | null>;
  structureDigest: string | null;
  title: string | null;
  lang: string | null;
  displayDocTitle: boolean | null;
}

interface ScoreSummary {
  score: number;
  grade: string;
  titleLanguage: number | null;
  heading: number | null;
  reading: number | null;
  alt: number | null;
  table: number | null;
  pdfua: number | null;
  pageCount: number | null;
  textCharCount: number | null;
  isTagged: boolean | null;
  pacFailedRules: string[];
}

export interface MetadataOnlyProofRow {
  id: string;
  pdfPath: string | null;
  titleApplied: boolean;
  languageApplied: boolean;
  before: ScoreSummary | null;
  after: ScoreSummary | null;
  beforePdf: PdfStructuralSummary | null;
  afterPdf: PdfStructuralSummary | null;
  structuralSummaryStable: boolean;
  pacFailuresAdded: string[];
  pacFailuresRemoved: string[];
  classification: MetadataProofClass;
  rationale: string;
  error?: string;
}

export interface MetadataOnlyProofReport {
  generatedAt: string;
  pdfRoots: string[];
  summary: {
    rowCount: number;
    safeCandidates: string[];
    noopRows: string[];
    unsafeRows: string[];
    missingRows: string[];
  };
  rows: MetadataOnlyProofRow[];
}

function parseArgs(argv: string[]): Options {
  const pdfRoots: string[] = [];
  const ids: string[] = [];
  let baseline = DEFAULT_BASELINE;
  let out = DEFAULT_OUT;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === '--pdf-root' && next) {
      pdfRoots.push(next);
      i += 1;
    } else if (arg === '--baseline' && next) {
      baseline = next;
      i += 1;
    } else if ((arg === '--id' || arg === '--file') && next) {
      ids.push(next);
      i += 1;
    } else if (arg === '--out' && next) {
      out = next;
      i += 1;
    } else if (arg === '--help' || arg === '-h') {
      console.log([
        'Usage: pnpm exec tsx scripts/all-input-metadata-only-proof.ts [--pdf-root <dir> ...] [--id <substring> ...] [--out <dir>]',
        '',
        `Defaults: --baseline ${DEFAULT_BASELINE} --pdf-root ${DEFAULT_PDF_ROOTS.join(' --pdf-root ')} --id ${DEFAULT_IDS.join(' --id ')} --out ${DEFAULT_OUT}`,
      ].join('\n'));
      process.exit(0);
    }
  }
  return {
    pdfRoots: pdfRoots.length > 0 ? pdfRoots : DEFAULT_PDF_ROOTS,
    baseline,
    ids: ids.length > 0 ? ids : DEFAULT_IDS,
    out,
  };
}

function categoryScore(analysis: AnalysisResult, key: string): number | null {
  const row = analysis.categories.find(category => category.key === key);
  return typeof row?.score === 'number' ? row.score : null;
}

function scoreSummary(analysis: AnalysisResult, snapshot: DocumentSnapshot): ScoreSummary {
  return {
    score: analysis.score,
    grade: analysis.grade,
    titleLanguage: categoryScore(analysis, 'title_language'),
    heading: categoryScore(analysis, 'heading_structure'),
    reading: categoryScore(analysis, 'reading_order'),
    alt: categoryScore(analysis, 'alt_text'),
    table: categoryScore(analysis, 'table_markup'),
    pdfua: categoryScore(analysis, 'pdf_ua_compliance'),
    pageCount: snapshot.pageCount ?? null,
    textCharCount: snapshot.textCharCount ?? null,
    isTagged: snapshot.isTagged ?? null,
    pacFailedRules: buildPacRuleEvidence(snapshot)
      .filter(row => row.status === 'fail')
      .map(row => row.ruleId)
      .sort((a, b) => a.localeCompare(b)),
  };
}

async function analyzeBuffer(buffer: Buffer, filename: string): Promise<{ result: AnalysisResult; snapshot: DocumentSnapshot }> {
  const dir = await mkdtemp(join(tmpdir(), 'pdfaf-metadata-proof-'));
  const pdf = join(dir, filename);
  try {
    await writeFile(pdf, buffer);
    return await analyzePdf(pdf, filename, {
      bypassCache: true,
      timeoutMs: REMEDIATION_ANALYSIS_TIMEOUT_MS,
    });
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

async function inspectPdf(buffer: Buffer, filename: string): Promise<PdfStructuralSummary> {
  const dir = await mkdtemp(join(tmpdir(), 'pdfaf-metadata-inspect-'));
  const pdf = join(dir, filename);
  try {
    await writeFile(pdf, buffer);
    const script = String.raw`
import hashlib, json, sys
import pikepdf

path = sys.argv[1]
pdf = pikepdf.Pdf.open(path)

def ref(obj):
    try:
        return f"{obj.objgen[0]} {obj.objgen[1]}"
    except Exception:
        return None

def safe_name(value):
    if value is None:
        return None
    try:
        return str(value)
    except Exception:
        return None

root = pdf.Root
pages = list(pdf.pages)
page_struct_parents = []
ann_struct_parents = []
ann_count = 0
for page in pages:
    page_struct_parents.append(safe_name(page.obj.get('/StructParents')))
    annots = page.obj.get('/Annots', [])
    try:
        iterable = list(annots)
    except Exception:
        iterable = []
    ann_count += len(iterable)
    for annot in iterable:
        try:
            ann_struct_parents.append(safe_name(annot.get('/StructParent')))
        except Exception:
            ann_struct_parents.append(None)

struct = root.get('/StructTreeRoot')
parent_tree = None
struct_digest = None
if struct is not None:
    try:
        parent_tree = ref(struct.get('/ParentTree'))
    except Exception:
        parent_tree = None
    try:
        struct_digest = hashlib.sha256(str(struct).encode('utf-8', 'replace')).hexdigest()
    except Exception:
        struct_digest = None

title = None
try:
    title_obj = pdf.docinfo.get('/Title') if pdf.docinfo is not None else None
    title = safe_name(title_obj)
except Exception:
    pass

display = None
try:
    vp = root.get('/ViewerPreferences')
    if vp is not None and '/DisplayDocTitle' in vp:
        display = bool(vp.get('/DisplayDocTitle'))
except Exception:
    pass

print(json.dumps({
    'pageCount': len(pages),
    'structTreeRoot': ref(struct) if struct is not None else None,
    'parentTree': parent_tree,
    'pageStructParents': page_struct_parents,
    'annotationCount': ann_count,
    'annotationStructParents': ann_struct_parents,
    'structureDigest': struct_digest,
    'title': title,
    'lang': safe_name(root.get('/Lang')),
    'displayDocTitle': display,
}, sort_keys=True))
`;
    const { stdout } = await execFileAsync('python3', ['-c', script, pdf], { maxBuffer: 5 * 1024 * 1024 });
    return JSON.parse(stdout) as PdfStructuralSummary;
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

function structuralKey(summary: PdfStructuralSummary): string {
  const copy = {
    pageCount: summary.pageCount,
    pageStructParents: summary.pageStructParents,
    annotationCount: summary.annotationCount,
    annotationStructParents: summary.annotationStructParents,
  };
  return createHash('sha256').update(JSON.stringify(copy)).digest('hex');
}

async function collectPdfs(roots: string[]): Promise<string[]> {
  const out: string[] = [];
  async function visit(dir: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if ((entry.isFile() || entry.isSymbolicLink()) && entry.name.toLowerCase().endsWith('.pdf')) out.push(path);
    }
  }
  for (const root of roots) await visit(root);
  return out.sort((a, b) => a.localeCompare(b));
}

function preferSourcePdf(paths: string[]): string | null {
  const filtered = paths.filter(path =>
    !/_remediated\.pdf$/i.test(path) &&
    !/api[_-]semantic|api-remediated|trace_remediated/i.test(path) &&
    !/\.pdf-(pre|final|heading|cleaned|set_|repair_|remap_|create_)/i.test(path));
  const pool = filtered.length > 0 ? filtered : paths;
  return pool.sort((a, b) => {
    const aInput = a.startsWith('Input/') ? 0 : 1;
    const bInput = b.startsWith('Input/') ? 0 : 1;
    if (aInput !== bInput) return aInput - bInput;
    const aLen = a.length;
    const bLen = b.length;
    return aLen - bLen || a.localeCompare(b);
  })[0] ?? null;
}

async function baselineNames(path: string): Promise<string[]> {
  try {
    const parsed = JSON.parse(await readFile(path, 'utf8')) as { rows?: Array<{ file?: string }> } | Array<{ file?: string }>;
    const rows = Array.isArray(parsed) ? parsed : parsed.rows ?? [];
    return rows.map(row => row.file ? basename(row.file) : '').filter(Boolean);
  } catch {
    return [];
  }
}

function findPdfForId(paths: string[], id: string, targetBasename?: string): string | null {
  if (targetBasename) {
    const exact = preferSourcePdf(paths.filter(path => basename(path) === targetBasename));
    if (exact) return exact;
  }
  const needle = id.toLowerCase();
  return preferSourcePdf(paths.filter(path => basename(path).toLowerCase().includes(needle)));
}

function diffRules(before: string[], after: string[]): { added: string[]; removed: string[] } {
  const b = new Set(before);
  const a = new Set(after);
  return {
    added: after.filter(rule => !b.has(rule)),
    removed: before.filter(rule => !a.has(rule)),
  };
}

export function classifyMetadataOnlyProof(input: {
  titleApplied: boolean;
  languageApplied: boolean;
  before: ScoreSummary;
  after: ScoreSummary;
  structuralSummaryStable: boolean;
  pacFailuresAdded: string[];
}): { classification: MetadataProofClass; rationale: string } {
  if (!input.titleApplied && !input.languageApplied) {
    return { classification: 'metadata_noop', rationale: 'Title and language mutations produced no byte change.' };
  }
  if (!input.structuralSummaryStable) {
    return { classification: 'unsafe_structure_or_pac_change', rationale: 'Structure/page/annotation summary changed after metadata mutation.' };
  }
  if (input.before.pageCount !== input.after.pageCount ||
    input.before.textCharCount !== input.after.textCharCount ||
    input.before.isTagged !== input.after.isTagged) {
    return { classification: 'unsafe_structure_or_pac_change', rationale: 'Analyzer page/text/tag evidence changed after metadata mutation.' };
  }
  const harmfulAdded = input.pacFailuresAdded.filter(rule => !rule.includes('metadata') && !rule.includes('language'));
  if (harmfulAdded.length > 0) {
    return { classification: 'unsafe_structure_or_pac_change', rationale: `New non-metadata PAC failures appeared: ${harmfulAdded.join(', ')}` };
  }
  if (input.after.score >= input.before.score) {
    return { classification: 'metadata_only_safe_candidate', rationale: 'Only metadata/catalog fields changed and structural/page/text/tag/PAC evidence stayed stable.' };
  }
  return {
    classification: 'metadata_identity_stable_reanalysis_drift',
    rationale: 'Metadata/catalog fields changed with stable object identity and no new non-metadata PAC failures, but internal score dropped; this needs a transaction/follow-up proof before behavior.',
  };
}

export async function buildMetadataOnlyProofReport(options: {
  pdfRoots: string[];
  baseline: string;
  ids: string[];
  generatedAt?: string;
}): Promise<MetadataOnlyProofReport> {
  const pdfs = await collectPdfs(options.pdfRoots);
  const names = await baselineNames(options.baseline);
  const rows: MetadataOnlyProofRow[] = [];
  for (const id of options.ids) {
    const targetBasename = names.find(name => name.toLowerCase().includes(id.toLowerCase()));
    const pdfPath = findPdfForId(pdfs, id, targetBasename);
    if (!pdfPath) {
      rows.push({
        id,
        pdfPath: null,
        titleApplied: false,
        languageApplied: false,
        before: null,
        after: null,
        beforePdf: null,
        afterPdf: null,
        structuralSummaryStable: false,
        pacFailuresAdded: [],
        pacFailuresRemoved: [],
        classification: 'missing_source_pdf',
        rationale: 'No matching PDF found under configured roots.',
      });
      continue;
    }
    try {
      const input = await readFile(pdfPath);
      const beforeAnalysis = await analyzeBuffer(input, basename(pdfPath));
      const beforePdf = await inspectPdf(input, basename(pdfPath));
      const title = deriveFallbackDocumentTitle(beforeAnalysis.snapshot, basename(pdfPath));
      let buffer = input;
      const afterTitle = await setDocumentTitle(buffer, title);
      const titleApplied = !afterTitle.equals(buffer);
      buffer = afterTitle;
      const lang = (beforeAnalysis.snapshot.lang || beforeAnalysis.snapshot.metadata.language || 'en-US').trim() || 'en-US';
      const afterLang = await setDocumentLanguage(buffer, lang);
      const languageApplied = !afterLang.equals(buffer);
      buffer = afterLang;
      const afterAnalysis = await analyzeBuffer(buffer, basename(pdfPath));
      const afterPdf = await inspectPdf(buffer, basename(pdfPath));
      const before = scoreSummary(beforeAnalysis.result, beforeAnalysis.snapshot);
      const after = scoreSummary(afterAnalysis.result, afterAnalysis.snapshot);
      const pacDiff = diffRules(before.pacFailedRules, after.pacFailedRules);
      const stable = structuralKey(beforePdf) === structuralKey(afterPdf);
      const decision = classifyMetadataOnlyProof({
        titleApplied,
        languageApplied,
        before,
        after,
        structuralSummaryStable: stable,
        pacFailuresAdded: pacDiff.added,
      });
      rows.push({
        id,
        pdfPath,
        titleApplied,
        languageApplied,
        before,
        after,
        beforePdf,
        afterPdf,
        structuralSummaryStable: stable,
        pacFailuresAdded: pacDiff.added,
        pacFailuresRemoved: pacDiff.removed,
        classification: decision.classification,
        rationale: decision.rationale,
      });
    } catch (error) {
      rows.push({
        id,
        pdfPath,
        titleApplied: false,
        languageApplied: false,
        before: null,
        after: null,
        beforePdf: null,
        afterPdf: null,
        structuralSummaryStable: false,
        pacFailuresAdded: [],
        pacFailuresRemoved: [],
        classification: 'analysis_error',
        rationale: 'Analysis or metadata proof failed.',
        error: String(error),
      });
    }
  }
  return {
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    pdfRoots: options.pdfRoots,
    summary: {
      rowCount: rows.length,
      safeCandidates: rows.filter(row => row.classification === 'metadata_only_safe_candidate').map(row => row.id),
      noopRows: rows.filter(row => row.classification === 'metadata_noop').map(row => row.id),
      unsafeRows: rows.filter(row => row.classification === 'unsafe_structure_or_pac_change' || row.classification === 'analysis_error').map(row => row.id),
      missingRows: rows.filter(row => row.classification === 'missing_source_pdf').map(row => row.id),
    },
    rows,
  };
}

function renderMarkdown(report: MetadataOnlyProofReport): string {
  const lines: string[] = [];
  lines.push('# All-Input Metadata-Only Proof');
  lines.push('');
  lines.push(`- Generated: ${report.generatedAt}`);
  lines.push(`- PDF roots: ${report.pdfRoots.map(root => `\`${root}\``).join(', ')}`);
  lines.push(`- Safe candidates: ${report.summary.safeCandidates.map(id => `\`${id}\``).join(', ') || 'none'}`);
  lines.push(`- Unsafe rows: ${report.summary.unsafeRows.map(id => `\`${id}\``).join(', ') || 'none'}`);
  lines.push(`- Missing rows: ${report.summary.missingRows.map(id => `\`${id}\``).join(', ') || 'none'}`);
  lines.push('');
  lines.push('| ID | Class | Before | After | Title | Lang | Stable structural summary | PAC added | PAC removed | PDF | Rationale |');
  lines.push('| --- | --- | ---: | ---: | --- | --- | --- | --- | --- | --- | --- |');
  for (const row of report.rows) {
    lines.push([
      `\`${row.id}\``,
      `\`${row.classification}\``,
      row.before ? `${row.before.score}/${row.before.grade}` : '',
      row.after ? `${row.after.score}/${row.after.grade}` : '',
      row.titleApplied ? 'yes' : 'no',
      row.languageApplied ? 'yes' : 'no',
      row.structuralSummaryStable ? 'yes' : 'no',
      row.pacFailuresAdded.map(rule => `\`${rule}\``).join('<br>') || 'none',
      row.pacFailuresRemoved.map(rule => `\`${rule}\``).join('<br>') || 'none',
      row.pdfPath ? `\`${row.pdfPath}\`` : '',
      row.rationale.replace(/\|/g, '\\|'),
    ].join(' | ').replace(/^/, '| ').replace(/$/, ' |'));
  }
  lines.push('');
  lines.push('This proof is diagnostic-only. It does not accept metadata mutations that the orchestrator rejects; it only identifies rows where a future guarded acceptance path may be safe to test.');
  return `${lines.join('\n')}\n`;
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  const args = parseArgs(argv);
  const report = await buildMetadataOnlyProofReport({
    pdfRoots: args.pdfRoots,
    baseline: args.baseline,
    ids: args.ids,
  });
  await mkdir(args.out, { recursive: true });
  await writeFile(join(args.out, 'metadata-only-proof.json'), JSON.stringify(report, null, 2), 'utf8');
  await writeFile(join(args.out, 'metadata-only-proof.md'), renderMarkdown(report), 'utf8');
  console.log(JSON.stringify(report.summary, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}
