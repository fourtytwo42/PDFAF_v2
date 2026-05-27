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

function buildMultipleStronglyIrregularTablesPdf(): Buffer {
  const dir = mkdtempSync(join(tmpdir(), 'pdfaf-table-irregular-multi-'));
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
    expect(row?.invariants?.headerCellsWithScopeCountAfter).toBeGreaterThan(0);
    expect(row?.invariants?.dataCellsWithHeadersCountAfter).toBeGreaterThan(0);
    expect(row?.invariants?.ownershipPreserved).toBe(true);
    expect(row?.invariants?.orphanMcidCountAfter).toBeLessThanOrEqual(row?.invariants?.orphanMcidCountBefore ?? 0);
    expect(row?.invariants?.parentTreeDebtAfter).toBeLessThanOrEqual(row?.invariants?.parentTreeDebtBefore ?? 0);
    expect(row?.invariants?.tableTreeValidAfter).toBe(true);
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
      { op: 'set_table_header_cells', params: { structRefs: tableRefs, tableHeaderAssociation: true } },
    ]);

    expect(result.success).toBe(true);
    const row = result.opResults?.find(op => op.op === 'set_table_header_cells');
    expect(row?.outcome).toBe('applied');
    expect(row?.note).toBe('table_header_association_batch_improved');
    expect(row?.debug?.targetRefs).toEqual(tableRefs);
    expect(row?.invariants?.headerCellCountBefore).toBe(row?.invariants?.headerCellCountAfter);
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
    const buf = buildMultipleStronglyIrregularTablesPdf();
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
});
