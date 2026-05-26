# Montana Courts Case Processing Measures Holdout - 2026-05-26

## Source

- Public source: Montana Judicial Branch Performance Measures/Statistics
- Landing page: `https://courts.mt.gov/courts/statistics/dcstats`
- Sample: 20 official District Court case-processing measure PDFs under 10MB
- Coverage: annual and quarterly reports from `2025`, `2024`, `2023`, and `2022`
- Local artifacts were kept under `/mnt/pdf-review/public-holdouts/montana-courts-case-processing-measures-2026-05-26/` during analysis and deleted after metrics extraction.

## Validation

Command:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/bounded-holdout-validation.ts \
  /mnt/pdf-review/public-holdouts/montana-courts-case-processing-measures-2026-05-26/input \
  /mnt/pdf-review/public-holdouts/montana-courts-case-processing-measures-2026-05-26/run-r1 \
  --limit 20 \
  --cleanup-row-artifacts
```

Result:

- Processed: `20/20`
- Mean: `56.00 -> 74.35`
- Median after remediation: `69`
- Grades after remediation: `4 A / 0 B / 0 C / 16 D / 0 F`
- Rows below `93`: `16`
- Hard errors/timeouts: `0`
- `false_positive_applied`: `0`
- Runtime p50/p95/max: `15316ms / 17958ms / 18245ms`

Low-row shape:

- The four newest annual/quarterly rows reached A-grade.
- The other 16 rows all landed at `69/D`.
- Common residual debt was `table_markup=16`, `heading_structure=80`, `pdf_ua_compliance=83`, and strong `reading_order=94`.
- `mtcourts-20` also retained `alt_text=60`; the other 15 low rows had `alt_text=100`.

## Diagnostics

`outside-holdout-low-row-diagnostic` selected `table_target_resolution_needed`:

- Raw points needed for source mean `93`: `373`
- Candidate points in the table lane: `384`
- Low rows: `mtcourts-05` through `mtcourts-20`

`table-target-resolution-diagnostic` returned `plan_table_target_behavior_proof`:

- Stable focus candidates: all 16 low rows
- Unsafe control candidates: `none`
- Prior non-table target rows: `none`
- Controls `mtcourts-01` through `mtcourts-04` had high table scores and did not match the target predicate.

Representative `all-input-table-structure-sequence-probe` over `mtcourts-05`, `mtcourts-09`, `mtcourts-12`, `mtcourts-16`, and `mtcourts-20` found:

- Sequence candidates: `0`
- Harmful PAC regression endings: `25`
- No useful movement endings: `10`
- Best observed states improved table markup to `100` on representative rows, but were classified as harmful because non-target PAC failures increased and PDF/UA remained degraded.

## Decision

No behavior change was accepted from this source.

This is one of the cleaner outside-corpus examples of the parked table/header transaction lane: target identity is stable, controls are clean, and the residual debt is highly repeated. However, existing table/heading/annotation sequences still do not produce an honest final PAC-clean state. The next useful work is a general table/header transaction root-cause stage that explains and repairs the non-target PAC regressions after table improvement, not a broad admission or scorer change.

Do not add Montana/source/year/PDF gates, scorer masking, PAC relaxations, broad table admission, or table target fallback from this evidence.

No original-50 validation was required because no production behavior changed.
