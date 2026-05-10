import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { runPythonMutationBatch } from '../../src/python/bridge.js';

function buildDuplicateMcidParentTreePdf(): Buffer {
  const dir = mkdtempSync(join(tmpdir(), 'pdfaf-parenttree-mcid-'));
  const pdfPath = join(dir, 'parenttree.pdf');
  const script = join(dir, 'make_parenttree.py');
  writeFileSync(script, `
import pikepdf
from pikepdf import Name, Dictionary, Array

pdf = pikepdf.Pdf.new()
page = pdf.add_blank_page(page_size=(612, 792))
page.obj['/StructParents'] = 0
root = pdf.Root
sr = pdf.make_indirect(Dictionary(Type=Name('/StructTreeRoot')))
root['/StructTreeRoot'] = sr
doc = pdf.make_indirect(Dictionary(Type=Name('/StructElem'), S=Name('/Document'), P=sr))
owner = pdf.make_indirect(Dictionary(Type=Name('/StructElem'), S=Name('/H2'), P=doc, Pg=page.obj, K=16))
duplicate = pdf.make_indirect(Dictionary(Type=Name('/StructElem'), S=Name('/Normal'), P=doc, Pg=page.obj, K=16))
doc['/K'] = Array([duplicate, owner])
sr['/K'] = doc
sr['/ParentTree'] = pdf.make_indirect(Dictionary(Nums=Array([0, pdf.make_indirect(Array([None] * 16 + [owner]))])))
sr['/ParentTreeNextKey'] = 1
pdf.save(${JSON.stringify(pdfPath)})
`);
  execFileSync('python3', [script]);
  return readFileSync(pdfPath);
}

function parentTreeAudit(buf: Buffer) {
  const dir = mkdtempSync(join(tmpdir(), 'pdfaf-parenttree-audit-'));
  const pdfPath = join(dir, 'audit.pdf');
  writeFileSync(pdfPath, buf);
  const raw = execFileSync('python3', ['python/pdf_analysis_helper.py', pdfPath], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
  return JSON.parse(raw).parentTreeAudit;
}

describe('ParentTree MCID reference repair python mutation', () => {
  it('removes duplicate MCID ownership when ParentTree already identifies the canonical owner', async () => {
    const before = buildDuplicateMcidParentTreePdf();
    expect(parentTreeAudit(before).objectReferenceMismatchCount).toBe(1);

    const { buffer, result } = await runPythonMutationBatch(before, [
      { op: 'repair_parent_tree_mcid_references', params: {} },
    ]);

    const row = result.opResults?.find(op => op.op === 'repair_parent_tree_mcid_references');
    expect(row?.outcome).toBe('applied');
    expect(row?.note).toContain('parent_tree_mcid_references_repaired');
    expect(parentTreeAudit(buffer).objectReferenceMismatchCount).toBe(0);
  });
});
