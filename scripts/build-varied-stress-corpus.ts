/**
 * Build `Input/corpus_stress_varied_blockers/` (~20 PDFs) from pdfaf ICJIA manifests with
 * **diverse pdfua blockerSignature** (fonts, figures, logical structure, nested alt, tables,
 * links, headings, annotations, untagged images) — excludes `corpus_stress_mixed_structure` IDs.
 *
 * Usage (from repo root):
 *   pnpm exec tsx scripts/build-varied-stress-corpus.ts
 *
 * Requires sibling clone: `../pdfaf` with artifacts under `ICJIA-PDFs/artifacts/...`.
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');

/** Publication IDs already in `Input/corpus_stress_mixed_structure/` (first stress batch). */
const BATCH1_IDS = new Set(
  `4731,4615,4501,3758,4033,4030,3513,3834,4118,4762,4490,4003,4099,3635,3641,4043,3483,3460,4051,4531`
    .split(',')
    .map(s => s.trim()),
);

type ManifestCandidate = {
  publicationId: string | number;
  overallScore: number;
  pageCount: number;
  localCachePath: string;
  blockerSignature?: string;
  blockingFindingKeys?: string[];
  publicationTitle?: string;
};

type ManifestJson = { candidates: ManifestCandidate[] };

type Enriched = ManifestCandidate & { manifest: string };

function sigOf(c: ManifestCandidate): string {
  if (c.blockerSignature?.trim()) return c.blockerSignature.trim();
  return [...(c.blockingFindingKeys ?? [])].sort().join(' + ');
}

function loadManifest(absPath: string, label: string): Enriched[] {
  const raw = readFileSync(absPath, 'utf8');
  const j = JSON.parse(raw) as ManifestJson;
  return (j.candidates ?? []).map(c => ({ ...c, manifest: label }));
}

function main(): void {
  const pdfafRoot = join(REPO_ROOT, '..', 'pdfaf');
  const manifestsDir = join(pdfafRoot, 'ICJIA-PDFs', 'manifests');

  const sources: Array<[string, string]> = [
    [join(manifestsDir, 'mixed-structure-figure-plus.json'), 'mixed-structure-figure-plus'],
    [join(manifestsDir, 'font-led-deterministic.json'), 'font-led-deterministic'],
    [join(manifestsDir, 'sub79-tail-canary.json'), 'sub79-tail-canary'],
    [join(manifestsDir, 'remediated-pdf-grading-sub80-rerun-v3.json'), 'remediated-pdf-grading-sub80-rerun-v3'],
  ];

  const seenIds = new Set<string>();
  const pool: Enriched[] = [];

  for (const [path, label] of sources) {
    if (!existsSync(path)) {
      console.error('Missing manifest:', path);
      process.exit(1);
    }
    const rows = loadManifest(path, label);
    for (const c of rows) {
      const id = String(c.publicationId);
      if (seenIds.has(id)) continue;
      seenIds.add(id);
      pool.push(c);
    }
  }

  const sigFreq = new Map<string, number>();
  for (const c of pool) {
    const s = sigOf(c);
    sigFreq.set(s, (sigFreq.get(s) ?? 0) + 1);
  }

  pool.sort((a, b) => {
    const sa = sigOf(a);
    const sb = sigOf(b);
    const fa = sigFreq.get(sa) ?? 0;
    const fb = sigFreq.get(sb) ?? 0;
    if (fa !== fb) return fa - fb;
    if (a.overallScore !== b.overallScore) return a.overallScore - b.overallScore;
    return b.pageCount - a.pageCount;
  });

  /** During the distinct-signature pass, avoid one pdfaf lane dominating (sub80 has many unique long signatures). */
  const MAX_PER_MANIFEST_PHASE1 = 5;
  const manifestCount = new Map<string, number>();

  const picked: Enriched[] = [];
  const pickedIds = new Set<string>();
  const representedSig = new Set<string>();

  for (const c of pool) {
    if (picked.length >= 20) break;
    const id = String(c.publicationId);
    if (BATCH1_IDS.has(id)) continue;
    if (!existsSync(c.localCachePath)) continue;
    if (pickedIds.has(id)) continue;
    const s = sigOf(c);
    if (representedSig.has(s)) continue;
    const m = c.manifest;
    if ((manifestCount.get(m) ?? 0) >= MAX_PER_MANIFEST_PHASE1) continue;
    representedSig.add(s);
    pickedIds.add(id);
    manifestCount.set(m, (manifestCount.get(m) ?? 0) + 1);
    picked.push(c);
  }

  for (const c of pool) {
    if (picked.length >= 20) break;
    const id = String(c.publicationId);
    if (BATCH1_IDS.has(id)) continue;
    if (!existsSync(c.localCachePath)) continue;
    if (pickedIds.has(id)) continue;
    pickedIds.add(id);
    picked.push(c);
  }

  if (picked.length < 20) {
    console.error(`Only found ${picked.length} copyable PDFs (need 20). Check ../pdfaf artifacts.`);
    process.exit(1);
  }

  const outDir = join(REPO_ROOT, 'Input', 'corpus_stress_varied_blockers');
  mkdirSync(outDir, { recursive: true });
  for (const name of readdirSync(outDir)) {
    if (name.toLowerCase().endsWith('.pdf')) unlinkSync(join(outDir, name));
  }

  const lines: string[] = [
    'Corpus: 20 ICJIA stress PDFs selected for **blocker diversity** (pdfaf v1 lanes)',
    '',
    'Selection:',
    '- Merge candidates from (in order): mixed-structure-figure-plus, font-led-deterministic, sub79-tail-canary, remediated-pdf-grading-sub80-rerun-v3',
    '- Dedupe by publicationId; exclude IDs in corpus_stress_mixed_structure (batch 1)',
    `- Phase 1: prefer **distinct blockerSignature** (rare signatures first), at most ${MAX_PER_MANIFEST_PHASE1} picks per manifest so one lane does not crowd out others`,
    '- Phase 2: fill to 20 with any remaining copyable rows in pool order',
    '',
    'Per file:',
  ];

  let i = 0;
  for (const c of picked) {
    i++;
    const id = String(c.publicationId);
    const base = basename(c.localCachePath);
    const dest = join(
      outDir,
      `${String(i).padStart(2, '0')}_id${id}_score${Math.round(c.overallScore)}_p${c.pageCount}_${base}`,
    );
    copyFileSync(c.localCachePath, dest);
    lines.push(
      `${basename(dest)}  ←  ${c.manifest}  |  ${sigOf(c)}`,
    );
  }

  writeFileSync(join(outDir, 'CORPUS_MANIFEST.txt'), lines.join('\n') + '\n', 'utf8');
  console.log(`Wrote ${picked.length} PDFs + CORPUS_MANIFEST.txt → ${outDir}`);
}

main();
