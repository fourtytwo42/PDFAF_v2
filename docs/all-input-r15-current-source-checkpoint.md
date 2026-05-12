# All-Input r15 Current-Source Checkpoint

Date: 2026-05-12

This checkpoint refreshes the affected all-input shards after `/tmp` space pressure made the previous current-source measurement conservative.

## Artifacts

- Refreshed shard root: `Output/goal-all-input-mean-2026-05-09-r1/fresh-all-input-validation-2026-05-12-r15-rerun-shards-01-02/`
- Merged report root: `Output/goal-all-input-mean-2026-05-09-r1/fresh-all-input-validation-2026-05-12-r15-current-source-merged-copy/`
- Mean diagnostic: `Output/goal-all-input-mean-2026-05-09-r1/fresh-all-input-validation-diagnostic-2026-05-12-r15-current-source-merged-r2/all-input-mean-diagnostic.md`
- Target selection: `Output/goal-all-input-mean-2026-05-09-r1/target-selection-r15-current-source-2026-05-12-r1/target-selection-diagnostic.md`
- Repeat feasibility: `Output/goal-all-input-mean-2026-05-09-r1/repeat-recovery-feasibility-r15-2026-05-12-r1/repeat-recovery-feasibility.md`

## Result

- PDFs processed: `351`
- Mean after remediation: `92.3048`
- Median after remediation: `94`
- Grade distribution: `323 A / 6 B / 3 C / 5 D / 12 F / 2 ?`
- Rows below `93`: `47`
- Points needed for mean `93`: `244`
- Runtime p95 / max: `246278ms / 300019ms`
- `false_positive_applied = 0`

The r15 refresh improves the prior current-source merged result from `91.9715` to `92.3048`, mainly by rerunning shards `01` and `02` after cleanup. It does not complete the all-input goal.

## Source Fix

`scripts/baseline-corpus-batch.ts` now routes its initial remediation benchmark analysis through `REMEDIATION_ANALYSIS_TIMEOUT_MS` and the existing per-PDF abort signal. This aligns the batch runner with remediation intent instead of using the check-only analysis default.

This does not change PAC scoring, PAC gates, timeout defaults, repair tools, or planner breadth.

## Remaining Direction

Bounded retry evidence projects only to `92.9658`, so broad retry alone is not enough and should not be promoted as a behavior change. The refreshed target selector still chooses `needs_more_pac_object_evidence` first, followed by heading/reading recovery and table/header evidence.

Route diagnostics for `0345`, `0325`, `0075`, `0297`, `0216`, `0061`, and `0097` did not prove a safe same-state behavior candidate. `0108` remains the only same-state transaction-looking row, but existing and refreshed diagnostics still show unsafe intermediate/final tradeoffs; do not patch it without a final PAC-safe materialization proof.

## r16 Cache-Key Refresh

Analyzer cache keys now include both content hash and filename. This is an honesty/determinism fix because analysis and grading can use filename-derived title/heading fallback evidence, so duplicate bytes under different filenames must not share cached analysis.

Artifacts:

- Refreshed shard: `Output/goal-all-input-mean-2026-05-09-r1/fresh-all-input-validation-2026-05-12-r16-cachekey-shard01/shard-01/`
- Merged report root: `Output/goal-all-input-mean-2026-05-09-r1/fresh-all-input-validation-2026-05-12-r16-cachekey-merged-copy/`
- Mean diagnostic: `Output/goal-all-input-mean-2026-05-09-r1/fresh-all-input-validation-diagnostic-2026-05-12-r16-cachekey-merged-r1/all-input-mean-diagnostic.md`

Result:

- PDFs processed: `351`
- Mean after remediation: `92.4103`
- Median after remediation: `94`
- Grade distribution: `325 A / 5 B / 3 C / 5 D / 11 F / 2 ?`
- Rows below `93`: `46`
- Points needed for mean `93`: `207`
- Runtime p95 / max: `246072ms / 300019ms`
- `false_positive_applied = 0`

The refresh recovered `0345-...exploring-school...` in shard context to `97/A`, improving the measured mean but not completing the all-input goal. `0033` still repeats at `59/F` on current code, and `long-4516` / `structure-4438` remain hard-timeout debt in the merged result.

## r17/r18 Affected-Shard Refresh

After the filename-aware analyzer cache key landed, the affected shards were refreshed instead of rerunning all `351` PDFs:

- r17 shard root: `Output/goal-all-input-mean-2026-05-09-r1/fresh-all-input-validation-2026-05-12-r17-cachekey-affected-shards/`
- r18 shard root: `Output/goal-all-input-mean-2026-05-09-r1/fresh-all-input-validation-2026-05-12-r18-cachekey-affected-shards/`
- r18 merged report root: `Output/goal-all-input-mean-2026-05-09-r1/fresh-all-input-validation-2026-05-12-r18-cachekey-affected-merged-copy/`
- r18 mean diagnostic: `Output/goal-all-input-mean-2026-05-09-r1/fresh-all-input-validation-diagnostic-2026-05-12-r18-cachekey-affected-merged-r1/all-input-mean-diagnostic.md`

Result:

- PDFs processed: `351`
- Mean after remediation: `92.5442`
- Median after remediation: `94`
- Grade distribution: `327 A / 4 B / 2 C / 7 D / 9 F`
- Rows below `93`: `43`
- Points needed for mean `93`: `160`
- Runtime p95 / max: `245745ms / 300008ms`
- `false_positive_applied = 0`

This is the current best measured all-input checkpoint, but it is still below the active `93` mean goal.

Rows that recovered in affected shard context:

- `0325` recovered to `93/A` in r17 shard `05`.
- `0216` recovered to `95/A` in r18 shard `08`.
- `0351` recovered to `93/A` in r18 shard `07`.

Rows that remain non-complete or volatile:

- `long-4516` is currently a hard timeout. Current repeat `Output/goal-all-input-mean-2026-05-09-r1/run-single-long4516-current-cachekey-2026-05-12-r2` timed out with best checkpoint `53/F`, below the row-specific `80/B` floor. Diagnostic `Output/goal-all-input-mean-2026-05-09-r1/route-recovery-long4516-r1-vs-r17-cachekey-2026-05-12-r1` shows the older `89/B` route used score-moving tools, but the current route does not reproduce it. Do not lower the floor or return the `53/F` checkpoint.
- `structure-4438` remains parked runtime/checkpoint debt at the `90/A` floor.
- `0033`, `0075`, and `long-4683` still show upstream route volatility rather than a proven same-state guard candidate under current source.
- `0136` and `0296` have historical high-score artifacts, but the best comparisons either lack tool timelines or classify as no safe route proof; do not patch from those artifacts alone.
