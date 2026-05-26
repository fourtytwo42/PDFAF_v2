# Missouri Attorney General Vehicle Stops Reports Holdout - 2026-05-26

## Source

- Source page: https://ago.mo.gov/get-help/vehicle-stops-report/
- Sample: 20 official Missouri Attorney General Vehicle Stops Report PDFs.
- Size gate: every selected PDF was verified as an actual PDF under the strict decimal `10,000,000` byte cap before validation.
- Selection note: selected current annual/state report PDFs, archived executive summaries, agency responses/comments, and one archived analysis PDF. Forms/templates, statute/regulation references, and oversized agency-specific reports were excluded.

## Sample

| Row | PDF |
| --- | --- |
| `moagvsr-01` | 2024 Vehicle Stops Annual Report |
| `moagvsr-02` | 2024 VSR Annual State Report |
| `moagvsr-03` | 2024 Agency Responses |
| `moagvsr-04` | 2023 VSR Annual State Report |
| `moagvsr-05` | 2023 VSR Agency Notes |
| `moagvsr-06` | 2022 Vehicle Stops Report Executive Summary |
| `moagvsr-07` | 2022 VSR State Report |
| `moagvsr-08` | 2022 Agency Comments |
| `moagvsr-09` | 2021 VSR Statewide |
| `moagvsr-10` | 2021 VSR Agency Comments |
| `moagvsr-11` | 2020 VSR Statewide |
| `moagvsr-12` | 2020 VSR Agency Comments |
| `moagvsr-13` | 2019 Vehicle Stops Executive Summary |
| `moagvsr-14` | 2018 Vehicle Stops Executive Summary |
| `moagvsr-15` | 2017 Vehicle Stops Executive Summary |
| `moagvsr-16` | 2016 Vehicle Stops Executive Summary |
| `moagvsr-17` | 2015 Vehicle Stops Executive Summary |
| `moagvsr-18` | 2014 Vehicle Stops Executive Summary |
| `moagvsr-19` | 2013 Vehicle Stops Analysis by Attorney General Koster |
| `moagvsr-20` | 2019 Vehicle Stops Appendix B |

## Validation

Command:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/bounded-holdout-validation.ts \
  /mnt/pdf-review/public-holdouts/missouri-ag-vehicle-stops-reports-2026-05-26/input \
  /mnt/pdf-review/public-holdouts/missouri-ag-vehicle-stops-reports-2026-05-26/run-r1 \
  --limit 20 \
  --cleanup-row-artifacts
```

Result:

- Processed: `20/20`
- Mean: `95.50`
- Median: `96`
- Grades: `20 A / 0 B / 0 C / 0 D / 0 F`
- Rows below `93`: `1`
- Rows below `95`: `6`
- p50/p95/max: `23853ms / 78720ms / 218867ms`
- Timeout/error rows: `0`
- `false_positive_applied`: `0`

Rows:

| Row | Before | After | Runtime |
| --- | ---: | ---: | ---: |
| `moagvsr-01` | `34/F` | `97/A` | `25931ms` |
| `moagvsr-02` | `35/F` | `96/A` | `25908ms` |
| `moagvsr-03` | `35/F` | `95/A` | `7956ms` |
| `moagvsr-04` | `35/F` | `96/A` | `23853ms` |
| `moagvsr-05` | `35/F` | `93/A` | `71144ms` |
| `moagvsr-06` | `34/F` | `97/A` | `31864ms` |
| `moagvsr-07` | `35/F` | `95/A` | `33948ms` |
| `moagvsr-08` | `35/F` | `93/A` | `78720ms` |
| `moagvsr-09` | `35/F` | `95/A` | `23806ms` |
| `moagvsr-10` | `35/F` | `93/A` | `72001ms` |
| `moagvsr-11` | `34/F` | `98/A` | `32764ms` |
| `moagvsr-12` | `35/F` | `91/A` | `218867ms` |
| `moagvsr-13` | `25/F` | `98/A` | `18230ms` |
| `moagvsr-14` | `29/F` | `97/A` | `13453ms` |
| `moagvsr-15` | `29/F` | `94/A` | `23368ms` |
| `moagvsr-16` | `20/F` | `97/A` | `17654ms` |
| `moagvsr-17` | `24/F` | `97/A` | `13520ms` |
| `moagvsr-18` | `29/F` | `97/A` | `13697ms` |
| `moagvsr-19` | `25/F` | `98/A` | `20563ms` |
| `moagvsr-20` | `34/F` | `93/A` | `30662ms` |

## Diagnostics

Low-row diagnostic:

- Decision: `holdout_target_met`
- Recommended lane: `none`
- Raw points needed for source mean `93`: `0`
- Timeout/error rows: `0`
- The only below-93 row was `moagvsr-12` at `91/A`, classified as `near_miss_monitor`.
- Lowest categories for `moagvsr-12`: `text_extractability=76`, `heading_structure=94`, `bookmarks=100`, `link_quality=100`, `pdf_ua_compliance=100`, `reading_order=100`.

## Decision

No source change was accepted for this holdout.

The current engine handles this Missouri AG report set well: all rows reached A grade, the mean is comfortably above `93`, and there were no hard errors or false positives. The single low-priority near miss does not expose enough general, object-backed evidence to justify a scoring or remediation change.

No original-50 validation was required because no scoring, planning, remediation, API, or Docker behavior changed. Downloaded PDFs and generated validation artifacts are local scratch only and should be deleted after this report is recorded.
