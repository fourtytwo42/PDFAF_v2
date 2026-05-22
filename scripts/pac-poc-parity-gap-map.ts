#!/usr/bin/env tsx
import 'dotenv/config';

import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { CategoryKey } from '../src/types.js';
import { pacRuleScoringCap } from '../src/services/scorer/finalizeEvidence.js';
import { PAC_ACCEPTANCE_RULE_IDS } from '../src/services/remediation/pacRuleAcceptanceGate.js';

const DEFAULT_OUT = 'Output/pac-poc-parity-gap-map-2026-05-22-r1';
const GATE_RULE_SET = new Set<string>(PAC_ACCEPTANCE_RULE_IDS);

export type PacPocFamily =
  | 'parent_tree'
  | 'content_tagging'
  | 'table_headers'
  | 'headings_reading_order'
  | 'figures_alt'
  | 'lists'
  | 'annotations_forms'
  | 'fonts_cmap'
  | 'language'
  | 'artifacts_page_furniture'
  | 'catalog_syntax_optional'
  | 'contrast'
  | 'link_reachability'
  | 'ai_visual_tagging';

export type GapKind =
  | 'native_detection_gap'
  | 'scoring_gap'
  | 'remediation_gap'
  | 'acceptance_gate_gap'
  | 'optional_manual_review_gap';

export type LaneStatus =
  | 'behavior_ready_next'
  | 'evidence_hardening_needed'
  | 'mostly_aligned_monitor'
  | 'diagnostic_only_optional'
  | 'parked_no_safe_predicate';

export interface PacPocParityLane {
  id: string;
  family: PacPocFamily;
  title: string;
  priority: number;
  status: LaneStatus;
  gapKinds: GapKind[];
  mappedCategory: CategoryKey;
  pocReferenceChecks: string[];
  nativeRuleIds: string[];
  evidence: string[];
  currentState: string;
  nextAction: string;
  acceptanceGate: string;
}

export interface PacPocParityLaneReport extends PacPocParityLane {
  scoreActiveRuleIds: string[];
  gateActiveRuleIds: string[];
  diagnosticRuleIds: string[];
}

export interface PacPocParityGapMap {
  generatedAt: string;
  laneCount: number;
  familiesCovered: PacPocFamily[];
  currentTopLane: string | null;
  lanes: PacPocParityLaneReport[];
  decision: {
    status: 'continue_with_prioritized_lane' | 'evidence_map_only';
    reasons: string[];
  };
}

