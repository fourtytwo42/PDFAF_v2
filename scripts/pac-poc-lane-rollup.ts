#!/usr/bin/env tsx
import 'dotenv/config';

import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const DEFAULT_OUT = 'Output/pac-poc-lane-rollup-2026-05-22-r1';

export type PacPocLaneOutcome =
  | 'accepted_native_evidence'
  | 'accepted_native_behavior'
  | 'accepted_safety_guard'
  | 'existing_behavior_aligned'
  | 'parked_behavior_failed'
  | 'parked_diagnostic_only'
  | 'monitor_only'
  | 'optional_only';

export type PacPocLaneFamily =
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

export interface PacPocLaneRollupItem {
  id: string;
  family: PacPocLaneFamily;
  priority: number;
  outcome: PacPocLaneOutcome;
  highImpact: boolean;
  safeImplementationNow: boolean;
  latestDecision: string;
  evidence: string[];
  acceptedChange: string;
  parkedReason: string;
  nextAction: string;
}

export interface PacPocLaneRollup {
  generatedAt: string;
  laneCount: number;
  safeImplementationNowCount: number;
  highImpactSafeImplementationNowCount: number;
  acceptedOrAlignedCount: number;
  parkedCount: number;
  familiesCovered: PacPocLaneFamily[];
  decision: {
    status: 'continue_with_safe_lane' | 'no_safe_high_impact_lane_ready';
    nextStep: 'implement_safe_lane' | 'validation_checkpoint_or_new_pac_stress_sample';
    reasons: string[];
  };
  lanes: PacPocLaneRollupItem[];
}

