import { describe, it, expect } from 'vitest';
import { planForRemediation } from '../../src/services/remediation/planner.js';
import { score } from '../../src/services/scorer/scorer.js';
import type { AppliedRemediationTool, DocumentSnapshot } from '../../src/types.js';

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
});
