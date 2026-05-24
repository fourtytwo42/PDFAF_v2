# Tennessee DOC Felon Population Reports Public Holdout

Date: 2026-05-24

Source: Tennessee Department of Correction Felon Population Reports page: `https://www.tn.gov/correction/statistics/felon-population-reports.html`

This was a 20-PDF public holdout sample from official Tennessee DOC monthly felon population reports under 10 MB. Downloaded PDFs were kept under `/mnt/pdf-review` for validation and cleaned afterward.

## Run Setup

- Sample: the newest 20 main monthly Felon Population Report PDFs listed on the source page, from `Mar2026` through `Aug2024`.
- Size cap: all 20 selected PDFs were under `10 MB`; the largest was `5800766` bytes.
- Validation: one bounded deterministic 20-file run plus focused diagnostics over the produced benchmark JSON.
- Runtime mode: deterministic native PDFAF only.
- Flags: `--no-semantic --no-pdfs`.
- Child remediation timeout: `300000ms`.
- External kill grace: `10000ms`.
- Temp/output root: `/mnt/pdf-review`.

## Fresh 20-Row Result

Local run before cleanup: `/mnt/pdf-review/public-holdouts/tennessee-doc-felon-population-2026-05-24/run-r1/baseline_report.json`

- Processed: `20/20`.
- Mean: `49.85 -> 62.60`.
- Median after remediation: `59`.
- Grades after remediation: `2 A / 0 B / 0 C / 1 D / 17 F`.
- Points needed for mean 93: `608`.
- Runtime p50/p95/max: `25590ms / 97791ms / 99559ms`.
- Timeout/error rows: `0`.
- `false_positive_applied`: `0`.

## Low-Row Diagnostic

The low-row diagnostic selected `table_target_resolution_needed`, but most of the source is a mixed zero-heading/table family.

| Candidate class | Rows | Raw points to target | Notes |
| --- | ---: | ---: | --- |
| No safe predicate | `9` | `306` | Repeated `59/F` rows with `heading_structure=0` and no object-backed repair lane visible from the run artifact alone. |
| Table target resolution needed | `8` | `262` | Rows with low table score, native table evidence, and PAC table/header debt. |
| Reading/link order candidate | `1` | `40` | `tndoc-felon-09` ended `53/F` with `reading_order=35` and `heading_structure=0`. |
| Near-miss monitor | `1` | `1` | `tndoc-felon-14` ended `92/A`. |

## Table Diagnostics

The table target-resolution diagnostic initially returned `plan_table_target_behavior_proof`:

- Stable focus candidates: `tndoc-felon-01`, `tndoc-felon-06`, `tndoc-felon-15`, `tndoc-felon-16`, `tndoc-felon-17`, `tndoc-felon-18`, `tndoc-felon-19`, and `tndoc-felon-20`.
- Unsafe control candidates: none.
- Prior non-table target rows: none.
- Classification counts: `8` stable normalize targets and `2` control/high-grade-noise rows.

That diagnostic was not enough for production behavior. A focused table sequence probe on `tndoc-felon-15` and A-grade control `tndoc-felon-07` found `0` sequence candidates and no score movement. A narrower mutation-truth probe against `tndoc-felon-15` also failed to support a safe target transaction:

- Source started `38/F` with `heading=0`, `table=0`, `pdfua=50`, `alt=0`, `144` irregular tables, `95` strongly irregular tables, and table-header debt `7862`.
- One selected `/Table` target applied a missing-header normalization, but score stayed `38/F`.
- Several subsequent planned refs resolved as `TR`, `TD`, or blank after the first mutation instead of durable `/Table` targets.
- Strongly-irregular normalization and `repair_native_table_headers` changed some internal counts, but final score and table score stayed flat.
- `set_table_header_cells` returned `no_effect`.

This keeps Tennessee in the same broader parked family: real table/header debt exists, but current table mutations do not produce a PAC-safe score-moving transaction for this subtype. The target identity and post-mutation stability are not strong enough for production promotion.

## Decision

No source behavior change is accepted from this source. The source fails the 93+ mean target with no hard errors and no false-positive applications, but the evidence does not justify a planner threshold tweak, table target fallback, scorer masking, PAC relaxation, or Tennessee-specific behavior.

Because no source behavior changed, no original-50 regression validation was required for this source.

Future work should treat this as evidence for a separate general table/heading transaction design: durable `/Table` target selection must be verified immediately before each mutation, and accepted behavior must reduce final PAC table/header debt while preserving controls and original-50 quality/speed gates.
