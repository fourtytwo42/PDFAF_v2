# Texas LBB Public Safety and Criminal Justice Holdout - 2026-05-26

## Source

- Source page: https://www.lbb.texas.gov/Public_Safety_Criminal_Justice.aspx
- Sample: first 20 unique PDF links in page order from the Texas Legislative Budget Board Public Safety and Criminal Justice publications page.
- Size gate: every selected PDF was verified as an actual PDF under the strict decimal `10,000,000` byte cap before validation.

## Sample

| Row | PDF |
| --- | --- |
| `txlbb-01` | Biennial Report on Adult Criminal Justice Populations Fiscal Years 2018 to 2030 |
| `txlbb-02` | Biennial Report on Juvenile Justice Populations Fiscal Years 2018 to 2030 |
| `txlbb-03` | HB 2086 Annual Criminal Justice Policy Impact Statement, December 2024 |
| `txlbb-04` | Adult and Juvenile Correctional Population Projections Fiscal Years 2024 to 2028 |
| `txlbb-05` | HB 2086 Annual Criminal Justice Policy Impact Statement, December 2023 |
| `txlbb-06` | Adult and Juvenile Correctional Populations: Monthly Report, FY 2023 |
| `txlbb-07` | Statewide Criminal and Juvenile Justice Recidivism and Revocation Rates, February 2023 |
| `txlbb-08` | Adult and Juvenile Correctional Population Projections Fiscal Years 2023 to 2028 |
| `txlbb-09` | Criminal and Juvenile Justice Uniform Cost Report Fiscal Years 2021 and 2022 |
| `txlbb-10` | HB 2086 Annual Criminal Justice Policy Impact Statement, December 2022 |
| `txlbb-11` | Adult and Juvenile Correctional Populations: Monthly Report, FY 2022 |
| `txlbb-12` | Texas Juvenile Justice Department: Historical Funding, Cost Per Day, and Projected Populations |
| `txlbb-13` | Adult and Juvenile Correctional Population Projections Fiscal Years 2022 to 2027 |
| `txlbb-14` | Historical Appropriations GR-D Accounts Crime Victims Compensation Fund 469 and Sexual Assault Fund 5010 |
| `txlbb-15` | Border Security Appropriations and Reporting Requirements, July 2022 |
| `txlbb-16` | School Safety Programs and Funding, 86th and 87th Legislatures |
| `txlbb-17` | Border Security Appropriations and Reporting Requirements, May 2022 |
| `txlbb-18` | Border Security Expenditures: 2020-2021 and 2022-2023 through 1st Quarter |
| `txlbb-19` | Border Security Appropriations, March 2022 |
| `txlbb-20` | HB 2086 Annual Criminal Justice Policy Impact Statement, November 2021 |

## Validation

Command:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/bounded-holdout-validation.ts \
  /mnt/pdf-review/public-holdouts/texas-lbb-monthly-correctional-population-2026-05-26/input \
  /mnt/pdf-review/public-holdouts/texas-lbb-monthly-correctional-population-2026-05-26/run-r1 \
  --limit 20 \
  --cleanup-row-artifacts
```

Result:

- Processed: `20/20`
- Mean: `88.10`
- Median: `94`
- Grades: `18 A / 0 B / 0 C / 0 D / 1 F / 1 timeout`
- Rows below `93`: `5`
- p50/p95/max: `10327ms / 164907ms / 300007ms`
- Timeout/error rows: `txlbb-11`
- `false_positive_applied`: `0`

Low rows:

| Row | Score | Main residual |
| --- | ---: | --- |
| `txlbb-05` | `51/F` | degenerate tagged shell, no extracted text/MCID anchor |
| `txlbb-06` | `92/A` | near miss in primary run, table/runtime volatile on repeat |
| `txlbb-11` | `0/?` | primary 300s timeout; repeats as table/heading F |
| `txlbb-14` | `92/A` | near-miss heading debt |
| `txlbb-17` | `91/A` | near-miss table/header debt |

## Repeats

Timeout repeat:

- `txlbb-11` completed in `266401ms` at `59/F`.
- Residuals: `heading_structure=0`, `table_markup=16`, `pdf_ua_compliance=57`, `alt_text=85`.
- Repeat confirms the primary timeout was volatile, but the row still carries real table/heading debt.

Low-row repeat excluding the timeout row:

| Row | Primary | Repeat | Note |
| --- | ---: | ---: | --- |
| `txlbb-05` | `51/F` | `51/F` | stable hard failure |
| `txlbb-06` | `92/A` | `59/F` | negative runtime/route volatility |
| `txlbb-14` | `92/A` | `92/A` | stable near miss |
| `txlbb-17` | `91/A` | `91/A` | stable near miss |

Replacing only the primary timeout with the repeat score projects the source to about `91.05`, still below `93`. Counting the negative repeat on `txlbb-06` lowers that projection further, so this source should not be treated as virtually passing.

## Diagnostics

Low-row diagnostic:

- Decision: `plan_high_impact_targeted_diagnostic`
- Primary recommended lane: `reading_link_order_candidate`
- Raw points needed for source mean `93`: `98`
- Timeout row contribution: `93` raw points

Reading-order shell diagnostic:

- `safeRouteControlCount`: `0`
- `sequenceCandidateCount`: `0`
- `finalOrphanDebtCount`: `0`
- Selected rows: none

Native snapshot probe:

- `txlbb-05` is `native_tagged`, two pages, `textCharCount=0`, `treeDepth=0`, `mcidSpans=0`, `layoutHeadingCandidateCount=0`, and classified `degenerate_marked_content_no_candidate` because it has no safe MCID/content anchor.
- `txlbb-06` and `txlbb-11` are native tagged monthly reports with hundreds of layout heading candidates and dense table signals, but `classifyStage127ZeroHeadingAnchor` returns `no_safe_candidate` with no visible heading anchor.
- `txlbb-17` has a small stable table target and heading near miss, but it is only a two-point row.

Table target-resolution diagnostic over this source:

- Decision: `plan_table_target_behavior_proof`
- Stable focus candidates: `txlbb-11`, `txlbb-17`
- Prior non-table target row: `txlbb-06`
- Sampled controls `txlbb-01`, `txlbb-02`, `txlbb-04`, and `txlbb-07` did not match the target predicate.
- Behavior was not promoted because existing table tools already fired on the focus rows: `txlbb-11` retained major table/heading debt and later table operations hit `pdfua.table.header_association_present` PAC regression, while `txlbb-17` remained a near miss and had a `pdfua.content.orphan_mcids_absent` PAC regression on `normalize_table_structure`.

## Decision

No source change was accepted for this holdout.

The source exposes useful future evidence for a narrow table transaction project, especially around monthly correctional population reports. It does not justify an immediate remediation change because the high-impact rows are either runtime/route volatile, lack a safe heading anchor, or already tried the relevant table tools and remained blocked by PAC regressions or no-effect outcomes. Broadening table or reading behavior from this sample would risk overfitting and would require a separate behavior-proof stage with controls and original-50 validation.

No original-50 validation was required because no scoring, planning, remediation, or API behavior changed. Downloaded PDFs and generated validation artifacts are local scratch only and should be deleted after this report is recorded.
