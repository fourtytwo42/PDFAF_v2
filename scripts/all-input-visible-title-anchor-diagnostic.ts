#!/usr/bin/env tsx
import { execFile } from 'node:child_process';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { analyzePdf } from '../src/services/pdfAnalyzer.js';
import {
  classifyStage127ZeroHeadingAnchor,
  selectVisibleHeadingAnchorCandidate,
  shouldTryVisibleHeadingAnchorRecovery,
} from '../src/services/remediation/visibleHeadingAnchor.js';
import type { AnalysisResult, DocumentSnapshot } from '../src/types.js';

const execFileAsync = promisify(execFile);

const DEFAULT_ALL_INPUT = 'Output/goal-all-input-mean-2026-05-09-r1/all-input-mean-diagnostic.json';
const DEFAULT_INPUT_ROOT = 'Output/goal-all-input-mean-2026-05-09-r1/shards';
const DEFAULT_OUT = 'Output/goal-all-input-mean-2026-05-09-r1/visible-title-anchor-gap-2026-05-10-r1';
const DEFAULT_FILES = ['0034', '0283', '3924', '0086', '0181'];

export type VisibleTitleAnchorClassification =
  | 'bookmark_visible_text_anchor_gap'
  | 'metadata_visible_text_anchor_gap'
  | 'existing_internal_anchor_candidate'
  | 'no_visible_title_evidence'
  | 'not_zero_heading_native_gap'
  | 'missing_source_pdf';

export interface VisibleTitleSeed {
  text: string;
  source: 'bookmark' | 'metadata';
  page: number | null;
  pageTextPrefix: string | null;
  score: number;
  reasons: string[];
}

export interface VisibleTitleAnchorGapRow {
  file: string;
  pdfPath: string | null;
  baselineScore: number | null;
  baselineGrade: string | null;
  currentScore: number | null;
  currentGrade: string | null;
  pdfClass: string | null;
  headingScore: number | null;
  readingOrderScore: number | null;
  linkQualityScore: number | null;
  pageCount: number | null;
  textCharCount: number | null;
  isTagged: boolean | null;
  bookmarkTitles: string[];
  metadataTitle: string | null;
  internalVisibleAnchorActive: boolean;
  internalVisibleAnchorClass: string | null;
  internalVisibleAnchorCandidate: unknown;
  seed: VisibleTitleSeed | null;
  classification: VisibleTitleAnchorClassification;
  recommendation: string;
}

interface MeanRow {
  file: string;
  score?: number;
  grade?: string;
}

interface Options {
  allInput: string;
  inputRoot: string;
  out: string;
  files: string[];
}

function parseArgs(argv: string[]): Options {
  let allInput = DEFAULT_ALL_INPUT;
  let inputRoot = DEFAULT_INPUT_ROOT;
  let out = DEFAULT_OUT;
  const files: string[] = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === '--all-input' && next) {
      allInput = next;
      i += 1;
    } else if (arg === '--input-root' && next) {
      inputRoot = next;
      i += 1;
    } else if (arg === '--out' && next) {
      out = next;
      i += 1;
    } else if ((arg === '--file' || arg === '--id') && next) {
      files.push(next);
      i += 1;
    } else if (arg === '--help' || arg === '-h') {
      console.log([
        'Usage: pnpm exec tsx scripts/all-input-visible-title-anchor-diagnostic.ts [--file <id-or-basename> ...]',
        `Defaults: --all-input ${DEFAULT_ALL_INPUT} --input-root ${DEFAULT_INPUT_ROOT} --out ${DEFAULT_OUT}`,
      ].join('\n'));
      process.exit(0);
    }
  }
  return { allInput, inputRoot, out, files: files.length > 0 ? files : DEFAULT_FILES };
}

function normalizeText(value: string | undefined | null): string {
  return (value ?? '').replace(/\s+/g, ' ').trim();
}

