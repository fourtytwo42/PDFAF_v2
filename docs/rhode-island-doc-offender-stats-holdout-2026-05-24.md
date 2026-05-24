# Rhode Island DOC Offender Statistics Public Holdout

Date: 2026-05-24

Source: Rhode Island Department of Corrections, Offender Statistics & Reports page: `https://doc.ri.gov/node/681`

This was a 20-PDF public holdout sample from official RIDOC report PDFs under 10 MB. Downloaded PDFs were kept under `/mnt/pdf-review` for validation and cleaned afterward.

## Run Setup

- Sample: the first 20 listed PDFs from the source page, covering cap/midnight counts, annual population reports, population updates, and commitment/release reports.
- Validation: one bounded deterministic 20-file run.
- Runtime mode: deterministic native PDFAF only.
- Flags: `--no-semantic --no-pdfs`.
- Child remediation timeout: `300000ms`.
- External kill grace: `10000ms`.
- Temp/output root: `/mnt/pdf-review`.

## Fresh 20-Row Result

Local run: `/mnt/pdf-review/public-holdouts/rhode-island-doc-offender-stats-2026-05-24/run-r1/baseline_report.json`

- Processed: `20/20`.
- Mean: `41.75 -> 95.35`.
- Median after remediation: `95`.
- Grades after remediation: `20 A / 0 B / 0 C / 0 D / 0 F`.
- Points needed for mean 93: `0`.
- Runtime p50/p95/max: `10839ms / 25329ms / 26201ms`.
- Timeout/error rows: `0`.
- `false_positive_applied`: `0`.

## Low-Row Diagnostic

The low-row diagnostic classified the source as `holdout_target_met` and recommended no behavior lane.

| Candidate class | Rows | Raw points to target | Notes |
| --- | ---: | ---: | --- |
| Near-miss monitor | `1` | `1` | `ridoc-19-cy24-annual-commitment-and-release-report.pdf` finished `92/A` with mild heading/table debt. |

## Decision

No source behavior change is accepted from this source. The accepted engine already clears the 93+ mean target on this official RIDOC public sample with all rows A-grade, bounded runtime, no hard errors, and no false-positive applications.

The single near-miss row is low priority: it started at `92/A`, stayed at `92/A`, and only shows mild `heading_structure=79` and `table_markup=79` debt while reading order, alt text, and PDF/UA compliance are high after remediation. There is no safe high-impact predicate for scoring, planner, mutator, PAC-gate, timeout, or semantic behavior changes from this source. Because no source behavior changed, no original-50 regression validation was required for this source.
