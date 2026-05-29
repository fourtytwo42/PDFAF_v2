# Original-50 Route-Drop Diagnostic

Date: 2026-05-29

## Summary

Added `scripts/original50-route-drop-diagnostic.ts`, a read-only comparator for the original-50 stabilization goal. It consumes existing `baseline_report.json` artifacts and compares a failed/candidate original-50 gate against accepted references and focused repeats. It reports score spread, category drops, PAC regressions, tool-family signals, and a row classification without analyzing PDFs, remediating PDFs, writing remediated PDFs, or calling ODL/PAC/POC/Java/LLM.

Source tests:

- `tests/scripts/original50RouteDropDiagnostic.test.ts`

Local artifacts:

- Comparator report: `/mnt/pdf-review/pdfaf-validation/original50-route-drop-diagnostic-2026-05-29-r2/original50-route-drop-diagnostic.md`
- Comparator JSON: `/mnt/pdf-review/pdfaf-validation/original50-route-drop-diagnostic-2026-05-29-r2/original50-route-drop-diagnostic.json`
- `4754` focused repeat: `/mnt/pdf-review/original50-route-drop-repeat-2026-05-29-r1/run-4754-r1/baseline_report.json`

The `4754` repeat used deterministic Node 22 validation with `--no-semantic --no-pdfs`, 300s child timeout, 10s external grace, and scratch under `/mnt/pdf-review/pdfaf-tmp`.

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

## Key Finding

The failed original-50 gate is not primarily blocked by `4438` table-control behavior anymore. The local table-continuation experiment recovered `4438` to the accepted `83/B` route, but the full gate still failed because non-table and mixed route drops appeared elsewhere.

Diagnostic decision: `diagnose_non_table_route_volatility_before_table_reopen`

Summary:

- Selected rows: `6`
- Gate timeouts: `0`
- Gate `false_positive_applied`: `0`
- Route-drop rows: `5`
- Stable table-control debt rows: `1`

## Row Classifications

| Row | Gate Score | Best Reference | Classification | Interpretation |
| --- | ---: | ---: | --- | --- |
| `4076` | `90/A` | `90/A` | `route_drop_unattributed` | Repeat spread is `69` to `90`, with reading order sometimes dropping to `0`; near-wall route/analyzer volatility remains. |
| `4438` | `83/B` | `83/B` | `table_control_checkpoint_debt` | The table route is recovered to the accepted state when allowed to continue; this row is no longer the main reason the tested full gate failed. |
| `4516` | `59/F` | `92/A` | `mixed_route_drop` | Gate lost `33` points versus reference, mainly `alt_text 100->0` plus PDF/UA drop and `pdfua.figure.alt_present` regression evidence. |
| `4680` | `59/F` | `98/A` | `mixed_route_drop` | Gate lost `39` points with figure-alt and table-header PAC regression evidence; focused/current references can reach A range. |
| `4683` | `62/D` | `99/A` | `mixed_route_drop` | Gate lost `37` points, with `alt_text 100->20`, `heading_structure 99->43`, and figure/table PAC regression evidence. |
| `4754` | `85/B` | `94/A` | `mixed_route_drop` | Single-row repeat recovered to `94/A`; the failed gate had a repeat-supported route swing, with `heading_structure 86->44` and figure/table PAC regression evidence. |

## Decision

Do not reintroduce the table-continuation behavior as a standalone table fix, and do not reopen parked broad table lanes yet.

The next blocker family is original-50 route volatility, not missing table admission. A useful next stage should compare route timelines and replay states for:

- `4516`
- `4680`
- `4683`
- `4754`
- `4076`

The most promising immediate shape is a route-state diagnostic around mixed figure/heading/table side effects: these rows can reach A or near-A states in focused/accepted references, but the failed full gate falls through lower final states with PAC figure/table regressions or reading-order collapse. Any future behavior must be general, source-independent, PAC-honest, and accepted only after a fresh original-50 gate passes the established floor.

## Guardrails

- No production behavior changed from this diagnostic.
- Do not weaken score caps, PAC regressions, checkpoint floors, or false-positive truth rules.
- Do not add row, filename, source, corpus, path, or hash gates.
- Do not use the recovered `4438` route to claim original-50 stability while the mixed route-drop rows remain.
- Do not accept table-heavy outside-source behavior until original-50 route drops are fixed or formally parked with source-tracked evidence.
