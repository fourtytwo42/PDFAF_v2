# Georgia JCAOC Annual Reports Holdout - 2026-05-26

## Source

- Source family: Georgia Judicial Council / Administrative Office of the Courts annual reports.
- Annual Reports index: `https://jcaoc.georgiacourts.gov/judicial-council-annual-reports/`
- Sample size: 20 PDFs under 10 MiB.
- Local artifacts: `/mnt/pdf-review/public-holdouts/georgia-jcaoc-annual-reports-2026-05-26/` during validation only; PDFs and generated run artifacts are not source-tracked.

The sample used official annual-report pages in descending report order. The annual-report pages embed their PDF files through a viewer URL, so the direct PDF URL was extracted from each report page. Candidates that exceeded the 10 MiB `curl --max-filesize` cap were skipped and the sample continued to the next annual report.

## Validation

Command:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/bounded-holdout-validation.ts \
  /mnt/pdf-review/public-holdouts/georgia-jcaoc-annual-reports-2026-05-26/input \
  /mnt/pdf-review/public-holdouts/georgia-jcaoc-annual-reports-2026-05-26/run-r1 \
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
| Mean before | 29.25 |
| Mean after | 89.05 |
| Median after | 94.5 |
| Grades after | 17 A / 0 B / 0 C / 0 D / 3 F |
| Rows below 93 | 3 |
| Timeout/error rows | 0 |
| `false_positive_applied` | 0 |
| Runtime p50 | 42,059 ms |
| Runtime p95 | 87,763 ms |
| Runtime max | 125,672 ms |

Rows below 93:

| Row | Baseline after | Runtime | Primary residual |
| --- | ---: | ---: | --- |
| `gajcaoc-07.pdf` | 59/F | 46,751 ms | Zero heading residual, no safe predicate from run artifact |
| `gajcaoc-08.pdf` | 51/F | 45,571 ms | Heading and reading-order residual |
| `gajcaoc-12.pdf` | 52/F | 59,074 ms | Heading and reading-order residual |

## Sample

The 20 valid under-10MiB PDFs downloaded from Georgia JCAOC annual-report pages were:

| Row | FY | Title | Bytes |
| --- | --- | --- | ---: |
| `gajcaoc-01` | FY25 | 52 Annual Report FY25 | 6,347,068 |
| `gajcaoc-02` | FY23 | 50 Annual Report FY23 | 6,546,493 |
| `gajcaoc-03` | FY22 | 49 Annual Report FY22 | 4,197,129 |
| `gajcaoc-04` | FY21 | 48 Annual Report FY21 | 4,165,184 |
| `gajcaoc-05` | FY20 | 47 Annual Report FY20 | 3,873,955 |
| `gajcaoc-06` | FY19 | 46 Annual Report FY19 | 5,924,562 |
| `gajcaoc-07` | FY18 | 45 Annual Report FY18 | 5,880,416 |
| `gajcaoc-08` | FY17 | 44 Annual Report FY17 | 9,412,072 |
| `gajcaoc-09` | FY16 | 43 Annual Report FY16 | 7,263,791 |
| `gajcaoc-10` | FY15 | 42 Annual Report FY15 | 2,287,895 |
| `gajcaoc-11` | FY14 | 41 Annual Report FY14 | 2,134,837 |
| `gajcaoc-12` | FY13 | 40 Annual Report FY13 | 9,105,607 |
| `gajcaoc-13` | FY12 | 39 Annual Report FY12 | 10,167,203 |
| `gajcaoc-14` | FY10 | 37 Annual Report FY10 | 7,175,020 |
| `gajcaoc-15` | FY09 | 36 Annual Report FY09 | 3,398,737 |
| `gajcaoc-16` | FY08 | 35 Annual Report FY08 | 3,595,307 |
| `gajcaoc-17` | FY07 | 34 Annual Report FY07 | 4,229,807 |
| `gajcaoc-18` | FY05 | 32 Annual Report FY05 | 9,849,053 |
| `gajcaoc-19` | FY04 | 31 Annual Report FY04 | 10,408,411 |
| `gajcaoc-20` | FY03 | 30 Annual Report FY03 | 9,425,516 |

Skipped by the 10MiB capped download guard:

