# Table Original-Control Impact Diagnostic

Date: 2026-05-28

## Summary

Added `scripts/table-original-control-impact-diagnostic.ts`, a read-only comparator for table behavior acceptance gates. It compares an accepted/control original-50 artifact against one or more candidate original-50 artifacts and attributes score movement to:

- configured direct table behavior markers;
- table-route changes without those markers;
- unrelated route/runtime regressions;
- direct table behavior PAC side effects.

The script reads existing JSON artifacts only. It does not analyze PDFs, remediate PDFs, write PDFs, call ODL/PAC/POC/Java, or invoke semantic/LLM work.

Local output:

- `/mnt/pdf-review/pdfaf-table-diagnostics/table-original-control-impact-2026-05-28-r2/table-original-control-impact-diagnostic.md`
- `/mnt/pdf-review/pdfaf-table-diagnostics/table-original-control-impact-2026-05-28-r2/table-original-control-impact-diagnostic.json`

Compared artifacts:

- Baseline: `/mnt/pdf-review/pdfaf-validation/original50-leading-empty-table-header-fix-2026-05-26-r1/baseline_report.json`
- Candidate r1: `/mnt/pdf-review/table-heavy-next-2026-05-27-r2/original50-empty-row-regularity-tablecount-r1/baseline_report.json`
- Candidate r2: `/mnt/pdf-review/table-heavy-next-2026-05-27-r2/original50-empty-row-regularity-tablecount-r2/baseline_report.json`

## Result

Decision: `original_gate_blocked_by_unrelated_route`.

Next lane: `park_or_stabilize_original_route_debt_then_return_to_table_behavior`.

Summary:

- Direct table behavior rows: `4057`.
- Direct table behavior regressions: none.
- Direct table behavior non-table PAC side effects: none.
- Runtime timeout regressions: `4076`.
- Unrelated route regressions: `3661`, `3981`, `4076`, `4438`, `4516`, `4680`.
- Table-route changed without behavior marker: none.

The configured direct table behavior markers were:

- `stage180_empty_row_regularity_cleanup`
- `stage180_header_regularization_sequence`
- `stage180_explicit_table_continuation`
- `largeObjectBackedTableBatch`

The only original-50 row with a direct table behavior marker was `4057`, and it improved `93 -> 97` in both candidate artifacts. The prior original-50 gate failure therefore is not evidence that the configured table behavior directly harmed original controls.

## Decision

This does not accept the parked broader table behavior by itself. It does make the gate blocker sharper:

- Do not broaden table admission simply because Montana positives exist.
- Do not attribute the prior original-50 failure to direct table behavior without marker evidence.
- Before accepting another table behavior, either stabilize or explicitly park the unrelated route/runtime rows, then run targeted proof-pack and original-50 validation again.
- Use this comparator alongside the normal original-50 run to identify whether future failures are table-lane side effects or unrelated route volatility.

## Implication

The table-heavy goal can return to table behavior proof after route debt is handled or explicitly parked. The likely next table work remains strict object-backed table transaction or mixed heading/table diagnostics for U.S. Courts, not a broad layout-only table expansion.
