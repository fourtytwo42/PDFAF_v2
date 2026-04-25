import { describe, it, expect, vi } from 'vitest';
import Database from 'better-sqlite3';
import { initSchema } from '../../src/db/schema.js';
import { createToolOutcomeStore } from '../../src/services/learning/toolOutcomes.js';
import { buildDefaultParams, classifyStage43TableFailure, classifyStage44FigureFailure, deriveFailureDisposition, isToolAllowedByRouteContract, planForRemediation, routeContractFor } from '../../src/services/remediation/planner.js';
import { buildEligibleHeadingBootstrapCandidates } from '../../src/services/headingBootstrapCandidates.js';
import { classifyZeroHeadingRecovery } from '../../src/services/remediation/headingRecovery.js';
import { score } from '../../src/services/scorer/scorer.js';
import type { AnalysisResult, AppliedRemediationTool, DocumentSnapshot, RemediationRoute } from '../../src/types.js';

const META = { id: 'p', filename: 'bare.pdf', timestamp: new Date().toISOString(), analysisDurationMs: 1 };
const ALL_REMEDIATION_ROUTES: RemediationRoute[] = [
  'metadata_first_commit',
  'metadata_foundation',
  'untagged_structure_recovery',
  'structure_bootstrap_and_conformance',
  'post_bootstrap_heading_convergence',
  'structure_bootstrap',
  'annotation_link_normalization',
  'native_structure_repair',
  'font_ocr_repair',
  'font_unicode_tail_recovery',
  'figure_semantics',
  'near_pass_figure_recovery',
  'document_navigation_forms',
  'safe_cleanup',
];

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
  it('defines a complete auditable route contract for every remediation route', () => {
    for (const route of ALL_REMEDIATION_ROUTES) {
      const contract = routeContractFor(route);
      expect(contract.allowedTools.length, `${route} allowedTools`).toBeGreaterThan(0);
      expect(contract.failureTools?.length ?? 0, `${route} failureTools`).toBeGreaterThan(0);
      expect(contract.requiredFailureTools?.length ?? 0, `${route} requiredFailureTools`).toBeGreaterThan(0);

      for (const toolName of contract.allowedTools) {
        expect(isToolAllowedByRouteContract(route, toolName), `${route}:${toolName}`).toBe(true);
      }
      for (const toolName of contract.failureTools ?? []) {
        expect(contract.allowedTools, `${route}:${toolName} failure tool must be allowed`).toContain(toolName);
      }
      for (const toolName of contract.requiredFailureTools ?? []) {
        expect(contract.failureTools, `${route}:${toolName} required failure tool must be tracked`).toContain(toolName);
      }
      for (const toolName of contract.prohibitedTools ?? []) {
        expect(contract.allowedTools, `${route}:${toolName} cannot be both allowed and prohibited`).not.toContain(toolName);
        expect(isToolAllowedByRouteContract(route, toolName), `${route}:${toolName}`).toBe(false);
      }
    }
  });

  it('classifies invariant-backed structural failure dispositions', () => {
    const snap: DocumentSnapshot = {
      ...bareSnapshot(),
      isTagged: true,
      pdfClass: 'native_tagged',
      structureTree: { type: 'Document', children: [{ type: 'Sect', children: [] }] },
      figures: [{ hasAlt: false, isArtifact: false, page: 0, role: 'Span', structRef: '70_0' }],
      checkerFigureTargets: [{
        hasAlt: false,
        isArtifact: false,
        page: 0,
        role: 'Span',
        resolvedRole: 'Span',
        structRef: '70_0',
        reachable: false,
        directContent: false,
        parentPath: [],
      }],
      tables: [{ hasHeaders: false, headerCount: 0, totalCells: 4, page: 0, structRef: '80_0' }],
    };
    const analysis = withCategoryScores(score(snap, META), {
      heading_structure: 40,
      alt_text: 40,
      table_markup: 40,
      link_quality: 40,
    });
    const applied: AppliedRemediationTool[] = [
      {
        toolName: 'create_heading_from_candidate',
        stage: 4,
        round: 1,
        scoreBefore: 58,
        scoreAfter: 58,
        delta: 0,
        outcome: 'no_effect',
        details: JSON.stringify({
          outcome: 'no_effect',
          note: 'role_invalid_after_mutation',
          invariants: { targetRef: '40_0', targetReachable: false },
        }),
      },
      {
        toolName: 'normalize_nested_figure_containers',
        stage: 5,
        round: 1,
        scoreBefore: 58,
        scoreAfter: 58,
        delta: 0,
        outcome: 'no_effect',
        details: JSON.stringify({
          outcome: 'no_effect',
          note: 'target_not_checker_visible_figure',
          invariants: { targetRef: '70_0', targetReachable: false, targetIsFigureAfter: false },
        }),
      },
      {
        toolName: 'canonicalize_figure_alt_ownership',
        stage: 5,
        round: 1,
        scoreBefore: 58,
        scoreAfter: 58,
        delta: 0,
        outcome: 'no_effect',
        details: JSON.stringify({
          outcome: 'no_effect',
          note: 'target_not_checker_visible_figure',
          invariants: { targetRef: '70_0', targetReachable: false, targetIsFigureAfter: false },
        }),
      },
      {
        toolName: 'set_table_header_cells',
        stage: 4,
        round: 1,
        scoreBefore: 58,
        scoreAfter: 58,
        delta: 0,
        outcome: 'no_effect',
        details: JSON.stringify({
          outcome: 'no_effect',
          note: 'table_tree_still_invalid',
          invariants: { tableTreeValidAfter: false },
        }),
      },
      {
        toolName: 'tag_unowned_annotations',
        stage: 8,
        round: 1,
        scoreBefore: 58,
        scoreAfter: 58,
        delta: 0,
        outcome: 'no_effect',
        details: JSON.stringify({
          outcome: 'no_effect',
          note: 'annotation_ownership_not_preserved',
          invariants: {
            visibleAnnotationsMissingStructParentBefore: 2,
            visibleAnnotationsMissingStructParentAfter: 2,
            visibleAnnotationsMissingStructureBefore: 1,
            visibleAnnotationsMissingStructureAfter: 1,
          },
        }),
      },
    ];

    const disposition = deriveFailureDisposition(analysis, snap, applied);
    expect(disposition.headingCandidateBlocked).toBe(true);
    expect(disposition.figureOwnershipTargetBlocked).toBe(true);
    expect(disposition.checkerVisibleFigureMissingAlt).toBe(false);
    expect(disposition.tableHeaderOnlyBlocked).toBe(true);
    expect(disposition.annotationOwnershipBlocked).toBe(true);
    expect(disposition.triggeringSignals).toEqual(expect.arrayContaining([
      'failure_disposition_heading_target_blocked',
      'failure_disposition_figure_ownership_blocked',
      'failure_disposition_table_tree_invalid',
      'failure_disposition_annotation_ownership_blocked',
    ]));
  });

  it('plans metadata tools when title_language fails', () => {
    const snap = bareSnapshot();
    const analysis = score(snap, META);
    const plan = planForRemediation(analysis, snap, []);
    const names = plan.stages.flatMap(s => s.tools.map(t => t.toolName));
    expect(names).toContain('set_document_title');
    expect(names).toContain('set_document_language');
    expect(names).not.toContain('set_pdfua_identification');
  });

  it('prefers first-page text over filename for fallback document title', () => {
    const snap: DocumentSnapshot = {
      ...bareSnapshot(),
      pageCount: 2,
      textByPage: ['Actual Human Title\nBody copy', 'More copy'],
      textCharCount: 32,
    };
    const analysis = score(snap, META);
    expect(buildDefaultParams('set_document_title', analysis, snap)).toEqual({
      title: 'Actual Human Title',
    });
  });

  it('picks a title-like bootstrap heading candidate over long body text and captions', () => {
    const snap: DocumentSnapshot = {
      ...bareSnapshot(),
      pageCount: 3,
      textByPage: ['EXECUTIVE SUMMARY', 'Body', 'More body'],
      textCharCount: 600,
      pdfClass: 'native_tagged',
      isTagged: true,
      markInfo: { Marked: true },
      pdfUaVersion: '1',
      structureTree: { type: 'Document', children: [] },
      paragraphStructElems: [
        {
          tag: 'P',
          text: 'Figure 1: Population by age group',
          page: 0,
          structRef: '41_0',
          bbox: [40, 540, 320, 556],
        },
        {
          tag: 'P',
          text: 'EXECUTIVE SUMMARY',
          page: 0,
          structRef: '40_0',
          bbox: [40, 710, 220, 734],
        },
        {
          tag: 'P',
          text: 'This paragraph is long enough to look like body copy and should not be selected as a heading candidate because it is a sentence with punctuation.',
          page: 0,
          structRef: '42_0',
          bbox: [40, 420, 520, 440],
        },
      ],
    };
    const analysis = withCategoryScores(score(snap, META), {
      heading_structure: 0,
      alt_text: 0,
      reading_order: 0,
    });

    expect(buildDefaultParams('create_heading_from_candidate', analysis, snap)).toEqual({
      targetRef: '40_0',
      level: 1,
      text: 'EXECUTIVE SUMMARY',
    });
  });

  it('classifies zero-heading recovery buckets without filename or family rules', () => {
    const recoverableSnap: DocumentSnapshot = {
      ...bareSnapshot(),
      pageCount: 4,
      pdfClass: 'native_tagged',
      isTagged: true,
      structureTree: { type: 'Document', children: [{ type: 'Sect', children: [{ type: 'P', children: [] }] }] },
      paragraphStructElems: [{ tag: 'P', text: 'Executive Summary', page: 0, structRef: '10_0' }],
      detectionProfile: {
        readingOrderSignals: {
          missingStructureTree: false,
          structureTreeDepth: 3,
          degenerateStructureTree: false,
          annotationOrderRiskCount: 0,
          annotationStructParentRiskCount: 0,
          headerFooterPollutionRisk: false,
          sampledStructurePageOrderDriftCount: 0,
          multiColumnOrderRiskPages: 0,
          suspiciousPageCount: 0,
        },
        headingSignals: { extractedHeadingCount: 0, treeHeadingCount: 0, headingTreeDepth: 0, extractedHeadingsMissingFromTree: false },
        figureSignals: { extractedFigureCount: 0, treeFigureCount: 0, nonFigureRoleCount: 0, treeFigureMissingForExtractedFigures: false },
        pdfUaSignals: { orphanMcidCount: 0, suspectedPathPaintOutsideMc: 0, taggedAnnotationRiskCount: 0 },
        annotationSignals: {
          pagesMissingTabsS: 0,
          pagesAnnotationOrderDiffers: 0,
          linkAnnotationsMissingStructure: 0,
          nonLinkAnnotationsMissingStructure: 0,
          linkAnnotationsMissingStructParent: 0,
          nonLinkAnnotationsMissingStructParent: 0,
        },
        listSignals: { listItemMisplacedCount: 0, lblBodyMisplacedCount: 0, listsWithoutItems: 0 },
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
    };
    const recoverableAnalysis = withCategoryScores(score(recoverableSnap, META), { heading_structure: 0 });
    expect(classifyZeroHeadingRecovery(recoverableAnalysis, recoverableSnap).kind).toBe('recoverable_paragraph_tree');

    const minimalSnap: DocumentSnapshot = {
      ...recoverableSnap,
      paragraphStructElems: [],
      detectionProfile: {
        ...recoverableSnap.detectionProfile!,
        readingOrderSignals: {
          ...recoverableSnap.detectionProfile!.readingOrderSignals,
          structureTreeDepth: 2,
          degenerateStructureTree: true,
        },
      },
    };
    expect(classifyZeroHeadingRecovery(withCategoryScores(score(minimalSnap, META), { heading_structure: 0 }), minimalSnap).kind)
      .toBe('minimal_or_degenerate_tree');

    const hiddenMismatchSnap: DocumentSnapshot = {
      ...recoverableSnap,
      paragraphStructElems: [],
      detectionProfile: {
        ...recoverableSnap.detectionProfile!,
        headingSignals: { extractedHeadingCount: 0, treeHeadingCount: 2, headingTreeDepth: 3, extractedHeadingsMissingFromTree: false },
      },
    };
    expect(classifyZeroHeadingRecovery(withCategoryScores(score(hiddenMismatchSnap, META), { heading_structure: 0 }), hiddenMismatchSnap).kind)
      .toBe('hidden_export_mismatch');

    const hierarchySnap: DocumentSnapshot = {
      ...recoverableSnap,
      headings: [{ level: 3, text: 'Details', page: 0, structRef: '20_0' }],
    };
    expect(classifyZeroHeadingRecovery(withCategoryScores(score(hierarchySnap, META), { heading_structure: 55 }), hierarchySnap).kind)
      .toBe('hierarchy_only');
  });

  it('deduplicates repeated page furniture while keeping distinct candidate progression', () => {
    const snap: DocumentSnapshot = {
      ...bareSnapshot(),
      pageCount: 5,
      textByPage: ['Annual Report', 'Annual Report', 'Annual Report', 'Annual Report', 'Findings'],
      textCharCount: 600,
      pdfClass: 'native_tagged',
      isTagged: true,
      structureTree: { type: 'Document', children: [] },
      paragraphStructElems: [
        { tag: 'P', text: 'Annual Report', page: 0, structRef: '10_0', bbox: [40, 730, 220, 750] },
        { tag: 'P', text: 'Annual Report', page: 1, structRef: '11_0', bbox: [40, 730, 220, 750] },
        { tag: 'P', text: 'Annual Report', page: 2, structRef: '12_0', bbox: [40, 730, 220, 750] },
        { tag: 'P', text: 'Program Findings', page: 1, structRef: '13_0', bbox: [40, 650, 260, 670] },
      ],
    };

    const candidates = buildEligibleHeadingBootstrapCandidates(snap);
    expect(candidates.map(candidate => candidate.structRef)).toContain('13_0');
    expect(candidates.filter(candidate => candidate.text === 'Annual Report')).toHaveLength(1);
  });

  it('advances to the next ranked heading bootstrap candidate after a prior attempt', () => {
    const snap: DocumentSnapshot = {
      ...bareSnapshot(),
      pageCount: 3,
      textByPage: ['EXECUTIVE SUMMARY', 'Overview', 'Body'],
      textCharCount: 400,
      pdfClass: 'native_tagged',
      isTagged: true,
      markInfo: { Marked: true },
      pdfUaVersion: '1',
      structureTree: { type: 'Document', children: [] },
      paragraphStructElems: [
        { tag: 'P', text: 'EXECUTIVE SUMMARY', page: 0, structRef: '40_0', bbox: [40, 710, 220, 734] },
        { tag: 'P', text: 'Program Overview', page: 0, structRef: '41_0', bbox: [40, 670, 240, 692] },
      ],
    };
    const analysis = withCategoryScores(score(snap, META), {
      heading_structure: 0,
      reading_order: 35,
    });

    expect(
      buildDefaultParams(
        'create_heading_from_candidate',
        analysis,
        snap,
        [{
          toolName: 'create_heading_from_candidate',
          stage: 4,
          round: 1,
          scoreBefore: 58,
          scoreAfter: 58,
          delta: 0,
          outcome: 'no_effect',
          details: JSON.stringify({
            outcome: 'no_effect',
            note: 'role_invalid_after_mutation',
            invariants: { targetRef: '40_0', targetReachable: false },
          }),
        }],
      ),
    ).toEqual({
      targetRef: '41_0',
      level: 1,
      text: 'Program Overview',
    });
  });

  it('does not treat structure-depth or multiple-H1 heading no-effects as blocked targets', () => {
    const snap: DocumentSnapshot = {
      ...bareSnapshot(),
      pageCount: 3,
      textByPage: ['EXECUTIVE SUMMARY', 'Overview', 'Body'],
      textCharCount: 400,
      pdfClass: 'native_tagged',
      isTagged: true,
      markInfo: { Marked: true },
      pdfUaVersion: '1',
      structureTree: { type: 'Document', children: [] },
      paragraphStructElems: [
        { tag: 'P', text: 'EXECUTIVE SUMMARY', page: 0, structRef: '40_0', bbox: [40, 710, 220, 734] },
        { tag: 'P', text: 'Program Overview', page: 0, structRef: '41_0', bbox: [40, 670, 240, 692] },
      ],
    };
    const analysis = withCategoryScores(score(snap, META), {
      heading_structure: 0,
      reading_order: 35,
    });
    const applied: AppliedRemediationTool[] = [
      {
        toolName: 'create_heading_from_candidate',
        stage: 4,
        round: 1,
        scoreBefore: 58,
        scoreAfter: 58,
        delta: 0,
        outcome: 'no_effect',
        details: JSON.stringify({
          outcome: 'no_effect',
          note: 'structure_depth_not_improved',
          invariants: { targetRef: '40_0', targetReachable: true, headingCandidateReachable: true },
        }),
      },
      {
        toolName: 'create_heading_from_candidate',
        stage: 4,
        round: 1,
        scoreBefore: 58,
        scoreAfter: 58,
        delta: 0,
        outcome: 'no_effect',
        details: JSON.stringify({
          outcome: 'no_effect',
          note: 'multiple_h1_after_mutation',
          invariants: { targetRef: '41_0', targetReachable: true, headingCandidateReachable: true },
        }),
      },
    ];

    const disposition = deriveFailureDisposition(analysis, snap, applied);
    expect(disposition.headingCandidateBlocked).toBe(false);
    expect(disposition.triggeringSignals).not.toContain('failure_disposition_heading_target_blocked');
  });

  it('keeps the final configured heading bootstrap candidate eligible after prior no-effect attempts', () => {
    const snap: DocumentSnapshot = {
      ...bareSnapshot(),
      pageCount: 4,
      textByPage: ['EXECUTIVE SUMMARY', 'Overview', 'Findings', 'Recommendations'],
      textCharCount: 800,
      pdfClass: 'native_tagged',
      isTagged: true,
      markInfo: { Marked: true },
      pdfUaVersion: '1',
      structureTree: { type: 'Document', children: [] },
      paragraphStructElems: [
        { tag: 'P', text: 'EXECUTIVE SUMMARY', page: 0, structRef: '40_0', bbox: [40, 710, 220, 734] },
        { tag: 'P', text: 'Program Overview', page: 0, structRef: '41_0', bbox: [40, 670, 240, 692] },
        { tag: 'P', text: 'Key Findings', page: 1, structRef: '42_0', bbox: [40, 670, 240, 692] },
        { tag: 'P', text: 'Recommendations', page: 2, structRef: '43_0', bbox: [40, 670, 240, 692] },
      ],
    };
    const analysis = withCategoryScores(score(snap, META), {
      heading_structure: 0,
      reading_order: 35,
    });
    const applied: AppliedRemediationTool[] = [
      { toolName: 'create_heading_from_candidate', stage: 4, round: 1, scoreBefore: 58, scoreAfter: 58, delta: 0, outcome: 'no_effect' },
      { toolName: 'create_heading_from_candidate', stage: 4, round: 1, scoreBefore: 58, scoreAfter: 58, delta: 0, outcome: 'no_effect' },
    ];

    expect(buildDefaultParams('create_heading_from_candidate', analysis, snap, applied)).toEqual({
      targetRef: '42_0',
      level: 1,
      text: 'Key Findings',
    });
  });

  it('rejects bylines and weak single tokens while preferring multi-word report titles', () => {
    const snap: DocumentSnapshot = {
      ...bareSnapshot(),
      pageCount: 2,
      textByPage: ['Research at a Glance', 'Body'],
      textCharCount: 200,
      pdfClass: 'native_tagged',
      isTagged: true,
      markInfo: { Marked: true },
      pdfUaVersion: '1',
      structureTree: { type: 'Document', children: [] },
      paragraphStructElems: [
        { tag: 'P', text: 'Illinois', page: 0, structRef: '10_0', bbox: [40, 720, 160, 736] },
        { tag: 'P', text: 'RESEA', page: 0, structRef: '11_0', bbox: [40, 700, 140, 716] },
        { tag: 'P', text: 'Rod R. Blagojevich, Governor', page: 0, structRef: '12_0', bbox: [40, 680, 260, 698] },
        { tag: 'P', text: 'for more information on this topic.', page: 0, structRef: '12a_0', bbox: [40, 660, 280, 676] },
        { tag: 'P', text: 'Research at a Glance', page: 0, structRef: '13_0', bbox: [40, 730, 250, 748] },
      ],
    };

    const candidates = buildEligibleHeadingBootstrapCandidates(snap);
    expect(candidates.map(candidate => candidate.structRef)).toEqual(['13_0']);
    expect(buildDefaultParams('create_heading_from_candidate', score(snap, META), snap)).toEqual({
      targetRef: '13_0',
      level: 1,
      text: 'Research at a Glance',
    });
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
    expect(names).not.toContain('set_pdfua_identification');
    expect(names).not.toContain('set_figure_alt_text');
    expect(names).not.toContain('repair_native_reading_order');
  });

  it('stops metadata routes with a deterministic reason after required tools terminally fail', () => {
    const snap: DocumentSnapshot = {
      ...bareSnapshot(),
      metadata: { title: '', language: '', author: '', subject: '' },
      pdfUaVersion: null,
      structureTree: { type: 'Document', children: [] },
      isTagged: true,
      pdfClass: 'native_tagged',
    };
    const analysis = withCategoryScores(score(snap, META), { title_language: 40 });
    const plan = planForRemediation(analysis, snap, [
      { toolName: 'set_document_title', stage: 1, round: 1, scoreBefore: 80, scoreAfter: 80, delta: 0, outcome: 'no_effect' },
      { toolName: 'set_document_language', stage: 1, round: 1, scoreBefore: 80, scoreAfter: 80, delta: 0, outcome: 'no_effect' },
    ]);
    expect(plan.planningSummary?.routeSummaries).toContainEqual({
      route: 'metadata_foundation',
      status: 'stopped',
      reason: 'route_failure_proof(metadata_foundation:set_document_title,set_document_language)',
      scheduledTools: [],
    });
    expect(plan.stages.flatMap(stage => stage.tools.map(tool => tool.toolName))).toEqual([]);
  });

  it('re-enables pdf_ua and bookmark diagnostics when optional remediation is requested', () => {
    const snap = bareSnapshot();
    const analysis = score(snap, META);
    const plan = planForRemediation(analysis, snap, [], undefined, true);
    const names = plan.stages.flatMap(s => s.tools.map(t => t.toolName));
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
    expect(names).toContain('set_figure_alt_text');
    expect(plan.planningSummary?.skippedTools).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ toolName: 'retag_as_figure', reason: 'missing_precondition' }),
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

  it('routes untagged digital structure debt into structure_bootstrap_and_conformance', () => {
    const snap: DocumentSnapshot = {
      ...bareSnapshot(),
      pageCount: 4,
      textByPage: ['Title', 'Body', 'Section', 'Body 2'],
      textCharCount: 600,
      pdfClass: 'native_untagged',
      detectionProfile: {
        readingOrderSignals: {
          missingStructureTree: true,
          annotationOrderRiskCount: 0,
          annotationStructParentRiskCount: 0,
          headerFooterPollutionRisk: false,
          sampledStructurePageOrderDriftCount: 0,
          multiColumnOrderRiskPages: 0,
          suspiciousPageCount: 2,
        },
        pdfUaSignals: {
          orphanMcidCount: 0,
          suspectedPathPaintOutsideMc: 0,
          taggedAnnotationRiskCount: 0,
        },
        annotationSignals: {
          pagesMissingTabsS: 0,
          pagesAnnotationOrderDiffers: 0,
          linkAnnotationsMissingStructure: 0,
          nonLinkAnnotationsMissingStructure: 0,
          linkAnnotationsMissingStructParent: 0,
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
        sampledPages: [0, 1],
        confidence: 'high',
      },
    };
    const base = score(snap, META);
    const analysis = withRoutingContext(
      withCategoryScores(base, {
        pdf_ua_compliance: 0,
        heading_structure: 0,
        reading_order: 30,
        text_extractability: 65,
      }),
      {
        detectionProfile: snap.detectionProfile,
      },
    );
    const plan = planForRemediation(analysis, snap, []);
    const names = plan.stages.flatMap(s => s.tools.map(t => t.toolName));
    expect(plan.planningSummary?.primaryRoute).toBe('structure_bootstrap_and_conformance');
    expect(names).toContain('synthesize_basic_structure_from_layout');
    expect(names).toContain('artifact_repeating_page_furniture');
  });

  it('does not route already-tagged near-pass files into structure_bootstrap_and_conformance', () => {
    const snap: DocumentSnapshot = {
      ...bareSnapshot(),
      pageCount: 3,
      textByPage: ['Title', 'Body', 'Body'],
      textCharCount: 500,
      isTagged: true,
      markInfo: { Marked: true },
      pdfUaVersion: '1',
      pdfClass: 'native_tagged',
      structureTree: { type: 'Document', children: [] },
    };
    const base = score(snap, META);
    const analysis = withCategoryScores(base, {
      pdf_ua_compliance: 83,
      alt_text: 50,
    });
    const plan = planForRemediation(analysis, snap, []);
    expect(plan.planningSummary?.primaryRoute).not.toBe('structure_bootstrap_and_conformance');
  });

  it('routes high-score alt residuals into near_pass_figure_recovery', () => {
    const structuralClassification = {
      structureClass: 'native_tagged' as const,
      contentProfile: {
        pageBucket: '1-5' as const,
        dominantContent: 'mixed' as const,
        hasStructureTree: true,
        hasBookmarks: false,
        hasFigures: true,
        hasTables: false,
        hasForms: false,
        annotationRisk: false,
        taggedContentRisk: false,
        listStructureRisk: false,
      },
      fontRiskProfile: {
        riskLevel: 'low' as const,
        riskyFontCount: 0,
        missingUnicodeFontCount: 0,
        unembeddedFontCount: 0,
        ocrTextLayerSuspected: false,
      },
      confidence: 'high' as const,
    };
    const snap: DocumentSnapshot = {
      ...bareSnapshot(),
      pageCount: 3,
      textByPage: ['Title', 'Body', 'Body'],
      textCharCount: 900,
      isTagged: true,
      markInfo: { Marked: true },
      pdfUaVersion: '1',
      pdfClass: 'native_tagged',
      structureTree: { type: 'Document', children: [] },
      figures: [{ hasAlt: false, isArtifact: false, page: 1, structRef: '10_0' }],
    };
    const base = score(snap, META);
    const analysis = withRoutingContext(
      {
        ...withCategoryScores(base, { alt_text: 50, pdf_ua_compliance: 83 }),
        score: 88,
        grade: 'B',
      },
      {
        structuralClassification,
        failureProfile: {
          deterministicIssues: ['pdf_ua_compliance'],
          semanticIssues: ['alt_text'],
          manualOnlyIssues: ['alt_text'],
          primaryFailureFamily: 'near_pass_residual',
          secondaryFailureFamilies: ['figure_alt_ownership_heavy'],
          routingHints: [],
        },
      },
    );
    const plan = planForRemediation(analysis, snap, []);
    const names = plan.stages.flatMap(s => s.tools.map(t => t.toolName));
    expect(plan.planningSummary?.primaryRoute).toBe('near_pass_figure_recovery');
    expect(plan.planningSummary?.routeSummaries).toContainEqual({
      route: 'near_pass_figure_recovery',
      status: 'active',
      scheduledTools: expect.arrayContaining(['normalize_nested_figure_containers', 'canonicalize_figure_alt_ownership']),
    });
    expect(names).toContain('normalize_nested_figure_containers');
    expect(names).toContain('canonicalize_figure_alt_ownership');
    expect(names).not.toContain('set_figure_alt_text');
    expect(plan.stages.flatMap(s => s.tools).every(tool => tool.route === 'near_pass_figure_recovery')).toBe(true);
  });

  it('classifies broken checker-visible figure ownership without blocking the figure route', () => {
    const snap: DocumentSnapshot = {
      ...bareSnapshot(),
      pageCount: 2,
      textByPage: ['Title', 'Body'],
      textCharCount: 500,
      isTagged: true,
      markInfo: { Marked: true },
      pdfUaVersion: '1',
      pdfClass: 'native_tagged',
      structureTree: { type: 'Document', children: [{ type: 'Sect', children: [] }] },
      figures: [{ hasAlt: false, isArtifact: false, page: 0, role: 'Span', structRef: '70_0' }],
      checkerFigureTargets: [{
        hasAlt: false,
        isArtifact: false,
        page: 0,
        role: 'Span',
        resolvedRole: 'Span',
        structRef: '70_0',
        reachable: true,
        directContent: true,
        parentPath: ['Span@70_0'],
      }],
      detectionProfile: {
        readingOrderSignals: {
          missingStructureTree: false,
          structureTreeDepth: 3,
          degenerateStructureTree: false,
          annotationOrderRiskCount: 0,
          annotationStructParentRiskCount: 0,
          headerFooterPollutionRisk: false,
          sampledStructurePageOrderDriftCount: 0,
          multiColumnOrderRiskPages: 0,
          suspiciousPageCount: 0,
        },
        headingSignals: {
          extractedHeadingCount: 1,
          treeHeadingCount: 1,
          headingTreeDepth: 2,
          extractedHeadingsMissingFromTree: false,
        },
        figureSignals: {
          extractedFigureCount: 1,
          treeFigureCount: 0,
          nonFigureRoleCount: 1,
          treeFigureMissingForExtractedFigures: true,
        },
        pdfUaSignals: { orphanMcidCount: 0, suspectedPathPaintOutsideMc: 0, taggedAnnotationRiskCount: 0 },
        annotationSignals: {
          pagesMissingTabsS: 0,
          pagesAnnotationOrderDiffers: 0,
          linkAnnotationsMissingStructure: 0,
          nonLinkAnnotationsMissingStructure: 0,
          linkAnnotationsMissingStructParent: 0,
          nonLinkAnnotationsMissingStructParent: 0,
        },
        listSignals: { listItemMisplacedCount: 0, lblBodyMisplacedCount: 0, listsWithoutItems: 0 },
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
    };
    const analysis = withRoutingContext(withCategoryScores(score(snap, META), { alt_text: 40 }), {
      detectionProfile: snap.detectionProfile,
      failureProfile: {
        deterministicIssues: [],
        semanticIssues: ['alt_text'],
        manualOnlyIssues: [],
        primaryFailureFamily: 'figure_alt_ownership_heavy',
        secondaryFailureFamilies: [],
        routingHints: [],
      },
    });

    const plan = planForRemediation(analysis, snap, []);
    const names = plan.stages.flatMap(stage => stage.tools.map(tool => tool.toolName));
    expect(names).toContain('normalize_nested_figure_containers');
    expect(names).toContain('canonicalize_figure_alt_ownership');
    expect(plan.planningSummary?.triggeringSignals).not.toContain('failure_disposition_figure_alt_assignable');
  });

  it('schedules alt assignment when a checker-visible figure is reachable and missing alt', () => {
    const snap: DocumentSnapshot = {
      ...bareSnapshot(),
      pageCount: 2,
      textByPage: ['Title', 'Body'],
      textCharCount: 500,
      isTagged: true,
      markInfo: { Marked: true },
      pdfUaVersion: '1',
      pdfClass: 'native_tagged',
      structureTree: { type: 'Document', children: [{ type: 'Sect', children: [] }] },
      figures: [{ hasAlt: false, isArtifact: false, page: 0, role: 'Figure', structRef: '70_0' }],
      checkerFigureTargets: [{
        hasAlt: false,
        isArtifact: false,
        page: 0,
        role: 'Figure',
        resolvedRole: 'Figure',
        structRef: '70_0',
        reachable: true,
        directContent: true,
        parentPath: ['Figure@70_0'],
      }],
    };
    const analysis = withRoutingContext(withCategoryScores(score(snap, META), { alt_text: 40 }), {
      failureProfile: {
        deterministicIssues: [],
        semanticIssues: ['alt_text'],
        manualOnlyIssues: [],
        primaryFailureFamily: 'figure_alt_ownership_heavy',
        secondaryFailureFamilies: [],
        routingHints: [],
      },
    });

    const plan = planForRemediation(analysis, snap, []);
    const names = plan.stages.flatMap(stage => stage.tools.map(tool => tool.toolName));
    expect(names).toContain('set_figure_alt_text');
    expect(plan.planningSummary?.triggeringSignals).toContain('failure_disposition_figure_alt_assignable');
  });

  it('classifies Stage 44 missing alt on reachable checker-visible figures', () => {
    const snap: DocumentSnapshot = {
      ...bareSnapshot(),
      isTagged: true,
      pdfClass: 'native_tagged',
      structureTree: { type: 'Document', children: [] },
      figures: [{ hasAlt: false, isArtifact: false, page: 0, role: 'Figure', structRef: '70_0' }],
      checkerFigureTargets: [{
        hasAlt: false,
        isArtifact: false,
        page: 0,
        role: 'Span',
        resolvedRole: 'Figure',
        structRef: '70_0',
        reachable: true,
        directContent: true,
        parentPath: ['Figure@70_0'],
      }],
    };
    const analysis = withCategoryScores(score(snap, META), { alt_text: 40 });

    expect(classifyStage44FigureFailure(snap, analysis)).toBe('missing_alt_on_reachable_figures');
    expect(buildDefaultParams('set_figure_alt_text', analysis, snap)).toEqual({
      structRef: '70_0',
      altText: 'Illustration (page 1)',
    });
  });

  it('classifies Stage 44 broken figure ownership and suppresses alt assignment until ownership is fixed', () => {
    const snap: DocumentSnapshot = {
      ...bareSnapshot(),
      isTagged: true,
      pdfClass: 'native_tagged',
      structureTree: { type: 'Document', children: [] },
      figures: [{ hasAlt: false, isArtifact: false, page: 0, role: 'Span', structRef: '70_0' }],
      checkerFigureTargets: [{
        hasAlt: false,
        isArtifact: false,
        page: 0,
        role: 'Span',
        resolvedRole: 'Span',
        structRef: '70_0',
        reachable: true,
        directContent: true,
        parentPath: ['Span@70_0'],
      }],
      detectionProfile: {
        readingOrderSignals: {
          missingStructureTree: false,
          structureTreeDepth: 2,
          degenerateStructureTree: false,
          annotationOrderRiskCount: 0,
          annotationStructParentRiskCount: 0,
          headerFooterPollutionRisk: false,
          sampledStructurePageOrderDriftCount: 0,
          multiColumnOrderRiskPages: 0,
          suspiciousPageCount: 0,
        },
        headingSignals: { extractedHeadingCount: 0, treeHeadingCount: 0, headingTreeDepth: 0, extractedHeadingsMissingFromTree: false },
        figureSignals: {
          extractedFigureCount: 1,
          treeFigureCount: 0,
          nonFigureRoleCount: 1,
          treeFigureMissingForExtractedFigures: true,
        },
        pdfUaSignals: { orphanMcidCount: 0, suspectedPathPaintOutsideMc: 0, taggedAnnotationRiskCount: 0 },
        annotationSignals: {
          pagesMissingTabsS: 0,
          pagesAnnotationOrderDiffers: 0,
          linkAnnotationsMissingStructure: 0,
          nonLinkAnnotationsMissingStructure: 0,
          linkAnnotationsMissingStructParent: 0,
          nonLinkAnnotationsMissingStructParent: 0,
        },
        listSignals: { listItemMisplacedCount: 0, lblBodyMisplacedCount: 0, listsWithoutItems: 0 },
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
    };
    const analysis = withRoutingContext(withCategoryScores(score(snap, META), { alt_text: 40 }), {
      detectionProfile: snap.detectionProfile,
      failureProfile: {
        deterministicIssues: [],
        semanticIssues: ['alt_text'],
        manualOnlyIssues: [],
        primaryFailureFamily: 'figure_alt_ownership_heavy',
        secondaryFailureFamilies: [],
        routingHints: [],
      },
    });

    expect(classifyStage44FigureFailure(snap, analysis)).toBe('broken_figure_ownership');
    expect(buildDefaultParams('set_figure_alt_text', analysis, snap)).toEqual({});
    const names = planForRemediation(analysis, snap, []).stages.flatMap(stage => stage.tools.map(tool => tool.toolName));
    expect(names).toContain('normalize_nested_figure_containers');
    expect(names).toContain('canonicalize_figure_alt_ownership');
    expect(names).not.toContain('set_figure_alt_text');
  });

  it('targets role-mapped reachable figure elements for narrow retagging before alt assignment', () => {
    const snap: DocumentSnapshot = {
      ...bareSnapshot(),
      isTagged: true,
      pdfClass: 'native_tagged',
      structureTree: { type: 'Document', children: [] },
      figures: [{
        hasAlt: false,
        isArtifact: false,
        page: 0,
        rawRole: 'InlineShape',
        role: 'Figure',
        structRef: '90_0',
        reachable: true,
        directContent: true,
        subtreeMcidCount: 1,
      }],
      detectionProfile: {
        readingOrderSignals: {
          missingStructureTree: false,
          structureTreeDepth: 3,
          degenerateStructureTree: false,
          annotationOrderRiskCount: 0,
          annotationStructParentRiskCount: 0,
          headerFooterPollutionRisk: false,
          sampledStructurePageOrderDriftCount: 0,
          multiColumnOrderRiskPages: 0,
          suspiciousPageCount: 0,
        },
        headingSignals: {
          extractedHeadingCount: 1,
          treeHeadingCount: 1,
          headingTreeDepth: 3,
          extractedHeadingsMissingFromTree: false,
        },
        figureSignals: {
          extractedFigureCount: 1,
          treeFigureCount: 0,
          nonFigureRoleCount: 1,
          treeFigureMissingForExtractedFigures: true,
        },
        pdfUaSignals: { orphanMcidCount: 0, suspectedPathPaintOutsideMc: 0, taggedAnnotationRiskCount: 0 },
        annotationSignals: {
          pagesMissingTabsS: 0,
          pagesAnnotationOrderDiffers: 0,
          linkAnnotationsMissingStructure: 0,
          nonLinkAnnotationsMissingStructure: 0,
          linkAnnotationsMissingStructParent: 0,
          nonLinkAnnotationsMissingStructParent: 0,
        },
        listSignals: { listItemMisplacedCount: 0, lblBodyMisplacedCount: 0, listsWithoutItems: 0 },
        tableSignals: { tablesWithMisplacedCells: 0, misplacedCellCount: 0, irregularTableCount: 0, stronglyIrregularTableCount: 0, directCellUnderTableCount: 0 },
        sampledPages: [],
        confidence: 'high',
      },
    };
    const analysis = withRoutingContext(withCategoryScores(score(snap, META), { alt_text: 0 }), {
      detectionProfile: snap.detectionProfile,
    });

    expect(classifyStage44FigureFailure(snap, analysis)).toBe('broken_figure_ownership');
    expect(buildDefaultParams('retag_as_figure', analysis, snap)).toEqual({
      structRef: '90_0',
      altText: 'Illustration (page 1)',
    });
    const names = planForRemediation(analysis, snap, []).stages.flatMap(stage => stage.tools.map(tool => tool.toolName));
    expect(names).toContain('retag_as_figure');
  });

  it('does not target unreachable or contentless role-mapped figures for retagging', () => {
    const snap: DocumentSnapshot = {
      ...bareSnapshot(),
      isTagged: true,
      pdfClass: 'native_tagged',
      structureTree: { type: 'Document', children: [] },
      figures: [
        { hasAlt: false, isArtifact: false, page: 0, rawRole: 'InlineShape', role: 'Figure', structRef: '91_0', reachable: false, directContent: true, subtreeMcidCount: 1 },
        { hasAlt: false, isArtifact: false, page: 0, rawRole: 'Shape', role: 'Figure', structRef: '92_0', reachable: true, directContent: false, subtreeMcidCount: 0 },
      ],
    };
    const analysis = withCategoryScores(score(snap, META), { alt_text: 0 });
    expect(buildDefaultParams('retag_as_figure', analysis, snap)).toEqual({});
  });

  it('classifies Stage 44 alt cleanup risk only when Acrobat-style ownership risks exist', () => {
    const snap: DocumentSnapshot = {
      ...bareSnapshot(),
      isTagged: true,
      pdfClass: 'native_tagged',
      structureTree: { type: 'Document', children: [] },
      figures: [{ hasAlt: true, altText: 'Diagram', isArtifact: false, page: 0, role: 'Figure', structRef: '70_0' }],
      checkerFigureTargets: [{
        hasAlt: true,
        altText: 'Diagram',
        isArtifact: false,
        page: 0,
        role: 'Figure',
        resolvedRole: 'Figure',
        structRef: '70_0',
        reachable: true,
        directContent: true,
        parentPath: ['Figure@70_0'],
      }],
      acrobatStyleAltRisks: {
        nonFigureWithAltCount: 1,
        nestedFigureAltCount: 0,
        orphanedAltEmptyElementCount: 0,
        sampleOwnershipModes: ['non_figure_with_alt'],
      },
    };
    const analysis = withCategoryScores(score(snap, META), { alt_text: 40 });

    expect(classifyStage44FigureFailure(snap, analysis)).toBe('alt_cleanup_risk');
    const names = planForRemediation(analysis, snap, []).stages.flatMap(stage => stage.tools.map(tool => tool.toolName));
    expect(names).toContain('repair_alt_text_structure');
  });

  it('stops a route when its failure proof is already satisfied', () => {
    const snap: DocumentSnapshot = {
      ...bareSnapshot(),
      pageCount: 3,
      textByPage: ['Title', 'Body', 'Body'],
      textCharCount: 900,
      isTagged: true,
      markInfo: { Marked: true },
      pdfUaVersion: '1',
      pdfClass: 'native_tagged',
      structureTree: { type: 'Document', children: [] },
      figures: [{ hasAlt: false, isArtifact: false, page: 1, structRef: '10_0' }],
    };
    const base = score(snap, META);
    const analysis = withRoutingContext(
      {
        ...withCategoryScores(base, { alt_text: 50 }),
        score: 88,
        grade: 'B',
      },
      {
        structuralClassification: {
          structureClass: 'native_tagged',
          contentProfile: {
            pageBucket: '1-5',
            dominantContent: 'mixed',
            hasStructureTree: true,
            hasBookmarks: false,
            hasFigures: true,
            hasTables: false,
            hasForms: false,
            annotationRisk: false,
            taggedContentRisk: false,
            listStructureRisk: false,
          },
          fontRiskProfile: {
            riskLevel: 'low',
            riskyFontCount: 0,
            missingUnicodeFontCount: 0,
            unembeddedFontCount: 0,
            ocrTextLayerSuspected: false,
          },
          confidence: 'high',
        },
        failureProfile: {
          deterministicIssues: [],
          semanticIssues: ['alt_text'],
          manualOnlyIssues: ['alt_text'],
          primaryFailureFamily: 'near_pass_residual',
          secondaryFailureFamilies: ['figure_alt_ownership_heavy'],
          routingHints: [],
        },
      },
    );
    const plan = planForRemediation(analysis, snap, [
      { toolName: 'normalize_nested_figure_containers', stage: 4, round: 1, scoreBefore: 88, scoreAfter: 88, delta: 0, outcome: 'no_effect' },
      { toolName: 'canonicalize_figure_alt_ownership', stage: 4, round: 1, scoreBefore: 88, scoreAfter: 88, delta: 0, outcome: 'no_effect' },
    ]);
    expect(plan.planningSummary?.routeSummaries).toContainEqual({
      route: 'near_pass_figure_recovery',
      status: 'stopped',
      reason: 'route_failure_proof(near_pass_figure_recovery:normalize_nested_figure_containers,canonicalize_figure_alt_ownership)',
      scheduledTools: [],
    });
    expect(plan.stages.flatMap(s => s.tools.map(t => t.toolName))).not.toEqual(
      expect.arrayContaining(['normalize_nested_figure_containers', 'canonicalize_figure_alt_ownership']),
    );
  });

  it('routes tagged heading debt into post_bootstrap_heading_convergence', () => {
    const snap: DocumentSnapshot = {
      ...bareSnapshot(),
      pageCount: 4,
      textByPage: ['Title', 'Body', 'Body', 'Body'],
      textCharCount: 1200,
      isTagged: true,
      markInfo: { Marked: true },
      pdfUaVersion: '1',
      pdfClass: 'native_tagged',
      structureTree: { type: 'Document', children: [] },
      headings: [
        { level: 1, text: 'Executive Summary', page: 0, structRef: '10_0' },
        { level: 2, text: 'Overview', page: 1, structRef: '10_1' },
      ],
      paragraphStructElems: [
        { tag: 'P', text: 'Executive Summary', page: 0, structRef: '20_0' },
      ],
    };
    const base = score(snap, META);
    const analysis = withCategoryScores(base, {
      heading_structure: 55,
      reading_order: 82,
      text_extractability: 96,
    });
    const plan = planForRemediation(analysis, snap, []);
    const names = plan.stages.flatMap(s => s.tools.map(t => t.toolName));
    expect(plan.planningSummary?.primaryRoute).toBe('post_bootstrap_heading_convergence');
    expect(names).toContain('normalize_heading_hierarchy');
    expect(names).not.toContain('create_heading_from_candidate');
  });

  it('routes native Type1 font survivors into font_unicode_tail_recovery', () => {
    const snap: DocumentSnapshot = {
      ...bareSnapshot(),
      pageCount: 3,
      textByPage: ['Text', 'More text', 'Body'],
      textCharCount: 800,
      pdfClass: 'native_untagged',
      fonts: [
        { name: 'CenturyBold', subtype: 'Type1', isEmbedded: false, hasUnicode: false, encodingRisk: true },
      ],
    };
    const base = score(snap, META);
    const analysis = withRoutingContext(
      withCategoryScores(base, {
        text_extractability: 45,
        heading_structure: 95,
        reading_order: 95,
      }),
      {
        failureProfile: {
          deterministicIssues: ['text_extractability'],
          semanticIssues: [],
          manualOnlyIssues: [],
          primaryFailureFamily: 'font_extractability_heavy',
          secondaryFailureFamilies: [],
          routingHints: ['prefer_font_repair'],
        },
      },
    );
    const plan = planForRemediation(analysis, snap, []);
    const names = plan.stages.flatMap(s => s.tools.map(t => t.toolName));
    expect(plan.planningSummary?.primaryRoute).toBe('font_unicode_tail_recovery');
    expect(names).toContain('substitute_legacy_fonts_in_place');
    expect(names).toContain('finalize_substituted_font_conformance');
    expect(names).not.toContain('ocr_scanned_pdf');
  });

  it('does not schedule OCR for native text-rich PDFs when extractability is not text-starved', () => {
    const snap: DocumentSnapshot = {
      ...bareSnapshot(),
      pageCount: 4,
      textByPage: ['Lots of text', 'Lots of text', 'Lots of text', 'Lots of text'],
      textCharCount: 1000,
      pdfClass: 'native_untagged',
    };
    const base = score(snap, META);
    const analysis = withCategoryScores(base, { text_extractability: 65 });
    const plan = planForRemediation(analysis, snap, []);
    const names = plan.stages.flatMap(s => s.tools.map(t => t.toolName));
    expect(names).not.toContain('ocr_scanned_pdf');
  });

  it('requires link debt or annotation signals before scheduling set_link_annotation_contents', () => {
    const snap: DocumentSnapshot = {
      ...bareSnapshot(),
      isTagged: true,
      pdfClass: 'native_tagged',
      structureTree: { type: 'Document', children: [] },
      links: [{ text: 'Example', url: 'https://example.com', page: 0 }],
    };
    const base = score(snap, META);
    const analysis = withCategoryScores(base, { link_quality: 100 });
    const plan = planForRemediation(analysis, snap, []);
    const names = plan.stages.flatMap(s => s.tools.map(t => t.toolName));
    expect(names).not.toContain('set_link_annotation_contents');
  });

  it('returns empty plan when score already at target', () => {
    const snap: DocumentSnapshot = {
      ...bareSnapshot(),
      pageCount: 1,
      isTagged: true,
      structureTree: { type: 'Document', children: [] },
      metadata: { title: 'Doc', language: 'en', author: '', subject: '' },
      lang: 'en',
      pdfUaVersion: '1',
    };
    const analysis = score(snap, META);
    const high = {
      ...analysis,
      score: 95,
      categories: analysis.categories.map(c => ({ ...c, score: 95 })),
    };
    const plan = planForRemediation(high, snap, []);
    expect(plan.stages).toHaveLength(0);
  });

  it('does not return an empty plan at target score when external-readiness debt remains', () => {
    const snap: DocumentSnapshot = {
      ...bareSnapshot(),
      pageCount: 8,
      textByPage: Array(8).fill('body text'),
      textCharCount: 1200,
      isTagged: true,
      pdfClass: 'native_tagged',
      structureTree: { type: 'Document', children: [{ type: 'P', children: [] }] },
      headings: [{ level: 1, text: 'Intro', page: 0 }],
      paragraphStructElems: [
        { tag: 'P', text: 'Intro', page: 0, structRef: '1_0' },
        { tag: 'P', text: 'Body', page: 1, structRef: '1_1' },
      ],
      detectionProfile: {
        readingOrderSignals: {
          missingStructureTree: false,
          structureTreeDepth: 1,
          degenerateStructureTree: true,
          annotationOrderRiskCount: 0,
          annotationStructParentRiskCount: 0,
          headerFooterPollutionRisk: false,
          sampledStructurePageOrderDriftCount: 0,
          multiColumnOrderRiskPages: 0,
          suspiciousPageCount: 2,
        },
        headingSignals: {
          extractedHeadingCount: 1,
          treeHeadingCount: 0,
          headingTreeDepth: 0,
          extractedHeadingsMissingFromTree: true,
        },
        figureSignals: {
          extractedFigureCount: 0,
          treeFigureCount: 0,
          nonFigureRoleCount: 0,
          treeFigureMissingForExtractedFigures: false,
        },
        pdfUaSignals: { orphanMcidCount: 0, suspectedPathPaintOutsideMc: 0, taggedAnnotationRiskCount: 0 },
        annotationSignals: {
          pagesMissingTabsS: 0,
          pagesAnnotationOrderDiffers: 0,
          linkAnnotationsMissingStructure: 0,
          nonLinkAnnotationsMissingStructure: 0,
          linkAnnotationsMissingStructParent: 0,
          nonLinkAnnotationsMissingStructParent: 0,
        },
        listSignals: { listItemMisplacedCount: 0, lblBodyMisplacedCount: 0, listsWithoutItems: 0 },
        tableSignals: {
          tablesWithMisplacedCells: 0,
          misplacedCellCount: 0,
          irregularTableCount: 0,
          stronglyIrregularTableCount: 0,
          directCellUnderTableCount: 0,
        },
        sampledPages: [0, 1],
        confidence: 'medium',
      },
    };
    const analysis = score(snap, META);
    const high = {
      ...analysis,
      score: 96,
      categories: analysis.categories.map(c => ({ ...c, score: c.applicable ? Math.max(c.score, 96) : c.score })),
    };
    const plan = planForRemediation(high, snap, []);
    expect(plan.stages.length).toBeGreaterThan(0);
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
        { hasAlt: false, isArtifact: false, page: 0, role: 'Figure', structRef: '1_0' },
        { hasAlt: false, isArtifact: false, page: 1, role: 'Figure', structRef: '2_0' },
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

  it('targets only checker-visible Figure roles for deterministic alt assignment', () => {
    const snap: DocumentSnapshot = {
      ...bareSnapshot(),
      isTagged: true,
      pdfClass: 'native_tagged',
      structureTree: { type: 'Document', children: [] },
      figures: [
        { hasAlt: false, isArtifact: false, page: 0, structRef: '1_0', role: 'Shape' },
        { hasAlt: false, isArtifact: false, page: 1, structRef: '2_0', role: 'Figure' },
      ],
      checkerFigureTargets: [
        {
          hasAlt: false,
          isArtifact: false,
          page: 0,
          structRef: '3_0',
          role: 'Figure',
          resolvedRole: 'Figure',
          reachable: true,
          directContent: true,
          parentPath: ['Document@root', 'Figure@3_0'],
        },
        {
          hasAlt: false,
          isArtifact: false,
          page: 1,
          structRef: '4_0',
          role: 'Figure',
          resolvedRole: 'Figure',
          reachable: true,
          directContent: false,
          parentPath: ['Document@root', 'Figure@4_0'],
        },
      ],
      detectionProfile: {
        readingOrderSignals: {
          missingStructureTree: false,
          structureTreeDepth: 2,
          degenerateStructureTree: false,
          annotationOrderRiskCount: 0,
          annotationStructParentRiskCount: 0,
          headerFooterPollutionRisk: false,
          sampledStructurePageOrderDriftCount: 0,
          multiColumnOrderRiskPages: 0,
          suspiciousPageCount: 0,
        },
        headingSignals: {
          extractedHeadingCount: 0,
          treeHeadingCount: 0,
          headingTreeDepth: 0,
          extractedHeadingsMissingFromTree: false,
        },
        figureSignals: {
          extractedFigureCount: 2,
          treeFigureCount: 1,
          nonFigureRoleCount: 1,
          treeFigureMissingForExtractedFigures: false,
        },
        pdfUaSignals: { orphanMcidCount: 0, suspectedPathPaintOutsideMc: 0, taggedAnnotationRiskCount: 0 },
        annotationSignals: {
          pagesMissingTabsS: 0,
          pagesAnnotationOrderDiffers: 0,
          linkAnnotationsMissingStructure: 0,
          nonLinkAnnotationsMissingStructure: 0,
          linkAnnotationsMissingStructParent: 0,
          nonLinkAnnotationsMissingStructParent: 0,
        },
        listSignals: { listItemMisplacedCount: 0, lblBodyMisplacedCount: 0, listsWithoutItems: 0 },
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
    };
    const analysis = withCategoryScores(score(snap, META), { alt_text: 0 });
    expect(buildDefaultParams('set_figure_alt_text', analysis, snap)).toEqual({
      structRef: '3_0',
      altText: 'Illustration (page 1)',
    });
    expect(buildDefaultParams('mark_figure_decorative', analysis, snap)).toEqual({
      structRef: '3_0',
    });
  });

  it('progresses to a distinct figure alt target after a prior target attempt', () => {
    const snap: DocumentSnapshot = {
      ...bareSnapshot(),
      isTagged: true,
      pdfClass: 'native_tagged',
      structureTree: { type: 'Document', children: [] },
      checkerFigureTargets: [
        {
          hasAlt: false,
          isArtifact: false,
          page: 0,
          structRef: '3_0',
          role: 'Figure',
          resolvedRole: 'Figure',
          reachable: true,
          directContent: true,
          parentPath: ['Document@root', 'Figure@3_0'],
        },
        {
          hasAlt: false,
          isArtifact: false,
          page: 1,
          structRef: '4_0',
          role: 'Figure',
          resolvedRole: 'Figure',
          reachable: true,
          directContent: true,
          parentPath: ['Document@root', 'Figure@4_0'],
        },
      ],
    };
    const analysis = withCategoryScores(score(snap, META), { alt_text: 0 });
    const applied: AppliedRemediationTool[] = [{
      toolName: 'set_figure_alt_text',
      stage: 1,
      round: 1,
      scoreBefore: 59,
      scoreAfter: 59,
      delta: 0,
      outcome: 'no_effect',
      details: JSON.stringify({
        outcome: 'no_effect',
        invariants: { targetRef: '3_0', targetReachable: true, targetIsFigureAfter: false },
      }),
    }];

    expect(buildDefaultParams('set_figure_alt_text', analysis, snap, applied)).toEqual({
      structRef: '4_0',
      altText: 'Illustration (page 2)',
    });
  });

  it('does not schedule canonicalize_figure_alt_ownership without checker-visible ownership debt', () => {
    const snap: DocumentSnapshot = {
      ...bareSnapshot(),
      isTagged: true,
      pdfClass: 'native_tagged',
      structureTree: { type: 'Document', children: [] },
      figures: [{ hasAlt: false, isArtifact: false, page: 0, structRef: '1_0', role: 'Figure' }],
      detectionProfile: {
        readingOrderSignals: {
          missingStructureTree: false,
          structureTreeDepth: 2,
          degenerateStructureTree: false,
          annotationOrderRiskCount: 0,
          annotationStructParentRiskCount: 0,
          headerFooterPollutionRisk: false,
          sampledStructurePageOrderDriftCount: 0,
          multiColumnOrderRiskPages: 0,
          suspiciousPageCount: 0,
        },
        headingSignals: {
          extractedHeadingCount: 0,
          treeHeadingCount: 0,
          headingTreeDepth: 0,
          extractedHeadingsMissingFromTree: false,
        },
        figureSignals: {
          extractedFigureCount: 1,
          treeFigureCount: 1,
          nonFigureRoleCount: 0,
          treeFigureMissingForExtractedFigures: false,
        },
        pdfUaSignals: { orphanMcidCount: 0, suspectedPathPaintOutsideMc: 0, taggedAnnotationRiskCount: 0 },
        annotationSignals: {
          pagesMissingTabsS: 0,
          pagesAnnotationOrderDiffers: 0,
          linkAnnotationsMissingStructure: 0,
          nonLinkAnnotationsMissingStructure: 0,
          linkAnnotationsMissingStructParent: 0,
          nonLinkAnnotationsMissingStructParent: 0,
        },
        listSignals: { listItemMisplacedCount: 0, lblBodyMisplacedCount: 0, listsWithoutItems: 0 },
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
    };
    const analysis = withCategoryScores(score(snap, META), { alt_text: 0 });
    const plan = planForRemediation(analysis, snap, []);
    const names = plan.stages.flatMap(s => s.tools.map(t => t.toolName));
    expect(names).not.toContain('canonicalize_figure_alt_ownership');
    expect(names).toContain('set_figure_alt_text');
  });

  it('does not schedule repair_alt_text_structure without Acrobat-style alt ownership risks', () => {
    const snap: DocumentSnapshot = {
      ...bareSnapshot(),
      isTagged: true,
      pdfClass: 'native_tagged',
      structureTree: { type: 'Document', children: [] },
      figures: [{ hasAlt: false, isArtifact: false, page: 0, structRef: '1_0', role: 'Figure' }],
      acrobatStyleAltRisks: {
        nonFigureWithAltCount: 0,
        nestedFigureAltCount: 0,
        orphanedAltEmptyElementCount: 0,
        sampleOwnershipModes: [],
      },
      detectionProfile: {
        readingOrderSignals: {
          missingStructureTree: false,
          structureTreeDepth: 2,
          degenerateStructureTree: false,
          annotationOrderRiskCount: 0,
          annotationStructParentRiskCount: 0,
          headerFooterPollutionRisk: false,
          sampledStructurePageOrderDriftCount: 0,
          multiColumnOrderRiskPages: 0,
          suspiciousPageCount: 0,
        },
        headingSignals: {
          extractedHeadingCount: 0,
          treeHeadingCount: 0,
          headingTreeDepth: 0,
          extractedHeadingsMissingFromTree: false,
        },
        figureSignals: {
          extractedFigureCount: 1,
          treeFigureCount: 1,
          nonFigureRoleCount: 0,
          treeFigureMissingForExtractedFigures: false,
        },
        pdfUaSignals: { orphanMcidCount: 0, suspectedPathPaintOutsideMc: 0, taggedAnnotationRiskCount: 0 },
        annotationSignals: {
          pagesMissingTabsS: 0,
          pagesAnnotationOrderDiffers: 0,
          linkAnnotationsMissingStructure: 0,
          nonLinkAnnotationsMissingStructure: 0,
          linkAnnotationsMissingStructParent: 0,
          nonLinkAnnotationsMissingStructParent: 0,
        },
        listSignals: { listItemMisplacedCount: 0, lblBodyMisplacedCount: 0, listsWithoutItems: 0 },
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
    };
    const analysis = withCategoryScores(score(snap, META), { alt_text: 0 });
    const plan = planForRemediation(analysis, snap, []);
    const names = plan.stages.flatMap(s => s.tools.map(t => t.toolName));
    expect(names).not.toContain('repair_alt_text_structure');
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
    expect(plan.planningSummary?.scheduledTools).toContain('set_figure_alt_text');
    expect(plan.planningSummary?.scheduledTools).not.toContain('retag_as_figure');
  });

  it('filters out low-reliability tools when tool outcome store has enough data', () => {
    let db: Database;
    try {
      db = new Database(':memory:');
    } catch (error) {
      expect(String(error)).toMatch(/NODE_MODULE_VERSION|compiled against a different Node\.js version/i);
      return;
    }
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

  it('does not reliability-filter the protected zero-heading convergence bundle', () => {
    let db: Database;
    try {
      db = new Database(':memory:');
    } catch (error) {
      expect(String(error)).toMatch(/NODE_MODULE_VERSION|compiled against a different Node\.js version/i);
      return;
    }
    initSchema(db);
    const store = createToolOutcomeStore(db);
    for (const toolName of ['create_heading_from_candidate', 'normalize_heading_hierarchy', 'repair_structure_conformance']) {
      for (let i = 0; i < 10; i++) {
        store.record({
          toolName,
          pdfClass: 'native_tagged',
          outcome: 'no_effect',
          scoreBefore: 58,
          scoreAfter: 58,
        });
      }
    }

    const snap: DocumentSnapshot = {
      ...bareSnapshot(),
      pageCount: 4,
      textByPage: ['Research at a Glance', 'Body', 'Body', 'Body'],
      textCharCount: 800,
      pdfClass: 'native_tagged',
      isTagged: true,
      markInfo: { Marked: true },
      pdfUaVersion: '1',
      structureTree: { type: 'Document', children: [] },
      paragraphStructElems: [
        { tag: 'P', text: 'Research at a Glance', page: 0, structRef: '40_0', bbox: [40, 720, 260, 742] },
        { tag: 'P', text: 'Program Overview', page: 1, structRef: '41_0', bbox: [40, 680, 240, 700] },
      ],
      detectionProfile: {
        readingOrderSignals: {
          missingStructureTree: false,
          structureTreeDepth: 1,
          degenerateStructureTree: true,
          annotationOrderRiskCount: 0,
          annotationStructParentRiskCount: 0,
          headerFooterPollutionRisk: false,
          sampledStructurePageOrderDriftCount: 0,
          multiColumnOrderRiskPages: 0,
          suspiciousPageCount: 0,
        },
        headingSignals: {
          extractedHeadingCount: 0,
          treeHeadingCount: 0,
          headingTreeDepth: 0,
          extractedHeadingsMissingFromTree: true,
        },
        figureSignals: {
          extractedFigureCount: 0,
          treeFigureCount: 0,
          nonFigureRoleCount: 0,
          treeFigureMissingForExtractedFigures: false,
        },
        pdfUaSignals: {
          orphanMcidCount: 0,
          suspectedPathPaintOutsideMc: 0,
          taggedAnnotationRiskCount: 0,
        },
        annotationSignals: {
          pagesMissingTabsS: 0,
          pagesAnnotationOrderDiffers: 0,
          linkAnnotationsMissingStructure: 0,
          nonLinkAnnotationsMissingStructure: 0,
          linkAnnotationsMissingStructParent: 0,
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
        sampledPages: [0, 1],
        confidence: 'high',
      },
    };
    const analysis = withCategoryScores(score(snap, META), {
      heading_structure: 0,
      reading_order: 35,
    });
    const plan = planForRemediation(analysis, snap, [], store);
    const names = plan.stages.flatMap(s => s.tools.map(t => t.toolName));
    expect(names).toContain('create_heading_from_candidate');
    expect(names).toContain('normalize_heading_hierarchy');
    expect(names).toContain('repair_structure_conformance');
  });

  it('still schedules table header repairs when table_markup is explicitly failing', () => {
    const snap: DocumentSnapshot = {
      ...bareSnapshot(),
      isTagged: true,
      pdfClass: 'native_tagged',
      structureTree: { type: 'Document', children: [] },
      tables: [{ hasHeaders: false, headerCount: 0, totalCells: 4, page: 0, structRef: '11_0' }],
      detectionProfile: {
        readingOrderSignals: {
          missingStructureTree: false,
          annotationOrderRiskCount: 0,
          annotationStructParentRiskCount: 0,
          headerFooterPollutionRisk: false,
          sampledStructurePageOrderDriftCount: 0,
          multiColumnOrderRiskPages: 0,
          suspiciousPageCount: 0,
        },
        pdfUaSignals: {
          orphanMcidCount: 0,
          suspectedPathPaintOutsideMc: 0,
          taggedAnnotationRiskCount: 0,
        },
        annotationSignals: {
          pagesMissingTabsS: 0,
          pagesAnnotationOrderDiffers: 0,
          linkAnnotationsMissingStructure: 0,
          nonLinkAnnotationsMissingStructure: 0,
          linkAnnotationsMissingStructParent: 0,
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
          irregularTableCount: 1,
          stronglyIrregularTableCount: 0,
          directCellUnderTableCount: 0,
        },
        sampledPages: [0],
        confidence: 'high',
      },
    };
    const base = score(snap, META);
    const analysis = withRoutingContext(
      withCategoryScores(base, { table_markup: 50 }),
      {
        detectionProfile: snap.detectionProfile,
        structuralClassification: {
          structureClass: 'native_tagged',
          contentProfile: {
            pageBucket: '1-5',
            dominantContent: 'text',
            hasStructureTree: true,
            hasBookmarks: false,
            hasFigures: false,
            hasTables: true,
            hasForms: false,
            annotationRisk: false,
            taggedContentRisk: false,
            listStructureRisk: false,
          },
          fontRiskProfile: {
            riskLevel: 'low',
            riskyFontCount: 0,
            missingUnicodeFontCount: 0,
            unembeddedFontCount: 0,
            ocrTextLayerSuspected: false,
          },
          confidence: 'medium',
        },
      },
    );

    const plan = planForRemediation(analysis, snap, []);
    const names = plan.stages.flatMap(s => s.tools.map(t => t.toolName));
    expect(names).toContain('normalize_table_structure');
    expect(names).toContain('repair_native_table_headers');
    expect(names).toContain('set_table_header_cells');
  });

  it('classifies Stage 43 table failure buckets', () => {
    const base = {
      ...bareSnapshot(),
      isTagged: true,
      pdfClass: 'native_tagged' as const,
      structureTree: { type: 'Document', children: [] },
    };
    expect(classifyStage43TableFailure({
      ...base,
      tables: [{ hasHeaders: true, headerCount: 1, totalCells: 8, page: 0, rowCount: 1, cellsMisplacedCount: 0, structRef: '1_0' }],
    })).toBe('rowless_dense_table');
    expect(classifyStage43TableFailure({
      ...base,
      tables: [{ hasHeaders: true, headerCount: 1, totalCells: 8, page: 0, rowCount: 2, cellsMisplacedCount: 3, structRef: '1_0' }],
    })).toBe('direct_cells_under_table');
    expect(classifyStage43TableFailure({
      ...base,
      tables: [{ hasHeaders: false, headerCount: 0, totalCells: 8, page: 0, rowCount: 2, cellsMisplacedCount: 0, structRef: '1_0' }],
    })).toBe('missing_headers_only');
    expect(classifyStage43TableFailure({
      ...base,
      tables: [{
        hasHeaders: true,
        headerCount: 2,
        totalCells: 20,
        page: 0,
        rowCount: 5,
        cellsMisplacedCount: 0,
        irregularRows: 3,
        dominantColumnCount: 4,
        rowCellCounts: [2, 4, 4, 4, 4],
        structRef: '1_0',
      }],
    }, withCategoryScores(score(base, META), { table_markup: 35 }))).toBe('strongly_irregular_rows');
    expect(classifyStage43TableFailure({
      ...base,
      tables: [{ hasHeaders: true, headerCount: 1, totalCells: 8, page: 0, rowCount: 2, cellsMisplacedCount: 0, structRef: '1_0' }],
    })).toBe('not_stage43_table_target');
  });

  it('keeps native table repair active for structurally broken tables even when headers already exist', () => {
    const snap: DocumentSnapshot = {
      ...bareSnapshot(),
      isTagged: true,
      pdfClass: 'native_tagged',
      structureTree: { type: 'Document', children: [] },
      tables: [{ hasHeaders: true, headerCount: 1, totalCells: 8, page: 0, rowCount: 1, irregularRows: 0, cellsMisplacedCount: 4, structRef: '11_0' }],
      detectionProfile: {
        readingOrderSignals: {
          missingStructureTree: false,
          structureTreeDepth: 2,
          degenerateStructureTree: false,
          annotationOrderRiskCount: 0,
          annotationStructParentRiskCount: 0,
          headerFooterPollutionRisk: false,
          sampledStructurePageOrderDriftCount: 0,
          multiColumnOrderRiskPages: 0,
          suspiciousPageCount: 0,
        },
        headingSignals: {
          extractedHeadingCount: 1,
          treeHeadingCount: 1,
          headingTreeDepth: 2,
          extractedHeadingsMissingFromTree: false,
        },
        figureSignals: {
          extractedFigureCount: 0,
          treeFigureCount: 0,
          nonFigureRoleCount: 0,
          treeFigureMissingForExtractedFigures: false,
        },
        pdfUaSignals: {
          orphanMcidCount: 0,
          suspectedPathPaintOutsideMc: 0,
          taggedAnnotationRiskCount: 0,
        },
        annotationSignals: {
          pagesMissingTabsS: 0,
          pagesAnnotationOrderDiffers: 0,
          linkAnnotationsMissingStructure: 0,
          nonLinkAnnotationsMissingStructure: 0,
          linkAnnotationsMissingStructParent: 0,
          nonLinkAnnotationsMissingStructParent: 0,
        },
        listSignals: {
          listItemMisplacedCount: 0,
          lblBodyMisplacedCount: 0,
          listsWithoutItems: 0,
        },
        tableSignals: {
          tablesWithMisplacedCells: 1,
          misplacedCellCount: 4,
          irregularTableCount: 0,
          stronglyIrregularTableCount: 0,
          directCellUnderTableCount: 4,
        },
        sampledPages: [0],
        confidence: 'high',
      },
    };
    const analysis = withRoutingContext(
      withCategoryScores(score(snap, META), { table_markup: 35 }),
      {
        detectionProfile: snap.detectionProfile,
        structuralClassification: {
          structureClass: 'native_tagged',
          contentProfile: {
            pageBucket: '1-5',
            dominantContent: 'text',
            hasStructureTree: true,
            hasBookmarks: false,
            hasFigures: false,
            hasTables: true,
            hasForms: false,
            annotationRisk: false,
            taggedContentRisk: false,
            listStructureRisk: false,
          },
          fontRiskProfile: {
            riskLevel: 'low',
            riskyFontCount: 0,
            missingUnicodeFontCount: 0,
            unembeddedFontCount: 0,
            ocrTextLayerSuspected: false,
          },
          confidence: 'high',
        },
      },
    );

    const plan = planForRemediation(analysis, snap, []);
    const names = plan.stages.flatMap(s => s.tools.map(t => t.toolName));
    expect(names).toContain('normalize_table_structure');
    expect(names).toContain('repair_native_table_headers');
  });

  it('avoids heading normalization unless heading structure debt is present', () => {
    const snap: DocumentSnapshot = {
      ...bareSnapshot(),
      isTagged: true,
      pdfClass: 'native_tagged',
      structureTree: { type: 'Document', children: [] },
      headings: [
        { level: 1, text: 'Intro', page: 0, structRef: '1_0' },
        { level: 2, text: 'Body', page: 0, structRef: '2_0' },
      ],
    };
    const analysis = withRoutingContext(score(snap, META), {
      structuralClassification: {
        structureClass: 'native_tagged',
        contentProfile: {
          pageBucket: '1-5',
          dominantContent: 'text',
          hasStructureTree: true,
          hasBookmarks: false,
          hasFigures: false,
          hasTables: false,
          hasForms: false,
          annotationRisk: false,
          taggedContentRisk: false,
          listStructureRisk: false,
        },
        fontRiskProfile: {
          riskLevel: 'low',
          riskyFontCount: 0,
          missingUnicodeFontCount: 0,
          unembeddedFontCount: 0,
          ocrTextLayerSuspected: false,
        },
        confidence: 'high',
      },
    });

    const plan = planForRemediation(analysis, snap, []);
    const names = plan.stages.flatMap(s => s.tools.map(t => t.toolName));
    expect(names).not.toContain('normalize_heading_hierarchy');
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

  it('targets malformed tables for normalization before header assignment', () => {
    const snap: DocumentSnapshot = {
      ...bareSnapshot(),
      isTagged: true,
      pdfClass: 'native_tagged',
      structureTree: { type: 'Document', children: [] },
      tables: [
        {
          hasHeaders: true,
          headerCount: 1,
          totalCells: 8,
          page: 0,
          structRef: '20_0',
          rowCount: 1,
          cellsMisplacedCount: 3,
        },
      ],
    };
    const analysis = withCategoryScores(score(snap, META), { table_markup: 35 });
    expect(buildDefaultParams('normalize_table_structure', analysis, snap)).toEqual({
      structRef: '20_0',
      dominantColumnCount: 0,
      totalCells: 8,
      maxTablesPerRun: 1,
      tableFailureClass: 'direct_cells_under_table',
    });
    expect(buildDefaultParams('set_table_header_cells', analysis, snap)).toEqual({});
  });

  it('targets header assignment only after table rows are valid', () => {
    const snap: DocumentSnapshot = {
      ...bareSnapshot(),
      isTagged: true,
      pdfClass: 'native_tagged',
      structureTree: { type: 'Document', children: [] },
      tables: [
        {
          hasHeaders: false,
          headerCount: 0,
          totalCells: 8,
          page: 0,
          structRef: '21_0',
          rowCount: 2,
          cellsMisplacedCount: 0,
        },
      ],
    };
    const analysis = withCategoryScores(score(snap, META), { table_markup: 35 });
    expect(buildDefaultParams('normalize_table_structure', analysis, snap)).toEqual({
      structRef: '21_0',
      dominantColumnCount: 0,
      totalCells: 8,
      maxTablesPerRun: 1,
      tableFailureClass: 'missing_headers_only',
    });
    expect(buildDefaultParams('set_table_header_cells', analysis, snap)).toEqual({ structRef: '21_0' });
  });

  it('targets strongly irregular dense tables with bounded normalization params', () => {
    const snap: DocumentSnapshot = {
      ...bareSnapshot(),
      isTagged: true,
      pdfClass: 'native_tagged',
      structureTree: { type: 'Document', children: [] },
      tables: [
        {
          hasHeaders: true,
          headerCount: 4,
          totalCells: 20,
          page: 0,
          structRef: '22_0',
          rowCount: 5,
          cellsMisplacedCount: 0,
          irregularRows: 3,
          dominantColumnCount: 4,
          rowCellCounts: [2, 4, 4, 3, 4],
        },
      ],
    };
    const analysis = withCategoryScores(score(snap, META), { table_markup: 35 });
    expect(buildDefaultParams('normalize_table_structure', analysis, snap)).toEqual({
      dominantColumnCount: 0,
      maxTablesPerRun: 4,
      maxSyntheticCells: 160,
      tableFailureClass: 'strongly_irregular_rows',
    });
  });

  it('allows synthesize_basic_structure_from_layout for native_tagged when structureTreeDepth <= 1 and reading_order is failing', () => {
    // Simulates a native_tagged PDF whose existing structure tree is too shallow for ICJIA.
    // After the indirect-object fix, our scorer caps reading_order to 30 for these files,
    // and the planner must allow synthesis to rebuild the tree rather than giving up.
    const snap: DocumentSnapshot = {
      ...bareSnapshot(),
      pageCount: 4,
      textByPage: ['Title Page', 'Section One', 'Section Two', 'Conclusion'],
      textCharCount: 800,
      isTagged: true,
      markInfo: { Marked: true },
      pdfClass: 'native_tagged',
      structureTree: { type: 'Document', children: [] },
      headings: [{ level: 1, text: 'Title', page: 0 }],
      metadata: { title: 'Shallow Tree Doc', language: 'en', author: '', subject: '' },
      lang: 'en',
      pdfUaVersion: '1',
      detectionProfile: {
        readingOrderSignals: {
          missingStructureTree: false,
          structureTreeDepth: 1,
          degenerateStructureTree: true,
          annotationOrderRiskCount: 0,
          annotationStructParentRiskCount: 0,
          headerFooterPollutionRisk: false,
          sampledStructurePageOrderDriftCount: 0,
          multiColumnOrderRiskPages: 0,
          suspiciousPageCount: 1,
        },
        headingSignals: {
          extractedHeadingCount: 1,
          treeHeadingCount: 0,
          headingTreeDepth: 0,
          extractedHeadingsMissingFromTree: true,
        },
        figureSignals: {
          extractedFigureCount: 0,
          treeFigureCount: 0,
          nonFigureRoleCount: 0,
          treeFigureMissingForExtractedFigures: false,
        },
        pdfUaSignals: { orphanMcidCount: 0, suspectedPathPaintOutsideMc: 0, taggedAnnotationRiskCount: 0 },
        annotationSignals: {
          pagesMissingTabsS: 0,
          pagesAnnotationOrderDiffers: 0,
          linkAnnotationsMissingStructure: 0,
          nonLinkAnnotationsMissingStructure: 0,
          linkAnnotationsMissingStructParent: 0,
          nonLinkAnnotationsMissingStructParent: 0,
        },
        listSignals: { listItemMisplacedCount: 0, lblBodyMisplacedCount: 0, listsWithoutItems: 0 },
        tableSignals: {
          tablesWithMisplacedCells: 0,
          misplacedCellCount: 0,
          irregularTableCount: 0,
          stronglyIrregularTableCount: 0,
          directCellUnderTableCount: 0,
        },
        sampledPages: [0, 1],
        confidence: 'medium',
      },
    };
    const base = score(snap, META);
    const analysis = withCategoryScores(base, {
      reading_order: 30,
      pdf_ua_compliance: 55,
      heading_structure: 60,
    });
    const plan = planForRemediation(analysis, snap, []);
    const names = plan.stages.flatMap(s => s.tools.map(t => t.toolName));
    expect(names).toContain('synthesize_basic_structure_from_layout');
  });

  it('does not synthesize for native_tagged when structureTreeDepth >= 2', () => {
    const snap: DocumentSnapshot = {
      ...bareSnapshot(),
      pageCount: 4,
      textByPage: ['Title', 'Body A', 'Body B', 'End'],
      textCharCount: 800,
      isTagged: true,
      markInfo: { Marked: true },
      pdfClass: 'native_tagged',
      structureTree: { type: 'Document', children: [{ type: 'Sect', children: [] }] },
      headings: [{ level: 1, text: 'Title', page: 0 }],
      metadata: { title: 'Good Tree Doc', language: 'en', author: '', subject: '' },
      lang: 'en',
      pdfUaVersion: '1',
      detectionProfile: {
        readingOrderSignals: {
          missingStructureTree: false,
          structureTreeDepth: 2,
          degenerateStructureTree: false,
          annotationOrderRiskCount: 0,
          annotationStructParentRiskCount: 0,
          headerFooterPollutionRisk: false,
          sampledStructurePageOrderDriftCount: 0,
          multiColumnOrderRiskPages: 0,
          suspiciousPageCount: 0,
        },
        headingSignals: {
          extractedHeadingCount: 1,
          treeHeadingCount: 1,
          headingTreeDepth: 2,
          extractedHeadingsMissingFromTree: false,
        },
        figureSignals: {
          extractedFigureCount: 0,
          treeFigureCount: 0,
          nonFigureRoleCount: 0,
          treeFigureMissingForExtractedFigures: false,
        },
        pdfUaSignals: { orphanMcidCount: 0, suspectedPathPaintOutsideMc: 0, taggedAnnotationRiskCount: 0 },
        annotationSignals: {
          pagesMissingTabsS: 0,
          pagesAnnotationOrderDiffers: 0,
          linkAnnotationsMissingStructure: 0,
          nonLinkAnnotationsMissingStructure: 0,
          linkAnnotationsMissingStructParent: 0,
          nonLinkAnnotationsMissingStructParent: 0,
        },
        listSignals: { listItemMisplacedCount: 0, lblBodyMisplacedCount: 0, listsWithoutItems: 0 },
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
    const analysis = withCategoryScores(base, {
      reading_order: 30,
      pdf_ua_compliance: 55,
    });
    const plan = planForRemediation(analysis, snap, []);
    const names = plan.stages.flatMap(s => s.tools.map(t => t.toolName));
    expect(names).not.toContain('synthesize_basic_structure_from_layout');
  });

  it('prefers direct heading promotion over synthesis for recoverable native_tagged P-only trees', () => {
    const snap: DocumentSnapshot = {
      ...bareSnapshot(),
      pageCount: 6,
      textByPage: Array(6).fill('Section body text'),
      textCharCount: 2400,
      isTagged: true,
      markInfo: { Marked: true },
      pdfClass: 'native_tagged',
      structureTree: {
        type: 'Document',
        children: Array.from({ length: 6 }, () => ({ type: 'P', children: [] })),
      },
      headings: [],
      paragraphStructElems: Array.from({ length: 8 }, (_, i) => ({
        tag: 'P',
        text: `Paragraph ${i + 1}`,
        page: Math.min(5, Math.floor(i / 2)),
        structRef: `${i + 1}_0`,
      })),
      metadata: { title: 'P Only Doc', language: 'en', author: '', subject: '' },
      lang: 'en',
      pdfUaVersion: '1',
      detectionProfile: {
        readingOrderSignals: {
          missingStructureTree: false,
          structureTreeDepth: 4,
          degenerateStructureTree: false,
          annotationOrderRiskCount: 0,
          annotationStructParentRiskCount: 0,
          headerFooterPollutionRisk: false,
          sampledStructurePageOrderDriftCount: 0,
          multiColumnOrderRiskPages: 0,
          suspiciousPageCount: 0,
        },
        headingSignals: {
          extractedHeadingCount: 0,
          treeHeadingCount: 0,
          headingTreeDepth: 0,
          extractedHeadingsMissingFromTree: false,
        },
        figureSignals: {
          extractedFigureCount: 0,
          treeFigureCount: 0,
          nonFigureRoleCount: 0,
          treeFigureMissingForExtractedFigures: false,
        },
        pdfUaSignals: { orphanMcidCount: 0, suspectedPathPaintOutsideMc: 0, taggedAnnotationRiskCount: 0 },
        annotationSignals: {
          pagesMissingTabsS: 0,
          pagesAnnotationOrderDiffers: 0,
          linkAnnotationsMissingStructure: 0,
          nonLinkAnnotationsMissingStructure: 0,
          linkAnnotationsMissingStructParent: 0,
          nonLinkAnnotationsMissingStructParent: 0,
        },
        listSignals: { listItemMisplacedCount: 0, lblBodyMisplacedCount: 0, listsWithoutItems: 0 },
        tableSignals: {
          tablesWithMisplacedCells: 0,
          misplacedCellCount: 0,
          irregularTableCount: 0,
          stronglyIrregularTableCount: 0,
          directCellUnderTableCount: 0,
        },
        sampledPages: [0, 1],
        confidence: 'medium',
      },
    };
    const base = score(snap, META);
    const analysis = withCategoryScores(base, {
      heading_structure: 0,
      reading_order: 96,
    });
    const plan = planForRemediation(analysis, snap, []);
    const names = plan.stages.flatMap(s => s.tools.map(t => t.toolName));
    expect(names).toContain('create_heading_from_candidate');
    expect(names).not.toContain('synthesize_basic_structure_from_layout');
  });

  it('does not schedule create_heading_from_candidate again when exported headings already exist', () => {
    const snap: DocumentSnapshot = {
      ...bareSnapshot(),
      pageCount: 5,
      textByPage: Array(5).fill('Page text content'),
      textCharCount: 900,
      isTagged: true,
      markInfo: { Marked: true },
      pdfUaVersion: '1',
      pdfClass: 'native_tagged',
      structureTree: { type: 'Document', children: [{ type: 'Sect', children: [] }] },
      headings: [{ level: 1, text: 'Quick Start', page: 0, structRef: '50_0' }],
      paragraphStructElems: [
        { tag: 'SPAN', text: 'Getting started', page: 1, structRef: '60_0' },
        { tag: 'SPAN', text: 'Next steps', page: 2, structRef: '61_0' },
      ],
    };
    const base = score(snap, META);
    const analysis = withCategoryScores(base, {
      heading_structure: 55,
      reading_order: 82,
      text_extractability: 96,
    });
    // Already applied create_heading_from_candidate once (count=1 < MAX=3)
    const applied: AppliedRemediationTool[] = [
      { toolName: 'create_heading_from_candidate', stage: 1, round: 1, scoreBefore: 40, scoreAfter: 55, delta: 15, outcome: 'applied' },
    ];
    const plan = planForRemediation(analysis, snap, applied);
    const names = plan.stages.flatMap(s => s.tools.map(t => t.toolName));
    expect(names).not.toContain('create_heading_from_candidate');
  });

  it('keeps figure ownership cleanup active for zero-heading figure files', () => {
    const snap: DocumentSnapshot = {
      ...bareSnapshot(),
      pageCount: 4,
      textByPage: ['EXECUTIVE SUMMARY', 'Chart page', 'Body', 'Body'],
      textCharCount: 900,
      isTagged: true,
      markInfo: { Marked: true },
      pdfUaVersion: '1',
      pdfClass: 'native_tagged',
      structureTree: { type: 'Document', children: [{ type: 'Sect', children: [] }] },
      paragraphStructElems: [
        { tag: 'P', text: 'EXECUTIVE SUMMARY', page: 0, structRef: '60_0', bbox: [50, 700, 240, 725] },
        { tag: 'P', text: 'Program Overview', page: 1, structRef: '61_0', bbox: [60, 650, 240, 670] },
      ],
      figures: [
        { hasAlt: false, isArtifact: false, page: 1, role: 'Figure', structRef: '70_0' },
      ],
    };
    const analysis = withCategoryScores(score(snap, META), {
      heading_structure: 0,
      alt_text: 0,
      reading_order: 0,
      pdf_ua_compliance: 55,
    });

    const plan = planForRemediation(analysis, snap, []);
    const names = plan.stages.flatMap(s => s.tools.map(t => t.toolName));
    expect(plan.planningSummary?.triggeringSignals).toContain('zero_heading_figure_recovery');
    expect(names).toContain('create_heading_from_candidate');
    expect(names).toContain('normalize_nested_figure_containers');
    expect(names).toContain('canonicalize_figure_alt_ownership');
  });

  it('skips create_heading_from_candidate after REMEDIATION_MAX_HEADING_CREATES successful applications', () => {
    const snap: DocumentSnapshot = {
      ...bareSnapshot(),
      pageCount: 5,
      textByPage: Array(5).fill('Page text content'),
      textCharCount: 900,
      isTagged: true,
      markInfo: { Marked: true },
      pdfUaVersion: '1',
      pdfClass: 'native_tagged',
      structureTree: { type: 'Document', children: [{ type: 'Sect', children: [] }] },
      headings: [
        { level: 1, text: 'Quick Start', page: 0, structRef: '50_0' },
        { level: 2, text: 'Getting started', page: 1, structRef: '60_0' },
        { level: 2, text: 'Next steps', page: 2, structRef: '61_0' },
      ],
      paragraphStructElems: [
        { tag: 'SPAN', text: 'More content', page: 3, structRef: '70_0' },
      ],
    };
    const base = score(snap, META);
    const analysis = withCategoryScores(base, {
      heading_structure: 55,
      reading_order: 82,
      text_extractability: 96,
    });
    // 3 successful applications = at cap (REMEDIATION_MAX_HEADING_CREATES = 3)
    const applied: AppliedRemediationTool[] = [
      { toolName: 'create_heading_from_candidate', stage: 1, round: 1, scoreBefore: 0, scoreAfter: 40, delta: 40, outcome: 'applied' },
      { toolName: 'create_heading_from_candidate', stage: 1, round: 2, scoreBefore: 40, scoreAfter: 50, delta: 10, outcome: 'applied' },
      { toolName: 'create_heading_from_candidate', stage: 1, round: 3, scoreBefore: 50, scoreAfter: 55, delta: 5, outcome: 'applied' },
    ];
    const plan = planForRemediation(analysis, snap, applied);
    const names = plan.stages.flatMap(s => s.tools.map(t => t.toolName));
    expect(names).not.toContain('create_heading_from_candidate');
  });

  it('reports an invariant-backed blocked heading target without suppressing candidate progression', () => {
    const snap: DocumentSnapshot = {
      ...bareSnapshot(),
      pageCount: 3,
      textByPage: ['EXECUTIVE SUMMARY', 'Overview', 'Body'],
      textCharCount: 600,
      isTagged: true,
      markInfo: { Marked: true },
      pdfUaVersion: '1',
      pdfClass: 'native_tagged',
      structureTree: { type: 'Document', children: [{ type: 'Sect', children: [] }] },
      paragraphStructElems: [
        { tag: 'P', text: 'EXECUTIVE SUMMARY', page: 0, structRef: '40_0', bbox: [40, 710, 220, 734] },
        { tag: 'P', text: 'Program Overview', page: 0, structRef: '41_0', bbox: [40, 670, 240, 692] },
      ],
    };
    const analysis = withCategoryScores(score(snap, META), {
      heading_structure: 0,
      reading_order: 35,
    });
    const applied: AppliedRemediationTool[] = [{
      toolName: 'create_heading_from_candidate',
      stage: 4,
      round: 1,
      scoreBefore: 58,
      scoreAfter: 58,
      delta: 0,
      outcome: 'no_effect',
      details: JSON.stringify({
        outcome: 'no_effect',
        note: 'role_invalid_after_mutation',
        invariants: {
          targetRef: '40_0',
          targetResolved: true,
          targetReachable: false,
          resolvedRole: 'P',
        },
      }),
    }];
    const disposition = deriveFailureDisposition(analysis, snap, applied);
    const plan = planForRemediation(analysis, snap, applied);
    expect(disposition.headingCandidateBlocked).toBe(true);
    expect(buildDefaultParams('create_heading_from_candidate', analysis, snap, applied)).toEqual({
      targetRef: '41_0',
      level: 1,
      text: 'Program Overview',
    });
    expect(plan.stages.flatMap(stage => stage.tools.map(tool => tool.toolName))).toContain('create_heading_from_candidate');
  });

  it('stops one failed route without stopping unrelated active routes', () => {
    const snap: DocumentSnapshot = {
      ...bareSnapshot(),
      pageCount: 4,
      textByPage: ['Title', 'Body', 'Body', 'Body'],
      textCharCount: 900,
      isTagged: true,
      markInfo: { Marked: true },
      pdfUaVersion: '1',
      pdfClass: 'native_tagged',
      structureTree: { type: 'Document', children: [{ type: 'Sect', children: [] }] },
      figures: [{ hasAlt: false, isArtifact: false, page: 1, role: 'Figure', structRef: '70_0' }],
      detectionProfile: {
        readingOrderSignals: {
          missingStructureTree: false,
          structureTreeDepth: 2,
          degenerateStructureTree: false,
          annotationOrderRiskCount: 0,
          annotationStructParentRiskCount: 0,
          headerFooterPollutionRisk: false,
          sampledStructurePageOrderDriftCount: 0,
          multiColumnOrderRiskPages: 0,
          suspiciousPageCount: 0,
        },
        headingSignals: {
          extractedHeadingCount: 1,
          treeHeadingCount: 1,
          headingTreeDepth: 2,
          extractedHeadingsMissingFromTree: false,
        },
        figureSignals: {
          extractedFigureCount: 1,
          treeFigureCount: 1,
          nonFigureRoleCount: 0,
          treeFigureMissingForExtractedFigures: false,
        },
        pdfUaSignals: { orphanMcidCount: 0, suspectedPathPaintOutsideMc: 0, taggedAnnotationRiskCount: 0 },
        annotationSignals: {
          pagesMissingTabsS: 1,
          pagesAnnotationOrderDiffers: 0,
          linkAnnotationsMissingStructure: 1,
          nonLinkAnnotationsMissingStructure: 0,
          linkAnnotationsMissingStructParent: 1,
          nonLinkAnnotationsMissingStructParent: 0,
        },
        listSignals: { listItemMisplacedCount: 0, lblBodyMisplacedCount: 0, listsWithoutItems: 0 },
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
    };
    const analysis = withRoutingContext(withCategoryScores(score(snap, META), {
      alt_text: 40,
      link_quality: 45,
    }), {
      detectionProfile: snap.detectionProfile,
      failureProfile: {
        deterministicIssues: ['link_quality'],
        semanticIssues: ['alt_text'],
        manualOnlyIssues: [],
        primaryFailureFamily: 'structure_reading_order_heavy',
        secondaryFailureFamilies: ['figure_alt_ownership_heavy'],
        routingHints: ['prefer_annotation_normalization'],
      },
    });
    const plan = planForRemediation(analysis, snap, [
      {
        toolName: 'normalize_nested_figure_containers',
        stage: 5,
        round: 1,
        scoreBefore: 80,
        scoreAfter: 80,
        delta: 0,
        outcome: 'no_effect',
        details: JSON.stringify({ outcome: 'no_effect', note: 'no_structural_change', invariants: { targetRef: '70_0' } }),
      },
      {
        toolName: 'canonicalize_figure_alt_ownership',
        stage: 6,
        round: 1,
        scoreBefore: 80,
        scoreAfter: 80,
        delta: 0,
        outcome: 'no_effect',
        details: JSON.stringify({ outcome: 'no_effect', note: 'no_structural_change', invariants: { targetRef: '70_0' } }),
      },
      {
        toolName: 'set_figure_alt_text',
        stage: 6,
        round: 1,
        scoreBefore: 80,
        scoreAfter: 80,
        delta: 0,
        outcome: 'no_effect',
        details: JSON.stringify({
          outcome: 'no_effect',
          note: 'target_not_checker_visible_figure',
          invariants: { targetRef: '70_0', targetReachable: false, targetIsFigureAfter: false },
        }),
      },
    ]);
    expect(plan.planningSummary?.routeSummaries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ route: 'figure_semantics', status: 'stopped' }),
        expect.objectContaining({ route: 'annotation_link_normalization', status: 'active' }),
      ]),
    );
    expect(plan.stages.flatMap(stage => stage.tools.map(tool => tool.toolName))).toEqual(
      expect.arrayContaining(['repair_native_link_structure', 'tag_unowned_annotations']),
    );
    expect(plan.stages.flatMap(stage => stage.tools.map(tool => tool.toolName))).not.toContain('set_figure_alt_text');
  });
});
