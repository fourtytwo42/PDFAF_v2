# Missing-Header Table Batch Proof

Date: 2026-05-28

## Summary

This checkpoint extends `scripts/table-parent-ownership-probe.ts` with an
explicit diagnostic `--missing-header-batch` mode. The mode selects multiple
real, root-reachable `/Table` refs that have no headers and object-backed table
debt, then probes this strict Python batch:

1. `normalize_table_structure` on the selected refs;
2. `set_table_header_cells` on the same refs;
3. `strictTableTargetRef: true`;
4. `reopenBetweenOps: false`.

This is diagnostic-only. It does not change production planner, scorer,
analyzer, Docker/API behavior, benchmark routing, or accepted remediation
behavior.

## Local Evidence

A compact local-only proof pack was rebuilt under `/mnt/pdf-review` using public
under-10MB PDFs from Montana Courts, U.S. Courts, and Public Safety Canada, plus
three original-50 controls. Public PDFs and generated artifacts were deleted
after extracting metrics.

Local report:

`/mnt/pdf-review/pdfaf-table-diagnostics/table-missing-header-batch-2026-05-28-r1/probe-r1`

Rows:

- Focus: `mtcourts-05`, `mtcourts-09`, `uscourts-01`, `uscourts-04`,
  `pscan-06`, `pscan-08`
- Controls: `mtcourts-01`, `uscourts-02`, `pscan-13`, `orig-4057`,
  `orig-4438`, `orig-4683`

## Findings

- Decision: `plan_parent_ownership_preservation`
- Rows: `12` total (`6` focus / `6` control)
- Wrong-ref rows: `0`
- Control unsafe rows: `0`
- Ownership-regression candidates: `mtcourts-05`, `mtcourts-09`
- Clean table-progress rows: `uscourts-04`, `pscan-13`, `orig-4438`

Focus movement:

- `mtcourts-05`: `55/F -> 59/F`, `table_markup 0 -> 26`, orphan MCIDs
  `26 -> 30`
- `mtcourts-09`: `55/F -> 59/F`, `table_markup 0 -> 26`, orphan MCIDs
  `27 -> 30`
- `uscourts-04`: `49/F -> 58/F`, `table_markup 0 -> 47`, orphan MCIDs
  `11 -> 8`
- `uscourts-01`: no score/table movement despite changed target refs
- `pscan-06` and `pscan-08`: no score/table movement in this missing-header
  mode; they remain broad-selector/final-cleanup rows, not this lane

Controls:

- `mtcourts-01`, `uscourts-02`, `orig-4057`, and `orig-4683` did not move.
- `pscan-13` moved `58/F -> 59/F`, `table_markup 0 -> 12`, with no orphan or
  ParentTree regression.
- `orig-4438` moved `59/F -> 62/D`, `table_markup 0 -> 21`, with no orphan or
  ParentTree regression.

## Interpretation

The missing-header lane is real: strict multi-ref batches can move table evidence
on Montana and U.S. Courts rows, and they can do so without wrong refs. The lane
is not ready for production behavior because:

- Montana positives still increase orphan-MCID debt.
- The observed score lift is small and remains below target.
- Some controls also receive clean table movement, so production gating still
  needs a stronger accepted-control story.
- PSCAN rows are not solved by missing-header batching.

The next useful behavior proof is not broader admission. It is preserving table
subtree/content ownership during missing-header normalization/header creation so
`mtcourts-05` and `mtcourts-09` can keep the table gain without orphan debt.

## Decision

Do not promote missing-header batch behavior from this checkpoint.

Plan the next table behavior stage as a narrow ownership-preservation proof for
missing-header batch mutations:

- only real, root-reachable `/Table` refs;
- preserve or reduce orphan MCID and ParentTree debt;
- require final score/table evidence improvement;
- keep controls stable and `false_positive_applied=0`;
- validate original-50 before acceptance.

## Validation

- `npx -y node@22 /usr/bin/pnpm exec vitest run tests/benchmark/tableParentOwnershipProbe.test.ts`
  - Passed: `15` tests
- `npx -y node@22 /usr/bin/pnpm run lint`
  - Passed

