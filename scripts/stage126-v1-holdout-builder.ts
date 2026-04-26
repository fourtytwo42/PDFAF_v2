#!/usr/bin/env tsx
import { copyFile, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

type HoldoutBucket =
  | 'figure_alt'
  | 'table_link_annotation'
  | 'font_text'
  | 'structure_heading_reading_order'
  | 'long_mixed'
  | 'manual_scanned'
  | 'control';

interface RawCandidate {
  publicationId?: unknown;
  publicationTitle?: unknown;
  title?: unknown;
  localCachePath?: unknown;
  path?: unknown;
  sourcePath?: unknown;
  overallScore?: unknown;
  score?: unknown;
  v1Score?: unknown;
  grade?: unknown;
  v1Grade?: unknown;
  pageCount?: unknown;
  pages?: unknown;
  isScanned?: unknown;
  scanned?: unknown;
  manualOnlyFailureModeCount?: unknown;
  blockerFamilyCount?: unknown;
  blockingFindingCount?: unknown;
  autoRunnableOpportunityCount?: unknown;
  topBlockingResidualFamilyIds?: unknown;
  blockingFindingKeys?: unknown;
  autoRunnableOpportunityKeys?: unknown;
  manualOnlyFailureModeKeys?: unknown;
  heuristicReasons?: unknown;
  lowCategories?: unknown;
  families?: unknown;
  cohortLabel?: unknown;
  dominantSelectionFamily?: unknown;
  sourceManifest?: unknown;
  reportPath?: unknown;
}

export interface HoldoutCandidate {
  publicationId: string;
  title: string;
  sourcePath: string;
  sourceManifest: string;
  v1Score: number | null;
  v1Grade: string | null;
  pageCount: number | null;
  scanned: boolean;
  manualOnlyFailureModeCount: number;
  blockerFamilyCount: number | null;
  blockingFindingCount: number | null;
  families: string[];
  findingKeys: string[];
  opportunityKeys: string[];
  lowCategories: Record<string, number>;
  selectionSignals: string[];
  fileSizeBytes: number | null;
}

export interface HoldoutSelectionRow {
  bucket: HoldoutBucket;
  candidate: HoldoutCandidate;
  localFile: string;
  selectionNote: string;
}

interface BuilderArgs {
  pdfafRoot: string;
  outDir: string;
  maxRows: number;
  maxFileBytes: number;
  dryRun: boolean;
}

const DEFAULT_OUT = 'Input/from_sibling_pdfaf_v1_holdout_3';
const DEFAULT_PDFAF_ROOT = '/home/hendo420/pdfaf';
const MAX_PER_BUCKET: Record<HoldoutBucket, number> = {
  figure_alt: 5,
  table_link_annotation: 5,
  font_text: 5,
  structure_heading_reading_order: 5,
  long_mixed: 5,
  manual_scanned: 3,
  control: 2,
};

const BUCKET_SELECTION_ORDER: HoldoutBucket[] = [
  'manual_scanned',
  'control',
  'long_mixed',
  'figure_alt',
  'table_link_annotation',
  'font_text',
  'structure_heading_reading_order',
];

const SOURCE_MANIFESTS = [
  'remediation-priority-candidates.json',
  'all-remaining-automated.json',
  'remediation-benchmark-candidates.json',
  'remediation-remaining-all-candidates.json',
  'manual-scanned-deferred.json',
  'font-led-deterministic.json',
  'stage5-font-wave.json',
  'stage3-figure-wave.json',
  'stage4-structure-wave.json',
  'stage6-long-report-wave.json',
  'sub79-tail-canary.json',
  'remediation-next-best-batch-candidates.json',
  'remediation-next-relaxed-batch-candidates.json',
];

const EXISTING_MANIFESTS = [
  'Input/experiment-corpus/manifest.json',
  'Input/from_sibling_pdfaf_v1_edge_mix/manifest.json',
  'Input/from_sibling_pdfaf_v1_edge_mix_2/manifest.json',
  'Input/from_sibling_pdfaf_v1_evolve/manifest.json',
  'Input/from_sibling_pdfaf_v1_evolve_font/manifest.json',
];

const RECENT_PROTECTED_DEBUG_IDS = new Set([
  '3775',
  '4076',
  '4108',
  '4176',
  '4214',
  '4470',
  '4516',
  '4683',
]);

function usage(): string {
  return `Usage: pnpm exec tsx scripts/stage126-v1-holdout-builder.ts [options]

Options:
  --pdfaf-root <dir>       Sibling v1 repo root (default: ${DEFAULT_PDFAF_ROOT})
  --out <dir>              Holdout corpus output dir (default: ${DEFAULT_OUT})
  --max-rows <n>           Maximum selected rows (default: 30)
  --max-file-mb <n>        Skip PDFs larger than this except one long stress file (default: 75)
  --dry-run                Select and write no files
  --help                   Show this help`;
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map(asString).filter(Boolean)
    : [];
}

function normalizeId(value: unknown): string {
  const raw = String(value ?? '').trim();
  const match = raw.match(/\d{3,5}/);
  return match?.[0] ?? raw;
}

function slug(input: string, fallback: string): string {
  const value = (input || fallback)
    .toLowerCase()
    .replace(/\.pdf$/i, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72);
  return value || fallback;
}

function categoryFromScore(score: number | null): string | null {
  if (score == null) return null;
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

function parseLowCategories(value: unknown): Record<string, number> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out: Record<string, number> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    const num = asNumber(raw);
    if (num != null) out[key] = num;
  }
  return out;
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort();
}

