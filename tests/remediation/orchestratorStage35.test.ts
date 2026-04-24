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

import {
  batchHasValidStructuralBenefit,
  isStage35StructuralTool,
  parseMutationDetails,
  runSingleTool,
  runStage39Batch,
  selectStage39Batch,
} from '../../src/services/remediation/orchestrator.js';
import type { DocumentSnapshot, PlannedRemediationTool, PythonMutationDetailPayload } from '../../src/types.js';

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
          structuralBenefits: {
            figureAltAttachedToReachableFigure: true,
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
    expect(details.structuralBenefits?.figureAltAttachedToReachableFigure).toBe(true);
    expect(details.debug?.rootReachableFigureCount).toBe(1);
  });

  it('treats role-map figure retag as structural and preserves invariant details', async () => {
    mocks.runPythonMutationBatch.mockResolvedValue({
      buffer: Buffer.from('after'),
      result: {
        success: true,
        applied: ['retag_as_figure'],
        failed: [],
        opResults: [{
          op: 'retag_as_figure',
          outcome: 'applied',
          note: 'rolemap_figure_retagged',
          invariants: {
            targetRef: '44_0',
            targetResolved: true,
            targetReachable: true,
            resolvedRole: 'Figure',
            targetHasAltAfter: true,
            targetIsFigureAfter: true,
            rootReachableFigureCountBefore: 0,
            rootReachableFigureCountAfter: 1,
            ownershipPreserved: true,
          },
          structuralBenefits: {
            figureOwnershipImproved: true,
            figureAltAttachedToReachableFigure: true,
          },
          debug: {
            candidate: {
              rawRole: 'InlineShape',
              resolvedRole: 'Figure',
              directContent: true,
            },
          },
        }],
      },
    });

    const result = await runSingleTool(
      Buffer.from('before'),
      { toolName: 'retag_as_figure', params: { structRef: '44_0' }, rationale: 'test' },
      bareSnapshot(),
    );

    expect(result.outcome).toBe('applied');
    expect(isStage35StructuralTool('retag_as_figure')).toBe(true);
    const details = parseMutationDetails(result.details) as PythonMutationDetailPayload;
    expect(details.note).toBe('rolemap_figure_retagged');
    expect(details.invariants?.targetRef).toBe('44_0');
    expect(details.structuralBenefits?.figureAltAttachedToReachableFigure).toBe(true);
  });

  it('does not report role-map retag as applied when Python says alt did not attach', async () => {
    mocks.runPythonMutationBatch.mockResolvedValue({
      buffer: Buffer.from('after'),
      result: {
        success: true,
        applied: [],
        failed: [],
        opResults: [{
          op: 'retag_as_figure',
          outcome: 'no_effect',
          note: 'alt_not_attached_to_reachable_figure',
          invariants: {
            targetRef: '44_0',
            targetResolved: true,
            targetReachable: true,
            resolvedRole: 'Figure',
            targetHasAltAfter: false,
            targetIsFigureAfter: true,
            rootReachableFigureCountBefore: 0,
            rootReachableFigureCountAfter: 1,
          },
        }],
      },
    });

    const result = await runSingleTool(
      Buffer.from('before'),
      { toolName: 'retag_as_figure', params: { structRef: '44_0' }, rationale: 'test' },
      bareSnapshot(),
    );

    expect(result.outcome).toBe('no_effect');
    expect(result.buffer.equals(Buffer.from('before'))).toBe(true);
    expect(parseMutationDetails(result.details)?.invariants?.targetHasAltAfter).toBe(false);
  });

  it('rejects tools that violate their route contract before calling Python', async () => {
    const result = await runSingleTool(
      Buffer.from('before'),
      {
        toolName: 'set_figure_alt_text',
        params: { structRef: '12_0' },
        rationale: 'test',
        route: 'near_pass_figure_recovery',
      },
      bareSnapshot(),
    );
    expect(result.outcome).toBe('rejected');
    expect(result.details).toBe('route_contract_prohibited(near_pass_figure_recovery:set_figure_alt_text)');
    expect(mocks.runPythonMutationBatch).not.toHaveBeenCalled();
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

describe('Stage 39 structural batching', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function planned(toolName: string, params: Record<string, unknown> = {}, route = 'figure_semantics'): PlannedRemediationTool {
    return {
      toolName,
      params,
      rationale: 'test',
      route: route as PlannedRemediationTool['route'],
    };
  }

  it('groups only same-route allowed bundle tools', () => {
    const tools = [
      planned('normalize_nested_figure_containers', { structRef: '10_0' }),
      planned('canonicalize_figure_alt_ownership', { structRef: '10_0' }),
      planned('set_figure_alt_text', { structRef: '10_0', altText: 'Image' }),
    ];

    expect(selectStage39Batch(tools, 0)).toBeNull();
    expect(selectStage39Batch(tools, 0, { enabled: true })?.role).toBe('figure_ownership_alt');
    expect(selectStage39Batch([
      tools[0]!,
      { ...tools[1]!, route: 'near_pass_figure_recovery' },
      tools[2]!,
    ], 0, { enabled: true })).toBeNull();
    expect(selectStage39Batch([
      tools[0]!,
      tools[1]!,
      { ...tools[2]!, route: 'near_pass_figure_recovery' },
    ], 0, { enabled: true })).toBeNull();
  });

  it('preserves per-op outcomes and batch metadata for a figure batch', async () => {
    mocks.runPythonMutationBatch.mockResolvedValue({
      buffer: Buffer.from('after'),
      result: {
        success: true,
        applied: ['canonicalize_figure_alt_ownership', 'set_figure_alt_text'],
        failed: [],
        opResults: [
          {
            op: 'normalize_nested_figure_containers',
            outcome: 'no_effect',
            note: 'no_structural_change',
          },
          {
            op: 'canonicalize_figure_alt_ownership',
            outcome: 'applied',
            invariants: {
              targetReachable: true,
              targetIsFigureAfter: true,
              rootReachableFigureCountBefore: 1,
              rootReachableFigureCountAfter: 1,
            },
            structuralBenefits: { figureOwnershipImproved: true },
          },
          {
            op: 'set_figure_alt_text',
            outcome: 'applied',
            invariants: {
              targetReachable: true,
              targetIsFigureAfter: true,
              targetHasAltAfter: true,
            },
            structuralBenefits: { figureAltAttachedToReachableFigure: true },
          },
        ],
      },
    });

    const batch = selectStage39Batch([
      planned('normalize_nested_figure_containers', { structRef: '10_0' }),
      planned('canonicalize_figure_alt_ownership', { structRef: '10_0' }),
      planned('set_figure_alt_text', { structRef: '10_0', altText: 'Image' }),
    ], 0, { enabled: true })!;
    const result = await runStage39Batch(Buffer.from('before'), batch);

    expect(mocks.runPythonMutationBatch).toHaveBeenCalledWith(
      Buffer.from('before'),
      [
        { op: 'normalize_nested_figure_containers', params: { structRef: '10_0' } },
        { op: 'canonicalize_figure_alt_ownership', params: { structRef: '10_0' } },
        { op: 'set_figure_alt_text', params: { structRef: '10_0', altText: 'Image' } },
      ],
      { abortOnFailedOp: true, reopenBetweenOps: true },
    );
    expect(result.buffer.equals(Buffer.from('after'))).toBe(true);
    expect(result.rows.map(row => row.outcome)).toEqual(['no_effect', 'applied', 'applied']);
    const details = result.rows.map(row => parseMutationDetails(row.details));
    expect(details[0]?.['batchRole']).toBe('figure_ownership_alt');
    expect(details[0]?.['batchIndex']).toBe(0);
    expect(details[2]?.structuralBenefits?.figureAltAttachedToReachableFigure).toBe(true);
  });

  it('aborts later rows after a hard batch failure and discards partial output', async () => {
    mocks.runPythonMutationBatch.mockResolvedValue({
      buffer: Buffer.from('partial'),
      result: {
        success: false,
        applied: [],
        failed: [{ op: 'repair_native_link_structure', error: 'boom' }],
        opResults: [{
          op: 'repair_native_link_structure',
          outcome: 'failed',
          error: 'boom',
        }],
      },
    });

    const batch = selectStage39Batch([
      planned('repair_native_link_structure', {}, 'annotation_link_normalization'),
      planned('set_link_annotation_contents', {}, 'annotation_link_normalization'),
      planned('tag_unowned_annotations', {}, 'annotation_link_normalization'),
    ], 0, { enabled: true })!;
    const result = await runStage39Batch(Buffer.from('before'), batch);

    expect(result.buffer.equals(Buffer.from('before'))).toBe(true);
    expect(result.rows.map(row => row.outcome)).toEqual(['failed', 'rejected', 'rejected']);
    expect(parseMutationDetails(result.rows[1]?.details)?.note).toBe('batch_aborted_after_failure');
  });

  it('requires typed structural benefits with passing invariants for batch preservation evidence', () => {
    expect(batchHasValidStructuralBenefit([{
      outcome: 'applied',
      details: JSON.stringify({
        outcome: 'applied',
        invariants: { tableTreeValidAfter: true },
        structuralBenefits: { tableValidityImproved: true },
      }),
    }])).toBe(true);
    expect(batchHasValidStructuralBenefit([{
      outcome: 'applied',
      details: JSON.stringify({
        outcome: 'applied',
        invariants: { tableTreeValidAfter: false },
        structuralBenefits: { tableValidityImproved: true },
      }),
    }])).toBe(false);
    expect(batchHasValidStructuralBenefit([{
      outcome: 'applied',
      details: JSON.stringify({
        outcome: 'applied',
        note: 'legacy_table_repair',
      }),
    }])).toBe(false);
  });

  it('treats normalize_table_structure as a Stage 35 structural table tool', async () => {
    expect(isStage35StructuralTool('normalize_table_structure')).toBe(true);
    mocks.runPythonMutationBatch.mockResolvedValue({
      buffer: Buffer.from('after'),
      result: {
        success: true,
        applied: ['normalize_table_structure'],
        failed: [],
        opResults: [{
          op: 'normalize_table_structure',
          outcome: 'applied',
          invariants: {
            targetRef: '20_0',
            targetResolved: true,
            resolvedRole: 'Table',
            directCellsUnderTableBefore: 4,
            directCellsUnderTableAfter: 0,
            headerCellCountBefore: 0,
            headerCellCountAfter: 2,
            tableTreeValidAfter: true,
          },
          structuralBenefits: { tableValidityImproved: true },
        }],
      },
    });

    const result = await runSingleTool(
      Buffer.from('before'),
      {
        toolName: 'normalize_table_structure',
        params: { structRef: '20_0' },
        stage: 4,
        reason: 'table',
        route: 'native_structure_repair',
      },
      bareSnapshot(),
    );
    expect(result.outcome).toBe('applied');
    expect(parseMutationDetails(result.details)?.structuralBenefits?.tableValidityImproved).toBe(true);
  });
});
