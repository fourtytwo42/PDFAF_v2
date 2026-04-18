import { describe, it, expect, vi } from 'vitest';
import Database from 'better-sqlite3';
import { initSchema } from '../../src/db/schema.js';
import { createToolOutcomeStore } from '../../src/services/learning/toolOutcomes.js';
import { planForRemediation } from '../../src/services/remediation/planner.js';
import { score } from '../../src/services/scorer/scorer.js';
import type { AnalysisResult, AppliedRemediationTool, DocumentSnapshot } from '../../src/types.js';

const META = { id: 'p', filename: 'bare.pdf', timestamp: new Date().toISOString(), analysisDurationMs: 1 };

function bareSnapshot(): DocumentSnapshot {
  return {
    pageCount: 1,
    textByPage: ['hello'],
    textCharCount: 5,
    imageOnlyPageCount: 0,
    metadata: { title: '', language: '', author: '', subject: '' },
    links: [],
    formFieldsFromPdfjs: [],
    isTagged: false,
    markInfo: null,
    lang: null,
    pdfUaVersion: null,
    structTitle: null,
    headings: [],
    figures: [],
    tables: [],
    fonts: [],
    bookmarks: [],
    formFields: [],
    structureTree: null,
    pdfClass: 'native_untagged',
    imageToTextRatio: 0,
  };
}

function withCategoryScores(
  analysis: AnalysisResult,
  scores: Partial<Record<AnalysisResult['categories'][number]['key'], number>>,
): AnalysisResult {
  return {
    ...analysis,
    score: Math.min(
      analysis.score,
      ...Object.values(scores).filter((value): value is number => typeof value === 'number'),
    ),
    categories: analysis.categories.map(category =>
      scores[category.key] == null
        ? { ...category, score: 100, applicable: category.applicable }
        : { ...category, score: scores[category.key]!, applicable: true },
    ),
  };
}

function withRoutingContext(
  analysis: AnalysisResult,
  over: Partial<AnalysisResult>,
): AnalysisResult {
  return {
    ...analysis,
    ...over,
    categories: over.categories ?? analysis.categories,
  };
}

