# Original-50 Stable-Ref Table Mutator Probe

Date: 2026-05-29

## Summary

A local strict-ref mutation probe against `4516` shows existing table primitives
can improve object-backed table/header evidence on stable traversal refs, but
the current acceptance wrapper cannot honestly keep the result yet.

This is still diagnostic-only. No production behavior was accepted.

## Local Evidence

Local probe directory:

- `/mnt/pdf-review/pdfaf-validation/original50-stable-table-mutprobe-2026-05-29-r1`

Input refs from the stable table target probe:

- `1614_0`
- `2438_0`
- `2448_0`

Mutation sequence:

1. `normalize_table_structure`
   - `strictTableTargetRefs: true`
   - `tableFailureClass: strongly_irregular_rows`
   - `maxTablesPerRun: 3`
   - `maxSyntheticCells: 160`
2. `set_table_header_cells`
   - same strict refs
   - `tableHeaderAssociation: true`

## Findings

The first operation changed the requested stable refs, but the operation was
classified as `no_effect` and rolled back:

- Operation: `normalize_table_structure`
- Outcome: `no_effect`
- Note: `headers_not_created`
- Debug changed refs: `1614_0`, `2438_0`, `2448_0`
- Global table invariants reported by the validator:
  - `tableCountBefore=0`
  - `tableCountAfter=0`
  - `irregularRowsBefore=0`
  - `irregularRowsAfter=0`
  - `dataCellsWithoutHeaderCountBefore=0`
  - `dataCellsWithoutHeaderCountAfter=0`

Per-target evidence showed real table improvement:

| Ref | Before | After |
| --- | --- | --- |
| `1614_0` | irregular `4`, header missing `1`, data without headers `10`, orphan headers `5`, data with headers `0` | irregular `0`, header missing `0`, data without headers `0`, orphan headers `0`, header scopes `8`, data with headers `12` |
| `2438_0` | irregular `17`, header missing `1`, data without headers `213`, orphan headers `49`, data with headers `0` | irregular `17`, header missing `0`, data without headers `0`, orphan headers `0`, header scopes `49`, data with headers `255` |
| `2448_0` | irregular `14`, header missing `1`, data without headers `540`, orphan headers `80`, data with headers `0` | irregular `1`, header missing `0`, data without headers `0`, orphan headers `0`, header scopes `84`, data with headers `615` |

The mismatch happens because the wrapper-level table acceptance invariants still
use production identity traversal, which sees `0` tables for `4516`. Therefore
the validator ignores the per-ref target improvement and rolls back the table
mutation.

After rollback, the second strict operation saw the same requested refs as
non-table roles:

- `1614_0`: `TD`
- `2438_0`: `TH`
- `2448_0`: `P`

This indicates that the rollback/save path can make previously valid strict
table refs unusable for later operations when the no-effect validator rejects a
real target-level table improvement.

## Decision

Keep the lane diagnostic-only. Do not promote stable traversal or table repair
behavior yet.

The next safe implementation proof must solve both of these general blockers:

1. Table acceptance should be able to recognize object-backed target-ref
   improvement when global traversal is temporarily blind.
2. Strict table transaction sequencing must avoid rollback/ref-renumbering
   invalidating later refs, or must re-resolve refs from a stable source before
   the next operation.

Only after that should a behavior proof pair stable traversal with a narrow
`4516` irregular/headered-table cleanup, with `4438` retained as the missing
header/high-volume control.