function normalizeProblemMix(candidate: HoldoutCandidate, bucket: HoldoutBucket): string[] {
  const values = new Set<string>([bucket]);
  const haystack = [
    ...candidate.families,
    ...candidate.findingKeys,
    ...candidate.opportunityKeys,
    ...Object.keys(candidate.lowCategories),
    ...candidate.selectionSignals,
  ].join(' ').toLowerCase();
  if (/figure|alt|image/.test(haystack)) values.add('figure_alt');
  if (/table/.test(haystack)) values.add('table');
  if (/link|annotation|annot/.test(haystack)) values.add('link_annotation');
  if (/font|unicode|text_extractability|text/.test(haystack)) values.add('font');
  if (/heading|logical|structure|reading|bookmark/.test(haystack)) values.add('heading_structure');
  if ((candidate.pageCount ?? 0) >= 30) values.add('long_report');
  if (candidate.scanned || candidate.manualOnlyFailureModeCount > 0 || bucket === 'manual_scanned') values.add('manual_or_scanned');
  if (bucket === 'control') values.add('holdout_control');
  return [...values].sort();
}

function candidateFromRaw(raw: RawCandidate, sourceManifest: string): HoldoutCandidate | null {
  const publicationId = normalizeId(raw.publicationId);
  const sourcePath = asString(raw.localCachePath) || asString(raw.path) || asString(raw.sourcePath);
  if (!publicationId || !sourcePath) return null;
  const score = asNumber(raw.overallScore) ?? asNumber(raw.score) ?? asNumber(raw.v1Score);
  const pageCount = asNumber(raw.pageCount) ?? asNumber(raw.pages);
  const families = unique([
    ...asStringArray(raw.topBlockingResidualFamilyIds),
    ...asStringArray(raw.families),
    asString(raw.cohortLabel),
    asString(raw.dominantSelectionFamily),
  ]);
  const findingKeys = unique([
    ...asStringArray(raw.blockingFindingKeys),
    ...asStringArray(raw.manualOnlyFailureModeKeys),
  ]);
  const opportunityKeys = unique(asStringArray(raw.autoRunnableOpportunityKeys));
  const heuristicReasons = asStringArray(raw.heuristicReasons);
  return {
    publicationId,
    title: asString(raw.publicationTitle) || asString(raw.title) || publicationId,
    sourcePath,
    sourceManifest: asString(raw.sourceManifest) || sourceManifest,
    v1Score: score,
    v1Grade: asString(raw.grade) || asString(raw.v1Grade) || categoryFromScore(score),
    pageCount,
    scanned: raw.isScanned === true || raw.scanned === true,
    manualOnlyFailureModeCount: asNumber(raw.manualOnlyFailureModeCount) ?? 0,
    blockerFamilyCount: asNumber(raw.blockerFamilyCount),
    blockingFindingCount: asNumber(raw.blockingFindingCount),
    families,
    findingKeys,
    opportunityKeys,
    lowCategories: parseLowCategories(raw.lowCategories),
    selectionSignals: unique(heuristicReasons),
    fileSizeBytes: null,
  };
}