export const PAC_POC_LANE_ROLLUP_ITEMS: PacPocLaneRollupItem[] = [
  {
    id: 'content_form_xobject_confidence',
    family: 'content_tagging',
    priority: 100,
    outcome: 'accepted_native_evidence',
    highImpact: true,
    safeImplementationNow: false,
    latestDecision: 'accept_native_evidence_confidence_change',
    evidence: [
      'docs/content-form-xobject-confidence-2026-05-21.md',
      'docs/content-form-xobject-coverage-metric-2026-05-21.md',
      'docs/content-event-tagging-fidelity-diagnostic-2026-05-21.md',
    ],
    acceptedChange:
      'Direct content-event PAC evidence can be verified when page-stream and Form XObject coverage are fully measured; partial or unknown XObject coverage remains heuristic.',
    parkedReason:
      'The remaining page-sampling/XObject edge is not safe to broaden: same-budget stratified sampling weakened known visible debt and produced no focus candidates.',
    nextAction:
      'Treat measured Form XObject confidence as accepted evidence; do not add more content-event scoring or remediation until a new fully measured object-backed gap appears.',
  },
  {
    id: 'annotation_form_existing_behavior',
    family: 'annotations_forms',
    priority: 92,
    outcome: 'existing_behavior_aligned',
    highImpact: true,
    safeImplementationNow: false,
    latestDecision: 'existing_behavior_aligned_no_source_change',
    evidence: [
      'docs/annotation-form-parity-diagnostic-2026-05-21.md',
      'docs/annotation-form-existing-behavior-proof-2026-05-21.md',
    ],
    acceptedChange:
      'Current deterministic annotation/link/form sequences already repaired the sampled form tooltip, link ownership, and tab-order positives with false_positive_applied=0.',
    parkedReason:
      'No new scorer/planner/mutator behavior is justified; tab-4674 remains a narrow no-safe-state residual rather than a broad PAC parity lane.',
    nextAction:
      'Keep current behavior. Revisit only with a focused tab-4674 no-safe-state diagnostic or a larger annotation/form sample showing repeated unresolved object-backed debt.',
  },
  {
    id: 'report_layout_heading_strict_target_guard',
    family: 'headings_reading_order',
    priority: 88,
    outcome: 'accepted_safety_guard',
    highImpact: true,
    safeImplementationNow: false,
    latestDecision: 'strict_target_guard_kept',
    evidence: [
      'docs/reading-heading-discriminator-diagnostic-2026-05-20.md',
      'docs/report-layout-heading-recovery-behavior-proof-2026-05-20.md',
      'docs/report-layout-heading-mutation-root-cause-2026-05-20.md',
    ],
    acceptedChange:
      'Report-layout admissions now use strict target refs so the heading mutator refuses unsafe fallback and records clear strict_target no-effect reasons.',
    parkedReason:
      'The lane improved mutation truth but did not prove repeatable score-moving heading recovery; broad reading/heading behavior remains parked.',
    nextAction:
      'Do not broaden heading creation. Revisit only with an object-backed paragraph target proof, or plan scoring-only reading-order calibration separately.',
  },
  {
    id: 'table_header_transaction',
    family: 'table_headers',
    priority: 84,
    outcome: 'accepted_native_behavior',
    highImpact: true,
    safeImplementationNow: false,
    latestDecision: 'accept_report_scale_object_backed_table_proof',
    evidence: [
      'docs/table-undersegmentation-transaction-diagnostic-2026-05-21.md',
      'docs/table-header-transaction-behavior-proof-2026-05-21.md',
      'docs/table-target-resolution-diagnostic-2026-05-21.md',
      'docs/table-parenttree-stress-diagnostic-2026-05-22.md',
      'docs/table-parenttree-behavior-proof-2026-05-22.md',
    ],
    acceptedChange:
      'A narrow report-scale object-backed table proof now admits the existing Stage180 header regularization sequence when native /Table targets, heavy header-association debt, and clean non-table controls are present.',
    parkedReason:
      'The broader dense row-band transaction remains parked. va-08, va-09, and va-10 still represent layout-only/non-table-target blockers, not safe planner predicates.',
    nextAction:
      'Use the report-scale object-backed predicate as the accepted baseline. Reopen table behavior only with new stable /Table target proofs; do not route dense row-band evidence directly to table tools.',
  },
  {
    id: 'font_cmap_scoring_hardening',
    family: 'fonts_cmap',
    priority: 80,
    outcome: 'parked_diagnostic_only',
    highImpact: true,
    safeImplementationNow: false,
    latestDecision: 'keep_font_cmap_diagnostic_only',
    evidence: [
      'docs/font-cmap-scoring-hardening-diagnostic-2026-05-21.md',
      'docs/odl-native-scoring-calibration-2026-05-19.md',
    ],
    acceptedChange:
      'Existing U+FFFD replacement-character ratio remains the only accepted score-active native text-mapping lane.',
    parkedReason:
      'Sampled direct CMap syntax debt did not correlate with extracted-text failure; controls also showed CMap syntax debt with clean text and high scores.',
    nextAction:
      'Keep direct CMap syntax diagnostic-only. Reopen only with true Unicode extraction debt beyond the replacement-character signal.',
  },
  {
    id: 'content_page_sampling',
    family: 'content_tagging',
    priority: 76,
    outcome: 'parked_diagnostic_only',
    highImpact: true,
    safeImplementationNow: false,
    latestDecision: 'keep_page_sampling_diagnostic_only',
    evidence: ['docs/content-page-sampling-diagnostic-2026-05-21.md'],
    acceptedChange: 'No sampling behavior changed; passive sampledPageIndices/contentSampleStrategy fields are diagnostic only.',
    parkedReason:
      'Same-budget stratified sampling produced zero focus candidates and reduced visible debt on the main long-document row.',
    nextAction:
      'Keep first-page bounded sampling. Do not widen or stratify page sampling without a runtime-bounded diagnostic that strengthens, rather than weakens, PAC-visible debt.',
  },
  {
    id: 'figure_caption_bbox_quality',
    family: 'figures_alt',
    priority: 72,
    outcome: 'parked_diagnostic_only',
    highImpact: true,
    safeImplementationNow: false,
    latestDecision: 'keep_figure_caption_bbox_diagnostic_only',
    evidence: ['docs/figure-caption-bbox-diagnostic-2026-05-21.md'],
    acceptedChange: 'No new figure/caption/BBox scoring, routing, prompt, or mutation behavior was accepted.',
    parkedReason:
      'Only one caption-assisted alt candidate appeared, while BBox debt overlapped with already score-active alt/PDF-UA debt and also appeared on clean controls.',
    nextAction:
      'Reopen only with repeated one-to-one caption/object positives and clean controls; keep generic/generated alt debt visible.',
  },
  {
    id: 'list_toc_note_structure',
    family: 'lists',
    priority: 66,
    outcome: 'parked_diagnostic_only',
    highImpact: false,
    safeImplementationNow: false,
    latestDecision: 'keep_list_toc_note_diagnostic_only',
    evidence: ['docs/list-toc-note-parity-diagnostic-2026-05-21.md'],
    acceptedChange: 'No list, TOC, or Note scoring/remediation behavior changed.',
    parkedReason:
      'The sample showed no object-backed native list parentage repair candidates and only one TOC diagnostic gap.',
    nextAction:
      'Revisit only with PDFs that have actual PAC/POC list parentage failures visible as misplaced LI, Lbl, LBody, or empty list containers.',
  },
  {
    id: 'pdfua_catalog_syntax_optional',
    family: 'catalog_syntax_optional',
    priority: 62,
    outcome: 'parked_diagnostic_only',
    highImpact: false,
    safeImplementationNow: false,
    latestDecision: 'keep_pdfua_catalog_syntax_diagnostic_only',
    evidence: ['docs/pdfua-catalog-syntax-diagnostic-2026-05-21.md'],
    acceptedChange: 'Existing catalog/PDF-UA baseline scoring remains in place; no new catalog/RoleMap/optional behavior changed.',
    parkedReason:
      'Catalog setting candidates also triggered on ADAM2 control, RoleMap debt triggered protected controls, and optional-content evidence had one focus row only.',
    nextAction:
      'Keep optional/catalog syntax diagnostic unless a repeated outside failure appears with controls clean.',
  },
  {
    id: 'artifact_page_furniture_safety',
    family: 'artifacts_page_furniture',
    priority: 58,
    outcome: 'parked_diagnostic_only',
    highImpact: false,
    safeImplementationNow: false,
    latestDecision: 'keep_artifact_page_furniture_diagnostic_only',
    evidence: ['docs/artifacts-page-furniture-diagnostic-2026-05-21.md'],
    acceptedChange: 'No header/footer, artifact-boundary, or page-furniture scoring/remediation behavior changed.',
    parkedReason:
      'Repeated page-furniture evidence is useful as rejection/safety context, but it triggered both focus rows and controls and cannot hide checker-visible failures.',
    nextAction:
      'Use page-furniture only to reject unsafe heading/caption/table promotion unless verified stream artifact-boundary evidence is the primary predicate.',
  },
  {
    id: 'language_parts_validation',
    family: 'language',
    priority: 52,
    outcome: 'accepted_native_evidence',
    highImpact: false,
    safeImplementationNow: false,
    latestDecision: 'provisional_direct_language_syntax_scoring_hardening',
    evidence: [
      'docs/language-parts-parity-diagnostic-2026-05-21.md',
      'docs/language-syntax-scoring-calibration-2026-05-22.md',
    ],
    acceptedChange:
      'Explicit document and structure /Lang syntax failures are now native score-active PAC evidence at the baseline cap; heuristic language-of-parts evidence remains diagnostic.',
    parkedReason:
      'Language-of-parts caps are still unsafe without direct malformed /Lang values or complete inherited object-context evidence.',
    nextAction:
      'Do not add heuristic language-of-parts caps. Track the direct syntax hardening in validation checkpoints and reopen only with direct object-context language evidence.',
  },
  {
    id: 'rendered_contrast_opt_in',
    family: 'contrast',
    priority: 48,
    outcome: 'parked_diagnostic_only',
    highImpact: true,
    safeImplementationNow: false,
    latestDecision: 'keep_rendered_contrast_opt_in_diagnostic_only',
    evidence: ['docs/rendered-contrast-opt-in-diagnostic-2026-05-21.md'],
    acceptedChange: 'An opt-in rendered contrast diagnostic exists, but default analysis/scoring/remediation do not call it.',
    parkedReason:
      'The current text-box sampler flagged all five sampled rows, including Teams and accessible controls, so it is not safe for score-active grading.',
    nextAction:
      'Harden foreground/background sampling with known contrast positives and clean controls before considering any score-active contrast rule.',
  },
  {
    id: 'parent_tree_structure_syntax_monitor',
    family: 'parent_tree',
    priority: 44,
    outcome: 'monitor_only',
    highImpact: true,
    safeImplementationNow: false,
    latestDecision: 'mostly_aligned_monitor',
    evidence: ['docs/pac-poc-parity-gap-map-2026-05-21.md'],
    acceptedChange:
      'ParentTree and structure syntax rules remain score/gate evidence and target-selection context from earlier PAC alignment work.',
    parkedReason:
      'No fresh high-confidence parent-tree object-backed remediation lane has been isolated beyond existing tools and diagnostics.',
    nextAction:
      'Use as regression and target-selection evidence. Open a new proof only when a repeated object-level ParentTree target is visible with controls stable.',
  },
  {
    id: 'link_reachability_ai_visual_tagging',
    family: 'link_reachability',
    priority: 34,
    outcome: 'optional_only',
    highImpact: false,
    safeImplementationNow: false,
    latestDecision: 'optional_diagnostic_only',
    evidence: ['docs/pac-poc-parity-gap-map-2026-05-21.md', 'docs/pac-promotion-readiness-decision.md'],
    acceptedChange: 'No network reachability or AI visual-tag behavior is part of deterministic default grading/remediation.',
    parkedReason:
      'These checks are opt-in/manual-review by nature and would violate default runtime/determinism goals if promoted broadly.',
    nextAction:
      'Keep user-invoked only. Do not add default network or semantic checks to scoring, Docker/API, or benchmarks.',
  },
  {
    id: 'ai_visual_tagging',
    family: 'ai_visual_tagging',
    priority: 30,
    outcome: 'optional_only',
    highImpact: false,
    safeImplementationNow: false,
    latestDecision: 'optional_diagnostic_only',
    evidence: ['docs/poc-decompiled-checker-map.md'],
    acceptedChange: 'No AI visual mismatch behavior is accepted for deterministic grading.',
    parkedReason:
      'AI visual checks require opt-in semantic work and are unsuitable for default deterministic acceptance gates.',
    nextAction: 'Leave as manual-review/optional diagnostic until a separate semantic validation goal is opened.',
  },
];

