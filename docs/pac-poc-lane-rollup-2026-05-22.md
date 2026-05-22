# PAC/POC Lane Rollup Refresh

Date: 2026-05-22

## Decision

Decision: `no_safe_high_impact_lane_ready`.

This refresh updates the PAC/POC lane rollup after direct language-syntax scoring hardening, the latest validation checkpoint, and the accepted narrow Table/ParentTree behavior proof. It is diagnostic/planning only. It does not call Research/POC-decompiled, PAC, ODL, Java, network tools, semantic AI, analysis, remediation, scoring, planner routing, or PDF mutation paths.

Local generated artifact:

- `Output/pac-poc-lane-rollup-2026-05-22-r1/pac-poc-lane-rollup.md`
- `Output/pac-poc-lane-rollup-2026-05-22-r1/pac-poc-lane-rollup.json`

Generated artifacts remain local and are not source-tracked.

## Rollup Result

- Families covered: `14`
- Lanes summarized: `15`
- Accepted or aligned lanes: `5`
- Parked diagnostic/behavior lanes: `7`
- Safe implementation lanes ready now: `0`
- High-impact safe implementation lanes ready now: `0`

## Accepted Or Aligned Work

The rollup now counts these as accepted or aligned:

- `content_form_xobject_confidence`: verified Form XObject coverage can support native content-event PAC evidence when full page/Form coverage is measured.
- `annotation_form_existing_behavior`: current annotation/link/form behavior is already aligned for the sampled object-backed positives.
- `report_layout_heading_strict_target_guard`: report-layout heading admissions use strict target refs to avoid unsafe fallback mutation.
- `table_header_transaction`: a narrow report-scale object-backed table predicate now admits the existing Stage180 header regularization sequence when stable `/Table` targets, heavy header-association debt, and clean controls are present.
- `language_parts_validation`: direct malformed document/structure `/Lang` syntax is native score-active evidence at the baseline cap.

Language-of-parts heuristics are still parked. The accepted language change is limited to explicit native `/Lang` syntax evidence.

## Parked High-Impact Lanes

The high-impact parked lanes remain:

- dense/layout-only table routing inside `table_header_transaction`: still parked for `va-08`, `va-09`, and `va-10` because prior targets resolved as non-table roles.
- `font_cmap_scoring_hardening`: parked until true Unicode extraction debt is shown beyond replacement-character evidence.
- `content_page_sampling`: parked because stratified sampling weakened known long-document debt.
- `figure_caption_bbox_quality`: parked until repeated one-to-one object/caption positives with clean controls exist.
- `rendered_contrast_opt_in`: parked because the current sampler flags controls.

## Next Step

Do not start another broad fixer from the current evidence. The next useful checkpoint is either:

1. Run/report a fresh validation checkpoint across original-50, all-unique, and an outside holdout.
2. Build a targeted PAC-stress sample for one unresolved family with direct controls.

Any future behavior still needs targeted positives, nearby controls, `false_positive_applied=0`, original-50 deterministic validation, and bounded runtime before acceptance.
