import 'dotenv/config';
import { readFile, writeFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import Database from 'better-sqlite3';
import { initSchema } from '../src/db/schema.js';
import { createPlaybookStore } from '../src/services/learning/playbookStore.js';
import { createToolOutcomeStore } from '../src/services/learning/toolOutcomes.js';
import { analyzePdf } from '../src/services/pdfAnalyzer.js';
import { remediatePdf } from '../src/services/remediation/orchestrator.js';

void (async () => {
  const pdfPath = process.argv[2];
  if (!pdfPath) {
    console.error('usage: tsx scripts/verify-one-stress.ts <pdf>');
    process.exit(2);
  }
  const name = pdfPath.split('/').pop() ?? 'x.pdf';
  const buf = await readFile(pdfPath);
  console.warn('inBytes', buf.length);
  const tmp = join(tmpdir(), `t-${randomUUID()}.pdf`);
  await writeFile(tmp, buf);
  const a0 = await analyzePdf(tmp, name, { bypassCache: true });
  await unlink(tmp);
  const mem = new Database(':memory:');
  initSchema(mem);
  const maxRounds = parseInt(process.env['PDFAF_VERIFY_MAX_ROUNDS'] ?? '10', 10);
  const out = await remediatePdf(buf, name, a0.result, a0.snapshot, {
    maxRounds,
    playbookStore: createPlaybookStore(mem),
    toolOutcomeStore: createToolOutcomeStore(mem),
  });
  mem.close();
  console.warn(
    'outBytes',
    out.buffer.length,
    'improved',
    out.remediation.improved,
    'tools',
    out.remediation.appliedTools.length,
  );
  console.warn(
    out.remediation.appliedTools.map(t => `${t.toolName}:${t.outcome}`).join('\n'),
  );
  const tmp2 = join(tmpdir(), `o-${randomUUID()}.pdf`);
  await writeFile(tmp2, out.buffer);
  const a1 = await analyzePdf(tmp2, name, { bypassCache: true });
  await unlink(tmp2);
  console.warn('snap', a1.snapshot.isTagged, Boolean(a1.snapshot.structureTree), a1.result.pdfClass);
  const cats = a1.result.categories
    .filter(c => c.applicable)
    .map(c => ({ k: c.key, s: c.score }))
    .sort((x, y) => x.s - y.s);
  console.log(
    JSON.stringify(
      {
        before: { score: a0.result.score, grade: a0.result.grade },
        after: { score: a1.result.score, grade: a1.result.grade },
        categories: cats,
      },
      null,
      2,
    ),
  );
})();