function countWhere<T>(values: T[], predicate: (value: T) => boolean): number {
  return values.reduce((count, value) => count + (predicate(value) ? 1 : 0), 0);
}

export function buildPacPocLaneRollup(items = PAC_POC_LANE_ROLLUP_ITEMS): PacPocLaneRollup {
  const lanes = [...items].sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));
  const safeImplementationNowCount = countWhere(lanes, lane => lane.safeImplementationNow);
  const highImpactSafeImplementationNowCount = countWhere(
    lanes,
    lane => lane.highImpact && lane.safeImplementationNow,
  );
  const acceptedOrAlignedCount = countWhere(lanes, lane =>
    lane.outcome === 'accepted_native_evidence' ||
    lane.outcome === 'accepted_native_behavior' ||
    lane.outcome === 'accepted_safety_guard' ||
    lane.outcome === 'existing_behavior_aligned',
  );
  const parkedCount = countWhere(lanes, lane =>
    lane.outcome === 'parked_behavior_failed' || lane.outcome === 'parked_diagnostic_only',
  );
  const familiesCovered = [...new Set(lanes.map(lane => lane.family))].sort((a, b) => a.localeCompare(b));
  const status = highImpactSafeImplementationNowCount > 0 ? 'continue_with_safe_lane' : 'no_safe_high_impact_lane_ready';
  const nextStep = highImpactSafeImplementationNowCount > 0
    ? 'implement_safe_lane'
    : 'validation_checkpoint_or_new_pac_stress_sample';
  const reasons = [
    `families_covered=${familiesCovered.length}`,
    `accepted_or_aligned=${acceptedOrAlignedCount}`,
    `parked=${parkedCount}`,
    `safe_implementation_now=${safeImplementationNowCount}`,
    `high_impact_safe_implementation_now=${highImpactSafeImplementationNowCount}`,
  ];

  return {
    generatedAt: new Date().toISOString(),
    laneCount: lanes.length,
    safeImplementationNowCount,
    highImpactSafeImplementationNowCount,
    acceptedOrAlignedCount,
    parkedCount,
    familiesCovered,
    decision: { status, nextStep, reasons },
    lanes,
  };
}