| Candidate | FY | Reason |
| --- | --- | --- |
| 51 Annual Report | FY24 | `curl_failed_63` |
| 38 Annual Report | FY11 | `curl_failed_63` |
| 33 Annual Report | FY06 | `curl_failed_63` |

`curl_failed_63` is the capped download failure from `curl --max-filesize 10485760`.

## Diagnostics

Low-row diagnostic:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/outside-holdout-low-row-diagnostic.ts \
  --run /mnt/pdf-review/public-holdouts/georgia-jcaoc-annual-reports-2026-05-26/run-r1/baseline_report.json \
  --out /mnt/pdf-review/public-holdouts/georgia-jcaoc-annual-reports-2026-05-26/low-row-diagnostic-r1
```

Decision: `plan_high_impact_targeted_diagnostic`

Recommended lane: `reading_link_order_candidate`

Raw points needed for mean 93: `79`

Lane split:

| Lane | Rows | Raw points |
| --- | ---: | ---: |
| `reading_link_order_candidate` | 2 | 83 |
| `no_safe_predicate` | 1 | 34 |

Reading-order shell diagnostic:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/all-input-reading-order-shell-diagnostic.ts \
  --trace /mnt/pdf-review/public-holdouts/georgia-jcaoc-annual-reports-2026-05-26/run-r1/baseline_report.json \
  --out /mnt/pdf-review/public-holdouts/georgia-jcaoc-annual-reports-2026-05-26/reading-order-shell-diagnostic-r1
```

Result: `0` sequence candidates, `0` safe route controls, `0` selected rows, and `4` recovered routes with final orphan debt.

The recovered reading-order-shell rows were already A-grade rows and carried final orphan-MCID debt, so they are caution/control evidence rather than a behavior-promotion path.

Visible title/heading anchor diagnostic:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/all-input-visible-title-anchor-diagnostic.ts \
  --all-input /mnt/pdf-review/public-holdouts/georgia-jcaoc-annual-reports-2026-05-26/visible-title-lowest-rows.json \
  --input-root /mnt/pdf-review/public-holdouts/georgia-jcaoc-annual-reports-2026-05-26/input \
  --out /mnt/pdf-review/public-holdouts/georgia-jcaoc-annual-reports-2026-05-26/visible-title-anchor-diagnostic-r1 \
  --file gajcaoc-07 \
  --file gajcaoc-08 \
  --file gajcaoc-12
```

Result:

| Row | Classification | Notes |
| --- | --- | --- |
| `gajcaoc-07.pdf` | `not_zero_heading_native_gap` | Source analysis is `native_tagged`; internal visible anchor class `no_safe_candidate` |
| `gajcaoc-08.pdf` | `not_zero_heading_native_gap` | Source analysis is `native_tagged`; internal visible anchor class `degenerate_marked_content_no_candidate` |
| `gajcaoc-12.pdf` | `no_visible_title_evidence` | Source analysis is `native_untagged`, but there is no external visible title seed |

Low-row repeat:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/bounded-holdout-validation.ts \
  /mnt/pdf-review/public-holdouts/georgia-jcaoc-annual-reports-2026-05-26/low-repeat-input \
  /mnt/pdf-review/public-holdouts/georgia-jcaoc-annual-reports-2026-05-26/run-low-repeat-r1 \
  --limit 3 \
  --cleanup-row-artifacts
```

Repeat result:

| Row | Baseline after | Repeat after | Repeat runtime |
| --- | ---: | ---: | ---: |
| `gajcaoc-07.pdf` | 59/F | 59/F | 46,505 ms |
| `gajcaoc-08.pdf` | 51/F | 51/F | 45,673 ms |
| `gajcaoc-12.pdf` | 52/F | 52/F | 59,120 ms |

## Decision

No source behavior change was accepted from this holdout.

Reasons:

- The source is below the 93 mean target and has a meaningful stable low-row cluster, but the current diagnostics do not expose a safe general predicate.
- Reading-order-shell diagnostics found no sequence candidates for the low rows. The only recovered routes were A-grade controls with final orphan debt.
- Visible title/heading diagnostics found no content-backed heading seed for `gajcaoc-12` and no safe internal anchor for the two tagged zero-heading rows.
- The low-row repeat reproduced all three failures exactly, so this is stable heading/reading debt rather than route volatility.

No original-50 validation was required because no production scoring, planner, or mutation behavior changed.
