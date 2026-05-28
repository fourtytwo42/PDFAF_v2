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

function buildDirectCellTableWithMcidPdf(): { buf: Buffer; tableRef: string } {
  const dir = mkdtempSync(join(tmpdir(), 'pdfaf-table-normalize-mcid-'));
  const pdfPath = join(dir, 'table.pdf');
  const refPath = join(dir, 'table-ref.txt');
  const script = join(dir, 'make_table.py');
  writeFileSync(script, `
import pikepdf
from pikepdf import Name, Dictionary, Array

pdf = pikepdf.Pdf.new()
pdf.add_blank_page(page_size=(612, 792))
page = pdf.pages[0].obj
root = pdf.Root
sr = pdf.make_indirect(Dictionary(Type=Name('/StructTreeRoot')))
root['/StructTreeRoot'] = sr
doc = pdf.make_indirect(Dictionary(Type=Name('/StructElem'), S=Name('/Document'), P=sr))
table = pdf.make_indirect(Dictionary(Type=Name('/StructElem'), S=Name('/Table'), P=doc, Pg=page))
cells = []
for idx in range(4):
    cell = pdf.make_indirect(Dictionary(Type=Name('/StructElem'), S=Name('/TD'), P=table, Pg=page, K=idx))
    cells.append(cell)
table['/K'] = Array(cells)
doc['/K'] = Array([table])
sr['/K'] = doc
n, g = table.objgen
with open(${JSON.stringify(refPath)}, 'w') as f:
    f.write(f"{n}_{g}")
pdf.save(${JSON.stringify(pdfPath)})
`);
  execFileSync('python3', [script]);
  return { buf: readFileSync(pdfPath), tableRef: readFileSync(refPath, 'utf8').trim() };
}

function buildLeadingEmptyRowNoHeaderTablePdf(): Buffer {
  const dir = mkdtempSync(join(tmpdir(), 'pdfaf-table-empty-first-row-'));
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
rows = []
for row_index, count in enumerate([0, 3, 1, 3]):
    tr = pdf.make_indirect(Dictionary(Type=Name('/StructElem'), S=Name('/TR'), P=table))
    cells = []
    for _ in range(count):
        cell = pdf.make_indirect(Dictionary(Type=Name('/StructElem'), S=Name('/TD'), P=tr))
        cells.append(cell)
    tr['/K'] = Array(cells)
    rows.append(tr)
table['/K'] = Array(rows)
doc['/K'] = Array([table])
sr['/K'] = doc
pdf.save(${JSON.stringify(pdfPath)})
`);
  execFileSync('python3', [script]);
  return readFileSync(pdfPath);
}

function buildStronglyIrregularTablePdf(): Buffer {
  const dir = mkdtempSync(join(tmpdir(), 'pdfaf-table-irregular-'));
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
rows = []
for row_index, count in enumerate([2, 4, 4, 3, 4]):
    tr = pdf.make_indirect(Dictionary(Type=Name('/StructElem'), S=Name('/TR'), P=table))
    cells = []
    for _ in range(count):
        role = Name('/TH') if row_index == 0 else Name('/TD')
        cell = pdf.make_indirect(Dictionary(Type=Name('/StructElem'), S=role, P=tr))
        cells.append(cell)
    tr['/K'] = Array(cells)
    rows.append(tr)
table['/K'] = Array(rows)
doc['/K'] = Array([table])
sr['/K'] = doc
pdf.save(${JSON.stringify(pdfPath)})
`);
  execFileSync('python3', [script]);
  return readFileSync(pdfPath);
}

function buildShortHeaderRowTemplatePdf(): Buffer {
  const dir = mkdtempSync(join(tmpdir(), 'pdfaf-table-short-header-template-'));
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
rows = []
for row_index, count in enumerate([2, 3]):
    tr = pdf.make_indirect(Dictionary(Type=Name('/StructElem'), S=Name('/TR'), P=table))
    cells = []
    for _ in range(count):
        role = Name('/TH') if row_index == 0 else Name('/TD')
        cell = pdf.make_indirect(Dictionary(Type=Name('/StructElem'), S=role, P=tr))
        cells.append(cell)
    tr['/K'] = Array(cells)
    rows.append(tr)
table['/K'] = Array(rows)
doc['/K'] = Array([table])
sr['/K'] = doc
pdf.save(${JSON.stringify(pdfPath)})
`);
  execFileSync('python3', [script]);
  return readFileSync(pdfPath);
}

function buildMultipleShortHeaderRowTemplatePdf(): Buffer {
  const dir = mkdtempSync(join(tmpdir(), 'pdfaf-table-short-header-template-multi-'));
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
tables = []
for table_index in range(5):
    table = pdf.make_indirect(Dictionary(Type=Name('/StructElem'), S=Name('/Table'), P=doc))
    rows = []
    for row_index, count in enumerate([2, 3]):
        tr = pdf.make_indirect(Dictionary(Type=Name('/StructElem'), S=Name('/TR'), P=table))
        cells = []
        for _ in range(count):
            role = Name('/TH') if row_index == 0 else Name('/TD')
            cell = pdf.make_indirect(Dictionary(Type=Name('/StructElem'), S=role, P=tr))
            cells.append(cell)
        tr['/K'] = Array(cells)
        rows.append(tr)
    table['/K'] = Array(rows)
    tables.append(table)
doc['/K'] = Array(tables)
sr['/K'] = doc
pdf.save(${JSON.stringify(pdfPath)})
`);
  execFileSync('python3', [script]);
  return readFileSync(pdfPath);
}

