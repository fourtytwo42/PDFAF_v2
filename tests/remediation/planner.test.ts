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
    const plan = planForRemediation(analysis, snap, applied);
    const names = plan.stages.flatMap(s => s.tools.map(t => t.toolName));
    expect(names).toContain('set_figure_alt_text');
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
