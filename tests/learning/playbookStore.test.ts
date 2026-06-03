import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { initSchema } from '../../src/db/schema.js';
import { createPlaybookStore } from '../../src/services/learning/playbookStore.js';
import { buildFailureSignature } from '../../src/services/learning/failureSignature.js';
import type { AnalysisResult, AppliedRemediationTool, DocumentSnapshot } from '../../src/types.js';

const META = { id: 'p', filename: 'bare.pdf', timestamp: new Date().toISOString(), analysisDurationMs: 1 };

function minimalAnalysis(): AnalysisResult {
  return {
    ...META,
    pageCount: 2,
    pdfClass: 'native_untagged',
    score: 40,
    grade: 'F',
    findings: [],
    categories: [
      { key: 'title_language', applicable: true, score: 50, severity: 'moderate', rationale: '' },
    ],
  } as AnalysisResult;
}

function minimalSnapshot(): DocumentSnapshot {
  return {
    pageCount: 2,
    textByPage: ['x'],
    textCharCount: 1,
    imageOnlyPageCount: 0,
    metadata: {},
    links: [],
    formFieldsFromPdfjs: [],
    isTagged: false,
    markInfo: null,
    lang: null,
    pdfUaVersion: null,
    headings: [],
    figures: [],
    tables: [],
    fonts: [],
    bookmarks: [],
    formFields: [],
    structureTree: null,
    pdfClass: 'native_untagged',
    imageToTextRatio: 0,
  } as DocumentSnapshot;
}

function appliedTitle(): AppliedRemediationTool[] {
  return [
    {
      toolName: 'set_document_title',
      stage: 1,
      round: 1,
      scoreBefore: 40,
      scoreAfter: 45,
      delta: 5,
      outcome: 'applied',
    },
  ];
}

function appliedRemapOrphanMcids(): AppliedRemediationTool[] {
  return [
    {
      toolName: 'set_document_language',
      stage: 1,
      round: 1,
      scoreBefore: 40,
      scoreAfter: 42,
      delta: 2,
      outcome: 'applied',
    },
    {
      toolName: 'set_document_title',
      stage: 1,
      round: 1,
      scoreBefore: 42,
      scoreAfter: 45,
      delta: 3,
      outcome: 'applied',
    },
    {
      toolName: 'set_link_annotation_contents',
      stage: 1,
      round: 1,
      scoreBefore: 45,
      scoreAfter: 47,
      delta: 2,
      outcome: 'applied',
    },
    {
      toolName: 'mark_untagged_content_as_artifact',
      stage: 1,
      round: 1,
      scoreBefore: 47,
      scoreAfter: 49,
      delta: 2,
      outcome: 'applied',
    },
    {
      toolName: 'set_pdfua_identification',
      stage: 1,
      round: 1,
      scoreBefore: 49,
      scoreAfter: 52,
      delta: 3,
      outcome: 'applied',
    },
    {
      toolName: 'remap_orphan_mcids_as_artifacts',
      stage: 1,
      round: 1,
      scoreBefore: 52,
      scoreAfter: 58,
      delta: 6,
      outcome: 'applied',
    },
  ];
}

describe('playbookStore', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    initSchema(db);
  });

  it('findActive returns null for unknown signature', () => {
    const store = createPlaybookStore(db);
    expect(store.findActive('deadbeefdeadbe')).toBeNull();
  });

  it('learnFromSuccess creates a candidate playbook', () => {
    const store = createPlaybookStore(db);
    const analysis = minimalAnalysis();
    const snap = minimalSnapshot();
    store.learnFromSuccess(analysis, snap, appliedTitle(), 6);
    const sig = buildFailureSignature(analysis, snap);
    const row = store.listAll().find(p => p.failureSignature === sig);
    expect(row).toBeDefined();
    expect(row!.status).toBe('candidate');
    expect(store.findActive(sig)).toBeNull();
  });

  it('learnFromSuccess persists remap_orphan_mcids_as_artifacts in the playbook sequence', () => {
    const store = createPlaybookStore(db);
    const analysis = minimalAnalysis();
    const snap = minimalSnapshot();
    store.learnFromSuccess(analysis, snap, appliedRemapOrphanMcids(), 18);
    const sig = buildFailureSignature(analysis, snap);
    const row = store.listAll().find(p => p.failureSignature === sig);
    expect(row).toBeDefined();
    expect(row!.toolSequence.map(step => step.toolName)).toContain('remap_orphan_mcids_as_artifacts');
    expect(store.findActive(sig)).toBeNull();
  });

  it('promotes to active after 3 successes', () => {
    const store = createPlaybookStore(db);
    const analysis = minimalAnalysis();
    const snap = minimalSnapshot();
    store.learnFromSuccess(analysis, snap, appliedTitle(), 6);
    store.learnFromSuccess(analysis, snap, appliedTitle(), 6);
    store.learnFromSuccess(analysis, snap, appliedTitle(), 6);
    const sig = buildFailureSignature(analysis, snap);
    const pb = store.findActive(sig);
    expect(pb).not.toBeNull();
    expect(pb!.status).toBe('active');
  });

  it('retires after many failed playbook attempts', () => {
    const store = createPlaybookStore(db);
    const analysis = minimalAnalysis();
    const snap = minimalSnapshot();
    store.learnFromSuccess(analysis, snap, appliedTitle(), 6);
    store.learnFromSuccess(analysis, snap, appliedTitle(), 6);
    store.learnFromSuccess(analysis, snap, appliedTitle(), 6);
    const sig = buildFailureSignature(analysis, snap);
    const pb = store.findActive(sig)!;
    for (let i = 0; i < 10; i++) {
      store.recordResult(pb.id, false, 0);
    }
    expect(store.findActive(sig)).toBeNull();
    const listed = store.listAll().find(p => p.id === pb.id);
    expect(listed?.status).toBe('retired');
  });
});
