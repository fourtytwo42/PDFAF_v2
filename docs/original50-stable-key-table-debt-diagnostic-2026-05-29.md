# Original-50 Stable-Key Table Debt Diagnostic

Date: 2026-05-29

## Summary

The stable-key Python structure traversal candidate remains parked. A new
artifact-only diagnostic confirms why it cannot be accepted as an analyzer fix
by itself: once traversal is stable, `4516` becomes a repeatable low-score row
whose non-table categories mostly recover, but `table_markup` stays at `0`.

The useful next behavior proof is not broad table admission. It is a narrow
general table/header recovery proof for the newly visible `4516` debt, guarded
against `4438`, which is a stable table-heavy original-control debt row.

## Local Evidence

Diagnostic script:

- `scripts/original50-stable-key-table-debt-diagnostic.ts`

Local report:

- `/mnt/pdf-review/pdfaf-validation/original50-stable-key-table-debt-2026-05-29-r1/original50-stable-key-table-debt-diagnostic.md`

Inputs:

- Candidate remediation run:
  `/mnt/pdf-review/original50-stable-key-candidate-focus-2026-05-29-r1/run-2026-05-29T19-53-13-513Z`
- Candidate extraction-boundary report:
  `/mnt/pdf-review/pdfaf-validation/original50-extraction-boundary-attribution-stable-key-candidate-2026-05-29-r1/original50-extraction-boundary-attribution.json`

Decision:

- `park_stable_key_until_table_recovery_proof`

Reasons:

- `stable_key_focus_rows_still_blocked_by_table_or_related_debt`
- `table_header_debt_is_remaining_score_wall_after_non_table_recovery`
- `controls_with_table_debt_require_guarding_before_behavior`

## Row Findings

`long-4516`:

- Role: focus
- Candidate scores: `43 -> 69 -> 69`
- Candidate `table_markup`: `0 / 0 / 0`
- Stable-key boundary repeats: `43 / 43 / 43`
- Stable structure table counts: `17 / 17 / 17`
- Non-table recovery in the candidate run:
  - heading recovered
  - alt recovered
  - reading order recovered
- Table tools:
  - `normalize_table_structure:no_effect`
  - `repair_native_table_headers:no_effect`
- Classification: `stable_key_table_header_debt_blocker`

`structure-4438`:

- Role: control
- Candidate scores: `59 -> 69 -> 69`
- Candidate `table_markup`: `0 / 0 / 0`
- Stable-key boundary repeats: `59 / 59 / 59`
- Stable structure table counts: `29 / 29 / 29`
- Table tool:
  - `normalize_table_structure:applied`
- Classification: `stable_key_control_table_debt`

## Decision

Do not accept the stable-key traversal change alone. It stabilizes Python
structure traversal, but the stable result exposes real table/header debt that
current deterministic remediation does not clear.

The next acceptable route must pair any stable-key traversal promotion with a
general, object-backed table/header recovery proof that:

1. Improves `4516` table/header evidence after stable traversal.
2. Preserves `4438` as a control.
3. Targets only real, root-reachable `/Table` refs.
4. Does not introduce source, file, row, hash, or corpus gates.
5. Preserves `false_positive_applied=0`.
6. Passes a fresh original-50 deterministic gate before acceptance.

Until such a proof exists, keep original-50 stabilization in Phase 1 and do not
reopen broad outside-source table lanes.
