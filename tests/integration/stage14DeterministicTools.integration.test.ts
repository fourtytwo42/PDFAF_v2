import { describe, expect, it } from 'vitest';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runPythonAnalysis, runPythonMutationBatch } from '../../src/python/bridge.js';

const execFileAsync = promisify(execFile);

async function buildUntaggedStructurePdf(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let pageIndex = 0; pageIndex < 3; pageIndex++) {
    const page = doc.addPage([612, 792]);
    page.drawText('Confidential Report', { x: 72, y: 760, size: 11, font });
    page.drawText(pageIndex === 0 ? 'Runtime Neutral Accessibility Upgrade' : `Section ${pageIndex + 1}`, {
      x: 72,
      y: 720,
      size: pageIndex === 0 ? 22 : 18,
      font,
    });
    page.drawText(`This is body paragraph ${pageIndex + 1} with enough text to produce a deterministic paragraph block for the structure bootstrap lane.`, {
      x: 72,
      y: 680,
      size: 12,
      font,
      maxWidth: 420,
      lineHeight: 14,
    });
    page.drawText('Confidential Report', { x: 72, y: 48, size: 11, font });
  }
  return Buffer.from(await doc.save({ useObjectStreams: false }));
}

describe('Stage 14 deterministic tools', () => {
  it('synthesize_basic_structure_from_layout creates a tagged structure with headings', async () => {
    const buf = await buildUntaggedStructurePdf();
    const { buffer, result } = await runPythonMutationBatch(buf, [
      { op: 'synthesize_basic_structure_from_layout', params: {} },
    ]);
    expect(result.success).toBe(true);
    expect(result.applied).toContain('synthesize_basic_structure_from_layout');

    const dir = await mkdtemp(join(tmpdir(), 'pdfaf-stage14-struct-'));
    const pdfPath = join(dir, 'out.pdf');
    await writeFile(pdfPath, buffer);
    const after = await runPythonAnalysis(pdfPath);
    expect(after.isTagged).toBe(true);
    expect(after.structureTree).not.toBeNull();
    expect(after.headings.length).toBeGreaterThanOrEqual(2);
    expect((after.paragraphStructElems?.length ?? 0)).toBeGreaterThanOrEqual(2);
  });

  it('artifact_repeating_page_furniture removes repeated header/footer text from structured text elements', async () => {
    const buf = await buildUntaggedStructurePdf();
    const synthesized = await runPythonMutationBatch(buf, [
      { op: 'synthesize_basic_structure_from_layout', params: {} },
    ]);
    expect(synthesized.result.success).toBe(true);

    const dir = await mkdtemp(join(tmpdir(), 'pdfaf-stage14-furniture-'));
    const beforePath = join(dir, 'before.pdf');
    const afterPath = join(dir, 'after.pdf');
    await writeFile(beforePath, synthesized.buffer);
    const before = await runPythonAnalysis(beforePath);
    const beforeTexts = [
      ...before.headings.map(item => item.text),
      ...(before.paragraphStructElems ?? []).map(item => item.text),
    ];
    expect(beforeTexts.some(text => text.includes('Confidential Report'))).toBe(true);

    const artifacted = await runPythonMutationBatch(synthesized.buffer, [
      { op: 'artifact_repeating_page_furniture', params: {} },
    ]);
    expect(artifacted.result.success).toBe(true);
    expect(artifacted.result.applied).toContain('artifact_repeating_page_furniture');
    await writeFile(afterPath, artifacted.buffer);
    const after = await runPythonAnalysis(afterPath);
    const afterTexts = [
      ...after.headings.map(item => item.text),
      ...(after.paragraphStructElems ?? []).map(item => item.text),
    ];
    expect(afterTexts.some(text => text.includes('Confidential Report'))).toBe(false);
  });

  it('canonicalize_figure_alt_ownership preserves one outer figure alt and clears nested alt debt', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pdfaf-stage14-alt-'));
    const pdfPath = join(dir, 'nested.pdf');
    const script = join(process.cwd(), 'tests/fixtures/scripts/write_nested_figure_alt_pdf.py');
    await execFileAsync('python3', [script, pdfPath]);

    const before = await runPythonAnalysis(pdfPath);
    expect(before.acrobatStyleAltRisks?.nestedFigureAltCount ?? 0).toBeGreaterThan(0);

    const buf = await readFile(pdfPath);
    const { buffer, result } = await runPythonMutationBatch(buf, [
      { op: 'canonicalize_figure_alt_ownership', params: {} },
    ]);
    expect(result.success).toBe(true);
    expect(result.applied).toContain('canonicalize_figure_alt_ownership');

    const outPath = join(dir, 'out.pdf');
    await writeFile(outPath, buffer);
    const after = await runPythonAnalysis(outPath);
    expect(after.acrobatStyleAltRisks?.nestedFigureAltCount ?? 0).toBe(0);
    const nonArtifactFigures = after.figures.filter(figure => !figure.isArtifact);
    expect(nonArtifactFigures.length).toBeGreaterThan(0);
    expect(nonArtifactFigures.filter(figure => figure.hasAlt && figure.altText?.trim()).length).toBe(1);
  });
});
