/**
 * Grade every PDF in a directory with analyzePdf and print a markdown table + summary.
 * Usage: pnpm exec tsx scripts/grade-corpus-report.ts [inputDir] [out.md]
 * Default input: Input/corpus_stress_mixed_structure
 * Default out: stdout only if second arg omitted; else writes file.
 */
import 'dotenv/config';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

async function main(): Promise<void> {
  const inDir = process.argv[2] ?? join(process.cwd(), 'Input', 'corpus_stress_mixed_structure');
  const outPath = process.argv[3];

  const files = (await readdir(inDir))
    .filter(f => f.toLowerCase().endsWith('.pdf'))
    .sort((a, b) => a.localeCompare(b));

  if (files.length === 0) {
    console.error('No PDFs in', inDir);
    process.exit(1);
  }

  const { analyzePdf } = await import('../src/services/pdfAnalyzer.js');

  type Row = {
    file: string;
    grade: string;
    score: number;
    pdfClass: string;
    pages: number;
    ms: number;
    weakest: string;
  };

  const rows: Row[] = [];
  for (const f of files) {
    const path = join(inDir, f);
    const { result } = await analyzePdf(path, f);
    const cats = result.categories.filter(c => c.applicable).map(c => ({ k: c.key, s: c.score }));
    cats.sort((a, b) => a.s - b.s);
    const weakest = cats.length ? `${cats[0]!.k}=${cats[0]!.s}` : 'n/a';
    rows.push({
      file: f,
      grade: result.grade,
      score: result.score,
      pdfClass: result.pdfClass,
      pages: result.pageCount,
      ms: result.analysisDurationMs,
      weakest,
    });
  }

  const byGrade = (g: string) => rows.filter(r => r.grade === g).length;
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

  const lines: string[] = [];
  lines.push('# Corpus grade report');
  lines.push('');
  lines.push(`- **Input directory:** \`${inDir}\``);
  lines.push(`- **Files:** ${rows.length}`);
  lines.push(`- **Analyzer:** PDFAF v2 \`analyzePdf\` (Phase 1 score + categories)`);
  lines.push(`- **Generated:** ${new Date().toISOString()}`);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push('| Metric | Value |');
  lines.push('| --- | --- |');
  lines.push(`| Mean overall score | ${mean(rows.map(r => r.score)).toFixed(1)} |`);
  lines.push(`| Mean analysisDurationMs | ${mean(rows.map(r => r.ms)).toFixed(0)} |`);
  lines.push(`| Grade A | ${byGrade('A')} |`);
  lines.push(`| Grade B | ${byGrade('B')} |`);
  lines.push(`| Grade C | ${byGrade('C')} |`);
  lines.push(`| Grade D | ${byGrade('D')} |`);
  lines.push(`| Grade F | ${byGrade('F')} |`);
  lines.push('');
  lines.push('## Per-file results');
  lines.push('');
  lines.push('| # | File | Grade | Score | pdfClass | Pages | ms | Weakest applicable category |');
  lines.push('| ---: | --- | --- | ---: | --- | ---: | ---: | --- |');
  rows.forEach((r, i) => {
    lines.push(
      `| ${i + 1} | ${r.file.replace(/\|/g, '\\|')} | **${r.grade}** | ${r.score} | ${r.pdfClass} | ${r.pages} | ${r.ms} | ${r.weakest} |`,
    );
  });
  lines.push('');

  const md = lines.join('\n');
  if (outPath) {
    await mkdir(dirname(outPath), { recursive: true });
    await writeFile(outPath, md, 'utf8');
    console.log('Wrote', outPath);
  }
  console.log(md);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
