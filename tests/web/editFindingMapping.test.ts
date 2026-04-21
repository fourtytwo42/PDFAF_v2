import { describe, expect, it } from 'vitest';
import { mapAnalyzeFindingsToEditorIssues } from '../../apps/pdf-af-web/lib/editor/analyzeFindings';
import type { NormalizedFinding } from '../../apps/pdf-af-web/types/analyze';

function finding(overrides: Partial<NormalizedFinding>): NormalizedFinding {
  return {
    id: 'finding-1',
    title: 'Missing document title',
    summary: 'The PDF needs a title for assistive technology.',
    category: 'metadata',
    severity: 'critical',
    references: [
      {
        label: 'WCAG 2.4.2',
        href: 'https://www.w3.org/WAI/WCAG21/Understanding/page-titled.html',
        source: 'wcag',
      },
    ],
    ...overrides,
  };
}

function mapForEdit(findings: NormalizedFinding[]) {
  return mapAnalyzeFindingsToEditorIssues(findings, {
    source: 'analyzer',
    idPrefix: 'analyzer',
    fixTypePrefix: 'analyzer',
  });
}

describe('edit finding mapping', () => {
  it('maps analyzer findings to edit-mode issues', () => {
    const issues = mapForEdit([finding({ id: 'title' })]);

    expect(issues[0]).toMatchObject({
      id: 'analyzer:title',
      source: 'analyzer',
      category: 'metadata',
      fixType: 'analyzer_metadata',
      fixState: 'needs-input',
    });
  });

  it('maps critical and moderate findings to blockers', () => {
    const issues = mapForEdit([
      finding({ id: 'critical', severity: 'critical' }),
      finding({ id: 'moderate', severity: 'moderate' }),
    ]);

    expect(issues.map((issue) => issue.severity)).toEqual(['blocker', 'blocker']);
  });

  it('maps minor findings to warnings and pass findings to info', () => {
    const issues = mapForEdit([
      finding({ id: 'minor', severity: 'minor' }),
      finding({ id: 'pass', severity: 'pass' }),
    ]);

    expect(issues.map((issue) => issue.severity)).toEqual(['warning', 'info']);
  });

  it('preserves page, category, message, summary, and references', () => {
    const issues = mapForEdit([
      finding({
        id: 'alt',
        title: 'Figure needs alt text',
        summary: 'A figure is missing useful alternative text.',
        category: 'alt_text',
        page: 3,
        severity: 'minor',
      }),
    ]);

    expect(issues[0]).toMatchObject({
      id: 'analyzer:alt',
      page: 3,
      category: 'alt_text',
      message: 'Figure needs alt text',
      whyItMatters: 'A figure is missing useful alternative text.',
    });
    expect(issues[0]?.standardsLinks?.[0]?.label).toBe('WCAG 2.4.2');
  });

  it('preserves optional bounds evidence for overlays', () => {
    const issues = mapForEdit([
      finding({
        id: 'bounded',
        page: 1,
        bounds: { x: 10, y: 20, width: 30, height: 40 },
      }),
    ]);

    expect(issues[0]?.bounds).toEqual({ x: 10, y: 20, width: 30, height: 40 });
  });

  it('does not surface unevaluated contrast as an open repair issue', () => {
    const issues = mapForEdit([
      finding({
        id: 'contrast-not-measured',
        category: 'color_contrast',
        title: 'Color contrast was not evaluated',
        summary: 'Color contrast was not evaluated (no pixel sampling in this build).',
        severity: 'minor',
      }),
    ]);

    expect(issues[0]).toMatchObject({
      severity: 'info',
      fixState: 'fixed',
    });
  });
});
