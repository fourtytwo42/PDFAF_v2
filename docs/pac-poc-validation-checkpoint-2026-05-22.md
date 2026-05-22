# PAC/POC Validation Checkpoint Refresh

Date: 2026-05-22

## Decision

Decision: `validation_gate_ready`.

This checkpoint records the current validation state after the accepted Table/ParentTree behavior proof, the `structure-4438` Python analysis optimization, and the fresh all-unique r3 validation. It is an audit/reporting layer only. It does not run analysis, remediation, PAC/POC, ODL, Java, semantic AI, network checks, or PDF mutation.

Local generated artifacts:

- Previous source-tracked checkpoint artifact: `Output/pac-poc-validation-checkpoint-2026-05-22-r2/pac-poc-validation-checkpoint.md`
- Latest local checkpoint artifact: `/mnt/pdf-review/pdfaf-validation/pac-poc-validation-checkpoint-after-allunique-r3-2026-05-22-r1/pac-poc-validation-checkpoint.md`
- Fresh all-unique r3 diagnostic: `/mnt/pdf-review/pdfaf-validation/allunique-current-bounded-full-2026-05-22-r3/diagnostic/all-input-mean-diagnostic.md`

Generated artifacts remain local and are not source-tracked.

## Scope Results

`original_50`

- Artifact: `/mnt/pdf-review/pdfaf-validation/original50-after-structure4438-analysis-opt-2026-05-22-r1/baseline_report.json`
- Rows: `50`
- Completed: `50`
- All-row mean: `94.0000`
- Median: `95.5`
- Grade distribution: `47 A / 1 B / 2 F`
- `false_positive_applied=0`
- Timeout/error rows: `0`
- Runtime p95/max: `133441ms / 289268ms`

`all_unique`

- Artifact: `/mnt/pdf-review/pdfaf-validation/allunique-current-bounded-full-2026-05-22-r3/diagnostic/all-input-mean-diagnostic.json`
- Rows: `351`
- Completed: `351`
- Mean: `93.5698`
- Median: `94`
- Grade distribution: `331 A / 1 B / 2 C / 7 D / 10 F`
- `false_positive_applied=0`
- Timeout/error rows: `0`
- Runtime p95/max: `93139ms / 233587ms`
- Status: passes the active fresh all-unique `93.0000` target with a `+200` raw-point buffer.

`outside_holdout`

- Artifact: `/mnt/pdf-review/pdfaf-validation/virginia-dcjs-current-table-proof-full-2026-05-22-r1/baseline_report.json`
- Rows: `20`
- Completed: `20`
- Mean: `95.10`
- Median: `95.5`
- Grade distribution: `19 A / 1 B`
- `false_positive_applied=0`
- Timeout/error rows: `0`
- Runtime p95/max: `202448ms / 212140ms`
- Runtime reference: `/mnt/pdf-review/pdfaf-validation/virginia-dcjs-figure-alt-tree-cap-full-2026-05-21-r1/baseline_report.json`
- Runtime bound: p95 `202448ms` is below allowed `205027ms`

## Interpretation

The validation gate for the current accepted source state is ready:

- original-50 passes with `false_positive_applied=0`;
- all-unique r3 is a fresh all-row validation over `351` unique PDFs and passes the `93` mean gate;
- the outside Virginia public-source holdout remains above `93` mean/median with bounded runtime;
- no scope has timeout/error rows in the accepted checkpoint rollup;
- no result depends on overlays, shard-only claims, virtual remixes, scorer masking, PAC suppression, or source/PDF-specific production gates.

Fresh all-unique r3 supersedes the old r39 floor and the r2 miss:

- r39: `92.9972`, four hard timeouts, one raw point short of `93`;
- r2: `92.2821`, three hard timeouts;
- r3: `93.5698`, zero hard timeouts, `+200` raw points above strict `93`.

The active PAC/POC alignment goal should not be marked globally complete solely from this checkpoint unless the team accepts that the parity map and safe remediation lanes are exhausted or sufficiently parked. This checkpoint does establish the new accepted fresh all-unique floor for future regression accounting.

## Next Direction

Use `docs/all-unique-current-bounded-full-2026-05-22-r3.md` as the all-unique source of truth. Future accepted source changes should preserve or explicitly justify movement against:

- original-50 mean `94.0000`, `false_positive_applied=0`;
- all-unique mean `93.5698`, `false_positive_applied=0`, timeout/error rows `0`;
- outside Virginia holdout mean `95.10`, `false_positive_applied=0`;
- bounded runtime with no new hard timeout and no p95 increase beyond the accepted bound unless explicitly waived.

The remaining implementation lanes should be PAC/POC-aligned and object-backed: heading/reading only with safe native targets, table/alt mixed debt only with stable table refs and controls, and runtime/analyzer cleanup only when it reduces major regression risk without changing score truth.
