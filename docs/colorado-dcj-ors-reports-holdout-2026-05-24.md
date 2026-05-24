# Colorado DCJ ORS Reports Public Holdout

Date: 2026-05-24

Source: Colorado Division of Criminal Justice Office of Research and Statistics reports page: `https://dcj.colorado.gov/dcj-offices/ors/doc-rpt`

This was a 20-PDF public holdout sample from official Colorado DCJ ORS report PDFs under 10 MiB. Downloaded PDFs were kept under `/mnt/pdf-review` for validation and cleaned afterward.

## Run Setup

- Sample: first 20 unique report PDFs from the Colorado DCJ ORS reports page with successful PDF download and size under `10 MiB`.
- One larger first candidate, `2025_SB13-283-MJRpt.pdf`, was skipped because it was about `17.3 MiB`.
- Selected IDs: `codcj-01` through `codcj-20`.
- Size cap: all 20 selected PDFs were under `10 MiB`; selected files were about `222 KB` to `4.1 MB`.
- Validation: one bounded deterministic 20-file run, low-row diagnostic, table target-resolution diagnostic, and a 4-row repeat over the timeout/D rows.
- Runtime mode: deterministic native PDFAF only.
- Flags: `--no-semantic --no-pdfs`.
- Child remediation timeout: `300000ms`.
- External kill grace: `10000ms`.
- Temp/output root: `/mnt/pdf-review`.

## Fresh 20-Row Result

Local run before cleanup: `/mnt/pdf-review/public-holdouts/colorado-dcj-ors-reports-2026-05-24/run-r1/baseline_report.json`

- Processed: `20`.
- Completed: `18/20`.
- Completed-row mean: `92.6111`.
- All-row mean: `83.35`.
- Grades after remediation: `16 A / 0 B / 0 C / 2 D / 0 F / 2 timeout`.
- Rows below 93 or timeout/error: `5`.
- Runtime p50/p95/max: `62317ms / 300042ms / 300045ms`.
- Timeout/error rows: `2`.
- `false_positive_applied`: `0`.

## Diagnostics

The low-row diagnostic classified the source as `plan_high_impact_targeted_diagnostic`:

- Raw points needed for 93 mean: `193`.
- Recommended lane: `table_target_resolution_needed`.
- Timeout/error rows: `2`, carrying `186` points to target.
- Table target-resolution rows: `2`, carrying `48` points to target.
- Near-miss monitor rows: `1`, carrying `1` point.

The low rows were:

- `codcj-01`: `0/?`, repeated hard timeout at `300000ms`.
- `codcj-07`: `0/?`, repeated hard timeout at `300000ms`.
- `codcj-14`: `69/D`, repeated at `69/D`.
- `codcj-20`: `69/D`, repeated at `69/D`.
- `codcj-12`: `92/A`, near miss.

The focused table target-resolution diagnostic rejected behavior promotion:

- Decision: `keep_table_target_resolution_diagnostic_only`.
- Stable focus candidates: none.
- Unsafe control candidates: `codcj-10`.
- Prior non-table target rows: `codcj-14`, `codcj-20`.
- Focus-row blocker: prior `set_table_header_cells` attempts resolved to non-table roles (`TD` and `LBody`) rather than a safe table target.

The 4-row repeat reproduced the source miss:

- `codcj-01`: `0/?`, `per_pdf_timeout_300000ms`.
- `codcj-07`: `0/?`, `per_pdf_timeout_300000ms`.
- `codcj-14`: `69/D`.
- `codcj-20`: `69/D`.
- `false_positive_applied`: `0`.

## Decision

No source behavior change is accepted from this source.

Colorado DCJ ORS reports expose real, repeatable debt, but not a safe immediate general fix. The largest source-level deficit is runtime/analyzer timeout debt on two report rows. The table rows are stable lows, but current table target identity is unsafe: focus rows show non-table target attempts, and a same-source control also presents stable table-header association target evidence. Do not add Colorado/source/PDF-specific behavior, target fallback, PAC table-header relaxations, scorer masking, or broad table admission from this evidence.

Because no source behavior changed, no original-50 regression validation was required for this source.
