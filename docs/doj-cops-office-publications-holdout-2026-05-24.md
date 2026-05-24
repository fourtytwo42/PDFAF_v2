# DOJ COPS Office Publications Public Holdout

Date: 2026-05-24

Source: U.S. Department of Justice COPS Office Resource Center publications PDFs: `https://portal.cops.usdoj.gov/resourcecenter/RIC/Publications/`

This was a 20-PDF public holdout sample from official COPS Office publication PDFs under 10 MB. Downloaded PDFs were kept under `/mnt/pdf-review` for validation and cleaned afterward.

## Run Setup

- Sample: the first 20 reachable `COPS-P###` publication PDFs by numeric publication ID with `application/pdf` response and size under `10 MB`.
- Selected IDs: `cops-p006`, `cops-p007`, `cops-p009`, `cops-p010`, `cops-p011`, `cops-p012`, `cops-p013`, `cops-p014`, `cops-p015`, `cops-p016`, `cops-p017`, `cops-p018`, `cops-p019`, `cops-p023`, `cops-p024`, `cops-p025`, `cops-p026`, `cops-p027`, `cops-p028`, `cops-p029`.
- Size cap: all 20 selected PDFs were under `10 MB`; selected files were about `299 KB` to `5.7 MB`.
- Validation: one bounded deterministic 20-file run, low-row diagnostic, table target-resolution diagnostic, figure/alt diagnostic, and a 7-row low-score repeat.
- Runtime mode: deterministic native PDFAF only.
- Flags: `--no-semantic --no-pdfs`.
- Child remediation timeout: `300000ms`.
- External kill grace: `10000ms`.
- Temp/output root: `/mnt/pdf-review`.

## Fresh 20-Row Result

Local run before cleanup: `/mnt/pdf-review/public-holdouts/doj-cops-publications-2026-05-24/run-r1/baseline_report.json`

- Processed: `20/20`.
- Mean: `73.05 -> 91.90`.
- Median after remediation: `93`.
- Grades after remediation: `16 A / 3 B / 0 C / 1 D / 0 F`.
- Rows below 93: `7`.
- Runtime p50/p95/max: `19519ms / 43959ms / 46838ms`.
- Timeout/error rows: `0`.
- `false_positive_applied`: `0`.

## Diagnostics

The low-row diagnostic classified the source as `plan_high_impact_targeted_diagnostic`:

- Raw points needed for 93 mean: `22`.
- Recommended lane: `table_target_resolution_needed`.
- Table target-resolution rows: `3`, carrying `38` candidate raw points.
- Reading/link-order candidate rows: `2`, carrying `12` candidate raw points.
- Near-miss monitor rows: `2`, carrying `3` candidate raw points.

The focused table target-resolution diagnostic rejected behavior promotion:

- Decision: `keep_table_target_resolution_diagnostic_only`.
- Stable focus candidates: `cops-p023`, `cops-p024`, `cops-p027`.
- Unsafe same-source controls: `cops-p011`, `cops-p026`.
- Prior non-table target row: `cops-p016`.
- Main blocker: current table tools still reject on `pac_rule_regressed(pdfua.table.header_association_present)` or `pac_rule_regressed(pdfua.content.orphan_mcids_absent)`.

The figure/alt diagnostic rejected the alt lane:

- Decision: `keep_figure_alt_diagnostic_only`.
- Scoring candidates: `0`.
- Behavior candidates: `0`.
- All rows were `alt_high_or_not_focus`; checker-visible figure alt evidence was already complete where relevant.

The 7-row low-score repeat reproduced the source miss:

- `cops-p013`: `90/A`.
- `cops-p017`: `92/A`.
- `cops-p023`: `87/B`.
- `cops-p024`: `69/D`.
- `cops-p027`: `85/B`.
- `cops-p028`: `91/A`.
- `cops-p029`: `84/B`.

## Decision

No source behavior change is accepted from this source.

COPS Office publications are a useful outside-corpus miss: the source is short of 93 by `22` raw points, with stable low rows and a clear table/PAC-header debt pattern. It is not safe to promote a fix from this source because same-source controls trigger the same stable table target shape and the existing table mutations still regress PAC table-header association or orphan-MCID evidence. The result reinforces the already parked table transaction/header-preservation lane rather than supporting a broader table admission rule.

Because no source behavior changed, no original-50 regression validation was required for this source.
