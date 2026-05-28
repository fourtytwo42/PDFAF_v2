# Same-Ref Table Transaction Probe

Date: 2026-05-28

## Summary

This checkpoint extends `scripts/table-parent-ownership-probe.ts` with an
explicit diagnostic `--same-ref-transaction` mode. The mode implies strict table
refs and probes a narrow sequence:

1. Build the default `normalize_table_structure` params.
2. Require object-backed strict `/Table` refs.
3. Run `normalize_table_structure`.
4. Run `set_table_header_cells` on the same requested refs with
   `strictTableTargetRef: true`.

This is diagnostic-only. It does not change production planning, scoring,
analyzer output, mutation acceptance, Docker/API behavior, or benchmark routing.

## Local Probe

The same compact local-only proof pack was rebuilt under `/mnt/pdf-review`:

- Focus: `mtcourts-05`, `mtcourts-09`, `uscourts-01`, `uscourts-04`,
  `pscan-06`, `pscan-08`
- Controls: `mtcourts-01`, `uscourts-02`, `pscan-13`, `orig-4057`,
  `orig-4438`, `orig-4683`

The generated local artifact was
`/mnt/pdf-review/pdfaf-table-diagnostics/table-same-ref-transaction-2026-05-28-r1/probe-r1`
and was removed after extracting metrics, along with downloaded public PDFs.

## Findings

- Decision: `diagnostic_only`
- Strict table refs: `true`
- Same-ref transaction: `true`
- Rows: `12` total (`6` focus / `6` control)
- Ownership regression candidates: `0`
- Control unsafe rows: `0`
- Clean table progress rows: `mtcourts-05`, `mtcourts-09`
- Wrong-ref rows: `uscourts-04`, `pscan-13`, `orig-4057`, `orig-4438`

Focus movement was too small to promote:

- `mtcourts-05`: `55/F -> 56/F`, `table_markup 0 -> 9`
- `mtcourts-09`: `55/F -> 56/F`, `table_markup 0 -> 9`

The same-ref header step was `no_effect` on both Montana focus rows. U.S. Courts
and Public Safety Canada focus rows did not produce a clean final table/header
transaction:

- `uscourts-01`: no score or table movement
- `uscourts-04`: table moved `0 -> 23`, but orphan MCIDs increased `8 -> 9`
  and the same ref failed strict header validation afterward
- `pscan-06`: no strict normalize params
- `pscan-08`: no strict normalize params

## Interpretation

This does not prove that strict table transactions are impossible. It proves that
a sequential TypeScript-level same-ref transaction is not a safe production
shape: after `normalize_table_structure` and reanalysis, the originally requested
ref can fail strict `/Table` validation for the subsequent header step.

A future transaction proof should test one of these safer shapes:

- same-session Python mutation batch with `reopenBetweenOps: false`; or
- explicit changed-ref/remapped-ref handoff from normalization to header repair.

Either path still needs the existing gates: low table/PAC debt, object-backed
refs, controls stable, `false_positive_applied=0`, no non-table PAC regression,
and original-50 validation before behavior acceptance.

## Decision

Do not promote same-ref table transaction behavior from this checkpoint.

The next table-heavy lane should be a Python-batch transaction diagnostic or a
changed-ref handoff diagnostic. If that also fails to produce at least two clean
outside positives with controls stable, park strict transaction rescue and move
to target selection/final-cleanup blocker analysis.

## Validation

- `npx -y node@22 /usr/bin/pnpm exec vitest run tests/benchmark/tableParentOwnershipProbe.test.ts`
  - Passed: `12` tests

