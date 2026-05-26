# Virginia Criminal Sentencing Commission Reports Holdout - 2026-05-26

## Source

- Public sources:
  - Virginia Criminal Sentencing Commission PDFs at `http://www.vcsc.virginia.gov/`
  - Virginia Reports to the General Assembly mirrors under `https://rga.lis.virginia.gov/Published/.../PDF`
- Sample: 20 public VCSC reports, all under the strict decimal `10,000,000` byte cap.
- Composition: 18 annual reports plus 2 VCSC Pretrial Data Project reports to reach a 20-PDF same-agency public holdout set.
- Execution mode: Node 22 deterministic bounded validation, `--no-semantic`, `--no-pdfs`, row artifacts cleaned.

## Result

Run: `/mnt/pdf-review/public-holdouts/virginia-criminal-sentencing-commission-reports-2026-05-26/run-r1/baseline_report.json`

- Count: `20/20`
- Mean: `90.45`
- Median: `96`
- Grades: `15 A / 2 B / 1 C / 0 D / 2 F`
- Rows below `93`: `8`
- Rows below `95`: `9`
- Runtime p50/p95/max: `58481ms / 183317ms / 189962ms`
- Hard timeouts/errors: `0`
- `false_positive_applied`: `0`

This source did not reach the per-source mean `93` gate. It needed `51` raw points.

## Low Rows

| Row | Score | Main Debt |
| --- | ---: | --- |
| `vcsc-08` 2018 Annual Report | `59/F` | `heading_structure=0`, `pdf_ua_compliance=67` |
| `vcsc-16` 2009 Annual Report | `59/F` | `heading_structure=0` |
| `vcsc-12` 2014 Annual Report | `79/C` | `reading_order=55`, `link_quality=62`, `pdf_ua_compliance=79` |
| `vcsc-19` 2025 Pretrial Data Project | `88/B` | `table_markup=70`, `heading_structure=79`, `link_quality=79` |
| `vcsc-20` 2024 Pretrial Data Project | `89/B` | `table_markup=70`, `heading_structure=75`, `link_quality=79` |
| `vcsc-10` 2016 Annual Report | `92/A` | one-point heading/PDF-UA/reading near miss |
| `vcsc-13` 2013 Annual Report | `92/A` | one-point PDF-UA/reading/link near miss |
| `vcsc-18` 2001 Annual Report | `92/A` | one-point heading/bookmark near miss |

## Diagnostics

Low-row diagnostic:

- Decision: `plan_medium_impact_targeted_diagnostic`
- Recommended lane: `reading_link_order_candidate`
- Raw points needed for mean `93`: `51`

Reading/link diagnostics:

- `all-input-reading-order-shell-diagnostic` over the source run found `0` safe route controls and `0` sequence candidates.
- No reading/link behavior change is supported.

Heading diagnostics:

- Visible-title/heading-anchor diagnostic classified `vcsc-08` and `vcsc-16` as tagged zero-heading rows with `no_safe_candidate`.
- `vcsc-18` was native untagged but had `no_visible_title_evidence`.
- `vcsc-10` had an existing internal-anchor candidate, but it was only a one-point near miss and did not justify a new behavior lane.
- No raw visible-text heading creation was accepted.

Table diagnostics:

- Table target-resolution found stable object-backed table targets on `vcsc-19` and `vcsc-20`, with no unsafe same-source A controls.
- However, the table sequence probe found `0` safe sequence candidates, `9` harmful PAC-regression sequences, and `5` no-useful-movement sequences.
- Best observed sequences still ended at `59/F` and increased non-target PAC failure counts.
- No table/header behavior change is supported from this source.

## Decision

Diagnostic-only. No scorer, planner, mutator, PAC gate, timeout, semantic, ODL, source-specific, filename-specific, or PDF-specific behavior change was accepted.

No original-50 validation was required because no source behavior changed. Downloaded public PDFs and generated holdout artifacts were deleted after metrics extraction; only this source note and the durable memory summary are tracked.
