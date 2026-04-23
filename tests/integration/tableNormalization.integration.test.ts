import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { runPythonMutationBatch } from '../../src/python/bridge.js';

function buildDirectCellTablePdf(): Buffer {
  const dir = mkdtempSync(join(tmpdir(), 'pdfaf-table-normalize-'));
  const pdfPath = join(dir, 'table.pdf');
  const script = join(dir, 'make_table.py');
  writeFileSync(script, `
import pikepdf
from pikepdf import Name, Dictionary, Array

pdf = pikepdf.Pdf.new()
pdf.add_blank_page(page_size=(612, 792))
root = pdf.Root
sr = pdf.make_indirect(Dictionary(Type=Name('/StructTreeRoot')))
root['/StructTreeRoot'] = sr
doc = pdf.make_indirect(Dictionary(Type=Name('/StructElem'), S=Name('/Document'), P=sr))
table = pdf.make_indirect(Dictionary(Type=Name('/StructElem'), S=Name('/Table'), P=doc))
cells = []
for _ in range(4):
    cell = pdf.make_indirect(Dictionary(Type=Name('/StructElem'), S=Name('/TD'), P=table))
    cells.append(cell)
table['/K'] = Array(cells)
doc['/K'] = Array([table])
sr['/K'] = doc
pdf.save(${JSON.stringify(pdfPath)})
`);
  execFileSync('python3', [script]);
  return readFileSync(pdfPath);
}

describe('normalize_table_structure python mutation', () => {
  it('wraps direct table cells into rows and creates checker-valid headers', async () => {
    const buf = buildDirectCellTablePdf();
    const { result } = await runPythonMutationBatch(buf, [
      { op: 'normalize_table_structure', params: { dominantColumnCount: 2 } },
    ]);

    expect(result.success).toBe(true);
    const row = result.opResults?.find(op => op.op === 'normalize_table_structure');
    expect(row?.outcome).toBe('applied');
    expect(row?.invariants?.directCellsUnderTableBefore).toBe(4);
    expect(row?.invariants?.directCellsUnderTableAfter).toBe(0);
    expect(row?.invariants?.headerCellCountAfter).toBeGreaterThan(0);
    expect(row?.invariants?.tableTreeValidAfter).toBe(true);
    expect(row?.structuralBenefits?.tableValidityImproved).toBe(true);
  });
});
