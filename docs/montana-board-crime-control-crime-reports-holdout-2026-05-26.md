# Montana Board of Crime Control Crime Reports Holdout - 2026-05-26

## Source

- Public source: Montana Board of Crime Control, Crime in Montana Annual Reports
- Landing page: `https://mbcc.mt.gov/Data/Montana-Reports/Crime-in-Montana-Reports`
- Sample: 20 official PDFs under the decimal `10,000,000` byte cap
- Coverage: newest available under-cap annual/summary reports from `2020` through `1998`, skipping oversized `2016`
- Local artifacts were kept under `/mnt/pdf-review/public-holdouts/montana-board-crime-control-crime-reports-2026-05-26/` during analysis and deleted after metrics extraction.

## Validation

Command:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/bounded-holdout-validation.ts \
  /mnt/pdf-review/public-holdouts/montana-board-crime-control-crime-reports-2026-05-26/input \
  /mnt/pdf-review/public-holdouts/montana-board-crime-control-crime-reports-2026-05-26/run-r1 \
  --limit 20 \
  --cleanup-row-artifacts
```

Result:

- Processed: `20/20` attempted, `19/20` completed
- Mean before remediation: `44.20`
- Completed-row mean after remediation: `83.6316`
- All-row mean after remediation: `79.45`
- Median after remediation: `94`
- Grades after remediation: `13 A / 0 B / 0 C / 0 D / 6 F / 1 error`
- Rows below `93`: `7`
- Hard errors/timeouts: `1`
- `false_positive_applied`: `0`
- Runtime p50/p95/max: `21063ms / 204852ms / 221312ms`

Low/error rows:

| Row | Score | Primary Debt |
| --- | ---: | --- |
| `mtcrime-09.pdf` | `59/F` | `heading_structure=0`, `table_markup=70`, `pdf_ua_compliance=71` |
| `mtcrime-10.pdf` | `59/F` | `heading_structure=0` |
| `mtcrime-11.pdf` | `59/F` | `heading_structure=0` |
| `mtcrime-12.pdf` | `59/F` | `heading_structure=0` |
| `mtcrime-13.pdf` | `59/F` | `heading_structure=0` |
| `mtcrime-14.pdf` | `59/F` | `heading_structure=0` |
| `mtcrime-17.pdf` | `0/?` | `Maximum call stack size exceeded` |

## Diagnostics

`outside-holdout-low-row-diagnostic` returned:

- Decision: `no_safe_low_row_lane`
- Recommended lane: `none`
- Raw points needed for source mean `93`: `271`
- Lane split: `6` no-safe-predicate rows (`204` raw points) plus `1` runtime/analyzer error row (`93` raw points)

`all-input-visible-title-anchor-diagnostic` over the six zero-heading lows found:

- `mtcrime-09`: `existing_internal_anchor_candidate`
- `mtcrime-10` through `mtcrime-14`: `not_zero_heading_native_gap`
- No new visible-title/source-text fallback was supported.

`all-input-reading-order-shell-diagnostic` found:

- Safe route controls: `0`
- Sequence candidates: `0`
- Selected rows: `0`

The `mtcrime-17` stack overflow reproduced in a one-row deterministic repeat:

- `34 -> 0/?`
- Error: `Maximum call stack size exceeded`
- Runtime: `48616ms`
- `false_positive_applied=0`

## Decision

No behavior change was accepted from this source.

The low rows reinforce two parked lanes:

- zero-heading target discovery where no current visible-anchor/reading-order predicate is safe;
- analyzer/runtime recursion debt for a reproducible stack overflow.

Do not add Montana/source/year/PDF gates, scorer masking, PAC relaxations, broad heading fallback, timeout/error checkpoint substitution, or stack-overflow masking from this evidence.

No original-50 validation was required because no production behavior changed.
