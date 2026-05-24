# Illinois SPAC Publications Public Holdout

Date: 2026-05-24

Source: Illinois Sentencing Policy Advisory Council publications catalog: `https://spac.illinois.gov/publications/`

This was a 20-PDF public holdout sample from official Illinois SPAC publications under 10 MB. Downloaded PDFs were kept under `/mnt/pdf-review` for validation and cleaned afterward.

## Run Setup

- Sample: the first 20 PDF publications in the SPAC catalog sorted by year descending.
- Report mix: 2026 and 2025 fiscal impact analyses, public-act summaries, SPAC 101 reports, and methodology reports.
- Size cap: all 20 selected PDFs were under `10 MB`; selected files were about `82 KB` to `2.1 MB`.
- Validation: one bounded deterministic 20-file run, low-row diagnostic, and focused table target-resolution diagnostic.
- Runtime mode: deterministic native PDFAF only.
- Flags: `--no-semantic --no-pdfs`.
- Child remediation timeout: `300000ms`.
- External kill grace: `10000ms`.
- Temp/output root: `/mnt/pdf-review`.

## Fresh 20-Row Result

Local run before cleanup: `/mnt/pdf-review/public-holdouts/illinois-spac-publications-2026-05-24/run-r1/baseline_report.json`

- Processed: `20/20`.
- Mean: `61.60 -> 93.05`.
- Median after remediation: `93`.
- Grades after remediation: `18 A / 2 B / 0 C / 0 D / 0 F`.
- Rows below 93: `7`.
- Runtime p50/p95/max: `15884ms / 35049ms / 61095ms`.
- Timeout/error rows: `0`.
- `false_positive_applied`: `0`.

## Diagnostics

The low-row diagnostic classified the source as `holdout_target_met`, with a residual table target-resolution lane:

- Raw points needed for 93 mean: `0`.
- Table target-resolution rows: `1`.
- Near-miss monitor rows: `6`.
- Table candidate raw points to 93 on residual rows: `13`.

The focused table target-resolution diagnostic rejected behavior promotion:

- Decision: `keep_table_target_resolution_diagnostic_only`.
- Stable focus candidate: `spac-16`.
- Unsafe same-source controls: `spac-07`, `spac-08`.
- Prior non-table target rows: `0`.
- Main blocker: prior table tools on the focus row still rejected on `pac_rule_regressed(pdfua.table.header_association_present)`.

## Decision

No source behavior change is accepted from this source.

Illinois SPAC publications narrowly pass the 93+ source target with no hard errors and no false-positive applications. The residual low rows reinforce the parked table target/transaction lane: stable object-backed table targets alone are not sufficient because same-source controls also trigger and current table mutations can regress PAC table-header association.

Because no source behavior changed, no original-50 regression validation was required for this source.
