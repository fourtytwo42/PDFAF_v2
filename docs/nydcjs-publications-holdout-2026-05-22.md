# NY DCJS Publications Holdout

Date: 2026-05-22

## Scope

This was a public outside-corpus check against New York State Division of Criminal Justice Services publications. The source is the official NY DCJS annual reports and publications page:

https://www.criminaljustice.ny.gov/crimnet/pubs.htm

The sampled set contained the first 20 downloadable PDF publications from that page that were under 10 MB. The PDFs and generated benchmark artifacts were kept local under `/mnt/pdf-review` during the diagnostic and are not source assets.

## Run

The diagnostic run used four five-file bounded shards with Node 22, deterministic native remediation only, no semantic work, no remediated PDFs, `300000ms` per-PDF child timeout, and `10000ms` external grace.

## Summary

- PDFs processed: 20/20
- Mean: 44.65 -> 94.30
- Median after: 95.5
- Final grades: 19 A, 0 B, 0 C, 1 D, 0 F
- Raw points needed for mean 93: 0
- Timeouts/errors: 0
- `false_positive_applied`: 0
- Runtime p50/p95/max: 28.320s / 51.601s / 123.223s

This source set clears the current outside-source quality gate without a new fix. It is also much faster than the recent BJS, OJJDP, and NIJ samples.

## Low-Row Shape

The low-row diagnostic returned `holdout_target_met`. Only two rows were below 93:

- `07-annotated-report-user-guide.pdf`: 69/D, with `table_markup=0` and `pdf_ua_compliance=57`.
- `20-2024-annual-report.pdf`: 92/A, a one-point near miss with mixed heading/table/PDF-UA debt.

The main residual opportunity is table shape/header debt, not headings, alt text, text extraction, or runtime.

## Table Diagnostic

A focused table target-resolution diagnostic checked the D row, the near-miss row, and original controls:

- `nydcjs-07` classified as `stable_normalize_target`.
- It had stable object-backed table targets and real table/PAC debt.
- Controls did not produce unsafe promotion candidates.
- The decision still stayed `keep_table_target_resolution_diagnostic_only`.

The reason is gate discipline. There is only one focus candidate, the source set already clears 93 mean/median, and recent BJS/OJJDP table probes showed that repeated table normalization can raise scores while increasing PAC table-header association debt. A one-row table opportunity is not enough to justify broadening production behavior or running original-50 acceptance.

## Decision

Decision: `diagnostic_only_source_target_met`.

No source behavior change is accepted from this source set. Original-50 validation was not rerun because no scoring, planner, mutator, API, or Docker behavior changed.

## Parked Lane

The parked table lane remains the same as after BJS:

- require at least two outside positive rows with the same structural table predicate,
- prove final PAC table/header debt is reduced or preserved,
- keep original controls stable,
- preserve `false_positive_applied=0`,
- and avoid original-50 quality or speed regression.

NY DCJS is useful as a positive generalization control: the current engine can reach a 94+ mean on a new public criminal-justice publication set without source-specific logic.
