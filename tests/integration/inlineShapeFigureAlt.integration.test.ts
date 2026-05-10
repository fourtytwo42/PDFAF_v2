import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import { runPythonMutationBatch } from '../../src/python/bridge.js';
import { analyzePdf } from '../../src/services/pdfAnalyzer.js';

/**
 * Word PDFs use /InlineShape and /Shape instead of /Figure; Acrobat still runs
 * "Figures alternate text" on them.
 */
describe('repair_alt_text_structure + Word InlineShape / Shape roles', () => {
  it('adds alt text and RoleMap entries for content-backed InlineShape nodes', async () => {
    const input = join(tmpdir(), `pdfaf-inline-rolemap-in-${randomUUID()}.pdf`);
    const output = join(tmpdir(), `pdfaf-inline-rolemap-out-${randomUUID()}.pdf`);
    execFileSync('python3', ['-c', `
import pikepdf, sys
from pikepdf import Name, Dictionary, Array
pdf = pikepdf.Pdf.new()
page = pdf.add_blank_page(page_size=(200, 200))
page.obj['/StructParents'] = 0
sr = pdf.make_indirect(Dictionary(Type=Name('/StructTreeRoot')))
doc = pdf.make_indirect(Dictionary(Type=Name('/StructElem'), S=Name('/Document')))
shape = pdf.make_indirect(Dictionary(Type=Name('/StructElem'), S=Name('/InlineShape')))
shape['/P'] = doc
shape['/Pg'] = page.obj
shape['/K'] = 0
doc['/K'] = Array([shape])
sr['/K'] = doc
pdf.Root['/StructTreeRoot'] = sr
pdf.save(sys.argv[1])
`, input]);
    try {
      const { buffer: out, result } = await runPythonMutationBatch(readFileSync(input), [
        { op: 'repair_alt_text_structure', params: {} },
      ]);
      expect(result.success).toBe(true);
      writeFileSync(output, out);
      const inspected = JSON.parse(execFileSync('python3', ['-c', `
import json, pikepdf, sys
with pikepdf.Pdf.open(sys.argv[1]) as pdf:
    sr = pdf.Root['/StructTreeRoot']
    shape = sr['/K']['/K'][0]
    print(json.dumps({
        'role': str(shape['/S']),
        'alt': str(shape.get('/Alt') or ''),
        'inlineShapeRoleMap': str(sr['/RoleMap'].get('/InlineShape')),
    }))
`, output], { encoding: 'utf8' }));
      expect(inspected.role).toBe('/InlineShape');
      expect(inspected.alt.length).toBeGreaterThan(0);
      expect(inspected.inlineShapeRoleMap).toBe('/Figure');
    } finally {
      for (const path of [input, output]) {
        if (existsSync(path)) unlinkSync(path);
      }
    }
  });

  it('fills missing /Alt and reports figures for InlineShape and Shape tags', async () => {
    const pdfPath = join(
      process.cwd(),
      'Output/corpus_1_2_local_pass/corpus_1__11_font_unicode_child_abuse_19972007_remediated.pdf',
    );
    if (!existsSync(pdfPath)) {
      return;
    }
    const buf = readFileSync(pdfPath);
    const before = await analyzePdf(pdfPath, '11.pdf');
    expect(before.snapshot.figures.length).toBeGreaterThan(0);
    const missingBefore = before.snapshot.figures.filter(
      f => !f.isArtifact && (!f.hasAlt || !f.altText?.trim()),
    );
    expect(missingBefore.length).toBeGreaterThan(0);

    const { buffer: out, result } = await runPythonMutationBatch(buf, [
      { op: 'repair_alt_text_structure', params: {} },
    ]);
    expect(result.success).toBe(true);

    const tmp = join(tmpdir(), `pdfaf-inline-${randomUUID()}.pdf`);
    writeFileSync(tmp, out);
    try {
      const after = await analyzePdf(tmp, '11.pdf');
      const missingAfter = after.snapshot.figures.filter(
        f => !f.isArtifact && (!f.hasAlt || !f.altText?.trim()),
      );
      expect(missingAfter.length).toBe(0);
    } finally {
      unlinkSync(tmp);
    }
  });
});