export const PAC_POC_PARITY_LANES: PacPocParityLane[] = [
  {
    id: 'table_header_transaction',
    family: 'table_headers',
    title: 'Table header/undersegmentation transaction',
    priority: 100,
    status: 'parked_no_safe_predicate',
    gapKinds: ['remediation_gap'],
    mappedCategory: 'table_markup',
    pocReferenceChecks: ['CheckTableHeaderCellAssignments', 'CheckTablesAreRegular', 'CheckCompleteTables'],
    nativeRuleIds: [
      'pdfua.table.headers_present',
      'pdfua.table.cells_nested_under_rows',
      'pdfua.table.rows_regular',
      'pdfua.table.strong_regular_structure',
      'pdfua.table.header_association_present',
      'pdfua.table.header_cells_associated',
    ],
    evidence: [
      'docs/table-undersegmentation-transaction-diagnostic-2026-05-21.md',
      'docs/table-header-transaction-behavior-proof-2026-05-21.md',
      'docs/table-target-resolution-diagnostic-2026-05-21.md',
      'docs/washington-sac-publications-holdout-2026-05-18.md',
      'docs/louisiana-lcle-cvr-holdout-2026-05-18.md',
      'docs/public-table-stage180-low-heading-experiment-2026-05-18.md',
    ],
    currentState: 'PAC-like table/header detection is strong and score-active, but the dense-table behavior proof only produced one accepted positive repair and other planned targets resolved as non-table roles before mutation.',
    nextAction: 'Keep table behavior parked until a pre-mutation target-resolution proof shows stable /Table refs and at least two accepted positive repairs with controls stable.',
    acceptanceGate: 'No dense row-band routing without verified /Table target refs, final table/PAC debt reduction, false_positive_applied=0, controls stable, no new hard timeout, and original-50 deterministic validation.',
  },
  {
    id: 'font_cmap_scoring_hardening',
    family: 'fonts_cmap',
    title: 'Font/CMap Unicode mapping strictness',
    priority: 90,
    status: 'evidence_hardening_needed',
    gapKinds: ['scoring_gap', 'native_detection_gap'],
    mappedCategory: 'text_extractability',
    pocReferenceChecks: [
      'CheckCharactersUnicodeMappable',
      'CheckCMapPredefinedOrEmbedded',
      'CheckCMapOnlyReferencesToPredefinedCMaps',
      'CheckWModeInDictAndStreamIdentical',
      'CheckFontType2HasCIDToGIDMap',
    ],
    nativeRuleIds: [
      'pdfua.font.to_unicode_cmap_present',
      'pdfua.font.to_unicode_cmap_valid',
      'pdfua.content.characters_unicode_mappable',
      'pdfua.font.cid_to_gidmap_valid',
      'pdfua.font.truetype_encoding_consistent',
      'pdfua.font.wmode_consistent',
    ],
    evidence: [
      'docs/pac-promotion-readiness-corpus-decision.md',
      'docs/all-input-mean-goal-baseline.md',
      'docs/odl-native-scoring-calibration-2026-05-19.md',
    ],
    currentState: 'Native font syntax and replacement-character evidence exists, but most CMap rules remain diagnostic because prior broad font caps were noisy.',
    nextAction: 'Run a focused scoring-hardening diagnostic that separates true text extraction debt from harmless font syntax debt before adding any cap.',
    acceptanceGate: 'Controls with clean copy/paste/text extraction must stay stable; any score drop must be documented as stricter correct grading.',
  },
  {
    id: 'content_event_tagging_fidelity',
    family: 'content_tagging',
    title: 'Content stream tagged-or-artifacted event fidelity',
    priority: 82,
    status: 'evidence_hardening_needed',
    gapKinds: ['native_detection_gap', 'acceptance_gate_gap'],
    mappedCategory: 'pdf_ua_compliance',
    pocReferenceChecks: [
      'CheckContentIsTaggedOrArtifacted',
      'CheckNoArtifactInTaggedContent',
      'CheckNoTaggedContentInArtifacts',
      'CheckMarkedContentIsInLegalPosition',
      'CheckDocuementContainsNoReferenceXObjects',
    ],
    nativeRuleIds: [
      'pdfua.content.text_tagged_or_artifacted',
      'pdfua.content.image_tagged_or_artifacted',
      'pdfua.content.path_paint_tagged_or_artifacted',
      'pdfua.content.artifact_tag_boundary_valid',
      'pdfua.content.no_artifact_in_tagged_content',
      'pdfua.content.no_tagged_content_in_artifact',
      'pdfua.content.marked_content_stack_valid',
      'pdfua.content.within_page_bounds',
      'pdfua.content.external_reference_xobjects_absent',
    ],
    evidence: ['docs/pac-grader-parity-map.md', 'docs/pac-promotion-readiness-corpus-decision.md'],
    currentState: 'Text/path/artifact boundary evidence is partly score-active, but image and reference-XObject evidence is still noisy/manual-review.',
    nextAction: 'Harden native content stream auditing by splitting verified page-stream evidence from sampled/heuristic XObject evidence.',
    acceptanceGate: 'Only verified full-stream evidence may become score-active or gate-active; sampled evidence stays diagnostic.',
  },
  {
    id: 'rendered_contrast_opt_in',
    family: 'contrast',
    title: 'Rendered text contrast measurement',
    priority: 80,
    status: 'evidence_hardening_needed',
    gapKinds: ['native_detection_gap', 'scoring_gap'],
    mappedCategory: 'color_contrast',
    pocReferenceChecks: ['CheckContrastOfText'],
    nativeRuleIds: ['wcag.contrast.text_contrast_measured'],
    evidence: ['docs/poc-decompiled-checker-map.md', 'src/services/scorer/categories/colorContrast.ts'],
    currentState: 'PDFAF marks color contrast as not measured/manual review; POC renders pages and checks WCAG-like thresholds.',
    nextAction: 'Add an opt-in rendered-contrast diagnostic path first, with bounded sampled pages and explicit uncertainty.',
    acceptanceGate: 'No default benchmark/runtime path may render pages until speed and confidence are proven; score-active promotion requires controls.',
  },
  {
    id: 'parent_tree_structure_syntax_monitor',
    family: 'parent_tree',
    title: 'ParentTree and structure syntax parity',
    priority: 72,
    status: 'mostly_aligned_monitor',
    gapKinds: ['remediation_gap'],
    mappedCategory: 'pdf_ua_compliance',
    pocReferenceChecks: ['CheckStructuralParentTree', 'CheckStructureElementHasParentKey', 'CheckStructureHasCorruptElements'],
    nativeRuleIds: [
      'pdfua.parent_tree.present',
      'pdfua.parent_tree.page_structparents_present',
      'pdfua.parent_tree.mcid_entries_valid',
      'pdfua.parent_tree.annotation_object_refs_consistent',
      'pdfua.structure.syntax_roles_present',
      'pdfua.structure.parent_links_valid',
      'pdfua.structure.child_roles_valid',
      'pdfua.structure.mcr_objr_valid',
      'pdfua.structure.rolemap_valid',
    ],
    evidence: ['docs/pac-grader-parity-map.md', 'docs/all-input-parent-link-cap-repair.md'],
    currentState: 'Many ParentTree/structure syntax leaves are score-active; selected repair lanes exist, but object-backed remediation remains incomplete on mixed rows.',
    nextAction: 'Use as regression and target-selection evidence while prioritizing higher-return table/font/content lanes.',
    acceptanceGate: 'Any new repair must reduce the specific object-level rule debt and preserve page/text/tag evidence.',
  },
  {
    id: 'heading_reading_order_geometry',
    family: 'headings_reading_order',
    title: 'Heading and reading-order structure parity',
    priority: 68,
    status: 'parked_no_safe_predicate',
    gapKinds: ['remediation_gap', 'scoring_gap'],
    mappedCategory: 'reading_order',
    pocReferenceChecks: [
      'CheckSetFirstHeadingIsH1',
      'CheckSetNoHeadingsSkipped',
      'CheckSetHeadingStructureTypesNotMixed',
      'CheckSetOnlyOneHPerNode',
    ],
    nativeRuleIds: [
      'pdfua.heading.first_heading_h1',
      'pdfua.heading.levels_not_skipped',
      'pdfua.heading.h_and_hn_not_mixed',
    ],
    evidence: [
      'docs/reading-heading-discriminator-diagnostic-2026-05-20.md',
      'docs/report-layout-heading-mutation-root-cause-2026-05-20.md',
    ],
    currentState: 'Report-layout evidence is selective, but heading mutation mostly proved fallback safety/no-effect rather than repeatable score-moving repair.',
    nextAction: 'Park broad remediation; revisit only with a stricter object-backed target or a scoring-only reading-order calibration.',
    acceptanceGate: 'At least three positives and zero controls must share a safe object-backed predicate before behavior changes.',
  },
  {
    id: 'artifacts_page_furniture_safety',
    family: 'artifacts_page_furniture',
    title: 'Artifacts, headers/footers, and page-furniture safety',
    priority: 66,
    status: 'evidence_hardening_needed',
    gapKinds: ['native_detection_gap', 'remediation_gap'],
    mappedCategory: 'pdf_ua_compliance',
    pocReferenceChecks: [
      'CheckContentIsTaggedOrArtifacted',
      'CheckNoArtifactInTaggedContent',
      'CheckNoTaggedContentInArtifacts',
    ],
    nativeRuleIds: [
      'pdfua.content.artifact_tag_boundary_valid',
      'pdfua.content.no_artifact_in_tagged_content',
      'pdfua.content.no_tagged_content_in_artifact',
      'pdfua.content.marked_content_stack_valid',
    ],
    evidence: ['docs/odl-native-layout-evidence-2026-05-19.md', 'docs/pac-grader-parity-map.md'],
    currentState: 'Verified artifact/tag boundary rules are score-active where content-stream evidence exists; layout header/footer signals are diagnostic safety evidence only.',
    nextAction: 'Use page-furniture signals to reject unsafe heading/caption/table promotion, not to hide checker-visible failures or raise scores.',
    acceptanceGate: 'Only verified stream artifact/tag boundary evidence may become score-active; header/footer filtering cannot suppress PAC-visible content debt.',
  },
  {
    id: 'figure_alt_bbox_quality',
    family: 'figures_alt',
    title: 'Figure alt, BBox, caption, and generated-alt quality',
    priority: 64,
    status: 'evidence_hardening_needed',
    gapKinds: ['native_detection_gap', 'remediation_gap'],
    mappedCategory: 'alt_text',
    pocReferenceChecks: ['CheckFigureHasAltText', 'CheckFormulaHasAltText', 'CheckFigureHasBBox', 'CheckAltTextsAreNotGenerated'],
    nativeRuleIds: [
      'pdfua.figure.alt_present',
      'pdfua.figure.checker_visible_alt_present',
      'pdfua.formula.alt_present',
      'pdfua.figure.bbox_present',
      'pdfua.quality.alt_not_generated',
    ],
    evidence: ['docs/odl-native-layout-evidence-2026-05-19.md', 'docs/pac-grader-parity-map.md'],
    currentState: 'Alt ownership is strong and guarded, but BBox/caption/generated-alt evidence remains heuristic or diagnostic.',
    nextAction: 'Harden figure BBox and caption-pair evidence before changing scoring or semantic prompt routing.',
    acceptanceGate: 'Only one-to-one nearby caption/object evidence can influence remediation; generic placeholders must remain visible as weak-alt debt.',
  },
  {
    id: 'annotations_forms_widget_nesting',
    family: 'annotations_forms',
    title: 'Annotation, link, and widget/form nesting',
    priority: 60,
    status: 'evidence_hardening_needed',
    gapKinds: ['native_detection_gap', 'acceptance_gate_gap'],
    mappedCategory: 'link_quality',
    pocReferenceChecks: [
      'CheckAnnotationsInAnnotTag',
      'CheckLinkAnnotationsInLinkTag',
      'CheckWidgetAnnotationsInFormTag',
      'CheckPagesWithAnnotsHaveTabOrderS',
    ],
    nativeRuleIds: [
      'pdfua.parent_tree.annotation_struct_parent_present',
      'pdfua.annotations.tagged_annotations_present',
      'pdfua.annotations.link_in_link_tag',
      'pdfua.annotations.widget_in_form_tag',
      'pdfua.annotations.tab_order_structure',
      'pdfua.annotations.nonlink_contents_present',
    ],
    evidence: ['docs/pac-grader-parity-map.md', 'docs/fixture-link-recovery-diagnostic.md'],
    currentState: 'Annotation ownership and tab-order debt are partially score/gate-active; widget/Form nesting is still manual-review.',
    nextAction: 'Add direct subtype-role audits before promoting more annotation/form gates.',
    acceptanceGate: 'New gates must reject only real fail-count regressions on structural tools, not manual-review warnings.',
  },
  {
    id: 'lists_toc_notes_structure',
    family: 'lists',
    title: 'Lists, TOC, and Note structure',
    priority: 52,
    status: 'mostly_aligned_monitor',
    gapKinds: ['native_detection_gap'],
    mappedCategory: 'reading_order',
    pocReferenceChecks: ['CheckLTag', 'CheckLITag', 'CheckLblTag', 'CheckLBodyTag', 'CheckTOCITag', 'CheckNoteTagHasID'],
    nativeRuleIds: [
      'pdfua.list.li_parent_valid',
      'pdfua.list.lbl_lbody_parent_valid',
      'pdfua.list.items_present',
      'pdfua.toc.toci_links_valid',
      'pdfua.note.ids_unique',
    ],
    evidence: ['docs/pac-grader-parity-map.md'],
    currentState: 'List parentage is score-active where audit evidence exists; TOC/Note evidence remains optional/heuristic.',
    nextAction: 'Keep list rules active; promote TOC/Note only after repeated direct object evidence appears.',
    acceptanceGate: 'No remediation behavior until stable object refs and controls are available.',
  },
  {
    id: 'language_parts_validation',
    family: 'language',
    title: 'Language syntax and natural language of parts',
    priority: 48,
    status: 'mostly_aligned_monitor',
    gapKinds: ['native_detection_gap', 'scoring_gap'],
    mappedCategory: 'title_language',
    pocReferenceChecks: [
      'CheckValidLanguage',
      'CheckAltTextHasLanguage',
      'CheckActualTextHasLanguage',
      'CheckContentsEntryHasLanguage',
      'CheckOutlineItemHasLanguage',
      'CheckTUEntryHasLanguage',
      'CheckTextContentHasLanguage',
    ],
    nativeRuleIds: [
      'pdfua.language.document_lang_present',
      'pdfua.language.document_lang_syntax_valid',
      'pdfua.language.text_object_lang_valid',
      'pdfua.language.alt_text_lang_valid',
      'pdfua.language.actual_text_lang_valid',
      'pdfua.language.annotation_contents_lang_valid',
      'pdfua.language.form_tu_lang_valid',
      'pdfua.language.outline_lang_valid',
      'pdfua.language.structure_lang_valid',
    ],
    evidence: [
      'docs/poc-decompiled-checker-map.md',
      'docs/language-parts-parity-diagnostic-2026-05-21.md',
      'docs/language-syntax-scoring-calibration-2026-05-22.md',
      'src/services/compliance/pacRuleEvidence.ts',
    ],
    currentState: 'Document language presence plus explicit document/structure /Lang syntax are score-active. Language-of-parts evidence remains diagnostic because inherited context is not complete enough for safe caps.',
    nextAction: 'Keep heuristic language-of-parts diagnostic-only; reopen only with malformed explicit /Lang values or direct object-context language evidence.',
    acceptanceGate: 'Only malformed explicit /Lang values should ever become score-active without semantic language detection.',
  },
  {
    id: 'optional_catalog_filespec_xfa',
    family: 'catalog_syntax_optional',
    title: 'Optional content, embedded files, XFA, and catalog syntax',
    priority: 40,
    status: 'diagnostic_only_optional',
    gapKinds: ['optional_manual_review_gap'],
    mappedCategory: 'pdf_ua_compliance',
    pocReferenceChecks: ['CheckOCConfDictHasName', 'CheckOCConfDictHasNoAS', 'CheckFSDictsContainsFAndUF', 'CheckXFAIsNotDynamic'],
    nativeRuleIds: [
      'pdfua.optional_content.config_valid',
      'pdfua.filespec.f_and_uf_present',
      'pdfua.xfa.dynamic_absent',
      'pdfua.settings.display_doc_title_present_or_unknown',
    ],
    evidence: ['docs/poc-decompiled-checker-map.md', 'src/services/compliance/pacRuleEvidence.ts'],
    currentState: 'Rules exist as optional diagnostics when audit fields are present; they are not high-impact default remediation targets.',
    nextAction: 'Keep diagnostic unless a repeated outside-corpus failure makes one rule high-impact.',
    acceptanceGate: 'No default score/remediation behavior from optional checks without corpus evidence.',
  },
  {
    id: 'link_reachability_ai_visual_tagging',
    family: 'link_reachability',
    title: 'URI reachability and AI visual/tag mismatch',
    priority: 30,
    status: 'diagnostic_only_optional',
    gapKinds: ['optional_manual_review_gap'],
    mappedCategory: 'link_quality',
    pocReferenceChecks: ['CheckLinksAreReachable', 'CheckAITagClassification', 'CheckAIFalsePositiveDetection', 'CheckAIFalseNegativeDetection'],
    nativeRuleIds: ['pdfua.link.uri_reachability_checked', 'pdfua.ai.visual_tag_mismatch_absent'],
    evidence: ['docs/poc-decompiled-checker-map.md', 'docs/pac-promotion-readiness-decision.md'],
    currentState: 'Network and semantic diagnostics are intentionally not part of deterministic default scoring/remediation.',
    nextAction: 'Keep opt-in/manual-review; do not add default gates or score caps.',
    acceptanceGate: 'Only user-invoked diagnostics may run network or semantic checks.',
  },
];

