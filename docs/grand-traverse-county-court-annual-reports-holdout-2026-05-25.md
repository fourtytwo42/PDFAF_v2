# Grand Traverse County Court Annual Reports Holdout - 2026-05-25

## Source

- Public source: Grand Traverse County, Michigan annual reports page.
- Source page: `https://gtcountymi.gov/170/Annual-Reports`
- Sample: 20 public court annual-report PDFs, selecting the most recent annual reports that downloaded successfully, verified as PDFs, and were under 10 MiB.
- Download note: the `2019` and `2018` annual reports exceeded the 10 MiB gate and were skipped; the retained sample covered `2024`, `2023`, `2022`, `2021`, `2020`, and `2017` through `2003`.
- Size gate: every retained PDF was under 10 MiB; largest retained file was about `4.7 MB`.
- Local PDFs and generated validation artifacts were temporary under `/mnt/pdf-review/public-holdouts/grand-traverse-county-court-annual-reports-2026-05-25/` and are not source assets.

## Validation

- Command family: deterministic bounded holdout validation with `--no-semantic --no-pdfs`.
- Run artifact: `/mnt/pdf-review/public-holdouts/grand-traverse-county-court-annual-reports-2026-05-25/run-r1/baseline_report.json`
- Completed: `20/20`
- Mean: `82.4500`
- Median: `93`
- Grades: `13 A / 0 B / 0 C / 0 D / 7 F`
- Rows below `93`: `7`
- Runtime p50/p95/max: `23369ms / 48147ms / 58162ms`
- Hard timeouts/errors: `0`
- `false_positive_applied`: `0`

## Low-Row Diagnostics

Low-row diagnostic:

- Artifact: `/mnt/pdf-review/public-holdouts/grand-traverse-county-court-annual-reports-2026-05-25/low-row-diagnostic-r1/outside-holdout-low-row-diagnostic.md`
- Decision: `plan_high_impact_targeted_diagnostic`
- Initial recommended lane: `figure_alt_object_candidate`
- Raw points needed for mean `93`: `211`

Initial low rows:

| Row | Score | Classification | Notes |
| --- | ---: | --- | --- |
| `gtcourt-03` / 2022 Annual Report | `59/F` | `no_safe_predicate` | Zero-heading tail; no safe predicate visible from the run artifact. |
| `gtcourt-05` / 2020 Annual Report | `59/F` | `no_safe_predicate` | Zero-heading tail; no safe predicate visible from the run artifact. |
| `gtcourt-06` / 2017 Annual Report | `59/F` | `no_safe_predicate` | Zero-heading/reading-order tail. |
| `gtcourt-07` / 2016 Annual Report | `59/F` | `no_safe_predicate` | Zero-heading/reading-order tail. |
| `gtcourt-08` / 2015 Annual Report | `59/F` | `no_safe_predicate` | Zero-heading/reading-order tail. |
| `gtcourt-09` / 2014 Annual Report | `59/F` | `no_safe_predicate` | Zero-heading/reading-order tail. |
| `gtcourt-11` / 2012 Annual Report | `59/F` | `figure_alt_object_candidate` | Recovered on repeat, so this was not a stable figure/alt lane. |

Repeat/control run:

- Artifact: `/mnt/pdf-review/public-holdouts/grand-traverse-county-court-annual-reports-2026-05-25/repeat-r1/baseline_report.json`
- Rows: seven lows plus same-source A controls `gtcourt-01`, `gtcourt-02`, `gtcourt-04`, `gtcourt-10`, and `gtcourt-13`.
- Stable lows: `gtcourt-03`, `gtcourt-05`, `gtcourt-06`, `gtcourt-07`, `gtcourt-08`, and `gtcourt-09` repeated at `59/F`.
- Volatile/recovered row: `gtcourt-11` recovered from `59/F` to `94/A`.
- Control note: `gtcourt-02` dipped from `96/A` to `92/A`, showing some same-source route/runtime volatility even among controls.
- `false_positive_applied`: `0`
- Hard timeouts/errors: `0`

Repeat low-row diagnostic:

- Artifact: `/mnt/pdf-review/public-holdouts/grand-traverse-county-court-annual-reports-2026-05-25/repeat-low-row-diagnostic-r1/outside-holdout-low-row-diagnostic.md`
- Decision: `no_safe_low_row_lane`
- Recommended lane: `none`
- Raw points needed for mean `93`: `191`

Focused diagnostics:

- Figure/alt diagnostic artifact: `/mnt/pdf-review/public-holdouts/grand-traverse-county-court-annual-reports-2026-05-25/figure-alt-diagnostic-r1/outside-figure-alt-no-gain-diagnostic.md`
- Figure/alt decision: `keep_figure_alt_diagnostic_only`
- Heading-anchor artifact: `/mnt/pdf-review/public-holdouts/grand-traverse-county-court-annual-reports-2026-05-25/heading-anchor-diagnostic-r1/heading-anchor-diagnostic.md`
- Heading decision: diagnostic-only. The 2022 and 2020 rows expose tagged zero-heading anchor candidates, but existing `create_heading_from_tagged_visible_anchor` attempts already rejected with no-gain/collapse evidence in the benchmark timeline. The 2017-2014 rows have low reading-order/garbled-title evidence and no high-confidence native heading anchor. Same-source A controls exist, so a source/year/document-family rule would be overfit.

## Decision

This holdout is diagnostic-only and did not receive a behavior change. It is a real outside-corpus weakness: the mean remained `82.4500`, with six repeat-stable zero-heading lows carrying enough points to matter. However, the available evidence does not justify a safe general remediation change:

- the only initial figure/alt candidate recovered on repeat and the figure diagnostic found no behavior/scoring candidates;
- stable low rows either had no safe heading anchor or had existing heading-anchor attempts that already rejected as no-gain/collapsed-structure states;
- same-source A controls and a repeated near-miss control rule out a coarse source/year/layout-family gate;
- no scorer masking, PAC suppression, or PDF-specific gate is acceptable.

No source behavior changed, so no original-50 regression validation was required. Downloaded PDFs and generated artifacts should be deleted after metrics extraction. Future work should revisit this source only through a general object-backed heading-anchor mutation root-cause lane, not by broadening raw visible-text heading creation.
