import { describe, expect, it } from 'vitest';
import { buildNativeLayoutAudit, type NativeLayoutTextRun } from '../../src/services/layout/nativeLayoutAudit.js';

function run(
  pageNumber: number,
  text: string,
  x: number,
  y: number,
  width = 80,
  height = 12,
): NativeLayoutTextRun {
  return { pageNumber, pageWidth: 612, pageHeight: 792, text, x, y, width, height };
}

describe('native layout audit', () => {
  it('does not flag single-column document order as risky', () => {
    const audit = buildNativeLayoutAudit([
      run(0, 'One', 72, 700),
      run(0, 'Two', 72, 680),
      run(0, 'Three', 72, 660),
      run(0, 'Four', 72, 640),
      run(0, 'Five', 72, 620),
      run(0, 'Six', 72, 600),
    ]);

    expect(audit.multiColumnPageCount).toBe(0);
    expect(audit.geometryOrderRiskPages).toBe(0);
  });

  it('flags interleaved two-column raw order as geometry order risk', () => {
    const audit = buildNativeLayoutAudit([
      run(0, 'Left one', 72, 700),
      run(0, 'Right one', 360, 700),
      run(0, 'Left two', 72, 680),
      run(0, 'Right two', 360, 680),
      run(0, 'Left three', 72, 660),
      run(0, 'Right three', 360, 660),
      run(0, 'Left four', 72, 640),
      run(0, 'Right four', 360, 640),
    ]);

    expect(audit.multiColumnPageCount).toBe(1);
    expect(audit.geometryOrderRiskPages).toBe(1);
  });

  it('detects repeated header/footer text without counting it as a heading', () => {
    const audit = buildNativeLayoutAudit([
      run(0, 'Agency Report', 72, 760),
      run(1, 'Agency Report', 72, 760),
      run(0, 'Real Section Title', 72, 650, 180, 18),
      run(1, 'Another Section', 72, 650, 160, 18),
    ]);

    expect(audit.repeatedHeaderFooterBandCount).toBe(1);
    expect(audit.repeatedHeaderFooterPageCount).toBe(2);
    expect(audit.layoutHeadingCandidates.map(candidate => candidate.text)).not.toContain('Agency Report');
    expect(audit.layoutHeadingCandidateCount).toBeGreaterThan(0);
  });

  it('detects caption-like lines and excludes them from heading candidates', () => {
    const audit = buildNativeLayoutAudit([
      run(0, 'Figure 1. Arrest trends', 80, 250, 180, 10),
      run(0, 'Methodology', 80, 710, 120, 18),
    ]);

    expect(audit.captionCandidateCount).toBe(1);
    expect(audit.captionCandidates[0]?.text).toBe('Figure 1. Arrest trends');
    expect(audit.layoutHeadingCandidates.map(candidate => candidate.text)).not.toContain('Figure 1. Arrest trends');
  });

  it('detects dense row-band table candidates', () => {
    const audit = buildNativeLayoutAudit([
      run(0, 'Year', 72, 650),
      run(0, 'County', 180, 650),
      run(0, 'Total', 300, 650),
      run(0, '2023', 72, 630),
      run(0, 'A', 180, 630),
      run(0, '14', 300, 630),
      run(0, '2024', 72, 610),
      run(0, 'B', 180, 610),
      run(0, '20', 300, 610),
    ]);

    expect(audit.layoutTableCandidateCount).toBe(1);
    expect(audit.denseRowBandTableCandidateCount).toBe(1);
  });

  it('does not flag sparse aligned text as a table candidate', () => {
    const audit = buildNativeLayoutAudit([
      run(0, 'Name', 72, 650),
      run(0, 'Total', 300, 650),
      run(0, 'A short paragraph follows here.', 72, 620, 240),
    ]);

    expect(audit.layoutTableCandidateCount).toBe(0);
    expect(audit.denseRowBandTableCandidateCount).toBe(0);
  });
});