export function buildPacPocParityGapMap(lanes = PAC_POC_PARITY_LANES): PacPocParityGapMap {
  const laneReports = lanes
    .map(lane => {
      const scoreActiveRuleIds = lane.nativeRuleIds.filter(ruleId => pacRuleScoringCap(ruleId) !== null);
      const gateActiveRuleIds = lane.nativeRuleIds.filter(ruleId => GATE_RULE_SET.has(ruleId));
      const diagnosticRuleIds = lane.nativeRuleIds.filter(ruleId =>
        !scoreActiveRuleIds.includes(ruleId) && !gateActiveRuleIds.includes(ruleId)
      );
      return {
        ...lane,
        scoreActiveRuleIds,
        gateActiveRuleIds,
        diagnosticRuleIds,
      };
    })
    .sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));
  const currentTopLane = laneReports.find(lane => lane.status === 'behavior_ready_next')?.id ?? null;
  const familiesCovered = [...new Set(laneReports.map(lane => lane.family))].sort((a, b) => a.localeCompare(b));
  const reasons = [
    `families_covered=${familiesCovered.length}`,
    `behavior_ready_next=${laneReports.filter(lane => lane.status === 'behavior_ready_next').length}`,
    `evidence_hardening_needed=${laneReports.filter(lane => lane.status === 'evidence_hardening_needed').length}`,
    currentTopLane ? `top_lane=${currentTopLane}` : 'no_behavior_ready_lane',
  ];
  return {
    generatedAt: new Date().toISOString(),
    laneCount: laneReports.length,
    familiesCovered,
    currentTopLane,
    lanes: laneReports,
    decision: {
      status: currentTopLane ? 'continue_with_prioritized_lane' : 'evidence_map_only',
      reasons,
    },
  };
}

