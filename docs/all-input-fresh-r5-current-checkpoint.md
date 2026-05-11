# All-Input Fresh r5 Current-Code Checkpoint

Date: 2026-05-11

This checkpoint refreshes all eight shards under current source. It uses deterministic no-semantic remediation. Shards 1-6 were run without PDFs; shards 7-8 were completed afterward with PDFs written.

## Artifacts

- Complete shard root: `Output/goal-all-input-mean-2026-05-09-r1/fresh-all-input-validation-2026-05-11-r5`
- Complete merged baseline report: `Output/goal-all-input-mean-2026-05-09-r1/r5-complete-baseline-report-2026-05-11-r1/baseline_report.json`
- Complete diagnostic: `Output/goal-all-input-mean-2026-05-09-r1/fresh-all-input-validation-diagnostic-2026-05-11-r5-complete/all-input-mean-diagnostic.md`

## Result

- PDFs processed: `351`
- Mean after remediation: `92.0456`
- Median after remediation: `94`
- Grade distribution: `323 A / 6 B / 1 C / 9 D / 9 F`
- Rows below `93`: `49`
- Points needed for mean `93`: `335`
- Runtime mean / median / p95 / max: `47196.4ms / 16141ms / 245505ms / 300021ms`
- `false_positive_applied`: `0`

Hard timeouts:

- `0114-9f229330b403-4587-an-inventory-and-examination-of-restorative-justice-practices-for-youth-.pdf`
- `0031-9d63e648dc78-structure-4438.pdf`
- `0120-a9de52a274a8-4690-evaluation-of-the-development-of-a-multijurisdictional-police-led-deflec.pdf`

## Interpretation

The refresh confirms that several earlier low rows were stale measurement rather than current behavior:

- `0108` now completes at `91/A` in shard context.
- `0236` completes at `97/A`.
- `0347` completes at `94/A`.
- `long-4516` completes at `89/B`, not a hard timeout.
- `0208` completes at `59/F` in the full shard, but a focused repeat hard-timed out, so it remains runtime-route debt.

The goal is still not complete. The remaining deficit is concentrated in:

- hard timeouts/runtime debt: `0114`, `0120`, `structure-4438`
- heading/reading/runtime route debt: `0208`, `4139`, `4215`, `0316`, `0346`
- table/alt mixed debt: `4453`, `4567`, `4690`, `4105`, `4678`, `4519`
- table debt: `4722`, `4694`, `4147`, `4735`, `0287`
- alt debt: `long-4683`, `4503`, `4687`, `0296`, `4635`, `4693`

Follow-up diagnostics run against the complete r5 artifact:

- Target selection: `Output/goal-all-input-mean-2026-05-09-r1/target-selection-diagnostic-r5-complete-2026-05-11-r1/target-selection-diagnostic.md`
- Heading residual object diagnostic: `Output/goal-all-input-mean-2026-05-09-r1/heading-residual-object-diagnostic-r5-complete-2026-05-11-r2/heading-residual-object-diagnostic.md`
- Runtime-heavy repeat: `Output/goal-all-input-mean-2026-05-09-r1/run-runtime-route-heavy-r5-complete-2026-05-11-r1`
- Route comparisons:
  - `Output/goal-all-input-mean-2026-05-09-r1/route-recovery-4215-runtime-repeat-vs-r5-complete-2026-05-11-r1`
  - `Output/goal-all-input-mean-2026-05-09-r1/route-recovery-0208-runtime-repeat-vs-r5-complete-2026-05-11-r1`

The complete target selector still ranks `heading_reading_recovery_target` first, with `360` points of deficit across eight non-parked heading rows. The complete heading residual diagnostic splits that into `2` parked hard timeouts (`0114`, `0120`), `2` runtime-route-heavy rows (`0208`, `4215`), and only one direct content-tagging object candidate (`0346`). A focused `0208`/`4215` repeat did not prove a safe recovery: `4215` repeated at `59/F` with upstream route volatility, while `0208` changed from slow `59/F` to hard timeout with no applied tools.

Next work should not be a checkpoint-return or broad proposal-buffer behavior change from this evidence. The most defensible branches are a bounded many-figure-alt design diagnostic for direct checker-visible missing-alt rows such as `0136`, or a deeper runtime/analyzer design for `0114`/`0120`/`0208`. Do not mark the goal complete from this checkpoint.
