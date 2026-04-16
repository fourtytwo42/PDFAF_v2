import { existsSync, mkdtempSync, writeFileSync, unlinkSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { runPythonAnalysis, runPythonMutationBatch } from '../../src/python/bridge.js';

const URW_MARK = '/usr/share/fonts/type1/urw-base35/C059-Roman.afm';

describe('embed_urw_type1_substitutes', () => {
  it.skipIf(!existsSync(URW_MARK))('embeds URW Type1 for non-embedded Century-Book and preserves tags', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'pdfaf-urw-it-'));
    const inPath = join(dir, 'in.pdf');
    const py = `
import sys
import pikepdf
from pikepdf import Name, Dictionary, Array, Stream
out = sys.argv[1]
pdf = pikepdf.Pdf.new()
pdf.add_blank_page(page_size=(612, 792))
page = pdf.pages[0]
fd = Dictionary(
    Type=Name("/FontDescriptor"),
    FontName=Name("/Century-Book"),
    Flags=34,
    FontBBox=Array([-100, -200, 1000, 900]),
    ItalicAngle=0,
    Ascent=900,
    Descent=-200,
    CapHeight=700,
    StemV=80,
)
font = Dictionary(
    Type=Name("/Font"),
    Subtype=Name("/Type1"),
    BaseFont=Name("/Century-Book"),
    Encoding=Name("/WinAnsiEncoding"),
    FirstChar=32,
    LastChar=255,
    Widths=Array([500] * 224),
    FontDescriptor=fd,
)
page.Resources["/Font"] = Dictionary(F1=font)
page["/Contents"] = Stream(pdf, b"BT /F1 12 Tf 100 700 Td (Hi) Tj ET")
sr = Dictionary(Type=Name("/StructTreeRoot"))
pdf.Root["/MarkInfo"] = Dictionary(Marked=True)
pdf.Root["/StructTreeRoot"] = sr
pdf.save(out)
`;
    execFileSync('python3', ['-c', py, inPath]);

    const buf = readFileSync(inPath);
    const { buffer: out, result } = await runPythonMutationBatch(buf, [
      { op: 'embed_urw_type1_substitutes', params: {} },
    ]);
    expect(result.success).toBe(true);
    expect(result.applied).toContain('embed_urw_type1_substitutes');

    const analyzedPath = join(dir, 'out.pdf');
    writeFileSync(analyzedPath, out);
    try {
      const analysis = await runPythonAnalysis(analyzedPath);
      const c059 = analysis.fonts.find(f => /C059/i.test(f.name));
      expect(c059?.isEmbedded).toBe(true);
      expect(analysis.isTagged).toBe(true);
    } finally {
      try {
        unlinkSync(analyzedPath);
      } catch {
        /* ignore */
      }
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