async function loadJson(path: string): Promise<unknown | null> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as unknown;
  } catch {
    return null;
  }
}

function arrayFromManifest(raw: unknown): RawCandidate[] {
  if (Array.isArray(raw)) return raw as RawCandidate[];
  if (!raw || typeof raw !== 'object') return [];
  const obj = raw as Record<string, unknown>;
  for (const key of ['candidates', 'selection', 'rows', 'outcomes']) {
    if (Array.isArray(obj[key])) return obj[key] as RawCandidate[];
  }
  return [];
}

async function loadCandidates(pdfafRoot: string): Promise<HoldoutCandidate[]> {
  const byId = new Map<string, HoldoutCandidate>();
  const add = async (path: string, label: string): Promise<void> => {
    const raw = await loadJson(path);
    for (const row of arrayFromManifest(raw)) {
      const candidate = candidateFromRaw(row, label);
      if (!candidate || byId.has(candidate.publicationId)) continue;
      if (!existsSync(candidate.sourcePath)) continue;
      const size = await stat(candidate.sourcePath).then(s => s.size).catch(() => null);
      byId.set(candidate.publicationId, { ...candidate, fileSizeBytes: size });
    }
  };

  await add('Input/from_sibling_pdfaf_edgecase_corpus/selection.json', 'from_sibling_pdfaf_edgecase_corpus');
  const manifestRoot = join(pdfafRoot, 'ICJIA-PDFs', 'manifests');
  for (const name of SOURCE_MANIFESTS) {
    await add(join(manifestRoot, name), name);
  }
  return [...byId.values()];
}

function collectIds(value: unknown, ids: Set<string>): void {
  if (typeof value === 'string' || typeof value === 'number') {
    const id = normalizeId(value);
    if (/^\d{3,5}$/.test(id)) ids.add(id);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectIds(item, ids);
    return;
  }
  if (value && typeof value === 'object') {
    for (const item of Object.values(value as Record<string, unknown>)) collectIds(item, ids);
  }
}

async function loadExcludedIds(): Promise<Set<string>> {
  const ids = new Set<string>(RECENT_PROTECTED_DEBUG_IDS);
  for (const path of EXISTING_MANIFESTS) {
    const raw = await loadJson(path);
    collectIds(raw, ids);
  }
  return ids;
}

function candidateText(candidate: HoldoutCandidate): string {
  return [
    candidate.title,
    candidate.sourceManifest,
    ...candidate.families,
    ...candidate.findingKeys,
    ...candidate.opportunityKeys,
    ...Object.keys(candidate.lowCategories),
    ...candidate.selectionSignals,
  ].join(' ').toLowerCase();
}

