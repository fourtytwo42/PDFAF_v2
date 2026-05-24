# Michigan DOC Statistical Reports Public Holdout

Date: 2026-05-24

Source: Michigan Department of Corrections, Statistical Reports Archive: `https://www.michigan.gov/corrections/public-information/statistics-and-reports/statistical-reports-archive`

This was a 20-PDF public holdout sample from official Michigan DOC statistical reports under 10 MB. Downloaded PDFs were kept under `/mnt/pdf-review` for validation and cleaned afterward.

## Run Setup

- Sample: 20 annual statistical-report PDFs from the archive.
- Included years: `2023`, `2022`, and `2020` through `2003`.
- Excluded over the size cap: `2021-Statistical-Report.pdf` at `10886125` bytes.
- Validation: one bounded deterministic 20-file run plus focused diagnostics over the produced benchmark JSON.
- Runtime mode: deterministic native PDFAF only.
- Flags: `--no-semantic --no-pdfs`.
- Child remediation timeout: `300000ms`.
- External kill grace: `10000ms`.
- Temp/output root: `/mnt/pdf-review`.

## Fresh 20-Row Result

Local run: `/mnt/pdf-review/public-holdouts/michigan-doc-statistical-reports-2026-05-24/run-r1/baseline_report.json`

- Processed: `20/20`.
- Mean: `32.40 -> 73.80`.
- Median after remediation: `59`.
- Grades after remediation: `9 A / 0 B / 0 C / 0 D / 11 F`.
- Points needed for mean 93: `384`.
- Runtime p50/p95/max: `34575ms / 238913ms / 250214ms`.
- Timeout/error rows: `0`.
- `false_positive_applied`: `0`.

## Low-Row Diagnostic

The low-row diagnostic selected `figure_alt_object_candidate` as the first high-impact targeted lane, but the lane summary shows the larger residual family is zero-heading/no-safe-predicate debt.

| Candidate class | Rows | Raw points to target | Notes |
| --- | ---: | ---: | --- |
| No safe predicate | `7` | `238` | Stable `59/F` rows with `heading_structure=0`, good text extractability, and no safe lane visible from the run artifact alone. |
| Figure/alt object candidate | `2` | `84` | `2022` and `2020` reports ended `51/F` with `alt_text=20`, `heading_structure=0`, and only three accepted figure-alt writes. |
| Metadata/PDF-UA candidate | `2` | `68` | `2019` and `2018` reports ended `59/F` with `title_language=50`, `pdf_ua_compliance=50`, and `heading_structure=0`. |
| Near-miss monitor | `3` | `3` | Three A-grade rows ended at `92/A`. |

## Figure/Alt Diagnostic

The figure/alt no-gain diagnostic decided `keep_figure_alt_diagnostic_only`.

- `midoc-02` and `midoc-03` had checker-visible figure-alt coverage of only `3/36`.
- The existing bounded `set_figure_alt_text` writes improved partial coverage but did not reach enough coverage to move final `alt_text`.
- No scoring calibration candidate and no target-discovery behavior candidate were found.

This does not justify broader figure-alt fanout. The rows also have zero heading structure and PDF/UA debt, so isolated alt expansion would be high cost and incomplete.

## Metadata/PDF-UA Diagnostic

A source-only PDF/UA catalog/syntax diagnostic did not justify a new accepted behavior for the low rows.

- The two metadata-class low rows (`midoc-04`, `midoc-05`) were classified as `catalog_baseline_score_active` / `already_score_active` on source analysis.
- Rows that the engine already remediated well (`midoc-10`, `midoc-14`) showed catalog behavior-candidate evidence, but existing catalog and structure behavior already handled them during the full holdout run.

This is useful evidence that catalog settings remain important, but it is not a new source-backed fix for the Michigan F rows.

## Zero-Heading Residual

The dominant residual shape is the known deep native-tagged zero-heading shell family:

- large native-tagged reports,
- `heading_structure=0`,
- text extractability around `96`,
- many layout heading candidates,
- repeated header/footer and dense table-like layout evidence,
- current remediation either finds no safe heading target or times out in heading creation on the largest recent reports.

Healthy rows in the same archive improved through existing structure synthesis or tagged-visible heading promotion, which means a simple broad route change would risk destabilizing controls. A future fix needs a real general native-tagged marked-content shell transaction with object-backed heading ownership and original-50 validation.

## Decision

No source behavior change is accepted from this source. The source fails the 93+ mean target with no hard errors and no false-positive applications, but the evidence matches parked general lanes rather than an acceptance-ready fix.

Do not patch with Michigan/source/year/PDF gates, scorer masking, PAC relaxations, broad figure-alt fanout, heading fallback, or checkpoint relaxation from this evidence. Any future accepted change should be object-backed, control-validated, speed-bounded, and must pass original-50 quality and speed validation.

Because no source behavior changed, no original-50 regression validation was required for this source.
