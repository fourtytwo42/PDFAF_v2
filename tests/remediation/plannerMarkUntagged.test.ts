import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { planForRemediation } from '../../src/services/remediation/planner.js';
import { score } from '../../src/services/scorer/scorer.js';
import type { AnalysisResult, DocumentSnapshot } from '../../src/types.js';

const PDF_4706 = join(
  process.cwd(),
  'Input/corpus_stress_varied_blockers/03_id4706_score42_p17_4706-Illinois_Helping_Everyone_Access_Linked_Systems_Interim_Report.pdf',
);

function emptySnapshot(over: Partial<DocumentSnapshot>): DocumentSnapshot {
  const base: DocumentSnapshot = {
    pageCount: 3,
    textByPage: ['', '', ''],
    textCharCount: 100,
    imageOnlyPageCount: 0,
    metadata: { language: 'en', title: 'T' },
    links: [],
    formFieldsFromPdfjs: [],
    isTagged: true,
    markInfo: { Marked: true },
    lang: 'en-US',
    pdfUaVersion: '1',
    headings: [],
    figures: [],
    tables: [],
    fonts: [],
    bookmarks: [],
    formFields: [],
    structureTree: { type: 'Document', children: [] },
    paragraphStructElems: [],
    threeCcGoldenV1: false,
    threeCcGoldenOrphanV1: false,
    orphanMcids: [],
    mcidTextSpans: [],
    annotationAccessibility: {
      pagesMissingTabsS: 0,
      pagesAnnotationOrderDiffers: 0,
      linkAnnotationsMissingStructure: 0,
      nonLinkAnnotationsMissingStructure: 0,
      nonLinkAnnotationsMissingContents: 0,
      linkAnnotationsMissingStructParent: 0,
      nonLinkAnnotationsMissingStructParent: 0,
    },
    taggedContentAudit: { orphanMcidCount: 0, mcidTextSpanCount: 0, suspectedPathPaintOutsideMc: 0 },
    listStructureAudit: undefined,
    acrobatStyleAltRisks: {
      nonFigureWithAltCount: 0,
      nestedFigureAltCount: 0,
      orphanedAltEmptyElementCount: 0,
      sampleOwnershipModes: [],
    },
    linkScoringRows: [],
    pdfClass: 'native_untagged',
    imageToTextRatio: 0,
  };
  return { ...base, ...over };
}

describe('planForRemediation — mark_untagged_content_as_artifact', () => {
  it('schedules mark_untagged for MarkInfo-only PDF with path paint outside marked content (4706)', async () => {
    if (!existsSync(PDF_4706)) return;
    const { analyzePdf } = await import('../../src/services/pdfAnalyzer.js');
    const { result, snapshot } = await analyzePdf(PDF_4706, '4706.pdf');
    expect(snapshot.markInfo?.Marked).toBe(true);
    expect(snapshot.isTagged).toBe(false);
    expect((snapshot.taggedContentAudit?.suspectedPathPaintOutsideMc ?? 0) > 0).toBe(true);

    const plan = planForRemediation(result, snapshot, []);
    const names = plan.stages.flatMap(s => s.tools.map(t => t.toolName));
    expect(names).toContain('mark_untagged_content_as_artifact');
  });

  it('schedules mark_untagged when paint-outside >= 5 without MarkInfo (heuristic-only signal)', () => {
    const snap = emptySnapshot({
      markInfo: null,
      isTagged: false,
      structureTree: null,
      taggedContentAudit: { orphanMcidCount: 0, mcidTextSpanCount: 0, suspectedPathPaintOutsideMc: 50 },
    });
    const analysis = score(snap, {
      id: 't',
      filename: 'x.pdf',
      timestamp: new Date().toISOString(),
      analysisDurationMs: 0,
    });
    const plan = planForRemediation(analysis, snap, []);
    const names = plan.stages.flatMap(s => s.tools.map(t => t.toolName));
    expect(names).toContain('mark_untagged_content_as_artifact');
  });
});
