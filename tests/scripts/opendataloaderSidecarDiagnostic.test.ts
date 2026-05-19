import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  loadPdfInputs,
  parseArgs,
  runCommandWithTimeout,
  summarizeOpenDataLoaderJson,
} from '../../scripts/opendataloader-sidecar-diagnostic.js';

describe('OpenDataLoader sidecar diagnostic helpers', () => {
  it('parses repeatable PDF inputs and sidecar settings', () => {
    const args = parseArgs([
      '--pdf', 'Input/a.pdf',
      '--pdf', 'Input/b.pdf',
      '--out', '/tmp/odl-out',
      '--limit', '1',
      '--odl-cmd', 'custom-odl',
      '--timeout-ms', '25',
    ]);
    expect(args.pdfs).toHaveLength(2);
    expect(args.outDir).toBe('/tmp/odl-out');
    expect(args.limit).toBe(1);
    expect(args.odlCmd).toBe('custom-odl');
    expect(args.timeoutMs).toBe(25);
  });

  it('loads manifest rows and de-duplicates PDF paths', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pdfaf-odl-test-'));
    try {
      const manifest = join(dir, 'manifest.json');
      await writeFile(manifest, JSON.stringify({
        rows: [
          { id: 'one', file: 'one.pdf', title: 'One' },
          { id: 'one-repeat', file: 'one.pdf' },
          { id: 'two', localFile: 'two.pdf' },
        ],
      }));
      const inputs = await loadPdfInputs({
        pdfs: [],
        manifest,
        outDir: dir,
        odlCmd: 'opendataloader-pdf',
        timeoutMs: 60_000,
      });
      expect(inputs.map(input => input.id)).toEqual(['one', 'two']);
      expect(inputs[0]!.pdfPath).toBe(join(dir, 'one.pdf'));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('records missing OpenDataLoader command as diagnostic status', async () => {
    const result = await runCommandWithTimeout('pdfaf-missing-odl-command-for-test', [], 1_000);
    expect(result.status).toBe('missing_command');
    expect(result.error).toMatch(/pdfaf-missing-odl-command-for-test|ENOENT|not found/i);
  });

  it('records timeout as row failure signal', async () => {
    const result = await runCommandWithTimeout(
      process.execPath,
      ['-e', 'setTimeout(() => {}, 5000)'],
      25,
    );
    expect(result.status).toBe('timeout');
  });

  it('summarizes OpenDataLoader heading, table, image, caption, and text evidence', () => {
    const summary = summarizeOpenDataLoaderJson({
      elements: [
        { type: 'heading', level: 2, text: 'Overview' },
        { type: 'table', rowCount: 4, columnCount: 3 },
        { type: 'image' },
        { type: 'caption', text: 'Figure 1. Example' },
      ],
    });
    expect(summary.headingCount).toBe(1);
    expect(summary.headingLevels).toEqual([2]);
    expect(summary.tableCount).toBe(1);
    expect(summary.denseTableHintCount).toBe(1);
    expect(summary.imageCount).toBe(1);
    expect(summary.captionCount).toBe(1);
    expect(summary.textSamples).toEqual(['Overview', 'Figure 1. Example']);
  });
});
