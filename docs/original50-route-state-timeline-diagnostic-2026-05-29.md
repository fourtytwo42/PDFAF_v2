# Original-50 Route-State Timeline Diagnostic

Date: 2026-05-29

## Summary

Added `scripts/original50-route-state-timeline-diagnostic.ts`, a read-only replay/timeline comparator for the current original-50 route-drop blockers. It consumes existing `baseline_report.json` artifacts and compares the failed full gate against accepted references and focused repeats. It reports first route divergence, replay-state signatures, rejected high-scoring candidates, PAC regression families, final category drops, and row-level stabilization class.

No production behavior changed. The script does not analyze PDFs, remediate PDFs, write remediated PDFs, or call ODL/PAC/POC/Java/LLM.

Source tests:

- `tests/scripts/original50RouteStateTimelineDiagnostic.test.ts`

Local artifacts:

- Report: `/mnt/pdf-review/pdfaf-validation/original50-route-state-timeline-diagnostic-2026-05-29-r2/original50-route-state-timeline-diagnostic.md`
- JSON: `/mnt/pdf-review/pdfaf-validation/original50-route-state-timeline-diagnostic-2026-05-29-r2/original50-route-state-timeline-diagnostic.json`

## Inputs

Gate artifact:

- `/mnt/pdf-review/original50-stabilization-2026-05-29-r2/original50-table-continuation-gate-r1/baseline_report.json`

References:

- `/mnt/pdf-review/pdfaf-validation/original50-repeated-template-route-2026-05-28-r1/baseline_report.json`
- `/mnt/pdf-review/pdfaf-validation/original50-table-wrong-ref-guard-2026-05-28-r3/baseline_report.json`
- `/mnt/pdf-review/pdfaf-validation/original50-mcr-pg-bounded-2026-05-28-r2/baseline_report.json`
- `/mnt/pdf-review/original50-stabilization-2026-05-29-r1/focus-repeat-r1/baseline_report.json`
- `/mnt/pdf-review/original50-stabilization-2026-05-29-r1/focus-blockers-repeat-r2/baseline_report.json`
- `/mnt/pdf-review/original50-stabilization-2026-05-29-r2/table-continuation-targeted-r1/baseline_report.json`
- `/mnt/pdf-review/original50-route-drop-repeat-2026-05-29-r1/run-4754-r1/baseline_report.json`
- `/mnt/pdf-review/original50-stabilization-2026-05-29-r1/4438-soft-deadline-probe-r1/baseline_report.json`

## Decision

Decision: `diagnose_guarded_high_candidate_side_effects`

The dominant implementable evidence is not a table-admission gap. The current route drops split into:

- guarded high-scoring candidates that cannot be accepted unless side effects are prevented or restored;
- upstream analyzer/route-state variance with no safe high-candidate commit point;
- one near-wall runtime row.

Do not relax PAC guards or category-regression guards. The next useful behavior-capable work must prevent the side effect or prove a cleanup transaction restores it before acceptance.

## Row Findings

| Row | Gate | Best Reference | Classification | Interpretation |
| --- | ---: | ---: | --- | --- |
| `4076` | `90/A` | `90/A` | `runtime_near_wall` | Current gate is A-range but near the 300s wall; prior focused repeat still showed `69/D` reading-order collapse. Treat as runtime/analyzer volatility, not table evidence. |
| `4516` | `59/F` | `92/A` | `upstream_state_variance` | The low gate loses `alt_text` and PDF/UA versus the accepted high route, but no rejected high-scoring candidate provides a safe commit point. |
| `4680` | `59/F` | `98/A` | `upstream_state_variance` | The low gate diverges from the high focused route from the initial replay state and carries figure/table PAC regression noise, with no safe high candidate. |
| `4683` | `62/D` | `99/A` | `guarded_high_candidate_category_blocked` | Five rejected candidates reach `98` but are blocked by `stage_regressed_category(reading_order:100->96)`. This is a possible cleanup-transaction research lane, not an acceptance shortcut. |
| `4754` | `85/B` | `94/A` | `guarded_high_candidate_pac_blocked` | Two rejected candidates reach `94` but are blocked by `pdfua.table.header_association_present`; focused repeat recovered to `94/A`, so the full-gate low is route-supported volatility. |

## Next Lane

The next highest-value original-50 stabilization lane is a narrow side-effect-prevention diagnostic:

- For `4683`, determine whether the `reading_order 100->96` drop after the high-scoring figure/table candidate is checker-visible true debt or analyzer volatility. If it is true debt, do not accept the high candidate; if it is restorable, prove a cleanup transaction with controls.
- For `4754`, determine why heading repair can produce `94/A` in repeat/reference routes but is rejected in the full gate for table-header PAC regression. Do not suppress `pdfua.table.header_association_present`; only pursue behavior if the table-header side effect can be prevented or repaired generally.
- Keep `4516` and `4680` on an upstream state-variance lane unless new repeat evidence exposes a safe high-candidate state.
- Keep `4076` on runtime/analyzer-volatility monitoring; do not add broad route work from an A-range near-wall row.

## Guardrails

- No behavior change is accepted from this diagnostic.
- Do not weaken PAC regressions, category regression checks, score caps, checkpoint floors, timeout policy, or false-positive truth.
- Do not accept rejected high candidates simply because their score is high.
- Do not add row, filename, source, path, corpus, or hash gates.
- Do not reopen parked table-heavy outside-source lanes until these original-50 route blockers are fixed or parked with evidence.
