# Table Target Selection / Final Cleanup Diagnostic

Date: 2026-05-28

## Summary

This checkpoint adds `scripts/table-target-selection-final-cleanup-diagnostic.ts`,
a native analysis-only diagnostic for the table-heavy outside-source lane. It
does not remediate, mutate PDFs, write remediated PDFs, call ODL/PAC/POC/Java,
change scoring, or change production planner behavior.

The script explains, per row:

- current category scores and Stage 43 table failure class;
- default `normalize_table_structure` and `set_table_header_cells` params;
- whether params are strict object refs, broad selectors, or absent;
- real root-reachable `/Table` target counts;
- table-header/PAC debt and unsafe-shape signals;
- top table target candidates and rejection reasons;
- whether the blocker is missing-header creation, broad-selector final cleanup,
  control target risk, target-selection gap, or no table lane.

## Local Evidence

A compact local-only proof pack was rebuilt under `/mnt/pdf-review` using public
under-10MB PDFs from Montana Courts, U.S. Courts, and Public Safety Canada, plus
three original-50 controls. Public PDFs and generated artifacts were deleted
after extracting metrics.

Local report:

`/mnt/pdf-review/pdfaf-table-diagnostics/table-target-selection-final-cleanup-2026-05-28-r1/report-r2`

Rows:

- Focus: `mtcourts-05`, `mtcourts-09`, `uscourts-01`, `uscourts-04`,
  `pscan-06`, `pscan-08`
- Controls: `mtcourts-01`, `uscourts-02`, `pscan-13`, `orig-4057`,
  `orig-4438`, `orig-4683`

## Findings

- Decision: `plan_target_selection_or_cleanup_lane`
- Rows: `12` total (`6` focus / `6` control)
- Classification counts:
  - `missing_header_creation_candidate`: `4`
  - `broad_selector_final_cleanup_gap`: `2`
  - `control_target_risk`: `3`
  - `no_material_table_debt`: `3`
- True strict header-association transaction candidates: `0`
- Broad selector / final cleanup gaps: `pscan-06`, `pscan-08`
- Control target risks: `pscan-13`, `orig-4057`, `orig-4438`

The Montana and U.S. Courts lows are not primarily final header-association
transactions. They are strict object-backed missing-header creation rows:

- `mtcourts-05`
- `mtcourts-09`
- `uscourts-01`
- `uscourts-04`

All four have strict normalize refs and strict header refs, but zero
pre-normalization header-association candidates. Their top tables have no
headers and irregular rows. Prior same-ref/batch probes showed that simply
running `set_table_header_cells` on the normalized same ref usually no-effects,
so the next behavior proof must explain or improve missing-header creation after
normalization rather than broaden header-association admission.

The Public Safety Canada lows are a different family:

- `pscan-06`
- `pscan-08`

Both use broad strongly-irregular normalize params and strict header refs. That
means the current strict ref transaction probes skipped their normalization
because there is no explicit `structRef` in planner params. This is not a
wrong-ref issue; it is a broad-selector final-cleanup issue. A future behavior
lane would need either a safe explicit-ref handoff from the broad selector or a
post-normalization final cleanup that remains object-backed and control-safe.

Controls still block a broad production route:

- `pscan-13`
- `orig-4057`
- `orig-4438`

These controls also have strict normalize/header refs and real table debt. Any
accepted behavior must add stricter control/debt gating and prove these rows do
not regress or receive unsafe table movement.

## Decision

Do not promote table remediation behavior from this checkpoint.

The next useful behavior-proof order is:

1. Missing-header creation/finalization proof for `mtcourts-05`,
   `mtcourts-09`, `uscourts-01`, and `uscourts-04`.
2. Broad-selector explicit-ref handoff or final-cleanup proof for `pscan-06`
   and `pscan-08`.
3. Control-gating proof against `pscan-13`, `orig-4057`, and `orig-4438`.

Acceptance still requires targeted positives, nearby controls, original-50
deterministic validation after any behavior change, `false_positive_applied=0`,
bounded runtime, and no scorer/PAC masking.

## Validation

- `npx -y node@22 /usr/bin/pnpm exec vitest run tests/benchmark/tableTargetSelectionFinalCleanupDiagnostic.test.ts`
  - Passed: `8` tests
- `npx -y node@22 /usr/bin/pnpm run lint`
  - Passed

