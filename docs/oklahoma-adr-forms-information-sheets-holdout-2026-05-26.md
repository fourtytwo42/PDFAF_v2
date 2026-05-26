# Oklahoma ADR Forms and Information Sheets Holdout - 2026-05-26

## Source

- Source family: Oklahoma Alternative Dispute Resolution System forms and information sheets.
- Source page: `https://adrs.oscn.net/forms-information-sheets/`
- Sample size: 20 PDFs under 10 MiB.
- Local artifacts: `/mnt/pdf-review/public-holdouts/oklahoma-adr-forms-information-sheets-2026-05-26/` during validation only; PDFs and generated run artifacts are not source-tracked.

The source page exposed 22 candidate PDF links. The validation sample used the first 20 valid under-cap public PDFs from `adrs.oscn.net` and the linked ADR media host.

## Validation

Command:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/bounded-holdout-validation.ts \
  /mnt/pdf-review/public-holdouts/oklahoma-adr-forms-information-sheets-2026-05-26/input \
  /mnt/pdf-review/public-holdouts/oklahoma-adr-forms-information-sheets-2026-05-26/run-r1 \
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
| Mean before | 48.60 |
| Mean after | 90.90 |
| Median after | 94 |
| Grades after | 15 A / 3 B / 0 C / 1 D / 1 F |
| Rows below 93 | 8 |
| Timeout/error rows | 0 |
| `false_positive_applied` | 0 |
| Runtime p50 | 11,993 ms |
| Runtime p95 | 22,075 ms |
| Runtime max | 23,330 ms |

Rows below 93:

| Row | Baseline after | Runtime | Primary residual |
| --- | ---: | ---: | --- |
| `okadr-04.pdf` | 59/F | 22,075 ms | Volatile structure/table/alt residual; repeat recovered to 92/A |
| `okadr-05.pdf` | 92/A | 23,330 ms | Near-miss heading/PDF-UA/table monitor |
| `okadr-06.pdf` | 88/B | 15,741 ms | Stable reading/form residual after existing annotation/form tools |
| `okadr-07.pdf` | 88/B | 15,423 ms | Stable reading/form residual after existing annotation/form tools |
| `okadr-08.pdf` | 89/B | 15,338 ms | Stable form residual after existing tooltip tool no-effect |
| `okadr-14.pdf` | 92/A | 6,361 ms | Near-miss heading/reading monitor |
| `okadr-15.pdf` | 69/D | 17,775 ms | Stable table target/transaction residual |
| `okadr-20.pdf` | 90/A | 13,608 ms | Near-miss PDF-UA/table/heading monitor |

## Sample

The 20 valid under-10MiB PDFs were:

| Row | Document | Bytes |
| --- | --- | ---: |
| `okadr-01` | Dispute Resolution Act | 637,443 |
| `okadr-02` | Early Settlement Program Directory | 485,170 |
| `okadr-03` | Agency Program Directory | 175,204 |
| `okadr-04` | ADR System Brochure | 583,449 |
| `okadr-05` | Real Estate Brochure | 324,728 |
| `okadr-06` | Intake Form | 136,430 |
| `okadr-07` | Real Estate Intake Form | 233,585 |
| `okadr-08` | Request for IDEA Mediation | 675,406 |
| `okadr-09` | Consent to Mediate | 88,413 |
| `okadr-10` | Consent to Mediate Spanish Version | 65,271 |
| `okadr-11` | Rule 10 Confidentiality and Rules of Conduct Acknowledgment | 804,065 |
| `okadr-12` | Rule 10 Form Spanish | 108,657 |
| `okadr-13` | Basic Agreement Form | 83,047 |
| `okadr-14` | Family Memorandum | 55,272 |
| `okadr-15` | Mediation Report Form | 48,291 |
| `okadr-16` | Order to Child Permanency | 183,556 |
| `okadr-17` | Child Permanency Consensus Recommendation | 194,697 |
| `okadr-18` | Mediation Information | 18,244 |
| `okadr-19` | Rules for Family Mediation | 13,402 |
| `okadr-20` | Early Settlement 2025 Travel Claim | 57,790 |

