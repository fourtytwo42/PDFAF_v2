# New Mexico Corrections Notice and Reports Holdout - 2026-05-25

## Source

- Source page: `https://www.cd.nm.gov/about-us/notice-and-reports/`
- Agency: New Mexico Corrections Department
- Sample: first 20 official report PDFs under 10 MB after excluding mail, guidebook, and resource documents
- Constraint: all counted PDFs were official NMCD PDFs and below 10 MB by actual downloaded size
- Rejected for size: `2024 Annual Report` (`18814812` bytes), `2023 Annual Report` (`19814053` bytes), and `2022 Annual Report` (`26848701` bytes)

## Validation

- Run root: `/mnt/pdf-review/public-holdouts/new-mexico-corrections-notice-reports-2026-05-25/run-r1`
- Mode: deterministic, `--no-semantic --no-pdfs`
- Per-PDF timeout: `300000ms`
- Completed: `20/20`
- Mean: `37.35 -> 87.70`
- Median after remediation: `93`
- Grades after remediation: `16 A / 0 B / 0 C / 2 D / 2 F`
- Rows below `93`: `6`
- Runtime p50/p95/max: `27877ms / 66479ms / 104595ms`
- Hard timeouts/errors: `0`
- `false_positive_applied`: `0`

## Sample

| id | title | bytes |
| --- | --- | ---: |
| `nmcdrep-01` | 2025 Annual Report | 10296837 |
| `nmcdrep-02` | 2021 Annual Report | 2061191 |
| `nmcdrep-03` | 2020 Annual Report | 1594674 |
| `nmcdrep-04` | 2018-2019 Annual Report | 7815581 |
| `nmcdrep-05` | 2016-2017 Annual Report | 4630592 |
| `nmcdrep-06` | 2014-2015 Annual Report | 6788144 |
| `nmcdrep-07` | 2013-2014 Annual Report | 5036733 |
| `nmcdrep-08` | 2012-2013 Annual Report | 5602051 |
| `nmcdrep-09` | 2011-2012 Annual Report | 754470 |
| `nmcdrep-10` | 2010-2011 Annual Report | 8864794 |
| `nmcdrep-11` | 2009-2010 Annual Report | 6688799 |
| `nmcdrep-12` | 2019 Audit Report | 1162624 |
| `nmcdrep-13` | 2018 Audit Report | 1290006 |
| `nmcdrep-14` | 2017 Audit Report | 1501630 |
| `nmcdrep-15` | 2016 Audit Report | 4924174 |
| `nmcdrep-16` | 2015 Audit Report | 4806506 |
| `nmcdrep-17` | 2014 Audit Report | 6373178 |
| `nmcdrep-18` | 2013 Audit Report | 7924905 |
| `nmcdrep-19` | 2012 Audit Report | 1446381 |
| `nmcdrep-20` | 2011 Audit Report | 2192123 |

## Diagnostics

Low-row diagnostic:

- Decision: `plan_high_impact_targeted_diagnostic`
- Recommended lane: `reading_link_order_candidate`
- Raw points needed for mean `93`: `106`
- Timeout/error rows: `0`
- Lane split:
  - `2` reading/link-order rows carrying `82` raw points: `nmcdrep-15`, `nmcdrep-18`
  - `2` table target-resolution rows carrying `48` raw points: `nmcdrep-05`, `nmcdrep-07`
  - `2` near-miss monitor rows carrying `3` raw points: `nmcdrep-08`, `nmcdrep-04`

Reading-order shell diagnostic:

- Sequence candidates needing proposal cleanup: `0`
- Safe route controls: `1`
- Recovered routes with final orphan debt: `3`
- The two primary reading/order lows, `nmcdrep-15` and `nmcdrep-18`, had no degenerate native reading-order shell attempts visible in the run timeline.

Table target-resolution diagnostic:

- Decision: `keep_table_target_resolution_diagnostic_only`
- Stable focus candidates: `nmcdrep-05`, `nmcdrep-07`
- Unsafe control candidates: `nmcdrep-12`
- Prior non-table target rows: `none`
- The focus rows have object-backed table-shape targets, but a same-source A-grade control also matches the stable table target shape. Existing table tools already attempted the focus rows and hit PAC regression guards such as `pdfua.figure.alt_present`, `pdfua.table.rows_regular`, or `pdfua.table.header_association_present`.

## Decision

No remediation, scorer, planner, analyzer, or PAC-gate behavior was accepted from this holdout.

This source remains below the target mean under the current engine. The useful evidence is split across two risky families: reading/order zero-heading audit reports with no proven shell-repair proposal path, and table-shape residuals where same-source controls trigger. Both lanes need a tighter general predicate before any production behavior change.

No original-50 regression validation was required because no source behavior changed.

Downloaded PDFs and generated local validation artifacts were deleted after metrics extraction.
