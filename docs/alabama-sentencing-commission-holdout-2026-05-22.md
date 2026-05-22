# Alabama Sentencing Commission Public Holdout

Date: 2026-05-22

Source: https://sentencingcommission.alacourt.gov/publications/

This is a public-source outside-corpus diagnostic run. It used 20 unique PDF publications from the Alabama Sentencing Commission publications page, each under 10MB, downloaded to `/mnt/pdf-review` for the run and cleaned afterward.

## Run Setup

- Sample: 20 PDFs, current publications-page order from 2026 through 2012.
- Validation: four bounded five-file shards, merged after completion.
- Runtime mode: deterministic native PDFAF only.
- Flags: `--no-semantic --no-pdfs`.
- Child remediation timeout: `300000ms`.
- External kill grace: `10000ms`.
- Temp/output root: `/mnt/pdf-review`.

## Aggregate Result

- Processed: `20/20`.
- Mean: `32.20 -> 90.70`.
- Median after remediation: `93`.
- Grades after remediation: `18 A / 0 B / 0 C / 0 D / 2 F`.
- Points needed for mean 93: `46`.
- Runtime p50/p95/max: `21068ms / 28395ms / 167657ms`.
- Timeout/error rows: `0`.
- `false_positive_applied`: `0`.

## Low-Row Diagnostic

The low-row diagnostic selected `table_target_resolution_needed` as the recommended lane, but the evidence did not support a safe source change.

| Row | Score | Class | Notes |
| --- | ---: | --- | --- |
| `alasc-09-2019-presumptive-manual.pdf` | `59/F` | `table_target_resolution_needed` | Stable object-backed normalize targets exist, but current table mutation evidence still does not prove final PAC table/header debt is reduced or preserved well enough for behavior promotion. |
| `alasc-11-2018-annual-report.pdf` | `59/F` | `no_safe_predicate` | Heading/reading residual. Existing heading mutation produced root-reachable debug evidence, but final exported heading detection stayed at zero; this matches the parked hidden-heading/analysis-parity shape rather than a safe new fixer. |
| `alasc-05-2023-annual-report.pdf` | `92/A` | `near_miss_monitor` | Only one point below the target mean threshold; not a behavior target. |

## Table Target-Resolution Diagnostic

An explicit table probe was run for `alasc-09` and `alasc-11` with same-source controls plus `pdfaf_fixture_accessible`.

- Decision: `keep_table_target_resolution_diagnostic_only`.
- Stable focus candidates: `alasc-09`.
- Unsafe control candidates: none.
- `alasc-09` has six stable normalize targets and prior table tools, but later attempts still show PAC/table-header fragility such as `pac_rule_regressed(pdfua.table.headers_present)`.
- `alasc-11` has table/header debt but no safe selected normalize or header-association target.
- Same-source high-grade controls show substantial layout table evidence, reinforcing that layout/table density alone is not a safe admission predicate.

## Figure/Alt Diagnostic

- Decision: `keep_figure_alt_diagnostic_only`.
- Focus rows: `1`.
- Scoring candidates: `0`.
- Behavior candidates: `0`.
- The only figure/alt focus row already had high final alt evidence.

## Decision

No source behavior change is accepted from this source. The run is valuable as another independent confirmation of two parked families:

- report/manual table normalization needs a stronger transaction that preserves or reduces final PAC table/header debt, not merely stable table refs;
- hidden/root-reachable heading evidence needs an analyzer/scorer parity design before it can become accepted behavior.

Because no source behavior changed, no original-50 regression validation was required for this source. The downloaded PDFs and generated local diagnostics remain non-source artifacts and were removed after this report.
