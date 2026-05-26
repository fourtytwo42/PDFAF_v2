# New Hampshire LBA Performance Audit Reports Holdout - 2026-05-26

## Source

- Source family: New Hampshire Legislative Budget Assistant performance audit reports.
- Source index: `https://www.gc.nh.gov/lba/AuditReports/PerformanceReports.aspx`
- Sample size: 20 PDFs under 10 MiB.
- Local artifacts: `/mnt/pdf-review/public-holdouts/new-hampshire-lba-audit-reports-2026-05-26/` during validation only; PDFs and generated run artifacts are not source-tracked.

The sample used the newest official performance-audit report PDFs from the New Hampshire Legislative Budget Assistant Performance Reports index. Navigation links and duplicate "entire report" links were skipped. Two candidates exceeded the 10 MiB capped-download guard, so selection continued down the same index until 20 under-cap PDFs were available.

## Validation

Command:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/bounded-holdout-validation.ts \
  /mnt/pdf-review/public-holdouts/new-hampshire-lba-audit-reports-2026-05-26/input \
  /mnt/pdf-review/public-holdouts/new-hampshire-lba-audit-reports-2026-05-26/run-r1 \
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
| Mean before | 39.15 |
| Mean after | 88.10 |
| Median after | 94.5 |
| Grades after | 16 A / 0 B / 0 C / 1 D / 3 F |
| Rows below 93 | 5 |
| Timeout/error rows | 0 |
| `false_positive_applied` | 0 |
| Runtime p50 | 32,091 ms |
| Runtime p95 | 194,328 ms |
| Runtime max | 264,443 ms |

Rows below 93:

| Row | Baseline after | Runtime | Primary residual |
| --- | ---: | ---: | --- |
| `nhlba-02.pdf` | 57/F | 71,977 ms | `heading_structure=0`, `table_markup=0`, table/PDF-UA debt |
| `nhlba-08.pdf` | 59/F | 194,328 ms | `heading_structure=0`, `table_markup=0`, table/PDF-UA debt |
| `nhlba-10.pdf` | 59/F | 264,443 ms | `heading_structure=0`, `table_markup=0`, table/PDF-UA debt |
| `nhlba-11.pdf` | 69/D | 84,073 ms | table/header debt with prior non-table target attempt |
| `nhlba-12.pdf` | 90/A | 117,729 ms | near-miss table/PDF-UA debt with prior non-table target attempt |

## Sample

The 20 valid under-10MiB PDFs downloaded from the New Hampshire LBA performance audit reports index were:

| Row | Title | Bytes |
| --- | --- | ---: |
| `nhlba-01` | Commission for Human Rights - February 2025 | 3,037,979 |
| `nhlba-02` | Special Education Dispute Resolution Processes - March 2024 | 3,491,849 |
| `nhlba-03` | Mental Health Workforce Licensing - October 2023 | 1,262,955 |
| `nhlba-04` | Weatherization Assistance Program - March 2023 | 1,524,830 |
| `nhlba-05` | Child Care Licensing Unit - February 2022 | 2,068,815 |
| `nhlba-06` | Sununu Youth Services Center - March 2021 | 8,437,284 |
| `nhlba-07` | Bureau of Vocational Rehabilitation - February 2021 | 1,709,028 |
| `nhlba-08` | Liquor Commission, Division of Enforcement and Licensing - February 2021 | 4,637,883 |
| `nhlba-09` | Therapeutic Cannabis Program - June 2019 | 898,518 |
| `nhlba-10` | Wetlands Bureau Permitting - May 2019 | 7,222,942 |
| `nhlba-11` | New Hampshire Adult Parole Board - April 2019 | 1,070,648 |
| `nhlba-12` | Police Standards and Training Council - February 2019 | 1,263,139 |
| `nhlba-13` | Department of Environmental Services, Air Resources Division - May 2018 | 1,435,523 |
| `nhlba-14` | Department of Information Technology - March 2018 | 1,600,707 |
| `nhlba-15` | Office of Professional Licensure and Certification, Real Estate Commission - September 2017 | 3,435,909 |
| `nhlba-16` | Community College System of New Hampshire - August 2017 | 1,059,628 |
| `nhlba-17` | Office of Professional Licensure and Certification, Naturopathic Board of Examiners - April 2017 | 1,252,981 |
| `nhlba-18` | Department of Corrections, Sexual Offender Treatment Program - November 2016 | 860,112 |
| `nhlba-19` | Department of Transportation, Bridge Maintenance - September 2016 | 1,284,621 |
| `nhlba-20` | Department of Safety, Division of Homeland Security and Emergency Management - August 2016 | 5,524,427 |

Skipped candidates:

| Title | Reason |
| --- | --- |
| Board of Dental Examiners, Office of Professional Licensure and Certification Performance Audit Report November 2022 | Capped download failed or exceeded 10 MiB |
| Board of Pharmacy, Controlled Drug Prescription Health and Safety Program - December 2017 | Capped download failed or exceeded 10 MiB |

## Diagnostics

Low-row diagnostic:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/outside-holdout-low-row-diagnostic.ts \
  --run /mnt/pdf-review/public-holdouts/new-hampshire-lba-audit-reports-2026-05-26/run-r1/baseline_report.json \
  --out /mnt/pdf-review/public-holdouts/new-hampshire-lba-audit-reports-2026-05-26/low-row-diagnostic-r1
