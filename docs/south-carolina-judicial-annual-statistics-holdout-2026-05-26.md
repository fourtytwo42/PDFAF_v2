# South Carolina Judicial Annual Statistics Holdout - 2026-05-26

## Source

- Public source: South Carolina Judicial Branch annual statistics reports
- Landing page: `https://www.sccourts.org/about/statistics-reports/annual-reports/`
- Sample: 20 official PDF reports under 10MB
  - 15 reports from fiscal year `2024-2025`
  - 5 reports from fiscal year `2023-2024`
- Local artifacts were kept under `/mnt/pdf-review/public-holdouts/south-carolina-judicial-annual-statistics-2026-05-26/` during analysis and deleted after metrics extraction.

## Validation

Command:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/bounded-holdout-validation.ts \
  /mnt/pdf-review/public-holdouts/south-carolina-judicial-annual-statistics-2026-05-26/input \
  /mnt/pdf-review/public-holdouts/south-carolina-judicial-annual-statistics-2026-05-26/run-r1 \
  --limit 20 \
  --cleanup-row-artifacts
```

Result:

- Processed: `20/20`
- Mean: `36.75 -> 88.45`
- Median after remediation: `96.5`
- Grades after remediation: `16 A / 0 B / 0 C / 0 D / 4 F`
- Rows below `93`: `4`
- Hard errors/timeouts: `0`
- `false_positive_applied`: `0`
- Runtime p50/p95/max: `7114ms / 39720ms / 111975ms`

Low rows:

| Row | Score | Primary Debt |
| --- | ---: | --- |
| `scjud-01.pdf` | `54/F` | `heading_structure=0`, `table_markup=0`, PAC table-header debt |
| `scjud-02.pdf` | `54/F` | `heading_structure=0`, `table_markup=0`, PAC table-header debt |
| `scjud-16.pdf` | `51/F` | `heading_structure=0`, `table_markup=0`, PAC table-header debt |
| `scjud-17.pdf` | `54/F` | `heading_structure=0`, `table_markup=0`, PAC table-header debt |

## Diagnostics

`outside-holdout-low-row-diagnostic` selected `table_target_resolution_needed` with `91` raw points needed for a source mean of `93`.

`table-target-resolution-diagnostic` returned `keep_table_target_resolution_diagnostic_only`:

- Stable focus candidates: `scjud-02`
- Prior non-table target rows: `scjud-01`, `scjud-16`, `scjud-17`
- Unsafe control candidates: `none`
- Same-source high-grade controls had layout table evidence but no PAC/table score debt.

`all-input-table-structure-sequence-probe` over the four low rows found:

- Sequence candidates: `0`
- Harmful PAC regression endings: `0`
- No useful movement endings: `28`

`all-input-visible-title-anchor-diagnostic` classified all four lows as `not_zero_heading_native_gap`, so the existing visible-title/heading-anchor recovery lane does not apply.

## Decision

No behavior change was accepted from this source.

The low rows reinforce the parked real table/header transaction and table target-identity lanes: the PDFs expose dense object-backed table debt, but current tools either no-effect, resolve table-header operations to non-table cells, or lack a safe final PAC-clean transaction. Do not add South Carolina/source/fiscal-year/PDF gates, scorer masking, PAC relaxations, broad table admission, broad heading fallback, or table target fallback from this evidence.

No original-50 validation was required because no production behavior changed.
