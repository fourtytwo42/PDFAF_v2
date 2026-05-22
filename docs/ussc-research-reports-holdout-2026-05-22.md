# USSC Research Reports Public Holdout

Date: 2026-05-22

Source: https://www.ussc.gov/topic/research-reports

This is a public-source outside-corpus diagnostic run. It used 20 unique PDFs under 10MB linked from the United States Sentencing Commission research reports listing and linked report/category pages. Two larger report PDFs were skipped because they exceeded the 10MB cap. Downloaded PDFs were kept under `/mnt/pdf-review` for validation and cleaned afterward.

## Run Setup

- Sample: 20 PDFs under 10MB.
- Validation: four bounded five-file shards, merged after completion.
- Runtime mode: deterministic native PDFAF only.
- Flags: `--no-semantic --no-pdfs`.
- Child remediation timeout: `300000ms`.
- External kill grace: `10000ms`.
- Temp/output root: `/mnt/pdf-review`.

## Fresh 20-Row Result

- Processed: `20/20`.
- Mean: `38.30 -> 92.80`.
- Median after remediation: `94`.
- Grades after remediation: `19 A / 0 B / 0 C / 0 D / 1 F`.
- Points needed for mean 93: `4`.
- Runtime p50/p95/max: `45631ms / 194994ms / 250253ms`.
- Timeout/error rows: `0`.
- `false_positive_applied`: `0`.

## Low-Row Diagnostic

The low-row diagnostic returned `no_safe_low_row_lane`.

| Row | Fresh Score | Class | Notes |
| --- | ---: | --- | --- |
| `ussc-07-20231114_Demographic-Differences.pdf` | `59/F` | `no_safe_predicate` | Native tagged heading/reading residual. Heading and structure tools were blocked by PAC annotation-structure regressions such as `pdfua.annotations.tagged_annotations_present`, so there is no safe behavior promotion from this run. |

## Repeat Check

Because the source was only `4` raw points short of mean 93, a single deterministic repeat was run for the lone F row.

- Repeat row: `ussc-07-20231114_Demographic-Differences.pdf`.
- Repeat result: `94/A`.
- Interpretation: the row has route/analyzer volatility. This repeat is planning evidence only and does not replace the fresh 20-row source mean.

## Figure/Alt Diagnostic

- Decision: `keep_figure_alt_diagnostic_only`.
- No behavior or scoring candidate was found.

## Decision

No source behavior change is accepted from this source. The fresh full-source result remains `92.80`, with one volatile row preventing a 93+ source mean in that run. The repeat-supported A-grade result is useful evidence for future route/analyzer stability work, but it is not a new accepted mean, overlay, or behavior proof.

Because no source behavior changed, no original-50 regression validation was required for this source. The downloaded PDFs and generated local diagnostics remain non-source artifacts and were removed after this report.
