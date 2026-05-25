# Vermont Judiciary Town Traffic Ticket Reports Holdout - 2026-05-25

## Source

- Public source page: `https://www.vtcourts.gov/about-vermont-judiciary/court-statistics-and-reports/town-traffic-ticket-reports`
- Source type: Vermont Judiciary monthly town traffic ticket reports.
- Sampling rule: first 20 discovered public PDF links from the source page, all under 10 MiB.
- Discovery result: 45 report links found, 20 downloaded, 0 skipped for size.
- Local scratch root during validation: `/mnt/pdf-review/public-holdouts/vermont-judiciary-town-traffic-ticket-reports-2026-05-25`.

The downloaded PDFs and generated validation artifacts are local-only scratch data and are not source-tracked.

## Validation

Validation used deterministic remediation only:

- `scripts/bounded-holdout-validation.ts`
- Node 22
- `--no-semantic`
- `--no-pdfs`
- Per-PDF timeout: default 300000 ms

The initial single-worker run was stopped after the first two rows because the source was homogeneous and each row was taking multiple minutes. The accepted validation was rerun as four independent five-PDF chunks and merged into a single local report. This changed wall-clock scheduling only; each row still used the same deterministic no-semantic/no-PDF bounded runner.

Local merged report:

- `/mnt/pdf-review/public-holdouts/vermont-judiciary-town-traffic-ticket-reports-2026-05-25/run-parallel-r1/baseline_report.json`

Metrics:

- Rows processed: 20/20
- Mean before: 49.0000
- Mean after: 54.0000
- Median after: 54.0000
- Grades after: 0 A / 0 B / 0 C / 0 D / 20 F
- Rows below 93: 20
- `false_positive_applied`: 0
- Timeout/error rows: 0
- Runtime p50/p95/max: 151221 ms / 170893 ms / 173588 ms

All rows repeated the same score shape: `heading_structure=0`, `table_markup=0`, strong text extraction, and high reading order.

## Diagnostics

Low-row diagnostic:

- Local artifact: `/mnt/pdf-review/public-holdouts/vermont-judiciary-town-traffic-ticket-reports-2026-05-25/low-row-diagnostic-r1/outside-holdout-low-row-diagnostic.md`
- Decision: `plan_high_impact_targeted_diagnostic`
- Recommended lane: `table_target_resolution_needed`
- Raw points needed for mean 93: 780

Table target-resolution diagnostic:

- Local artifact: `/mnt/pdf-review/public-holdouts/vermont-judiciary-town-traffic-ticket-reports-2026-05-25/table-target-resolution-r1/table-target-resolution-diagnostic.md`
- Focus rows: `vttraffic-01`, `vttraffic-07`, `vttraffic-16`
- Controls: accessible fixture, Teams fixtures, and two v1 evolve controls.
- Decision: `keep_table_target_resolution_diagnostic_only`
- Stable focus candidates: none
- Prior non-table target rows: `vttraffic-01`, `vttraffic-07`, `vttraffic-16`

Representative focus rows had hundreds of stable table-like objects and severe table/header debt, but the attempted header-cell targets resolved as `TD` rather than safe header targets. The diagnostic did not prove a safe production predicate or transaction.

## Decision

No source behavior change was accepted from this holdout.

This source is valuable evidence for the parked table/header transaction lane: dense, long, native-tagged report tables need a real object-backed table/header repair that preserves or rebuilds header association truth. It does not justify source-specific gates, scorer masking, PAC relaxations, broader table admission, or target fallback.

Downloaded PDFs and generated artifacts were removed after metrics extraction.
