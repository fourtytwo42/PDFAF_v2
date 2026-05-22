# All-Unique r2 Table-Shape Behavior Proof

Date: 2026-05-22

## Summary

The narrow Stage180 table-shape transaction proof for all-unique r2 lows is rejected and parked. The diagnostic target-resolution stage correctly identified stable object-backed table-shape evidence on `0137` and `0287`, but the provisional behavior did not produce enough accepted remediation value to keep.

No table-shape behavior change is source-tracked from this proof.

## Evidence

Local validation artifact:

- `/mnt/pdf-review/pdfaf-validation/allunique-r2-table-shape-proof-2026-05-22-r1/run-r1/baseline_report.json`

Validation set:

- Positives: `0137`, `0287`
- Parked near-negatives: `0138`, `0223`
- Controls: `ADAM2`, `pdfaf_fixture_accessible`, `fixture-teams-original`, `fixture-teams-remediated`, `fixture-teams-targeted-wave1`

Run result:

- Rows completed: `9/9`
- `false_positive_applied`: `0`
- Timeout/error count: `0`
- Mean after: `83.0000`

Key rows:

| Row | Result | Table movement | Notes |
| --- | ---: | ---: | --- |
| `0137` | `52/F -> 69/D` | `0 -> 16` | The experimental table-shape transaction reduced some object-backed table irregularity/header debt, but final score did not move beyond the known D tail. It also ran twice and did not clear the dominant table/PAC debt. |
| `0287` | `58/F -> 69/D` | `0 -> 0` | Existing table tools ran, but the experimental shape transaction did not produce a final table lift. |
| `0138` | `59/F -> 69/D` | `35 -> 35` | New shape transaction did not fire; this remains parked because prior table-header target resolution includes a non-table `/P` target. |
| `0223` | `25/F -> 59/F` | `100 -> 0` | New shape transaction did not fire; this remains layout/route debt, not a stable table-shape promotion row. |

Controls stayed stable and the new transaction did not fire on controls, but the positive evidence was not strong enough for acceptance.

## Decision

Decision: `park_table_shape_transaction_behavior`.

Reason:

- The accepted-behavior bar required at least two target rows to improve or show clear final PAC/table-header debt reduction.
- Only `0137` showed a small table category lift, and it remained `69/D`.
- `0287` stayed at table score `0`.
- The row-level runtime cost was high on the target set, so keeping a low-yield transaction would be a poor tradeoff without stronger repair benefit.

## Follow-Up

Do not reintroduce the parked table-shape transaction without a new diagnostic proving one of these general, object-backed paths:

- a stricter pre-mutation target selector that predicts final table score movement, not only local irregular-row reduction;
- a transaction invariant that rejects when local table normalization increases global PAC header-association debt;
- a bounded way to repair the dominant remaining header-association debt after shape normalization;
- a separate 0287-like missing-header-table path that reduces final table/PAC debt on at least two positives and stays off controls.

Next default PAC/POC parity direction should move away from this table-shape transaction and toward another high-confidence lane, such as font/CMap scoring hardening, content-event tagging diagnostics, or timeout/runtime recovery, unless a stronger table-header association proof is produced first.