## Diagnostics

Low-row diagnostic:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/outside-holdout-low-row-diagnostic.ts \
  --run /mnt/pdf-review/public-holdouts/oklahoma-adr-forms-information-sheets-2026-05-26/run-r1/baseline_report.json \
  --out /mnt/pdf-review/public-holdouts/oklahoma-adr-forms-information-sheets-2026-05-26/low-row-diagnostic-r1
```

Decision: `plan_high_impact_targeted_diagnostic`

Recommended lane: `table_target_resolution_needed`

Raw points needed for mean 93: `42`

Lane split:

| Lane | Rows | Raw points |
| --- | ---: | ---: |
| `no_safe_predicate` | 4 | 48 |
| `table_target_resolution_needed` | 1 | 24 |
| `near_miss_monitor` | 3 | 5 |

Table target-resolution diagnostic:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/table-target-resolution-diagnostic.ts \
  --run /mnt/pdf-review/public-holdouts/oklahoma-adr-forms-information-sheets-2026-05-26/run-r1/baseline_report.json \
  --out /mnt/pdf-review/public-holdouts/oklahoma-adr-forms-information-sheets-2026-05-26/table-target-resolution-r1 \
  --pdf okadr-15=/mnt/pdf-review/public-holdouts/oklahoma-adr-forms-information-sheets-2026-05-26/input/okadr-15.pdf \
  --control okadr-01=/mnt/pdf-review/public-holdouts/oklahoma-adr-forms-information-sheets-2026-05-26/input/okadr-01.pdf \
  --control okadr-02=/mnt/pdf-review/public-holdouts/oklahoma-adr-forms-information-sheets-2026-05-26/input/okadr-02.pdf \
  --control okadr-03=/mnt/pdf-review/public-holdouts/oklahoma-adr-forms-information-sheets-2026-05-26/input/okadr-03.pdf \
  --control okadr-09=/mnt/pdf-review/public-holdouts/oklahoma-adr-forms-information-sheets-2026-05-26/input/okadr-09.pdf \
  --control okadr-10=/mnt/pdf-review/public-holdouts/oklahoma-adr-forms-information-sheets-2026-05-26/input/okadr-10.pdf \
  --control okadr-11=/mnt/pdf-review/public-holdouts/oklahoma-adr-forms-information-sheets-2026-05-26/input/okadr-11.pdf \
  --control okadr-12=/mnt/pdf-review/public-holdouts/oklahoma-adr-forms-information-sheets-2026-05-26/input/okadr-12.pdf \
  --control okadr-13=/mnt/pdf-review/public-holdouts/oklahoma-adr-forms-information-sheets-2026-05-26/input/okadr-13.pdf \
  --control okadr-16=/mnt/pdf-review/public-holdouts/oklahoma-adr-forms-information-sheets-2026-05-26/input/okadr-16.pdf
```

Decision: `keep_table_target_resolution_diagnostic_only`

Evidence:

- `okadr-15` had stable normalize targets and real table score/PAC debt.
- Same-source controls `okadr-02` and `okadr-10` also produced stable header-association target classes.
- Existing table tools on `okadr-15` already applied or rejected honestly, including PAC regressions on orphan-MCID debt.

This supports continued table-transaction research, but not a broad table planner change from this source.

