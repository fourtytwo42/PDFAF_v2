import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { runPythonAnalysis, runPythonMutationBatch } from '../../src/python/bridge.js';

const LIBERATION_SANS = '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf';
const NOTO_SANS = '/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf';

function writeFixture(path: string, input: {
  baseFont: string;
  subtype?: string;
  firstChar?: number;
  lastChar?: number;
  widths?: number[];
  text?: string;
}) {
  const widths = input.widths ?? Array.from(
    { length: 1 + (input.lastChar ?? 255) - (input.firstChar ?? 32) },
    () => 500,
  );
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
    FontName=Name("${input.baseFont}"),
    Flags=32,
    FontBBox=Array([-100, -200, 1000, 900]),
    ItalicAngle=0,
    Ascent=900,
    Descent=-200,
    CapHeight=700,
    StemV=80,
)
font = Dictionary(
    Type=Name("/Font"),
    Subtype=Name("${input.subtype ?? '/Type1'}"),
    BaseFont=Name("${input.baseFont}"),
    Encoding=Name("/WinAnsiEncoding"),
    FirstChar=${input.firstChar ?? 32},
    LastChar=${input.lastChar ?? 255},
    Widths=Array(${JSON.stringify(widths)}),
    FontDescriptor=fd,
)
page.Resources["/Font"] = Dictionary(F1=font)
page["/Contents"] = Stream(pdf, b"BT /F1 12 Tf 100 700 Td (${input.text ?? 'Hi'}) Tj ET")
pdf.Root["/MarkInfo"] = Dictionary(Marked=True)
pdf.Root["/StructTreeRoot"] = Dictionary(Type=Name("/StructTreeRoot"))
pdf.save(out)
`;
  execFileSync('python3', ['-c', py, path]);
}

describe('embed_local_font_substitutes', () => {
  it.skipIf(!existsSync(LIBERATION_SANS))('embeds an exact open-font substitute and adds ToUnicode', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'pdfaf-local-font-'));
    try {
      const inPath = join(dir, 'in.pdf');
      writeFixture(inPath, { baseFont: '/Helvetica', subtype: '/Type1' });

      const { buffer: out, result } = await runPythonMutationBatch(readFileSync(inPath), [
        { op: 'embed_local_font_substitutes', params: {} },
      ]);
      expect(result.success).toBe(true);
      expect(result.applied).toContain('embed_local_font_substitutes');

      const outPath = join(dir, 'out.pdf');
      writeFileSync(outPath, out);
      const analysis = await runPythonAnalysis(outPath);
      const font = analysis.fonts.find(row => /Helvetica/i.test(row.name));
      expect(font?.isEmbedded).toBe(true);
      expect(font?.hasUnicode).toBe(true);
      expect(font?.encodingRisk).toBe(false);
      expect(analysis.isTagged).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it.skipIf(!existsSync(NOTO_SANS))('applies a curated legacy fallback when width drift is bounded', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'pdfaf-local-font-'));
    try {
      const inPath = join(dir, 'in.pdf');
      writeFixture(inPath, {
        baseFont: '/Frutiger-Roman',
        subtype: '/Type1',
        firstChar: 72,
        lastChar: 72,
        widths: [741],
        text: 'H',
      });

      const { buffer: out, result } = await runPythonMutationBatch(readFileSync(inPath), [
        { op: 'embed_local_font_substitutes', params: { maxWidthDrift: 0.12 } },
      ]);
      expect(result.success).toBe(true);
      expect(result.applied).toContain('embed_local_font_substitutes');

      const outPath = join(dir, 'out.pdf');
      writeFileSync(outPath, out);
      const analysis = await runPythonAnalysis(outPath);
      const font = analysis.fonts.find(row => /NotoSans/i.test(row.name));
      expect(font?.isEmbedded).toBe(true);
      expect(font?.hasUnicode).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it.skipIf(!existsSync(NOTO_SANS))('rejects a curated fallback when width drift exceeds the threshold', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'pdfaf-local-font-'));
    try {
      const inPath = join(dir, 'in.pdf');
      writeFixture(inPath, {
        baseFont: '/Frutiger-Roman',
        subtype: '/Type1',
        firstChar: 72,
        lastChar: 72,
        widths: [1],
        text: 'H',
      });

      const { result } = await runPythonMutationBatch(readFileSync(inPath), [
        { op: 'embed_local_font_substitutes', params: { maxWidthDrift: 0.12 } },
      ]);
      expect(result.success).toBe(true);
      expect(result.applied).not.toContain('embed_local_font_substitutes');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
