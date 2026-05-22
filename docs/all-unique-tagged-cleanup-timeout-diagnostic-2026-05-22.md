# All-Unique Tagged Cleanup Timeout Diagnostic

Date: 2026-05-22

## Summary

This is a diagnostic-only follow-up to the `4516` timeout seen during the rejected local-font guard proof. That proof showed `4516` timing out after entering `tagged_cleanup_post_pass`, with a best checkpoint of only `83/B`, still below the timeout-return floor.

The source change adds nested runtime trace phases inside `tagged_cleanup_post_pass`:

- `tagged_cleanup_post_pass:set_pdfua_identification`
- `tagged_cleanup_post_pass:orphan_drain_N`

No scoring, remediation routing, PAC gates, mutation acceptance, checkpoint floors, API behavior, Docker behavior, or benchmark outcomes are intentionally changed.

## Evidence

Original timeout artifact:

- `/mnt/pdf-review/pdfaf-validation/local-font-budget-guard-proof-2026-05-22-r1/run-r1/baseline_report.json`
- Timeout diagnostic: `/mnt/pdf-review/pdfaf-validation/local-font-budget-guard-proof-2026-05-22-r1/hard-timeout-tail-diagnostic-r1/hard-timeout-tail-diagnostic.md`
- `4516` timed out after entering `tagged_cleanup_post_pass` at about `223288ms`.
- Best checkpoint: `83/B`, rejected for timeout return by `checkpoint_below_floor(83<85)`.

Current-source repeats with nested tracing:

- `/mnt/pdf-review/pdfaf-validation/tagged-cleanup-trace-4516-2026-05-22-r1/run-r1/baseline_report.json`
- `/mnt/pdf-review/pdfaf-validation/tagged-cleanup-trace-4516-2026-05-22-r2/run-r1/baseline_report.json`

Results:

- Repeat r1 completed at `85/B` in `257524ms`, with `false_positive_applied=0`.
- Repeat r2 completed at `59/F` in `259506ms`, with `false_positive_applied=0`.
- Repeat r2 returned a verified low-score checkpoint before post-pass: `return:before_post_pass`, `59/F`, `low_score_timeout_checkpoint_eligible`.
- Neither repeat reproduced the `tagged_cleanup_post_pass` timeout, so the new nested subphase trace did not yet capture a subphase timeout.

## Decision

No behavior change is justified from this evidence.

`4516` should be treated as route/runtime volatile until a repeatable timeout shape is isolated. Do not lower checkpoint floors: `83/B` and `59/F` are not acceptable completion states for this lane without an explicit accepted floor policy change.

The next useful runtime work is one of:

- a broader repeatability diagnostic for `4516` that compares initial analysis, stage sequence, checkpoint selection, and post-pass entry across repeats; or
- a separate behavior proof only if a reproducible tagged-cleanup subphase timeout appears and controls show that skipping/budgeting that subphase preserves PAC-visible repair truth.

## Validation

- `npx -y node@22 /usr/bin/pnpm exec vitest run tests/remediation/orchestrator.test.ts tests/scripts/allUniqueHardTimeoutTailDiagnostic.test.ts`
- `npx -y node@22 /usr/bin/pnpm run lint`

Generated benchmark artifacts remain local under `/mnt/pdf-review`.