function normalizeKey(value: string): string {
  return normalizeText(value)
    .toLowerCase()
    .replace(/\([^)]*\)/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function words(value: string): string[] {
  return normalizeText(value).split(/\s+/).filter(Boolean);
}

function isGeneratedOrWeakTitle(value: string): boolean {
  const text = normalizeText(value);
  const count = words(text).length;
  if (text.length < 8 || text.length > 160) return true;
  if (count < 2 || count > 18) return true;
  if (/^page\s+\d+$/i.test(text)) return true;
  if (/^(table of contents|acknowledgements?|introduction|references)$/i.test(text)) return true;
  if (/^(prepared by|compiled by|submitted by|photo by)\b/i.test(text)) return true;
  if (/\b(governor|director|commissioner|secretary)\b/i.test(text) && count <= 8) return true;
  if (/^(https?:\/\/|www\.)/i.test(text)) return true;
  return false;
}

function titleShapeScore(value: string): number {
  const text = normalizeText(value);
  let score = 0;
  if (words(text).length <= 12) score += 20;
  if (text.length >= 12 && text.length <= 100) score += 20;
  const letters = text.replace(/[^A-Za-z]/g, '');
  if (letters.length >= 6) {
    const caps = letters.replace(/[^A-Z]/g, '').length;
    if (caps / letters.length >= 0.75) score += 15;
  }
  const alpha = words(text).filter(word => /[A-Za-z]/.test(word));
  const titleCase = alpha.filter(word => /^[A-Z][A-Za-z0-9'/-]*$/.test(word)).length;
  if (alpha.length > 0 && titleCase >= Math.ceil(alpha.length * 0.45)) score += 15;
  return score;
}

function findTitlePage(textPages: string[], title: string): { page: number; prefix: string } | null {
  const key = normalizeKey(title);
  if (!key) return null;
  for (let page = 0; page < Math.min(textPages.length, 12); page += 1) {
    const text = normalizeText(textPages[page] ?? '');
    const pageKey = normalizeKey(text);
    if (!pageKey) continue;
    if (pageKey.includes(key) || key.includes(pageKey.slice(0, Math.min(pageKey.length, key.length)))) {
      return { page, prefix: text.slice(0, 240) };
    }
  }
  return null;
}

export function selectExternalVisibleTitleSeed(input: {
  bookmarks: string[];
  metadataTitle?: string | null;
  textPages: string[];
}): VisibleTitleSeed | null {
  const candidates: VisibleTitleSeed[] = [];
  for (const raw of input.bookmarks) {
    const text = normalizeText(raw).replace(/\s+\(\d+\)$/g, '');
    if (isGeneratedOrWeakTitle(text)) continue;
    const match = findTitlePage(input.textPages, text);
    if (!match) continue;
    candidates.push({
      text,
      source: 'bookmark',
      page: match.page,
      pageTextPrefix: match.prefix,
      score: 50 + titleShapeScore(text) + (match.page <= 3 ? 15 : 0),
      reasons: ['outline_title', 'visible_in_pdftotext', `page:${match.page}`],
    });
  }
  const metadataTitle = normalizeText(input.metadataTitle);
  if (metadataTitle && !isGeneratedOrWeakTitle(metadataTitle)) {
    const match = findTitlePage(input.textPages, metadataTitle);
    if (match) {
      candidates.push({
        text: metadataTitle,
        source: 'metadata',
        page: match.page,
        pageTextPrefix: match.prefix,
        score: 42 + titleShapeScore(metadataTitle) + (match.page <= 3 ? 15 : 0),
        reasons: ['metadata_title', 'visible_in_pdftotext', `page:${match.page}`],
      });
    }
  }
  return candidates.sort((a, b) => b.score - a.score || (a.page ?? 99) - (b.page ?? 99) || a.text.localeCompare(b.text))[0] ?? null;
}

function scoreFor(analysis: AnalysisResult, key: string): number | null {
  const category = analysis.categories.find(item => item.key === key);
  return category?.applicable ? category.score : null;
}

export function classifyVisibleTitleAnchorGap(input: {
  analysis: AnalysisResult | null;
  snapshot: DocumentSnapshot | null;
  internalCandidate: unknown;
  internalActive: boolean;
  internalClass: string | null;
  seed: VisibleTitleSeed | null;
}): { classification: VisibleTitleAnchorClassification; recommendation: string } {
  const { analysis, snapshot, internalCandidate, internalActive, seed } = input;
  if (!analysis || !snapshot) {
    return { classification: 'missing_source_pdf', recommendation: 'Locate source PDF before selecting behavior.' };
  }
  const headingScore = scoreFor(analysis, 'heading_structure');
  const missingTree = snapshot.detectionProfile?.readingOrderSignals?.missingStructureTree === true || snapshot.structureTree === null;
  const noOwners = (snapshot.mcidTextSpans?.length ?? 0) === 0 && (snapshot.paragraphStructElems?.length ?? 0) === 0;
  if (internalActive || internalCandidate) {
    return { classification: 'existing_internal_anchor_candidate', recommendation: 'Use existing visible-heading path; do not add a new source-text fallback.' };
  }
  if (analysis.pdfClass !== 'native_untagged' || headingScore !== 0 || !missingTree || !noOwners) {
    return { classification: 'not_zero_heading_native_gap', recommendation: 'Not the native untagged zero-heading/no-owner shape targeted by this diagnostic.' };
  }
  if (!seed) {
    return { classification: 'no_visible_title_evidence', recommendation: 'Do not synthesize headings without an external visible title match.' };
  }
  return {
    classification: seed.source === 'bookmark' ? 'bookmark_visible_text_anchor_gap' : 'metadata_visible_text_anchor_gap',
    recommendation: 'Candidate for a narrow existing-mutator probe: create a structure/title heading from verified bookmark/metadata text only if final reanalysis improves heading/reading and remains PAC-safe.',
  };
}

async function listPdfFiles(root: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(path);
      } else if ((entry.isFile() || entry.isSymbolicLink()) && /\.pdf$/i.test(entry.name)) {
        out.push(path);
      }
    }
  }
  await walk(root);
  return out.sort((a, b) => a.localeCompare(b));
}

