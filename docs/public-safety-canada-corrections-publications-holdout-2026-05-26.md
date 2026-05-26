# Public Safety Canada Corrections Publications Holdout - 2026-05-26

## Source

- Public source page: https://www.publicsafety.gc.ca/cnt/rsrcs/pblctns/index-en.aspx?t=crrctns
- Source collection: Public Safety Canada corrections publications.
- Selection: first 20 direct English PDF publication assets from the corrections index where the inferred publication PDF URL returned `200 application/pdf`, downloaded as a valid PDF, and stayed under the strict decimal `10,000,000` byte cap.
- Several newer index rows were skipped because the direct PDF pattern returned `404` or the publication only exposed non-PDF formats.

## Sample

| ID | File | Bytes | Publication Date | Slug | Description |
| --- | --- | ---: | --- | --- | --- |
| `pscan-01` | `pscan-01.pdf` | 554,153 | `2025-07-31` | `2025-gd-ssst-vctms` | Information Guide to Assist Victims - (11th Edition) |
| `pscan-02` | `pscan-02.pdf` | 8,949,643 | `2024-03-19` | `ccrso-2022` | 2022 Corrections and Conditional Release Statistical Overview |
| `pscan-03` | `pscan-03.pdf` | 4,522,554 | `2024-03-19` | `ccrso-2022-dt-ltrcy` | Reading the 2022 Corrections and Conditional Release Statistical Overview (CCRSO) |
| `pscan-04` | `pscan-04.pdf` | 695,262 | `2023-05-16` | `vrvw-vctm-cntrd-nfrmtn-ssstnc` | Overview of Federal Corrections and Criminal Justice - Victim-Centred Information and Assistance |
| `pscan-05` | `pscan-05.pdf` | 5,461,665 | `2023-03-20` | `ccrso-2021` | 2021 Corrections and Conditional Release Statistical Overview |
| `pscan-06` | `pscan-06.pdf` | 1,253,481 | `2022-10-28` | `2022-siu-iap-nnlrpt` | Structured Intervention Unit Implementation Advisory Panel 2021-22 Annual Report |
| `pscan-07` | `pscan-07.pdf` | 318,302 | `2022-04-26` | `2022-siu-iap` | Preliminary Observations of the Operation of Correctional Service of Canada's Structured Intervention Units |
| `pscan-08` | `pscan-08.pdf` | 6,263,933 | `2022-02-11` | `ccrso-2020` | 2020 Corrections and Conditional Release Statistical Overview |
| `pscan-09` | `pscan-09.pdf` | 1,339,335 | `2021-08-04` | `2021-r003` | Large-Scale Implementation and Evaluation of the Strategic Training Initiative in Community Supervision (STICS) |
| `pscan-10` | `pscan-10.pdf` | 253,950 | `2021-08-04` | `2021-s003` | Research Summary - Large-Scale Implementation and Evaluation of the Strategic Training Initiative in Community Supervision (STICS) |
| `pscan-11` | `pscan-11.pdf` | 1,062,281 | `2021-04-08` | `2021-r002` | Economic Outcomes of Canadian Federal Offenders |
| `pscan-12` | `pscan-12.pdf` | 298,161 | `2021-04-08` | `2021-s002` | Research Summary - Economic Outcomes of Canadian Federal Offenders: A Brief Overview |
| `pscan-13` | `pscan-13.pdf` | 529,516 | `2020-11-24` | `2020-resjus-jusrep` | Increasing the Use of Restorative Justice in Criminal Matters in Canada - Baseline Report |
| `pscan-14` | `pscan-14.pdf` | 5,406,414 | `2020-10-16` | `ccrso-2019` | 2019 Corrections and Conditional Release Statistical Overview |
| `pscan-15` | `pscan-15.pdf` | 423,813 | `2019-09-06` | `ntnl-ffc-vctms-rndtbl-2019-09` | National Victims Roundtable on the Right to Protection in Federal Corrections and Conditional Release |
| `pscan-16` | `pscan-16.pdf` | 2,517,158 | `2019-08-19` | `ccrso-2018` | 2018 Corrections and Conditional Release Statistical Overview |
| `pscan-17` | `pscan-17.pdf` | 2,481,904 | `2018-09-10` | `ccrso-2017` | 2017 Corrections and Conditional Release Statistical Overview |
| `pscan-18` | `pscan-18.pdf` | 230,325 | `2018-09-10` | `2017-s016` | Research Summary: A Meta-analysis of the Effectiveness of Culturally-relevant Treatment for Indigenous Offenders |
| `pscan-19` | `pscan-19.pdf` | 101,073 | `2018-05-01` | `2018-s002` | How to best predict sexual reoffending among sex offenders |
| `pscan-20` | `pscan-20.pdf` | 186,341 | `2018-04-27` | `prprng-vctms-rls-fdrl-ffndr` | Helping Victims Prepare for the Release of a Federal Offender |

