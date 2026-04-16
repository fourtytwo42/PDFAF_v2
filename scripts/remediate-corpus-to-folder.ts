/**
 * Remediate every PDF in an input directory and write outputs to a folder for manual inspection.
 *
 * Usage:
 *   pnpm exec tsx scripts/remediate-corpus-to-folder.ts [inputDir] [outputDir]
 *
 * Defaults:
 *   Input/corpus_stress_mixed_structure → Output/corpus_stress_remediated
 */
import 'dotenv/config';
import Database from 'better-sqlite3';
import { mkdir, readdir, readFile, writeFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { initSchema } from '../src/db/schema.js';
import { createPlaybookStore } from '../src/services/learning/playbookStore.js';
import { createToolOutcomeStore } from '../src/services/learning/toolOutcomes.js';

async function main(): Promise<void> {
  const inDir = process.argv[2] ?? join(process.cwd(), 'Input', 'corpus_stress_mixed_structure');
  const outDir = process.argv[3] ?? join(process.cwd(), 'Output', 'corpus_stress_remediated');

  const files = (await readdir(inDir))
    .filter(f => f.toLowerCase().endsWith('.pdf'))
    .sort((a, b) => a.localeCompare(b));

  if (files.length === 0) {
    console.error('No PDFs in', inDir);
    process.exit(1);
  }

  await mkdir(outDir, { recursive: true });

  const { analyzePdf } = await import('../src/services/pdfAnalyzer.js');
  const { remediatePdf } = await import('../src/services/remediation/orchestrator.js');

  let ok = 0;
  let failed = 0;

  for (const name of files) {
    const inputPath = join(inDir, name);
    const destPath = join(outDir, name);
    try {
      const buf = await readFile(inputPath);
      const tmpIn = join(tmpdir(), `pdfaf-corpus-in-${randomUUID()}.pdf`);
      await writeFile(tmpIn, buf);
      const analyzed = await analyzePdf(tmpIn, name, { bypassCache: true });
      await unlink(tmpIn).catch(() => {});

      const memDb = new Database(':memory:');
      initSchema(memDb);
      const out = await remediatePdf(buf, name, analyzed.result, analyzed.snapshot, {
        maxRounds: 10,
        playbookStore: createPlaybookStore(memDb),
        toolOutcomeStore: createToolOutcomeStore(memDb),
      });
      memDb.close();

      await writeFile(destPath, out.buffer);
      console.log('OK', name, `${analyzed.result.grade} ${analyzed.result.score} → remediated`);
      ok++;
    } catch (e) {
      failed++;
      console.error('FAIL', name, (e as Error).message);
    }
  }

  console.log(`\nWrote ${ok} PDF(s) to ${outDir}${failed ? `; ${failed} failed` : ''}`);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
