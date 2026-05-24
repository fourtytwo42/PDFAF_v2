# BJS Corrections Statistical Publications Public Holdout

Date: 2026-05-24

Sources:

- Bureau of Justice Statistics corrections topic page: `https://bjs.ojp.gov/topics/corrections/correctional-institutions`
- Official BJS/OJP publication hosts: `https://bjs.ojp.gov/content/pub/pdf/`, `https://bjs.ojp.gov/document/`, and `https://bjs.ojp.gov/redirect-legacy/content/pub/pdf/`

This was a 20-PDF public holdout sample from official Bureau of Justice Statistics corrections statistical publication PDFs under 10 MB. Downloaded PDFs were kept under `/mnt/pdf-review` for validation and cleaned afterward.

## Run Setup

- Sample: first 20 eligible BJS/OJP corrections statistical publication PDFs after filtering out jurisdiction notes, policy pages, press pages, and summary-only candidates.
- Report mix: federal prison statistics, jail inmates, local jail mortality, prisons, correctional populations, Indian country jails, and sexual victimization survey reports.
- Size cap: all 20 selected PDFs were under `10 MB`; selected files were about `188 KB` to `2.40 MiB`.
- Validation: one bounded deterministic 20-file run, the standard low-row diagnostic, and focused table target-resolution diagnostic.
- Runtime mode: deterministic native PDFAF only.
- Flags: `--no-semantic --no-pdfs`.
- Child remediation timeout: `300000ms`.
- External kill grace: `10000ms`.
- Temp/output root: `/mnt/pdf-review`.

## Fresh 20-Row Result

Local run before cleanup: `/mnt/pdf-review/public-holdouts/bjs-corrections-statistical-publications-2026-05-24/run-r1/baseline_report.json`

- Processed: `20/20`.
- Mean: `69.50 -> 79.05`.
- Median after remediation: `69`.
- Grades after remediation: `8 A / 1 B / 0 C / 8 D / 3 F`.
- Rows below 93: `12`.
- Runtime p50/p95/max: `51816ms / 170270ms / 184639ms`.
- Timeout/error rows: `0`.
- `false_positive_applied`: `0`.

The low rows were `bjscorr-02.pdf`, `bjscorr-03.pdf`, `bjscorr-07.pdf`, `bjscorr-08.pdf`, `bjscorr-09.pdf`, `bjscorr-11.pdf`, `bjscorr-12.pdf`, `bjscorr-13.pdf`, `bjscorr-16.pdf`, `bjscorr-17.pdf`, `bjscorr-18.pdf`, and `bjscorr-20.pdf`.

## Low-Row Diagnostic

The low-row diagnostic classified the source as `plan_high_impact_targeted_diagnostic` with recommended lane `table_target_resolution_needed`.

- Raw points needed for a mean of 93: `279`.
- Table target-resolution rows: `9`, carrying `197` raw points.
- Reading/link-order rows: `bjscorr-02.pdf` and `bjscorr-03.pdf`, carrying `68` raw points.
- No-safe-predicate row: `bjscorr-20.pdf`, carrying `34` raw points.

Even a perfect table lift would not close the source by itself. The BJS set is therefore useful as a hard outside-source diagnostic, not as a clean single-lane behavior proof.

## Table Target Diagnostic

Focused table target-resolution diagnostic returned `keep_table_target_resolution_diagnostic_only`.

- Stable focus candidates: `bjscorr-07`, `bjscorr-08`, `bjscorr-09`, `bjscorr-11`, `bjscorr-12`, `bjscorr-13`, `bjscorr-16`, `bjscorr-17`, and `bjscorr-18`.
- Unsafe control candidates: `bjscorr-01` and `bjscorr-04`.
- Prior non-table target rows: `0`.
- Classification counts: `11` stable normalize targets and `6` control/high-grade noise rows.

The focus rows have real object-backed table-shape debt and PAC table-header debt, but the same structural predicate also appears on same-source controls. Existing table attempts also continue to interact with PAC header-association checks. That is not clean enough for planner promotion.

## Other Residuals

`bjscorr-02.pdf` and `bjscorr-03.pdf` remain reading/link-order candidates with heading debt. Existing run evidence shows reading/link/page-furniture tools were attempted, but the artifacts do not expose a clean native discriminator that separates safe positives from controls.

`bjscorr-20.pdf` improved from `28/F` to `59/F`, but its residual debt is mixed: heading structure remains `0`, figure/alt and annotation repairs made partial progress, and multiple heading candidates were rejected as no-effect or multiple-H1 states. The run artifact does not support a safe general behavior change.

## Decision

No source behavior change is accepted from this source. BJS corrections statistical publications are a strong below-target outside holdout with bounded runtime, no hard timeout, and `false_positive_applied=0`, but the supported lanes are not safe to promote:

- Table normalization/header repair is high impact but triggers same-source controls.
- Reading/link rows are too few and lack a clean discriminator in the current artifacts.
- The remaining F row is mixed heading/figure/link debt without a safe single-lane predicate.

Do not add BJS/source/publication/PDF-specific gates, scorer masking, PAC relaxation, broader table admission, or broad heading creation from this evidence. A future safe improvement would need a stricter object-backed table/header transaction predicate that excludes high-grade table-heavy controls, or a separate native reading/link diagnostic that proves a general predicate across positives and controls.

Because no source behavior changed, no original-50 regression validation was required for this source.
