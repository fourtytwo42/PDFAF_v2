# Long-4516 Route Repeatability Diagnostic

Date: 2026-05-22

This is a diagnostic-only follow-up to the May 22 post-pass timeout tracing. It compares existing benchmark JSON and runtime trace artifacts only. It does not analyze PDFs, remediate PDFs, write remediated PDFs, call PAC/POC/ODL/Java/semantic AI, change scoring, change checkpoint policy, or change production behavior.

Local artifact:

- `/mnt/pdf-review/pdfaf-validation/long4516-route-repeatability-diagnostic-2026-05-22-r1/long4516-route-repeatability-diagnostic.md`

Compared artifacts:

- `/mnt/pdf-review/pdfaf-validation/local-font-budget-guard-proof-2026-05-22-r1/run-r1/baseline_report.json`
- `/mnt/pdf-review/pdfaf-validation/tagged-cleanup-trace-4516-2026-05-22-r1/run-r1/baseline_report.json`
- `/mnt/pdf-review/pdfaf-validation/tagged-cleanup-trace-4516-2026-05-22-r2/run-r1/baseline_report.json`

## Result

Decision: `route_runtime_volatile_no_behavior_ready`

The same `4516` PDF produced three different current-source shapes:

| Artifact | Initial | Final | Shape |
| --- | ---: | ---: | --- |
| local font guard proof | `76/C` | hard timeout | entered `tagged_cleanup_post_pass` after an `83/B` checkpoint, below the accepted `85` timeout-return floor |
| tagged cleanup trace r1 | `58/F` | `85/B` | completed near the wall without a runtime trace |
| tagged cleanup trace r2 | `43/F` | `59/F` | returned a verified low-score checkpoint before post-pass |

The diagnostic also found `33` points of initial-score variance and initial category variance in `alt_text`, `heading_structure`, and `pdf_ua_compliance` (plus non-critical `bookmarks`). This means the timeout result is not starting from a stable native analysis/route state.

## Decision

Do not add a tagged-cleanup timeout guard, local-font guard, post-pass cutoff, checkpoint-floor relaxation, or PAC exception from this evidence.

The `83/B` timeout checkpoint should not be counted as a completed state because it is below the current accepted timeout-return floor. The `59/F` checkpoint return is a truthful bounded fallback, not a completion-quality repair. The `85/B` run proves the row can complete, but not from a reproducible same-route state.

The next useful behavior work is not a `4516`-specific timeout patch. Either:

- collect a stable same-route repeat set where the same post-pass subphase fails from the same initial evidence; or
- open a separate analyzer/route-stability design stage for long native-tagged mixed figure/table/annotation reports.

Until then, keep `4516` parked as route/runtime volatility for the active PAC/POC alignment goal.
