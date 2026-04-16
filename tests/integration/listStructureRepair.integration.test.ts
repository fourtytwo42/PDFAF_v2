import { describe, it, expect } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runPythonAnalysis, runPythonMutationBatch } from '../../src/python/bridge.js';

const execFileAsync = promisify(execFile);

describe('repair_list_li_wrong_parent (Python)', () => {
  it('wraps misplaced LI under a new L', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pdfaf-list-'));
    const pdfPath = join(dir, 'in.pdf');
    const script = join(process.cwd(), 'tests/fixtures/scripts/write_list_li_wrong_parent.py');
    await execFileAsync('python3', [script, pdfPath]);

    const before = await runPythonAnalysis(pdfPath);
    expect(before.listStructureAudit?.listItemMisplacedCount ?? 0).toBeGreaterThan(0);

    const buf = await readFile(pdfPath);
    const { buffer, result } = await runPythonMutationBatch(buf, [
      { op: 'repair_list_li_wrong_parent', params: {} },
    ]);
    expect(result.success).toBe(true);
    expect(result.applied).toContain('repair_list_li_wrong_parent');

    const outPath = join(dir, 'out.pdf');
    await writeFile(outPath, buffer);
    const after = await runPythonAnalysis(outPath);
    expect(after.listStructureAudit?.listItemMisplacedCount ?? 0).toBe(0);
  });
});
