# PAC/POC Lane Rollup - 2026-05-21

## Decision

Decision: `no_safe_high_impact_lane_ready`.

Next step: `validation_checkpoint_or_new_pac_stress_sample`.

This is a diagnostic/planning checkpoint for the active PAC/POC alignment goal. It consolidates the latest source-tracked lane decisions after the original parity gap map. It does not call `Research/POC-decompiled`, PAC, ODL, Java, network tools, semantic AI, analysis, remediation, scoring, planner routing, or PDF mutation paths.

Generated local artifact:

- `Output/pac-poc-lane-rollup-2026-05-21-r1/pac-poc-lane-rollup.md`
- `Output/pac-poc-lane-rollup-2026-05-21-r1/pac-poc-lane-rollup.json`

Generated artifacts remain local and are not source-tracked.

## Rollup Result

- Families covered: `14`
- Lanes summarized: `15`
- Accepted or already-aligned lanes: `3`
- Parked diagnostic/behavior lanes: `9`
- Safe implementation lanes ready now: `0`
- High-impact safe implementation lanes ready now: `0`

The earlier `docs/pac-poc-parity-gap-map-2026-05-21.md` correctly selected table/header transaction as the next lane at that point. Later behavior proof and target-resolution diagnostics supersede that recommendation: the table lane is now parked until stable `/Table` target refs can be proven immediately before mutation.

## Accepted Or Aligned Work

`content_form_xobject_confidence`

- Decision: `accept_native_evidence_confidence_change`
- Evidence: `docs/content-form-xobject-confidence-2026-05-21.md`
- Accepted change: direct content-event PAC evidence can be `verified` when page-stream and Form XObject coverage are fully measured. Partial or unknown Form XObject coverage remains heuristic.

`annotation_form_existing_behavior`

- Decision: `existing_behavior_aligned_no_source_change`
- Evidence: `docs/annotation-form-existing-behavior-proof-2026-05-21.md`
- Accepted interpretation: current deterministic annotation/link/form sequences already repair the sampled form tooltip, link ownership, and tab-order positives with `false_positive_applied=0`. No new behavior is justified.

`report_layout_heading_strict_target_guard`

- Decision: `strict_target_guard_kept`
- Evidence: `docs/report-layout-heading-mutation-root-cause-2026-05-20.md`
- Accepted change: report-layout heading admissions now use strict target refs so the heading mutator refuses unsafe fallback and records explicit strict-target no-effect reasons.

## Parked High-Impact Lanes

`table_header_transaction`

- Decision: `park_table_header_transaction_behavior`
- Evidence: `docs/table-header-transaction-behavior-proof-2026-05-21.md` and `docs/table-target-resolution-diagnostic-2026-05-21.md`
- Reason: only `va-11` had accepted table/header debt reduction. `va-08`, `va-09`, and `va-10` resolved planned table targets as non-table roles before mutation.
- Reopen condition: prove stable `/Table` target refs immediately before mutation and at least two accepted positive repairs with controls stable.

`font_cmap_scoring_hardening`

- Decision: `keep_font_cmap_diagnostic_only`
- Evidence: `docs/font-cmap-scoring-hardening-diagnostic-2026-05-21.md`
- Reason: sampled CMap syntax debt did not correlate with extracted-text failure; controls also showed CMap syntax debt with clean text and high scores.
- Reopen condition: show true Unicode extraction debt not already captured by the accepted replacement-character ratio.

`content_page_sampling`

- Decision: `keep_page_sampling_diagnostic_only`
- Evidence: `docs/content-page-sampling-diagnostic-2026-05-21.md`
- Reason: same-budget stratified sampling produced zero focus candidates and weakened the main long-document debt signal.

`figure_caption_bbox_quality`

- Decision: `keep_figure_caption_bbox_diagnostic_only`
- Evidence: `docs/figure-caption-bbox-diagnostic-2026-05-21.md`
- Reason: only one caption-assisted alt candidate appeared; BBox debt overlapped with already score-active alt/PDF-UA debt and appeared on clean controls.

`rendered_contrast_opt_in`

- Decision: `keep_rendered_contrast_opt_in_diagnostic_only`
- Evidence: `docs/rendered-contrast-opt-in-diagnostic-2026-05-21.md`
- Reason: the current text-box sampler flagged all sampled rows, including Teams and accessible controls. It is not safe for score-active contrast grading.

## Parked Monitor/Lower-Impact Lanes

- List/TOC/Note remains diagnostic-only because no object-backed list parentage repair candidates appeared.
- PDF/UA catalog/syntax remains diagnostic-only because catalog candidates and RoleMap debt triggered controls.
- Artifact/page-furniture evidence remains safety-only and must not hide checker-visible failures.
- Language-of-parts remains diagnostic-only because the sample had no malformed explicit `/Lang` values or heuristic part-language candidates.
- ParentTree/structure syntax remains monitor/target-selection evidence unless a repeated object-level repair target is isolated.
- Link reachability and AI visual-tagging stay opt-in/manual-review only.

## Next Step

Do not start another broad fixer from the current evidence. The strongest next move is one of:

1. Run a fresh validation checkpoint to measure the current accepted state honestly across original-50, all-unique, and an outside holdout.
2. Open a new PAC-stress sample designed around a specific unresolved family: true rendered contrast positives, malformed explicit language-of-parts, or object-backed ParentTree/table targets.

Any new behavior still needs targeted positives, nearby controls, `false_positive_applied=0`, original-50 deterministic validation, and bounded runtime before acceptance.
