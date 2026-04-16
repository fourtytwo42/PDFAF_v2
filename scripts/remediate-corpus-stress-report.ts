/**
 * Analyze → deterministic remediatePdf → analyze again; per-file timings + aggregate summary.
 *
 * Usage:
 *   pnpm exec tsx scripts/remediate-corpus-stress-report.ts [inputDir] [report.md]
 *
 * Defaults: Input/corpus_stress_mixed_structure → Output/reports/corpus_stress_remediate_timings.md
 *
 * Uses :memory: SQLite for playbook/tool outcomes (same pattern as baseline-corpus-batch).
 */
import 'dotenv/config';
import Database from 'better-sqlite3';
import { mkdir, readdir, readFile, writeFile, unlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { initSchema } from '../src/db/schema.js';
import { createPlaybookStore } from '../src/services/learning/playbookStore.js';
import { createToolOutcomeStore } from '../src/services/learning/toolOutcomes.js';

type Row = {
  file: string;
  beforeScore: number;
  beforeGrade: string;
  afterScore: number;
  afterGrade: string;
  delta: number;
  analyzeBeforeMs: number;
  remediateMs: number;
  analyzeAfterMs: number;
  totalPipelineMs: number;
  error?: string;
};

async function main(): Promise<void> {
  const inDir = process.argv[2] ?? join(process.cwd(), 'Input', 'corpus_stress_mixed_structure');
  const outPath =
    process.argv[3] ?? join(process.cwd(), 'Output', 'reports', 'corpus_stress_remediate_timings.md');

  const files = (await readdir(inDir))
    .filter(f => f.toLowerCase().endsWith('.pdf'))
    .sort((a, b) => a.localeCompare(b));

  if (files.length === 0) {
    console.error('No PDFs in', inDir);
    process.exit(1);
  }

  const { analyzePdf } = await import('../src/services/pdfAnalyzer.js');
  const { remediatePdf } = await import('../src/services/remediation/orchestrator.js');

  const rows: Row[] = [];

  for (const name of files) {
    const inputPath = join(inDir, name);
    const row: Row = {
      file: name,
      beforeScore: 0,
      beforeGrade: '?',
      afterScore: 0,
      afterGrade: '?',
      delta: 0,
      analyzeBeforeMs: 0,
      remediateMs: 0,
      analyzeAfterMs: 0,
      totalPipelineMs: 0,
    };
    const tPipe0 = performance.now();
    try {
      const buf = await readFile(inputPath);

      const tmpIn = join(tmpdir(), `pdfaf-stress-in-${randomUUID()}.pdf`);
      await writeFile(tmpIn, buf);
      const tA0 = performance.now();
      const analyzed = await analyzePdf(tmpIn, name, { bypassCache: true });
      await unlink(tmpIn).catch(() => {});
      row.analyzeBeforeMs = Math.round(performance.now() - tA0);
      row.beforeScore = analyzed.result.score;
      row.beforeGrade = analyzed.result.grade;

      const memDb = new Database(':memory:');
      initSchema(memDb);
      const playbookStore = createPlaybookStore(memDb);
      const toolOutcomeStore = createToolOutcomeStore(memDb);

      const tR0 = performance.now();
      const out = await remediatePdf(buf, name, analyzed.result, analyzed.snapshot, {
        maxRounds: 10,
        playbookStore,
        toolOutcomeStore,
      });
      memDb.close();
      row.remediateMs = Math.round(performance.now() - tR0);

      const tmpOut = join(tmpdir(), `pdfaf-stress-out-${randomUUID()}.pdf`);
      await writeFile(tmpOut, out.buffer);
      const tA1 = performance.now();
      const analyzedAfter = await analyzePdf(tmpOut, name, { bypassCache: true });
      await unlink(tmpOut).catch(() => {});
      row.analyzeAfterMs = Math.round(performance.now() - tA1);

      row.afterScore = analyzedAfter.result.score;
      row.afterGrade = analyzedAfter.result.grade;
      row.delta = row.afterScore - row.beforeScore;
    } catch (e) {
      row.error = (e as Error).message;
    }
    row.totalPipelineMs = Math.round(performance.now() - tPipe0);
    rows.push(row);
  }

  const ok = rows.filter(r => !r.error);
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  const gradeCount = (rs: Row[], g: string, field: 'beforeGrade' | 'afterGrade') =>
    rs.filter(r => !r.error && r[field] === g).length;

  const lines: string[] = [];
  lines.push('# Stress corpus: remediate + re-grade + timings');
  lines.push('');
  lines.push(`- **Input:** \`${inDir}\``);
  lines.push(`- **Files:** ${rows.length} (${ok.length} OK, ${rows.length - ok.length} errors)`);
  lines.push(`- **Pipeline per file:** \`analyzePdf\` → \`remediatePdf\` (maxRounds 10, :memory: stores) → \`analyzePdf\` on output`);
  lines.push(`- **Generated:** ${new Date().toISOString()}`);
  lines.push('');
  lines.push('## Aggregate grades (not per-category)');
  lines.push('');
  lines.push('| | Before | After |');
  lines.push('| --- | --- | --- |');
  lines.push(`| Mean score | ${mean(ok.map(r => r.beforeScore)).toFixed(1)} | ${mean(ok.map(r => r.afterScore)).toFixed(1)} |`);
  lines.push(`| Mean Δ score | — | ${mean(ok.map(r => r.delta)).toFixed(1)} |`);
  lines.push('');
  lines.push('| Grade | Before (count) | After (count) |');
  lines.push('| --- | ---: | ---: |');
  for (const g of ['A', 'B', 'C', 'D', 'F']) {
    lines.push(`| ${g} | ${gradeCount(ok, g, 'beforeGrade')} | ${gradeCount(ok, g, 'afterGrade')} |`);
  }
  lines.push('');
  lines.push('## Timing (ms)');
  lines.push('');
  lines.push('| | Mean |');
  lines.push('| --- | ---: |');
  lines.push(`| Analyze (initial) | ${mean(ok.map(r => r.analyzeBeforeMs)).toFixed(0)} |`);
  lines.push(`| Remediate | ${mean(ok.map(r => r.remediateMs)).toFixed(0)} |`);
  lines.push(`| Analyze (after fix) | ${mean(ok.map(r => r.analyzeAfterMs)).toFixed(0)} |`);
  lines.push(`| **Total wall per file** | ${mean(ok.map(r => r.totalPipelineMs)).toFixed(0)} |`);
  lines.push('');
  lines.push('## Per file: scores + timings');
  lines.push('');
  lines.push(
    '| File | Before | After | Δ | analyze₁ ms | remediate ms | analyze₂ ms | total ms | Note |',
  );
  lines.push('| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |');
  for (const r of rows) {
    const fn = r.file.replace(/\|/g, '\\|');
    const note = r.error ? r.error.replace(/\|/g, '/').slice(0, 120) : '';
    lines.push(
      `| ${fn} | ${r.beforeGrade} ${r.beforeScore} | ${r.afterGrade} ${r.afterScore} | ${r.delta >= 0 ? '+' : ''}${r.delta} | ${r.analyzeBeforeMs} | ${r.remediateMs} | ${r.analyzeAfterMs} | ${r.totalPipelineMs} | ${note} |`,
    );
  }
  lines.push('');

  const md = lines.join('\n');
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, md, 'utf8');
  console.log('Wrote', outPath);
  console.log(md);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
