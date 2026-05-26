# U.S. Courts Judicial Business Tables Holdout - 2026-05-26

## Source

- Public source: `https://www.uscourts.gov/data-news/reports/statistical-reports/judicial-business-united-states-courts/judicial-business-2024/judicial-business-2024-tables`
- Sample: 20 official U.S. Courts Judicial Business 2024 statistical table PDFs.
- Size gate: all sampled PDFs were `application/pdf` and below the strict decimal `10,000,000` byte cap.
- Execution mode: Node 22 deterministic bounded validation, `--no-semantic`, `--no-pdfs`, row artifacts cleaned.

## Baseline Result

Run: `/mnt/pdf-review/public-holdouts/us-courts-judicial-business-tables-2026-05-26/run-r1/baseline_report.json`

- Count: `20/20`
- Mean: `91.15`
- Median: `95`
- Grades: `18 A / 0 B / 0 C / 0 D / 2 F`
- Rows below `93`: `2`
- Runtime p50/p95/max: `6892ms / 11191ms / 14815ms`
- `false_positive_applied`: `0`

The two low rows were:

- `uscjb24-01-supcourt_a1_0930.2024.pdf`: `59/F`, with `heading_structure=0`, `table_markup=0`.
- `uscjb24-04-jb_b1a_0930.2024.pdf`: `54/F`, with `heading_structure=0`, `table_markup=0`.

## Diagnostics

Low-row diagnostic selected `table_target_resolution_needed`; the source needed `37` raw points to reach mean `93`.

Table target-resolution diagnostic found a clean object-backed table signal:

- Stable focus candidates: `uscjb24-01`, `uscjb24-04`
- Unsafe same-source controls: `0`
- Same-source A controls classified as `control_or_high_grade_noise`: `18`
- Prior table tools had already run, but `normalize_table_structure` returned `no_effect` on the low rows.

Root cause: the table normalizer only promoted cells from the literal first `/TR`. In the low-row tables, leading `/TR` elements could be empty, so header promotion returned `no_effect` even though later rows contained real `/TD` cells.

Visible-title/heading-anchor diagnostic did not provide a safe heading behavior lane:

- `uscjb24-01`: `not_zero_heading_native_gap`
- `uscjb24-04`: `not_zero_heading_native_gap`

## Accepted Source Change

The accepted native repair is general and structural:

- `normalize_table_structure`, `repair_native_table_headers`, and `set_table_header_cells` now promote the first non-empty table row when leading `/TR` rows are empty.
- Header promotion immediately applies the existing deterministic table-header association logic, adding `/ID`, `/Scope`, and `/Headers` where the grid supports it.
- No scorer changes, PAC exceptions, source/filename gates, ODL/PAC/POC runtime calls, or semantic/LLM behavior changes were added.

## Candidate Result After Accepted Change

Run: `/mnt/pdf-review/public-holdouts/us-courts-judicial-business-tables-2026-05-26/run-r3-table-header-association-fix/baseline_report.json`

- Count: `20/20`
- Mean: `91.40`
- Median: `95`
- Grades: `18 A / 0 B / 0 C / 0 D / 2 F`
- Rows below `93`: `2`
- Runtime p50/p95/max: `7015ms / 12047ms / 17287ms`
- `false_positive_applied`: `0`

Movement:

- `uscjb24-04`: `54/F -> 59/F`; `table_markup=0 -> 44`.
- `uscjb24-01`: remained `59/F`, but table tools now produced object-backed header repairs instead of the previous no-effect path.

This source still does not meet the per-source mean `93` gate. The remaining debt is parked as a broader heading/table structure problem, not a safe candidate for further broadening from this sample alone.

## Original-50 Regression Gate

Run: `/mnt/pdf-review/pdfaf-validation/original50-leading-empty-table-header-fix-2026-05-26-r1/baseline_report.json`

- Count: `50/50`
- Mean: `94.24`
- Median: `95`
- Grades: `46 A / 2 B / 1 C / 0 D / 1 F`
- Rows below `93`: `5`
- Runtime p50/p95/max: `13589ms / 156270ms / 262227ms`
- Hard timeouts/errors: `0`
- `false_positive_applied`: `0`

Focused test/lint:

- `npx -y node@22 /usr/bin/pnpm exec vitest run tests/integration/tableNormalization.integration.test.ts`
- `npx -y node@22 /usr/bin/pnpm run lint`

## Decision

Accept the table/header repair-quality change as a general native fix with original-50 quality and speed passing. Do not claim this U.S. Courts source reached the `93` mean gate; it remains diagnostic evidence for unresolved heading/table structure debt.

Downloaded PDFs and generated reports remain local scratch artifacts and are not source assets.
