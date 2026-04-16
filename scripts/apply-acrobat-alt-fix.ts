/**
 * Apply repair_alt_text_structure to an existing PDF (no LLM). For Acrobat nested-alt / alt-not-associated.
 * Usage: pnpm exec tsx scripts/apply-acrobat-alt-fix.ts <input.pdf> <output.pdf>
 */
import 'dotenv/config';
import { readFile, writeFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';

void (async () => {
  const inPath = process.argv[2];
  const outPath = process.argv[3];
  if (!inPath || !outPath) {
    console.error('Usage: tsx scripts/apply-acrobat-alt-fix.ts <input.pdf> <output.pdf>');
    process.exit(1);
  }
  const { analyzePdf } = await import('../src/services/pdfAnalyzer.js');
  const { applyPostRemediationAltRepair } = await import('../src/services/remediation/altStructureRepair.js');

  const tmp = join(tmpdir(), `acfix-${randomUUID()}.pdf`);
  await writeFile(tmp, await readFile(inPath));
  const { result, snapshot } = await analyzePdf(tmp, inPath.split('/').pop() ?? 'doc.pdf');
  await unlink(tmp).catch(() => {});

  const buf = await readFile(inPath);
  const ar = await applyPostRemediationAltRepair(buf, inPath.split('/').pop() ?? 'doc.pdf', result, snapshot);
  await writeFile(outPath, ar.buffer);
  console.log(JSON.stringify({ outPath, score: ar.analysis.score, grade: ar.analysis.grade }, null, 2));
})();