```

Decision: `plan_high_impact_targeted_diagnostic`

Recommended lane: `table_target_resolution_needed`

Raw points needed for mean 93: `98`

Lane split:

| Lane | Rows | Raw points |
| --- | ---: | ---: |
| `table_target_resolution_needed` | 4 | 97 |
| `table_object_candidate` | 1 | 34 |

Reading-order shell diagnostic:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/all-input-reading-order-shell-diagnostic.ts \
  --trace /mnt/pdf-review/public-holdouts/new-hampshire-lba-audit-reports-2026-05-26/run-r1/baseline_report.json \
  --out /mnt/pdf-review/public-holdouts/new-hampshire-lba-audit-reports-2026-05-26/reading-order-shell-diagnostic-r1
```

Result: `0` sequence candidates, `0` safe route controls, and `0` recovered routes with final orphan debt.

Figure/alt diagnostic:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/outside-figure-alt-no-gain-diagnostic.ts \
  --run /mnt/pdf-review/public-holdouts/new-hampshire-lba-audit-reports-2026-05-26/run-r1/baseline_report.json \
  --out /mnt/pdf-review/public-holdouts/new-hampshire-lba-audit-reports-2026-05-26/figure-alt-no-gain-r1 \
  --include-high-alt
```

Decision: `keep_figure_alt_diagnostic_only`

Result: `0` scoring candidates and `0` behavior candidates.

Table target-resolution diagnostic:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/table-target-resolution-diagnostic.ts \
  --manifest /mnt/pdf-review/public-holdouts/new-hampshire-lba-audit-reports-2026-05-26/download-manifest.json \
  --run /mnt/pdf-review/public-holdouts/new-hampshire-lba-audit-reports-2026-05-26/run-r1/baseline_report.json \
  --out /mnt/pdf-review/public-holdouts/new-hampshire-lba-audit-reports-2026-05-26/table-target-resolution-r1 \
  --pdf nhlba-02=/mnt/pdf-review/public-holdouts/new-hampshire-lba-audit-reports-2026-05-26/input/nhlba-02.pdf \
  --pdf nhlba-08=/mnt/pdf-review/public-holdouts/new-hampshire-lba-audit-reports-2026-05-26/input/nhlba-08.pdf \
  --pdf nhlba-10=/mnt/pdf-review/public-holdouts/new-hampshire-lba-audit-reports-2026-05-26/input/nhlba-10.pdf \
  --pdf nhlba-11=/mnt/pdf-review/public-holdouts/new-hampshire-lba-audit-reports-2026-05-26/input/nhlba-11.pdf \
  --pdf nhlba-12=/mnt/pdf-review/public-holdouts/new-hampshire-lba-audit-reports-2026-05-26/input/nhlba-12.pdf \
  --control nhlba-03=/mnt/pdf-review/public-holdouts/new-hampshire-lba-audit-reports-2026-05-26/input/nhlba-03.pdf \
  --control nhlba-04=/mnt/pdf-review/public-holdouts/new-hampshire-lba-audit-reports-2026-05-26/input/nhlba-04.pdf \
  --control nhlba-13=/mnt/pdf-review/public-holdouts/new-hampshire-lba-audit-reports-2026-05-26/input/nhlba-13.pdf \
  --control nhlba-14=/mnt/pdf-review/public-holdouts/new-hampshire-lba-audit-reports-2026-05-26/input/nhlba-14.pdf
```

Decision: `keep_table_target_resolution_diagnostic_only`

Result:

| Class | Rows |
| --- | ---: |
| `stable_normalize_target` | 4 |
| `non_table_target_attempt` | 2 |
| `control_or_high_grade_noise` | 3 |

Stable focus candidates were `nhlba-02`, `nhlba-08`, and `nhlba-10`, but same-source control `nhlba-03` also triggered as a stable normalize target. Rows `nhlba-11` and `nhlba-12` had prior table-tool attempts that resolved requested targets as non-table structure (`P` or `Span`). This keeps the table lane diagnostic-only rather than production behavior.

Low-row repeat:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/bounded-holdout-validation.ts \
  /mnt/pdf-review/public-holdouts/new-hampshire-lba-audit-reports-2026-05-26/low-repeat-input \
  /mnt/pdf-review/public-holdouts/new-hampshire-lba-audit-reports-2026-05-26/run-low-repeat-r1 \
  --limit 5 \
  --cleanup-row-artifacts
```

Repeat result:

| Row | Baseline after | Repeat after | Repeat runtime |
| --- | ---: | ---: | ---: |
| `nhlba-02.pdf` | 57/F | 57/F | 72,075 ms |
| `nhlba-08.pdf` | 59/F | 59/F | 195,850 ms |
| `nhlba-10.pdf` | 59/F | 59/F | 265,528 ms |
| `nhlba-11.pdf` | 69/D | 69/D | 86,560 ms |
| `nhlba-12.pdf` | 90/A | 90/A | 117,517 ms |

## Decision

No source behavior change was accepted from this holdout.

Reasons:

- The five low rows are repeatable and source-significant, but the supported lane is the same table/header family that remains parked across several public holdouts.
- Stable table targets exist on multiple focus rows, but at least one same-source A-grade control also triggers the same stable table-target shape.
- Existing table tools already hit PAC table-header association regression risk or non-table target resolution on representative rows.
- Reading/heading and figure/alt diagnostics do not expose safe alternate behavior candidates.
- `false_positive_applied=0`, with no timeout/error rows and bounded runtime.

This source is useful evidence for future table-transaction/header-preservation work, not for an immediate production remediation change.

No original-50 validation was required because no production scoring, planner, or mutation behavior changed.
