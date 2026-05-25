# North Carolina DAC PREA Reports Holdout - 2026-05-25

## Source

- Public source: North Carolina Department of Adult Correction PREA Office and PREA reports archive.
- Source pages:
  - `https://www.dac.nc.gov/information-and-services/prea-office`
  - `https://www.dac.nc.gov/prea-reports-2020-2021`
- Sample: 20 public PDFs from official NC DAC PREA pages: the current Sexual Abuse Annual Report linked from the PREA Office page, plus PREA facility/annual audit reports from the 2020-2021 PREA reports archive.
- Download note: downloads used bounded direct HTTPS requests and accepted only files that verified as PDFs.
- Size gate: every downloaded PDF was under 10 MiB; largest file was about `6.7 MB`.
- Local PDFs and generated validation artifacts were temporary under `/mnt/pdf-review/public-holdouts/north-carolina-dac-prea-2026-05-25/` and are not source assets.

## Validation

- Command family: deterministic bounded holdout validation with `--no-semantic --no-pdfs`.
- Run artifact: `/mnt/pdf-review/public-holdouts/north-carolina-dac-prea-2026-05-25/run-r1/baseline_report.json`
- Completed: `20/20`
- Mean: `95.5500`
- Median: `97`
- Grades: `20 A / 0 B / 0 C / 0 D / 0 F`
- Rows below `93`: `0`
- Runtime p50/p95/max: `23872ms / 27897ms / 30440ms`
- Hard timeouts/errors: `0`
- `false_positive_applied`: `0`

## Low-Row Diagnostics

Low-row diagnostic:

- Artifact: `/mnt/pdf-review/public-holdouts/north-carolina-dac-prea-2026-05-25/low-row-diagnostic-r1/outside-holdout-low-row-diagnostic.md`
- Decision: `holdout_target_met`
- Recommended lane: `none`
- Raw points needed for mean `93`: `0`

There were no rows below `93`, so no targeted repeat or behavior lane was justified.

## Decision

This holdout passed without behavior changes. The source met the target mean at `95.5500`, with bounded runtime, no hard failures, and `false_positive_applied=0`.

No source behavior changed, so no original-50 regression validation was required. Downloaded PDFs and generated artifacts should be deleted after metrics extraction.
