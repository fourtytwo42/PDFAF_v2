# All-Input Fresh r5 Current-Code Checkpoint

Date: 2026-05-11

This checkpoint refreshes the stale first six shards from the fresh r4 merge under current source. It uses deterministic no-semantic remediation and skips writing remediated PDFs.

## Artifacts

- Refreshed shards: `Output/goal-all-input-mean-2026-05-09-r1/fresh-all-input-validation-2026-05-11-r5/shard-01` through `shard-06`
- Merged root: `Output/goal-all-input-mean-2026-05-09-r1/fresh-all-input-validation-2026-05-11-r5-merged`
- Merged diagnostic: `Output/goal-all-input-mean-2026-05-09-r1/fresh-all-input-validation-diagnostic-2026-05-11-r5/all-input-mean-diagnostic.md`

Shards `07` and `08` are carried forward from the prior r4 completion because they were already refreshed.

## Result

- PDFs processed: `351`
- Mean after remediation: `91.9915`
- Median after remediation: `94`
- Grade distribution: `322 A / 6 B / 1 C / 10 D / 9 F`
- Rows below `93`: `48`
- Points needed for mean `93`: `354`
- Runtime mean / median / p95 / max: `47065.2ms / 16427ms / 245500ms / 300025ms`
- `false_positive_applied`: `0`

Hard timeouts:

- `0114-9f229330b403-4587-an-inventory-and-examination-of-restorative-justice-practices-for-youth-.pdf`
- `0031-9d63e648dc78-structure-4438.pdf`
- `0208-d966f95ddc9f-4446-women-and-reentry-evaluation-of-the-st-leonard-s-ministries-grace-house-.pdf`

## Interpretation

The refresh confirms that several earlier low rows were stale measurement rather than current behavior:

- `0108` now completes at `91/A` in shard context.
- `0236` completes at `97/A`.
- `0347` completes at `94/A`.
- `long-4516` completes at `89/B`, not a hard timeout.

The goal is still not complete. The remaining deficit is concentrated in:

- hard timeouts/runtime debt: `0114`, `structure-4438`, `0208`
- heading/reading route debt: `4139`, `4215`, `0316`, `0346`
- table/alt mixed debt: `4453`, `4567`, `4690`, `4105`, `4678`, `4519`
- table debt: `4722`, `4694`, `4147`, `4735`, `0287`
- alt debt: `long-4683`, `4503`, `4687`, `0296`, `4635`, `4693`

Follow-up diagnostics run against the r5 merged artifact:

- Target selection: `Output/goal-all-input-mean-2026-05-09-r1/target-selection-diagnostic-r5-2026-05-11-r1/target-selection-diagnostic.md`
- Timeout checkpoint check: `Output/goal-all-input-mean-2026-05-09-r1/low-checkpoint-timeout-diagnostic-r5-runonly-2026-05-11-r1/low-checkpoint-timeout-diagnostic.md`
- Structure/annotation sequence check: `Output/goal-all-input-mean-2026-05-09-r1/structure-annotation-sequence-diagnostic-r5-2026-05-11-r1/structure-annotation-sequence-diagnostic.md`
- Proposal materialization check: `Output/goal-all-input-mean-2026-05-09-r1/proposal-materialization-diagnostic-r5-2026-05-11-r1/proposal-materialization-diagnostic.md`

The target selector still ranks `heading_reading_recovery_target` first, with `326` points of deficit across seven rows. The timeout checkpoint diagnostic found three current hard timeouts and no safe timeout-return behavior: `0114` has a best verified checkpoint of only `38/F`, `0208` has only `51/F` in the carried r4 trace, and `structure-4438` remains parked with best known `36/F` below its `90/A` floor. The r5 structure/annotation diagnostic found no ready sequence probe candidates; `0200` is the only low row with a proposal-buffer route gap, but it remains excluded because prior deterministic validation did not reproduce recovery. The r5 proposal materialization diagnostic likewise identifies `0200` as requiring a rejected proposal buffer, with no target evidence and a prior failed probe.

Next work should not be a checkpoint-return or broad proposal-buffer behavior change from this evidence. The most defensible branches are a focused object-level diagnostic for the remaining non-timeout heading rows (`4139`, `4215`, `0316`, `0346`, `4082-two-bad-headings`) or a fresh direct-table/alt object diagnostic for the larger table/alt mixed deficit. Do not mark the goal complete from this checkpoint.
