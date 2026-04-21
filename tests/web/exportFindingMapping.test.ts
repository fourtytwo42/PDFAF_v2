import { describe, expect, it } from 'vitest';
import { mapAnalyzeFindingsToEditorIssues } from '../../apps/pdf-af-web/lib/editor/createExport';
import type { NormalizedFinding } from '../../apps/pdf-af-web/types/analyze';

function finding(overrides: Partial<NormalizedFinding>): NormalizedFinding {
  return {
    id: 'finding-1',
    title: 'Missing alt text',
    summary: 'A figure needs alternative text.',
    category: 'alt_text',
    severity: 'critical',
    references: [],
    ...overrides,
  };
}

describe('export finding mapping', () => {
  it('maps critical and moderate analyzer findings to blocker editor issues', () => {
    const issues = mapAnalyzeFindingsToEditorIssues([
      finding({ id: 'critical', severity: 'critical' }),
      finding({ id: 'moderate', severity: 'moderate' }),
    ]);

    expect(issues.map((issue) => issue.severity)).toEqual(['blocker', 'blocker']);
    expect(issues.every((issue) => issue.source === 'export-check')).toBe(true);
  });

  it('maps minor findings to warning editor issues', () => {
    const issues = mapAnalyzeFindingsToEditorIssues([finding({ severity: 'minor' })]);

    expect(issues[0]).toMatchObject({
      severity: 'warning',
      fixState: 'needs-input',
    });
  });

  it('preserves page, category, and message fields', () => {
    const issues = mapAnalyzeFindingsToEditorIssues([
      finding({
        id: 'heading',
        title: 'Heading structure issue',
        summary: 'Heading levels are skipped.',
        category: 'heading_structure',
        page: 2,
        severity: 'minor',
      }),
    ]);

    expect(issues[0]).toMatchObject({
      id: 'export:heading',
      page: 2,
      category: 'heading_structure',
      message: 'Heading structure issue',
      whyItMatters: 'Heading levels are skipped.',
    });
  });
});