describe('planForRemediation', () => {
  it('plans metadata tools when title_language fails', () => {
    const snap = bareSnapshot();
    const analysis = score(snap, META);
    const plan = planForRemediation(analysis, snap, []);
    const names = plan.stages.flatMap(s => s.tools.map(t => t.toolName));
    expect(names).toContain('set_document_title');
    expect(names).toContain('set_document_language');
    expect(names).toContain('set_pdfua_identification');
  });

  it('records a metadata-first planning summary for near-pass metadata debt', () => {
    const snap: DocumentSnapshot = {
      ...bareSnapshot(),
      metadata: { title: '', language: '', author: '', subject: '' },
      pdfUaVersion: null,
      structureTree: { type: 'Document', children: [] },
      isTagged: true,
      pdfClass: 'native_tagged',
    };
    const base = score(snap, META);
    const analysis = withCategoryScores(base, { title_language: 40 });
    const plan = planForRemediation(analysis, snap, []);
    const names = plan.stages.flatMap(s => s.tools.map(t => t.toolName));
    expect(plan.planningSummary?.primaryRoute).toBe('metadata_foundation');
    expect(names).toContain('set_document_title');
    expect(names).toContain('set_document_language');
    expect(names).toContain('set_pdfua_identification');
    expect(names).not.toContain('set_figure_alt_text');
    expect(names).not.toContain('repair_native_reading_order');
  });

  it('includes bootstrap_struct_tree for native_untagged when text_extractability fails', () => {
    const snap = bareSnapshot();
    const analysis = score(snap, META);
    const plan = planForRemediation(analysis, snap, []);
    const names = plan.stages.flatMap(s => s.tools.map(t => t.toolName));
    expect(names).toContain('bootstrap_struct_tree');
  });

  it('includes tag_native_text_blocks for legacy native_untagged (non-OCR creator)', () => {
    const snap = bareSnapshot();
    const analysis = score(snap, META);
    const plan = planForRemediation(analysis, snap, []);
    const names = plan.stages.flatMap(s => s.tools.map(t => t.toolName));
    expect(names).toContain('tag_native_text_blocks');
  });

  it('includes fill_form_field_tooltips when form_accessibility fails (missing /TU)', () => {
    const snap: DocumentSnapshot = {
      ...bareSnapshot(),
      formFields: [
        { name: 'Name', tooltip: 'Name', page: 0 },
        { name: 'Check Box1', page: 0 },
      ],
      metadata: { title: 't', language: 'en' },
      lang: 'en',
      pdfUaVersion: '1',
      markInfo: { Marked: true },
      structureTree: { type: 'Document', children: [] },
      isTagged: true,
    };
    const analysis = score(snap, META);
    const plan = planForRemediation(analysis, snap, []);
    const names = plan.stages.flatMap(s => s.tools.map(t => t.toolName));
    expect(names).toContain('fill_form_field_tooltips');
  });

  it('routes structure-heavy docs before semantic figure tools', () => {
    const snap: DocumentSnapshot = {
      ...bareSnapshot(),
      pageCount: 5,
      textByPage: ['A', 'B', 'C', 'D', 'E'],
      textCharCount: 250,
      pdfClass: 'native_tagged',
      isTagged: true,
      pdfUaVersion: '1',
      metadata: { title: 't', language: 'en', author: '', subject: '' },
      lang: 'en',
      figures: [{ hasAlt: false, isArtifact: false, page: 0, structRef: '1_0' }],
      structureTree: null,
      failureProfile: {
        deterministicIssues: ['reading_order', 'pdf_ua_compliance'],
        semanticIssues: ['alt_text'],
        manualOnlyIssues: [],
        primaryFailureFamily: 'structure_reading_order_heavy',
        secondaryFailureFamilies: ['figure_alt_ownership_heavy'],
        routingHints: ['semantic_not_primary'],
      },
      detectionProfile: {
        readingOrderSignals: {
          missingStructureTree: true,
          annotationOrderRiskCount: 1,
          annotationStructParentRiskCount: 1,
          headerFooterPollutionRisk: false,
          sampledStructurePageOrderDriftCount: 1,
          multiColumnOrderRiskPages: 0,
          suspiciousPageCount: 2,
        },
        pdfUaSignals: {
          orphanMcidCount: 2,
          suspectedPathPaintOutsideMc: 12,
          taggedAnnotationRiskCount: 1,
        },
        annotationSignals: {
          pagesMissingTabsS: 1,
          pagesAnnotationOrderDiffers: 1,
          linkAnnotationsMissingStructure: 1,
          nonLinkAnnotationsMissingStructure: 0,
          linkAnnotationsMissingStructParent: 1,
          nonLinkAnnotationsMissingStructParent: 0,
        },
        listSignals: {
          listItemMisplacedCount: 1,
          lblBodyMisplacedCount: 0,
          listsWithoutItems: 0,
        },
        tableSignals: {
          tablesWithMisplacedCells: 0,
          misplacedCellCount: 0,
          irregularTableCount: 0,
          stronglyIrregularTableCount: 0,
          directCellUnderTableCount: 0,
        },
        sampledPages: [0, 1],
        confidence: 'high',
      },
    };
    const base = score(snap, META);
    const analysis = withRoutingContext(
      withCategoryScores(base, {
        reading_order: 45,
        pdf_ua_compliance: 35,
        alt_text: 20,
        link_quality: 55,
      }),
      {
        failureProfile: snap.failureProfile,
        detectionProfile: snap.detectionProfile,
      },
    );
    const plan = planForRemediation(analysis, snap, []);
    const names = plan.stages.flatMap(s => s.tools.map(t => t.toolName));
    expect(plan.planningSummary?.primaryRoute).toBe('structure_bootstrap');
    expect(plan.planningSummary?.secondaryRoutes).toContain('annotation_link_normalization');
    expect(plan.planningSummary?.semanticDeferred).toBe(true);
    expect(names).toContain('repair_structure_conformance');
    expect(names).toContain('repair_native_reading_order');
    expect(names).toContain('normalize_annotation_tab_order');
    expect(names).not.toContain('set_figure_alt_text');
    expect(plan.planningSummary?.skippedTools).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ toolName: 'set_figure_alt_text', reason: 'semantic_deferred' }),
      ]),
    );
  });

  it('includes ocr_scanned_pdf for native_untagged when there is no extractable text', () => {
    const snap = bareSnapshot();
    const flat: DocumentSnapshot = {
      ...snap,
      textByPage: [''],
      textCharCount: 0,
      pdfClass: 'native_untagged',
    };
    const analysis = score(flat, META);
    const plan = planForRemediation(analysis, flat, []);
    const names = plan.stages.flatMap(s => s.tools.map(t => t.toolName));
    expect(names).toContain('ocr_scanned_pdf');
  });

  it('prefers font_ocr_repair for font-heavy documents', () => {
    const snap: DocumentSnapshot = {
      ...bareSnapshot(),
      pageCount: 3,
      textByPage: ['', '', ''],
      textCharCount: 0,
      imageOnlyPageCount: 3,
      pdfClass: 'scanned',
      imageToTextRatio: 1,
      metadata: { title: 't', language: 'en', author: '', subject: '' },
      lang: 'en',
      pdfUaVersion: '1',
      failureProfile: {
        deterministicIssues: ['text_extractability'],
        semanticIssues: [],
        manualOnlyIssues: ['text_extractability'],
        primaryFailureFamily: 'font_extractability_heavy',
        secondaryFailureFamilies: [],
        routingHints: ['prefer_font_repair'],
      },
    };
    const base = score(snap, META);
    const analysis = withRoutingContext(
      withCategoryScores(base, { text_extractability: 10 }),
      { failureProfile: snap.failureProfile },
    );
    const plan = planForRemediation(analysis, snap, []);
    const names = plan.stages.flatMap(s => s.tools.map(t => t.toolName));
    expect(plan.planningSummary?.primaryRoute).toBe('font_ocr_repair');
    expect(names).toContain('ocr_scanned_pdf');
    expect(names).not.toContain('bootstrap_struct_tree');
  });

  it('omits bootstrap_struct_tree for scanned PDFs', () => {
    const snap = bareSnapshot();
    const scanned: DocumentSnapshot = {
      ...snap,
      pageCount: 12,
      textByPage: Array(12).fill(''),
      textCharCount: 0,
      imageOnlyPageCount: 12,
      pdfClass: 'scanned',
      imageToTextRatio: 1,
    };
    const analysis = score(scanned, META);
    const plan = planForRemediation(analysis, scanned, []);
    const names = plan.stages.flatMap(s => s.tools.map(t => t.toolName));
    expect(names).not.toContain('bootstrap_struct_tree');
  });

  it('returns empty plan when score already at target', () => {
    const snap = bareSnapshot();
    const analysis = score(snap, META);
    const high = {
      ...analysis,
      score: 95,
      categories: analysis.categories.map(c => ({ ...c, score: 95 })),
    };
    const plan = planForRemediation(high, snap, []);
    expect(plan.stages).toHaveLength(0);
  });

  it('skips a tool after it was successfully applied', () => {
    const snap = bareSnapshot();
    const analysis = score(snap, META);
    const applied: AppliedRemediationTool[] = [
      {
        toolName: 'set_document_title',
        stage: 1,
        round: 1,
        scoreBefore: 0,
        scoreAfter: 10,
        delta: 10,
        outcome: 'applied',
      },
    ];
    const plan = planForRemediation(analysis, snap, applied);
    const names = plan.stages.flatMap(s => s.tools.map(t => t.toolName));
    expect(names).not.toContain('set_document_title');
  });

  it('stops retrying a tool after max no_effect outcomes', () => {
    const snap = bareSnapshot();
    const analysis = score(snap, META);
    const applied: AppliedRemediationTool[] = [
      { toolName: 'set_document_title', stage: 1, round: 1, scoreBefore: 0, scoreAfter: 0, delta: 0, outcome: 'no_effect' },
      { toolName: 'set_document_title', stage: 1, round: 1, scoreBefore: 0, scoreAfter: 0, delta: 0, outcome: 'no_effect' },
    ];
    const plan = planForRemediation(analysis, snap, applied);
    const names = plan.stages.flatMap(s => s.tools.map(t => t.toolName));
    expect(names).not.toContain('set_document_title');
  });

  it('still plans set_figure_alt_text after one successful apply when more figures lack alt', () => {
    const snap: DocumentSnapshot = {
      ...bareSnapshot(),
      isTagged: true,
      pdfClass: 'native_tagged',
      metadata: { title: 't', language: 'en', author: '', subject: '' },
      lang: 'en',
      pdfUaVersion: '1',
      structureTree: { type: 'Document', children: [] },
      figures: [
        { hasAlt: false, isArtifact: false, page: 0, structRef: '1_0' },
        { hasAlt: false, isArtifact: false, page: 1, structRef: '2_0' },
      ],
    };
    const scored = score(snap, META);
    const analysis: AnalysisResult = withRoutingContext(
      {
        ...scored,
        score: 72,
        categories: scored.categories.map(c =>
          c.key === 'alt_text'
            ? { ...c, score: 0, applicable: true }
            : { ...c, score: 100, applicable: c.applicable },
        ),
      },
      {
        failureProfile: {
          deterministicIssues: [],
          semanticIssues: ['alt_text'],
          manualOnlyIssues: ['alt_text'],
          primaryFailureFamily: 'figure_alt_ownership_heavy',
          secondaryFailureFamilies: [],
          routingHints: [],
        },
      },
    );
    const applied: AppliedRemediationTool[] = [
      {
        toolName: 'set_figure_alt_text',
        stage: 6,
        round: 1,
        scoreBefore: 72,
        scoreAfter: 78,
        delta: 6,
        outcome: 'applied',
      },
    ];
    const plan = planForRemediation(analysis, snap, applied);
    const names = plan.stages.flatMap(s => s.tools.map(t => t.toolName));
    expect(names).toContain('set_figure_alt_text');
  });

  it('routes Stage 3 survivors into structure and annotation families instead of broad semantic tools', () => {
    const snap: DocumentSnapshot = {
      ...bareSnapshot(),
      pageCount: 4,
      textByPage: ['A', 'B', 'C', 'D'],
      textCharCount: 400,
      pdfClass: 'native_tagged',
      isTagged: true,
      metadata: { title: 't', language: 'en', author: '', subject: '' },
      lang: 'en',
      pdfUaVersion: '1',
      structureTree: { type: 'Document', children: [] },
      figures: [{ hasAlt: false, isArtifact: false, page: 0, structRef: '1_0' }],
      detectionProfile: {
        readingOrderSignals: {
          missingStructureTree: false,
          annotationOrderRiskCount: 0,
          annotationStructParentRiskCount: 1,
          headerFooterPollutionRisk: false,
          sampledStructurePageOrderDriftCount: 0,
          multiColumnOrderRiskPages: 0,
          suspiciousPageCount: 1,
        },
        pdfUaSignals: {
          orphanMcidCount: 1,
          suspectedPathPaintOutsideMc: 8,
          taggedAnnotationRiskCount: 1,
        },
        annotationSignals: {
          pagesMissingTabsS: 1,
          pagesAnnotationOrderDiffers: 0,
          linkAnnotationsMissingStructure: 1,
          nonLinkAnnotationsMissingStructure: 0,
          linkAnnotationsMissingStructParent: 1,
          nonLinkAnnotationsMissingStructParent: 0,
        },
        listSignals: {
          listItemMisplacedCount: 0,
          lblBodyMisplacedCount: 0,
          listsWithoutItems: 0,
        },
        tableSignals: {
          tablesWithMisplacedCells: 0,
          misplacedCellCount: 0,
          irregularTableCount: 0,
          stronglyIrregularTableCount: 0,
          directCellUnderTableCount: 0,
        },
        sampledPages: [0],
        confidence: 'high',
      },
      failureProfile: {
        deterministicIssues: ['pdf_ua_compliance', 'link_quality'],
        semanticIssues: ['alt_text'],
        manualOnlyIssues: [],
        primaryFailureFamily: 'structure_reading_order_heavy',
        secondaryFailureFamilies: ['figure_alt_ownership_heavy'],
        routingHints: ['prefer_structure_bootstrap', 'semantic_not_primary'],
      },
    };
    const base = score(snap, META);
    const analysis = withRoutingContext(
      withCategoryScores(base, {
        pdf_ua_compliance: 52,
        link_quality: 60,
        alt_text: 30,
      }),
      {
        failureProfile: snap.failureProfile,
        detectionProfile: snap.detectionProfile,
      },
    );
    const plan = planForRemediation(analysis, snap, []);
    expect(plan.planningSummary?.primaryRoute).toBe('structure_bootstrap');
    expect(plan.planningSummary?.secondaryRoutes).toContain('annotation_link_normalization');
    expect(plan.planningSummary?.scheduledTools).toEqual(
      expect.arrayContaining(['repair_native_link_structure', 'tag_unowned_annotations']),
    );
    expect(plan.planningSummary?.scheduledTools).not.toContain('set_figure_alt_text');
  });

  it('filters out low-reliability tools when tool outcome store has enough data', () => {
    const db = new Database(':memory:');
    initSchema(db);
    const store = createToolOutcomeStore(db);
    for (let i = 0; i < 10; i++) {
      store.record({
        toolName: 'set_document_title',
        pdfClass: 'native_untagged',
        outcome: 'no_effect',
        scoreBefore: 50,
        scoreAfter: 50,
      });
    }
    const snap = bareSnapshot();
    const analysis = score(snap, META);
    const plan = planForRemediation(analysis, snap, [], store);
    const names = plan.stages.flatMap(s => s.tools.map(t => t.toolName));
    expect(names).not.toContain('set_document_title');
  });

  it('stops repeating set_figure_alt_text after PDFAF_MAX_FIGURE_ALT_MUTATIONS_PER_RUN successes', async () => {
    const prev = process.env['PDFAF_MAX_FIGURE_ALT_MUTATIONS_PER_RUN'];
    process.env['PDFAF_MAX_FIGURE_ALT_MUTATIONS_PER_RUN'] = '1';
    vi.resetModules();
    const { planForRemediation: plan2 } = await import('../../src/services/remediation/planner.js');

    const snap: DocumentSnapshot = {
      ...bareSnapshot(),
      isTagged: true,
      pdfClass: 'native_tagged',
      figures: [
        { hasAlt: false, isArtifact: false, page: 0, structRef: '1_0' },
        { hasAlt: false, isArtifact: false, page: 1, structRef: '2_0' },
      ],
    };
    const scored = score(snap, META);
    const analysis: AnalysisResult = {
      ...scored,
      score: 72,
      categories: scored.categories.map(c =>
        c.key === 'alt_text' ? { ...c, score: 0, applicable: true } : { ...c, score: 100, applicable: c.applicable },
      ),
    };
    const applied: AppliedRemediationTool[] = [
      {
        toolName: 'set_figure_alt_text',
        stage: 6,
        round: 1,
        scoreBefore: 72,
        scoreAfter: 78,
        delta: 6,
        outcome: 'applied',
      },
    ];
    const plan = plan2(analysis, snap, applied);
    const names = plan.stages.flatMap(s => s.tools.map(t => t.toolName));
    expect(names).not.toContain('set_figure_alt_text');

    if (prev === undefined) delete process.env['PDFAF_MAX_FIGURE_ALT_MUTATIONS_PER_RUN'];
    else process.env['PDFAF_MAX_FIGURE_ALT_MUTATIONS_PER_RUN'] = prev;
    vi.resetModules();
    await import('../../src/services/remediation/planner.js');
  });
});
