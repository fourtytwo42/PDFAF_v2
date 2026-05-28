# Strict Table Parent Ownership Probe

Date: 2026-05-28

## Summary

This checkpoint extends `scripts/table-parent-ownership-probe.ts` with an explicit
diagnostic `--strict-table-refs` mode. In this mode the probe only runs table
tools when planner params already include object-backed refs (`structRef`,
`targetRef`, `targetStructRef`, or `structRefs`) and adds
`strictTableTargetRef: true`; broad no-ref table attempts are skipped.

This is diagnostic-only. It does not change normal planner, scorer, analyzer,
Docker/API, or remediation behavior.

## Local Probe

A compact local-only proof pack was rebuilt under `/mnt/pdf-review` using public
under-10MB PDFs from Montana Courts, U.S. Courts, and Public Safety Canada, plus
three original-50 table-heavy controls. The strict probe covered 12 rows:

- Focus: `mtcourts-05`, `mtcourts-09`, `uscourts-01`, `uscourts-04`,
  `pscan-06`, `pscan-08`
- Controls: `mtcourts-01`, `uscourts-02`, `pscan-13`, `orig-4057`,
  `orig-4438`, `orig-4683`

The generated local artifact was
`/mnt/pdf-review/pdfaf-table-diagnostics/table-strict-parent-ownership-2026-05-28-r1/probe-strict-r1`
and was removed after extracting the metrics, along with the downloaded public
PDFs.

## Findings

- Decision: `diagnostic_only`
- Strict table refs: `true`
- Rows: `12` total (`6` focus / `6` control)
- Wrong-ref rows: `0`
- Control rows with ownership/non-table PAC side effects: `0`
- Ownership regression candidates: `0`
- Clean table progress rows: `mtcourts-05`, `pscan-13`, `orig-4438`, `orig-4683`

The only focus row with strict clean table progress was `mtcourts-05`, moving
`55/F -> 57/F` while `table_markup` moved `0 -> 16`. That is a true object-backed
table movement, but it is not material enough to justify behavior promotion.

Most focus lows did not improve under the default strict sequence:

- `mtcourts-09`: `55/F -> 55/F`
- `uscourts-01`: `38/F -> 38/F`
- `uscourts-04`: `49/F -> 49/F`
- `pscan-06`: `66/D -> 66/D`
- `pscan-08`: `59/F -> 59/F`

Some controls with real table debt also moved cleanly (`pscan-13`, `orig-4438`,
`orig-4683`). That means strict all-`/Table` ref validation is necessary, but not
sufficient as a production predicate. A future behavior lane still needs table
debt/control gating that separates useful outside-source transaction candidates
from low-score controls with unrelated or already-accepted table movement.

## Decision

Do not promote strict table transaction behavior from this checkpoint.

The next useful table-heavy lane is a same-ref strict transaction diagnostic:
verify whether running
`normalize_table_structure -> set_table_header_cells` on the same reachable
`/Table` refs can reduce final table/header PAC debt on at least two outside
focus rows while same-source and original controls remain stable. If that still
does not move the U.S. Courts/Public Safety Canada rows, park strict transaction
rescue and target the next blocker family, likely target selection/final table
cleanup rather than broader admission.

## Validation

- `npx -y node@22 /usr/bin/pnpm exec vitest run tests/benchmark/tableParentOwnershipProbe.test.ts`
  - Passed: `10` tests

