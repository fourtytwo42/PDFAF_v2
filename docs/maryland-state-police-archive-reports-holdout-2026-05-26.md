# Maryland State Police Archive Reports Holdout - 2026-05-26

## Source

- Official source page: https://mdsp.maryland.gov/about-us/archive-documents-reports-and-plans
- Selection: first 20 official Maryland State Police archive PDFs that passed the strict decimal `10,000,000` byte cap. Oversized archive PDFs were skipped with `curl --max-filesize 10000000`.
- Source mix: Maryland State Police annual reports, strategic plans, Uniform Crime Reports, use-of-force annual reviews, and cell-site simulator reports.

## Sample

| ID | File | Bytes | Description |
| --- | --- | ---: | --- |
| `mdsp-01` | `mdsp-01.pdf` | 8,063,166 | 2020 Annual Report |
| `mdsp-02` | `mdsp-02.pdf` | 2,571,978 | 2019 Annual Report |
| `mdsp-03` | `mdsp-03.pdf` | 3,218,421 | 2022 Strategic Plan |
| `mdsp-04` | `mdsp-04.pdf` | 3,458,857 | 2021 Strategic Plan |
| `mdsp-05` | `mdsp-05.pdf` | 4,193,698 | 2020 Strategic Plan |
| `mdsp-06` | `mdsp-06.pdf` | 3,142,696 | 2019 Strategic Plan |
| `mdsp-07` | `mdsp-07.pdf` | 8,304,791 | 2023 Uniform Crime Report |
| `mdsp-08` | `mdsp-08.pdf` | 3,271,552 | 2020 Uniform Crime Report |
| `mdsp-09` | `mdsp-09.pdf` | 3,285,873 | 2019 Uniform Crime Report |
| `mdsp-10` | `mdsp-10.pdf` | 3,158,247 | 2018 Uniform Crime Report |
| `mdsp-11` | `mdsp-11.pdf` | 2,923,789 | 2017 Uniform Crime Report |
| `mdsp-12` | `mdsp-12.pdf` | 771,396 | 2024 Use of Force Incidents |
| `mdsp-13` | `mdsp-13.pdf` | 630,897 | 2023 Use of Force Incidents |
| `mdsp-14` | `mdsp-14.pdf` | 623,700 | 2022 Use of Force Incidents |
| `mdsp-15` | `mdsp-15.pdf` | 629,003 | 2021 Use of Force Incidents |
| `mdsp-16` | `mdsp-16.pdf` | 626,038 | 2020 Use of Force Incidents |
| `mdsp-17` | `mdsp-17.pdf` | 1,027,386 | 2018 Use of Force Incidents |
| `mdsp-18` | `mdsp-18.pdf` | 405,949 | 2017 Use of Force Incidents |
| `mdsp-19` | `mdsp-19.pdf` | 105,291 | 2024 Cell Site Simulator Report |
| `mdsp-20` | `mdsp-20.pdf` | 58,258 | 2023 Cell Site Simulator Report |

## Validation

Command:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/bounded-holdout-validation.ts \
  /mnt/pdf-review/public-holdouts/maryland-state-police-archive-reports-2026-05-26/input \
  /mnt/pdf-review/public-holdouts/maryland-state-police-archive-reports-2026-05-26/run-r1 \
  --limit 20 \
  --cleanup-row-artifacts
```

Result:

- Completed: `20/20`
- Mean: `39.50 -> 93.25`
- Median after: `95`
- Grades after: `19 A / 0 B / 0 C / 0 D / 1 F`
- Rows below `93`: `1`
- Rows below `95`: `10`
- p50/p95/max runtime: `13529ms / 37619ms / 171123ms`
- Hard timeouts/errors: `0`
- `false_positive_applied=0`

Only low row:

| File | Result | Main residual evidence |
| --- | --- | --- |
| `mdsp-11.pdf` | `59/F` | `alt_text=0`, `title_language=50`, `pdf_ua_compliance=50`, `table_markup=79` |

## Diagnostics

`outside-holdout-low-row-diagnostic` returned:

- Decision: `holdout_target_met`
- Recommended lane: `table_target_resolution_needed`
- Raw points needed for mean `93`: `0`
- Residual low-row lane split:
  - `table_target_resolution_needed`: `1` row, `34` raw points

`table-target-resolution-diagnostic` over `mdsp-11` and same-source controls returned:

- Decision: `keep_table_target_resolution_diagnostic_only`
- Stable focus candidate: `mdsp-11`
- Unsafe same-source control candidate: `mdsp-13`
- Prior non-table target row: `mdsp-17`
- Reason: the single focus row is not enough for behavior promotion, same-source control evidence is not clean, and prior non-table table targeting remains a known risk.

## Decision

This holdout passed without source changes. The residual low row is useful evidence for table/alt/PDF-UA debt, but it does not justify a general behavior change:

- The source already meets the mean and median target.
- The only F row is a single focus row.
- Same-source controls show overlapping table-target evidence.
- The current diagnostics do not expose a safe general figure/alt or table transaction predicate.

No behavior was accepted, so no original-50 regression validation was required for this set. Downloaded public PDFs and generated local artifacts were deleted after metrics extraction.
