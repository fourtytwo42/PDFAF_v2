# BJS Latest Publications Holdout

Date: 2026-05-22

## Scope

This was a public outside-corpus check against recent Bureau of Justice Statistics reports. The source is an official public DOJ/BJS publication list:

https://bjs.ojp.gov/library/publications/list

The sampled set contained 20 public BJS PDF reports, all under 10 MB. The PDFs and generated benchmark artifacts were kept local under `/mnt/pdf-review` during the diagnostic and are not source assets.

## Run

The first unbounded sequential run was stopped because one row held the batch too long. The accepted diagnostic run used four five-file bounded shards with Node 22, deterministic native remediation only, no semantic work, no remediated PDFs, `300000ms` per-PDF child timeout, and `10000ms` external grace.

## Summary

- PDFs processed: 20/20
- Mean: 73.45 -> 77.35
- Median after: 69
- Final grades: 7 A, 0 B, 0 C, 12 D, 1 F
- Timeouts/errors: 0
- `false_positive_applied`: 0
- Runtime p50/p95/max: 70.184s / 206.463s / 258.483s

This source is a real outside-corpus weakness for current PDFAF. The main failure is not text extraction, title/language, or heading recovery. It is table/header-association debt on large statistical reports.

## Low-Row Shape

The low-row diagnostic selected `table_target_resolution_needed` as the high-impact lane:

- 13 rows below 93 were table-target cases.
- Those rows accounted for 290 of the 313 raw points needed to reach a 93 mean.
- 19 of 20 rows had `table_markup < 80`.
- All rows had `pdf_ua_compliance < 80`, mostly because table/header debt remains checker-visible.

The lone F row, the NIBRS methodology report, ended at 59/F with `alt_text=0`, but the figure/alt diagnostic classified it as `figure_pac_regression_blocker`, not a safe target-discovery candidate.

## Table Diagnostics

The table target-resolution diagnostic found stable object-backed table targets on all 12 high-priority BJS D-row table cases. Original controls stayed out of the table predicate:

- `pdfaf_fixture_accessible`
- `ADAM2`
- three Teams fixture variants

The important blocker is mutation truth, not target discovery. Existing table tools were already attempted on the BJS D rows, but they were rejected or no-effect because PAC table-header association counts regressed after structural normalization.

A focused table sequence probe tested existing table/header cleanup sequences on representative rows:

- `01-federal-law-enforcement-officers-2023-statistical-tables`
- `04-probation-and-parole-in-the-united-states-2024`
- `10-federal-prisoner-statistics-collected-under-the-first-step-act-2025`
- `03-victimization-at-and-away-from-school-among-students-ages-12-to-18-2013-2023-statistical-tables`

Result: 0 safe sequence candidates. Two rows could be pushed to 93/A by repeated normalization, but PAC table-header association debt increased, so that movement is not acceptable under the current PAC-alignment goal.

## Decision

Decision: `diagnostic_only_no_safe_bjs_fix`.

No source behavior change is accepted from this source set. The BJS reports expose a valuable generalization gap, but the current evidence does not support broadening table normalization or header repair because the available score movement increases PAC table-header association debt.

## Parked Lane

The likely future lane is a high-volume statistical-table transaction, but it needs a stricter proof than this pass produced:

- reduce strongly irregular row evidence,
- reduce or preserve PAC table-header association counts,
- stay off original controls,
- improve at least two BJS low rows,
- avoid p95/runtime regression on original 50,
- preserve `false_positive_applied=0`.

Until that proof exists, BJS table behavior should remain diagnostic-only.
