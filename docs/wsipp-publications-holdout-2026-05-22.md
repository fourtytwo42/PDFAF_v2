# WSIPP Publications Holdout

Date: 2026-05-22

## Scope

This was a public outside-corpus check against Washington State Institute for Public Policy publications. The source is the official WSIPP publications page:

https://www.wsipp.wa.gov/Publications

The sampled set contained the first 20 unique downloadable PDF report files from the current publications page, all under 10 MB. The PDFs and generated benchmark artifacts were kept local under `/mnt/pdf-review` during the diagnostic and are not source assets.

## Run

The diagnostic run used four five-file bounded shards with Node 22, deterministic native remediation only, no semantic work, no remediated PDFs, `300000ms` per-PDF child timeout, and `10000ms` external grace.

## Summary

- PDFs processed: 20/20
- Mean: 71.35 -> 89.55
- Median after: 94
- Final grades: 15 A, 0 B, 2 C, 3 D, 0 F
- Raw points needed for mean 93: 69
- Timeouts/errors: 0
- `false_positive_applied`: 0
- Runtime p50/p95/max: 17.036s / 189.891s / 207.652s

This source set does not clear the current outside-source quality gate, but it is close. The lower rows are mostly full reports; executive summaries and appendices generally pass.

## Low-Row Shape

Eight rows were below 93:

- Five table-target rows carried 100 raw points of possible lift.
- Three near misses carried only 4 raw points.
- There were no timeouts or mutation-truth failures.

The dominant blocker is again table structure/header association debt in full reports. Figure/alt was not a safe lane: the figure/alt no-gain diagnostic found `0` behavior candidates and `0` scoring candidates.

## Table Diagnostic

A focused table target-resolution diagnostic checked table-focus rows, same-source controls, and original controls.

Results:

- Stable focus candidates: `wsipp-01`, `wsipp-03`, `wsipp-09`, `wsipp-11`, `wsipp-16`, `wsipp-18`, and `wsipp-20`.
- Unsafe same-source control candidates: `wsipp-05` and `wsipp-07`.
- Classification counts: 8 `stable_normalize_target`, 1 `stable_header_assoc_target`, and 8 `control_or_high_grade_noise`.
- Original controls did not promote into a behavior-ready lane, but same-source control overlap means target existence remains too broad.

Decision: `keep_table_target_resolution_diagnostic_only`.

This is consistent with BJS, CDCR, and TDCJ: stable object-backed table targets are real and high-impact, but not sufficient for production behavior because current normalization can increase PAC table-header association debt.

## Decision

Decision: `diagnostic_only_table_lane_parked`.

No source behavior change is accepted from this source set. Original-50 validation was not rerun because no scoring, planner, mutator, API, or Docker behavior changed.

## Parked Lane

WSIPP adds another official-source confirmation that the best remaining outside-corpus lane is statistical/full-report table remediation. The next accepted table change must improve mutation truth, not just admission:

- preserve existing header ownership while normalizing rows,
- reduce or preserve final PAC table/header debt,
- stay off same-source high-grade controls,
- preserve `false_positive_applied=0`,
- and pass original-50 quality/speed validation before acceptance.
