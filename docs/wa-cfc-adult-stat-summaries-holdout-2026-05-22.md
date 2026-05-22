# WA CFC Adult Statistical Summaries Public Holdout

Date: 2026-05-22

Source: https://cfc.wa.gov/publications

This is a public-source outside-corpus diagnostic run. It used 20 unique Adult Statistical Summary PDFs from the Washington State Caseload Forecast Council publications page, each under 10MB. Downloaded PDFs were kept under `/mnt/pdf-review` for validation and cleaned afterward.

## Run Setup

- Sample: `Adult_Stat_Sum_FY2025.pdf` through `Adult_Stat_Sum_FY2006.pdf`.
- Validation: four bounded five-file shards, merged after completion.
- Runtime mode: deterministic native PDFAF only.
- Flags: `--no-semantic --no-pdfs`.
- Child remediation timeout: `300000ms`.
- External kill grace: `10000ms`.
- Temp/output root: `/mnt/pdf-review`.

## Fresh 20-Row Result

- Processed: `20/20`.
- Mean: `36.20 -> 90.40`.
- Median after remediation: `93`.
- Grades after remediation: `17 A / 2 B / 0 C / 0 D / 1 F`.
- Points needed for mean 93: `52`.
- Runtime p50/p95/max: `27245ms / 86068ms / 91872ms`.
- Timeout/error rows: `0`.
- `false_positive_applied`: `0`.

## Low-Row Diagnostic

The low-row diagnostic selected `table_target_resolution_needed`, but the follow-up table probe did not support behavior promotion.

| Row | Fresh Score | Class | Notes |
| --- | ---: | --- | --- |
| `wacfc-05-Adult_Stat_Sum_FY2021.pdf` | `59/F` | `no_safe_predicate` | Stable repeat also returned `59/F`. Residual debt includes heading, table, link, and PDF/UA. Prior table-header target resolution included a non-table `/Link` target. |
| `wacfc-03-Adult_Stat_Sum_FY2023.pdf` | `82/B` | `table_target_resolution_needed` | Stable object-backed table targets exist, but current table tools were rejected by PAC orphan-MCID regressions. |
| `wacfc-12-Adult_Stat_Sum_FY2014.pdf` | `86/B` | `no_safe_predicate` | Prior table-header target resolution included a non-table `/URI` target. |
| `wacfc-01`, `wacfc-02`, `wacfc-08`, `wacfc-09` | `91-92/A` | `near_miss_monitor` | Near misses only; not behavior targets. |

## Table Target-Resolution Diagnostic

An explicit table probe was run for the low rows with same-source controls plus `pdfaf_fixture_accessible`.

- Decision: `keep_table_target_resolution_diagnostic_only`.
- Stable focus candidates: `wacfc-03`.
- Prior non-table target rows: `wacfc-05`, `wacfc-12`.
- Unsafe control candidates: none.
- `wacfc-03` had multiple stable normalize targets and one selected association target, but prior table tools were rejected on `pac_rule_regressed(pdfua.content.orphan_mcids_absent)`.
- Same-source controls had substantial layout table evidence but no PAC/table score debt, reinforcing that dense table-like layout alone is not a safe admission predicate.

## Figure/Alt Diagnostic

- Decision: `no_figure_alt_focus_rows`.

## Decision

No source behavior change is accepted from this source. The run reinforces the same general table lane seen in other public report sets, but it also confirms the current blocker: table repair must preserve final PAC content/header evidence, and target resolution must avoid non-table `/Link` or `/URI` objects before any behavior promotion.

Because no source behavior changed, no original-50 regression validation was required for this source. The downloaded PDFs and generated local diagnostics remain non-source artifacts and were removed after this report.
