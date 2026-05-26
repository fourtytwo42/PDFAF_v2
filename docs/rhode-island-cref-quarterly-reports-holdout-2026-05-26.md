# Rhode Island Judiciary CREF Quarterly Reports Holdout - 2026-05-26

## Source

- Source page: https://www.courts.ri.gov/programs-services/Pages/racial-ethnic-fairness-quarterly-reports.aspx
- Sample: 20 official Rhode Island Judiciary Committee on Racial and Ethnic Fairness quarterly report PDFs.
- Size gate: every selected PDF was verified as an actual PDF under the strict decimal `10,000,000` byte cap before validation.
- Selection note: selected all listed quarterly report PDFs from 2025 through 2021.

## Sample

| Row | PDF |
| --- | --- |
| `ricref-01` | First Quarterly Report, March 31, 2025 |
| `ricref-02` | Second Quarterly Report, June 30, 2025 |
| `ricref-03` | Third Quarterly Report, September 30, 2025 |
| `ricref-04` | Fourth Quarterly Report, December 31, 2025 |
| `ricref-05` | First Quarterly Report, March 31, 2024 |
| `ricref-06` | Second Quarterly Report, June 30, 2024 |
| `ricref-07` | Third Quarterly Report, September 30, 2024 |
| `ricref-08` | Fourth Quarterly Report, December 31, 2024 |
| `ricref-09` | First Quarterly Report, March 31, 2023 |
| `ricref-10` | Second Quarterly Report, June 30, 2023 |
| `ricref-11` | Third Quarterly Report, September 30, 2023 |
| `ricref-12` | Fourth Quarterly Report, December 31, 2023 |
| `ricref-13` | First Quarterly Report, March 31, 2022 |
| `ricref-14` | Second Quarterly Report, June 30, 2022 |
| `ricref-15` | Third Quarterly Report, September 30, 2022 |
| `ricref-16` | Fourth Quarterly Report, December 31, 2022 |
| `ricref-17` | First Quarterly Report, March 31, 2021 |
| `ricref-18` | Second Quarterly Report, June 30, 2021 |
| `ricref-19` | Third Quarterly Report, September 30, 2021 |
| `ricref-20` | Fourth Quarterly Report, December 31, 2021 |

## Validation

Command:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/bounded-holdout-validation.ts \
  /mnt/pdf-review/public-holdouts/rhode-island-cref-quarterly-reports-2026-05-26/input \
  /mnt/pdf-review/public-holdouts/rhode-island-cref-quarterly-reports-2026-05-26/run-r1 \
  --limit 20 \
  --cleanup-row-artifacts
```

Result:

- Processed: `20/20`
- Mean before: `46.55`
- Mean after: `97.80`
- Median after: `98`
- Grades after: `20 A / 0 B / 0 C / 0 D / 0 F`
- Rows below `93`: `0`
- Rows below `95`: `1`
- p50/p95/max: `7409ms / 12704ms / 13101ms`
- Timeout/error rows: `0`
- `false_positive_applied`: `0`

Rows:

| Row | Before | After | Runtime |
| --- | ---: | ---: | ---: |
| `ricref-01` | `50/F` | `98/A` | `12704ms` |
| `ricref-02` | `50/F` | `98/A` | `8917ms` |
| `ricref-03` | `50/F` | `98/A` | `8840ms` |
| `ricref-04` | `50/F` | `98/A` | `9571ms` |
| `ricref-05` | `49/F` | `98/A` | `7551ms` |
| `ricref-06` | `50/F` | `98/A` | `8418ms` |
| `ricref-07` | `50/F` | `99/A` | `7896ms` |
| `ricref-08` | `50/F` | `98/A` | `9203ms` |
| `ricref-09` | `49/F` | `98/A` | `6571ms` |
| `ricref-10` | `49/F` | `98/A` | `6683ms` |
| `ricref-11` | `49/F` | `98/A` | `8589ms` |
| `ricref-12` | `44/F` | `97/A` | `6459ms` |
| `ricref-13` | `47/F` | `95/A` | `7409ms` |
| `ricref-14` | `49/F` | `98/A` | `6442ms` |
| `ricref-15` | `44/F` | `98/A` | `6254ms` |
| `ricref-16` | `49/F` | `98/A` | `6565ms` |
| `ricref-17` | `10/F` | `94/A` | `13101ms` |
| `ricref-18` | `49/F` | `99/A` | `6404ms` |
| `ricref-19` | `49/F` | `99/A` | `6359ms` |
| `ricref-20` | `44/F` | `99/A` | `6335ms` |

## Diagnostics

No follow-up low-row diagnostic was run because the holdout already exceeded the target with no rows below `93`, no hard errors, and no false positives.

The only row below `95` was `ricref-17` at `94/A`; its lowest visible categories were `reading_order=79`, `pdf_ua_compliance=80`, and `text_extractability=96`. This is not enough to justify a scoring or remediation change.

## Decision

No source change was accepted for this holdout.

The current engine handles this Rhode Island Judiciary CREF quarterly-report set well: all rows reached A grade, the mean is comfortably above `93`, runtime was bounded, and `false_positive_applied` stayed `0`.

No original-50 validation was required because no scoring, planning, remediation, API, or Docker behavior changed. Downloaded PDFs and generated validation artifacts are local scratch only and should be deleted after this report is recorded.
