# OJJDP Publications Public Holdout

Date: 2026-05-25

Source: Office of Juvenile Justice and Delinquency Prevention publications library: `https://ojjdp.ojp.gov/library/publications/list`

This was a 20-PDF public outside-corpus holdout from OJJDP publication detail pages with OJJDP/OJP-hosted PDF downloads under 10 MB. The run was diagnostic-only: no scoring, planner, remediation, PAC gate, Docker, or API behavior changed.

## Run Setup

- Sample: first 20 unique PDF downloads discovered from bounded crawl of the OJJDP publications list and detail pages, filtered to OJJDP/OJP hosts and the `10 MB` cap.
- Size cap: all selected PDFs were under `10 MB`; the sample totaled about `31.6 MB`.
- Validation: one bounded deterministic 20-file run, low-row diagnostic, table target-resolution diagnostic, table/structure sequence probe, reading-order shell diagnostic, and one low-row repeat.
- Runtime mode: deterministic native PDFAF only.
- Flags: `--no-semantic --no-pdfs`.
- Child remediation timeout: `300000ms`.
- External kill grace: `10000ms`.
- Temp/output root: `/mnt/pdf-review`.

## Fresh 20-Row Result

Local run: `/mnt/pdf-review/public-holdouts/ojjdp-publications-2026-05-25/run-r1/baseline_report.json`

- Processed: `20/20`.
- Mean: `69.00 -> 89.50`.
- Median: `67.5 -> 94`.
- Grades after remediation: `15 A / 2 B / 0 C / 3 D / 0 F`.
- Rows below mean target `93`: `8`.
- Runtime p50/p95/max: `11508ms / 99693ms / 145896ms`.
- Timeout/error rows: `0`.
- `false_positive_applied`: `0`.

Low rows:

| File | Score | Class | Notes |
| --- | ---: | --- | --- |
| `ojjdp-12.pdf` | `69/D` | `table_target_resolution_needed` | `table_markup=16`; table/PAC header debt and heading/reading debt. |
| `ojjdp-13.pdf` | `69/D` | `table_target_resolution_needed` | `reading_order=25`, `table_markup=72`; table and reading/link debt. |
| `ojjdp-18.pdf` | `69/D` | `table_target_resolution_needed` | `table_markup=35`; mostly table debt. |
| `ojjdp-11.pdf` | `86/B` | `table_target_resolution_needed` | Mixed PDF/UA, heading, reading, table, and alt debt. |
| `ojjdp-07.pdf` | `88/B` | `table_target_resolution_needed` | `table_markup=44`; table plus link/PDF-UA debt. |
| `ojjdp-02.pdf` | `90/A` | `near_miss_monitor` | Form, heading, link, and PDF/UA near miss. |
| `ojjdp-05.pdf` | `91/A` | `near_miss_monitor` | Heading/alt near miss. |
| `ojjdp-09.pdf` | `91/A` | `near_miss_monitor` | Bookmark/link/PDF-UA/alt near miss. |

## Sample

| id | bytes | title | source URL |
| --- | ---: | --- | --- |
| `ojjdp-01` | 6744596 | Juvenile Court Statistics, 2023 | `https://www.ojp.gov/publications/juvenile-court-statistics-2023.pdf` |
| `ojjdp-02` | 3477898 | When Your Child Is Missing: A Family Survival Guide, Fifth Edition, 2025 Update | `https://ojjdp.ojp.gov/publications/family-survival-guide-fifth-edition.pdf` |
| `ojjdp-03` | 328560 | 2024 Victims of Child Abuse Act Annual Report to Congress | `https://ojjdp.ojp.gov/publications/victims-of-child-abuse-act-2024-report.pdf` |
| `ojjdp-04` | 82498 | Trends and Characteristics of Youth in Residential Placement, 2023 | `https://ojjdp.ojp.gov/publications/data-snapshot-trends-characteristics-youth-residential-placement-2023.pdf` |
| `ojjdp-05` | 79863 | Dating Violence Reported by High School Students, 2023 | `https://ojjdp.ojp.gov/publications/data-snapshot-dating-violence-reported-by-high-school-students-2023.pdf` |
| `ojjdp-06` | 171779 | Drug Treatment Courts | `https://www.ojp.gov/pdffiles1/nij/238527.pdf` |
| `ojjdp-07` | 3591039 | Untangling the Web of Violence: The Network Effects of Civil Gang Injunctions | `https://www.ojp.gov/pdffiles1/nij/grants/310655.pdf` |
| `ojjdp-08` | 3495839 | Office of Juvenile Justice and Delinquency Prevention 2022 Annual Report | `https://ojjdp.ojp.gov/publications/ojjdp-fy-2022-annual-report.pdf` |
| `ojjdp-09` | 6108756 | Office of Juvenile Justice and Delinquency Prevention 2023 Annual Report | `https://ojjdp.ojp.gov/publications/ojjdp-fy-2023-annual-report.pdf` |
| `ojjdp-10` | 272884 | Violent Crime Cases in Juvenile Court, 2021 | `https://ojjdp.ojp.gov/publications/violent-crime-cases-in-juvenile-court-2021.pdf` |
| `ojjdp-11` | 7186374 | What About Me? Finding Your Path Forward When Your Brother or Sister is Missing (Second Edition) | `https://ojjdp.ojp.gov/publications/what-about-me-second-edition.pdf` |
| `ojjdp-12` | 985533 | Partnering With Youth and Families: A Best Practices Guide for Youth Justice Stakeholders | `https://ojjdp.ojp.gov/publications/partnering-with-youth-and-families.pdf` |
| `ojjdp-13` | 228524 | Delinquency Cases in Juvenile Court, 2021 | `https://ojjdp.ojp.gov/publications/delinquency-cases-in-juvenile-court-2021.pdf` |
| `ojjdp-14` | 82153 | Trends and Characteristics of Delinquency Cases Handled in Juvenile Court, 2022 | `https://ojjdp.ojp.gov/publications/data-snapshot-trends-delinquency-cases-juvenile-court-2022.pdf` |
| `ojjdp-15` | 236189 | In Perspective: An Overview of the Juvenile Justice and Delinquency Prevention Act | `https://ojjdp.ojp.gov/publications/in-perspective-jjdpa-overview.pdf` |
| `ojjdp-16` | 1057156 | Five Things About Youth and Delinquency | `https://www.ojp.gov/pdffiles1/nij/309129.pdf` |
| `ojjdp-17` | 56757 | Highlights from the 2022 Juvenile Residential Facility Census | `https://ojjdp.ojp.gov/publications/highlights-2022-juvenile-residential-facility-census.pdf` |
| `ojjdp-18` | 51245 | Characteristics of Cases Judicially Waived from Juvenile Court to Criminal Court | `https://ojjdp.ojp.gov/publications/characteristics-of-cases-judicially-waived.pdf` |
| `ojjdp-19` | 306177 | The Impact of COVID-19 on the Nation's Juvenile Court Caseload | `https://ojjdp.ojp.gov/publications/impact-of-covid-on-juvenile-court-caseload.pdf` |
| `ojjdp-20` | 79846 | Major Depressive Episodes (MDE) Among Youth, 2022 | `https://ojjdp.ojp.gov/publications/major-depressive-episodes-among-youth-2022.pdf` |

