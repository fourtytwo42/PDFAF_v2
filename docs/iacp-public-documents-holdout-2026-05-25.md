# IACP Public Documents Holdout - 2026-05-25

## Source

- Source family: International Association of Chiefs of Police public document search/resources, plus IACP-affiliated public PDF domains when the main archive returned Cloudflare 520s.
- Discovery index: `https://www.theiacp.org/search-documents/Recommended/0/All/All`
- Sample size: 20 PDFs under 10 MB.
- Local artifacts: `/mnt/pdf-review/public-holdouts/iacp-publications-2026-05-25/` during validation only; PDFs and generated run artifacts are not source-tracked.

Several older `www.theiacp.org/sites/default/files/...` links returned HTTP 520 during collection. The sample uses the first 20 valid PDFs that downloaded cleanly under the size cap, including two IACP-affiliated domains (`iacpcybercenter.org`, `discoverpolicing.org`) and one conference-domain IACP PDF.

## Validation

Command:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/bounded-holdout-validation.ts \
  /mnt/pdf-review/public-holdouts/iacp-publications-2026-05-25/input \
  /mnt/pdf-review/public-holdouts/iacp-publications-2026-05-25/run-r1 \
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
| Mean before | 48.15 |
| Mean after | 90.15 |
| Median after | 95 |
| Grades after | 17 A / 0 B / 0 C / 0 D / 3 F |
| Rows below 93 | 5 |
| Timeout/error rows | 0 |
| `false_positive_applied` | 0 |
| Runtime p50 | 12,616 ms |
| Runtime p95 | 69,124 ms |
| Runtime max | 81,435 ms |

Rows below 93:

| Row | Before | After | Main debt |
| --- | ---: | ---: | --- |
| `iacp-01.pdf` | 52 | 59/F | zero heading structure |
| `iacp-06.pdf` | 59 | 91/A | near miss; heading/link/table/PDF-UA mild debt |
| `iacp-07.pdf` | 59 | 59/F | figure/alt target discovery debt |
| `iacp-09.pdf` | 34 | 59/F | zero heading structure plus reading/link debt |
| `iacp-14.pdf` | 59 | 90/A | near miss; heading/PDF-UA/alt mild debt |

## Diagnostics

Low-row diagnostic:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/outside-holdout-low-row-diagnostic.ts \
  --run /mnt/pdf-review/public-holdouts/iacp-publications-2026-05-25/run-r1/baseline_report.json \
  --out /mnt/pdf-review/public-holdouts/iacp-publications-2026-05-25/low-row-diagnostic-r1
```

Decision: `plan_high_impact_targeted_diagnostic`

Recommended lane: `figure_alt_target_discovery_needed`

Raw points needed for mean 93: `57`.

Lane summary:

- `figure_alt_target_discovery_needed`: `iacp-07.pdf`, 34 points.
- `no_safe_predicate`: `iacp-01.pdf`, `iacp-09.pdf`, 68 points.
- `near_miss_monitor`: `iacp-06.pdf`, `iacp-14.pdf`, 5 points.

Figure/alt replay diagnostic:

```bash
npx -y node@22 /usr/bin/pnpm exec tsx scripts/outside-figure-alt-no-gain-diagnostic.ts \
  --run /mnt/pdf-review/public-holdouts/iacp-publications-2026-05-25/run-r1/baseline_report.json \
  --out /mnt/pdf-review/public-holdouts/iacp-publications-2026-05-25/figure-alt-no-gain-r1 \
  --include-high-alt
```

Decision: `keep_figure_alt_diagnostic_only`

The focus row `iacp-07.pdf` had `alt_text=20` with extracted/informative figure evidence but no checker-visible/tree figure target and no accepted existing alt tool path. A Stage 191 source analysis classified it as `mixed_table_or_heading_blocker`, with `0/0` checker-visible figures and `9/9` informative figures. That supports a future figure-role/structure target-discovery investigation, not a production behavior change from this holdout alone.

## Decision

No source behavior change was accepted from this holdout.

Reasons:

- The holdout mean is below the target at `90.15`, but reaching `93` would require at least two high-impact low-row recoveries.
- The two zero-heading F rows do not expose a safe object-backed heading predicate from the existing run evidence.
- The figure/alt F row exposes a real target-discovery gap, but the current evidence does not identify a checker-visible/tree target that existing mutators can safely repair.
- No controls or original-50 validation were run because no production scoring, planner, or mutation behavior changed.

This source reinforces two parked general lanes:

- native zero-heading/visible-anchor recovery where a safe structured target exists;
- figure-role target discovery for PDFs with informative extracted figures but no checker-visible tree figure target.

Do not add IACP/source/domain/PDF-specific gates, scorer masking, PAC relaxations, broad heading fallback, broad figure retagging, or checkpoint relaxation from this evidence.
