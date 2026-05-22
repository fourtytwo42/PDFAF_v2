# All-Unique Post-Pass Finalization Timeout Diagnostic

Date: 2026-05-22

## Summary

This is a diagnostic-only follow-up to the all-unique r2 hard-timeout tail work. It adds runtime trace markers around late post-pass phases and document-finalization subphases so timeout rows identify the last active phase before the per-PDF wall.

No scoring, planner routing, mutation acceptance, PAC gates, checkpoint floors, or remediation behavior changed.

## Evidence

Source run:

- `/mnt/pdf-review/pdfaf-validation/allunique-postpass-trace-0135-2026-05-22-r2/run-r1/baseline_report.json`
- Input row: `0135-4453-juvenile-justice-in-illinois-2014.pdf`
- Mode: Node 22, deterministic, `--no-semantic --no-pdfs`
- Result: hard timeout at `300006ms`
- `false_positive_applied=0`

Diagnostic:

- `/mnt/pdf-review/pdfaf-validation/allunique-postpass-trace-0135-2026-05-22-r2/hard-timeout-tail-diagnostic-r1/hard-timeout-tail-diagnostic.md`
- Classification: `post_pass_timeout_after_low_checkpoint`
- Decision: `plan_post_pass_phase_timeout_probe`

Key trace facts:

- Best verified checkpoint stayed `59/F` and was below the timeout-return floor: `checkpoint_below_floor(59<85)`.
- The row spent about `56.6s` in `tagged_cleanup_post_pass` without score movement.
- Stage 180 and Stage 181 post-passes were effectively no-op/fast in this repeat.
- The terminal timeout happened after entering `document_finalization:embed_local_font_substitutes` at about `267095ms`.
- About `32911ms` elapsed after that start event before the row hit the wall.
- The run also recorded `3` no-gain `figure_alt_target_reanalysis` calls totaling about `81487ms`.

## Decision

The evidence does not justify lowering checkpoint floors or returning a `59/F` state as a completed repair. It does show that `0135` is currently blocked by optional local-font substitution running too late in the bounded remediation budget.

The next behavior proof, if pursued, should be a narrow native runtime guard for `embed_local_font_substitutes`, not a PDF-specific timeout exception. A safe predicate would need to prove that local font substitution is optional at that late point, does not hide real font/CMap debt, and avoids new hard timeouts without reducing accepted quality.

## Proposed Next Gate

Before any behavior acceptance:

- Target positives should include `0135` and at least one other row where late local-font substitution is reproducibly budget-risky.
- Controls should include original-50 long/runtime rows such as `long-4516`, `long-4683`, `structure-4438`, and at least one row where local font substitution is known to help.
- Validation must preserve `false_positive_applied=0`.
- Do not accept a guard that only avoids a zero by skipping a real required repair and returning a below-floor state.
- Original-50 deterministic validation is required before acceptance because previous timeout guards have caused unrelated runtime regressions.

## Follow-Up Proof: Local Font Guard Rejected

A temporary runtime guard for late `embed_local_font_substitutes` was tested and reverted before commit. It skipped only the optional local-font-substitution subphase when there was not enough wall budget for another mutation/reanalysis window.

Proof artifact:

- `/mnt/pdf-review/pdfaf-validation/local-font-budget-guard-proof-2026-05-22-r1/run-r1/baseline_report.json`
- Diagnostic: `/mnt/pdf-review/pdfaf-validation/local-font-budget-guard-proof-2026-05-22-r1/hard-timeout-tail-diagnostic-r1/hard-timeout-tail-diagnostic.md`
- Mode: Node 22, deterministic, `--no-semantic --no-pdfs --write-runtime-traces`

Result:

- `0135` still hard-timed out at `300004ms`; the local font phase was skipped and `document_finalization` finished at `59/F`, but the row later timed out outside traced remediation work.
- `4516` hard-timed out as a control after entering `tagged_cleanup_post_pass` at `223288ms`; best checkpoint was `83/B`, still below the timeout-return floor.
- Local-font beneficiary controls stayed stable: `4057 93/A`, `4076 90/A`, `4156 95/A`, `4172 93/A`, `4699 95/A`.
- `4683` completed at `59/F`, matching the known volatile/runtime-risk shape rather than proving a local-font fix.
- `false_positive_applied=0`.

Decision:

- Do not accept or reintroduce the local-font-only runtime guard. It is too narrow to recover `0135` and it does not address the broader post-pass/runtime tail.
- The next runtime lane should target the two newly separated shapes:
  - `0135`: post-remediation/final-alt work after a below-floor `document_finalization` checkpoint.
  - `4516`: `tagged_cleanup_post_pass` timeout after improving to an `83/B` but still below-floor state.
- Do not lower checkpoint floors for either row.

## Source Change Scope

The source change is trace-only:

- `RemediationRuntimeTraceEvent` now supports `post_pass_start` and `post_pass_finish`.
- Late post-pass blocks emit named phase start/finish events.
- `applyIcjiaDocumentFinalization` can emit nested phase traces when called from the main remediation path.
- `scripts/all-unique-hard-timeout-tail-diagnostic.ts` classifies named post-pass timeouts separately and reports the last post-pass phase.

Generated benchmark artifacts remain local under `/mnt/pdf-review`.