function buildEmptyTableShellPdf(): Buffer {
  const dir = mkdtempSync(join(tmpdir(), 'pdfaf-table-empty-shell-'));
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
empty_table = pdf.make_indirect(Dictionary(Type=Name('/StructElem'), S=Name('/Table'), P=doc))
empty_row = pdf.make_indirect(Dictionary(Type=Name('/StructElem'), S=Name('/TR'), P=empty_table))
empty_table['/K'] = Array([empty_row])
real_table = pdf.make_indirect(Dictionary(Type=Name('/StructElem'), S=Name('/Table'), P=doc))
rows = []
for row_index in range(2):
    tr = pdf.make_indirect(Dictionary(Type=Name('/StructElem'), S=Name('/TR'), P=real_table))
    cells = []
    for _ in range(2):
        role = Name('/TH') if row_index == 0 else Name('/TD')
        cell = pdf.make_indirect(Dictionary(Type=Name('/StructElem'), S=role, P=tr))
        cells.append(cell)
    tr['/K'] = Array(cells)
    rows.append(tr)
real_table['/K'] = Array(rows)
doc['/K'] = Array([empty_table, real_table])
sr['/K'] = doc
pdf.save(${JSON.stringify(pdfPath)})
`);
  execFileSync('python3', [script]);
  return readFileSync(pdfPath);
}

function buildSingleColumnVarianceTablePdf(): Buffer {
  const dir = mkdtempSync(join(tmpdir(), 'pdfaf-table-single-column-variance-'));
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
rows = []
for row_index, count in enumerate([1, 1, 1, 2, 1, 1, 1, 2]):
    tr = pdf.make_indirect(Dictionary(Type=Name('/StructElem'), S=Name('/TR'), P=table))
    cells = []
    for _ in range(count):
        role = Name('/TH') if row_index == 0 else Name('/TD')
        cell = pdf.make_indirect(Dictionary(Type=Name('/StructElem'), S=role, P=tr))
        cells.append(cell)
    tr['/K'] = Array(cells)
    rows.append(tr)
table['/K'] = Array(rows)
doc['/K'] = Array([table])
sr['/K'] = doc
pdf.save(${JSON.stringify(pdfPath)})
`);
  execFileSync('python3', [script]);
  return readFileSync(pdfPath);
}

function buildEmptyCornerHeaderCellTablePdf(): Buffer {
  const dir = mkdtempSync(join(tmpdir(), 'pdfaf-table-empty-corner-header-'));
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
rows = []
header_ids = {}
for row_index in range(3):
    tr = pdf.make_indirect(Dictionary(Type=Name('/StructElem'), S=Name('/TR'), P=table))
    cells = []
    for cell_index in range(3):
        if row_index == 0 and cell_index == 0:
            role = Name('/TD')
        elif row_index == 0 or cell_index == 0:
            role = Name('/TH')
        else:
            role = Name('/TD')
        cell = pdf.make_indirect(Dictionary(Type=Name('/StructElem'), S=role, P=tr))
        if row_index == 0 and cell_index > 0:
            header_id = f"h-c{cell_index}"
            cell['/ID'] = header_id
            cell['/Scope'] = Name('/Column')
            header_ids[(row_index, cell_index)] = header_id
        elif cell_index == 0 and row_index > 0:
            header_id = f"h-r{row_index}"
            cell['/ID'] = header_id
            cell['/Scope'] = Name('/Row')
            header_ids[(row_index, cell_index)] = header_id
        elif row_index > 0 and cell_index > 0:
            cell['/Headers'] = Array([header_ids[(row_index, 0)], header_ids[(0, cell_index)]])
        cells.append(cell)
    tr['/K'] = Array(cells)
    rows.append(tr)
table['/K'] = Array(rows)
doc['/K'] = Array([table])
sr['/K'] = doc
pdf.save(${JSON.stringify(pdfPath)})
`);
  execFileSync('python3', [script]);
  return readFileSync(pdfPath);
}

function buildHeaderOnlyTablePdf(): Buffer {
  const dir = mkdtempSync(join(tmpdir(), 'pdfaf-table-header-only-'));
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
tr = pdf.make_indirect(Dictionary(Type=Name('/StructElem'), S=Name('/TR'), P=table))
cell = pdf.make_indirect(Dictionary(Type=Name('/StructElem'), S=Name('/TH'), P=tr))
tr['/K'] = Array([cell])
table['/K'] = Array([tr])
doc['/K'] = Array([table])
sr['/K'] = doc
pdf.save(${JSON.stringify(pdfPath)})
`);
  execFileSync('python3', [script]);
  return readFileSync(pdfPath);
}