function matchesBucket(candidate: HoldoutCandidate, bucket: HoldoutBucket): boolean {
  const text = candidateText(candidate);
  const manualOrScanned = candidate.scanned || candidate.manualOnlyFailureModeCount > 0 || /manual|scanned|ocr/.test(text);
  if (manualOrScanned && bucket !== 'manual_scanned') return false;
  switch (bucket) {
    case 'figure_alt':
      return /figure|image|alt/.test(text) || (candidate.lowCategories.alt_text ?? 100) < 70;
    case 'table_link_annotation':
      return /table|link|annotation|annot/.test(text) || (candidate.lowCategories.table_markup ?? 100) < 70 || (candidate.lowCategories.link_quality ?? 100) < 70;
    case 'font_text':
      return /font|unicode|text_extractability|text/.test(text) || (candidate.lowCategories.text_extractability ?? 100) < 70;
    case 'structure_heading_reading_order':
      return /logical|structure|heading|reading|bookmark/.test(text) || (candidate.lowCategories.heading_structure ?? 100) < 70 || (candidate.lowCategories.reading_order ?? 100) < 70;
    case 'long_mixed':
      return (candidate.pageCount ?? 0) >= 30 && new Set([
        matchesBucket(candidate, 'figure_alt') ? 'figure' : '',
        matchesBucket(candidate, 'table_link_annotation') ? 'table' : '',
        matchesBucket(candidate, 'font_text') ? 'font' : '',
        matchesBucket(candidate, 'structure_heading_reading_order') ? 'structure' : '',
      ].filter(Boolean)).size >= 2;
    case 'manual_scanned':
      return manualOrScanned;
    case 'control':
      return (candidate.v1Score ?? 0) >= 80 || candidate.v1Grade === 'A' || candidate.v1Grade === 'B';
  }
}

function issueScore(candidate: HoldoutCandidate): number {
  const score = candidate.v1Score ?? 100;
  const sizePenalty = Math.max(0, ((candidate.fileSizeBytes ?? 0) / 1_000_000) - 20) * 0.25;
  const pagePenalty = Math.max(0, (candidate.pageCount ?? 0) - 120) * 0.05;
  return score + sizePenalty + pagePenalty;
}

function sortForBucket(bucket: HoldoutBucket): (a: HoldoutCandidate, b: HoldoutCandidate) => number {
  return (a, b) => {
    if (bucket === 'control') {
      const aScore = a.v1Score ?? 0;
      const bScore = b.v1Score ?? 0;
      if (aScore !== bScore) return bScore - aScore;
      return (a.pageCount ?? 9999) - (b.pageCount ?? 9999);
    }
    const aIssue = issueScore(a);
    const bIssue = issueScore(b);
    if (aIssue !== bIssue) return aIssue - bIssue;
    return (a.pageCount ?? 9999) - (b.pageCount ?? 9999);
  };
}

export async function selectHoldoutRows(input: {
  candidates: HoldoutCandidate[];
  excludedIds: Set<string>;
  maxRows?: number;
  maxFileBytes?: number;
}): Promise<HoldoutSelectionRow[]> {
  const maxRows = input.maxRows ?? 30;
  const maxFileBytes = input.maxFileBytes ?? 75 * 1024 * 1024;
  const selected: HoldoutSelectionRow[] = [];
  const selectedIds = new Set<string>();
  let longStressIncluded = false;

  const eligible = input.candidates.filter(candidate => {
    if (input.excludedIds.has(candidate.publicationId)) return false;
    if (!existsSync(candidate.sourcePath)) return false;
    if ((candidate.fileSizeBytes ?? 0) <= maxFileBytes) return true;
    return (candidate.pageCount ?? 0) >= 100 && !longStressIncluded;
  });

  for (const bucket of BUCKET_SELECTION_ORDER) {
    const rows = eligible
      .filter(candidate => !selectedIds.has(candidate.publicationId))
      .filter(candidate => matchesBucket(candidate, bucket))
      .sort(sortForBucket(bucket));
    for (const candidate of rows) {
      if (selected.length >= maxRows) break;
      if (selected.filter(row => row.bucket === bucket).length >= MAX_PER_BUCKET[bucket]) break;
      if ((candidate.fileSizeBytes ?? 0) > maxFileBytes) {
        if (longStressIncluded) continue;
        longStressIncluded = true;
      }
      selectedIds.add(candidate.publicationId);
      selected.push({
        bucket,
        candidate,
        localFile: `${bucket}/${candidate.publicationId}-${slug(candidate.title, basename(candidate.sourcePath))}.pdf`,
        selectionNote: `${bucket} quota; source=${candidate.sourceManifest}; v1=${candidate.v1Score ?? 'n/a'}/${candidate.v1Grade ?? 'n/a'}; pages=${candidate.pageCount ?? 'n/a'}`,
      });
    }
  }

  if (selected.length < maxRows) {
    const fill = eligible
      .filter(candidate => !selectedIds.has(candidate.publicationId))
      .sort(sortForBucket('long_mixed'));
    for (const candidate of fill) {
      if (selected.length >= maxRows) break;
      selectedIds.add(candidate.publicationId);
      selected.push({
        bucket: 'long_mixed',
        candidate,
        localFile: `long_mixed/${candidate.publicationId}-${slug(candidate.title, basename(candidate.sourcePath))}.pdf`,
        selectionNote: `quota fill; source=${candidate.sourceManifest}; v1=${candidate.v1Score ?? 'n/a'}/${candidate.v1Grade ?? 'n/a'}; pages=${candidate.pageCount ?? 'n/a'}`,
      });
    }
  }

  return selected.slice(0, maxRows);
}

