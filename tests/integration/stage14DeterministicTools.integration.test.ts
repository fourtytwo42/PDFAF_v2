import { describe, expect, it } from 'vitest';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runPythonAnalysis, runPythonMutationBatch } from '../../src/python/bridge.js';
import { analyzePdf } from '../../src/services/pdfAnalyzer.js';

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

async function buildEmbeddedPageXObjectPdf(): Promise<Buffer> {
  const source = await PDFDocument.create();
  const font = await source.embedFont(StandardFonts.Helvetica);
  for (let pageIndex = 0; pageIndex < 2; pageIndex++) {
    const page = source.addPage([612, 792]);
    page.drawText(pageIndex === 0 ? 'Embedded Accessibility Plan' : `Embedded Section ${pageIndex + 1}`, {
      x: 72,
      y: 720,
      size: pageIndex === 0 ? 20 : 18,
      font,
    });
    page.drawText(
      `This content is drawn inside a form XObject wrapper so the outer page stream mainly contains Do operators instead of direct BT/ET groups.`,
      {
        x: 72,
        y: 680,
        size: 12,
        font,
        maxWidth: 420,
        lineHeight: 14,
      },
    );
  }

  const outer = await PDFDocument.create();
  const embeddedPages = await outer.embedPages(source.getPages());
  for (const embedded of embeddedPages) {
    const page = outer.addPage([612, 792]);
    page.drawPage(embedded, { x: 0, y: 0, width: 612, height: 792 });
  }
  return Buffer.from(await outer.save({ useObjectStreams: false }));
}

