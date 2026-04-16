import { describe, it, expect } from 'vitest';
import { generateHtmlReport } from '../../src/services/reporter/htmlReport.js';
import type { AnalysisResult, AppliedRemediationTool } from '../../src/types.js';

const baseAnalysis = (over: Partial<AnalysisResult> = {}): AnalysisResult =>
  ({
    id: 'a',
    filename: 'report-test.pdf',
    timestamp: new Date().toISOString(),
    pageCount: 1,
    pdfClass: 'native_tagged',
    score: 72,
    grade: 'C',
    findings: [
      {
        category: 'alt_text',
        severity: 'moderate',
        wcag: '1.1.1',
        message: 'Figure <img> needs alt',
        page: 1,
      },
    ],
    categories: [
      {
        key: 'alt_text',
        applicable: true,
        score: 60,
        weight: 0.13,
        severity: 'moderate',
        findings: [],
      },
      {
        key: 'title_language',
        applicable: true,
        score: 95,
        weight: 0.13,
        severity: 'minor',
        findings: [],
      },
    ],
    analysisDurationMs: 10,
    ...over,
  }) as AnalysisResult;

describe('generateHtmlReport', () => {
  it('includes grade and escapes filename-derived content', () => {
    const before = baseAnalysis({ filename: 'evil<script>.pdf' });
    const after = baseAnalysis({ score: 88, grade: 'B', filename: 'evil<script>.pdf' });
    const html = generateHtmlReport(before, after, [], {});
    expect(html).toContain('evil&lt;script&gt;');
    expect(html).toContain('>B<');
    expect(html).toContain('1.1.1');
    expect(html.length).toBeLessThan(100_000);
  });

  it('includes applied tools when requested', () => {
    const a = baseAnalysis();
    const tools: AppliedRemediationTool[] = [
      {
        toolName: 'set_document_title',
        stage: 1,
        round: 1,
        scoreBefore: 70,
        scoreAfter: 72,
        delta: 2,
        outcome: 'applied',
      },
    ];
    const html = generateHtmlReport(a, a, tools, { includeAppliedTools: true });
    expect(html).toContain('set_document_title');
  });

  it('includes OCR human-review notice when ocrPipeline is set', () => {
    const a = baseAnalysis();
    const html = generateHtmlReport(a, a, [], {
      ocrPipeline: {
        applied: true,
        attempted: true,
        humanReviewRecommended: true,
        guidance: 'Test OCR guidance <script>.',
      },
    });
    expect(html).toContain('OCR notice');
    expect(html).toContain('Test OCR guidance');
    expect(html).toContain('&lt;script&gt;');
  });
});
