# Original-50 4438 Deadline/Table-Control Diagnostic

Date: 2026-05-29

## Summary

This is a diagnostic-only follow-up to `docs/original50-stabilization-diagnostic-2026-05-29.md`. It compares the current `4438` low route against accepted May 28 original-50 artifacts and runs one bounded deadline probe to determine whether `4438` is blocked by table target evidence or by runtime/checkpoint routing.

No production behavior changed.

Local artifacts:

- Low repeat r1: `/mnt/pdf-review/original50-stabilization-2026-05-29-r1/focus-repeat-r1/baseline_report.json`
- Low repeat r2: `/mnt/pdf-review/original50-stabilization-2026-05-29-r1/focus-blockers-repeat-r2/baseline_report.json`
- Deadline probe: `/mnt/pdf-review/original50-stabilization-2026-05-29-r1/4438-soft-deadline-probe-r1/baseline_report.json`
- Reference accepted route: `/mnt/pdf-review/pdfaf-validation/original50-mcr-pg-bounded-2026-05-28-r2/baseline_report.json`

All runs were deterministic Node 22 with `--no-semantic --no-pdfs`.

## Evidence

Current focused repeats:

- `4438` r1: `59/F -> 69/D`, `false_positive_applied=0`, no timeout.
- `4438` r2: `59/F -> 69/D`, `false_positive_applied=0`, no timeout.
- Final categories in both repeats include `table_markup=0`, `alt_text=50`, `pdf_ua_compliance=50`, and `reading_order=79`.
- Tool rows retained in the final report stop at the low-score checkpoint after `repair_structure_conformance`.

Accepted May 28 route:

- `4438`: `59/F -> 83/B`, `false_positive_applied=0`, no timeout.
- Final categories include `table_markup=72`, `reading_order=100`, and `pdf_ua_compliance=57`.
- The accepted route runs a fourth planner stage after the same early metadata/orphan/conformance route:
  - `normalize_annotation_tab_order`
  - `normalize_table_structure`
  - `repair_list_li_wrong_parent`
  - `repair_native_table_headers`

Deadline probe:

- Command changed only the local diagnostic environment: `PDFAF_REMEDIATION_SOFT_DEADLINE_BUFFER_MS=40000`.
- `4438`: `59/F -> 83/B`, `false_positive_applied=0`, no timeout.
- Final categories match the accepted shape: `table_markup=72`, `reading_order=100`, `pdf_ua_compliance=57`.
- The fourth planner stage ran and took about `10.6s`.

## Interpretation

The current `69/D` `4438` repeats are not caused by missing table evidence or a table mutator failure. They are caused by the verified low-score checkpoint return firing before the fourth planner stage when the default soft-deadline/risky-work reserve is just barely crossed.

The same current source can still reach the accepted `83/B` route when the fourth stage is allowed to start. The difference is runtime routing:

- low repeats: return the `69` low-score checkpoint before the table-control stage;
- accepted/probe routes: allow one more stage, then reach `83/B`.

This does not justify a global timeout/checkpoint relaxation. The behavior candidate, if pursued, should be narrow and structural:

- only for rows with a verified low-score checkpoint;
- only when the current route is at a stable low-score state with table/control debt;
- only when the next planned stage contains existing object-backed table/control cleanup tools;
- only with enough bounded wall budget for one stage and final analysis;
- no scorer/PAC relaxation, no source/file/row/hash gate, no semantic/LLM dependency.

## Decision

Keep this diagnostic-only for now.

The next implementable proof should be a small general deadline-continuation predicate around this route shape, with `4438` as the positive and nearby long/runtime controls (`4076`, `4516`, `4680`, `4683`, plus at least one original table-heavy control) as negatives. Acceptance would require:

- `4438` reaches the accepted `83/B` table-control route or better;
- controls do not gain unsafe extra work or new hard timeouts;
- `false_positive_applied=0`;
- runtime remains bounded;
- a fresh original-50 validation still meets the accepted floor before any table-heavy outside behavior is reopened.