## Validation

Command:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/bounded-holdout-validation.ts \
  /mnt/pdf-review/public-holdouts/public-safety-canada-corrections-publications-2026-05-26/input \
  /mnt/pdf-review/public-holdouts/public-safety-canada-corrections-publications-2026-05-26/run-r1 \
  --limit 20 \
  --cleanup-row-artifacts
```

Result:

- Completed: `19/20`
- Mean before, completed rows: `56.95`
- Mean after, completed rows: `84.63`
- Mean after, all rows: `80.40`
- Median after, all rows: `85.5`
- Grades after: `10 A / 0 B / 1 C / 8 D / 0 F / 1 ?`
- Rows below `93`: `11`
- Rows below `95`: `11`
- p50/p95/max runtime: `26390ms / 272325ms / 300008ms`
- Hard timeouts/errors: `1`
- `false_positive_applied=0`

Low rows:

| File | Result | Main residual evidence |
| --- | --- | --- |
| `pscan-01.pdf` | `79/C` | `reading_order=55`, `link_quality=73`, `pdf_ua_compliance=79` |
| `pscan-02.pdf` | `69/D` | `table_markup=0`, `heading_structure=35`, `pdf_ua_compliance=50` |
| `pscan-05.pdf` | `0/?` | `per_pdf_timeout_300000ms` |
| `pscan-06.pdf` | `69/D` | `table_markup=0`, `pdf_ua_compliance=79`, `link_quality=79` |
| `pscan-07.pdf` | `69/D` | `table_markup=0`, `pdf_ua_compliance=71` |
| `pscan-08.pdf` | `69/D` | `table_markup=0`, `pdf_ua_compliance=63` |
| `pscan-09.pdf` | `69/D` | `table_markup=0`, `pdf_ua_compliance=63` |
| `pscan-11.pdf` | `92/A` | `pdf_ua_compliance=71`, `heading_structure=76`, `table_markup=79` |
| `pscan-14.pdf` | `69/D` | `table_markup=0`, `pdf_ua_compliance=63` |
| `pscan-16.pdf` | `69/D` | `table_markup=0`, `pdf_ua_compliance=71`, `heading_structure=80` |
| `pscan-17.pdf` | `69/D` | `table_markup=0`, `pdf_ua_compliance=71`, `heading_structure=80` |

## Diagnostics

`outside-holdout-low-row-diagnostic` returned:

- Decision: `plan_high_impact_targeted_diagnostic`
- Recommended lane: `table_target_resolution_needed`
- Mean all rows: `80.40`
- Raw points needed for mean `93`: `252`
- Timeout/error rows: `1`
- Lane split:
  - `table_target_resolution_needed`: `8` rows, `192` raw points
  - `timeout_or_error`: `1` row, `93` raw points
  - `reading_link_order_candidate`: `1` row, `14` raw points
  - `near_miss_monitor`: `1` row, `1` raw point

`table-target-resolution-diagnostic` over the eight table lows and same-source controls returned:

- Decision: `keep_table_target_resolution_diagnostic_only`
- Stable focus candidates: `pscan-08`, `pscan-17`
- Unsafe same-source control candidate: `pscan-13`
- Prior non-table target rows: `pscan-02`, `pscan-06`, `pscan-07`, `pscan-09`, `pscan-14`, `pscan-16`
- Classification counts: `8 control_or_high_grade_noise`, `6 non_table_target_attempt`, `3 stable_normalize_target`

The table/PDF-UA debt is real, especially on the corrections statistical overview reports. It is not yet safe for behavior promotion:

- Six of eight focus rows already showed prior table-tool attempts where targets resolved as non-table roles such as `Span`, `L`, `TD`, `LBody`, or `P`.
- A same-source control, `pscan-13`, also matched stable table-shape evidence.
- Earlier public-holdout table sequence probes repeatedly found PAC header-association regressions or no useful final movement from the same repair family.
- The single timeout row, `pscan-05`, is runtime/analyzer debt and should not be turned into scoring or remediation behavior without a separate timeout-tail lane.

## Decision

This holdout is diagnostic-only. It does not meet the source mean target, but the score-moving opportunity is dominated by a table target-resolution problem with unsafe control overlap and prior non-table target evidence. The reading/link row is only `14` raw points, and the timeout row requires a separate runtime/analyzer lane.

No source behavior was accepted, so no original-50 regression validation was required for this set. Downloaded public PDFs and generated local artifacts were deleted after metrics extraction.
