# Original-Control Route Gate Diagnostic

Date: 2026-05-28

## Summary

Added `scripts/original-control-route-gate-diagnostic.ts`, a read-only diagnostic for the table-heavy goal acceptance blocker. It reads existing benchmark JSON artifacts, including standard `experiment-corpus-benchmark` run directories and `baseline_report.json` files, and classifies whether original-50 blockers are table-related.

The script does not analyze PDFs, remediate PDFs, write PDFs, call ODL/PAC/POC/Java, or invoke semantic/LLM work.

Local outputs:

- `/mnt/pdf-review/pdfaf-table-diagnostics/original-control-route-repeat-2026-05-28-r1/run-2026-05-28T01-46-17-303Z`
- `/mnt/pdf-review/pdfaf-table-diagnostics/original-control-route-gate-2026-05-28-r1/original-control-route-gate-diagnostic.md`
- `/mnt/pdf-review/pdfaf-table-diagnostics/original-control-route-gate-2026-05-28-r1/original-control-route-gate-diagnostic.json`

## Fresh Current-Source Repeat

Command mode: Node 22, deterministic, `--no-semantic`, no remediated PDFs.

Rows:

- `structure-4076`: `38/F -> 90/A`, no timeout, no table tools.
- `structure-4438`: `59/F -> 83/B`, table tools applied, final `table_markup=72`.
- `long-4516`: `43/F -> 59/F`, final `alt_text=0`, `table_markup=100`.
- `long-4680`: `59/F -> 59/F`, final `alt_text=0`, `table_markup=100`.
- `long-4683`: `59/F -> 94/A`, recovered.

## Decision

Decision: `park_or_stabilize_non_table_routes_before_table_behavior`.

Next lane: `non_table_original_route_stabilization_or_explicit_parking`.

The fresh current-source evidence does not support broadening table admission next. The active blockers are mostly non-table route failures:

- `long-4516`: figure/alt route blocker, table score already `100`.
- `long-4680`: figure/alt route blocker, table score already `100`.
- `structure-4076`: recovered from timeout but remains a low `90/A` with heading/PDF-UA debt, not table debt.

One current blocker is table-control debt:

- `structure-4438`: table tools apply and table score remains below target.

Historical candidate artifacts also show the table follow-up did not fire on original-50 gate blockers, so the broader table behavior failure was not proven to be a table side effect. It still cannot be accepted while these original-control routes fail the gate.

## Implication

For the active table-heavy goal, the practical path is:

1. Do not broaden table admission from the Montana/U.S. Courts proof alone.
2. Either stabilize or explicitly park the non-table original-control route blockers.
3. Treat `structure-4438` as a separate original table-control diagnostic before using it as a control gate.
4. Return to strict object-backed table transaction or mixed heading/table work only after the acceptance gate is not dominated by unrelated original-control routes.