describe('Stage 14 deterministic tools', () => {
  it('synthesize_basic_structure_from_layout creates a tagged structure with headings', async () => {
    const buf = await buildUntaggedStructurePdf();
    process.env['PDFAF_DEBUG_DETERMINISTIC_REMEDIATION'] = '1';
    let buffer: Buffer;
    let result: Awaited<ReturnType<typeof runPythonMutationBatch>>['result'];
    try {
      ({ buffer, result } = await runPythonMutationBatch(buf, [
        { op: 'synthesize_basic_structure_from_layout', params: {} },
      ]));
    } finally {
      delete process.env['PDFAF_DEBUG_DETERMINISTIC_REMEDIATION'];
    }
    expect(result.success).toBe(true);
    expect(result.applied).toContain('synthesize_basic_structure_from_layout');
    const debug = result.opResults?.find(row => row.op === 'synthesize_basic_structure_from_layout')?.debug;
    expect(debug?.rootReachableDepth ?? 0).toBeGreaterThanOrEqual(2);
    expect(debug?.rootChildrenCount ?? 0).toBeGreaterThan(0);
    expect(debug?.rootReachableHeadingCount ?? 0).toBeGreaterThan(0);
    expect(debug?.pageStructParentsCount ?? 0).toBeGreaterThan(0);
    expect(debug?.pageParentTreeArrayCount ?? 0).toBeGreaterThan(0);
    expect(debug?.pageParentTreeNonEmptyCount ?? 0).toBeGreaterThan(0);
    expect(debug?.topLevelNonEmptyCount ?? 0).toBeGreaterThan(0);

    const dir = await mkdtemp(join(tmpdir(), 'pdfaf-stage14-struct-'));
    const pdfPath = join(dir, 'out.pdf');
    await writeFile(pdfPath, buffer);
    const after = await runPythonAnalysis(pdfPath);
    expect(after.isTagged).toBe(true);
    expect(after.structureTree).not.toBeNull();
    expect(after.headings.length).toBeGreaterThanOrEqual(2);
    expect((after.paragraphStructElems?.length ?? 0)).toBeGreaterThanOrEqual(2);
  });

  it('bootstrap alone does not count as heading recovery, but synthesize fixes shell-tree PDFs', async () => {
    const buf = await buildUntaggedStructurePdf();
    process.env['PDFAF_DEBUG_DETERMINISTIC_REMEDIATION'] = '1';
    let bootstrapped: Awaited<ReturnType<typeof runPythonMutationBatch>>;
    let synthesized: Awaited<ReturnType<typeof runPythonMutationBatch>>;
    try {
      bootstrapped = await runPythonMutationBatch(buf, [
        { op: 'bootstrap_struct_tree', params: {} },
      ]);
      synthesized = await runPythonMutationBatch(bootstrapped.buffer, [
        { op: 'synthesize_basic_structure_from_layout', params: {} },
      ]);
    } finally {
      delete process.env['PDFAF_DEBUG_DETERMINISTIC_REMEDIATION'];
    }
    expect(bootstrapped.result.success).toBe(true);
    expect(bootstrapped.result.applied).toContain('bootstrap_struct_tree');

    const dir = await mkdtemp(join(tmpdir(), 'pdfaf-stage14-shell-'));
    const bootstrapPath = join(dir, 'bootstrap.pdf');
    await writeFile(bootstrapPath, bootstrapped.buffer);
    const bootstrapDebug = bootstrapped.result.opResults?.find(row => row.op === 'bootstrap_struct_tree')?.debug;
    expect(bootstrapDebug?.rootReachableDepth ?? 0).toBeLessThanOrEqual(1);
    const bootstrapAnalysis = await analyzePdf(bootstrapPath, 'bootstrap.pdf', { bypassCache: true });
    expect(bootstrapAnalysis.result.categories.find(c => c.key === 'heading_structure')?.score).toBe(0);

    expect(synthesized.result.success).toBe(true);
    expect(synthesized.result.applied).toContain('synthesize_basic_structure_from_layout');
    const synthDebug = synthesized.result.opResults?.find(row => row.op === 'synthesize_basic_structure_from_layout')?.debug;
    expect(synthDebug?.rootReachableDepth ?? 0).toBeGreaterThanOrEqual(2);

    const synthesizedPath = join(dir, 'synthesized.pdf');
    await writeFile(synthesizedPath, synthesized.buffer);
    const after = await analyzePdf(synthesizedPath, 'synthesized.pdf', { bypassCache: true });
    expect(after.snapshot.structureTree).not.toBeNull();
    expect(after.snapshot.headings.length).toBeGreaterThan(0);
    expect(after.result.categories.find(c => c.key === 'heading_structure')?.score ?? 0).toBeGreaterThan(0);
    expect(after.result.categories.find(c => c.key === 'reading_order')?.score ?? 0).toBeGreaterThanOrEqual(90);
  });

  it('normalize_heading_hierarchy eliminates duplicate global H1 objects', async () => {
    const buf = await buildUntaggedStructurePdf();
    const synthesized = await runPythonMutationBatch(buf, [
      { op: 'synthesize_basic_structure_from_layout', params: {} },
    ]);
    expect(synthesized.result.success).toBe(true);

    const dir = await mkdtemp(join(tmpdir(), 'pdfaf-stage14-h1-'));
    const beforePath = join(dir, 'before.pdf');
    await writeFile(beforePath, synthesized.buffer);
    const before = await runPythonAnalysis(beforePath);
    const paragraph = (before.paragraphStructElems ?? [])[0];
    expect(paragraph?.structRef).toBeTruthy();

    const withDuplicate = await runPythonMutationBatch(synthesized.buffer, [
      { op: 'create_heading_from_candidate', params: { targetRef: paragraph!.structRef, level: 1 } },
    ]);
    expect(withDuplicate.result.success).toBe(true);

    process.env['PDFAF_DEBUG_DETERMINISTIC_REMEDIATION'] = '1';
    let normalized: Awaited<ReturnType<typeof runPythonMutationBatch>>;
    try {
      normalized = await runPythonMutationBatch(withDuplicate.buffer, [
        { op: 'normalize_heading_hierarchy', params: {} },
      ]);
    } finally {
      delete process.env['PDFAF_DEBUG_DETERMINISTIC_REMEDIATION'];
    }
    expect(normalized.result.success).toBe(true);
    expect(normalized.result.applied).toContain('normalize_heading_hierarchy');
    const debug = normalized.result.opResults?.find(row => row.op === 'normalize_heading_hierarchy')?.debug;
    expect(debug?.globalH1Count).toBe(1);

    const afterPath = join(dir, 'after.pdf');
    await writeFile(afterPath, normalized.buffer);
    const after = await runPythonAnalysis(afterPath);
    expect(after.headings.filter(item => item.level === 1)).toHaveLength(1);
  });

  it('set_document_title survives final output with a descriptive metadata title', async () => {
    const buf = await buildUntaggedStructurePdf();
    const titled = await runPythonMutationBatch(buf, [
      { op: 'set_document_title', params: { title: 'Runtime Neutral Accessibility Upgrade' } },
    ]);
    expect(titled.result.success).toBe(true);
    expect(titled.result.applied).toContain('set_document_title');

    const dir = await mkdtemp(join(tmpdir(), 'pdfaf-stage14-title-'));
    const pdfPath = join(dir, 'report_v3_final.pdf');
    await writeFile(pdfPath, titled.buffer);
    const analyzed = await analyzePdf(pdfPath, 'report_v3_final.pdf', { bypassCache: true });
    expect(analyzed.snapshot.metadata.title).toBe('Runtime Neutral Accessibility Upgrade');
  });

  it('synthesize_basic_structure_from_layout falls back to visible page segments for XObject-heavy pages', async () => {
    const buf = await buildEmbeddedPageXObjectPdf();
    const bootstrapped = await runPythonMutationBatch(buf, [
      { op: 'bootstrap_struct_tree', params: {} },
    ]);
    const synthesized = await runPythonMutationBatch(bootstrapped.buffer, [
      { op: 'synthesize_basic_structure_from_layout', params: {} },
    ]);
    expect(synthesized.result.success).toBe(true);
    expect(synthesized.result.applied).toContain('synthesize_basic_structure_from_layout');
    expect(
      synthesized.result.opResults?.find(row => row.op === 'synthesize_basic_structure_from_layout')?.note,
    ).toContain('fallback_visible_segments_applied');

    const dir = await mkdtemp(join(tmpdir(), 'pdfaf-stage14-xobject-'));
    const synthesizedPath = join(dir, 'xobject.pdf');
    await writeFile(synthesizedPath, synthesized.buffer);
    const after = await analyzePdf(synthesizedPath, 'xobject.pdf', { bypassCache: true });
    expect(after.snapshot.structureTree).not.toBeNull();
    expect(after.snapshot.headings.length).toBeGreaterThan(0);
    expect(after.result.categories.find(c => c.key === 'heading_structure')?.score ?? 0).toBeGreaterThan(0);
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

  it('create_heading_from_candidate promotes a paragraph-like struct elem to a heading', async () => {
    const buf = await buildUntaggedStructurePdf();
    const synthesized = await runPythonMutationBatch(buf, [
      { op: 'synthesize_basic_structure_from_layout', params: {} },
    ]);
    expect(synthesized.result.success).toBe(true);

    const dir = await mkdtemp(join(tmpdir(), 'pdfaf-stage141-heading-'));
    const beforePath = join(dir, 'before.pdf');
    await writeFile(beforePath, synthesized.buffer);
    const before = await runPythonAnalysis(beforePath);
    const paragraph = (before.paragraphStructElems ?? [])[0];
    expect(paragraph?.structRef).toBeTruthy();

    const promoted = await runPythonMutationBatch(synthesized.buffer, [
      { op: 'create_heading_from_candidate', params: { targetRef: paragraph!.structRef, level: 2 } },
    ]);
    expect(promoted.result.success).toBe(true);
    expect(promoted.result.applied).toContain('create_heading_from_candidate');

    const outPath = join(dir, 'out.pdf');
    await writeFile(outPath, promoted.buffer);
    const after = await runPythonAnalysis(outPath);
    expect(after.headings.some(item => item.structRef === paragraph!.structRef && item.level === 2)).toBe(true);
  });

  it('normalize_nested_figure_containers clears nested figure alt debt before ownership cleanup', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pdfaf-stage141-nested-'));
    const pdfPath = join(dir, 'nested.pdf');
    const script = join(process.cwd(), 'tests/fixtures/scripts/write_nested_figure_alt_pdf.py');
    await execFileAsync('python3', [script, pdfPath]);

    const buf = await readFile(pdfPath);
    const { buffer, result } = await runPythonMutationBatch(buf, [
      { op: 'normalize_nested_figure_containers', params: {} },
    ]);
    expect(result.success).toBe(true);
    expect(result.applied).toContain('normalize_nested_figure_containers');

    const outPath = join(dir, 'out.pdf');
    await writeFile(outPath, buffer);
    const after = await runPythonAnalysis(outPath);
    expect(after.acrobatStyleAltRisks?.nestedFigureAltCount ?? 0).toBe(0);
  });
});
