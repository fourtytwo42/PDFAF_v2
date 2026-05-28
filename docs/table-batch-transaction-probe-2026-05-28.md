# Python Batch Table Transaction Probe

Date: 2026-05-28

## Summary

This checkpoint extends `scripts/table-parent-ownership-probe.ts` with an
explicit diagnostic `--batch-transaction` mode. The mode implies strict table
refs and probes:

1. default object-backed `normalize_table_structure` params,
2. `set_table_header_cells` on the same requested refs,
3. both operations in a single Python mutation batch with `reopenBetweenOps:
   false`.

This is diagnostic-only. It does not change production planner, scorer,
analyzer, remediation, Docker/API behavior, or benchmark routing.

## Local Probe

The same compact local-only proof pack was rebuilt under `/mnt/pdf-review`:

- Focus: `mtcourts-05`, `mtcourts-09`, `uscourts-01`, `uscourts-04`,
  `pscan-06`, `pscan-08`
- Controls: `mtcourts-01`, `uscourts-02`, `pscan-13`, `orig-4057`,
  `orig-4438`, `orig-4683`

The generated local artifact was
`/mnt/pdf-review/pdfaf-table-diagnostics/table-batch-transaction-2026-05-28-r1/probe-r1`
and was removed after extracting metrics, along with downloaded public PDFs.

## Findings

- Decision: `diagnostic_only`
- Strict table refs: `true`
- Batch transaction: `true`
- Rows: `12` total (`6` focus / `6` control)
- Ownership regression candidates: `0`
- Control unsafe rows: `0`
- Wrong-ref rows: `uscourts-04`
- Clean table progress rows: `mtcourts-05`, `pscan-13`, `orig-4438`,
  `orig-4683`

Focus movement was not behavior-ready:

- `mtcourts-05`: `55/F -> 56/F`, `table_markup 0 -> 9`; header step
  reported `no_structural_change`
- `mtcourts-09`: no final movement; normalization/header both no-effected on
  `table_orphan_mcids_not_preserved`
- `uscourts-01`: no final table movement; header step reported
  `no_structural_change`
- `uscourts-04`: still a blocker; normalize/header no-effected around
  `table_orphan_mcids_not_preserved`, and header saw requested ref `312_0` as
  `not_table`
- `pscan-06` and `pscan-08`: no strict normalize params, so the batch skipped

Controls with table debt still showed clean normalization movement:
`pscan-13`, `orig-4438`, and `orig-4683`.

## Interpretation

Same-session batching removes most of the sequential reanalysis ref problem, but
it still does not prove a strict transaction rescue:

- header association is often already a no-op on the normalized same ref;
- some rows are blocked by orphan-MCID preservation rather than header setup;
- PSCAN low rows lack strict normalize targets under the current selector;
- controls with real table debt can move, so control/debt gating is still
  required before production behavior.

The immediate table-heavy weakness is therefore not solved by simply chaining
`normalize_table_structure -> set_table_header_cells` on the same object-backed
refs.

## Decision

Do not promote strict transaction rescue from this checkpoint.

Park same-ref transaction rescue until a later diagnostic identifies either:

- a changed-ref handoff that produces final header debt reduction on at least two
  outside positives with controls stable; or
- a narrow orphan-MCID/table-ownership preservation fix that turns current
  no-effects into accepted table repairs without non-table PAC regression.

The next useful table-heavy lane is target-selection/final-cleanup analysis:
why PSCAN rows do not get strict normalize params, and why U.S. Courts/Montana
rows normalize only partially without final table/header score recovery.

## Validation

- `npx -y node@22 /usr/bin/pnpm exec vitest run tests/benchmark/tableParentOwnershipProbe.test.ts`
  - Passed: `13` tests
- `npx -y node@22 /usr/bin/pnpm run lint`
  - Passed

