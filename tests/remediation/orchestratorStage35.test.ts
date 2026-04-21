import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  runPythonMutationBatch: vi.fn(),
  setDocumentTitle: vi.fn(),
}));

vi.mock('../../src/python/bridge.js', () => ({
  runPythonMutationBatch: mocks.runPythonMutationBatch,
}));

vi.mock('../../src/services/remediation/tools/metadata.js', () => ({
  setDocumentTitle: mocks.setDocumentTitle,
  setDocumentLanguage: vi.fn(),
}));

import { isStage35StructuralTool, parseMutationDetails, runSingleTool } from '../../src/services/remediation/orchestrator.js';
import type { DocumentSnapshot, PythonMutationDetailPayload } from '../../src/types.js';

function bareSnapshot(): DocumentSnapshot {
  return {
    pageCount: 1,
    textByPage: ['hello'],
    textCharCount: 5,
    imageOnlyPageCount: 0,
    metadata: { title: '', language: '' },
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
  };
}

describe('Stage 35 orchestrator mutation contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('runSingleTool respects Python no_effect even when the buffer changed', async () => {
    const before = Buffer.from('before');
    const after = Buffer.from('after');
    mocks.runPythonMutationBatch.mockResolvedValue({
      buffer: after,
      result: {
        success: true,
        applied: ['repair_structure_conformance'],
        failed: [],
        opResults: [{
          op: 'repair_structure_conformance',
          outcome: 'no_effect',
          note: 'structure_depth_not_improved',
          invariants: {
            rootReachableHeadingCountBefore: 0,
            rootReachableHeadingCountAfter: 0,
            rootReachableDepthBefore: 1,
            rootReachableDepthAfter: 1,
          },
        }],
      },
    });

    const result = await runSingleTool(
      before,
      { toolName: 'repair_structure_conformance', params: {}, rationale: 'test' },
      bareSnapshot(),
    );

    expect(result.buffer.equals(before)).toBe(true);
    expect(result.outcome).toBe('no_effect');
    const details = parseMutationDetails(result.details);
    expect(details).toEqual({
      outcome: 'no_effect',
      note: 'structure_depth_not_improved',
      invariants: {
        rootReachableHeadingCountBefore: 0,
        rootReachableHeadingCountAfter: 0,
        rootReachableDepthBefore: 1,
        rootReachableDepthAfter: 1,
      },
    });
  });

  it('stores normalized invariant payloads in details for applied structural tools', async () => {
    mocks.runPythonMutationBatch.mockResolvedValue({
      buffer: Buffer.from('after'),
      result: {
        success: true,
        applied: ['set_figure_alt_text'],
        failed: [],
        opResults: [{
          op: 'set_figure_alt_text',
          outcome: 'applied',
          note: 'alt_attached',
          invariants: {
            targetResolved: true,
            targetReachable: true,
            resolvedRole: 'Figure',
            targetHasAltAfter: true,
            targetIsFigureAfter: true,
            rootReachableFigureCountBefore: 1,
            rootReachableFigureCountAfter: 1,
          },
          debug: {
            rootReachableFigureCount: 1,
          },
        }],
      },
    });

    const result = await runSingleTool(
      Buffer.from('before'),
      { toolName: 'set_figure_alt_text', params: { structRef: '12_0' }, rationale: 'test' },
      bareSnapshot(),
    );

    expect(result.outcome).toBe('applied');
    const details = parseMutationDetails(result.details) as PythonMutationDetailPayload;
    expect(details.invariants?.targetResolved).toBe(true);
    expect(details.invariants?.targetHasAltAfter).toBe(true);
    expect(details.debug?.rootReachableFigureCount).toBe(1);
  });

  it('keeps metadata-only tools unaffected by Stage 35 structural classification', async () => {
    mocks.setDocumentTitle.mockResolvedValue(Buffer.from('after'));
    const result = await runSingleTool(
      Buffer.from('before'),
      { toolName: 'set_document_title', params: { title: 'New Title' }, rationale: 'test' },
      bareSnapshot(),
    );
    expect(result.outcome).toBe('applied');
    expect(isStage35StructuralTool('set_document_title')).toBe(false);
    expect(isStage35StructuralTool('repair_structure_conformance')).toBe(true);
  });

  it('parses older mutation payloads without invariants', () => {
    expect(parseMutationDetails(JSON.stringify({
      outcome: 'applied',
      note: 'rolemap_heading_rewrite',
      debug: { qpdfVerifiedDepth: 2 },
    }))).toEqual({
      outcome: 'applied',
      note: 'rolemap_heading_rewrite',
      debug: { qpdfVerifiedDepth: 2 },
    });
  });
});
