# Massachusetts DOC Quarterly Reports Public Holdout

Date: 2026-05-24

Sources:

- https://www.mass.gov/report/department-of-correction-reports
- https://www.mass.gov/lists/admissions-and-releases
- https://www.mass.gov/lists/department-of-correction-in-place-archives
- https://www.mass.gov/lists/quarterly-jurisdiction-population
- https://www.mass.gov/lists/prison-capacity

This is a public-source outside-corpus diagnostic run. It used 20 public Massachusetts Department of Correction PDFs, each under 10MB. Downloaded PDFs were kept under `/mnt/pdf-review` for validation and cleaned afterward.

## Run Setup

- Sample: Admissions and Releases quarterly reports from `2022 Q1` through `2025 Q3`, three Quarterly Jurisdiction Population reports, and two Prison Capacity reports.
- Validation: one bounded deterministic 20-file run.
- Runtime mode: deterministic native PDFAF only.
- Flags: `--no-semantic --no-pdfs`.
- Child remediation timeout: `300000ms`.
- External kill grace: `10000ms`.
- Temp/output root: `/mnt/pdf-review`.

## Fresh 20-Row Result

- Processed: `20/20`.
- Mean: `63.35 -> 94.35`.
- Median after remediation: `94`.
- Minimum after remediation: `91`.
- Grades after remediation: `20 A / 0 B / 0 C / 0 D / 0 F`.
- Points needed for mean 93: `0`.
- Runtime p50/p95/max: `14582ms / 37302ms / 37856ms`.
- Timeout/error rows: `0`.
- `false_positive_applied`: `0`.

## Low-Row Diagnostic

The low-row diagnostic classified the source as `holdout_target_met` and recommended no behavior lane.

| Candidate class | Rows | Raw points to target | Notes |
| --- | ---: | ---: | --- |
| Near-miss monitor | `4` | `5` | Two admissions/release reports and two prison-capacity reports landed at `91-92/A`. |

The near-miss rows share mild heading/table/PDF-UA debt, but they are already A-grade and the full source already clears the 93 mean target. There is no high-impact or control-safe predicate to promote from this source alone.

## Decision

No source behavior change is accepted from this source. The accepted engine already clears the 93+ mean/median target with bounded runtime and no false-positive applications.

Because no source behavior changed, no original-50 regression validation was required for this source. Future table or heading work may naturally reach the near-miss rows, but this source does not justify a new scoring, planner, mutator, PAC-gate, timeout, or semantic behavior change.
