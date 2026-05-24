# Missouri DOC Publications Public Holdout

Date: 2026-05-24

Source: https://doc.mo.gov/media-center/publications

This is a public-source outside-corpus diagnostic run. It used 20 public Missouri Department of Corrections PDFs, each under 10MB. Downloaded PDFs were kept under `/mnt/pdf-review` for validation and cleaned afterward.

## Run Setup

- Sample: 18 Offender Profile reports, plus `Recidivism Report FY25` and `PREA Annual Report 2023`.
- Offender Profile years: `FY25`, `FY24`, `FY23`, `FY22`, `FY21`, `FY20`, `FY19`, and `FY16` through `FY06`.
- Validation: one bounded deterministic 20-file run.
- Runtime mode: deterministic native PDFAF only.
- Flags: `--no-semantic --no-pdfs`.
- Child remediation timeout: `300000ms`.
- External kill grace: `10000ms`.
- Temp/output root: `/mnt/pdf-review`.

## Fresh 20-Row Result

- Processed: `20/20`.
- Mean: `51.00 -> 86.55`.
- Median after remediation: `93`.
- Grades after remediation: `12 A / 3 B / 0 C / 3 D / 2 F`.
- Points needed for mean 93: `129`.
- Runtime p50/p95/max: `29138ms / 167122ms / 198899ms`.
- Timeout/error rows: `0`.
- `false_positive_applied`: `0`.

## Low-Row Diagnostic

The low-row diagnostic selected `table_target_resolution_needed` as the recommended high-impact lane.

| Candidate class | Rows | Raw points to target | Notes |
| --- | ---: | ---: | --- |
| Table target-resolution needed | `4` | `76` | `modoc-01`, `modoc-03`, `modoc-19`, and `modoc-05`. |
| Figure/alt object candidate | `2` | `68` | `modoc-13` and `modoc-14`. |
| No safe predicate | `2` | `14` | `modoc-15` and `modoc-16`. |
| Near-miss monitor | `2` | `2` | `modoc-11` and `modoc-12`. |

## Table Target-Resolution Diagnostic

The explicit table probe included low rows plus same-source high-grade controls.

- Decision: `keep_table_target_resolution_diagnostic_only`.
- Stable focus candidates: `modoc-01`, `modoc-03`, and `modoc-19`.
- Unsafe control candidates: `modoc-04`, `modoc-06`, and `modoc-20`.
- Prior non-table target rows: `modoc-05` and `modoc-11`.
- Repeated blocker: current table tools still reject or fail on final PAC table/header evidence, especially `pac_rule_regressed(pdfua.table.header_association_present)`.

This is not safe for behavior promotion. Stable table-like target evidence is not selective enough, and current table mutations still need a transaction that preserves final table-header ownership while normalizing table structure.

## Figure/Alt Diagnostic

- Decision: `keep_figure_alt_diagnostic_only`.
- Focus rows: `9`.
- Scoring candidates: `0`.
- Behavior candidates: `0`.
- Blocker rows: `modoc-13` and `modoc-14` had low final alt scores, but the diagnostic classified them as `figure_pac_regression_blocker`, not safe object-backed alt behavior candidates.

## Decision

No source behavior change is accepted from this source. Missouri DOC reinforces two parked general lanes:

- statistical/report table transaction work, which must preserve final PAC table/header debt and reject same-source controls;
- figure-alt PAC-regression blockers, which need object-backed behavior evidence before any planner or mutator change.

Because no source behavior changed, no original-50 regression validation was required for this source. The downloaded PDFs and generated local diagnostics remain non-source artifacts and were removed after this report.
