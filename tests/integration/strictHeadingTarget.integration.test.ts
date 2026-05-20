import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { runPythonMutationBatch } from '../../src/python/bridge.js';

function buildNonParagraphHeadingTargetPdf(): { buffer: Buffer; lbodyRef: string } {
  const dir = mkdtempSync(join(tmpdir(), 'pdfaf-strict-heading-target-'));
  const pdfPath = join(dir, 'strict-heading.pdf');
  const refPath = join(dir, 'lbody-ref.txt');
  const script = join(dir, 'make_pdf.py');
  writeFileSync(script, `
import pikepdf
from pikepdf import Name, Dictionary, Array

pdf = pikepdf.Pdf.new()
page = pdf.add_blank_page(page_size=(612, 792))
root = pdf.Root
sr = pdf.make_indirect(Dictionary(Type=Name('/StructTreeRoot')))
root['/StructTreeRoot'] = sr
doc = pdf.make_indirect(Dictionary(Type=Name('/StructElem'), S=Name('/Document'), P=sr))
lbody = pdf.make_indirect(Dictionary(Type=Name('/StructElem'), S=Name('/LBody'), P=doc, Pg=page.obj))
fallback_p = pdf.make_indirect(Dictionary(Type=Name('/StructElem'), S=Name('/P'), P=doc, Pg=page.obj))
doc['/K'] = Array([lbody, fallback_p])
sr['/K'] = doc
n, g = lbody.objgen
with open(${JSON.stringify(refPath)}, 'w') as f:
    f.write(f"{n}_{g}")
pdf.save(${JSON.stringify(pdfPath)})
`);
  execFileSync('python3', [script]);
  return {
    buffer: readFileSync(pdfPath),
    lbodyRef: readFileSync(refPath, 'utf8').trim(),
  };
}

describe('strict report-layout heading target mutation', () => {
  it('refuses fallback when the requested target is not paragraph-like', async () => {
    const { buffer, lbodyRef } = buildNonParagraphHeadingTargetPdf();
    const { result } = await runPythonMutationBatch(buffer, [{
      op: 'create_heading_from_candidate',
      params: {
        targetRef: lbodyRef,
        level: 2,
        text: 'Fallback Heading',
        strictTargetRef: true,
      },
    }], { timeoutMs: 30_000 });

    expect(result.success).toBe(true);
    expect(result.applied).not.toContain('create_heading_from_candidate');
    expect(result.opResults?.[0]).toMatchObject({
      op: 'create_heading_from_candidate',
      outcome: 'no_effect',
      note: 'strict_target_not_paragraph_like',
    });
  }, 60_000);
});
