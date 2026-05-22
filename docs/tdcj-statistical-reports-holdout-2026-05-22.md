# TDCJ Statistical Reports Holdout

Date: 2026-05-22

## Scope

This was a public outside-corpus check against Texas Department of Criminal Justice statistical reports. The source is the official TDCJ statistical reports page:

https://tdcj.texas.gov/publications/statistical_reports.html

The sampled set contained the 20 newest downloadable PDF statistical reports from FY2025 through FY2006. All sampled PDFs were under 10 MB. The PDFs and generated benchmark artifacts were kept local under `/mnt/pdf-review` during the diagnostic and are not source assets.

## Run

The diagnostic run used four five-file bounded shards with Node 22, deterministic native remediation only, no semantic work, no remediated PDFs, `300000ms` per-PDF child timeout, and `10000ms` external grace.

## Summary

- PDFs processed: 20/20
- Mean: 61.95 -> 83.05
- Median after: 92
- Final grades: 11 A, 1 B, 1 C, 6 D, 1 F
- Raw points needed for mean 93: 199
- Timeouts/errors: 0
- `false_positive_applied`: 0
- Runtime p50/p95/max: 68.594s / 228.060s / 247.793s

This source set does not clear the current outside-source quality gate. It is another hard statistical-report family with large table/header debt and a long runtime tail.

## Low-Row Shape

Ten rows were below 93:

- Seven rows were classified as `table_target_resolution_needed`, carrying 165 of the 199 raw points needed for mean 93.
- One row, `17-statistical_report_fy2009.pdf`, remained a 59/F zero-heading row with no safe lane visible from the run artifact.
- Two rows were low-priority reading/link-order candidates, worth 9 raw points total.

The dominant score blocker is table markup and PAC-style table/header association debt, not figure alt text.

## Table Diagnostic

A focused table target-resolution diagnostic checked the table-focus rows, same-source high-grade controls, and original controls.

Results:

- Stable focus candidates: `tdcj-01`, `tdcj-02`, `tdcj-03`, `tdcj-05`, `tdcj-06`, and `tdcj-07`.
- Unsafe same-source control candidates: `tdcj-08`, `tdcj-09`, `tdcj-10`, and `tdcj-11`.
- `tdcj-16` showed a prior non-table target attempt.
- Classification counts: 10 `stable_normalize_target`, 10 `control_or_high_grade_noise`, 1 `layout_only_no_table_target`, and 1 `non_table_target_attempt`.

Decision: `keep_table_target_resolution_diagnostic_only`.

Stable object-backed table targets are real, but they are not selective enough. Some reports that finish as A-grade in the bounded remediation run still show the same native table-target shape when analyzed from source. Prior tools also show `pac_rule_regressed(pdfua.table.header_association_present)` on this family, so table normalization cannot be promoted without proving final PAC table/header debt is reduced or preserved.

## Figure/Alt Diagnostic

A focused figure/alt no-gain diagnostic stayed diagnostic-only:

- Focus rows: 3
- Behavior candidates: 0
- Scoring candidates: 0
- `false_positive_applied`: 0

The apparent alt debt on `16-statistical_report_fy2010.pdf` did not expose a safe figure-alt behavior lane. Other rows with figure evidence already had checker-visible coverage or PAC figure guards.

## Decision

Decision: `diagnostic_only_table_lane_parked`.

No source behavior change is accepted from this source set. Original-50 validation was not rerun because no scoring, planner, mutator, API, or Docker behavior changed.

## Parked Lane

TDCJ strengthens the same table-family blocker seen in BJS, CDCR, and parts of OJJDP:

- native table targets are abundant,
- statistical-report table debt is high-impact,
- but target existence alone is too broad,
- and PAC table/header association regressions are the acceptance blocker.

The next acceptable table change needs a stricter general transaction proof: at least two positive rows improve while final PAC table/header debt is reduced or preserved, same-source controls remain stable, original controls stay stable, `false_positive_applied=0`, and original-50 quality/speed validation passes.
