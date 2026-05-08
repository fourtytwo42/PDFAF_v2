import { describe, expect, it } from 'vitest';
import {
  buildBucketGaps,
  buildPacReviewDiagnostic,
  buildPacLeafCoverage,
  classifyPacLeafCoverage,
  parsePacReportText,
  type PacReviewCategorySnapshot,
  type PacReviewFileRow,
} from '../../scripts/pac-review-gap-diagnostic.js';
import type { PacRuleEvidence } from '../../src/services/compliance/pacRuleEvidence.js';

function rule(overrides: Partial<PacRuleEvidence>): PacRuleEvidence {
  return {
    ruleId: 'pdfua.content.text_tagged_or_artifacted',
    status: 'pass',
    severity: 'pass',
    category: 'reading_order',
    message: 'ok',
    confidence: 'verified',
    ...overrides,
  };
}

const categories: PacReviewCategorySnapshot[] = [
  { key: 'pdf_ua_compliance', score: 95, applicable: true },
  { key: 'reading_order', score: 94, applicable: true },
  { key: 'text_extractability', score: 100, applicable: true },
  { key: 'alt_text', score: 100, applicable: true },
];

describe('PAC review gap diagnostic helpers', () => {
  it('parses labeled one-page PAC summary bucket counts', () => {
    const parsed = parsePacReportText(`
PAC Test Report
Filename
figure-4082.pdf
RESULT
This PDF file is not PDF/UA compliant.
CHECKPOINT
PASSED
WARNED
FAILED
PDF Syntax
15
-
2
Fonts
12
-
-
Content
1457
-
26
Structure tree
2
1
-
Metadata
3
-
-
ABOUT PAC
`);

    expect(parsed.filename).toBe('figure-4082.pdf');
    expect(parsed.compliant).toBe(false);
    expect(parsed.buckets.find(bucket => bucket.bucket === 'PDF Syntax')).toMatchObject({ passed: 15, warned: null, failed: 2 });
    expect(parsed.buckets.find(bucket => bucket.bucket === 'Content')).toMatchObject({ passed: 1457, warned: null, failed: 26 });
    expect(parsed.buckets.find(bucket => bucket.bucket === 'Structure tree')).toMatchObject({ passed: 2, warned: 1, failed: null });
  });

  it('parses PAC summaries where first logical-structure labels are rendered after numeric triples', () => {
    const parsed = parsePacReportText(`
CHECKPOINT
PASSED
WARNED
FAILED
1012
-
2
9
-
-
48024
-
47226
Embedded Files
-
-
-
Natural language
47269
-
-
Role mapping
949
-
-
-
6
-
Metadata
3
-
-
Basic Requirements
PDF Syntax
Fonts
Content
Logical structure
Alternative Descriptions
Metadata and Settings
ABOUT PAC
`);

    expect(parsed.buckets.find(bucket => bucket.bucket === 'PDF Syntax')).toMatchObject({ passed: 1012, failed: 2 });
    expect(parsed.buckets.find(bucket => bucket.bucket === 'Fonts')).toMatchObject({ passed: 9, failed: null });
    expect(parsed.buckets.find(bucket => bucket.bucket === 'Content')).toMatchObject({ passed: 48024, failed: 47226 });
    expect(parsed.buckets.find(bucket => bucket.bucket === 'Alternative Descriptions')).toMatchObject({ passed: null, warned: 6, failed: null });
  });

  it('parses unlabeled Content triples that appear after a labeled Fonts row', () => {
    const parsed = parsePacReportText(`
PASSED
WARNED
FAILED
PDF Syntax
92
-
2
Fonts
4
-
4
24267
-
6574
Embedded Files
-
-
-
Basic Requirements
Content
Logical structure
ABOUT PAC
`);

    expect(parsed.buckets.find(bucket => bucket.bucket === 'PDF Syntax')).toMatchObject({ passed: 92, failed: 2 });
    expect(parsed.buckets.find(bucket => bucket.bucket === 'Fonts')).toMatchObject({ passed: 4, failed: 4 });
    expect(parsed.buckets.find(bucket => bucket.bucket === 'Content')).toMatchObject({ passed: 24267, failed: 6574 });
  });

  it('groups PAC bucket gaps against related internal rule evidence', () => {
    const pac = parsePacReportText(`
CHECKPOINT
PASSED
WARNED
FAILED
PDF Syntax
15
-
2
Fonts
12
-
4
Content
1457
-
26
Structure elements
3
-
1
ABOUT PAC
`);
    const gaps = buildBucketGaps(pac, [
      rule({ ruleId: 'pdfua.content.text_tagged_or_artifacted', status: 'fail', count: 3 }),
      rule({ ruleId: 'pdfua.font.to_unicode_cmap_valid', status: 'fail', category: 'text_extractability', count: 4 }),
      rule({ ruleId: 'pdfua.figure.bbox_present', status: 'warn', category: 'pdf_ua_compliance', confidence: 'heuristic' }),
    ], categories);

    expect(gaps.map(gap => gap.bucket)).toEqual(['Content', 'Fonts', 'PDF Syntax', 'Structure elements']);
    expect(gaps.find(gap => gap.bucket === 'Fonts')?.matchingRuleFailures.map(row => row.ruleId)).toEqual([
      'pdfua.font.to_unicode_cmap_valid',
    ]);
    expect(gaps.find(gap => gap.bucket === 'Structure elements')?.matchingRuleWarnings.map(row => row.ruleId)).toEqual([
      'pdfua.figure.bbox_present',
    ]);
  });

  it('expands active PAC buckets into deterministic leaf coverage rows', () => {
    const pac = parsePacReportText(`
CHECKPOINT
PASSED
WARNED
FAILED
Content
10
-
2
Structure elements
5
-
1
ABOUT PAC
`);
    const rows = buildPacLeafCoverage(pac.buckets, [
      rule({ ruleId: 'pdfua.content.text_tagged_or_artifacted', status: 'fail', confidence: 'verified', count: 2 }),
      rule({ ruleId: 'pdfua.figure.bbox_present', status: 'fail', confidence: 'heuristic', category: 'pdf_ua_compliance', count: 1 }),
    ]);

    expect(rows.map(row => `${row.bucket}:${row.family}:${row.coverage}`)).toContain(
      'Content:Tagged text/image/path operators:covered_verified',
    );
    expect(rows.map(row => `${row.bucket}:${row.family}:${row.coverage}`)).toContain(
      'Structure elements:Figure structure:covered_heuristic',
    );
    expect(rows.find(row => row.family === 'Heading structure')?.coverage).toBe('missing');
  });

  it('classifies missing and manual-review-only leaf coverage separately', () => {
    const definitions = buildPacLeafCoverage(
      [{ bucket: 'Content', passed: 1, warned: 0, failed: 1 }],
      [],
    );

    const externalXObject = definitions.find(row => row.family === 'Referenced external objects');
    const taggedOperators = definitions.find(row => row.family === 'Tagged text/image/path operators');

    expect(externalXObject?.coverage).toBe('manual_review_only');
    expect(taggedOperators?.coverage).toBe('missing');
    expect(classifyPacLeafCoverage(taggedOperators!, [])).toBe('missing');
  });

  it('builds deterministic aggregate bucket totals', () => {
    const rows: PacReviewFileRow[] = [
      {
        id: 'b',
        pdf: '/tmp/b.pdf',
        pacReport: '/tmp/b-report.pdf',
        score: 95,
        grade: 'A',
        categories,
        pac: null,
        bucketGaps: [
          {
            bucket: 'Content',
            pacFailed: 2,
            pacWarned: 0,
            likelyFamilies: [],
            categoryScores: [],
            matchingRuleFailures: [],
            matchingRuleWarnings: [],
            likelyMissingCheckerFamily: 'missing',
          },
        ],
        leafCoverage: [],
        pacRuleFailures: [],
        pacRuleWarnings: [],
        analyzerAudits: {},
      },
      {
        id: 'a',
        pdf: '/tmp/a.pdf',
        pacReport: '/tmp/a-report.pdf',
        score: 90,
        grade: 'A',
        categories,
        pac: null,
        bucketGaps: [
          {
            bucket: 'PDF Syntax',
            pacFailed: 2,
            pacWarned: 1,
            likelyFamilies: [],
            categoryScores: [],
            matchingRuleFailures: [],
            matchingRuleWarnings: [],
            likelyMissingCheckerFamily: 'missing',
          },
        ],
        leafCoverage: [],
        pacRuleFailures: [],
        pacRuleWarnings: [],
        analyzerAudits: {},
      },
    ];

    const diagnostic = buildPacReviewDiagnostic(rows);

    expect(diagnostic.files.map(row => row.id)).toEqual(['a', 'b']);
    expect(diagnostic.failedBucketTotals.map(row => `${row.bucket}:${row.failed}:${row.warned}`)).toEqual([
      'Content:2:0',
      'PDF Syntax:2:1',
    ]);
  });
});
