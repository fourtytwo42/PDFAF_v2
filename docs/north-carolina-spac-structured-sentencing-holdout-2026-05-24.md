# North Carolina SPAC Structured Sentencing Reports Public Holdout

Date: 2026-05-24

Sources:

- North Carolina Judicial Branch current structured sentencing statistical report page: `https://www.nccourts.gov/documents/publications/structured-sentencing-statistical-reports`
- North Carolina Judicial Branch previous structured sentencing statistical reports page: `https://www.nccourts.gov/documents/publications/previous-structured-sentencing-statistical-reports`

This was a 20-PDF public holdout sample from official North Carolina Sentencing and Policy Advisory Commission structured sentencing statistical report PDFs under 10 MB. Downloaded PDFs were kept under `/mnt/pdf-review` for validation and cleaned afterward.

## Run Setup

- Sample: the newest 20 full `Structured Sentencing Statistical Report for Felonies and Misdemeanors` PDFs, excluding Quick Facts.
- Report mix: FY 2024 through FY 2004/05.
- Size cap: all 20 selected PDFs were under `10 MB`; selected files were about `749 KB` to `3.82 MiB`.
- Validation: one bounded deterministic 20-file run, the standard low-row diagnostic, focused table target-resolution diagnostic, focused figure/alt diagnostic, and a PDF/UA catalog syntax diagnostic.
- Runtime mode: deterministic native PDFAF only.
- Flags: `--no-semantic --no-pdfs`.
- Child remediation timeout: `300000ms`.
- External kill grace: `10000ms`.
- Temp/output root: `/mnt/pdf-review`.

## Fresh 20-Row Result

Local run before cleanup: `/mnt/pdf-review/public-holdouts/north-carolina-spac-structured-sentencing-2026-05-24/run-r1/baseline_report.json`

- Processed: `20/20`.
- Mean: `42.45 -> 80.20`.
- Median after remediation: `69`.
- Grades after remediation: `9 A / 0 B / 0 C / 9 D / 2 F`.
- Rows below 93: `11`.
- Runtime p50/p95/max: `161148ms / 242604ms / 290037ms`.
- Timeout/error rows: `0`.
- `false_positive_applied`: `0`.

The low rows were `ncspacss-01.pdf`, `ncspacss-02.pdf`, `ncspacss-03.pdf`, `ncspacss-04.pdf`, `ncspacss-05.pdf`, `ncspacss-06.pdf`, `ncspacss-07.pdf`, `ncspacss-08.pdf`, `ncspacss-12.pdf`, `ncspacss-13.pdf`, and `ncspacss-16.pdf`.

## Low-Row Diagnostic

The low-row diagnostic classified the source as `plan_high_impact_targeted_diagnostic` with recommended lane `table_target_resolution_needed`.

- Raw points needed for a mean of 93: `256`.
- Table target-resolution rows: `8`, carrying `192` raw points.
- Reading/link-order row: `ncspacss-07.pdf`, carrying `39` raw points.
- Figure/alt row: `ncspacss-01.pdf`, carrying `35` raw points.
- Metadata/PDF-UA row: `ncspacss-03.pdf`, carrying `24` raw points.

Table is the largest lane, but table movement alone cannot close this source.

## Table Target Diagnostic

Focused table target-resolution diagnostic returned `plan_table_target_behavior_proof`.

- Stable focus candidates: `ncspacss-02`, `ncspacss-04`, `ncspacss-05`, and `ncspacss-06`.
- Unsafe control candidates: `0`.
- Prior non-table target rows: `ncspacss-08`, `ncspacss-12`, `ncspacss-13`, and `ncspacss-16`.
- Classification counts: `4` stable normalize targets, `4` non-table target attempts, and `9` control/high-grade noise rows.

This is better target-resolution evidence than the BJS and Texas table misses because same-source A-grade controls did not trigger. It is still not enough for production behavior. Existing benchmark attempts on the stable rows mostly rejected table tools on `pdfua.table.header_association_present`, and a focused sequence probe over `ncspacss-02`, `ncspacss-04`, and A-grade control `ncspacss-09` was stopped after about ten minutes without completing the first row. That makes the behavior proof too costly and unproven for this pass.

Do not broaden table admission, relax PAC table guards, or add target fallback from target-resolution evidence alone.

## Figure/Alt Diagnostic

Focused figure/alt diagnostic returned `keep_figure_alt_diagnostic_only`.

- Behavior candidates: `0`.
- Scoring-calibration candidates: `0`.
- `ncspacss-01.pdf` was classified as `checker_alt_partial_existing_bound`: three applied `set_figure_alt_text` attempts reached only `4/25` replay checker-visible alt coverage, so final `alt_text` remained capped at `20`.

This does not justify broader figure-alt writes or scoring calibration.

## Other Residuals

`ncspacss-07.pdf` is a reading/link-order candidate with `heading_structure=0`, `reading_order=30`, and existing reading/link/page-furniture attempts that did not improve score. The run artifact does not expose a clean native discriminator.

`ncspacss-03.pdf` is a metadata/PDF-UA candidate in the low-row diagnostic, but a two-row PDF/UA catalog syntax diagnostic returned `keep_pdfua_catalog_syntax_diagnostic_only`. Its structure/RoleMap debt is already visible as scoring evidence and does not justify a catalog behavior change.

## Decision

No source behavior change is accepted from this source. NC structured sentencing reports are a hard, useful outside holdout with no hard timeouts and no false-positive applications, but the score-moving lanes are not proven safe enough to promote:

- Table target-resolution has clean positives and controls, but no bounded score-moving transaction proof.
- Four table lows already show prior non-table target attempts.
- Figure/alt evidence is bounded by low checker-visible coverage.
- Reading/link and metadata residuals do not expose clean general predicates from the current artifacts.

Do not add North Carolina/source/year/PDF-specific gates, scorer masking, PAC relaxation, broader table admission, heading creation from raw layout, or figure-alt broadening from this evidence. A future safe table stage would need a faster, object-backed transaction proof that verifies durable `/Table` targets immediately before mutation and reduces final PAC table/header debt on at least two positives while preserving controls and original-50 quality/speed gates.

Because no source behavior changed, no original-50 regression validation was required for this source.
