# Table Goal Blocker Rollup

Date: 2026-05-28

## Summary

Added `scripts/table-goal-blocker-rollup.ts`, a report-only diagnostic for the active table-heavy goal. It reads existing `baseline_report.json` artifacts and classifies the current blockers without analyzing PDFs, remediating PDFs, writing PDFs, or calling ODL/PAC/POC/Java/LLM.

Local output:

- `/mnt/pdf-review/pdfaf-table-diagnostics/table-goal-blocker-rollup-2026-05-28-r3/table-goal-blocker-rollup.md`
- `/mnt/pdf-review/pdfaf-table-diagnostics/table-goal-blocker-rollup-2026-05-28-r3/table-goal-blocker-rollup.json`

## Decision

Decision: `gate_blocked_by_original_control_runtime_or_route`.

Next lane: `original_control_runtime_route_stabilization`.

The current table evidence is not useless: two table-heavy Montana positives are supported by the proof artifacts:

- `mtcourts-05.pdf`
- `mtcourts-09.pdf`

However, a new table behavior lane cannot be accepted while the original-50 gate is dominated by independent route/runtime blockers:

- `4076` hard timeout / low-route volatility
- `4438` reproducible low route
- `4516` reproducible sub-floor route
- `4680` sub-floor route
- `4683` route volatility

The broader table follow-up did not fire on these original-50 blockers, so they are not evidence of table side effects. They are still acceptance blockers because the goal requires original-50 no-regression, no hard timeouts, and bounded runtime after any behavior change.

## Remaining Table-Heavy Outside Debt

The rollup also separates the U.S. Courts lows:

- `uscourts-01.pdf`: `heading_structure=0`, `table_markup=0`
- `uscourts-04.pdf`: `heading_structure=0`, `table_markup=79`

These should be treated as mixed zero-heading/table debt, not table-only regularity cleanup.

## Implication

Do not broaden table admission next. The practical path is:

1. Stabilize or explicitly park original-control runtime/route debt so table behavior can pass the acceptance gate.
2. Then return to a strict object-backed table transaction lane for supported positives.
3. Treat U.S. Courts as a separate mixed heading/table diagnostic, not as proof that table-only behavior should broaden.
