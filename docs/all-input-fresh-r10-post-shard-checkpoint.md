# All-Input Fresh r10 Post-Shard Checkpoint

Date: 2026-05-12

This checkpoint records the state after completing the last two shards of the fresh all-input r10 validation and running follow-up diagnostics against the current r10 plus targeted `0208` and `0200` overlays.

## Artifacts

- Complete shard root: `Output/goal-all-input-mean-2026-05-09-r1/fresh-all-input-validation-2026-05-12-r10`
- Merged run root: `Output/goal-all-input-mean-2026-05-09-r1/fresh-all-input-validation-2026-05-12-r10-merged`
- Mean diagnostic: `Output/goal-all-input-mean-2026-05-09-r1/fresh-all-input-validation-diagnostic-2026-05-12-r10/all-input-mean-diagnostic.md`
- Current planning overlay: `Output/goal-all-input-mean-2026-05-09-r1/progress-overlay-r10-plus-0208-0200-2026-05-12-r2`

## Fresh r10 Result

- PDFs processed: `351`
- Mean after remediation: `92.4131`
- Median after remediation: `94`
- Grade distribution: `324 A / 6 B / 2 C / 10 D / 7 F`
- Rows below `93`: `46`
- Points needed for mean `93`: `206`
- Runtime mean / median / p95 / max: `47196.4ms / 17777ms / 240070ms / 300044ms`
- `false_positive_applied`: `0`

Last shards:

- `shard-07`: `44` rows, mean `89.5227`, `false_positive_applied=0`
- `shard-08`: `43` rows, mean `89.8372`, `false_positive_applied=0`

## Current Overlay

After the already-validated `0208` low-score timeout return and `0200` proposal-buffer recovery, the planning overlay projects:

- Mean: `92.6809`
- Points still needed for mean `93`: `112`
- Rows below target: `45`

This is a planning projection, not a fresh all-input validation after those commits.

## Follow-Up Diagnostics

Post-r10 diagnostics were run to avoid repeating unsafe branches:

- PAC object evidence gap: `Output/goal-all-input-mean-2026-05-09-r1/pac-object-evidence-gap-r10-plus-0208-0200-2026-05-12-r1`
- Table/ParentTree object diagnostic: `Output/goal-all-input-mean-2026-05-09-r1/table-parenttree-object-current-diagnostic-2026-05-12-r1`
- Structure/annotation sequence scan: `Output/goal-all-input-mean-2026-05-09-r1/structure-annotation-sequence-r10-plus-0208-0200-2026-05-12-r1`
- Proposal materialization scan: `Output/goal-all-input-mean-2026-05-09-r1/proposal-materialization-r10-plus-0208-0200-2026-05-12-r1`
- Stage attribution scan: `Output/goal-all-input-mean-2026-05-09-r1/stage-attribution-r10-plus-0208-0200-2026-05-12-r1`
- Low-checkpoint timeout scan: `Output/goal-all-input-mean-2026-05-09-r1/low-checkpoint-timeout-r10-plus-0208-0200-2026-05-12-r1`
- Route-volatility aggregate: `Output/goal-all-input-mean-2026-05-09-r1/route-volatility-aggregate-r10-plus-0208-0200-2026-05-12-r1`

## Decisions

- Do not re-add `0114` to the proposal-buffer sequence list. It was already tested and reverted; current proposal materialization still lacks a safe final cleanup proof.
- Do not widen table-header association batching. The current table/ParentTree object diagnostic found no safe association-metadata candidates among the active low rows.
- Keep `structure-4438` parked. It remains a hard timeout with best known checkpoint far below the `90/A` floor.
- Do not patch `0149`, `0236`, `0287`, `0296`, or `0097` from current route evidence. Their better focused runs are classified as upstream route volatility or no-safe-route-proof, not same-state guard candidates.
- Treat `0296` repeat `Output/goal-all-input-mean-2026-05-09-r1/run-0296-current-repeat-2026-05-12-r2` as measurement only: it reproduced `88/B` with `false_positive_applied=0`, but route comparison `route-recovery-0296-r10-vs-repeat-2026-05-12-r1` is upstream volatility and still below target.

## Next Direction

The goal is still open. The remaining gap is too large for near-pass polish alone. The next behavior stage should require a new object-level proof, not another broad retry or route suppression:

- a PAC/object-backed repair family for table/ParentTree rows where stable object identity and protected reanalysis movement can be proven;
- a row-scoped proposal-buffer materialization only if the rejected proposal buffer can be materialized and final annotation/link cleanup is PAC-safe; or
- an explicit semantic reproducibility stage if a local LLM can be made reliably available and source-reanalyzed outputs prove movement.

Do not claim the all-input mean goal until a fresh broad validation, not just an overlay, exceeds `93` with `false_positive_applied=0`.
