# Original-50 Final Reanalysis Variance Diagnostic

Date: 2026-05-29

## Summary

This diagnostic adds a JSON-only final reanalysis comparison for the original-50
gate blockers. It reads existing `remediate.results.json` artifacts and compares
each row's accepted in-memory `after` state against the benchmark's final
`reanalyzed` state. It does not analyze PDFs, remediate PDFs, write PDFs, call
ODL/PAC/POC/Java, or use semantic/LLM behavior.

The first local report confirms that the active original-50 blocker is still
upstream analyzer/final-reanalysis variance for several rows, while other rows
are stable low remediation debt. This is not behavior-ready table evidence.

## Local Report

- Report directory:
  `/mnt/pdf-review/pdfaf-validation/original50-final-reanalysis-variance-2026-05-29-r1`
- Inputs:
  - `/mnt/pdf-review/original50-current-focus-2026-05-29-r1/run-2026-05-29T18-22-43-531Z`
  - `/mnt/pdf-review/original50-initial-route-repeat-2026-05-29-r1/run-2026-05-29T18-48-39-015Z`
  - `/mnt/pdf-review/original50-upstream-repeat-2026-05-29-r1/run-2026-05-29T19-15-10-378Z`
  - `/mnt/pdf-review/original50-single-analysis-candidate-2026-05-29-r1/run-2026-05-29T19-25-33-755Z`
- Rows: `4076`, `4438`, `4516`, `4680`, `4683`, `4754`
- Decision: `diagnose_final_reanalysis_analyzer_variance_before_behavior`
- Next lane: `native_final_reanalysis_or_analyzer_repeat_stability`

## Classification

| Row | Class | Key evidence |
| --- | --- | --- |
| `figure-4754` | `repeat_reanalysis_variance` | Final score stayed `59/F`, but repeat final profiles differed in heading and reading-order categories plus extracted/tree heading counts. |
| `long-4516` | `stable_low_reanalysis_verified` | Current focused run stayed `92/A -> 92/A` with no after-to-reanalysis category or signal drift. |
| `long-4680` | `repeat_reanalysis_variance` | Four runs stayed `59/F`, but final category/signal profiles varied substantially, including heading, table, reading-order, and figure counts. |
| `long-4683` | `after_to_reanalysis_score_drop` | Candidate run accepted `59/F` in memory but final reanalysis dropped to `52/F`; other runs show large after-to-reanalysis heading/figure/table profile changes. |
| `structure-4076` | `stable_low_reanalysis_verified` | Current focused run stayed `90/A -> 90/A` with no after-to-reanalysis category or signal drift. |
| `structure-4438` | `stable_low_reanalysis_verified` | Current focused run stayed `69/D -> 69/D` with no after-to-reanalysis category or signal drift. |

## Decision

Do not reopen table-heavy outside-source behavior from this evidence. The report
supports a narrower next step:

1. Run or build a bounded native analyzer-repeat attribution diagnostic for
   `4680`, `4683`, and `4754`.
2. Treat `4516`, `4076`, and `4438` as stable low remediation/runtime debt unless
   later repeats prove route volatility.
3. Keep PAC/category guards intact. Do not accept rejected high intermediate
   states or suppress final reanalysis differences for score movement.

The diagnostic script is source-tracked as
`scripts/original50-final-reanalysis-variance-diagnostic.ts`, with focused tests
in `tests/scripts/original50FinalReanalysisVarianceDiagnostic.test.ts`.