async function pdftotextPages(pdfPath: string): Promise<string[]> {
  try {
    const { stdout } = await execFileAsync('pdftotext', [pdfPath, '-'], { maxBuffer: 64 * 1024 * 1024 });
    return String(stdout).split('\f').map(page => normalizeText(page));
  } catch {
    return [];
  }
}

async function loadMeanRows(path: string): Promise<Map<string, MeanRow>> {
  const parsed = JSON.parse(await readFile(path, 'utf8')) as { lowestRows?: MeanRow[] };
  const map = new Map<string, MeanRow>();
  for (const row of parsed.lowestRows ?? []) map.set(row.file, row);
  return map;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const [pdfs, meanRows] = await Promise.all([
    listPdfFiles(options.inputRoot),
    loadMeanRows(options.allInput),
  ]);
  const rows: VisibleTitleAnchorGapRow[] = [];
  for (const id of options.files) {
    const pdfPath = pdfs.find(path => basename(path).includes(id) || path.includes(id)) ?? null;
    const meanRow = [...meanRows.values()].find(row => row.file.includes(id)) ?? null;
    if (!pdfPath) {
      rows.push({
        file: id,
        pdfPath: null,
        baselineScore: meanRow?.score ?? null,
        baselineGrade: meanRow?.grade ?? null,
        currentScore: null,
        currentGrade: null,
        pdfClass: null,
        headingScore: null,
        readingOrderScore: null,
        linkQualityScore: null,
        pageCount: null,
        textCharCount: null,
        isTagged: null,
        bookmarkTitles: [],
        metadataTitle: null,
        internalVisibleAnchorActive: false,
        internalVisibleAnchorClass: null,
        internalVisibleAnchorCandidate: null,
        seed: null,
        classification: 'missing_source_pdf',
        recommendation: 'Locate source PDF before selecting behavior.',
      });
      continue;
    }
    const [analyzed, externalPages] = await Promise.all([
      analyzePdf(pdfPath, basename(pdfPath), { bypassCache: true }),
      pdftotextPages(pdfPath),
    ]);
    const analysis = analyzed.result;
    const snapshot = analyzed.snapshot;
    const internalCandidate = selectVisibleHeadingAnchorCandidate(analysis, snapshot);
    const internalActive = shouldTryVisibleHeadingAnchorRecovery(analysis, snapshot);
    const internalClass = classifyStage127ZeroHeadingAnchor(analysis, snapshot).classification;
    const bookmarkTitles = (snapshot.bookmarks ?? []).map(bookmark => bookmark.title).filter(Boolean).slice(0, 20);
    const seed = selectExternalVisibleTitleSeed({
      bookmarks: bookmarkTitles,
      metadataTitle: snapshot.metadata.title ?? snapshot.structTitle ?? null,
      textPages: externalPages,
    });
    const classified = classifyVisibleTitleAnchorGap({
      analysis,
      snapshot,
      internalCandidate,
      internalActive,
      internalClass,
      seed,
    });
    rows.push({
      file: basename(pdfPath),
      pdfPath: resolve(pdfPath),
      baselineScore: meanRow?.score ?? null,
      baselineGrade: meanRow?.grade ?? null,
      currentScore: analysis.score,
      currentGrade: analysis.grade,
      pdfClass: analysis.pdfClass,
      headingScore: scoreFor(analysis, 'heading_structure'),
      readingOrderScore: scoreFor(analysis, 'reading_order'),
      linkQualityScore: scoreFor(analysis, 'link_quality'),
      pageCount: snapshot.pageCount,
      textCharCount: snapshot.textCharCount,
      isTagged: snapshot.isTagged,
      bookmarkTitles,
      metadataTitle: snapshot.metadata.title ?? snapshot.structTitle ?? null,
      internalVisibleAnchorActive: internalActive,
      internalVisibleAnchorClass: internalClass,
      internalVisibleAnchorCandidate: internalCandidate,
      seed,
      classification: classified.classification,
      recommendation: classified.recommendation,
    });
  }

  const summary = rows.reduce<Record<string, number>>((acc, row) => {
    acc[row.classification] = (acc[row.classification] ?? 0) + 1;
    return acc;
  }, {});
  const report = {
    generatedAt: new Date().toISOString(),
    allInput: resolve(options.allInput),
    inputRoot: resolve(options.inputRoot),
    rows,
    summary,
    selectedCandidates: rows
      .filter(row => row.classification === 'bookmark_visible_text_anchor_gap' || row.classification === 'metadata_visible_text_anchor_gap')
      .map(row => row.file),
  };
  await mkdir(options.out, { recursive: true });
  await writeFile(join(options.out, 'visible-title-anchor-gap.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  const lines = ['# Visible Title Anchor Gap Diagnostic', ''];
  lines.push('| File | Score | Class | Seed | Recommendation |');
  lines.push('|---|---:|---|---|---|');
  for (const row of rows) {
    const seed = row.seed ? `${row.seed.source}: ${row.seed.text} (page ${row.seed.page})` : '';
    lines.push(`| ${row.file} | ${row.currentScore ?? row.baselineScore ?? ''} | ${row.classification} | ${seed.replace(/\|/g, '\\|')} | ${row.recommendation.replace(/\|/g, '\\|')} |`);
  }
  lines.push('', `Generated: ${report.generatedAt}`);
  await writeFile(join(options.out, 'visible-title-anchor-gap.md'), `${lines.join('\n')}\n`, 'utf8');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}
