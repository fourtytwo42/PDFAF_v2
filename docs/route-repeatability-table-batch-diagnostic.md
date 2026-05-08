# Route Repeatability Table Batch Diagnostic

Date: 2026-05-08

## Source Artifacts

- Repeat runs:
  - `Output/experiment-corpus-baseline/run-route-repeatability-table-batch-target-2026-05-08-r1`
  - `Output/experiment-corpus-baseline/run-route-repeatability-table-batch-target-2026-05-08-r2`
  - `Output/experiment-corpus-baseline/run-route-repeatability-table-batch-target-2026-05-08-r3`
- Rollup diagnostic: `Output/experiment-corpus-baseline/route-repeatability-table-batch-diagnostic-2026-05-08-r1`
- Rejected behavior probe: `Output/experiment-corpus-baseline/run-route-repeatability-table-batch-guard-target-2026-05-08-r1`

## Decision

No new behavior is accepted from this stage, and fixed-50 should not run from the table-batch candidate yet.

The repeatability rollup found:

- `fixture-inaccessible`: one same-state bad-route candidate, but a narrow replay-state guard probe did not stabilize the row. The post-guard run still landed at `79/C` through a different upstream state, so the behavior was not kept.
- `figure-4754`: route volatility remains upstream relative to the low-score route. Do not add table-specific behavior for it.
- `long-4700`: table batching is mechanically stable, reducing association debt from `10 -> 2` and TD-without-header debt from `220 -> 17` in all three repeats, but score remains `78/C`.
- `font-4699`: small-table association remains stable at `91/A`.

## Findings

| Row | Classification | Repeat outcome | Decision |
| --- | --- | --- | --- |
| `fixture-inaccessible` | `same_state_guard_candidate` then failed guard probe | `79/C`, `95/A`, `95/A`; post-guard `79/C` | Park; no accepted behavior |
| `figure-4754` | `upstream_route_volatility` | `78/C`, `67/D`, `78/C` | Park; no table behavior |
| `long-4700` | `table_batch_stable_observation` | `78/C` in all repeats, debt reduced | Keep under observation |
| `font-4699` | `table_batch_stable_observation` | `91/A` in all repeats | Keep small-table behavior |

Controls had `false_positive_applied = 0`. `structure-3775` remains route-volatile in this subset (`79/C`, `93/A`, `93/A`) but no table-batch behavior fired on it.

## Next Direction

The table association mutator is working, but promotion is blocked by general route volatility rather than table capability. The next useful stage should either:

- explicitly park `fixture-inaccessible`, `figure-4754`, and `structure-3775` route volatility and validate table batching with that parked-debt policy; or
- open a broader route-determinism project for artifact/native-link scheduling before further table promotion.

## Boundaries Preserved

- No PAC scoring cap changes.
- No PAC gate changes.
- No global orphan-MCID exception.
- No table batch threshold changes.
- No timeout, API, planner breadth, AI, or new repair-tool changes.
- Generated PDFs and `Output` artifacts remain untracked.