function buildStronglyIrregularTableWithEmptyLeadingRowPdf(): Buffer {
  const dir = mkdtempSync(join(tmpdir(), 'pdfaf-table-irregular-empty-row-'));
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
rows = []
for row_index, count in enumerate([0, 2, 4, 4, 4]):
    tr = pdf.make_indirect(Dictionary(Type=Name('/StructElem'), S=Name('/TR'), P=table))
    cells = []
    for _ in range(count):
        role = Name('/TH') if row_index == 1 else Name('/TD')
        cell = pdf.make_indirect(Dictionary(Type=Name('/StructElem'), S=role, P=tr))
        cells.append(cell)
    tr['/K'] = Array(cells)
    rows.append(tr)
table['/K'] = Array(rows)
doc['/K'] = Array([table])
sr['/K'] = doc
pdf.save(${JSON.stringify(pdfPath)})
`);
  execFileSync('python3', [script]);
  return readFileSync(pdfPath);
}

function buildUnassociatedHeaderTablePdf(): { buf: Buffer; tableRef: string } {
  const dir = mkdtempSync(join(tmpdir(), 'pdfaf-table-header-association-'));
  const pdfPath = join(dir, 'table.pdf');
  const refPath = join(dir, 'table-ref.txt');
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
rows = []
for row_index in range(3):
    tr = pdf.make_indirect(Dictionary(Type=Name('/StructElem'), S=Name('/TR'), P=table))
    cells = []
    for cell_index in range(3):
        role = Name('/TH') if row_index == 0 or cell_index == 0 else Name('/TD')
        cell = pdf.make_indirect(Dictionary(Type=Name('/StructElem'), S=role, P=tr))
        cells.append(cell)
    tr['/K'] = Array(cells)
    rows.append(tr)
table['/K'] = Array(rows)
doc['/K'] = Array([table])
sr['/K'] = doc
n, g = table.objgen
with open(${JSON.stringify(refPath)}, 'w') as f:
    f.write(f"{n}_{g}")
pdf.save(${JSON.stringify(pdfPath)})
`);
  execFileSync('python3', [script]);
  return { buf: readFileSync(pdfPath), tableRef: readFileSync(refPath, 'utf8').trim() };
}

function buildMixedTableAndParagraphPdf(): { buf: Buffer; tableRef: string; paragraphRef: string } {
  const dir = mkdtempSync(join(tmpdir(), 'pdfaf-table-mixed-ref-'));
  const pdfPath = join(dir, 'table.pdf');
  const refPath = join(dir, 'refs.json');
  const script = join(dir, 'make_table.py');
  writeFileSync(script, `
import json
import pikepdf
from pikepdf import Name, Dictionary, Array

pdf = pikepdf.Pdf.new()
pdf.add_blank_page(page_size=(612, 792))
root = pdf.Root
sr = pdf.make_indirect(Dictionary(Type=Name('/StructTreeRoot')))
root['/StructTreeRoot'] = sr
doc = pdf.make_indirect(Dictionary(Type=Name('/StructElem'), S=Name('/Document'), P=sr))
table = pdf.make_indirect(Dictionary(Type=Name('/StructElem'), S=Name('/Table'), P=doc))
rows = []
for row_index in range(3):
    tr = pdf.make_indirect(Dictionary(Type=Name('/StructElem'), S=Name('/TR'), P=table))
    cells = []
    for cell_index in range(3):
        role = Name('/TH') if row_index == 0 or cell_index == 0 else Name('/TD')
        cell = pdf.make_indirect(Dictionary(Type=Name('/StructElem'), S=role, P=tr))
        cells.append(cell)
    tr['/K'] = Array(cells)
    rows.append(tr)
table['/K'] = Array(rows)
paragraph = pdf.make_indirect(Dictionary(Type=Name('/StructElem'), S=Name('/P'), P=doc))
doc['/K'] = Array([table, paragraph])
sr['/K'] = doc
pdf.save(${JSON.stringify(pdfPath)})
saved = pikepdf.open(${JSON.stringify(pdfPath)})
kids = list(saved.Root['/StructTreeRoot']['/K']['/K'])
with open(${JSON.stringify(refPath)}, 'w') as f:
    json.dump({
        "tableRef": f"{kids[0].objgen[0]}_{kids[0].objgen[1]}",
        "paragraphRef": f"{kids[1].objgen[0]}_{kids[1].objgen[1]}",
    }, f)
`);
  execFileSync('python3', [script]);
  const refs = JSON.parse(readFileSync(refPath, 'utf8')) as { tableRef: string; paragraphRef: string };
  return { buf: readFileSync(pdfPath), tableRef: refs.tableRef, paragraphRef: refs.paragraphRef };
}