function manifestJson(rows: HoldoutSelectionRow[], outDir: string): unknown {
  return {
    name: 'from_sibling_pdfaf_v1_holdout_3',
    createdAt: new Date().toISOString().slice(0, 10),
    sourceRepository: DEFAULT_PDFAF_ROOT,
    sourcePolicy: 'Original cached v1 PDFs selected from sibling v1 manifests for v2 generalization validation. v1 scores are selection context only.',
    purpose: 'Stage 126 third v1-derived holdout batch for external efficacy and repeatability measurement.',
    selectionNotes: [
      'This is a validation corpus, not a protected baseline replacement.',
      'PDF files are local test inputs and ignored by git.',
      'Rows exclude legacy corpus, prior v1 edge-mix/evolve manifests, and recent protected-debug targets where publication ids were discoverable.',
    ],
    rows: rows.map(row => ({
      publicationId: row.candidate.publicationId,
      title: row.candidate.title,
      localFile: row.localFile,
      sourcePath: row.candidate.sourcePath,
      sourceManifest: row.candidate.sourceManifest,
      v1Score: row.candidate.v1Score,
      v1Grade: row.candidate.v1Grade,
      pageCount: row.candidate.pageCount,
      problemMix: normalizeProblemMix(row.candidate, row.bucket),
      selectionNote: row.selectionNote,
    })),
  };
}

function selectionJson(rows: HoldoutSelectionRow[], excludedCount: number, candidateCount: number): unknown {
  const byBucket: Record<string, number> = {};
  for (const row of rows) byBucket[row.bucket] = (byBucket[row.bucket] ?? 0) + 1;
  return {
    summary: {
      generatedAt: new Date().toISOString(),
      stage: 'Stage 126 v1 Holdout Generalization Batch',
      selectedCount: rows.length,
      candidateCount,
      excludedIdCount: excludedCount,
      byBucket,
      quotas: MAX_PER_BUCKET,
    },
    selection: rows.map(row => ({
      bucket: row.bucket,
      publicationId: row.candidate.publicationId,
      title: row.candidate.title,
      path: row.candidate.sourcePath,
      copiedTo: row.localFile,
      score: row.candidate.v1Score,
      grade: row.candidate.v1Grade,
      pages: row.candidate.pageCount,
      scanned: row.candidate.scanned,
      manualOnlyFailureModeCount: row.candidate.manualOnlyFailureModeCount,
      sourceManifest: row.candidate.sourceManifest,
      families: row.candidate.families,
      blockingFindingKeys: row.candidate.findingKeys,
      lowCategories: row.candidate.lowCategories,
      selectionNote: row.selectionNote,
    })),
  };
}

