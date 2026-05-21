# Table Undersegmentation Transaction Diagnostic

Date: 2026-05-21

Decision: `plan_table_transaction_behavior_stage`

## Scope

This stage is diagnostic-only. It adds a native/ODL-sidecar comparison script that reads existing JSON artifacts and does not call OpenDataLoader, analyze PDFs, remediate PDFs, write remediated PDFs, change scoring, change planner routing, or mutate production behavior.

Source change:

- `scripts/table-undersegmentation-transaction-diagnostic.ts`

Local diagnostic artifact:

- `/mnt/pdf-review/pdfaf-odl-diagnostics/table-undersegmentation-transaction-2026-05-21-r1`

Input artifact:

- `/mnt/pdf-review/pdfaf-odl-diagnostics/odl-native-layout-evidence-15pdf-2026-05-19-r5/comparison-report.json`

## Result

The diagnostic analyzed `9` rows: `4` table-undersegmentation focus rows plus `5` original/control rows selected from the sidecar report.

Classification distribution:

- `transaction_ready_dense_table`: `4`
- `layout_table_control_noise`: `5`

Decision reasons:

- `transaction_ready_dense_table_focus=4`
- `unsafe_control_candidates=0`
- `runtime_or_analyzer_debt=0`
- at least two focus rows share dense table transaction evidence and controls are clean

## Supported Rows

The four focus rows share the same general structural predicate:

- low table score debt;
- native dense row-band / undersegmented table evidence from existing pdf.js layout audit;
- stable PDFAF table refs and table shapes;
- large ODL-vs-PDFAF table delta from sidecar evidence;
- PAC/table-like structural debt in PDFAF signals.

Rows classified as `transaction_ready_dense_table`:

| Row | Score | Table | Native table evidence | PDFAF/ODL tables | First suggested tool |
| --- | ---: | ---: | --- | --- | --- |
| `va-08-drug-cases-submitted-to-the-virginia-department-of-forensic-scie` | `28/F` | `0` | `layout=27`, `dense=15`, `under=25` | `16/2453` | `normalize_table_structure` |
| `va-09-drug-cases-submitted-to-the-virginia-department-of-forensic-scie` | `35/F` | `0` | `layout=27`, `dense=16`, `under=26` | `41/3043` | `normalize_table_structure` |
| `va-10-drug-cases-submitted-to-the-virginia-department-of-forensic-scie` | `35/F` | `0` | `layout=29`, `dense=18`, `under=29` | `43/3079` | `normalize_table_structure` |
| `va-11-drug-seizures-overdose-fatalities-quarterly-update-december-2025` | `53/F` | `79` | `layout=3`, `dense=3`, `under=2` | `1/21` | `set_table_header_cells` |

The first three rows are shape-first candidates: strongly irregular table debt suggests `normalize_table_structure` must precede header association work. The fourth row is closer to header-association-only debt and should use `set_table_header_cells` first if a behavior stage is opened.

## Rejected Controls

Controls stayed out of behavior-ready classes:

- `ADAM2`
- three Microsoft Teams variants
- `pdfaf_fixture_accessible`

The accessible fixture is the important guard: it has table-like evidence and `table_markup=79`, but it remains an A-grade overall control and is classified as `layout_table_control_noise`. This confirms table layout evidence alone is not a safe production predicate.

## Next Behavior Gate

A separate behavior stage is justified, but it should remain narrow:

- Add a native planner helper for dense table transaction admission.
- Require low table score, stable table refs, native dense row-band evidence, ODL/native sidecar support only as diagnostic evidence, and PAC/table debt.
- Reject high-grade controls and rows with only layout evidence.
- Use only existing tools: `normalize_table_structure`, `set_table_header_cells`, and existing bounded table/header sequence logic.
- Do not add new mutators, scorer caps, PAC relaxations, checker masking, source gates, row gates, path gates, or ODL runtime calls.

Acceptance for that later behavior stage must include targeted focus/control validation, `false_positive_applied=0`, no new hard timeouts, speed stability, and original-50 deterministic validation before acceptance.
