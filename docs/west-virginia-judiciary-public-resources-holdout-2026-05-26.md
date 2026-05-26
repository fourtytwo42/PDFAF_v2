# West Virginia Judiciary Public Resources Holdout - 2026-05-26

## Source

- Source family: West Virginia Judiciary public resources.
- Primary source index: `https://www.courtswv.gov/public-resources/news-publications/publications`
- Supplemental same-agency source index: `https://www.courtswv.gov/public-resources/court-forms`
- Sample size: 20 PDFs under 10 MiB.
- Local artifacts: `/mnt/pdf-review/public-holdouts/west-virginia-judiciary-publications-2026-05-26/` during validation only; PDFs and generated run artifacts are not source-tracked.

The publications page provided 15 annual/statistical/publication PDFs under the 10 MiB cap. The final five rows were filled from the same West Virginia Judiciary public resources surface, including one public court form, to keep the source family official and under cap.

## Validation

Command:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/bounded-holdout-validation.ts \
  /mnt/pdf-review/public-holdouts/west-virginia-judiciary-publications-2026-05-26/input \
  /mnt/pdf-review/public-holdouts/west-virginia-judiciary-publications-2026-05-26/run-r1 \
  --limit 20 \
  --cleanup-row-artifacts
```

Run mode:

- deterministic
- `--no-semantic`
- `--no-pdfs`
- single bounded holdout worker

Results:

| Metric | Value |
| --- | ---: |
| Processed | 20/20 |
| Mean before | 53.90 |
| Mean after | 95.20 |
| Median after | 96 |
| Grades after | 19 A / 1 B / 0 C / 0 D / 0 F |
| Rows below 93 | 1 |
| Timeout/error rows | 0 |
| `false_positive_applied` | 0 |
| Runtime p50 | 20,675 ms |
| Runtime p95 | 79,812 ms |
| Runtime max | 83,716 ms |

Rows below 93:

| Row | Baseline after | Lowest categories |
| --- | ---: | --- |
| `wvjud-17.pdf` | 85/B | `reading_order=70`, `heading_structure=79`, `pdf_ua_compliance=79`, `table_markup=79`, `alt_text=82`, `bookmarks=94` |

## Sample

The 20 valid under-10MiB PDFs downloaded from West Virginia Judiciary public resources were:

| Row | Title | Bytes |
| --- | --- | ---: |
| `wvjud-01` | 2025 Statistical Report | 1,372,018 |
| `wvjud-02` | 2024 Annual Report | 6,001,639 |
| `wvjud-03` | 2024 Supreme Court Annual Statistics Report | 3,122,181 |
| `wvjud-04` | 2023 Supreme Court Annual Statistical Report | 762,975 |
| `wvjud-05` | 2022 Supreme Court Annual Statistical Report | 713,238 |
| `wvjud-06` | 2021 Supreme Court Annual Statistical Report | 595,957 |
| `wvjud-07` | 2021 Supreme Court Annual Report | 4,189,737 |
| `wvjud-08` | 2020 Supreme Court Annual Statistical Report | 739,070 |
| `wvjud-09` | 2019 Supreme Court Annual Statistical Report | 683,469 |
| `wvjud-10` | 2018 Supreme Court Annual Statistical Report | 741,876 |
| `wvjud-11` | 2017 Supreme Court Annual Statistical Report | 1,453,024 |
| `wvjud-12` | 2016 Supreme Court Annual Statistical Report | 807,660 |
| `wvjud-13` | 2015 Supreme Court Annual Statistical Report | 445,281 |
| `wvjud-14` | 2014 Supreme Court Annual Statistical Report | 442,787 |
| `wvjud-15` | 2012 Supreme Court Annual Report | 9,780,969 |
| `wvjud-16` | Pocket Constitution of West Virginia | 3,370,515 |
| `wvjud-17` | Criminal Records in West Virginia | 5,344,052 |
| `wvjud-18` | Supreme Court of Appeals Strategic Plan Summary | 1,156,118 |
| `wvjud-19` | 2024 Interest Rate Order | 53,116 |
| `wvjud-20` | Certification of Completion Court Form | 210,462 |

Skipped candidates:

| Title | Reason |
| --- | --- |
| 2023 Annual Report | Exceeded the 10 MiB cap or failed the capped download |
| 2022 Supreme Court Annual Report | Exceeded the 10 MiB cap or failed the capped download |
| 2013 Supreme Court Annual Report | Exceeded the 10 MiB cap or failed the capped download |
| 2011 Supreme Court Annual Report | Exceeded the 10 MiB cap or failed the capped download |
| 2010 Supreme Court Annual Report | Exceeded the 10 MiB cap or failed the capped download |
| 2009 Supreme Court Annual Report | Exceeded the 10 MiB cap or failed the capped download |
| Supreme Court of Appeals Strategic Plan | Exceeded the 10 MiB cap or failed the capped download |
| 2023 West Virginia Supreme Court of Appeals Court Brochure | Exceeded the 10 MiB cap or failed the capped download |

## Diagnostics

Low-row diagnostic:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/outside-holdout-low-row-diagnostic.ts \
  --run /mnt/pdf-review/public-holdouts/west-virginia-judiciary-publications-2026-05-26/run-r1/baseline_report.json \
  --out /mnt/pdf-review/public-holdouts/west-virginia-judiciary-publications-2026-05-26/low-row-diagnostic-r1
```

Decision: `holdout_target_met`

Recommended lane: `reading_link_order_candidate`

Raw points needed for mean 93: `0`

The only row below 93, `wvjud-17.pdf`, is an 8-point reading/link-order residual. The source already clears the 93 mean target and the candidate is a single low-upside row, so it does not justify production behavior changes.

## Decision

No source behavior change was accepted from this holdout.

Reasons:

- The source clears the 93 mean target: mean `95.20`, median `96`.
- `false_positive_applied=0`, with no timeout/error rows and bounded runtime.
- The only low row is a single B-grade reading/link-order residual and the source needs `0` raw points for the mean target.
- No general, control-validated remediation predicate was required or supported by this source.

No original-50 validation was required because no production scoring, planner, or mutation behavior changed.