function mdEscape(value: string | number | boolean | null | undefined): string {
  return String(value ?? 'n/a').replace(/\|/g, '/').replace(/\n/g, ' ');
}

function evidenceList(values: string[]): string {
  return values.map(value => `\`${value}\``).join(', ');
}

export function renderPacPocLaneRollupMarkdown(rollup: PacPocLaneRollup): string {
  const lines = [
    '# PAC/POC Lane Rollup',
    '',
    `- Generated: ${rollup.generatedAt}`,
    `- Lanes: ${rollup.laneCount}`,
    `- Families covered: ${rollup.familiesCovered.join(', ')}`,
    `- Decision: \`${rollup.decision.status}\``,
    `- Next step: \`${rollup.decision.nextStep}\``,
    `- Decision reasons: ${rollup.decision.reasons.join('; ')}`,
    '',
    'This report consolidates the latest source-tracked PAC/POC parity lane decisions. It is diagnostic/planning output only: it does not call Research/POC-decompiled, PAC, ODL, Java, network tools, semantic AI, analysis, remediation, scoring, planner routing, or PDF mutation paths.',
    '',
    '## Lane Summary',
    '',
    '| Priority | Lane | Family | Outcome | High Impact | Safe Now | Latest Decision | Next Action |',
    '| ---: | --- | --- | --- | --- | --- | --- | --- |',
  ];

  for (const lane of rollup.lanes) {
    lines.push([
      lane.priority,
      `\`${lane.id}\``,
      lane.family,
      lane.outcome,
      lane.highImpact,
      lane.safeImplementationNow,
      lane.latestDecision,
      lane.nextAction,
    ].map(mdEscape).join(' | ').replace(/^/, '| ').replace(/$/, ' |'));
  }

  lines.push('', '## Lane Details', '');
  for (const lane of rollup.lanes) {
    lines.push(
      `### ${lane.id}`,
      '',
      `- Family: \`${lane.family}\``,
      `- Outcome: \`${lane.outcome}\``,
      `- High impact: \`${lane.highImpact}\``,
      `- Safe implementation now: \`${lane.safeImplementationNow}\``,
      `- Latest decision: \`${lane.latestDecision}\``,
      `- Evidence: ${evidenceList(lane.evidence)}`,
      `- Accepted/aligned change: ${lane.acceptedChange}`,
      `- Parked reason: ${lane.parkedReason}`,
      `- Next action: ${lane.nextAction}`,
      '',
    );
  }

  lines.push(
    '## Interpretation',
    '',
    'The current source-tracked evidence has no high-impact PAC/POC lane that is ready for immediate new production behavior. The strongest PAC-alignment work since the original map is accepted evidence confidence for fully measured Form XObject content events, direct language syntax score hardening, existing annotation/form behavior proof, the report-layout strict-target safety guard, and the narrow report-scale object-backed table proof.',
    '',
    'The next useful checkpoint is therefore not another broad fixer. Either run a fresh validation checkpoint to measure the current accepted state across original-50, all-unique, and an outside holdout, or open a new PAC-stress sample specifically designed around one unresolved family such as true rendered contrast positives, malformed explicit language-of-parts, or a new object-backed ParentTree/table subtype.',
    '',
  );

  return `${lines.join('\n')}\n`;
}

export async function writePacPocLaneRollup(outDir: string): Promise<PacPocLaneRollup> {
  const rollup = buildPacPocLaneRollup();
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, 'pac-poc-lane-rollup.json'), `${JSON.stringify(rollup, null, 2)}\n`, 'utf8');
  await writeFile(join(outDir, 'pac-poc-lane-rollup.md'), renderPacPocLaneRollupMarkdown(rollup), 'utf8');
  return rollup;
}

function argValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function usage(): string {
  return `Usage: pnpm exec tsx scripts/pac-poc-lane-rollup.ts [--out <dir>]

Writes a diagnostic-only current PAC/POC lane rollup. Default out: ${DEFAULT_OUT}`;
}

async function main(): Promise<void> {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log(usage());
    return;
  }
  const outDir = resolve(argValue('--out') ?? DEFAULT_OUT);
  const rollup = await writePacPocLaneRollup(outDir);
  console.log(`[pac-poc-rollup] wrote ${join(outDir, 'pac-poc-lane-rollup.md')}`);
  console.log(`[pac-poc-rollup] decision ${rollup.decision.status}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(err => {
    console.error((err as Error).message);
    process.exit(1);
  });
}
