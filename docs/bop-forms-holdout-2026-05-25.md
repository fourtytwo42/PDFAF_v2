# BOP Forms Holdout - 2026-05-25

## Summary

This was a public outside-corpus holdout using Federal Bureau of Prisons form PDFs. The run was diagnostic-only: no scoring, planner, remediation, PAC gate, Docker, or API behavior changed.

- Source page: `https://www.bop.gov/PublicInfo/execute/forms?todo=query`
- Sample: first 20 active direct BOP form PDFs from the forms listing, all under 10MB
- Validation mode: deterministic bounded holdout, `--no-semantic --no-pdfs`
- Local run artifact: `/mnt/pdf-review/public-holdouts/bop-forms-2026-05-25/run-r1/baseline_report.json`

## Results

- PDFs processed: `20/20`
- Mean: `47.80 -> 90.40`
- Median: `51 -> 93`
- Minimum final score: `59`
- Grades after remediation: `16 A / 3 B / 0 C / 0 D / 1 F`
- Rows below `93`: `9`
- Runtime p50/p95/max: `13281ms / 21615ms / 28449ms`
- Timeout/error rows: `0`
- `false_positive_applied`: `0`

Low rows:

| File | Form | Title | Score | Class |
| --- | --- | --- | ---: | --- |
| `bopform-20.pdf` | `BP-A0612` | Application for Appointment as a Mid-Level Practitioner (MLP) | `59/F` | `no_safe_predicate` |
| `bopform-02.pdf` | `BP-A0618` | A&O Dental Examination | `86/B` | `table_target_resolution_needed` |
| `bopform-04.pdf` | `BP-A0296` | Acknowledgement of Oath | `86/B` | `no_safe_predicate` |
| `bopform-18.pdf` | `BP-A0596` | Applicant Notification - Requirement to Maintain Telephone | `89/B` | `near_miss_monitor` |
| `bopform-09.pdf` | `BP-A0708` | Addiction Research Foundation Clinical Institute Withdrawal Assessment - Alcohol | `90/A` | `no_safe_predicate` |
| `bopform-15.pdf` | `BP-A0803` | Algorithm for Treatment of Hepatitis C/Approval Form | `90/A` | `near_miss_monitor` |
| `bopform-01.pdf` | `BP-A0129` | 39 & 40 Reimbursement / Receivable Transactions | `92/A` | `no_safe_predicate` |
| `bopform-03.pdf` | `BP-A0515` | Abandoned Inmate Property | `92/A` | `no_safe_predicate` |
| `bopform-06.pdf` | `BP-A0407` | Acknowledgment of Inmate, Part 1 and 2 | `92/A` | `near_miss_monitor` |

## Diagnostics

Low-row diagnostic:

- Local artifact: `/mnt/pdf-review/public-holdouts/bop-forms-2026-05-25/low-row-diagnostic-r1/outside-holdout-low-row-diagnostic.md`
- Decision: `no_safe_low_row_lane`
- Recommended lane: `table_target_resolution_needed`
- Raw points needed for mean `93`: `52`
- Lane split:
  - `no_safe_predicate`: `5` rows, `46` raw points
  - `near_miss_monitor`: `3` rows, `8` raw points
  - `table_target_resolution_needed`: `1` row, `7` raw points

Annotation/form diagnostic:

- Local artifact: `/mnt/pdf-review/public-holdouts/bop-forms-2026-05-25/annotation-form-r1/annotation-form-parity.md`
- Decision: `plan_annotation_form_behavior_stage`
- Behavior focus rows: `6`
- Behavior control rows: `0`
- Candidate class on all six focus rows: `form_tooltip_repair_candidate`

This confirms real form-tooltip debt in the low BOP forms, but it did not justify a new behavior change in this stage. The baseline remediation already scheduled `fill_form_field_tooltips` on the main low rows, including `bopform-20`, `bopform-02`, and `bopform-04`, and the tool did not create enough final score movement. A future behavior stage would need a final-PDF transaction proof rather than broader admission of a tool that already fires.

Reading-order shell diagnostic:

- Local artifact: `/mnt/pdf-review/public-holdouts/bop-forms-2026-05-25/reading-order-shell-r1/reading-order-shell-diagnostic.md`
- Sequence candidates needing proposal cleanup: `0`
- Safe route controls: `0`
- Recovered routes with final orphan debt: `0`
- Selected rows: none

Table target-resolution diagnostic:

- Local artifact: `/mnt/pdf-review/public-holdouts/bop-forms-2026-05-25/table-target-resolution-r1/table-target-resolution-diagnostic.md`
- Decision: `keep_table_target_resolution_diagnostic_only`
- Stable focus candidates: `bopform-02`
- Unsafe control candidates: none
- Prior non-table target rows: none

The table diagnostic found one clean focus row and no unsafe controls in this small set, but a single table row is not enough to promote a general behavior rule. Existing table tools were already available in the run, and the remaining debt needs a separate object-backed table transaction proof before source behavior should change.

## Decision

No engine change was accepted from this holdout set.

Reasons:

- The holdout missed mean `93` by `52` raw points, but the available diagnostic evidence did not identify a safe, general, score-moving source change.
- Form-tooltip debt is real, but the existing form tooltip tool already fires on the main low rows and does not resolve the final score debt.
- Reading-order shell diagnostics found no native shell path.
- Table evidence was clean on `bopform-02`, but only one focus row was present and existing table tooling already had a chance to act.
- `false_positive_applied` stayed `0`, and there were no hard timeouts or errors.

No original-50 validation was required because no source behavior changed. Downloaded PDFs and generated validation artifacts were kept local only for metrics extraction and were deleted after this diagnostic set was documented.