## Diagnostics

Low-row diagnostic:

- Local artifact: `/mnt/pdf-review/public-holdouts/ojjdp-publications-2026-05-25/low-row-diagnostic-r1/outside-holdout-low-row-diagnostic.md`
- Decision: `plan_high_impact_targeted_diagnostic`.
- Recommended lane: `table_target_resolution_needed`.
- Raw points needed for mean `93`: `70`.
- Lane split:
  - `table_target_resolution_needed`: `5` rows, `84` raw points.
  - `near_miss_monitor`: `3` rows, `7` raw points.

Table target-resolution diagnostic:

- Local artifact: `/mnt/pdf-review/public-holdouts/ojjdp-publications-2026-05-25/table-target-resolution-r1/table-target-resolution-diagnostic.md`
- Decision: `keep_table_target_resolution_diagnostic_only`.
- Stable focus candidates: `ojjdp-07`, `ojjdp-11`, `ojjdp-12`, `ojjdp-13`, `ojjdp-18`.
- Unsafe control candidates: `ojjdp-01`, `ojjdp-03`.
- Interpretation: the focus rows have real object-backed table targets, but the same source also has recovered/A-grade rows with the stable target shape, so a production predicate is not selective enough yet.

Table/structure sequence probe:

- Local artifact: `/mnt/pdf-review/public-holdouts/ojjdp-publications-2026-05-25/table-structure-sequence-probe-r1/table-structure-sequence-probe.md`
- Sequence candidates: `0`.
- Harmful PAC regressions: `13`.
- No useful movement outcomes: `22`.
- Best observed focus-row probes either increased non-target PAC failures or did not move score; no accepted table transaction is supported from this source.

Reading-order shell diagnostic:

- Local artifact: `/mnt/pdf-review/public-holdouts/ojjdp-publications-2026-05-25/reading-order-shell-r1/reading-order-shell-diagnostic.md`
- Sequence candidates needing proposal cleanup: `0`.
- Safe route controls: `0`.
- Recovered routes with final orphan debt: `0`.
- No reading-order shell route is supported despite reading/link debt on some rows.

Low-row repeat:

- Local artifact: `/mnt/pdf-review/public-holdouts/ojjdp-publications-2026-05-25/repeat-low-r1/baseline_report.json`
- Repeated rows: `ojjdp-02`, `ojjdp-05`, `ojjdp-07`, `ojjdp-09`, `ojjdp-11`, `ojjdp-12`, `ojjdp-13`, `ojjdp-18`.
- Repeat result: `ojjdp-07` improved `88/B -> 92/A` and `ojjdp-05` improved `91/A -> 92/A`; all other repeated lows stayed at their baseline final scores.
- Persistent D-grade rows remained `ojjdp-12`, `ojjdp-13`, and `ojjdp-18`.

## Decision

No engine change was accepted from this holdout set.

Reasons:

- The source missed the requested source mean target: `89.50` versus `93`.
- Table debt is real and high impact, but current stable-target evidence is too broad because recovered/A-grade controls also trigger.
- Existing table/header/structure sequences did not produce a safe PAC-honest candidate.
- Reading-order shell diagnostics found no route to promote.
- Low-row repeat confirmed most residuals are stable rather than transient.
- `false_positive_applied` stayed `0`, and there were no hard timeouts or errors.

No original-50 validation was required because no source behavior changed. Downloaded PDFs and generated validation artifacts were kept local only for metrics extraction and were deleted after this diagnostic set was documented.