function readme(rows: HoldoutSelectionRow[]): string {
  const lines = [
    '# Stage 126 v1 Holdout 3',
    '',
    'Third v1-derived holdout batch for PDFAF v2 generalization validation.',
    '',
    'The PDFs are original cached v1 source PDFs copied locally from the sibling `/home/hendo420/pdfaf` repo. They are ignored by git. `manifest.json` and `selection.json` are safe metadata and do not contain PDF payloads.',
    '',
    'Run:',
    '',
    '```bash',
    'pnpm run benchmark:edge-mix -- --manifest Input/from_sibling_pdfaf_v1_holdout_3/manifest.json --out Output/from_sibling_pdfaf_v1_holdout_3/run-stage126-holdout3-baseline-2026-04-26-r1',
    '```',
    '',
    'Selected rows:',
    '',
    '| Bucket | ID | v1 | Pages | File |',
    '| --- | ---: | ---: | ---: | --- |',
  ];
  for (const row of rows) {
    lines.push(`| ${row.bucket} | ${row.candidate.publicationId} | ${row.candidate.v1Score ?? 'n/a'}/${row.candidate.v1Grade ?? 'n/a'} | ${row.candidate.pageCount ?? 'n/a'} | ${row.localFile} |`);
  }
  lines.push('');
  return lines.join('\n');
}

async function cleanPdfFiles(outDir: string): Promise<void> {
  if (!existsSync(outDir)) return;
  const walk = async (dir: string): Promise<void> => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (entry.name.toLowerCase().endsWith('.pdf')) await rm(path, { force: true });
    }
  };
  await walk(outDir);
}

async function writeHoldout(rows: HoldoutSelectionRow[], outDir: string, args: BuilderArgs, candidateCount: number, excludedCount: number): Promise<void> {
  if (args.dryRun) return;
  await mkdir(outDir, { recursive: true });
  await cleanPdfFiles(outDir);
  await writeFile(join(outDir, '.gitignore'), '*.pdf\n', 'utf8');
  for (const row of rows) {
    const dest = join(outDir, row.localFile);
    await mkdir(dirname(dest), { recursive: true });
    await copyFile(row.candidate.sourcePath, dest);
  }
  await writeFile(join(outDir, 'manifest.json'), JSON.stringify(manifestJson(rows, outDir), null, 2) + '\n', 'utf8');
  await writeFile(join(outDir, 'selection.json'), JSON.stringify(selectionJson(rows, excludedCount, candidateCount), null, 2) + '\n', 'utf8');
  await writeFile(join(outDir, 'README.md'), readme(rows), 'utf8');
}

function parseArgs(argv: string[]): BuilderArgs {
  argv = argv.filter((arg, index) => !(index === 0 && arg === '--'));
  const args: BuilderArgs = {
    pdfafRoot: DEFAULT_PDFAF_ROOT,
    outDir: DEFAULT_OUT,
    maxRows: 30,
    maxFileBytes: 75 * 1024 * 1024,
    dryRun: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--pdfaf-root') args.pdfafRoot = argv[++i] ?? args.pdfafRoot;
    else if (arg === '--out') args.outDir = argv[++i] ?? args.outDir;
    else if (arg === '--max-rows') args.maxRows = Number(argv[++i] ?? args.maxRows);
    else if (arg === '--max-file-mb') args.maxFileBytes = Number(argv[++i] ?? 75) * 1024 * 1024;
    else if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--help' || arg === '-h') {
      console.log(usage());
      process.exit(0);
    } else {
      throw new Error(`Unknown argument ${arg}.\n${usage()}`);
    }
  }
  return { ...args, pdfafRoot: resolve(args.pdfafRoot), outDir: resolve(args.outDir) };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const candidates = await loadCandidates(args.pdfafRoot);
  const excludedIds = await loadExcludedIds();
  const rows = await selectHoldoutRows({
    candidates,
    excludedIds,
    maxRows: args.maxRows,
    maxFileBytes: args.maxFileBytes,
  });
  if (rows.length < args.maxRows) {
    throw new Error(`Only selected ${rows.length}/${args.maxRows} holdout rows.`);
  }
  await writeHoldout(rows, args.outDir, args, candidates.length, excludedIds.size);
  const counts = rows.reduce<Record<string, number>>((acc, row) => {
    acc[row.bucket] = (acc[row.bucket] ?? 0) + 1;
    return acc;
  }, {});
  console.log(`${args.dryRun ? 'Selected' : 'Wrote'} ${rows.length} Stage 126 holdout rows to ${args.outDir}`);
  console.log(JSON.stringify(counts));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
