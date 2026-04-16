#!/usr/bin/env tsx
/**
 * Benchmark `analyzePdf` on local PDFs (3 cold runs per file).
 *
 * Uses `bypassCache: true` so each iteration does full pdfjs + Python work (content-hash cache
 * would otherwise make runs 2–3 artificially fast on identical bytes).
 *
 * Compare before/after a change on the same machine:
 *   pnpm exec tsx scripts/benchmark-analyze-inputs.ts Input/corpus_from_pdfaf_v1
 *   # note per-file mean `analysisDurationMs` and the global mean
 *
 * Re-run after edits; expect roughly stable means (noise ~5–10%).
 */
import { readdir, stat } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { analyzePdf } from '../src/services/pdfAnalyzer.js';

const RUNS = 3;

async function collectPdfs(root: string): Promise<string[]> {
  const out: string[] = [];
  try {
    const st = await stat(root);
    if (st.isFile() && extname(root).toLowerCase() === '.pdf') {
      return [root];
    }
    if (!st.isDirectory()) return [];
  } catch {
    return [];
  }
  async function walk(dir: string): Promise<void> {
    let entries: Awaited<ReturnType<typeof readdir>>;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = join(dir, e.name);
      if (e.isDirectory()) await walk(full);
      else if (e.isFile() && extname(e.name).toLowerCase() === '.pdf') out.push(full);
    }
  }
  await walk(root);
  return out.sort();
}

function mean(nums: number[]): number {
  if (nums.length === 0) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

async function main(): Promise<void> {
  const roots = process.argv.slice(2).length ? process.argv.slice(2) : [join(process.cwd(), 'Input')];
  const files: string[] = [];
  for (const r of roots) {
    files.push(...(await collectPdfs(r)));
  }
  const unique = [...new Set(files)];
  if (unique.length === 0) {
    console.error('No PDFs found under:', roots.join(', '));
    process.exit(1);
  }

  console.log(`Files: ${unique.length}  runs/file: ${RUNS}  bypassCache: true\n`);

  const allMs: number[] = [];
  for (const pdfPath of unique) {
    const runs: number[] = [];
    const walls: number[] = [];
    for (let i = 0; i < RUNS; i++) {
      const w0 = performance.now();
      const { result } = await analyzePdf(pdfPath, pdfPath.split('/').pop() ?? 'doc.pdf', {
        bypassCache: true,
      });
      walls.push(performance.now() - w0);
      runs.push(result.analysisDurationMs);
      allMs.push(result.analysisDurationMs);
    }
    console.log(
      `${pdfPath}\n  analysisDurationMs mean=${mean(runs).toFixed(0)}  wallMs mean=${mean(walls).toFixed(0)}`,
    );
  }
  console.log(`\nGlobal analysisDurationMs mean=${mean(allMs).toFixed(0)} (n=${allMs.length})`);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
