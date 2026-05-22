# PAC Stress Sample Selector

Date: 2026-05-22

## Decision

Decision: `build_object_backed_table_parenttree_stress_sample`.

This adds a diagnostic-only selector for the active PAC/POC alignment goal. The selector reads existing JSON reports and ranks the next PAC-stress sample options. It does not analyze PDFs, remediate PDFs, write PDFs, call PAC/POC/ODL/Java, call semantic AI, or change production scoring/planning behavior.

Local generated artifact:

- `Output/pac-stress-sample-selector-2026-05-22-r1/pac-stress-sample-selector.md`
- `Output/pac-stress-sample-selector-2026-05-22-r1/pac-stress-sample-selector.json`

Generated artifacts remain local and are not source-tracked.

## Result

Selected sample kind: `object_backed_table_parenttree_targets`.

Reasoning:

- Current parity map decision is `evidence_map_only`.
- Current lane rollup is `no_safe_high_impact_lane_ready`.
- Current validation checkpoint is `validation_not_passing`, with all-unique still below target.
- Table behavior is parked, but the outside low-row evidence still has table target-resolution pressure.
- The table target-resolution diagnostic identified useful blockers: dense row-band positives can resolve as non-table roles before mutation.

The selected sample is not behavior-ready. It is the next diagnostic sample needed to determine whether the parked table/ParentTree lane can be reopened safely.

## Sample Plan

Required positives:

- `va-15-report-on-analysis-of-traffic-stop-data-fiscal-year-2022.pdf`
- `va-17-report-on-analysis-of-traffic-stop-data-fiscal-year-2024.pdf`
- `va-11`

Known blockers / negative examples:

- `va-08`
- `va-09`
- `va-10`

Controls:

- `fixture-accessible`
- `fixture-adam2`
- `fixture-teams-original`
- `fixture-teams-remediated`
- `fixture-teams-targeted-wave1`

## Required Evidence Before Behavior

Any later behavior stage must prove all of:

- native analysis confirms requested target refs resolve to `/Table` immediately before mutation;
- PAC table/header debt is present before mutation;
- existing table tools reduce final table/PAC debt;
- dense row-band evidence is only supporting evidence, not the admission predicate;
- pre-mutation object refs are stable across at least two positives;
- controls do not schedule from layout evidence alone.

## Promotion Gates

Do not promote behavior unless:

- at least two positive rows get accepted final table/PAC debt reduction;
- zero original/control rows schedule the transaction from layout evidence alone;
- `false_positive_applied=0`;
- no new hard timeout;
- p95 runtime does not increase beyond `max(3%, 5s)`;
- fresh original-50 deterministic validation passes before acceptance.

## Non-Selected Candidates

`true_rendered_contrast_controls`

- Not selected because the current sampler still flags controls.
- Next contrast work needs visual ground truth and better foreground/background sampling.

`direct_language_parts_syntax`

- Not selected because direct document/structure `/Lang` syntax is already score-active.
- Heuristic language-of-parts remains diagnostic-only until direct object-context evidence exists.

`font_cmap_unicode_extraction`

- Not selected because the current diagnostic found CMap syntax debt with clean extracted text and zero replacement-character ratio.
- Existing replacement-character scoring remains the accepted native text-mapping lane.