function mdEscape(value: string | number | null | undefined): string {
  return String(value ?? 'n/a').replace(/\|/g, '/').replace(/\n/g, ' ');
}

function list(values: string[], limit = 3): string {
  if (values.length === 0) return 'none';
  const shown = values.slice(0, limit).map(value => `\`${value}\``).join(', ');
  return values.length > limit ? `${shown}, +${values.length - limit}` : shown;
}

export function renderPacPocParityGapMapMarkdown(map: PacPocParityGapMap): string {
  const lines = [
    '# PAC/POC Parity Gap Map',
    '',
    `- Generated: ${map.generatedAt}`,
    `- Lanes: ${map.laneCount}`,
    `- Families covered: ${map.familiesCovered.join(', ')}`,
    `- Decision: \`${map.decision.status}\``,
    `- Decision reasons: ${map.decision.reasons.join('; ')}`,
    '',
    'This report maps Research/POC-decompiled and PAC-style checks to native PDFAF evidence. It is diagnostic/planning output only: it does not call PAC/POC/ODL, change scoring, route remediation, or mutate PDFs.',
    '',
    '## Prioritized Lanes',
    '',
    '| Priority | Lane | Family | Status | Gap Kinds | Score-Active Rules | Gate Rules | Next Action |',
    '| ---: | --- | --- | --- | --- | --- | --- | --- |',
  ];
  for (const lane of map.lanes) {
    lines.push([
      lane.priority,
      `\`${lane.id}\``,
      lane.family,
      lane.status,
      lane.gapKinds.join(', '),
      list(lane.scoreActiveRuleIds),
      list(lane.gateActiveRuleIds),
      lane.nextAction,
    ].map(mdEscape).join(' | ').replace(/^/, '| ').replace(/$/, ' |'));
  }
  lines.push('', '## Lane Details', '');
  for (const lane of map.lanes) {
    lines.push(
      `### ${lane.title}`,
      '',
      `- Lane: \`${lane.id}\``,
      `- Family: \`${lane.family}\``,
      `- Status: \`${lane.status}\``,
      `- Gap kinds: ${lane.gapKinds.map(kind => `\`${kind}\``).join(', ')}`,
      `- Mapped category: \`${lane.mappedCategory}\``,
      `- POC/PAC reference checks: ${lane.pocReferenceChecks.map(value => `\`${value}\``).join(', ')}`,
      `- Native rules: ${lane.nativeRuleIds.map(value => `\`${value}\``).join(', ')}`,
      `- Score-active native rules: ${list(lane.scoreActiveRuleIds, 12)}`,
      `- Gate-active native rules: ${list(lane.gateActiveRuleIds, 12)}`,
      `- Diagnostic-only native rules: ${list(lane.diagnosticRuleIds, 12)}`,
      `- Evidence: ${lane.evidence.map(value => `\`${value}\``).join(', ')}`,
      `- Current state: ${lane.currentState}`,
      `- Next action: ${lane.nextAction}`,
      `- Acceptance gate: ${lane.acceptanceGate}`,
      '',
    );
  }
  return `${lines.join('\n')}\n`;
}

export async function writePacPocParityGapMap(outDir: string): Promise<PacPocParityGapMap> {
  const map = buildPacPocParityGapMap();
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, 'pac-poc-parity-gap-map.json'), `${JSON.stringify(map, null, 2)}\n`, 'utf8');
  await writeFile(join(outDir, 'pac-poc-parity-gap-map.md'), renderPacPocParityGapMapMarkdown(map), 'utf8');
  return map;
}

function usage(): string {
  return `Usage: pnpm exec tsx scripts/pac-poc-parity-gap-map.ts [--out <dir>]

Writes a diagnostic-only PAC/POC parity gap map. Default out: ${DEFAULT_OUT}`;
}

function argValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main(): Promise<void> {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log(usage());
    return;
  }
  const outDir = resolve(argValue('--out') ?? DEFAULT_OUT);
  const map = await writePacPocParityGapMap(outDir);
  console.log(`[pac-poc-parity] wrote ${join(outDir, 'pac-poc-parity-gap-map.md')}`);
  console.log(`[pac-poc-parity] decision ${map.decision.status}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(err => {
    console.error((err as Error).message);
    process.exit(1);
  });
}
