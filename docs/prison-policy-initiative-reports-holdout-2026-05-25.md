# Prison Policy Initiative Reports Public Holdout

Date: 2026-05-25

Source: Prison Policy Initiative reports index: `https://www.prisonpolicy.org/reports.html`

This was a 20-PDF public outside-corpus holdout using Prison Policy Initiative-hosted report and scan PDFs under 10 MB. The run was diagnostic-only: no scoring, planner, remediation, PAC gate, Docker, or API behavior changed.

## Run Setup

- Sample: first 20 unique PPI-hosted PDF candidates discovered from the reports index, bounded report-page crawl, and sitemap after filtering to `prisonpolicy.org` / `static.prisonpolicy.org` hosts and the `10 MB` cap.
- Size cap: all selected PDFs were under `10 MB`; the sample totaled about `19.0 MB`.
- Validation: one bounded deterministic 20-file run plus the standard low-row diagnostic.
- Runtime mode: deterministic native PDFAF only.
- Flags: `--no-semantic --no-pdfs`.
- Child remediation timeout: `300000ms`.
- External kill grace: `10000ms`.
- Temp/output root: `/mnt/pdf-review`.

## Fresh 20-Row Result

Local run: `/mnt/pdf-review/public-holdouts/prison-policy-initiative-reports-2026-05-25/run-r1/baseline_report.json`

- Processed: `20/20`.
- Mean: `37.05 -> 94.55`.
- Median: `36 -> 95`.
- Grades after remediation: `19 A / 0 B / 1 C / 0 D / 0 F`.
- Rows below mean target `93`: `2`.
- Rows below bounded-runner target `95`: `8`.
- Runtime p50/p95/max: `10606ms / 18704ms / 60009ms`.
- Timeout/error rows: `0`.
- `false_positive_applied`: `0`.

Low rows:

| File | Score | Class | Notes |
| --- | ---: | --- | --- |
| `ppi-04.pdf` | `79/C` | `reading_link_order_candidate` | `reading_order=55`, `link_quality=61`; reading/link/page-furniture tools were attempted. |
| `ppi-16.pdf` | `92/A` | `near_miss_monitor` | One-point residual with `heading_structure=80`; low priority. |

## Sample

| id | bytes | source URL |
| --- | ---: | --- |
| `ppi-01` | 855178 | `https://static.prisonpolicy.org/reports/winnable2021.pdf` |
| `ppi-02` | 923382 | `https://www.prisonpolicy.org/reports/winnable2020.pdf` |
| `ppi-03` | 836815 | `https://www.prisonpolicy.org/reports/winnable2019.pdf` |
| `ppi-04` | 820437 | `https://www.prisonpolicy.org/reports/winnable2018.pdf` |
| `ppi-05` | 1016950 | `https://www.prisonpolicy.org/reports/winnable2017.pdf` |
| `ppi-06` | 878403 | `https://static.prisonpolicy.org/reports/winnable2016.pdf` |
| `ppi-07` | 794350 | `https://www.prisonpolicy.org/reports/winnable2015.pdf` |
| `ppi-08` | 786296 | `https://www.prisonpolicy.org/scans/1-2014-ppi-legislative-ideas.pdf` |
| `ppi-09` | 5558681 | `https://www.prisonpolicy.org/scans/Essie_LOTL-report-final.pdf` |
| `ppi-10` | 175253 | `https://static.prisonpolicy.org/scans/breaking_the_census.pdf` |
| `ppi-11` | 560882 | `https://static.prisonpolicy.org/scans/2166.pdf` |
| `ppi-12` | 4558939 | `https://www.prisonpolicy.org/reports/Manipulacion_distritos_electorales.pdf` |
| `ppi-13` | 107773 | `https://www.prisonpolicy.org/reports/pace.pdf` |
| `ppi-14` | 987297 | `https://static.prisonpolicy.org/scans/2025-bop-origin.pdf` |
| `ppi-15` | 63208 | `https://static.prisonpolicy.org/scans/Maryland_division_probation_parole_2011_2025.pdf` |
| `ppi-16` | 24748 | `https://static.prisonpolicy.org/scans/Virginia_DCJS_probation_2020_2025.pdf` |
| `ppi-17` | 246083 | `https://static.prisonpolicy.org/scans/2021-bop-origin.pdf` |
| `ppi-18` | 87040 | `https://static.prisonpolicy.org/scans/sp/3strikes.pdf` |
| `ppi-19` | 1349847 | `https://static.prisonpolicy.org/scans/EM-Report-Kilgore-final-draft-10-4-15.pdf` |
| `ppi-20` | 408460 | `https://static.prisonpolicy.org/scans/Perspectives_V41_N2_P20.pdf` |

## Diagnostics

Low-row diagnostic:

- Local artifact: `/mnt/pdf-review/public-holdouts/prison-policy-initiative-reports-2026-05-25/low-row-diagnostic-r1/outside-holdout-low-row-diagnostic.md`
- Decision: `holdout_target_met`.
- Recommended lane: `reading_link_order_candidate`.
- Raw points needed for mean `93`: `0`.
- Lane split:
  - `reading_link_order_candidate`: `1` row, `14` raw points.
  - `near_miss_monitor`: `1` row, `1` raw point.

Reading-order shell diagnostic:

- Local artifact: `/mnt/pdf-review/public-holdouts/prison-policy-initiative-reports-2026-05-25/reading-order-shell-r1/reading-order-shell-diagnostic.md`
- Sequence candidates needing proposal cleanup: `0`.
- Safe route controls: `0`.
- Recovered routes with final orphan debt: `0`.
- The `ppi-04.pdf` residual is real reading/link debt, but no degenerate native reading-order shell attempt or score-moving proposal was visible in this run.

## Decision

No engine change was accepted from this holdout set.

Reasons:

- The source already clears the requested `93+` mean and median target: mean `94.55`, median `95`.
- Residual debt is concentrated in one C-grade reading/link row and one one-point near miss.
- The focused reading-order shell diagnostic found no safe existing route to promote.
- `false_positive_applied` stayed `0`, and there were no hard timeouts or errors.

No original-50 validation was required because no source behavior changed. Downloaded PDFs and generated validation artifacts were kept local only for metrics extraction and were deleted after this diagnostic set was documented.