Annotation/form parity diagnostic:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/annotation-form-parity-diagnostic.ts \
  --out /mnt/pdf-review/public-holdouts/oklahoma-adr-forms-information-sheets-2026-05-26/annotation-form-parity-r1 \
  --pdf /mnt/pdf-review/public-holdouts/oklahoma-adr-forms-information-sheets-2026-05-26/input/okadr-08.pdf \
  --pdf /mnt/pdf-review/public-holdouts/oklahoma-adr-forms-information-sheets-2026-05-26/input/okadr-06.pdf \
  --pdf /mnt/pdf-review/public-holdouts/oklahoma-adr-forms-information-sheets-2026-05-26/input/okadr-07.pdf \
  --pdf /mnt/pdf-review/public-holdouts/oklahoma-adr-forms-information-sheets-2026-05-26/input/okadr-20.pdf \
  --pdf /mnt/pdf-review/public-holdouts/oklahoma-adr-forms-information-sheets-2026-05-26/input/okadr-01.pdf \
  --pdf /mnt/pdf-review/public-holdouts/oklahoma-adr-forms-information-sheets-2026-05-26/input/okadr-02.pdf
```

Decision: `plan_annotation_form_behavior_stage`

Evidence:

- `okadr-06`, `okadr-07`, and `okadr-08` classified as `form_tooltip_repair_candidate`.
- The baseline tool timeline already exercised existing annotation/form tools:
  - `okadr-06` and `okadr-07`: `fill_form_field_tooltips` applied, but remained below 93.
  - `okadr-08`: `fill_form_field_tooltips` no-effected after structure recovery, and form accessibility remained 50.
- The repeated residuals indicate existing behavior is not enough, but this artifact does not prove a new safe predicate or mutator.

Reading-order shell diagnostic:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/all-input-reading-order-shell-diagnostic.ts \
  --trace /mnt/pdf-review/public-holdouts/oklahoma-adr-forms-information-sheets-2026-05-26/run-r1/baseline_report.json \
  --out /mnt/pdf-review/public-holdouts/oklahoma-adr-forms-information-sheets-2026-05-26/reading-order-shell-diagnostic-r1
```

Result:

- `sequenceCandidateCount=0`
- `safeRouteControlCount=1`
- `selectedRows=[]`

Figure/alt diagnostic:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/outside-figure-alt-no-gain-diagnostic.ts \
  --run /mnt/pdf-review/public-holdouts/oklahoma-adr-forms-information-sheets-2026-05-26/run-r1/baseline_report.json \
  --out /mnt/pdf-review/public-holdouts/oklahoma-adr-forms-information-sheets-2026-05-26/figure-alt-no-gain-r1 \
  --include-high-alt
```

Decision: `keep_figure_alt_diagnostic_only`

The diagnostic found `0` scoring candidates and `0` behavior candidates.

Low-row repeat:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/bounded-holdout-validation.ts \
  /mnt/pdf-review/public-holdouts/oklahoma-adr-forms-information-sheets-2026-05-26/low-repeat-input \
  /mnt/pdf-review/public-holdouts/oklahoma-adr-forms-information-sheets-2026-05-26/run-low-repeat-r1 \
  --limit 8 \
  --cleanup-row-artifacts
```

The eight sub-93 rows repeated with mean `87.2500`, no errors/timeouts, and `false_positive_applied=0`. Repeated results were `okadr-04 92/A`, `okadr-05 92/A`, `okadr-06 88/B`, `okadr-07 88/B`, `okadr-08 89/B`, `okadr-14 90/A`, `okadr-15 69/D`, and `okadr-20 90/A`.

## Decision

No source behavior was accepted from this holdout.

The source misses the 93 mean target by `42` raw points in the baseline run. `okadr-04` is materially volatile and recovered to 92/A on repeat, which makes it a poor basis for a new fixer. `okadr-15` is a real stable table residual, but same-source controls also trigger stable table target classes and existing table tools already hit honest PAC regressions. `okadr-06`, `okadr-07`, and `okadr-08` expose form/annotation debt, but the existing form-tooltip and annotation tools already ran and did not clear the final residuals.

No original-50 regression validation was required because no scoring, planning, analyzer, or remediation behavior changed. Downloaded public PDFs and generated artifacts should remain local only and were deleted after metrics extraction.
