# Original-50 Stabilization Diagnostic

Date: 2026-05-29

## Summary

Added `scripts/original50-stabilization-diagnostic.ts`, a read-only Phase 1 diagnostic for the current original-50 acceptance gate. It consumes existing `baseline_report.json` artifacts and classifies focused original-50 blockers into the active goal families without analyzing PDFs, remediating PDFs, writing remediated PDFs, or calling ODL/PAC/POC/Java/LLM.

Source tests:

- `tests/scripts/original50StabilizationDiagnostic.test.ts`

Local artifacts:

- `/mnt/pdf-review/original50-stabilization-2026-05-29-r1/focus-repeat-r1/baseline_report.json`
- `/mnt/pdf-review/original50-stabilization-2026-05-29-r1/focus-blockers-repeat-r2/baseline_report.json`
- `/mnt/pdf-review/pdfaf-validation/original50-stabilization-diagnostic-2026-05-29-r2/original50-stabilization-diagnostic.md`
- `/mnt/pdf-review/pdfaf-validation/original50-stabilization-diagnostic-2026-05-29-r2/original50-stabilization-diagnostic.json`

Both repeats used deterministic Node 22 validation with `--no-semantic --no-pdfs`, a 300s per-PDF timeout, 10s external grace, and scratch under `/mnt/pdf-review/pdfaf-tmp`.

## Repeat Evidence

First focused repeat over `4076`, `4438`, `4516`, `4680`, and `4683`:

- processed `5/5`
- mean after `88.00`
- `false_positive_applied=0`
- timeout/error rows `0`
- `4076`: `90/A`
- `4438`: `69/D`
- `4516`: `89/B`
- `4680`: `98/A`
- `4683`: `94/A`

Second focused repeat over the remaining blockers `4076`, `4438`, and `4516`:

- processed `3/3`
- mean after `76.67`
- `false_positive_applied=0`
- timeout/error rows `0`
- `4076`: `69/D`
- `4438`: `69/D`
- `4516`: `92/A`

## Classification

The r2 stabilization diagnostic compared the second repeat against the first repeat plus the accepted May 28 original-50 gate artifacts:

- `/mnt/pdf-review/pdfaf-validation/original50-repeated-template-route-2026-05-28-r1/baseline_report.json`
- `/mnt/pdf-review/pdfaf-validation/original50-table-wrong-ref-guard-2026-05-28-r3/baseline_report.json`
- `/mnt/pdf-review/pdfaf-validation/original50-mcr-pg-bounded-2026-05-28-r2/baseline_report.json`

Decision: `fix_or_park_original50_blockers_first`

Current row classes:

- `4076`: `route_analyzer_volatility`
  - Repeat/current score range is `69` to `90`.
  - The row is not a hard timeout in these repeats.
  - Do not accept future table behavior using a single lucky `4076` route as proof of original-50 stability.
- `4438`: `table_related_side_effect`
  - Repeats were stable at `69/D`.
  - Current repeat has `table_markup=0`.
  - This is the only current focused blocker that belongs in a table-control lane.
- `4516`: `non_table_remediation_debt`
  - Repeats were `89/B` and `92/A`; accepted references were `87` to `92`.
  - Current debt is heading/PDF-UA, not table debt.
  - It remains below the row target but is not a hard timeout.
- `4680`: `gate_clear`
  - Current repeat recovered to `98/A`.
- `4683`: `gate_clear`
  - Current repeat recovered to `94/A`.

## Decision

Do not resume broad table-heavy behavior acceptance yet.

The original-50 gate is no longer blocked by hard timeouts in this focused sample, but it is still not stable enough to treat as cleared:

- `4076` has route/analyzer volatility.
- `4438` is a repeatable original table-control blocker.
- `4516` is stable near-pass non-table remediation debt.

The next useful lane is a narrow `4438` original table-control diagnostic, while keeping `4076` and `4516` parked as non-table original-gate debt unless a general route-stabilization predicate appears. A later table behavior can be accepted only after a fresh original-50 validation still passes the stated floor.

## Guardrails

- No behavior change is accepted from this diagnostic.
- Do not lower scorer/PAC strictness, checkpoint floors, timeout policy, or false-positive truth rules from this evidence.
- Do not broaden table admission from `4438`; it is a control/gate row that needs strict object-backed evidence.
- Do not treat `4680` or `4683` as table-lane proof; they are clear in this repeat but still show PAC-regressed attempts in tool histories.