function buildMultipleUnassociatedHeaderTablesPdf(): { buf: Buffer; tableRefs: string[] } {
  const dir = mkdtempSync(join(tmpdir(), 'pdfaf-table-header-association-batch-'));
  const pdfPath = join(dir, 'table.pdf');
  const refPath = join(dir, 'table-refs.txt');
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
tables = []
refs = []
for table_index in range(3):
    table = pdf.make_indirect(Dictionary(Type=Name('/StructElem'), S=Name('/Table'), P=doc))
    rows = []
    for row_index in range(3):
        tr = pdf.make_indirect(Dictionary(Type=Name('/StructElem'), S=Name('/TR'), P=table))
        cells = []
        for cell_index in range(3):
            role = Name('/TH') if row_index == 0 or cell_index == 0 else Name('/TD')
            cell = pdf.make_indirect(Dictionary(Type=Name('/StructElem'), S=role, P=tr))
            cells.append(cell)
        tr['/K'] = Array(cells)
        rows.append(tr)
    table['/K'] = Array(rows)
    tables.append(table)
    n, g = table.objgen
    refs.append(f"{n}_{g}")
doc['/K'] = Array(tables)
sr['/K'] = doc
pdf.save(${JSON.stringify(pdfPath)})
saved = pikepdf.open(${JSON.stringify(pdfPath)})
saved_tables = list(saved.Root['/StructTreeRoot']['/K']['/K'])
with open(${JSON.stringify(refPath)}, 'w') as f:
    f.write("\\n".join(f"{table.objgen[0]}_{table.objgen[1]}" for table in saved_tables))
`);
  execFileSync('python3', [script]);
  return {
    buf: readFileSync(pdfPath),
    tableRefs: readFileSync(refPath, 'utf8').trim().split('\n').filter(Boolean),
  };
}

function buildMultipleStronglyIrregularTablesPdf(): { buf: Buffer; tableRefs: string[] } {
  const dir = mkdtempSync(join(tmpdir(), 'pdfaf-table-irregular-multi-'));
  const pdfPath = join(dir, 'table.pdf');
  const refPath = join(dir, 'table-refs.txt');
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
tables = []
for table_index in range(5):
    table = pdf.make_indirect(Dictionary(Type=Name('/StructElem'), S=Name('/Table'), P=doc))
    rows = []
    for row_index, count in enumerate([2, 4, 4, 3, 4]):
        tr = pdf.make_indirect(Dictionary(Type=Name('/StructElem'), S=Name('/TR'), P=table))
        cells = []
        for _ in range(count):
            role = Name('/TH') if row_index == 0 else Name('/TD')
            cell = pdf.make_indirect(Dictionary(Type=Name('/StructElem'), S=role, P=tr))
            cells.append(cell)
        tr['/K'] = Array(cells)
        rows.append(tr)
    table['/K'] = Array(rows)
    tables.append(table)
doc['/K'] = Array(tables)
sr['/K'] = doc
pdf.save(${JSON.stringify(pdfPath)})
saved = pikepdf.open(${JSON.stringify(pdfPath)})
saved_tables = list(saved.Root['/StructTreeRoot']['/K']['/K'])
with open(${JSON.stringify(refPath)}, 'w') as f:
    f.write("\\n".join(f"{table.objgen[0]}_{table.objgen[1]}" for table in saved_tables))
`);
  execFileSync('python3', [script]);
  return {
    buf: readFileSync(pdfPath),
    tableRefs: readFileSync(refPath, 'utf8').trim().split('\n').filter(Boolean),
  };
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
    expect(row?.invariants?.headerCellsWithScopeCountAfter).toBeGreaterThan(0);
    expect(row?.invariants?.dataCellsWithHeadersCountAfter).toBeGreaterThan(0);
    expect(row?.invariants?.ownershipPreserved).toBe(true);
    expect(row?.invariants?.orphanMcidCountAfter).toBeLessThanOrEqual(row?.invariants?.orphanMcidCountBefore ?? 0);
    expect(row?.invariants?.parentTreeDebtAfter).toBeLessThanOrEqual(row?.invariants?.parentTreeDebtBefore ?? 0);
    expect(row?.invariants?.tableTreeValidAfter).toBe(true);
    expect(row?.structuralBenefits?.tableValidityImproved).toBe(true);
  });

  it('reports diagnostic table-ref MCID ownership without changing table acceptance', async () => {
    const { buf, tableRef } = buildDirectCellTableWithMcidPdf();
    const { result } = await runPythonMutationBatch(buf, [
      {
        op: 'normalize_table_structure',
        params: {
          structRef: tableRef,
          strictTableTargetRef: true,
          dominantColumnCount: 2,
          diagnosticTableMcidOwnership: true,
        },
      },
    ]);

    expect(result.success).toBe(true);
    const row = result.opResults?.find(op => op.op === 'normalize_table_structure');
    expect(row?.outcome).toBe('applied');
    const beforeDetails = row?.invariants?.targetRefDetailsBefore ?? [];
    const afterDetails = row?.invariants?.targetRefDetailsAfter ?? [];
    expect(beforeDetails).toEqual(expect.arrayContaining([
      expect.objectContaining({
        ref: tableRef,
        referencedMcidCount: 4,
        referencedMcidSampleKeys: ['0:0', '0:1', '0:2', '0:3'],
      }),
    ]));
    expect(afterDetails).toEqual(expect.arrayContaining([
      expect.objectContaining({
        ref: tableRef,
        referencedMcidCount: 4,
        referencedMcidSampleKeys: ['0:0', '0:1', '0:2', '0:3'],
      }),
    ]));
    expect(row?.invariants?.targetRefMcidDeltas).toEqual([]);
    expect(row?.invariants?.ownershipPreserved).toBe(true);
    expect(row?.structuralBenefits?.tableValidityImproved).toBe(true);
  });

  it('promotes the first non-empty table row when leading rows are empty', async () => {
    const buf = buildLeadingEmptyRowNoHeaderTablePdf();
    const { result } = await runPythonMutationBatch(buf, [
      { op: 'normalize_table_structure', params: { tableFailureClass: 'missing_headers_only', dominantColumnCount: 3 } },
    ]);

    expect(result.success).toBe(true);
    const row = result.opResults?.find(op => op.op === 'normalize_table_structure');
    expect(row?.outcome).toBe('applied');
    expect(row?.invariants?.headerCellCountBefore).toBe(0);
    expect(row?.invariants?.headerCellCountAfter).toBeGreaterThan(0);
    expect(row?.invariants?.headerCellsWithScopeCountAfter).toBeGreaterThan(0);
    expect(row?.invariants?.dataCellsWithHeadersCountAfter).toBeGreaterThan(0);
    expect(row?.invariants?.tableTreeValidAfter).toBe(true);
    expect(row?.structuralBenefits?.tableValidityImproved).toBe(true);
  });

  it('adds deterministic scope/id/header associations without changing table shape', async () => {
    const { buf, tableRef } = buildUnassociatedHeaderTablePdf();
    const { result } = await runPythonMutationBatch(buf, [
      { op: 'set_table_header_cells', params: { structRef: tableRef, tableHeaderAssociation: true } },
    ]);

    expect(result.success).toBe(true);
    const row = result.opResults?.find(op => op.op === 'set_table_header_cells');
    expect(row?.outcome).toBe('applied');
    expect(row?.note).toBe('table_header_association_improved');
    expect(row?.invariants?.headerCellCountBefore).toBe(row?.invariants?.headerCellCountAfter);
    expect(row?.invariants?.dataCellsWithoutHeaderCountAfter).toBeLessThan(row?.invariants?.dataCellsWithoutHeaderCountBefore ?? 0);
    expect(row?.invariants?.headerCellsWithScopeCountAfter).toBeGreaterThan(row?.invariants?.headerCellsWithScopeCountBefore ?? 0);
    expect(row?.invariants?.ownershipPreserved).toBe(true);
    expect(row?.invariants?.orphanMcidCountAfter).toBeLessThanOrEqual(row?.invariants?.orphanMcidCountBefore ?? 0);
    expect(row?.invariants?.parentTreeDebtAfter).toBeLessThanOrEqual(row?.invariants?.parentTreeDebtBefore ?? 0);
    expect(row?.structuralBenefits?.tableValidityImproved).toBe(true);
  });

  it('adds deterministic associations across multiple targeted tables without changing table shape', async () => {
    const { buf, tableRefs } = buildMultipleUnassociatedHeaderTablesPdf();
    const { result } = await runPythonMutationBatch(buf, [
      { op: 'set_table_header_cells', params: { structRefs: tableRefs, tableHeaderAssociation: true, strictTableTargetRef: true } },
    ]);

    expect(result.success).toBe(true);
    const row = result.opResults?.find(op => op.op === 'set_table_header_cells');
    expect(row?.outcome).toBe('applied');
    expect(row?.note).toBe('table_header_association_batch_improved');
    expect(row?.debug?.targetRefs).toEqual(tableRefs);
    expect(row?.debug?.strictTableTargetRef).toBe(true);
    expect(row?.invariants?.headerCellCountBefore).toBe(row?.invariants?.headerCellCountAfter);
    expect(row?.invariants?.dataCellsWithoutHeaderCountAfter).toBeLessThan(row?.invariants?.dataCellsWithoutHeaderCountBefore ?? 0);
    expect(row?.invariants?.dataCellsWithHeadersCountAfter).toBeGreaterThan(row?.invariants?.dataCellsWithHeadersCountBefore ?? 0);
    expect(row?.structuralBenefits?.tableValidityImproved).toBe(true);
  });

  it('can associate existing headers across table objects only when explicitly requested', async () => {
    const { buf } = buildMultipleUnassociatedHeaderTablesPdf();
    const generic = await runPythonMutationBatch(buf, [
      { op: 'set_table_header_cells', params: { tableHeaderAssociation: true } },
    ]);
    const genericRow = generic.result.opResults?.find(op => op.op === 'set_table_header_cells');
    expect(genericRow?.outcome).toBe('no_effect');

    const explicit = await runPythonMutationBatch(buf, [
      {
        op: 'set_table_header_cells',
        params: {
          tableHeaderAssociation: true,
          associateAllTableHeaders: true,
          maxTableHeaderAssociationTargets: 3,
        },
      },
    ]);

    expect(explicit.result.success).toBe(true);
    const row = explicit.result.opResults?.find(op => op.op === 'set_table_header_cells');
    expect(row?.outcome).toBe('applied');
    expect(row?.debug?.changedTargetRefs).toHaveLength(3);
    expect(row?.invariants?.dataCellsWithoutHeaderCountAfter).toBeLessThan(row?.invariants?.dataCellsWithoutHeaderCountBefore ?? 0);
    expect(row?.invariants?.dataCellsWithHeadersCountAfter).toBeGreaterThan(row?.invariants?.dataCellsWithHeadersCountBefore ?? 0);
    expect(row?.structuralBenefits?.tableValidityImproved).toBe(true);
  });

  it('reports mixed table and non-table batch refs without changing generic batch behavior', async () => {
    const { buf, tableRef, paragraphRef } = buildMixedTableAndParagraphPdf();
    const { result } = await runPythonMutationBatch(buf, [
      { op: 'set_table_header_cells', params: { structRefs: [tableRef, paragraphRef], tableHeaderAssociation: true } },
    ]);

    expect(result.success).toBe(true);
    const row = result.opResults?.find(op => op.op === 'set_table_header_cells');
    expect(row?.outcome).toBe('applied');
    expect(row?.debug?.changedTargetRefs).toEqual([tableRef]);
    expect(row?.debug?.skippedTargetRefs).toEqual([paragraphRef]);
    const details = row?.invariants?.targetRefDetailsAfter ?? [];
    expect(details).toEqual(expect.arrayContaining([
      expect.objectContaining({ ref: tableRef, isTable: true, targetReachable: true }),
      expect.objectContaining({ ref: paragraphRef, isTable: false, skipReason: 'not_table' }),
    ]));

    const strictSet = await runPythonMutationBatch(buf, [
      { op: 'set_table_header_cells', params: { structRefs: [tableRef, paragraphRef], tableHeaderAssociation: true, strictTableTargetRef: true } },
    ]);
    const strictSetRow = strictSet.result.opResults?.find(op => op.op === 'set_table_header_cells');
    expect(strictSetRow?.outcome).toBe('no_effect');
    expect(strictSetRow?.debug?.changedTargetRefs).toEqual([]);
    expect(strictSetRow?.debug?.skippedTargetRefs).toEqual([paragraphRef]);
    expect(strictSetRow?.debug?.strictTableTargetRef).toBe(true);

    const strictRepair = await runPythonMutationBatch(buf, [
      { op: 'repair_native_table_headers', params: { structRefs: [tableRef, paragraphRef], strictTableTargetRef: true } },
    ]);
    const strictRepairRow = strictRepair.result.opResults?.find(op => op.op === 'repair_native_table_headers');
    expect(strictRepairRow?.outcome).toBe('no_effect');
    expect(strictRepairRow?.debug?.changedTargetRefs).toEqual([]);
    expect(strictRepairRow?.debug?.skippedTargetRefs).toEqual([paragraphRef]);
    expect(strictRepairRow?.debug?.strictTableTargetRef).toBe(true);
  });

  it('reports non-table single refs as no-effect without fallback mutation', async () => {
    const { buf, paragraphRef } = buildMixedTableAndParagraphPdf();
    const { result } = await runPythonMutationBatch(buf, [
      { op: 'set_table_header_cells', params: { structRef: paragraphRef, tableHeaderAssociation: true } },
    ]);

    expect(result.success).toBe(true);
    const row = result.opResults?.find(op => op.op === 'set_table_header_cells');
    expect(row?.outcome).toBe('no_effect');
    expect(row?.note).toBe('no_structural_change');
    expect(row?.invariants?.targetRefDetailsAfter).toEqual(expect.arrayContaining([
      expect.objectContaining({ ref: paragraphRef, isTable: false, skipReason: 'not_table' }),
    ]));
  });

  it('refuses explicit non-table refs for normalize without falling back to broad table mutation', async () => {
    const { buf, paragraphRef } = buildMixedTableAndParagraphPdf();
    const { result } = await runPythonMutationBatch(buf, [
      {
        op: 'normalize_table_structure',
        params: {
          structRef: paragraphRef,
          tableFailureClass: 'missing_headers_only',
          maxTablesPerRun: 1,
        },
      },
    ]);

    expect(result.success).toBe(true);
    const row = result.opResults?.find(op => op.op === 'normalize_table_structure');
    expect(row?.outcome).toBe('no_effect');
    expect(row?.debug?.changedTargetRefs).toEqual([]);
    expect(row?.debug?.skippedTargetRefs).toEqual([paragraphRef]);
    expect(row?.debug?.skippedTargetRefDetails).toEqual(expect.arrayContaining([
      expect.objectContaining({ ref: paragraphRef, skipReason: 'not_table', resolvedRole: 'P' }),
    ]));
  });

  it('pads short rows in strongly irregular dense tables with invariant-backed table improvement', async () => {
    const buf = buildStronglyIrregularTablePdf();
    const { result } = await runPythonMutationBatch(buf, [
      {
        op: 'normalize_table_structure',
        params: {
          tableFailureClass: 'strongly_irregular_rows',
          maxTablesPerRun: 1,
          maxSyntheticCells: 8,
        },
      },
    ]);

    expect(result.success).toBe(true);
    const row = result.opResults?.find(op => op.op === 'normalize_table_structure');
    expect(row?.outcome).toBe('applied');
    expect(row?.invariants?.irregularRowsBefore).toBeGreaterThan(0);
    expect(row?.invariants?.irregularRowsAfter).toBe(0);
    expect(row?.invariants?.headerCellCountAfter).toBeGreaterThan(row?.invariants?.headerCellCountBefore ?? 0);
    expect(row?.invariants?.dataCellsWithHeadersCountAfter).toBeGreaterThan(row?.invariants?.dataCellsWithHeadersCountBefore ?? 0);
    expect(row?.invariants?.tableTreeValidAfter).toBe(true);
    expect(row?.structuralBenefits?.tableValidityImproved).toBe(true);
  });

  it('pads short header rows only when the explicit repeated-template class is requested', async () => {
    const buf = buildShortHeaderRowTemplatePdf();
    const generic = await runPythonMutationBatch(buf, [
      {
        op: 'normalize_table_structure',
        params: {
          tableFailureClass: 'strongly_irregular_rows',
          maxTablesPerRun: 1,
          maxSyntheticCells: 4,
        },
      },
    ]);
    const genericRow = generic.result.opResults?.find(op => op.op === 'normalize_table_structure');
    expect(genericRow?.outcome).toBe('no_effect');

    const specific = await runPythonMutationBatch(buf, [
      {
        op: 'normalize_table_structure',
        params: {
          tableFailureClass: 'short_header_row_template',
          maxTablesPerRun: 1,
          maxSyntheticCells: 4,
        },
      },
    ]);

    expect(specific.result.success).toBe(true);
    const row = specific.result.opResults?.find(op => op.op === 'normalize_table_structure');
    expect(row?.outcome).toBe('applied');
    expect(row?.invariants?.irregularRowsBefore).toBe(1);
    expect(row?.invariants?.irregularRowsAfter).toBe(0);
    expect(row?.invariants?.headerCellCountAfter).toBeGreaterThan(row?.invariants?.headerCellCountBefore ?? 0);
    expect(row?.invariants?.dataCellsWithoutHeaderCountAfter).toBeLessThan(row?.invariants?.dataCellsWithoutHeaderCountBefore ?? 0);
    expect(row?.invariants?.ownershipPreserved).toBe(true);
    expect(row?.invariants?.tableTreeValidAfter).toBe(true);
    expect(row?.structuralBenefits?.tableValidityImproved).toBe(true);
  });

  it('selects short-header row templates directly when the explicit class is requested without refs', async () => {
    const buf = buildMultipleShortHeaderRowTemplatePdf();
    const { result } = await runPythonMutationBatch(buf, [
      {
        op: 'normalize_table_structure',
        params: {
          tableFailureClass: 'short_header_row_template',
          maxTablesPerRun: 4,
          maxSyntheticCells: 4,
        },
      },
    ]);

    expect(result.success).toBe(true);
    const row = result.opResults?.find(op => op.op === 'normalize_table_structure');
    expect(row?.outcome).toBe('applied');
    expect(row?.invariants?.irregularRowsBefore).toBeGreaterThan(row?.invariants?.irregularRowsAfter ?? 0);
    expect(row?.invariants?.stronglyIrregularTableCountBefore).toBe(0);
    expect(row?.debug?.changedTargetRefs).toHaveLength(4);
    expect(row?.structuralBenefits?.tableValidityImproved).toBe(true);
  });

  it('removes empty table shells only when the explicit class is requested', async () => {
    const buf = buildEmptyTableShellPdf();
    const generic = await runPythonMutationBatch(buf, [
      {
        op: 'normalize_table_structure',
        params: {
          tableFailureClass: 'short_header_row_template',
          maxTablesPerRun: 1,
        },
      },
    ]);
    const genericRow = generic.result.opResults?.find(op => op.op === 'normalize_table_structure');
    expect(genericRow?.outcome).toBe('no_effect');

    const specific = await runPythonMutationBatch(buf, [
      {
        op: 'normalize_table_structure',
        params: {
          tableFailureClass: 'empty_table_shell',
          maxTablesPerRun: 1,
        },
      },
    ]);

    expect(specific.result.success).toBe(true);
    const row = specific.result.opResults?.find(op => op.op === 'normalize_table_structure');
    expect(row?.outcome).toBe('applied');
    expect(row?.note).toBe('empty_table_shell_removed');
    expect(row?.invariants?.emptyTableShellCountBefore).toBe(1);
    expect(row?.invariants?.emptyTableShellCountAfter).toBe(0);
    expect(row?.invariants?.tableCountAfter).toBeLessThan(row?.invariants?.tableCountBefore ?? 0);
    expect(row?.invariants?.ownershipPreserved).toBe(true);
    expect(row?.structuralBenefits?.tableValidityImproved).toBe(true);
  });

  it('pads single-column variance templates only when the explicit class is requested', async () => {
    const buf = buildSingleColumnVarianceTablePdf();
    const generic = await runPythonMutationBatch(buf, [
      {
        op: 'normalize_table_structure',
        params: {
          tableFailureClass: 'strongly_irregular_rows',
          maxTablesPerRun: 1,
          maxSyntheticCells: 16,
        },
      },
    ]);
    const genericRow = generic.result.opResults?.find(op => op.op === 'normalize_table_structure');
    expect(genericRow?.outcome).toBe('no_effect');

    const specific = await runPythonMutationBatch(buf, [
      {
        op: 'normalize_table_structure',
        params: {
          tableFailureClass: 'single_column_variance_template',
          maxTablesPerRun: 1,
          maxSyntheticCells: 16,
        },
      },
    ]);

    expect(specific.result.success).toBe(true);
    const row = specific.result.opResults?.find(op => op.op === 'normalize_table_structure');
    expect(row?.outcome).toBe('applied');
    expect(row?.invariants?.irregularRowsBefore).toBeGreaterThan(0);
    expect(row?.invariants?.irregularRowsAfter).toBe(0);
    expect(row?.invariants?.headerCellCountAfter).toBeGreaterThan(row?.invariants?.headerCellCountBefore ?? 0);
    expect(row?.invariants?.dataCellsWithoutHeaderCountAfter).toBeLessThan(row?.invariants?.dataCellsWithoutHeaderCountBefore ?? 0);
    expect(row?.invariants?.ownershipPreserved).toBe(true);
    expect(row?.structuralBenefits?.tableValidityImproved).toBe(true);
  });

  it('retags empty corner data cells only when the explicit class is requested', async () => {
    const buf = buildEmptyCornerHeaderCellTablePdf();
    const generic = await runPythonMutationBatch(buf, [
      {
        op: 'normalize_table_structure',
        params: {
          tableFailureClass: 'short_header_row_template',
          maxTablesPerRun: 1,
          maxSyntheticCells: 4,
        },
      },
    ]);
    const genericRow = generic.result.opResults?.find(op => op.op === 'normalize_table_structure');
    expect(genericRow?.outcome).toBe('no_effect');

    const specific = await runPythonMutationBatch(buf, [
      {
        op: 'normalize_table_structure',
        params: {
          tableFailureClass: 'empty_corner_header_cell',
          maxTablesPerRun: 1,
        },
      },
    ]);

    expect(specific.result.success).toBe(true);
    const row = specific.result.opResults?.find(op => op.op === 'normalize_table_structure');
    expect(row?.outcome).toBe('applied');
    expect(row?.invariants?.dataCellsWithoutHeaderCountBefore).toBe(1);
    expect(row?.invariants?.dataCellsWithoutHeaderCountAfter).toBe(0);
    expect(row?.invariants?.orphanHeaderCellCountAfter).toBeLessThanOrEqual(row?.invariants?.orphanHeaderCellCountBefore ?? 0);
    expect(row?.invariants?.ownershipPreserved).toBe(true);
    expect(row?.structuralBenefits?.tableValidityImproved).toBe(true);
  });

  it('associates header-only tables only when explicitly requested', async () => {
    const buf = buildHeaderOnlyTablePdf();
    const generic = await runPythonMutationBatch(buf, [
      {
        op: 'set_table_header_cells',
        params: {
          tableHeaderAssociation: true,
          associateAllTableHeaders: true,
          maxTableHeaderAssociationTargets: 1,
        },
      },
    ]);
    const genericRow = generic.result.opResults?.find(op => op.op === 'set_table_header_cells');
    expect(genericRow?.outcome).toBe('no_effect');

    const explicit = await runPythonMutationBatch(buf, [
      {
        op: 'set_table_header_cells',
        params: {
          tableHeaderAssociation: true,
          associateAllTableHeaders: true,
          includeHeaderOnlyTables: true,
          maxTableHeaderAssociationTargets: 1,
        },
      },
    ]);

    expect(explicit.result.success).toBe(true);
    const row = explicit.result.opResults?.find(op => op.op === 'set_table_header_cells');
    expect(row?.outcome).toBe('applied');
    expect(row?.debug?.includeHeaderOnlyTables).toBe(true);
    expect(row?.invariants?.orphanHeaderCellCountBefore).toBe(1);
    expect(row?.invariants?.orphanHeaderCellCountAfter).toBe(0);
    expect(row?.invariants?.headerCellsWithScopeCountAfter).toBeGreaterThan(0);
    expect(row?.invariants?.ownershipPreserved).toBe(true);
    expect(row?.structuralBenefits?.tableValidityImproved).toBe(true);
  });

  it('removes empty leading table rows before padding strongly irregular tables', async () => {
    const buf = buildStronglyIrregularTableWithEmptyLeadingRowPdf();
    const { result } = await runPythonMutationBatch(buf, [
      {
        op: 'normalize_table_structure',
        params: {
          tableFailureClass: 'strongly_irregular_rows',
          maxTablesPerRun: 1,
          maxSyntheticCells: 8,
        },
      },
    ]);

    expect(result.success).toBe(true);
    const row = result.opResults?.find(op => op.op === 'normalize_table_structure');
    expect(row?.outcome).toBe('applied');
    expect(row?.invariants?.irregularRowsBefore).toBeGreaterThan(0);
    expect(row?.invariants?.irregularRowsAfter).toBe(0);
    expect(row?.invariants?.headerCellCountAfter).toBeGreaterThan(row?.invariants?.headerCellCountBefore ?? 0);
    expect(row?.invariants?.ownershipPreserved).toBe(true);
    expect(row?.invariants?.tableTreeValidAfter).toBe(true);
    expect(row?.structuralBenefits?.tableValidityImproved).toBe(true);
  });

  it('normalizes up to four strongly irregular dense tables in one bounded pass', async () => {
    const { buf } = buildMultipleStronglyIrregularTablesPdf();
    const { result } = await runPythonMutationBatch(buf, [
      {
        op: 'normalize_table_structure',
        params: {
          tableFailureClass: 'strongly_irregular_rows',
          maxTablesPerRun: 4,
          maxSyntheticCells: 32,
        },
      },
    ]);

    expect(result.success).toBe(true);
    const row = result.opResults?.find(op => op.op === 'normalize_table_structure');
    expect(row?.outcome).toBe('applied');
    expect(row?.invariants?.stronglyIrregularTableCountBefore).toBe(5);
    expect(row?.invariants?.stronglyIrregularTableCountAfter).toBe(1);
    expect(row?.structuralBenefits?.tableValidityImproved).toBe(true);
  });

  it('strictly normalizes only requested table refs and refuses mixed non-table batches', async () => {
    const { buf, tableRefs } = buildMultipleStronglyIrregularTablesPdf();
    const { result } = await runPythonMutationBatch(buf, [
      {
        op: 'normalize_table_structure',
        params: {
          structRefs: tableRefs.slice(0, 4),
          strictTableTargetRef: true,
          tableFailureClass: 'strongly_irregular_rows',
          maxTablesPerRun: 4,
          maxSyntheticCells: 32,
        },
      },
    ]);

    expect(result.success).toBe(true);
    const row = result.opResults?.find(op => op.op === 'normalize_table_structure');
    expect(row?.outcome).toBe('applied');
    expect(row?.debug?.requestedTargetRefs).toEqual(tableRefs.slice(0, 4));
    expect(row?.debug?.changedTargetRefs).toEqual(tableRefs.slice(0, 4));
    expect(row?.debug?.strictTableTargetRef).toBe(true);
    expect(row?.invariants?.stronglyIrregularTableCountAfter).toBe(1);

    const mixed = buildMixedTableAndParagraphPdf();
    const mixedResult = await runPythonMutationBatch(mixed.buf, [
      {
        op: 'normalize_table_structure',
        params: {
          structRefs: [mixed.tableRef, mixed.paragraphRef],
          strictTableTargetRef: true,
          tableFailureClass: 'strongly_irregular_rows',
          maxTablesPerRun: 2,
          maxSyntheticCells: 8,
        },
      },
    ]);
    const mixedRow = mixedResult.result.opResults?.find(op => op.op === 'normalize_table_structure');
    expect(mixedRow?.outcome).toBe('no_effect');
    expect(mixedRow?.debug?.changedTargetRefs).toEqual([]);
    expect(mixedRow?.debug?.skippedTargetRefs).toEqual([mixed.paragraphRef]);
    expect(mixedRow?.debug?.strictTableTargetRef).toBe(true);
  });
});
