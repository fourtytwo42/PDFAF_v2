# Rhode Island State Police Public Information Holdout - 2026-05-26

## Source

- Official source page: https://risp.ri.gov/public-information
- Selection: 20 official Rhode Island State Police PDFs under the strict decimal `10,000,000` byte cap.
- Source mix: PREA audit reports, State Police annual reports, holding-facility reviews, rules/regulations, and one organizational chart.
- Fetch note: the local downloader used bounded `curl` calls with `--connect-timeout 10`, `--max-time 60`, and `--max-filesize 10000000` so one slow media link could not block the batch. The advertised 2020 annual report was skipped because the source page listed it as about `12mb`.

## Sample

| ID | File | Bytes | Description |
| --- | --- | ---: | --- |
| `risp-01` | `risp-01.pdf` | 402,547 | 2026 PREA Audit Final Report for RISP Hope Valley Barracks |
| `risp-02` | `risp-02.pdf` | 402,091 | 2026 PREA Audit Final Report for RISP Lincoln Woods Barracks |
| `risp-03` | `risp-03.pdf` | 401,577 | 2026 PREA Audit Final Report for RISP Scituate Barracks |
| `risp-04` | `risp-04.pdf` | 402,079 | 2026 PREA Audit Final Report for RISP Wickford Barracks |
| `risp-05` | `risp-05.pdf` | 4,861,882 | 2025 Rhode Island State Police Annual Report |
| `risp-06` | `risp-06.pdf` | 5,790,750 | 2024 Rhode Island State Police Annual Report |
| `risp-07` | `risp-07.pdf` | 5,157,106 | 2023 Rhode Island State Police Annual Report |
| `risp-08` | `risp-08.pdf` | 2,559,588 | 2022 Rhode Island State Police Annual Report |
| `risp-09` | `risp-09.pdf` | 2,676,979 | 2021 Rhode Island State Police Annual Report |
| `risp-10` | `risp-10.pdf` | 1,536,761 | 2019 Rhode Island State Police Annual Report |
| `risp-11` | `risp-11.pdf` | 116,207 | Annual Review of Holding Facilities - CY 2025 |
| `risp-12` | `risp-12.pdf` | 423,086 | Annual Review of Holding Facilities - CY 2022 |
| `risp-13` | `risp-13.pdf` | 100,711 | Rules and Regulations for RI State Police Sworn Members |
| `risp-14` | `risp-14.pdf` | 348,349 | PREA Audit Final Report for RISP Lincoln Woods Barracks November 2023 |
| `risp-15` | `risp-15.pdf` | 346,071 | PREA Audit Final Report for RISP Hope Valley Barracks November 2023 |
| `risp-16` | `risp-16.pdf` | 350,543 | PREA Audit Final Report for RISP Scituate Barracks November 2023 |
| `risp-17` | `risp-17.pdf` | 347,633 | PREA Audit Final Report for RISP Wickford Barracks November 2023 |
| `risp-18` | `risp-18.pdf` | 238,066 | PREA Audit Report - Hope Valley |
| `risp-19` | `risp-19.pdf` | 238,147 | PREA Audit Report - Lincoln Woods |
| `risp-20` | `risp-20.pdf` | 122,526 | Rhode Island State Police Organizational Chart |

## Validation

Command:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/bounded-holdout-validation.ts \
  /mnt/pdf-review/public-holdouts/rhode-island-state-police-public-information-2026-05-26/input \
  /mnt/pdf-review/public-holdouts/rhode-island-state-police-public-information-2026-05-26/run-r1 \
  --limit 20 \
  --cleanup-row-artifacts
```

Result:

- Completed: `20/20`
- Mean: `60.45 -> 84.80`
- Median after: `93.5`
- Grades after: `12 A / 0 B / 0 C / 8 D / 0 F`
- Rows below `93`: `9`
- Rows below `95`: `11`
- p50/p95/max runtime: `20791ms / 28696ms / 31983ms`
- Hard timeouts/errors: `0`
- `false_positive_applied=0`

Low rows:

| File | Result | Main residual evidence |
| --- | --- | --- |
| `risp-14.pdf` | `68/D` | `table_markup=0`, `heading_structure=60`, `pdf_ua_compliance=71`, `reading_order=88` |
| `risp-15.pdf` | `68/D` | `table_markup=0`, `heading_structure=60`, `pdf_ua_compliance=71`, `reading_order=88` |
| `risp-16.pdf` | `68/D` | `table_markup=0`, `heading_structure=60`, `pdf_ua_compliance=71`, `reading_order=88` |
| `risp-17.pdf` | `68/D` | `table_markup=0`, `heading_structure=60`, `pdf_ua_compliance=71`, `reading_order=88` |
| `risp-01.pdf` | `69/D` | `table_markup=0`, `heading_structure=60`, `pdf_ua_compliance=71` |
| `risp-02.pdf` | `69/D` | `table_markup=0`, `heading_structure=60`, `pdf_ua_compliance=71` |
| `risp-03.pdf` | `69/D` | `table_markup=0`, `heading_structure=60`, `pdf_ua_compliance=71` |
| `risp-04.pdf` | `69/D` | `table_markup=0`, `heading_structure=60`, `pdf_ua_compliance=71` |
| `risp-08.pdf` | `92/A` | `heading_structure=79`, `pdf_ua_compliance=79`, `table_markup=79` |

## Diagnostics

`outside-holdout-low-row-diagnostic` returned:

- Decision: `plan_high_impact_targeted_diagnostic`
- Recommended lane: `table_target_resolution_needed`
- Raw points needed for mean `93`: `164`
- Lane split:
  - `table_target_resolution_needed`: `8` rows, `196` raw points
  - `near_miss_monitor`: `1` row, `1` raw point

`table-target-resolution-diagnostic` over the eight low PREA audit rows plus same-source controls returned:

- Decision: `keep_table_target_resolution_diagnostic_only`
- Stable focus candidates: `risp-01`, `risp-02`, `risp-03`, `risp-04`, `risp-14`, `risp-15`, `risp-16`, and `risp-17`
- Unsafe same-source control candidate: `risp-05`
- Prior non-table target rows: `risp-06` and `risp-07`
- Classification counts: `9 stable_normalize_target`, `2 non_table_target_attempt`, `4 control_or_high_grade_noise`

The eight low PREA rows have real object-backed table debt, but current table tools already rejected or no-effected on them:

- `normalize_table_structure`: repeated `rejected` due `pac_rule_regressed(pdfua.table.header_association_present)`
- `repair_native_table_headers`: repeated `rejected` due `pac_rule_regressed(pdfua.table.header_association_present)`
- `set_table_header_cells`: repeated `no_effect` with `no_structural_change`

The table predicate is not clean enough to promote from this set. It also matches `risp-05`, which the current engine already repairs to `95/A`, and `risp-06`/`risp-07` show prior table operations resolving to non-table `P` targets.

## Decision

This holdout is diagnostic-only. It exposes a consistent outside-source table/header transaction gap on PREA audit reports, but it does not justify a general behavior change yet:

- The source misses the `93` mean target by `164` raw points.
- The high-impact lows are table/PAC-header rows, not timeout rows.
- Existing table tools are blocked by PAC-visible header-association regressions or no-effect states.
- Same-source controls show that broadening table admission would not be selective enough.
- No scoring, PAC, source-specific, filename-specific, row-specific, or timeout behavior was changed.

No source change was accepted, so no original-50 regression validation was required for this set. Downloaded public PDFs and generated local artifacts were deleted after metrics extraction.
